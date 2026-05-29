/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type {
  AcquireBacklogLeaseInput,
  AtomicDispatchInput,
  BacklogItem,
  CreateBacklogItemInput,
  DecideBacklogClaimInput,
  DispatchBacklogItemInput,
  HeartbeatBacklogLeaseInput,
  MarkDoneInput,
  ReclaimBacklogLeaseInput,
  RefreshBacklogItemInput,
  ReleaseBacklogLeaseInput,
  SuggestBacklogClaimInput,
  UpdateBacklogDispatchProgressInput,
} from '@openjiuwen/relay-shared';

export type {
  AcquireBacklogLeaseInput,
  AtomicDispatchInput,
  BacklogItem,
  CreateBacklogItemInput,
  DecideBacklogClaimInput,
  DispatchBacklogItemInput,
  HeartbeatBacklogLeaseInput,
  MarkDoneInput,
  ReclaimBacklogLeaseInput,
  RefreshBacklogItemInput,
  ReleaseBacklogLeaseInput,
  SuggestBacklogClaimInput,
  UpdateBacklogDispatchProgressInput,
};

export interface IBacklogStore {
  create(input: CreateBacklogItemInput): BacklogItem | Promise<BacklogItem>;
  refreshMetadata(itemId: string, input: RefreshBacklogItemInput): BacklogItem | null | Promise<BacklogItem | null>;
  get(itemId: string, userId?: string): BacklogItem | null | Promise<BacklogItem | null>;
  listByUser(userId: string): BacklogItem[] | Promise<BacklogItem[]>;
  suggestClaim(itemId: string, input: SuggestBacklogClaimInput): BacklogItem | null | Promise<BacklogItem | null>;
  decideClaim(itemId: string, input: DecideBacklogClaimInput): BacklogItem | null | Promise<BacklogItem | null>;
  updateDispatchProgress(
    itemId: string,
    input: UpdateBacklogDispatchProgressInput,
  ): BacklogItem | null | Promise<BacklogItem | null>;
  markDispatched(itemId: string, input: DispatchBacklogItemInput): BacklogItem | null | Promise<BacklogItem | null>;
  markDone(itemId: string, input: MarkDoneInput): BacklogItem | null | Promise<BacklogItem | null>;
  acquireLease(itemId: string, input: AcquireBacklogLeaseInput): BacklogItem | null | Promise<BacklogItem | null>;
  heartbeatLease(itemId: string, input: HeartbeatBacklogLeaseInput): BacklogItem | null | Promise<BacklogItem | null>;
  releaseLease(itemId: string, input: ReleaseBacklogLeaseInput): BacklogItem | null | Promise<BacklogItem | null>;
  reclaimExpiredLease(
    itemId: string,
    input: ReclaimBacklogLeaseInput,
  ): BacklogItem | null | Promise<BacklogItem | null>;
  tryAcquireDispatchLock?(itemId: string, ttlMs?: number): Promise<string | false>;
  releaseDispatchLock?(itemId: string, token: string): Promise<void>;
  atomicDispatch?(itemId: string, input: AtomicDispatchInput): BacklogItem | null | Promise<BacklogItem | null>;
}
