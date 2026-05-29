/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { realpath } from 'node:fs/promises';
import { relative, resolve, win32 } from 'node:path';
import { validateProjectPath } from '../../utils/project-path.js';

export type PptPathSecurityCode = 'NOT_FOUND' | 'FORBIDDEN';

export class PptPathSecurityError extends Error {
  readonly code: PptPathSecurityCode;

  constructor(code: PptPathSecurityCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'PptPathSecurityError';
  }
}

function isPathWithinRoot(absPath: string, root: string): boolean {
  const rel = relative(root, absPath);
  if (rel === '') return true;
  if (process.platform === 'win32' && win32.isAbsolute(rel)) return false;
  return !rel.startsWith('..') && !rel.startsWith('/') && !rel.startsWith('\\');
}

function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}

export async function resolvePptProjectRoot(rawProjectRoot: string): Promise<string> {
  const trimmed = rawProjectRoot.trim();
  if (!trimmed || trimmed.includes('\0')) {
    throw new PptPathSecurityError('FORBIDDEN', 'projectRoot required');
  }
  const validated = await validateProjectPath(trimmed);
  if (!validated) {
    throw new PptPathSecurityError('FORBIDDEN', 'Invalid or disallowed projectRoot');
  }
  return validated;
}

/**
 * Resolve a user-supplied path (absolute or relative to project root) and ensure it stays inside the project.
 * When mustExist is true, the target must exist; final path is realpath'd for symlink safety.
 */
export async function resolvePptPathUnderRoot(
  projectRootValidated: string,
  userPath: string,
  options: { mustExist: boolean },
): Promise<string> {
  const rootReal = await realpath(projectRootValidated);
  const trimmed = userPath.trim();
  if (!trimmed || trimmed.includes('\0')) {
    throw new PptPathSecurityError('FORBIDDEN', 'Invalid path');
  }

  const absoluteUser = isAbsolutePath(trimmed) ? resolve(trimmed) : resolve(rootReal, trimmed);

  if (!isPathWithinRoot(absoluteUser, rootReal)) {
    throw new PptPathSecurityError('FORBIDDEN', 'Path escapes project root');
  }

  if (!options.mustExist) {
    return absoluteUser;
  }

  try {
    const real = await realpath(absoluteUser);
    if (!isPathWithinRoot(real, rootReal)) {
      throw new PptPathSecurityError('FORBIDDEN', 'Path escapes project root');
    }
    return real;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PptPathSecurityError('NOT_FOUND', 'Path not found');
    }
    throw e;
  }
}
