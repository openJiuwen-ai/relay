/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';

describe('buildACPSubprocessEnv', () => {
  it('merges custom ACP env overrides while blocking reserved keys', async () => {
    const { buildACPSubprocessEnv } = await import('../dist/config/acp-env.js');

    const previousPath = process.env.PATH;
    const previousOpenAi = process.env.OPENAI_API_KEY;
    const previousCallback = process.env.OFFICE_CLAW_CALLBACK_TOKEN;
    process.env.PATH = '/usr/bin';
    process.env.OPENAI_API_KEY = 'ambient-openai';
    process.env.OFFICE_CLAW_CALLBACK_TOKEN = 'secret-token';

    try {
      const env = buildACPSubprocessEnv({
        modelAccessMode: 'clowder_default_profile',
        env: {
          ACP_TRACE_STDIO: '1',
          CUSTOM_FLAG: 'enabled',
          OPENAI_API_KEY: 'override-openai',
          OFFICE_CLAW_CALLBACK_TOKEN: 'override-token',
        },
      });

      assert.equal(env.PATH, '/usr/bin');
      assert.equal(env.ACP_TRACE_STDIO, '1');
      assert.equal(env.CUSTOM_FLAG, 'enabled');
      assert.equal(env.OPENAI_API_KEY, undefined);
      assert.equal(env.OFFICE_CLAW_CALLBACK_TOKEN, undefined);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAi;
      if (previousCallback === undefined) delete process.env.OFFICE_CLAW_CALLBACK_TOKEN;
      else process.env.OFFICE_CLAW_CALLBACK_TOKEN = previousCallback;
    }
  });
});

describe('supportsACPStdioMcpFromInitializeResult', () => {
  it('skips stdio MCP injection when the ACP agent advertises only http and sse MCP transports', async () => {
    const { supportsACPStdioMcpFromInitializeResult } = await import(
      '../dist/domains/agents/services/agents/providers/ACPAgentService.js'
    );

    assert.equal(
      supportsACPStdioMcpFromInitializeResult({
        agentCapabilities: {
          mcpCapabilities: {
            http: true,
            sse: true,
          },
        },
      }),
      false,
    );
  });

  it('keeps stdio MCP injection as the default for agents without explicit MCP transport caps', async () => {
    const { supportsACPStdioMcpFromInitializeResult } = await import(
      '../dist/domains/agents/services/agents/providers/ACPAgentService.js'
    );

    assert.equal(supportsACPStdioMcpFromInitializeResult(undefined), true);
    assert.equal(supportsACPStdioMcpFromInitializeResult({}), true);
  });
});

describe('summarizeACPSessionParamsForLog', () => {
  it('emits only a safe ACP session summary without model profile details', async () => {
    const { summarizeACPSessionParamsForLog } = await import(
      '../dist/domains/agents/services/agents/providers/ACPAgentService.js'
    );

    const summary = summarizeACPSessionParamsForLog(
      {
        cwd: '/opt/workspace/hello',
        mcpServers: [{ id: 'office-claw', transport: 'acp' }],
        modelProfileOverride: {
          name: 'default',
          model: 'glm-5',
          baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
          apiKey: 'secret',
        },
      },
      {
        agentCapabilities: {
          mcpCapabilities: {
            acp: true,
          },
        },
      },
    );

    assert.deepEqual(summary, {
      cwd: '/opt/workspace/hello',
      mcpServersCount: 1,
      hasModelProfileOverride: true,
      mcpTransport: 'acp',
    });
    assert.equal('modelProfileOverride' in summary, false);
    assert.equal('initializeResult' in summary, false);
  });

  it('handles sessions without model overrides or supported MCP transport', async () => {
    const { summarizeACPSessionParamsForLog } = await import(
      '../dist/domains/agents/services/agents/providers/ACPAgentService.js'
    );

    assert.deepEqual(
      summarizeACPSessionParamsForLog(
        {
          mcpServers: [],
        },
        {
          agentCapabilities: {
            mcpCapabilities: {
              http: true,
              sse: true,
            },
          },
        },
      ),
      {
        mcpServersCount: 0,
        hasModelProfileOverride: false,
        mcpTransport: null,
      },
    );
  });
});

