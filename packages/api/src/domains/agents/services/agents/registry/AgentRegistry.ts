/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * AgentRegistry — runtime mapping from agentId → AgentService.
 *
 * Populated at startup alongside AgentRegistry.
 * AgentRouter reads from this instead of hardcoded named parameters.
 */

import type { AgentService } from '../../types.js';

export class AgentRegistry {
  private services = new Map<string, AgentService>();

  /** Register an {@link AgentService} for an agent. Throws if already registered. */
  register(agentId: string, service: AgentService): void {
    if (this.services.has(agentId)) {
      throw new Error(`AgentService for "${agentId}" is already registered`);
    }
    this.services.set(agentId, service);
  }

  /** Retrieve the {@link AgentService} for an agent. Throws if not registered. */
  get(agentId: string): AgentService {
    const service = this.services.get(agentId);
    if (!service) {
      throw new Error(
        `No AgentService registered for "${agentId}". Registered: ${Array.from(this.services.keys()).join(', ')}`,
      );
    }
    return service;
  }

  /** Check whether an {@link AgentService} is registered for an agent. */
  has(agentId: string): boolean {
    return this.services.has(agentId);
  }

  /** Return a shallow copy of all registered agent → service entries. */
  getAllEntries(): Map<string, AgentService> {
    return new Map(this.services);
  }

  /** Clear all entries. For testing only. */
  reset(): void {
    this.services.clear();
  }
}
