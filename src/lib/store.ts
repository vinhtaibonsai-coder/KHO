import fs from "fs";
import path from "path";
import type { Item, ZaloMessage, ItemHistory, MapLayout } from "@/types";
import { getSupabase, supabaseEnabled } from "@/lib/supabase-server";

export const DEFAULT_TOTAL_WAREHOUSES = 30;
export const TOTAL_WAREHOUSES = 30; // legacy fallback

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "database.json");

interface DB {
  items: Item[];
  messages: ZaloMessage[];
  history: ItemHistory[];
  totalWarehouses?: number;
  mapLayout?: MapLayout | null;
}

function initialSeed(): DB {
  const now = Date.now();
  return {
    items: [
      {
        sku: "E120.124",
        name: "Hàng độc bản",
        warehouse: 3,
        qty: 1,
        updatedAt: new Date(now - 1000 * 60 * 15).toISOString(), // 15 phút trước
      },
      {
        sku: "E80.345",
        name: "Hàng độc bản",
        warehouse: 7,
        qty: 1,
        updatedAt: new Date(now - 1000 * 60 * 45).toISOString(), // 45 phút trước
      },
      {
        sku: "E120.485",
        name: "Hàng độc bản",
        warehouse: 12,
        qty: 1,
        updatedAt: new Date(now - 1000 * 60 * 120).toISOString(), // 2 tiếng trước
      },
      {
        sku: "P120.50",
        name: "Hàng độc bản",
        warehouse: 18,
        qty: 1,
        updatedAt: new Date(now - 1000 * 60 * 300).toISOString(), // 5 tiếng trước
      },
      {
        sku: "E60.110",
        name: "Hàng độc bản",
        warehouse: 1,
        qty: 1,
        updatedAt: new Date(now - 1000 * 60 * 30).toISOString(),
      },
      {
        sku: "P80.25",
        name: "Hàng độc bản",
        warehouse: 25,
        qty: 1,
        updatedAt: new Date(now - 1000 * 60 * 60).toISOString(),
      },
      {
        sku: "E100.99",
        name: "Hàng độc bản",
        warehouse: 30,
        qty: 1,
        updatedAt: new Date(now - 1000 * 60 * 10).toISOString(),
      },
    ],
    messages: [],
    history: [],
    totalWarehouses: DEFAULT_TOTAL_WAREHOUSES,
  };
}

// ============================================================
// LOCAL FALLBACK (data/database.json) — dùng khi chưa có env
// ============================================================
function loadDB(): DB {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      const parsed = JSON.parse(content) as DB;
      if (!Array.isArray(parsed.history)) parsed.history = [];
      if (!parsed.totalWarehouses || parsed.totalWarehouses < DEFAULT_TOTAL_WAREHOUSES) {
        parsed.totalWarehouses = DEFAULT_TOTAL_WAREHOUSES;
      }
      return parsed;
    }
  } catch (err) {
    console.error("Lỗi đọc database.json, dùng fallback seed", err);
  }
  const init = initialSeed();
  saveDB(init);
  return init;
}

function saveDB(data: DB) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Lỗi ghi database.json", err);
  }
}

let db: DB = loadDB();

// ============================================================
// SUPABASE HELPERS
// ============================================================
type ItemRow = {
  sku: string;
  name: string;
  warehouse: number;
  qty: number;
  updated_at: string;
  status?: "active" | "sold";
  sold_at?: string | null;
  sold_note?: string | null;
};

type MessageRow = {
  id: string;
  group_id: string;
  warehouse: number | null;
  message: string;
  status: "ok" | "error";
  detail: string;
  created_at: string;
  read?: boolean;
  bot_name?: string | null;
};

type HistoryRow = {
  id: string;
  sku: string;
  action: "in" | "out" | "transfer" | "sold" | "restock";
  from_warehouse: number | null;
  to_warehouse: number | null;
  note: string;
  created_at: string;
};

const rowToItem = (r: ItemRow): Item => ({
  sku: r.sku,
  name: r.name,
  warehouse: r.warehouse,
  qty: r.qty,
  updatedAt: r.updated_at,
  status: r.status === "sold" ? "sold" : "active",
  soldAt: r.sold_at || undefined,
  soldNote: r.sold_note || undefined,
});

