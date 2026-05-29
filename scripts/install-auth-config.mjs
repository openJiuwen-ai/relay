#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */


import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { buildModelartsBreed, buildCatalogFromPreset, defaultCliForProvider } from './build-catalog.mjs';

const MODELARTS_PLACEHOLDER_API_KEY = 'xxxxxxxx';

const BUILTIN_ACCOUNT_SPECS = [
  {
    id: 'claude',
    displayName: 'Claude',
    client: 'anthropic',
    models: ['claude-opus-4-6[1m]', 'claude-sonnet-4-6', 'claude-opus-4-5-20251101'],
  },
  { id: 'codex', displayName: 'Codex', client: 'openai', models: ['gpt-5.3-codex', 'gpt-5.4', 'gpt-5.3-codex-spark'] },
  { id: 'gemini', displayName: 'Gemini', client: 'google', models: ['gemini-3.1-pro-preview', 'gemini-2.5-pro'] },
  { id: 'dare', displayName: 'Dare', client: 'dare', models: ['z-ai/glm-4.7'] },
  { id: 'opencode', displayName: 'OpenCode', client: 'opencode', models: ['claude-opus-4-6', 'claude-sonnet-4-5'] },
];

const DEFAULT_OAUTH_CLIENTS = new Set(['anthropic', 'openai', 'google', 'dare']);
const LEGACY_BUILTIN_ID_MAP = {
  'claude-oauth': 'anthropic',
  'codex-oauth': 'openai',
  'gemini-oauth': 'google',
};

function usage() {
  console.error(`Usage:
  node scripts/install-auth-config.mjs env-apply --env-file FILE [--set KEY=VALUE]... [--delete KEY]...
  node scripts/install-auth-config.mjs client-auth set --project-dir DIR --client CLIENT --mode oauth|api_key [--display-name NAME] [--api-key KEY] [--base-url URL]
    API key can also be passed via _INSTALLER_API_KEY env var (preferred for security).
  node scripts/install-auth-config.mjs client-auth remove --project-dir DIR --client CLIENT
  node scripts/install-auth-config.mjs claude-profile set --project-dir DIR [--api-key KEY] [--base-url URL] [--model MODEL]
  node scripts/install-auth-config.mjs claude-profile remove --project-dir DIR
  node scripts/install-auth-config.mjs modelarts-preset apply --project-dir DIR [--api-key KEY]`);
  process.exit(1);
}

function parseArgs(argv) {
  const positionals = [];
  const values = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      usage();
    }
    if (!values.has(key)) {
      values.set(key, []);
    }
    values.get(key).push(next);
    index += 1;
  }

  return { positionals, values };
}

function getRequired(values, key) {
  const value = values.get(key)?.[0];
  if (!value) usage();
  return value;
}

function getOptional(values, key, fallback = '') {
  return values.get(key)?.[0] ?? fallback;
}

function envQuote(value) {
  const stringValue = String(value).replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  if (!stringValue.includes("'")) {
    return `'${stringValue}'`;
  }
  return `"${stringValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`;
}

