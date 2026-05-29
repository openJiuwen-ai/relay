/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿'use client';

import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { QueueEntry } from '@/stores/chat-types';
import { buildQueueInlineSegments, type QueueInlineSegment } from '@/utils/queue-inline-segments';
import { resolveAttachmentIconByFileName } from './ImagePreview';
import { Button } from '../../shared/Button';
import { IconButton } from '../../shared/IconButton';
import { OverflowTooltip } from '../../shared/OverflowTooltip';
import { QueueEditIcon } from './icons/QueueEditIcon';
import { QueueTopIcon } from './icons/QueueTopIcon';
import { QueueDeleteIcon } from './icons/QueueDeleteIcon';

const CLEAR_CONFIRM_WIDTH = 248;
const CLEAR_CONFIRM_GAP = 10;
const VIEWPORT_PADDING = 8;

function renderQueueSegment(segment: QueueInlineSegment, key: string): ReactNode {
  if (segment.kind === 'text') {
    return (
      <span key={key} className="text-[12px] leading-[16px] font-normal text-[var(--text-primary)]">
        {segment.text}
      </span>
    );
  }
  if (segment.kind === 'mention') {
    return (
      <span key={key} className="text-[12px] leading-[16px] font-medium text-[rgb(20,118,255)]">
        {segment.label}
      </span>
    );
  }
  if (segment.kind === 'skill') {
    return (
      <span key={key} className="inline-flex items-center gap-1 align-middle text-[var(--text-accent)]">
        <span
          aria-hidden="true"
          className="inline-block h-[14px] w-[14px] shrink-0"
          style={{
            backgroundColor: 'currentColor',
            maskImage: "url('/icons/menu/skills.svg')",
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
            maskSize: 'contain',
            WebkitMaskImage: "url('/icons/menu/skills.svg')",
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            WebkitMaskSize: 'contain',
          }}
        />
        <span className="text-[12px] leading-[16px]">{segment.label}</span>
      </span>
    );
  }
  return (
    <span
      key={key}
      className="inline-flex items-center h-6 gap-1 rounded-full border border-[rgba(20,118,255,0.7)] bg-[var(--accent-soft)] px-2 py-1 align-middle text-[12px] leading-none text-[var(--text-primary)]"
    >
      {segment.icon ? (
        <img src={segment.icon} alt="" aria-hidden="true" className="h-4 w-4 shrink-0" />
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-accent)]" aria-hidden="true" />
      )}
      <span className="max-w-[120px] truncate">{segment.label}</span>
    </span>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

interface ChatInputQueuePanelProps {
  queuedEntries: QueueEntry[];
  attachmentNamesByEntryId: Record<string, string[]>;
  queueCount: number;
  queueExpanded: boolean;
  queueBusy: boolean;
  queueHighlightedEntryId: string | null;
  listRef: RefObject<HTMLDivElement>;
  onToggleExpanded: () => void;
  onClear: () => void;
  onPinToTop: (entryId: string) => void;
  onEdit: (entryId: string) => void;
  onDelete: (entryId: string) => void;
}

interface ConfirmPosition {
  top: number;
  left: number;
  arrowLeft: number;
}

