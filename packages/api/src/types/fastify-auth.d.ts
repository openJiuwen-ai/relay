/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    authenticatedUserId?: string | null;
  }
}
