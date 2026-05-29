/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CliStatus } from '@/stores/chat-types';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import {
  type FileVerificationStatus,
  fileNameFromPath,
  formatGeneratedDate,
  getParentDirectoryPath,
  isAbsolutePresentationPath,
  isLocalAgentOpenableExtension,
  type LocalGeneratedFile,
  resolvePresentationPath,
} from '../local-generated-files';
import { LOCAL_FILE_KIND_UI } from './CliOutputFileKindIcons';

async function loadDefaultProjectPathForCard(args: {
  isCancelled: () => boolean;
  isAbsoluteFilePath: boolean;
  projectPath: string | null | undefined;
  setDefaultProjectPath: (v: string | null) => void;
  setFileStatus: (s: FileVerificationStatus) => void;
}): Promise<void> {
  const { isCancelled, isAbsoluteFilePath, projectPath, setDefaultProjectPath, setFileStatus } = args;
  if (isAbsoluteFilePath) return;
  if (projectPath && projectPath !== 'default') return;

  try {
    const response = await apiFetch('/api/projects/cwd');
    if (!response.ok) {
      if (!isCancelled()) setFileStatus('error');
      return;
    }
    const payload = (await response.json()) as { path?: string };
    if (!isCancelled() && typeof payload.path === 'string' && payload.path.trim()) {
      setDefaultProjectPath(payload.path.trim());
    } else if (!isCancelled()) {
      setFileStatus('error');
    }
  } catch {
    if (!isCancelled()) {
      setDefaultProjectPath(null);
      setFileStatus('error');
    }
  }
}

function onLocalFileMetaHttpError(args: {
  isCancelled: () => boolean;
  status: CliStatus;
  scheduleRetry: () => void;
  setFileStatus: (s: FileVerificationStatus) => void;
  httpStatus: number;
}): void {
  const { isCancelled, status, scheduleRetry, setFileStatus, httpStatus } = args;
  if (isCancelled()) return;
  if (status === 'streaming') scheduleRetry();
  setFileStatus(httpStatus === 404 ? 'not-found' : 'error');
}

function onLocalFileMetaNetworkFailure(args: {
  isCancelled: () => boolean;
  status: CliStatus;
  scheduleRetry: () => void;
  setGeneratedAt: (n: number | null) => void;
  setFileStatus: (s: FileVerificationStatus) => void;
}): void {
  const { isCancelled, status, scheduleRetry, setGeneratedAt, setFileStatus } = args;
  if (isCancelled()) return;
  setGeneratedAt(null);
  setFileStatus('error');
  if (status === 'streaming') scheduleRetry();
}

async function loadLocalFileMetaForCard(args: {
  isCancelled: () => boolean;
  resolvedPath: string | null;
  needsDefaultProjectPath: boolean;
  effectiveProjectPath: string | null | undefined;
  status: CliStatus;
  scheduleRetry: () => void;
  setGeneratedAt: (n: number | null) => void;
  setFileStatus: (s: FileVerificationStatus) => void;
}): Promise<void> {
  const {
    isCancelled,
    resolvedPath,
    needsDefaultProjectPath,
    effectiveProjectPath,
    status,
    scheduleRetry,
    setGeneratedAt,
    setFileStatus,
  } = args;
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
      onLocalFileMetaHttpError({ isCancelled, status, scheduleRetry, setFileStatus, httpStatus: response.status });
      return;
    }
    const payload = (await response.json()) as Record<string, unknown>;
    if (isCancelled()) return;
    // Any 200 from local-file-meta means the backend resolved + stat'd a real file.
    setFileStatus('exists');
    const rawGenerated = payload.generatedAt;
    if (typeof rawGenerated === 'number' && Number.isFinite(rawGenerated)) {
      setGeneratedAt(Math.trunc(rawGenerated));
    } else if (typeof rawGenerated === 'string' && rawGenerated.trim()) {
      const n = Number(rawGenerated);
      if (Number.isFinite(n)) setGeneratedAt(Math.trunc(n));
    }
  } catch {
    onLocalFileMetaNetworkFailure({ isCancelled, status, scheduleRetry, setGeneratedAt, setFileStatus });
  }
}

export function useLocalGeneratedFileCard(
  file: LocalGeneratedFile,
  projectPath: string | null | undefined,
  status: CliStatus,
) {
  const [isOpening, setIsOpening] = useState(false);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [fileStatus, setFileStatus] = useState<FileVerificationStatus>('checking');
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [defaultProjectPath, setDefaultProjectPath] = useState<string | null>(null);
  const addToast = useToastStore((s) => s.addToast);
  const { badgeLabel, cardTestId, openTestId, openFolderTestId, Icon } = LOCAL_FILE_KIND_UI[file.kind];
  const displayName = useMemo(
    () => (file.name?.trim() ? file.name.trim() : fileNameFromPath(file.path) || '未命名文件'),
    [file.name, file.path],
  );

  const resolvedPath = useMemo(
    () => resolvePresentationPath(file.path, projectPath, defaultProjectPath),
    [defaultProjectPath, file.path, projectPath],
  );
  const resolvedFileFolder = useMemo(
    () => (resolvedPath ? getParentDirectoryPath(resolvedPath) : null),
    [resolvedPath],
  );
  const isAbsoluteFilePath = useMemo(() => isAbsolutePresentationPath(file.path), [file.path]);
  const effectiveProjectPath = useMemo(
    () => (isAbsoluteFilePath ? null : projectPath && projectPath !== 'default' ? projectPath : defaultProjectPath),
    [defaultProjectPath, isAbsoluteFilePath, projectPath],
  );
  const needsDefaultProjectPath = !isAbsoluteFilePath && (!projectPath || projectPath === 'default');
  const canOpenFile = Boolean(resolvedPath) && (!needsDefaultProjectPath || Boolean(effectiveProjectPath));
  const canOpenFolder = Boolean(resolvedFileFolder) && (!needsDefaultProjectPath || Boolean(effectiveProjectPath));
  const supportsSystemOpen = Boolean(resolvedPath && isLocalAgentOpenableExtension(resolvedPath));
  const isOpeningAction = isOpening || isOpeningFolder;

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    void loadDefaultProjectPathForCard({
      isCancelled,
      isAbsoluteFilePath,
      projectPath,
      setDefaultProjectPath,
      setFileStatus,
    });

    return () => {
      cancelled = true;
    };
  }, [isAbsoluteFilePath, projectPath]);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    const runMeta = (): void => {
      void loadLocalFileMetaForCard({
        isCancelled,
        resolvedPath,
        needsDefaultProjectPath,
        effectiveProjectPath,
        status,
        scheduleRetry: () => {
          retryTimer.current = setTimeout(runMeta, 1000);
        },
        setGeneratedAt,
        setFileStatus,
      });
    };

    runMeta();
    return () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      cancelled = true;
    };
  }, [effectiveProjectPath, needsDefaultProjectPath, resolvedPath, status]);

  async function handleOpen(): Promise<void> {
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

  return {
    badgeLabel,
    cardTestId,
    openTestId,
    openFolderTestId,
    Icon,
    displayName,
    resolvedPath,
    fileStatus,
    status,
    generatedAt,
    file,
    canOpenFile,
    canOpenFolder,
    supportsSystemOpen,
    effectiveProjectPath,
    isOpeningAction,
    isOpening,
    isOpeningFolder,
    handleOpen,
    handleOpenFolder,
  };
}

export function formatLocalFileDateLabel(generatedAt: number | null, file: LocalGeneratedFile): string {
  return formatGeneratedDate(generatedAt ?? file.fallbackGeneratedAt ?? null);
}
