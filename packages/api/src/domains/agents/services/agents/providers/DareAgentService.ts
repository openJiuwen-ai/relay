/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * DARE Agent Service
 *
 * Invokes the external DARE CLI in headless mode. The runtime can be either:
 * - a source checkout launched as `python -m client`
 * - a bundled standalone executable such as `vendor/dare.exe`
 */

import { createHash } from 'node:crypto';
import { accessSync, existsSync, constants as fsConstants, lstatSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { type AgentId, createAgentId } from '@openjiuwen/relay-shared';
import { getAgentModel } from '../../../../../config/office-claw-models.js';
import { getContextWindowFallback } from '../../../../../config/context-window-sizes.js';
import { createModuleLogger } from '../../../../../infrastructure/logger.js';
import { withBundledPythonPath } from '../../../../../utils/bundled-python-env.js';
import { resolveOfficeClawHostRoot } from '../../../../../utils/office-claw-root.js';
import { formatCliExitError } from '../../../../../utils/cli-format.js';
import { isCliError, isCliTimeout, isLivenessWarning, spawnCli } from '../../../../../utils/cli-spawn.js';
import type { SpawnFn } from '../../../../../utils/cli-types.js';
import type { AgentMessage, AgentService, AgentServiceOptions, MessageMetadata } from '../../types.js';
import { transformDareEvent } from './dare-event-transform.js';

function resolveDefaultDareMcpServerPath(cwd = process.cwd()): string | undefined {
  // Prefer the compact MCP entry to reduce tool-schema token overhead.
  const roots = [
    resolve(cwd, '../mcp-server/dist'),
    resolve(cwd, 'packages/mcp-server/dist'),
    resolve(cwd, '../../packages/mcp-server/dist'),
  ];
  for (const root of roots) {
    const compact = join(root, 'dare.js');
    if (existsSync(compact)) return compact;
    const full = join(root, 'index.js');
    if (existsSync(full)) return full;
  }
  return undefined;
}

function preferCompactMcpEntry(mcpPath: string): string {
  if (!mcpPath.endsWith('index.js')) return mcpPath;
  const compactPath = join(dirname(mcpPath), 'dare.js');
  return existsSync(compactPath) ? compactPath : mcpPath;
}

const DARE_MCP_CONFIG_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.md', '.markdown']);
const DARE_MCP_JS_ENTRY_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const SHOULD_EMIT_DIAGNOSTICS =
  !process.argv.includes('--test') &&
  !process.execArgv.includes('--test') &&
  process.env.OFFICE_CLAW_DARE_DIAG_LOG === '1';

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value];
  }
  return [];
}

function toStringMap(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') result[key] = entry;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function resolveBridgeConfigPath(seed: string): string {
  const digest = createHash('sha1').update(seed).digest('hex').slice(0, 12);
  return join(tmpdir(), `office-claw-dare-mcp-${digest}.json`);
}

function normalizeMcpServerName(name: string): string | null {
  const normalized = name
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  if (normalized.length === 0) return null;
  if (/^\d/.test(normalized)) return `mcp_${normalized}`;
  return normalized;
}

function makeUniqueServerName(baseName: string, usedNames: Set<string>): string {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }
  let suffix = 2;
  while (usedNames.has(`${baseName}_${suffix}`)) {
    suffix += 1;
  }
  const candidate = `${baseName}_${suffix}`;
  usedNames.add(candidate);
  return candidate;
}

function inferCwdFromCommand(command: string, args: string[]): string | undefined {
  if (args.length > 0 && isAbsolute(args[0]!)) {
    return dirname(args[0]!);
  }
  if (isAbsolute(command)) {
    return dirname(command);
  }
  return undefined;
}

function sanitizeArgValue(flag: string, value: string): string {
  if (flag === '--task' || flag === '--system-prompt-text') {
    return `<redacted:${value.length} chars>`;
  }
  return value;
}

function sanitizeArgsForLog(args: string[]): string[] {
  const sanitized = [...args];
  const valueFlags = new Set([
    '--task',
    '--system-prompt-text',
    '--adapter',
    '--model',
    '--endpoint',
    '--workspace',
    '--session-id',
    '--mcp-path',
  ]);
  for (let i = 0; i < sanitized.length; i += 1) {
    const current = sanitized[i];
    if (!current || !valueFlags.has(current)) continue;
    const next = sanitized[i + 1];
    if (!next) continue;
    sanitized[i + 1] = sanitizeArgValue(current, next);
    i += 1;
  }
  return sanitized;
}