const rowToMessage = (r: MessageRow): ZaloMessage => ({
  id: r.id,
  groupId: r.group_id,
  warehouse: r.warehouse,
  message: r.message,
  status: r.status,
  detail: r.detail,
  createdAt: r.created_at,
  read: typeof r.read === "boolean" ? r.read : false,
  botName: r.bot_name || undefined,
});

const rowToHistory = (r: HistoryRow): ItemHistory => ({
  id: r.id,
  sku: r.sku,
  action: r.action,
  fromWarehouse: r.from_warehouse,
  toWarehouse: r.to_warehouse,
  note: r.note || "",
  createdAt: r.created_at,
});

async function seedIfEmpty() {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from("warehouse_items").select("sku").limit(1);
  if (data && data.length > 0) return;
  const seed = initialSeed().items.map((i) => ({
    sku: i.sku,
    name: i.name,
    warehouse: i.warehouse,
    qty: i.qty,
    updated_at: i.updatedAt,
  }));
  await sb.from("warehouse_items").upsert(seed, { onConflict: "sku" });
}

// ============================================================
// IN-FLIGHT LOCK THEO SKU (server): 2 request song song cùng 1 SKU
// phải xếp hàng nhau xử lý lần lượt.
// ponytail: lock trong 1 process — deploy đa instance vẫn nhờ
// update/delete có điều kiện (.neq / 0 row affected) ở dưới.
// ============================================================
const skuLocks = new Map<string, Promise<unknown>>();

export async function withSkuLock<T>(sku: string, fn: () => Promise<T>): Promise<T> {
  const key = sku.trim().toUpperCase();
  const prev = skuLocks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  skuLocks.set(key, tail);
  try {
    return await run;
  } finally {
    if (skuLocks.get(key) === tail) skuLocks.delete(key);
  }
}

// ============================================================
// PUBLIC API (async — Supabase) / (đồng bộ nội bộ — local)
// ============================================================
export async function getItems(): Promise<Item[]> {
  if (supabaseEnabled) {
    const sb = getSupabase();
    const { data, error } = await sb!
      .from("warehouse_items")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`Supabase getItems: ${error.message}`);
    if (!data?.length) await seedIfEmpty();
    return (data ?? []).map(rowToItem);
  }
  db = loadDB();
  return db.items;
}

