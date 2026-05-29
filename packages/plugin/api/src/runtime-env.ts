/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Runtime env contract shared by local API and remote gateway hosts.
 *
 * The store is responsible for:
 * - loading persisted env key/value pairs at startup
 * - persisting explicit runtime updates
 *
 * It is NOT responsible for auth, auditing, reconcile, or hot reload.
 */
export interface RuntimeEnvStore {
  load(): Promise<Record<string, string>>;
  save(updates: Record<string, string | null>): Promise<void>;
}