function summarizeEnvForLog(env: Record<string, string | null>): Record<string, string> {
  const summary: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === null) {
      summary[key] = '(cleared)';
      continue;
    }
    if (/key|secret|token|password|authorization/i.test(key)) {
      summary[key] =
        value.length > 8 ? `${value.slice(0, 6)}***(${value.length})` : `${value[0] ?? ''}***(${value.length})`;
      continue;
    }
    summary[key] = value.length > 160 ? `${value.slice(0, 160)}...(truncated)` : value;
  }
  return summary;
}

function extractArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  return args[index + 1];
}

function emitDareDiagnostic(level: 'info' | 'debug', message: string, payload: Record<string, unknown>): void {
  if (!SHOULD_EMIT_DIAGNOSTICS) return;
  const line = JSON.stringify({ module: 'dare-agent', ...payload, msg: message });
  if (level === 'debug') {
    if (process.argv.includes('--debug') || process.env.LOG_LEVEL === 'debug') {
      console.debug(line);
    }
    return;
  }
  console.info(line);
}

function buildClaudeStyleDareServers(data: JsonObject): JsonObject[] | null {
  const mcpServers = data.mcpServers;
  if (!isRecord(mcpServers)) return null;

  const servers: JsonObject[] = [];
  const usedServerNames = new Set<string>();
  for (const [rawName, rawConfig] of Object.entries(mcpServers)) {
    const normalizedName = normalizeMcpServerName(rawName);
    if (!normalizedName || !isRecord(rawConfig)) continue;
    const name = makeUniqueServerName(normalizedName, usedServerNames);

    const enabled = rawConfig.enabled !== false;
    if (!enabled) continue;

    const maybeType = typeof rawConfig.type === 'string' ? rawConfig.type : '';
    const maybeUrl = typeof rawConfig.url === 'string' ? rawConfig.url.trim() : '';
    if (maybeType === 'http' || maybeUrl.length > 0) {
      if (maybeUrl.length === 0) continue;
      const headers = toStringMap(rawConfig.headers);
      const server: JsonObject = { name, transport: 'http', url: maybeUrl, enabled: true };
      if (headers) server.headers = headers;
      servers.push(server);
      continue;
    }

    const command = typeof rawConfig.command === 'string' ? rawConfig.command.trim() : '';
    if (command.length === 0) continue;
    const args = toStringArray(rawConfig.args);
    const env = toStringMap(rawConfig.env);
    const explicitCwd =
      typeof rawConfig.cwd === 'string' && rawConfig.cwd.trim().length > 0 ? rawConfig.cwd.trim() : undefined;
    const cwd = explicitCwd ?? inferCwdFromCommand(command, args);
    const server: JsonObject = { name, transport: 'stdio', command: [command, ...args], enabled: true };
    if (env) server.env = env;
    if (cwd) server.cwd = cwd;
    servers.push(server);
  }
  return servers;
}

const log = createModuleLogger('dare-agent');

interface DareAgentServiceOptions {
  agentId?: AgentId;
  adapter?: string;
  model?: string;
  endpoint?: string;
  apiKey?: string;
  /** Path to a DARE source checkout, or a bundled dare executable. */
  darePath?: string;
  /** Absolute path to Dare MCP config path for --mcp-path (file/dir), or legacy JS entry path. */
  mcpServerPath?: string;
  spawnFn?: SpawnFn;
}

interface DareWorkspaceConfig {
  adapter?: string;
  model?: string;
}

type DareLaunchMode = 'module' | 'executable';

interface DareLaunchSpec {
  command: string;
  argsPrefix: string[];
  cwd?: string;
  runtimeMode: DareLaunchMode;
}

const DARE_API_KEY_ENV = 'DARE_API_KEY';
const DARE_ENDPOINT_ENV = 'DARE_ENDPOINT';
const DARE_ADAPTER_OVERRIDE_ENV = 'OFFICE_CLAW_DARE_ADAPTER';
const DARE_SSL_VERIFY_ENV = 'DARE_SSL_VERIFY';

const ADAPTER_KEY_ENV: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  'huawei-modelarts': 'HUAWEI_MODELARTS_API_KEY',
};

