/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

const { RelayClawAgentService, __relayClawInternals } = await import(
  '../dist/domains/agents/services/agents/providers/RelayClawAgentService.js'
);
const { RelayClawConnectionManager, resolveRelayClawWebSocketCtor } = await import(
  '../dist/domains/agents/services/agents/providers/relayclaw-connection.js'
);
const {
  JiuwenPermissionBridge,
} = await import('../dist/domains/agents/services/auth/JiuwenPermissionBridge.js');
const { AuthorizationManager } = await import('../dist/domains/agents/services/auth/AuthorizationManager.js');
const { AuthorizationRuleStore } = await import('../dist/domains/agents/services/stores/ports/AuthorizationRuleStore.js');
const { PendingRequestStore } = await import('../dist/domains/agents/services/stores/ports/PendingRequestStore.js');
const { AuthorizationAuditStore } = await import('../dist/domains/agents/services/stores/ports/AuthorizationAuditStore.js');
const { buildRelayClawLaunchCommand, DefaultRelayClawSidecarController, isRelayClawRuntimeReady } = await import(
  '../dist/domains/agents/services/agents/providers/relayclaw-sidecar.js'
);
const { jiuwenClawBundleAvailable, resolveJiuwenClawExecutable, resolveJiuwenClawPythonBin } = await import(
  '../dist/utils/jiuwenclaw-paths.js'
);
const {
  buildRelayClawSharedSkillsSignature,
  buildRelayClawSkillsSignatureForDirs,
  resolveOfficeClawSkillsSourceDir,
} = await import('../dist/utils/relayclaw-skills.js');
const { WebSocket: NodeWebSocket } = await import('ws');
const { setLongTermMemoryEnabled, resetLongTermMemoryEnabledForTest } = await import(
  '../dist/config/memory-toggle-state.js'
);

async function collect(iterable) {
  const items = [];
  for await (const item of iterable) items.push(item);
  return items;
}

function createConnectionFactory(onSend) {
  return (requestQueues) => ({
    async ensureConnected() {},
    isOpen() {
      return true;
    },
    send(payload) {
      onSend(payload, requestQueues);
    },
    close() {},
  });
}

class FakeChildProcess extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.exitCode = null;
    this.killed = false;
    this.pid = Math.floor(Math.random() * 100000) + 1000;
  }

  kill(signal = 'SIGTERM') {
    this.killed = true;
    setTimeout(() => {
      this.exitCode = 0;
      this.emit('exit', 0, signal);
    }, 0);
    return true;
  }
}

