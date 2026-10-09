const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage } = require("electron");
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
try {
  fs.mkdirSync(userDataPath, { recursive: true });
  for (const f of ["config.json", ".zalo-session.json", "zalo-mapping.json", "qr.png"]) {
    const from = path.join(legacyUserData, f);
    const to = path.join(userDataPath, f);
    if (!fs.existsSync(to) && fs.existsSync(from)) fs.copyFileSync(from, to);
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

function pushLog(line, level = "info") {
  win?.webContents.send("log", { line: String(line).replace(/\r/g, ""), level, ts: Date.now() });
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: false }).show();
}

function rebuildTray() {
  if (!tray) return;
  tray.setImage(trayIcon(botOnline));
  const cfg = loadConfig();
  const menu = Menu.buildFromTemplate([
    { label: `Zalo Bot — ${cfg.botName} (${botOnline ? "Online" : "Offline"})`, enabled: false },
    { type: "separator" },
    { label: "Mở giao diện", click: () => win?.show() },
    botOnline
      ? { label: "Tắt Bot", click: () => stopBot() }
      : { label: "Bật Bot", click: () => startBot() },
    { type: "separator" },
    {
      label: "Khởi động cùng Windows",
      type: "checkbox",
      checked: !!cfg.startWithWindows,
      click: (item) => {
        cfg.startWithWindows = item.checked;
        saveConfig(cfg);
        app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath });
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
  if (online) win?.show();
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
    if (/Thành công/.test(line)) {
      win?.webContents.send("qr", null);
      notify("Zalo Bot", `Đăng nhập thành công — Bot "${loadConfig().botName}" đang chạy`);
    } else if (/Chờ quét mã QR|Mở file .*qr\.png/.test(line)) {
      win?.webContents.send("showQr");
    } else if (/Session hết hạn/.test(line)) {
      notify("Zalo Bot", "Session hết hạn — cần quét lại mã QR");
    } else if (/Mất kết nối/.test(line)) {
      notify("Zalo Bot", "Mất kết nối Zalo — đang thử lại...");
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
    if (!quitting) notify("Zalo Bot", "Bot đã ngắt kết nối / dừng chạy");
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
    backgroundColor: "#0f172a",
    autoHideMenuBar: true,
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
  app.setLoginItemSettings({ openAtLogin: !!cfg.startWithWindows, path: process.execPath });
  rebuildTray();
  return cfg;
});
ipcMain.on("bot:start", () => startBot());
ipcMain.on("bot:stop", () => stopBot());
ipcMain.handle("bot:status", () => ({ online: !!botProc, botName: loadConfig().botName }));
ipcMain.handle("bot:sessionExists", () =>
  fs.existsSync(path.join(app.getPath("userData"), ".zalo-session.json"))
);

app.whenReady().then(() => {
  const cfg = loadConfig();
  app.setLoginItemSettings({ openAtLogin: !!cfg.startWithWindows, path: process.execPath });
  createWindow();
  win.show();
  win.focus();
  tray = new Tray(trayIcon(false));
  tray.setToolTip(`Zalo Bot Desktop — ${cfg.botName}`);
  rebuildTray();
  tray.on("click", () => {
    if (!win) return;
    if (win.isVisible()) win.hide();
    else win.show();
  });
  if (cfg.autoStartBot) setTimeout(startBot, 1500);
});

app.on("window-all-closed", () => {
  // Windows: giữ app sống trong tray
  if (process.platform !== "darwin" && !quitting) return;
});

app.on("before-quit", () => {
  quitting = true;
  stopBot();
});
