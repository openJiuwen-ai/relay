/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { BuiltinAccountClient, ProfileItem } from './hub-provider-profiles.types';

const FALLBACK_BUILTIN_PROFILE_SPECS: Array<{
  client: BuiltinAccountClient;
  id: string;
  displayName: string;
  models: string[];
}> = [
  { client: 'anthropic', id: 'claude', displayName: 'Claude (OAuth)', models: [] },
  { client: 'openai', id: 'codex', displayName: 'Codex (OAuth)', models: [] },
  { client: 'google', id: 'gemini', displayName: 'Gemini (OAuth)', models: [] },
  { client: 'dare', id: 'dare', displayName: 'Dare (client-auth)', models: [] },
  { client: 'opencode', id: 'opencode', displayName: 'OpenCode (client-auth)', models: [] },
];

function inferBuiltinClient(profile: ProfileItem): BuiltinAccountClient | undefined {
  if (profile.client) return profile.client;
  if (profile.oauthLikeClient === 'dare' || profile.oauthLikeClient === 'opencode') return profile.oauthLikeClient;
  const normalizedId = `${profile.id} ${profile.provider ?? ''} ${profile.displayName} ${profile.name}`.toLowerCase();
  if (normalizedId.includes('claude')) return 'anthropic';
  if (normalizedId.includes('codex')) return 'openai';
  if (normalizedId.includes('gemini')) return 'google';
  if (normalizedId.includes('dare')) return 'dare';
  if (normalizedId.includes('opencode')) return 'opencode';
  return undefined;
}

export function ensureBuiltinProviderProfiles(
  profiles: ProfileItem[],
  visibleBuiltinClients?: BuiltinAccountClient[],
): ProfileItem[] {
  const normalized = profiles.map((profile) => {
    if (!profile.builtin) return profile;
    const client = inferBuiltinClient(profile);
    return client ? { ...profile, client } : profile;
  });

  const seenBuiltinClients = new Set(
    normalized
      .filter((profile) => profile.builtin)
      .map((profile) => inferBuiltinClient(profile))
      .filter(Boolean) as BuiltinAccountClient[],
  );

  const fallbackSpecs =
    visibleBuiltinClients === undefined
      ? FALLBACK_BUILTIN_PROFILE_SPECS
      : FALLBACK_BUILTIN_PROFILE_SPECS.filter((spec) => visibleBuiltinClients.includes(spec.client));

  for (const spec of fallbackSpecs) {
    if (seenBuiltinClients.has(spec.client)) continue;
    normalized.push({
      id: spec.id,
      provider: spec.id,
      displayName: spec.displayName,
      name: spec.displayName,
      authType: 'oauth',
      kind: 'builtin',
      builtin: true,
      mode: 'subscription',
      client: spec.client,
      models: spec.models,
      hasApiKey: false,
      createdAt: '',
      updatedAt: '',
      ...(spec.client === 'dare' || spec.client === 'opencode' ? { oauthLikeClient: spec.client } : {}),
    });
  }

  return normalized;
}

export function resolveAccountActionId(profile: ProfileItem): string {
  return profile.id;
}
