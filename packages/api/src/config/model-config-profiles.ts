/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createModuleLogger } from '../infrastructure/logger.js';
import {
  buildModelConfigSourceApiKeyRef,
  deleteSecretRef,
  isLocalSecretStorageEnabled,
  preloadSecretRefs,
  readSecretRef,
  writeSecretRef,
} from './local-secret-store.js';
import type { ProviderProfileProtocol, ProviderProfileView } from './provider-profiles.types.js';
import { resolveProviderProfilesRootSync } from './provider-profiles-root.js';

export interface ModelConfigBinding {
  id: string;
  models: string[];
  displayName?: string;
  description?: string;
  icon?: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyRef?: string;
  headers?: Record<string, string>;
  protocol?: ProviderProfileProtocol;
  serviceType?: HuaweiAIServiceType;
  createdAt?: string;
  updatedAt?: string;
}
export const HUAWEI_MAAS_MODEL_SOURCE_ID = 'huawei-maas';
export const MODEL_CONFIG_FALLBACK_ENV = 'OFFICE_CLAW_MODEL_CONFIG_FALLBACK_ENABLED';
export type HuaweiAIServiceType = 'maas' | 'claw-plan';
export type HuaweiAIServiceInputType = HuaweiAIServiceType | 'coding-plan';
const LEGACY_CODING_PLAN_BASE_URL = 'https://api.modelarts-maas.com/coding/v2';
const CLAW_PLAN_BASE_URL = 'https://api.modelarts-maas.com/plan/v2';

const log = createModuleLogger('model-config-profiles');

export interface CreateProjectModelConfigSourceInput {
  id: string;
  displayName?: string;
  description?: string;
  icon?: string;
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  models: string[];
  serviceType?: HuaweiAIServiceInputType;
}

