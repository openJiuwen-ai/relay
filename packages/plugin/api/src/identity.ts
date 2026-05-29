/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Gateway Identity — the minimal identity struct passed through the gateway pipeline.
 * Currently contains only userId; extensible for multi-tenant scenarios.
 */
export interface GatewayIdentity {
  userId: string;
}
