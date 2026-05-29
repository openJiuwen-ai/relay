/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { RichBlock } from '@/stores/chat-types';
import type { MessageContent } from '@/stores/chatStore';
import { getFileNameFromPath, getWorkspacePathFromDownloadUrl } from './workspace-path';

export function filterDuplicateWorkspaceContentBlocks(
  blocks: MessageContent[] | undefined,
  localGeneratedFileNames: Set<string>,
): MessageContent[] | undefined {
  if (!blocks?.length || localGeneratedFileNames.size === 0) return blocks;
  return blocks.filter((block) => {
    if (block.type !== 'file') return true;
    const workspacePath = getWorkspacePathFromDownloadUrl(block.url);
    const candidateName = workspacePath ? getFileNameFromPath(workspacePath) : block.fileName.toLowerCase();
    return !localGeneratedFileNames.has(candidateName);
  });
}

export function filterDuplicateWorkspaceRichBlocks(
  blocks: RichBlock[] | undefined,
  localGeneratedFileNames: Set<string>,
): RichBlock[] | undefined {
  if (!blocks?.length || localGeneratedFileNames.size === 0) return blocks;
  return blocks.filter((block) => {
    if (block.kind !== 'file') return true;
    const workspacePath = block.workspacePath ?? getWorkspacePathFromDownloadUrl(block.url);
    const candidateName = workspacePath ? getFileNameFromPath(workspacePath) : block.fileName.toLowerCase();
    return !localGeneratedFileNames.has(candidateName);
  });
}
