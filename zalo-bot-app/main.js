const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

let win = null;
let tray = null;
let botProc = null;
let botOnline = false;
let qrTimer = null;
let lastQrMtime = 0;
let quitting = false;

// Fix err.log: "Unable to move the cache: Access is denied (0x5)" / "Gpu Cache Creation failed: -2"
// Tắt GPU disk cache + hardware acceleration trước whenReady để app nhẹ, không crash GPU.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-gpu-process-crash-limit");

// UserData riêng, cố định theo tên app để nhiều instance / nhiều bản không đụng nhau.
const legacyUserData = app.getPath("userData");
const userDataPath = path.join(app.getPath("appData"), "zalo-bot-desktop");
app.setPath("userData", userDataPath);

// Thư mục data nội bộ cạnh file thực thi (chế độ di động / sao lưu khi đổi máy)
const appDir = app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, "..");
const portableDataDir = path.join(appDir, "data");

// Tìm kiếm thư mục Google Drive for Desktop trên máy tính
function findGoogleDriveBackupDir() {
  const letters = ["G", "H", "I", "J", "K", "D", "E", "F"];
  for (const l of letters) {
    const candidate = `${l}:\\My Drive`;
    if (fs.existsSync(candidate)) return path.join(candidate, "ZaloBot_Backup");
  }
  const home = os.homedir();
  const userCandidates = [
    path.join(home, "Google Drive", "My Drive"),
    path.join(home, "Google Drive"),
    path.join(home, "GoogleDrive", "My Drive"),
  ];
  for (const c of userCandidates) {
    if (fs.existsSync(c)) return path.join(c, "ZaloBot_Backup");
  }
  return null;
}

function syncToPortable() {
  try {
    fs.mkdirSync(portableDataDir, { recursive: true });
    for (const f of ["config.json", ".zalo-session.json", "zalo-mapping.json"]) {
      const src = path.join(userDataPath, f);
      const dst = path.join(portableDataDir, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
      }
    }
  } catch {}
}

// Đồng bộ 2 nơi: thư mục data nội bộ + Google Drive Cloud
function syncToCloudAndPortable() {
  syncToPortable();
  const cfg = loadConfig();
  if (cfg.gdriveSync === false) return;
  const gdriveDir = findGoogleDriveBackupDir();
  if (!gdriveDir) return;
  try {
    fs.mkdirSync(gdriveDir, { recursive: true });
    for (const f of ["config.json", ".zalo-session.json", "zalo-mapping.json"]) {
      const src = path.join(userDataPath, f);
      const dst = path.join(gdriveDir, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
      }
    }
  } catch (err) {
    console.error("Lỗi đồng bộ Google Drive:", err);
  }
}

// Tự động khôi phục từ Google Drive (khi cài lại Win hoặc mở bot trên máy mới)
function restoreFromGoogleDrive() {
  const gdriveDir = findGoogleDriveBackupDir();
  if (!gdriveDir || !fs.existsSync(gdriveDir)) return false;
  let restored = false;
  try {
    for (const f of ["config.json", ".zalo-session.json", "zalo-mapping.json"]) {
      const src = path.join(gdriveDir, f);
      const dst = path.join(userDataPath, f);
      if (fs.existsSync(src)) {
        let shouldCopy = false;
        if (!fs.existsSync(dst)) {
          shouldCopy = true;
        } else {
          try {
            const srcStat = fs.statSync(src);
            const dstStat = fs.statSync(dst);
            if (srcStat.mtimeMs > dstStat.mtimeMs) shouldCopy = true;
          } catch {
            shouldCopy = true;
          }
        }
        if (shouldCopy) {
          fs.copyFileSync(src, dst);
          restored = true;
        }
      }
    }
  } catch (err) {
    console.error("Lỗi nạp từ Google Drive:", err);
  }
  if (restored) syncToPortable();
  return restored;
}

try {
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.mkdirSync(portableDataDir, { recursive: true });

  // 1. Tự động khôi phục từ Google Drive nếu có (cho trường hợp vừa cài lại máy)
  restoreFromGoogleDrive();

  // 2. Dự phòng nạp từ thư mục data nội bộ hoặc legacy
  for (const f of ["config.json", ".zalo-session.json", "zalo-mapping.json", "qr.png"]) {
    const to = path.join(userDataPath, f);
    if (!fs.existsSync(to)) {
      const pFile = path.join(portableDataDir, f);
      if (fs.existsSync(pFile)) {
        fs.copyFileSync(pFile, to);
      } else {
        const from = path.join(legacyUserData, f);
        if (fs.existsSync(from)) fs.copyFileSync(from, to);
      }
    }
  }
} catch {}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

