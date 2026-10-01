import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Zalo, ThreadType, LoginQRCallbackEventType } from "zca-js";
import pngjs from "pngjs";
import jsQR from "jsqr";
import qrcodeTerminal from "qrcode-terminal";

const { PNG } = pngjs;

const BOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.loadEnvFile(path.join(BOT_DIR, ".env"));
} catch {
  /* chưa có file .env */
}

const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "http://localhost:3000/api/webhook/zalo";
const MAPPING_FILE = process.env.MAPPING_FILE ?? path.join(BOT_DIR, "zalo-mapping.json");
const SESSION_FILE = path.join(BOT_DIR, ".zalo-session.json");
const QR_FILE = path.join(BOT_DIR, "qr.png");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");

// ============================================================
// Lọc & bóc tách (hàm thuần để selftest được)
// ============================================================
/** Có mã hàng trong tin nhắn không? (E120.124, +E120.124, NK E120.124...) */
export function hasSku(text) {
  return /(^|\s)[+\-]?[A-Za-z]{1,6}\d+(?:[.\-]\d+)*/.test(text ?? "");
}

/** "KHO 05" / "Kho 5" / "Kho-12" -> 5 / 5 / 12, không hợp lệ -> null */
export function parseWarehouseFromName(name) {
  if (!name) return null;
  const m = name.match(/(?:kho|k)[\s_\-]*0*(\d{1,2})\b/i) ?? name.match(/\b0*(\d{1,2})\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 30 ? n : null;
}

/** Ưu tiên map cố định theo Group ID, sau đó suy ra từ tên nhóm */
export function resolveWarehouse(mapping, groupId, groupName) {
  const mapped = mapping?.groups?.[groupId];
  if (Number.isInteger(mapped) && mapped >= 1 && mapped <= 30) return mapped;
  return parseWarehouseFromName(groupName);
}

function loadMapping() {
  try {
    return JSON.parse(fs.readFileSync(MAPPING_FILE, "utf8"));
  } catch {
    return { groups: {} };
  }
}

function saveMapping(mapping) {
  try {
    fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2), "utf8");
  } catch (err) {
    console.error("[mapping] không ghi được file:", err.message);
  }
}

// ============================================================
// Chuyển tiếp webhook (retry khi mạng chập chờn)
// ============================================================
export async function forward(groupId, message, url = WEBHOOK_URL, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      console.error(`[webhook] HTTP ${res.status} cho "${message}":`, data.error ?? data.detail ?? "");
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return data;
    } catch (err) {
      console.error(`[webhook] lỗi mạng lần ${i}/${attempts}:`, err.message);
    }
    if (i < attempts) await sleep(500 * i);
  }
  return { ok: false };
}

// ============================================================
// Đăng nhập QR (hiện QR trực tiếp trên terminal, fallback ra file)
// ============================================================
function showQrOnTerminal(base64Png) {
  try {
    const png = PNG.sync.read(Buffer.from(base64Png, "base64"));
    const found = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    if (found?.data) {
      qrcodeTerminal.generate(found.data, { small: true }, (txt) => console.log(txt));
      return true;
    }
  } catch (err) {
    console.error("[qr] không đọc được ảnh QR:", err.message);
  }
  return false;
}