describe('RelayClawAgentService', () => {
  it('falls back to the ws module when global WebSocket is unavailable', () => {
    const savedWebSocket = global.WebSocket;

    try {
      delete global.WebSocket;
      assert.equal(resolveRelayClawWebSocketCtor(), NodeWebSocket);
    } finally {
      global.WebSocket = savedWebSocket;
    }
  });

  it('connects and sends without a global WebSocket when using the fallback constructor', async () => {
    const savedWebSocket = global.WebSocket;
    const sent = [];

    class FakeFallbackWebSocket {
      static OPEN = 1;

      constructor(url) {
        this.url = url;
        this.readyState = FakeFallbackWebSocket.OPEN;
        this.listeners = new Map();
        queueMicrotask(() => {
          this.dispatch('message', {
            data: JSON.stringify({ type: 'event', event: 'connection.ack' }),
          });
        });
      }

      addEventListener(type, handler) {
        const handlers = this.listeners.get(type) ?? [];
        handlers.push(handler);
        this.listeners.set(type, handlers);
      }

      send(raw) {
        sent.push(raw);
      }

      close() {
        this.readyState = 3;
      }

      dispatch(type, event) {
        for (const handler of this.listeners.get(type) ?? []) handler(event);
      }
    }

    try {
      delete global.WebSocket;
      const manager = new RelayClawConnectionManager({
        requestQueues: new Map(),
        wsFactory: (url) => new FakeFallbackWebSocket(url),
      });

      await manager.ensureConnected('ws://fallback.test');
      assert.equal(manager.isOpen(), true);

      manager.send({ hello: 'world' });
      assert.deepEqual(sent, ['{"hello":"world"}']);
    } finally {
      global.WebSocket = savedWebSocket;
    }
  });

  it('resolves vendored jiuwenclaw venv python on Windows-style paths', () => {
    const appDir = mkdtempSync(join(tmpdir(), 'jiuwenclaw-paths-'));
    const pythonBin =
      process.platform === 'win32'
        ? join(appDir, '.venv', 'Scripts', 'python.exe')
        : join(appDir, '.venv', 'bin', 'python');
    mkdirSync(dirname(pythonBin), { recursive: true });
    writeFileSync(pythonBin, '');

    assert.equal(resolveJiuwenClawPythonBin(undefined, appDir), pythonBin);
  });

  it('marks jiuwenclaw bundle available when app dir and venv python are present', () => {
    const appDir = mkdtempSync(join(tmpdir(), 'jiuwenclaw-bundle-'));
    const appPy = join(appDir, 'jiuwenclaw', 'app.py');
    const pythonBin =
      process.platform === 'win32'
        ? join(appDir, '.venv', 'Scripts', 'python.exe')
        : join(appDir, '.venv', 'bin', 'python');
    mkdirSync(dirname(appPy), { recursive: true });
    mkdirSync(dirname(pythonBin), { recursive: true });
    writeFileSync(appPy, '');
    writeFileSync(pythonBin, '');

    const previousAppDir = process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR;
    try {
      process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR = appDir;
      assert.equal(jiuwenClawBundleAvailable(), true);
    } finally {
      if (previousAppDir === undefined) {
        delete process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR;
      } else {
        process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR = previousAppDir;
      }
    }
  });

  it('prefers vendored jiuwenclaw executable when present', () => {
    const appDir = mkdtempSync(join(tmpdir(), 'jiuwenclaw-exe-'));
    const exePath = join(appDir, 'vendor', 'jiuwenclaw.exe');
    mkdirSync(dirname(exePath), { recursive: true });
    writeFileSync(exePath, '');

    const previousExe = process.env.OFFICE_CLAW_RELAYCLAW_EXE;
    try {
      process.env.OFFICE_CLAW_RELAYCLAW_EXE = exePath;
      assert.equal(resolveJiuwenClawExecutable(), exePath);
      assert.equal(jiuwenClawBundleAvailable(), true);
    } finally {
      if (previousExe === undefined) {
        delete process.env.OFFICE_CLAW_RELAYCLAW_EXE;
      } else {
        process.env.OFFICE_CLAW_RELAYCLAW_EXE = previousExe;
      }
    }
  });

  it('builds an exe launch command when jiuwenclaw.exe is available', () => {
    const launch = buildRelayClawLaunchCommand({
      executablePath: 'C:\\vendor\\jiuwenclaw.exe',
      pythonBin: 'C:\\Python\\python.exe',
      appDir: 'C:\\vendor\\jiuwenclaw',
      useExecutable: true,
      homeDir: 'C:\\runtime-home',
      agentPort: 19000,
      webPort: 5173,
      env: {},
      signature: {},
    });

    assert.equal(launch.command, 'C:\\vendor\\jiuwenclaw.exe');
    assert.deepEqual(launch.args, ['--desktop-run-agentserver']);
    assert.equal(launch.cwd, process.platform === 'win32' ? 'C:\\vendor' : '.');
  });

  it('treats executable mode as ready when both relayclaw ports are listening', async () => {
    const calls = [];
    const ready = await isRelayClawRuntimeReady(
      {
        executablePath: 'C:\\vendor\\jiuwenclaw.exe',
        pythonBin: 'C:\\Python\\python.exe',
        appDir: 'C:\\vendor\\jiuwenclaw',
        useExecutable: true,
        homeDir: 'C:\\runtime-home',
        agentPort: 19000,
        webPort: 19001,
        env: {},
        signature: {},
      },
      async (_host, port) => {
        calls.push(port);
        return true;
      },
      '',
      19000,
      19001,
    );

    assert.equal(ready, true);
    assert.deepEqual(calls, [19000, 19001]);
  });

  it('emits final text when the stream only returns chat.final content', async () => {
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.final',
              content: 'OK',
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('Reply with exactly: OK')) {
      messages.push(msg);
    }

    assert.deepEqual(
      messages.map((msg) => msg.type),
      ['session_init', 'text', 'done'],
    );
    assert.equal(messages[1].content, 'OK');
  });

  it('sends chat.interrupt on abort for jiuwenclaw requests', async () => {
    const sent = [];
    const controller = new AbortController();
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          sent.push(request);
          if (request.req_method === 'chat.send') {
            queueMicrotask(() => controller.abort());
            return;
          }
          if (request.req_method === 'chat.interrupt') {
            const queue = requestQueues.get(request.request_id);
            assert.ok(queue, 'interrupt queue should exist before send');
            queue.put({
              request_id: request.request_id,
              channel_id: request.channel_id,
              ok: true,
              payload: {
                event_type: 'chat.interrupt_result',
                intent: 'cancel',
                success: true,
                message: '任务已取消',
              },
            });
          }
        }),
      },
    );

    const messages = await collect(service.invoke('Write forever', { signal: controller.signal }));

    assert.deepEqual(
      messages.map((msg) => msg.type),
      ['session_init', 'done'],
    );
    assert.equal(sent[0].req_method, 'chat.send');
    assert.equal(sent[1].req_method, 'chat.interrupt');
    assert.equal(sent[1].session_id, sent[0].session_id);
    assert.equal(sent[1].params.intent, 'cancel');
    assert.equal(sent[1].params.request_id, sent[0].request_id);
  });

  it('treats llm_reasoning deltas as thinking and still emits the final answer', async () => {
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.delta',
              content: 'thinking step',
              source_chunk_type: 'llm_reasoning',
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.final',
              content: 'Final answer',
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('Reply with final answer after reasoning')) {
      messages.push(msg);
    }

    assert.deepEqual(
      messages.map((msg) => msg.type),
      ['session_init', 'system_info', 'text', 'done'],
    );
    assert.deepEqual(JSON.parse(messages[1].content), {
      type: 'thinking',
      agentId: 'relayclaw-debug',
      text: 'thinking step',
      mergeStrategy: 'append',
    });
    assert.equal(messages[2].content, 'Final answer');
  });

  it('emits final text even after visible deltas have already been streamed', async () => {
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.delta',
              content: '我来帮你总结一下。',
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.final',
              content: '这里是最终总结。',
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('Summarize after tooling')) {
      messages.push(msg);
    }

    assert.deepEqual(
      messages.map((msg) => msg.type),
      ['session_init', 'text', 'text', 'done'],
    );
    assert.equal(messages[1].content, '我来帮你总结一下。');
    assert.equal(messages[2].content, '\n\n这里是最终总结。');
  });

  it('emits only the final suffix when chat.final extends prior streamed text', async () => {
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.delta',
              content: 'Hello',
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.final',
              content: 'Hello world',
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('Reply with Hello world')) {
      messages.push(msg);
    }

    assert.deepEqual(
      messages.map((msg) => msg.type),
      ['session_init', 'text', 'text', 'done'],
    );
    assert.equal(messages[1].content, 'Hello');
    assert.equal(messages[2].content, ' world');
  });

  it('normalizes structured chat.final payloads before emitting final text', async () => {
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.final',
              content: JSON.stringify({ output: '\nNormalized final text', result_type: 'answer' }),
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('Reply with normalized final text')) {
      messages.push(msg);
    }

    assert.deepEqual(
      messages.map((msg) => msg.type),
      ['session_init', 'text', 'done'],
    );
    assert.equal(messages[1].content, 'Normalized final text');
  });

  it('waits for jiuwenclaw initialization markers before treating the sidecar as ready', () => {
    assert.equal(__relayClawInternals.isSidecarReady('server listening'), false);
    assert.equal(__relayClawInternals.isSidecarReady('[JiuWenClaw] 初始化完成: agent_name=main_agent'), true);
    assert.equal(__relayClawInternals.isSidecarReady('WebChannel 已启动: ws://127.0.0.1:19001/ws'), true);
  });

  it('reuses the existing sidecar child when only the working directory changes', async () => {
    const appDir = mkdtempSync(join(tmpdir(), 'relayclaw-sidecar-'));
    const appPy = join(appDir, 'jiuwenclaw', 'app.py');
    const pythonBin =
      process.platform === 'win32'
        ? join(appDir, '.venv', 'Scripts', 'python.exe')
        : join(appDir, '.venv', 'bin', 'python');
    mkdirSync(dirname(appPy), { recursive: true });
    mkdirSync(dirname(pythonBin), { recursive: true });
    writeFileSync(appPy, '');
    writeFileSync(pythonBin, '');

    const spawned = [];
    const previousAppDir = process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR;
    const previousPython = process.env.OFFICE_CLAW_RELAYCLAW_PYTHON;

    try {
      process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR = appDir;
      process.env.OFFICE_CLAW_RELAYCLAW_PYTHON = pythonBin;

      const controller = new DefaultRelayClawSidecarController(
        'office',
        {
          autoStart: true,
          startupTimeoutMs: 1000,
        },
        {
          spawnFn: () => {
            const child = new FakeChildProcess(`child-${spawned.length + 1}`);
            spawned.push(child);
            return child;
          },
          allocatePort: async () => 19000 + spawned.length,
          tcpProbeFn: async (_host, port) => port >= 19000,
        },
      );

      const firstUrl = await controller.ensureStarted({
        callbackEnv: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
        workingDirectory: '/tmp/project-a',
      });
      assert.match(firstUrl, /^ws:\/\/127\.0\.0\.1:\d+$/);
      assert.equal(spawned.length, 1);

      const secondUrl = await controller.ensureStarted({
        callbackEnv: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
        workingDirectory: '/tmp/project-b',
      });

      assert.equal(secondUrl, firstUrl);
      assert.equal(spawned.length, 1);
      assert.equal(spawned[0].killed, false);
    } finally {
      if (previousAppDir === undefined) {
        delete process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR;
      } else {
        process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR = previousAppDir;
      }
      if (previousPython === undefined) {
        delete process.env.OFFICE_CLAW_RELAYCLAW_PYTHON;
      } else {
        process.env.OFFICE_CLAW_RELAYCLAW_PYTHON = previousPython;
      }
    }
  });

  it('restarts the existing sidecar child when a paid search API key changes', async () => {
    const appDir = mkdtempSync(join(tmpdir(), 'relayclaw-sidecar-'));
    const appPy = join(appDir, 'jiuwenclaw', 'app.py');
    const pythonBin =
      process.platform === 'win32'
        ? join(appDir, '.venv', 'Scripts', 'python.exe')
        : join(appDir, '.venv', 'bin', 'python');
    mkdirSync(dirname(appPy), { recursive: true });
    mkdirSync(dirname(pythonBin), { recursive: true });
    writeFileSync(appPy, '');
    writeFileSync(pythonBin, '');

    const spawned = [];
    const previousAppDir = process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR;
    const previousPython = process.env.OFFICE_CLAW_RELAYCLAW_PYTHON;
    const previousBochaApiKey = process.env.BOCHA_API_KEY;

    try {
      process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR = appDir;
      process.env.OFFICE_CLAW_RELAYCLAW_PYTHON = pythonBin;
      process.env.BOCHA_API_KEY = 'bocha-key-v1';

      const controller = new DefaultRelayClawSidecarController(
        'office',
        {
          autoStart: true,
          startupTimeoutMs: 1000,
        },
        {
          spawnFn: () => {
            const child = new FakeChildProcess(`child-${spawned.length + 1}`);
            spawned.push(child);
            return child;
          },
          allocatePort: async () => 19200 + spawned.length,
          tcpProbeFn: async (_host, port) => port >= 19200,
        },
      );

      const firstUrl = await controller.ensureStarted({
        callbackEnv: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
        workingDirectory: '/tmp/project-a',
      });
      assert.match(firstUrl, /^ws:\/\/127\.0\.0\.1:\d+$/);
      assert.equal(spawned.length, 1);

      process.env.BOCHA_API_KEY = 'bocha-key-v2';

      const secondUrl = await controller.ensureStarted({
        callbackEnv: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
        workingDirectory: '/tmp/project-a',
      });

      assert.match(secondUrl, /^ws:\/\/127\.0\.0\.1:\d+$/);
      assert.equal(spawned.length, 2);
      assert.notEqual(spawned[1], spawned[0]);
    } finally {
      if (previousBochaApiKey === undefined) {
        delete process.env.BOCHA_API_KEY;
      } else {
        process.env.BOCHA_API_KEY = previousBochaApiKey;
      }
      if (previousAppDir === undefined) {
        delete process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR;
      } else {
        process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR = previousAppDir;
      }
      if (previousPython === undefined) {
        delete process.env.OFFICE_CLAW_RELAYCLAW_PYTHON;
      } else {
        process.env.OFFICE_CLAW_RELAYCLAW_PYTHON = previousPython;
      }
    }
  });

  it('keeps shared skill signature stable when only the source directory path changes', () => {
    const firstRoot = mkdtempSync(join(tmpdir(), 'relayclaw-skills-a-'));
    const secondRoot = mkdtempSync(join(tmpdir(), 'relayclaw-skills-b-'));
    const relativeSkillFile = join('example-skill', 'SKILL.md');

    mkdirSync(dirname(join(firstRoot, relativeSkillFile)), { recursive: true });
    mkdirSync(dirname(join(secondRoot, relativeSkillFile)), { recursive: true });
    writeFileSync(join(firstRoot, relativeSkillFile), '# Example\n');
    writeFileSync(join(secondRoot, relativeSkillFile), '# Example\n');

    assert.equal(buildRelayClawSkillsSignatureForDirs([firstRoot]), buildRelayClawSkillsSignatureForDirs([secondRoot]));
  });

  it('reuses the existing sidecar child when shared skill contents change', async () => {
    const appDir = mkdtempSync(join(tmpdir(), 'relayclaw-sidecar-'));
    const appPy = join(appDir, 'jiuwenclaw', 'app.py');
    const pythonBin =
      process.platform === 'win32'
        ? join(appDir, '.venv', 'Scripts', 'python.exe')
        : join(appDir, '.venv', 'bin', 'python');
    mkdirSync(dirname(appPy), { recursive: true });
    mkdirSync(dirname(pythonBin), { recursive: true });
    writeFileSync(appPy, '');
    writeFileSync(pythonBin, '');

    const spawned = [];
    const previousAppDir = process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR;
    const previousPython = process.env.OFFICE_CLAW_RELAYCLAW_PYTHON;
    const skillsRoot = resolveOfficeClawSkillsSourceDir();
    const tempSkillDir = join(skillsRoot, `.relayclaw-test-${process.pid}-${Date.now()}`);

    try {
      process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR = appDir;
      process.env.OFFICE_CLAW_RELAYCLAW_PYTHON = pythonBin;

      const controller = new DefaultRelayClawSidecarController(
        'office',
        {
          autoStart: true,
          startupTimeoutMs: 1000,
        },
        {
          spawnFn: () => {
            const child = new FakeChildProcess(`child-${spawned.length + 1}`);
            spawned.push(child);
            return child;
          },
          allocatePort: async () => 19100 + spawned.length,
          tcpProbeFn: async (_host, port) => port >= 19100,
        },
      );

      const firstUrl = await controller.ensureStarted({
        callbackEnv: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
        workingDirectory: '/tmp/project-a',
      });

      const beforeSkillsSignature = buildRelayClawSharedSkillsSignature();
      mkdirSync(tempSkillDir, { recursive: true });
      writeFileSync(join(tempSkillDir, 'SKILL.md'), '# Runtime Skill Change\n');
      const afterSkillsSignature = buildRelayClawSharedSkillsSignature();
      assert.notEqual(afterSkillsSignature, beforeSkillsSignature);

      const secondUrl = await controller.ensureStarted({
        callbackEnv: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
        workingDirectory: '/tmp/project-a',
      });

      assert.equal(secondUrl, firstUrl);
      assert.equal(spawned.length, 1);
      assert.equal(spawned[0].killed, false);
    } finally {
      rmSync(tempSkillDir, { recursive: true, force: true });
      if (previousAppDir === undefined) {
        delete process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR;
      } else {
        process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR = previousAppDir;
      }
      if (previousPython === undefined) {
        delete process.env.OFFICE_CLAW_RELAYCLAW_PYTHON;
      } else {
        process.env.OFFICE_CLAW_RELAYCLAW_PYTHON = previousPython;
      }
    }
  });

  it('passes project directory, uploaded files, and office-claw MCP config in the WS request', async () => {
    let capturedRequest = null;
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          capturedRequest = request;
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    for await (const _ of service.invoke('Inspect the uploaded image', {
      workingDirectory: '/usr/code/office-claw-runtime',
      uploadDir: '/tmp/office-claw-uploads',
      contentBlocks: [{ type: 'image', url: '/uploads/test-image.png' }],
      callbackEnv: {
        OFFICE_CLAW_API_URL: 'http://127.0.0.1:3004',
        OFFICE_CLAW_INVOCATION_ID: 'invocation-123',
        OFFICE_CLAW_CALLBACK_TOKEN: 'callback-token',
        OFFICE_CLAW_USER_ID: 'codex',
        OFFICE_CLAW_AGENT_ID: 'relayclaw-debug',
      },
    })) {
      // exhaust stream
    }

    assert.ok(capturedRequest);
    assert.equal(capturedRequest.params.project_dir, '/usr/code/office-claw-runtime');
    const expectedUploadPath =
      process.platform === 'win32'
        ? 'D:\\tmp\\office-claw-uploads\\test-image.png'
        : '/tmp/office-claw-uploads/test-image.png';
    assert.deepEqual(capturedRequest.params.files, {
      uploaded: [
        {
          type: 'image',
          name: 'test-image.png',
          path: expectedUploadPath,
        },
      ],
    });
    const normalizedCommand = String(capturedRequest.params.office_claw_mcp.command).replaceAll('\\', '/');
    assert.match(normalizedCommand, /(^node$|\/node(?:\.exe)?$)/);
    assert.ok(Array.isArray(capturedRequest.params.office_claw_mcp.args));
    const normalizedMcpPath = String(capturedRequest.params.office_claw_mcp.args[0]).replaceAll('\\', '/');
    assert.ok(
      normalizedMcpPath.endsWith('/packages/mcp-server/dist/index.js'),
      'office-claw MCP should point at the local MCP server bundle',
    );
    assert.equal(capturedRequest.params.office_claw_mcp.env.OFFICE_CLAW_INVOCATION_ID, 'invocation-123');
    assert.equal(
      capturedRequest.params.office_claw_mcp.env.OFFICE_CLAW_MCP_EXCLUDED_TOOLS,
      [
        'limb_list_available',
        'limb_invoke',
        'limb_pair_list',
        'limb_pair_approve',
        'office_claw_list_tasks',
        'office_claw_update_task',
        'office_claw_load_skill',
        'office_claw_create_rich_block',
        'office_claw_get_rich_block_rules',
        'office_claw_request_permission',
        'office_claw_check_permission_status',
        'office_claw_update_workflow',
        'office_claw_feat_index',
      ].join(','),
    );
    const normalizedQuery = String(capturedRequest.params.query).replaceAll('\\', '/');
    assert.match(
      normalizedQuery,
      /\[Local image path: D:\/tmp\/office-claw-uploads\/test-image\.png\]|\[Local image path: \/tmp\/office-claw-uploads\/test-image\.png\]/,
    );
  });

  it('keeps cat-cafe MCP config when resuming a jiuwen permission interrupt', async () => {
    const sent = [];
    const permissionBridge = new JiuwenPermissionBridge();
    const pendingStore = new PendingRequestStore();
    const authManager = new AuthorizationManager({
      ruleStore: new AuthorizationRuleStore(),
      pendingStore,
      auditStore: new AuthorizationAuditStore(),
    });
    permissionBridge.bindAuthorizationManager(authManager);

    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        permissionBridge,
        createConnection: createConnectionFactory((request, requestQueues) => {
          sent.push(request);
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');

          if (sent.length === 1) {
            queue.put({
              request_id: request.request_id,
              channel_id: request.channel_id,
              payload: {
                event_type: 'chat.ask_user_question',
                request_id: 'jiuwen-permission-1',
                session_id: request.session_id,
                source: 'permission_interrupt',
                questions: [
                  {
                    header: '权限审批',
                    question: '工具 `office_claw_list_schedule_templates` 需要授权',
                    options: [{ label: '本次允许' }, { label: '总是允许' }, { label: '拒绝' }],
                  },
                ],
              },
              is_complete: false,
            });
            queue.put({
              request_id: request.request_id,
              channel_id: request.channel_id,
              payload: { is_complete: true },
              is_complete: true,
            });
            queue.abort();
            return;
          }

          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { event_type: 'chat.final', content: 'resumed' },
            is_complete: false,
          });
          queue.abort();
        }),
      },
    );

    await collect(
      service.invoke('List schedule templates', {
        interactiveAsk: true,
        workingDirectory: '/usr/code/cat-cafe-runtime',
        auditContext: {
          invocationId: 'invocation-123',
          agentId: 'relayclaw-debug',
          threadId: 'thread-123',
          userId: 'codex',
        },
        callbackEnv: {
          OFFICE_CLAW_API_URL: 'http://127.0.0.1:3004',
          OFFICE_CLAW_INVOCATION_ID: 'invocation-123',
          OFFICE_CLAW_CALLBACK_TOKEN: 'callback-token',
          OFFICE_CLAW_USER_ID: 'codex',
          OFFICE_CLAW_CAT_ID: 'relayclaw-debug',
        },
      }),
    );

    const [pending] = pendingStore.listWaiting('thread-123');
    assert.ok(pending, 'permission interrupt should create a pending authorization request');

    const resumedMessages = [];
    const submitted = await permissionBridge.submitAuthorizationDecision({
      localRequestId: pending.requestId,
      granted: true,
      scope: 'global',
      onMessage: (message) => {
        resumedMessages.push(message);
      },
    });

    assert.equal(submitted, true);
    assert.equal(sent.length, 2);
    const resumeRequest = sent[1];
    assert.equal(resumeRequest.req_method, 'chat.send');
    assert.equal(resumeRequest.params.query, '');
    assert.equal(resumeRequest.params.request_id, 'jiuwen-permission-1');
    assert.deepEqual(resumeRequest.params.answers, [{ selected_options: ['总是允许'] }]);
    assert.equal(resumeRequest.params.interactive_ask, true);
    assert.ok(resumeRequest.params.office_claw_mcp, 'resume request should include office-claw MCP config');
    const normalizedCommand = String(resumeRequest.params.office_claw_mcp.command).replaceAll('\\', '/');
    assert.match(normalizedCommand, /(^node$|\/node(?:\.exe)?$)/);
    assert.ok(Array.isArray(resumeRequest.params.office_claw_mcp.args));
    const normalizedMcpPath = String(resumeRequest.params.office_claw_mcp.args[0]).replaceAll('\\', '/');
    assert.ok(
      normalizedMcpPath.endsWith('/packages/mcp-server/dist/index.js'),
      'office-claw MCP should point at the local MCP server bundle',
    );
    assert.equal(resumeRequest.params.office_claw_mcp.env.OFFICE_CLAW_INVOCATION_ID, 'invocation-123');
    assert.match(
      resumeRequest.params.office_claw_mcp.env.OFFICE_CLAW_MCP_EXCLUDED_TOOLS,
      /office_claw_request_permission/,
    );
    assert.deepEqual(
      resumedMessages.map((message) => message.type),
      ['text', 'done'],
    );
  });

  it('passes the relayclaw MCP denylist to the sidecar process env', async () => {
    const appDir = mkdtempSync(join(tmpdir(), 'relayclaw-sidecar-env-'));
    const appPy = join(appDir, 'jiuwenclaw', 'app.py');
    const pythonBin =
      process.platform === 'win32'
        ? join(appDir, '.venv', 'Scripts', 'python.exe')
        : join(appDir, '.venv', 'bin', 'python');
    mkdirSync(dirname(appPy), { recursive: true });
    mkdirSync(dirname(pythonBin), { recursive: true });
    writeFileSync(appPy, '');
    writeFileSync(pythonBin, '');

    let capturedSpawnOptions = null;
    const previousAppDir = process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR;
    const previousPython = process.env.OFFICE_CLAW_RELAYCLAW_PYTHON;

    try {
      process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR = appDir;
      process.env.OFFICE_CLAW_RELAYCLAW_PYTHON = pythonBin;

      const controller = new DefaultRelayClawSidecarController(
        'office',
        {
          autoStart: true,
          startupTimeoutMs: 1000,
        },
        {
          spawnFn: (_command, _args, options) => {
            capturedSpawnOptions = options;
            const child = new FakeChildProcess('relayclaw-env');
            queueMicrotask(() => {
              child.stderr.emit('data', Buffer.from('[JiuWenClaw] 初始化完成: agent_name=main_agent\n', 'utf-8'));
            });
            return child;
          },
          allocatePort: async () => 19100,
          tcpProbeFn: async () => true,
        },
      );

      await controller.ensureStarted({
        callbackEnv: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
        workingDirectory: '/tmp/project-sidecar-env',
      });

      assert.ok(capturedSpawnOptions?.env, 'spawn env should be captured');
      assert.equal(
        capturedSpawnOptions.env.OFFICE_CLAW_MCP_EXCLUDED_TOOLS,
        [
          'limb_list_available',
          'limb_invoke',
          'limb_pair_list',
          'limb_pair_approve',
          'office_claw_list_tasks',
          'office_claw_update_task',
          'office_claw_load_skill',
          'office_claw_create_rich_block',
          'office_claw_get_rich_block_rules',
          'office_claw_request_permission',
          'office_claw_check_permission_status',
          'office_claw_update_workflow',
          'office_claw_feat_index',
        ].join(','),
      );
      assert.equal(capturedSpawnOptions.env.MEMORY_MODE, 'local');
      assert.equal(capturedSpawnOptions.env.MEMORY_ENGINE, 'builtin');
      assert.equal(capturedSpawnOptions.env.EMBED_API_KEY, 'test-key');
      assert.equal(capturedSpawnOptions.env.EMBED_API_BASE, 'https://example.invalid/v1');
      assert.equal(capturedSpawnOptions.env.EMBED_MODEL, 'text-embedding-v3');
    } finally {
      resetLongTermMemoryEnabledForTest();
      if (previousAppDir === undefined) {
        delete process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR;
      } else {
        process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR = previousAppDir;
      }
      if (previousPython === undefined) {
        delete process.env.OFFICE_CLAW_RELAYCLAW_PYTHON;
      } else {
        process.env.OFFICE_CLAW_RELAYCLAW_PYTHON = previousPython;
      }
    }
  });

  it('restarts the sidecar when the long-term memory toggle changes', async () => {
    const appDir = mkdtempSync(join(tmpdir(), 'relayclaw-sidecar-memory-'));
    const appPy = join(appDir, 'jiuwenclaw', 'app.py');
    const pythonBin =
      process.platform === 'win32'
        ? join(appDir, '.venv', 'Scripts', 'python.exe')
        : join(appDir, '.venv', 'bin', 'python');
    mkdirSync(dirname(appPy), { recursive: true });
    mkdirSync(dirname(pythonBin), { recursive: true });
    writeFileSync(appPy, '');
    writeFileSync(pythonBin, '');

    const spawned = [];
    const spawnEnvs = [];
    const previousAppDir = process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR;
    const previousPython = process.env.OFFICE_CLAW_RELAYCLAW_PYTHON;

    try {
      resetLongTermMemoryEnabledForTest();
      process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR = appDir;
      process.env.OFFICE_CLAW_RELAYCLAW_PYTHON = pythonBin;

      const controller = new DefaultRelayClawSidecarController(
        'office',
        {
          autoStart: true,
          startupTimeoutMs: 1000,
        },
        {
          spawnFn: (_command, _args, options) => {
            spawnEnvs.push(options.env);
            const child = new FakeChildProcess(`relayclaw-memory-${spawned.length + 1}`);
            spawned.push(child);
            queueMicrotask(() => {
              child.stderr.emit('data', Buffer.from('[JiuWenClaw] 初始化完成: agent_name=main_agent\n', 'utf-8'));
            });
            return child;
          },
          allocatePort: async () => 19200 + spawned.length,
          tcpProbeFn: async () => true,
        },
      );

      const options = {
        callbackEnv: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
          EMBED_API_KEY: 'embed-key',
          EMBED_API_BASE: 'https://embed.example.invalid/v1',
          EMBED_MODEL: 'custom-embedding-model',
        },
        workingDirectory: '/tmp/project-memory-toggle',
      };

      await controller.ensureStarted(options);
      setLongTermMemoryEnabled(false);
      await controller.ensureStarted(options);

      assert.equal(spawned.length, 2);
      assert.equal(spawned[0].killed, true);
      assert.equal(spawnEnvs[0].MEMORY_ENGINE, 'builtin');
      assert.equal(spawnEnvs[1].MEMORY_ENGINE, 'none');
      assert.equal(spawnEnvs[0].EMBED_API_KEY, 'embed-key');
      assert.equal(spawnEnvs[0].EMBED_API_BASE, 'https://embed.example.invalid/v1');
      assert.equal(spawnEnvs[0].EMBED_MODEL, 'custom-embedding-model');
    } finally {
      resetLongTermMemoryEnabledForTest();
      if (previousAppDir === undefined) {
        delete process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR;
      } else {
        process.env.OFFICE_CLAW_RELAYCLAW_APP_DIR = previousAppDir;
      }
      if (previousPython === undefined) {
        delete process.env.OFFICE_CLAW_RELAYCLAW_PYTHON;
      } else {
        process.env.OFFICE_CLAW_RELAYCLAW_PYTHON = previousPython;
      }
    }
  });

  it('reuses the same scoped sidecar across working directories when auth scope is unchanged', async () => {
    const createdHomeDirs = [];
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          autoStart: true,
          channelId: 'catcafe',
          modelName: 'gpt-5.4',
          homeDir: '/tmp/relayclaw-home',
        },
      },
      {
        createSidecarController: (_agentId, config) => {
          createdHomeDirs.push(config.homeDir);
          return {
            async ensureStarted() {
              return 'ws://127.0.0.1:19092';
            },
            stop() {},
            getRecentLogs() {
              return '';
            },
          };
        },
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    await collect(
      service.invoke('hello one', {
        workingDirectory: '/tmp/project-a',
        callbackEnv: {
          OPENAI_API_KEY: 'same-key',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
      }),
    );
    await collect(
      service.invoke('hello two', {
        workingDirectory: '/tmp/project-b',
        callbackEnv: {
          OPENAI_API_KEY: 'same-key',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
      }),
    );

    assert.equal(createdHomeDirs.length, 1);
    assert.match(createdHomeDirs[0], /scope-/);
  });

  it('includes uploaded file metadata and local file path hints in RelayClaw requests', async () => {
    let capturedRequest;
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          capturedRequest = request;
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    for await (const _ of service.invoke('Read the uploaded file', {
      uploadDir: '/tmp/office-claw-uploads',
      contentBlocks: [
        {
          type: 'file',
          url: '/uploads/file-1234-report.pdf',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
        },
      ],
    })) {
      // exhaust stream
    }

    assert.ok(capturedRequest);
    const expectedUploadPath =
      process.platform === 'win32'
        ? 'D:\\tmp\\office-claw-uploads\\file-1234-report.pdf'
        : '/tmp/office-claw-uploads/file-1234-report.pdf';
    assert.deepEqual(capturedRequest.params.files, {
      uploaded: [
        {
          type: 'file',
          name: 'report.pdf',
          path: expectedUploadPath,
        },
      ],
    });
    const normalizedQuery = String(capturedRequest.params.query).replaceAll('\\', '/');
    assert.match(
      normalizedQuery,
      /\[Local file path: D:\/tmp\/office-claw-uploads\/file-1234-report\.pdf\] \(report\.pdf\)|\[Local file path: \/tmp\/office-claw-uploads\/file-1234-report\.pdf\] \(report\.pdf\)/,
    );
  });

  it('creates a new scoped sidecar when auth scope changes', async () => {
    const createdHomeDirs = [];
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          autoStart: true,
          channelId: 'catcafe',
          modelName: 'gpt-5.4',
          homeDir: '/tmp/relayclaw-home',
        },
      },
      {
        createSidecarController: (_agentId, config) => {
          createdHomeDirs.push(config.homeDir);
          return {
            async ensureStarted() {
              return 'ws://127.0.0.1:19093';
            },
            stop() {},
            getRecentLogs() {
              return '';
            },
          };
        },
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    await collect(
      service.invoke('hello one', {
        callbackEnv: {
          OPENAI_API_KEY: 'key-a',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
      }),
    );
    await collect(
      service.invoke('hello two', {
        callbackEnv: {
          OPENAI_API_KEY: 'key-b',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
      }),
    );

    assert.equal(createdHomeDirs.length, 2);
    assert.notEqual(createdHomeDirs[0], createdHomeDirs[1]);
  });

  it('exposes all live relayclaw runtime handles across scopes', async () => {
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          autoStart: true,
          channelId: 'catcafe',
          modelName: 'gpt-5.4',
          homeDir: '/tmp/relayclaw-home',
        },
      },
      {
        createSidecarController: (_agentId, config) => ({
          async ensureStarted() {
            const scopeId = String(config.homeDir).split(/[/\\]/).at(-1) ?? 'scope-unknown';
            return `ws://127.0.0.1:${scopeId.includes('scope-') ? '19094' : '19095'}`;
          },
          stop() {},
          getRecentLogs() {
            return '';
          },
        }),
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    await collect(
      service.invoke('hello one', {
        callbackEnv: {
          OPENAI_API_KEY: 'key-a',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
      }),
    );
    await collect(
      service.invoke('hello two', {
        callbackEnv: {
          OPENAI_API_KEY: 'key-b',
          OPENAI_BASE_URL: 'https://example.invalid/v1',
        },
      }),
    );

    const runtimeHandles = service.listRelayClawRuntimeHandles();
    assert.equal(runtimeHandles.length, 2);
    assert.equal(new Set(runtimeHandles.map((handle) => handle.scopeKey)).size, 2);
    assert.equal(new Set(runtimeHandles.map((handle) => handle.homeDir)).size, 2);
    for (const handle of runtimeHandles) {
      assert.match(handle.scopeKey, /^auto:/);
      assert.match(String(handle.homeDir).replaceAll('\\', '/'), /\/tmp\/relayclaw-home\/scope-/);
    }
  });

  it('yields error before done when the provider times out', async () => {
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
          timeoutMs: 10,
        },
      },
      {
        createConnection: createConnectionFactory(() => {
          // Intentionally never emits frames.
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('This will time out')) {
      messages.push(msg);
    }

    assert.deepEqual(
      messages.map((msg) => msg.type),
      ['session_init', 'error', 'done'],
    );
    assert.match(messages[1].error, /timed out/i);
  });

  it('yields error before done when the websocket closes unexpectedly', async () => {
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            channel_id: '',
            payload: {
              event_type: 'chat.error',
              error: 'jiuwen WebSocket connection closed unexpectedly',
              is_complete: true,
            },
            is_complete: true,
          });
          queue.abort();
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('This will close')) {
      messages.push(msg);
    }

    assert.deepEqual(
      messages.map((msg) => msg.type),
      ['session_init', 'error', 'done'],
    );
    assert.match(messages[1].error, /connection closed unexpectedly/i);
  });

  it('suppresses raw transport error text streamed as chat.delta', async () => {
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.delta',
              content: '[错误]jiuwen WebSocket connection closed unexpectedly',
            },
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.error',
              error: 'jiuwen WebSocket connection closed unexpectedly',
              is_complete: true,
            },
            is_complete: true,
          });
          queue.abort();
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('This will close')) {
      messages.push(msg);
    }

    assert.deepEqual(
      messages.map((msg) => msg.type),
      ['session_init', 'error', 'done'],
    );
    assert.equal(
      messages.some((msg) => msg.type === 'text'),
      false,
    );
  });

  it('detects raw transport error text variants for suppression', () => {
    assert.equal(
      __relayClawInternals.isRelayClawTransportErrorText('[错误]jiuwen WebSocket connection closed unexpectedly'),
      true,
    );
    assert.equal(
      __relayClawInternals.isRelayClawTransportErrorText('jiuwen WebSocket connection closed unexpectedly'),
      true,
    );
    assert.equal(__relayClawInternals.isRelayClawTransportErrorText('normal model output'), false);
  });

  it('reuses provided cliSessionId for relayclaw requests', async () => {
    let capturedRequest = null;
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
          channelId: 'catcafe',
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          capturedRequest = request;
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = [];
    for await (const msg of service.invoke('resume this session', { cliSessionId: 'officeclaw_existing_session' })) {
      messages.push(msg);
    }

    assert.equal(messages[0].type, 'session_init');
    assert.equal(messages[0].sessionId, 'officeclaw_existing_session');
    assert.equal(capturedRequest.session_id, 'officeclaw_existing_session');
  });

  it('derives a stable relayclaw sessionId from audit context when none is persisted yet', async () => {
    const sentSessionIds = [];
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
          channelId: 'officeclaw',
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          sentSessionIds.push(request.session_id);
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue, 'request queue should exist before send');
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const baseAuditContext = {
      threadId: 'thread-42',
      userId: 'user-7',
      agentId: 'relayclaw-debug',
    };

    const firstMessages = [];
    for await (const msg of service.invoke('hello', {
      auditContext: {
        invocationId: 'inv-1',
        ...baseAuditContext,
      },
    })) {
      firstMessages.push(msg);
    }

    const secondMessages = [];
    for await (const msg of service.invoke('hello again', {
      auditContext: {
        invocationId: 'inv-2',
        ...baseAuditContext,
      },
    })) {
      secondMessages.push(msg);
    }

    assert.equal(firstMessages[0].type, 'session_init');
    assert.equal(secondMessages[0].type, 'session_init');
    assert.equal(firstMessages[0].sessionId, secondMessages[0].sessionId);
    assert.match(firstMessages[0].sessionId, /^officeclaw_[0-9a-f]{24}$/);
    assert.equal(sentSessionIds[0], firstMessages[0].sessionId);
    assert.equal(sentSessionIds[1], secondMessages[0].sessionId);
  });

  it('bridges Jiuwen permission approvals into local authorization pending requests', async () => {
    const pendingStore = new PendingRequestStore();
    const permissionBridge = new JiuwenPermissionBridge();
    permissionBridge.bindAuthorizationManager(
      new AuthorizationManager({
        ruleStore: new AuthorizationRuleStore(),
        pendingStore,
        auditStore: new AuthorizationAuditStore(),
        timeoutMs: 5000,
      }),
    );

    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        permissionBridge,
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue);
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: {
              event_type: 'chat.ask_user_question',
              request_id: 'perm_approve_relay_test',
              questions: [
                {
                  header: '权限审批',
                  question: '**工具 `shell_command` 需要授权才能执行**',
                  options: [
                    { label: '本次允许', description: '仅本次授权执行' },
                    { label: '总是允许', description: '记住规则' },
                    { label: '拒绝', description: '拒绝执行' },
                  ],
                  multi_select: false,
                },
              ],
            },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = await collect(
      service.invoke('Run a privileged tool', {
        auditContext: {
          invocationId: 'inv-permission-bridge',
          threadId: 'thread-permission-bridge',
          userId: 'user-permission-bridge',
          agentId: 'relayclaw-debug',
        },
      }),
    );

    assert.deepEqual(
      messages.map((msg) => msg.type),
      ['session_init', 'done'],
    );
    const pending = pendingStore.listWaiting('thread-permission-bridge');
    assert.equal(pending.length, 1);
    assert.equal(pending[0].action, 'shell_command');
  });

  it('auto-approves Jiuwen permission interrupt only when the invocation override is enabled', async () => {
    const sentRequests = [];
    const pendingStore = new PendingRequestStore();
    const permissionBridge = new JiuwenPermissionBridge();
    permissionBridge.bindAuthorizationManager(
      new AuthorizationManager({
        ruleStore: new AuthorizationRuleStore(),
        pendingStore,
        auditStore: new AuthorizationAuditStore(),
        timeoutMs: 5000,
      }),
    );
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        permissionBridge,
        createConnection: createConnectionFactory((request, requestQueues) => {
          sentRequests.push(request);
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue);

          if (request.req_method === 'chat.send' && request.params?.query === 'Run a privileged tool') {
            queue.put({
              request_id: request.request_id,
              channel_id: request.channel_id,
              payload: {
                event_type: 'chat.ask_user_question',
                request_id: 'perm_auto_approve_relay_test',
                source: 'permission_interrupt',
                questions: [
                  {
                    header: '权限审批',
                    question: '**工具 `shell_command` 需要授权才能执行**',
                    options: [
                      { label: '本次允许', description: '仅本次授权执行' },
                      { label: '总是允许', description: '记住规则' },
                      { label: '拒绝', description: '拒绝执行' },
                    ],
                    multi_select: false,
                  },
                ],
              },
              is_complete: false,
            });
            queue.put({
              request_id: request.request_id,
              channel_id: request.channel_id,
              payload: { is_complete: true },
              is_complete: true,
            });
            return;
          }

          if (request.req_method === 'chat.send' && request.params?.request_id === 'perm_auto_approve_relay_test') {
            assert.deepEqual(request.params.answers, [{ selected_options: ['本次允许'] }]);
            queue.put({
              request_id: request.request_id,
              channel_id: request.channel_id,
              payload: { event_type: 'chat.delta', content: 'approved and continued' },
              is_complete: false,
            });
            queue.put({
              request_id: request.request_id,
              channel_id: request.channel_id,
              payload: { is_complete: true },
              is_complete: true,
            });
            return;
          }

          throw new Error(`unexpected request: ${JSON.stringify(request)}`);
        }),
      },
    );

    const messages = await collect(
      service.invoke('Run a privileged tool', {
        auditContext: {
          invocationId: 'inv-permission-auto-approve',
          threadId: 'thread-permission-auto-approve',
          userId: 'user-permission-auto-approve',
          agentId: 'relayclaw-debug',
        },
        callbackEnvOverrides: {
          OFFICE_CLAW_AUTO_APPROVE_PERMISSION_INTERRUPT: '1',
        },
      }),
    );

    assert.equal(pendingStore.listWaiting('thread-permission-auto-approve').length, 0);
    assert.equal(messages[0].type, 'session_init');
    assert.equal(messages.at(-1)?.type, 'done');
    assert.equal(
      messages.filter((msg) => msg.type === 'done').length,
      1,
      'auto-approved permission interrupt should surface a single done event',
    );
    assert.ok(
      messages.some((msg) => msg.type === 'text' && msg.content === 'approved and continued'),
      'auto-approved permission interrupt should continue streaming follow-up output',
    );
    assert.equal(sentRequests.length, 2);
  });

  it('finishes auto-approved Jiuwen permission resume when the resumed stream ends with chat.final only', async () => {
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue);

          if (request.req_method === 'chat.send' && request.params?.query === 'Run a privileged tool') {
            queue.put({
              request_id: request.request_id,
              channel_id: request.channel_id,
              payload: {
                event_type: 'chat.ask_user_question',
                request_id: 'perm_auto_approve_final_only_test',
                source: 'permission_interrupt',
                questions: [
                  {
                    header: '权限审批',
                    question: '**工具 `shell_command` 需要授权才能执行**',
                    options: [
                      { label: '本次允许', description: '仅本次授权执行' },
                      { label: '总是允许', description: '记住规则' },
                      { label: '拒绝', description: '拒绝执行' },
                    ],
                    multi_select: false,
                  },
                ],
              },
              is_complete: false,
            });
            queue.put({
              request_id: request.request_id,
              channel_id: request.channel_id,
              payload: { is_complete: true },
              is_complete: true,
            });
            return;
          }

          if (request.req_method === 'chat.send' && request.params?.request_id === 'perm_auto_approve_final_only_test') {
            queue.put({
              request_id: request.request_id,
              channel_id: request.channel_id,
              payload: { event_type: 'chat.final', content: 'final-only resume output' },
              is_complete: false,
            });
            return;
          }

          throw new Error(`unexpected request: ${JSON.stringify(request)}`);
        }),
      },
    );

    const messages = await collect(
      service.invoke('Run a privileged tool', {
        auditContext: {
          invocationId: 'inv-permission-auto-approve-final-only',
          threadId: 'thread-permission-auto-approve-final-only',
          userId: 'user-permission-auto-approve-final-only',
          agentId: 'relayclaw-debug',
        },
        callbackEnvOverrides: {
          OFFICE_CLAW_AUTO_APPROVE_PERMISSION_INTERRUPT: '1',
        },
      }),
    );

    assert.ok(messages.some((msg) => msg.type === 'text' && msg.content === 'final-only resume output'));
    assert.equal(messages.at(-1)?.type, 'done');
    assert.equal(
      messages.filter((msg) => msg.type === 'done').length,
      1,
      'final-only auto-approved resume should surface a single done event',
    );
  });

  it('finishes auto-approved Jiuwen permission resume even when the original request never emits complete', async () => {
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue);

          if (request.req_method === 'chat.send' && request.params?.query === 'Run a privileged tool') {
            queue.put({
              request_id: request.request_id,
              channel_id: request.channel_id,
              payload: {
                event_type: 'chat.ask_user_question',
                request_id: 'perm_auto_approve_no_outer_complete_test',
                source: 'permission_interrupt',
                questions: [
                  {
                    header: '权限审批',
                    question: '**工具 `shell_command` 需要授权才能执行**',
                    options: [
                      { label: '本次允许', description: '仅本次授权执行' },
                      { label: '总是允许', description: '记住规则' },
                      { label: '拒绝', description: '拒绝执行' },
                    ],
                    multi_select: false,
                  },
                ],
              },
              is_complete: false,
            });
            return;
          }

          if (request.req_method === 'chat.send' && request.params?.request_id === 'perm_auto_approve_no_outer_complete_test') {
            queue.put({
              request_id: request.request_id,
              channel_id: request.channel_id,
              payload: { event_type: 'chat.final', content: 'resume finished without outer completion' },
              is_complete: false,
            });
            return;
          }

          throw new Error(`unexpected request: ${JSON.stringify(request)}`);
        }),
      },
    );

    const messages = await collect(
      service.invoke('Run a privileged tool', {
        auditContext: {
          invocationId: 'inv-permission-auto-approve-no-outer-complete',
          threadId: 'thread-permission-auto-approve-no-outer-complete',
          userId: 'user-permission-auto-approve-no-outer-complete',
          agentId: 'relayclaw-debug',
        },
        callbackEnvOverrides: {
          OFFICE_CLAW_AUTO_APPROVE_PERMISSION_INTERRUPT: '1',
        },
      }),
    );

    assert.ok(messages.some((msg) => msg.type === 'text' && msg.content === 'resume finished without outer completion'));
    assert.equal(messages.at(-1)?.type, 'done');
    assert.equal(messages.filter((msg) => msg.type === 'done').length, 1);
  });

  it('extracts token usage from frame.metadata and attaches to done message', async () => {
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
          modelName: 'glm-5',
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue);
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { event_type: 'chat.final', content: 'OK' },
            metadata: { usage: { input_tokens: 150, output_tokens: 80, total_tokens: 230 } },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = await collect(service.invoke('hi'));
    const done = messages.find((m) => m.type === 'done');
    assert.ok(done?.metadata, 'done message should have metadata');
    assert.equal(done.metadata.provider, 'jiuwen');
    assert.equal(done.metadata.model, 'glm-5');
    assert.equal(done.metadata.usage.inputTokens, 150);
    assert.equal(done.metadata.usage.outputTokens, 80);
    assert.equal(done.metadata.usage.totalTokens, 230);
  });

  it('done message has metadata even without usage data', async () => {
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: {
          url: 'ws://127.0.0.1:65535',
          autoStart: false,
          modelName: 'glm-5',
        },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue);
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { event_type: 'chat.final', content: 'No usage' },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = await collect(service.invoke('hi'));
    const done = messages.find((m) => m.type === 'done');
    assert.ok(done?.metadata, 'done should have metadata even without usage');
    assert.equal(done.metadata.provider, 'jiuwen');
    assert.equal(done.metadata.model, 'glm-5');
    assert.equal(done.metadata.usage, undefined);
  });

  it('extracts usage from metadata on non-final frames too', async () => {
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: { url: 'ws://127.0.0.1:65535', autoStart: false },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue);
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { event_type: 'chat.delta', content: 'Hello' },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { event_type: 'chat.final', content: '' },
            metadata: { usage: { input_tokens: 200, output_tokens: 100, total_tokens: 300 } },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const messages = await collect(service.invoke('hi'));
    const done = messages.find((m) => m.type === 'done');
    assert.ok(done.metadata?.usage, 'usage should be extracted from metadata');
    assert.equal(done.metadata.usage.inputTokens, 200);
    assert.equal(done.metadata.usage.outputTokens, 100);
  });

  it('returns independent usage for consecutive invocations on the same service', async () => {
    let callCount = 0;
    const service = new RelayClawAgentService(
      {
        agentId: 'relayclaw-debug',
        config: { url: 'ws://127.0.0.1:65535', autoStart: false, modelName: 'glm-5' },
      },
      {
        createConnection: createConnectionFactory((request, requestQueues) => {
          const queue = requestQueues.get(request.request_id);
          assert.ok(queue);
          callCount++;
          const usage =
            callCount === 1
              ? { input_tokens: 100, output_tokens: 50, total_tokens: 150 }
              : { input_tokens: 999, output_tokens: 888, total_tokens: 1887 };
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { event_type: 'chat.final', content: `reply-${callCount}` },
            metadata: { usage },
            is_complete: false,
          });
          queue.put({
            request_id: request.request_id,
            channel_id: request.channel_id,
            payload: { is_complete: true },
            is_complete: true,
          });
        }),
      },
    );

    const msgs1 = await collect(service.invoke('first'));
    const done1 = msgs1.find((m) => m.type === 'done');
    assert.equal(done1.metadata.usage.inputTokens, 100);
    assert.equal(done1.metadata.usage.outputTokens, 50);

    const msgs2 = await collect(service.invoke('second'));
    const done2 = msgs2.find((m) => m.type === 'done');
    assert.equal(done2.metadata.usage.inputTokens, 999);
    assert.equal(done2.metadata.usage.outputTokens, 888);
  });
});
