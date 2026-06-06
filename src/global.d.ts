// Ambient typing for the preload bridge.
export {};

declare global {
  interface BcApi {
    keyStatus(): Promise<KeyStatus>;
    setKey(key: string): Promise<{ ok: boolean; ping?: any; tier?: string; rps?: number; error?: string; status?: number; identity?: Identity }>;
    setUploaderKey(key: string): Promise<{ ok: boolean; uploaderName?: string; error?: string; status?: number }>;
    clearUploader(): Promise<{ ok: boolean }>;
    getIdentity(): Promise<{ identity: Identity | null; isPrimaryUploader: boolean }>;
    clearKey(): Promise<{ ok: boolean }>;
    getDemosFolder(): Promise<{ folder: string | null; detected: string | null }>;
    setDemosFolder(): Promise<{ ok: boolean; folder?: string; canceled?: boolean }>;
    ping(): Promise<{ ok: boolean; ping?: any; error?: string }>;
    status(): Promise<{ tier: string; rps: number; queued: number; inFlight: number }>;

    listReplays(params?: any, opts?: any): Promise<ApiResult<any>>;
    getReplay(id: string, opts?: any): Promise<ApiResult<any>>;
    patchReplay(id: string, body: any): Promise<ApiResult<any>>;
    deleteReplay(id: string): Promise<ApiResult<any>>;
    downloadReplays(ids: string[], opts?: { mode?: "demos" | "choose" }): Promise<{ ok: boolean; dir?: string; done?: number; failed?: number; canceled?: boolean; error?: string }>;

    listGroups(params?: any, opts?: any): Promise<ApiResult<any>>;
    getGroup(id: string, opts?: any): Promise<ApiResult<any>>;
    createGroup(body: any): Promise<ApiResult<any>>;
    patchGroup(id: string, body: any): Promise<ApiResult<any>>;
    deleteGroup(id: string): Promise<ApiResult<any>>;

    getMaps(): Promise<ApiResult<any>>;
    pickUploadFiles(): Promise<{ ok: boolean; files?: string[]; canceled?: boolean }>;
    uploadReplay(filePath: string, opts?: { visibility?: string; group?: string }): Promise<ApiResult<any> & { duplicate?: boolean }>;
    pathForFile(file: File): string;
    openExternal(url: string): Promise<void>;
    readClipboard(): Promise<string>;

    appVersion(): Promise<string>;
    checkForUpdates(): Promise<{ ok: boolean; version?: string; current?: string; reason?: string; error?: string }>;
    onUpdateStatus(cb: (p: UpdateStatus) => void): () => void;
  }

  type UpdateStatus = { state: "checking" | "available" | "none" | "downloading" | "ready" | "error"; version?: string; percent?: number; message?: string };

  type ApiResult<T> = { ok: boolean; data?: T; error?: string; status?: number; cached?: boolean; stale?: boolean };
  type Identity = { steam_id?: string | null; name?: string | null };
  type KeyStatus = {
    hasKey: boolean;
    identity?: Identity | null;
    separateAccounts?: boolean;
    hasUploaderKey?: boolean;
    uploaderId?: string | null;
    uploaderName?: string | null;
    uploaderFilter?: string;
  };

  interface Window {
    api: BcApi;
  }
}