const DEFAULTS = {
  webhookUrl: "http://localhost:3000/api/webhook/zalo",
  webhookSecret: "",
  botName: os.hostname() || "May 1",
  warehouses: "all",
  startWithWindows: false,
  autoStartBot: false,
  startMinimized: true,
  gdriveSync: true,
  enableCatchUp: false,
};

const configPath = () => path.join(app.getPath("userData"), "config.json");

function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(configPath(), "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
  syncToCloudAndPortable();
}

function botDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "zalo-bot")
    : path.join(__dirname, "..", "zalo-bot");
}

// Icon khay 16x16 tròn: Xanh lá = online, Đỏ = offline (vẽ bitmap, không cần file ảnh)
function trayIcon(online) {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const [r, g, b] = online ? [34, 197, 94] : [239, 68, 68];
  const cx = 7.5;
  const cy = 7.5;
  const rad = 6.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
      buf[i] = b;
      buf[i + 1] = g;
      buf[i + 2] = r;
      buf[i + 3] = inside ? 255 : 0;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

const logBuffer = [];
function pushLog(line, level = "info") {
  const entry = { line: String(line).replace(/\r/g, ""), level, ts: Date.now() };
  logBuffer.push(entry);
  if (logBuffer.length > 250) logBuffer.shift();
  win?.webContents.send("log", entry);
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: false }).show();
}

// Windows chỉ hiện Notification khi app có AppUserModelID (bản portable/chạy dev lấy executable làm ID)
app.setAppUserModelId(app.isPackaged ? "com.warehouse.zalobotdesktop" : process.execPath);

let lastWindowAlertAt = 0;

