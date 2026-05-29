/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F130: Centralized Pino Logger — stdout + pino-roll dual-write with redaction.
 *
 * KD-1: Self-built Pino instance passed to Fastify — usable outside Fastify too.
 * KD-5: Redaction ships with Phase A (logging to disk = copying leak surface).
 *
 * Usage:
 *   import { logger } from '../infrastructure/logger.js';
 *   logger.info({ threadId, agentId }, 'Cat invoked');
 */

import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { format as utilFormat } from 'node:util';
import pino from 'pino';

const require = createRequire(import.meta.url);

/**
 * --debug CLI flag: `node dist/index.js --debug` sets log level to 'debug'.
 * Precedence: --debug flag > LOG_LEVEL env var > default 'info'.
 */
export const isDebugMode = process.argv.includes('--debug');
const LOG_LEVEL = (isDebugMode ? 'debug' : (process.env.LOG_LEVEL ?? 'info')) as pino.Level;

import { findMonorepoRoot } from '../utils/monorepo-root.js';

const LOG_DIR = resolve(findMonorepoRoot(), 'data', 'logs', 'api');
const MAIN_LOG_FILE = resolve(LOG_DIR, 'api.log');
const ERROR_LOG_FILE = resolve(LOG_DIR, 'error.log');
const RETENTION_FILES = 14;

export type UserVisibleLogValue = 'critical' | 'progress';
export type ObservableLogFormat = 'text' | 'json' | 'dual';

export interface ObservableLoggingConfig {
  format: ObservableLogFormat;
  consoleEnabled: boolean;
  fileEnabled: boolean;
  userVisibleTagEnabled: boolean;
  userProgressTagEnabled: boolean;
  includeComponent: boolean;
}

const USER_VISIBLE_VALUES = new Set<UserVisibleLogValue>(['critical', 'progress']);
const DEFAULT_OBSERVABLE_LOGGING_CONFIG: ObservableLoggingConfig = {
  format: 'json',
  consoleEnabled: true,
  fileEnabled: true,
  userVisibleTagEnabled: true,
  userProgressTagEnabled: true,
  includeComponent: true,
};

function readEnv(env: NodeJS.ProcessEnv, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseFormat(value: string | undefined, fallback: ObservableLogFormat): ObservableLogFormat {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'text' || normalized === 'json' || normalized === 'dual' ? normalized : fallback;
}

export function resolveObservableLoggingConfig(env: NodeJS.ProcessEnv = process.env): ObservableLoggingConfig {
  return {
    format: parseFormat(
      readEnv(env, 'OFFICE_CLAW_LOG_FORMAT', 'JIUWENCLAW_LOG_FORMAT'),
      DEFAULT_OBSERVABLE_LOGGING_CONFIG.format,
    ),
    consoleEnabled: parseBool(
      readEnv(env, 'OFFICE_CLAW_LOG_CONSOLE_ENABLED', 'JIUWENCLAW_LOG_CONSOLE_ENABLED'),
      DEFAULT_OBSERVABLE_LOGGING_CONFIG.consoleEnabled,
    ),
    fileEnabled: parseBool(
      readEnv(env, 'OFFICE_CLAW_LOG_FILE_ENABLED', 'JIUWENCLAW_LOG_FILE_ENABLED'),
      DEFAULT_OBSERVABLE_LOGGING_CONFIG.fileEnabled,
    ),
    userVisibleTagEnabled: parseBool(
      readEnv(env, 'OFFICE_CLAW_LOG_USER_VISIBLE', 'JIUWENCLAW_LOG_USER_VISIBLE'),
      DEFAULT_OBSERVABLE_LOGGING_CONFIG.userVisibleTagEnabled,
    ),
    userProgressTagEnabled: parseBool(
      readEnv(env, 'OFFICE_CLAW_LOG_USER_PROGRESS_VISIBLE', 'JIUWENCLAW_LOG_USER_PROGRESS_VISIBLE'),
      DEFAULT_OBSERVABLE_LOGGING_CONFIG.userProgressTagEnabled,
    ),
    includeComponent: parseBool(
      readEnv(env, 'OFFICE_CLAW_LOG_INCLUDE_COMPONENT', 'JIUWENCLAW_LOG_INCLUDE_COMPONENT'),
      DEFAULT_OBSERVABLE_LOGGING_CONFIG.includeComponent,
    ),
  };
}

export const observableLoggingConfig = resolveObservableLoggingConfig();

function normalizeUserVisible(value: unknown): UserVisibleLogValue | undefined {
  return typeof value === 'string' && USER_VISIBLE_VALUES.has(value as UserVisibleLogValue)
    ? (value as UserVisibleLogValue)
    : undefined;
}

function userTagFor(value: UserVisibleLogValue, config: ObservableLoggingConfig): string | undefined {
  if (value === 'critical' && config.userVisibleTagEnabled) return '[USER]';
  if (value === 'progress' && config.userProgressTagEnabled) return '[USER_PROGRESS]';
  return undefined;
}

export function inferLogComponent(moduleName: unknown): string | undefined {
  if (typeof moduleName !== 'string' || moduleName.length === 0) return undefined;
  if (moduleName.startsWith('routes/') || moduleName === 'ws' || moduleName.includes('queue')) return 'gateway';
  if (moduleName.includes('connector') || moduleName.includes('adapter') || moduleName.includes('streaming-outbound')) {
    return 'channel';
  }
  if (moduleName.includes('authorization') || moduleName.includes('permission')) return 'permissions';
  if (moduleName.includes('agent') || moduleName.includes('route-') || moduleName.includes('invocation')) {
    return 'agent_server';
  }
  return 'gateway';
}

export function normalizeObservableLogObject(
  input: Record<string, unknown>,
  config: ObservableLoggingConfig = observableLoggingConfig,
): Record<string, unknown> {
  const output = { ...input };
  const userVisible = normalizeUserVisible(output.user_visible ?? output.userVisible);

  delete output.userVisible;
  delete output.user_visible;
  delete output.user_tag;

  if (userVisible) {
    output.user_visible = userVisible;
    const tag = userTagFor(userVisible, config);
    if (tag) output.user_tag = tag;
  }

  if (config.includeComponent && output.component === undefined) {
    const component = inferLogComponent(output.module);
    if (component) output.component = component;
  }

  return output;
}

export function userVisibleFields(
  value: UserVisibleLogValue,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...fields, user_visible: value };
}

