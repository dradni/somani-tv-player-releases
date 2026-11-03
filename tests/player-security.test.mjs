import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const preload = fs.readFileSync(new URL("../src/preload.js", import.meta.url), "utf8");
const setup = "file:///app/src/setup.html";
const origin = "https://signage.example";
const tokenKey = "somani_tv_device_token";

async function start({ config = { appUrl: origin }, token = "", provision, fetch } = {}) {
  const files = new Map([["/profile/player-config.json", JSON.stringify(config)]]);
  if (token) files.set("/profile/device-token.bin", Buffer.from(token));
  if (provision !== undefined) files.set("/profile/installer-provision.json", provision);
  const calls = new Map();
  const storage = new Map();
  const cleared = [];
  let window;
  let redirectBeforeScript;
  let injections = 0;
  let reloads = 0;
  const app = Object.assign(new EventEmitter(), {
    getVersion: () => "1.3.0", getPath: () => "/profile",
    whenReady: () => Promise.resolve(), setAppUserModelId() {}, quit() {},
  });
  const memoryFs = {
    readFileSync(name) {
      if (!files.has(name)) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return files.get(name);
    },
    mkdirSync() {},
    writeFileSync(name, value) { files.set(name, value); },
    rmSync(name) { files.delete(name); },
    unlinkSync(name) { files.delete(name); },
  };
  class BrowserWindow extends EventEmitter {
    constructor() {
      super();
      window = this;
      this.webContents = Object.assign(new EventEmitter(), {
        getURL: () => this.webContents.mainFrame.url,
        isDestroyed: () => false,
        mainFrame: {
          url: "about:blank",
          executeJavaScript: async (script) => {
            injections += 1;
            if (redirectBeforeScript) this.webContents.mainFrame.url = redirectBeforeScript;
            const location = new URL(this.webContents.mainFrame.url);
            return vm.runInNewContext(script, {
              location,
              localStorage: {
                getItem: (key) => storage.get(key) ?? null,
                setItem: (key, value) => storage.set(key, value),
              },
            });
          },
        },
        setWindowOpenHandler() {},
        reload() { reloads += 1; },
        session: {
          clearStorageData: async (options) => {
            cleared.push(options.origin);
            storage.clear();
          },
        },
      });
    }
    maximize() {}
    setFullScreen() {}
    loadURL(url) { this.webContents.mainFrame.url = url; }
    loadFile() { this.webContents.mainFrame.url = setup; }
  }
  const electron = {
    app, BrowserWindow,
    ipcMain: { handle: (name, fn) => calls.set(name, fn) },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => value.toString(),
    },
  };
  vm.runInNewContext(main, {
    __dirname: "/app/src", URL, AbortSignal, process,
    fetch: fetch ?? (async () => { throw new Error("Unexpected network call"); }),
    require: (name) => ({
      electron, "node:fs": memoryFs, "node:path": path.posix,
      "node:os": { hostname: () => "fixture-player" },
      "node:url": { pathToFileURL: (value) => new URL("file://" + value) },
    })[name],
  });
  await Promise.resolve();
  const contents = window.webContents;
  return {
    calls, files, storage, cleared, contents,
    url: (url) => { contents.mainFrame.url = url; },
    redirectBeforeScript: (url) => { redirectBeforeScript = url; },
    inject: () => contents.listeners("dom-ready")[0](),
    call: (name, ...args) => calls.get(name)({ sender: contents, senderFrame: contents.mainFrame }, ...args),
    injections: () => injections,
    reloads: () => reloads,
  };
}

test("remote pages and subframes cannot use any privileged setup handler", async () => {
  const h = await start({ token: "fixture-token" });
  for (const handler of h.calls.values()) {
    assert.throws(() => handler({ sender: h.contents, senderFrame: h.contents.mainFrame }), /only available/);
    assert.throws(() => handler({ sender: h.contents, senderFrame: { url: setup } }), /only available/);
  }
  h.url(setup);
  assert.equal(h.call("player:get-state").paired, true);
  assert.throws(() => h.calls.get("player:get-state")({ sender: {}, senderFrame: h.contents.mainFrame }), /only available/);
});

test("preload exposes setup bridge only in top-level local setup", () => {
  for (const [url, isMainFrame, exposed] of [[setup, true, true], [setup, false, false], [origin + "/setup.html", true, false]]) {
    const calls = [];
    vm.runInNewContext(preload, {
      location: new URL(url), process: { isMainFrame },
      require: () => ({ contextBridge: { exposeInMainWorld: (key) => calls.push(key) }, ipcRenderer: {} }),
    });
    assert.equal(calls.includes("somaniPlayer"), exposed);
  }
});

