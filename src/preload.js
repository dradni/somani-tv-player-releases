const { contextBridge, ipcRenderer } = require("electron");

// Expose privileged controls only in the local, top-level setup document.
if (process.isMainFrame && location.protocol === "file:" && location.pathname.endsWith("/setup.html")) {
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
}
