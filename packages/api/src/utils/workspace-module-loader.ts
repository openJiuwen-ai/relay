/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface WorkspacePackageInfo {
  name: string;
  dir: string;
  exports?: Record<string, unknown>;
}

function scanWorkspacePackages(projectRoot: string): Map<string, WorkspacePackageInfo> {
  const map = new Map<string, WorkspacePackageInfo>();
  const packagesRoot = resolve(projectRoot, 'packages');

  function tryRead(dir: string) {
    try {
      const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf-8'));
      if (pkg.name) map.set(pkg.name, { name: pkg.name, dir, exports: pkg.exports });
    } catch { /* not a package */ }
  }

  try {
    for (const entry of readdirSync(packagesRoot)) {
      const entryPath = join(packagesRoot, entry);
      if (!statSync(entryPath).isDirectory()) continue;
      tryRead(entryPath);
      try {
        for (const sub of readdirSync(entryPath)) {
          const subPath = join(entryPath, sub);
          if (statSync(subPath).isDirectory()) tryRead(subPath);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  return map;
}

function resolveExportPath(exports: Record<string, unknown>, subpath: string): string | null {
  const key = subpath ? `./${subpath}` : '.';
  const entry = exports[key];
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object' && entry !== null) return (entry as Record<string, string>).import ?? null;
  return null;
}

export function createWorkspaceModuleLoader(projectRoot: string): (specifier: string) => Promise<unknown> {
  let packages: Map<string, WorkspacePackageInfo> | null = null;

  return async (specifier: string) => {
    try {
      return await import(specifier);
    } catch (err: unknown) {
      if ((err as { code?: string })?.code !== 'ERR_MODULE_NOT_FOUND') throw err;

      if (!packages) packages = scanWorkspacePackages(projectRoot);

      const match = specifier.match(/^(@[\w-]+\/[\w-]+)(?:\/(.+))?$/);
      if (!match) throw err;
      const [, pkgName, subpath] = match;

      const pkg = packages.get(pkgName);
      if (!pkg?.exports) throw err;

      const exportPath = resolveExportPath(pkg.exports, subpath ?? '');
      if (!exportPath) throw err;

      return import(pathToFileURL(resolve(pkg.dir, exportPath)).href);
    }
  };
}
