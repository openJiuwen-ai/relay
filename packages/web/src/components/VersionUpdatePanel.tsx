/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { useEffect, useRef } from 'react';
import { type DownloadProgress, useDownloadStore } from '@/stores/downloadStore';
import { apiFetch } from '@/utils/api-client';
import { Button } from './shared/Button';
import { IconButton } from './shared/IconButton';

export interface VersionInfo {
  curversion: string;
  lastversion: string;
  description: string;
  downloadUrl?: string;
  download_url?: string;
}

export interface VersionUpdatePanelProps {
  versionInfo?: VersionInfo | null;
  /** When false, clear polling / download UI state (same as closing the modal). */
  active: boolean;
  /** e.g. close modal — optional for embedded usage */
  onDismiss?: () => void;
  variant?: 'modal' | 'embedded';
}

const newVersionTitleStyle = {
  background:
    'linear-gradient(160deg, rgba(249, 146, 53, 1), rgba(250, 106, 52, 1) 50%, rgba(253, 77, 99, 1) 72%, rgba(248, 68, 51, 1) 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  textFillColor: 'transparent',
  fontFamily: '.PingFang SC',
  fontSize: '20px',
  fontWeight: 700,
  lineHeight: '30px',
} as React.CSSProperties & { textFillColor: string };

