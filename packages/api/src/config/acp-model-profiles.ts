/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { existsSync, readFileSync } from 'node:fs';
import type {
  AcpModelProfileMeta,
  AcpModelProfilesMetaFile,
  AcpModelProfilesSecretsFile,
  AcpModelProfilesView,
  AcpModelProfileView,
  AcpModelProviderType,
  CreateAcpModelProfileInput,
  RuntimeAcpModelProfile,
  UpdateAcpModelProfileInput,
} from './acp-model-profiles.types.js';
import {
  createUniqueProfileId,
  normalizeBaseUrl,
  normalizePositiveNumber,
  normalizeProvider,
  normalizeTemperature,
  normalizeUnitInterval,
  requireDisplayName,
} from './acp-model-profiles.normalize.js';
import {
  persistNormalizedRawIfNeeded,
  readRaw,
  resolveProviderProfilesMetaPath,
  withAcpModelStoreLock,
  writeRaw,
} from './acp-model-profiles.store.js';

export type {
  AcpModelProfileMeta,
  AcpModelProfilesView,
  AcpModelProfileView,
  AcpModelProviderType,
  CreateAcpModelProfileInput,
  RuntimeAcpModelProfile,
  UpdateAcpModelProfileInput,
} from './acp-model-profiles.types.js';

function toViewProfile(profile: AcpModelProfileMeta, secrets: AcpModelProfilesSecretsFile): AcpModelProfileView {
  return {
    ...profile,
    name: profile.displayName,
    hasApiKey: Boolean(secrets.profiles[profile.id]?.apiKey),
  };
}

function findProfile(meta: AcpModelProfilesMetaFile, profileId: string): AcpModelProfileMeta | undefined {
  return meta.profiles.find((profile) => profile.id === profileId);
}

export async function readAcpModelProfiles(projectRoot: string): Promise<AcpModelProfilesView> {
  return withAcpModelStoreLock(projectRoot, async () => {
    const snapshot = await readRaw(projectRoot);
    const { meta, secrets } = snapshot;
    await persistNormalizedRawIfNeeded(snapshot);
    return { profiles: meta.profiles.map((profile) => toViewProfile(profile, secrets)) };
  });
}

export async function createAcpModelProfile(
  projectRoot: string,
  input: CreateAcpModelProfileInput,
): Promise<AcpModelProfileView> {
  return withAcpModelStoreLock(projectRoot, async () => {
    const { meta, secrets, metaPath, secretsPath } = await readRaw(projectRoot);
    const displayName = requireDisplayName(input);
    const provider = normalizeProvider(input.provider);
    const model = input.model?.trim();
    if (!model) throw new Error('model is required');
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    if (!baseUrl) throw new Error('baseUrl is required');
    const apiKey = input.apiKey?.trim();
    if (!apiKey) throw new Error('apiKey is required');

    const now = new Date().toISOString();
    const profile: AcpModelProfileMeta = {
      id: createUniqueProfileId(meta.profiles, displayName),
      displayName,
      ...(provider ? { provider } : {}),
      model,
      baseUrl,
      ...(input.sslVerify !== undefined ? { sslVerify: input.sslVerify } : {}),
      ...(normalizeTemperature(input.temperature) !== undefined
        ? { temperature: normalizeTemperature(input.temperature) }
        : {}),
      ...(normalizeUnitInterval(input.topP) !== undefined ? { topP: normalizeUnitInterval(input.topP) } : {}),
      ...(normalizePositiveNumber(input.maxTokens) !== undefined
        ? { maxTokens: normalizePositiveNumber(input.maxTokens) }
        : {}),
      ...(normalizePositiveNumber(input.contextWindow) !== undefined
        ? { contextWindow: normalizePositiveNumber(input.contextWindow) }
        : {}),
      ...(normalizePositiveNumber(input.connectTimeoutSeconds) !== undefined
        ? { connectTimeoutSeconds: normalizePositiveNumber(input.connectTimeoutSeconds) }
        : {}),
      createdAt: now,
      updatedAt: now,
    };

    meta.profiles.push(profile);
    secrets.profiles[profile.id] = { apiKey };
    await writeRaw(metaPath, secretsPath, meta, secrets);
    return toViewProfile(profile, secrets);
  });
}

