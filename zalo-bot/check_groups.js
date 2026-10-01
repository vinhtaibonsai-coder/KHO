import fs from "node:fs";
import path from "node:path";
import { Zalo } from "zca-js";

const BOT_DIR = process.cwd();
const SESSION_FILE = path.join(BOT_DIR, ".zalo-session.json");

async function check() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.log("SESSION_NOT_FOUND");
    return;
  }
  const creds = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
  const zalo = new Zalo({ selfListen: false, checkUpdate: false });
  console.log("Đang đăng nhập vào Zalo bằng session đã lưu...");
  try {
    const api = await zalo.login(creds);
    console.log(">>> ĐĂNG NHẬP ZALO THÀNH CÔNG! <<<");
    console.log("Đang tải danh sách toàn bộ các nhóm Zalo của bạn...\n");
    const res = await api.getAllGroups();
    const map = res?.gridInfoMap || {};
    const keys = Object.keys(map);
    console.log(`====================================================`);
    console.log(`TÌM THẤY TỔNG CỘNG: ${keys.length} NHÓM TRÊN ZALO`);
    console.log(`====================================================`);
    keys.forEach((id, index) => {
      console.log(`[${index + 1}] ID: ${id} | Tên nhóm: "${map[id].name}"`);
    });
  } catch (err) {
    console.error("LỖI ĐĂNG NHẬP ZALO:", err.message);
  }
}

check().catch(console.error);