export async function getMessages(): Promise<ZaloMessage[]> {
  if (supabaseEnabled) {
    const sb = getSupabase();
    const { data, error } = await sb!
      .from("zalo_messages")
      .select("*")
      .not("id", "like", "bot_heartbeat%")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Supabase getMessages: ${error.message}`);
    return (data ?? []).map(rowToMessage);
  }
  db = loadDB();
  return db.messages.filter((m) => !m.id.startsWith("bot_heartbeat"));
}

export async function pushMessage(msg: ZaloMessage) {
  const isRead = typeof msg.read === "boolean" ? msg.read : false;
  if (supabaseEnabled) {
    const sb = getSupabase();
    const row = {
      id: msg.id,
      group_id: msg.groupId,
      warehouse: msg.warehouse,
      message: msg.message,
      status: msg.status,
      detail: msg.detail,
      created_at: msg.createdAt,
      read: isRead,
      ...(msg.botName ? { bot_name: msg.botName } : {}),
    };
    let { error } = await sb!.from("zalo_messages").upsert(row, { onConflict: "id" });
    // Cột bot_name chưa được thêm vào bảng (chạy migration multi-bot) -> retry không bot_name
    if (error && msg.botName && /bot_name/i.test(error.message || "")) {
      delete (row as Record<string, unknown>).bot_name;
      ({ error } = await sb!.from("zalo_messages").upsert(row, { onConflict: "id" }));
    }
    if (error) throw new Error(`Supabase pushMessage: ${error.message}`);
    return;
  }
  db = loadDB();
  db.messages = db.messages.filter((m) => m.id !== msg.id);
  db.messages.unshift({ ...msg, read: isRead });
  if (db.messages.length > 50) db.messages.length = 50;
  saveDB(db);
}

/**
 * Claim-First de-duplication: 2 bot cùng forward 1 tin nhắn trong nhóm
 * thì chỉ bot đầu tiên "claim" được id (= sourceId Zalo) mới chạy effect.
 * Trả về false nếu tin đã được claim trước đó.
 */
export async function claimMessage(
  id: string,
  groupId: string,
  message: string,
  botName?: string
): Promise<boolean> {
  const now = new Date().toISOString();
  if (supabaseEnabled) {
    const sb = getSupabase();
    const row = {
      id,
      group_id: groupId,
      warehouse: null,
      message,
      status: "ok",
      detail: "Đang xử lý...",
      created_at: now,
      read: true,
      ...(botName ? { bot_name: botName } : {}),
    };
    let { data, error } = await sb!
      .from("zalo_messages")
      .upsert(row, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (error && botName && /bot_name/i.test(error.message || "")) {
      delete (row as Record<string, unknown>).bot_name;
      ({ data, error } = await sb!
        .from("zalo_messages")
        .upsert(row, { onConflict: "id", ignoreDuplicates: true })
        .select("id"));
    }
    if (error) throw new Error(`Supabase claimMessage: ${error.message}`);
    return !!data?.length;
  }
  db = loadDB();
  if (db.messages.some((m) => m.id === id)) return false;
  db.messages.unshift({
    id,
    groupId,
    warehouse: null,
    message,
    status: "ok",
    detail: "Đang xử lý...",
    createdAt: now,
    read: true,
    botName,
  });
  if (db.messages.length > 50) db.messages.length = 50;
  saveDB(db);
  return true;
}

export async function findItem(sku: string): Promise<Item | undefined> {
  const code = sku.trim().toUpperCase();
  if (supabaseEnabled) {
    const sb = getSupabase();
    const { data, error } = await sb!
      .from("warehouse_items")
      .select("*")
      .eq("sku", code)
      .maybeSingle();
    if (error) throw new Error(`Supabase findItem: ${error.message}`);
    return data ? rowToItem(data as ItemRow) : undefined;
  }
  db = loadDB();
  return db.items.find((i) => i.sku === code);
}

export async function upsertItem(
  sku: string,
  warehouse: number,
  name?: string
): Promise<Item> {
  const code = sku.trim().toUpperCase();
  const now = new Date().toISOString();

  if (supabaseEnabled) {
    const sb = getSupabase();
    const existing = await findItem(code);
    if (existing) {
      const updated: Item = {
        ...existing,
        warehouse,
        updatedAt: now,
        ...(name ? { name } : {}),
      };
      const { error } = await sb!
        .from("warehouse_items")
        .update({
          warehouse,
          name: updated.name,
          updated_at: now,
        })
        .eq("sku", code);
      if (error) throw new Error(`Supabase upsertItem: ${error.message}`);
      return updated;
    }
    const item: Item = {
      sku: code,
      name: name ?? "Hàng độc bản",
      warehouse,
      qty: 1,
      updatedAt: now,
    };
    const { error } = await sb!.from("warehouse_items").insert({
      sku: item.sku,
      name: item.name,
      warehouse: item.warehouse,
      qty: item.qty,
      updated_at: item.updatedAt,
    });
    if (error) throw new Error(`Supabase upsertItem: ${error.message}`);
    return item;
  }

  db = loadDB();
  let item = db.items.find((i) => i.sku === code);
  if (item) {
    item.warehouse = warehouse;
    item.updatedAt = now;
    if (name) item.name = name;
  } else {
    item = { sku: code, name: name ?? "Hàng độc bản", warehouse, qty: 1, updatedAt: now };
    db.items.push(item);
  }
  saveDB(db);
  return item;
}

export async function addQty(
  sku: string,
  warehouse: number,
  qty: number
): Promise<Item> {
  if (supabaseEnabled) {
    const existing = await findItem(sku);
    const nextQty = Math.max(0, (existing?.qty ?? 0) + qty);
    if (existing) {
      const sb = getSupabase();
      const now = new Date().toISOString();
      const { error } = await sb!
        .from("warehouse_items")
        .update({ qty: nextQty, warehouse, updated_at: now })
        .eq("sku", existing.sku);
      if (error) throw new Error(`Supabase addQty: ${error.message}`);
      return { ...existing, qty: nextQty, warehouse, updatedAt: now };
    }
    return upsertItem(sku, warehouse);
  }

  const item = await upsertItem(sku, warehouse);
  item.qty = Math.max(0, item.qty + qty);
  item.updatedAt = new Date().toISOString();
  saveDB(db);
  return item;
}

export async function getHistory(): Promise<ItemHistory[]> {
  if (supabaseEnabled) {
    const sb = getSupabase();
    const { data, error } = await sb!
      .from("warehouse_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.warn("Supabase getHistory warning:", error.message);
      return [];
    }
    return (data ?? []).map(rowToHistory);
  }
  db = loadDB();
  return db.history || [];
}

export async function pushHistory(entry: Omit<ItemHistory, "id" | "createdAt"> & { id?: string; createdAt?: string }): Promise<ItemHistory> {
  const fullEntry: ItemHistory = {
    id: entry.id || `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sku: entry.sku.trim().toUpperCase(),
    action: entry.action,
    fromWarehouse: entry.fromWarehouse ?? null,
    toWarehouse: entry.toWarehouse ?? null,
    note: entry.note || "",
    createdAt: entry.createdAt || new Date().toISOString(),
  };

  if (supabaseEnabled) {
    const sb = getSupabase();
    try {
      await sb!.from("warehouse_history").insert({
        id: fullEntry.id,
        sku: fullEntry.sku,
        action: fullEntry.action,
        from_warehouse: fullEntry.fromWarehouse,
        to_warehouse: fullEntry.toWarehouse,
        note: fullEntry.note,
        created_at: fullEntry.createdAt,
      });
    } catch (err) {
      console.warn("Lỗi lưu history vào Supabase:", err);
    }
    return fullEntry;
  }

  db = loadDB();
  if (!Array.isArray(db.history)) db.history = [];
  db.history.unshift(fullEntry);
  if (db.history.length > 500) db.history.length = 500;
  saveDB(db);
  return fullEntry;
}

