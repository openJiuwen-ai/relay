/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Test helpers for F32-a AgentRegistry migration.
 *
 * Provides createTestAgentRegistry() to convert the old
 * {claudeService, codexService, geminiService} pattern
 * to an AgentRegistry instance.
 */

/**
 * Ensure officeClawRegistry has the three built-in cats registered.
 * Safe to call multiple times (skips if already registered).
 */
export async function ensureCatRegistryPopulated() {
  const { officeClawRegistry, OFFICE_CLAW_CONFIGS } = await import('@openjiuwen/relay-shared');
  for (const [id, config] of Object.entries(OFFICE_CLAW_CONFIGS)) {
    if (!officeClawRegistry.has(id)) {
      officeClawRegistry.register(id, config);
    }
  }
}

/**
 * Create an AgentRegistry from individual service instances.
 * Drop-in replacement for the old AgentRouter constructor pattern.
 */
export async function createTestAgentRegistry(services) {
  const { AgentRegistry } = await import('../../dist/domains/agents/services/agents/registry/AgentRegistry.js');
  const registry = new AgentRegistry();
  if (services.claudeService) registry.register('opus', services.claudeService);
  if (services.codexService) registry.register('codex', services.codexService);
  if (services.geminiService) registry.register('gemini', services.geminiService);
  return registry;
}

/**
 * Convert old-style AgentRouter options to new format.
 * Usage:
 *   const router = new AgentRouter(await migrateRouterOpts({
 *     claudeService, codexService, geminiService,
 *     registry, messageStore, ...rest
 *   }));
 */
export async function migrateRouterOpts(oldOpts) {
  await ensureCatRegistryPopulated();
  const { claudeService, codexService, geminiService, ...rest } = oldOpts;
  const agentRegistry = await createTestAgentRegistry({ claudeService, codexService, geminiService });
  return { agentRegistry, ...rest };
}
