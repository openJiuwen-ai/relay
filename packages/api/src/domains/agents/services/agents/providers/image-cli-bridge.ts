/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { dirname } from 'node:path';
import type { LocalUploadRef } from './image-paths.js';

/**
 * Build prompt hints for local image paths.
 * These are path references for tool access, not binary attachments.
 */
export function buildLocalImagePathHints(imagePaths: readonly string[]): string {
  if (imagePaths.length === 0) return '';
  return imagePaths.map((p) => `[Local image path: ${p}]`).join('\n');
}

/**
 * Append local image path hints to an existing prompt.
 */
export function appendLocalImagePathHints(prompt: string, imagePaths: readonly string[]): string {
  const hints = buildLocalImagePathHints(imagePaths);
  if (!hints) return prompt;
  return `${prompt}\n\n${hints}`;
}

/**
 * Build prompt hints for local uploaded attachments (images + files).
 */
export function buildLocalUploadPathHints(uploadRefs: readonly LocalUploadRef[]): string {
  if (uploadRefs.length === 0) return '';
  return uploadRefs
    .map((ref) => {
      if (ref.kind === 'image') return `[Local image path: ${ref.path}]`;
      const nameSuffix = ref.fileName ? ` (${ref.fileName})` : '';
      return `[Local file path: ${ref.path}]${nameSuffix}`;
    })
    .join('\n');
}

/**
 * Append local uploaded attachment path hints to an existing prompt.
 */
export function appendLocalUploadPathHints(prompt: string, uploadRefs: readonly LocalUploadRef[]): string {
  const hints = buildLocalUploadPathHints(uploadRefs);
  if (!hints) return prompt;
  return `${prompt}\n\n${hints}`;
}

/**
 * Extract unique directory list from image paths for CLI workspace include flags.
 */
export function collectImageAccessDirectories(imagePaths: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const imagePath of imagePaths) {
    const dir = dirname(imagePath);
    if (seen.has(dir)) continue;
    seen.add(dir);
    out.push(dir);
  }
  return out;
}