function normalizeVersion(version: string): number[] {
  return version
    .trim()
    .replace(/^[^\d]*/, '')
    .split(/[.\-+_]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(a: string, b: string): number {
  const aParts = normalizeVersion(a);
  const bParts = normalizeVersion(b);
  const maxLen = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLen; i += 1) {
    const aVal = aParts[i] ?? 0;
    const bVal = bParts[i] ?? 0;
    if (aVal > bVal) return 1;
    if (aVal < bVal) return -1;
  }

  return 0;
}

const VersionUpdatePanel: React.FC<VersionUpdatePanelProps> = ({
  active,
  onDismiss,
  versionInfo,
  variant = 'modal',
}) => {
  const downloadState = useDownloadStore();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const resetRef = useRef(downloadState.reset);
  const taskIdRef = useRef(downloadState.taskId);
  const setTaskIdRef = useRef(downloadState.setTaskId);
  const updateProgressRef = useRef(downloadState.updateProgress);

  resetRef.current = downloadState.reset;
  taskIdRef.current = downloadState.taskId;
  setTaskIdRef.current = downloadState.setTaskId;
  updateProgressRef.current = downloadState.updateProgress;

  const currentVersion = versionInfo?.curversion ?? '';
  const hasNewVersion =
    !!versionInfo?.lastversion &&
    !!versionInfo?.curversion &&
    compareVersions(versionInfo.lastversion, currentVersion) > 0;

  const iconAlignmentClassName =
    variant === 'embedded' || (variant === 'modal' && hasNewVersion) ? 'justify-start' : 'justify-center';
  const contentAlignmentClassName =
    variant === 'embedded' || (variant === 'modal' && hasNewVersion) ? 'text-left' : 'text-center';

  useEffect(() => {
    if (!active || !versionInfo?.lastversion || !hasNewVersion) return;

    const taskId = `version-${versionInfo.lastversion}`;
    if (taskIdRef.current && taskIdRef.current !== taskId) {
      resetRef.current();
    }

    if (!hasNewVersion) return;

    const checkDownloadStatus = async (tid: string) => {
      try {
        const res = await apiFetch(`/api/download/status?taskId=${tid}`);
        if (res.ok) {
          const progress = (await res.json()) as DownloadProgress;
          setTaskIdRef.current(tid);
          updateProgressRef.current(progress);
        }
      } catch (error) {
        console.error('查询下载状态失败:', error);
      }
    };

    void checkDownloadStatus(taskId);
  }, [active, hasNewVersion, versionInfo?.lastversion, versionInfo?.curversion]);

  useEffect(() => {
    if (!active) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      resetRef.current();
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    if (hasNewVersion) return;
    if (downloadState.progress.status === 'idle' && !downloadState.taskId) return;
    resetRef.current();
  }, [active, hasNewVersion, downloadState.progress.status, downloadState.taskId]);

  useEffect(() => {
    if (downloadState.progress.status !== 'downloading' || !downloadState.taskId) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    if (pollIntervalRef.current) return;

    const pollDownloadProgress = async () => {
      try {
        const res = await apiFetch(`/api/download/status?taskId=${downloadState.taskId}`);
        if (res.ok) {
          const progress = (await res.json()) as DownloadProgress;
          updateProgressRef.current(progress);

          if (progress.status === 'success' || progress.status === 'error' || progress.status === 'cancelled') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        }
      } catch (error) {
        console.error('查询下载进度失败:', error);
      }
    };

    pollIntervalRef.current = setInterval(pollDownloadProgress, 1000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [downloadState.progress.status, downloadState.taskId]);

  const handleDownload = async () => {
    const taskId = `version-${versionInfo?.lastversion || 'latest'}`;

    downloadState.setTaskId(taskId);
    downloadState.setLoading(true);

    try {
      const res = await apiFetch('/api/download/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });

      if (res.ok) {
        const progress = (await res.json()) as DownloadProgress;
        downloadState.updateProgress(progress);
      } else {
        const error = await res.json();
        downloadState.updateProgress({
          status: 'error',
          progress: 0,
          totalBytes: 0,
          receivedBytes: 0,
          fileName: '',
          filePath: null,
          errorMessage: error.error || '启动下载失败',
          startTime: null,
          endTime: null,
        });
      }
    } catch (error) {
      downloadState.updateProgress({
        status: 'error',
        progress: 0,
        totalBytes: 0,
        receivedBytes: 0,
        fileName: '',
        filePath: null,
        errorMessage: error instanceof Error ? error.message : '启动下载失败',
        startTime: null,
        endTime: null,
      });
    }
  };

  const handleDismiss = () => {
    if (downloadState.progress.status === 'success' || downloadState.progress.status === 'error') {
      downloadState.reset();
    }
    onDismiss?.();
  };

  const openDownloadFile = async () => {
    if (!downloadState.taskId) return;

    downloadState.setInstalling();

    try {
      const res = await apiFetch(`/api/download/open?taskId=${downloadState.taskId}`, { method: 'POST' });
      if (res.ok) {
        downloadState.reset();
        onDismiss?.();
      }
    } catch (error) {
      console.error('打开文件失败:', error);
      downloadState.updateProgress({
        ...downloadState.progress,
        status: 'error',
        errorMessage: '打开安装程序失败',
      });
    }
  };

  const renderButtonArea = () => {
    if (!hasNewVersion) return null;

    if (downloadState.progress.status === 'downloading') {
      return (
        <div className="text-left w-full flex justify-end">
          <Button size="lg" disabled>
            更新中
          </Button>
        </div>
      );
    }

    if (downloadState.progress.status === 'installing') {
      return (
        <div className="text-left">
          <Button size="sm" disabled>
            安装中
          </Button>
        </div>
      );
    }

    if (downloadState.progress.status === 'success') {
      return (
        <div className="text-left w-full flex justify-end">
          <Button size="lg" onClick={openDownloadFile}>
            重启更新
          </Button>
        </div>
      );
    }

    if (downloadState.progress.status === 'error') {
      return (
        <div className="flex gap-3 justify-start">
          <Button variant="default" size="sm" onClick={handleDismiss}>
            关闭
          </Button>
          <Button
            size="sm"
            onClick={() => {
              downloadState.reset();
              void handleDownload();
            }}
          >
            重试
          </Button>
        </div>
      );
    }

    return (
      <div className="flex w-full flex-wrap justify-end">
        <Button size="lg" data-testid="version-update-confirm" onClick={() => void handleDownload()}>
          立即更新
        </Button>
      </div>
    );
  };

  const iconMb = variant === 'modal' ? 'mb-8' : 'mb-4';
  const lobsterClass = variant === 'modal' ? 'h-[64px] w-[64px]' : 'h-[56px] w-[56px]';

  const titleBlock = (
    <>
      <div className={`flex ${iconAlignmentClassName} ${iconMb}`}>
        <img src="/images/lobster.svg" alt="版本更新" className={`${lobsterClass} object-contain`} />
      </div>

      <div className="mb-1">
        {hasNewVersion && downloadState.progress.status === 'error' ? (
          <span data-testid="version-update-title" style={newVersionTitleStyle}>
            下载失败
          </span>
        ) : hasNewVersion && downloadState.progress.status === 'success' ? (
          <span data-testid="version-update-title" style={newVersionTitleStyle}>
            更新已就绪
          </span>
        ) : hasNewVersion ? (
          <span data-testid="version-update-title" style={newVersionTitleStyle}>
            发现新版本V{versionInfo?.lastversion}
          </span>
        ) : (
          <span
            data-testid="version-update-title"
            className="text-[20px] font-bold leading-[30px] text-[var(--text-primary)]"
          >
            暂无新版本
          </span>
        )}
      </div>

      <div
        className={`mb-4 text-[12px] leading-[18px] text-[var(--text-secondary)] ${variant === 'modal' && !hasNewVersion ? 'text-center' : ''}`}
      >
        {hasNewVersion && downloadState.progress.status === 'success' ? (
          <>新版本v{versionInfo?.lastversion}已下载完成，重启应用即可完成更新</>
        ) : (
          <>当前版本V{currentVersion || '-'}</>
        )}
      </div>
    </>
  );

  const descriptionBlock = (
    <>
      {hasNewVersion && versionInfo ? (
        <div className={`mb-8 min-h-[226px] max-h-[252px] overflow-y-auto rounded-2xl border border-[#DBDBDB] p-4 text-left text-sm ${ downloadState.progress.status === 'downloading' ? 'min-h-[152px]' : ''}`}>
          <pre className="whitespace-pre-wrap font-sans">{versionInfo.description}</pre>
        </div>
      ) : null}

      {hasNewVersion && downloadState.progress.status === 'downloading' ? (
        <div className="mb-6 text-left w-full ">
          <div className="mb-4 text-[12px]" style={{ color: 'rgb(128, 128, 128)' }}>
            下载中......可关闭后台下载
          </div>
          <div className="flex items-center gap-3">
            <div className="h-[4px] flex-1 rounded-full" style={{ backgroundColor: 'rgb(230, 230, 230)' }}>
              <div
                className="h-[4px] rounded-full transition-all duration-300"
                style={{
                  width: `${downloadState.progress.progress}%`,
                  backgroundColor: 'rgb(92, 179, 0)',
                }}
              />
            </div>
            <span className="text-sm text-[var(--modal-text-muted)]">{downloadState.progress.progress}%</span>
          </div>
        </div>
      ) : null}
    </>
  );

  const buttons = renderButtonArea();

  if (variant === 'embedded' && !hasNewVersion) {
    return (
      <section
        data-testid="user-settings-version-update"
        className="flex w-full h-[stretch] flex-col items-center justify-center px-6 text-center overflow-hidden"
      >
        <div className="mb-[32px] flex justify-center">
          <img src="/images/lobster.svg" alt="" className="h-[56px] w-[56px] object-contain" aria-hidden />
        </div>
        <div
          className="text-center w-full text-[20px] font-bold leading-[30px] text-[var(--text-primary)]"
          data-testid="version-update-title"
        >
          暂无新版本
        </div>
        <div className="mt-2 text-[12px] leading-[18px] text-[var(--text-secondary)]">
          当前版本V{currentVersion || '-'}
        </div>
      </section>
    );
  }

  if (variant === 'embedded') {
    return (
      <section data-testid="user-settings-version-update" className="text-left  flex  flex-col items-center content-center">
        {titleBlock}
        {descriptionBlock}
        {buttons}
      </section>
    );
  }

  return (
    <>
      <IconButton
        label="关闭"
        size="sm"
        className="absolute right-5 top-5 text-[var(--modal-close-icon)] transition-colors hover:text-[var(--modal-close-icon-hover)]"
        onClick={handleDismiss}
        icon={
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        }
      />

      <div data-testid="version-update-content" className={`px-8 pt-8 pb-0 ${contentAlignmentClassName}`}>
        {titleBlock}
      </div>

      <div className="px-8 pb-0">{descriptionBlock}</div>

      <div className="px-8 pb-8">{buttons}</div>
    </>
  );
};

export default VersionUpdatePanel;
