#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { spawn, spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureDotenvLoaded,
  logError,
  logInfo,
  logSuccess,
  runStep,
  waitForHttpOk,
} from './dev-runner-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
let windowsShellCommand;

function shellQuote(value) {
  if (process.platform === 'win32') {
    return `'${String(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function hasWindowsCommand(command) {
  const result = spawnSync('where.exe', [command], { stdio: 'ignore' });
  return result.status === 0;
}

function resolveWindowsShellCommand() {
  if (process.platform !== 'win32') return null;
  if (windowsShellCommand !== undefined) return windowsShellCommand;
  if (hasWindowsCommand('pwsh')) {
    windowsShellCommand = 'pwsh';
    return windowsShellCommand;
  }
  if (hasWindowsCommand('powershell')) {
    windowsShellCommand = 'powershell';
    return windowsShellCommand;
  }
  windowsShellCommand = null;
  return windowsShellCommand;
}

function runShellDetached(command, options = {}) {
  const { cwd, env = process.env, stdio = 'inherit', detached = false } = options;
  if (process.platform !== 'win32') {
    return spawn('bash', ['-c', command], { cwd, env, stdio, detached });
  }
  const shell = resolveWindowsShellCommand();
  if (!shell) {
    throw new Error('未找到可用的 PowerShell（pwsh 或 powershell），请安装 PowerShell 或加入 PATH');
  }
  return spawn(shell, ['-NoProfile', '-Command', command], {
    cwd,
    env,
    stdio,
    detached,
    windowsHide: true,
  });
}

async function startFrontendAndKeepAlive() {
  const webAppDir = resolve(projectRoot, process.env.OFFICE_CLAW_WEB_APP_DIR || 'packages/web');
  const webAppLabel = relative(projectRoot, webAppDir) || '.';
  // Frontend packages use Vite; vite.config.ts reads FRONTEND_PORT for dev/preview.
  // Keep PORT as a compatibility fallback for older tooling.
  const port = String(process.env.FRONTEND_PORT || process.env.PORT || '3003');
  const frontendUrl = `http://127.0.0.1:${port}`;
  const env = { ...process.env, FRONTEND_PORT: port, PORT: port };

  logInfo(`启动前端 (Vite): pnpm --dir ${webAppLabel} dev — FRONTEND_PORT=${port}`);
  const webProcess = runShellDetached(`pnpm --dir ${shellQuote(webAppDir)} dev`, {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });

  let webExited = false;
  webProcess.on('exit', () => {
    webExited = true;
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt <= 60_000) {
    if (webExited) {
      throw new Error('前端进程在健康检查通过前已退出');
    }
    const ok = await waitForHttpOk(frontendUrl, { timeoutMs: 1_500, intervalMs: 500 });
    if (ok) {
      logSuccess(`前端健康检查通过: ${frontendUrl}`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  if (!(await waitForHttpOk(frontendUrl, { timeoutMs: 2_000, intervalMs: 500 }))) {
    webProcess.kill('SIGTERM');
    throw new Error(`前端健康检查超时，未通过: ${frontendUrl}`);
  }

  logInfo('前端服务已就绪，按 Ctrl+C 停止');

  const forwardSignal = (signal) => {
    if (!webProcess.killed) {
      webProcess.kill(signal);
    }
  };
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  await new Promise((resolve, reject) => {
    webProcess.on('exit', (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`前端进程退出，exit=${code}`));
    });
    webProcess.on('error', reject);
  });
}

async function main() {
  console.log('🐾 dev:frontend 启动器（Vite）');
  await runStep('准备环境变量 (.env)', async () => {
    await ensureDotenvLoaded(projectRoot);
  });
  await runStep('启动并验证 Vite 开发服务', startFrontendAndKeepAlive);
}

main().catch((error) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
