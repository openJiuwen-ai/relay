/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAgentData } from '@/hooks/useAgentData';
import { normalizeStoredThreadTitleOrNull } from '@/components/thread-sidebar/thread-title';
import { formatRelativeTime } from '@/components/thread-sidebar/thread-utils';
import { API_URL } from '@/utils/api-client';
import { PickerFieldButton } from './PickerFieldButton';

interface SessionSelectOption {
  value: string;
  label: string;
  participants: string[];
  lastActiveAt: number;
}

function resolveAvatarUrl(rawAvatar?: string): string | null {
  const avatar = rawAvatar?.trim();
  if (!avatar) return null;
  if (avatar.startsWith('/uploads/')) return `${API_URL}${avatar}`;
  return avatar;
}

type DropdownPanelPlacement = 'top' | 'bottom';

interface ResponsiveDropdownLayoutOptions {
  minimumPanelHeight: number;
  reservedHeight: number;
  minScrollableHeight: number;
  defaultPanelHeight: number;
  defaultScrollableHeight: number;
}

function useResponsiveDropdownLayout(
  open: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: ResponsiveDropdownLayoutOptions,
) {
  const [panelPlacement, setPanelPlacement] = useState<DropdownPanelPlacement>('bottom');
  const [panelMaxHeight, setPanelMaxHeight] = useState(options.defaultPanelHeight);
  const [scrollableMaxHeight, setScrollableMaxHeight] = useState(options.defaultScrollableHeight);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePanelLayout = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const gap = 8;
      const safeMargin = 16;
      const spaceBelow = viewportHeight - rect.bottom - gap - safeMargin;
      const spaceAbove = rect.top - gap - safeMargin;
      const openUpward = spaceBelow < options.minimumPanelHeight && spaceAbove > spaceBelow;
      const availableHeight = Math.max(openUpward ? spaceAbove : spaceBelow, options.minimumPanelHeight);

      setPanelPlacement(openUpward ? 'top' : 'bottom');
      setPanelMaxHeight(Math.max(availableHeight, options.minimumPanelHeight));
      setScrollableMaxHeight(Math.max(availableHeight - options.reservedHeight, options.minScrollableHeight));
    };

    updatePanelLayout();
    window.addEventListener('resize', updatePanelLayout);
    return () => window.removeEventListener('resize', updatePanelLayout);
  }, [
    containerRef,
    open,
    options.defaultPanelHeight,
    options.defaultScrollableHeight,
    options.minScrollableHeight,
    options.minimumPanelHeight,
    options.reservedHeight,
  ]);

  return { panelPlacement, panelMaxHeight, scrollableMaxHeight };
}

interface SessionSelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: SessionSelectOption[];
  loading: boolean;
  hasError: boolean;
}

