/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import { ScheduleTaskEditorModal } from '@/components/schedule/components/ScheduleTaskEditorModal';
import { createEmptyCustomScheduleTaskDraft } from '@/components/schedule/schedule-template-catalog';
import type { ScheduleTaskDraft } from '@/components/schedule/schedule-template-types';

const draft: ScheduleTaskDraft = {
  source: 'custom',
  taskName: 'test task',
  prompt: 'test prompt',
  frequency: {
    type: 'daily',
    time: '09:00:00',
  },
  enabled: true,
  sessionId: 'mock-session-001',
};

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function setInputValue(element: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function toDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateDisplay(value: string): string {
  return value.replace(/-/g, '/');
}

function expectPanelInFloatingLayer(panel: HTMLElement | null) {
  expect(panel?.parentElement?.className).toContain('fixed');
  expect(panel?.parentElement?.className).toContain('z-[70]');
}

describe('ScheduleTaskEditorModal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.useRealTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(
      jsonResponse({
        threads: [
          { id: 'mock-session-001', title: '本地会话 1' },
          { id: 'mock-session-002', title: '本地会话 2' },
          { id: 'mock-session-003', title: '本地会话 3' },
        ],
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders existing session dropdown as a custom panel and updates the selected value', async () => {
    await act(async () => {
      root.render(React.createElement(ScheduleTaskEditorModal, { open: true, draft, onClose: vi.fn(), onConfirm: vi.fn() }));
    });
    await flushEffects();

    expect(apiFetchMock).toHaveBeenCalledWith('/api/threads');

    const trigger = document.body.querySelector('[data-testid="schedule-editor-session-select"]') as HTMLButtonElement | null;
    expect(trigger).toBeTruthy();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const panel = document.body.querySelector('[data-testid="schedule-editor-session-panel"]') as HTMLDivElement | null;
    expect(panel).toBeTruthy();
    expectPanelInFloatingLayer(panel);
    expect(panel?.className).toContain('rounded-[12px]');
    expect(panel?.className).toContain('shadow-[0_12px_32px_rgba(16,24,40,0.12)]');

    const option = document.body.querySelector(
      '[data-testid="schedule-editor-session-option-mock-session-003"]',
    ) as HTMLButtonElement | null;
    expect(option).toBeTruthy();
    const optionLabel = (document.body.querySelector(
      '[data-testid="schedule-editor-session-option-title-mock-session-003"]',
    ) as HTMLSpanElement | null)?.textContent ?? '';

    await act(async () => {
      option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(document.body.querySelector('[data-testid="schedule-editor-session-panel"]')).toBeNull();
    expect(trigger?.textContent).toContain(optionLabel);
  });

  it('caps the task name input at 64 characters', async () => {
    await act(async () => {
      root.render(React.createElement(ScheduleTaskEditorModal, { open: true, draft, onClose: vi.fn(), onConfirm: vi.fn() }));
    });
    await flushEffects();

    const taskNameInput = document.body.querySelector('[data-testid="schedule-editor-task-name"]') as HTMLInputElement | null;
    expect(taskNameInput).toBeTruthy();
    expect(taskNameInput?.maxLength).toBe(64);
  });

  it('shows placeholders for daily time and existing session in custom create mode', async () => {
    await act(async () => {
      root.render(
        React.createElement(ScheduleTaskEditorModal, {
          open: true,
          draft: createEmptyCustomScheduleTaskDraft(),
          onClose: vi.fn(),
          onConfirm: vi.fn(),
        }),
      );
    });
    await flushEffects();

    const timeTrigger = document.body.querySelector(
      '[data-testid="schedule-editor-daily-time-trigger"]',
    ) as HTMLButtonElement | null;
    expect(timeTrigger).toBeTruthy();
    expect(timeTrigger?.textContent).toContain('00:00');
    const timeLabel = timeTrigger?.querySelector('span');
    expect(timeLabel?.className).toContain('text-[#98A2B3]');

    const sessionTrigger = document.body.querySelector(
      '[data-testid="schedule-editor-session-select"]',
    ) as HTMLButtonElement | null;
    expect(sessionTrigger).toBeTruthy();
    const sessionLabel = sessionTrigger?.querySelector('span:first-child') as HTMLSpanElement | null;
    expect(sessionLabel?.className).toContain('truncate');
    expect(sessionLabel?.className).toContain('whitespace-nowrap');
    expect(sessionTrigger?.textContent).toContain('请选择');
  });
  it('renders frequency labels as 重复 / 按间隔 / 单次', async () => {
    await act(async () => {
      root.render(React.createElement(ScheduleTaskEditorModal, { open: true, draft, onClose: vi.fn(), onConfirm: vi.fn() }));
    });
    await flushEffects();

    expect(document.body.querySelector('[data-testid="schedule-editor-frequency-daily"]')?.textContent).toContain('重复');
    expect(document.body.querySelector('[data-testid="schedule-editor-frequency-interval"]')?.textContent).toContain('按间隔');
    expect(document.body.querySelector('[data-testid="schedule-editor-frequency-once"]')?.textContent).toContain('单次');
  });

  it('renders interval value and unit controls and updates the selected unit', async () => {
    const intervalDraft: ScheduleTaskDraft = {
      ...draft,
      frequency: {
        type: 'interval',
        interval: 2,
        unit: 'hour',
      },
    };

    await act(async () => {
      root.render(
        React.createElement(ScheduleTaskEditorModal, { open: true, draft: intervalDraft, onClose: vi.fn(), onConfirm: vi.fn() }),
      );
    });
    await flushEffects();

    const intervalInput = document.body.querySelector('[data-testid="schedule-editor-interval-value"]') as HTMLInputElement | null;
    expect(intervalInput).toBeTruthy();
    expect(intervalInput?.value).toBe('2');

    const trigger = document.body.querySelector('[data-testid="schedule-editor-interval-unit"]') as HTMLButtonElement | null;
    expect(trigger).toBeTruthy();
    expect(trigger?.textContent).toContain('小时');

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const panel = document.body.querySelector('[data-testid="schedule-editor-interval-unit-panel"]') as HTMLDivElement | null;
    expect(panel).toBeTruthy();
    expectPanelInFloatingLayer(panel);
    expect(panel?.className).toContain('rounded-[12px]');
    expect(panel?.className).toContain('shadow-[0_12px_32px_rgba(16,24,40,0.12)]');

    const option = document.body.querySelector(
      '[data-testid="schedule-editor-interval-unit-option-minute"]',
    ) as HTMLButtonElement | null;
    expect(option).toBeTruthy();

    await act(async () => {
      option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(document.body.querySelector('[data-testid="schedule-editor-interval-unit-panel"]')).toBeNull();
    expect(trigger?.textContent).toContain('分钟');
  });

  it('disables confirm for interval values below 10 seconds and enables it for supported intervals', async () => {
    const confirmSpy = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ScheduleTaskEditorModal, {
          open: true,
          draft: {
            ...draft,
            frequency: { type: 'interval', interval: 1, unit: 'minute' },
          },
          onClose: vi.fn(),
          onConfirm: confirmSpy,
        }),
      );
    });
    await flushEffects();

    const intervalButton = document.body.querySelector('[data-testid="schedule-editor-frequency-interval"]') as HTMLButtonElement | null;
    expect(intervalButton).toBeTruthy();

    const input = document.body.querySelector('[data-testid="schedule-editor-interval-value"]') as HTMLInputElement | null;
    const unitTrigger = document.body.querySelector('[data-testid="schedule-editor-interval-unit"]') as HTMLButtonElement | null;
    const confirmButton = document.body.querySelector('[data-testid="schedule-editor-confirm"]') as HTMLButtonElement | null;
    expect(input).toBeTruthy();
    expect(unitTrigger).toBeTruthy();
    expect(confirmButton).toBeTruthy();

    await act(async () => {
      unitTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const secondOption = document.body.querySelector(
      '[data-testid="schedule-editor-interval-unit-option-second"]',
    ) as HTMLButtonElement | null;
    expect(secondOption).toBeTruthy();

    await act(async () => {
      secondOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    act(() => {
      setInputValue(input!, '5');
    });
    expect(confirmButton?.disabled).toBe(true);

    act(() => {
      setInputValue(input!, '10');
    });
    expect(confirmButton?.disabled).toBe(false);
  });

  it('opens the once date picker as a calendar panel and only allows selecting today or future dates', async () => {
    const initialDate = new Date();
    initialDate.setDate(initialDate.getDate() + 1);
    const nextDate = new Date(initialDate);
    nextDate.setDate(nextDate.getDate() + 3);
    const previousDate = new Date();
    previousDate.setDate(previousDate.getDate() - 1);
    const initialDateValue = toDateValue(initialDate);
    const nextDateValue = toDateValue(nextDate);
    const previousDateValue = toDateValue(previousDate);
    const onceDraft: ScheduleTaskDraft = {
      ...draft,
      frequency: {
        type: 'once',
        executeTime: `${initialDateValue} 09:00:00`,
      },
    };

    await act(async () => {
      root.render(React.createElement(ScheduleTaskEditorModal, { open: true, draft: onceDraft, onClose: vi.fn(), onConfirm: vi.fn() }));
    });
    await flushEffects();

    const trigger = document.body.querySelector('[data-testid="schedule-editor-once-date-trigger"]') as HTMLButtonElement | null;
    expect(trigger).toBeTruthy();
    expect(trigger?.textContent).toContain(toDateDisplay(initialDateValue));
    expect(trigger?.querySelector('svg')).not.toBeNull();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const panel = document.body.querySelector('[data-testid="schedule-editor-once-date-panel"]') as HTMLDivElement | null;
    expect(panel).toBeTruthy();
    expect(document.body.querySelector('[data-testid="schedule-editor-once-date-input"]')).toBeNull();

    const monthLabel = document.body.querySelector('[data-testid="schedule-editor-once-date-month-label"]') as HTMLDivElement | null;
    expect(monthLabel?.textContent).toContain(`${initialDate.getFullYear()}`);
    expect(monthLabel?.textContent).toContain(`${initialDate.getMonth() + 1}`);

    const previousDayButton = document.body.querySelector(
      `[data-testid="schedule-editor-once-date-day-${previousDateValue}"]`,
    ) as HTMLButtonElement | null;
    expect(previousDayButton).toBeTruthy();
    expect(previousDayButton?.disabled).toBe(true);

    const dayButton = document.body.querySelector(
      `[data-testid="schedule-editor-once-date-day-${nextDateValue}"]`,
    ) as HTMLButtonElement | null;
    expect(dayButton).toBeTruthy();
    expect(dayButton?.disabled).toBe(false);

    await act(async () => {
      dayButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(document.body.querySelector('[data-testid="schedule-editor-once-date-panel"]')).toBeNull();
    expect(trigger?.textContent).toContain(toDateDisplay(nextDateValue));
  });

  it('opens the once date picker upward and constrains the calendar scroll area when viewport space is limited', async () => {
    const onceDraft: ScheduleTaskDraft = {
      ...draft,
      frequency: {
        type: 'once',
        executeTime: '2026-04-09 09:00:00',
      },
    };
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const element = this as HTMLElement;
      if (element.querySelector('[data-testid="schedule-editor-once-date-trigger"]')) {
        return {
          x: 0,
          y: 520,
          width: 214,
          height: 44,
          top: 520,
          right: 214,
          bottom: 564,
          left: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });

    try {
      await act(async () => {
        root.render(
          React.createElement(ScheduleTaskEditorModal, { open: true, draft: onceDraft, onClose: vi.fn(), onConfirm: vi.fn() }),
        );
      });
      await flushEffects();

      const trigger = document.body.querySelector('[data-testid="schedule-editor-once-date-trigger"]') as HTMLButtonElement | null;
      expect(trigger).toBeTruthy();

      await act(async () => {
        trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flushEffects();

      const panel = document.body.querySelector('[data-testid="schedule-editor-once-date-panel"]') as HTMLDivElement | null;
      expect(panel).toBeTruthy();
      expectPanelInFloatingLayer(panel);
      expect(panel?.className).toContain('bottom-[calc(100%+8px)]');
      expect(panel?.style.maxHeight).toBe('496px');

      const scrollArea = document.body.querySelector('[data-testid="schedule-editor-once-date-grid-scroll"]') as HTMLDivElement | null;
      expect(scrollArea).toBeTruthy();
      expect(scrollArea?.style.maxHeight).toBe('272px');
    } finally {
      rectSpy.mockRestore();
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  it('opens the daily time picker upward and constrains the option scroll area when viewport space is limited', async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const element = this as HTMLElement;
      if (element.querySelector('[data-testid="schedule-editor-daily-time-trigger"]')) {
        return {
          x: 0,
          y: 520,
          width: 214,
          height: 44,
          top: 520,
          right: 214,
          bottom: 564,
          left: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });

    try {
      await act(async () => {
        root.render(React.createElement(ScheduleTaskEditorModal, { open: true, draft, onClose: vi.fn(), onConfirm: vi.fn() }));
      });
      await flushEffects();

      const trigger = document.body.querySelector('[data-testid="schedule-editor-daily-time-trigger"]') as HTMLButtonElement | null;
      expect(trigger).toBeTruthy();

      await act(async () => {
        trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flushEffects();

      const panel = document.body.querySelector('[data-testid="schedule-editor-daily-time-panel"]') as HTMLDivElement | null;
      expect(panel).toBeTruthy();
      expectPanelInFloatingLayer(panel);
      expect(panel?.className).toContain('bottom-[calc(100%+8px)]');
      expect(panel?.style.maxHeight).toBe('496px');

      const hourScroll = document.body.querySelector('[data-testid="schedule-editor-daily-time-hour-scroll"]') as HTMLDivElement | null;
      const minuteScroll = document.body.querySelector('[data-testid="schedule-editor-daily-time-minute-scroll"]') as HTMLDivElement | null;
      expect(hourScroll?.style.maxHeight).toBe('308px');
      expect(minuteScroll?.style.maxHeight).toBe('308px');
    } finally {
      rectSpy.mockRestore();
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  it('disables past once times for today and blocks confirming a past time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T10:00:00+08:00'));

    const confirmSpy = vi.fn();
    const onceDraft: ScheduleTaskDraft = {
      ...draft,
      frequency: {
        type: 'once',
        executeTime: '2026-05-15 09:00:00',
      },
    };

    await act(async () => {
      root.render(React.createElement(ScheduleTaskEditorModal, { open: true, draft: onceDraft, onClose: vi.fn(), onConfirm: confirmSpy }));
    });
    await flushEffects();

    const confirmButton = document.body.querySelector('[data-testid="schedule-editor-confirm"]') as HTMLButtonElement | null;
    expect(confirmButton?.disabled).toBe(true);

    const trigger = document.body.querySelector('[data-testid="schedule-editor-once-time-trigger"]') as HTMLButtonElement | null;
    expect(trigger).toBeTruthy();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const disabledHourButton = document.body.querySelector('[data-testid="schedule-editor-once-time-hour-09"]') as HTMLButtonElement | null;
    const enabledHourButton = document.body.querySelector('[data-testid="schedule-editor-once-time-hour-10"]') as HTMLButtonElement | null;
    expect(disabledHourButton?.disabled).toBe(true);
    expect(enabledHourButton?.disabled).toBe(false);

    await act(async () => {
      enabledHourButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const disabledMinuteButton = document.body.querySelector('[data-testid="schedule-editor-once-time-minute-59"]') as HTMLButtonElement | null;
    const enabledMinuteButton = document.body.querySelector('[data-testid="schedule-editor-once-time-minute-00"]') as HTMLButtonElement | null;
    const futureMinuteButton = document.body.querySelector('[data-testid="schedule-editor-once-time-minute-01"]') as HTMLButtonElement | null;
    expect(disabledMinuteButton).toBeTruthy();
    expect(enabledMinuteButton?.disabled).toBe(false);
    expect(futureMinuteButton?.disabled).toBe(false);

    await act(async () => {
      futureMinuteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const panelConfirmButton = document.body.querySelector('[data-testid="schedule-editor-once-time-confirm"]') as HTMLButtonElement | null;
    expect(panelConfirmButton).toBeTruthy();

    await act(async () => {
      panelConfirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(trigger?.textContent).toContain('10:01');
    expect(confirmButton?.disabled).toBe(false);
  });

  it('opens the session panel upward and constrains the option scroll area when viewport space is limited', async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const element = this as HTMLElement;
      if (element.querySelector('[data-testid="schedule-editor-session-select"]')) {
        return {
          x: 0,
          y: 520,
          width: 214,
          height: 44,
          top: 520,
          right: 214,
          bottom: 564,
          left: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });

    try {
      await act(async () => {
        root.render(React.createElement(ScheduleTaskEditorModal, { open: true, draft, onClose: vi.fn(), onConfirm: vi.fn() }));
      });
      await flushEffects();

      const trigger = document.body.querySelector('[data-testid="schedule-editor-session-select"]') as HTMLButtonElement | null;
      expect(trigger).toBeTruthy();

      await act(async () => {
        trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flushEffects();

      const panel = document.body.querySelector('[data-testid="schedule-editor-session-panel"]') as HTMLDivElement | null;
      expect(panel).toBeTruthy();
      expectPanelInFloatingLayer(panel);
      expect(panel?.className).toContain('bottom-[calc(100%+8px)]');
      expect(panel?.style.maxHeight).toBe('496px');

      const scrollArea = document.body.querySelector('[data-testid="schedule-editor-session-scroll"]') as HTMLDivElement | null;
      expect(scrollArea?.style.maxHeight).toBe('480px');
    } finally {
      rectSpy.mockRestore();
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  it('renders the prompt count inside the prompt input container', async () => {
    await act(async () => {
      root.render(React.createElement(ScheduleTaskEditorModal, { open: true, draft, onClose: vi.fn(), onConfirm: vi.fn() }));
    });
    await flushEffects();

    const prompt = document.body.querySelector('[data-testid="schedule-editor-prompt"]') as HTMLTextAreaElement | null;
    expect(prompt).toBeTruthy();

    const promptContainer = document.body.querySelector(
      '[data-testid="schedule-editor-prompt-container"]',
    ) as HTMLDivElement | null;
    expect(promptContainer).toBeTruthy();

    const count = document.body.querySelector('[data-testid="schedule-editor-prompt-count"]') as HTMLSpanElement | null;
    expect(count).toBeTruthy();
    expect(count?.textContent).toBe(`${draft.prompt.length}/1000`);
    expect(promptContainer?.contains(prompt)).toBe(true);
    expect(promptContainer?.contains(count)).toBe(true);
    expect(promptContainer?.className).toContain('rounded-[6px]');
    expect(promptContainer?.className).toContain('relative');
    expect(prompt?.className).toContain('resize-none');
    expect(prompt?.style.height).toBe('140px');
    expect(prompt?.style.minHeight).toBe('112px');
    expect(prompt?.style.paddingBottom).toBe('36px');
    expect(prompt?.style.paddingRight).toBe('24px');
    expect(count?.parentElement?.className).toContain('absolute');
    expect(count?.parentElement?.className).toContain('inset-x-0');
    expect(count?.parentElement?.className).toContain('bottom-0');
    expect(count?.parentElement?.className).toContain('h-6');
    expect(count?.parentElement?.className).toContain('bg-white');
    expect(document.body.querySelector('[data-testid="schedule-editor-prompt-resize-handle"]')).toBeTruthy();
  });

  it('does not prefill once time when a non-once template switches to 单次', async () => {
    const templateDraft: ScheduleTaskDraft = {
      source: 'template',
      templateId: 'daily-ai-news',
      taskName: 'template task',
      prompt: 'template prompt',
      frequency: {
        type: 'daily',
        time: '09:00:00',
      },
      enabled: true,
      sessionId: 'mock-session-001',
    };

    await act(async () => {
      root.render(React.createElement(ScheduleTaskEditorModal, { open: true, draft: templateDraft, onClose: vi.fn(), onConfirm: vi.fn() }));
    });
    await flushEffects();

    const onceButton = document.body.querySelector('[data-testid="schedule-editor-frequency-once"]') as HTMLButtonElement | null;
    expect(onceButton).toBeTruthy();

    await act(async () => {
      onceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const timeTrigger = document.body.querySelector('[data-testid="schedule-editor-once-time-trigger"]') as HTMLButtonElement | null;
    expect(timeTrigger).toBeTruthy();
    expect(timeTrigger?.textContent).toContain('00:00');

    const timeLabel = timeTrigger?.querySelector('span');
    expect(timeLabel?.className).toContain('text-[#98A2B3]');
  });
  it('normalizes minute to the earliest allowed value when selecting today hour and confirming directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T10:05:00+08:00'));

    const onceDraft: ScheduleTaskDraft = {
      ...draft,
      frequency: {
        type: 'once',
        executeTime: '2026-05-15 11:00:00',
      },
    };

    await act(async () => {
      root.render(React.createElement(ScheduleTaskEditorModal, { open: true, draft: onceDraft, onClose: vi.fn(), onConfirm: vi.fn() }));
    });
    await flushEffects();

    const trigger = document.body.querySelector('[data-testid="schedule-editor-once-time-trigger"]') as HTMLButtonElement | null;
    expect(trigger).toBeTruthy();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const hourButton = document.body.querySelector('[data-testid="schedule-editor-once-time-hour-10"]') as HTMLButtonElement | null;
    expect(hourButton?.disabled).toBe(false);

    await act(async () => {
      hourButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    const minuteZeroButton = document.body.querySelector('[data-testid="schedule-editor-once-time-minute-00"]') as HTMLButtonElement | null;
    const minuteFiveButton = document.body.querySelector('[data-testid="schedule-editor-once-time-minute-05"]') as HTMLButtonElement | null;
    expect(minuteZeroButton?.disabled).toBe(true);
    expect(minuteFiveButton?.disabled).toBe(false);

    const panelValues = document.body.querySelectorAll('[data-testid="schedule-editor-once-time-panel"] span');
    expect(panelValues.item(0)?.textContent).toContain('10:05');

    const panelConfirmButton = document.body.querySelector('[data-testid="schedule-editor-once-time-confirm"]') as HTMLButtonElement | null;
    expect(panelConfirmButton).toBeTruthy();

    await act(async () => {
      panelConfirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(trigger?.textContent).toContain('10:05');
  });
});
