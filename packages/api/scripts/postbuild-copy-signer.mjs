/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { copyFile, mkdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');

const sourceFiles = [
  resolve(rootDir, 'src/utils/signer.js'),
  resolve(rootDir, 'src/utils/signer.cjs'),
];
const targetDir = resolve(rootDir, 'dist/utils');

await mkdir(targetDir, { recursive: true });
await Promise.all(
  sourceFiles.map((sourcePath) =>
    copyFile(sourcePath, resolve(targetDir, basename(sourcePath))),
  ),
);