test("token is injected only at the exact configured playback route", async () => {
  const h = await start({ token: "fixture-token" });
  for (const url of [setup, origin + "/pair", origin + ".evil.example/play", origin + "/play-other"]) {
    h.url(url);
    await h.inject();
  }
  assert.equal(h.injections(), 0);
  h.url(origin + "/play");
  await h.inject();
  await h.inject();
  assert.equal(h.storage.get(tokenKey), "fixture-token");
  assert.equal(h.reloads(), 1);
  assert.equal(h.injections(), 1);
});

test("a navigation racing the injection does not copy the token", async () => {
  const h = await start({ token: "fixture-token" });
  h.redirectBeforeScript("https://other.example/play");
  await h.inject();
  assert.equal(h.storage.has(tokenKey), false);
  assert.equal(h.reloads(), 0);
  h.redirectBeforeScript(undefined);
  h.url(origin + "/play");
  await h.inject();
  assert.equal(h.storage.get(tokenKey), "fixture-token");
});

test("startup accepts fresh provision without persisting the key", async () => {
  const h = await start({ config: {}, provision: JSON.stringify({ app_url: origin, key: "fixture-key" }) });
  assert.equal(h.files.has("/profile/installer-provision.json"), false);
  assert.equal(h.call("player:get-state").installer_key, "fixture-key");
  assert.deepEqual(JSON.parse(h.files.get("/profile/player-config.json")), { appUrl: origin });
});

test("an upgrade preserves a paired origin and scrubs a legacy plaintext key", async () => {
  const h = await start({
    token: "fixture-token", config: { appUrl: origin, installer_key: "legacy" },
    provision: JSON.stringify({ app_url: "https://other.example", key: "new-key" }),
  });
  assert.equal(h.contents.getURL(), origin + "/play");
  assert.deepEqual(JSON.parse(h.files.get("/profile/player-config.json")), { appUrl: origin });
  assert.equal(h.files.has("/profile/installer-provision.json"), false);
  assert.equal(h.files.get("/profile/device-token.bin").toString(), "fixture-token");
});

test("local unpair clears the native token and origin storage", async () => {
  const h = await start({ token: "fixture-token" });
  await h.inject();
  h.url(setup);
  await h.call("player:unpair");
  assert.equal(h.files.has("/profile/device-token.bin"), false);
  assert.equal(h.storage.has(tokenKey), false);
  assert.deepEqual(h.cleared, [origin]);
  assert.equal(h.contents.getURL(), setup);
});

test("switching apps rejects a late approval response from the previous origin", async () => {
  let resolve;
  const h = await start({ fetch: (url, options) => {
    assert.equal(url, origin + "/functions/pairingStatus");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return new Promise((done) => { resolve = done; });
  } });
  const poll = h.call("activation:poll", { requestId: "request", claimSecret: "claim" });
  await h.call("player:save-url", "https://other.example");
  resolve({ ok: true, json: async () => ({ status: "paired", device_token: "stale-token" }) });
  await assert.rejects(poll, /setup changed/);
  assert.equal(h.files.has("/profile/device-token.bin"), false);
});

test("navigation and redirects use the current origin after reconfiguration", async () => {
  const h = await start();
  await h.call("player:save-url", "https://next.example/path/");
  for (const type of ["will-navigate", "will-redirect"]) {
    for (const [url, denied] of [["https://next.example/play", false], [origin + "/play", true], ["https://next.example.evil/play", true]]) {
      let blocked = false;
      h.contents.emit(type, { url, isMainFrame: true, preventDefault() { blocked = true; } });
      assert.equal(blocked, denied);
    }
  }
});

test("valid local approval persists token and injects on first playback", async () => {
  const h = await start({ fetch: async () => ({
    ok: true, json: async () => ({ status: "paired", device_token: "fresh-token", screen_name: "Reception" }),
  }) });
  const result = await h.call("activation:poll", { requestId: "request", claimSecret: "claim" });
  assert.equal(result.status, "paired");
  assert.equal(result.device_token, undefined);
  assert.equal(h.files.get("/profile/device-token.bin").toString(), "fresh-token");
  assert.equal(h.contents.getURL(), origin + "/play");
  await h.inject();
  assert.equal(h.storage.get(tokenKey), "fresh-token");
});

test("expired activation is reported without creating a pairing", async () => {
  const h = await start({ fetch: async () => ({
    ok: false, status: 402, json: async () => ({ error: "licence_expired" }),
  }) });
  await assert.rejects(h.call("activation:list", "fixture-key"), /subscription has ended/);
  assert.equal(h.files.has("/profile/device-token.bin"), false);
  assert.equal(h.contents.getURL(), setup);
});

test("an approval response cannot pair after the setup renderer navigates away", async () => {
  let resolve;
  const h = await start({ fetch: () => new Promise((done) => { resolve = done; }) });
  const pending = h.call("activation:poll", { requestId: "request", claimSecret: "claim" });
  h.url(origin + "/pair");
  resolve({ ok: true, json: async () => ({ status: "paired", device_token: "late-token" }) });
  await assert.rejects(pending, /Return to setup/);
  assert.equal(h.files.has("/profile/device-token.bin"), false);
});
