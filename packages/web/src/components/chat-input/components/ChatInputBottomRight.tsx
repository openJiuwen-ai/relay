/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useEffect, useState, type MutableRefObject, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { ChatInputActionButton } from './ChatInputActionButton';
import { MaskIcon } from '@/components/shared/MaskIcon';
import { OverflowTooltip } from '@/components/shared/OverflowTooltip';
import { ICON_BUTTON_CLASS, MAX_ATTACHMENT_FILES } from '../utils/constants';
import type { WorkspaceMenuItem } from '../types';
import { useBottomRightActions } from '../hooks/useBottomRightActions';

interface ChatInputBottomRightProps {
  fileInputRef: RefObject<HTMLInputElement>;
  setWorkspaceFilter: Dispatch<SetStateAction<string>>;
  closeMenus: () => void;
  folderSelectionEnabled: boolean;
  selectedFolderTitle: string | null;
  folderButtonLabel: string;
  shouldShowFolderTooltip: boolean;
  folderBtnRef: RefObject<HTMLButtonElement>;
  menuRef: RefObject<HTMLDivElement>;
  workspaceSearchInputRef: RefObject<HTMLInputElement>;
  workspaceFilter: string;
  showWorkspaceMenu: boolean;
  workspaceMenuItems: WorkspaceMenuItem[];
  selectedIdx: number;
  setSelectedIdx: Dispatch<SetStateAction<number>>;
  workspaceOptionRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  isFolderButtonDisabled: boolean;
  queueAwareDisabled: boolean;
  sendTemporarilyDisabled: boolean;
  imagesCount: number;
  hasActiveInvocation?: boolean;
  inputTrimmed: boolean;
  queueSendDisabled: boolean;
  queueCount: number;
  onWorkspaceClick: () => void;
  onWorkspaceSelect: (item: WorkspaceMenuItem) => void;
  onTranscript: (text: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onQueueSend: () => void;
}

export function ChatInputBottomRight({
  fileInputRef,
  setWorkspaceFilter,
  closeMenus,
  folderSelectionEnabled,
  selectedFolderTitle,
  folderButtonLabel,
  shouldShowFolderTooltip,
  folderBtnRef,
  menuRef,
  workspaceSearchInputRef,
  workspaceFilter,
  showWorkspaceMenu,
  workspaceMenuItems,
  selectedIdx,
  setSelectedIdx,
  workspaceOptionRefs,
  isFolderButtonDisabled,
  queueAwareDisabled,
  sendTemporarilyDisabled,
  imagesCount,
  hasActiveInvocation,
  inputTrimmed,
  queueSendDisabled,
  queueCount,
  onWorkspaceClick,
  onWorkspaceSelect,
  onTranscript,
  onSend,
  onStop,
  onQueueSend,
}: ChatInputBottomRightProps) {
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleVoiceState = (event: Event) => {
      const customEvent = event as CustomEvent<{ state?: string }>;
      setIsVoiceRecording(customEvent.detail?.state === 'recording');
    };
    window.addEventListener('office-claw:voice-state', handleVoiceState as EventListener);
    return () => {
      window.removeEventListener('office-claw:voice-state', handleVoiceState as EventListener);
    };
  }, []);

  const { handleAttachClick, handleWorkspaceFilterChange, handleWorkspaceSearchKeyDown } = useBottomRightActions({
    fileInputRef,
    workspaceMenuItems,
    selectedIdx,
    setSelectedIdx,
    setWorkspaceFilter,
    closeMenus,
    selectWorkspaceMenuItem: onWorkspaceSelect,
  });

  return (
    <div className={isVoiceRecording ? `absolute inset-x-0 bottom-0 z-30 flex w-full justify-center` : `flex items-center`}>
      {!isVoiceRecording && folderSelectionEnabled && (
        <div className="relative mr-2 flex items-center">
          <OverflowTooltip
            content={selectedFolderTitle?.trim() || folderButtonLabel}
            forceShow={shouldShowFolderTooltip}
            copyable={shouldShowFolderTooltip}
            className="flex items-center"
          >
            <button
              ref={folderBtnRef}
              type="button"
              data-testid="folder-select-button"
              onClick={onWorkspaceClick}
              disabled={isFolderButtonDisabled}
              className="ui-button-default inline-flex h-8 min-w-0 max-w-[160px] items-center gap-1 rounded-[16px] px-3 text-xs shadow-none"
            >
              <MaskIcon src="/icons/chart/folder.svg" testId="folder-select-icon" className='h-6 w-6 shrink-0 text-[var(--mask-icon)]' />
              <span className="truncate">{folderButtonLabel}</span>
              <MaskIcon src="/icons/chevron-right.svg" className="h-3.5 w-3.5 shrink-0 rotate-90 text-[var(--text-label-secondary)]" />
            </button>
          </OverflowTooltip>
          {showWorkspaceMenu && (
            <div
              ref={menuRef}
              data-testid="workspace-select-menu"
              className="ui-overlay-card absolute bottom-full left-0 mb-2 z-[200] flex w-[200px] max-h-[302px] flex-col overflow-hidden rounded-xl border border-[var(--overlay-border)] px-2 py-2 shadow-[var(--overlay-shadow)]"
            >
              <div className="px-1 pt-0 pb-2">
                <div className="relative">
                  <svg
                    className="pointer-events-none absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-label-secondary)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                  <input
                    ref={workspaceSearchInputRef}
                    data-testid="workspace-select-search"
                    value={workspaceFilter}
                    onChange={(e) => handleWorkspaceFilterChange(e.target.value)}
                    onKeyDown={handleWorkspaceSearchKeyDown}
                    placeholder="请输入关键字搜索"
                    className="ui-input ui-input-underline w-full py-1 pl-6 pr-0 text-[12px]"
                  />
                </div>
              </div>
              <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:auto]">
                {workspaceMenuItems.map((item, i) => {
                  const label =
                    item.kind === 'empty'
                      ? '从空文件夹开始'
                      : item.kind === 'open'
                        ? '打开新文件夹'
                        : item.option.name;
                  const detail = item.kind === 'workspace' ? item.option.title?.trim() || item.option.path : null;
                  const tooltipContent = detail || label;
                  return (
                    <button
                      key={item.kind === 'workspace' ? `${item.option.path}:${item.option.name}` : item.kind}
                      type="button"
                      data-testid={
                        item.kind === 'empty'
                          ? 'workspace-menu-item-empty'
                          : item.kind === 'open'
                            ? 'workspace-menu-item-open'
                            : `workspace-menu-item-${i}`
                      }
                      ref={(node) => {
                        workspaceOptionRefs.current[i] = node;
                      }}
                      className={`flex h-12 w-full items-center rounded-[6px] px-2 py-[6px] text-left text-[12px] font-normal text-[var(--overlay-text)] transition-colors ${
                        i === selectedIdx
                          ? 'bg-[var(--overlay-item-hover-bg)]'
                          : 'hover:bg-[var(--overlay-item-hover-bg)]'
                      }`}
                      onMouseEnter={() => setSelectedIdx(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onWorkspaceSelect(item);
                      }}
                    >
                      <OverflowTooltip
                        content={tooltipContent}
                        forceShow={item.kind === 'workspace'}
                        copyable={item.kind === 'workspace'}
                        className="min-w-0 flex-1"
                      >
                        <span className="block min-w-0">
                          <span className="block truncate">{label}</span>
                          {detail && <span className="block truncate text-[10px] text-[var(--text-label-secondary)]">{detail}</span>}
                        </span>
                      </OverflowTooltip>
                    </button>
                  );
                })}
                {workspaceMenuItems.length === 2 && (
                  <div className="px-2 py-2 text-xs text-[var(--text-label-secondary)]">无匹配工作空间</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!isVoiceRecording && (
        <OverflowTooltip content="选择附件" forceShow className="inline-flex">
          <button
            type="button"
            data-testid="attach-file-button"
            onClick={handleAttachClick}
            disabled={queueAwareDisabled || sendTemporarilyDisabled || imagesCount >= MAX_ATTACHMENT_FILES}
            className={ICON_BUTTON_CLASS}
            aria-label="上传附件"
          >
            <MaskIcon name="attach" className="h-8 w-8 text-[var(--mask-icon)]" />
          </button>
        </OverflowTooltip>
      )}

      <ChatInputActionButton
        onTranscript={onTranscript}
        onSend={onSend}
        onStop={onStop}
        onQueueSend={onQueueSend}
        disabled={queueAwareDisabled}
        sendDisabled={sendTemporarilyDisabled || queueSendDisabled}
        hasActiveInvocation={hasActiveInvocation}
        hasText={inputTrimmed}
        queueLimitReached={queueSendDisabled}
        showQueueTooltip={queueCount > 0}
      />
    </div>
  );
}