// Báo lỗi nghiêm trọng (session hết hạn / mất kết nối): hiện thông báo Windows + tự bật cửa sổ app
function alertWindow(title, body) {
  notify(title, body);
  if (!win) return;
  // Không giật cửa sổ lặp lại khi bot chập chờn (tối thiểu 15 giây giữa 2 lần)
  if (Date.now() - lastWindowAlertAt < 15000) return;
  lastWindowAlertAt = Date.now();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function rebuildTray() {
  if (!tray) return;
  tray.setImage(trayIcon(botOnline));
  const cfg = loadConfig();
  const menu = Menu.buildFromTemplate([
    { label: `Zalo Bot — ${cfg.botName} (${botOnline ? "Online" : "Offline"})`, enabled: false },
    { type: "separator" },
    {
      label: "Mở giao diện",
      click: () => {
        if (!win) return;
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      },
    },
    { label: "Thu nhỏ xuống khay", click: () => win?.hide() },
    botOnline
      ? { label: "Tắt Bot", click: () => stopBot() }
      : { label: "Bật Bot", click: () => startBot() },
    { type: "separator" },
    {
      label: "Tự động hạ xuống khay khi mở app",
      type: "checkbox",
      checked: !!cfg.startMinimized,
      click: (item) => {
        cfg.startMinimized = item.checked;
        saveConfig(cfg);
        rebuildTray();
        win?.webContents.send("configUpdated", cfg);
      },
    },
    {
      label: "Khởi động cùng Windows",
      type: "checkbox",
      checked: !!cfg.startWithWindows,
      click: (item) => {
        cfg.startWithWindows = item.checked;
        saveConfig(cfg);
        app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath, args: ["--hidden"] });
        rebuildTray();
        win?.webContents.send("configUpdated", cfg);
      },
    },
    { type: "separator" },
    { label: "Thoát", click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function setStatus(online) {
  botOnline = online;
  rebuildTray();
  win?.webContents.send("status", { online, botName: loadConfig().botName });
}

function startQrWatch() {
  stopQrWatch();
  const qrPath = path.join(app.getPath("userData"), "qr.png");
  qrTimer = setInterval(() => {
    try {
      const st = fs.statSync(qrPath);
      if (st.mtimeMs !== lastQrMtime) {
        lastQrMtime = st.mtimeMs;
        const b64 = fs.readFileSync(qrPath).toString("base64");
        win?.webContents.send("qr", `data:image/png;base64,${b64}`);
      }
    } catch {
      /* chưa có qr.png */
    }
  }, 1500);
}

function stopQrWatch() {
  if (qrTimer) clearInterval(qrTimer);
  qrTimer = null;
}

function handleBotOutput(text) {
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    pushLog(line);
    if (/thành công|đã kết nối zalo thành công/i.test(line)) {
      setStatus(true);
      win?.webContents.send("qr", null);
      notify("Zalo Bot", `Đăng nhập thành công — Bot "${loadConfig().botName}" đang chạy`);
      syncToCloudAndPortable();
      const cfg = loadConfig();
      if (cfg.startMinimized && win?.isVisible()) {
        setTimeout(() => {
          if (!quitting && win?.isVisible()) win.hide();
        }, 1200);
      }
    } else if (/Chờ quét mã QR|Mở file .*qr\.png/.test(line)) {
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
      win?.webContents.send("showQr");
    } else if (/Session hết hạn/.test(line)) {
      setStatus(false);
      alertWindow("Zalo Bot — Session hết hạn", "Phiên Zalo đã hết hạn — cần quét lại mã QR.\nCửa sổ app đã được mở, nhấn \"Bật Bot\" và quét QR để tiếp tục.");
    } else if (/Mất kết nối|\[ws\] Mất kết nối|MẤT KẾT NỐI/.test(line)) {
      // Khi mất kết nối mạng tạm thời: cập nhật trạng thái, không bật bung cửa sổ làm gián đoạn người dùng
      setStatus(false);
    }
  }
}

function startBot() {
  if (botProc) return;
  const cfg = loadConfig();
  const dir = botDir();
  const entry = path.join(dir, "src", "index.js");
  if (!fs.existsSync(entry)) {
    pushLog(`Không tìm thấy bot worker: ${entry}`, "error");
    notify("Lỗi", `Không tìm thấy bot worker:\n${entry}`);
    return;
  }
  const userData = app.getPath("userData");
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    WEBHOOK_URL: cfg.webhookUrl,
    BOT_NAME: cfg.botName,
    BOT_WAREHOUSES: cfg.warehouses,
    SESSION_FILE: path.join(userData, ".zalo-session.json"),
    MAPPING_FILE: path.join(userData, "zalo-mapping.json"),
    QR_FILE: path.join(userData, "qr.png"),
    ENABLE_CATCH_UP: cfg.enableCatchUp ? "1" : "0",
  };
  if (cfg.webhookSecret) env.ZALO_WEBHOOK_SECRET = cfg.webhookSecret;

  pushLog(`Đang khởi động bot "${cfg.botName}" (phân vùng kho: ${cfg.warehouses})...`);
  botProc = spawn(process.execPath, [entry], { cwd: dir, env, windowsHide: true });
  setStatus(true);
  startQrWatch();

  botProc.stdout.on("data", (d) => handleBotOutput(d.toString()));
  botProc.stderr.on("data", (d) => handleBotOutput(d.toString()));
  botProc.on("error", (err) => {
    pushLog(`Lỗi khởi động bot: ${err.message}`, "error");
    botProc = null;
    setStatus(false);
  });
  botProc.on("exit", (code, signal) => {
    botProc = null;
    stopQrWatch();
    setStatus(false);
    pushLog(`Bot đã dừng (code=${code} signal=${signal || "-"})`, "warn");
    if (!quitting) alertWindow("Zalo Bot — Bot đã dừng", "Bot đã ngắt kết nối / dừng chạy.\nCửa sổ app đã được mở — nhấn \"Bật Bot\" để khởi động lại.");
  });
}

function stopBot() {
  if (!botProc) return;
  pushLog("Đang tắt bot...");
  try {
    botProc.kill();
  } catch {}
  botProc = null;
  stopQrWatch();
  setStatus(false);
  win?.webContents.send("qr", null);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    title: "Zalo Bot Desktop",
    backgroundColor: "#f8fafc",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  // Đóng cửa sổ (X) -> thu nhỏ xuống tray, không tắt app
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

// ---------- IPC ----------
ipcMain.handle("config:get", () => loadConfig());
ipcMain.handle("config:set", (_e, partial) => {
  const cfg = { ...loadConfig(), ...(partial || {}) };
  saveConfig(cfg);
  app.setLoginItemSettings({ openAtLogin: !!cfg.startWithWindows, path: process.execPath, args: ["--hidden"] });
  rebuildTray();
  return cfg;
});
ipcMain.on("bot:start", () => startBot());
ipcMain.on("bot:stop", () => stopBot());
ipcMain.handle("bot:status", () => ({ online: !!botProc && botOnline, botName: loadConfig().botName }));
ipcMain.handle("log:getRecent", () => logBuffer);
ipcMain.handle("bot:sessionExists", () =>
  fs.existsSync(path.join(app.getPath("userData"), ".zalo-session.json"))
);

// Sao lưu cấu hình ra file JSON tải về
ipcMain.handle("config:backup", async () => {
  const cfg = loadConfig();
  const sessionPath = path.join(app.getPath("userData"), ".zalo-session.json");
  const mappingPath = path.join(app.getPath("userData"), "zalo-mapping.json");
  const defaultName = `zalobot-backup-${cfg.botName || "config"}-${new Date().toISOString().slice(0, 10)}.json`;

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Lưu file sao lưu cấu hình Zalo Bot",
    defaultPath: defaultName,
    filters: [{ name: "Zalo Bot Backup (*.json)", extensions: ["json"] }],
  });

  if (canceled || !filePath) return { success: false, canceled: true };

  let sessionData = null;
  let mappingData = null;
  try {
    if (fs.existsSync(sessionPath)) sessionData = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
  } catch {}
  try {
    if (fs.existsSync(mappingPath)) mappingData = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
  } catch {}

  const backupData = {
    app: "zalo-bot-desktop",
    version: "1.0",
    exportedAt: new Date().toISOString(),
    config: cfg,
    session: sessionData,
    mapping: mappingData,
  };

  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), "utf8");
  syncToCloudAndPortable();
  return { success: true, filePath };
});

