const fs = require("fs");
const path = require("path");
const config = require("./config");

// Cấu hình URL Webhook
const WEBHOOK_URL = process.env.WEBHOOK_URL || config.WEBHOOK_URL;
const COOKIE_FILE = path.join(__dirname, "session.json");

console.log("==================================================");
console.log("🚀 KHỞI ĐỘNG ZALO WORKER BOT (30 KHO)");
console.log(`📡 Webhook nhận dữ liệu: ${WEBHOOK_URL}`);
console.log("==================================================");

/**
 * Hàm phân tích số kho từ tên nhóm hoặc ID
 * VD: "Nhóm Báo Hàng Kho 05" -> "KHO_05"
 */
function extractGroupId(groupName, rawGroupId) {
  if (config[rawGroupId]) return config[rawGroupId];
  const match = groupName ? groupName.match(/(?:kho|k)\s*0?(\d+)/i) : null;
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 1) {
      return `KHO_${String(num).padStart(2, "0")}`;
    }
  }
  return rawGroupId;
}

/**
 * Kiểm tra xem tin nhắn có chứa mã SKU không (VD: +E120.124, E80.345, -P120.50...)
 */
function isWarehouseMessage(text) {
  if (!text || typeof text !== "string") return false;
  const clean = text.trim();
  // Khớp: +mã, -mã, NK mã, XK mã, hoặc mã độc lập có chứa ký tự chữ/số/dấu chấm
  return /^([+\-]|NK\s+|XK\s+)?[A-Z0-9_\.\-]+/i.test(clean);
}

/**
 * Gửi dữ liệu tin nhắn về API Webhook Next.js (Local hoặc Vercel)
 */
async function forwardToWebhook(groupId, messageText) {
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId: groupId,
        message: messageText,
      }),
    });
    const result = await response.json();
    if (result.ok) {
      console.log(`✅ [ĐÃ XỬ LÝ] ${groupId} ➔ "${messageText}" ➔ ${result.message?.detail}`);
    } else {
      console.log(`⚠️ [LỖI WEBHOOK] ${groupId} ➔ "${messageText}": ${result.message?.detail || result.error}`);
    }
  } catch (err) {
    console.error(`❌ [LỖI GỬI HTTP] Không gọi được ${WEBHOOK_URL}:`, err.message);
  }
}

// Khởi chạy listener
async function main() {
  let zca;
  try {
    zca = require("zca-js");
  } catch (e) {
    console.log("ℹ️ Chưa cài đặt zca-js, vui lòng chạy: cd zalo-bot && npm install");
    return;
  }

  const { Zalo } = zca;
  const zalo = new Zalo({
    selfListen: false,
    checkUpdate: false,
  });

  // Đăng nhập bằng cookie cũ nếu có, hoặc tạo mã QR
  if (fs.existsSync(COOKIE_FILE)) {
    console.log("🔑 Đang nạp session đăng nhập từ session.json...");
    try {
      const sessionData = JSON.parse(fs.readFileSync(COOKIE_FILE, "utf-8"));
      await zalo.login(sessionData);
      console.log("🎉 Đăng nhập Zalo thành công từ session cũ!");
    } catch (err) {
      console.log("⚠️ Session hết hạn, chuyển sang quét mã QR...");
      fs.unlinkSync(COOKIE_FILE);
      await loginWithQR(zalo);
    }
  } else {
    await loginWithQR(zalo);
  }

  // Bắt đầu lắng nghe tin nhắn từ các nhóm
  zalo.listener.on("message", async (msg) => {
    // Chỉ xử lý tin nhắn trong nhóm chat (Group)
    if (msg.type === "group" && isWarehouseMessage(msg.data?.content)) {
      const groupName = msg.data?.groupName || "";
      const rawGroupId = String(msg.data?.groupId || "");
      const groupId = extractGroupId(groupName, rawGroupId);
      const text = String(msg.data?.content).trim();

      console.log(`📩 Nhận tin từ nhóm [${groupName || rawGroupId}]: "${text}"`);
      await forwardToWebhook(groupId, text);
    }
  });

  zalo.listener.start();
  console.log("👂 Đang trực nghe tin nhắn từ tất cả các nhóm Zalo...");
}

async function loginWithQR(zalo) {
  const qrcode = require("qrcode-terminal");
  console.log("📲 Hãy mở ứng dụng Zalo trên điện thoại quét mã QR bên dưới:");

  const session = await zalo.loginQR((qrUrl) => {
    qrcode.generate(qrUrl, { small: true });
  });

  fs.writeFileSync(COOKIE_FILE, JSON.stringify(session, null, 2), "utf-8");
  console.log("🎉 Đăng nhập thành công! Đã lưu session vào session.json.");
}

main().catch(console.error);
