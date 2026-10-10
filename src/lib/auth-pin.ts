import "server-only";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import fs from "fs";
import path from "path";
import { getSupabase, supabaseEnabled } from "./supabase-server";

const scryptAsync = promisify(scrypt);
const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "system_settings.json");

/**
 * Tạo mã hash scrypt chuẩn từ chuỗi PIN thô
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(pin, Buffer.from(salt, "hex"), 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
}

// Mã hash mặc định của mã PIN 1809
const DEFAULT_1809_PIN_HASH =
  "scrypt:f807eb24b1ec9dccef5c82f75a2f4290:901daa989670d51d418bfc6c36aabce280343df43dff43926a9b3bf326fe24526ccc12d1b2b2177dbaa02e7a682b161a251a125fc3f42405ef4dbd68954c76c4";

/**
 * Đọc mã PIN hash hiện tại:
 * 1. Ưu tiên đọc từ Supabase (bảng warehouse_settings -> system_pin_hash)
 * 2. Đọc từ file local data/system_settings.json
 * 3. Fallback đọc từ biến môi trường APP_PIN_HASH
 * 4. Fallback mặc định là mã PIN 1809 (không bao giờ báo lỗi hệ thống chưa cấu hình)
 */
export async function getActivePinHash(): Promise<string> {
  // 1. Thử lấy từ Supabase
  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      if (sb) {
        const { data, error } = await sb
          .from("warehouse_settings")
          .select("system_pin_hash")
          .eq("id", "default")
          .maybeSingle();

        if (!error && data?.system_pin_hash) {
          return String(data.system_pin_hash).trim();
        }
      }
    } catch {
      // Ignored, fallback to local file
    }
  }

  // 2. Thử lấy từ file local
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      if (parsed?.pinHash) {
        return String(parsed.pinHash).trim();
      }
    }
  } catch {
    // Ignored
  }

  // 3. Fallback từ biến môi trường
  const envHash = process.env.APP_PIN_HASH?.trim();
  if (envHash) {
    return envHash;
  }

  // 4. Luôn fallback về mã PIN 1809 mặc định
  return DEFAULT_1809_PIN_HASH;
}

/**
 * Cập nhật mã PIN mới vào Database (Supabase + Local file fallback)
 */
export async function updatePinInDatabase(newPin: string): Promise<string> {
  const newHash = await hashPin(newPin);

  // 1. Lưu vào Supabase
  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      if (sb) {
        await sb.from("warehouse_settings").upsert(
          { id: "default", system_pin_hash: newHash },
          { onConflict: "id" }
        );
      }
    } catch (err) {
      console.warn("Lỗi lưu PIN vào Supabase warehouse_settings:", err);
    }
  }

  // 2. Lưu vào local file
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const current = fs.existsSync(SETTINGS_FILE)
      ? JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"))
      : {};
    current.pinHash = newHash;
    current.updatedAt = new Date().toISOString();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(current, null, 2), "utf-8");
  } catch (err) {
    console.warn("Lỗi lưu PIN vào file system_settings.json:", err);
  }

  return newHash;
}

/**
 * Đọc mã PIN hash của Nhân viên (staff):
 * 1. Supabase warehouse_settings.staff_pin_hash
 * 2. File local data/system_settings.json (staffPinHash)
 * Trả về null nếu chưa cấu hình (an toàn mặc định: không cho đăng nhập staff).
 */
export async function getStaffPinHash(): Promise<string | null> {
  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      if (sb) {
        const { data, error } = await sb
          .from("warehouse_settings")
          .select("staff_pin_hash")
          .eq("id", "default")
          .maybeSingle();
        if (!error && data?.staff_pin_hash) {
          return String(data.staff_pin_hash).trim();
        }
      }
    } catch {
      // Ignored, fallback to local file
    }
  }

  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      if (parsed?.staffPinHash) {
        return String(parsed.staffPinHash).trim();
      }
    }
  } catch {
    // Ignored
  }

  return null;
}

/**
 * Cập nhật mã PIN Nhân viên mới (hash rồi ghi cả 2 nơi, mirror updatePinInDatabase)
 */
export async function setStaffPinHash(pin: string): Promise<string> {
  const newHash = await hashPin(pin);

  if (supabaseEnabled) {
    try {
      const sb = getSupabase();
      if (sb) {
        const { data: updated } = await sb
          .from("warehouse_settings")
          .update({ staff_pin_hash: newHash })
          .eq("id", "default")
          .select();
        if (!updated || updated.length === 0) {
          await sb.from("warehouse_settings").upsert(
            { id: "default", staff_pin_hash: newHash },
            { onConflict: "id" }
          );
        }
      }
    } catch (err) {
      console.warn("Lỗi lưu PIN staff vào Supabase:", err);
    }
  }

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const current = fs.existsSync(SETTINGS_FILE)
      ? JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"))
      : {};
    current.staffPinHash = newHash;
    current.updatedAt = new Date().toISOString();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(current, null, 2), "utf-8");
  } catch (err) {
    console.warn("Lỗi lưu PIN staff vào system_settings.json:", err);
  }

  return newHash;
}

/**
 * Kiểm tra mã PIN người dùng nhập
 */
export async function verifyPin(pin: string, encodedHash: string | undefined): Promise<boolean> {
  if (!encodedHash || !pin) return false;
  const separator = encodedHash.includes(":") ? ":" : "$";
  const [algorithm, saltHex, hashHex, extra] = encodedHash.split(separator);
  if (algorithm !== "scrypt" || !saltHex || !hashHex || extra) return false;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]{128}$/i.test(hashHex)) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = (await scryptAsync(pin, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
