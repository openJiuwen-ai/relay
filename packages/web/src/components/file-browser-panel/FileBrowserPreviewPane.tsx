/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { LOCAL_FILE_KIND_UI } from '@/components/cli-output/cli-output-block/CliOutputFileKindIcons';
import type { LocalGeneratedFile } from '@/components/cli-output/local-generated-files';
import { comparableLocalPathKey, findLocalPptLinkedToPptPages, resolvedLocalPreviewMatchesSendFilePath } from '@/components/cli-output/local-generated-files';
import { PreviewPanelShell } from '@/components/preview-panels/PreviewPanelShell';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { FileBrowserCodeContent } from './FileBrowserCodeContent';
import { FileBrowserDocxContent } from './FileBrowserDocxContent';
import { FileBrowserExplorerContent } from './FileBrowserExplorerContent';
import { FileBrowserPdfContent } from './FileBrowserPdfContent';
import { FileBrowserPptContent } from './FileBrowserPptContent';
import { FileBrowserPreviewShellHeaderActionsProvider } from './FileBrowserPreviewShellHeaderActionsContext';
import { FileBrowserTextContent } from './FileBrowserTextContent';
import { FileBrowserXlsxContent } from './FileBrowserXlsxContent';
import type { PanelTab } from './file-browser-panel-types';

function FallbackFileView({ file }: { file: LocalGeneratedFile }) {
  const { Icon } = LOCAL_FILE_KIND_UI[file.kind];
  const [openState, setOpenState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleOpen = useCallback(async () => {
    if (file.isVirtual) return;
    setOpenState('loading');
    setErrorMsg('');
    try {
      const res = await apiFetch('/api/projects/open-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: file.path }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setErrorMsg(body?.error ?? `打开失败（HTTP ${res.status}）`);
        setOpenState('error');
      } else {
        setOpenState('idle');
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '打开失败');
      setOpenState('error');
    }
  }, [file.isVirtual, file.path]);

  if (file.isVirtual) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="max-w-sm text-[13px] text-gray-500">该条目为生成过程占位，暂不可用系统程序打开。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <Icon width={48} height={48} />
      <p className="max-w-[200px] truncate text-[15px] font-medium text-gray-700">{file.name}</p>
      <button
        type="button"
        onClick={handleOpen}
        disabled={openState === 'loading'}
        className="rounded-md bg-blue-50 px-4 py-1.5 text-[13px] text-blue-600 transition-colors hover:bg-blue-100 disabled:opacity-50"
      >
        {openState === 'loading' ? '打开中…' : '用默认程序打开'}
      </button>
      {openState === 'error' && <p className="max-w-xs text-center text-[12px] text-red-500">{errorMsg}</p>}
    </div>
  );
}

export interface FileBrowserPreviewBodyProps {
  selectedFile: LocalGeneratedFile | null;
  matchedPptSession: { pagesDir: string } | null;
  threadId: string;
  resolvedProjectPath: string | undefined;
}

export function FileBrowserPreviewBody({
  selectedFile,
  matchedPptSession,
  threadId,
  resolvedProjectPath,
}: FileBrowserPreviewBodyProps) {
  if (!selectedFile) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-[13px] text-[#BFBFBF]">
        请从列表中选择文件进行预览
      </div>
    );
  }

  const { kind, path, name } = selectedFile;

  if (kind === 'ppt') {
    return matchedPptSession ? (
      <FileBrowserPptContent pagesDir={matchedPptSession.pagesDir} threadId={threadId} />
    ) : (
      <FallbackFileView file={selectedFile} />
    );
  }

  if (kind === 'markdown' || kind === 'html') {
    return (
      <FileBrowserTextContent
        path={path}
        kind={kind}
        displayName={name}
        threadId={threadId}
        projectPath={resolvedProjectPath}
      />
    );
  }

  if (kind === 'pdf') {
    return (
      <FileBrowserPdfContent path={path} displayName={name} threadId={threadId} projectPath={resolvedProjectPath} />
    );
  }

  if (kind === 'docx') {
    return (
      <FileBrowserDocxContent path={path} displayName={name} threadId={threadId} projectPath={resolvedProjectPath} />
    );
  }

  if (kind === 'xlsx') {
    return (
      <FileBrowserXlsxContent path={path} displayName={name} threadId={threadId} projectPath={resolvedProjectPath} />
    );
  }

  if (kind === 'code' || kind === 'txt') {
    return (
      <FileBrowserCodeContent path={path} displayName={name} threadId={threadId} projectPath={resolvedProjectPath} />
    );
  }

  return <FallbackFileView file={selectedFile} />;
}

