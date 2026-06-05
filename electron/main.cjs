// Electron main process.
// Responsibilities:
//   - Window lifecycle
//   - Secure API-key storage (Electron safeStorage)
//   - A single rate-limit-aware request scheduler shared by ALL endpoints
//   - A TTL JSON cache (stale-while-revalidate friendly)
//   - IPC surface consumed by the renderer (window.api.*)
//
// The ballchasing.com API key never leaves the main process.

const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// electron-updater is only meaningful in a packaged build; require lazily so dev runs fine.
let autoUpdater = null;
try { ({ autoUpdater } = require("electron-updater")); } catch { /* not installed in some dev setups */ }

// ---------------------------------------------------------------------------
// Auto-update: pulls the latest GitHub Release and replaces the installed app.
// ---------------------------------------------------------------------------
function setupAutoUpdate(win) {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (channel, payload) => { try { win.webContents.send(channel, payload); } catch {} };

  autoUpdater.on("checking-for-update", () => send("update:status", { state: "checking" }));
  autoUpdater.on("update-available", (info) => send("update:status", { state: "available", version: info && info.version }));
  autoUpdater.on("update-not-available", () => send("update:status", { state: "none" }));
  autoUpdater.on("download-progress", (p) => send("update:status", { state: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("error", (err) => send("update:status", { state: "error", message: String(err && err.message || err) }));
  autoUpdater.on("update-downloaded", async (info) => {
    send("update:status", { state: "ready", version: info && info.version });
    const res = await dialog.showMessageBox(win, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      title: "Update ready",
      message: `Ballchasing Desktop ${info && info.version} has been downloaded.`,
      detail: "Restart to apply the update. The app will replace itself automatically."
    });
    // isSilent=true -> no installer wizard; reuses the existing install location.
    // isForceRunAfter=true -> relaunch the app after updating.
    if (res.response === 0) { setImmediate(() => autoUpdater.quitAndInstall(true, true)); }
  });

  // initial check + re-check every 6 hours while running
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

const API_BASE = "https://ballchasing.com/api";

// ---------------------------------------------------------------------------
// Paths / persistence
// ---------------------------------------------------------------------------
let CONFIG_FILE = "";
let CACHE_FILE = "";

function initPaths() {
  const dir = app.getPath("userData");
  CONFIG_FILE = path.join(dir, "config.bin");
  CACHE_FILE = path.join(dir, "cache.json");
}

// ---------------------------------------------------------------------------
// Config: { loginKey, uploaderKey, identity:{steam_id,name}, isPrimaryUploader }
// stored as an encrypted JSON blob. `apiKey` is the ACTIVE data key used for all
// API calls (the uploader's key when the user isn't their own uploader); identity
// is always the logged-in user, used for player filtering + series naming.
// ---------------------------------------------------------------------------
let apiKey = null;          // active data key
let identity = null;        // { steam_id, name }
let config = {
  loginKey: null,
  uploaderKey: null,        // primary uploader's API key (optional)
  uploaderId: null,         // primary uploader's SteamID64 (for filtering w/o a key)
  uploaderName: null,
  identity: null,
  isPrimaryUploader: true,
  demosFolder: null         // saved Rocket League Demos folder
};

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return;
    const buf = fs.readFileSync(CONFIG_FILE);
    const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString("utf8");
    config = Object.assign(config, JSON.parse(text));
    identity = config.identity || null;
    apiKey = config.isPrimaryUploader ? config.loginKey : (config.uploaderKey || config.loginKey);
  } catch (e) { console.error("loadConfig failed", e); }
}

function saveConfig() {
  try {
    const text = JSON.stringify(config);
    const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, "utf8");
    fs.writeFileSync(CONFIG_FILE, data);
  } catch (e) { console.error("saveConfig failed", e); }
}

function clearConfig() {
  apiKey = null; identity = null;
  const demos = config.demosFolder; // keep the demos folder across sign-out
  config = { loginKey: null, uploaderKey: null, uploaderId: null, uploaderName: null, identity: null, isPrimaryUploader: true, demosFolder: demos };
  saveConfig();
}

// The Steam ID used for the "uploader" replay filter, given the current mode.
function uploaderFilter() {
  if (config.isPrimaryUploader) return "me";
  if (config.uploaderKey) return "me";          // data key IS the uploader's
  if (config.uploaderId) return String(config.uploaderId);
  return "me";
}

