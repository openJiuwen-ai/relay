/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RuntimeEnvStore } from '@openjiuwen/relay-api-server-contracts/runtime-env';
import { bootstrapRuntimeEnv, createLocalDotenvRuntimeEnvStore } from './runtime-env-store.js';

const RUNTIME_ENV_STORE_KEY = '__office_claw_runtime_env_store';
const RUNTIME_ENV_STORE_KIND = 'runtime-env-store';
const discoveredRuntimeEnvStorePromises = new Map<string, Promise<RuntimeEnvStore | null>>();

function getRuntimeEnvStoreHolder(): Record<string, unknown> {
  return globalThis as Record<string, unknown>;
}

export function getConfiguredRuntimeEnvStore(): RuntimeEnvStore | null {
  const candidate = getRuntimeEnvStoreHolder()[RUNTIME_ENV_STORE_KEY];
  if (!candidate) return null;
  return candidate as RuntimeEnvStore;
}

export function setConfiguredRuntimeEnvStore(store: RuntimeEnvStore | null | undefined): void {
  const holder = getRuntimeEnvStoreHolder();
  if (store) {
    holder[RUNTIME_ENV_STORE_KEY] = store;
    return;
  }
  delete holder[RUNTIME_ENV_STORE_KEY];
}

export async function discoverRuntimeEnvStore(searchPaths?: string[]): Promise<RuntimeEnvStore | null> {
  const cacheKey = buildDiscoveryCacheKey(searchPaths);
  const cached = discoveredRuntimeEnvStorePromises.get(cacheKey);
  if (cached) return cached;

  const discoveredPromise = discoverRuntimeEnvStoreUncached(searchPaths);
  discoveredRuntimeEnvStorePromises.set(cacheKey, discoveredPromise);
  try {
    return await discoveredPromise;
  } catch (error) {
    discoveredRuntimeEnvStorePromises.delete(cacheKey);
    throw error;
  }
}

async function discoverRuntimeEnvStoreUncached(searchPaths?: string[]): Promise<RuntimeEnvStore | null> {
  const paths = searchPaths ?? resolveDefaultSearchPaths();

  for (const searchPath of paths) {
    const discovered = await scanRuntimeEnvStoreDirectory(searchPath);
    if (discovered) return discovered;
  }

  return null;
}

async function scanRuntimeEnvStoreDirectory(searchPath: string): Promise<RuntimeEnvStore | null> {
  if (!existsSync(searchPath)) return null;
  return scanRuntimeEnvStoreCandidates(searchPath);
}

async function scanRuntimeEnvStoreCandidates(rootDir: string): Promise<RuntimeEnvStore | null> {
  let entries: string[];
  try {
    entries = readdirSync(rootDir);
  } catch {
    return null;
  }

  for (const entry of entries.sort()) {
    const pkgDir = join(rootDir, entry);
    if (entry.startsWith('@')) {
      const discoveredFromScope = await scanRuntimeEnvStoreCandidates(pkgDir);
      if (discoveredFromScope) return discoveredFromScope;
      continue;
    }
    const discovered = await tryLoadRuntimeEnvStore(pkgDir);
    if (discovered) return discovered;
  }

  return null;
}

async function tryLoadRuntimeEnvStore(pkgDir: string): Promise<RuntimeEnvStore | null> {
  const pkgJsonPath = join(pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) return null;

  try {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
      main?: string;
      clowder?: { kind?: string };
    };
    if (pkgJson.clowder?.kind !== RUNTIME_ENV_STORE_KIND) return null;

    const mainField = pkgJson.main ?? 'index.js';
    const mainPath = join(pkgDir, mainField);
    if (!existsSync(mainPath)) return null;

    const mod = await import(pathToFileURL(mainPath).href);
    return await instantiateRuntimeEnvStore(mod);
  } catch {
    return null;
  }
}

async function instantiateRuntimeEnvStore(mod: Record<string, unknown>): Promise<RuntimeEnvStore | null> {
  const candidate = mod.createRuntimeEnvStore ?? mod.default ?? mod;
  if (typeof candidate === 'function') {
    const created = await candidate();
    return isRuntimeEnvStore(created) ? created : null;
  }
  return isRuntimeEnvStore(candidate) ? candidate : null;
}

function isRuntimeEnvStore(candidate: unknown): candidate is RuntimeEnvStore {
  return Boolean(
    candidate &&
      typeof candidate === 'object' &&
      typeof (candidate as RuntimeEnvStore).load === 'function' &&
      typeof (candidate as RuntimeEnvStore).save === 'function',
  );
}

function resolveDefaultSearchPaths(): string[] {
  const paths: string[] = [];
  let dir = process.cwd();

  for (let i = 0; i < 10; i++) {
    const nodeModulesDir = join(dir, 'node_modules');
    if (existsSync(nodeModulesDir)) paths.push(nodeModulesDir);

    const packagesDir = join(dir, 'packages');
    if (existsSync(packagesDir)) paths.push(packagesDir);

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return paths;
}

export function resetDiscoveredRuntimeEnvStoreForTests(): void {
  discoveredRuntimeEnvStorePromises.clear();
}

export async function resolveRuntimeEnvStore(options: {
  envFilePath?: string;
  runtimeEnvStore?: RuntimeEnvStore;
  searchPaths?: string[];
} = {}): Promise<RuntimeEnvStore> {
  if (options.runtimeEnvStore) return options.runtimeEnvStore;

  const configuredRuntimeEnvStore = getConfiguredRuntimeEnvStore();
  if (configuredRuntimeEnvStore) return configuredRuntimeEnvStore;

  const discoveredRuntimeEnvStore = await discoverRuntimeEnvStore(options.searchPaths);
  return (
    discoveredRuntimeEnvStore ??
    createLocalDotenvRuntimeEnvStore({ envFilePath: options.envFilePath })
  );
}

export async function bootstrapConfiguredRuntimeEnv(options: {
  envFilePath?: string;
  runtimeEnvStore?: RuntimeEnvStore;
  env?: NodeJS.ProcessEnv;
  searchPaths?: string[];
} = {}): Promise<Record<string, string>> {
  return bootstrapRuntimeEnv(
    await resolveRuntimeEnvStore({
      envFilePath: options.envFilePath,
      runtimeEnvStore: options.runtimeEnvStore,
      searchPaths: options.searchPaths,
    }),
    options.env ?? process.env,
    { preserveExistingBootstrapOnly: true },
  );
}

function buildDiscoveryCacheKey(searchPaths?: string[]): string {
  const normalizedPaths = (searchPaths ?? resolveDefaultSearchPaths()).map((path) => path.trim());
  return JSON.stringify(normalizedPaths);
}
