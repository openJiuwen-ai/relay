#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */


import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_PACKAGES } from './open-source-npm-package-list.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const pnpm = 'pnpm';

function run(args) {
  const result = spawnSync(pnpm, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

for (const packageName of PUBLIC_PACKAGES) {
  console.log(`\n[build:npm-open-source] ${packageName}`);
  run(['--filter', packageName, 'run', packageName === '@openjiuwen/relay-web' ? 'build:npm' : 'build']);
}
