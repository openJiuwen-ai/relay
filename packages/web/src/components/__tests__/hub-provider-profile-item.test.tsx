/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubProviderProfileItem, type ProfileEditPayload } from '@/components/HubProviderProfileItem';
import type { ProfileItem } from '@/components/hub-provider-profiles.types';

const mockConfirm = vi.fn().mockResolvedValue(true);
vi.mock('@/components/useConfirm', () => ({
  useConfirm: () => mockConfirm,
}));

function queryButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`Missing button: ${text}`);
  }
  return button as HTMLButtonElement;
}

describe('HubProviderProfileItem', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('does not clear modelOverride when saving edit without override changes', async () => {
    const profile: ProfileItem = {
      id: 'claude-api',
      provider: 'claude-api',
      displayName: 'Claude API',
      name: 'Claude API',
      authType: 'api_key',
      protocol: 'anthropic',
      kind: 'api_key',
      builtin: false,
      mode: 'api_key',
      baseUrl: 'https://api.anthropic.com',
      models: ['claude-opus-4-1'],
      modelOverride: 'claude-opus-4-1',
      hasApiKey: true,
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:00:00.000Z',
    };
    const onSave = vi.fn<(payload: ProfileEditPayload) => Promise<void>>(async () => {});

    await act(async () => {
      root.render(<HubProviderProfileItem profile={profile} busy={false} onSave={onSave} onDelete={() => {}} />);
    });

    await act(async () => {
      queryButton(container, '编辑').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      queryButton(container, '保存').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0]![0] as ProfileEditPayload;
    expect(payload).toMatchObject({
      displayName: 'Claude API',
      baseUrl: 'https://api.anthropic.com',
      models: ['claude-opus-4-1'],
    });
    expect(Object.hasOwn(payload, 'modelOverride')).toBe(false);
  });

  it('sends empty baseUrl when clearing an API-key account base URL', async () => {
    const profile: ProfileItem = {
      id: 'codex-api',
      provider: 'codex-api',
      displayName: 'Codex API',
      name: 'Codex API',
      authType: 'api_key',
      protocol: 'openai',
      kind: 'api_key',
      builtin: false,
      mode: 'api_key',
      baseUrl: 'https://api.openai-proxy.dev',
      models: ['gpt-5.4'],
      hasApiKey: true,
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:00:00.000Z',
    };
    const onSave = vi.fn<(payload: ProfileEditPayload) => Promise<void>>(async () => {});

    await act(async () => {
      root.render(<HubProviderProfileItem profile={profile} busy={false} onSave={onSave} onDelete={() => {}} />);
    });

    await act(async () => {
      queryButton(container, '编辑').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const baseUrlInput = container.querySelector('input[placeholder*="API 服务地址"]') as HTMLInputElement | null;
    if (!baseUrlInput) throw new Error('Missing Base URL input');
    await act(async () => {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(baseUrlInput), 'value');
      descriptor?.set?.call(baseUrlInput, '');
      baseUrlInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      queryButton(container, '保存').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0]![0] as ProfileEditPayload;
    expect(payload.baseUrl).toBe('');
  });

  it('keeps the + 添加 model entry visible for built-in cards without binding-scope controls', async () => {
    const profile: ProfileItem = {
      id: 'codex-oauth',
      provider: 'codex-oauth',
      displayName: 'Codex (OAuth)',
      name: 'Codex (OAuth)',
      authType: 'oauth',
      protocol: 'openai',
      kind: 'builtin',
      builtin: true,
      mode: 'subscription',
      models: ['gpt-5.4'],
      hasApiKey: false,
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:00:00.000Z',
    };

    await act(async () => {
      root.render(
        <HubProviderProfileItem profile={profile} busy={false} onSave={vi.fn(async () => {})} onDelete={() => {}} />,
      );
    });

    expect(container.textContent).toContain('+ 添加');
    expect(container.textContent).not.toContain('编辑');
    expect(container.textContent).not.toContain('绑定范围');
    expect(container.textContent).not.toContain('设为 Codex 默认');
  });

  it('hides unsupported 测试 actions for non-api-key profiles', async () => {
    const profile: ProfileItem = {
      id: 'opencode-client-auth',
      provider: 'opencode-client-auth',
      displayName: 'OpenCode (client-auth)',
      name: 'OpenCode (client-auth)',
      authType: 'oauth',
      protocol: 'anthropic',
      kind: 'builtin',
      builtin: true,
      mode: 'subscription',
      models: ['claude-sonnet-4'],
      hasApiKey: false,
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:00:00.000Z',
      oauthLikeClient: 'opencode',
    };

    await act(async () => {
      root.render(
        <HubProviderProfileItem profile={profile} busy={false} onSave={vi.fn(async () => {})} onDelete={() => {}} />,
      );
    });

    expect(container.textContent).not.toContain('测试');
    expect(container.textContent).toContain('+ 添加');
    expect(container.textContent).toContain('OpenCode (client-auth)');
  });

  it('uses password input for API key edits and requires delete confirmation', async () => {
    const profile: ProfileItem = {
      id: 'codex-sponsor',
      provider: 'codex-sponsor',
      displayName: 'Codex Sponsor',
      name: 'Codex Sponsor',
      authType: 'api_key',
      protocol: 'openai',
      kind: 'api_key',
      builtin: false,
      mode: 'api_key',
      baseUrl: 'https://proxy.example',
      models: ['gpt-5.4'],
      hasApiKey: true,
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:00:00.000Z',
    };
    const onDelete = vi.fn();
    mockConfirm.mockResolvedValue(false);

    await act(async () => {
      root.render(
        <HubProviderProfileItem profile={profile} busy={false} onSave={vi.fn(async () => {})} onDelete={onDelete} />,
      );
    });

    await act(async () => {
      queryButton(container, '编辑').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const apiKeyInput = container.querySelector('input[type="password"]') as HTMLInputElement | null;
    expect(apiKeyInput).not.toBeNull();
    expect(apiKeyInput?.getAttribute('autocomplete')).toBe('off');

    await act(async () => {
      queryButton(container, '取消').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      queryButton(container, '删除').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();

    mockConfirm.mockResolvedValue(true);
    await act(async () => {
      queryButton(container, '删除').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
    mockConfirm.mockReset().mockResolvedValue(true);
  });

  it('saves ACP provider fields as structured payload', async () => {
    const profile: ProfileItem = {
      id: 'relay-teams-local',
      provider: 'relay-teams-local',
      displayName: 'Agent Teams Local',
      name: 'Agent Teams Local',
      authType: 'none',
      protocol: 'acp',
      kind: 'acp',
      builtin: false,
      mode: 'none',
      command: 'uv',
      args: ['--directory', '/opt/workspace/relay-teams', 'run', 'relay-teams', 'gateway', 'acp', 'stdio'],
      cwd: '/opt/workspace/relay-teams',
      envKeys: ['ACP_TRACE_STDIO'],
      modelAccessMode: 'clowder_default_profile',
      defaultModelProfileRef: 'default-openai',
      hasApiKey: false,
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:00:00.000Z',
    };
    const onSave = vi.fn<(payload: ProfileEditPayload) => Promise<void>>(async () => {});

    await act(async () => {
      root.render(
        <HubProviderProfileItem
          profile={profile}
          busy={false}
          acpModelProfiles={[
            {
              id: 'default-openai',
              displayName: 'Default OpenAI',
              name: 'Default OpenAI',
              provider: 'openai_compatible',
              model: 'gpt-4.1',
              baseUrl: 'https://api.openai.com/v1',
              hasApiKey: true,
              createdAt: '2026-03-18T00:00:00.000Z',
              updatedAt: '2026-03-18T00:00:00.000Z',
            },
          ]}
          onSave={onSave}
          onDelete={() => {}}
        />,
      );
    });

    await act(async () => {
      queryButton(container, '编辑').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const envInput = container.querySelector(
      'textarea[placeholder*="每行 KEY=value；留空保持现有值"]',
    ) as HTMLTextAreaElement | null;
    const argsInput = container.querySelector('textarea[placeholder*="参数按空格分隔"]') as HTMLTextAreaElement | null;
    expect(envInput).not.toBeNull();
    expect(argsInput).not.toBeNull();
    await act(async () => {
      argsInput?.dispatchEvent(new Event('focus', { bubbles: true }));
      const argsDescriptor = argsInput
        ? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(argsInput), 'value')
        : undefined;
      argsDescriptor?.set?.call(argsInput, '--directory "/opt/workspace/agent teams" run relay-teams gateway acp stdio');
      argsInput?.dispatchEvent(new Event('input', { bubbles: true }));
      argsInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      envInput?.dispatchEvent(new Event('focus', { bubbles: true }));
      const descriptor = envInput
        ? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(envInput), 'value')
        : undefined;
      descriptor?.set?.call(envInput, 'ACP_TRACE_STDIO=1\nRELAY_TEAMS_LOG_LEVEL=DEBUG');
      envInput?.dispatchEvent(new Event('input', { bubbles: true }));
      envInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      queryButton(container, '保存').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      displayName: 'Agent Teams Local',
      command: 'uv',
      args: ['--directory', '/opt/workspace/agent teams', 'run', 'relay-teams', 'gateway', 'acp', 'stdio'],
      cwd: '/opt/workspace/relay-teams',
      env: {
        ACP_TRACE_STDIO: '1',
        RELAY_TEAMS_LOG_LEVEL: 'DEBUG',
      },
      modelAccessMode: 'clowder_default_profile',
      defaultModelProfileRef: 'default-openai',
    } satisfies ProfileEditPayload);
  });
});
