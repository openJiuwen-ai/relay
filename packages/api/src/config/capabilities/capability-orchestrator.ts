/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Capability Orchestrator — F041 配置编排器
 *
 * 读取 `.office-claw/capabilities.json` 唯一真相源，
 * 结合 officeClawRegistry 的 provider 映射，
 * 生成三猫 CLI 的 MCP 配置文件。
 *
 * 首次运行时自动从现有 CLI 配置中发现外部 MCP 服务器，
 * 连同 OfficeClaw 自有 MCP 一起写入 capabilities.json。
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { relative, resolve, sep } from 'node:path';
import type { CapabilitiesConfig, CapabilityEntry, McpServerDescriptor } from '@openjiuwen/relay-shared';
import { officeClawRegistry } from '@openjiuwen/relay-shared';
import { getPluginRegistry } from '../plugins/plugin-registry-singleton.js';
import {
  readClaudeMcpConfig,
  readCodexMcpConfig,
  readGeminiMcpConfig,
  writeClaudeMcpConfig,
  writeCodexMcpConfig,
  writeGeminiMcpConfig,
} from './mcp-config-adapters.js';

// ────────── Constants ──────────

const CAPABILITIES_FILENAME = 'capabilities.json';
const OFFICE_CLAW_DIR = '.office-claw';

const PENCIL_EXTENSIONS_DIR = resolve(homedir(), '.antigravity/extensions');
const PENCIL_DIR_PREFIX = 'highagency.pencildev-';
/** @internal Exported for testing only */
export const PENCIL_BINARY_SUFFIX = 'out/mcp-server-darwin-arm64';

/**
 * Parse semver-like version from a Pencil extension directory name.
 * e.g. "highagency.pencildev-0.6.33-universal" → [0, 6, 33]
 * Returns [0, 0, 0] if parsing fails (sorts to the bottom).
 * @internal Exported for testing only
 */
export function parsePencilVersion(dirName: string): [number, number, number] {
  const withoutPrefix = dirName.slice(PENCIL_DIR_PREFIX.length);
  const match = withoutPrefix.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Compare two Pencil extension directory names by semver.
 * @internal Exported for testing only
 */
export function comparePencilDirs(a: string, b: string): number {
  const va = parsePencilVersion(a);
  const vb = parsePencilVersion(b);
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return va[i] - vb[i];
  }
  return 0;
}

/** Fallback provider → CLI config writer mapping */
const PROVIDER_WRITERS = {
  anthropic: writeClaudeMcpConfig,
  openai: writeCodexMcpConfig,
  google: writeGeminiMcpConfig,
} as const;

function getProviderWriter(
  provider: string,
): ((filePath: string, servers: McpServerDescriptor[]) => Promise<void>) | undefined {
  try {
    const plugin = getPluginRegistry().get(provider);
    if (plugin?.mcpConfigWriter) {
      return plugin.mcpConfigWriter as unknown as (filePath: string, servers: McpServerDescriptor[]) => Promise<void>;
    }
  } catch {
    // Registry not yet initialized. Fall through to the legacy map.
  }
  return PROVIDER_WRITERS[provider as keyof typeof PROVIDER_WRITERS];
}

/** Check if a descriptor has a usable transport (stdio command or streamableHttp URL). */
function hasUsableTransport(desc: { command?: string; transport?: string; url?: string }): boolean {
  if (desc.transport === 'streamableHttp') {
    return typeof desc.url === 'string' && desc.url.trim().length > 0;
  }
  return typeof desc.command === 'string' && desc.command.trim().length > 0;
}

/**
 * Resolve the latest Pencil MCP binary path by scanning ~/.antigravity/extensions/.
 * Returns null if no installation is found.
 */
export async function resolvePencilBinary(): Promise<string | null> {
  try {
    const entries = await readdir(PENCIL_EXTENSIONS_DIR);
    const pencilDirs = entries.filter((e) => e.startsWith(PENCIL_DIR_PREFIX)).sort(comparePencilDirs);
    if (pencilDirs.length === 0) return null;
    const latest = pencilDirs[pencilDirs.length - 1];
    return resolve(PENCIL_EXTENSIONS_DIR, latest, PENCIL_BINARY_SUFFIX);
  } catch {
    return null;
  }
}