describe('resolveACPMcpTransportFromInitializeResult', () => {
  it('prefers ACP transport when the ACP agent advertises MCP-over-ACP support', async () => {
    const { resolveACPMcpTransportFromInitializeResult } = await import(
      '../dist/domains/agents/services/agents/providers/acp-mcp-bridge.js'
    );

    assert.equal(
      resolveACPMcpTransportFromInitializeResult({
        agentCapabilities: {
          mcpCapabilities: {
            acp: true,
            stdio: true,
          },
        },
      }),
      'acp',
    );
  });

  it('disables host MCP injection when no supported MCP transport is advertised', async () => {
    const { resolveACPMcpTransportFromInitializeResult } = await import(
      '../dist/domains/agents/services/agents/providers/acp-mcp-bridge.js'
    );

    assert.equal(
      resolveACPMcpTransportFromInitializeResult({
        agentCapabilities: {
          mcpCapabilities: {
            http: true,
            sse: true,
          },
        },
      }),
      null,
    );
  });
});

describe('buildACPMetadata', () => {
  it('uses the ACP provider id as the metadata model label', async () => {
    const { buildACPMetadata } = await import('../dist/domains/agents/services/agents/providers/acp-session-helpers.js');

    assert.deepEqual(buildACPMetadata('sess-1', 'opencode-acp'), {
      provider: 'acp',
      model: 'opencode-acp',
      sessionId: 'sess-1',
    });
  });

  it('falls back to a generic ACP label when no provider id is supplied', async () => {
    const { buildACPMetadata } = await import('../dist/domains/agents/services/agents/providers/acp-session-helpers.js');

    assert.deepEqual(buildACPMetadata(), {
      provider: 'acp',
      model: 'acp',
    });
  });
});