export type ItemOpResult = Item & { alreadyDone?: boolean };

export async function markItemSold(sku: string, note: string = "Đã bán"): Promise<ItemOpResult | undefined> {
  const code = sku.trim().toUpperCase();
  const now = new Date().toISOString();

  if (supabaseEnabled) {
    const sb = getSupabase();
    const existing = await findItem(code);
    if (!existing) return undefined;

    // Idempotent: đã bán rồi thì return ngay, KHÔNG push history/message mới
    if (existing.status === "sold") return { ...existing, alreadyDone: true };

    // Atomic: chỉ update khi chưa sold (thua race -> không có row nào được update)
    const { data: updatedRows, error } = await sb!
      .from("warehouse_items")
      .update({
        status: "sold",
        sold_at: now,
        sold_note: note,
        updated_at: now,
      })
      .eq("sku", code)
      .neq("status", "sold")
      .select("sku");

    if (error) {
      console.error("Supabase markItemSold error:", error.message);
      throw new Error(`Supabase markItemSold: ${error.message}`);
    }

    // Thua race condition: request khác đã sold trước -> không tạo thông báo trùng
    if (!updatedRows || updatedRows.length === 0) {
      const refreshed = await findItem(code);
      return { ...(refreshed ?? existing), alreadyDone: true };
    }

    const updated: Item = {
      ...existing,
      status: "sold",
      soldAt: now,
      soldNote: note,
      updatedAt: now,
    };

    await pushHistory({
      sku: code,
      action: "sold",
      fromWarehouse: existing.warehouse,
      toWarehouse: null,
      note: note || "Đánh dấu đã bán",
      createdAt: now,
    });

    // Id message xác định theo soldAt -> upsert không thể tạo bản sao
    await pushMessage({
      id: `sold_${code}_${existing.soldAt || now}`,
      groupId: `KHO_${String(existing.warehouse).padStart(2, "0")}`,
      warehouse: existing.warehouse,
      message: `ĐÃ BÁN ${code}`,
      status: "ok",
      detail: `Mã [${code}] đã được bán thành công (Kho ${existing.warehouse})`,
      createdAt: now,
      read: false,
    });

    return updated;
  }

  db = loadDB();
  const item = db.items.find((i) => i.sku === code);
  if (!item) return undefined;
  if (item.status === "sold") return { ...item, alreadyDone: true };

  item.status = "sold";
  item.soldAt = now;
  item.soldNote = note;
  item.updatedAt = now;
  saveDB(db);

  await pushHistory({
    sku: code,
    action: "sold",
    fromWarehouse: item.warehouse,
    toWarehouse: null,
    note: note || "Đánh dấu đã bán",
    createdAt: now,
  });

  await pushMessage({
    id: `sold_${code}_${item.soldAt || now}`,
    groupId: `KHO_${String(item.warehouse).padStart(2, "0")}`,
    warehouse: item.warehouse,
    message: `ĐÃ BÁN ${code}`,
    status: "ok",
    detail: `Mã [${code}] đã được bán thành công (Kho ${item.warehouse})`,
    createdAt: now,
    read: false,
  });

  return item;
}

