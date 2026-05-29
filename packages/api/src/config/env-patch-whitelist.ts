/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export const HUB_ENV_PATCH_WHITELIST_ENV_NAME = 'OFFICE_CLAW_ENV_PATCH_WHITELIST';

function parseHubEnvPatchWhitelist(raw: string | undefined): string[] {
  if (typeof raw !== 'string') return [];
  return [...new Set(raw.split(';').map((item) => item.trim()).filter((item) => item.length > 0))];
}

export function getHubEnvPatchWhitelist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(parseHubEnvPatchWhitelist(env[HUB_ENV_PATCH_WHITELIST_ENV_NAME]));
}

export function isHubEnvPatchAllowed(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return getHubEnvPatchWhitelist(env).has(name);
}