interface FileBrowserPreviewPaneProps {
  isNarrow: boolean;
  selectedFile: LocalGeneratedFile | null;
  artifacts: LocalGeneratedFile[];
  threadId: string;
  projectPath: string;
  activeTab: PanelTab;
  onSelectFile: (path: string) => void;
  onClose: () => void;
}

export function FileBrowserPreviewPane({
  isNarrow,
  selectedFile,
  artifacts,
  threadId,
  projectPath,
  activeTab,
  onSelectFile,
  onClose,
}: FileBrowserPreviewPaneProps) {
  const pptSessions = useChatStore((s) => s.pptStudioSessions);
  const setActivePptPagesDir = useChatStore((s) => s.setActivePptPagesDir);
  /** 窄屏：浮动文件列表打开态，默认关闭 */
  const [narrowPickerOpen, setNarrowPickerOpen] = useState(false);
  /** 与预览区标题行（PreviewPanelShell header）右侧对齐的操作区 */
  const [previewShellExtraHeader, setPreviewShellExtraHeader] = useState<ReactNode>(null);

  const resolvedProjectPath = projectPath && projectPath !== 'default' ? projectPath : undefined;

  useEffect(() => {
    if (!selectedFile) setPreviewShellExtraHeader(null);
  }, [selectedFile]);

  const matchedPptSession = (() => {
    if (!selectedFile || selectedFile.kind !== 'ppt') return null;
    const sessions = Object.values(pptSessions).filter((s) => s.threadId === threadId);

    if (selectedFile.isVirtual && selectedFile.pptPagesDir) {
      const dirKey = comparableLocalPathKey(selectedFile.pptPagesDir);
      return sessions.find((s) => comparableLocalPathKey(s.pagesDir) === dirKey) ?? null;
    }

    return (
      sessions.find((s) => {
        const linked = findLocalPptLinkedToPptPages(artifacts, s.pagesDir, s.deckTitle);
        return linked && resolvedLocalPreviewMatchesSendFilePath(selectedFile.path, linked.path);
      }) ?? null
    );
  })();

  useEffect(() => {
    if (matchedPptSession?.pagesDir) {
      setActivePptPagesDir(matchedPptSession.pagesDir);
    }
  }, [matchedPptSession?.pagesDir, setActivePptPagesDir]);

  useEffect(() => {
    if (!isNarrow) setNarrowPickerOpen(false);
  }, [isNarrow]);

  useEffect(() => {
    if (!isNarrow || !narrowPickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNarrowPickerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isNarrow, narrowPickerOpen]);

  const title = selectedFile?.name ?? '文件预览';

  const handleSelectInNarrowPicker = useCallback(
    (path: string) => {
      onSelectFile(path);
      setNarrowPickerOpen(false);
    },
    [onSelectFile],
  );

  const narrowTitleTrigger = isNarrow ? (
    <button
      type="button"
      onClick={() => setNarrowPickerOpen((o) => !o)}
      className="flex w-full min-w-0 max-w-full items-center justify-start gap-1.5 rounded-md py-0.5 text-left outline-none transition-colors hover:bg-[#F9F9F9]"
      title={title}
      aria-expanded={narrowPickerOpen}
      aria-haspopup="listbox"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 text-[#191919] transition-transform ${narrowPickerOpen ? 'bg-black/[0.04] rounded' : ''}`}
        aria-hidden
      >
        <title>{narrowPickerOpen ? '收起文件列表' : '展开文件列表'}</title>
        <path
          d="M2.50008 3.83334C2.96008 3.83334 3.33341 3.46334 3.33341 3.00001C3.33341 2.54001 2.96008 2.16667 2.50008 2.16667C2.03675 2.16667 1.66675 2.54001 1.66675 3.00001C1.66675 3.46334 2.03675 3.83334 2.50008 3.83334ZM5.66675 2.33334L14.0001 2.33334C14.3667 2.33334 14.6667 2.63001 14.6667 3.00001C14.6667 3.36667 14.3667 3.66667 14.0001 3.66667L5.66675 3.66667C5.29675 3.66667 5.00008 3.36667 5.00008 3.00001C5.00008 2.63001 5.29675 2.33334 5.66675 2.33334ZM2.50008 8.83334C2.96008 8.83334 3.33341 8.46334 3.33341 8.00001C3.33341 7.54001 2.96008 7.16667 2.50008 7.16667C2.03675 7.16667 1.66675 7.54001 1.66675 8.00001C1.66675 8.46334 2.03675 8.83334 2.50008 8.83334ZM5.66675 7.33334L14.0001 7.33334C14.3667 7.33334 14.6667 7.63 14.6667 8.00001C14.6667 8.36667 14.3667 8.66667 14.0001 8.66667L5.66675 8.66667C5.29675 8.66667 5.00008 8.36667 5.00008 8.00001C5.00008 7.63 5.29675 7.33334 5.66675 7.33334ZM2.50008 13.8333C2.96008 13.8333 3.33341 13.4633 3.33341 13C3.33341 12.54 2.96008 12.1667 2.50008 12.1667C2.03675 12.1667 1.66675 12.54 1.66675 13C1.66675 13.4633 2.03675 13.8333 2.50008 13.8333ZM5.66675 12.3333L14.0001 12.3333C14.3667 12.3333 14.6667 12.63 14.6667 13C14.6667 13.3667 14.3667 13.6667 14.0001 13.6667L5.66675 13.6667C5.29675 13.6667 5.00008 13.3667 5.00008 13C5.00008 12.63 5.29675 12.3333 5.66675 12.3333Z"
          fill="currentColor"
          fillRule="evenodd"
        />
      </svg>
      <span className="min-w-0 shrink truncate text-[14px] font-semibold leading-5 text-[#1F1F1F]">{title}</span>
    </button>
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PreviewPanelShell
        panelTestId="file-browser-preview-panel"
        title={title}
        titleContent={narrowTitleTrigger}
        onRequestClose={onClose}
        hideBorderLeft
        hideHeaderActions
        extraHeaderContent={previewShellExtraHeader}
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col">
            <FileBrowserPreviewShellHeaderActionsProvider setPreviewHeaderActions={setPreviewShellExtraHeader}>
              <FileBrowserPreviewBody
                selectedFile={selectedFile}
                matchedPptSession={matchedPptSession}
                threadId={threadId}
                resolvedProjectPath={resolvedProjectPath}
              />
            </FileBrowserPreviewShellHeaderActionsProvider>
          </div>
          {isNarrow && narrowPickerOpen ? (
            <>
              <button
                type="button"
                className="absolute inset-0 z-40 cursor-default bg-transparent"
                aria-label="关闭文件列表"
                onClick={() => setNarrowPickerOpen(false)}
              />
              <div className="absolute left-[14px] right-[14px] top-[8px] z-50 flex max-h-[min(52vh,420px)] min-h-0 flex-col overflow-hidden rounded-xl border border-[#F0F0F0] bg-white p-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                <FileBrowserExplorerContent
                  activeTab={activeTab}
                  artifacts={artifacts}
                  projectPath={projectPath}
                  selectedFilePath={selectedFile?.path ?? null}
                  onSelect={handleSelectInNarrowPicker}
                  flattenActions={true}
                />
              </div>
            </>
          ) : null}
        </div>
      </PreviewPanelShell>
    </div>
  );
}