export async function restockItem(sku: string, warehouse?: number, note: string = "Khách trả / Nhập lại kho"): Promise<ItemOpResult | undefined> {
  const code = sku.trim().toUpperCase();
  const now = new Date().toISOString();

  if (supabaseEnabled) {
    const sb = getSupabase();
    const existing = await findItem(code);
    if (!existing) return undefined;

    const targetWh = warehouse || existing.warehouse;
    const oldWh = existing.warehouse;

    // Idempotent: đang active & không đổi kho -> no-op, không push thông báo trùng
    if (existing.status === "active" && targetWh === oldWh) {
      return { ...existing, alreadyDone: true };
    }

    const { error } = await sb!
      .from("warehouse_items")
      .update({
        status: "active",
        warehouse: targetWh,
        sold_at: null,
        sold_note: null,
        updated_at: now,
      })
      .eq("sku", code);

    if (error) {
      console.error("Supabase restockItem error:", error.message);
      throw new Error(`Supabase restockItem: ${error.message}`);
    }

    const updated: Item = {
      ...existing,
      status: "active",
      warehouse: targetWh,
      updatedAt: now,
      soldAt: undefined,
      soldNote: undefined,
    };

    await pushHistory({
      sku: code,
      action: "restock",
      fromWarehouse: oldWh,
      toWarehouse: targetWh,
      note: note || `Nhập lại kho ${targetWh}`,
      createdAt: now,
    });

    await pushMessage({
      id: `restock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      groupId: `KHO_${String(targetWh).padStart(2, "0")}`,
      warehouse: targetWh,
      message: `NHẬP LẠI ${code}`,
      status: "ok",
      detail: `Khách trả / Nhập lại mã [${code}] vào Kho ${targetWh}`,
      createdAt: now,
      read: false,
    });

    return updated;
  }

  db = loadDB();
  const item = db.items.find((i) => i.sku === code);
  if (!item) return undefined;

  const targetWh = warehouse || item.warehouse;
  const oldWh = item.warehouse;
  // Idempotent: đang active & không đổi kho -> no-op
  if (item.status !== "sold" && targetWh === oldWh) {
    return { ...item, alreadyDone: true };
  }
  item.status = "active";
  item.warehouse = targetWh;
  item.updatedAt = now;
  delete item.soldAt;
  delete item.soldNote;
  saveDB(db);

  await pushHistory({
    sku: code,
    action: "restock",
    fromWarehouse: oldWh,
    toWarehouse: targetWh,
    note: note || `Nhập lại kho ${targetWh}`,
    createdAt: now,
  });

  await pushMessage({
    id: `restock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    groupId: `KHO_${String(targetWh).padStart(2, "0")}`,
    warehouse: targetWh,
    message: `NHẬP LẠI ${code}`,
    status: "ok",
    detail: `Khách trả / Nhập lại mã [${code}] vào Kho ${targetWh}`,
    createdAt: now,
    read: false,
  });

  return item;
}

export type RemoveResult = Item | { alreadyRemoved: true };

export async function removeItem(sku: string, note: string = "Xuất kho thủ công"): Promise<RemoveResult> {
  const code = sku.trim().toUpperCase();
  if (supabaseEnabled) {
    const sb = getSupabase();
    // Atomic delete: 0 row bị xoá = đã bị xoá trước đó / không tồn tại
    // -> alreadyRemoved (200) thay vì 404 để client không enqueue retry bất tận
    const { data: deleted, error } = await sb!
      .from("warehouse_items")
      .delete()
      .eq("sku", code)
      .select("*");
    if (error) throw new Error(`Supabase removeItem: ${error.message}`);
    if (!deleted || deleted.length === 0) return { alreadyRemoved: true };

    const existing = rowToItem(deleted[0] as ItemRow);
    await pushHistory({
      sku: code,
      action: "out",
      fromWarehouse: existing.warehouse,
      toWarehouse: null,
      note,
    });
    await pushMessage({
      id: `out_${code}_${Date.now()}`,
      groupId: `KHO_${String(existing.warehouse).padStart(2, "0")}`,
      warehouse: existing.warehouse,
      message: `XUẤT KHO ${code}`,
      status: "ok",
      detail: `Đã xuất mã [${code}] ra khỏi Kho ${existing.warehouse}`,
      createdAt: new Date().toISOString(),
      read: false,
    });
    return existing;
  }
  db = loadDB();
  const idx = db.items.findIndex((i) => i.sku === code);
  if (idx < 0) return { alreadyRemoved: true };
  const removed = db.items.splice(idx, 1)[0];
  saveDB(db);
  await pushHistory({
    sku: code,
    action: "out",
    fromWarehouse: removed.warehouse,
    toWarehouse: null,
    note,
  });
  await pushMessage({
    id: `out_${code}_${Date.now()}`,
    groupId: `KHO_${String(removed.warehouse).padStart(2, "0")}`,
    warehouse: removed.warehouse,
    message: `XUẤT KHO ${code}`,
    status: "ok",
    detail: `Đã xuất mã [${code}] ra khỏi Kho ${removed.warehouse}`,
    createdAt: new Date().toISOString(),
    read: false,
  });
  return removed;
}

export async function transferItem(
  sku: string,
  toWarehouse: number,
  note: string = ""
): Promise<{ success: boolean; item?: Item; fromWarehouse?: number; error?: string; alreadyThere?: boolean }> {
  const code = sku.trim().toUpperCase();
  const maxWh = await getWarehouseCount();
  if (toWarehouse < 1 || toWarehouse > maxWh) {
    return { success: false, error: `Kho đích không hợp lệ (1-${maxWh})` };
  }

  const existing = await findItem(code);
  if (!existing) {
    return { success: false, error: `Không tìm thấy mã sản phẩm ${code}` };
  }

  const fromWh = existing.warehouse;
  if (fromWh === toWarehouse) {
    // Đã ở đúng kho đích rồi -> thành công (idempotent), không ghi history trùng
    return { success: true, alreadyThere: true, item: existing, fromWarehouse: fromWh };
  }

  const updated = await upsertItem(code, toWarehouse, existing.name);
  await pushHistory({
    sku: code,
    action: "transfer",
    fromWarehouse: fromWh,
    toWarehouse,
    note: note || `Chuyển từ Kho ${fromWh} sang Kho ${toWarehouse}`,
  });

  return { success: true, item: updated, fromWarehouse: fromWh };
}

export async function getWarehouseCount(): Promise<number> {
  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      // 1. Thử lấy từ bảng warehouse_settings nếu có
      const { data, error } = await sb!
        .from("warehouse_settings")
        .select("total_warehouses")
        .eq("id", "default")
        .maybeSingle();

      if (!error && data && data.total_warehouses) {
        return Math.max(DEFAULT_TOTAL_WAREHOUSES, Number(data.total_warehouses));
      }

      // 2. Fallback: tìm kho lớn nhất đang có trong warehouse_items
      const { data: itemData } = await sb!
        .from("warehouse_items")
        .select("warehouse")
        .order("warehouse", { ascending: false })
        .limit(1);

      const maxItemWh = itemData && itemData[0]?.warehouse ? Number(itemData[0].warehouse) : DEFAULT_TOTAL_WAREHOUSES;

      // 3. Fallback đọc thêm từ local database.json (nếu có lưu)
      db = loadDB();
      const localTotal = db.totalWarehouses || DEFAULT_TOTAL_WAREHOUSES;

      return Math.max(DEFAULT_TOTAL_WAREHOUSES, maxItemWh, localTotal);
    } catch {
      db = loadDB();
      return db.totalWarehouses || DEFAULT_TOTAL_WAREHOUSES;
    }
  }
  db = loadDB();
  return db.totalWarehouses || DEFAULT_TOTAL_WAREHOUSES;
}

