// Ambient typing for the preload bridge.
export {};

declare global {
  interface BcApi {
    keyStatus(): Promise<{ hasKey: boolean; identity?: Identity | null; isPrimaryUploader?: boolean; hasUploaderKey?: boolean }>;
    setKey(key: string): Promise<{ ok: boolean; ping?: any; tier?: string; rps?: number; error?: string; status?: number; identity?: Identity }>;
    setUploaderKey(key: string): Promise<{ ok: boolean; uploaderName?: string; error?: string; status?: number }>;
    clearUploaderKey(): Promise<{ ok: boolean }>;
    getIdentity(): Promise<{ identity: Identity | null; isPrimaryUploader: boolean }>;
    clearKey(): Promise<{ ok: boolean }>;
    ping(): Promise<{ ok: boolean; ping?: any; error?: string }>;
    status(): Promise<{ tier: string; rps: number; queued: number; inFlight: number }>;

    listReplays(params?: any, opts?: any): Promise<ApiResult<any>>;
    getReplay(id: string, opts?: any): Promise<ApiResult<any>>;
    patchReplay(id: string, body: any): Promise<ApiResult<any>>;
    deleteReplay(id: string): Promise<ApiResult<any>>;
    downloadReplays(ids: string[]): Promise<{ ok: boolean; dir?: string; done?: number; failed?: number; canceled?: boolean; error?: string }>;

    listGroups(params?: any, opts?: any): Promise<ApiResult<any>>;
    getGroup(id: string, opts?: any): Promise<ApiResult<any>>;
    createGroup(body: any): Promise<ApiResult<any>>;
    patchGroup(id: string, body: any): Promise<ApiResult<any>>;
    deleteGroup(id: string): Promise<ApiResult<any>>;

    getMaps(): Promise<ApiResult<any>>;
    uploadReplay(filePath: string, opts?: any): Promise<ApiResult<any> & { duplicate?: boolean }>;
    openExternal(url: string): Promise<void>;

    appVersion(): Promise<string>;
    checkForUpdates(): Promise<{ ok: boolean; version?: string; current?: string; reason?: string; error?: string }>;
    onUpdateStatus(cb: (p: UpdateStatus) => void): () => void;
  }

  type UpdateStatus = { state: "checking" | "available" | "none" | "downloading" | "ready" | "error"; version?: string; percent?: number; message?: string };

  type ApiResult<T> = { ok: boolean; data?: T; error?: string; status?: number; cached?: boolean; stale?: boolean };
  type Identity = { steam_id?: string | null; name?: string | null };

  interface Window {
    api: BcApi;
  }
}