export async function updateAcpModelProfile(
  projectRoot: string,
  profileId: string,
  input: UpdateAcpModelProfileInput,
): Promise<AcpModelProfileView> {
  return withAcpModelStoreLock(projectRoot, async () => {
    const { meta, secrets, metaPath, secretsPath } = await readRaw(projectRoot);
    const profile = findProfile(meta, profileId);
    if (!profile) throw new Error('profile not found');

    if (typeof input.name === 'string' || typeof input.displayName === 'string') {
      profile.displayName = requireDisplayName(input);
    }
    if (input.provider !== undefined) {
      if (input.provider === null) {
        delete profile.provider;
      } else {
        const provider = normalizeProvider(input.provider);
        if (!provider) throw new Error('provider is invalid');
        profile.provider = provider;
      }
    }
    if (input.model !== undefined) {
      const model = input.model.trim();
      if (!model) throw new Error('model is required');
      profile.model = model;
    }
    if (input.baseUrl !== undefined) {
      const baseUrl = normalizeBaseUrl(input.baseUrl);
      if (!baseUrl) throw new Error('baseUrl is required');
      profile.baseUrl = baseUrl;
    }
    if (input.sslVerify !== undefined) {
      profile.sslVerify = input.sslVerify;
    }
    if (input.temperature !== undefined) {
      const temperature = normalizeTemperature(input.temperature);
      if (temperature === undefined) delete profile.temperature;
      else profile.temperature = temperature;
    }
    if (input.topP !== undefined) {
      const topP = normalizeUnitInterval(input.topP);
      if (topP === undefined) delete profile.topP;
      else profile.topP = topP;
    }
    if (input.maxTokens !== undefined) {
      const maxTokens = normalizePositiveNumber(input.maxTokens);
      if (maxTokens === undefined) delete profile.maxTokens;
      else profile.maxTokens = maxTokens;
    }
    if (input.contextWindow !== undefined) {
      const contextWindow = normalizePositiveNumber(input.contextWindow);
      if (contextWindow === undefined) delete profile.contextWindow;
      else profile.contextWindow = contextWindow;
    }
    if (input.connectTimeoutSeconds !== undefined) {
      const connectTimeoutSeconds = normalizePositiveNumber(input.connectTimeoutSeconds);
      if (connectTimeoutSeconds === undefined) delete profile.connectTimeoutSeconds;
      else profile.connectTimeoutSeconds = connectTimeoutSeconds;
    }
    if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
      secrets.profiles[profile.id] = { apiKey: input.apiKey.trim() };
    }

    profile.updatedAt = new Date().toISOString();
    await writeRaw(metaPath, secretsPath, meta, secrets);
    return toViewProfile(profile, secrets);
  });
}

export async function deleteAcpModelProfile(projectRoot: string, profileId: string): Promise<void> {
  await withAcpModelStoreLock(projectRoot, async () => {
    const { meta, secrets, metaPath, secretsPath, storageRoot } = await readRaw(projectRoot);
    const profile = findProfile(meta, profileId);
    if (!profile) throw new Error('profile not found');

    const providerProfilesPath = resolveProviderProfilesMetaPath(storageRoot);
    if (existsSync(providerProfilesPath)) {
      try {
        const providerMeta = JSON.parse(readFileSync(providerProfilesPath, 'utf-8')) as {
          providers?: Array<{ defaultModelProfileRef?: string; id?: string }>;
        };
        const referencedBy = (providerMeta.providers ?? [])
          .filter((item) => item.defaultModelProfileRef === profileId)
          .map((item) => item.id)
          .filter((item): item is string => typeof item === 'string');
        if (referencedBy.length > 0) {
          throw new Error(`ACP model profile "${profileId}" is still referenced by ACP providers: ${referencedBy.join(', ')}`);
        }
      } catch (error) {
        if (error instanceof Error) throw error;
      }
    }

    meta.profiles = meta.profiles.filter((item) => item.id !== profileId);
    delete secrets.profiles[profileId];
    await writeRaw(metaPath, secretsPath, meta, secrets);
  });
}

export async function getAcpModelProfile(projectRoot: string, profileId: string): Promise<AcpModelProfileView | null> {
  return withAcpModelStoreLock(projectRoot, async () => {
    const snapshot = await readRaw(projectRoot);
    const { meta, secrets } = snapshot;
    await persistNormalizedRawIfNeeded(snapshot);
    const profile = findProfile(meta, profileId);
    return profile ? toViewProfile(profile, secrets) : null;
  });
}

export async function resolveRuntimeAcpModelProfileById(
  projectRoot: string,
  profileId: string,
): Promise<RuntimeAcpModelProfile | null> {
  return withAcpModelStoreLock(projectRoot, async () => {
    const snapshot = await readRaw(projectRoot);
    const { meta, secrets } = snapshot;
    await persistNormalizedRawIfNeeded(snapshot);
    const profile = findProfile(meta, profileId);
    const apiKey = profile ? secrets.profiles[profile.id]?.apiKey?.trim() : undefined;
    if (!profile || !apiKey) return null;
    return {
      ...profile,
      apiKey,
    };
  });
}
