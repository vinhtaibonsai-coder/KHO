const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zaloBot", {
  onLog: (cb) => ipcRenderer.on("log", (_e, entry) => cb(entry)),
  onQr: (cb) => ipcRenderer.on("qr", (_e, dataUrl) => cb(dataUrl)),
  onShowQr: (cb) => ipcRenderer.on("showQr", () => cb()),
  onStatus: (cb) => ipcRenderer.on("status", (_e, status) => cb(status)),
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (partial) => ipcRenderer.invoke("config:set", partial),
  start: () => ipcRenderer.send("bot:start"),
  stop: () => ipcRenderer.send("bot:stop"),
  botStatus: () => ipcRenderer.invoke("bot:status"),
  sessionExists: () => ipcRenderer.invoke("bot:sessionExists"),
});
