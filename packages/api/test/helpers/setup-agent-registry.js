/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Auto-populate officeClawRegistry for tests.
 *
 * Prefer the real office-claw-config.json expansion so route tests see the same
 * variant roster as runtime (gpt52/sonnet/spark/etc.), then fall back
 * to shared static defaults if config loading is unavailable.
 *
 * Usage: import './helpers/setup-agent-registry.js';
 */

import { OFFICE_CLAW_CONFIGS, officeClawRegistry } from '@openjiuwen/relay-shared';

async function registerAllAgents() {
  try {
    const { loadCatConfig, toAllCatConfigs } = await import('../../dist/config/office-claw-config-loader.js');
    const allConfigs = toAllCatConfigs(loadCatConfig());
    for (const [id, config] of Object.entries(allConfigs)) {
      if (!officeClawRegistry.has(id)) {
        officeClawRegistry.register(id, config);
      }
    }
    return;
  } catch {
    // Best-effort fallback for contexts without built dist/config support.
  }

  for (const [id, config] of Object.entries(OFFICE_CLAW_CONFIGS)) {
    if (!officeClawRegistry.has(id)) {
      officeClawRegistry.register(id, config);
    }
  }
}

await registerAllAgents();
