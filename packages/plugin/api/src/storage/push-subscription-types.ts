/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userId: string;
  createdAt: number;
  userAgent?: string;
}

export interface IPushSubscriptionStore {
  upsert(record: PushSubscriptionRecord): void | Promise<void>;
  remove(endpoint: string): boolean | Promise<boolean>;
  removeForUser(userId: string, endpoint: string): boolean | Promise<boolean>;
  listByUser(userId: string): PushSubscriptionRecord[] | Promise<PushSubscriptionRecord[]>;
  listAll(): PushSubscriptionRecord[] | Promise<PushSubscriptionRecord[]>;
}
