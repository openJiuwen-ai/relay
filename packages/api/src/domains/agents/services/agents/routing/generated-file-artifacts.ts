/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { RichBlock } from '@openjiuwen/relay-shared';

export type GeneratedFileArtifact = {
  fileName: string;
  url: string;
  workspacePath?: string;
  mimeType?: string;
  source: 'callback' | 'cli' | 'provider';
}

function dedupeArtifacts(artifacts: GeneratedFileArtifact[]): GeneratedFileArtifact[] {
  const seen = new Set<string>();
  const deduped: GeneratedFileArtifact[] = [];

  for (const artifact of artifacts) {
    const key = `${artifact.fileName}::${artifact.workspacePath ?? ''}::${artifact.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(artifact);
  }

  return deduped;
}

function resolveArtifactSource(block: Extract<RichBlock, { kind: 'file' }>): GeneratedFileArtifact['source'] {
  if (block.url.startsWith('/uploads/')) return 'callback';
  return 'provider';
}

function  resolveArtifactLocation(artifact: GeneratedFileArtifact): string {
  if (artifact.workspacePath?.trim()) return artifact.workspacePath.trim();
  if (artifact.url.startsWith('/api/workspace/download?')) {
    try {
      const path = new URLSearchParams(artifact.url.slice(artifact.url.indexOf('?') + 1)).get('path');
      if (path?.trim()) return path.trim();
    } catch {
      // Fall through to the URL for malformed legacy data.
    }
  }
  return artifact.url;
}

function contentHasArtifactDisclosure(content: string, artifact: GeneratedFileArtifact): boolean {
  if (!content.includes(artifact.fileName)) return false;
  return content.includes(resolveArtifactLocation(artifact));
}

export function extractGeneratedFileArtifacts(richBlocks: readonly RichBlock[]): GeneratedFileArtifact[] {
  const artifacts = richBlocks
    .filter((block): block is Extract<RichBlock, { kind: 'file' }> => block.kind === 'file' && typeof block.url === 'string')
    .map((block) => ({
      fileName: block.fileName,
      url: block.url,
      workspacePath: block.workspacePath,
      mimeType: block.mimeType,
      source: resolveArtifactSource(block),
    }));

  return dedupeArtifacts(artifacts);
}

export function appendGeneratedFileLocationDisclosure(content: string, richBlocks: readonly RichBlock[]): string {
  const artifacts = extractGeneratedFileArtifacts(richBlocks);
  if (artifacts.length === 0) return content;

  const missingArtifacts = artifacts.filter((artifact) => !contentHasArtifactDisclosure(content, artifact));
  if (missingArtifacts.length === 0) return content;

  const disclosure = missingArtifacts
    .map((artifact) => `- ${artifact.fileName}: ${resolveArtifactLocation(artifact)}`)
    .join('\n');
  const separator = content.trim().length > 0 ? '\n\n' : '';
  return `${content}${separator}文件位置：\n${disclosure}`;
}
