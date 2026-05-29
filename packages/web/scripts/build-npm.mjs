#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */


import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const requiredFiles = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/components.js',
  'dist/public-api/components.d.ts',
  'dist/config.js',
  'dist/public-api/config.d.ts',
  'dist/constants.js',
  'dist/public-api/constants.d.ts',
  'dist/hooks.js',
  'dist/public-api/hooks.d.ts',
  'dist/pages.js',
  'dist/public-api/pages.d.ts',
  'dist/services.js',
  'dist/public-api/services.d.ts',
  'dist/shared.js',
  'dist/public-api/shared.d.ts',
  'dist/stores.js',
  'dist/public-api/stores.d.ts',
  'dist/lib.js',
  'dist/public-api/lib.d.ts',
  'dist/utils.js',
  'dist/public-api/utils.d.ts',
  'dist/styles.css',
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result.status ?? 0;
}

run('pnpm', ['clean']);
run('pnpm', ['generate:public-api']);
run('vite', ['build', '--mode', 'npm']);
run('tsc', ['-p', 'tsconfig.lib.json']);

const missing = requiredFiles.filter((file) => !existsSync(join(packageRoot, file)));
if (missing.length > 0) {
  console.error(`[build:npm] missing required package outputs:\n${missing.map((file) => `- ${file}`).join('\n')}`);
  process.exit(1);
}
