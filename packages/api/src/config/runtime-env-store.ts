/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import type { RuntimeEnvStore } from '@openjiuwen/relay-api-server-contracts/runtime-env';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';
import { isBootstrapOnlyEnvVar } from './env-registry.js';
import {
  buildConnectorEnvRefVarName,
  buildConnectorEnvSecretRef,
  clearConnectorEnvSecret,
  deleteSecretRef,
  getConnectorEnvValue,
  isConnectorSecretBackedEnvVarName,
  isLocalSecretStorageEnabled,
  persistConnectorEnvSecret,
  readSecretRef,
  writeSecretRef,
} from './local-secret-store.js';

export interface LocalDotenvRuntimeEnvStoreOptions {
  envFilePath?: string;
}

function shouldSkipStartupEnvHydration(name: string, env: NodeJS.ProcessEnv): boolean {
  // Memory mode is a concrete startup decision made by launcher scripts after
  // they probe Redis availability. Do not resurrect REDIS_URL from .env once
  // the launcher has explicitly switched the process into memory mode.
  return name === 'REDIS_URL' && env.MEMORY_STORE === '1' && (!env.REDIS_URL || env.REDIS_URL === '');
}

function formatEnvFileValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"')}"`;
}

function applyEnvUpdatesToFile(contents: string, updates: Map<string, string | null>): string {
  const lines = contents === '' ? [] : contents.split(/\r?\n/);
  const seen = new Set<string>();
  const nextLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) {
      nextLines.push(line);
      continue;
    }
    const name = match[1]!;
    if (!updates.has(name)) {
      nextLines.push(line);
      continue;
    }
    seen.add(name);
    const value = updates.get(name);
    if (value == null || value === '') continue;
    nextLines.push(`${name}=${formatEnvFileValue(value)}`);
  }

  for (const [name, value] of updates) {
    if (seen.has(name) || value == null || value === '') continue;
    nextLines.push(`${name}=${formatEnvFileValue(value)}`);
  }

  const normalized = nextLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  return normalized.length > 0 ? `${normalized}\n` : '';
}

function parseEnvFile(contents: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(parseEnv(contents)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

class LocalDotenvRuntimeEnvStore implements RuntimeEnvStore {
  private readonly envFilePath: string;

  constructor(options: LocalDotenvRuntimeEnvStoreOptions = {}) {
    const envFilePath = options.envFilePath ?? resolve(resolveActiveProjectRoot(), '.env');
    this.envFilePath = envFilePath;
  }

  async load(): Promise<Record<string, string>> {
    const current = existsSync(this.envFilePath) ? readFileSync(this.envFilePath, 'utf8') : '';
    const parsed = parseEnvFile(current);
    const loaded: Record<string, string> = {};

    for (const [name, value] of Object.entries(parsed)) {
      loaded[name] = value;
    }

    for (const [name, value] of Object.entries(parsed)) {
      if (!name.endsWith('_REF') || typeof value !== 'string' || !value.trim()) continue;
      const baseName = name.slice(0, -4);
      if (!isConnectorSecretBackedEnvVarName(baseName)) continue;
      const secret = readSecretRef(value);
      if (typeof secret === 'string' && secret.trim()) {
        loaded[baseName] = secret.trim();
      }
    }

    return loaded;
  }

  async save(updates: Record<string, string | null>): Promise<void> {
    const current = existsSync(this.envFilePath) ? readFileSync(this.envFilePath, 'utf8') : '';
    const currentParsed = parseEnvFile(current);
    const fileUpdates = new Map<string, string | null>();
    const secretBacked = isLocalSecretStorageEnabled();
    const secretRollback = new Map<string, { refValue: string; secretValue: string | null }>();

    try {
      for (const [name, value] of Object.entries(updates)) {
        const normalizedValue = value == null ? null : value;
        const refName = buildConnectorEnvRefVarName(name);

        if (isConnectorSecretBackedEnvVarName(name) && secretBacked) {
          const currentRefValue = currentParsed[refName] ?? process.env[refName] ?? buildConnectorEnvSecretRef(name);
          secretRollback.set(name, {
            refValue: currentRefValue,
            secretValue: readSecretRef(currentRefValue),
          });

          const trimmed = normalizedValue?.trim() ?? '';
          if (!trimmed) {
            clearConnectorEnvSecret(name);
            fileUpdates.set(name, null);
            fileUpdates.set(refName, null);
            delete process.env[refName];
          } else {
            const persisted = persistConnectorEnvSecret(name, trimmed);
            fileUpdates.set(name, null);
            fileUpdates.set(persisted.refName, persisted.refValue);
            process.env[persisted.refName] = persisted.refValue;
          }
          continue;
        }

        if (isConnectorSecretBackedEnvVarName(name)) {
          clearConnectorEnvSecret(name);
          fileUpdates.set(refName, null);
          delete process.env[refName];
        }

        if (normalizedValue == null || normalizedValue === '') {
          fileUpdates.set(name, null);
        } else {
          fileUpdates.set(name, normalizedValue);
        }
      }

      const next = applyEnvUpdatesToFile(current, fileUpdates);
      writeFileSync(this.envFilePath, next, 'utf8');
    } catch (error) {
      for (const { refValue, secretValue } of secretRollback.values()) {
        if (secretValue == null) {
          deleteSecretRef(refValue);
        } else {
          writeSecretRef(refValue, secretValue);
        }
      }
      throw error;
    }
  }
}

export function createLocalDotenvRuntimeEnvStore(
  options: LocalDotenvRuntimeEnvStoreOptions = {},
): RuntimeEnvStore {
  return new LocalDotenvRuntimeEnvStore(options);
}

export async function bootstrapRuntimeEnv(
  store: RuntimeEnvStore,
  env: NodeJS.ProcessEnv = process.env,
  options: { preserveExistingBootstrapOnly?: boolean } = {},
): Promise<Record<string, string>> {
  const loaded = await store.load();

  for (const [name, value] of Object.entries(loaded) as [string, string][]) {
    if (options.preserveExistingBootstrapOnly && shouldSkipStartupEnvHydration(name, env)) {
      continue;
    }
    if (options.preserveExistingBootstrapOnly && isBootstrapOnlyEnvVar(name) && env[name] != null && env[name] !== '') {
      continue;
    }
    env[name] = value;
  }
  return loaded;
}

export function getRuntimeEnvFilePath(
  options: LocalDotenvRuntimeEnvStoreOptions = {},
): string {
  return options.envFilePath ?? resolve(resolveActiveProjectRoot(), '.env');
}

export function readRuntimeEnvValue(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return getConnectorEnvValue(name, env) ?? env[name];
}