const ADAPTER_ENDPOINT_ENV: Record<string, string> = {
  openai: 'OPENAI_BASE_URL',
  openrouter: 'OPENROUTER_BASE_URL',
  anthropic: 'ANTHROPIC_BASE_URL',
  'huawei-modelarts': 'HUAWEI_MODELARTS_BASE_URL',
};

function hasDareModuleEntry(darePath: string): boolean {
  return existsSync(join(darePath, 'client', '__main__.py')) || existsSync(join(darePath, 'client', '__main__.pyc'));
}

function readWorkspaceDareConfig(workspace?: string): DareWorkspaceConfig | null {
  if (!workspace) return null;
  const configPath = join(workspace, '.dare', 'config.json');
  if (!existsSync(configPath)) return null;
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as { llm?: { adapter?: unknown; model?: unknown } };
    const adapter = typeof parsed.llm?.adapter === 'string' ? parsed.llm.adapter.trim() : '';
    const model = typeof parsed.llm?.model === 'string' ? parsed.llm.model.trim() : '';
    if (!adapter && !model) return null;
    return {
      ...(adapter ? { adapter } : {}),
      ...(model ? { model } : {}),
    };
  } catch {
    return null;
  }
}

function formatWorkspaceModel(config: DareWorkspaceConfig | null): string | undefined {
  const adapter = config?.adapter?.trim();
  const model = config?.model?.trim();
  if (adapter && model) return `${adapter}/${model}`;
  if (model) return model;
  return undefined;
}

function resolveMetadataModel(
  agentId: AgentId,
  explicitModel?: string,
  workspaceConfig?: DareWorkspaceConfig | null,
): string {
  if (explicitModel) return explicitModel;
  const workspaceModel = formatWorkspaceModel(workspaceConfig ?? null);
  if (workspaceModel) return workspaceModel;
  try {
    return getAgentModel(agentId as string);
  } catch {
    return 'unknown';
  }
}

export function resolveVendorDarePath(): string {
  return join(resolveOfficeClawHostRoot(process.cwd()), 'vendor', 'dare-cli');
}

export function resolveVendoredDareExecutable(): string {
  return join(resolveOfficeClawHostRoot(process.cwd()), 'vendor', 'dare.exe');
}

function isExistingFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function commandExistsOnPath(command: string, envPath = process.env.PATH): boolean {
  if (!envPath) return false;

  const pathEntries = envPath.split(delimiter).filter(Boolean);
  if (pathEntries.length === 0) return false;

  if (process.platform === 'win32') {
    const pathExt = process.env.PATHEXT?.split(';').filter(Boolean) ?? ['.EXE', '.CMD', '.BAT', '.COM'];
    const commandHasExt = /\.[^\\/]+$/.test(command);
    const candidates = commandHasExt ? [command] : [command, ...pathExt.map((ext) => `${command}${ext.toLowerCase()}`)];
    for (const entry of pathEntries) {
      for (const candidate of candidates) {
        if (isExistingFile(join(entry, candidate))) return true;
      }
    }
    return false;
  }

  for (const entry of pathEntries) {
    const candidate = join(entry, command);
    try {
      accessSync(candidate, fsConstants.X_OK);
      if (isExistingFile(candidate)) return true;
    } catch {
      // Try next PATH entry.
    }
  }
  return false;
}