function applyEnvChanges(envFile, setPairs, deleteKeys) {
  const existing = existsSync(envFile)
    ? readFileSync(envFile, 'utf8')
        .split(/\r?\n/)
        .filter((line, index, lines) => !(index === lines.length - 1 && line === ''))
    : [];
  const setMap = new Map();
  for (const pair of setPairs) {
    const separator = pair.indexOf('=');
    if (separator <= 0) usage();
    setMap.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  const deleteSet = new Set(deleteKeys);
  const filtered = existing.filter((line) => {
    const separator = line.indexOf('=');
    if (separator === -1) return true;
    const key = line.slice(0, separator);
    return !deleteSet.has(key) && !setMap.has(key);
  });
  for (const [key, value] of setMap.entries()) {
    filtered.push(`${key}=${envQuote(value)}`);
  }
  writeFileSync(envFile, filtered.length > 0 ? `${filtered.join('\n')}\n` : '', 'utf8');
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${path.basename(file)}: ${reason}`);
  }
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = baseUrl?.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : undefined;
}

function normalizeModels(models) {
  if (!Array.isArray(models)) return undefined;
  return Array.from(new Set(models.map((value) => String(value).trim()).filter((value) => value.length > 0)));
}

function normalizeBuiltinModels(models, builtinModels) {
  const normalized = normalizeModels(models);
  if (!normalized) return [...builtinModels];
  return Array.from(new Set([...normalized, ...builtinModels]));
}

function builtinAccountIdForClient(client) {
  const spec = BUILTIN_ACCOUNT_SPECS.find((item) => item.client === client);
  if (!spec) throw new Error(`Unsupported client "${client}"`);
  return spec.id;
}

function normalizeClient(rawClient) {
  const trimmed = rawClient?.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === 'anthropic' || trimmed === 'claude') return 'anthropic';
  if (trimmed === 'openai' || trimmed === 'codex') return 'openai';
  if (trimmed === 'google' || trimmed === 'gemini') return 'google';
  if (trimmed === 'dare') return 'dare';
  if (trimmed === 'opencode') return 'opencode';
  return null;
}

function defaultBindingForClient(client) {
  if (DEFAULT_OAUTH_CLIENTS.has(client)) {
    return oauthBindingForClient(client);
  }
  return {
    enabled: false,
    mode: 'skip',
  };
}

function oauthBindingForClient(client) {
  return {
    enabled: true,
    mode: 'oauth',
    accountRef: builtinAccountIdForClient(client),
  };
}

function createDefaultProfiles() {
  const now = new Date().toISOString();
  return {
    version: 3,
    activeProfileId: null,
    providers: BUILTIN_ACCOUNT_SPECS.map((spec) => ({
      id: spec.id,
      displayName: spec.displayName,
      kind: 'builtin',
      authType: 'oauth',
      builtin: true,
      client: spec.client,
      createdAt: now,
      updatedAt: now,
    })),
    bootstrapBindings: Object.fromEntries(
      BUILTIN_ACCOUNT_SPECS.map((spec) => [spec.client, defaultBindingForClient(spec.client)]),
    ),
  };
}

function createDefaultSecrets() {
  return { version: 3, profiles: {} };
}

function normalizeProfile(profile, now) {
  if (profile?.kind === 'builtin' || profile?.builtin) {
    const client = normalizeClient(profile.client ?? LEGACY_BUILTIN_ID_MAP[profile.id]);
    if (!client) {
      return null;
    }
    return {
      id: builtinAccountIdForClient(client),
      displayName:
        profile.displayName?.trim() ||
        BUILTIN_ACCOUNT_SPECS.find((item) => item.client === client)?.displayName ||
        builtinAccountIdForClient(client),
      kind: 'builtin',
      authType: 'oauth',
      builtin: true,
      client,
      models: normalizeBuiltinModels(
        profile.models,
        BUILTIN_ACCOUNT_SPECS.find((item) => item.client === client)?.models ?? [],
      ),
      createdAt: profile.createdAt || now,
      updatedAt: profile.updatedAt || profile.createdAt || now,
    };
  }

  const id = profile?.id?.trim();
  if (!id) return null;
  const protocol = normalizeClient(profile.protocol ?? profile.provider);
  return {
    id,
    displayName: profile.displayName?.trim() || profile.name?.trim() || id,
    kind: 'api_key',
    authType: 'api_key',
    builtin: false,
    ...(protocol ? { protocol } : {}),
    ...(normalizeBaseUrl(profile.baseUrl) ? { baseUrl: normalizeBaseUrl(profile.baseUrl) } : {}),
    ...(normalizeModels(profile.models) ? { models: normalizeModels(profile.models) } : {}),
    createdAt: profile.createdAt || now,
    updatedAt: profile.updatedAt || profile.createdAt || now,
  };
}

function normalizeBootstrapBindings(rawBindings, providers) {
  const defaults = createDefaultProfiles().bootstrapBindings;
  const providersById = new Map(providers.map((profile) => [profile.id, profile]));
  const next = {};

  for (const spec of BUILTIN_ACCOUNT_SPECS) {
    const candidate = rawBindings?.[spec.client];
    if (!candidate) {
      next[spec.client] = defaults[spec.client];
      continue;
    }
    if (candidate.mode === 'oauth' && candidate.enabled !== false) {
      next[spec.client] = oauthBindingForClient(spec.client);
      continue;
    }
    if (candidate.mode === 'skip' || candidate.enabled === false) {
      next[spec.client] = { enabled: false, mode: 'skip' };
      continue;
    }
    const accountRef = candidate.accountRef?.trim();
    const account = accountRef ? providersById.get(accountRef) : undefined;
    if (candidate.mode === 'api_key' && account?.kind === 'api_key') {
      next[spec.client] = { enabled: true, mode: 'api_key', accountRef: account.id };
      continue;
    }
    next[spec.client] = defaults[spec.client];
  }

  return next;
}

function migrateV2Profiles(raw) {
  const next = createDefaultProfiles();
  const now = new Date().toISOString();
  if (Array.isArray(raw?.profiles)) {
    for (const legacyProfile of raw.profiles) {
      if (LEGACY_BUILTIN_ID_MAP[legacyProfile.id]) continue;
      const normalized = normalizeProfile(legacyProfile, now);
      if (normalized) next.providers.push(normalized);
    }
  }

  const selected = raw?.activeProfileIds ?? {};
  const activeByClient = {
    anthropic: selected.anthropic ?? raw?.activeProfileId ?? null,
    openai: selected.openai ?? null,
    google: selected.google ?? null,
  };

  for (const [client, activeId] of Object.entries(activeByClient)) {
    if (!activeId || LEGACY_BUILTIN_ID_MAP[activeId]) continue;
    const exists = next.providers.some((profile) => profile.id === activeId && profile.kind === 'api_key');
    if (exists) {
      next.bootstrapBindings[client] = { enabled: true, mode: 'api_key', accountRef: activeId };
    }
  }
  return next;
}

function migrateV1Profiles(raw) {
  const next = createDefaultProfiles();
  const now = new Date().toISOString();
  const profiles = raw?.providers?.anthropic?.profiles ?? [];
  for (const legacyProfile of profiles) {
    if (legacyProfile.id === 'anthropic-subscription-default' || LEGACY_BUILTIN_ID_MAP[legacyProfile.id]) continue;
    const normalized = normalizeProfile(legacyProfile, now);
    if (normalized) next.providers.push(normalized);
  }
  const activeId = raw?.providers?.anthropic?.activeProfileId;
  if (activeId && next.providers.some((profile) => profile.id === activeId && profile.kind === 'api_key')) {
    next.bootstrapBindings.anthropic = { enabled: true, mode: 'api_key', accountRef: activeId };
  }
  return next;
}

function normalizeProfilesFile(raw) {
  if (!raw) {
    return createDefaultProfiles();
  }

  if (raw.version === 3 && Array.isArray(raw.providers)) {
    const now = new Date().toISOString();
    const builtinProfiles = new Map(
      BUILTIN_ACCOUNT_SPECS.map((spec) => [
        spec.id,
        {
          id: spec.id,
          displayName: spec.displayName,
          kind: 'builtin',
          authType: 'oauth',
          builtin: true,
          client: spec.client,
          models: [...spec.models],
          createdAt: now,
          updatedAt: now,
        },
      ]),
    );
    for (const rawProfile of raw.providers) {
      const normalized = normalizeProfile(rawProfile, now);
      if (!normalized) continue;
      builtinProfiles.set(normalized.id, normalized);
    }
    const providers = Array.from(builtinProfiles.values());
    return {
      version: 3,
      activeProfileId: null,
      providers,
      bootstrapBindings: normalizeBootstrapBindings(raw.bootstrapBindings, providers),
    };
  }

  if (raw.version === 2) {
    return migrateV2Profiles(raw);
  }

  if (raw.version === 1) {
    return migrateV1Profiles(raw);
  }

  return createDefaultProfiles();
}

function normalizeSecretsFile(raw) {
  if (!raw) {
    return createDefaultSecrets();
  }
  if (raw.version === 3 && raw.profiles) {
    return raw;
  }
  if (raw.version === 2 && raw.profiles) {
    return { version: 3, profiles: { ...raw.profiles } };
  }
  if (raw.version === 1 && raw.providers?.anthropic) {
    return { version: 3, profiles: { ...raw.providers.anthropic } };
  }
  return createDefaultSecrets();
}

/**
 * Resolve the global storage root for provider-profiles.
 * Runtime reads from ~/.office-claw/ (or OFFICE_CLAW_GLOBAL_CONFIG_ROOT), so the
 * installer must write to the same location.
 */
function resolveGlobalOfficeClawDir() {
  const root = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT || homedir();
  return path.join(root, '.office-claw');
}

function ensureStorage(_projectDir) {
  const profileDir = resolveGlobalOfficeClawDir();
  mkdirSync(profileDir, { recursive: true });
  return {
    profileFile: path.join(profileDir, 'provider-profiles.json'),
    secretsFile: path.join(profileDir, 'provider-profiles.secrets.local.json'),
  };
}

function readState(projectDir) {
  const { profileFile, secretsFile } = ensureStorage(projectDir);
  const profiles = normalizeProfilesFile(readJson(profileFile, null));
  const secrets = normalizeSecretsFile(readJson(secretsFile, null));
  return { profileFile, secretsFile, profiles, secrets };
}

function writeState(profileFile, secretsFile, profiles, secrets) {
  writeFileSync(profileFile, `${JSON.stringify(profiles, null, 2)}\n`);
  writeFileSync(secretsFile, `${JSON.stringify(secrets, null, 2)}\n`);
  chmodSync(secretsFile, 0o600);
}

function writeCatalog(projectDir, catalog) {
  const catalogDir = path.join(projectDir, '.office-claw');
  mkdirSync(catalogDir, { recursive: true });
  const catalogFile = path.join(catalogDir, 'office-claw-catalog.json');
  writeFileSync(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`);
}