describe('ACPAgentService permission requests', () => {
  async function withFakePermissionAgent(testFn) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'acp-agent-service-permission-'));
    const logFile = path.join(tempDir, 'events.log');
    const scriptFile = path.join(tempDir, 'fake-acp-agent-permission.mjs');
    const script = `
import { appendFileSync } from 'node:fs';

const logFile = process.env.ACP_TEST_LOG_FILE;
let buffer = '';
let pendingPromptId = null;
const permissionRequestId = 999;

function log(line) {
  appendFileSync(logFile, \`\${line}\\n\`);
}

function write(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(\`Content-Length: \${payload.length}\\r\\n\\r\\n\`);
  process.stdout.write(payload);
}

function notify(update) {
  write({
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId: 'sess-test',
      update,
    },
  });
}

function handleMethod(message) {
  const params = message.params && typeof message.params === 'object' ? message.params : {};
  log(\`method:\${message.method}\`);
  if (message.method === 'initialize') {
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { audio: false, embeddedContext: false, image: false },
          mcpCapabilities: { http: true, sse: true },
        },
      },
    });
    return;
  }
  if (message.method === 'session/new' || message.method === 'session/load') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: params.sessionId || 'sess-test' } });
    return;
  }
  if (message.method === 'session/prompt') {
    pendingPromptId = message.id;
    notify({
      sessionUpdate: 'tool_call',
      title: 'read',
      rawInput: { filepath: '/tmp/opencode_acp_probe.txt' },
    });
    write({
      jsonrpc: '2.0',
      id: permissionRequestId,
      method: 'session/request_permission',
      params: {
        sessionId: 'sess-test',
        toolCall: {
          title: 'external_directory',
          rawInput: { filepath: '/tmp/opencode_acp_probe.txt' },
        },
        options: [
          { optionId: 'once', kind: 'allow_once' },
          { optionId: 'reject', kind: 'reject' },
        ],
      },
    });
    return;
  }
  write({ jsonrpc: '2.0', id: message.id, result: {} });
}

function handleResponse(message) {
  if (message.id !== permissionRequestId || !('result' in message)) return;
  log(\`permission:\${JSON.stringify(message.result)}\`);
  notify({
    sessionUpdate: 'tool_call_update',
    status: 'completed',
    content: { type: 'text', text: 'permission settled' },
  });
  notify({
    sessionUpdate: 'agent_message_chunk',
    content: { type: 'text', text: 'permission flow complete' },
  });
  write({
    jsonrpc: '2.0',
    id: pendingPromptId,
    result: {
      stopReason: 'end_turn',
      runStatus: 'completed',
      recoverable: false,
    },
  });
}

function handle(message) {
  if (!message || typeof message !== 'object') return;
  if (typeof message.method === 'string') {
    handleMethod(message);
    return;
  }
  handleResponse(message);
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const headerEnd = buffer.indexOf('\\r\\n\\r\\n');
    if (headerEnd === -1) break;
    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\\s*(\\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number.parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + length) break;
    const body = buffer.slice(bodyStart, bodyStart + length);
    buffer = buffer.slice(bodyStart + length);
    handle(JSON.parse(body));
  }
});
`;
    await writeFile(scriptFile, script);
    try {
      await testFn({ logFile, scriptFile });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  it('selects allow_once for opencode external_directory permission requests', async () => {
    await withFakePermissionAgent(async ({ logFile, scriptFile }) => {
      const { ACPAgentService } = await import('../dist/domains/agents/services/agents/providers/ACPAgentService.js');
      const service = new ACPAgentService({ agentId: 'opencodeacp' });
      const providerProfile = {
        id: 'opencode-acp',
        kind: 'acp',
        protocol: 'acp',
        authType: 'none',
        modelAccessMode: 'bring_your_own_key',
        command: process.execPath,
        args: [scriptFile],
        cwd: process.cwd(),
        env: { ACP_TEST_LOG_FILE: logFile },
      };

      const textOutputs = [];
      for await (const msg of service.invoke('read the external file', { providerProfile })) {
        if (msg.type === 'text') textOutputs.push(msg.content);
      }

      const log = await readFile(logFile, 'utf8');
      assert.match(log, /permission:\{"outcome":\{"outcome":"selected","optionId":"once"\}\}/);
      assert.deepEqual(textOutputs, ['permission flow complete']);
    });
  });

  it('falls back to reject for non-opencode ACP permission requests', async () => {
    await withFakePermissionAgent(async ({ logFile, scriptFile }) => {
      const { ACPAgentService } = await import('../dist/domains/agents/services/agents/providers/ACPAgentService.js');
      const service = new ACPAgentService({ agentId: 'codex' });
      const providerProfile = {
        id: 'relay-teams-test',
        kind: 'acp',
        protocol: 'acp',
        authType: 'none',
        modelAccessMode: 'bring_your_own_key',
        command: process.execPath,
        args: [scriptFile],
        cwd: process.cwd(),
        env: { ACP_TEST_LOG_FILE: logFile },
      };

      const seenTypes = [];
      for await (const msg of service.invoke('read the external file', { providerProfile })) {
        seenTypes.push(msg.type);
      }

      const log = await readFile(logFile, 'utf8');
      assert.match(log, /permission:\{"outcome":\{"outcome":"selected","optionId":"reject"\}\}/);
      assert.equal(seenTypes.includes('done'), true);
    });
  });
});

