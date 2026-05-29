/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { OFFICE_CLAW_CONFIGS, officeClawRegistry } from '@openjiuwen/relay-shared';
import {
  bootstrapCapabilities,
  buildOfficeClawMcpDescriptor,
  comparePencilDirs,
  discoverExternalMcpServers,
  generateCliConfigs,
  orchestrate,
  PENCIL_BINARY_SUFFIX,
  parsePencilVersion,
  readCapabilitiesConfig,
  resolvePencilBinary,
  resolveServersForCat,
  writeCapabilitiesConfig,
} from '../dist/config/capabilities/capability-orchestrator.js';
import { ProviderPluginRegistry } from '../../core/dist/index.js';
import { initPluginRegistry, resetPluginRegistry } from '../dist/config/plugins/plugin-registry-singleton.js';

// Bootstrap officeClawRegistry so provider-gated tests can resolve cat → provider.
for (const [id, config] of Object.entries(OFFICE_CLAW_CONFIGS)) {
  if (!officeClawRegistry.has(id)) officeClawRegistry.register(id, config);
}

/** @param {string} prefix */
async function makeTmpDir(prefix) {
  const dir = join(tmpdir(), `cap-orch-test-${prefix}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Helper: minimal capabilities.json */
function makeConfig(capabilities = []) {
  return { version: 1, capabilities };
}

function restoreCatRegistry(snapshot) {
  officeClawRegistry.reset();
  for (const [id, config] of Object.entries(snapshot)) {
    officeClawRegistry.register(id, config);
  }
}

// ────────── Read/Write capabilities.json ──────────

describe('readCapabilitiesConfig', () => {
  /** @type {string} */ let dir;

  beforeEach(async () => {
    dir = await makeTmpDir('cap-read');
  });
  afterEach(async () => {
    resetPluginRegistry();
    await rm(dir, { recursive: true, force: true });
  });

  it('reads valid capabilities.json', async () => {
    await mkdir(join(dir, '.office-claw'), { recursive: true });
    await writeFile(
      join(dir, '.office-claw', 'capabilities.json'),
      JSON.stringify(
        makeConfig([
          {
            id: 'office-claw',
            type: 'mcp',
            enabled: true,
            source: 'builtin',
            mcpServer: { command: 'node', args: ['index.js'] },
          },
        ]),
      ),
    );

    const config = await readCapabilitiesConfig(dir);
    assert.ok(config);
    assert.equal(config.version, 1);
    assert.equal(config.capabilities.length, 1);
    assert.equal(config.capabilities[0].id, 'office-claw');
  });

  it('returns null for missing file', async () => {
    const config = await readCapabilitiesConfig(dir);
    assert.equal(config, null);
  });

  it('returns null for invalid JSON', async () => {
    await mkdir(join(dir, '.office-claw'), { recursive: true });
    await writeFile(join(dir, '.office-claw', 'capabilities.json'), 'not json');
    const config = await readCapabilitiesConfig(dir);
    assert.equal(config, null);
  });

  it('returns null for wrong version', async () => {
    await mkdir(join(dir, '.office-claw'), { recursive: true });
    await writeFile(join(dir, '.office-claw', 'capabilities.json'), JSON.stringify({ version: 99, capabilities: [] }));
    const config = await readCapabilitiesConfig(dir);
    assert.equal(config, null);
  });
});

describe('writeCapabilitiesConfig', () => {
  /** @type {string} */ let dir;

  beforeEach(async () => {
    dir = await makeTmpDir('cap-write');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates .office-claw/ dir and writes config', async () => {
    const config = makeConfig([
      { id: 'test', type: 'mcp', enabled: true, source: 'external', mcpServer: { command: 'echo', args: [] } },
    ]);

    await writeCapabilitiesConfig(dir, config);

    const raw = await readFile(join(dir, '.office-claw', 'capabilities.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.capabilities.length, 1);
  });

  it('round-trips correctly', async () => {
    const config = makeConfig([
      {
        id: 'office-claw',
        type: 'mcp',
        enabled: true,
        source: 'builtin',
        mcpServer: { command: 'node', args: ['server.js'] },
      },
      {
        id: 'ext',
        type: 'mcp',
        enabled: false,
        source: 'external',
        mcpServer: { command: 'npx', args: ['ext-server'] },
        overrides: [{ agentId: 'opus', enabled: true }],
      },
    ]);

    await writeCapabilitiesConfig(dir, config);
    const read = await readCapabilitiesConfig(dir);
    assert.deepEqual(read, config);
  });
});

// ────────── Discovery ──────────

describe('discoverExternalMcpServers', () => {
  /** @type {string} */ let dir;

  beforeEach(async () => {
    dir = await makeTmpDir('discover');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('discovers servers from Claude .mcp.json', async () => {
    const claudeFile = join(dir, '.mcp.json');
    await writeFile(
      claudeFile,
      JSON.stringify({
        mcpServers: {
          filesystem: { command: 'npx', args: ['-y', '@mcp/fs'] },
        },
      }),
    );

    const servers = await discoverExternalMcpServers({
      claudeConfig: claudeFile,
      codexConfig: join(dir, 'nonexistent.toml'),
      geminiConfig: join(dir, 'nonexistent.json'),
    });

    assert.equal(servers.length, 1);
    assert.equal(servers[0].name, 'filesystem');
    assert.equal(servers[0].source, 'external');
  });

  it('deduplicates by name (first wins)', async () => {
    const claudeFile = join(dir, 'claude.json');
    const geminiFile = join(dir, 'gemini.json');
    await writeFile(
      claudeFile,
      JSON.stringify({
        mcpServers: { shared: { command: 'claude-cmd', args: [] } },
      }),
    );
    await writeFile(
      geminiFile,
      JSON.stringify({
        mcpServers: { shared: { command: 'gemini-cmd', args: [] } },
      }),
    );

    const servers = await discoverExternalMcpServers({
      claudeConfig: claudeFile,
      codexConfig: join(dir, 'nonexistent.toml'),
      geminiConfig: geminiFile,
    });

    assert.equal(servers.length, 1);
    assert.equal(servers[0].command, 'claude-cmd'); // first wins
  });

  it('returns empty when no configs exist', async () => {
    const servers = await discoverExternalMcpServers({
      claudeConfig: join(dir, 'a.json'),
      codexConfig: join(dir, 'b.toml'),
      geminiConfig: join(dir, 'c.json'),
    });
    assert.deepEqual(servers, []);
  });

  it('prefers enabled entry over disabled when same name and same transport', async () => {
    // Codex config supports the enabled field natively.
    // First entry: disabled stdio server.
    const codexFile = join(dir, 'codex.toml');
    await writeFile(
      codexFile,
      ['[mcp_servers.shared]', 'command = "codex-cmd"', 'args = []', 'enabled = false'].join('\n'),
    );
    // Second entry: enabled stdio server (same name, same transport).
    const geminiFile = join(dir, 'gemini.json');
    await writeFile(
      geminiFile,
      JSON.stringify({
        mcpServers: { shared: { command: 'gemini-cmd', args: [] } },
      }),
    );

    const servers = await discoverExternalMcpServers({
      claudeConfig: join(dir, 'nonexistent.json'),
      codexConfig: codexFile,
      geminiConfig: geminiFile,
    });

    assert.equal(servers.length, 1);
    // The enabled entry (gemini) should win over the disabled one (codex)
    assert.equal(servers[0].command, 'gemini-cmd');
    assert.notEqual(servers[0].enabled, false);
  });

  it('skips commandless entries (invalid for stdio config model)', async () => {
    const geminiFile = join(dir, 'gemini.json');
    await writeFile(
      geminiFile,
      JSON.stringify({
        mcpServers: {
          jetbrains: { command: '', args: [] },
          filesystem: { command: 'npx', args: ['-y', '@mcp/fs'] },
        },
      }),
    );

    const servers = await discoverExternalMcpServers({
      claudeConfig: join(dir, 'nonexistent.json'),
      codexConfig: join(dir, 'nonexistent.toml'),
      geminiConfig: geminiFile,
    });

    assert.equal(servers.length, 1);
    assert.equal(servers[0].name, 'filesystem');
  });

  it('discovers streamableHttp server from Claude config (URL-based, no command)', async () => {
    const claudeFile = join(dir, 'claude.json');
    await writeFile(
      claudeFile,
      JSON.stringify({
        mcpServers: {
          'remote-tool': {
            type: 'http',
            url: 'https://mcp.example.com/sse',
            headers: { Authorization: 'Bearer tok' },
          },
        },
      }),
    );

    const servers = await discoverExternalMcpServers({
      claudeConfig: claudeFile,
      codexConfig: join(dir, 'nonexistent.toml'),
      geminiConfig: join(dir, 'nonexistent.json'),
    });

    assert.equal(servers.length, 1);
    assert.equal(servers[0].name, 'remote-tool');
    assert.equal(servers[0].transport, 'streamableHttp');
    assert.equal(servers[0].url, 'https://mcp.example.com/sse');
    assert.deepEqual(servers[0].headers, { Authorization: 'Bearer tok' });
    assert.equal(servers[0].source, 'external');
  });

  it('discovers both type:http and type:streamableHttp from Claude config', async () => {
    const claudeFile = join(dir, 'claude.json');
    await writeFile(
      claudeFile,
      JSON.stringify({
        mcpServers: {
          'remote-http': {
            type: 'http',
            url: 'https://mcp.example.com/http',
          },
          'remote-streamable': {
            type: 'streamableHttp',
            url: 'https://mcp.example.com/streamable',
          },
        },
      }),
    );

    const servers = await discoverExternalMcpServers({
      claudeConfig: claudeFile,
      codexConfig: join(dir, 'nonexistent.toml'),
      geminiConfig: join(dir, 'nonexistent.json'),
    });

    assert.equal(servers.length, 2);

    const httpServer = servers.find((s) => s.name === 'remote-http');
    assert.ok(httpServer);
    assert.equal(httpServer.transport, 'streamableHttp');
    assert.equal(httpServer.url, 'https://mcp.example.com/http');

    const streamableServer = servers.find((s) => s.name === 'remote-streamable');
    assert.ok(streamableServer);
    assert.equal(streamableServer.transport, 'streamableHttp');
    assert.equal(streamableServer.url, 'https://mcp.example.com/streamable');
  });
});

// ────────── resolvePencilBinary ──────────

describe('parsePencilVersion', () => {
  it('parses standard version from directory name', () => {
    assert.deepEqual(parsePencilVersion('highagency.pencildev-0.6.33-universal'), [0, 6, 33]);
  });

  it('parses version without suffix', () => {
    assert.deepEqual(parsePencilVersion('highagency.pencildev-1.2.3'), [1, 2, 3]);
  });

  it('returns [0,0,0] for unparseable directory name', () => {
    assert.deepEqual(parsePencilVersion('highagency.pencildev-invalid'), [0, 0, 0]);
  });
});

describe('comparePencilDirs', () => {
  it('sorts 0.6.9 before 0.6.10 (the bug that lexicographic sort gets wrong)', () => {
    const dirs = ['highagency.pencildev-0.6.10-universal', 'highagency.pencildev-0.6.9-universal'];
    dirs.sort(comparePencilDirs);
    assert.equal(dirs[dirs.length - 1], 'highagency.pencildev-0.6.10-universal');
  });

  it('sorts multiple versions correctly', () => {
    const dirs = [
      'highagency.pencildev-0.7.1-universal',
      'highagency.pencildev-0.6.33-universal',
      'highagency.pencildev-1.0.0-universal',
      'highagency.pencildev-0.6.9-universal',
    ];
    dirs.sort(comparePencilDirs);
    assert.deepEqual(dirs, [
      'highagency.pencildev-0.6.9-universal',
      'highagency.pencildev-0.6.33-universal',
      'highagency.pencildev-0.7.1-universal',
      'highagency.pencildev-1.0.0-universal',
    ]);
  });

  it('handles equal versions', () => {
    assert.equal(
      comparePencilDirs('highagency.pencildev-0.6.33-universal', 'highagency.pencildev-0.6.33-universal'),
      0,
    );
  });
});

describe('resolvePencilBinary', () => {
  it('PENCIL_BINARY_SUFFIX must not start with / (deterministic regression guard)', () => {
    assert.ok(
      !PENCIL_BINARY_SUFFIX.startsWith('/'),
      `PENCIL_BINARY_SUFFIX is '${PENCIL_BINARY_SUFFIX}' — leading '/' causes path.resolve() to discard all prefix segments`,
    );
  });

  it('returns a full path under ~/.antigravity/extensions when Pencil is installed', async () => {
    const result = await resolvePencilBinary();
    if (result === null) {
      // No Pencil installation — skip gracefully (CI / environments without Antigravity)
      return;
    }
    assert.ok(
      !result.startsWith('/out/'),
      `resolvePencilBinary() returned '${result}' — looks like PENCIL_BINARY_SUFFIX has a leading '/' that breaks path.resolve()`,
    );
    assert.ok(
      result.includes('.antigravity/extensions'),
      `resolvePencilBinary() should return a path under ~/.antigravity/extensions, got '${result}'`,
    );
    assert.ok(
      result.includes('/out/mcp-server-'),
      `resolvePencilBinary() should include the binary suffix, got '${result}'`,
    );
  });
});

describe('buildOfficeClawMcpDescriptor', () => {
  it('builds correct descriptor', () => {
    const desc = buildOfficeClawMcpDescriptor('/project');
    assert.equal(desc.name, 'office-claw');
    assert.equal(desc.command, 'node');
    assert.ok(desc.args[0].includes('mcp-server/dist/index.js'));
    assert.equal(desc.enabled, true);
    assert.equal(desc.source, 'builtin');
  });
});

// ────────── Bootstrap ──────────

describe('bootstrapCapabilities', () => {
  /** @type {string} */ let dir;

  beforeEach(async () => {
    dir = await makeTmpDir('bootstrap');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('creates capabilities.json with split office-claw servers + externals', async () => {
    // Seed a Claude config with one external server
    const claudeFile = join(dir, '.mcp.json');
    await writeFile(
      claudeFile,
      JSON.stringify({
        mcpServers: {
          filesystem: { command: 'npx', args: ['-y', '@mcp/fs'] },
        },
      }),
    );

    const config = await bootstrapCapabilities(dir, {
      claudeConfig: claudeFile,
      codexConfig: join(dir, 'nonexistent.toml'),
      geminiConfig: join(dir, 'nonexistent.json'),
    });

    assert.equal(config.version, 1);
    // office-claw split(2) + filesystem
    assert.equal(config.capabilities.length, 3);

    const catCafeCollab = config.capabilities.find((c) => c.id === 'office-claw-collab');
    assert.ok(catCafeCollab);
    assert.equal(catCafeCollab.source, 'builtin');
    assert.equal(catCafeCollab.enabled, true);

    const catCafeMemory = config.capabilities.find((c) => c.id === 'office-claw-memory');
    assert.ok(catCafeMemory);
    assert.equal(catCafeMemory.source, 'builtin');

    const fs = config.capabilities.find((c) => c.id === 'filesystem');
    assert.ok(fs);
    assert.equal(fs.source, 'external');

    // Also persisted to disk
    const persisted = await readCapabilitiesConfig(dir);
    assert.ok(persisted);
    assert.equal(persisted.capabilities.length, 3);
  });

  it('skips duplicate office-claw from external discovery', async () => {
    const claudeFile = join(dir, '.mcp.json');
    await writeFile(
      claudeFile,
      JSON.stringify({
        mcpServers: {
          'office-claw': { command: 'node', args: ['old-path.js'] },
        },
      }),
    );

    const config = await bootstrapCapabilities(dir, {
      claudeConfig: claudeFile,
      codexConfig: join(dir, 'x.toml'),
      geminiConfig: join(dir, 'x.json'),
    });

    // Only split built-ins should exist (legacy office-claw external duplicate skipped)
    const catCafeEntries = config.capabilities.filter((c) => c.id === 'office-claw');
    assert.equal(catCafeEntries.length, 0);
    assert.ok(config.capabilities.find((c) => c.id === 'office-claw-collab'));
    assert.ok(config.capabilities.find((c) => c.id === 'office-claw-memory'));
  });

  it('uses officeClawRepoRoot for office-claw MCP descriptor when provided', async () => {
    const claudeFile = join(dir, '.mcp.json');
    await writeFile(claudeFile, JSON.stringify({ mcpServers: {} }));

    const config = await bootstrapCapabilities(
      dir,
      {
        claudeConfig: claudeFile,
        codexConfig: join(dir, 'nonexistent.toml'),
        geminiConfig: join(dir, 'nonexistent.json'),
      },
      { officeClawRepoRoot: '/host-repo' },
    );

    const splitIds = ['office-claw-collab', 'office-claw-memory'];
    for (const splitId of splitIds) {
      const cap = config.capabilities.find((c) => c.id === splitId);
      assert.ok(cap, `${splitId} should exist after bootstrap`);
      assert.equal(cap.type, 'mcp');
      assert.ok(cap.mcpServer);
      assert.ok(
        cap.mcpServer.args[0].includes('/host-repo'),
        `${splitId} MCP serverPath should be built from officeClawRepoRoot`,
      );
    }
  });
});

// ────────── Resolve per-cat ──────────

describe('resolveServersForCat', () => {
  it('applies global enabled state', () => {
    const config = makeConfig([
      {
        id: 'office-claw',
        type: 'mcp',
        enabled: true,
        source: 'builtin',
        mcpServer: { command: 'node', args: ['index.js'] },
      },
      { id: 'disabled', type: 'mcp', enabled: false, source: 'external', mcpServer: { command: 'echo', args: [] } },
    ]);

    const servers = resolveServersForCat(config, 'opus');
    assert.equal(servers.length, 2);
    assert.equal(servers.find((s) => s.name === 'office-claw')?.enabled, true);
    assert.equal(servers.find((s) => s.name === 'disabled')?.enabled, false);
  });

  it('applies per-cat override', () => {
    const config = makeConfig([
      {
        id: 'tool',
        type: 'mcp',
        enabled: true,
        source: 'external',
        mcpServer: { command: 'echo', args: [] },
        overrides: [{ agentId: 'codex', enabled: false }],
      },
    ]);

    // codex has override → disabled
    const codexServers = resolveServersForCat(config, 'codex');
    assert.equal(codexServers[0].enabled, false);

    // opus has no override → uses global (true)
    const opusServers = resolveServersForCat(config, 'opus');
    assert.equal(opusServers[0].enabled, true);
  });

  it('skips skill entries', () => {
    const config = makeConfig([
      { id: 'office-claw', type: 'mcp', enabled: true, source: 'builtin', mcpServer: { command: 'node', args: [] } },
      { id: 'some-skill', type: 'skill', enabled: true, source: 'external' },
    ]);

    const servers = resolveServersForCat(config, 'opus');
    assert.equal(servers.length, 1);
    assert.equal(servers[0].name, 'office-claw');
  });

  it('preserves env and workingDir', () => {
    const config = makeConfig([
      {
        id: 'tool',
        type: 'mcp',
        enabled: true,
        source: 'external',
        mcpServer: { command: 'node', args: [], env: { KEY: 'val' }, workingDir: '/tmp' },
      },
    ]);

    const servers = resolveServersForCat(config, 'opus');
    assert.deepEqual(servers[0].env, { KEY: 'val' });
    assert.equal(servers[0].workingDir, '/tmp');
  });

  it('forces commandless entries disabled for cleanup', () => {
    const config = makeConfig([
      { id: 'jetbrains', type: 'mcp', enabled: true, source: 'external', mcpServer: { command: '', args: [] } },
    ]);

    const servers = resolveServersForCat(config, 'opus');
    assert.equal(servers[0].enabled, false);
  });

  it('enables streamableHttp for Anthropic cat, disables for non-Anthropic cat', () => {
    const config = makeConfig([
      {
        id: 'remote-tool',
        type: 'mcp',
        enabled: true,
        source: 'external',
        mcpServer: {
          command: '',
          args: [],
          transport: 'streamableHttp',
          url: 'https://mcp.example.com/sse',
        },
      },
    ]);

    // opus is anthropic → streamableHttp should be enabled
    const opusServers = resolveServersForCat(config, 'opus');
    assert.equal(opusServers.length, 1);
    assert.equal(opusServers[0].name, 'remote-tool');
    assert.equal(opusServers[0].enabled, true);
    assert.equal(opusServers[0].transport, 'streamableHttp');
    assert.equal(opusServers[0].url, 'https://mcp.example.com/sse');

    // codex is openai → streamableHttp should be disabled
    const codexServers = resolveServersForCat(config, 'codex');
    assert.equal(codexServers.length, 1);
    assert.equal(codexServers[0].name, 'remote-tool');
    assert.equal(codexServers[0].enabled, false);

    // gemini is google → streamableHttp should also be disabled
    const geminiServers = resolveServersForCat(config, 'gemini');
    assert.equal(geminiServers.length, 1);
    assert.equal(geminiServers[0].name, 'remote-tool');
    assert.equal(geminiServers[0].enabled, false);
  });
});

// ────────── Generate CLI configs ──────────

describe('generateCliConfigs', () => {
  /** @type {string} */ let dir;

  beforeEach(async () => {
    dir = await makeTmpDir('gen-cli');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('generates config files for all providers', async () => {
    // Need cats registered for this test
    const hasAnyCats = officeClawRegistry.getAllIds().length > 0;
    if (!hasAnyCats) {
      // Skip if no cats registered (test isolation)
      return;
    }

    const config = makeConfig([
      {
        id: 'office-claw',
        type: 'mcp',
        enabled: true,
        source: 'builtin',
        mcpServer: { command: 'node', args: ['server.js'] },
      },
    ]);

    const paths = {
      anthropic: join(dir, '.mcp.json'),
      openai: join(dir, '.codex', 'config.toml'),
      google: join(dir, '.gemini', 'settings.json'),
    };

    await generateCliConfigs(config, paths);

    // At least one config should exist
    let configCount = 0;
    try {
      await readFile(paths.anthropic, 'utf-8');
      configCount++;
    } catch {
      /* ok */
    }
    try {
      await readFile(paths.openai, 'utf-8');
      configCount++;
    } catch {
      /* ok */
    }
    try {
      await readFile(paths.google, 'utf-8');
      configCount++;
    } catch {
      /* ok */
    }

    assert.ok(configCount > 0, 'At least one CLI config should be generated');
  });

  it('removes managed commandless entries from Gemini settings', async () => {
    const hasGoogleCat = officeClawRegistry.getAllIds().some((id) => {
      const entry = officeClawRegistry.tryGet(id);
      return entry?.config.provider === 'google';
    });
    if (!hasGoogleCat) return;

    const paths = {
      anthropic: join(dir, '.mcp.json'),
      openai: join(dir, '.codex', 'config.toml'),
      google: join(dir, '.gemini', 'settings.json'),
    };

    // Seed an existing invalid entry (historical config).
    await mkdir(join(dir, '.gemini'), { recursive: true });
    await writeFile(
      paths.google,
      JSON.stringify({
        mcpServers: {
          jetbrains: { command: '', args: [] },
        },
      }),
    );

    const config = makeConfig([
      { id: 'jetbrains', type: 'mcp', enabled: true, source: 'external', mcpServer: { command: '', args: [] } },
      {
        id: 'office-claw-collab',
        type: 'mcp',
        enabled: true,
        source: 'builtin',
        mcpServer: { command: 'node', args: ['collab.js'] },
      },
    ]);

    await generateCliConfigs(config, paths);
    const data = JSON.parse(await readFile(paths.google, 'utf-8'));

    assert.equal(data.mcpServers.jetbrains, undefined, 'invalid managed entry should be removed');
    assert.ok(data.mcpServers['office-claw-collab'], 'valid managed entry should remain');
  });

  it('serializes streamableHttp to Claude config and omits it from Codex/Gemini', async () => {
    const hasAnyCats = officeClawRegistry.getAllIds().length > 0;
    if (!hasAnyCats) return;

    const paths = {
      anthropic: join(dir, '.mcp.json'),
      openai: join(dir, '.codex', 'config.toml'),
      google: join(dir, '.gemini', 'settings.json'),
    };

    const config = makeConfig([
      {
        id: 'remote-tool',
        type: 'mcp',
        enabled: true,
        source: 'external',
        mcpServer: {
          command: '',
          args: [],
          transport: 'streamableHttp',
          url: 'https://mcp.example.com/sse',
          headers: { Authorization: 'Bearer tok' },
        },
      },
    ]);

    await generateCliConfigs(config, paths);

    // Claude config should contain the streamableHttp entry with url
    const claudeData = JSON.parse(await readFile(paths.anthropic, 'utf-8'));
    const remoteTool = claudeData.mcpServers['remote-tool'];
    assert.ok(remoteTool, 'streamableHttp server should be written to Claude config');
    assert.equal(remoteTool.type, 'http');
    assert.equal(remoteTool.url, 'https://mcp.example.com/sse');
    assert.deepEqual(remoteTool.headers, { Authorization: 'Bearer tok' });

    // Codex config should NOT contain the streamableHttp entry
    try {
      const codexRaw = await readFile(paths.openai, 'utf-8');
      assert.ok(!codexRaw.includes('remote-tool'), 'streamableHttp should not appear in Codex config');
    } catch {
      // File may not exist if no openai cats — that's fine
    }

    // Gemini config should NOT contain the streamableHttp entry
    try {
      const geminiData = JSON.parse(await readFile(paths.google, 'utf-8'));
      assert.equal(
        geminiData.mcpServers?.['remote-tool'],
        undefined,
        'streamableHttp should not appear in Gemini config',
      );
    } catch {
      // File may not exist if no google cats — that's fine
    }
  });

  it('writes .mcp.json even when no anthropic cats are registered', async () => {
    const snapshot = officeClawRegistry.getAllConfigs();
    officeClawRegistry.reset();
    officeClawRegistry.register('codex', OFFICE_CLAW_CONFIGS.codex);
    officeClawRegistry.register('gemini', OFFICE_CLAW_CONFIGS.gemini);

    try {
      const paths = {
        anthropic: join(dir, '.mcp.json'),
        openai: join(dir, '.codex', 'config.toml'),
        google: join(dir, '.gemini', 'settings.json'),
      };

      const config = makeConfig([
        {
          id: 'office-claw-collab',
          type: 'mcp',
          enabled: true,
          source: 'builtin',
          mcpServer: { command: 'node', args: ['collab.js'] },
        },
      ]);

      await generateCliConfigs(config, paths);

      const claudeData = JSON.parse(await readFile(paths.anthropic, 'utf-8'));
      assert.deepEqual(Object.keys(claudeData.mcpServers), ['office-claw-collab']);
    } finally {
      restoreCatRegistry(snapshot);
    }
  });

  it('prefers a plugin-registry MCP writer over the hardcoded provider writer map', async () => {
    const registry = new ProviderPluginRegistry();
    registry.register({
      name: 'openai-test-plugin',
      providers: ['openai'],
      mcpConfigWriter: async (filePath, servers) => {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, JSON.stringify({ writtenBy: 'plugin', serverCount: servers.length }));
      },
      createAgentService() {
        throw new Error('not needed in this test');
      },
    });
    initPluginRegistry(registry);

    const config = makeConfig([
      {
        id: 'office-claw-collab',
        type: 'mcp',
        enabled: true,
        source: 'builtin',
        mcpServer: { command: 'node', args: ['collab.js'] },
      },
    ]);

    const paths = {
      anthropic: join(dir, '.mcp.json'),
      openai: join(dir, '.codex', 'config.toml'),
      google: join(dir, '.gemini', 'settings.json'),
    };

    await generateCliConfigs(config, paths);

    const written = JSON.parse(await readFile(paths.openai, 'utf-8'));
    assert.equal(written.writtenBy, 'plugin');
    assert.equal(written.serverCount > 0, true);
  });
});

// ────────── Full orchestrate ──────────

describe('orchestrate', () => {
  /** @type {string} */ let dir;

  beforeEach(async () => {
    dir = await makeTmpDir('orch');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('bootstraps on first run (no capabilities.json)', async () => {
    const config = await orchestrate(
      dir,
      {
        claudeConfig: join(dir, '.mcp.json'),
        codexConfig: join(dir, '.codex', 'config.toml'),
        geminiConfig: join(dir, '.gemini', 'settings.json'),
      },
      {
        anthropic: join(dir, '.mcp.json'),
        openai: join(dir, '.codex', 'config.toml'),
        google: join(dir, '.gemini', 'settings.json'),
      },
    );

    assert.ok(config);
    assert.equal(config.version, 1);
    // At minimum, split office-claw MCP servers should be present
    assert.ok(config.capabilities.find((c) => c.id === 'office-claw-collab'));
    assert.ok(config.capabilities.find((c) => c.id === 'office-claw-memory'));
  });

  it('uses existing capabilities.json on subsequent runs', async () => {
    // Pre-seed capabilities.json
    await writeCapabilitiesConfig(
      dir,
      makeConfig([
        {
          id: 'custom',
          type: 'mcp',
          enabled: true,
          source: 'external',
          mcpServer: { command: 'custom-cmd', args: ['--flag'] },
        },
      ]),
    );

    const config = await orchestrate(
      dir,
      {
        claudeConfig: join(dir, '.mcp.json'),
        codexConfig: join(dir, 'x.toml'),
        geminiConfig: join(dir, 'x.json'),
      },
      {
        anthropic: join(dir, '.mcp.json'),
        openai: join(dir, 'out.toml'),
        google: join(dir, 'out.json'),
      },
    );

    // Should use pre-seeded config, not bootstrap fresh
    assert.equal(config.capabilities.length, 1);
    assert.equal(config.capabilities[0].id, 'custom');
  });
});