function upsertInstallerApiKeyAccount(projectDir, client, options) {
  const { profileFile, secretsFile, profiles, secrets } = readState(projectDir);
  const profileId = options.profileId || `installer-${client}`;
  const now = new Date().toISOString();
  const normalizedBaseUrl = normalizeBaseUrl(options.baseUrl);

  profiles.providers = profiles.providers.filter((profile) => profile.id !== profileId);
  profiles.providers.push({
    id: profileId,
    displayName: options.displayName,
    kind: 'api_key',
    authType: 'api_key',
    builtin: false,
    ...(options.protocol ? { protocol: options.protocol } : {}),
    ...(normalizedBaseUrl ? { baseUrl: normalizedBaseUrl } : {}),
    ...(normalizeModels(options.models) ? { models: normalizeModels(options.models) } : {}),
    createdAt: now,
    updatedAt: now,
  });
  profiles.bootstrapBindings[client] = {
    enabled: true,
    mode: 'api_key',
    accountRef: profileId,
  };
  secrets.profiles[profileId] = { apiKey: options.apiKey };
  writeState(profileFile, secretsFile, profiles, secrets);
}

function readSeedTemplate() {
  const templatePath = new URL('../office-claw-template.json', import.meta.url);
  const template = readJson(templatePath, null);
  if (!template?.breeds || !template?.roster) {
    throw new Error('Failed to load office-claw-template.json for ModelArts preset');
  }
  return template;
}

