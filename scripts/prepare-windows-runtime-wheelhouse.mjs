#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function main() {
  if (process.platform !== 'win32') {
    throw new Error('This command is intended to run on Windows only.');
  }

  const outputDir = resolve(repoRoot, 'dist', 'windows-python-wheelhouse');
  const configPath = resolve(repoRoot, 'packaging', 'windows', 'python-runtime-wheelhouse.json');
  const scriptPath = resolve(repoRoot, 'scripts', 'prepare-python-wheelhouse.mjs');

  process.stdout.write(`[wheelhouse] preparing Windows runtime wheelhouse in ${outputDir}\n`);

  const result = spawnSync(process.execPath, [scriptPath, '--config', configPath, '--output-dir', outputDir], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Wheelhouse build failed with exit code ${result.status ?? 1}`);
  }

  process.stdout.write(`[wheelhouse] ready: ${outputDir}\n`);
  process.stdout.write('[wheelhouse] copy this directory to the Windows install machine if needed\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`[wheelhouse] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
