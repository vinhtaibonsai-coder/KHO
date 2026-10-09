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
  api.onLog((entry) => {
    const div = document.createElement("div");
    div.className = "lv-" + (entry.level || "info");
    const t = new Date(entry.ts).toLocaleTimeString("vi-VN");
    div.textContent = `[${t}] ${entry.line}`;
    logView.appendChild(div);
    while (logView.childNodes.length > 800) logView.removeChild(logView.firstChild);
    logView.scrollTop = logView.scrollHeight;
    const uid = entry.line.match(/uid\s+(\d+)/i);
    if (uid) $("mUid").textContent = uid[1];
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
    $("cWinBoot").checked = !!cfg.startWithWindows;
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
      startWithWindows: $("cWinBoot").checked,
    });
    $("mShards").textContent = cfg.warehouses;
    $("saveHint").textContent = "Đã lưu! Bật/Tắt lại bot để áp dụng.";
    setTimeout(() => { $("saveHint").textContent = ""; }, 3000);
  });
  loadConfig();
