/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type AcpModelProviderType = 'openai_compatible' | 'bigmodel' | 'minimax' | 'echo';

export interface AcpModelProfileMeta {
  id: string;
  displayName: string;
  provider?: AcpModelProviderType;
  model: string;
  baseUrl: string;
  sslVerify?: boolean | null;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextWindow?: number;
  connectTimeoutSeconds?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AcpModelProfileView extends AcpModelProfileMeta {
  name: string;
  hasApiKey: boolean;
}

export interface AcpModelProfilesView {
  profiles: AcpModelProfileView[];
}

export interface CreateAcpModelProfileInput {
  name?: string;
  displayName?: string;
  provider?: AcpModelProviderType;
  model: string;
  baseUrl: string;
  apiKey: string;
  sslVerify?: boolean | null;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextWindow?: number;
  connectTimeoutSeconds?: number;
}

export interface UpdateAcpModelProfileInput {
  name?: string;
  displayName?: string;
  provider?: AcpModelProviderType | null;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  sslVerify?: boolean | null;
  temperature?: number | null;
  topP?: number | null;
  maxTokens?: number | null;
  contextWindow?: number | null;
  connectTimeoutSeconds?: number | null;
}

export interface RuntimeAcpModelProfile extends AcpModelProfileMeta {
  apiKey: string;
  headers?: Record<string, string>;
}

export interface AcpModelProfilesMetaFile {
  version: 1;
  profiles: AcpModelProfileMeta[];
}

export interface AcpModelProfilesSecretsFile {
  version: 1;
  profiles: Record<string, { apiKey?: string }>;
}
