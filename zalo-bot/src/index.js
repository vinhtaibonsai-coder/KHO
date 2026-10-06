import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Zalo, ThreadType, LoginQRCallbackEventType, TextStyle } from "zca-js";
import pngjs from "pngjs";
import jsQR from "jsqr";
import qrcodeTerminal from "qrcode-terminal";
import { syncRecentGroupHistory } from "./sync-history.js";
import { sendSignedWebhook } from "./webhook-client.js";

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

/** "KHO 05" / "Kho 5" / "Nhóm Kho 31" -> 5 / 31. Bắt buộc chữ KHO đi liền với số kho */
export function parseWarehouseFromName(name) {
  if (!name || typeof name !== "string") return null;

  // Khớp chính xác: "Kho 01", "KHO 31", "Kho_12", "Kho-05", "KHO31"
  // Không bắt các số năm ngẫu nhiên như "Hình lũa 2026", "Năm 2026"
  const m = name.match(/\bkho[\s_\-]*0*(\d{1,3})\b/i);
  if (m) {
    const n = parseInt(m[1], 10);
    // Giới hạn hợp lý số kho từ 1 đến 100 để tránh bắt nhầm năm 2026
    if (n >= 1 && n <= 100) {
      return n;
    }
  }

  return null;
}

/** Chỉ nhận nếu tên nhóm có chữ KHO hoặc đã được map hợp lệ */
export function resolveWarehouse(mapping, groupId, groupName) {
  // Nếu có tên nhóm, bắt buộc tên nhóm phải có từ KHO
  if (groupName && !/\bkho\b/i.test(groupName)) {
    return null;
  }

  const mapped = mapping?.groups?.[groupId];
  if (Number.isInteger(mapped) && mapped >= 1) return mapped;
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
      const res = await sendSignedWebhook(url, { groupId, message });
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
  // CHỈ NHẬN TIN NHẮN TỪ CÁC NHÓM KHO (Kho 1, Kho 2, ..., Kho 31, ...)
  if (!warehouse) {
    // Không phải nhóm có chữ Kho -> Bỏ qua, không xử lý
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

  // CẢNH BÁO TRÙNG MÃ HOẶC MÃ SAI QUY CHUẨN -> TỰ ĐỘNG THU HỒI / XÓA TIN NHẮN TRONG NHÓM & BÁO VÀO MY DOCUMENTS
  const hasDuplicate = res.duplicate || (Array.isArray(res.duplicates) && res.duplicates.length > 0);
  const hasInvalidSku = res.invalidSku || (Array.isArray(res.invalidSkus) && res.invalidSkus.length > 0);

  if (hasDuplicate || hasInvalidSku) {
    // 1. TỰ ĐỘNG XÓA / THU HỒI TIN NHẮN KHỎI NHÓM ZALO
    try {
      const msgId = message.data?.msgId || message.msgId;
      const cliMsgId = message.data?.cliMsgId || message.cliMsgId;
      const uidFrom = message.data?.uidFrom || message.uidFrom || "";

      let deleted = false;

      // Nếu là chính tài khoản Bot gửi -> Thu hồi tin nhắn (Undo)
      if (message.isSelf && api.undo && msgId && cliMsgId) {
        await api.undo({ msgId, cliMsgId }, groupId, ThreadType.Group);
        console.log(`[bot-delete] Đã THU HỒI tin nhắn vi phạm (${text}) khỏi nhóm ${name || groupId}`);
        deleted = true;
      } 
      
      // Nếu là người khác gửi (Bot là Admin/Phó nhóm) hoặc fallback -> Xóa tin nhắn (deleteMessage)
      if (!deleted && api.deleteMessage && msgId && cliMsgId) {
        await api.deleteMessage({
          data: { cliMsgId: String(cliMsgId), msgId: String(msgId), uidFrom: String(uidFrom) },
          threadId: groupId,
          type: ThreadType.Group,
        }, false); // onlyMe = false (xóa phía tất cả mọi người trong nhóm)
        console.log(`[bot-delete] Đã XÓA tin nhắn vi phạm (${text}) của thành viên khỏi nhóm ${name || groupId}`);
      }
    } catch (delErr) {
      console.warn(`[bot-delete] Không xóa được tin nhắn trong nhóm (Có thể tài khoản chưa được phân quyền Trưởng/Phó nhóm): ${delErr.message}`);
    }

    // 2. GỬI BÁO CÁO CHI TIẾT RIÊNG VÀO "CLOUD CỦA TÔI" (MY DOCUMENTS)
    try {
      const ctx = api.getContext ? api.getContext() : null;
      const send2meId = ctx?.loginInfo?.send2me_id || (api.getOwnId ? api.getOwnId() : null);

      if (!send2meId) {
        console.warn("[bot-reply] Không tìm thấy send2meId để gửi vào My Documents");
        return;
      }

      // Trường hợp 2.1: Báo lỗi mã sai quy chuẩn / Size không hợp lệ
      if (hasInvalidSku) {
        const title = `🚨 [CẢNH BÁO] MÃ NHẬP SAI QUY CHUẨN KHO`;
        let errorDetail = "";
        if (res.invalidSku) {
          errorDetail = `• Mã vi phạm: [${res.sku || text}]\n• Chi tiết lỗi: ${res.reason || res.message?.detail || "Không đúng quy chuẩn mã kho"}`;
        } else if (Array.isArray(res.invalidSkus)) {
          errorDetail = res.invalidSkus.map((item) => `• Mã [${item.raw}]: ${item.error}`).join("\n");
        }

        const msgLines = [
          title,
          "",
          `📍 Vị trí: KHO ${pad(warehouse)}`,
          `👥 Nhóm Zalo: ${name || `Kho ${warehouse}`}`,
          "",
          `📋 THÔNG TIN LỖI:`,
          errorDetail,
          "",
          `💬 Tin nhắn gốc: "${text}"`,
          "",
          `🛡️ TRẠNG THÁI: Tin nhắn đã được hệ thống tự động thu hồi/xóa khỏi nhóm để tránh sai sót kiểm kho.`
        ];
        const fullMsg = msgLines.join("\n");

        await api.sendMessage(
          {
            msg: fullMsg,
            styles: [
              { start: 0, len: title.length, st: TextStyle.Bold },
              { start: 0, len: title.length, st: TextStyle.Red },
            ],
          },
          send2meId,
          ThreadType.User
        );
        console.log(`[bot-reply] Đã gửi thông báo MÃ SAI QUY CHUẨN chuẩn đẹp vào "Cloud của tôi" (send2meId: ${send2meId})`);
      }

      // Trường hợp 2.2: Báo lỗi trùng mã sản phẩm
      if (hasDuplicate) {
        const title = `🚫 [CẢNH BÁO] PHÁT HIỆN TRÙNG MÃ KHO`;
        let dupDetail = "";
        if (res.duplicate && res.message?.detail) {
          dupDetail = res.message.detail;
        } else if (Array.isArray(res.duplicates) && res.duplicates.length > 0) {
          dupDetail = res.duplicates.map((d) => `• ${d}`).join("\n");
        } else {
          dupDetail = "Mã sản phẩm đã tồn tại ở kho khác!";
        }

        const msgLines = [
          title,
          "",
          `📍 Vị trí gửi: KHO ${pad(warehouse)}`,
          `👥 Nhóm Zalo: ${name || `Kho ${warehouse}`}`,
          "",
          `📋 CHI TIẾT TRÙNG LẶP:`,
          dupDetail,
          "",
          `💬 Tin nhắn gốc: "${text}"`,
          "",
          `🛡️ TRẠNG THÁI: Đã từ chối nạp trùng và thu hồi/xóa tin nhắn khỏi nhóm để bảo vệ tính độc bản của mã hàng.`
        ];
        const fullMsg = msgLines.join("\n");

        await api.sendMessage(
          {
            msg: fullMsg,
            styles: [
              { start: 0, len: title.length, st: TextStyle.Bold },
              { start: 0, len: title.length, st: TextStyle.Orange },
            ],
          },
          send2meId,
          ThreadType.User
        );
        console.log(`[bot-reply] Đã gửi thông báo TRÙNG MÃ chuẩn đẹp vào "Cloud của tôi" (send2meId: ${send2meId})`);
      }
    } catch (replyErr) {
      console.error("[bot-reply] Không gửi được tin cảnh báo vào My Documents:", replyErr.message);
    }
  }
}

async function handleDirectMessage(api, message) {
  let text = "";
  if (typeof message.data?.content === "string") {
    text = message.data.content.trim();
  } else if (typeof message.data === "string") {
    text = message.data.trim();
  } else if (message.data?.content?.title) {
    text = String(message.data.content.title).trim();
  }

  const ctx = api.getContext ? api.getContext() : null;
  const send2meId = ctx?.loginInfo?.send2me_id || (api.getOwnId ? api.getOwnId() : null);
  const ownId = api.getOwnId ? api.getOwnId() : null;
  const isMyDocs = message.threadId === send2meId || message.threadId === ownId || message.isSelf;

  // Kiểm tra cú pháp lệnh chuyển kho (CK ... hoặc CHUYEN ...)
  const isTransfer = /^(?:CK|CHUYEN|CHUYENKHO)\s+/i.test(text);

  if (isTransfer) {
    console.log(`[my-docs] Nhận lệnh chuyển kho: "${text}"`);
    const res = await forward("MY_DOCS", text);

    if (res.isTransfer && res.message?.detail) {
      const replyMsg = res.ok
        ? `✅ THÀNH CÔNG:\n${res.message.detail}`
        : `❌ THẤT BẠI:\n${res.message.detail}`;
      
      try {
        const targetId = send2meId || ownId;
        if (targetId) {
          await api.sendMessage(replyMsg, targetId, ThreadType.User);
        }
      } catch (err) {
        console.error("[my-docs] Lỗi gửi phản hồi kết quả chuyển kho:", err.message);
      }
    }
  }
}

function startListener(api) {
  api.listener.on("connected", () => console.log("[ws] Đã kết nối, đang nghe tin nhắn 30 nhóm & Cloud của tôi..."));
  api.listener.on("disconnected", (code, reason) => console.error(`[ws] Mất kết nối (${code}): ${reason}`));
  api.listener.on("error", (err) => console.error("[ws] Lỗi:", err));
  api.listener.on("message", (message) => {
    try {
      const rawContent = message?.data?.content;
      const text = typeof rawContent === "string" ? rawContent : (rawContent ? JSON.stringify(rawContent) : "");
      const sender = message?.isSelf ? "CHÍNH BẠN" : (message?.data?.dName || message?.data?.uidFrom || "Ai đó");
      console.log(`[debug-raw] Nhận tin: [${sender}] type=${message?.type}, threadId=${message?.threadId}, isSelf=${message?.isSelf}, content="${text}"`);
      
      if (message.type === ThreadType.Group) {
        handleGroupMessage(api, message).catch((err) => console.error("[msg] Lỗi xử lý:", err.message));
      } else if (message.type === ThreadType.User) {
        handleDirectMessage(api, message).catch((err) => console.error("[direct-msg] Lỗi xử lý:", err.message));
      }
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
  assert(parseWarehouseFromName("Kho 105") === null, "kho 105 -> null");

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

  // 1. Tự động đồng bộ tin nhắn đã gửi trong lúc tắt máy (Catch-up)
  console.log("[catch-up] Bắt đầu tự động quét các tin nhắn trong lúc tắt máy...");
  try {
    await syncRecentGroupHistory(api, 50);
  } catch (syncErr) {
    console.warn("[catch-up] Lỗi khi quét lịch sử:", syncErr.message);
  }

  // 2. Bắt đầu lắng nghe tin nhắn trực tiếp
  startListener(api);

  // 3. Heartbeat định kỳ 20 giây gửi tín hiệu ping để web hiển thị bot đang chạy
  const sendHeartbeat = async () => {
    try {
      await sendSignedWebhook(WEBHOOK_URL, { action: "heartbeat" });
    } catch {}
  };
  // Gửi ngay 1 lần đầu
  sendHeartbeat();
  setInterval(sendHeartbeat, 20000);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[fatal]", err);
    process.exit(1);
  });
}