/**
 * File logging can fail on Windows (EPERM: locked by AV, ACL, or another Node instance).
 * Set OFFICE_CLAW_LOG_DISABLE_FILE=1 to use stdout only.
 */
function shouldUseFileLog(): boolean {
  if (process.env.OFFICE_CLAW_LOG_DISABLE_FILE === '1') return false;
  if (!observableLoggingConfig.fileEnabled) return false;
  try {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
    const fd = openSync(MAIN_LOG_FILE, 'a');
    closeSync(fd);
    return true;
  } catch {
    process.stderr.write(
      `[api/logger] File logging disabled: cannot write to ${LOG_DIR} (see OFFICE_CLAW_LOG_DISABLE_FILE=1).\n`,
    );
    return false;
  }
}

const useFileLog = shouldUseFileLog();

/**
 * Pino redaction paths — masks values at these JSON paths.
 * Uses fast-redact: compiled once at creation, zero per-log overhead.
 */
const REDACT_PATHS = [
  // === HTTP Headers ===
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'req.headers["x-callback-token"]',
  'req.headers["x-office-claw-hook-token"]',
  'req.headers["x-access-key"]',
  'req.headers["x-acs-dingtalk-access-token"]',
  'req.headers["x-goog-api-key"]',
  'req.headers["x-sign"]',
  // === Top-level fields ===
  'authorization',
  'cookie',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'password',
  'credential',
  'credentials',
  'callbackToken',
  'hookToken',
  'accessToken',
  'sk',
  'appSecret',
  'privateKey',
  'userId',
  'OFFICE_CLAW_USER_ID',
  // === Environment variables ===
  'OFFICE_CLAW_CALLBACK_TOKEN',
  'OFFICE_CLAW_ANTHROPIC_API_KEY',
  'OFFICE_CLAW_HOOK_TOKEN',
  'AOM_TOKEN',
  'GITHUB_TOKEN',
  'DINGTALK_APP_SECRET',
  'WEIXIN_BOT_TOKEN',
  'WECOM_BOT_SECRET',
  'WECOM_AGENT_SECRET',
  'WECOM_TOKEN',
  'WECOM_ENCODING_AES_KEY',
  'VAPID_PRIVATE_KEY',
  'F102_API_KEY',
];

const transport = pino.transport({
  targets: [
    ...(observableLoggingConfig.consoleEnabled
      ? [
          {
            target: 'pino/file',
            options: { destination: 1 },
            level: LOG_LEVEL,
          },
        ]
      : []),
    ...(useFileLog
      ? [
          {
            target: require.resolve('pino-roll'),
            options: {
              file: MAIN_LOG_FILE,
              frequency: 'daily',
              dateFormat: 'yyyy-MM-dd',
              limit: { count: RETENTION_FILES },
              mkdir: true,
            },
            level: LOG_LEVEL,
          },
          {
            target: require.resolve('pino-roll'),
            options: {
              file: ERROR_LOG_FILE,
              frequency: 'daily',
              dateFormat: 'yyyy-MM-dd',
              limit: { count: RETENTION_FILES },
              mkdir: true,
            },
            level: 'error' as const,
          },
        ]
      : []),
  ],
});

transport.on('error', (err: Error) => {
  process.stderr.write(`[api/logger] pino transport error (disk log may be broken): ${err.message}\n`);
});

export const logger = pino(
  {
    level: LOG_LEVEL,
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    formatters: {
      bindings: (bindings) => normalizeObservableLogObject(bindings),
      log: (object) => normalizeObservableLogObject(object),
    },
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
  },
  transport,
);

export function createModuleLogger(module: string): pino.Logger {
  return logger.child({ module, component: inferLogComponent(module) });
}

/** 专用于错误审计日志，带序列号的结构化错误记录 */
export const errorAuditLogger = logger.child({ module: 'error-audit' });

export const LOG_DIR_PATH = LOG_DIR;

/**
 * KD-7: Redirect unmigrated console.* to stderr so process-layer `2>>`
 * captures them alongside tsx watch output and crash dumps.
 *
 * Why: macOS bash `tee` pipelines create orphan processes that
 * `kill $(jobs -p)` cannot clean up. Using `2>>` for process-layer
 * capture is the only orphan-free approach, but it only captures stderr.
 * This monkey-patch bridges the gap until Phase B migrates all console.*
 * to the Pino logger.
 */
const stderrWrite = (prefix: string, args: unknown[]) => {
  process.stderr.write(`[console.${prefix}] ${utilFormat(...args)}\n`);
};

const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

console.log = (...args: unknown[]) => {
  stderrWrite('log', args);
  origLog.apply(console, args);
};
console.warn = (...args: unknown[]) => {
  stderrWrite('warn', args);
  origWarn.apply(console, args);
};
console.error = (...args: unknown[]) => {
  stderrWrite('error', args);
  origError.apply(console, args);
};
