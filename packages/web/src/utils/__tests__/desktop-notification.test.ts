/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyOnTaskComplete, notifyToolApprovalRequest } from '@/utils/desktop-notification';

type MockNotificationInstance = {
  onclick: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
};

const notificationInstances: MockNotificationInstance[] = [];

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  });
}

describe('desktop notification utilities', () => {
  beforeEach(() => {
    notificationInstances.length = 0;
    setDocumentHidden(false);
    document.title = 'OfficeClaw';
    window.history.replaceState(null, '', '/');
    delete (window as typeof window & { chrome?: unknown }).chrome;
    delete (window as typeof window & { webkit?: unknown }).webkit;

    const MockNotification = vi.fn().mockImplementation(function (
      this: MockNotificationInstance,
      _title: string,
      _options: NotificationOptions,
    ) {
      this.onclick = null;
      this.close = vi.fn();
      notificationInstances.push(this);
    });
    Object.assign(MockNotification, {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      writable: true,
      value: MockNotification,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as typeof window & { chrome?: unknown }).chrome;
    delete (window as typeof window & { webkit?: unknown }).webkit;
  });

  it('routes task completion notifications to the thread on click', () => {
    const postMessage = vi.fn();
    const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {});
    (window as typeof window & { chrome?: unknown }).chrome = { webview: { postMessage } };

    notifyOnTaskComplete({
      title: 'OfficeClaw 完成',
      body: '任务已完成',
      type: 'success',
      threadId: 'thread-done',
    });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(JSON.parse(postMessage.mock.calls[0]?.[0] as string)).toEqual({
      type: 'desktop.notification',
      title: 'OfficeClaw 完成',
      body: '任务已完成',
      notificationType: 'success',
      threadId: 'thread-done',
    });

    notificationInstances[0]?.onclick?.();
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/thread/thread-done');
    expect(notificationInstances[0]?.close).toHaveBeenCalledTimes(1);
  });

  it('sends tool approval notifications through the WebView2 bridge with thread routing data', () => {
    const postMessage = vi.fn();
    (window as typeof window & { chrome?: unknown }).chrome = { webview: { postMessage } };

    notifyToolApprovalRequest({
      requestId: 'req-webview2',
      threadId: 'thread-a',
      catId: 'OfficeClaw',
      action: 'mcp.exec',
      reason: 'needs approval with "quotes"\nand newlines',
    });

    expect(postMessage).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(postMessage.mock.calls[0]?.[0] as string);
    expect(payload).toEqual({
      type: 'desktop.notification',
      title: 'OfficeClaw 需要权限',
      body: 'needs approval with "quotes"\nand newlines',
      notificationType: 'info',
      threadId: 'thread-a',
    });
    expect(Notification).not.toHaveBeenCalled();
  });

  it('resolves tool approval notification titles from agent display names', () => {
    const postMessage = vi.fn();
    (window as typeof window & { chrome?: unknown }).chrome = { webview: { postMessage } };

    notifyToolApprovalRequest({
      requestId: 'req-agent-display-name',
      threadId: 'thread-agent-display-name',
      catId: 'codex',
      action: 'mcp.exec',
      reason: 'approve command',
    });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(JSON.parse(postMessage.mock.calls[0]?.[0] as string).title).toBe('通用智能体 需要权限');
  });

  it('sends tool approval notifications through the WKWebView bridge', () => {
    const postMessage = vi.fn();
    (window as typeof window & { webkit?: unknown }).webkit = {
      messageHandlers: {
        officeClawDesktop: { postMessage },
      },
    };

    notifyToolApprovalRequest({
      requestId: 'req-wkwebview',
      threadId: 'thread-b',
      catId: 'opus',
      action: 'file.write',
      reason: 'write request',
    });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(JSON.parse(postMessage.mock.calls[0]?.[0] as string).threadId).toBe('thread-b');
    expect(Notification).not.toHaveBeenCalled();
  });

  it('keeps native desktop notification primary while flashing the browser title when hidden', () => {
    vi.useFakeTimers();
    setDocumentHidden(true);
    const postMessage = vi.fn();
    (window as typeof window & { chrome?: unknown }).chrome = { webview: { postMessage } };

    notifyToolApprovalRequest({
      requestId: 'req-webview2-title-flash',
      threadId: 'thread-title',
      catId: 'OfficeClaw',
      action: 'shell.exec',
      reason: 'run command',
    });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(Notification).not.toHaveBeenCalled();
    expect(document.title).toBe('🔐 OfficeClaw 等你批准!');

    vi.advanceTimersByTime(1000);
    expect(document.title).toBe('OfficeClaw');

    setDocumentHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.title).toBe('OfficeClaw');
  });

  it('falls back to browser Notification while hidden and routes to the thread on click', () => {
    vi.useFakeTimers();
    setDocumentHidden(true);
    const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {});
    window.history.replaceState(null, '', '/');

    notifyToolApprovalRequest({
      requestId: 'req-browser',
      threadId: 'thread-c',
      catId: 'gemini',
      action: 'shell.exec',
      reason: 'run command',
    });

    expect(Notification).toHaveBeenCalledTimes(1);
    expect(document.title).toBe('🔐 编码智能体 等你批准!');
    notificationInstances[0]?.onclick?.();

    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/thread/thread-c');
    expect(notificationInstances[0]?.close).toHaveBeenCalledTimes(1);
  });

  it('shows the browser fallback after notification permission is granted', async () => {
    setDocumentHidden(true);
    Object.assign(Notification, {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });

    notifyToolApprovalRequest({
      requestId: 'req-browser-permission',
      threadId: 'thread-permission',
      catId: 'OfficeClaw',
      action: 'shell.exec',
      reason: 'run command',
    });
    notifyToolApprovalRequest({
      requestId: 'req-browser-permission',
      threadId: 'thread-permission',
      catId: 'OfficeClaw',
      action: 'shell.exec',
      reason: 'run command',
    });

    expect(Notification).not.toHaveBeenCalled();
    await Promise.resolve();

    expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(Notification).toHaveBeenCalledTimes(1);
  });

  it('dedupes tool approval notifications by requestId', () => {
    const postMessage = vi.fn();
    (window as typeof window & { chrome?: unknown }).chrome = { webview: { postMessage } };

    const payload = {
      requestId: 'req-dedupe',
      threadId: 'thread-d',
      catId: 'OfficeClaw',
      action: 'tool.call',
      reason: 'same request',
    };
    notifyToolApprovalRequest(payload);
    notifyToolApprovalRequest(payload);

    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});