function readModelartsPreset() {
  const presetPath = new URL('../modelarts-preset.json', import.meta.url);
  const preset = readJson(presetPath, null);
  if (!preset?.sharedAccount || !preset?.members) {
    throw new Error('Failed to load modelarts-preset.json');
  }
  return preset;
}

function applyModelartsPreset(projectDir, apiKey) {
  const preset = readModelartsPreset();
  const account = preset.sharedAccount;
  const sharedApiKey = apiKey?.trim() || MODELARTS_PLACEHOLDER_API_KEY;
  upsertInstallerApiKeyAccount(projectDir, 'dare', {
    profileId: account.profileId,
    displayName: account.displayName,
    apiKey: sharedApiKey,
    baseUrl: account.baseUrl,
    models: account.models,
    protocol: account.protocol,
  });

  const { profileFile, secretsFile, profiles, secrets } = readState(projectDir);
  profiles.bootstrapBindings = {
    anthropic: { enabled: false, mode: 'skip' },
    openai: { enabled: false, mode: 'skip' },
    google: { enabled: false, mode: 'skip' },
    opencode: { enabled: false, mode: 'skip' },
    dare: { enabled: true, mode: 'api_key', accountRef: account.profileId },
  };
  writeState(profileFile, secretsFile, profiles, secrets);

  const template = readSeedTemplate();
  const { catalog } = buildCatalogFromPreset(template, preset);
  writeCatalog(projectDir, catalog);

  // Create ACP provider profiles for relay-teams members (write directly to
  // avoid normalizeProfilesFile stripping ACP-specific fields like command)
  for (const member of preset.members) {
    if (member.provider !== 'acp') continue;
    const acpProfileId = member.providerProfileId || `acp-${member.agentId}`;
    const acpCommand = path.join(projectDir, 'tools', 'python', 'python.exe');
    const acpModelProfileId = `${acpProfileId}-model`;
    const now = new Date().toISOString();

    // 1. Create ACP provider profile with clowder_default_profile mode
    const { profileFile: pf } = ensureStorage(projectDir);
    const raw = readJson(pf, null) || { version: 3, providers: [], bootstrapBindings: {} };
    raw.providers = (raw.providers || []).filter((p) => p.id !== acpProfileId);
    raw.providers.push({
      id: acpProfileId,
      displayName: member.displayName || acpProfileId,
      kind: 'acp',
      authType: 'none',
      builtin: false,
      protocol: 'acp',
      command: acpCommand,
      args: ['-m', 'relay_teams', 'gateway', 'acp', 'stdio'],
      modelAccessMode: 'clowder_default_profile',
      defaultModelProfileRef: acpModelProfileId,
      createdAt: now,
      updatedAt: now,
    });
    writeFileSync(pf, `${JSON.stringify(raw, null, 2)}\n`);

    // 2. Create ACP model profile pointing to modelarts-shared credentials
    const globalDir = resolveGlobalOfficeClawDir();
    const acpModelMetaFile = path.join(globalDir, 'acp-model-profiles.json');
    const acpModelSecretsFile = path.join(globalDir, 'acp-model-profiles.secrets.local.json');
    const acpModelMeta = readJson(acpModelMetaFile, null) || { version: 1, profiles: [] };
    const acpModelSecrets = readJson(acpModelSecretsFile, null) || { version: 1, profiles: {} };
    acpModelMeta.profiles = (acpModelMeta.profiles || []).filter((p) => p.id !== acpModelProfileId);
    acpModelMeta.profiles.push({
      id: acpModelProfileId,
      displayName: `${member.displayName || acpProfileId} Model`,
      provider: 'openai_compatible',
      model: account.models[0] || 'glm-5',
      baseUrl: account.baseUrl,
      createdAt: now,
      updatedAt: now,
    });
    acpModelSecrets.profiles = acpModelSecrets.profiles || {};
    acpModelSecrets.profiles[acpModelProfileId] = { apiKey: sharedApiKey };
    writeFileSync(acpModelMetaFile, `${JSON.stringify(acpModelMeta, null, 2)}\n`);
    writeFileSync(acpModelSecretsFile, `${JSON.stringify(acpModelSecrets, null, 2)}\n`);
    chmodSync(acpModelSecretsFile, 0o600);
  }

  // Disable builtin OAuth clients and only show preset members in the console
  const envFile = path.join(projectDir, '.env');
  if (existsSync(envFile)) {
    const clientLabels = preset.members.map((m) => `${m.provider}:${m.displayName || m.agentId}`).join(',');
    applyEnvChanges(
      envFile,
      [
        'OFFICE_CLAW_BUILTIN_CLIENTS_ENABLED=false',
        `OFFICE_CLAW_CLIENT_LABELS=${clientLabels}`,
        'OFFICE_CLAW_MODEL_CONFIG_FALLBACK_ENABLED=true',
      ],
      [],
    );
  }
}

