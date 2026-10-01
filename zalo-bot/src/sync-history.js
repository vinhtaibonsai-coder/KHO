import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Zalo } from "zca-js";
import { hasSku, parseWarehouseFromName, resolveWarehouse } from "./index.js";

const BOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.loadEnvFile(path.join(BOT_DIR, ".env"));
} catch {}

const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "http://localhost:3000/api/webhook/zalo";
const MAPPING_FILE = process.env.MAPPING_FILE ?? path.join(BOT_DIR, "zalo-mapping.json");
const SESSION_FILE = path.join(BOT_DIR, ".zalo-session.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("==========================================================");
  console.log("🔄 CÔNG CỤ QUÉT LỊCH SỬ TIN NHẮN CŨ TỪ 30 NHÓM ZALO");
  console.log("==========================================================");

  if (!fs.existsSync(SESSION_FILE)) {
    console.error("❌ Chưa tìm thấy file đăng nhập .zalo-session.json!");
    console.error("👉 Vui lòng chạy 'npm start' để quét mã QR đăng nhập trước.");
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
  const zalo = new Zalo();
  console.log("🔑 Đang đăng nhập Zalo...");
  const api = await zalo.login(creds);
  console.log("✅ Đăng nhập Zalo thành công!");

  // Lấy danh sách toàn bộ các nhóm từ Zalo
  console.log("🔍 Đang lấy danh sách các nhóm Zalo của bạn...");
  const allGroups = await api.getAllGroups();
  const groupIds = Object.keys(allGroups?.gridVerMap || allGroups?.gridInfoMap || {});

  let mapping = { groups: {} };
  try {
    mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, "utf8"));
  } catch {}

  console.log(`📋 Tổng cộng tìm thấy: ${groupIds.length} nhóm trên tài khoản của bạn.`);

  // Lấy thông tin chi tiết tên nhóm theo lô 20 nhóm/lần
  const groupNameMap = new Map();
  for (let i = 0; i < groupIds.length; i += 20) {
    const chunk = groupIds.slice(i, i + 20);
    try {
      const info = await api.getGroupInfo(chunk);
      if (info?.gridInfoMap) {
        for (const [gid, gdata] of Object.entries(info.gridInfoMap)) {
          if (gdata?.name) groupNameMap.set(gid, gdata.name);
        }
      }
    } catch (e) {
      console.error(`   ! Lỗi lấy thông tin lô nhóm: ${e.message}`);
    }
    await sleep(100);
  }

  let totalParsed = 0;
  let totalImported = 0;

  for (const gid of groupIds) {
    const gName = groupNameMap.get(gid) || "";
    const wh = resolveWarehouse(mapping, gid, gName);

    // Chỉ quét các nhóm được nhận diện từ Kho 01 đến Kho 30
    if (!wh) continue;

    console.log(`\n📂 Đang quét tin nhắn cũ: [${gName}] (Kho ${String(wh).padStart(2, "0")})...`);

    try {
      // Lấy tối đa 100 tin nhắn gần nhất trong nhóm
      const history = await api.getGroupChatHistory(gid, 100);
      const msgs = history?.groupMsgs || [];
      console.log(`   -> Tìm thấy ${msgs.length} tin nhắn gần nhất.`);

      // Sắp xếp từ tin cũ đến tin mới để cập nhật trạng thái kho theo đúng trình tự thời gian
      msgs.sort((a, b) => (a.ts || 0) - (b.ts || 0));

      for (const m of msgs) {
        let text = "";
        if (typeof m.content === "string") {
          text = m.content.trim();
        } else if (typeof m.msg === "string") {
          text = m.msg.trim();
        } else if (m.content?.title) {
          text = String(m.content.title).trim();
        } else if (m.content?.description) {
          text = String(m.content.description).trim();
        }

        if (text && hasSku(text)) {
          totalParsed++;
          console.log(`   ➔ Phát hiện mã: "${text}"`);

          // Gửi về Webhook để lưu vào Supabase
          try {
            const res = await fetch(WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                groupId: `KHO_${String(wh).padStart(2, "0")}`,
                message: text.trim(),
              }),
            });
            const data = await res.json();
            if (data.ok) {
              totalImported++;
              console.log(`      ✓ Đã nạp thành công: ${data.message?.detail || "OK"}`);
            }
          } catch (postErr) {
            console.error(`      ✗ Lỗi gửi webhook: ${postErr.message}`);
          }
          await sleep(200); // Tránh nghẽn mạng
        }
      }
    } catch (err) {
      console.error(`   ✗ Lỗi khi đọc lịch sử nhóm [${gName}]:`, err.message);
    }
  }

  console.log("\n==========================================================");
  console.log(`🎉 HOÀN TẤT QUÉT LỊCH SỬ!`);
  console.log(`- Tổng số tin nhắn có chứa mã SKU tìm thấy: ${totalParsed}`);
  console.log(`- Tổng số mã đã nạp vào Kho & Supabase: ${totalImported}`);
  console.log("==========================================================");
}

main().catch(console.error);
