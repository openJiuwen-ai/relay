/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AuthProvider } from '@openjiuwen/relay-api-server-contracts/auth';

function resolveNoAuthUserId(env: NodeJS.ProcessEnv): string {
  const configured = env.OFFICE_CLAW_NO_AUTH_USER_ID?.trim();
  return configured && configured.length > 0 ? configured : 'default-user';
}

export function createNoAuthProvider(env: NodeJS.ProcessEnv = process.env): AuthProvider {
  const userId = resolveNoAuthUserId(env);

  return {
    id: 'no-auth',
    displayName: 'No Auth',
    presentation: {
      mode: 'auto',
      fields: [],
      submitLabel: 'Continue',
      description: 'Bypass login and use a local default identity.',
    },
    async authenticate() {
      return {
        success: true,
        principal: {
          userId,
          displayName: 'Local User',
          expiresAt: null,
        },
      };
    },
  };
}
