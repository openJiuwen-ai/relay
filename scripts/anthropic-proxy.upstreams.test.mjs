/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createNetServer } from 'node:net';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const proxyScript = fileURLToPath(new URL('./anthropic-proxy.mjs', import.meta.url));

async function freePort() {
  const server = createNetServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

async function startProxy(upstreamsPath) {
  const port = await freePort();
  const child = spawn(process.execPath, [proxyScript, '--port', String(port), '--upstreams', upstreamsPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`proxy exited before listening:\n${output}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__probe__/v1/messages`, {
        signal: AbortSignal.timeout(200),
      });
      if (response.status === 404) return { child, port };
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill();
  throw new Error(`proxy did not listen:\n${output}`);
}

test('prototype-named paths are unknown upstreams, not crashes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'anthropic-proxy-'));
  const upstreamsPath = join(directory, 'upstreams.json');
  await writeFile(upstreamsPath, '{}');
  let proxy;
  t.after(async () => {
    proxy?.child.kill();
    await rm(directory, { force: true, recursive: true });
  });

  proxy = await startProxy(upstreamsPath);
  for (const slug of ['constructor', '__proto__', 'toString']) {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/${slug}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 404, `${slug} must not resolve through Object.prototype`);
    assert.equal(proxy.child.exitCode, null, `proxy crashed on /${slug}`);
  }
});

test('a configured slug still forwards to its upstream with path and query', async (t) => {
  let upstreamRequest;
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    upstreamRequest = { body, method: req.method, url: req.url };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const upstreamPort = upstream.address().port;

  const directory = await mkdtemp(join(tmpdir(), 'anthropic-proxy-'));
  const upstreamsPath = join(directory, 'upstreams.json');
  await writeFile(upstreamsPath, JSON.stringify({ gateway: `http://127.0.0.1:${upstreamPort}/api` }));
  let proxy;
  t.after(async () => {
    proxy?.child.kill();
    upstream.close();
    await once(upstream, 'close');
    await rm(directory, { force: true, recursive: true });
  });

  proxy = await startProxy(upstreamsPath);
  const response = await fetch(`http://127.0.0.1:${proxy.port}/gateway/v1/messages?beta=1`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [], model: 'test' }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(upstreamRequest.method, 'POST');
  assert.equal(upstreamRequest.url, '/api/v1/messages?beta=1');
  assert.equal(upstreamRequest.body, JSON.stringify({ messages: [], model: 'test' }));
});