// ────────── Core: Read / Write capabilities.json ──────────

/** Normalize and validate that a path stays within the project tree. */
function safePath(projectRoot: string, ...segments: string[]): string {
  const root = resolve(projectRoot);
  const normalized = resolve(root, ...segments);
  const rel = relative(root, normalized);
  if (rel.startsWith(`..${sep}`) || rel === '..') {
    throw new Error(`Path escapes project root: ${normalized}`);
  }
  return normalized;
}

export async function readCapabilitiesConfig(projectRoot: string): Promise<CapabilitiesConfig | null> {
  const filePath = safePath(projectRoot, OFFICE_CLAW_DIR, CAPABILITIES_FILENAME);
  try {
    const raw = await readFile(filePath, 'utf-8');
    const data = JSON.parse(raw) as CapabilitiesConfig;
    if (data.version !== 1 || !Array.isArray(data.capabilities)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function writeCapabilitiesConfig(projectRoot: string, config: CapabilitiesConfig): Promise<void> {
  const dir = safePath(projectRoot, OFFICE_CLAW_DIR);
  await mkdir(dir, { recursive: true });
  const filePath = safePath(projectRoot, OFFICE_CLAW_DIR, CAPABILITIES_FILENAME);
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}

// ────────── Discovery: Bootstrap from existing CLI configs ──────────

export interface DiscoveryPaths {
  claudeConfig: string; // e.g. <projectRoot>/.mcp.json
  codexConfig: string; // e.g. <projectRoot>/.codex/config.toml
  geminiConfig: string; // e.g. <projectRoot>/.gemini/settings.json
}

/**
 * Discover external MCP servers from all 3 CLI configs.
 * Merges by name; if same name appears in multiple, first wins.
 */
export async function discoverExternalMcpServers(paths: DiscoveryPaths): Promise<McpServerDescriptor[]> {
  const [claude, codex, gemini] = await Promise.all([
    readClaudeMcpConfig(paths.claudeConfig),
    readCodexMcpConfig(paths.codexConfig),
    readGeminiMcpConfig(paths.geminiConfig),
  ]);

  const byName = new Map<string, McpServerDescriptor>();

  for (const server of [...claude, ...codex, ...gemini]) {
    if (!hasUsableTransport(server)) continue;
    const existing = byName.get(server.name);
    if (!existing) {
      byName.set(server.name, { ...server, source: 'external' });
    } else if (existing.transport === 'streamableHttp' && server.transport !== 'streamableHttp') {
      // Prefer stdio over streamableHttp — but only when the stdio entry is actually
      // enabled, or when the existing streamableHttp entry is disabled anyway.
      // This prevents a disabled stdio duplicate from replacing an enabled HTTP server.
      if (server.enabled !== false || existing.enabled !== true) {
        byName.set(server.name, { ...server, source: 'external' });
      }
    } else if (existing.enabled === false && server.enabled !== false) {
      // Same transport: prefer enabled entry over disabled one.
      byName.set(server.name, { ...server, source: 'external' });
    }
  }
  return [...byName.values()];
}

/**
 * Build the OfficeClaw own MCP server descriptor.
 * Uses the same resolution logic as ClaudeAgentService.
 */
export function buildOfficeClawMcpDescriptor(projectRoot: string): McpServerDescriptor {
  const serverPath = resolve(projectRoot, 'packages/mcp-server/dist/index.js');
  return {
    name: 'office-claw',
    command: 'node',
    args: [serverPath],
    enabled: true,
    source: 'builtin',
  };
}

const SPLIT_SERVER_IDS = ['office-claw-collab', 'office-claw-memory'] as const;
const DEPRECATED_SPLIT_SERVER_IDS = ['cat-cafe-collab', 'cat-cafe-memory', 'cat-cafe-signals'] as const;

function buildSplitMcpDescriptors(projectRoot: string): McpServerDescriptor[] {
  const deprecated: McpServerDescriptor[] = DEPRECATED_SPLIT_SERVER_IDS.map((name) => ({
    name,
    command: '',
    args: [],
    enabled: false,
    source: 'builtin' as const,
  }));
  return [...deprecated,
    {
      name: 'office-claw-collab',
      command: 'node',
      args: [resolve(projectRoot, 'packages/mcp-server/dist/collab.js')],
      enabled: true,
      source: 'builtin',
    },
    {
      name: 'office-claw-memory',
      command: 'node',
      args: [resolve(projectRoot, 'packages/mcp-server/dist/memory.js')],
      enabled: true,
      source: 'builtin',
    },
  ];
}

export function toCapabilityEntry(server: McpServerDescriptor): CapabilityEntry {
  const entry: CapabilityEntry = {
    id: server.name,
    type: 'mcp',
    enabled: server.enabled,
    source: server.source,
    mcpServer: {
      command: server.command,
      args: server.args,
    },
  };
  if (server.transport) entry.mcpServer!.transport = server.transport;
  if (server.url) entry.mcpServer!.url = server.url;
  if (server.headers) entry.mcpServer!.headers = server.headers;
  if (server.env) entry.mcpServer!.env = server.env;
  if (server.workingDir) entry.mcpServer!.workingDir = server.workingDir;
  return entry;
}

type OfficeClawSeed = {
  enabled: boolean;
  overrides?: CapabilityEntry['overrides'];
  env?: Record<string, string>;
  workingDir?: string;
};

function buildSplitCapabilityEntries(projectRoot: string, officeClawSeed?: OfficeClawSeed): CapabilityEntry[] {
  const descriptors = buildSplitMcpDescriptors(projectRoot);
  const entries = descriptors.map((descriptor) => {
    const entry = toCapabilityEntry(descriptor);
    if (officeClawSeed) {
      entry.enabled = officeClawSeed.enabled;
      if (officeClawSeed.overrides) {
        entry.overrides = officeClawSeed.overrides.map((o) => ({ ...o }));
      }
      if (officeClawSeed.env) {
        entry.mcpServer!.env = { ...officeClawSeed.env };
      }
      if (officeClawSeed.workingDir) {
        entry.mcpServer!.workingDir = officeClawSeed.workingDir;
      }
    }
    return entry;
  });
  return entries;
}

// ────────── Bootstrap: Create initial capabilities.json ──────────

/**
 * Bootstrap capabilities.json from discovery.
 * Called once on first run (when capabilities.json doesn't exist).
 */
export async function bootstrapCapabilities(
  projectRoot: string,
  discoveryPaths: DiscoveryPaths,
  opts?: { officeClawRepoRoot?: string },
): Promise<CapabilitiesConfig> {
  const officeClawServers = buildSplitMcpDescriptors(opts?.officeClawRepoRoot ?? projectRoot);
  const externals = await discoverExternalMcpServers(discoveryPaths);

  const capabilities: CapabilityEntry[] = [];

  // Add OfficeClaw's own MCP (split servers)
  for (const entry of buildSplitCapabilityEntries(opts?.officeClawRepoRoot ?? projectRoot)) {
    capabilities.push(entry);
  }

  // Add discovered external MCP servers
  const splitNames = new Set(officeClawServers.map((s) => s.name));
  for (const ext of externals) {
    // Skip built-in server names if already discovered from existing config
    if (ext.name === 'office-claw' || splitNames.has(ext.name)) continue;
    capabilities.push(toCapabilityEntry(ext));
  }

  const config: CapabilitiesConfig = { version: 1, capabilities };
  await writeCapabilitiesConfig(projectRoot, config);
  return config;
}

// ────────── Orchestrate: Generate CLI configs from capabilities.json ──────────

/** Provider → config file path mapping */
export interface CliConfigPaths {
  anthropic: string; // e.g. <projectRoot>/.mcp.json
  openai: string; // e.g. <projectRoot>/.codex/config.toml
  google: string; // e.g. <projectRoot>/.gemini/settings.json
}

/** Providers that support streamableHttp transport (URL-based MCP). */
const STREAMABLE_HTTP_PROVIDERS = new Set(['anthropic']);

function isTransportSupportedForProvider(
  provider: string | undefined,
  mcpServer: NonNullable<CapabilityEntry['mcpServer']>,
): boolean {
  return mcpServer.transport === 'streamableHttp'
    ? provider !== undefined && STREAMABLE_HTTP_PROVIDERS.has(provider) && !!mcpServer.url?.trim()
    : hasUsableTransport(mcpServer);
}

/**
 * Resolve effective MCP servers for a specific agent.
 * Applies global enabled + per-agent overrides + provider transport compatibility.
 */
export function resolveServersForCat(config: CapabilitiesConfig, agentId: string): McpServerDescriptor[] {
  const entry = officeClawRegistry.tryGet(agentId);
  const provider = entry?.config.provider;

  return config.capabilities
    .filter((cap) => cap.type === 'mcp' && cap.mcpServer)
    .map((cap) => {
      const mcpServer = cap.mcpServer;
      if (!mcpServer) {
        throw new Error(`MCP capability ${cap.id} is missing mcpServer configuration`);
      }
      // Resolve effective enabled: global + per-agent override
      const override = cap.overrides?.find((o) => o.agentId === agentId);
      const enabledFromConfig = override ? override.enabled : cap.enabled;
      // Guardrail: entries without usable transport stay disabled for writer cleanup.
      // Also gate streamableHttp by provider — only Anthropic supports URL transport.
      const transportSupported = isTransportSupportedForProvider(provider, mcpServer);
      const enabled = enabledFromConfig && transportSupported;

      const desc: McpServerDescriptor = {
        name: cap.id,
        command: mcpServer.command,
        args: mcpServer.args,
        enabled,
        source: cap.source,
      };
      if (mcpServer.transport) desc.transport = mcpServer.transport;
      if (mcpServer.url) desc.url = mcpServer.url;
      if (mcpServer.headers) desc.headers = mcpServer.headers;
      if (mcpServer.env) desc.env = mcpServer.env;
      if (mcpServer.workingDir) desc.workingDir = mcpServer.workingDir;
      return desc;
    });
}

function resolveServersForProvider(config: CapabilitiesConfig, provider: string): McpServerDescriptor[] {
  const agentIds = officeClawRegistry
    .getAllIds()
    .filter((agentId) => officeClawRegistry.tryGet(agentId as string)?.config.provider === provider);

  if (agentIds.length > 0) {
    const byName = new Map<string, McpServerDescriptor>();
    for (const agentId of agentIds) {
      for (const server of resolveServersForCat(config, agentId as string)) {
        const existing = byName.get(server.name);
        if (!existing || (server.enabled && !existing.enabled)) {
          byName.set(server.name, server);
        }
      }
    }
    return Array.from(byName.values());
  }

  return config.capabilities
    .filter((cap) => cap.type === 'mcp' && cap.mcpServer)
    .map((cap) => {
      const mcpServer = cap.mcpServer;
      if (!mcpServer) {
        throw new Error(`MCP capability ${cap.id} is missing mcpServer configuration`);
      }
      const enabled = cap.enabled && isTransportSupportedForProvider(provider, mcpServer);
      const desc: McpServerDescriptor = {
        name: cap.id,
        command: mcpServer.command,
        args: mcpServer.args,
        enabled,
        source: cap.source,
      };
      if (mcpServer.transport) desc.transport = mcpServer.transport;
      if (mcpServer.url) desc.url = mcpServer.url;
      if (mcpServer.headers) desc.headers = mcpServer.headers;
      if (mcpServer.env) desc.env = mcpServer.env;
      if (mcpServer.workingDir) desc.workingDir = mcpServer.workingDir;
      return desc;
    });
}

/**
 * Group cats by provider, collecting the union of servers each provider needs.
 * A server is included for a provider if ANY agent of that provider has it enabled.
 */
function collectServersPerProvider(config: CapabilitiesConfig): Record<string, McpServerDescriptor[]> {
  const providerServers: Record<string, Map<string, McpServerDescriptor>> = {};

  for (const agentId of officeClawRegistry.getAllIds()) {
    const entry = officeClawRegistry.tryGet(agentId as string);
    if (!entry) continue;
    const provider = entry.config.provider;

    if (!providerServers[provider]) {
      providerServers[provider] = new Map();
    }

    const servers = resolveServersForCat(config, agentId as string);
    for (const s of servers) {
      // If any agent of this provider has it enabled, it's enabled for the provider
      const existing = providerServers[provider].get(s.name);
      if (!existing || (s.enabled && !existing.enabled)) {
        providerServers[provider].set(s.name, s);
      }
    }
  }

  const result: Record<string, McpServerDescriptor[]> = {};
  for (const [provider, serverMap] of Object.entries(providerServers)) {
    result[provider] = Array.from(serverMap.values());
  }
  if (!result.anthropic) {
    result.anthropic = resolveServersForProvider(config, 'anthropic');
  }
  return result;
}

/**
 * Generate all 3 CLI config files from capabilities.json.
 *
 * This is the main orchestration entry point:
 * capabilities.json → resolve per-provider → write CLI configs
 */
export async function generateCliConfigs(config: CapabilitiesConfig, paths: CliConfigPaths): Promise<void> {
  const perProvider = collectServersPerProvider(config);

  // Resolve dynamic paths (e.g. pencil binary) once, apply to all providers
  const pencilBinary = await resolvePencilBinary();
  if (pencilBinary) {
    for (const servers of Object.values(perProvider)) {
      for (const s of servers) {
        if (s.name === 'pencil') {
          s.command = pencilBinary;
        }
      }
    }
  }

  const writes: Promise<void>[] = [];
  for (const [provider, servers] of Object.entries(perProvider)) {
    const writer = getProviderWriter(provider);
    const path = paths[provider as keyof CliConfigPaths];
    if (writer && path) {
      writes.push(writer(path, servers));
    }
  }

  await Promise.all(writes);
}

/**
 * Full orchestration flow:
 * 1. Read or bootstrap capabilities.json
 * 2. Generate CLI configs
 */
export async function orchestrate(
  projectRoot: string,
  discoveryPaths: DiscoveryPaths,
  cliConfigPaths: CliConfigPaths,
  opts?: { officeClawRepoRoot?: string },
): Promise<CapabilitiesConfig> {
  let config = await readCapabilitiesConfig(projectRoot);
  if (!config) {
    config = await bootstrapCapabilities(projectRoot, discoveryPaths, opts);
  }
  await generateCliConfigs(config, cliConfigPaths);

  // F070: Governance bootstrap for external projects
  if (opts?.officeClawRepoRoot && projectRoot !== opts.officeClawRepoRoot) {
    await tryGovernanceBootstrap(projectRoot, opts.officeClawRepoRoot);
  }

  return config;
}

export async function tryGovernanceBootstrap(
  projectRoot: string,
  officeClawRoot: string,
): Promise<{ bootstrapped: boolean; needsConfirmation: boolean }> {
  const { GovernanceBootstrapService } = await import('../governance/governance-bootstrap.js');
  const service = new GovernanceBootstrapService(officeClawRoot);
  const registry = service.getRegistry();
  const existing = await registry.get(projectRoot);

  if (!existing) {
    // Never bootstrapped — needs first-time user confirmation
    return { bootstrapped: false, needsConfirmation: true };
  }

  if (existing.confirmedByUser) {
    // Already confirmed — auto-sync (idempotent)
    await service.bootstrap(projectRoot, { dryRun: false });
    return { bootstrapped: true, needsConfirmation: false };
  }

  return { bootstrapped: false, needsConfirmation: true };
}
