/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { randomUUID } from 'node:crypto';
import type {
  AcpModelProfileMeta,
  AcpModelProfilesMetaFile,
  AcpModelProfilesSecretsFile,
  AcpModelProviderType,
  CreateAcpModelProfileInput,
  UpdateAcpModelProfileInput,
} from './acp-model-profiles.types.js';

interface NormalizedState<T> {
  value: T;
  dirty: boolean;
}

function didNormalizedShapeChange(raw: unknown, normalized: unknown, fileExists: boolean): boolean {
  return fileExists && JSON.stringify(raw) !== JSON.stringify(normalized);
}

export function createDefaultMeta(): AcpModelProfilesMetaFile {
  return { version: 1, profiles: [] };
}

export function createDefaultSecrets(): AcpModelProfilesSecretsFile {
  return { version: 1, profiles: {} };
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `acp-model-${randomUUID().slice(0, 8)}`;
}

export function createUniqueProfileId(existingProfiles: AcpModelProfileMeta[], displayName: string): string {
  const seed = slugify(displayName);
  const existingIds = new Set(existingProfiles.map((profile) => profile.id));
  if (!existingIds.has(seed)) return seed;
  let counter = 2;
  while (existingIds.has(`${seed}-${counter}`)) counter += 1;
  return `${seed}-${counter}`;
}

export function normalizeBaseUrl(baseUrl: string | undefined): string | undefined {
  const trimmed = baseUrl?.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : undefined;
}

export function normalizeProvider(provider: string | null | undefined): AcpModelProviderType | undefined {
  if (
    provider === 'openai_compatible' ||
    provider === 'bigmodel' ||
    provider === 'minimax' ||
    provider === 'echo'
  ) {
    return provider;
  }
  return undefined;
}

export function normalizePositiveNumber(value: number | undefined | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

export function normalizeUnitInterval(value: number | undefined | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return undefined;
  return value;
}

export function normalizeTemperature(value: number | undefined | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 2) return undefined;
  return value;
}

export function requireDisplayName(input: CreateAcpModelProfileInput | UpdateAcpModelProfileInput): string {
  const displayName = input.displayName ?? input.name;
  const trimmed = displayName?.trim();
  if (!trimmed) throw new Error('displayName or name is required');
  return trimmed;
}

export function normalizeMeta(meta: AcpModelProfilesMetaFile | null): AcpModelProfilesMetaFile {
  if (!meta || meta.version !== 1 || !Array.isArray(meta.profiles)) return createDefaultMeta();
  return {
    version: 1,
    profiles: meta.profiles
      .filter((profile) => typeof profile?.id === 'string' && profile.id.trim().length > 0)
      .map((profile) => {
        const normalizedProvider = normalizeProvider(profile.provider);
        return {
          id: profile.id.trim(),
          displayName: profile.displayName.trim(),
          ...(normalizedProvider ? { provider: normalizedProvider } : {}),
          model: profile.model.trim(),
          baseUrl: profile.baseUrl.trim(),
          ...(profile.sslVerify !== undefined ? { sslVerify: profile.sslVerify } : {}),
          ...(normalizeTemperature(profile.temperature) !== undefined
            ? { temperature: normalizeTemperature(profile.temperature) }
            : {}),
          ...(normalizeUnitInterval(profile.topP) !== undefined ? { topP: normalizeUnitInterval(profile.topP) } : {}),
          ...(normalizePositiveNumber(profile.maxTokens) !== undefined
            ? { maxTokens: normalizePositiveNumber(profile.maxTokens) }
            : {}),
          ...(normalizePositiveNumber(profile.contextWindow) !== undefined
            ? { contextWindow: normalizePositiveNumber(profile.contextWindow) }
            : {}),
          ...(normalizePositiveNumber(profile.connectTimeoutSeconds) !== undefined
            ? { connectTimeoutSeconds: normalizePositiveNumber(profile.connectTimeoutSeconds) }
            : {}),
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        };
      }),
  };
}

export function normalizeSecrets(secrets: AcpModelProfilesSecretsFile | null): AcpModelProfilesSecretsFile {
  if (!secrets || secrets.version !== 1 || typeof secrets.profiles !== 'object' || !secrets.profiles) {
    return createDefaultSecrets();
  }
  return { version: 1, profiles: { ...secrets.profiles } };
}

export function normalizeMetaState(
  meta: AcpModelProfilesMetaFile | null,
  fileExists: boolean,
): NormalizedState<AcpModelProfilesMetaFile> {
  const value = normalizeMeta(meta);
  return {
    value,
    dirty: didNormalizedShapeChange(meta, value, fileExists),
  };
}

export function normalizeSecretsState(
  secrets: AcpModelProfilesSecretsFile | null,
  fileExists: boolean,
): NormalizedState<AcpModelProfilesSecretsFile> {
  const value = normalizeSecrets(secrets);
  return {
    value,
    dirty: didNormalizedShapeChange(secrets, value, fileExists),
  };
}