// Khôi phục cấu hình từ file JSON
ipcMain.handle("config:restore", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Chọn file sao lưu cấu hình Zalo Bot (*.json)",
    filters: [{ name: "Zalo Bot Backup (*.json)", extensions: ["json"] }],
    properties: ["openFile"],
  });

  if (canceled || !filePaths || filePaths.length === 0) return { success: false, canceled: true };

  try {
    const raw = fs.readFileSync(filePaths[0], "utf8");
    const data = JSON.parse(raw);
    if (!data || !data.config) throw new Error("File sao lưu không đúng định dạng!");

    saveConfig(data.config);

    const userData = app.getPath("userData");
    if (data.session) {
      const sessionPath = path.join(userData, ".zalo-session.json");
      fs.writeFileSync(sessionPath, typeof data.session === "string" ? data.session : JSON.stringify(data.session, null, 2), "utf8");
    }
    if (data.mapping) {
      const mappingPath = path.join(userData, "zalo-mapping.json");
      fs.writeFileSync(mappingPath, typeof data.mapping === "string" ? data.mapping : JSON.stringify(data.mapping, null, 2), "utf8");
    }

    syncToCloudAndPortable();
    rebuildTray();
    notify("Zalo Bot", "Đã khôi phục cấu hình và phiên làm việc thành công!");
    return { success: true, config: data.config };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Mở thư mục data cạnh file app để xem/copy nhanh sang máy khác
ipcMain.handle("config:openDataFolder", async () => {
  syncToCloudAndPortable();
  await shell.openPath(portableDataDir);
  return { success: true, path: portableDataDir };
});

// Kiểm tra trạng thái Google Drive
ipcMain.handle("gdrive:status", () => {
  const gDir = findGoogleDriveBackupDir();
  const cfg = loadConfig();
  return {
    available: !!gDir,
    path: gDir || "",
    enabled: cfg.gdriveSync !== false,
  };
});

// Nạp lại dữ liệu từ Google Drive thủ công
ipcMain.handle("gdrive:restore", async () => {
  const restored = restoreFromGoogleDrive();
  if (restored) {
    rebuildTray();
    notify("Zalo Bot", "Đã đồng bộ cấu hình và phiên Zalo từ Google Drive!");
    return { success: true, config: loadConfig() };
  }
  return { success: false, error: "Không tìm thấy file hợp lệ trên Google Drive" };
});

// Ép đẩy dữ liệu lên Google Drive ngay
ipcMain.handle("gdrive:syncNow", async () => {
  syncToCloudAndPortable();
  const gDir = findGoogleDriveBackupDir();
  return { success: !!gDir, path: gDir };
});

app.whenReady().then(() => {
  const cfg = loadConfig();
  const isStartupBoot =
    process.argv.includes("--hidden") ||
    process.argv.includes("--minimized") ||
    (app.getLoginItemSettings && app.getLoginItemSettings().wasOpenedAtLogin);
  const shouldStartHidden = !!cfg.startMinimized || isStartupBoot;

  app.setLoginItemSettings({
    openAtLogin: !!cfg.startWithWindows,
    path: process.execPath,
    args: ["--hidden"],
  });

  createWindow();

  tray = new Tray(trayIcon(false));
  tray.setToolTip(`Zalo Bot Desktop — ${cfg.botName}`);
  rebuildTray();
  tray.on("click", () => {
    if (!win) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  if (!shouldStartHidden) {
    win.show();
    win.focus();
  }

  if (cfg.autoStartBot) setTimeout(startBot, 1500);
});

app.on("window-all-closed", () => {
  // Windows: giữ app sống trong tray
  if (process.platform !== "darwin" && !quitting) return;
});

app.on("before-quit", () => {
  quitting = true;
  syncToCloudAndPortable();
  stopBot();
});
