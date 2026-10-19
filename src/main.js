
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const CONFIG_PATH = path.join(app.getPath("userData"), "player-config.json");
const DEFAULT_URL = process.env.SOMANI_TV_URL || "";

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return { appUrl: DEFAULT_URL };
  }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    autoHideMenuBar: true,
    backgroundColor: "#111827",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const config = readConfig();

  if (config.appUrl && /^https:\/\/.+/i.test(config.appUrl)) {
    win.loadURL(config.appUrl.replace(/\/+$/, "") + "/pair");
  } else {
    win.loadFile(path.join(__dirname, "setup.html"));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => { win = null; });
}

ipcMain.handle("player:get-config", () => readConfig());

ipcMain.handle("player:save-url", async (_event, rawUrl) => {
  if (typeof rawUrl !== "string") throw new Error("Enter your Somani TV app URL.");
  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== "https:") throw new Error("The app URL must use HTTPS.");

  const config = { appUrl: parsed.origin };
  writeConfig(config);

  if (win) await win.loadURL(config.appUrl + "/pair");
  return { ok: true };
});

ipcMain.handle("player:reload", () => {
  if (win) win.webContents.reload();
  return { ok: true };
});

app.whenReady().then(() => {
  app.setAppUserModelId("uk.co.flexaconsulting.somanitv.player");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
