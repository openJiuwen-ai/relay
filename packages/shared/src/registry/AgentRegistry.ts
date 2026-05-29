/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * AgentRegistry — 运行时智能体注册表
 *
 * 服务启动时从 office-claw-config.json 注册所有猫。
 * 路由层和业务逻辑通过 registry 做运行时校验，
 * 替代旧的编译时 AgentId union 校验。
 */

import type { OfficeClawConfigEntry } from '../types/agent.js';
import type { AgentId } from '../types/ids.js';
import { createAgentId } from '../types/ids.js';

export interface AgentRegistryEntry {
  readonly config: OfficeClawConfigEntry;
}

export type OfficeClawRegistryEntry = AgentRegistryEntry;

export class AgentRegistry {
  private entries = new Map<string, AgentRegistryEntry>();

  /**
   * Register a agent. Throws on duplicate ID.
   */
  register(agentId: string, config: OfficeClawConfigEntry): void {
    if (this.entries.has(agentId)) {
      throw new Error(`Cat "${agentId}" is already registered`);
    }
    this.entries.set(agentId, { config });
  }

  has(agentId: string): boolean {
    return this.entries.has(agentId);
  }

  /**
   * Get entry — throws if not found. Use at boundary layers (routes, MCP callbacks).
   */
  getOrThrow(agentId: string): AgentRegistryEntry {
    const entry = this.entries.get(agentId);
    if (!entry) {
      throw new Error(`Unknown agent ID: "${agentId}". Registered: ${this.getAllIds().join(', ')}`);
    }
    return entry;
  }

  /**
   * Get entry — returns undefined if not found. Use where fallback is acceptable.
   */
  tryGet(agentId: string): AgentRegistryEntry | undefined {
    return this.entries.get(agentId);
  }

  getAllIds(): AgentId[] {
    return Array.from(this.entries.keys()).map((id) => createAgentId(id));
  }

  getAllConfigs(): Record<string, OfficeClawConfigEntry> {
    const result: Record<string, OfficeClawConfigEntry> = {};
    for (const [id, entry] of this.entries) {
      result[id] = entry.config;
    }
    return result;
  }

  /**
   * Non-empty tuple for z.enum() compat (if needed).
   * Throws if registry is empty.
   */
  getValidAgentIds(): [string, ...string[]] {
    const ids = Array.from(this.entries.keys());
    if (ids.length === 0) {
      throw new Error('AgentRegistry is empty — was it initialized before use?');
    }
    return ids as [string, ...string[]];
  }

  /** Clear all entries. For testing only. */
  reset(): void {
    this.entries.clear();
  }
}

export class OfficeClawRegistry extends AgentRegistry {}

/** Global singleton — populated at startup from office-claw-config.json */
export const officeClawRegistry = new AgentRegistry();
export const agentRegistry = officeClawRegistry;

/**
 * Assert that a string is a registered agent ID. Throws if not.
 * Use at system boundaries (route handlers, MCP callbacks, external input).
 *
 * Unlike createAgentId() which only checks syntax, this validates
 * against the runtime registry.
 */
export function assertKnownAgentId(id: string): AgentId {
  officeClawRegistry.getOrThrow(id);
  return createAgentId(id);
}
