/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { BootstrapBindings, BuiltinAccountClient, ProviderProfileView } from '../config/provider-profiles.types.js';
import { tryGetPluginRegistry } from '../config/plugins/plugin-registry-singleton.js';

const ALL_BUILTIN_AUTH_CLIENTS: BuiltinAccountClient[] = ['anthropic', 'openai', 'google', 'dare', 'opencode'];

function isBuiltinClientsEnabled(): boolean {
  const raw = process.env.OFFICE_CLAW_BUILTIN_CLIENTS_ENABLED;
  return raw === 'true' || raw === '1';
}

function isBuiltinClientsExplicitlyDisabled(): boolean {
  const raw = process.env.OFFICE_CLAW_BUILTIN_CLIENTS_ENABLED;
  return raw === 'false' || raw === '0';
}

function getRegisteredProviders(): string[] {
  return tryGetPluginRegistry()?.getAllProviders() ?? [];
}

function parseCsvFilter(raw: string | undefined, registered: readonly string[], fallback: readonly string[]): string[] {
  if (raw === undefined) return [...fallback];
  if (!raw.trim()) return [];

  const registeredSet = new Set(registered);
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => registeredSet.has(value));
  return Array.from(new Set(values));
}

export function getAllowedClientIds(): string[] {
  const registered = getRegisteredProviders();

  if (isBuiltinClientsEnabled()) return registered;

  const labelKeys = Object.keys(getClientLabels()).filter((k) => registered.includes(k));

  if (isBuiltinClientsExplicitlyDisabled()) {
    if (labelKeys.length > 0) return registered.filter((id) => labelKeys.includes(id));
    return parseCsvFilter(process.env.OFFICE_CLAW_ALLOWED_CLIENTS, registered, []);
  }

  const base = parseCsvFilter(process.env.OFFICE_CLAW_ALLOWED_CLIENTS, registered, registered);
  if (labelKeys.length === 0) return base;
  const merged = new Set([...base, ...labelKeys]);
  return registered.filter((id) => merged.has(id));
}

export function isClientAllowed(client: string): boolean {
  return getAllowedClientIds().includes(client);
}

export function filterAllowedClients<T extends { id: string; available?: boolean }>(clients: readonly T[]): T[] {
  const allowed = new Set(getAllowedClientIds());
  return clients
    .filter((client) => allowed.has(client.id))
    .map((client) => ({ ...client, available: true }));
}

export function getAllowedBuiltinBindingClients(): BuiltinAccountClient[] {
  const allowed = new Set(getAllowedClientIds());
  return ALL_BUILTIN_AUTH_CLIENTS.filter((client) => allowed.has(client));
}

export function getVisibleBuiltinAuthClients(): BuiltinAccountClient[] {
  if (isBuiltinClientsEnabled()) return [...ALL_BUILTIN_AUTH_CLIENTS];
  const allowedBuiltinClients = getAllowedBuiltinBindingClients();
  const defaultFallback = isBuiltinClientsExplicitlyDisabled() ? [] : allowedBuiltinClients;
  return parseCsvFilter(
    process.env.OFFICE_CLAW_VISIBLE_BUILTIN_AUTH_CLIENTS,
    ALL_BUILTIN_AUTH_CLIENTS,
    defaultFallback,
  ).filter((client): client is BuiltinAccountClient => allowedBuiltinClients.includes(client as BuiltinAccountClient));
}

export function filterProviderProfilesForVisibility(profiles: readonly ProviderProfileView[]): ProviderProfileView[] {
  const visibleBuiltinClients = new Set(getVisibleBuiltinAuthClients());
  return profiles.filter((profile) => !profile.builtin || (profile.client ? visibleBuiltinClients.has(profile.client) : false));
}

export function filterBootstrapBindingsForAllowedClients(bindings: BootstrapBindings): BootstrapBindings {
  const allowedClients = new Set(getAllowedBuiltinBindingClients());
  return Object.fromEntries(
    Object.entries(bindings).filter(([client]) => allowedClients.has(client as BuiltinAccountClient)),
  ) as BootstrapBindings;
}

export function getUiHints(): {
  hiddenHubTabs: string[];
  hiddenEnvCategories: string[];
  hideSkillMountStatus: boolean;
  hideAgentGuides: boolean;
} {
  if (!isBuiltinClientsExplicitlyDisabled()) {
    return { hiddenHubTabs: [], hiddenEnvCategories: [], hideSkillMountStatus: false, hideAgentGuides: false };
  }
  const allowed = new Set(getAllowedClientIds());
  const hiddenHubTabs: string[] = [];
  if (!allowed.has('anthropic')) hiddenHubTabs.push('rescue');
  if (!allowed.has('anthropic') && !allowed.has('openai') && !allowed.has('google')) {
    hiddenHubTabs.push('routing');
  }
  hiddenHubTabs.push('voice');
  const hiddenEnvCategories: string[] = [];
  if (!allowed.has('openai')) hiddenEnvCategories.push('codex');
  if (!allowed.has('google')) hiddenEnvCategories.push('gemini');
  hiddenEnvCategories.push('dare');
  const hideSkillMountStatus = !allowed.has('anthropic') && !allowed.has('openai') && !allowed.has('google');
  const hideAgentGuides = !allowed.has('anthropic') && !allowed.has('openai') && !allowed.has('google');
  return { hiddenHubTabs, hiddenEnvCategories, hideSkillMountStatus, hideAgentGuides };
}

export function getClientLabels(): Record<string, string> {
  const raw = process.env.OFFICE_CLAW_CLIENT_LABELS;
  if (!raw?.trim()) return {};
  const labels: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx <= 0) continue;
    const key = pair.slice(0, colonIdx).trim();
    const value = pair.slice(colonIdx + 1).trim();
    if (key && value) labels[key] = value;
  }
  return labels;
}
