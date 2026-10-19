import fs from "node:fs";
import os from "node:os";
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
const SESSION_FILE = process.env.SESSION_FILE ?? path.join(BOT_DIR, ".zalo-session.json");
const QR_FILE = process.env.QR_FILE ?? path.join(BOT_DIR, "qr.png");

// ĐA MÁY: tên bot (May 1 / May 2...) — env BOT_NAME / MACHINE_ID, mặc định lấy hostname
const BOT_NAME = (process.env.BOT_NAME || process.env.MACHINE_ID || os.hostname() || "Bot").trim() || "Bot";

// ĐA MÁY: phân vùng kho phụ trách — env BOT_WAREHOUSES ('1-15', '16-30', '1-5,10', 'all')
const BOT_WAREHOUSES_SPEC = (process.env.BOT_WAREHOUSES || "all").trim();
let BOT_SHARDS;
try {
  BOT_SHARDS = parseWarehouseShards(BOT_WAREHOUSES_SPEC);
} catch (err) {
  console.error(`[config] ${err.message}`);
  process.exit(1);
}

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
  // Ưu tiên 1: Đọc số kho trực tiếp từ tên nhóm Zalo mới nhất (đáp ứng khi đổi tên nhóm thành Kho 40, Kho 50...)
  if (groupName && /\bkho\b/i.test(groupName)) {
    const fromName = parseWarehouseFromName(groupName);
    if (fromName) return fromName;
  }

  // Ưu tiên 2: Dùng mapping đã lưu trước đó nếu có
  const mapped = mapping?.groups?.[groupId];
  if (Number.isInteger(mapped) && mapped >= 1) return mapped;

  return null;
}

function loadMapping() {
  try {
    return JSON.parse(fs.readFileSync(MAPPING_FILE, "utf8"));
  } catch {
    return { groups: {} };
  }
}

/**
 * Phân vùng kho phụ trách (sharding đa máy).
 * 'all' -> null (phụ trách tất cả). '1-15' -> Set{1..15}. '1-5,10,20-25' -> hỗ trợ nhiều đoạn.
 */
export function parseWarehouseShards(spec) {
  if (!spec || /^all$/i.test(spec.trim())) return null;
  const set = new Set();
  for (const partRaw of spec.split(",")) {
    const part = partRaw.trim();
    if (!part) continue;
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) set.add(i);
      continue;
    }
    if (/^\d+$/.test(part)) {
      set.add(parseInt(part, 10));
      continue;
    }
    throw new Error(`BOT_WAREHOUSES không hợp lệ: "${part}" (VD: '1-15', '16-30', '1-5,10' hoặc 'all')`);
  }
  if (set.size === 0) throw new Error("BOT_WAREHOUSES rỗng — dùng 'all' hoặc khoảng VD '1-15'");
  return set;
}

