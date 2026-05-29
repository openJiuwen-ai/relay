/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { BacklogAuditActor, CreateBacklogItemInput } from '@openjiuwen/relay-shared';

export function makeUserActor(userId: string): BacklogAuditActor {
  return { kind: 'user', id: userId };
}

export function makeAgentActor(agentId: string): BacklogAuditActor {
  return { kind: 'agent', id: agentId };
}

export function makeCreatorActor(input: CreateBacklogItemInput): BacklogAuditActor {
  return input.createdBy === 'user' ? makeUserActor(input.userId) : makeAgentActor(input.createdBy);
}
