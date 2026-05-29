/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  AntigravityCdpClient,
  findEditorTarget,
  normaliseHint,
  rankEditorTargets,
} from '../dist/domains/agents/services/agents/providers/antigravity/AntigravityCdpClient.js';

describe('findEditorTarget', () => {
  test('picks editor page, skips Launchpad', () => {
    const targets = [
      { type: 'page', title: 'Launchpad', webSocketDebuggerUrl: 'ws://a', url: 'vscode-file://vscode-app' },
      { type: 'page', title: 'office-claw — main.ts', webSocketDebuggerUrl: 'ws://b', url: 'vscode-file://vscode-app' },
      { type: 'iframe', title: 'webview', webSocketDebuggerUrl: 'ws://c', url: 'vscode-webview://ext' },
    ];
    const result = findEditorTarget(targets);
    assert.equal(result?.webSocketDebuggerUrl, 'ws://b');
  });

  test('returns null when no editor page found', () => {
    const targets = [{ type: 'page', title: 'Launchpad', webSocketDebuggerUrl: 'ws://a', url: '' }];
    assert.equal(findEditorTarget(targets), null);
  });

  test('skips targets without webSocketDebuggerUrl', () => {
    const targets = [{ type: 'page', title: 'Editor', webSocketDebuggerUrl: '', url: '' }];
    assert.equal(findEditorTarget(targets), null);
  });

  test('skips non-page targets', () => {
    const targets = [
      { type: 'worker', title: 'shared-worker', webSocketDebuggerUrl: 'ws://w', url: '' },
      { type: 'page', title: 'my-project', webSocketDebuggerUrl: 'ws://p', url: '' },
    ];
    const result = findEditorTarget(targets);
    assert.equal(result?.webSocketDebuggerUrl, 'ws://p');
  });
});

// P1-2: findEditorTarget must support titleHint to avoid multi-window misrouting
describe('findEditorTarget with titleHint', () => {
  test('filters by titleHint when provided', () => {
    const targets = [
      { type: 'page', title: 'other-project — index.ts', webSocketDebuggerUrl: 'ws://a', url: '' },
      { type: 'page', title: 'office-claw — main.ts', webSocketDebuggerUrl: 'ws://b', url: '' },
    ];
    const result = findEditorTarget(targets, { titleHint: 'office-claw' });
    assert.equal(result?.webSocketDebuggerUrl, 'ws://b');
  });

  test('falls back to first match when titleHint has no match', () => {
    const targets = [{ type: 'page', title: 'my-project — main.ts', webSocketDebuggerUrl: 'ws://a', url: '' }];
    const result = findEditorTarget(targets, { titleHint: 'no-match' });
    assert.equal(result?.webSocketDebuggerUrl, 'ws://a');
  });

  test('without titleHint picks first non-Launchpad page (backward compat)', () => {
    const targets = [
      { type: 'page', title: 'Launchpad', webSocketDebuggerUrl: 'ws://a', url: '' },
      { type: 'page', title: 'project-x', webSocketDebuggerUrl: 'ws://b', url: '' },
    ];
    const result = findEditorTarget(targets);
    assert.equal(result?.webSocketDebuggerUrl, 'ws://b');
  });
});

describe('normaliseHint', () => {
  test('strips worktree feature suffix', () => {
    assert.equal(normaliseHint('office-claw-f061-send-fix'), 'office-claw');
    assert.equal(normaliseHint('office-claw-f061'), 'office-claw');
  });

  test('preserves non-worktree names', () => {
    assert.equal(normaliseHint('office-claw'), 'office-claw');
    assert.equal(normaliseHint('my-project'), 'my-project');
  });
});

