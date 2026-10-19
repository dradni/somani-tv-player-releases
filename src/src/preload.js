
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("somaniPlayer", {
  getConfig: () => ipcRenderer.invoke("player:get-config"),
  saveUrl: (url) => ipcRenderer.invoke("player:save-url", url),
  reload: () => ipcRenderer.invoke("player:reload")
});
