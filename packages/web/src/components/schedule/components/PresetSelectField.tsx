/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { EFFECTIVE_PRESET_OPTIONS, INPUT_BOX_CLASS } from '../utils/editor';
import type { EffectivePreset } from '../utils/editor';
import { PickerFieldButton } from './PickerFieldButton';

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

function useDropdownPortalPosition(
  open: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
  panelPlacement: DropdownPanelPlacement,
  panelWidth?: number,
) {
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPosition(null);
      return;
    }
    const trigger = containerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPanelPosition({
      top: panelPlacement === 'top' ? rect.top - 8 : rect.bottom + 8,
      left: rect.left,
      width: panelWidth ?? rect.width,
    });
  }, [containerRef, open, panelPlacement, panelWidth]);

  return panelPosition;
}

interface PresetSelectFieldProps {
  value: EffectivePreset;
  onChange: (value: EffectivePreset) => void;
}

export function PresetSelectField({ value, onChange }: PresetSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const label = EFFECTIVE_PRESET_OPTIONS.find((option) => option.value === value)?.label ?? '';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { panelPlacement, panelMaxHeight, scrollableMaxHeight } = useResponsiveDropdownLayout(open, containerRef, {
    minimumPanelHeight: 160,
    reservedHeight: 16,
    minScrollableHeight: 120,
    defaultPanelHeight: 240,
    defaultScrollableHeight: 224,
  });
  const panelPosition = useDropdownPortalPosition(open, containerRef, panelPlacement);

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

  return (
    <div ref={containerRef} className="relative">
      <PickerFieldButton
        value={label}
        placeholder="请选择"
        onClick={() => setOpen((current) => !current)}
        testId="schedule-editor-effective-preset-trigger"
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
              data-testid="schedule-editor-effective-preset-panel"
            >
              <div style={{ maxHeight: `${scrollableMaxHeight}px` }} className="overflow-y-auto" data-testid="schedule-editor-effective-preset-scroll">
                {EFFECTIVE_PRESET_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className="flex h-7 w-full items-center rounded-[6px] px-3 text-left text-[12px] text-[#101828] hover:bg-[#F9FAFB]"
                    data-testid={`schedule-editor-effective-preset-${option.value}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
