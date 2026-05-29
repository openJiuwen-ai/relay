/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Simplified connector secret updater.
 *
 * Non-sensitive connector config is written to `.env`.
 * On Windows, sensitive connector secrets are stored in the local secret store
 * and `.env` only keeps a `*_REF` pointer.
 */

import { resolve } from 'node:path';
import type { RuntimeEnvStore } from '@openjiuwen/relay-api-server-contracts/runtime-env';
import type { ConnectorRuntimeApplySummary, ConnectorRuntimeReconciler } from '../infrastructure/connectors/ConnectorRuntimeManager.js';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';
import {
  buildConnectorEnvRefVarName,
  getConnectorEnvValue,
  isConnectorSecretBackedEnvVarName,
} from './local-secret-store.js';
import { resolveRuntimeEnvStore } from './runtime-env-store-resolver.js';

export interface ConnectorSecretUpdate {
  name: string;
  value: string | null;
}

export interface ConnectorSecretUpdaterOptions {
  envFilePath?: string;
  runtimeEnvStore?: RuntimeEnvStore;
  reconciler?: ConnectorRuntimeReconciler;
}

function captureProcessEnvSnapshot(names: Iterable<string>): Map<string, string | undefined> {
  const snapshot = new Map<string, string | undefined>();
  for (const name of names) {
    snapshot.set(name, process.env[name]);
  }
  return snapshot;
}

function restoreProcessEnvSnapshot(snapshot: Map<string, string | undefined>): void {
  for (const [name, value] of snapshot) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

export async function applyConnectorSecretUpdates(
  updates: ConnectorSecretUpdate[],
  opts: ConnectorSecretUpdaterOptions = {},
): Promise<{ changedKeys: string[]; runtime?: ConnectorRuntimeApplySummary }> {
  const envFilePath = opts.envFilePath ?? resolve(resolveActiveProjectRoot(), '.env');
  const runtimeEnvStore = await resolveRuntimeEnvStore({
    envFilePath,
    runtimeEnvStore: opts.runtimeEnvStore,
  });
  const updatesMap = new Map<string, string | null>(updates.map((update) => [update.name, update.value]));
  const nextValues = new Map<string, string>();

  const oldValues = new Map<string, string | undefined>();
  for (const name of updatesMap.keys()) {
    oldValues.set(name, getConnectorEnvValue(name) ?? process.env[name]);
  }

  const persistedUpdates: Record<string, string | null> = {};
  const snapshotKeys = new Set<string>();
  for (const name of updatesMap.keys()) {
    snapshotKeys.add(name);
    snapshotKeys.add(buildConnectorEnvRefVarName(name));
  }
  const envSnapshot = captureProcessEnvSnapshot(snapshotKeys);

  for (const [name, value] of updatesMap) {
    const normalizedValue = value == null ? null : value.trim();
    const refName = buildConnectorEnvRefVarName(name);

    if (normalizedValue == null || normalizedValue === '') {
      delete process.env[name];
      delete process.env[refName];
      persistedUpdates[name] = null;
      nextValues.set(name, '');
    } else {
      process.env[name] = normalizedValue;
      persistedUpdates[name] = normalizedValue;
      if (!isConnectorSecretBackedEnvVarName(name)) {
        delete process.env[refName];
      }
      nextValues.set(name, normalizedValue);
    }
  }

  try {
    await runtimeEnvStore.save(persistedUpdates);
  } catch (error) {
    restoreProcessEnvSnapshot(envSnapshot);
    throw error;
  }

  const changedKeys = [...updatesMap.keys()].filter((name) => (nextValues.get(name) ?? '') !== (oldValues.get(name) ?? ''));

  const runtime = opts.reconciler && changedKeys.length > 0 ? await opts.reconciler.reconcile(changedKeys) : undefined;
  return runtime ? { changedKeys, runtime } : { changedKeys };
}