export async function setWarehouseCount(count: number): Promise<number> {
  const target = Math.max(DEFAULT_TOTAL_WAREHOUSES, count);
  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      // Thử update trước để không đè mất map_layout
      const { data: updated } = await sb!
        .from("warehouse_settings")
        .update({ total_warehouses: target })
        .eq("id", "default")
        .select();

      if (!updated || updated.length === 0) {
        await sb!.from("warehouse_settings").upsert(
          { id: "default", total_warehouses: target },
          { onConflict: "id" }
        );
      }
    } catch (err) {
      console.warn("Lưu warehouse_settings Supabase:", err);
    }
  }

  db = loadDB();
  db.totalWarehouses = target;
  saveDB(db);
  return target;
}

export async function addWarehouse(): Promise<number> {
  const current = await getWarehouseCount();
  const next = current + 1;

  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      const { data: updated } = await sb!
        .from("warehouse_settings")
        .update({ total_warehouses: next })
        .eq("id", "default")
        .select();

      if (!updated || updated.length === 0) {
        await sb!.from("warehouse_settings").upsert(
          { id: "default", total_warehouses: next },
          { onConflict: "id" }
        );
      }
    } catch (err) {
      console.warn("Lưu warehouse_settings Supabase:", err);
    }
  }

  db = loadDB();
  db.totalWarehouses = next;
  saveDB(db);
  return next;
}