export function SessionSelectField({ value, onChange, options, loading, hasError }: SessionSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const label = options.find((option) => option.value === value)?.label ?? '';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { agents } = useAgentData();
  const { panelPlacement, panelMaxHeight, scrollableMaxHeight } = useResponsiveDropdownLayout(open, containerRef, {
    minimumPanelHeight: 180,
    reservedHeight: 16,
    minScrollableHeight: 120,
    defaultPanelHeight: 280,
    defaultScrollableHeight: 264,
  });

  const updatePanelPosition = useCallback(() => {
    if (!open) return;
    const trigger = containerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPanelPosition({
      top: panelPlacement === 'top' ? rect.top - 8 : rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }, [open, panelPlacement]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPosition(null);
      return;
    }
    updatePanelPosition();
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const handleViewportChange = () => updatePanelPosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, [open]);

  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const fallbackAvatar =
    resolveAvatarUrl(
      agents.find((agent) => agent.id.toLowerCase() === 'office')?.avatar ??
      agents.find((agent) => agent.id.toLowerCase() === 'jiuwenclaw')?.avatar,
    ) ?? '/avatars/assistant.svg';
  const displayOptions = useMemo(
    () =>
      options.map((option) => {
        const participants = Array.isArray(option.participants) ? option.participants : [];
        const participantNames = participants
          .map((participantId) => agentById.get(participantId)?.displayName ?? participantId)
          .filter((name) => !!name.trim());
        const subtitle = participantNames.length > 0 ? participantNames.join('，') : '通用助手';
        const avatarSources = participants.slice(0, 4).map(
          (participantId) => resolveAvatarUrl(agentById.get(participantId)?.avatar) ?? fallbackAvatar,
        );
        return {
          ...option,
          subtitle,
          avatarSources,
          timeText: formatRelativeTime(Number(option.lastActiveAt) || 0, true),
        };
      }),
    [agentById, fallbackAvatar, options],
  );

  return (
    <div ref={containerRef} className="relative">
      <PickerFieldButton
        value={label}
        placeholder="请选择"
        onClick={() => setOpen((current) => !current)}
        testId="schedule-editor-session-select"
      />

      {open && panelPosition
        ? createPortal(
          <div
            className="fixed z-[70]"
            style={{
              top: panelPosition.top,
              left: panelPosition.left,
              width: panelPosition.width,
              transform: panelPlacement === 'top' ? 'translateY(-100%)' : undefined,
            }}
          >
            <div
              ref={panelRef}
              className={[
                'w-full rounded-[12px] border border-[rgba(194,194,194,1)] bg-white p-2 shadow-[0_12px_32px_rgba(16,24,40,0.12)]',
                panelPlacement === 'top' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]',
              ].join(' ')}
              style={{ maxHeight: `${panelMaxHeight}px` }}
              data-testid="schedule-editor-session-panel"
            >
              {loading ? <div className="px-3 py-2 text-[14px] text-[#667085]">加载中...</div> : null}
              {!loading && hasError ? <div className="px-3 py-2 text-[14px] text-[#667085]">加载失败</div> : null}
              {!loading && !hasError && options.length === 0 ? <div className="px-3 py-2 text-[14px] text-[#667085]">暂无会话</div> : null}
              <div style={{ maxHeight: `${scrollableMaxHeight}px` }} className="overflow-y-auto" data-testid="schedule-editor-session-scroll">
                {!loading && !hasError
                  ? displayOptions.map((option) => {
                    const selected = option.value === value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onChange(option.value);
                          setOpen(false);
                        }}
                        className={[
                          'flex w-full items-center gap-2 rounded-[8px] px-2 py-2 text-left transition',
                          selected ? 'bg-[#DCEBFF]' : 'hover:bg-[#F9FAFB]',
                        ].join(' ')}
                        data-testid={`schedule-editor-session-option-${option.value}`}
                      >
                        <div className="relative h-8 w-8 shrink-0">
                          {option.avatarSources.length <= 1 ? (
                            <img src={option.avatarSources[0] ?? fallbackAvatar} alt="" aria-hidden="true" className="h-8 w-8 rounded-full object-cover" />
                          ) : option.avatarSources.length === 2 ? (
                            <>
                              <img src={option.avatarSources[0] ?? fallbackAvatar} alt="" aria-hidden="true" className="absolute left-[1px] top-[6px] h-5 w-5 rounded-full object-cover" />
                              <img src={option.avatarSources[1] ?? fallbackAvatar} alt="" aria-hidden="true" className="absolute left-[11px] top-[6px] h-5 w-5 rounded-full object-cover" />
                            </>
                          ) : option.avatarSources.length === 3 ? (
                            <>
                              <img src={option.avatarSources[0] ?? fallbackAvatar} alt="" aria-hidden="true" className="absolute left-[8px] top-0 h-4 w-4 rounded-full object-cover" />
                              <img src={option.avatarSources[1] ?? fallbackAvatar} alt="" aria-hidden="true" className="absolute left-0 top-[16px] h-4 w-4 rounded-full object-cover" />
                              <img src={option.avatarSources[2] ?? fallbackAvatar} alt="" aria-hidden="true" className="absolute left-[16px] top-[16px] h-4 w-4 rounded-full object-cover" />
                            </>
                          ) : (
                            <>
                              <img src={option.avatarSources[0] ?? fallbackAvatar} alt="" aria-hidden="true" className="absolute left-0 top-0 h-4 w-4 rounded-full object-cover" />
                              <img src={option.avatarSources[1] ?? fallbackAvatar} alt="" aria-hidden="true" className="absolute left-[16px] top-0 h-4 w-4 rounded-full object-cover" />
                              <img src={option.avatarSources[2] ?? fallbackAvatar} alt="" aria-hidden="true" className="absolute left-0 top-[16px] h-4 w-4 rounded-full object-cover" />
                              <img src={option.avatarSources[3] ?? fallbackAvatar} alt="" aria-hidden="true" className="absolute left-[16px] top-[16px] h-4 w-4 rounded-full object-cover" />
                            </>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="block min-w-0 truncate text-[14px] font-semibold leading-5 text-[#344054]"
                              data-testid={`schedule-editor-session-option-title-${option.value}`}
                            >
                              {option.label}
                            </span>
                            <span className="shrink-0 text-[14px] leading-5 text-[#344054]">{option.timeText}</span>
                          </div>
                          <div className="mt-1 truncate text-[12px] leading-5 text-[#667085]">{option.subtitle}</div>
                        </div>
                      </button>
                    );
                  })
                  : null}
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}

export type { SessionSelectOption };
