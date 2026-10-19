import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

// 1. Đọc và tăng phiên bản trong src/lib/version.ts
const versionFilePath = path.join(process.cwd(), "src", "lib", "version.ts");
let versionFileContent = fs.readFileSync(versionFilePath, "utf8");

const match = versionFileContent.match(/export const APP_VERSION = ["'](\d+)\.(\d+)\.(\d+)["']/);
if (!match) {
  console.error("❌ Không tìm thấy định dạng APP_VERSION hợp lệ trong src/lib/version.ts");
  process.exit(1);
}

const major = parseInt(match[1], 10);
const minor = parseInt(match[2], 10);
const patch = parseInt(match[3], 10) + 1;
const newVersion = `${major}.${minor}.${patch}`;

// Lấy ngày giờ hiện tại theo giờ Việt Nam
const now = new Date();
const buildTimeStr = now.toLocaleString("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const newContent = `// Tự động cập nhật bởi npm run release
export const APP_VERSION = "${newVersion}";
export const APP_BUILD_TIME = "${buildTimeStr}";
`;

fs.writeFileSync(versionFilePath, newContent, "utf8");
console.log(`🚀 [1/3] Đã nâng phiên bản lên v${newVersion} (${buildTimeStr})`);

// 2. Chạy build kiểm tra chất lượng code
console.log("🔨 [2/3] Đang kiểm tra build Next.js...");
try {
  execSync("npm run build", { stdio: "inherit" });
  console.log("✅ Build thành công!");
} catch (err) {
  console.error("❌ Build thất bại! Hủy commit & push.");
  process.exit(1);
}

// 3. Tự động Git commit & push
const commitMsg = process.argv.slice(2).join(" ") || `Cập nhật hệ thống v${newVersion}`;
console.log(`📦 [3/3] Đang đẩy lên GitHub: "${commitMsg}"...`);

try {
  execSync("git add .", { stdio: "inherit" });
  execSync(`git commit -m "release: v${newVersion} - ${commitMsg} (${buildTimeStr})"`, { stdio: "inherit" });
  execSync("git push", { stdio: "inherit" });
  console.log(`🎉 HOÀN TẤT! Đã phát hành v${newVersion} và đồng bộ GitHub thành công!`);
} catch (gitErr) {
  console.error("❌ Lỗi khi commit/push:", gitErr.message);
  process.exit(1);
}
