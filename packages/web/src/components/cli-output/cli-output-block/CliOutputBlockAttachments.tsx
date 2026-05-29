/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo } from 'react';
import type { CliEvent, CliStatus } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { PptSessionCard } from '../../ppt-studio/PptSessionCard';
import { extractDisplayedLocalGeneratedFiles, findLocalPptLinkedToPptPages } from '../local-generated-files';
import { useSyncCliOutputPptPreview } from '../use-cli-output-ppt-preview';
import { resolvePptSessionStoreKey } from './cli-output-block-helpers';
import { LocalGeneratedFileCard } from './LocalGeneratedFileCard';

export interface CliOutputBlockAttachmentsProps {
  events: CliEvent[];
  status: CliStatus;
  suppressedGeneratedFileNames?: string[];
  projectPath?: string | null;
}

/**
 * Local generated file cards + PPT session card — same data path as {@link CliOutputBlock},
 * extracted so task-grouped UI can render them after the formal answer markdown.
 */
export function CliOutputBlockAttachments({
  events,
  status,
  suppressedGeneratedFileNames,
  projectPath,
}: CliOutputBlockAttachmentsProps) {
  const currentThreadId = useChatStore((state) => state.currentThreadId);
  const workspaceWorktreeId = useChatStore((state) => state.workspaceWorktreeId);

  const localGeneratedFiles = useMemo(() => {
    const hiddenNames = new Set((suppressedGeneratedFileNames ?? []).map((fileName) => fileName.toLowerCase()));
    return extractDisplayedLocalGeneratedFiles(events).filter((file) => !hiddenNames.has(file.name.toLowerCase()));
  }, [events, suppressedGeneratedFileNames]);

  const pptMarkerSpecs = useSyncCliOutputPptPreview({
    events,
    status,
    currentThreadId,
    workspaceWorktreeId,
  });

  const primaryMarkerPagesDir = useMemo(
    () => (pptMarkerSpecs.length > 0 ? (pptMarkerSpecs[pptMarkerSpecs.length - 1]?.pagesDir ?? null) : null),
    [pptMarkerSpecs],
  );

  const pptSessionStoreKey = useChatStore((s) =>
    primaryMarkerPagesDir ? resolvePptSessionStoreKey(s.pptStudioSessions, primaryMarkerPagesDir) : null,
  );

  const pptSessionDeckTitle = useChatStore((s) => {
    if (!primaryMarkerPagesDir) return undefined;
    const key = resolvePptSessionStoreKey(s.pptStudioSessions, primaryMarkerPagesDir);
    return s.pptStudioSessions[key]?.deckTitle;
  });

  const linkedPptFileForSession = useMemo(
    () =>
      primaryMarkerPagesDir
        ? findLocalPptLinkedToPptPages(localGeneratedFiles, primaryMarkerPagesDir, pptSessionDeckTitle)
        : undefined,
    [localGeneratedFiles, primaryMarkerPagesDir, pptSessionDeckTitle],
  );

  const localFilesForAttachmentCards = useMemo(
    () =>
      linkedPptFileForSession
        ? localGeneratedFiles.filter((f) => f.path !== linkedPptFileForSession.path)
        : localGeneratedFiles,
    [linkedPptFileForSession, localGeneratedFiles],
  );

  if (localFilesForAttachmentCards.length === 0 && !(primaryMarkerPagesDir && pptSessionStoreKey != null)) {
    return null;
  }

  return (
    <div className="cli-output-attachments mt-2 space-y-2" data-testid="cli-output-attachments">
      {localFilesForAttachmentCards.map((file) => (
        <LocalGeneratedFileCard
          key={`${file.kind}:${file.path}`}
          file={file}
          projectPath={projectPath}
          status={status}
        />
      ))}
      {primaryMarkerPagesDir && pptSessionStoreKey != null ? (
        <PptSessionCard
          pagesDir={pptSessionStoreKey}
          projectPath={projectPath}
          status={status}
          linkedPptFile={linkedPptFileForSession}
        />
      ) : null}
    </div>
  );
}
