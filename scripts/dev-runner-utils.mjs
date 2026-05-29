#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { copyFileSync, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const COLORS = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function colorize(color, message) {
  return `${COLORS[color]}${message}${COLORS.reset}`;
}

export function logInfo(message) {
  console.log(colorize('cyan', `ℹ ${message}`));
}

export function logSuccess(message) {
  console.log(colorize('green', `✓ ${message}`));
}

export function logWarn(message) {
  console.log(colorize('yellow', `⚠ ${message}`));
}

export function logError(message) {
  console.error(colorize('red', `✗ ${message}`));
}

function parseDotenv(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, '\n');
    result[key] = value;
  }
  return result;
}

function uncommentRedisUrlFromTemplate(content) {
  const linePattern = /^(\s*)#\s*REDIS_URL=redis:\/\/localhost:6399\s*$/m;
  if (!linePattern.test(content)) {
    return { changed: false, content };
  }
  const nextContent = content.replace(linePattern, '$1REDIS_URL=redis://localhost:6399');
  return { changed: true, content: nextContent };
}

export async function ensureDotenvLoaded(projectRoot) {
  const envPath = `${projectRoot}/.env`;
  const envExamplePath = `${projectRoot}/.env.example`;
  let createdFromExample = false;

  if (!existsSync(envPath)) {
    if (!existsSync(envExamplePath)) {
      throw new Error('未找到 .env 与 .env.example，无法继续启动');
    }
    copyFileSync(envExamplePath, envPath);
    createdFromExample = true;
    logSuccess('已复制 .env.example -> .env');
  } else {
    logInfo('.env 已存在，跳过复制');
  }

  let content = await readFile(envPath, 'utf-8');
  if (createdFromExample) {
    const normalized = uncommentRedisUrlFromTemplate(content);
    if (normalized.changed) {
      await writeFile(envPath, normalized.content, 'utf-8');
      content = normalized.content;
      logSuccess('已自动启用 REDIS_URL=redis://localhost:6399');
    }
  }

  const parsed = parseDotenv(content);
  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] = value;
  }
  logSuccess('已加载 .env 环境变量');
}

export function runBash(command, options = {}) {
  const { cwd, env = process.env, stdio = 'inherit', detached = false } = options;
  return spawn('bash', ['-c', command], { cwd, env, stdio, detached });
}

export function runCommandAndWait(command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = runBash(command, options);
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`命令执行失败: ${command} (exit=${code ?? 'null'})`));
      }
    });
  });
}

export function runCommandCapture(command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = runBash(command, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function waitForHttpOk(url, options = {}) {
  const { timeoutMs = 30_000, intervalMs = 1_000 } = options;
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || (response.status >= 300 && response.status < 400)) {
        return true;
      }
    } catch {
      // 服务还未就绪，继续重试
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

export async function runStep(title, fn) {
  console.log(`\n${colorize('cyan', `==> ${title}`)}`);
  try {
    await fn();
    logSuccess(`${title} 完成`);
  } catch (error) {
    logError(`${title} 失败`);
    throw error;
  }
}
