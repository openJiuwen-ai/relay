/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { RuntimeAcpModelProfile } from '../../../../../config/acp-model-profiles.js';

export interface ACPModelProfileOverridePayload {
  name: 'default';
  provider?: RuntimeAcpModelProfile['provider'];
  model: string;
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  sslVerify?: boolean | null;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextWindow?: number;
  connectTimeoutSeconds?: number;
}

export function buildACPModelProfileOverridePayload(
  profile: RuntimeAcpModelProfile,
): ACPModelProfileOverridePayload {
  return {
    name: 'default',
    ...(profile.provider ? { provider: profile.provider } : {}),
    model: profile.model,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    ...(profile.headers ? { headers: profile.headers } : {}),
    ...(profile.sslVerify !== undefined ? { sslVerify: profile.sslVerify } : {}),
    ...(profile.temperature !== undefined ? { temperature: profile.temperature } : {}),
    ...(profile.topP !== undefined ? { topP: profile.topP } : {}),
    ...(profile.maxTokens !== undefined ? { maxTokens: profile.maxTokens } : {}),
    ...(profile.contextWindow !== undefined ? { contextWindow: profile.contextWindow } : {}),
    ...(profile.connectTimeoutSeconds !== undefined
      ? { connectTimeoutSeconds: profile.connectTimeoutSeconds }
      : {}),
  };
}
