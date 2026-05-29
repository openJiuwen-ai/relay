#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logError, logInfo, logSuccess } from './dev-runner-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function spawnNodeScript(scriptPath, tag, extraEnv = {}) {
  const child = spawn('node', [scriptPath], {
    cwd: projectRoot,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${tag}] ${String(chunk)}`);
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${tag}] ${String(chunk)}`);
  });

  return child;
}

async function waitForBackendReady(backendProcess) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const onBackendOutput = (chunk) => {
      const text = String(chunk);
      if (text.includes('后端健康检查通过')) {
        if (!settled) {
          settled = true;
          resolve();
        }
      }
    };

    backendProcess.stdout.on('data', onBackendOutput);
    backendProcess.stderr.on('data', onBackendOutput);

    backendProcess.on('exit', (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`后端进程提前退出 (exit=${code ?? 'null'})`));
      }
    });
    backendProcess.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

async function main() {
  console.log('🐾 dev:all 启动器');
  logInfo('先启动后端并等待健康检查');
  const backend = spawnNodeScript(
    resolve(projectRoot, 'scripts/dev-backend.mjs'),
    'backend',
    {
      OFFICE_CLAW_SKIP_AUTH: '1',
      CAT_CAFE_SKIP_AUTH: '1',
    },
  );
  await waitForBackendReady(backend);
  logSuccess('后端已就绪，开始启动前端');

  const frontend = spawnNodeScript(resolve(projectRoot, 'scripts/dev-frontend.mjs'), 'frontend');
  logSuccess('前后端均已启动（前端会自行完成健康检查）');
  logInfo('按 Ctrl+C 可同时停止 dev:all');

  let shuttingDown = false;
  const shutdown = (signal = 'SIGTERM') => {
    if (shuttingDown) return;
    shuttingDown = true;
    logInfo('正在停止 dev:all 子进程...');
    if (!backend.killed) backend.kill(signal);
    if (!frontend.killed) frontend.kill(signal);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  const watchExit = (child, name) =>
    new Promise((resolve, reject) => {
      child.on('exit', (code) => {
        if (!shuttingDown && code !== 0 && code !== null) {
          reject(new Error(`${name} 进程异常退出 (exit=${code})`));
        } else {
          resolve();
        }
      });
      child.on('error', reject);
    });

  try {
    await Promise.race([watchExit(backend, 'backend'), watchExit(frontend, 'frontend')]);
    shutdown('SIGTERM');
    await Promise.allSettled([watchExit(backend, 'backend'), watchExit(frontend, 'frontend')]);
  } catch (error) {
    shutdown('SIGTERM');
    await Promise.allSettled([watchExit(backend, 'backend'), watchExit(frontend, 'frontend')]);
    throw error;
  }
}

main().catch((error) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
