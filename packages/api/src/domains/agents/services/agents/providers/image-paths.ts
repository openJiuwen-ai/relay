/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Image Path Extraction
 * Extracts absolute file paths from MessageContent blocks for CLI passthrough.
 */

import { isAbsolute, relative, resolve } from 'node:path';
import type { MessageContent } from '@openjiuwen/relay-shared';

import { findMonorepoRoot } from '../../../../../utils/monorepo-root.js';
const DEFAULT_UPLOAD_DIR = resolve(findMonorepoRoot(), process.env.UPLOAD_DIR ?? 'data/uploads');

export interface LocalUploadRef {
  kind: 'image' | 'file';
  path: string;
  url: string;
  fileName?: string;
  mimeType?: string;
}

function resolveLocalUploadPath(url: string, uploadDir?: string): string | null {
  if (url.startsWith('/uploads/')) {
    const encodedFilename = url.slice('/uploads/'.length);
    let filename: string;
    try {
      filename = decodeURIComponent(encodedFilename);
    } catch {
      return null;
    }
    if (!filename || filename.includes('/') || filename.includes('\\')) return null;
    return resolve(uploadDir ?? DEFAULT_UPLOAD_DIR, filename);
  }
  if (url.startsWith('/')) return resolve(url);
  return null;
}

export function extractUploadRefs(contentBlocks: readonly MessageContent[] | undefined, uploadDir?: string): LocalUploadRef[] {
  if (!contentBlocks) return [];

  const refs: LocalUploadRef[] = [];
  for (const block of contentBlocks) {
    if (block.type !== 'image' && block.type !== 'file') continue;
    const path = resolveLocalUploadPath(block.url, uploadDir);
    if (!path) continue;

    if (block.type === 'image') {
      refs.push({ kind: 'image', path, url: block.url });
      continue;
    }

    refs.push({
      kind: 'file',
      path,
      url: block.url,
      fileName: block.fileName,
      mimeType: block.mimeType,
    });
  }

  return refs;
}

/**
 * Extract absolute image file paths from contentBlocks.
 * Converts relative URL paths (/uploads/foo.png) to absolute filesystem paths.
 * @param uploadDir Override for the upload directory (defaults to UPLOAD_DIR env or './uploads')
 */
export function extractImagePaths(contentBlocks: readonly MessageContent[] | undefined, uploadDir?: string): string[] {
  return extractUploadRefs(contentBlocks, uploadDir)
    .filter((ref) => ref.kind === 'image')
    .map((ref) => ref.path);
}
