/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { type ChildProcess, type SpawnOptions, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import type { AgentId, RelayClawAgentConfig } from '@openjiuwen/relay-shared';
import { createModuleLogger } from '../../../../../infrastructure/logger.js';
import { getLongTermMemoryEnabled } from '../../../../../config/memory-toggle-state.js';
import { withBundledPythonPath } from '../../../../../utils/bundled-python-env.js';
import { resolveOfficeClawHostRoot } from '../../../../../utils/office-claw-root.js';
import { findMonorepoRoot } from '../../../../../utils/monorepo-root.js';
import {
  resolveJiuwenClawAppDir,
  resolveJiuwenClawExecutable,
  resolveJiuwenClawPythonBin,
} from '../../../../../utils/jiuwenclaw-paths.js';
import {
  buildRelayClawAppSignature,
  resolveRelayClawDisabledSkills,
  resolveRelayClawSharedSkillsDirs,
} from '../../../../../utils/relayclaw-skills.js';
import { resolveUserSkillsRoot } from '../../skillhub/SkillPaths.js';
import { tcpProbe } from '../../../../../utils/tcp-probe.js';
import type { AgentServiceOptions } from '../../types.js';
import {
  buildOfficeClawMcpEnv,
  RELAYCLAW_EXCLUDED_OFFICE_CLAW_MCP_TOOLS,
  RELAYCLAW_EXCLUDED_OFFICE_CLAW_MCP_TOOLS_ENV,
  resolveOfficeClawMcpServer,
} from './relayclaw-office-claw-mcp.js';

const log = createModuleLogger('relayclaw-sidecar');
const SEARCH_API_KEY_ENV_NAMES = ['BOCHA_API_KEY', 'JINA_API_KEY', 'PERPLEXITY_API_KEY', 'SERPER_API_KEY'] as const;

function hashOptionalEnvValue(value: string | undefined): string {
  return value ? createHash('sha256').update(value).digest('hex') : '';
}

export interface RelayClawSidecarRuntime {
  executablePath: string;
  pythonBin: string;
  appDir: string;
  useExecutable: boolean;
  homeDir: string;
  agentPort: number;
  webPort: number;
  env: Record<string, string>;
  signature: Record<string, string | number | boolean>;
}

export interface RelayClawLaunchCommand {
  command: string;
  args: string[];
  cwd: string;
}

export interface RelayClawSidecarController {
  ensureStarted(options?: AgentServiceOptions, signal?: AbortSignal): Promise<string>;
  /** @param reason Diagnostic tag for logs (e.g. runtime_signature_changed). */
  stop(reason?: string): void;
  getRecentLogs(): string;
}

export interface RelayClawSidecarControllerDeps {
  spawnFn?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  tcpProbeFn?: typeof tcpProbe;
  allocatePort?: () => Promise<number>;
}

export class DefaultRelayClawSidecarController implements RelayClawSidecarController {
  private readonly agentId: AgentId;
  private readonly config: RelayClawAgentConfig;
  private readonly spawnFn: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  private readonly tcpProbeFn: typeof tcpProbe;
  private readonly allocatePort: () => Promise<number>;
  private child: ChildProcess | null = null;
  private bootPromise: Promise<void> | null = null;
  private runtimeHash: string | null = null;
  private resolvedUrl: string | null = null;
  private recentLogs = '';
  private lastSignature: Record<string, string | number | boolean> | null = null;
  private startCount = 0;

  constructor(agentId: AgentId, config: RelayClawAgentConfig, deps?: RelayClawSidecarControllerDeps) {
    this.agentId = agentId;
    this.config = config;
    this.spawnFn = deps?.spawnFn ?? ((command, args, options) => spawn(command, args, options));
    this.tcpProbeFn = deps?.tcpProbeFn ?? tcpProbe;
    this.allocatePort = deps?.allocatePort ?? findOpenPort;
  }

  async ensureStarted(options?: AgentServiceOptions, signal?: AbortSignal): Promise<string> {
    const runtime = this.buildRuntime(options);
    const runtimeHash = createHash('sha256').update(JSON.stringify(runtime.signature)).digest('hex');
    const childAlive = this.child?.killed === false && this.child.exitCode === null;

    if (childAlive && this.runtimeHash === runtimeHash && this.resolvedUrl) {
      const parsed = new URL(this.resolvedUrl);
      const port = Number.parseInt(parsed.port, 10);
      if (port > 0 && (await this.tcpProbeFn(parsed.hostname, port, 400))) {
        log.debug({ agentId: this.agentId, sidecarPid: this.child?.pid, port }, 'relayclaw sidecar reused (cache hit)');
        return this.resolvedUrl;
      }
      log.warn(
        { agentId: this.agentId, sidecarPid: this.child?.pid, port },
        'relayclaw sidecar alive but tcp probe failed — will restart',
      );
    }

    if (this.child && this.runtimeHash !== runtimeHash) {
      const diff: Record<string, { old: unknown; new: unknown }> = {};
      const allKeys = new Set([...Object.keys(this.lastSignature ?? {}), ...Object.keys(runtime.signature)]);
      for (const key of allKeys) {
        const oldVal = this.lastSignature?.[key];
        const newVal = runtime.signature[key];
        if (oldVal !== newVal) diff[key] = { old: oldVal, new: newVal };
      }
      log.warn(
        { agentId: this.agentId, sidecarPid: this.child?.pid, signatureDiff: diff },
        'relayclaw sidecar runtime signature changed — restarting',
      );
      this.stop('runtime_signature_changed');
    }

    if (this.bootPromise) {
      await this.bootPromise;
      return this.resolvedUrl!;
    }

    this.bootPromise = this.start(runtime, signal);
    try {
      await this.bootPromise;
      return this.resolvedUrl!;
    } finally {
      this.bootPromise = null;
    }
  }

  stop(reason = 'unspecified'): void {
    const child = this.child;
    const willKill = Boolean(child && child.exitCode === null);
    log.warn(
      {
        agentId: this.agentId,
        sidecarPid: child?.pid,
        willKill,
        reason,
      },
      'relayclaw sidecar stop invoked',
    );
    if (willKill && child) {
      if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    }
    this.child = null;
    this.runtimeHash = null;
    this.resolvedUrl = null;
  }

  getRecentLogs(): string {
    return this.recentLogs;
  }

  private buildRuntime(options?: AgentServiceOptions): RelayClawSidecarRuntime {
    const callbackEnv = options?.callbackEnv ?? {};
    const appDir = resolveJiuwenClawAppDir(this.config.appDir);
    const executablePath = resolveJiuwenClawExecutable(this.config.executablePath);
    const pythonBin = resolveJiuwenClawPythonBin(this.config.pythonBin, appDir);
    const useExecutable = existsSync(executablePath);
    const homeDir = this.config.homeDir?.trim() || join(findMonorepoRoot(), '.office-claw', 'relayclaw', this.agentId as string);
    const officeClawDataDirEnv = resolve((process.env.OFFICE_CLAW_DATA_DIR ?? '').trim() || join(homedir(), '.office-claw'));
    const jiuwenclawDataDir = resolve(
      (process.env.JIUWENCLAW_DATA_DIR ?? '').trim() || join(officeClawDataDirEnv, '.jiuwenclaw'),
    );
    const apiKey = callbackEnv.API_KEY || callbackEnv.OPENAI_API_KEY || callbackEnv.OPENROUTER_API_KEY || '';
    const apiBase = callbackEnv.API_BASE || callbackEnv.OPENAI_BASE_URL || callbackEnv.OPENAI_API_BASE || '';
    const embedApiKey = callbackEnv.EMBED_API_KEY || callbackEnv.EMBED_KEY || apiKey;
    const embedApiBase = callbackEnv.EMBED_API_BASE || callbackEnv.EMBED_BASE_URL || callbackEnv.EMBED_BASE || apiBase;
    const embedModel = callbackEnv.EMBED_MODEL || callbackEnv.EMBEDDING_MODEL || 'text-embedding-v3';
    const defaultHeaders = callbackEnv.default_headers || callbackEnv.OPENAI_DEFAULT_HEADERS || '';
    const provider = apiBase.includes('openrouter.ai') ? 'OpenRouter' : 'OpenAI';
    const longTermMemoryEnabled = getLongTermMemoryEnabled();
    const memoryEngine = longTermMemoryEnabled ? 'builtin' : 'none';
    const modelName = this.config.modelName?.trim() || 'gpt-5.4';
    const projectDir = options?.workingDirectory?.trim() || '';
    const projectRoot = projectDir || process.cwd();
    const hostRoot = resolveOfficeClawHostRoot(projectRoot);
    const officeClawMcp = resolveOfficeClawMcpServer(options?.workingDirectory);
    const sharedSkillDirs = [...resolveRelayClawSharedSkillsDirs(), resolveUserSkillsRoot(hostRoot)];
    const disabledSkills = resolveRelayClawDisabledSkills(projectRoot, this.agentId as string);

    const modelContextWindowRaw = (
      callbackEnv.MODEL_CONTEXT_WINDOW ??
      ''
    ).trim();
    const modelContextWindowParsed = /^\d+$/.test(modelContextWindowRaw)
      ? Number.parseInt(modelContextWindowRaw, 10)
      : Number.NaN;
    const modelContextWindow =
      Number.isFinite(modelContextWindowParsed) && modelContextWindowParsed > 0 ? modelContextWindowParsed : undefined;

    return {
      executablePath,
      pythonBin,
      appDir,
      useExecutable,
      homeDir,
      agentPort: this.config.agentPort ?? 0,
      webPort: this.config.webPort ?? 0,
      env: {
        HOME: homeDir,
        JIUWENCLAW_DATA_DIR: jiuwenclawDataDir,
        PYTHONUNBUFFERED: '1',
        WEB_HOST: '127.0.0.1',
        API_KEY: apiKey,
        API_BASE: apiBase,
        MEMORY_ENGINE: memoryEngine,
        EMBED_API_KEY: embedApiKey,
        EMBED_API_BASE: embedApiBase,
        EMBED_MODEL: embedModel,
        ...(defaultHeaders ? { default_headers: defaultHeaders } : {}),
        MODEL_NAME: modelName,
        MODEL_PROVIDER: provider,
        ...(modelContextWindow !== undefined ? { MODEL_CONTEXT_WINDOW: String(modelContextWindow) } : {}),
        JIUWENCLAW_AGENT_ROOT: join(homeDir, 'agent'),
        JIUWENCLAW_RUNTIME_SKILLS_DIR: join(projectRoot, '.office-claw', 'relayclaw-skill-cache', this.agentId as string),
        ...(projectDir ? { JIUWENCLAW_PROJECT_DIR: projectDir } : {}),
        ...(sharedSkillDirs.length > 0 ? { JIUWENCLAW_SHARED_SKILLS_DIRS: sharedSkillDirs.join(delimiter) } : {}),
        ...(this.config.skills && this.config.skills.length > 0 ? { ENABLED_SKILLS: this.config.skills.join(',') } : {}),
        ...(disabledSkills.length > 0 ? { JIUWENCLAW_DISABLED_SKILLS: disabledSkills.join(',') } : {}),
        [RELAYCLAW_EXCLUDED_OFFICE_CLAW_MCP_TOOLS_ENV]: RELAYCLAW_EXCLUDED_OFFICE_CLAW_MCP_TOOLS.join(','),
        ...(officeClawMcp
          ? {
              OFFICE_CLAW_MCP_SERVER_PATH: officeClawMcp.serverPath,
              OFFICE_CLAW_MCP_COMMAND: officeClawMcp.command,
              OFFICE_CLAW_MCP_ARGS_JSON: JSON.stringify(officeClawMcp.args),
              OFFICE_CLAW_MCP_CWD: officeClawMcp.repoRoot,
            }
          : {}),
        ...buildOfficeClawMcpEnv(callbackEnv),
      },
      signature: {
        executablePath,
        useExecutable,
        pythonBin,
        appDir,
        homeDir,
        officeClawDataDir: officeClawDataDirEnv,
        appSignature: buildRelayClawAppSignature(appDir),
        apiBase,
        defaultHeaders,
        modelName,
        provider,
        memoryEngine,
        embedApiBase,
        embedModel,
        embedKeyHash: embedApiKey ? createHash('sha256').update(embedApiKey).digest('hex') : '',
        ...Object.fromEntries(
          SEARCH_API_KEY_ENV_NAMES.map((name) => [name, hashOptionalEnvValue(process.env[name])]),
        ),
        modelContextWindow: modelContextWindow ?? 0,
        officeClawMcpPath: officeClawMcp?.serverPath ?? '',
        keyHash: apiKey ? createHash('sha256').update(apiKey).digest('hex') : '',
      },
    };
  }

  private async start(runtime: RelayClawSidecarRuntime, signal?: AbortSignal): Promise<void> {
    mkdirSync(runtime.homeDir, { recursive: true });
    const agentPort = runtime.agentPort || (await this.allocatePort());
    const webPort = runtime.webPort || (await this.allocatePort());
    this.resolvedUrl = `ws://127.0.0.1:${agentPort}`;
    this.recentLogs = '';

    const launchCommand = buildRelayClawLaunchCommand(runtime);

    // Windows Python: force UTF-8 and prepend bundled Python to PATH
    const spawnEnv: Record<string, string | undefined> = {
      ...process.env,
      ...runtime.env,
      AGENT_PORT: String(agentPort),
      WEB_PORT: String(webPort),
    };
    if (process.platform === 'win32') {
      spawnEnv.PYTHONIOENCODING = 'utf-8';
      spawnEnv.PYTHONUTF8 = '1';
      Object.assign(spawnEnv, withBundledPythonPath(spawnEnv, resolveOfficeClawHostRoot(process.cwd())));
    }

    const child = this.spawnFn(launchCommand.command, launchCommand.args, {
      cwd: launchCommand.cwd,
      env: spawnEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    this.runtimeHash = createHash('sha256').update(JSON.stringify(runtime.signature)).digest('hex');
    this.lastSignature = { ...runtime.signature };
    this.startCount++;
    const sidecarPid = child.pid;
    log.info(
      {
        agentId: this.agentId,
        sidecarPid,
        agentPort,
        webPort,
        startCount: this.startCount,
        command: launchCommand.command,
        args: launchCommand.args,
        cwd: launchCommand.cwd,
      },
      'relayclaw sidecar spawned',
    );

    const pushLog = (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      this.recentLogs = `${this.recentLogs}${text}`.slice(-8000);
      // Forward sidecar USAGE_DEBUG lines to API logger (debug level for high-frequency lines)
      for (const line of text.split('\n')) {
        if (line.includes('USAGE_DEBUG')) {
          log.debug({ sidecarPid }, `[SIDECAR] ${line.trim()}`);
        }
      }
    };
    child.stdout?.on('data', pushLog);
    child.stderr?.on('data', pushLog);
    const spawnedAt = Date.now();
    child.once('exit', (code, exitSignal) => {
      if (this.child !== child) {
        return;
      }
      const uptimeMs = Date.now() - spawnedAt;
      const tail = summarizeLogs(this.recentLogs);
      log.warn(
        {
          agentId: this.agentId,
          sidecarPid,
          code,
          exitSignal,
          uptimeMs,
          startCount: this.startCount,
          logChars: this.recentLogs.length,
          ...(tail ? { logTail: tail } : {}),
          ...(this.recentLogs.length > 0 ? { stderrPreview: this.recentLogs.slice(-1500) } : {}),
        },
        'relayclaw sidecar exited',
      );
      this.child = null;
      this.runtimeHash = null;
      this.resolvedUrl = null;
    });

    if (signal?.aborted) {
      this.stop('startup_aborted_signal');
      throw new Error('jiuwen sidecar startup aborted');
    }

    const startupTs = Date.now();
    const timeoutAt = startupTs + (this.config.startupTimeoutMs ?? 180_000);
    let tcpReady = false;
    let appReady = false;
    while (Date.now() < timeoutAt) {
      if (signal?.aborted) {
        this.stop('startup_aborted_signal');
        throw new Error('jiuwen sidecar startup aborted');
      }
      if (!this.child || this.child.exitCode !== null) {
        const tail = summarizeLogs(this.recentLogs);
        log.warn(
          {
            agentId: this.agentId,
            sidecarPid,
            exitCode: this.child?.exitCode ?? null,
            logChars: this.recentLogs.length,
            ...(tail ? { logTail: tail } : {}),
            ...(this.recentLogs.length > 0 ? { stderrPreview: this.recentLogs.slice(-1500) } : {}),
          },
          'relayclaw sidecar startup failed: process exited before ready',
        );
        throw new Error(`jiuwen sidecar exited during startup${this.recentLogs ? `: ${tail}` : ''}`);
      }

      // Stage 1: TCP probe on agent port
      if (!tcpReady && (await this.tcpProbeFn('127.0.0.1', agentPort, 400))) {
        tcpReady = true;
        log.info({ agentId: this.agentId, agentPort, elapsedMs: Date.now() - startupTs }, 'jiuwen sidecar tcp_ready');
      }
      // Stage 2: App-level readiness (log marker)
      if (tcpReady && !appReady && isSidecarReady(this.recentLogs)) {
        appReady = true;
        log.info({ agentId: this.agentId, elapsedMs: Date.now() - startupTs }, 'jiuwen sidecar app_ready');
      }

      if (await isRelayClawRuntimeReady(this.tcpProbeFn, this.recentLogs, agentPort)) {
        log.info(
          { agentId: this.agentId, agentPort, webPort, elapsedMs: Date.now() - startupTs },
          'jiuwen sidecar fully ready',
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const tail = summarizeLogs(this.recentLogs);
    log.warn(
      {
        agentId: this.agentId,
        sidecarPid,
        exitCode: this.child?.exitCode ?? null,
        logChars: this.recentLogs.length,
        ...(tail ? { logTail: tail } : {}),
        ...(this.recentLogs.length > 0 ? { stderrPreview: this.recentLogs.slice(-1500) } : {}),
      },
      'relayclaw sidecar startup failed: readiness timeout',
    );
    this.stop('readiness_timeout');
    throw new Error(`jiuwen sidecar did not become ready in time${this.recentLogs ? `: ${tail}` : ''}`);
  }
}

export function buildRelayClawLaunchCommand(runtime: RelayClawSidecarRuntime): RelayClawLaunchCommand {
  if (runtime.useExecutable) {
    return {
      command: runtime.executablePath,
      args: ['--desktop-run-agentserver'],
      cwd: dirname(runtime.executablePath),
    };
  }

  return {
    command: runtime.pythonBin,
    args: ['-m', 'jiuwenclaw.app_agentserver'],
    cwd: runtime.appDir,
  };
}

export async function isRelayClawRuntimeReady(
  tcpProbeFn: typeof tcpProbe,
  recentLogs: string,
  agentPort: number,
): Promise<boolean> {
  if (!(await tcpProbeFn('127.0.0.1', agentPort, 400))) {
    return false;
  }
  if (isSidecarReady(recentLogs)) {
    return true;
  }
  return true;
}

export function isSidecarReady(recentLogs: string): boolean {
  return (
    recentLogs.includes('[JiuWenClawDeepAdapter] 初始化完成') ||
    recentLogs.includes('JiuWenClawDeepAdapter] 初始化完成')
  );
}

export function summarizeLogs(recentLogs: string): string {
  return recentLogs
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-6)
    .join(' | ');
}

async function findOpenPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate relayclaw port')));
        return;
      }
      const { port } = address;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
  });
}
