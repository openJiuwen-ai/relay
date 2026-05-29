/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationCard } from '@/components/AuthorizationCard';
import type { AuthPendingRequest } from '@/hooks/useAuthorization';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

const request: AuthPendingRequest = {
  requestId: 'auth-1',
  agentId: 'codex',
  threadId: 'thread-1',
  action: 'cron_create_job',
  reason:
    '工具 cron_create_job 需要授权才能执行\n安全风险评估：🔴 高风险\n> 该指令会创建每天上午 10 点运行的定时任务。\n参数： json { "name": "睡前故事生成", "cron_expr": "0 10 * * *" }\n匹配规则：tools.cron_create_job\n> 选择「总是允许」将自动放行所有 cron_create_job 调用',
  context: '您可以随时在安全管理中配置或修改安全策略',
  createdAt: Date.now(),
};

describe('AuthorizationCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders the first reason line as the title and removes it from the description body', () => {
    act(() => {
      root.render(React.createElement(AuthorizationCard, { request, onRespond: vi.fn() }));
    });

    const card = container.querySelector('[data-testid="authorization-card"]') as HTMLDivElement | null;
    const title = container.querySelector('[data-testid="authorization-card-title"]') as HTMLDivElement | null;
    const description = container.querySelector(
      '[data-testid="authorization-card-description"]',
    ) as HTMLParagraphElement | null;
    const helper = container.querySelector('[data-testid="authorization-card-helper"]') as HTMLParagraphElement | null;

    expect(card).not.toBeNull();
    expect(card?.className).toContain('max-w-[482px]');
    expect(card?.className).toContain('min-h-[140px]');
    expect(card?.className).toContain('rounded-[12px]');

    expect(title?.textContent).toBe('工具 cron_create_job 需要授权才能执行');
    expect(title?.className).toContain('text-[14px]');
    expect(title?.className).toContain('font-semibold');

    expect(description?.textContent).toContain('安全风险评估：🔴 高风险');
    expect(description?.textContent).not.toContain('工具 cron_create_job 需要授权才能执行');
    expect(description?.className).toContain('text-[12px]');
    expect(description?.className).toContain('whitespace-pre-wrap');
    expect(description?.className).toContain('break-words');

    expect(helper?.textContent).toContain('安全管理');
    expect(helper?.className).toContain('text-[12px]');
    expect(
      container.querySelector('[data-testid="authorization-card-security-management"]')?.textContent,
    ).toBe('安全管理');

    expect(container.querySelector('[data-testid="authorization-card-allow-once"]')?.textContent).toBe('本次允许');
    expect(container.querySelector('[data-testid="authorization-card-allow-always"]')?.textContent).toBe('总是允许');
    expect(container.querySelector('[data-testid="authorization-card-deny"]')?.textContent).toBe('拒绝');
  });

  it('uses the first plain-text reason line as the title when markdown is absent', async () => {
    const plainReasonRequest: AuthPendingRequest = {
      ...request,
      reason: '工具 file_delete 需要授权才能执行\n将删除临时文件。',
    };

    await act(async () => {
      root.render(React.createElement(AuthorizationCard, { request: plainReasonRequest, onRespond: vi.fn() }));
    });

    expect(container.querySelector('[data-testid="authorization-card-title"]')?.textContent).toBe(
      '工具 file_delete 需要授权才能执行',
    );
    expect(container.querySelector('[data-testid="authorization-card-description"]')?.textContent).toContain(
      '将删除临时文件。',
    );
  });

  it('extracts params json block and shows raw json in collapsible details', async () => {
    const paramsReasonRequest: AuthPendingRequest = {
      ...request,
      reason:
        'tool mcp_exec_command requires approval\nrisk: medium\n参数：\njson\n{\n"command": "dir /b *.md2 2>nul || echo not_found",\n"workdir": "D:\\\\CODE\\\\relay-claw-fml\\\\workspace"\n}\nrule: tools.mcp_exec_command.*',
    };

    await act(async () => {
      root.render(React.createElement(AuthorizationCard, { request: paramsReasonRequest, onRespond: vi.fn() }));
    });

    expect(container.querySelector('[data-testid="authorization-card-params"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="authorization-card-params-raw"]')?.textContent).toContain(
      '"command": "dir /b *.md2 2>nul || echo not_found"',
    );
    expect(container.querySelector('[data-testid="authorization-card-params-raw"]')?.textContent).toContain(
      '"workdir": "D:\\\\CODE\\\\relay-claw-fml\\\\workspace"',
    );
  });

  it('falls back to the full reason when it is a single line', async () => {
    const singleLineRequest: AuthPendingRequest = {
      ...request,
      reason: '仅本次需要写入工作区文件。',
    };

    await act(async () => {
      root.render(React.createElement(AuthorizationCard, { request: singleLineRequest, onRespond: vi.fn() }));
    });

    expect(container.querySelector('[data-testid="authorization-card-title"]')?.textContent).toBe(
      '仅本次需要写入工作区文件。',
    );
    expect(container.querySelector('[data-testid="authorization-card-description"]')?.textContent).toBe(
      '仅本次需要写入工作区文件。',
    );
  });

  it('calls the matching action payload for each button', async () => {
    const onRespond = vi.fn();

    await act(async () => {
      root.render(React.createElement(AuthorizationCard, { request, onRespond }));
    });

    await act(async () => {
      (container.querySelector('[data-testid="authorization-card-allow-once"]') as HTMLButtonElement | null)?.click();
    });
    expect(onRespond).toHaveBeenLastCalledWith('auth-1', true, 'once');

    await act(async () => {
      root.render(React.createElement(AuthorizationCard, { request, onRespond }));
    });
    await act(async () => {
      (container.querySelector('[data-testid="authorization-card-allow-always"]') as HTMLButtonElement | null)?.click();
    });
    expect(onRespond).toHaveBeenLastCalledWith('auth-1', true, 'global');

    await act(async () => {
      root.render(React.createElement(AuthorizationCard, { request, onRespond }));
    });
    await act(async () => {
      (container.querySelector('[data-testid="authorization-card-deny"]') as HTMLButtonElement | null)?.click();
    });
    expect(onRespond).toHaveBeenLastCalledWith('auth-1', false, 'once');
  });

  it('switches to the clicked disabled button while the response is pending', async () => {
    const deferred = createDeferred<void>();
    const onRespond = vi.fn(() => deferred.promise);

    await act(async () => {
      root.render(React.createElement(AuthorizationCard, { request, onRespond }));
    });

    await act(async () => {
      (container.querySelector('[data-testid="authorization-card-allow-once"]') as HTMLButtonElement | null)?.click();
      await Promise.resolve();
    });

    const submittingButton = container.querySelector(
      '[data-testid="authorization-card-submitting-action"]',
    ) as HTMLButtonElement | null;

    expect(submittingButton?.textContent).toBe('本次允许');
    expect(submittingButton?.disabled).toBe(true);
    expect(submittingButton?.className).toContain('ui-button-default');
    expect(container.querySelector('[data-testid="authorization-card-allow-always"]')).toBeNull();
    expect(container.querySelector('[data-testid="authorization-card-deny"]')).toBeNull();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
  });

  it('opens security management from the helper link', async () => {
    const onOpenSecurityManagement = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(AuthorizationCard, {
          request,
          onRespond: vi.fn(),
          onOpenSecurityManagement,
        }),
      );
    });

    await act(async () => {
      (
        container.querySelector('[data-testid="authorization-card-security-management"]') as HTMLButtonElement | null
      )?.click();
    });

    expect(onOpenSecurityManagement).toHaveBeenCalledTimes(1);
  });
});
