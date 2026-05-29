/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { KeyboardEventHandler, ReactNode } from 'react';
import { LoadingSmall } from '@/components/LoadingSmall';
import type { CliStatus } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import type { LocalGeneratedFile } from '../local-generated-files';
import { embeddedDocumentPreviewKind, inferLocalGeneratedFileKind } from '../local-generated-files';
import { CliOutputFileCardActionsMenu } from './CliOutputFileCardActionsMenu';
import {
  CLI_OUTPUT_FILE_CARD_LAYOUT_CLASS,
  CLI_OUTPUT_FILE_CARD_LOADING_SURFACE_CLASS,
  cliOutputFileCardBorderClass,
} from './cli-output-file-card-surface';
import { formatLocalFileDateLabel, useLocalGeneratedFileCard } from './useLocalGeneratedFileCard';

export function LocalGeneratedFileCard({
  file,
  projectPath,
  status,
}: {
  file: LocalGeneratedFile;
  projectPath?: string | null;
  status: CliStatus;
}) {
  const {
    cardTestId,
    openTestId,
    openFolderTestId,
    Icon,
    displayName,
    resolvedPath,
    fileStatus,
    generatedAt,
    canOpenFile,
    canOpenFolder,
    supportsSystemOpen,
    effectiveProjectPath,
    isOpeningAction,
    isOpening,
    isOpeningFolder,
    handleOpen,
    handleOpenFolder,
  } = useLocalGeneratedFileCard(file, projectPath, status);

  const openFileBrowserPanel = useChatStore((s) => s.openFileBrowserPanel);
  const openFileBrowserPanelWithFile = useChatStore((s) => s.openFileBrowserPanelWithFile);
  const isEmbeddedDocumentPreviewSelected = useChatStore((s) =>
    resolvedPath
      ? s.rightPanelMode === 'fileBrowser' && s.fileBrowserSelectedPath === resolvedPath
      : false,
  );

  const embeddedPreviewKind =
    embeddedDocumentPreviewKind(file.kind) ??
    embeddedDocumentPreviewKind(inferLocalGeneratedFileKind(file.path, file.name));

  const canOpenEmbeddedDocumentPreview =
    (embeddedPreviewKind !== null || file.kind === 'code' || file.kind === 'txt') && Boolean(resolvedPath);

  const handleOpenEmbeddedDocumentPreview = () => {
    if (!resolvedPath) return;
    openFileBrowserPanelWithFile(resolvedPath);
  };

  const actionsMenu = (
    <CliOutputFileCardActionsMenu
      menuTriggerTestId={`${cardTestId}-menu-trigger`}
      openTestId={openTestId}
      openFolderTestId={openFolderTestId}
      supportsSystemOpen={supportsSystemOpen}
      canOpenFile={canOpenFile}
      canOpenFolder={canOpenFolder}
      isOpening={isOpening}
      isOpeningFolder={isOpeningFolder}
      isOpeningAction={isOpeningAction}
      onOpenDefault={() => void handleOpen()}
      onOpenFolder={() => void handleOpenFolder()}
      onViewAllFiles={() => openFileBrowserPanel('workspace')}
    />
  );

  if (resolvedPath && fileStatus === 'checking' && status === 'streaming') {
    return (
      <CliOutputFileCardShell
        testId={`${cardTestId}-loading`}
        className={CLI_OUTPUT_FILE_CARD_LOADING_SURFACE_CLASS}
        icon={<LoadingSmall className="h-5 w-5" />}
        displayName={displayName}
        subtitle="正在验证文件..."
        titleClassName="truncate text-sm font-semibold text-gray-600"
        subtitleClassName="mt-1 text-sm leading-4 text-gray-400"
      />
    );
  }

  const borderClass = cliOutputFileCardBorderClass(isEmbeddedDocumentPreviewSelected);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: card shell opens preview; menu uses real buttons with stopPropagation
    // biome-ignore lint/a11y/useKeyWithClickEvents: preview is secondary to the actions menu
    <CliOutputFileCardShell
      testId={cardTestId}
      className={`${CLI_OUTPUT_FILE_CARD_LAYOUT_CLASS} ${borderClass} ${
        canOpenEmbeddedDocumentPreview ? 'cursor-pointer' : ''
      }`}
      onClick={canOpenEmbeddedDocumentPreview ? handleOpenEmbeddedDocumentPreview : undefined}
      icon={<Icon width={24} height={24} />}
      displayName={displayName}
      subtitle={formatLocalFileDateLabel(generatedAt, file)}
      actions={actionsMenu}
    />
  );
}

export function CliOutputFileCardShell({
  testId,
  className,
  onClick,
  onKeyDown,
  tabIndex,
  icon,
  displayName,
  subtitle,
  titleClassName = 'truncate text-sm font-semibold text-[#191919]',
  subtitleClassName = 'mt-1 text-sm leading-4 text-[#808080]',
  actions,
}: {
  testId: string;
  className: string;
  onClick?: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  tabIndex?: number;
  icon: ReactNode;
  displayName: string;
  subtitle: string;
  titleClassName?: string;
  subtitleClassName?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className={className}
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={onKeyDown != null || tabIndex != null ? (tabIndex ?? 0) : undefined}
    >
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className={titleClassName} title={displayName}>
          {displayName}
        </div>
        <div className={subtitleClassName}>{subtitle}</div>
      </div>
      {actions ? <div className="flex flex-shrink-0 items-center self-center">{actions}</div> : null}
    </div>
  );
}
