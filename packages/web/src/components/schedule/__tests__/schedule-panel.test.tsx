/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchedulePanel } from '@/components/schedule/SchedulePanel';
import { vitestRouter } from '@/vitest-router-mock';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

function setFieldValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function getDeleteButtons(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll('button, div[role="button"]')].filter((el) => {
    const text = el.textContent?.trim() ?? '';
    return text === '删除';
  }) as HTMLElement[];
}

async function openCustomCreateModal(container: HTMLElement) {
  const createEntry = container.querySelector('[data-testid="scheduled-task-toolbar-create"]') as HTMLButtonElement | null;
  expect(createEntry).toBeTruthy();

  await act(async () => {
    createEntry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();

  const customCreate = container.querySelector('[data-testid="scheduled-task-toolbar-create-custom"]') as HTMLButtonElement | null;
  expect(customCreate).toBeTruthy();

  await act(async () => {
    customCreate?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();
}

async function fillCustomTaskForm({ useNewSession }: { useNewSession: boolean }) {
  const taskNameInput = document.querySelector('input[type="text"]') as HTMLInputElement | null;
  expect(taskNameInput).toBeTruthy();
  act(() => {
    setFieldValue(taskNameInput!, '周报提醒');
  });

  const promptInput = document.querySelector('[data-testid="schedule-editor-prompt"]') as HTMLTextAreaElement | null;
  expect(promptInput).toBeTruthy();
  act(() => {
    setFieldValue(promptInput!, '提醒我整理周报');
  });

  const timeTrigger = document.querySelector('[data-testid="schedule-editor-daily-time-trigger"]') as HTMLButtonElement | null;
  expect(timeTrigger).toBeTruthy();
  await act(async () => {
    timeTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();

  const hourOption = document.querySelector('[data-testid="schedule-editor-daily-time-hour-09"]') as HTMLButtonElement | null;
  const minuteOption = document.querySelector('[data-testid="schedule-editor-daily-time-minute-30"]') as HTMLButtonElement | null;
  const timeConfirm = document.querySelector('[data-testid="schedule-editor-daily-time-confirm"]') as HTMLButtonElement | null;
  expect(hourOption).toBeTruthy();
  expect(minuteOption).toBeTruthy();
  expect(timeConfirm).toBeTruthy();

  await act(async () => {
    hourOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();

  await act(async () => {
    minuteOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();

  await act(async () => {
    timeConfirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();

  if (useNewSession) {
    const newSessionButton = document.querySelector('[data-testid="schedule-editor-session-new"]') as HTMLButtonElement | null;
    expect(newSessionButton).toBeTruthy();
    await act(async () => {
      newSessionButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
    return;
  }

  const sessionTrigger = document.querySelector('[data-testid="schedule-editor-session-select"]') as HTMLButtonElement | null;
  expect(sessionTrigger).toBeTruthy();
  await act(async () => {
    sessionTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();

  const sessionOption = document.querySelector('[data-testid="schedule-editor-session-option-thread-existing-001"]') as HTMLButtonElement | null;
  expect(sessionOption).toBeTruthy();
  await act(async () => {
    sessionOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();
}

async function switchToCardView(container: HTMLElement) {
  const cardViewButton = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('卡片视图')) as
    | HTMLButtonElement
    | undefined;
  expect(cardViewButton).toBeTruthy();
  await act(async () => {
    cardViewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();
}

async function fillIntervalTaskForm({ useNewSession }: { useNewSession: boolean }) {
  const taskNameInput = document.querySelector('input[type="text"]') as HTMLInputElement | null;
  expect(taskNameInput).toBeTruthy();
  act(() => {
    setFieldValue(taskNameInput!, '间隔提醒');
  });

  const promptInput = document.querySelector('[data-testid="schedule-editor-prompt"]') as HTMLTextAreaElement | null;
  expect(promptInput).toBeTruthy();
  act(() => {
    setFieldValue(promptInput!, '每隔两小时提醒我检查数据');
  });

  const intervalButton = document.querySelector('[data-testid="schedule-editor-frequency-interval"]') as HTMLButtonElement | null;
  expect(intervalButton).toBeTruthy();
  await act(async () => {
    intervalButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();

  const intervalValue = document.querySelector('[data-testid="schedule-editor-interval-value"]') as HTMLInputElement | null;
  expect(intervalValue).toBeTruthy();
  act(() => {
    setFieldValue(intervalValue!, '2');
  });

  const unitTrigger = document.querySelector('[data-testid="schedule-editor-interval-unit"]') as HTMLButtonElement | null;
  expect(unitTrigger).toBeTruthy();
  await act(async () => {
    unitTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();

  const hourOption = document.querySelector('[data-testid="schedule-editor-interval-unit-option-hour"]') as HTMLButtonElement | null;
  expect(hourOption).toBeTruthy();
  await act(async () => {
    hourOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();

  if (useNewSession) {
    const newSessionButton = document.querySelector('[data-testid="schedule-editor-session-new"]') as HTMLButtonElement | null;
    expect(newSessionButton).toBeTruthy();
    await act(async () => {
      newSessionButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
    return;
  }

  const sessionTrigger = document.querySelector('[data-testid="schedule-editor-session-select"]') as HTMLButtonElement | null;
  expect(sessionTrigger).toBeTruthy();
  await act(async () => {
    sessionTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();

  const sessionOption = document.querySelector('[data-testid="schedule-editor-session-option-thread-existing-001"]') as HTMLButtonElement | null;
  expect(sessionOption).toBeTruthy();
  await act(async () => {
    sessionOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();
}

describe('SchedulePanel', () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    apiFetchMock.mockReset();
    useToastStore.setState({ toasts: [] });
    useChatStore.setState({ pendingChatInsert: null });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useToastStore.setState({ toasts: [] });
    useChatStore.setState({ pendingChatInsert: null });
    consoleErrorSpy.mockRestore();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('creates a custom schedule task and shows a success toast', async () => {
    const createThreadBodies: Array<{ title?: string }> = [];
    const createTaskBodies: Array<Record<string, unknown>> = [];

    apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';

      if (path === '/api/schedule/tasks' && method === 'GET') {
        return jsonResponse({ tasks: [] });
      }
      if (path.startsWith('/api/schedule/runs?') && method === 'GET') {
        return jsonResponse({ runs: [], nextCursor: null, hasMore: false });
      }
      if (path.startsWith('/api/schedule/runs?') && method === 'GET') {
        return jsonResponse({ runs: [], nextCursor: null, hasMore: false });
      }
      if (path.startsWith('/api/schedule/runs?') && method === 'GET') {
        return jsonResponse({ runs: [], nextCursor: null, hasMore: false });
      }
      if (path.startsWith('/api/schedule/runs?') && method === 'GET') {
        return jsonResponse({ runs: [], nextCursor: null, hasMore: false });
      }
      if (path === '/api/schedule/control' && method === 'GET') {
        return jsonResponse({ global: { enabled: true }, overrides: [] });
      }
      if (path === '/api/threads' && method === 'GET') {
        return jsonResponse({
          threads: [{ id: 'thread-existing-001', title: '已有会话 1' }],
        });
      }
      if (path === '/api/threads' && method === 'POST') {
        createThreadBodies.push(JSON.parse(String(init?.body ?? '{}')) as { title?: string });
        return jsonResponse({ id: 'thread-new-001' });
      }
      if (path === '/api/schedule/tasks' && method === 'POST') {
        createTaskBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return jsonResponse({
          success: true,
          task: {
            id: 'dyn-1',
            label: '周报提醒',
            description: '提醒我整理周报',
            trigger: { type: 'cron', expression: '30 9 * * *' },
          },
        });
      }

      throw new Error(`Unexpected apiFetch call: ${method} ${path}`);
    });

    await act(async () => {
      root.render(React.createElement(SchedulePanel));
    });
    await flushEffects();

    await openCustomCreateModal(container);
    await fillCustomTaskForm({ useNewSession: true });

    const confirmButton = document.querySelector('[data-testid="schedule-editor-confirm"]') as HTMLButtonElement | null;
    expect(confirmButton).toBeTruthy();
    expect(confirmButton?.disabled).toBe(false);

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
    await flushEffects();

    expect(createThreadBodies).toEqual([{ title: '周报提醒' }]);
    expect(createTaskBodies).toHaveLength(1);
    expect(createTaskBodies[0]).toMatchObject({
      templateId: 'reminder',
      params: { message: '提醒我整理周报' },
      display: {
        label: '周报提醒',
        category: 'system',
        description: '提醒我整理周报',
      },
      deliveryThreadId: 'thread-new-001',
      trigger: {
        type: 'cron',
        expression: '30 9 * * *',
      },
    });
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
      type: 'success',
      title: '创建成功',
      message: '定时任务「周报提醒」已创建',
    });
  });

  it('shows an error toast when creating a custom schedule task fails', async () => {
    apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';

      if (path === '/api/schedule/tasks' && method === 'GET') {
        return jsonResponse({ tasks: [] });
      }
      if (path.startsWith('/api/schedule/runs?') && method === 'GET') {
        return jsonResponse({ runs: [], nextCursor: null, hasMore: false });
      }
      if (path === '/api/schedule/control' && method === 'GET') {
        return jsonResponse({ global: { enabled: true }, overrides: [] });
      }
      if (path === '/api/threads' && method === 'GET') {
        return jsonResponse({
          threads: [{ id: 'thread-existing-001', title: '已有会话 1' }],
        });
      }
      if (path === '/api/threads' && method === 'POST') {
        return jsonResponse({ id: 'thread-new-001' });
      }
      if (path === '/api/schedule/tasks' && method === 'POST') {
        return jsonResponse({ error: 'failed' }, 500);
      }

      throw new Error(`Unexpected apiFetch call: ${method} ${path}`);
    });

    await act(async () => {
      root.render(React.createElement(SchedulePanel));
    });
    await flushEffects();

    await openCustomCreateModal(container);
    await fillCustomTaskForm({ useNewSession: true });

    const confirmButton = document.querySelector('[data-testid="schedule-editor-confirm"]') as HTMLButtonElement | null;
    expect(confirmButton).toBeTruthy();
    expect(confirmButton?.disabled).toBe(false);

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
      type: 'error',
      title: '创建失败',
      message: '定时任务创建失败，请稍后重试',
    });
  });

  it('creates an interval schedule task with a real interval trigger', async () => {
    const createThreadBodies: Array<{ title?: string }> = [];
    const createTaskBodies: Array<Record<string, unknown>> = [];

    apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';

      if (path === '/api/schedule/tasks' && method === 'GET') {
        return jsonResponse({ tasks: [] });
      }
      if (path.startsWith('/api/schedule/runs?') && method === 'GET') {
        return jsonResponse({ runs: [], nextCursor: null, hasMore: false });
      }
      if (path === '/api/schedule/control' && method === 'GET') {
        return jsonResponse({ global: { enabled: true }, overrides: [] });
      }
      if (path === '/api/threads' && method === 'GET') {
        return jsonResponse({
          threads: [{ id: 'thread-existing-001', title: '已有会话 1' }],
        });
      }
      if (path === '/api/threads' && method === 'POST') {
        createThreadBodies.push(JSON.parse(String(init?.body ?? '{}')) as { title?: string });
        return jsonResponse({ id: 'thread-new-002' });
      }
      if (path === '/api/schedule/tasks' && method === 'POST') {
        createTaskBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return jsonResponse({
          success: true,
          task: {
            id: 'dyn-interval-1',
            label: '间隔提醒',
            description: '每隔两小时提醒我检查数据',
            trigger: { type: 'interval', ms: 7_200_000 },
          },
        });
      }

      throw new Error(`Unexpected apiFetch call: ${method} ${path}`);
    });

    await act(async () => {
      root.render(React.createElement(SchedulePanel));
    });
    await flushEffects();

    await openCustomCreateModal(container);
    await fillIntervalTaskForm({ useNewSession: true });

    const confirmButton = document.querySelector('[data-testid="schedule-editor-confirm"]') as HTMLButtonElement | null;
    expect(confirmButton?.disabled).toBe(false);

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
    await flushEffects();

    expect(createThreadBodies).toEqual([{ title: '间隔提醒' }]);
    expect(createTaskBodies).toHaveLength(1);
    expect(createTaskBodies[0]).toMatchObject({
      templateId: 'reminder',
      params: { message: '每隔两小时提醒我检查数据' },
      deliveryThreadId: 'thread-new-002',
      trigger: {
        type: 'interval',
        ms: 7_200_000,
      },
    });
  });

  it('edits an interval schedule task with a real interval trigger payload', async () => {
    const patchTaskBodies: Array<Record<string, unknown>> = [];

    apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';

      if (path === '/api/schedule/tasks' && method === 'GET') {
        return jsonResponse({
          tasks: [
            {
              id: 'task-interval-1',
              dynamicTaskId: 'dyn-interval-1',
              deliveryThreadId: 'thread-existing-001',
              threadTitle: '已有会话 1',
              source: 'dynamic',
              trigger: { type: 'interval', ms: 7_200_000 },
              enabled: true,
              effectiveEnabled: true,
              display: {
                label: '间隔提醒',
                description: '每隔两小时提醒我检查数据',
              },
              lastRun: null,
              subjectPreview: null,
            },
          ],
        });
      }
      if (path.startsWith('/api/schedule/runs?') && method === 'GET') {
        return jsonResponse({ runs: [], nextCursor: null, hasMore: false });
      }
      if (path === '/api/schedule/control' && method === 'GET') {
        return jsonResponse({ global: { enabled: true }, overrides: [] });
      }
      if (path === '/api/threads' && method === 'GET') {
        return jsonResponse({
          threads: [{ id: 'thread-existing-001', title: '已有会话 1' }],
        });
      }
      if (path === '/api/schedule/tasks/dyn-interval-1' && method === 'PATCH') {
        patchTaskBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return jsonResponse({ success: true });
      }

      throw new Error(`Unexpected apiFetch call: ${method} ${path}`);
    });

    await act(async () => {
      root.render(React.createElement(SchedulePanel));
    });
    await flushEffects();

    await switchToCardView(container);

    const editButton = document.querySelector('[data-testid="scheduled-task-card-edit-dyn-interval-1"]') as HTMLElement | null;
    expect(editButton).toBeTruthy();
    expect(editButton?.getAttribute('aria-disabled')).not.toBe('true');

    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(document.body.textContent).toContain('编辑定时任务');

    const confirmButton = document.querySelector('[data-testid="schedule-editor-confirm"]') as HTMLButtonElement | null;
    expect(confirmButton).toBeTruthy();
    expect(confirmButton?.disabled).toBe(false);

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
    await flushEffects();

    expect(patchTaskBodies).toHaveLength(1);
    expect(patchTaskBodies[0]).toMatchObject({
      trigger: {
        type: 'interval',
        ms: 7_200_000,
      },
      params: { message: '每隔两小时提醒我检查数据' },
      display: {
        label: '间隔提醒',
        description: '每隔两小时提醒我检查数据',
      },
      deliveryThreadId: 'thread-existing-001',
      enabled: true,
    });
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
      type: 'success',
      title: '编辑成功',
      message: '定时任务「间隔提醒」已更新',
    });
  });

  it('shows a success toast after deleting a dynamic schedule task', async () => {
    apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';

      if (path === '/api/schedule/tasks' && method === 'GET') {
        return jsonResponse({
          tasks: [
            {
              id: 'task-1',
              dynamicTaskId: 'dyn-1',
              deliveryThreadId: 'thread-1',
              threadTitle: '已有会话 1',
              source: 'dynamic',
              trigger: { type: 'cron', expression: '30 9 * * *' },
              enabled: true,
              effectiveEnabled: true,
              display: {
                label: '周报提醒',
                description: '提醒我整理周报',
              },
              lastRun: null,
              subjectPreview: null,
            },
          ],
        });
      }
      if (path.startsWith('/api/schedule/runs?') && method === 'GET') {
        return jsonResponse({ runs: [], nextCursor: null, hasMore: false });
      }
      if (path.startsWith('/api/schedule/runs?') && method === 'GET') {
        return jsonResponse({ runs: [], nextCursor: null, hasMore: false });
      }
      if (path === '/api/schedule/control' && method === 'GET') {
        return jsonResponse({ global: { enabled: true }, overrides: [] });
      }
      if (path === '/api/schedule/tasks/dyn-1' && method === 'DELETE') {
        return jsonResponse({ success: true });
      }

      throw new Error(`Unexpected apiFetch call: ${method} ${path}`);
    });

    await act(async () => {
      root.render(React.createElement(SchedulePanel));
    });
    await flushEffects();

    await switchToCardView(container);

    const deleteButtonsBeforeConfirm = getDeleteButtons(document.body);
    expect(deleteButtonsBeforeConfirm).toHaveLength(1);

    await act(async () => {
      (deleteButtonsBeforeConfirm[0] as HTMLElement | undefined)?.click();
    });
    await flushEffects();

    const deleteButtons = getDeleteButtons(document.body);
    expect(deleteButtons).toHaveLength(2);

    await act(async () => {
      (deleteButtons[1] as HTMLElement | undefined)?.click();
    });
    await flushEffects();

    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
      type: 'success',
      title: '删除成功',
      message: '定时任务「周报提醒」已删除',
    });
  });

  it('shows an error toast when deleting a dynamic schedule task fails', async () => {
    apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';

      if (path === '/api/schedule/tasks' && method === 'GET') {
        return jsonResponse({
          tasks: [
            {
              id: 'task-1',
              dynamicTaskId: 'dyn-1',
              deliveryThreadId: 'thread-1',
              threadTitle: '已有会话 1',
              source: 'dynamic',
              trigger: { type: 'cron', expression: '30 9 * * *' },
              enabled: true,
              effectiveEnabled: true,
              display: {
                label: '周报提醒',
                description: '提醒我整理周报',
              },
              lastRun: null,
              subjectPreview: null,
            },
          ],
        });
      }
      if (path.startsWith('/api/schedule/runs?') && method === 'GET') {
        return jsonResponse({ runs: [], nextCursor: null, hasMore: false });
      }
      if (path === '/api/schedule/control' && method === 'GET') {
        return jsonResponse({ global: { enabled: true }, overrides: [] });
      }
      if (path === '/api/schedule/tasks/dyn-1' && method === 'DELETE') {
        return jsonResponse({ error: 'failed' }, 500);
      }

      throw new Error(`Unexpected apiFetch call: ${method} ${path}`);
    });

    await act(async () => {
      root.render(React.createElement(SchedulePanel));
    });
    await flushEffects();

    await switchToCardView(container);

    const deleteButtonsBeforeConfirm = getDeleteButtons(document.body);
    expect(deleteButtonsBeforeConfirm).toHaveLength(1);

    await act(async () => {
      (deleteButtonsBeforeConfirm[0] as HTMLElement | undefined)?.click();
    });
    await flushEffects();

    const deleteButtons = getDeleteButtons(document.body);
    expect(deleteButtons).toHaveLength(2);

    await act(async () => {
      (deleteButtons[1] as HTMLElement | undefined)?.click();
    });
    await flushEffects();

    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
      type: 'error',
      title: '删除失败',
      message: '定时任务删除失败，请稍后重试',
    });
  });

  it('renders four template cards in card-view empty state with expected layout styles', async () => {
    apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';

      if (path === '/api/schedule/tasks' && method === 'GET') {
        return jsonResponse({ tasks: [] });
      }
      if (path.startsWith('/api/schedule/runs?') && method === 'GET') {
        return jsonResponse({ runs: [], nextCursor: null, hasMore: false });
      }
      if (path === '/api/schedule/control' && method === 'GET') {
        return jsonResponse({ global: { enabled: true }, overrides: [] });
      }

      throw new Error(`Unexpected apiFetch call: ${method} ${path}`);
    });

    await act(async () => {
      root.render(React.createElement(SchedulePanel));
    });
    await flushEffects();

    await switchToCardView(container);
    await flushEffects();

    const toggle = container.querySelector('[data-testid="scheduled-task-empty-template-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();
    expect(toggle?.textContent).toContain('热门模板推荐');
    expect(toggle?.className).toContain('text-[14px]');
    expect(toggle?.className).toContain('text-[rgba(89,89,89,1)]');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');

    const cards = container.querySelectorAll(
      '[data-testid^="scheduled-task-empty-template-"]:not([data-testid="scheduled-task-empty-template-toggle"])',
    );
    expect(cards).toHaveLength(4);

    const firstCard = cards[0] as HTMLButtonElement;
    expect(firstCard.className).toContain('h-[214px]');
    expect(firstCard.className).toContain('gap-5');
    expect(firstCard.className).toContain('pt-7');
    expect(firstCard.className).toContain('pb-7');
    expect(firstCard.className).toContain('px-6');

    const icon = firstCard.querySelector('img') as HTMLImageElement | null;
    expect(icon?.getAttribute('src')).toBe('/icons/schedule.svg');

    const description = firstCard.querySelector('.text-\\[rgba\\(89\\,89\\,89\\,1\\)\\]') as HTMLSpanElement | null;
    expect(description).toBeTruthy();

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(
      container.querySelectorAll(
        '[data-testid^="scheduled-task-empty-template-"]:not([data-testid="scheduled-task-empty-template-toggle"])',
      ),
    ).toHaveLength(0);

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(
      container.querySelectorAll(
        '[data-testid^="scheduled-task-empty-template-"]:not([data-testid="scheduled-task-empty-template-toggle"])',
      ),
    ).toHaveLength(4);
  });

  it('disables edit actions for dynamic tasks outside the editor range and supports go-edit action in tooltip', async () => {
    vi.useFakeTimers();
    apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';

      if (path === '/api/schedule/tasks' && method === 'GET') {
        return jsonResponse({
          tasks: [
            {
              id: 'task-1',
              dynamicTaskId: 'dyn-1',
              deliveryThreadId: 'thread-1',
              threadTitle: '已有会话 1',
              source: 'dynamic',
              trigger: { type: 'interval', ms: 10_500 },
              enabled: true,
              effectiveEnabled: true,
              display: {
                label: '复杂间隔提醒',
                description: '请去对话中修改',
              },
              lastRun: null,
              subjectPreview: null,
            },
          ],
        });
      }
      if (path.startsWith('/api/schedule/runs?') && method === 'GET') {
        return jsonResponse({ runs: [], nextCursor: null, hasMore: false });
      }
      if (path === '/api/schedule/control' && method === 'GET') {
        return jsonResponse({ global: { enabled: true }, overrides: [] });
      }

      throw new Error(`Unexpected apiFetch call: ${method} ${path}`);
    });

    try {
      await act(async () => {
        root.render(React.createElement(SchedulePanel));
      });
      await flushEffects();

      const calendarMenuButton = document.querySelector('[aria-label="操作 复杂间隔提醒"]') as HTMLButtonElement | null;
      expect(calendarMenuButton).toBeTruthy();
      await act(async () => {
        calendarMenuButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flushEffects();

      const calendarEditButton = document.querySelector('[data-testid="scheduled-task-calendar-edit-dyn-1"]') as HTMLElement | null;
      expect(calendarEditButton).toBeTruthy();
      expect(calendarEditButton?.getAttribute('aria-disabled')).toBe('true');

      await switchToCardView(container);

      const cardEditButton = document.querySelector('[data-testid="scheduled-task-card-edit-dyn-1"]') as HTMLElement | null;
      expect(cardEditButton).toBeTruthy();
      expect(cardEditButton?.getAttribute('aria-disabled')).toBe('true');

      const detailTrigger = container.querySelector('article[role="button"]') as HTMLElement | null;
      expect(detailTrigger).toBeTruthy();
      await act(async () => {
        detailTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flushEffects();

      const detailEditButton = document.querySelector('[data-testid="scheduled-task-detail-edit"]') as HTMLButtonElement | null;
      expect(detailEditButton).toBeTruthy();
      expect(detailEditButton?.disabled).toBe(true);

      const tooltipTrigger = detailEditButton?.parentElement?.parentElement as HTMLElement | null;
      expect(tooltipTrigger).toBeTruthy();
      await act(async () => {
        tooltipTrigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        vi.advanceTimersByTime(200);
      });
      await flushEffects();

      expect(document.body.textContent).toContain('该定时任务仅支持通过对话进行编辑');

      const goEditButton = document.querySelector('[data-testid="scheduled-task-detail-go-edit"]') as HTMLButtonElement | null;
      expect(goEditButton).toBeTruthy();
      await act(async () => {
        goEditButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flushEffects();

      expect(vitestRouter.navigate).toHaveBeenCalledWith('/thread/thread-1', { preventScrollReset: true });
      expect(useChatStore.getState().pendingChatInsert).toMatchObject({
        threadId: 'thread-1',
        text: '按照以下要求修改定时任务「复杂间隔提醒」（任务ID：dyn-1）：',
      });
      expect(useChatStore.getState().pendingChatInsert?.text).not.toContain('执行频率');
      expect(useChatStore.getState().pendingChatInsert?.text).not.toContain('提示词');
    } finally {
      vi.useRealTimers();
    }
  });
});
