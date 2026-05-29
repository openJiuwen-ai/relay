/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type ComponentType, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { CliStatus } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import {
  type FileVerificationStatus,
  inferLocalGeneratedFileKind,
  fileNameFromPath,
  formatGeneratedDate,
  getParentDirectoryPath,
  isAbsolutePresentationPath,
  isLocalAgentOpenableExtension,
  type LocalGeneratedFile,
  resolvePresentationPath,
} from '../cli-output/local-generated-files';
import { LoadingSmall } from '../LoadingSmall';
import { CliOutputFileCardActionsMenu } from '../cli-output/cli-output-block/CliOutputFileCardActionsMenu';
import { CliOutputFileCardShell } from '../cli-output/cli-output-block/LocalGeneratedFileCard';
import {
  CLI_OUTPUT_FILE_CARD_LAYOUT_CLASS,
  CLI_OUTPUT_FILE_CARD_LOADING_SURFACE_CLASS,
  cliOutputFileCardBorderClass,
} from '../cli-output/cli-output-block/cli-output-file-card-surface';

interface FileIconProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

function normalizePptPathForMatch(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

function isPptPreviewPanelActiveForSession(args: {
  rightPanelMode: string | undefined;
  activePptPagesDir: string | null | undefined;
  cardPagesDir: string;
  fileBrowserSelectedPath: string | null;
}): boolean {
  const { rightPanelMode, activePptPagesDir, cardPagesDir, fileBrowserSelectedPath } = args;
  if (!activePptPagesDir) return false;

  if (rightPanelMode === 'pptStudio') {
    const a = normalizePptPathForMatch(activePptPagesDir);
    const b = normalizePptPathForMatch(cardPagesDir);
    return a === b || a.endsWith(b) || b.endsWith(a);
  }

  if (rightPanelMode === 'fileBrowser') {
    // In file browser mode, we only highlight the PPT card if the selected file is actually a PPT
    // (either a .pptx file or a virtual PPT generation placeholder).
    if (!fileBrowserSelectedPath) return false;
    const kind = inferLocalGeneratedFileKind(fileBrowserSelectedPath);
    if (kind !== 'ppt') return false;

    const a = normalizePptPathForMatch(activePptPagesDir);
    const b = normalizePptPathForMatch(cardPagesDir);
    return a === b || a.endsWith(b) || b.endsWith(a);
  }

  return false;
}

/** 普通文档图标（生成中态左侧，中性灰） */
const GenericFileIcon: ComponentType<FileIconProps> = ({ width = 24, height = 24, className }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width={width}
    height={height}
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      fill="rgb(128,128,128)"
      d="M14.475 0.81C14.25 0.75 13.995 0.75 13.755 0.75L6 0.75C5.715 0.75 5.445 0.765 5.19 0.825C4.965 0.885 4.74 0.945 4.53 1.035C4.32 1.125 4.125 1.23 3.93 1.365C3.72 1.5 3.525 1.665 3.345 1.845C3.165 2.025 3 2.22 2.865 2.43C2.73 2.625 2.625 2.82 2.535 3.03C2.445 3.24 2.385 3.465 2.325 3.69C2.25 3.945 2.25 4.215 2.25 4.5L2.25 19.5C2.25 19.77 2.25 20.04 2.325 20.295C2.385 20.52 2.445 20.745 2.535 20.955C2.625 21.165 2.73 21.36 2.865 21.555C3 21.765 3.165 21.96 3.345 22.14C3.69 22.485 4.08 22.755 4.53 22.95C4.995 23.145 5.49 23.25 6 23.25L18 23.25C18.27 23.25 18.54 23.22 18.795 23.16C19.02 23.1 19.245 23.04 19.455 22.95C19.905 22.755 20.295 22.485 20.64 22.14C20.985 21.795 21.255 21.405 21.45 20.955C21.645 20.49 21.75 19.995 21.75 19.5L21.75 8.73C21.75 8.49 21.72 8.25 21.675 8.01C21.63 7.77 21.555 7.53 21.45 7.305C21.36 7.065 21.24 6.855 21.105 6.645C20.97 6.45 20.82 6.255 20.64 6.09L16.395 1.845C16.05 1.485 15.645 1.215 15.18 1.035C14.955 0.929998 14.715 0.854998 14.475 0.809998L14.475 0.81ZM6 2.25L13.905 2.25C13.995 2.25 14.16 2.265 14.265 2.295L14.265 6C14.265 6.15 14.28 6.315 14.31 6.465C14.34 6.6 14.385 6.735 14.43 6.87C14.49 7.005 14.55 7.125 14.625 7.23C14.715 7.365 14.805 7.47 14.91 7.59C15.03 7.695 15.135 7.785 15.27 7.875C15.375 7.95 15.51 8.01 15.63 8.07C15.915 8.19 16.2 8.25 16.515 8.25L20.205 8.295C20.235 8.445 20.25 8.58 20.25 8.73L20.25 19.5C20.25 19.665 20.22 19.83 20.19 20.01C20.16 20.13 20.115 20.25 20.07 20.37C19.95 20.64 19.785 20.88 19.59 21.09C19.38 21.285 19.14 21.45 18.87 21.57C18.585 21.69 18.3 21.75 18 21.75L6 21.75C5.82 21.75 5.655 21.72 5.475 21.69C5.355 21.66 5.235 21.615 5.115 21.57C4.995 21.51 4.875 21.45 4.77 21.375C4.635 21.3 4.515 21.195 4.395 21.09C4.2 20.88 4.035 20.64 3.915 20.37C3.795 20.085 3.75 19.8 3.75 19.5L3.75 4.5C3.75 4.32 3.75 4.155 3.795 3.975C3.825 3.855 3.87 3.735 3.915 3.615C3.975 3.495 4.035 3.375 4.11 3.27C4.185 3.135 4.29 3.015 4.395 2.895C4.515 2.79 4.635 2.685 4.77 2.61C4.875 2.535 4.995 2.475 5.115 2.415C5.235 2.37 5.355 2.325 5.475 2.295C5.655 2.25 5.82 2.25 6 2.25L6 2.25ZM15.75 6L15.75 3.3L19.14 6.69L16.5 6.75C16.395 6.75 16.29 6.72 16.2 6.69C16.11 6.645 16.035 6.6 15.96 6.525C15.885 6.45 15.84 6.375 15.795 6.285C15.765 6.195 15.75 6.09 15.75 6L15.75 6ZM17.25 11.25C17.25 10.83 16.92 10.5 16.5 10.5L7.5 10.5C7.08 10.5 6.75 10.83 6.75 11.25C6.75 11.67 7.08 12 7.5 12L16.5 12C16.92 12 17.25 11.67 17.25 11.25ZM17.25 14.25C17.25 13.83 16.92 13.5 16.5 13.5L7.5 13.5C7.08 13.5 6.75 13.83 6.75 14.25C6.75 14.67 7.08 15 7.5 15L16.5 15C16.92 15 17.25 14.67 17.25 14.25ZM12.75 16.5C13.17 16.5 13.5 16.83 13.5 17.25C13.5 17.67 13.17 18 12.75 18L7.5 18C7.08 18 6.75 17.67 6.75 17.25C6.75 16.83 7.08 16.5 7.5 16.5L12.75 16.5Z"
    />
  </svg>
);

const PptFileIcon: ComponentType<FileIconProps> = ({ width = 24, height = 24, className }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 40 40"
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    fill="none"
    className={className}
  >
    <rect id="ppt" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
    <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
    <g id="ic_normal_white_grid_pptx">
      <g id="编组-236">
        <path
          id="矩形备份-24"
          d="M25.8325 3.33496L34.5825 12.085L27.7373 12.085C26.6853 12.085 25.8325 11.2322 25.8325 10.1802L25.8325 3.33496L25.8325 3.33496Z"
          fill="rgb(254,201,176)"
          fillRule="evenodd"
        />
        <path
          id="矩形备份-23"
          d="M25.9558 3.33496L25.9409 10.176C25.9386 11.228 26.7895 12.0827 27.8415 12.085L34.6867 12.085L34.6867 33.335C34.6867 35.1759 33.1943 36.6683 31.3534 36.6683L8.85335 36.6683C7.0124 36.6683 5.52002 35.1759 5.52002 33.335L5.52002 6.66829C5.52002 4.82735 7.0124 3.33496 8.85335 3.33496L25.9558 3.33496L25.9558 3.33496Z"
          fill="rgb(255,119,55)"
          fillRule="evenodd"
        />
      </g>
      <g id="编组-2">
        <path
          id="路径-7"
          d="M20.5487 18.5439L16.7193 18.5439C16.4596 18.5439 16.249 18.7545 16.249 19.0143L16.249 29.8838"
          fillRule="evenodd"
          stroke="rgb(255,255,255)"
          strokeLinecap="round"
          strokeWidth="1.91840291"
        />
        <path
          id="路径"
          d="M16.96 24.9265L20.5947 24.9265C22.348 24.9265 23.7693 23.5051 23.7693 21.7518C23.7693 19.9985 22.348 18.5439 20.5947 18.5439"
          fillRule="evenodd"
          stroke="rgb(255,255,255)"
          strokeLinecap="round"
          strokeWidth="1.91840291"
        />
      </g>
    </g>
  </svg>
);

export interface PptSessionCardProps {
  pagesDir: string;
  projectPath?: string | null;
  status: CliStatus;
  /** 与当前 HTML 工程关联的 `send_file_to_user` 成品 PPT；无则视为仍在生成/仅预览 */
  linkedPptFile?: LocalGeneratedFile;
}

function pptNoFileCardCopy(status: CliStatus): {
  streaming: boolean;
  stalledMessage: string;
  stalledTone: string;
} {
  if (status === 'streaming') {
    return { streaming: true, stalledMessage: '', stalledTone: '' };
  }
  if (status === 'failed') {
    return {
      streaming: false,
      stalledMessage: '生成失败，未收到成品文件。',
      stalledTone: 'text-red-700',
    };
  }
  /** `done` / `interrupted`：流已结束但未关联 send_file（含手动停止、重连对账、未推送文件等） */
  return {
    streaming: false,
    stalledMessage: '任务已结束，但未收到可下载的演示文稿（可能未推送文件或连接中断）。若仍需要，请重新发起生成。',
    stalledTone: 'text-gray-600',
  };
}

function PptSessionNoFileCard({
  displayName,
  status,
  interactiveBaseClass,
  onOpenPreview,
  onContainerKey,
}: {
  displayName: string;
  status: CliStatus;
  interactiveBaseClass: string;
  onOpenPreview: () => void;
  onContainerKey: (e: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const { streaming: isStillGenerating, stalledMessage, stalledTone } = pptNoFileCardCopy(status);
  return (
    // biome-ignore lint/a11y/useSemanticElements: card shell opens preview
    <div
      data-testid="cli-output-ppt-card"
      role="button"
      tabIndex={0}
      onClick={onOpenPreview}
      onKeyDown={onContainerKey}
      className={`cli-output-doc-card ${interactiveBaseClass}`}
    >
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl" title="文件">
        <GenericFileIcon width={24} height={24} />
      </div>
      <div className="min-w-0 flex-1">
        {isStillGenerating ? (
          <div className="text-sm text-[#191919]">正在生成中...</div>
        ) : (
          <>
            <div className="truncate text-sm font-semibold text-[#191919]" title={displayName}>
              {displayName}
            </div>
            <div className={`mt-1 text-sm leading-snug ${stalledTone}`}>{stalledMessage}</div>
          </>
        )}
      </div>
    </div>
  );
}

export function PptSessionCard({ pagesDir, projectPath, status, linkedPptFile }: PptSessionCardProps) {
  const session = useChatStore((s) => s.pptStudioSessions[pagesDir]);
  const openFileBrowserPanelWithFile = useChatStore((s) => s.openFileBrowserPanelWithFile);
  const openFileBrowserPanel = useChatStore((s) => s.openFileBrowserPanel);
  const isPreviewPanelActive = useChatStore((s) =>
    isPptPreviewPanelActiveForSession({
      rightPanelMode: s.rightPanelMode,
      activePptPagesDir: s.activePptPagesDir,
      cardPagesDir: pagesDir,
      fileBrowserSelectedPath: s.fileBrowserSelectedPath,
    }),
  );

  const [isOpening, setIsOpening] = useState(false);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [fileStatus, setFileStatus] = useState<FileVerificationStatus>('checking');
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [defaultProjectPath, setDefaultProjectPath] = useState<string | null>(null);
  /** Stable id for effects: parent rebuilds `linkedPptFile` object each stream chunk while path unchanged. */
  const linkedFilePath = linkedPptFile?.path;

  const displayName = useMemo(
    () =>
      linkedPptFile
        ? linkedPptFile.name.trim() || fileNameFromPath(linkedPptFile.path) || '未命名文件'
        : session?.deckTitle?.trim()
          ? `${session.deckTitle.replace(/\.pptx?$/i, '')}.pptx`
          : (() => {
              const parts = pagesDir.split('/');
              const folderName = parts[parts.length - 2] || '幻灯片';
              return `${folderName}.pptx`;
            })(),
    [linkedPptFile, pagesDir, session?.deckTitle],
  );

  const resolvedPath = useMemo(
    () => (linkedFilePath ? resolvePresentationPath(linkedFilePath, projectPath, defaultProjectPath) : null),
    [defaultProjectPath, linkedFilePath, projectPath],
  );
  const resolvedFileFolder = useMemo(
    () => (resolvedPath ? getParentDirectoryPath(resolvedPath) : null),
    [resolvedPath],
  );
  const isAbsoluteFilePath = useMemo(
    () => (linkedFilePath ? isAbsolutePresentationPath(linkedFilePath) : false),
    [linkedFilePath],
  );
  const effectiveProjectPath = useMemo(
    () => (isAbsoluteFilePath ? null : projectPath && projectPath !== 'default' ? projectPath : defaultProjectPath),
    [defaultProjectPath, isAbsoluteFilePath, projectPath],
  );
  const needsDefaultProjectPath = !isAbsoluteFilePath && (!projectPath || projectPath === 'default');
  const canOpenFile = Boolean(resolvedPath) && (!needsDefaultProjectPath || Boolean(effectiveProjectPath));
  const canOpenFolder = Boolean(resolvedFileFolder) && (!needsDefaultProjectPath || Boolean(effectiveProjectPath));
  const addToast = useToastStore((s) => s.addToast);
  const supportsSystemOpen = Boolean(resolvedPath && isLocalAgentOpenableExtension(resolvedPath));
  const isOpeningAction = isOpening || isOpeningFolder;

  useEffect(() => {
    let cancelled = false;
    async function loadDefaultProjectPath(): Promise<void> {
      if (!linkedFilePath) return;
      if (isAbsoluteFilePath) return;
      if (projectPath && projectPath !== 'default') return;
      try {
        const response = await apiFetch('/api/projects/cwd');
        if (!response.ok) {
          if (!cancelled) setFileStatus('error');
          return;
        }
        const payload = (await response.json()) as { path?: string };
        if (!cancelled && typeof payload.path === 'string' && payload.path.trim()) {
          setDefaultProjectPath(payload.path.trim());
        } else if (!cancelled) {
          setFileStatus('error');
        }
      } catch {
        if (!cancelled) {
          setDefaultProjectPath(null);
          setFileStatus('error');
        }
      }
    }
    void loadDefaultProjectPath();
    return () => {
      cancelled = true;
    };
  }, [isAbsoluteFilePath, linkedFilePath, projectPath]);

  useEffect(() => {
    if (!linkedFilePath || !resolvedPath) {
      setGeneratedAt(null);
      return;
    }
    let cancelled = false;
    setFileStatus('checking');
    async function loadMeta(): Promise<void> {
      if (!resolvedPath) return;
      if (needsDefaultProjectPath && !effectiveProjectPath) return;
      try {
        const response = await apiFetch('/api/projects/local-file-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: resolvedPath,
            ...(effectiveProjectPath ? { projectPath: effectiveProjectPath } : {}),
          }),
        });
        if (!response.ok) {
          if (!cancelled) {
            if (status === 'streaming') {
              retryTimer.current = setTimeout(loadMeta, 1000);
            }
            setFileStatus(response.status === 404 ? 'not-found' : 'error');
          }
          return;
        }
        const payload = (await response.json()) as { generatedAt?: number };
        if (!cancelled && typeof payload.generatedAt === 'number') {
          setGeneratedAt(payload.generatedAt);
          setFileStatus('exists');
        }
      } catch {
        if (!cancelled) {
          setGeneratedAt(null);
          setFileStatus('error');
          if (status === 'streaming') {
            retryTimer.current = setTimeout(loadMeta, 1000);
          }
        }
      }
    }
    void loadMeta();
    return () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      cancelled = true;
    };
  }, [effectiveProjectPath, linkedFilePath, needsDefaultProjectPath, resolvedPath, status]);

  const handleOpenPreview = () => {
    if (resolvedPath) {
      openFileBrowserPanelWithFile(resolvedPath);
    } else {
      openFileBrowserPanel();
    }
  };

  async function handleOpenSystem(): Promise<void> {
    if (isOpening || !resolvedPath || !canOpenFile || !supportsSystemOpen) return;
    setIsOpening(true);
    try {
      const res = await apiFetch('/api/projects/open-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: resolvedPath,
          ...(effectiveProjectPath ? { projectPath: effectiveProjectPath } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const message =
          typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : '无法在系统中打开该文件';
        addToast({ type: 'error', title: '打开失败', message, duration: 4000 });
      }
    } finally {
      setIsOpening(false);
    }
  }

  async function handleOpenFolder(): Promise<void> {
    if (isOpeningFolder || !resolvedFileFolder || !canOpenFolder) return;
    setIsOpeningFolder(true);
    try {
      const res = await apiFetch('/api/projects/open-local-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: resolvedFileFolder,
          ...(effectiveProjectPath ? { projectPath: effectiveProjectPath } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const message =
          typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : '无法在文件管理器中打开该文件夹';
        addToast({ type: 'error', title: '打开文件夹失败', message, duration: 4000 });
      }
    } finally {
      setIsOpeningFolder(false);
    }
  }

  const onContainerKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOpenPreview();
    }
  };

  const interactiveBaseClass = `${CLI_OUTPUT_FILE_CARD_LAYOUT_CLASS} ${cliOutputFileCardBorderClass(isPreviewPanelActive)} cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-200`;

  if (linkedPptFile && resolvedPath && fileStatus === 'checking' && status === 'streaming') {
    return (
      <CliOutputFileCardShell
        testId="cli-output-ppt-card-loading"
        className={`${CLI_OUTPUT_FILE_CARD_LOADING_SURFACE_CLASS} cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-200`}
        onClick={handleOpenPreview}
        onKeyDown={onContainerKey}
        tabIndex={0}
        icon={<LoadingSmall className="h-5 w-5" />}
        displayName={displayName}
        subtitle="正在验证文件..."
        titleClassName="truncate text-sm font-semibold text-gray-600"
        subtitleClassName="mt-1 text-sm leading-4 text-gray-400"
      />
    );
  }

  const hasFinalPpt = Boolean(linkedPptFile);
  if (!hasFinalPpt) {
    return (
      <PptSessionNoFileCard
        displayName={displayName}
        status={status}
        interactiveBaseClass={interactiveBaseClass}
        onOpenPreview={handleOpenPreview}
        onContainerKey={onContainerKey}
      />
    );
  }

  const titleText = displayName;
  const subtitleText = formatGeneratedDate(generatedAt ?? linkedPptFile?.fallbackGeneratedAt ?? null);

  return (
    <CliOutputFileCardShell
      testId="cli-output-ppt-card"
      className={interactiveBaseClass}
      onClick={handleOpenPreview}
      onKeyDown={onContainerKey}
      tabIndex={0}
      icon={<PptFileIcon width={24} height={24} />}
      displayName={titleText}
      subtitle={subtitleText}
      actions={
        linkedPptFile ? (
          <CliOutputFileCardActionsMenu
            menuTriggerTestId="cli-output-ppt-card-menu-trigger"
            openTestId="cli-output-ppt-open"
            openFolderTestId="cli-output-ppt-open-folder"
            supportsSystemOpen={supportsSystemOpen}
            canOpenFile={canOpenFile}
            canOpenFolder={canOpenFolder}
            isOpening={isOpening}
            isOpeningFolder={isOpeningFolder}
            isOpeningAction={isOpeningAction}
            onOpenDefault={() => void handleOpenSystem()}
            onOpenFolder={() => void handleOpenFolder()}
            onViewAllFiles={() => openFileBrowserPanel('workspace')}
          />
        ) : undefined
      }
    />
  );
}
