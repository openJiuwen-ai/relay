/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Agent Model Configuration
 * F32-b: Dynamic env key resolution — CAT_{CATID}_MODEL (uppercased, hyphens → underscores)
 *
 * 优先级: 环境变量 > officeClawRegistry (from office-claw-config.json) > OFFICE_CLAW_CONFIGS 硬编码
 *
 * 环境变量 examples:
 *   CAT_OPUS_MODEL      → Claude 模型
 *   CAT_OPUS_45_MODEL   → Claude 4.5 模型 (F32-b variant)
 *   CAT_CODEX_MODEL     → Codex 模型
 *   CAT_GEMINI_MODEL    → Gemini 模型
 *
 * 或直接修改项目根目录的 office-claw-config.json
 */

import { OFFICE_CLAW_CONFIGS, officeClawRegistry } from '@openjiuwen/relay-shared';

/**
 * F32-b: Generate dynamic env key from agentId.
 * e.g. "opus" → "CAT_OPUS_MODEL", "opus-45" → "CAT_OPUS_45_MODEL"
 */
function getAgentModelEnvKey(agentId: string): string {
  return `CAT_${agentId.toUpperCase().replace(/-/g, '_')}_MODEL`;
}

/**
 * 获取智能体的实际模型
 * F32-b: Dynamic env key + officeClawRegistry as primary source
 * 优先级: 环境变量 > officeClawRegistry (from office-claw-config.json) > OFFICE_CLAW_CONFIGS 硬编码
 */
export function getAgentModel(agentName: string): string {
  // 1. 环境变量最高优先 (dynamic key: CAT_{CATID}_MODEL)
  const envKey = getAgentModelEnvKey(agentName);
  const envValue = process.env[envKey]?.trim();
  if (envValue) {
    return envValue;
  }

  // 2. officeClawRegistry (populated from office-claw-config.json at startup)
  const entry = officeClawRegistry.tryGet(agentName);
  if (entry) {
    return entry.config.defaultModel;
  }

  // 3. 硬编码默认值 (legacy fallback)
  const config = OFFICE_CLAW_CONFIGS[agentName];
  if (config) {
    return config.defaultModel;
  }

  throw new Error(`No model configured for agent "${agentName}"`);
}

/**
 * 获取所有智能体的模型配置 (用于 ConfigRegistry)
 */
export function getAllAgentModels(): Record<string, string> {
  const result: Record<string, string> = {};
  const allIds = officeClawRegistry.getAllIds().length > 0 ? officeClawRegistry.getAllIds().map(String) : Object.keys(OFFICE_CLAW_CONFIGS);
  for (const agentName of allIds) {
    result[agentName] = getAgentModel(agentName);
  }
  return result;
}