function setClientOauthBinding(projectDir, client) {
  const { profileFile, secretsFile, profiles, secrets } = readState(projectDir);
  profiles.bootstrapBindings[client] = oauthBindingForClient(client);
  writeState(profileFile, secretsFile, profiles, secrets);
}

function removeInstallerApiKeyAccount(projectDir, client, profileId) {
  const globalDir = resolveGlobalOfficeClawDir();
  if (!existsSync(globalDir)) return;

  const profileFile = path.join(globalDir, 'provider-profiles.json');
  const secretsFile = path.join(globalDir, 'provider-profiles.secrets.local.json');
  if (!existsSync(profileFile) && !existsSync(secretsFile)) return;

  const catalogFile = path.join(projectDir, '.office-claw', 'office-claw-catalog.json');
  if (existsSync(catalogFile)) {
    const catalog = readJson(catalogFile, null);
    const boundCats = (catalog?.breeds ?? [])
      .flatMap((breed) =>
        (breed?.variants ?? [])
          .filter((variant) => variant?.accountRef?.trim?.() === profileId)
          .map((variant) => variant?.agentId?.trim?.() || variant?.catId?.trim?.() || breed?.agentId?.trim?.() || breed?.catId?.trim?.() || breed?.id?.trim?.() || profileId),
      )
      .filter((value) => typeof value === 'string' && value.length > 0);
    if (boundCats.length > 0) {
      throw new Error(`Cannot remove ${profileId}; still referenced by runtime cats: ${boundCats.join(', ')}`);
    }
  }

  const profiles = normalizeProfilesFile(readJson(profileFile, null));
  const secrets = normalizeSecretsFile(readJson(secretsFile, null));
  profiles.providers = profiles.providers.filter((profile) => profile.id !== profileId);
  delete secrets.profiles[profileId];
  profiles.bootstrapBindings[client] = oauthBindingForClient(client);
  writeState(profileFile, secretsFile, profiles, secrets);
}

