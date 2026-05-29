/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Reads client-safe env vars. In Vitest, `vi.stubEnv` updates `process.env` first so
 * per-test overrides work; in Vite builds, values come from `import.meta.env`.
 */
function getImportMetaEnv(): Record<string, string | undefined> {
  try {
    return (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  } catch {
    return {};
  }
}

export function readPublicEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env.VITEST) {
    const stubbed = process.env[key];
    if (stubbed !== undefined) return stubbed;
  }
  return getImportMetaEnv()[key];
}

export function readBuildEnv(key: 'API_CLOWDER_HOST' | 'DEFAULT_API_CLIENT_URL' | 'CAN_CREATE_MODEL'): string {
  if (typeof process !== 'undefined' && process.env.VITEST) {
    const stubbed = process.env[key];
    if (stubbed !== undefined) return stubbed;
  }
  const env = getImportMetaEnv();
  if (key === 'API_CLOWDER_HOST') return env.API_CLOWDER_HOST ?? '';
  if (key === 'DEFAULT_API_CLIENT_URL') {
    return env.DEFAULT_API_CLIENT_URL ?? 'http://127.0.0.1:3004';
  }
  return env.CAN_CREATE_MODEL ?? '0';
}
