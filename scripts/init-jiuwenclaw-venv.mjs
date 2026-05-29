#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */


import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const jiuwenRoot = resolve(repoRoot, 'vendor', 'jiuwenclaw');

function printHelp() {
  process.stdout.write(`Usage: node scripts/init-jiuwenclaw-venv.mjs [options]

Initialize JiuwenClaw Python virtual environment with uv.

Options:
  --python <version>   Python version for venv (default: 3.11)
  --skip-venv          Skip uv venv creation, only run uv sync
  --skip-sync          Skip uv sync, only run uv venv
  --help               Show this help
`);
}

function parseArgs(argv) {
  const options = {
    pythonVersion: '3.11',
    skipVenv: false,
    skipSync: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--python':
        options.pythonVersion = argv[++index] ?? '3.11';
        break;
      case '--skip-venv':
        options.skipVenv = true;
        break;
      case '--skip-sync':
        options.skipSync = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function runCommand(command, options = {}) {
  const result = spawnSync(command, [], {
    cwd: options.cwd ?? jiuwenRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], {
    stdio: 'ignore',
    shell: true,
  });
  return result.status === 0;
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function logStep(step, message) {
  process.stdout.write(`  ${step} ${message}\n`);
}

function logSuccess(message) {
  process.stdout.write(`  ✓ ${message}\n`);
}

function logError(message) {
  process.stderr.write(`  ✗ ${message}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  log('');
  log('🐍 初始化 JiuwenClaw 虚拟环境');
  log('');

  if (!existsSync(jiuwenRoot)) {
    logError(`目录不存在: ${jiuwenRoot}`);
    throw new Error('请先执行: pnpm vendor:sync:jiuwenclaw');
  }

  if (!commandExists('uv')) {
    logError('未找到 uv 命令');
    throw new Error('请先安装 uv: https://docs.astral.sh/uv/getting-started/installation/');
  }

  logStep('>', `Python 版本: ${options.pythonVersion}`);
  logStep('>', `目标目录: ${relative(repoRoot, jiuwenRoot)}`);
  log('');

  if (!options.skipVenv) {
    logStep('1', '创建虚拟环境...');
    runCommand(`uv venv --python=${options.pythonVersion}`, { cwd: jiuwenRoot });
    logSuccess('虚拟环境已创建');
  }

  if (!options.skipSync) {
    logStep('2', '安装依赖...');
    runCommand('uv sync', { cwd: jiuwenRoot });
    logSuccess('依赖已安装');
  }

  log('');
  log('✅ 初始化完成');
  log('');
}

try {
  main();
} catch (error) {
  log('');
  logError(error instanceof Error ? error.message : String(error));
  log('');
  process.exit(1);
}