describe('ACPAgentService resume dispatch', () => {
  async function withFakeACPAgent(testFn) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'acp-agent-service-'));
    const logFile = path.join(tempDir, 'methods.json');
    const scriptFile = path.join(tempDir, 'fake-acp-agent.mjs');
    const script = `
import { appendFileSync } from 'node:fs';

const logFile = process.env.ACP_TEST_LOG_FILE;
let buffer = '';

function write(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(\`Content-Length: \${payload.length}\\r\\n\\r\\n\`);
  process.stdout.write(payload);
}

function handle(message) {
  if (!message || typeof message !== 'object' || typeof message.method !== 'string') return;
  appendFileSync(logFile, \`\${JSON.stringify(message.method)}\\n\`);
  const params = message.params && typeof message.params === 'object' ? message.params : {};
  if (message.method === 'initialize') {
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { audio: false, embeddedContext: false, image: false },
          mcpCapabilities: { http: true, sse: true },
        },
      },
    });
    return;
  }
  if (message.method === 'session/new' || message.method === 'session/load') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: params.sessionId || 'sess-test' } });
    return;
  }
  if (message.method === 'session/resume' || message.method === 'session/prompt') {
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        stopReason: 'end_turn',
        runStatus: message.method === 'session/resume' ? 'paused' : 'completed',
        recoverable: message.method === 'session/resume',
      },
    });
    return;
  }
  write({ jsonrpc: '2.0', id: message.id, result: {} });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const headerEnd = buffer.indexOf('\\r\\n\\r\\n');
    if (headerEnd === -1) break;
    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\\s*(\\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number.parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + length) break;
    const body = buffer.slice(bodyStart, bodyStart + length);
    buffer = buffer.slice(bodyStart + length);
    handle(JSON.parse(body));
  }
});
`;
    await writeFile(scriptFile, script);
    try {
      await testFn({ logFile, scriptFile });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  it('uses session/resume for explicit interrupted-session resume requests', async () => {
    await withFakeACPAgent(async ({ logFile, scriptFile }) => {
      const { ACPAgentService } = await import('../dist/domains/agents/services/agents/providers/ACPAgentService.js');
      const service = new ACPAgentService({ agentId: 'codex' });
      const providerProfile = {
        id: 'relay-teams-test',
        kind: 'acp',
        protocol: 'acp',
        authType: 'none',
        modelAccessMode: 'bring_your_own_key',
        command: process.execPath,
        args: [scriptFile],
        cwd: process.cwd(),
        env: { ACP_TEST_LOG_FILE: logFile },
      };

      const messages = [];
      for await (const msg of service.invoke('continue from interruption', {
        providerProfile,
        sessionId: 'sess-test',
        resumeSession: true,
      })) {
        messages.push(msg);
      }

      const methods = (await readFile(logFile, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));

      assert.deepEqual(methods, ['initialize', 'session/load', 'session/resume']);
      assert.equal(
        messages.some((msg) => msg.type === 'session_init'),
        true,
      );
      assert.equal(
        messages.some((msg) => msg.type === 'system_info' && String(msg.content).includes('"type":"recoverable_pause"')),
        true,
      );
      assert.equal(
        messages.some((msg) => msg.type === 'done'),
        true,
      );
    });
  });

  it('uses session/prompt for normal ACP turns', async () => {
    await withFakeACPAgent(async ({ logFile, scriptFile }) => {
      const { ACPAgentService } = await import('../dist/domains/agents/services/agents/providers/ACPAgentService.js');
      const service = new ACPAgentService({ agentId: 'codex' });
      const providerProfile = {
        id: 'relay-teams-test',
        kind: 'acp',
        protocol: 'acp',
        authType: 'none',
        modelAccessMode: 'bring_your_own_key',
        command: process.execPath,
        args: [scriptFile],
        cwd: process.cwd(),
        env: { ACP_TEST_LOG_FILE: logFile },
      };

      for await (const _msg of service.invoke('fresh prompt', {
        providerProfile,
        sessionId: 'sess-test',
      })) {
        // exhaust stream
      }

      const methods = (await readFile(logFile, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));

      assert.deepEqual(methods, ['initialize', 'session/load', 'session/prompt']);
    });
  });

  it('maps paused-run prompt rejection into recoverable pause system info', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'acp-agent-service-paused-prompt-'));
    const logFile = path.join(tempDir, 'methods.json');
    const scriptFile = path.join(tempDir, 'fake-acp-agent-paused-prompt.mjs');
    const script = `
import { appendFileSync } from 'node:fs';

const logFile = process.env.ACP_TEST_LOG_FILE;
let buffer = '';

function write(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(\`Content-Length: \${payload.length}\\r\\n\\r\\n\`);
  process.stdout.write(payload);
}

function handle(message) {
  if (!message || typeof message !== 'object' || typeof message.method !== 'string') return;
  appendFileSync(logFile, \`\${JSON.stringify(message.method)}\\n\`);
  const params = message.params && typeof message.params === 'object' ? message.params : {};
  if (message.method === 'initialize') {
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { audio: false, embeddedContext: false, image: false },
          mcpCapabilities: { http: true, sse: true },
        },
      },
    });
    return;
  }
  if (message.method === 'session/load') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: params.sessionId || 'sess-test' } });
    return;
  }
  if (message.method === 'session/prompt') {
    write({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32000,
        message: 'Session has a recoverable paused run; use session/resume or session/cancel',
      },
    });
    return;
  }
  write({ jsonrpc: '2.0', id: message.id, result: {} });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const headerEnd = buffer.indexOf('\\r\\n\\r\\n');
    if (headerEnd === -1) break;
    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\\s*(\\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number.parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + length) break;
    const body = buffer.slice(bodyStart, bodyStart + length);
    buffer = buffer.slice(bodyStart + length);
    handle(JSON.parse(body));
  }
});
`;
    await writeFile(scriptFile, script);
    try {
      const { ACPAgentService } = await import('../dist/domains/agents/services/agents/providers/ACPAgentService.js');
      const service = new ACPAgentService({ agentId: 'codex' });
      const providerProfile = {
        id: 'relay-teams-test',
        kind: 'acp',
        protocol: 'acp',
        authType: 'none',
        modelAccessMode: 'bring_your_own_key',
        command: process.execPath,
        args: [scriptFile],
        cwd: process.cwd(),
        env: { ACP_TEST_LOG_FILE: logFile },
      };

      const messages = [];
      for await (const msg of service.invoke('fresh prompt', {
        providerProfile,
        sessionId: 'sess-test',
      })) {
        messages.push(msg);
      }

      assert.equal(
        messages.some((msg) => msg.type === 'system_info' && String(msg.content).includes('"type":"recoverable_pause"')),
        true,
      );
      assert.equal(messages.some((msg) => msg.type === 'error'), false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('drops trailing session/load replay updates before streaming resume output', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'acp-agent-service-replay-'));
    const logFile = path.join(tempDir, 'methods.json');
    const scriptFile = path.join(tempDir, 'fake-acp-agent-replay.mjs');
    const script = `
import { appendFileSync } from 'node:fs';

const logFile = process.env.ACP_TEST_LOG_FILE;
let buffer = '';

function write(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(\`Content-Length: \${payload.length}\\r\\n\\r\\n\`);
  process.stdout.write(payload);
}

function notify(text) {
  write({
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId: 'sess-test',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text },
      },
    },
  });
}

function handle(message) {
  if (!message || typeof message !== 'object' || typeof message.method !== 'string') return;
  appendFileSync(logFile, \`\${JSON.stringify(message.method)}\\n\`);
  const params = message.params && typeof message.params === 'object' ? message.params : {};
  if (message.method === 'initialize') {
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { audio: false, embeddedContext: false, image: false },
          mcpCapabilities: { http: true, sse: true },
        },
      },
    });
    return;
  }
  if (message.method === 'session/load') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: params.sessionId || 'sess-test' } });
    setTimeout(() => notify('loaded history'), 10);
    return;
  }
  if (message.method === 'session/resume') {
    setTimeout(() => notify('resumed continuation'), 20);
    setTimeout(() => {
      write({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          stopReason: 'end_turn',
          runStatus: 'completed',
          recoverable: false,
        },
      });
    }, 40);
    return;
  }
  write({ jsonrpc: '2.0', id: message.id, result: {} });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const headerEnd = buffer.indexOf('\\r\\n\\r\\n');
    if (headerEnd === -1) break;
    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\\s*(\\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number.parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + length) break;
    const body = buffer.slice(bodyStart, bodyStart + length);
    buffer = buffer.slice(bodyStart + length);
    handle(JSON.parse(body));
  }
});
`;
    await writeFile(scriptFile, script);
    try {
      const { ACPAgentService } = await import('../dist/domains/agents/services/agents/providers/ACPAgentService.js');
      const service = new ACPAgentService({ agentId: 'codex' });
      const providerProfile = {
        id: 'relay-teams-test',
        kind: 'acp',
        protocol: 'acp',
        authType: 'none',
        modelAccessMode: 'bring_your_own_key',
        command: process.execPath,
        args: [scriptFile],
        cwd: process.cwd(),
        env: { ACP_TEST_LOG_FILE: logFile },
      };

      const textOutputs = [];
      for await (const msg of service.invoke('continue from interruption', {
        providerProfile,
        sessionId: 'sess-test',
        resumeSession: true,
      })) {
        if (msg.type === 'text') textOutputs.push(msg.content);
      }

      assert.deepEqual(textOutputs, ['resumed continuation']);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});