export function resolveSystemPythonCommand(envPath = process.env.PATH): string {
  const candidates = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
  for (const candidate of candidates) {
    if (commandExistsOnPath(candidate, envPath)) return candidate;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

export function resolveVenvPython(darePath: string, envPath = process.env.PATH): string {
  const candidates =
    process.platform === 'win32'
      ? [join(darePath, '.venv', 'Scripts', 'python.exe'), join(darePath, '.venv', 'bin', 'python')]
      : [join(darePath, '.venv', 'bin', 'python'), join(darePath, '.venv', 'Scripts', 'python.exe')];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  // Shared Python from Windows installer layout (embeddable + deps in Lib/site-packages)
  const sharedPython = join(resolveOfficeClawHostRoot(process.cwd()), 'tools', 'python', 'python.exe');
  if (existsSync(sharedPython)) return sharedPython;
  return resolveSystemPythonCommand(envPath);
}

function buildModuleLaunchSpec(darePath?: string): DareLaunchSpec {
  return {
    command: darePath ? resolveVenvPython(darePath) : resolveSystemPythonCommand(),
    argsPrefix: ['-m', 'client'],
    ...(darePath ? { cwd: darePath } : {}),
    runtimeMode: 'module',
  };
}

function resolveConfiguredDareLaunchSpec(darePath: string | undefined): DareLaunchSpec | null {
  if (!darePath) return null;
  if (hasDareModuleEntry(darePath)) {
    return buildModuleLaunchSpec(darePath);
  }
  if (isExistingFile(darePath)) {
    return {
      command: darePath,
      argsPrefix: [],
      cwd: dirname(darePath),
      runtimeMode: 'executable',
    };
  }
  return null;
}

export function resolveDefaultDarePath(): string | undefined {
  const vendoredExecutable = resolveVendoredDareExecutable();
  if (isExistingFile(vendoredExecutable)) return vendoredExecutable;

  const vendorPath = resolveVendorDarePath();
  if (hasDareModuleEntry(vendorPath)) return vendorPath;

  const legacyPath = '/tmp/office-claw-reviews/Deterministic-Agent-Runtime-Engine';
  if (hasDareModuleEntry(legacyPath)) return legacyPath;

  return undefined;
}

export function resolvePreferredDarePath(explicitDarePath?: string): string | undefined {
  if (explicitDarePath?.trim()) return explicitDarePath.trim();

  const defaultDarePath = resolveDefaultDarePath();
  if (defaultDarePath) return defaultDarePath;

  const envDarePath = process.env.DARE_PATH?.trim();
  return envDarePath || undefined;
}

export function dareBundleAvailable(darePath = resolvePreferredDarePath()): boolean {
  const resolvedPath = darePath?.trim();
  if (!resolvedPath) return false;
  if (isExistingFile(resolvedPath)) return true;
  if (!hasDareModuleEntry(resolvedPath)) return false;

  const pythonCommand = resolveVenvPython(resolvedPath);
  return isExistingFile(pythonCommand) || commandExistsOnPath(pythonCommand);
}

function formatInvalidDarePath(darePath: string): string {
  return `DARE_PATH invalid: ${darePath} (missing client/__main__.py or client/__main__.pyc and not an executable file)`;
}

export class DareAgentService implements AgentService {
  readonly agentId: AgentId;
  private readonly adapter: string | undefined;
  private readonly model: string | undefined;
  private readonly endpoint: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly darePath: string | undefined;
  private readonly mcpServerPath: string | undefined;
  private readonly spawnFn: SpawnFn | undefined;

  constructor(options?: DareAgentServiceOptions) {
    this.agentId = options?.agentId ?? createAgentId('dare');
    this.adapter = options?.adapter?.trim() || process.env.DARE_ADAPTER?.trim() || undefined;
    this.model = options?.model?.trim() || process.env.OFFICE_CLAW_DARE_MODEL_OVERRIDE?.trim() || undefined;
    this.endpoint = options?.endpoint ?? process.env[DARE_ENDPOINT_ENV];
    this.apiKey = options?.apiKey ?? process.env[DARE_API_KEY_ENV];
    this.darePath = resolvePreferredDarePath(options?.darePath);

    const configuredMcp = options?.mcpServerPath ?? process.env.OFFICE_CLAW_MCP_SERVER_PATH;
    if (configuredMcp && configuredMcp.trim().length > 0) {
      const resolved = isAbsolute(configuredMcp) ? configuredMcp : resolve(process.cwd(), configuredMcp);
      this.mcpServerPath = preferCompactMcpEntry(resolved);
    } else {
      this.mcpServerPath = resolveDefaultDareMcpServerPath();
    }
    this.spawnFn = options?.spawnFn;
  }

  private async resolveMcpPathForDare(workspace?: string): Promise<string | undefined> {
    const configuredPath = this.mcpServerPath;
    if (!configuredPath) return undefined;

    // DARE loader accepts directories and {.json,.yaml,.md} config files.
    const extension = extname(configuredPath).toLowerCase();
    if (!extension) return configuredPath;
    if (DARE_MCP_CONFIG_EXTENSIONS.has(extension)) {
      // Bridge Claude-style `.mcp.json` ({ mcpServers: ... }) when passed to DARE.
      if (extension === '.json' && existsSync(configuredPath)) {
        try {
          const raw = readFileSync(configuredPath, 'utf-8');
          const data = JSON.parse(raw) as unknown;
          if (isRecord(data)) {
            const servers = buildClaudeStyleDareServers(data);
            if (servers && servers.length > 0) {
              const bridgePath = resolveBridgeConfigPath(`claude:${configuredPath}`);
              await writeFile(bridgePath, `${JSON.stringify({ servers }, null, 2)}\n`, 'utf-8');
              return bridgePath;
            }
          }
        } catch {
          // Keep configured path on parse failure for backward compatibility.
        }
      }
      return configuredPath;
    }
    if (!DARE_MCP_JS_ENTRY_EXTENSIONS.has(extension)) return configuredPath;

    // Legacy OFFICE_CLAW_MCP_SERVER_PATH points to JS server entry.
    // Generate a DARE-native JSON config and pass that path instead.
    try {
      const bridgePath = resolveBridgeConfigPath(`entry:${configuredPath}:${workspace ?? ''}`);
      const bridgeServer: JsonObject = {
        name: 'office_claw',
        transport: 'stdio',
        command: [process.execPath, configuredPath],
        cwd: dirname(configuredPath),
        enabled: true,
      };
      await writeFile(bridgePath, `${JSON.stringify(bridgeServer, null, 2)}\n`, 'utf-8');
      return bridgePath;
    } catch {
      // Fall back to original path if bridge file cannot be written.
      return configuredPath;
    }
  }

  async *invoke(prompt: string, options?: AgentServiceOptions): AsyncIterable<AgentMessage> {
    const workspaceConfig = readWorkspaceDareConfig(options?.workingDirectory);
    const effectiveModel = options?.callbackEnv?.OFFICE_CLAW_DARE_MODEL_OVERRIDE?.trim() || this.model || undefined;
    const effectiveAdapter = this.resolveAdapter(options?.callbackEnv);

    let cliModel = effectiveModel;
    if (!cliModel) {
      try {
        cliModel = getAgentModel(this.agentId as string);
      } catch {
        // Let DARE fall back to its own config if no explicit model is available.
      }
    }

    const metadataModel = resolveMetadataModel(this.agentId, cliModel, workspaceConfig);
    const configuredLaunchSpec = resolveConfiguredDareLaunchSpec(this.darePath);

    if (!this.darePath && !this.spawnFn) {
      const metadata: MessageMetadata = { provider: 'dare', model: metadataModel };
      yield {
        type: 'error',
        agentId: this.agentId,
        error:
          'DARE CLI path is not configured: set DARE_PATH or install vendor/dare.exe / vendor/dare-cli via the installer.',
        metadata,
        timestamp: Date.now(),
      };
      yield { type: 'done', agentId: this.agentId, metadata, timestamp: Date.now() };
      return;
    }

    if (this.darePath && !this.spawnFn && configuredLaunchSpec === null) {
      const metadata: MessageMetadata = { provider: 'dare', model: metadataModel };
      yield {
        type: 'error',
        agentId: this.agentId,
        error: formatInvalidDarePath(this.darePath),
        metadata,
        timestamp: Date.now(),
      };
      yield { type: 'done', agentId: this.agentId, metadata, timestamp: Date.now() };
      return;
    }

    const launchSpec = configuredLaunchSpec ?? buildModuleLaunchSpec(this.darePath);
    const endpoint = this.resolveEndpoint(options?.callbackEnv, effectiveAdapter);
    const mcpPathForDare = options?.callbackEnv
      ? await this.resolveMcpPathForDare(options?.workingDirectory)
      : undefined;
    const args = this.buildArgs(prompt, {
      argsPrefix: launchSpec.argsPrefix,
      adapter: effectiveAdapter,
      workspace: options?.workingDirectory,
      sessionId: options?.sessionId,
      endpoint,
      model: cliModel,
      cliConfigArgs: options?.cliConfigArgs,
      systemPrompt: options?.systemPrompt,
      mcpServerPath: mcpPathForDare,
    });
    const childEnv = this.buildEnv(
      options?.callbackEnv,
      cliModel,
      effectiveAdapter,
      options?.acpModelProfile?.sslVerify,
    );
    const metadata: MessageMetadata = { provider: 'dare', model: metadataModel };
    let sessionInitEmitted = false;

    const cliMcpPath = extractArgValue(args, '--mcp-path');
    emitDareDiagnostic('info', 'Invoking DARE CLI', {
      agentId: this.agentId,
      invocationId: options?.invocationId ?? null,
      workspace: options?.workingDirectory ?? null,
      adapter: effectiveAdapter ?? null,
      model: cliModel ?? null,
      endpoint: endpoint ?? null,
      configuredMcpServerPath: this.mcpServerPath ?? null,
      resolvedMcpPathForDare: mcpPathForDare ?? null,
      cliMcpPath: cliMcpPath ?? null,
      launch: {
        command: launchSpec.command,
        runtimeMode: launchSpec.runtimeMode,
        cwd: launchSpec.cwd ?? null,
        argsPrefix: launchSpec.argsPrefix,
      },
      hasCallbackEnv: Boolean(options?.callbackEnv),
      callbackEnvKeys: options?.callbackEnv ? Object.keys(options.callbackEnv).sort() : [],
    });
    emitDareDiagnostic('debug', 'DARE CLI args and env summary', {
      agentId: this.agentId,
      invocationId: options?.invocationId ?? null,
      args: sanitizeArgsForLog(args),
      envOverrides: summarizeEnvForLog(childEnv),
    });

    try {
      const cliOpts = {
        command: launchSpec.command,
        args,
        ...(launchSpec.cwd ? { cwd: launchSpec.cwd } : {}),
        env: childEnv,
        ...(options?.signal ? { signal: options.signal } : {}),
        ...(options?.invocationId ? { invocationId: options.invocationId } : {}),
        ...(options?.cliSessionId ? { cliSessionId: options.cliSessionId } : {}),
        ...(options?.livenessProbe ? { livenessProbe: options.livenessProbe } : {}),
      };
      const events = options?.spawnCliOverride
        ? options.spawnCliOverride(cliOpts)
        : spawnCli(cliOpts, this.spawnFn ? { spawnFn: this.spawnFn } : undefined);

      for await (const event of events) {
        if (isCliTimeout(event)) {
          yield {
            type: 'system_info' as const,
            agentId: this.agentId,
            content: JSON.stringify({
              type: 'timeout_diagnostics',
              silenceDurationMs: event.silenceDurationMs,
              processAlive: event.processAlive,
              lastEventType: event.lastEventType,
              firstEventAt: event.firstEventAt,
              lastEventAt: event.lastEventAt,
              cliSessionId: event.cliSessionId,
              invocationId: event.invocationId,
              rawArchivePath: event.rawArchivePath,
            }),
            timestamp: Date.now(),
          };
          yield {
            type: 'error',
            agentId: this.agentId,
            error: `DARE CLI 响应超时 (${Math.round(event.timeoutMs / 1000)}s${event.firstEventAt == null ? ', 未收到首帧' : ''})`,
            metadata,
            timestamp: Date.now(),
          };
          continue;
        }

        if (isLivenessWarning(event)) {
          const warningEvent = event as { level?: string; silenceDurationMs?: number };
          log.warn(
            {
              agentId: this.agentId,
              invocationId: options?.invocationId,
              level: warningEvent.level,
              silenceMs: warningEvent.silenceDurationMs,
            },
            '[DareAgent] liveness warning — CLI may be stuck',
          );
          yield {
            type: 'system_info' as const,
            agentId: this.agentId,
            content: JSON.stringify({ type: 'liveness_warning', ...event }),
            timestamp: Date.now(),
          };
          continue;
        }

        if (isCliError(event)) {
          yield {
            type: 'error',
            agentId: this.agentId,
            error: formatCliExitError('DARE CLI', event),
            metadata,
            timestamp: Date.now(),
          };
          continue;
        }

        const result = transformDareEvent(event, this.agentId);
        if (result !== null) {
          if (result.type === 'session_init') {
            if (sessionInitEmitted) continue;
            sessionInitEmitted = true;
            if (result.sessionId) metadata.sessionId = result.sessionId;
          }
          yield { ...result, metadata };
        }
      }

      yield { type: 'done', agentId: this.agentId, metadata, timestamp: Date.now() };
    } catch (err) {
      yield {
        type: 'error',
        agentId: this.agentId,
        error: err instanceof Error ? err.message : String(err),
        metadata,
        timestamp: Date.now(),
      };
      yield { type: 'done', agentId: this.agentId, metadata, timestamp: Date.now() };
    }
  }

  private buildArgs(
    prompt: string,
    opts?: {
      argsPrefix?: readonly string[];
      adapter?: string;
      workspace?: string;
      sessionId?: string;
      endpoint?: string;
      model?: string;
      cliConfigArgs?: readonly string[];
      systemPrompt?: string;
      mcpServerPath?: string;
    },
  ): string[] {
    const args = [...(opts?.argsPrefix ?? ['-m', 'client'])];
    if (opts?.adapter) {
      args.push('--adapter', opts.adapter);
    }
    if (opts?.model) {
      args.push('--model', opts.model);
    }
    if (opts?.endpoint) {
      args.push('--endpoint', opts.endpoint);
    }
    if (opts?.workspace) {
      args.push('--workspace', opts.workspace);
    }
    if (opts?.systemPrompt) {
      args.push('--system-prompt-mode', 'append');
      args.push('--system-prompt-text', opts.systemPrompt);
    }
    if (opts?.mcpServerPath) {
      args.push('--mcp-path', opts.mcpServerPath);
    }

    args.push('run');
    if (opts?.sessionId) {
      args.push('--session-id', opts.sessionId);
    }

    for (const arg of opts?.cliConfigArgs ?? []) {
      const parts = arg.trim().split(/\s+/);
      args.push(...parts);
    }

    args.push('--task', prompt, '--full-auto', '--headless');
    return args;
  }

  private buildEnv(
    callbackEnv?: Record<string, string>,
    model?: string,
    adapter?: string,
    sslVerify?: boolean | null,
  ): Record<string, string | null> {
    const env: Record<string, string | null> = { ...callbackEnv };
    const apiKeyEnvName = adapter ? ADAPTER_KEY_ENV[adapter] : undefined;
    const apiKey =
      callbackEnv?.[DARE_API_KEY_ENV] ??
      (apiKeyEnvName ? callbackEnv?.[apiKeyEnvName] : undefined) ??
      this.apiKey ??
      (apiKeyEnvName ? process.env[apiKeyEnvName] : undefined);

    if (apiKey && apiKeyEnvName) {
      env[apiKeyEnvName] = apiKey;
    }

    env[DARE_API_KEY_ENV] = null;
    env[DARE_ENDPOINT_ENV] = null;

    const projectRoot = resolveOfficeClawHostRoot(process.cwd());
    const officeClawSkillsDir = join(projectRoot, 'office-claw-skills');
    if (existsSync(officeClawSkillsDir)) {
      env.DARE_SKILL_PATHS = JSON.stringify([officeClawSkillsDir]);
    }

    // Windows Python: force UTF-8 stdout/stderr to avoid GBK encode errors on emoji/CJK
    if (process.platform === 'win32') {
      env.PYTHONIOENCODING = 'utf-8';
      env.PYTHONUTF8 = '1';
      Object.assign(env, withBundledPythonPath(env, projectRoot));
    }

    // Reserve 30% to account for: output tokens (~15%), serialization overhead,
    // and DARE's heuristic token estimator approximation error on CJK content.
    if (model) {
      const ctxWindow = getContextWindowFallback(model);
      if (ctxWindow) {
        const inputBudget = Math.floor(ctxWindow * 0.7);
        env.DARE_CONTEXT_WINDOW_TOKENS = String(inputBudget);
      }
    }

    if (callbackEnv?.[DARE_SSL_VERIFY_ENV] !== undefined) {
      env[DARE_SSL_VERIFY_ENV] = callbackEnv[DARE_SSL_VERIFY_ENV];
    } else if (sslVerify !== undefined && sslVerify !== null) {
      env[DARE_SSL_VERIFY_ENV] = sslVerify ? '1' : '0';
    } else {
      env[DARE_SSL_VERIFY_ENV] = '0';
    }

    return env;
  }

  private resolveAdapter(callbackEnv?: Record<string, string>): string | undefined {
    return callbackEnv?.[DARE_ADAPTER_OVERRIDE_ENV]?.trim() || this.adapter;
  }

  private getAdapterEndpointEnvName(adapter?: string): string | undefined {
    return adapter ? ADAPTER_ENDPOINT_ENV[adapter] : undefined;
  }

  private resolveEndpoint(callbackEnv?: Record<string, string>, adapter?: string): string | undefined {
    const adapterEndpointEnv = this.getAdapterEndpointEnvName(adapter);
    return (
      callbackEnv?.[DARE_ENDPOINT_ENV] ??
      (adapterEndpointEnv ? callbackEnv?.[adapterEndpointEnv] : undefined) ??
      this.endpoint ??
      (adapterEndpointEnv ? process.env[adapterEndpointEnv] : undefined)
    );
  }
}
