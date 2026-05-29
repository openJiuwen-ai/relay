/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export default {
  id: 'external-sso',
  displayName: 'External SSO',
  presentation: {
    mode: 'form',
    fields: [
      { name: 'workspaceId', label: 'Workspace', type: 'text', required: true },
      { name: 'apiToken', label: 'Token', type: 'password', required: true },
    ],
    submitLabel: 'Connect',
  },
  async authenticate(input) {
    return {
      success: true,
      principal: {
        userId: `external:${input.credentials?.workspaceId ?? 'guest'}`,
        displayName: 'SSO User',
        expiresAt: null,
      },
    };
  },
};
