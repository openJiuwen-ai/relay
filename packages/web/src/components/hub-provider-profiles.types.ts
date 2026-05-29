/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type ProfileMode = 'subscription' | 'api_key' | 'none';
export type ProfileAuthType = 'oauth' | 'api_key' | 'none';
export type ProfileKind = 'builtin' | 'api_key' | 'acp';
export type BuiltinAccountClient = 'anthropic' | 'openai' | 'google' | 'dare' | 'opencode';
export type BootstrapBindingMode = 'oauth' | 'api_key' | 'skip';
export type AcpModelAccessMode = 'self_managed' | 'clowder_default_profile';
export type AcpModelProviderType = 'openai_compatible' | 'bigmodel' | 'minimax' | 'echo';

export interface BootstrapBinding {
  enabled: boolean;
  mode: BootstrapBindingMode;
  accountRef?: string;
}

export interface ProfileItem {
  id: string;
  provider?: string;
  source?: 'provider_profiles' | 'model_config';
  displayName: string;
  name: string;
  authType: ProfileAuthType;
  kind: ProfileKind;
  builtin: boolean;
  mode: ProfileMode;
  client?: BuiltinAccountClient;
  protocol?: 'anthropic' | 'openai' | 'google' | 'huawei_maas' | 'acp' | string;
  baseUrl?: string;
  models?: string[];
  modelOverride?: string | null;
  oauthLikeClient?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  envKeys?: string[];
  modelAccessMode?: AcpModelAccessMode;
  defaultModelProfileRef?: string;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderProfilesResponse {
  projectPath: string;
  activeProfileId: string | null;
  bootstrapBindings: Partial<Record<BuiltinAccountClient, BootstrapBinding>>;
  providers: ProfileItem[];
  visibleBuiltinClients?: BuiltinAccountClient[];
  clientLabels?: Record<string, string>;
}

export interface AcpModelProfileItem {
  id: string;
  displayName: string;
  name: string;
  provider?: AcpModelProviderType;
  model: string;
  baseUrl: string;
  sslVerify?: boolean | null;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextWindow?: number;
  connectTimeoutSeconds?: number;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AcpModelProfilesResponse {
  projectPath: string;
  profiles: AcpModelProfileItem[];
}