export interface UpdateProjectModelConfigSourceInput {
  displayName?: string | null;
  description?: string | null;
  icon?: string | null;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  models?: string[];
  serviceType?: HuaweiAIServiceInputType;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeModelArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function normalizeModelIds(value: unknown): string[] {
  const ids = normalizeModelArray(value)
    .map((item) => (typeof item.id === 'string' ? item.id.trim() : ''))
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function normalizeHeaderMap(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .map(([key, rawValue]) => {
      const trimmedKey = key.trim();
      const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
      if (!trimmedKey || !trimmedValue) return null;
      return [trimmedKey, trimmedValue] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

function normalizeServiceType(value: unknown): HuaweiAIServiceType | undefined {
  if (value === 'coding-plan') return 'claw-plan';
  return value === 'maas' || value === 'claw-plan' ? value : undefined;
}

function normalizeBaseUrlForServiceType(baseUrl: string, serviceType: HuaweiAIServiceType | undefined): string {
  if (serviceType !== 'claw-plan') return baseUrl;
  return baseUrl.replace(LEGACY_CODING_PLAN_BASE_URL, CLAW_PLAN_BASE_URL);
}

function normalizeDisplayNameForServiceType(
  displayName: string | undefined,
  serviceType: HuaweiAIServiceType | undefined,
): string | undefined {
  if (serviceType !== 'claw-plan') return displayName;
  if (!displayName || /^coding\s*plan$/i.test(displayName)) return 'Claw Plan';
  return displayName;
}

export function maskModelConfigApiKey(apiKey: string | undefined): string | undefined {
  const trimmed = apiKey?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
}

function normalizeModelConfigRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return { ...value };
}

function inferProtocol(profileId: string): ProviderProfileProtocol | undefined {
  if (profileId.trim().toLowerCase() === HUAWEI_MAAS_MODEL_SOURCE_ID) return 'huawei_maas';
  return undefined;
}

function displayNameForBinding(binding: ModelConfigBinding): string {
  if (binding.protocol === 'huawei_maas') return 'Huawei MaaS';
  return binding.displayName?.trim() || binding.id;
}

function resolveOpenAiBindingApiKey(value: Record<string, unknown>): { apiKey?: string; apiKeyRef?: string } {
  const apiKey = typeof value.apiKey === 'string' ? value.apiKey.trim() : '';
  const apiKeyRef = typeof value.apiKeyRef === 'string' ? value.apiKeyRef.trim() : '';
  if (apiKeyRef) {
    const resolved = readSecretRef(apiKeyRef);
    if (resolved && resolved.trim()) {
      return { apiKey: resolved.trim(), apiKeyRef };
    }
  }
  if (apiKey) return { apiKey, apiKeyRef: apiKeyRef || undefined };
  return { apiKeyRef: apiKeyRef || undefined };
}

function normalizeOpenAiBinding(id: string, value: Record<string, unknown>): ModelConfigBinding | null {
  const protocol = typeof value.protocol === 'string' ? value.protocol.trim().toLowerCase() : '';
  if (protocol !== 'openai') return null;

  const models = normalizeModelIds(value.models);
  const { apiKey, apiKeyRef } = resolveOpenAiBindingApiKey(value);
  const serviceType = normalizeServiceType(value.serviceType);
  const rawBaseUrl = typeof value.baseUrl === 'string' ? value.baseUrl.trim() : '';
  const baseUrl = normalizeBaseUrlForServiceType(rawBaseUrl, serviceType);
  if (!baseUrl || !apiKey || models.length === 0) return null;

  const displayName = normalizeDisplayNameForServiceType(
    typeof value.displayName === 'string' ? value.displayName.trim() : '',
    serviceType,
  );
  const description = typeof value.description === 'string' ? value.description.trim() : '';
  const icon = typeof value.icon === 'string' ? value.icon.trim() : '';
  const headers = normalizeHeaderMap(value.headers);
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt.trim() : '';
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt.trim() : '';
  return {
    id,
    models,
    protocol: 'openai',
    ...(displayName ? { displayName } : {}),
    ...(description ? { description } : {}),
    ...(icon ? { icon } : {}),
    baseUrl,
    apiKey,
    ...(apiKeyRef ? { apiKeyRef } : {}),
    ...(headers ? { headers } : {}),
    ...(serviceType ? { serviceType } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  } satisfies ModelConfigBinding;
}

function normalizeModelSourceBinding(id: string, value: unknown): ModelConfigBinding | null {
  const protocol = inferProtocol(id);
  if (Array.isArray(value)) {
    if (protocol !== 'huawei_maas') return null;
    return {
      id,
      models: normalizeModelIds(value),
      ...(protocol ? { protocol } : {}),
    } satisfies ModelConfigBinding;
  }
  if (isRecord(value)) {
    if (protocol === 'huawei_maas') {
      const models = normalizeModelIds(value.models);
      return {
        id,
        models,
        protocol,
      } satisfies ModelConfigBinding;
    }
    return normalizeOpenAiBinding(id, value);
  }
  return null;
}

function buildModelConfigOpenAiRecord(
  projectRoot: string,
  sourceId: string,
  input: {
    displayName?: string;
    description?: string;
    icon?: string;
    baseUrl: string;
    apiKey: string;
    headers?: Record<string, string>;
    models: string[];
    serviceType?: HuaweiAIServiceType;
    existingApiKeyRef?: string;
    createdAt?: string;
    updatedAt?: string;
  },
): Record<string, unknown> {
  const apiKeyRef = input.existingApiKeyRef || buildModelConfigSourceApiKeyRef(projectRoot, sourceId);
  const baseRecord: Record<string, unknown> = {
    protocol: 'openai',
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.icon ? { icon: input.icon } : {}),
    baseUrl: input.baseUrl,
    ...(input.headers ? { headers: input.headers } : {}),
    models: input.models.map((model) => ({ id: model })),
    ...(input.serviceType ? { serviceType: input.serviceType } : {}),
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  };

  if (!isLocalSecretStorageEnabled()) {
    log.info(
      {
        projectRoot,
        sourceId,
        platform: process.platform,
      },
      'Local secret storage unavailable; persisting model config apiKey in plaintext',
    );
    return { ...baseRecord, apiKey: input.apiKey };
  }

  writeSecretRef(apiKeyRef, input.apiKey);
  return { ...baseRecord, apiKeyRef };
}

async function writeProjectModelConfigDocument(projectRoot: string, document: Record<string, unknown>): Promise<void> {
  const filePath = resolveProjectModelConfigPath(projectRoot);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');
}

async function migratePlaintextApiKeysIfNeeded(
  projectRoot: string,
  document: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!isLocalSecretStorageEnabled()) return document;

  let dirty = false;
  const nextDocument = { ...document };
  for (const [id, rawValue] of Object.entries(nextDocument)) {
    if (!isRecord(rawValue)) continue;
    const protocol = typeof rawValue.protocol === 'string' ? rawValue.protocol.trim().toLowerCase() : '';
    if (protocol !== 'openai') continue;

    const apiKey = typeof rawValue.apiKey === 'string' ? rawValue.apiKey.trim() : '';
    const apiKeyRef = typeof rawValue.apiKeyRef === 'string' ? rawValue.apiKeyRef.trim() : '';
    if (!apiKey || apiKeyRef) continue;

    try {
      const nextRef = buildModelConfigSourceApiKeyRef(projectRoot, id);
      writeSecretRef(nextRef, apiKey);
      const migratedValue: Record<string, unknown> = { ...rawValue, apiKeyRef: nextRef };
      delete migratedValue.apiKey;
      nextDocument[id] = migratedValue;
      dirty = true;
    } catch {
      continue;
    }
  }

  if (dirty) {
    await writeProjectModelConfigDocument(projectRoot, nextDocument);
  }
  return nextDocument;
}

export function resolveProjectModelConfigPath(projectRoot: string): string {
  return join(resolveProviderProfilesRootSync(projectRoot), '.office-claw', 'model.json');
}

export function isModelConfigProviderFallbackEnabled(): boolean {
  const raw = process.env[MODEL_CONFIG_FALLBACK_ENV]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export async function readProjectModelConfigDocument(projectRoot: string): Promise<Record<string, unknown> | null> {
  const filePath = resolveProjectModelConfigPath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as { code?: string })?.code === 'ENOENT') return null;
    throw error;
  }

  const trimmed = raw.trim();
  if (!trimmed) return {};
  const document = normalizeModelConfigRecord(JSON.parse(trimmed) as unknown);
  return migratePlaintextApiKeysIfNeeded(projectRoot, document);
}

export async function readProjectModelConfigBindings(projectRoot: string): Promise<ModelConfigBinding[] | null> {
  const parsedRaw = await readProjectModelConfigDocument(projectRoot);
  if (!parsedRaw) return null;

  const apiKeyRefs: string[] = [];
  for (const [, value] of Object.entries(parsedRaw)) {
    if (isRecord(value) && typeof value.apiKeyRef === 'string' && value.apiKeyRef.trim()) {
      apiKeyRefs.push(value.apiKeyRef.trim());
    }
  }

  preloadSecretRefs(apiKeyRefs);

  return Object.entries(parsedRaw)
    .map(([id, value]) => {
      const trimmedId = id.trim();
      if (!trimmedId) return null;
      return normalizeModelSourceBinding(trimmedId, value);
    })
    .filter((entry): entry is ModelConfigBinding => entry !== null);
}

export async function createProjectModelConfigSource(
  projectRoot: string,
  input: CreateProjectModelConfigSourceInput,
): Promise<ModelConfigBinding> {
  const trimmedId = input.id.trim();
  if (!trimmedId) {
    throw new Error('model config source id is required');
  }
  if (trimmedId === HUAWEI_MAAS_MODEL_SOURCE_ID) {
    throw new Error(`model config source "${HUAWEI_MAAS_MODEL_SOURCE_ID}" is reserved`);
  }

  const existingDocument = (await readProjectModelConfigDocument(projectRoot)) ?? {};
  if (existingDocument[trimmedId] !== undefined) {
    throw new Error(`model config source "${trimmedId}" already exists`);
  }

  const models = Array.from(new Set(input.models.map((model) => model.trim()).filter(Boolean)));
  if (models.length === 0) {
    throw new Error('at least one model is required');
  }

  const serviceType = normalizeServiceType(input.serviceType);
  const baseUrl = normalizeBaseUrlForServiceType(input.baseUrl.trim(), serviceType);
  const apiKey = input.apiKey.trim();
  if (!baseUrl || !apiKey) {
    throw new Error('baseUrl and apiKey are required');
  }

  const displayName = normalizeDisplayNameForServiceType(input.displayName?.trim(), serviceType);
  const description = input.description?.trim();
  const icon = input.icon?.trim();
  const headers = normalizeHeaderMap(input.headers);
  const now = new Date().toISOString();
  const nextDocument: Record<string, unknown> = {
    ...existingDocument,
    [trimmedId]: buildModelConfigOpenAiRecord(projectRoot, trimmedId, {
      ...(displayName ? { displayName } : {}),
      ...(description ? { description } : {}),
      ...(icon ? { icon } : {}),
      baseUrl,
      apiKey,
      ...(headers ? { headers } : {}),
      models,
      ...(serviceType ? { serviceType } : {}),
      createdAt: now,
      updatedAt: now,
    }),
  };

  await writeProjectModelConfigDocument(projectRoot, nextDocument);

  return {
    id: trimmedId,
    protocol: 'openai',
    ...(displayName ? { displayName } : {}),
    ...(description ? { description } : {}),
    ...(icon ? { icon } : {}),
    baseUrl,
    apiKey,
    ...(isLocalSecretStorageEnabled() ? { apiKeyRef: buildModelConfigSourceApiKeyRef(projectRoot, trimmedId) } : {}),
    ...(headers ? { headers } : {}),
    ...(serviceType ? { serviceType } : {}),
    models,
    createdAt: now,
    updatedAt: now,
  } satisfies ModelConfigBinding;
}

export async function findProjectModelConfigBinding(
  projectRoot: string,
  accountRef: string,
): Promise<ModelConfigBinding | null> {
  const bindings = await readProjectModelConfigBindings(projectRoot);
  if (!bindings) return null;
  const trimmedRef = accountRef.trim();
  return bindings.find((binding) => binding.id === trimmedRef) ?? null;
}

export async function deleteProjectModelConfigSource(projectRoot: string, sourceId: string): Promise<boolean> {
  const trimmedId = sourceId.trim();
  if (!trimmedId) {
    throw new Error('model config source id is required');
  }
  if (trimmedId === HUAWEI_MAAS_MODEL_SOURCE_ID) {
    throw new Error(`model config source "${HUAWEI_MAAS_MODEL_SOURCE_ID}" cannot be deleted`);
  }

  const existingDocument = await readProjectModelConfigDocument(projectRoot);
  if (!existingDocument || existingDocument[trimmedId] === undefined) {
    return false;
  }

  const existingValue = existingDocument[trimmedId];
  if (isRecord(existingValue) && typeof existingValue.apiKeyRef === 'string') {
    deleteSecretRef(existingValue.apiKeyRef);
  }

  delete existingDocument[trimmedId];
  await writeProjectModelConfigDocument(projectRoot, existingDocument);
  return true;
}

export async function updateProjectModelConfigSource(
  projectRoot: string,
  sourceId: string,
  input: UpdateProjectModelConfigSourceInput,
): Promise<ModelConfigBinding> {
  const trimmedId = sourceId.trim();
  if (!trimmedId) {
    throw new Error('model config source id is required');
  }
  if (trimmedId === HUAWEI_MAAS_MODEL_SOURCE_ID) {
    throw new Error(`model config source "${HUAWEI_MAAS_MODEL_SOURCE_ID}" cannot be updated`);
  }

  const existingDocument = await readProjectModelConfigDocument(projectRoot);
  if (!existingDocument || existingDocument[trimmedId] === undefined) {
    throw new Error(`model config source "${trimmedId}" not found`);
  }

  const existingValue = existingDocument[trimmedId];
  if (!isRecord(existingValue)) {
    throw new Error(`model config source "${trimmedId}" has invalid format`);
  }

  const existing = normalizeOpenAiBinding(trimmedId, existingValue);
  if (!existing) {
    throw new Error(`model config source "${trimmedId}" is not an editable openai source`);
  }

  const nextServiceType =
    input.serviceType !== undefined ? normalizeServiceType(input.serviceType) : normalizeServiceType(existingValue.serviceType);
  const displayName = normalizeDisplayNameForServiceType(
    input.displayName !== undefined ? input.displayName?.trim() || trimmedId : existing.displayName,
    nextServiceType,
  );
  const description =
    input.description !== undefined
      ? input.description?.trim() || undefined
      : (existingValue.description as string | undefined);
  const icon = input.icon !== undefined ? input.icon?.trim() || undefined : (existingValue.icon as string | undefined);
  const baseUrl = normalizeBaseUrlForServiceType(
    input.baseUrl !== undefined ? input.baseUrl.trim() : (existing.baseUrl ?? ''),
    nextServiceType,
  );
  const inputApiKey = input.apiKey !== undefined ? input.apiKey.trim() : undefined;
  const existingMaskedApiKey = maskModelConfigApiKey(existing.apiKey);
  const apiKey =
    inputApiKey !== undefined
      ? inputApiKey === existingMaskedApiKey
        ? existing.apiKey
        : inputApiKey
      : existing.apiKey;
  const headers =
    input.headers !== undefined ? normalizeHeaderMap(input.headers) : normalizeHeaderMap(existingValue.headers);
  const serviceType = nextServiceType;
  const models =
    input.models !== undefined
      ? Array.from(new Set(input.models.map((model) => model.trim()).filter(Boolean)))
      : existing.models;

  if (!baseUrl || !apiKey) {
    throw new Error('baseUrl and apiKey are required');
  }
  if (models.length === 0) {
    throw new Error('at least one model is required');
  }

  const updatedRecord = buildModelConfigOpenAiRecord(projectRoot, trimmedId, {
    ...(displayName ? { displayName } : {}),
    ...(description ? { description } : {}),
    ...(icon ? { icon } : {}),
    baseUrl,
    apiKey,
    ...(headers ? { headers } : {}),
    models,
    ...(serviceType ? { serviceType } : {}),
    existingApiKeyRef: existing.apiKeyRef,
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  existingDocument[trimmedId] = updatedRecord;
  await writeProjectModelConfigDocument(projectRoot, existingDocument);

  return {
    id: trimmedId,
    protocol: 'openai',
    ...(displayName ? { displayName } : {}),
    ...(description ? { description } : {}),
    ...(icon ? { icon } : {}),
    baseUrl,
    apiKey,
    ...(typeof updatedRecord.apiKeyRef === 'string' ? { apiKeyRef: updatedRecord.apiKeyRef } : {}),
    ...(headers ? { headers } : {}),
    ...(serviceType ? { serviceType } : {}),
    models,
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies ModelConfigBinding;
}

export async function readProjectModelConfigProfileViews(projectRoot: string): Promise<ProviderProfileView[] | null> {
  const bindings = await readProjectModelConfigBindings(projectRoot);
  if (!bindings) return null;

  let fileTimestamp = new Date(0).toISOString();
  try {
    const info = await stat(resolveProjectModelConfigPath(projectRoot));
    fileTimestamp = info.mtime.toISOString();
  } catch {
    fileTimestamp = new Date(0).toISOString();
  }

  return bindings.map((binding) => ({
    id: binding.id,
    provider: binding.id,
    displayName: displayNameForBinding(binding),
    name: displayNameForBinding(binding),
    description: binding.description,
    icon: binding.icon,
    baseUrl: binding.baseUrl,
    headers: binding.headers,
    authType: binding.protocol === 'huawei_maas' ? 'none' : 'api_key',
    kind: 'api_key' as const,
    builtin: false,
    mode: binding.protocol === 'huawei_maas' ? ('none' as const) : ('api_key' as const),
    ...(binding.protocol ? { protocol: binding.protocol } : {}),
    models: binding.models,
    hasApiKey: binding.protocol !== 'huawei_maas' && Boolean(binding.apiKey),
    apiKey: maskModelConfigApiKey(binding.apiKey),
    serviceType: binding.serviceType,
    createdAt: binding.createdAt || fileTimestamp,
    updatedAt: binding.updatedAt || fileTimestamp,
  })) as ProviderProfileView[];
}
