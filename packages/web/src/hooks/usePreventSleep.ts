/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

type PreventSleepStatePayload = {
  enabled?: boolean;
  error?: string | null;
};

type PreventSleepStateMessage = {
  type?: string;
  payload?: PreventSleepStatePayload;
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

const PREVENT_SLEEP_ENABLE_MESSAGE = 'preventSleep.enable';
const PREVENT_SLEEP_DISABLE_MESSAGE = 'preventSleep.disable';
const PREVENT_SLEEP_SYNC_STATE_MESSAGE = 'preventSleep.syncState';
const PREVENT_SLEEP_STATE_MESSAGE = 'preventSleep.state';

function getWebViewBridge(): WebViewBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.chrome?.webview ?? null;
}

function isPreventSleepStateMessage(value: unknown): value is PreventSleepStateMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as PreventSleepStateMessage;
  return message.type === PREVENT_SLEEP_STATE_MESSAGE;
}

export function usePreventSleep() {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const isDesktopHost = getWebViewBridge() !== null;

  useEffect(() => {
    const webview = getWebViewBridge();
    if (!webview?.addEventListener) {
      // 非 WebView2 环境，标记加载完成
      setIsLoading(false);
      return;
    }

    const handleMessage = (event: WebViewMessageEvent) => {
      const message = event.data;
      if (!isPreventSleepStateMessage(message)) {
        return;
      }

      const payload = message.payload;
      setEnabled(Boolean(payload?.enabled));
      setError(payload?.error ?? null);
      setIsLoading(false);
      setIsSaving(false);
    };

    webview.addEventListener('message', handleMessage);
    // 请求同步当前状态
    webview.postMessage(PREVENT_SLEEP_SYNC_STATE_MESSAGE);

    return () => {
      webview.removeEventListener?.('message', handleMessage);
    };
  }, []);

  const enable = useCallback(() => {
    const webview = getWebViewBridge();
    if (!webview) {
      return;
    }

    setIsSaving(true);
    webview.postMessage(PREVENT_SLEEP_ENABLE_MESSAGE);
  }, []);

  const disable = useCallback(() => {
    const webview = getWebViewBridge();
    if (!webview) {
      return;
    }

    setIsSaving(true);
    webview.postMessage(PREVENT_SLEEP_DISABLE_MESSAGE);
  }, []);

  const toggle = useCallback((value: boolean) => {
    if (value) {
      enable();
    } else {
      disable();
    }
  }, [enable, disable]);

  return {
    isDesktopHost,
    enabled,
    error,
    isLoading,
    isSaving,
    enable,
    disable,
    toggle,
  };
}