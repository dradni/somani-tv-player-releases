const { contextBridge, ipcRenderer } = require("electron");

// The setup screen (setup.html) and, because this preload applies window-wide,
// the embedded web app, get exactly this small API surface. It exposes no
// secrets: the device token never crosses this bridge.
contextBridge.exposeInMainWorld("somaniPlayer", {
  getState: () => ipcRenderer.invoke("player:get-state"),
  saveUrl: (url) => ipcRenderer.invoke("player:save-url", url),
  listScreens: (key) => ipcRenderer.invoke("activation:list", key),
  requestApproval: (payload) => ipcRenderer.invoke("activation:request", payload),
  pollApproval: (payload) => ipcRenderer.invoke("activation:poll", payload),
  unpair: () => ipcRenderer.invoke("player:unpair"),
  openPairPage: () => ipcRenderer.invoke("player:open-pair-page"),
  showSetup: () => ipcRenderer.invoke("player:show-setup"),
  reload: () => ipcRenderer.invoke("player:reload"),
});