// Auto-detect the Rocket League Demos folder on Windows.
function autoDemosFolder() {
  try {
    const p = path.join(app.getPath("documents"), "My Games", "Rocket League", "TAGame", "Demos");
    return fs.existsSync(p) ? p : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// TTL cache
// ---------------------------------------------------------------------------
let cache = {};

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch { cache = {}; }
}

let cacheDirty = false;
function persistCacheSoon() {
  cacheDirty = true;
}
setInterval(() => {
  if (!cacheDirty) return;
  cacheDirty = false;
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); } catch {}
}, 2000);

function cacheGet(key, ttlMs) {
  const e = cache[key];
  if (!e) return null;
  if (ttlMs != null && Date.now() - e.ts > ttlMs) return { stale: true, data: e.data };
  return { stale: false, data: e.data };
}
function cacheSet(key, data) {
  cache[key] = { ts: Date.now(), data };
  persistCacheSoon();
}
function cacheInvalidatePrefix(prefix) {
  for (const k of Object.keys(cache)) if (k.startsWith(prefix)) delete cache[k];
  persistCacheSoon();
}

// ---------------------------------------------------------------------------
// Rate-limit-aware scheduler
// ---------------------------------------------------------------------------
const TIER_RPS = { "grand-champion": 16, gc: 16, champion: 8, diamond: 4, gold: 2 };
let tier = "regular";
let rps = 2;
let minGap = 1000 / rps;

function setTier(t) {
  tier = (t || "regular").toLowerCase();
  rps = TIER_RPS[tier] ?? 2;
  minGap = 1000 / rps;
}

const queue = [];
let inFlight = 0;
let lastDispatch = 0;
const MAX_CONCURRENT = 3;

function schedulerStatus() {
  return { tier, rps, queued: queue.length, inFlight };
}

function enqueue(job) {
  return new Promise((resolve, reject) => {
    queue.push({ job, resolve, reject, attempts: 0 });
    pump();
  });
}

function pump() {
  if (queue.length === 0) return;
  if (inFlight >= MAX_CONCURRENT) return;
  const now = Date.now();
  const wait = Math.max(0, lastDispatch + minGap - now);
  if (wait > 0) {
    setTimeout(pump, wait);
    return;
  }
  const item = queue.shift();
  lastDispatch = Date.now();
  inFlight++;
  item
    .job()
    .then((r) => { inFlight--; item.resolve(r); pump(); })
    .catch((err) => {
      inFlight--;
      // 429 -> exponential backoff re-queue
      if (err && err.status === 429 && item.attempts < 5) {
        item.attempts++;
        const backoff = Math.min(8000, 500 * 2 ** item.attempts);
        setTimeout(() => { queue.unshift(item); pump(); }, backoff);
      } else {
        item.reject(err);
      }
      pump();
    });
  // try to dispatch more (respecting gap on next tick)
  if (queue.length) setTimeout(pump, minGap);
}

// ---------------------------------------------------------------------------
// Low-level request helpers (run inside the scheduler)
// ---------------------------------------------------------------------------
function authHeaders(extra) {
  return Object.assign({ Authorization: apiKey || "" }, extra || {});
}

async function apiJson(method, pathAndQuery, body) {
  return enqueue(async () => {
    const res = await fetch(API_BASE + pathAndQuery, {
      method,
      headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 429) { const e = new Error("rate limited"); e.status = 429; throw e; }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    if (!res.ok) {
      const e = new Error((json && (json.error || json.detail)) || `HTTP ${res.status}`);
      e.status = res.status;
      e.body = json;
      throw e;
    }
    return json;
  });
}

function buildQuery(params) {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => x != null && x !== "" && sp.append(k, String(x)));
    else sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? "?" + s : "";
}

