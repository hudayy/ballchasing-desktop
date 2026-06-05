// Preload: exposes a minimal, typed-ish bridge to the renderer as window.api.
const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("api", {
  // Key / auth
  keyStatus: () => invoke("key:status"),
  setKey: (key) => invoke("key:set", key),
  recentUploaders: () => invoke("uploader:recent"),
  setUploaderById: (id, name) => invoke("uploader:setById", id, name),
  setUploaderKey: (key) => invoke("uploader:setKey", key),
  clearUploader: () => invoke("uploader:clear"),
  getIdentity: () => invoke("identity:get"),
  clearKey: () => invoke("key:clear"),
  getDemosFolder: () => invoke("demos:get"),
  setDemosFolder: () => invoke("demos:set"),
  ping: () => invoke("ping"),
  status: () => invoke("status:get"),

  // Replays
  listReplays: (params, opts) => invoke("replays:list", params, opts),
  getReplay: (id, opts) => invoke("replays:get", id, opts),
  patchReplay: (id, body) => invoke("replays:patch", id, body),
  deleteReplay: (id) => invoke("replays:delete", id),
  downloadReplays: (ids, opts) => invoke("replays:download", ids, opts),

  // Groups
  listGroups: (params, opts) => invoke("groups:list", params, opts),
  getGroup: (id, opts) => invoke("groups:get", id, opts),
  createGroup: (body) => invoke("groups:create", body),
  patchGroup: (id, body) => invoke("groups:patch", id, body),
  deleteGroup: (id) => invoke("groups:delete", id),

  // Misc
  getMaps: () => invoke("maps:get"),
  uploadReplay: (filePath, opts) => invoke("upload:replay", filePath, opts),
  openExternal: (url) => invoke("open-external", url),

  // Updates
  appVersion: () => invoke("app:version"),
  checkForUpdates: () => invoke("update:check"),
  onUpdateStatus: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("update:status", handler);
    return () => ipcRenderer.removeListener("update:status", handler);
  }
});