export async function getWarehouseMapLayout(): Promise<MapLayout | null> {
  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      const { data, error } = await sb!
        .from("warehouse_settings")
        .select("map_layout")
        .eq("id", "default")
        .maybeSingle();

      if (!error && data && data.map_layout) {
        if (typeof data.map_layout === "object") {
          return data.map_layout as MapLayout;
        }
        if (typeof data.map_layout === "string") {
          return JSON.parse(data.map_layout) as MapLayout;
        }
      }
    } catch (err) {
      console.warn("Lấy map_layout từ Supabase thất bại, thử local DB:", err);
    }
  }

  // Fallback đọc từ file database.json cục bộ
  try {
    const local = loadDB();
    if (local.mapLayout) return local.mapLayout;
  } catch {}

  return null;
}

export async function saveWarehouseMapLayout(layout: MapLayout): Promise<MapLayout> {
  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      // Đọc total_warehouses hiện tại để không bị ghi đè thành null khi upsert
      const { data: existing } = await sb!
        .from("warehouse_settings")
        .select("total_warehouses")
        .eq("id", "default")
        .maybeSingle();

      const totalWh = existing?.total_warehouses ?? DEFAULT_TOTAL_WAREHOUSES;

      await sb!.from("warehouse_settings").upsert(
        { id: "default", total_warehouses: totalWh, map_layout: layout },
        { onConflict: "id" }
      );
    } catch (err) {
      console.warn("Lưu map_layout lên Supabase thất bại:", err);
    }
  }

  // Luôn lưu bản sao vào database.json cục bộ
  try {
    const local = loadDB();
    local.mapLayout = layout;
    saveDB(local);
  } catch (err) {
    console.error("Lưu map_layout vào database.json lỗi:", err);
  }

  return layout;
}

export async function ensureWarehouseExists(warehouseNumber: number): Promise<number> {
  // Bỏ qua nếu số kho không hợp lệ hoặc lớn hơn 100 (để tránh bắt nhầm năm như 2026)
  if (warehouseNumber < 1 || warehouseNumber > 100) {
    return await getWarehouseCount();
  }

  const current = await getWarehouseCount();
  if (warehouseNumber <= current) return current;

  const next = warehouseNumber;
  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      await sb!.from("warehouse_settings").upsert(
        { id: "default", total_warehouses: next },
        { onConflict: "id" }
      );
    } catch (err) {
      console.warn("Lưu warehouse_settings Supabase:", err);
    }
  }

  db = loadDB();
  db.totalWarehouses = next;
  saveDB(db);
  return next;
}

export async function markMessageRead(id: string): Promise<boolean> {
  if (supabaseEnabled) {
    const sb = getSupabase();
    await sb!.from("zalo_messages").update({ read: true }).eq("id", id);
  }
  db = loadDB();
  const m = db.messages.find((item) => item.id === id);
  if (m) {
    m.read = true;
    saveDB(db);
  }
  return true;
}

export async function markAllMessagesRead(): Promise<boolean> {
  if (supabaseEnabled) {
    const sb = getSupabase();
    await sb!.from("zalo_messages").update({ read: true }).eq("read", false);
  }
  db = loadDB();
  db.messages = db.messages.map((m) => ({ ...m, read: true }));
  saveDB(db);
  return true;
}

const BOT_ONLINE_WINDOW_MS = 60_000;

