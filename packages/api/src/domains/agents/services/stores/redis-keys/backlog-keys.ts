/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export const BacklogKeys = {
  detail: (id: string) => `backlog:item:${id}`,
  userList: (userId: string) => `backlog:items:user:${userId}`,
  dispatchLock: (itemId: string) => `backlog:dispatch-lock:${itemId}`,
} as const;
