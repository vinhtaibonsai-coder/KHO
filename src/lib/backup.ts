import "server-only";
import fs from "fs";
import path from "path";
import type { Item, MapLayout } from "@/types";
import { getSupabase, supabaseEnabled } from "@/lib/supabase-server";
import {
  getItems,
  getWarehouseCount,
  getWarehouseMapLayout,
  saveWarehouseMapLayout,
  setWarehouseCount,
  pushMessage,
  writeLocalSnapshot,
  TOTAL_WAREHOUSES,
} from "@/lib/store";

export type BackupMeta = {
  id: string;
  snapshotDate: string;
  itemCount: number;
  createdAt: string;
};

export type SnapshotData = {
  items: Item[];
  totalWarehouses: number;
  mapLayout: MapLayout | null;
};

const DATA_DIR = path.join(process.cwd(), "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const KEEP_SNAPSHOTS = 30;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function localFile(id: string): string {
  return path.join(BACKUP_DIR, `${id}.json`);
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function listLocalMetas(): BackupMeta[] {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".json"));
    return files
      .map((f) => {
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f), "utf-8")) as SnapshotData & {
            id: string;
            createdAt: string;
          };
          return {
            id: parsed.id || f.replace(/\.json$/, ""),
            snapshotDate: (parsed.createdAt || new Date().toISOString()).slice(0, 10),
            itemCount: parsed.items?.length ?? 0,
            createdAt: parsed.createdAt || new Date().toISOString(),
          };
        } catch {
          return null;
        }
      })
      .filter((m): m is BackupMeta => !!m)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function createSnapshot(reason = "manual"): Promise<BackupMeta> {
  const [items, totalWarehouses, mapLayout] = await Promise.all([
    getItems(),
    getWarehouseCount(),
    getWarehouseMapLayout(),
  ]);
  const createdAt = new Date().toISOString();
  const id = `bk_${createdAt.replace(/[:.]/g, "-")}`;
  const payload = { id, createdAt, reason, items, totalWarehouses, mapLayout };

  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      if (sb) {
        await sb.from("warehouse_backups").upsert(
          {
            id,
            snapshot_date: createdAt.slice(0, 10),
            items,
            total_warehouses: totalWarehouses,
            map_layout: mapLayout,
            created_at: createdAt,
          },
          { onConflict: "id" }
        );
        await pruneSupabase();
        return { id, snapshotDate: createdAt.slice(0, 10), itemCount: items.length, createdAt };
      }
    } catch (err) {
      console.warn("Tạo snapshot Supabase lỗi, fallback local:", err);
    }
  }

  ensureBackupDir();
  fs.writeFileSync(localFile(id), JSON.stringify(payload, null, 2), "utf-8");
  pruneLocal();
  return { id, snapshotDate: createdAt.slice(0, 10), itemCount: items.length, createdAt };
}

function pruneLocal() {
  try {
    const metas = listLocalMetas();
    for (const m of metas.slice(KEEP_SNAPSHOTS)) {
      try {
        fs.unlinkSync(localFile(m.id));
      } catch {}
    }
  } catch {}
}

async function pruneSupabase() {
  try {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb
      .from("warehouse_backups")
      .select("id")
      .order("created_at", { ascending: false });
    const ids = (data ?? []).map((r) => String(r.id));
    for (const id of ids.slice(KEEP_SNAPSHOTS)) {
      await sb.from("warehouse_backups").delete().eq("id", id);
    }
  } catch {}
}

export async function listSnapshots(): Promise<BackupMeta[]> {
  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      if (sb) {
        const { data, error } = await sb
          .from("warehouse_backups")
          .select("id, snapshot_date, items, created_at")
          .order("created_at", { ascending: false });
        if (!error && data) {
          return data.map((r) => ({
            id: String(r.id),
            snapshotDate: String(r.snapshot_date),
            itemCount: Array.isArray(r.items) ? r.items.length : 0,
            createdAt: String(r.created_at),
          }));
        }
      }
    } catch {}
  }
  return listLocalMetas();
}

export async function getSnapshot(id: string): Promise<SnapshotData | null> {
  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      if (sb) {
        const { data, error } = await sb
          .from("warehouse_backups")
          .select("items, total_warehouses, map_layout")
          .eq("id", id)
          .maybeSingle();
        if (!error && data) {
          return {
            items: (data.items as Item[]) ?? [],
            totalWarehouses: Number(data.total_warehouses) || TOTAL_WAREHOUSES,
            mapLayout: (data.map_layout as MapLayout | null) ?? null,
          };
        }
      }
    } catch {}
  }
  try {
    const file = localFile(id);
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as SnapshotData;
    return {
      items: parsed.items ?? [],
      totalWarehouses: parsed.totalWarehouses || TOTAL_WAREHOUSES,
      mapLayout: parsed.mapLayout ?? null,
    };
  } catch {
    return null;
  }
}

export async function restoreSnapshot(
  id: string
): Promise<{ ok: boolean; itemCount: number; error?: string }> {
  // Chụp snapshot an toàn TRƯỚC khi ghi đè
  await createSnapshot("pre-restore").catch(() => undefined);

  const snap = await getSnapshot(id);
  if (!snap) return { ok: false, itemCount: 0, error: "Không tìm thấy snapshot" };

  if (supabaseEnabled) {
    const sb = getSupabase();
    if (sb) {
      const { error: delErr } = await sb.from("warehouse_items").delete().neq("sku", "");
      if (delErr) return { ok: false, itemCount: 0, error: `Không xoá được dữ liệu cũ: ${delErr.message}` };
      if (snap.items.length > 0) {
        const rows = snap.items.map((i) => ({
          sku: i.sku,
          name: i.name,
          warehouse: i.warehouse,
          qty: i.qty,
          updated_at: i.updatedAt,
          status: i.status ?? "active",
          sold_at: i.soldAt ?? null,
          sold_note: i.soldNote ?? null,
        }));
        const { error: insErr } = await sb.from("warehouse_items").upsert(rows, { onConflict: "sku" });
        if (insErr) return { ok: false, itemCount: 0, error: `Không ghi được snapshot: ${insErr.message}` };
      }
    }
  } else {
    writeLocalSnapshot(snap);
  }

  await setWarehouseCount(snap.totalWarehouses || TOTAL_WAREHOUSES).catch(() => undefined);
  if (snap.mapLayout) await saveWarehouseMapLayout(snap.mapLayout).catch(() => undefined);

  await pushMessage({
    id: `restore_${id}`,
    groupId: "SYSTEM",
    warehouse: null,
    message: `PHỤC HỒI KHO (${snap.items.length} mã)`,
    status: "ok",
    detail: `Đã phục hồi toàn bộ dữ liệu kho từ snapshot ${id}`,
    createdAt: new Date().toISOString(),
    read: false,
  }).catch(() => undefined);

  return { ok: true, itemCount: snap.items.length };
}

let lastSnapshotCheckDate = "";

export async function ensureDailySnapshot(): Promise<void> {
  const t = today();
  if (lastSnapshotCheckDate === t) return;
  lastSnapshotCheckDate = t;

  const metas = await listSnapshots();
  if (!metas.some((m) => m.snapshotDate === t)) {
    await createSnapshot("daily");
  }
}

export function writeLocalSnapshotForTest(snap: SnapshotData) {
  ensureBackupDir();
  const createdAt = new Date().toISOString();
  const id = `bk_${createdAt.replace(/[:.]/g, "-")}`;
  fs.writeFileSync(
    localFile(id),
    JSON.stringify({ id, createdAt, ...snap }, null, 2),
    "utf-8"
  );
}