describe('findEditorTarget enhanced filtering', () => {
  test('excludes workbench-jetski-agent.html targets', () => {
    const targets = [
      { type: 'page', title: 'agent', webSocketDebuggerUrl: 'ws://a', url: 'workbench-jetski-agent.html' },
      { type: 'page', title: 'editor', webSocketDebuggerUrl: 'ws://b', url: 'workbench/workbench.html' },
    ];
    const result = findEditorTarget(targets);
    assert.equal(result?.webSocketDebuggerUrl, 'ws://b');
  });

  test('prefers workbench.html URL over plain page', () => {
    const targets = [
      { type: 'page', title: 'office-claw — main.ts', webSocketDebuggerUrl: 'ws://a', url: '' },
      { type: 'page', title: 'other', webSocketDebuggerUrl: 'ws://b', url: 'workbench/workbench.html' },
    ];
    const result = findEditorTarget(targets);
    assert.equal(result?.webSocketDebuggerUrl, 'ws://b');
  });

  test('case-insensitive titleHint matching', () => {
    const targets = [{ type: 'page', title: 'Cat-Cafe — main.ts', webSocketDebuggerUrl: 'ws://a', url: '' }];
    const result = findEditorTarget(targets, { titleHint: 'office-claw' });
    assert.equal(result?.webSocketDebuggerUrl, 'ws://a');
  });

  test('titleHint normalises worktree suffix', () => {
    const targets = [{ type: 'page', title: 'office-claw — main.ts', webSocketDebuggerUrl: 'ws://a', url: '' }];
    const result = findEditorTarget(targets, { titleHint: 'office-claw-f061-fix' });
    assert.equal(result?.webSocketDebuggerUrl, 'ws://a');
  });
});

describe('rankEditorTargets', () => {
  test('returns all viable targets sorted by score', () => {
    const targets = [
      { type: 'page', title: 'plain', webSocketDebuggerUrl: 'ws://a', url: '' },
      { type: 'page', title: 'office-claw', webSocketDebuggerUrl: 'ws://b', url: 'workbench/workbench.html' },
      { type: 'page', title: 'Launchpad', webSocketDebuggerUrl: 'ws://c', url: '' },
    ];
    const ranked = rankEditorTargets(targets, { titleHint: 'office-claw' });
    assert.equal(ranked.length, 2); // Launchpad excluded
    assert.equal(ranked[0].webSocketDebuggerUrl, 'ws://b'); // workbench + titleHint = score 3
    assert.equal(ranked[1].webSocketDebuggerUrl, 'ws://a'); // score 0
  });

  test('returns empty array when no viable targets', () => {
    const targets = [{ type: 'page', title: 'Launchpad', webSocketDebuggerUrl: 'ws://a', url: '' }];
    assert.equal(rankEditorTargets(targets).length, 0);
  });
});

