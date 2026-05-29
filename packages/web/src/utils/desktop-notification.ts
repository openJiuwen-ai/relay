/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { getCachedAgents } from '@/hooks/useAgentData';

type WebViewBridge = {
  postMessage(message: string): void;
};

type WebKitMessageHandler = {
  postMessage(message: string): void;
};

type DesktopWindow = Window & {
  chrome?: {
    webview?: WebViewBridge;
  };
  webkit?: {
    messageHandlers?: {
      officeClawDesktop?: WebKitMessageHandler;
    };
  };
};

function getNativeBridge(): WebViewBridge | WebKitMessageHandler | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const desktopWindow = window as DesktopWindow;
  return desktopWindow.chrome?.webview ?? desktopWindow.webkit?.messageHandlers?.officeClawDesktop ?? null;
}

export interface DesktopNotificationOptions {
  title: string;
  body: string;
  type?: 'success' | 'error' | 'info';
  threadId?: string;
}

export interface ToolApprovalNotificationOptions {
  requestId: string;
  threadId: string;
  /** Legacy field name; carries the current agentId. */
  catId: string;
  action: string;
  reason: string;
}

const notifiedToolApprovalRequestIds = new Set<string>();
const pendingToolApprovalNotificationIds = new Set<string>();
const activeToolApprovalTitleFlashes = new Map<string, () => void>();

function focusThread(threadId: string | undefined): void {
  if (typeof window === 'undefined') return;
  window.focus();
  if (!threadId) return;

  const targetPath = `/thread/${encodeURIComponent(threadId)}`;
  if (window.location.pathname !== targetPath) {
    window.history.pushState(null, '', targetPath);
    window.dispatchEvent(typeof PopStateEvent === 'function' ? new PopStateEvent('popstate') : new Event('popstate'));
  }
}

export function requestNotificationPermission(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function showBrowserNotification(options: DesktopNotificationOptions): Notification | null {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;

  if (Notification.permission !== 'granted') {
    requestNotificationPermission();
    return null;
  }

  return createBrowserNotification(options);
}

function createBrowserNotification(options: DesktopNotificationOptions): Notification {
  const notification = new Notification(options.title, {
    body: options.body,
    icon: '/favicon.ico',
  });

  notification.onclick = () => {
    focusThread(options.threadId);
    notification.close();
  };

  return notification;
}

function sendDesktopNotificationRequest(options: DesktopNotificationOptions): boolean {
  const bridge = getNativeBridge();
  if (!bridge) return false;

  const payload = JSON.stringify({
    type: 'desktop.notification',
    title: options.title,
    body: options.body,
    notificationType: options.type ?? 'info',
    threadId: options.threadId ?? null,
  });

  bridge.postMessage(payload);
  return true;
}

function startToolApprovalTitleFlash(requestId: string, agentLabel: string): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (!document.hidden || activeToolApprovalTitleFlashes.has(requestId)) return;

  const originalTitle = document.title;
  const alertTitle = `🔐 ${agentLabel} 等你批准!`;
  let showAlert = true;

  const tick = () => {
    document.title = showAlert ? alertTitle : originalTitle;
    showAlert = !showAlert;
  };
  const intervalId = window.setInterval(tick, 1000);
  tick();

  const onVisibilityChange = () => {
    if (!document.hidden) stop();
  };

  const stop = () => {
    window.clearInterval(intervalId);
    activeToolApprovalTitleFlashes.delete(requestId);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    document.title = originalTitle;
  };

  activeToolApprovalTitleFlashes.set(requestId, stop);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function resolveAgentDisplayLabel(agentId: string): string {
  if (!agentId || agentId === '智能体') return '智能体';
  return getCachedAgents().find((row) => row.id === agentId)?.displayName ?? agentId;
}

export function notifyOnTaskComplete(options: DesktopNotificationOptions): void {
  requestNotificationPermission();
  showBrowserNotification(options);
  sendDesktopNotificationRequest(options);
}

export function notifyToolApprovalRequest(options: ToolApprovalNotificationOptions): void {
  if (
    !options.requestId ||
    notifiedToolApprovalRequestIds.has(options.requestId) ||
    pendingToolApprovalNotificationIds.has(options.requestId)
  ) {
    return;
  }

  const agentLabel = resolveAgentDisplayLabel(options.catId);
  const notification: DesktopNotificationOptions = {
    title: `${agentLabel} 需要权限`,
    body: `${options.reason}`,
    type: 'info',
    threadId: options.threadId,
  };

  startToolApprovalTitleFlash(options.requestId, agentLabel);

  if (sendDesktopNotificationRequest(notification)) {
    notifiedToolApprovalRequestIds.add(options.requestId);
    return;
  }

  if (typeof document !== 'undefined' && document.hidden) {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    if (Notification.permission === 'granted') {
      const browserNotification = showBrowserNotification(notification);
      if (browserNotification) {
        notifiedToolApprovalRequestIds.add(options.requestId);
      }
      return;
    }

    if (Notification.permission !== 'default') {
      return;
    }

    pendingToolApprovalNotificationIds.add(options.requestId);
    void Notification.requestPermission()
      .then((permission) => {
        pendingToolApprovalNotificationIds.delete(options.requestId);
        if (permission !== 'granted' || notifiedToolApprovalRequestIds.has(options.requestId)) {
          return;
        }
        createBrowserNotification(notification);
        notifiedToolApprovalRequestIds.add(options.requestId);
      })
      .catch(() => {
        pendingToolApprovalNotificationIds.delete(options.requestId);
      });
  }
}
