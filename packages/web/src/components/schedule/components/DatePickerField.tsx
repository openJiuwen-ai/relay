/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  INPUT_BOX_CLASS,
  formatDateDisplay,
  parseDateValue,
  toDateValue,
  addMonths,
  addYears,
  formatCalendarMonthLabel,
} from '../utils/editor';

const CALENDAR_WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

interface CalendarDayCell {
  date: Date;
  value: string;
  label: string;
  currentMonth: boolean;
  selected: boolean;
  disabled: boolean;
}

function buildCalendarDayCells(viewDate: Date, selectedValue: string): CalendarDayCell[] {
  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1, 12);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const todayValue = toDateValue(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const value = toDateValue(date);
    return {
      date,
      value,
      label: `${date.getDate()}`,
      currentMonth: date.getMonth() === viewDate.getMonth(),
      selected: value === selectedValue,
      disabled: value < todayValue,
    };
  });
}

interface DatePickerFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function DatePickerField({ value, onChange }: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelPlacement, setPanelPlacement] = useState<'top' | 'bottom'>('bottom');
  const [panelMaxHeight, setPanelMaxHeight] = useState(560);
  const [calendarGridMaxHeight, setCalendarGridMaxHeight] = useState(336);
  const selectedDate = useMemo(() => parseDateValue(value), [value]);
  const [viewDate, setViewDate] = useState<Date>(() => selectedDate ?? new Date());
  const calendarDays = useMemo(() => buildCalendarDayCells(viewDate, value), [viewDate, value]);
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number; width: number } | null>(null);

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

  useEffect(() => {
    if (!open) return;
    setViewDate(selectedDate ?? new Date());
  }, [open, selectedDate]);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePanelLayout = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const gap = 8;
      const safeMargin = 16;
      const minimumPanelHeight = 320;
      const reservedPanelHeight = 224;
      const spaceBelow = viewportHeight - rect.bottom - gap - safeMargin;
      const spaceAbove = rect.top - gap - safeMargin;
      const openUpward = spaceBelow < minimumPanelHeight && spaceAbove > spaceBelow;
      const availableHeight = Math.max(openUpward ? spaceAbove : spaceBelow, minimumPanelHeight);

      setPanelPlacement(openUpward ? 'top' : 'bottom');
      setPanelMaxHeight(Math.max(availableHeight, minimumPanelHeight));
      setCalendarGridMaxHeight(Math.max(availableHeight - reservedPanelHeight, 144));
    };

    updatePanelLayout();
    window.addEventListener('resize', updatePanelLayout);
    return () => window.removeEventListener('resize', updatePanelLayout);
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-[214px]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`relative flex w-full items-center px-3 pr-11 text-left text-[14px] ${INPUT_BOX_CLASS}`}
        data-testid="schedule-editor-once-date-trigger"
      >
        <span className={value ? 'text-[#101828]' : 'text-[#98A2B3]'}>{value ? formatDateDisplay(value) : 'YYYY/MM/DD'}</span>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#98A2B3]" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M5.333 1.667V3M10.667 1.667V3M2.333 5H13.667M3.667 2.333H12.333C13.07 2.333 13.667 2.93 13.667 3.667V12.333C13.667 13.07 13.07 13.667 12.333 13.667H3.667C2.93 13.667 2.333 13.07 2.333 12.333V3.667C2.333 2.93 2.93 2.333 3.667 2.333Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open && panelPosition
        ? createPortal(
          <div
            className="fixed z-[70]"
            style={{
              top: panelPosition.top,
              left: panelPosition.left,
              width: panelPosition.width,
              minWidth: '340px',
              transform: panelPlacement === 'top' ? 'translateY(-100%)' : undefined,
            }}
          >
            <div
              ref={panelRef}
              className={[
                'w-full overflow-hidden rounded-[16px] border border-[rgba(194,194,194,1)] bg-white shadow-[0_12px_32px_rgba(16,24,40,0.14)]',
                panelPlacement === 'top' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]',
              ].join(' ')}
              style={{ maxHeight: `${panelMaxHeight}px` }}
              data-testid="schedule-editor-once-date-panel"
            >
              <div className="p-6 pb-5">
                <div className={`flex items-center px-3 text-[14px] text-[#98A2B3] ${INPUT_BOX_CLASS}`}>
                  {value ? formatDateDisplay(value) : 'YYYY/MM/DD'}
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-[rgba(194,194,194,1)] px-6 pb-5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewDate((current) => addYears(current, -1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] text-[22px] leading-none text-[#98A2B3] transition hover:bg-[#F9FAFB] hover:text-[#667085]"
                    data-testid="schedule-editor-once-date-prev-year"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <path d="M11.25 4.5L6.75 9L11.25 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M15 4.5L10.5 9L15 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewDate((current) => addMonths(current, -1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] text-[22px] leading-none text-[#98A2B3] transition hover:bg-[#F9FAFB] hover:text-[#667085]"
                    data-testid="schedule-editor-once-date-prev-month"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <path d="M11.25 4.5L6.75 9L11.25 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                <div className="text-[16px] font-normal text-[#101828]" data-testid="schedule-editor-once-date-month-label">
                  {formatCalendarMonthLabel(viewDate)}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewDate((current) => addMonths(current, 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] text-[22px] leading-none text-[#98A2B3] transition hover:bg-[#F9FAFB] hover:text-[#667085]"
                    data-testid="schedule-editor-once-date-next-month"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <path d="M6.75 4.5L11.25 9L6.75 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewDate((current) => addYears(current, 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] text-[22px] leading-none text-[#98A2B3] transition hover:bg-[#F9FAFB] hover:text-[#667085]"
                    data-testid="schedule-editor-once-date-next-year"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <path d="M3 4.5L7.5 9L3 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6.75 4.5L11.25 9L6.75 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="px-6 py-5">
                <div className="mb-4 grid grid-cols-7 text-center text-[14px] text-[#98A2B3]">
                  {CALENDAR_WEEKDAY_LABELS.map((label) => (
                    <span key={label} className="flex h-10 items-center justify-center">
                      {label}
                    </span>
                  ))}
                </div>

                <div
                  className="overflow-y-auto pr-1"
                  style={{ maxHeight: `${calendarGridMaxHeight}px` }}
                  data-testid="schedule-editor-once-date-grid-scroll"
                >
                  <div className="grid grid-cols-7 gap-y-4">
                    {calendarDays.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => {
                          if (day.disabled) return;
                          onChange(day.value);
                          setOpen(false);
                        }}
                        disabled={day.disabled}
                        className="flex h-14 items-center justify-center disabled:cursor-not-allowed"
                        data-testid={`schedule-editor-once-date-day-${day.value}`}
                      >
                        <span
                          className={[
                            'inline-flex h-10 w-10 items-center justify-center rounded-[6px] border text-[14px] transition',
                            day.disabled
                              ? 'border-transparent text-[#D0D5DD]'
                              : day.selected
                                ? 'border-[1.5px] border-[rgba(20,118,255,1)] text-[#101828]'
                                : day.currentMonth
                                  ? 'border-transparent text-[#101828] hover:bg-[#F9FAFB]'
                                  : 'border-transparent text-[#98A2B3] hover:bg-[#F9FAFB]',
                          ].join(' ')}
                        >
                          {day.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
