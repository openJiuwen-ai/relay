/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useMemo } from 'react';

type WebViewBridge = {
  postMessage(message: string): void;
  addEventListener?(eventName: 'message', listener: (event: { data?: unknown }) => void): void;
  removeEventListener?(eventName: 'message', listener: (event: { data?: unknown }) => void): void;
};

const FILE_PICK_MESSAGE = 'file.pick';

interface FilePickRequest {
  type: typeof FILE_PICK_MESSAGE;
  payload: {
    filters?: Array<{ name: string; extensions: string[] }>;
    title?: string;
  };
}

interface FilePickResponse {
  type: 'file.picked';
  payload: {
    canceled: boolean;
    filePath?: string;
    fileName?: string;
  };
}

function getWebViewBridge(): WebViewBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.chrome?.webview ?? null;
}

function isFilePickResponse(value: unknown): value is FilePickResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const msg = value as FilePickResponse;
  return msg.type === 'file.picked' && 'payload' in msg;
}

export function useFilePicker() {
  const isDesktopHost = useMemo(() => getWebViewBridge() !== null, []);

  const pickFile = useCallback(
    (options?: { filters?: Array<{ name: string; extensions: string[] }>; title?: string }): Promise<{ filePath: string; fileName: string } | null> => {
      return new Promise((resolve) => {
        const webview = getWebViewBridge();
        if (!webview) {
          // Fallback to web input - should not happen on desktop
          resolve(null);
          return;
        }

        const request: FilePickRequest = {
          type: FILE_PICK_MESSAGE,
          payload: {
            filters: options?.filters ?? [{ name: 'PowerPoint', extensions: ['ppt', 'pptx'] }],
            title: options?.title ?? '选择 PPT 文件',
          },
        };

        // One-time listener for the response
        const handleMessage = (event: { data?: unknown }) => {
          const message = event.data;
          if (!isFilePickResponse(message)) {
            return;
          }
          webview.removeEventListener?.('message', handleMessage);
          if (message.payload.canceled) {
            resolve(null);
          } else if (message.payload.filePath) {
            resolve({
              filePath: message.payload.filePath,
              fileName: message.payload.fileName ?? '',
            });
          } else {
            resolve(null);
          }
        };

        webview.addEventListener?.('message', handleMessage);
        webview.postMessage(JSON.stringify(request));
      });
    },
    [],
  );

  return {
    isDesktopHost,
    pickFile,
  };
}
