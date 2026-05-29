/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';

await import('tsx/esm');
const { terminalRoutes } = await import('../src/routes/terminal.ts');

describe('terminal route identity hardening', () => {
  let app;

  before(async () => {
    app = Fastify();
    await app.register(fastifyWebsocket);
    await app.register(terminalRoutes, {});
    await app.ready();
  });

  after(async () => {
    await app?.close();
  });

  it('rejects query-only identity on terminal status route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/terminal/status?userId=spoofed-query-user',
    });

    assert.equal(res.statusCode, 401);
    assert.match(res.body, /X-Office-Claw-User header/);
  });

  it('accepts X-Office-Claw-User header on terminal status route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/terminal/status',
      headers: { 'X-Office-Claw-User': 'owner-1' },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(typeof body.available, 'boolean');
  });

  it('still rejects query-only identity on terminal agent pane listing route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/terminal/agent-panes?worktreeId=wt-1&userId=spoofed-query-user',
    });

    assert.equal(res.statusCode, 401);
    assert.match(res.body, /X-Office-Claw-User header/);
  });
});