try {
  const { positionals, values } = parseArgs(process.argv.slice(2));
  if (positionals[0] === 'env-apply') {
    applyEnvChanges(getRequired(values, 'env-file'), values.get('set') ?? [], values.get('delete') ?? []);
    process.exit(0);
  }

  if (positionals[0] === 'client-auth' && positionals[1] === 'set') {
    const client = normalizeClient(getRequired(values, 'client'));
    if (!client) {
      console.error('Error: unsupported client');
      process.exit(1);
    }
    const mode = getRequired(values, 'mode');
    const projectDir = getRequired(values, 'project-dir');
    if (mode === 'oauth') {
      setClientOauthBinding(projectDir, client);
      process.exit(0);
    }
    if (mode !== 'api_key') {
      usage();
    }
    const apiKey = getOptional(values, 'api-key', '') || process.env._INSTALLER_API_KEY || '';
    if (!apiKey) {
      console.error('Error: API key required via --api-key or _INSTALLER_API_KEY env var');
      process.exit(1);
    }
    const displayName = getOptional(values, 'display-name', `Installer ${client} API Key`);
    const modelArg = getOptional(values, 'model', '');
    upsertInstallerApiKeyAccount(projectDir, client, {
      displayName,
      apiKey,
      baseUrl: getOptional(values, 'base-url', ''),
      ...(modelArg ? { models: [modelArg] } : {}),
    });
    process.exit(0);
  }

  if (positionals[0] === 'client-auth' && positionals[1] === 'remove') {
    const client = normalizeClient(getRequired(values, 'client'));
    if (!client) {
      console.error('Error: unsupported client');
      process.exit(1);
    }
    removeInstallerApiKeyAccount(getRequired(values, 'project-dir'), client, `installer-${client}`);
    process.exit(0);
  }

  if (positionals[0] === 'claude-profile' && positionals[1] === 'set') {
    const apiKey = getOptional(values, 'api-key', '') || process.env._INSTALLER_API_KEY || '';
    if (!apiKey) {
      console.error('Error: API key required via --api-key or _INSTALLER_API_KEY env var');
      process.exit(1);
    }
    upsertInstallerApiKeyAccount(getRequired(values, 'project-dir'), 'anthropic', {
      profileId: 'installer-managed',
      displayName: 'Installer API Key',
      apiKey,
      baseUrl: getOptional(values, 'base-url', 'https://api.anthropic.com'),
      models: (() => {
        const model = getOptional(values, 'model', '').trim();
        return model ? [model] : undefined;
      })(),
    });
    process.exit(0);
  }

  if (positionals[0] === 'claude-profile' && positionals[1] === 'remove') {
    removeInstallerApiKeyAccount(getRequired(values, 'project-dir'), 'anthropic', 'installer-managed');
    process.exit(0);
  }

  if (positionals[0] === 'modelarts-preset' && positionals[1] === 'apply') {
    const apiKey = getOptional(values, 'api-key', '') || process.env._INSTALLER_API_KEY || '';
    applyModelartsPreset(getRequired(values, 'project-dir'), apiKey);
    process.exit(0);
  }

  usage();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
