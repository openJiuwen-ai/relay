/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export const WorkflowSopKeys = {
  detail: (backlogItemId: string) => `workflow:sop:${backlogItemId}`,
} as const;
