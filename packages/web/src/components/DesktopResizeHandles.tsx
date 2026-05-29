/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { MouseEvent } from 'react';
import type { DesktopResizeDirection } from '@/hooks/useDesktopWindowControls';
import { useDesktopWindowControls } from '@/hooks/useDesktopWindowControls';

type ResizeHandle = {
  direction: DesktopResizeDirection;
  className: string;
};

const RESIZE_HANDLES: ResizeHandle[] = [
  { direction: 'top', className: 'desktop-resize-top' },
  { direction: 'right', className: 'desktop-resize-right' },
  { direction: 'bottom', className: 'desktop-resize-bottom' },
  { direction: 'left', className: 'desktop-resize-left' },
  { direction: 'top-left', className: 'desktop-resize-top-left' },
  { direction: 'top-right', className: 'desktop-resize-top-right' },
  { direction: 'bottom-left', className: 'desktop-resize-bottom-left' },
  { direction: 'bottom-right', className: 'desktop-resize-bottom-right' },
];

export function DesktopResizeHandles() {
  const { isDesktopHost, isMaximized, startResize } = useDesktopWindowControls();

  if (!isDesktopHost || isMaximized) {
    return null;
  }

  const handleMouseDown = (direction: DesktopResizeDirection) => (event: MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    startResize(direction);
  };

  return (
    <div className="desktop-resize-handles" aria-hidden="true">
      {RESIZE_HANDLES.map((handle) => (
        <button
          key={handle.direction}
          type="button"
          aria-label={`Resize ${handle.direction}`}
          className={`desktop-resize-handle ${handle.className}`}
          onMouseDown={handleMouseDown(handle.direction)}
        />
      ))}
    </div>
  );
}
