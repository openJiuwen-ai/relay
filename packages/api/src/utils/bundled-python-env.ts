/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveOfficeClawHostRoot } from './office-claw-root.js';

function mergePathSegments(...values: Array<string | undefined>): string {
  const seen = new Set<string>();
  const segments: string[] = [];

  for (const value of values) {
    if (!value) continue;
    for (const segment of value.split(';')) {
      const trimmed = segment.trim();
      if (!trimmed) continue;
      const normalized = process.platform === 'win32' ? trimmed.toLowerCase() : trimmed;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      segments.push(trimmed);
    }
  }

  return segments.join(';');
}

export function resolveBundledPythonPaths(projectRoot = resolveOfficeClawHostRoot(process.cwd())): {
  pythonDir: string;
  scriptsDir: string;
  pythonBin: string;
} | null {
  const pythonDir = join(projectRoot, 'tools', 'python');
  const pythonBin = join(pythonDir, 'python.exe');
  if (!existsSync(pythonBin)) return null;
  return {
    pythonDir,
    scriptsDir: join(pythonDir, 'Scripts'),
    pythonBin,
  };
}

export function withBundledPythonPath<T extends Record<string, string | null | undefined>>(
  env: T,
  projectRoot = resolveOfficeClawHostRoot(process.cwd()),
): T {
  if (process.platform !== 'win32') return env;

  const bundled = resolveBundledPythonPaths(projectRoot);
  if (!bundled) return env;

  const basePath = env.PATH ?? process.env.PATH ?? '';
  return {
    ...env,
    PATH: mergePathSegments(bundled.scriptsDir, bundled.pythonDir, basePath),
  };
}
