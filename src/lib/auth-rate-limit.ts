import "server-only";
import fs from "fs";
import path from "path";
import { getSupabase, supabaseEnabled } from "./supabase-server";

export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 5;

const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "system_settings.json");

type LockState = { locked: boolean; retryAfterSec: number };

function localRead(): { pinFailCount: number; pinLockedUntil: string | null } {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      return {
        pinFailCount: Number(parsed?.pinFailCount) || 0,
        pinLockedUntil: typeof parsed?.pinLockedUntil === "string" ? parsed.pinLockedUntil : null,
      };
    }
  } catch {}
  return { pinFailCount: 0, pinLockedUntil: null };
}

function localWrite(patch: { pinFailCount: number; pinLockedUntil: string | null }) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const current = fs.existsSync(SETTINGS_FILE)
      ? JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"))
      : {};
    current.pinFailCount = patch.pinFailCount;
    current.pinLockedUntil = patch.pinLockedUntil;
    current.updatedAt = new Date().toISOString();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(current, null, 2), "utf-8");
  } catch (err) {
    console.warn("Lỗi lưu pin lock vào system_settings.json:", err);
  }
}

function toLockState(failCount: number, lockedUntilIso: string | null): LockState {
  if (lockedUntilIso) {
    const retryAfterSec = Math.ceil((new Date(lockedUntilIso).getTime() - Date.now()) / 1000);
    if (retryAfterSec > 0) return { locked: true, retryAfterSec };
  }
  return { locked: false, retryAfterSec: 0 };
}

async function readState(): Promise<{ pinFailCount: number; pinLockedUntil: string | null }> {
  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      if (sb) {
        const { data, error } = await sb
          .from("warehouse_settings")
          .select("pin_fail_count, pin_locked_until")
          .eq("id", "default")
          .maybeSingle();
        if (!error && data) {
          return {
            pinFailCount: Number(data.pin_fail_count) || 0,
            pinLockedUntil: data.pin_locked_until ? String(data.pin_locked_until) : null,
          };
        }
      }
    } catch {}
  }
  return localRead();
}

async function writeState(pinFailCount: number, pinLockedUntil: string | null): Promise<void> {
  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      if (sb) {
        const { data: updated } = await sb
          .from("warehouse_settings")
          .update({ pin_fail_count: pinFailCount, pin_locked_until: pinLockedUntil })
          .eq("id", "default")
          .select();
        if (!updated || updated.length === 0) {
          await sb
            .from("warehouse_settings")
            .upsert(
              { id: "default", pin_fail_count: pinFailCount, pin_locked_until: pinLockedUntil },
              { onConflict: "id" }
            );
        }
        return;
      }
    } catch (err) {
      console.warn("Lưu pin lock Supabase:", err);
    }
  }
  localWrite({ pinFailCount, pinLockedUntil });
}

export async function checkPinLock(): Promise<LockState> {
  const state = await readState();
  return toLockState(state.pinFailCount, state.pinLockedUntil);
}

export async function recordPinFailure(): Promise<LockState> {
  const state = await readState();
  const nextFail = state.pinFailCount + 1;
  let lockedUntil: string | null = state.pinLockedUntil;
  if (nextFail >= MAX_ATTEMPTS) {
    lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
    await writeState(0, lockedUntil);
  } else {
    await writeState(nextFail, lockedUntil && new Date(lockedUntil) > new Date() ? lockedUntil : null);
  }
  return toLockState(nextFail >= MAX_ATTEMPTS ? MAX_ATTEMPTS : nextFail, lockedUntil);
}

export async function resetPinFailures(): Promise<void> {
  await writeState(0, null);
}