/** Bot này có phụ trách kho này không? */
export function isWarehouseOwned(shards, warehouse) {
  if (!shards) return true;
  return shards.has(warehouse);
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
export async function forward(groupId, message, sourceId, url = WEBHOOK_URL, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await sendSignedWebhook(url, {
        groupId,
        message,
        botName: BOT_NAME,
        sourceId: sourceId || undefined,
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
  console.error(`[webhook] Mất kết nối webhook — bỏ qua sau ${attempts} lần thử: ${message}`);
  return { ok: false };
}

/** Gửi webhook kèm retry (dùng cho heartbeat / các gói không cần xử lý kết quả) */
export async function sendWebhookWithRetry(url, payload, attempts = 3, label = "webhook") {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await sendSignedWebhook(url, payload);
      if (res.ok) return true;
      console.error(`[webhook] ${label} HTTP ${res.status} (lần ${i}/${attempts})`);
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return false;
    } catch (err) {
      console.error(`[webhook] ${label} lỗi mạng lần ${i}/${attempts}: ${err.message}`);
    }
    if (i < attempts) await sleep(500 * i);
  }
  console.error(`[webhook] Mất kết nối webhook — ${label} thất bại sau ${attempts} lần thử, sẽ thử lại ở chu kỳ sau`);
  return false;
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

let isWsConnected = false;
let isReconnecting = false;
let reconnectTimer = null;
let heartbeatTimer = null;

// Gửi báo cáo ngắt kết nối WebSocket về Web
async function notifyWsDisconnected(code, reason) {
  isWsConnected = false;
  console.error(`[ws-alert] WebSocket ngắt kết nối (${code}): ${reason}. Báo trạng thái offline về webhook...`);
  try {
    await sendSignedWebhook(WEBHOOK_URL, {
      action: "bot_disconnected",
      botName: BOT_NAME,
      reason: `Mất kết nối Zalo WebSocket (${code})`,
    });
  } catch {}
}


/**
 * Gửi thông báo cập nhật / tạo kho mới vào "Cloud của tôi" (send2me)
 */
async function notifyWarehouseChangeToMyDocs(api, warehouseNumber, groupName, isNew = false) {
  try {
    const ctx = api.getContext ? api.getContext() : null;
    const send2meId = ctx?.loginInfo?.send2me_id || (api.getOwnId ? api.getOwnId() : null);
    if (!send2meId) return;

    const title = isNew 
      ? `✨ [HỆ THỐNG KHO] PHÁT HIỆN KHO MỚI: KHO ${pad(warehouseNumber)}`
      : `🔄 [HỆ THỐNG KHO] ĐÃ ĐỔI TÊN NHÓM ZALO: KHO ${pad(warehouseNumber)}`;

    const lines = [
      title,
      "",
      `📍 Kho nhận diện: KHO ${pad(warehouseNumber)}`,
      `👥 Tên nhóm Zalo: "${groupName || "Kho " + warehouseNumber}"`,
      `⏰ Thời gian: ${new Date().toLocaleTimeString("vi-VN")} ${new Date().toLocaleDateString("vi-VN")}`,
      "",
      `🛡️ Trạng thái: Hệ thống & Bot đã tự động cập nhật, sẵn sàng nhận hàng vào Kho ${pad(warehouseNumber)}!`
    ];

    await api.sendMessage(
      {
        msg: lines.join("\n"),
        styles: [
          { start: 0, len: title.length, st: TextStyle.Bold },
          { start: 0, len: title.length, st: isNew ? TextStyle.Green : TextStyle.Orange },
        ],
      },
      send2meId,
      ThreadType.User
    );
    console.log(`[bot-reply] Đã báo cập nhật Kho ${warehouseNumber} vào "Cloud của tôi"`);
  } catch (err) {
    console.warn(`[bot-reply] Không gửi được thông báo kho vào My Documents:`, err.message);
  }
}

const nameCache = new Map();

async function groupName(api, groupId, msgData = null) {
  if (nameCache.has(groupId) && nameCache.get(groupId)) return nameCache.get(groupId);

  // Thử 1: Lấy từ chính data của message Zalo nếu có
  if (msgData?.groupName && typeof msgData.groupName === "string") {
    nameCache.set(groupId, msgData.groupName);
    return msgData.groupName;
  }

  // Thử 2: Gọi api.getGroupInfo
  try {
    const res = await api.getGroupInfo(groupId);
    const name = res?.gridInfoMap?.[groupId]?.name;
    if (name) {
      nameCache.set(groupId, name);
      return name;
    }
  } catch {}

  // Thử 3: Fallback gọi api.getAllGroups nếu getGroupInfo bị lỗi Zalo
  try {
    const all = await api.getAllGroups();
    const map = all?.gridInfoMap || {};
    if (map[groupId]?.name) {
      const name = map[groupId].name;
      nameCache.set(groupId, name);
      return name;
    }
  } catch {}

  return "";
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
  const name = await groupName(api, groupId, message.data);
  const warehouse = resolveWarehouse(mapping, groupId, name);
  // CHỈ NHẬN TIN NHẮN TỪ CÁC NHÓM KHO (Kho 1, Kho 2, ..., Kho 31, ...)
  if (!warehouse) {
    console.warn(`⚠️ [bỏ qua] Nhận mã SKU "${text}" từ nhóm ID ${groupId} ("${name || "Không rõ tên"}") nhưng không xác định được số Kho! (Gợi ý: Đặt tên nhóm có chữ "Kho XX" hoặc thêm vào zalo-mapping.json)`);
    return;
  }

  if (mapping.groups[groupId] !== warehouse) {
    const oldWh = mapping.groups[groupId];
    mapping.groups[groupId] = warehouse; // tự lưu map cho lần sau
    saveMapping(mapping);
    console.log(`[mapping] Cập nhật nhận diện nhóm: ${groupId} ("${name}") -> Kho ${warehouse} (cũ: ${oldWh || "chưa có"})`);
    // Báo vào Cloud của tôi (My Documents)
    notifyWarehouseChangeToMyDocs(api, warehouse, name, !oldWh);
  }

  // SHARDING ĐA MÁY: bỏ qua kho không thuộc phân vùng của bot này (tránh xung đột 2 bot)
  if (!isWarehouseOwned(BOT_SHARDS, warehouse)) {
    console.log(`[shard] Bỏ qua Kho ${warehouse} — không thuộc phân vùng "${BOT_WAREHOUSES_SPEC}" của bot "${BOT_NAME}"`);
    return;
  }

  const sourceId = String(message.data?.msgId || message.msgId || "");
  const label = `KHO_${pad(warehouse)}`;
  const res = await forward(label, text, sourceId);
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
    const sourceId = String(message.data?.msgId || message.msgId || "");
    const res = await forward("MY_DOCS", text, sourceId);

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
  api.listener.on("connected", () => {
    isWsConnected = true;
    isReconnecting = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    console.log("[ws] ĐÃ KẾT NỐI ZALO THÀNH CÔNG — đang tự động lắng nghe tất cả các nhóm Kho (Kho 01, Kho 31, ...) & Cloud của tôi...");
  });

  api.listener.on("disconnected", (code, reason) => {
    console.error(`[ws] MẤT KẾT NỐI (${code}): ${reason}`);
    notifyWsDisconnected(code, reason);

    // Tự động kết nối lại (Auto-reconnect) sau 5 giây nếu không phải cố tình tắt
    if (!isReconnecting && code !== 1000) {
      isReconnecting = true;
      console.log("[ws-reconnect] Sẽ tự động kết nối lại Zalo sau 5 giây...");
      reconnectTimer = setTimeout(async () => {
        try {
          console.log("[ws-reconnect] Đang khởi động lại WebSocket listener...");
          api.listener.start();
        } catch (rErr) {
          console.error("[ws-reconnect] Lỗi khởi động lại:", rErr.message);
          isReconnecting = false;
        }
      }, 5000);
    }
  });

  api.listener.on("error", (err) => {
    const msg = err?.message || String(err);
    console.error("[ws] Lỗi:", msg);
    // Session cookie bị Zalo từ chối -> báo đúng câu chữ để app desktop mở cửa sổ + thông báo Windows
    if (/(session|cookie|unauthorized|forbidden|401|login|not.?login)/i.test(msg)) {
      console.error(`[ws] Session hết hạn: ${msg} — cần quét lại mã QR`);
      notifyWsDisconnected("SESSION_EXPIRED", msg);
    }
  });
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

  // ĐA MÁY: parse phân vùng kho
  assert(parseWarehouseShards("all") === null, "'all' -> phụ trách tất cả");
  const s1 = parseWarehouseShards("1-15");
  assert(s1.size === 15 && s1.has(1) && s1.has(15) && !s1.has(16), "'1-15' -> Set 1..15");
  const s2 = parseWarehouseShards("16-30");
  assert(s2.has(16) && s2.has(30) && !s2.has(15), "'16-30' -> Set 16..30");
  const s3 = parseWarehouseShards("1-5,10,20-22");
  assert(s3.size === 9 && s3.has(10) && s3.has(21) && !s3.has(6), "nhiều đoạn cách nhau dấu phẩy");
  assert(isWarehouseOwned(s1, 7) === true && isWarehouseOwned(s1, 20) === false, "isWarehouseOwned theo shard");
  assert(isWarehouseOwned(null, 99) === true, "shard null -> sở hữu tất cả");
  let threw = false;
  try { parseWarehouseShards("abc"); } catch { threw = true; }
  assert(threw, "spec sai -> ném lỗi");

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
  console.log(
    `[login] Thành công${uid ? ` (uid ${uid})` : ""}. Bot "${BOT_NAME}" | Phân vùng kho: ${BOT_WAREHOUSES_SPEC} | Webhook: ${WEBHOOK_URL}`
  );

  // 1. Tự động đồng bộ tin nhắn đã gửi trong lúc tắt máy (Catch-up)
  console.log("[catch-up] Bắt đầu tự động quét các tin nhắn trong lúc tắt máy...");
  try {
    await syncRecentGroupHistory(api, 50);
  } catch (syncErr) {
    console.warn("[catch-up] Lỗi khi quét lịch sử:", syncErr.message);
  }

  // 2. Bắt đầu lắng nghe tin nhắn trực tiếp
  startListener(api);

  // 3. Heartbeat định kỳ 20 giây: CHỈ PING ONLINE KHI WEBSOCKET THỰC SỰ ĐANG SỐNG
  const sendHeartbeat = () => {
    if (isWsConnected) {
      sendWebhookWithRetry(WEBHOOK_URL, { action: "heartbeat", botName: BOT_NAME }, 2, "heartbeat");
    } else {
      console.warn("[heartbeat] Tạm dừng ping vì WebSocket Zalo đang mất kết nối!");
    }
  };
  // Gửi ngay 1 lần đầu
  sendHeartbeat();
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(sendHeartbeat, 20000);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[fatal]", err);
    process.exit(1);
  });
}
