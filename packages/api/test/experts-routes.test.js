/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Fastify from 'fastify';

describe('Experts routes', () => {
  let app;

  beforeEach(async () => {
    const { expertsRoutes } = await import('../dist/routes/experts.js');

    app = Fastify();
    await app.register(expertsRoutes, {
      threadStore: {
        get: async () => null,
        getInvitedExperts: async () => [],
        inviteExpert: async () => {},
        removeExpert: async () => {},
      },
    });
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('boots experts routes without schema build errors', async () => {
    assert.ok(app);
  });
});
