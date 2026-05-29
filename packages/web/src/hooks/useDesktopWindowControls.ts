/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type DesktopResizeDirection =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

type DesktopWindowStatePayload = {
  isMaximized?: boolean;
  isMinimized?: boolean;
  canMaximize?: boolean;
};

type DesktopWindowStateMessage = {
  type?: string;
  payload?: DesktopWindowStatePayload;
};

type WebViewMessageEvent = {
  data?: unknown;
};

type WebViewBridge = {
  postMessage(message: string): void;
  addEventListener?(eventName: 'message', listener: (event: WebViewMessageEvent) => void): void;
  removeEventListener?(eventName: 'message', listener: (event: WebViewMessageEvent) => void): void;
};

declare global {
  interface Window {
    chrome?: {
      webview?: WebViewBridge;
    };
  }
}

const WINDOW_MINIMIZE_MESSAGE = 'window.minimize';
const WINDOW_TOGGLE_MAXIMIZE_MESSAGE = 'window.toggleMaximize';
const WINDOW_CLOSE_MESSAGE = 'window.close';
const WINDOW_SYNC_STATE_MESSAGE = 'window.syncState';
const WINDOW_START_DRAG_MESSAGE = 'window.startDrag';
const WINDOW_START_RESIZE_MESSAGE_PREFIX = 'window.startResize:';
const WINDOW_STATE_MESSAGE = 'window.state';
const WINDOW_FLASH_TASKBAR_MESSAGE = 'window.flashTaskbar';
const WINDOW_STOP_FLASH_MESSAGE = 'window.stopFlash';

function getWebViewBridge(): WebViewBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.chrome?.webview ?? null;
}

function isWindowStateMessage(value: unknown): value is DesktopWindowStateMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as DesktopWindowStateMessage;
  return message.type === WINDOW_STATE_MESSAGE;
}

export function useDesktopWindowControls() {
  const [windowState, setWindowState] = useState<DesktopWindowStatePayload>({
    isMaximized: false,
    isMinimized: false,
    canMaximize: true,
  });

  const isDesktopHost = useMemo(() => getWebViewBridge() !== null, []);

  useEffect(() => {
    const webview = getWebViewBridge();
    if (!webview?.addEventListener) {
      return;
    }

    const handleMessage = (event: WebViewMessageEvent) => {
      const message = event.data;
      if (!isWindowStateMessage(message)) {
        return;
      }

      setWindowState((current) => ({
        ...current,
        ...message.payload,
      }));
    };

    webview.addEventListener('message', handleMessage);
    webview.postMessage(WINDOW_SYNC_STATE_MESSAGE);

    return () => {
      webview.removeEventListener?.('message', handleMessage);
    };
  }, []);

  const postMessage = useCallback((message: string) => {
    getWebViewBridge()?.postMessage(message);
  }, []);

  const minimize = useCallback(() => {
    postMessage(WINDOW_MINIMIZE_MESSAGE);
  }, [postMessage]);

  const toggleMaximize = useCallback(() => {
    postMessage(WINDOW_TOGGLE_MAXIMIZE_MESSAGE);
  }, [postMessage]);

  const close = useCallback(() => {
    postMessage(WINDOW_CLOSE_MESSAGE);
  }, [postMessage]);

  const startDrag = useCallback(() => {
    postMessage(WINDOW_START_DRAG_MESSAGE);
  }, [postMessage]);

  const flashTaskbar = useCallback(() => {
    postMessage(WINDOW_FLASH_TASKBAR_MESSAGE);
  }, [postMessage]);

  const stopFlash = useCallback(() => {
    postMessage(WINDOW_STOP_FLASH_MESSAGE);
  }, [postMessage]);

  const startResize = useCallback(
    (direction: DesktopResizeDirection) => {
      postMessage(`${WINDOW_START_RESIZE_MESSAGE_PREFIX}${direction}`);
    },
    [postMessage],
  );

  return {
    isDesktopHost,
    isMaximized: Boolean(windowState.isMaximized),
    canMaximize: windowState.canMaximize !== false,
    minimize,
    toggleMaximize,
    close,
    startDrag,
    flashTaskbar,
    stopFlash,
    startResize,
  };
}
