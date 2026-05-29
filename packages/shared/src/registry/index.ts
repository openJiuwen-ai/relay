/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Registry exports
 */

export type { AgentRegistryEntry, OfficeClawRegistryEntry } from './AgentRegistry.js';
export {
  assertKnownAgentId,
  agentRegistry,
  AgentRegistry,
  officeClawRegistry,
  OfficeClawRegistry,
} from './AgentRegistry.js';

export { agentIdSchema } from './agent-id-schema.js';