function onQrEvent(event) {
  switch (event.type) {
    case LoginQRCallbackEventType.QRCodeGenerated: {
      const shown = showQrOnTerminal(event.data.image);
      event.actions.saveToFile(QR_FILE).catch(() => {});
      console.log(
        shown
          ? `\n>>> Quét mã QR trên terminal bằng Zalo (App > Quét mã). Không thấy QR? Mở file ${QR_FILE}`
          : `\n>>> Mở file ${QR_FILE} rồi quét bằng Zalo (App > Quét mã)`
      );
      break;
    }
    case LoginQRCallbackEventType.QRCodeExpired:
      console.log("[qr] Mã QR hết hạn, đang tạo mã mới...");
      event.actions.retry();
      break;
    case LoginQRCallbackEventType.QRCodeScanned:
      console.log(`[qr] Đã quét bởi ${event.data.display_name}. Duyệt đăng nhập trên điện thoại...`);
      break;
    case LoginQRCallbackEventType.QRCodeDeclined:
      console.log("[qr] Người dùng từ chối, tạo mã mới...");
      event.actions.retry();
      break;
    case LoginQRCallbackEventType.GotLoginInfo:
      fs.writeFileSync(
        SESSION_FILE,
        JSON.stringify(
          { imei: event.data.imei, cookie: event.data.cookie, userAgent: event.data.userAgent },
          null,
          2
        ),
        "utf8"
      );
      console.log(`[qr] Đã lưu session -> ${path.basename(SESSION_FILE)} (lần sau khỏi quét QR)`);
      break;
    default:
      break;
  }
}

async function login(zalo) {
  if (fs.existsSync(SESSION_FILE)) {
    try {
      const creds = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
      const api = await zalo.login(creds);
      console.log("[login] Dùng session cũ, không cần quét QR.");
      return api;
    } catch (err) {
      console.error("[login] Session hết hạn:", err.message, "-> quét QR lại");
      fs.rmSync(SESSION_FILE, { force: true });
    }
  }
  console.log("[login] Chờ quét mã QR...");
  return zalo.loginQR({ qrPath: QR_FILE }, onQrEvent);
}

// ============================================================
// Xử lý tin nhắn từ nhóm Zalo
// ============================================================
const nameCache = new Map();

async function groupName(api, groupId) {
  if (nameCache.has(groupId)) return nameCache.get(groupId);
  try {
    const res = await api.getGroupInfo(groupId);
    const name = res?.gridInfoMap?.[groupId]?.name ?? "";
    nameCache.set(groupId, name);
    return name;
  } catch {
    return "";
  }
}

async function handleGroupMessage(api, message) {
  let text = "";
  if (typeof message.data?.content === "string") {
    text = message.data.content.trim();
  } else if (typeof message.data === "string") {
    text = message.data.trim();
  } else if (message.data?.content?.title) {
    text = String(message.data.content.title).trim();
  } else if (message.data?.content?.description) {
    text = String(message.data.content.description).trim();
  }
  
  if (!text || !hasSku(text)) return; // bỏ qua tán gẫu / hình ảnh không có mã hàng

  const groupId = message.threadId;
  const mapping = loadMapping();
  const name = await groupName(api, groupId);
  const warehouse = resolveWarehouse(mapping, groupId, name);
  // CHỈ NHẬN TIN NHẮN TỪ KHO 1 ĐẾN KHO 30
  if (!warehouse) {
    // Không phải nhóm kho (Kho 1 - Kho 30) -> Bỏ qua, không xử lý
    return;
  }

  if (mapping.groups[groupId] !== warehouse) {
    mapping.groups[groupId] = warehouse; // tự lưu map cho lần sau
    saveMapping(mapping);
    console.log(`[mapping] Nhận diện nhóm: ${groupId} ("${name}") -> Kho ${warehouse}`);
  }

  const label = `KHO_${pad(warehouse)}`;
  const res = await forward(label, text);
  console.log(
    `[msg] "${text}" từ "${name || groupId}" -> ${label}: ${res.ok ? "OK" : "LỖI"}${res.message?.detail ? " - " + res.message.detail : ""}`
  );

  // CẢNH BÁO TRÙNG MÃ: Trả lời trực tiếp vào nhóm Zalo để người gửi biết ngay
  try {
    if (res.duplicate && res.message?.detail) {
      // Trường hợp gửi 1 mã bị trùng
      await api.sendMessage(
        `⚠️ ${res.message.detail}`,
        groupId,
        ThreadType.Group
      );
      console.log(`[bot-reply] Đã gửi cảnh báo trùng mã vào nhóm ${name || groupId}`);
    } else if (Array.isArray(res.duplicates) && res.duplicates.length > 0) {
      // Trường hợp gửi danh sách nhiều mã có mã bị trùng
      const dupList = res.duplicates.join(", ");
      await api.sendMessage(
        `⚠️ CẢNH BÁO TRÙNG MÃ: Các mã sau đã có ở kho khác nên bị bỏ qua:\n👉 ${dupList}`,
        groupId,
        ThreadType.Group
      );
      console.log(`[bot-reply] Đã gửi cảnh báo danh sách trùng vào nhóm ${name || groupId}`);
    }
  } catch (replyErr) {
    console.error("[bot-reply] Không gửi được tin nhắn phản hồi vào nhóm Zalo:", replyErr.message);
  }
}