export async function recordBotPing(botName: string = "Bot"): Promise<string> {
  const now = new Date().toISOString();
  const name = (botName || "Bot").trim().slice(0, 40) || "Bot";
  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      const row = {
        id: `bot_heartbeat_${name}`,
        group_id: "SYSTEM",
        warehouse: null,
        message: "PING",
        status: "ok",
        detail: `Bot Zalo "${name}" đang chạy`,
        created_at: now,
        read: true,
        bot_name: name,
      };
      let { error } = await sb!.from("zalo_messages").upsert(row, { onConflict: "id" });
      if (error && /bot_name/i.test(error.message || "")) {
        delete (row as Record<string, unknown>).bot_name;
        ({ error } = await sb!.from("zalo_messages").upsert(row, { onConflict: "id" }));
      }
      if (error) console.warn("recordBotPing supabase error:", error.message);
    } catch (err) {
      console.warn("recordBotPing supabase error:", err);
    }
  }

  // Luôn lưu local làm dự phòng (map theo tên bot)
  try {
    const pingFile = path.join(DATA_DIR, ".bot-ping.json");
    let parsed: { lastPing?: string; bots?: Record<string, string> } = {};
    if (fs.existsSync(pingFile)) {
      parsed = JSON.parse(fs.readFileSync(pingFile, "utf8"));
    }
    const bots = { ...(parsed.bots || {}) };
    // Dòng legacy { lastPing } cũ -> chuyển vào map nếu chưa có bot nào
    if (parsed.lastPing && Object.keys(bots).length === 0) bots["Bot"] = parsed.lastPing;
    bots[name] = now;
    fs.writeFileSync(pingFile, JSON.stringify({ bots }), "utf8");
  } catch {}

  return now;
}

export async function getBotStatus(): Promise<{
  online: boolean;
  lastPing: string | null;
  bots: { name: string; online: boolean; lastPing: string | null }[];
}> {
  const entries = new Map<string, string | null>();

  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      const { data } = await sb!
        .from("zalo_messages")
        .select("id, created_at")
        .like("id", "bot_heartbeat%");
      for (const r of data ?? []) {
        const name = r.id.replace(/^bot_heartbeat_?/, "") || "Bot";
        const prev = entries.get(name);
        if (!prev || (r.created_at && r.created_at > prev)) {
          entries.set(name, r.created_at || null);
        }
      }
    } catch {}
  }

  // Local fallback / bổ sung
  try {
    const pingFile = path.join(DATA_DIR, ".bot-ping.json");
    if (fs.existsSync(pingFile)) {
      const parsed = JSON.parse(fs.readFileSync(pingFile, "utf8")) as {
        lastPing?: string;
        bots?: Record<string, string>;
      };
      if (parsed.bots) {
        for (const [name, ts] of Object.entries(parsed.bots)) {
          if (!entries.get(name)) entries.set(name, ts || null);
        }
      }
      if (parsed.lastPing && entries.size === 0) entries.set("Bot", parsed.lastPing);
    }
  } catch {}

  const now = Date.now();
  const bots = Array.from(entries.entries())
    .map(([name, lastPing]) => {
      const diffMs = lastPing ? now - new Date(lastPing).getTime() : Number.NaN;
      const online = Number.isFinite(diffMs) && diffMs >= 0 && diffMs <= BOT_ONLINE_WINDOW_MS;
      return { name, online, lastPing: lastPing ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const lastPings = bots.map((b) => b.lastPing).filter(Boolean) as string[];
  const latest = lastPings.sort().at(-1) ?? null;

  return {
    online: bots.some((b) => b.online),
    lastPing: latest,
    bots,
  };
}

export async function getDatabaseStatus(): Promise<{
  connected: boolean;
  type: "supabase" | "local";
  latencyMs?: number;
  itemCount?: number;
}> {
  if (supabaseEnabled) {
    const start = Date.now();
    try {
      const sb = getSupabase();
      if (!sb) return { connected: false, type: "supabase" };
      const { count, error } = await sb
        .from("warehouse_items")
        .select("count", { count: "exact", head: true });
      if (error) {
        return { connected: false, type: "supabase" };
      }
      return {
        connected: true,
        type: "supabase",
        latencyMs: Date.now() - start,
        itemCount: count ?? undefined,
      };
    } catch {
      return { connected: false, type: "supabase" };
    }
  }
  return { connected: true, type: "local" };
}