// ---------------------------------------------------------------------------
// IPC surface
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.handle("key:status", () => ({
    hasKey: !!apiKey,
    identity,
    isPrimaryUploader: config.isPrimaryUploader,
    hasUploaderKey: !!config.uploaderKey,
    uploaderId: config.uploaderId,
    uploaderName: config.uploaderName,
    uploaderFilter: uploaderFilter()
  }));

  // Sets the user's OWN login key. Establishes identity. Defaults to being the
  // primary uploader (use uploader:set afterwards to point data at someone else).
  ipcMain.handle("key:set", async (_e, key) => {
    const k = (key || "").trim();
    const prev = apiKey;
    apiKey = k;
    try {
      const ping = await apiJson("GET", "/");
      setTier(ping && ping.type);
      identity = { steam_id: ping && ping.steam_id, name: ping && ping.name };
      config.loginKey = k;
      config.identity = identity;
      config.isPrimaryUploader = true;
      config.uploaderKey = null;
      saveConfig();
      return { ok: true, ping, tier, rps, identity };
    } catch (err) {
      apiKey = prev;
      return { ok: false, error: err.message, status: err.status };
    }
  });

  // The user's 3 most-recent unique uploaders, from replays the user appears in.
  // Always queried with the user's OWN key, regardless of the active data key.
  ipcMain.handle("uploader:recent", async () => {
    const key = config.loginKey;
    if (!key || !identity) return { ok: false };
    const fetchList = (params) => enqueue(async () => {
      const res = await fetch(API_BASE + "/replays" + buildQuery(params), { headers: { Authorization: key } });
      if (res.status === 429) { const e = new Error("rate"); e.status = 429; throw e; }
      const t = await res.text(); try { return t ? JSON.parse(t) : null; } catch { return null; }
    });
    try {
      let data = null;
      if (identity.steam_id) data = await fetchList({ "player-id": "steam:" + identity.steam_id, count: 100, "sort-by": "upload-date", "sort-dir": "desc" });
      if ((!data || !data.list || !data.list.length) && identity.name) data = await fetchList({ "player-name": identity.name, count: 100, "sort-by": "upload-date", "sort-dir": "desc" });
      const seen = new Map();
      for (const r of (data && data.list) || []) {
        const u = r.uploader;
        if (u && u.steam_id && !seen.has(u.steam_id)) seen.set(u.steam_id, { id: String(u.steam_id), name: u.name || String(u.steam_id) });
        if (seen.size >= 3) break;
      }
      return { ok: true, uploaders: Array.from(seen.values()) };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  // Set primary uploader by SteamID64 (no key needed — public/unlisted replays
  // are read via the user's own key, filtered by this uploader).
  ipcMain.handle("uploader:setById", async (_e, id, name) => {
    config.uploaderId = String(id);
    config.uploaderName = name || String(id);
    config.uploaderKey = null;
    config.isPrimaryUploader = false;
    apiKey = config.loginKey;
    // best-effort: resolve a display name if none was given
    if (!name && config.loginKey) {
      try {
        const r = await enqueue(async () => {
          const res = await fetch(API_BASE + "/replays" + buildQuery({ uploader: String(id), count: 1 }), { headers: { Authorization: config.loginKey } });
          const t = await res.text(); try { return t ? JSON.parse(t) : null; } catch { return null; }
        });
        const u = r && r.list && r.list[0] && r.list[0].uploader;
        if (u && u.name) config.uploaderName = u.name;
      } catch {}
    }
    saveConfig();
    return { ok: true, uploaderName: config.uploaderName };
  });

  // Set primary uploader by their API key (grants access to private replays + groups).
  ipcMain.handle("uploader:setKey", async (_e, key) => {
    const k = (key || "").trim();
    const prev = apiKey;
    apiKey = k;
    try {
      const ping = await apiJson("GET", "/");
      setTier(ping && ping.type);
      config.uploaderKey = k;
      config.uploaderId = ping && ping.steam_id;
      config.uploaderName = ping && ping.name;
      config.isPrimaryUploader = false;
      saveConfig();
      return { ok: true, uploaderName: ping && ping.name };
    } catch (err) {
      apiKey = prev;
      return { ok: false, error: err.message, status: err.status };
    }
  });

  // Marks the user as their own uploader (clears any uploader key).
  ipcMain.handle("uploader:clear", () => {
    config.uploaderKey = null;
    config.uploaderId = null;
    config.uploaderName = null;
    config.isPrimaryUploader = true;
    apiKey = config.loginKey;
    saveConfig();
    return { ok: true };
  });

  // ----- Rocket League Demos folder -----
  ipcMain.handle("demos:get", () => ({ folder: config.demosFolder || null, detected: autoDemosFolder() }));
  ipcMain.handle("demos:set", async () => {
    const pick = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"], title: "Select your Rocket League Demos folder" });
    if (pick.canceled || !pick.filePaths[0]) return { ok: false, canceled: true };
    config.demosFolder = pick.filePaths[0]; saveConfig();
    return { ok: true, folder: config.demosFolder };
  });

  ipcMain.handle("identity:get", () => ({ identity, isPrimaryUploader: config.isPrimaryUploader }));

  ipcMain.handle("key:clear", () => { clearConfig(); return { ok: true }; });

  ipcMain.handle("status:get", () => schedulerStatus());

  ipcMain.handle("ping", async () => {
    try {
      const ping = await apiJson("GET", "/");
      setTier(ping && ping.type);
      return { ok: true, ping };
    } catch (err) { return { ok: false, error: err.message, status: err.status }; }
  });

  // ----- Replays -----
  ipcMain.handle("replays:list", async (_e, params, opts) => {
    const key = "replays:list:" + JSON.stringify(params || {});
    const ttl = (opts && opts.ttl) ?? 60_000;
    const cached = cacheGet(key, ttl);
    if (cached && !cached.stale && !(opts && opts.force)) return { ok: true, data: cached.data, cached: true };
    try {
      const data = await apiJson("GET", "/replays" + buildQuery(params));
      cacheSet(key, data);
      return { ok: true, data };
    } catch (err) {
      if (cached) return { ok: true, data: cached.data, stale: true };
      return { ok: false, error: err.message, status: err.status };
    }
  });

  ipcMain.handle("replays:get", async (_e, id, opts) => {
    const key = "replay:" + id;
    const ttl = (opts && opts.ttl) ?? 24 * 3600_000;
    const cached = cacheGet(key, ttl);
    if (cached && !cached.stale && !(opts && opts.force)) return { ok: true, data: cached.data, cached: true };
    try {
      const data = await apiJson("GET", "/replays/" + id);
      if (data && data.status === "ok") cacheSet(key, data);
      return { ok: true, data };
    } catch (err) {
      if (cached) return { ok: true, data: cached.data, stale: true };
      return { ok: false, error: err.message, status: err.status };
    }
  });

  ipcMain.handle("replays:patch", async (_e, id, body) => {
    try {
      await apiJson("PATCH", "/replays/" + id, body);
      cacheInvalidatePrefix("replays:list");
      cacheInvalidatePrefix("replay:" + id);
      cacheInvalidatePrefix("group:");       // group stats depend on member replays
      cacheInvalidatePrefix("groups:list");  // direct/indirect counts may change
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message, status: err.status }; }
  });

  ipcMain.handle("replays:delete", async (_e, id) => {
    try {
      await apiJson("DELETE", "/replays/" + id);
      cacheInvalidatePrefix("replays:list");
      cacheInvalidatePrefix("replay:" + id);
      cacheInvalidatePrefix("group:");
      cacheInvalidatePrefix("groups:list");
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message, status: err.status }; }
  });

  // ----- Groups -----
  ipcMain.handle("groups:list", async (_e, params, opts) => {
    const key = "groups:list:" + JSON.stringify(params || {});
    const ttl = (opts && opts.ttl) ?? 60_000;
    const cached = cacheGet(key, ttl);
    if (cached && !cached.stale && !(opts && opts.force)) return { ok: true, data: cached.data, cached: true };
    try {
      const data = await apiJson("GET", "/groups" + buildQuery(params));
      cacheSet(key, data);
      return { ok: true, data };
    } catch (err) {
      if (cached) return { ok: true, data: cached.data, stale: true };
      return { ok: false, error: err.message, status: err.status };
    }
  });

  ipcMain.handle("groups:get", async (_e, id, opts) => {
    const key = "group:" + id;
    const ttl = (opts && opts.ttl) ?? 5 * 60_000;
    const cached = cacheGet(key, ttl);
    if (cached && !cached.stale && !(opts && opts.force)) return { ok: true, data: cached.data, cached: true };
    try {
      const data = await apiJson("GET", "/groups/" + id);
      cacheSet(key, data);
      return { ok: true, data };
    } catch (err) {
      if (cached) return { ok: true, data: cached.data, stale: true };
      return { ok: false, error: err.message, status: err.status };
    }
  });

  ipcMain.handle("groups:create", async (_e, body) => {
    try {
      const data = await apiJson("POST", "/groups", body);
      cacheInvalidatePrefix("groups:list");
      return { ok: true, data };
    } catch (err) { return { ok: false, error: err.message, status: err.status }; }
  });

  ipcMain.handle("groups:patch", async (_e, id, body) => {
    try {
      await apiJson("PATCH", "/groups/" + id, body);
      cacheInvalidatePrefix("groups:list");
      cacheInvalidatePrefix("group:" + id);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message, status: err.status }; }
  });

  ipcMain.handle("groups:delete", async (_e, id) => {
    try {
      await apiJson("DELETE", "/groups/" + id);
      cacheInvalidatePrefix("groups:list");
      cacheInvalidatePrefix("group:" + id);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message, status: err.status }; }
  });

  // ----- Maps -----
  ipcMain.handle("maps:get", async () => {
    const key = "maps";
    const cached = cacheGet(key, 7 * 24 * 3600_000);
    if (cached && !cached.stale) return { ok: true, data: cached.data };
    try {
      const data = await apiJson("GET", "/maps");
      cacheSet(key, data);
      return { ok: true, data };
    } catch (err) {
      if (cached) return { ok: true, data: cached.data, stale: true };
      return { ok: false, error: err.message, status: err.status };
    }
  });

  // ----- Upload -----
  ipcMain.handle("upload:replay", async (_e, filePath, opts) => {
    try {
      const buf = fs.readFileSync(filePath);
      const form = new FormData();
      form.append("file", new Blob([buf]), path.basename(filePath));
      const q = buildQuery({ visibility: opts && opts.visibility, group: opts && opts.group });
      const data = await enqueue(async () => {
        const res = await fetch(API_BASE + "/v2/upload" + q, {
          method: "POST",
          headers: authHeaders(),
          body: form
        });
        if (res.status === 429) { const er = new Error("rate limited"); er.status = 429; throw er; }
        const txt = await res.text();
        let json = null; try { json = txt ? JSON.parse(txt) : null; } catch { json = { raw: txt }; }
        if (!res.ok && res.status !== 409) {
          const er = new Error((json && json.error) || `HTTP ${res.status}`);
          er.status = res.status; er.body = json; throw er;
        }
        return { status: res.status, json };
      });
      cacheInvalidatePrefix("replays:list");
      return { ok: true, duplicate: data.status === 409, data: data.json };
    } catch (err) { return { ok: false, error: err.message, status: err.status }; }
  });

  ipcMain.handle("open-external", (_e, url) => shell.openExternal(url));

  ipcMain.handle("update:check", async () => {
    if (!autoUpdater || !app.isPackaged) return { ok: false, reason: "not-packaged", version: app.getVersion() };
    try { const r = await autoUpdater.checkForUpdates(); return { ok: true, version: r && r.updateInfo && r.updateInfo.version, current: app.getVersion() }; }
    catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  });

  ipcMain.handle("app:version", () => app.getVersion());

  // Download one or more replay .replay files.
  //   opts.mode === "demos"  -> the Rocket League Demos folder (auto/saved, else ask once)
  //   otherwise              -> ask for a folder each time
  ipcMain.handle("replays:download", async (_e, ids, opts) => {
    if (!ids || !ids.length) return { ok: false, error: "nothing selected" };
    let dir;
    if (opts && opts.mode === "demos") {
      dir = config.demosFolder || autoDemosFolder();
      if (!dir) {
        const pick = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"], title: "Find your Rocket League Demos folder" });
        if (pick.canceled || !pick.filePaths[0]) return { ok: false, canceled: true };
        dir = pick.filePaths[0]; config.demosFolder = dir; saveConfig();
      }
    } else {
      const pick = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"], title: "Choose download folder" });
      if (pick.canceled || !pick.filePaths[0]) return { ok: false, canceled: true };
      dir = pick.filePaths[0];
    }
    let done = 0, failed = 0;
    for (const id of ids) {
      try {
        const buf = await enqueue(async () => {
          const res = await fetch(API_BASE + "/replays/" + id + "/file", { headers: authHeaders() });
          if (res.status === 429) { const er = new Error("rate limited"); er.status = 429; throw er; }
          if (!res.ok) throw new Error("HTTP " + res.status);
          return Buffer.from(await res.arrayBuffer());
        });
        fs.writeFileSync(path.join(dir, id + ".replay"), buf);
        done++;
      } catch { failed++; }
    }
    return { ok: true, dir, done, failed };
  });
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0e1116",
    title: "Ballchasing Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  win.webContents.once("did-finish-load", () => setupAutoUpdate(win));
  return win;
}

app.whenReady().then(() => {
  initPaths();
  loadCache();
  loadConfig();
  registerIpc();
  // If we already have a key, refresh tier in the background.
  if (apiKey) apiJson("GET", "/").then((p) => setTier(p && p.type)).catch(() => {});
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