function startListener(api) {
  api.listener.on("connected", () => console.log("[ws] Đã kết nối, đang nghe tin nhắn 30 nhóm..."));
  api.listener.on("disconnected", (code, reason) => console.error(`[ws] Mất kết nối (${code}): ${reason}`));
  api.listener.on("error", (err) => console.error("[ws] Lỗi:", err));
  api.listener.on("message", (message) => {
    try {
      const rawContent = message?.data?.content;
      const text = typeof rawContent === "string" ? rawContent : (rawContent ? JSON.stringify(rawContent) : "");
      const sender = message?.isSelf ? "CHÍNH BẠN" : (message?.data?.dName || message?.data?.uidFrom || "Ai đó");
      console.log(`[debug-raw] Nhận tin: [${sender}] type=${message?.type}, threadId=${message?.threadId}, isSelf=${message?.isSelf}, content="${text}"`);
      
      if (message.type !== ThreadType.Group) return;
      handleGroupMessage(api, message).catch((err) => console.error("[msg] Lỗi xử lý:", err.message));
    } catch (err) {
      console.error("[msg] Lỗi bóc tách tin nhắn:", err.message);
    }
  });
  api.listener.start();
}

// ============================================================
// Selftest (không cần mạng): npm run selftest
// ============================================================
function selftest() {
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`FAIL: ${msg}`);
    console.log(`ok - ${msg}`);
  };

  assert(hasSku("E120.124"), "mã trần");
  assert(hasSku("+E120.124"), "mã nhập kho");
  assert(hasSku("-E80.345"), "mã xuất kho");
  assert(hasSku("NK E120.124 50"), "NK + số lượng");
  assert(hasSku("XK P120.50"), "XK");
  assert(!hasSku("anh đi ăn cơm chưa"), "bỏ qua tin tán gẫu");
  assert(!hasSku("nhớ xem giúp mình nhé"), "bỏ qua tin thường");

  assert(parseWarehouseFromName("KHO 05") === 5, "KHO 05 -> 5");
  assert(parseWarehouseFromName("Kho 5") === 5, "Kho 5 -> 5");
  assert(parseWarehouseFromName("Kho-12 nhom A") === 12, "Kho-12 -> 12");
  assert(parseWarehouseFromName("Kho 99") === null, "kho 99 -> null");

  const mapping = { groups: { "gid-1": 7 } };
  assert(resolveWarehouse(mapping, "gid-1", "Kho 9") === 7, "map theo Group ID được ưu tiên");
  assert(resolveWarehouse(mapping, "gid-2", "Kho 9") === 9, "suy ra từ tên nhóm");
  assert(resolveWarehouse(mapping, "gid-3", "") === null, "không có dữ liệu -> null");

  console.log("\nSelftest PASSED");
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const zalo = new Zalo({ logging: true, selfListen: true });
  const api = await login(zalo);
  // Đảm bảo listener cũng nhận tin nhắn do chính tài khoản này gửi (selfListen)
  if (api?.listener) {
    api.listener.selfListen = true;
  }
  let uid = "";
  try {
    uid = api.getOwnId();
  } catch {
    /* bỏ qua */
  }
  console.log(`[login] Thành công${uid ? ` (uid ${uid})` : ""}. Webhook: ${WEBHOOK_URL}`);
  startListener(api);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[fatal]", err);
    process.exit(1);
  });
}
