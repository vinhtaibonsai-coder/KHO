  const api = window.zaloBot;
  let online = false;
  let showQrTab = false;

  const $ = (id) => document.getElementById(id);

  // ---- Tabs ----
  document.querySelectorAll("nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("nav button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      $("tab-" + btn.dataset.tab).classList.add("active");
    });
  });
  function gotoTab(name) {
    document.querySelector(`nav button[data-tab="${name}"]`)?.click();
  }

  // ---- Trạng thái ----
  function renderStatus(s) {
    online = !!s.online;
    $("statusBadge").className = "badge " + (online ? "on" : "off");
    $("statusText").textContent = online ? "Online" : "Offline";
    $("botLabel").textContent = s.botName || "";
    $("mBotName").textContent = s.botName || "—";
    $("mConn").textContent = online ? "Đang kết nối Zalo" : "Offline";
    $("btnStart").disabled = online;
    $("btnStop").disabled = !online;
  }
  api.onStatus(renderStatus);
  api.botStatus().then(renderStatus);

  // ---- QR ----
  api.onQr((dataUrl) => {
    if (dataUrl) {
      $("qrImg").src = dataUrl;
      $("qrImg").hidden = false;
      $("qrPlaceholder").hidden = true;
      if (showQrTab) gotoTab("qr");
    } else {
      $("qrImg").hidden = true;
      $("qrPlaceholder").hidden = false;
      $("qrPlaceholder").innerHTML = "Đăng nhập thành công — QR đã ẩn.<br/>Bot đang chạy, xem tab Log để theo dõi.";
    }
  });
  api.onShowQr(() => gotoTab("qr"));
  $("btnShowQr").addEventListener("click", () => gotoTab("qr"));

  // ---- Log ----
  const logView = $("logView");
  function appendLog(entry) {
    if (!entry || !entry.line) return;
    const div = document.createElement("div");
    div.className = "lv-" + (entry.level || "info");
    const t = new Date(entry.ts || Date.now()).toLocaleTimeString("vi-VN");
    div.textContent = `[${t}] ${entry.line}`;
    logView.appendChild(div);
    while (logView.childNodes.length > 800) logView.removeChild(logView.firstChild);
    logView.scrollTop = logView.scrollHeight;
    const uid = entry.line.match(/uid\s+(\d+)/i);
    if (uid) $("mUid").textContent = uid[1];
  }
  api.onLog((entry) => appendLog(entry));
  api.getRecentLogs?.().then((logs) => {
    if (Array.isArray(logs)) {
      logs.forEach((entry) => appendLog(entry));
    }
  });
  $("btnClearLog").addEventListener("click", () => { logView.innerHTML = ""; });

  // ---- Quản lý ----
  $("btnStart").addEventListener("click", () => { showQrTab = true; api.start(); gotoTab("qr"); });
  $("btnStop").addEventListener("click", () => api.stop());

  // ---- Cấu hình ----
  async function loadConfig() {
    const cfg = await api.getConfig();
    $("cWebhook").value = cfg.webhookUrl || "";
    $("cSecret").value = cfg.webhookSecret || "";
    $("cName").value = cfg.botName || "";
    $("mShards").textContent = cfg.warehouses || "all";
    const known = ["all", "1-15", "16-30"];
    if (known.includes(cfg.warehouses)) {
      $("cShards").value = cfg.warehouses;
      $("customShardRow").hidden = true;
    } else {
      $("cShards").value = "custom";
      $("cShardsCustom").value = cfg.warehouses || "";
      $("customShardRow").hidden = false;
    }
    $("cAutoStart").checked = !!cfg.autoStartBot;
    if ($("cStartMinimized")) $("cStartMinimized").checked = !!cfg.startMinimized;
    $("cWinBoot").checked = !!cfg.startWithWindows;
    if ($("cCatchUp")) $("cCatchUp").checked = !!cfg.enableCatchUp;
    if ($("cGdriveSync")) $("cGdriveSync").checked = cfg.gdriveSync !== false;

    // Cập nhật trạng thái Google Drive
    try {
      const gd = await api.getGdriveStatus();
      if (gd && gd.available) {
        $("gdriveTitle").textContent = "Google Drive: Đã kết nối tự động";
        $("gdrivePath").textContent = gd.path;
        $("gdriveBox").style.background = "#ecfdf5";
        $("gdriveBox").style.borderColor = "#a7f3d0";
      } else {
        $("gdriveTitle").textContent = "Google Drive: Chưa phát hiện ổ đĩa Drive";
        $("gdrivePath").textContent = "Cài Google Drive for Desktop để tự đồng bộ";
        $("gdriveBox").style.background = "#f8fafc";
        $("gdriveBox").style.borderColor = "#e2e8f0";
      }
    } catch {}
  }
  $("cShards").addEventListener("change", () => {
    $("customShardRow").hidden = $("cShards").value !== "custom";
  });
  $("btnSave").addEventListener("click", async () => {
    const warehouses = $("cShards").value === "custom" ? ($("cShardsCustom").value.trim() || "all") : $("cShards").value;
    const cfg = await api.setConfig({
      webhookUrl: $("cWebhook").value.trim(),
      webhookSecret: $("cSecret").value.trim(),
      botName: $("cName").value.trim() || "Bot",
      warehouses,
      autoStartBot: $("cAutoStart").checked,
      startMinimized: $("cStartMinimized") ? $("cStartMinimized").checked : true,
      startWithWindows: $("cWinBoot").checked,
      enableCatchUp: $("cCatchUp") ? $("cCatchUp").checked : false,
      gdriveSync: $("cGdriveSync") ? $("cGdriveSync").checked : true,
    });
    $("mShards").textContent = cfg.warehouses;
    $("saveHint").textContent = "Đã lưu và đồng bộ lên Google Drive!";
    setTimeout(() => { $("saveHint").textContent = ""; }, 3000);
  });

  $("btnBackup")?.addEventListener("click", async () => {
    $("backupHint").textContent = "Đang chuẩn bị file sao lưu...";
    const res = await api.backupConfig();
    if (res && res.success) {
      $("backupHint").textContent = "Đã xuất file sao lưu thành công!";
    } else if (res && !res.canceled) {
      $("backupHint").textContent = "Lỗi khi sao lưu: " + (res.error || "Không rõ");
    } else {
      $("backupHint").textContent = "";
    }
    setTimeout(() => { $("backupHint").textContent = ""; }, 4000);
  });

  $("btnRestore")?.addEventListener("click", async () => {
    const res = await api.restoreConfig();
    if (res && res.success) {
      await loadConfig();
      $("backupHint").textContent = "Đã khôi phục cấu hình và phiên Zalo thành công!";
    } else if (res && !res.canceled) {
      $("backupHint").textContent = "Lỗi khôi phục: " + (res.error || "Không rõ");
    } else {
      $("backupHint").textContent = "";
    }
    setTimeout(() => { $("backupHint").textContent = ""; }, 4000);
  });

  $("btnOpenFolder")?.addEventListener("click", async () => {
    await api.openDataFolder();
  });

  $("btnGdriveRestore")?.addEventListener("click", async () => {
    $("backupHint").textContent = "Đang nạp lại từ Google Drive...";
    const res = await api.restoreGdrive();
    if (res && res.success) {
      await loadConfig();
      $("backupHint").textContent = "Đã đồng bộ lại từ Google Drive thành công!";
    } else {
      $("backupHint").textContent = res?.error || "Không thể đồng bộ từ Google Drive";
    }
    setTimeout(() => { $("backupHint").textContent = ""; }, 4000);
  });

  api.onConfigUpdated && api.onConfigUpdated(() => loadConfig());
  loadConfig();