describe('ACPAgentService cancellation', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  async function withFakeACPAbortAgent(testFn) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'acp-agent-service-abort-'));
    const logFile = path.join(tempDir, 'methods.json');
    const scriptFile = path.join(tempDir, 'fake-acp-agent-abort.mjs');
    const script = `
import { appendFileSync } from 'node:fs';

const logFile = process.env.ACP_TEST_LOG_FILE;
let buffer = '';

function log(payload) {
  appendFileSync(logFile, \`\${JSON.stringify(payload)}\\n\`);
}

function write(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(\`Content-Length: \${payload.length}\\r\\n\\r\\n\`);
  process.stdout.write(payload);
}

function handle(message) {
  if (!message || typeof message !== 'object') return;
  if (typeof message.method !== 'string') return;
  const params = message.params && typeof message.params === 'object' ? message.params : {};
  log({ method: message.method });
  if (message.method === 'initialize') {
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { audio: false, embeddedContext: false, image: false },
          mcpCapabilities: { http: true, sse: true },
        },
      },
    });
    return;
  }
  if (message.method === 'session/new' || message.method === 'session/load') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: params.sessionId || 'sess-test' } });
    return;
  }
  if (message.method === 'session/prompt') {
    setTimeout(() => process.exit(0), 300);
    return;
  }
  if (message.method === 'session/cancel') {
    setTimeout(() => process.exit(0), 10);
    return;
  }
  write({ jsonrpc: '2.0', id: message.id, result: {} });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const headerEnd = buffer.indexOf('\\r\\n\\r\\n');
    if (headerEnd === -1) break;
    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\\s*(\\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number.parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + length) break;
    const body = buffer.slice(bodyStart, bodyStart + length);
    buffer = buffer.slice(bodyStart + length);
    handle(JSON.parse(body));
  }
});
`;
    await writeFile(scriptFile, script);
    try {
      await testFn({ logFile, scriptFile });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  it('does not create an internal AbortSignal timeout for ACP turns', async () => {
    const timeoutMock = mock.method(AbortSignal, 'timeout', () => {
      throw new Error('AbortSignal.timeout should not be called by ACPAgentService');
    });

    const { ACPAgentService } = await import('../dist/domains/agents/services/agents/providers/ACPAgentService.js');
    const service = new ACPAgentService({ agentId: 'codex' });
    const providerProfile = {
      id: 'relay-teams-test',
      kind: 'acp',
      protocol: 'acp',
      authType: 'none',
      modelAccessMode: 'bring_your_own_key',
      command: process.execPath,
      args: ['-e', 'process.exit(0)'],
      cwd: process.cwd(),
    };

    const messages = [];
    for await (const msg of service.invoke('fresh prompt', { providerProfile })) {
      messages.push(msg);
    }

    assert.equal(timeoutMock.mock.calls.length, 0);
    assert.equal(messages.some((msg) => msg.type === 'error'), true);
  });

  it('respects caller abort signal for cancellation', async () => {
    await withFakeACPAbortAgent(async ({ logFile, scriptFile }) => {
      const controller = new AbortController();
      const { ACPAgentService } = await import('../dist/domains/agents/services/agents/providers/ACPAgentService.js');
      const service = new ACPAgentService({ agentId: 'codex' });
      const providerProfile = {
        id: 'relay-teams-test',
        kind: 'acp',
        protocol: 'acp',
        authType: 'none',
        modelAccessMode: 'bring_your_own_key',
        command: process.execPath,
        args: [scriptFile],
        cwd: process.cwd(),
        env: { ACP_TEST_LOG_FILE: logFile },
      };

      setTimeout(() => controller.abort(), 50);
      const messages = [];
      for await (const msg of service.invoke('fresh prompt', {
        providerProfile,
        sessionId: 'sess-test',
        signal: controller.signal,
      })) {
        messages.push(msg);
      }

      assert.equal(messages.some((msg) => msg.type === 'session_init'), true);
      assert.equal(messages.some((msg) => msg.type === 'error'), false);
      assert.equal(messages.at(-1)?.type, 'done');
    });
  });

  it('handles a pre-aborted caller signal without emitting an error', async () => {
    await withFakeACPAbortAgent(async ({ logFile, scriptFile }) => {
      const controller = new AbortController();
      controller.abort();
      const { ACPAgentService } = await import('../dist/domains/agents/services/agents/providers/ACPAgentService.js');
      const service = new ACPAgentService({ agentId: 'codex' });
      const providerProfile = {
        id: 'relay-teams-test',
        kind: 'acp',
        protocol: 'acp',
        authType: 'none',
        modelAccessMode: 'bring_your_own_key',
        command: process.execPath,
        args: [scriptFile],
        cwd: process.cwd(),
        env: { ACP_TEST_LOG_FILE: logFile },
      };

      const messages = [];
      for await (const msg of service.invoke('fresh prompt', {
        providerProfile,
        sessionId: 'sess-test',
        signal: controller.signal,
      })) {
        messages.push(msg);
      }

      assert.equal(messages.some((msg) => msg.type === 'session_init'), true);
      assert.equal(messages.some((msg) => msg.type === 'error'), false);
      assert.equal(messages.at(-1)?.type, 'done');
    });
  });
});