describe('AntigravityCdpClient', () => {
  test('constructor defaults', () => {
    const client = new AntigravityCdpClient();
    assert.equal(client.connected, false);
  });

  test('constructor with custom port and titleHint', () => {
    const client = new AntigravityCdpClient({ port: 9222, titleHint: 'office-claw' });
    assert.equal(client.connected, false);
    // titleHint is stored internally and used in connect() → findEditorTarget()
  });

  test('sendMessage rejects when not connected', async () => {
    const client = new AntigravityCdpClient();
    await assert.rejects(() => client.sendMessage('hello'), { message: /not connected/i });
  });

  test('newConversation rejects when not connected', async () => {
    const client = new AntigravityCdpClient();
    await assert.rejects(() => client.newConversation(), { message: /not connected/i });
  });

  test('connect() skips unhealthy candidate and connects to next', async () => {
    const savedFetch = global.fetch;
    const savedWebSocket = global.WebSocket;

    global.fetch = async () => ({
      json: async () => [
        { type: 'page', title: 'stale-editor', webSocketDebuggerUrl: 'ws://stale', url: 'workbench/workbench.html' },
        {
          type: 'page',
          title: 'healthy-editor',
          webSocketDebuggerUrl: 'ws://healthy',
          url: 'workbench/workbench.html',
        },
      ],
    });

    let connectCount = 0;
    class ProbeWS {
      static OPEN = 1;
      constructor(url) {
        this.url = url;
        this.readyState = ProbeWS.OPEN;
        connectCount++;
        queueMicrotask(() => this.onopen?.());
      }
      send(raw) {
        const { id, method } = JSON.parse(raw);
        if (method === 'Runtime.enable' || method === 'Input.enable') {
          queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id, result: {} }) }));
          return;
        }
        if (method === 'Runtime.evaluate') {
          if (this.url === 'ws://stale') {
            // Stale target: never respond → will timeout
            return;
          }
          // Healthy target: respond OK
          queueMicrotask(() =>
            this.onmessage?.({
              data: JSON.stringify({ id, result: { result: { value: 1, type: 'number' } } }),
            }),
          );
        }
      }
      close() {
        this.readyState = 3;
      }
    }
    global.WebSocket = ProbeWS;

    try {
      const client = new AntigravityCdpClient({ probeTimeoutMs: 50 });
      await client.connect();
      assert.equal(client.connected, true);
      assert.equal(connectCount, 2); // tried stale, then healthy
      await client.disconnect();
    } finally {
      global.fetch = savedFetch;
      global.WebSocket = savedWebSocket;
    }
  });

  test('connect tolerates missing Input.enable on newer CDP targets', async () => {
    const savedFetch = global.fetch;
    const savedWebSocket = global.WebSocket;

    global.fetch = async () => ({
      json: async () => [{ type: 'page', title: 'office-claw — main.ts', webSocketDebuggerUrl: 'ws://fake', url: '' }],
    });

    class FakeWebSocket {
      static OPEN = 1;

      constructor() {
        this.readyState = FakeWebSocket.OPEN;
        queueMicrotask(() => this.onopen?.());
      }

      send(raw) {
        const { id, method, params } = JSON.parse(raw);
        if (method === 'Runtime.enable') {
          queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id, result: {} }) }));
          return;
        }
        if (method === 'Runtime.evaluate') {
          // Health probe or other evaluate — return { result: { value: <eval> } }
          queueMicrotask(() =>
            this.onmessage?.({
              data: JSON.stringify({ id, result: { result: { value: 1, type: 'number' } } }),
            }),
          );
          return;
        }
        if (method === 'Input.enable') {
          queueMicrotask(() =>
            this.onmessage?.({
              data: JSON.stringify({ id, error: { message: "'Input.enable' wasn't found" } }),
            }),
          );
          return;
        }
        queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id, result: {} }) }));
      }

      close() {}
    }

    global.WebSocket = FakeWebSocket;

    try {
      const client = new AntigravityCdpClient({ port: 9000 });
      await client.connect();
      assert.equal(client.connected, true);
      await client.disconnect();
    } finally {
      global.fetch = savedFetch;
      global.WebSocket = savedWebSocket;
    }
  });

  test('pollResponse returns once assistant text appears for the current user message count', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    const states = [
      1,
      JSON.stringify({ userMsgCount: 1, responseText: 'pong', hasInlineLoading: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'pong', hasInlineLoading: false }),
    ];

    client.evaluate = async () => {
      const next = states.shift();
      if (next === undefined) throw new Error('unexpected evaluate call');
      return next;
    };

    const response = await client.pollResponse(50, {
      pollIntervalMs: 1,
      stablePollCount: 2,
    });

    assert.deepEqual(response, { text: 'pong' });
  });

  test('cdp() includes timeout duration in error message', async () => {
    const client = new AntigravityCdpClient({ commandTimeoutMs: 50 });
    // Fake a connected WS that never responds
    client.ws = {
      readyState: 1,
      send() {
        /* swallow — never respond */
      },
      close() {},
    };
    await assert.rejects(
      () => client.cdp('Runtime.evaluate', {}),
      (err) => {
        assert.match(err.message, /CDP timeout for Runtime.evaluate/);
        assert.match(err.message, /50ms/);
        return true;
      },
    );
  });

  test('cdp() per-call timeout overrides default', async () => {
    const client = new AntigravityCdpClient({ commandTimeoutMs: 30_000 });
    client.ws = {
      readyState: 1,
      send() {
        /* never respond */
      },
      close() {},
    };
    const start = Date.now();
    await assert.rejects(() => client.cdp('Test.method', {}, 50));
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `Should timeout in ~50ms, took ${elapsed}ms`);
  });

  test('WebSocket close rejects all pending commands immediately', async () => {
    const savedFetch = global.fetch;
    const savedWebSocket = global.WebSocket;

    global.fetch = async () => ({
      json: async () => [{ type: 'page', title: 'editor', webSocketDebuggerUrl: 'ws://fake', url: '' }],
    });

    let wsInstance;
    let evalCount = 0;
    class FakeWS {
      static OPEN = 1;
      constructor() {
        this.readyState = FakeWS.OPEN;
        wsInstance = this;
        queueMicrotask(() => this.onopen?.());
      }
      send(raw) {
        const { id, method } = JSON.parse(raw);
        if (method === 'Runtime.enable' || method === 'Input.enable') {
          queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id, result: {} }) }));
          return;
        }
        if (method === 'Runtime.evaluate') {
          evalCount++;
          // First evaluate = health probe → respond OK
          if (evalCount === 1) {
            queueMicrotask(() =>
              this.onmessage?.({
                data: JSON.stringify({ id, result: { result: { value: 1, type: 'number' } } }),
              }),
            );
            return;
          }
          // Second evaluate = test's pending command → do NOT respond
        }
      }
      close() {
        this.readyState = 3;
      }
    }
    global.WebSocket = FakeWS;

    try {
      const client = new AntigravityCdpClient({ commandTimeoutMs: 30_000 });
      await client.connect();

      // Start a command that will never get a response
      const pendingCmd = client.cdp('Runtime.evaluate', { expression: '1+1' });

      // Simulate WebSocket closing
      queueMicrotask(() => wsInstance.onclose?.());

      await assert.rejects(pendingCmd, /WebSocket closed unexpectedly/);
    } finally {
      global.fetch = savedFetch;
      global.WebSocket = savedWebSocket;
    }
  });

  test('evaluate() surfaces CDP exception details', async () => {
    const savedFetch = global.fetch;
    const savedWebSocket = global.WebSocket;

    global.fetch = async () => ({
      json: async () => [{ type: 'page', title: 'editor', webSocketDebuggerUrl: 'ws://fake', url: '' }],
    });

    let evalCount = 0;
    class FakeWS {
      static OPEN = 1;
      constructor() {
        this.readyState = FakeWS.OPEN;
        queueMicrotask(() => this.onopen?.());
      }
      send(raw) {
        const { id, method } = JSON.parse(raw);
        if (method === 'Runtime.enable' || method === 'Input.enable') {
          queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id, result: {} }) }));
          return;
        }
        if (method === 'Runtime.evaluate') {
          evalCount++;
          // First evaluate = health probe → respond OK
          if (evalCount === 1) {
            queueMicrotask(() =>
              this.onmessage?.({
                data: JSON.stringify({ id, result: { result: { value: 1, type: 'number' } } }),
              }),
            );
            return;
          }
          // Subsequent evaluates → return exception
          queueMicrotask(() =>
            this.onmessage?.({
              data: JSON.stringify({
                id,
                result: {
                  result: { type: 'object', subtype: 'error' },
                  exceptionDetails: {
                    text: 'Uncaught',
                    exception: { description: 'ReferenceError: foo is not defined' },
                  },
                },
              }),
            }),
          );
        }
      }
      close() {}
    }
    global.WebSocket = FakeWS;

    try {
      const client = new AntigravityCdpClient();
      await client.connect();
      await assert.rejects(() => client.evaluate('foo'), /CDP evaluate error.*ReferenceError/);
      await client.disconnect();
    } finally {
      global.fetch = savedFetch;
      global.WebSocket = savedWebSocket;
    }
  });

  test('connect() times out with connectTimeoutMs', async () => {
    const savedFetch = global.fetch;
    const savedWebSocket = global.WebSocket;

    global.fetch = async () => ({
      json: async () => [{ type: 'page', title: 'editor', webSocketDebuggerUrl: 'ws://fake', url: '' }],
    });

    class SlowWS {
      static OPEN = 1;
      constructor() {
        this.readyState = 0; /* never fire onopen */
      }
      close() {
        this.readyState = 3;
      }
      send() {}
    }
    global.WebSocket = SlowWS;

    try {
      const client = new AntigravityCdpClient({ connectTimeoutMs: 50 });
      await assert.rejects(() => client.connect(), /failed health probe/);
    } finally {
      global.fetch = savedFetch;
      global.WebSocket = savedWebSocket;
    }
  });

  test('disconnect clears pending command timers without leaking', async () => {
    const client = new AntigravityCdpClient({ commandTimeoutMs: 60_000 });
    client.ws = {
      readyState: 1,
      send() {
        /* never respond */
      },
      close() {},
      onclose: null,
      onerror: null,
    };
    // Start a command (will be pending forever)
    const _pendingCmd = client.cdp('Test.method', {});
    // Disconnect should clear the pending map and timers
    await client.disconnect();
    // The pending promise should never resolve or reject (timer cleared),
    // but the map should be empty
    assert.equal(client.pending.size, 0);
  });

  test('sendMessage clicks send button when found (strategy A)', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    const cdpCalls = [];
    const evaluateResults = [
      // 1. textbox query → returns position
      JSON.stringify({ x: 100, y: 200 }),
      // 2. execCommand insertText → void
      undefined,
      // 3. FIND_SEND_BUTTON_JS → returns button position
      JSON.stringify({ x: 300, y: 400 }),
    ];

    client.evaluate = async () => evaluateResults.shift();
    client.cdp = async (method, params) => {
      cdpCalls.push({ method, params });
      return {};
    };

    await client.sendMessage('hello');

    // Should have clicked textbox (mousePressed+Released) then send button (mousePressed+Released)
    const mouseEvents = cdpCalls.filter((c) => c.method === 'Input.dispatchMouseEvent');
    assert.equal(mouseEvents.length, 4); // 2 for textbox click + 2 for send button click
    // Last click should be at send button coordinates
    assert.equal(mouseEvents[2].params.x, 300);
    assert.equal(mouseEvents[2].params.y, 400);
    // No keyboard events dispatched
    const keyEvents = cdpCalls.filter((c) => c.method === 'Input.dispatchKeyEvent');
    assert.equal(keyEvents.length, 0);
  });

  test('sendMessage falls back to JS Enter when no send button (strategy B)', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    const evaluateResults = [
      JSON.stringify({ x: 100, y: 200 }), // textbox
      undefined, // execCommand
      null, // FIND_SEND_BUTTON_JS → not found
      true, // DISPATCH_ENTER_JS → success
    ];

    const cdpCalls = [];
    client.evaluate = async () => evaluateResults.shift();
    client.cdp = async (method, params) => {
      cdpCalls.push({ method, params });
      return {};
    };

    await client.sendMessage('hello');

    // No CDP keyboard events — JS dispatch handled it
    const keyEvents = cdpCalls.filter((c) => c.method === 'Input.dispatchKeyEvent');
    assert.equal(keyEvents.length, 0);
  });

  test('sendMessage falls back to CDP Input when button and JS Enter both fail (strategy C)', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    const evaluateResults = [
      JSON.stringify({ x: 100, y: 200 }), // textbox
      undefined, // execCommand
      null, // FIND_SEND_BUTTON_JS → not found
      false, // DISPATCH_ENTER_JS → no active element
    ];

    const cdpCalls = [];
    client.evaluate = async () => evaluateResults.shift();
    client.cdp = async (method, params) => {
      cdpCalls.push({ method, params });
      return {};
    };

    await client.sendMessage('hello');

    // Should fall through to CDP Input.dispatchKeyEvent
    const keyEvents = cdpCalls.filter((c) => c.method === 'Input.dispatchKeyEvent');
    assert.equal(keyEvents.length, 2); // rawKeyDown + keyUp
    assert.equal(keyEvents[0].params.key, 'Enter');
  });

  test('pollResponse resets idle timer on activity — does not timeout while loading', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    // Simulate: loading for 5 polls (each 10ms = 50ms total), then stable
    // idleTimeoutMs = 30ms — without reset, it would timeout after 3 polls
    const _pollCount = 0;
    const states = [
      1, // initial userMsgCount
      JSON.stringify({ userMsgCount: 1, responseText: 'partial...', hasInlineLoading: true }),
      JSON.stringify({ userMsgCount: 1, responseText: 'partial more...', hasInlineLoading: true }),
      JSON.stringify({ userMsgCount: 1, responseText: 'partial more...', hasInlineLoading: true }),
      JSON.stringify({ userMsgCount: 1, responseText: 'almost...', hasInlineLoading: true }),
      JSON.stringify({ userMsgCount: 1, responseText: 'done!', hasInlineLoading: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'done!', hasInlineLoading: false }),
    ];

    client.evaluate = async () => {
      const next = states.shift();
      if (next === undefined) throw new Error('unexpected evaluate call');
      return next;
    };

    const result = await client.pollResponse(30, {
      pollIntervalMs: 10,
      stablePollCount: 2,
    });

    // Should succeed despite total time > 30ms, because loading kept resetting the idle timer
    assert.deepEqual(result, { text: 'done!' });
  });

  test('pollResponse respects maxTimeoutMs absolute ceiling even during activity', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    // Always loading — never finishes. idleTimeoutMs = 5000 (generous) but maxTimeoutMs = 40ms
    client.evaluate = async () => {
      return JSON.stringify({ userMsgCount: 1, responseText: 'loading...', hasInlineLoading: true });
    };

    // First call returns userMsgCount
    let firstCall = true;
    const origEval = client.evaluate;
    client.evaluate = async () => {
      if (firstCall) {
        firstCall = false;
        return 1;
      }
      return origEval();
    };

    const result = await client.pollResponse(5000, {
      pollIntervalMs: 5,
      stablePollCount: 2,
      maxTimeoutMs: 40,
    });

    // Should return null because maxTimeoutMs was hit
    assert.equal(result, null);
  });

  test('pollResponse returns thinking text when present in DOM', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    const states = [
      1,
      JSON.stringify({
        userMsgCount: 1,
        responseText: 'Hello! I am Antigravity.',
        thinkingText: 'Let me think about how to respond...',
        hasInlineLoading: false,
      }),
      JSON.stringify({
        userMsgCount: 1,
        responseText: 'Hello! I am Antigravity.',
        thinkingText: 'Let me think about how to respond...',
        hasInlineLoading: false,
      }),
    ];

    client.evaluate = async () => {
      const next = states.shift();
      if (next === undefined) throw new Error('unexpected evaluate call');
      return next;
    };

    const result = await client.pollResponse(50, {
      pollIntervalMs: 1,
      stablePollCount: 2,
    });

    // pollResponse should return an object with both text and thinking
    assert.equal(typeof result, 'object');
    assert.equal(result.text, 'Hello! I am Antigravity.');
    assert.equal(result.thinking, 'Let me think about how to respond...');
  });

  test('P1-fix: pollResponse resets idle timer when loading but responseText still empty', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    // Simulate: model is thinking (loading=true, responseText='') for several polls,
    // then produces response. idleTimeoutMs=30ms — without fix, times out during thinking phase.
    const states = [
      1, // initial userMsgCount
      JSON.stringify({ userMsgCount: 1, responseText: '', hasInlineLoading: true }),
      JSON.stringify({ userMsgCount: 1, responseText: '', hasInlineLoading: true }),
      JSON.stringify({ userMsgCount: 1, responseText: '', hasInlineLoading: true }),
      JSON.stringify({ userMsgCount: 1, responseText: '', hasInlineLoading: true }),
      JSON.stringify({ userMsgCount: 1, responseText: 'answer!', hasInlineLoading: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'answer!', hasInlineLoading: false }),
    ];

    client.evaluate = async () => {
      const next = states.shift();
      if (next === undefined) throw new Error('unexpected evaluate call');
      return next;
    };

    const result = await client.pollResponse(30, {
      pollIntervalMs: 10,
      stablePollCount: 2,
    });

    // Should NOT timeout — loading with empty text still counts as activity
    assert.deepEqual(result, { text: 'answer!' });
  });

  test('P2-fix: thinking extraction does not swallow same-block response text', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    // Simulate: DOM has a single assistant block containing BOTH a <details> thinking
    // element AND response text. The thinkingText and responseText should both be present.
    const states = [
      1,
      JSON.stringify({
        userMsgCount: 1,
        responseText: 'The answer is 42.',
        thinkingText: 'Hmm, let me calculate...',
        hasInlineLoading: false,
      }),
      JSON.stringify({
        userMsgCount: 1,
        responseText: 'The answer is 42.',
        thinkingText: 'Hmm, let me calculate...',
        hasInlineLoading: false,
      }),
    ];

    client.evaluate = async () => {
      const next = states.shift();
      if (next === undefined) throw new Error('unexpected evaluate call');
      return next;
    };

    const result = await client.pollResponse(50, {
      pollIntervalMs: 1,
      stablePollCount: 2,
    });

    // Both must be present — thinking must NOT swallow the response text
    assert.equal(result.text, 'The answer is 42.');
    assert.equal(result.thinking, 'Hmm, let me calculate...');
  });

  test('Bug-1: default stablePollCount is 4 — survives 3-poll output gap', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    // Simulate: text stays the same for 3 polls (would pass with old stablePollCount=2),
    // then changes. With stablePollCount=4, should wait for the final text.
    const states = [
      1, // initial userMsgCount
      JSON.stringify({ userMsgCount: 1, responseText: 'partial output', hasInlineLoading: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'partial output', hasInlineLoading: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'partial output', hasInlineLoading: false }),
      // 3 identical polls — stablePollCount=2 would have returned 'partial output' here!
      JSON.stringify({ userMsgCount: 1, responseText: 'partial output continued...', hasInlineLoading: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'final answer!', hasInlineLoading: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'final answer!', hasInlineLoading: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'final answer!', hasInlineLoading: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'final answer!', hasInlineLoading: false }),
    ];

    client.evaluate = async () => {
      const next = states.shift();
      if (next === undefined) throw new Error('unexpected evaluate call');
      return next;
    };

    // Use defaults (no explicit stablePollCount) — should now be 4
    const result = await client.pollResponse(500, { pollIntervalMs: 1 });
    assert.deepEqual(result, { text: 'final answer!' });
  });

  test('Bug-1: stop button presence blocks stable count', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    // Simulate: text is stable but stop button is present (model still generating)
    const states = [
      1,
      JSON.stringify({ userMsgCount: 1, responseText: 'thinking...', hasInlineLoading: false, hasStopButton: true }),
      JSON.stringify({ userMsgCount: 1, responseText: 'thinking...', hasInlineLoading: false, hasStopButton: true }),
      JSON.stringify({ userMsgCount: 1, responseText: 'thinking...', hasInlineLoading: false, hasStopButton: true }),
      JSON.stringify({ userMsgCount: 1, responseText: 'thinking...', hasInlineLoading: false, hasStopButton: true }),
      JSON.stringify({ userMsgCount: 1, responseText: 'done!', hasInlineLoading: false, hasStopButton: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'done!', hasInlineLoading: false, hasStopButton: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'done!', hasInlineLoading: false, hasStopButton: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'done!', hasInlineLoading: false, hasStopButton: false }),
    ];

    client.evaluate = async () => {
      const next = states.shift();
      if (next === undefined) throw new Error('unexpected evaluate call');
      return next;
    };

    const result = await client.pollResponse(500, { pollIntervalMs: 1 });
    assert.deepEqual(result, { text: 'done!' });
  });

  test('P1-fix: hasStopButton only detects visible stop button near chat area', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    // Simulate: hasStopButton=false even when stop button exists elsewhere in IDE.
    // The DOM script should only look near the chat area, not globally.
    // Here we test the polling logic: if hasStopButton is false, stable count should work normally.
    const states = [
      1,
      JSON.stringify({ userMsgCount: 1, responseText: 'done!', hasInlineLoading: false, hasStopButton: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'done!', hasInlineLoading: false, hasStopButton: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'done!', hasInlineLoading: false, hasStopButton: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'done!', hasInlineLoading: false, hasStopButton: false }),
    ];

    client.evaluate = async () => {
      const next = states.shift();
      if (next === undefined) throw new Error('unexpected evaluate call');
      return next;
    };

    const result = await client.pollResponse(500, { pollIntervalMs: 1 });
    // Should return normally when stop button is NOT in chat area
    assert.deepEqual(result, { text: 'done!' });
  });

  test('Bug-2: switchModel evaluates model detection and click scripts', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    const evaluateCalls = [];
    client.evaluate = async (expr) => {
      evaluateCalls.push(expr);
      if (evaluateCalls.length === 1) return 'Gemini 3.1 Pro (High)'; // getCurrentModel
      if (evaluateCalls.length === 2) return JSON.stringify({ x: 100, y: 500 }); // CLICK_MODEL_SELECTOR
      if (evaluateCalls.length === 3) return true; // FIND_MODEL_OPTION
      return null;
    };
    // Mock cdp for clickAt calls
    client.cdp = async () => ({});

    await client.switchModel('Claude Opus 4.6 (Thinking)');
    assert.ok(evaluateCalls.length >= 3, 'should have made evaluate calls for detection + switching');
  });

  test('Bug-2: switchModel skips if already on correct model', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    const evaluateCalls = [];
    client.evaluate = async (expr) => {
      evaluateCalls.push(expr);
      // getCurrentModel → already on target
      return 'Claude Opus 4.6 (Thinking)';
    };

    await client.switchModel('Claude Opus 4.6 (Thinking)');
    // Should only call getCurrentModel, no click actions
    assert.equal(evaluateCalls.length, 1);
  });

  test('Bug-2: getCurrentModel reads model from footer selector', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    client.evaluate = async () => 'Gemini 3.1 Pro (High)';

    const model = await client.getCurrentModel();
    assert.equal(model, 'Gemini 3.1 Pro (High)');
  });

  test('pollResponse waits for inline loading to clear before returning text', async () => {
    const client = new AntigravityCdpClient();
    client.ws = { readyState: 1 };

    const states = [
      1,
      JSON.stringify({ userMsgCount: 1, responseText: 'pong', hasInlineLoading: true }),
      JSON.stringify({ userMsgCount: 1, responseText: 'pong', hasInlineLoading: false }),
      JSON.stringify({ userMsgCount: 1, responseText: 'pong', hasInlineLoading: false }),
    ];

    client.evaluate = async () => {
      const next = states.shift();
      if (next === undefined) throw new Error('unexpected evaluate call');
      return next;
    };

    const response = await client.pollResponse(50, {
      pollIntervalMs: 1,
      stablePollCount: 2,
    });

    assert.deepEqual(response, { text: 'pong' });
  });
});
