/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  readClaudeMcpConfig,
  readCodexMcpConfig,
  readGeminiMcpConfig,
  writeClaudeMcpConfig,
  writeCodexMcpConfig,
  writeGeminiMcpConfig,
} from '../dist/config/capabilities/mcp-config-adapters.js';

/** @param {string} prefix */
async function makeTmpDir(prefix) {
  const dir = join(tmpdir(), `mcp-config-test-${prefix}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ────────── Readers ──────────

describe('readClaudeMcpConfig', () => {
  /** @type {string} */ let dir;

  beforeEach(async () => {
    dir = await makeTmpDir('claude-read');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('parses standard .mcp.json', async () => {
    const file = join(dir, '.mcp.json');
    await writeFile(
      file,
      JSON.stringify({
        mcpServers: {
          'office-claw': { command: 'node', args: ['./mcp/index.js'], env: { PORT: '3000' } },
          filesystem: { command: 'npx', args: ['-y', '@mcp/fs'] },
        },
      }),
    );

    const result = await readClaudeMcpConfig(file);
    assert.equal(result.length, 2);

    const cafe = result.find((s) => s.name === 'office-claw');
    assert.ok(cafe);
    assert.equal(cafe.command, 'node');
    assert.deepEqual(cafe.args, ['./mcp/index.js']);
    assert.deepEqual(cafe.env, { PORT: '3000' });
    assert.equal(cafe.enabled, true);
    assert.equal(cafe.source, 'external');
  });

  it('returns empty for missing file', async () => {
    const result = await readClaudeMcpConfig(join(dir, 'nonexistent.json'));
    assert.deepEqual(result, []);
  });

  it('returns empty for invalid JSON', async () => {
    const file = join(dir, 'bad.json');
    await writeFile(file, 'not json');
    const result = await readClaudeMcpConfig(file);
    assert.deepEqual(result, []);
  });

  it('returns empty when mcpServers key missing', async () => {
    const file = join(dir, 'no-key.json');
    await writeFile(file, JSON.stringify({ other: 'stuff' }));
    const result = await readClaudeMcpConfig(file);
    assert.deepEqual(result, []);
  });

  it('reads cwd as workingDir', async () => {
    const file = join(dir, 'cwd.json');
    await writeFile(
      file,
      JSON.stringify({
        mcpServers: { test: { command: 'echo', args: [], cwd: '/tmp/work' } },
      }),
    );
    const result = await readClaudeMcpConfig(file);
    assert.equal(result[0].workingDir, '/tmp/work');
  });
});

describe('readCodexMcpConfig', () => {
  /** @type {string} */ let dir;

  beforeEach(async () => {
    dir = await makeTmpDir('codex-read');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('parses .codex/config.toml with MCP servers', async () => {
    const file = join(dir, 'config.toml');
    await writeFile(
      file,
      `
[mcp_servers.office_claw]
command = "node"
args = ["./mcp/index.js"]
enabled = true

[mcp_servers.disabled_server]
command = "echo"
args = ["hello"]
enabled = false
`,
    );

    const result = await readCodexMcpConfig(file);
    assert.equal(result.length, 2);

    const cafe = result.find((s) => s.name === 'office_claw');
    assert.ok(cafe);
    assert.equal(cafe.command, 'node');
    assert.equal(cafe.enabled, true);

    const disabled = result.find((s) => s.name === 'disabled_server');
    assert.ok(disabled);
    assert.equal(disabled.enabled, false);
  });

  it('returns empty for missing file', async () => {
    const result = await readCodexMcpConfig(join(dir, 'nonexistent.toml'));
    assert.deepEqual(result, []);
  });

  it('returns empty for invalid TOML', async () => {
    const file = join(dir, 'bad.toml');
    await writeFile(file, '[[[[not valid toml');
    const result = await readCodexMcpConfig(file);
    assert.deepEqual(result, []);
  });

  it('returns empty when mcp_servers key missing', async () => {
    const file = join(dir, 'no-mcp.toml');
    await writeFile(file, '[model]\nname = "gpt-4"');
    const result = await readCodexMcpConfig(file);
    assert.deepEqual(result, []);
  });

  it('defaults enabled to true when omitted', async () => {
    const file = join(dir, 'no-enabled.toml');
    await writeFile(
      file,
      `
[mcp_servers.test]
command = "echo"
args = []
`,
    );
    const result = await readCodexMcpConfig(file);
    assert.equal(result[0].enabled, true);
  });

  it('reads env as string record', async () => {
    const file = join(dir, 'with-env.toml');
    await writeFile(
      file,
      `
[mcp_servers.test]
command = "node"
args = ["index.js"]

[mcp_servers.test.env]
API_KEY = "secret"
PORT = "8080"
`,
    );
    const result = await readCodexMcpConfig(file);
    assert.deepEqual(result[0].env, { API_KEY: 'secret', PORT: '8080' });
  });
});

describe('readGeminiMcpConfig', () => {
  /** @type {string} */ let dir;

  beforeEach(async () => {
    dir = await makeTmpDir('gemini-read');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('parses .gemini/settings.json', async () => {
    const file = join(dir, 'settings.json');
    await writeFile(
      file,
      JSON.stringify({
        mcpServers: {
          'office-claw': { command: 'node', args: ['./mcp/index.js'] },
        },
        otherSetting: true,
      }),
    );

    const result = await readGeminiMcpConfig(file);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'office-claw');
    assert.equal(result[0].command, 'node');
  });

  it('returns empty for missing file', async () => {
    const result = await readGeminiMcpConfig(join(dir, 'nonexistent.json'));
    assert.deepEqual(result, []);
  });

  it('reads cwd as workingDir', async () => {
    const file = join(dir, 'cwd.json');
    await writeFile(
      file,
      JSON.stringify({
        mcpServers: { test: { command: 'echo', args: [], cwd: '/work' } },
      }),
    );
    const result = await readGeminiMcpConfig(file);
    assert.equal(result[0].workingDir, '/work');
  });
});

// ────────── Writers ──────────

describe('writeClaudeMcpConfig', () => {
  /** @type {string} */ let dir;

  beforeEach(async () => {
    dir = await makeTmpDir('claude-write');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes enabled servers to .mcp.json', async () => {
    const file = join(dir, '.mcp.json');
    await writeClaudeMcpConfig(file, [
      { name: 'office-claw', command: 'node', args: ['index.js'], enabled: true, source: 'builtin' },
      { name: 'disabled', command: 'echo', args: [], enabled: false, source: 'external' },
    ]);

    const raw = await readFile(file, 'utf-8');
    const data = JSON.parse(raw);
    // Only enabled servers are written (Claude has no enabled field)
    assert.ok(data.mcpServers['office-claw']);
    assert.equal(data.mcpServers.disabled, undefined);
  });

  it('writes env and cwd when present', async () => {
    const file = join(dir, '.mcp.json');
    await writeClaudeMcpConfig(file, [
      {
        name: 'test',
        command: 'node',
        args: [],
        enabled: true,
        source: 'external',
        env: { KEY: 'val' },
        workingDir: '/tmp',
      },
    ]);

    const data = JSON.parse(await readFile(file, 'utf-8'));
    assert.deepEqual(data.mcpServers.test.env, { KEY: 'val' });
    assert.equal(data.mcpServers.test.cwd, '/tmp');
  });

  it('creates parent directories', async () => {
    const file = join(dir, 'sub', 'dir', '.mcp.json');
    await writeClaudeMcpConfig(file, []);
    const raw = await readFile(file, 'utf-8');
    assert.ok(raw.includes('mcpServers'));
  });
});

describe('writeCodexMcpConfig', () => {
  /** @type {string} */ let dir;

  beforeEach(async () => {
    dir = await makeTmpDir('codex-write');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes MCP servers to TOML', async () => {
    const file = join(dir, 'config.toml');
    await writeCodexMcpConfig(file, [
      { name: 'office_claw', command: 'node', args: ['index.js'], enabled: true, source: 'builtin' },
      { name: 'disabled', command: 'echo', args: [], enabled: false, source: 'external' },
    ]);

    const raw = await readFile(file, 'utf-8');
    // Both servers written (Codex has enabled field)
    assert.ok(raw.includes('[mcp_servers.office_claw]'));
    assert.ok(raw.includes('[mcp_servers.disabled]'));
    assert.ok(raw.includes('enabled = true'));
    assert.ok(raw.includes('enabled = false'));
  });

  it('preserves existing non-MCP config', async () => {
    const file = join(dir, 'config.toml');
    await writeFile(file, '[model]\nname = "gpt-4"\n');

    await writeCodexMcpConfig(file, [{ name: 'test', command: 'echo', args: [], enabled: true, source: 'external' }]);

    const raw = await readFile(file, 'utf-8');
    assert.ok(raw.includes('[model]'));
    assert.ok(raw.includes('name = "gpt-4"'));
    assert.ok(raw.includes('[mcp_servers.test]'));
  });
});

describe('writeGeminiMcpConfig', () => {
  /** @type {string} */ let dir;

  beforeEach(async () => {
    dir = await makeTmpDir('gemini-write');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes enabled servers to settings.json', async () => {
    const file = join(dir, 'settings.json');
    await writeGeminiMcpConfig(file, [
      { name: 'office-claw', command: 'node', args: ['index.js'], enabled: true, source: 'builtin' },
      { name: 'disabled', command: 'echo', args: [], enabled: false, source: 'external' },
    ]);

    const data = JSON.parse(await readFile(file, 'utf-8'));
    // Only enabled servers (Gemini has no enabled field)
    assert.ok(data.mcpServers['office-claw']);
    assert.equal(data.mcpServers.disabled, undefined);
  });

  it('preserves existing non-MCP settings', async () => {
    const file = join(dir, 'settings.json');
    await writeFile(file, JSON.stringify({ theme: 'dark', mcpServers: {} }));

    await writeGeminiMcpConfig(file, [{ name: 'test', command: 'echo', args: [], enabled: true, source: 'external' }]);

    const data = JSON.parse(await readFile(file, 'utf-8'));
    assert.equal(data.theme, 'dark');
    assert.ok(data.mcpServers.test);
  });

  it('injects callback env placeholders for managed office-claw servers', async () => {
    const file = join(dir, 'settings.json');
    await writeGeminiMcpConfig(file, [
      { name: 'office-claw-collab', command: 'node', args: ['collab.js'], enabled: true, source: 'builtin' },
    ]);

    const data = JSON.parse(await readFile(file, 'utf-8'));
    assert.deepEqual(data.mcpServers['office-claw-collab'].env, {
      OFFICE_CLAW_API_URL: '${OFFICE_CLAW_API_URL}',
      OFFICE_CLAW_INVOCATION_ID: '${OFFICE_CLAW_INVOCATION_ID}',
      OFFICE_CLAW_CALLBACK_TOKEN: '${OFFICE_CLAW_CALLBACK_TOKEN}',
      OFFICE_CLAW_USER_ID: '${OFFICE_CLAW_USER_ID}',
      OFFICE_CLAW_SIGNAL_USER: '${OFFICE_CLAW_SIGNAL_USER}',
    });
  });

  it('injects callback env placeholders for preserved legacy office-claw server', async () => {
    const file = join(dir, 'settings.json');
    await writeFile(
      file,
      JSON.stringify({
        mcpServers: {
          'office-claw': { command: 'node', args: ['legacy-index.js'] },
        },
      }),
    );

    await writeGeminiMcpConfig(file, [
      { name: 'office-claw-collab', command: 'node', args: ['collab.js'], enabled: true, source: 'builtin' },
    ]);

    const data = JSON.parse(await readFile(file, 'utf-8'));
    assert.deepEqual(data.mcpServers['office-claw'].env, {
      OFFICE_CLAW_API_URL: '${OFFICE_CLAW_API_URL}',
      OFFICE_CLAW_INVOCATION_ID: '${OFFICE_CLAW_INVOCATION_ID}',
      OFFICE_CLAW_CALLBACK_TOKEN: '${OFFICE_CLAW_CALLBACK_TOKEN}',
      OFFICE_CLAW_USER_ID: '${OFFICE_CLAW_USER_ID}',
      OFFICE_CLAW_SIGNAL_USER: '${OFFICE_CLAW_SIGNAL_USER}',
    });
  });

  it('drops project-level pencil entry so Gemini only relies on shared home pencil server', async () => {
    const file = join(dir, '.gemini', 'settings.json');
    await mkdir(join(dir, '.gemini'), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        mcpServers: {
          pencil: { command: '/old/pencil', args: ['--app', 'antigravity'] },
        },
      }),
    );

    await writeGeminiMcpConfig(file, [
      { name: 'pencil', command: '/new/pencil', args: ['--app', 'antigravity'], enabled: true, source: 'external' },
      { name: 'office-claw', command: 'node', args: ['index.js'], enabled: true, source: 'builtin' },
    ]);

    const data = JSON.parse(await readFile(file, 'utf-8'));
    assert.equal(data.mcpServers.pencil, undefined, 'project Gemini config should not contain pencil');
    assert.ok(data.mcpServers['office-claw'], 'office-claw server should still be written');
  });
});

// ────────── P1-2 Regression: Preserve user's non-managed MCP servers ──────────

describe('P1-2: writers preserve non-managed MCP servers', () => {
  /** @type {string} */ let dir;

  beforeEach(async () => {
    dir = await makeTmpDir('preserve');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writeClaudeMcpConfig preserves user MCP servers not in managed list', async () => {
    const file = join(dir, '.mcp.json');
    // User already has their own MCP servers
    await writeFile(
      file,
      JSON.stringify({
        mcpServers: {
          'user-custom': { command: 'my-server', args: ['--port', '9999'] },
          'office-claw': { command: 'node', args: ['old-server.js'] },
        },
      }),
    );

    // OfficeClaw orchestrator writes only managed servers
    await writeClaudeMcpConfig(file, [
      { name: 'office-claw', command: 'node', args: ['new-server.js'], enabled: true, source: 'builtin' },
    ]);

    const data = JSON.parse(await readFile(file, 'utf-8'));
    // office-claw should be updated
    assert.deepEqual(data.mcpServers['office-claw'].args, ['new-server.js']);
    // user-custom should still be there!
    assert.ok(data.mcpServers['user-custom'], 'User MCP server should be preserved');
    assert.equal(data.mcpServers['user-custom'].command, 'my-server');
  });

  it('writeCodexMcpConfig preserves user MCP servers not in managed list', async () => {
    const file = join(dir, 'config.toml');
    await writeFile(
      file,
      `[model]
name = "gpt-4"

[mcp_servers.user_tool]
command = "my-tool"
args = ["--mode", "dev"]
enabled = true

[mcp_servers.office_claw]
command = "node"
args = ["old-server.js"]
enabled = true
`,
    );

    await writeCodexMcpConfig(file, [
      { name: 'office_claw', command: 'node', args: ['new-server.js'], enabled: true, source: 'builtin' },
    ]);

    const raw = await readFile(file, 'utf-8');
    // office_claw updated
    assert.ok(raw.includes('new-server.js'));
    // user_tool preserved
    assert.ok(raw.includes('[mcp_servers.user_tool]'), 'User MCP server should be preserved');
    assert.ok(raw.includes('my-tool'));
    // model section preserved
    assert.ok(raw.includes('[model]'));
  });

  it('writeGeminiMcpConfig preserves user MCP servers not in managed list', async () => {
    const file = join(dir, 'settings.json');
    await writeFile(
      file,
      JSON.stringify({
        theme: 'dark',
        mcpServers: {
          'user-tool': { command: 'my-tool', args: [] },
          'office-claw': { command: 'node', args: ['old-server.js'] },
        },
      }),
    );

    await writeGeminiMcpConfig(file, [
      { name: 'office-claw', command: 'node', args: ['new-server.js'], enabled: true, source: 'builtin' },
    ]);

    const data = JSON.parse(await readFile(file, 'utf-8'));
    // office-claw updated
    assert.deepEqual(data.mcpServers['office-claw'].args, ['new-server.js']);
    // user-tool preserved
    assert.ok(data.mcpServers['user-tool'], 'User MCP server should be preserved');
    assert.equal(data.mcpServers['user-tool'].command, 'my-tool');
    // theme preserved
    assert.equal(data.theme, 'dark');
  });
});

// ────────── Round-trip tests ──────────

describe('round-trip: read → write → read', () => {
  /** @type {string} */ let dir;

  beforeEach(async () => {
    dir = await makeTmpDir('roundtrip');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('Claude .mcp.json round-trips correctly', async () => {
    const servers = [
      {
        name: 'office-claw',
        command: 'node',
        args: ['./mcp/index.js'],
        env: { PORT: '3000' },
        enabled: true,
        source: /** @type {const} */ ('builtin'),
      },
      { name: 'fs', command: 'npx', args: ['-y', '@mcp/fs'], enabled: true, source: /** @type {const} */ ('external') },
    ];

    const file = join(dir, '.mcp.json');
    await writeClaudeMcpConfig(file, servers);
    const roundTripped = await readClaudeMcpConfig(file);

    assert.equal(roundTripped.length, 2);
    assert.equal(roundTripped[0].name, 'office-claw');
    assert.equal(roundTripped[0].command, 'node');
    assert.deepEqual(roundTripped[0].env, { PORT: '3000' });
  });

  it('Codex config.toml round-trips correctly', async () => {
    const servers = [
      {
        name: 'office_claw',
        command: 'node',
        args: ['index.js'],
        enabled: true,
        source: /** @type {const} */ ('builtin'),
      },
      { name: 'disabled', command: 'echo', args: [], enabled: false, source: /** @type {const} */ ('external') },
    ];

    const file = join(dir, 'config.toml');
    await writeCodexMcpConfig(file, servers);
    const roundTripped = await readCodexMcpConfig(file);

    assert.equal(roundTripped.length, 2);
    const cafe = roundTripped.find((s) => s.name === 'office_claw');
    assert.ok(cafe);
    assert.equal(cafe.enabled, true);
    const dis = roundTripped.find((s) => s.name === 'disabled');
    assert.ok(dis);
    assert.equal(dis.enabled, false);
  });

  it('Gemini settings.json round-trips correctly', async () => {
    const servers = [
      {
        name: 'office-claw',
        command: 'node',
        args: ['index.js'],
        enabled: true,
        source: /** @type {const} */ ('builtin'),
        workingDir: '/tmp',
      },
    ];

    const file = join(dir, 'settings.json');
    await writeGeminiMcpConfig(file, servers);
    const roundTripped = await readGeminiMcpConfig(file);

    assert.equal(roundTripped.length, 1);
    assert.equal(roundTripped[0].workingDir, '/tmp');
  });
});
