/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import Fastify from 'fastify';
import { AgentRegistry } from '../dist/domains/agents/services/agents/registry/AgentRegistry.js';
import { configRoutes } from '../dist/routes/config.js';
import { DefaultRelayClawSecurityClient } from '../dist/routes/relayclaw-security-proxy.js';

describe('relayclaw security config route', () => {
  let app;

  afterEach(async () => {
    if (app) await app.close();
  });

  async function setup(client) {
    app = Fastify();
    await app.register(configRoutes, {
      relayClawSecurityClient: client,
    });
    await app.ready();
    return app;
  }

  it('loads relayclaw permissions through the API proxy', async () => {
    const calls = [];
    await setup({
      async getPermissions() {
        calls.push('get');
        return {
          enabled: true,
          rw_enabled: true,
          tools: {
            mcp_exec_command: { '*': 'ask' },
          },
        };
      },
      async setPermissions() {
        throw new Error('not implemented');
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/config/relayclaw/security',
      headers: { 'x-office-claw-user': 'security-admin' },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, ['get']);
    assert.deepEqual(res.json(), {
      permissions: {
        enabled: true,
        rw_enabled: true,
        tools: {
          mcp_exec_command: { '*': 'ask' },
        },
      },
    });
  });

  it('persists relayclaw permissions changes through the API proxy', async () => {
    const updates = [];
    await setup({
      async getPermissions() {
        return { enabled: true, rw_enabled: false, tools: {} };
      },
      async setPermissions(patch) {
        updates.push(patch);
        return {
          enabled: false,
          rw_enabled: true,
          tools: {
            write_memory: 'ask',
          },
        };
      },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/config/relayclaw/security',
      headers: { 'x-office-claw-user': 'security-admin' },
      payload: {
        permissions: {
          enabled: false,
          rw_enabled: true,
          tools: {
            write_memory: 'ask',
          },
        },
      },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(updates, [
      {
        enabled: false,
        rw_enabled: true,
        tools: {
          write_memory: 'ask',
        },
      },
    ]);
    assert.deepEqual(res.json(), {
      permissions: {
        enabled: false,
        rw_enabled: true,
        tools: {
          write_memory: 'ask',
        },
      },
    });
  });

  it('surfaces proxy errors as a bad gateway response', async () => {
    await setup({
      async getPermissions() {
        throw new Error('relayclaw unavailable');
      },
      async setPermissions() {
        throw new Error('not implemented');
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/config/relayclaw/security',
      headers: { 'x-office-claw-user': 'security-admin' },
    });

    assert.equal(res.statusCode, 502);
    assert.match(res.json().error, /relayclaw unavailable/i);
  });

  it('creates a relayclaw runtime on first security access when no live handle exists yet', async () => {
    const calls = [];
    const agentRegistry = new AgentRegistry();
    const requestQueues = new Map();
    const runtime = {
      scopeKey: 'manual-default',
      homeDir: '/tmp/manual-default',
      resolvedUrl: 'ws://127.0.0.1:19094',
      requestQueues,
      sidecar: {
        async ensureStarted() {
          calls.push({ type: 'sidecar.ensureStarted' });
          return runtime.resolvedUrl;
        },
        stop() {},
        getRecentLogs() {
          return '';
        },
      },
      connection: {
        async ensureConnected(url) {
          calls.push({ type: 'connect', url });
        },
        send(payload) {
          calls.push({ type: payload.req_method, params: payload.params });
          const queue = requestQueues.get(payload.request_id);
          assert.ok(queue, 'request queue should exist before send');
          if (payload.req_method === 'permissions.enabled.get') {
            queue.put({ ok: true, payload: { enabled: true } });
            return;
          }
          if (payload.req_method === 'permissions.file_guard.workspace.rw_enabled.get') {
            queue.put({ ok: true, payload: { rw_enabled: false } });
            return;
          }
          if (payload.req_method === 'permissions.tools.get') {
            queue.put({ ok: true, payload: { tools: { write_memory: 'ask' } } });
            return;
          }
          throw new Error(`unexpected method ${payload.req_method}`);
        },
        close() {},
        isOpen() {
          return true;
        },
      },
    };

    agentRegistry.register('jiuwenclaw', {
      invoke() {
        throw new Error('not used in this test');
      },
      listRelayClawRuntimeHandles() {
        return [];
      },
      async ensureRelayClawRuntimeHandle() {
        calls.push({ type: 'ensureRelayClawRuntimeHandle' });
        return runtime;
      },
    });

    app = Fastify();
    await app.register(configRoutes, {
      agentRegistry,
    });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/config/relayclaw/security',
      headers: { 'x-cat-cafe-user': 'security-admin' },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      permissions: {
        enabled: true,
        rw_enabled: false,
        tools: {
          write_memory: 'ask',
        },
      },
    });
    assert.equal(calls[0]?.type, 'ensureRelayClawRuntimeHandle');
    assert.equal(calls.filter((entry) => entry.type === 'connect').length, 3);
    assert.equal(calls.filter((entry) => entry.type === 'permissions.enabled.get').length, 1);
    assert.equal(calls.filter((entry) => entry.type === 'permissions.file_guard.workspace.rw_enabled.get').length, 1);
    assert.equal(calls.filter((entry) => entry.type === 'permissions.tools.get').length, 1);
  });

  it('creates a fallback relayclaw agent when the agent registry has no provider yet', async () => {
    const calls = [];
    const requestQueues = new Map();
    const runtime = {
      scopeKey: 'fallback-default',
      homeDir: '/tmp/fallback-default',
      resolvedUrl: 'ws://127.0.0.1:19095',
      requestQueues,
      sidecar: {
        async ensureStarted() {
          return runtime.resolvedUrl;
        },
        stop() {},
        getRecentLogs() {
          return '';
        },
      },
      connection: {
        async ensureConnected(url) {
          calls.push({ type: 'connect', url });
        },
        send(payload) {
          calls.push({ type: payload.req_method, params: payload.params });
          const queue = requestQueues.get(payload.request_id);
          assert.ok(queue, 'request queue should exist before send');
          if (payload.req_method === 'permissions.enabled.get') {
            queue.put({ ok: true, payload: { enabled: false } });
            return;
          }
          if (payload.req_method === 'permissions.file_guard.workspace.rw_enabled.get') {
            queue.put({ ok: true, payload: { rw_enabled: true } });
            return;
          }
          if (payload.req_method === 'permissions.tools.get') {
            queue.put({ ok: true, payload: { tools: { mcp_exec_command: 'ask' } } });
            return;
          }
          throw new Error(`unexpected method ${payload.req_method}`);
        },
        close() {},
        isOpen() {
          return true;
        },
      },
    };
    const emptyRegistry = new AgentRegistry();
    const relayClawSecurityClient = new DefaultRelayClawSecurityClient(emptyRegistry, async () => ({
      invoke() {
        throw new Error('not used in this test');
      },
      listRelayClawRuntimeHandles() {
        return [];
      },
      async ensureRelayClawRuntimeHandle() {
        calls.push({ type: 'ensureRelayClawRuntimeHandle' });
        return runtime;
      },
    }));

    app = Fastify();
    await app.register(configRoutes, {
      agentRegistry: emptyRegistry,
      relayClawSecurityClient,
    });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/config/relayclaw/security',
      headers: { 'x-cat-cafe-user': 'security-admin' },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      permissions: {
        enabled: false,
        rw_enabled: true,
        tools: {
          mcp_exec_command: 'ask',
        },
      },
    });
    assert.equal(calls[0]?.type, 'ensureRelayClawRuntimeHandle');
  });

  it('fans out relayclaw security patches to all live runtimes in the agent registry', async () => {
    const calls = [];
    const agentRegistry = new AgentRegistry();

    function createRuntime(scopeKey) {
      const requestQueues = new Map();
      const runtime = {
        scopeKey,
        homeDir: `/tmp/${scopeKey}`,
        resolvedUrl: `ws://127.0.0.1:${scopeKey === 'scope-a' ? '19091' : '19092'}`,
        requestQueues,
        sidecar: {
          async ensureStarted() {
            return runtime.resolvedUrl;
          },
          stop() {},
          getRecentLogs() {
            return '';
          },
        },
        connection: {
          async ensureConnected(url) {
            calls.push({ scopeKey, type: 'connect', url });
          },
          send(payload) {
            calls.push({ scopeKey, type: payload.req_method, params: payload.params });
            const queue = requestQueues.get(payload.request_id);
            assert.ok(queue, 'request queue should exist before send');
            if (payload.req_method === 'permissions.enabled.get') {
              queue.put({ ok: true, payload: { enabled: false } });
              return;
            }
            if (payload.req_method === 'permissions.file_guard.workspace.rw_enabled.get') {
              queue.put({ ok: true, payload: { rw_enabled: true } });
              return;
            }
            if (payload.req_method === 'permissions.tools.get') {
              queue.put({ ok: true, payload: { tools: { write_memory: 'ask' } } });
              return;
            }
            queue.put({
              ok: true,
              payload: {
                updated_top_level_keys: ['permissions'],
                reloaded: true,
              },
            });
          },
          close() {},
          isOpen() {
            return true;
          },
        },
      };
      return runtime;
    }

    agentRegistry.register('jiuwenclaw', {
      invoke() {
        throw new Error('not used in this test');
      },
      listRelayClawRuntimeHandles() {
        return [createRuntime('scope-a'), createRuntime('scope-b')];
      },
    });

    app = Fastify();
    await app.register(configRoutes, {
      agentRegistry,
    });
    await app.ready();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/config/relayclaw/security',
      headers: { 'x-office-claw-user': 'security-admin' },
      payload: {
        permissions: {
          enabled: false,
          rw_enabled: true,
          tools: {
            write_memory: 'ask',
          },
        },
      },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      permissions: {
        enabled: false,
        rw_enabled: true,
        tools: {
          write_memory: 'ask',
        },
      },
    });

    const enabledSetCalls = calls.filter((entry) => entry.type === 'permissions.enabled.set');
    const rwSetCalls = calls.filter((entry) => entry.type === 'permissions.file_guard.workspace.rw_enabled.set');
    const toolUpdateCalls = calls.filter((entry) => entry.type === 'permissions.tools.update');

    assert.equal(enabledSetCalls.length, 2);
    assert.equal(rwSetCalls.length, 2);
    assert.equal(toolUpdateCalls.length, 2);
    assert.deepEqual(enabledSetCalls.map((entry) => entry.scopeKey).sort(), ['scope-a', 'scope-b']);
    assert.deepEqual(rwSetCalls.map((entry) => entry.scopeKey).sort(), ['scope-a', 'scope-b']);
    assert.deepEqual(toolUpdateCalls.map((entry) => entry.scopeKey).sort(), ['scope-a', 'scope-b']);
    for (const entry of enabledSetCalls) {
      assert.deepEqual(entry.params, { enabled: false });
    }
    for (const entry of rwSetCalls) {
      assert.deepEqual(entry.params, { rw_enabled: true });
    }
    for (const entry of toolUpdateCalls) {
      assert.deepEqual(entry.params, {
        tool: 'write_memory',
        level: 'ask',
      });
    }
  });

  it('reuses the live runtime URL without restarting the sidecar', async () => {
    const agentRegistry = new AgentRegistry();
    const requestQueues = new Map();
    const calls = [];

    agentRegistry.register('jiuwenclaw', {
      invoke() {
        throw new Error('not used in this test');
      },
      listRelayClawRuntimeHandles() {
        return [
          {
            scopeKey: 'scope-live',
            homeDir: '/tmp/scope-live',
            resolvedUrl: 'ws://127.0.0.1:19093',
            requestQueues,
            sidecar: {
              async ensureStarted() {
                throw new Error('sidecar.ensureStarted should not be called for live targets');
              },
              stop() {},
              getRecentLogs() {
                return '';
              },
            },
            connection: {
              async ensureConnected(url) {
                calls.push({ type: 'connect', url });
              },
              send(payload) {
                calls.push({ type: payload.req_method, params: payload.params });
                const queue = requestQueues.get(payload.request_id);
                assert.ok(queue, 'request queue should exist before send');
                if (payload.req_method === 'permissions.enabled.get') {
                  queue.put({ ok: true, payload: { enabled: true } });
                  return;
                }
                if (payload.req_method === 'permissions.file_guard.workspace.rw_enabled.get') {
                  queue.put({ ok: true, payload: { rw_enabled: false } });
                  return;
                }
                if (payload.req_method === 'permissions.tools.get') {
                  queue.put({ ok: true, payload: { tools: { write_memory: 'ask' } } });
                  return;
                }
                queue.put({
                  ok: true,
                  payload: {
                    updated_top_level_keys: ['permissions'],
                    reloaded: true,
                  },
                });
              },
              close() {},
              isOpen() {
                return true;
              },
            },
          },
        ];
      },
    });

    app = Fastify();
    await app.register(configRoutes, {
      agentRegistry,
    });
    await app.ready();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/config/relayclaw/security',
      headers: { 'x-office-claw-user': 'security-admin' },
      payload: {
        permissions: {
          enabled: true,
          tools: {
            write_memory: 'ask',
          },
        },
      },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      permissions: {
        enabled: true,
        rw_enabled: false,
        tools: {
          write_memory: 'ask',
        },
      },
    });
    assert.ok(calls.every((entry) => entry.type !== 'sidecar.ensureStarted'));
    assert.ok(calls.filter((entry) => entry.type === 'connect').every((entry) => entry.url === 'ws://127.0.0.1:19093'));
    assert.deepEqual(
      calls.filter((entry) => entry.type === 'permissions.enabled.set'),
      [
        {
          type: 'permissions.enabled.set',
          params: {
            enabled: true,
          },
        },
      ],
    );
    assert.deepEqual(
      calls.filter((entry) => entry.type === 'permissions.tools.update'),
      [
        {
          type: 'permissions.tools.update',
          params: {
            tool: 'write_memory',
            level: 'ask',
          },
        },
      ],
    );
    assert.equal(calls.filter((entry) => entry.type === 'permissions.enabled.get').length, 1);
    assert.equal(calls.filter((entry) => entry.type === 'permissions.file_guard.workspace.rw_enabled.get').length, 1);
    assert.equal(calls.filter((entry) => entry.type === 'permissions.tools.get').length, 1);
  });
});
