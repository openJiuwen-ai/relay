/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import type { AcpModelProfilesMetaFile, AcpModelProfilesSecretsFile } from './acp-model-profiles.types.js';
import { normalizeMetaState, normalizeSecretsState } from './acp-model-profiles.normalize.js';
import { resolveProviderProfilesRoot } from './provider-profiles-root.js';

const OFFICE_CLAW_DIR = '.office-claw';
const META_FILENAME = 'acp-model-profiles.json';
const SECRETS_FILENAME = 'acp-model-profiles.secrets.local.json';
const PROVIDER_PROFILES_FILENAME = 'provider-profiles.json';
const modelStoreLocks = new Map<string, Promise<void>>();

interface StoredJsonFile<T> {
  value: T | null;
  fileExists: boolean;
}

export interface AcpModelStoreSnapshot {
  storageRoot: string;
  meta: AcpModelProfilesMetaFile;
  secrets: AcpModelProfilesSecretsFile;
  metaPath: string;
  secretsPath: string;
  needsWrite: boolean;
}

function safePath(projectRoot: string, ...segments: string[]): string {
  const root = resolve(projectRoot);
  const normalized = resolve(root, ...segments);
  const rel = relative(root, normalized);
  if (rel.startsWith(`..${sep}`) || rel === '..') {
    throw new Error(`Path escapes project root: ${normalized}`);
  }
  return normalized;
}

async function readJsonOrNull<T>(filePath: string): Promise<StoredJsonFile<T>> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return {
      value: JSON.parse(raw) as T,
      fileExists: true,
    };
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
    return {
      value: null,
      fileExists: code !== 'ENOENT',
    };
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp-${randomUUID()}`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

async function withStorageRootLock<T>(storageRoot: string, action: () => Promise<T>): Promise<T> {
  const previous = modelStoreLocks.get(storageRoot) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const running = previous.then(() => gate);
  modelStoreLocks.set(storageRoot, running);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (modelStoreLocks.get(storageRoot) === running) {
      modelStoreLocks.delete(storageRoot);
    }
  }
}

export async function withAcpModelStoreLock<T>(
  projectRoot: string,
  action: (storageRoot: string) => Promise<T>,
): Promise<T> {
  const storageRoot = await resolveProviderProfilesRoot(projectRoot);
  return withStorageRootLock(storageRoot, () => action(storageRoot));
}

export async function readRaw(projectRoot: string): Promise<AcpModelStoreSnapshot> {
  const storageRoot = await resolveProviderProfilesRoot(projectRoot);
  const dir = safePath(storageRoot, OFFICE_CLAW_DIR);
  const metaPath = safePath(storageRoot, OFFICE_CLAW_DIR, META_FILENAME);
  const secretsPath = safePath(storageRoot, OFFICE_CLAW_DIR, SECRETS_FILENAME);
  await mkdir(dir, { recursive: true });

  const [metaFile, secretsFile] = await Promise.all([
    readJsonOrNull<AcpModelProfilesMetaFile>(metaPath),
    readJsonOrNull<AcpModelProfilesSecretsFile>(secretsPath),
  ]);
  const normalizedMeta = normalizeMetaState(metaFile.value, metaFile.fileExists);
  const normalizedSecrets = normalizeSecretsState(secretsFile.value, secretsFile.fileExists);

  return {
    storageRoot,
    meta: normalizedMeta.value,
    secrets: normalizedSecrets.value,
    metaPath,
    secretsPath,
    needsWrite: normalizedMeta.dirty || normalizedSecrets.dirty,
  };
}

export async function writeRaw(
  metaPath: string,
  secretsPath: string,
  meta: AcpModelProfilesMetaFile,
  secrets: AcpModelProfilesSecretsFile,
): Promise<void> {
  await writeJsonAtomic(secretsPath, secrets);
  await writeJsonAtomic(metaPath, meta);
}

export async function persistNormalizedRawIfNeeded(snapshot: AcpModelStoreSnapshot): Promise<void> {
  if (!snapshot.needsWrite) return;
  await writeRaw(snapshot.metaPath, snapshot.secretsPath, snapshot.meta, snapshot.secrets);
}

export function resolveProviderProfilesMetaPath(storageRoot: string): string {
  return safePath(storageRoot, OFFICE_CLAW_DIR, PROVIDER_PROFILES_FILENAME);
}