describe('ACP cwd routing', () => {
  async function withFakeAcpCwdAgent(testFn) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'acp-agent-service-cwd-'));
    const logFile = path.join(tempDir, 'cwd-log.jsonl');
    const scriptFile = path.join(tempDir, 'fake-acp-agent-cwd.mjs');
    await writeFile(
      scriptFile,
      `
import { appendFileSync } from 'node:fs';

const logFile = process.env.ACP_TEST_LOG_FILE;
let buffer = '';

function log(payload) {
  appendFileSync(logFile, \`\${JSON.stringify(payload)}\\n\`);
}

function write(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(\`Content-Length: \${payload.length}\\r\\n\\r\\n\`);
  process.stdout.write(payload);
}

function handle(message) {
  if (!message || typeof message !== 'object' || typeof message.method !== 'string') return;
  const params = message.params && typeof message.params === 'object' ? message.params : {};
  if (message.method === 'initialize') {
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { audio: false, embeddedContext: false, image: false },
          mcpCapabilities: { http: true, sse: true },
        },
      },
    });
    return;
  }
  if (message.method === 'session/new' || message.method === 'session/load') {
    log({
      method: message.method,
      cwd: typeof params.cwd === 'string' ? params.cwd : null,
      envProjectRoot: process.env.RELAY_TEAMS_PROJECT_ROOT ?? null,
    });
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: { sessionId: params.sessionId || 'sess-test' },
    });
    return;
  }
  if (message.method === 'session/prompt') {
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        stopReason: 'end_turn',
        runStatus: 'completed',
        recoverable: false,
      },
    });
    return;
  }
  write({ jsonrpc: '2.0', id: message.id, result: {} });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const headerEnd = buffer.indexOf('\\r\\n\\r\\n');
    if (headerEnd === -1) break;
    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\\s*(\\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number.parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + length) break;
    const body = buffer.slice(bodyStart, bodyStart + length);
    buffer = buffer.slice(bodyStart + length);
    handle(JSON.parse(body));
  }
});
`,
    );
    await writeFile(logFile, '');
    try {
      await testFn({ logFile, scriptFile, tempDir });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  it('invoke passes cwd through ACP params without RELAY_TEAMS_PROJECT_ROOT', async () => {
    await withFakeAcpCwdAgent(async ({ logFile, scriptFile, tempDir }) => {
      const workingDirectory = path.join(tempDir, 'invoke-workspace');
      await mkdir(workingDirectory);
      const { ACPAgentService } = await import('../dist/domains/agents/services/agents/providers/ACPAgentService.js');
      const service = new ACPAgentService({ agentId: 'codex' });
      const providerProfile = {
        id: 'relay-teams-test',
        kind: 'acp',
        protocol: 'acp',
        authType: 'none',
        modelAccessMode: 'bring_your_own_key',
        command: process.execPath,
        args: [scriptFile],
        cwd: process.cwd(),
        env: { ACP_TEST_LOG_FILE: logFile },
      };

      for await (const _msg of service.invoke('fresh prompt', {
        providerProfile,
        sessionId: 'sess-test',
        workingDirectory,
      })) {
        // exhaust stream
      }

      const entries = (await readFile(logFile, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      assert.deepEqual(entries, [
        {
          method: 'session/load',
          cwd: workingDirectory,
          envProjectRoot: null,
        },
      ]);
    });
  });

  it('runACPProviderProbe uses cwd param without RELAY_TEAMS_PROJECT_ROOT', async () => {
    await withFakeAcpCwdAgent(async ({ logFile, scriptFile, tempDir }) => {
      const workingDirectory = path.join(tempDir, 'probe-workspace');
      await mkdir(workingDirectory);
      const { runACPProviderProbe } = await import('../dist/domains/agents/services/agents/providers/ACPAgentService.js');
      const providerProfile = {
        id: 'relay-teams-test',
        kind: 'acp',
        protocol: 'acp',
        authType: 'none',
        modelAccessMode: 'bring_your_own_key',
        command: process.execPath,
        args: [scriptFile],
        cwd: process.cwd(),
        env: { ACP_TEST_LOG_FILE: logFile },
      };

      const result = await runACPProviderProbe({
        providerProfile,
        workingDirectory,
      });

      assert.deepEqual(result, { ok: true });
      const entries = (await readFile(logFile, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      assert.deepEqual(entries, [
        {
          method: 'session/new',
          cwd: workingDirectory,
          envProjectRoot: null,
        },
      ]);
    });
  });
});

describe('buildACPModelProfileOverridePayload', () => {
  it('omits provider when a legacy ACP model profile leaves it unset', async () => {
    const { buildACPModelProfileOverridePayload } = await import(
      '../dist/domains/agents/services/agents/providers/acp-model-profile-override.js'
    );

    assert.deepEqual(
      buildACPModelProfileOverridePayload({
        id: 'legacy-default',
        displayName: 'Legacy Default',
        model: 'gpt-5.3-codex',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        createdAt: '2026-03-27T00:00:00.000Z',
        updatedAt: '2026-03-27T00:00:00.000Z',
      }),
      {
        name: 'default',
        model: 'gpt-5.3-codex',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
      },
    );
  });

  it('includes headers when the runtime ACP model profile defines them', async () => {
    const { buildACPModelProfileOverridePayload } = await import(
      '../dist/domains/agents/services/agents/providers/acp-model-profile-override.js'
    );

    assert.deepEqual(
      buildACPModelProfileOverridePayload({
        id: 'huawei-default',
        displayName: 'Huawei Default',
        provider: 'openai_compatible',
        model: 'glm-5',
        baseUrl: 'https://api.modelarts-maas.com/v2',
        apiKey: 'huawei-maas-session',
        headers: {
          Authorization: 'Basic abc123',
        },
        createdAt: '2026-03-27T00:00:00.000Z',
        updatedAt: '2026-03-27T00:00:00.000Z',
      }),
      {
        name: 'default',
        provider: 'openai_compatible',
        model: 'glm-5',
        baseUrl: 'https://api.modelarts-maas.com/v2',
        apiKey: 'huawei-maas-session',
        headers: {
          Authorization: 'Basic abc123',
        },
      },
    );
  });
});
