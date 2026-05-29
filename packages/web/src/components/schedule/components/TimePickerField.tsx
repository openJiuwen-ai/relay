/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useState, useEffect, useRef, useCallback, useLayoutEffect, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { HOURS, MINUTES, INPUT_BOX_CLASS, joinTimeValue, splitTimeValue } from '../utils/editor';

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
  containerRef: RefObject<HTMLDivElement | null>,
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

function useDropdownPortalPosition(
  open: boolean,
  containerRef: RefObject<HTMLDivElement | null>,
  panelPlacement: DropdownPanelPlacement,
  panelWidth?: number,
) {
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePanelPosition = useCallback(() => {
    if (!open) return;
    const trigger = containerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPanelPosition({
      top: panelPlacement === 'top' ? rect.top - 8 : rect.bottom + 8,
      left: rect.left,
      width: panelWidth ?? rect.width,
    });
  }, [containerRef, open, panelPlacement, panelWidth]);

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

  return panelPosition;
}

interface TimePickerFieldProps {
  value: string;
  onChange: (value: string) => void;
  testIdPrefix: string;
  isHourDisabled?: (hour: string) => boolean;
  isMinuteDisabled?: (hour: string, minute: string) => boolean;
}

export function TimePickerField({ value, onChange, testIdPrefix, isHourDisabled, isMinuteDisabled }: TimePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(splitTimeValue(value).hour);
  const [draftMinute, setDraftMinute] = useState(splitTimeValue(value).minute);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { panelPlacement, panelMaxHeight, scrollableMaxHeight } = useResponsiveDropdownLayout(open, containerRef, {
    minimumPanelHeight: 320,
    reservedHeight: 188,
    minScrollableHeight: 120,
    defaultPanelHeight: 420,
    defaultScrollableHeight: 220,
  });
  const panelPosition = useDropdownPortalPosition(open, containerRef, panelPlacement, 320);

  useEffect(() => {
    const next = splitTimeValue(value);
    setDraftHour(next.hour);
    setDraftMinute(next.minute);
  }, [value]);

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

  const getFirstAvailableHour = useCallback(() => {
    return HOURS.find((hour) => !(isHourDisabled?.(hour) ?? false)) ?? '00';
  }, [isHourDisabled]);

  const getFirstAvailableMinute = useCallback((hour: string) => {
    return MINUTES.find((minute) => !(isMinuteDisabled?.(hour, minute) ?? false)) ?? '00';
  }, [isMinuteDisabled]);

  const getNormalizedDraftTime = useCallback((hour: string, minute: string) => {
    let nextHour = hour;
    if (isHourDisabled?.(nextHour) ?? false) {
      nextHour = getFirstAvailableHour();
    }

    let nextMinute = minute;
    if (isMinuteDisabled?.(nextHour, nextMinute) ?? false) {
      nextMinute = getFirstAvailableMinute(nextHour);
    }

    return { hour: nextHour, minute: nextMinute };
  }, [getFirstAvailableHour, getFirstAvailableMinute, isHourDisabled, isMinuteDisabled]);

  useEffect(() => {
    if (!open) return;
    const normalized = getNormalizedDraftTime(draftHour, draftMinute);
    if (normalized.hour !== draftHour) {
      setDraftHour(normalized.hour);
    }
    if (normalized.minute !== draftMinute) {
      setDraftMinute(normalized.minute);
    }
  }, [draftHour, draftMinute, getNormalizedDraftTime, open]);

  return (
    <div ref={containerRef} className="relative w-[214px]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between px-3 text-[14px] ${INPUT_BOX_CLASS}`}
        data-testid={`${testIdPrefix}-trigger`}
      >
        <span className={value ? 'text-[#101828]' : 'text-[#98A2B3]'}>{value || '00:00'}</span>
        <img src="../icons/schedule.svg" alt="" aria-hidden="true" className="w-4 h-4 shrink-0" />
      </button>

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
                'w-full rounded-[16px] border border-[rgba(194,194,194,1)] bg-white p-4 shadow-[0_12px_32px_rgba(16,24,40,0.14)]',
                panelPlacement === 'top' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]',
              ].join(' ')}
              style={{ maxHeight: `${panelMaxHeight}px` }}
              data-testid={`${testIdPrefix}-panel`}
            >
              <div className={`mb-4 flex items-center justify-between px-3 text-[14px] ${INPUT_BOX_CLASS}`}>
                <span>{joinTimeValue(draftHour, draftMinute)}</span>
                <img src="../icons/schedule.svg" alt="" aria-hidden="true" className="w-4 h-4 shrink-0" />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="flex min-w-0 flex-col">
                  <div className="mb-3 flex h-6 items-center justify-center text-[14px] font-normal text-[#98A2B3]">时</div>
                  <div
                    className="space-y-2 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                    style={{ maxHeight: `${scrollableMaxHeight}px` }}
                    data-testid={`${testIdPrefix}-hour-scroll`}
                  >
                    {HOURS.map((hour) => {
                      const selected = draftHour === hour;
                      const disabled = isHourDisabled?.(hour) ?? false;
                      return (
                        <button
                          key={hour}
                          type="button"
                          onClick={() => {
                            if (disabled) return;
                            setDraftHour(hour);
                            if (isMinuteDisabled?.(hour, draftMinute) ?? false) {
                              setDraftMinute(getFirstAvailableMinute(hour));
                            }
                          }}
                          disabled={disabled}
                          className={[
                            'flex h-10 w-full items-center justify-center rounded-full text-[14px] font-normal transition',
                            disabled
                              ? 'cursor-not-allowed text-[#D0D5DD]'
                              : selected
                                ? 'bg-[#DCEBFF] text-[#101828]'
                                : 'text-[#344054] hover:bg-[#F2F4F7]',
                          ].join(' ')}
                          data-testid={`${testIdPrefix}-hour-${hour}`}
                        >
                          {hour}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex min-w-0 flex-col">
                  <div className="mb-3 flex h-6 items-center justify-center text-[14px] font-normal text-[#98A2B3]">分</div>
                  <div
                    className="space-y-2 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                    style={{ maxHeight: `${scrollableMaxHeight}px` }}
                    data-testid={`${testIdPrefix}-minute-scroll`}
                  >
                    {MINUTES.map((minute) => {
                      const selected = draftMinute === minute;
                      const disabled = isMinuteDisabled?.(draftHour, minute) ?? false;
                      return (
                        <button
                          key={minute}
                          type="button"
                          onClick={() => {
                            if (disabled) return;
                            setDraftMinute(minute);
                          }}
                          disabled={disabled}
                          className={[
                            'flex h-10 w-full items-center justify-center rounded-full text-[14px] font-normal transition',
                            disabled
                              ? 'cursor-not-allowed text-[#D0D5DD]'
                              : selected
                                ? 'bg-[#DCEBFF] text-[#101828]'
                                : 'text-[#344054] hover:bg-[#F2F4F7]',
                          ].join(' ')}
                          data-testid={`${testIdPrefix}-minute-${minute}`}
                        >
                          {minute}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end border-t border-[rgba(194,194,194,1)] pt-4">
                <button
                  type="button"
                  onClick={() => {
                    const normalized = getNormalizedDraftTime(draftHour, draftMinute);
                    setDraftHour(normalized.hour);
                    setDraftMinute(normalized.minute);
                    onChange(joinTimeValue(normalized.hour, normalized.minute));
                    setOpen(false);
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-[rgba(194,194,194,1)] px-6 text-[14px] font-normal text-[#101828]"
                  data-testid={`${testIdPrefix}-confirm`}
                >
                  确定
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
