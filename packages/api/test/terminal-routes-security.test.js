/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { WebSocket } from 'ws';

await import('tsx/esm');
const { terminalRoutes } = await import('../src/routes/terminal.ts');

describe('terminal route websocket origin gate', () => {
  let app;
  let baseUrl;

  before(async () => {
    app = Fastify();
    await app.register(fastifyWebsocket);
    await app.register(terminalRoutes, {});
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `ws://127.0.0.1:${port}`;
  });

  after(async () => {
    await app.close();
  });

  it('rejects websocket upgrade from disallowed origin before terminal attach', async () => {
    await assert.rejects(
      () =>
        new Promise((resolve, reject) => {
          const ws = new WebSocket(`${baseUrl}/api/terminal/sessions/session-1/ws`, {
            headers: { Origin: 'https://evil.example' },
          });
          ws.once('open', () => {
            ws.close();
            resolve();
          });
          ws.once('error', reject);
        }),
      /Unexpected server response: 403/,
    );
  });
});