export function ChatInputQueuePanel({
  queuedEntries,
  attachmentNamesByEntryId,
  queueCount,
  queueExpanded,
  queueBusy,
  queueHighlightedEntryId,
  listRef,
  onToggleExpanded,
  onClear,
  onPinToTop,
  onEdit,
  onDelete,
}: ChatInputQueuePanelProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [confirmPosition, setConfirmPosition] = useState<ConfirmPosition | null>(null);
  const clearConfirmAnchorRef = useRef<HTMLDivElement>(null);
  const clearConfirmRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!showClearConfirm) return;

    const updatePosition = () => {
      const anchor = clearConfirmAnchorRef.current;
      const panel = clearConfirmRef.current;
      if (!anchor) return;
      const anchorRect = anchor.getBoundingClientRect();
      const panelHeight = panel?.getBoundingClientRect().height ?? 124;
      const maxLeft = window.innerWidth - CLEAR_CONFIRM_WIDTH - VIEWPORT_PADDING;
      const preferredLeft = anchorRect.right - CLEAR_CONFIRM_WIDTH;
      const left = clamp(preferredLeft, VIEWPORT_PADDING, maxLeft);
      const preferredTop = anchorRect.top - panelHeight - CLEAR_CONFIRM_GAP;
      const top = Math.max(VIEWPORT_PADDING, preferredTop);
      const anchorCenterX = anchorRect.left + anchorRect.width / 2;
      const arrowLeft = clamp(anchorCenterX - left, 14, CLEAR_CONFIRM_WIDTH - 14);
      setConfirmPosition({ top, left, arrowLeft });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showClearConfirm]);

  useEffect(() => {
    if (!showClearConfirm) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (clearConfirmAnchorRef.current?.contains(target)) return;
      if (clearConfirmRef.current?.contains(target)) return;
      setShowClearConfirm(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowClearConfirm(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showClearConfirm]);

  if (queueCount === 0) return null;

  return (
    <div
      className={`w-full min-w-0 max-w-full overflow-hidden rounded-t-[24px] rounded-b-none border chat-input-shell bg-[var(--surface-panel)] transition-[padding,border-color] duration-200 ${queueExpanded ? 'pb-5' : 'pb-4'}`}
    >
      <div className="flex min-h-[44px] items-center justify-between px-[18px] py-[13px]">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="inline-flex min-w-0 items-center gap-1 rounded-[10px] text-[14px] leading-[22px] font-normal text-[var(--text-primary)] transition-colors"
          aria-expanded={queueExpanded}
          aria-label="展开或收起待执行任务"
        >
          <span>待执行任务({queueCount})</span>
          <svg
            className={`h-4 w-4 shrink-0 text-[var(--text-label-secondary)] transition-transform duration-200 ${queueExpanded ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.167l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.51a.75.75 0 01-1.08 0l-4.25-4.51a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div ref={clearConfirmAnchorRef}>
          {showClearConfirm ? (
            <IconButton
              label="一键清空队列"
              size="sm"
              disabled={queueBusy || queueCount === 0}
              onClick={() => setShowClearConfirm(false)}
              icon={<img src="/icons/icon-clear-all.svg" alt="一键清空" />}
            />
          ) : (
            <OverflowTooltip content="一键清空" forceShow className="inline-flex">
              <IconButton
                label="一键清空队列"
                size="sm"
                disabled={queueBusy || queueCount === 0}
                onClick={() => setShowClearConfirm(true)}
                icon={<img src="/icons/icon-clear-all.svg" alt="一键清空" />}
              />
            </OverflowTooltip>
          )}
        </div>
      </div>

      {showClearConfirm &&
        createPortal(
          <div
            ref={clearConfirmRef}
            className="fixed z-[320] w-[248px]"
            style={
              confirmPosition
                ? { top: `${confirmPosition.top}px`, left: `${confirmPosition.left}px` }
                : { top: '-9999px', left: '-9999px' }
            }
          >
            <div className="relative overflow-tooltip rounded-lg bg-[var(--tooltip-surface)] p-4 text-[var(--tooltip-text)] shadow-[var(--tooltip-shadow)]">
              <div className="flex items-start gap-3">
                <img src="/icons/message-warn.svg" alt="" aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p className="text-[12px] leading-5">确认要一键清空所有执行任务吗？</p>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button variant="default" className="!py-[3px] !px-[20px] !min-w-[62px] !h-[24px]" onClick={() => setShowClearConfirm(false)}>
                  取消
                </Button>
                <Button
                  className="!py-[3px] !px-[20px] !min-w-[62px] !h-[24px]"
                  disabled={queueBusy}
                  onClick={() => {
                    setShowClearConfirm(false);
                    onClear();
                  }}
                >
                  确定
                </Button>
              </div>
              <span
                aria-hidden="true"
                className="absolute top-full h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-[var(--tooltip-surface)]"
                style={{ left: `${confirmPosition?.arrowLeft ?? CLEAR_CONFIRM_WIDTH - 20}px` }}
              />
            </div>
          </div>,
          document.body,
        )}

      {queueExpanded && (
        <div className="border-t border-[var(--border-default)]/70 pt-1 px-[10px] pb-[10px]">
          <div ref={listRef} className="max-h-[188px] overflow-y-auto">
            {queuedEntries.map((entry, index) => {
                const inlineSegments = buildQueueInlineSegments(entry.content);
                const attachmentNames = attachmentNamesByEntryId[entry.id] ?? entry.attachmentNames ?? [];
                const tooltipContent =
                  attachmentNames.length > 0 ? `${entry.content} ${attachmentNames.join(' ')}` : entry.content;
                return (
                  <div
                    key={entry.id}
                    className={`group/queue-row h-[34px] relative mt-1 first:mt-0 flex min-h-[34px] min-w-0 items-center rounded-[8px] p-2 transition-[background-color,box-shadow,transform,opacity] duration-200 ${queueHighlightedEntryId === entry.id ? 'bg-[rgba(20,118,255,0.08)] shadow-[0_0_0_1px_rgba(20,118,255,0.16)]' : 'hover:bg-[var(--chat-queue-row-hover-bg)]'}`}
                  >
                    <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4 text-[var(--text-label-secondary)]" fill="none">
                      <rect id="time" width="24.000000" height="24.000000" x="0.000000" y="0.000000" />
                      <path
                        id="path"
                        d="M12 1.5C6.15 1.5 1.5 6.15 1.5 12C1.5 17.85 6.15 22.5 12 22.5C17.85 22.5 22.5 17.85 22.5 12C22.5 6.15 17.85 1.5 12 1.5ZM12 21C7.05 21 3 16.95 3 12C3 7.05 7.05 3 12 3C16.95 3 21 7.05 21 12C21 16.95 16.95 21 12 21ZM15 12.6C15 13.2 14.7 13.5 14.25 13.5L11.55 13.5C10.95 13.5 10.5 13.05 10.5 12.45L10.5 8.25C10.5 7.8 10.8 7.5 11.25 7.5C11.7 7.5 12 7.8 12 8.25L12 12L14.25 12C14.55 12 14.85 12.3 15 12.6Z"
                        fill="currentColor"
                        fillRule="nonzero"
                      />
                    </svg>
                    <OverflowTooltip content={tooltipContent} className="mr-3 min-w-0 max-w-full flex-1 overflow-hidden">
                      <div className="block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                        {inlineSegments.map((segment, segIndex) =>
                          renderQueueSegment(segment, `${entry.id}-${segIndex}`),
                        )}
                        {attachmentNames.map((fileName, attachmentIndex) => (
                          <span
                            key={`${entry.id}-attachment-${attachmentIndex}`}
                            className="ml-2 inline-flex items-center gap-1 align-middle text-[12px] leading-[16px] font-normal text-[var(--text-primary)]"
                          >
                            <img
                              src={resolveAttachmentIconByFileName(fileName)}
                              alt=""
                              aria-hidden="true"
                              className="h-4 w-4 shrink-0"
                            />
                            <span>{fileName}</span>
                          </span>
                        ))}
                      </div>
                    </OverflowTooltip>
                    <div className="flex w-[102px] shrink-0 items-center justify-end gap-1">
                      {index > 0 ? (
                        <OverflowTooltip content="置顶" forceShow className="inline-flex">
                          <IconButton
                            label="置顶"
                            size="sm"
                            disabled={queueBusy}
                            onClick={() => onPinToTop(entry.id)}
                            className={`opacity-0 pointer-events-none group-hover/queue-row:pointer-events-auto group-hover/queue-row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 hover:bg-[var(--chat-queue-action-hover-bg)] focus-visible:bg-[var(--chat-queue-action-hover-bg)] ${queueHighlightedEntryId === entry.id ? 'text-[var(--text-accent)]' : ''}`}
                            icon={<QueueTopIcon className="h-4 w-4" />}
                          />
                        </OverflowTooltip>
                      ) : (
                        <span className="inline-flex h-6 w-6 shrink-0" aria-hidden="true" />
                      )}
                      <OverflowTooltip content="编辑" forceShow className="inline-flex">
                        <IconButton
                          label="编辑"
                          size="sm"
                          disabled={queueBusy}
                          onClick={() => onEdit(entry.id)}
                          className="opacity-0 pointer-events-none group-hover/queue-row:pointer-events-auto group-hover/queue-row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 hover:bg-[var(--chat-queue-action-hover-bg)] focus-visible:bg-[var(--chat-queue-action-hover-bg)]"
                          icon={<QueueEditIcon className="h-4 w-4" />}
                        />
                      </OverflowTooltip>
                      <OverflowTooltip content="删除" forceShow className="inline-flex">
                        <IconButton
                          label="删除"
                          size="sm"
                          disabled={queueBusy}
                          onClick={() => onDelete(entry.id)}
                          className="opacity-0 pointer-events-none group-hover/queue-row:pointer-events-auto group-hover/queue-row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 hover:bg-[var(--chat-queue-action-hover-bg)] focus-visible:bg-[var(--chat-queue-action-hover-bg)]"
                          icon={<QueueDeleteIcon className="h-4 w-4" />}
                        />
                      </OverflowTooltip>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
