/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentData } from '@/hooks/useAgentData';
import { FormContent } from '../components/FormContent';

const apiFetch = vi.fn();
const uploadAvatarAsset = vi.fn();

vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

vi.mock('../../hub-agent-editor.client', () => ({
  uploadAvatarAsset: (...args: unknown[]) => uploadAvatarAsset(...args),
}));

vi.mock('@/components/agent-management/components/BasicInfoSection', () => ({
  BasicInfoSection: ({
    onAvatarUpload,
    draftName,
    inlineNameError,
    modelError,
    onNameChange,
    onSelectModel,
    selectedModel,
  }: {
    draftName: string;
    inlineNameError: string | null;
    modelError: string | null;
    onAvatarUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onNameChange: (value: string) => void;
    onSelectModel: (id: string) => void;
    selectedModel: { name?: string } | null;
  }) => (
    <div>
      <input aria-label="名称" value={draftName} onChange={(event) => onNameChange(event.target.value)} />
      <input aria-label="头像" type="file" onChange={onAvatarUpload} />
      {inlineNameError ? <p data-testid="name-error">{inlineNameError}</p> : null}
      <span>{selectedModel?.name ?? '未选择'}</span>
      {modelError ? <p data-testid="model-error">{modelError}</p> : null}
      <button type="button" onClick={() => onSelectModel('model_config:huawei-maas:deepseek-v3.2')}>
        选择模型
      </button>
    </div>
  ),
}));

vi.mock('@/components/agent-management/components/FormSoulSection', () => ({
  FormSoulSection: () => <div />,
}));

vi.mock('@/components/agent-management/components/FormHeader', () => ({
  FormHeader: () => <div />,
}));

vi.mock('@/components/agent-management/components/FormSkillsSection', () => ({
  FormSkillsSection: ({
    skills,
    onSkillsChange,
  }: {
    skills: string[];
    onSkillsChange: (skills: string[]) => void;
  }) => (
    <div>
      <span data-testid="skills-value">{skills.join(',')}</span>
      <button type="button" onClick={() => onSkillsChange(['daily-briefing', 'email-manager'])}>
        选择技能
      </button>
    </div>
  ),
}));

vi.mock('@/components/agent-management/components/FormFooter', () => ({
  FormFooter: ({ onSave }: { onSave: () => void }) => <button type="button" onClick={onSave}>保存</button>,
}));

vi.mock('@/components/agent-management/components/FormStepNav', () => ({
  FormStepNav: () => <div />,
}));

vi.mock('@/components/agent-management/hooks/useModelMenu', () => ({
  useModelMenu: () => ({ modelMenuPosition: null, openAbove: false }),
}));

const editingAgent: AgentData = {
  id: 'agent-1',
  name: 'agent-1',
  displayName: '测试智能体',
  color: { primary: '#000', secondary: '#fff' },
  mentionPatterns: ['@agent-1'],
  provider: 'relayclaw',
  defaultModel: 'model_config:huawei-maas:deepseek-v3.2',
  avatar: '',
  roleDescription: 'desc',
  personality: 'personality',
  teamStrengths: '',
  source: 'runtime',
  accountRef: 'huawei-maas',
  providerProfileId: 'huawei-maas',
};

describe('FormContent model save payload', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    apiFetch.mockReset();
    uploadAvatarAsset.mockReset();
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/maas-models')) {
        return new Response(
          JSON.stringify({
            list: [
              {
                id: 'model_config:huawei-maas:glm-5',
                name: 'glm-5',
                accountRef: 'huawei-maas',
                model: 'glm-5',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).includes('/api/agents/')) {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        return new Response(JSON.stringify({ ok: true, body }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    uploadAvatarAsset.mockResolvedValue('/uploads/new-avatar.png');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('sends accountRef and bare defaultModel when saving a Huawei model selection', async () => {
    const onSaveSuccess = vi.fn();

    await act(async () => {
      root.render(
        <FormContent
          editingAgent={editingAgent}
          formMode="edit"
          onCancel={() => undefined}
          onSaveSuccess={onSaveSuccess}
          onBackToDetail={() => undefined}
          onBackToList={() => undefined}
        />,
      );
    });

    const selectButton = Array.from(container.querySelectorAll('button')).find((node) =>
      node.textContent?.includes('选择模型'),
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      selectButton?.click();
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === '保存') as
      | HTMLButtonElement
      | undefined;

    await act(async () => {
      saveButton?.click();
    });

    const calls = apiFetch.mock.calls.filter(([url]) => String(url).includes('/api/agents/'));
    expect(calls).toHaveLength(1);
    const [, init] = calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.accountRef).toBe('huawei-maas');
    expect(payload.defaultModel).toBe('deepseek-v3.2');
    expect(payload.defaultModel).not.toContain('model_config:');
    expect(onSaveSuccess).toHaveBeenCalled();
  });

  it('includes agentId in create payload and keeps the selected model chain intact', async () => {
    const onSaveSuccess = vi.fn();

    await act(async () => {
      root.render(
        <FormContent
          formMode="create"
          onCancel={() => undefined}
          onSaveSuccess={onSaveSuccess}
          onBackToDetail={() => undefined}
          onBackToList={() => undefined}
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      const nameInput = Array.from(container.querySelectorAll('input')).find((node) =>
        node.getAttribute('aria-label') === '名称',
      ) as HTMLInputElement | undefined;
      if (!nameInput) throw new Error('missing name input');
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(nameInput), 'value');
      descriptor?.set?.call(nameInput, '新建智能体');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === '保存') as
      | HTMLButtonElement
      | undefined;

    await act(async () => {
      saveButton?.click();
    });

    const postCall = apiFetch.mock.calls.find(([url, init]) => String(url) === '/api/agents' && init?.method === 'POST');
    expect(postCall).toBeTruthy();
    const payload = JSON.parse(String(postCall?.[1]?.body));
    expect(payload.agentId).toMatch(/^agent-/);
    expect(payload.name).toBe('新建智能体');
    expect(payload.defaultModel).toBe('glm-5');
    expect(payload.accountRef).toBe('huawei-maas');
    expect(onSaveSuccess).toHaveBeenCalled();
  });

  it('uses the default role description when create description is empty', async () => {
    const onSaveSuccess = vi.fn();

    await act(async () => {
      root.render(
        <FormContent
          formMode="create"
          onCancel={() => undefined}
          onSaveSuccess={onSaveSuccess}
          onBackToDetail={() => undefined}
          onBackToList={() => undefined}
        />,
      );
    });

    await act(async () => {
      const nameInput = Array.from(container.querySelectorAll('input')).find((node) =>
        node.getAttribute('aria-label') === '名称',
      ) as HTMLInputElement | undefined;
      if (!nameInput) throw new Error('missing name input');
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(nameInput), 'value');
      descriptor?.set?.call(nameInput, '新建智能体');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === '保存') as
      | HTMLButtonElement
      | undefined;

    await act(async () => {
      saveButton?.click();
    });

    const postCall = apiFetch.mock.calls.find(([url, init]) => String(url) === '/api/agents' && init?.method === 'POST');
    expect(postCall).toBeTruthy();
    const payload = JSON.parse(String(postCall?.[1]?.body));
    expect(payload.roleDescription).toBe('通用智能体助手');
  });

  it('includes the latest selected skills in the save payload', async () => {
    await act(async () => {
      root.render(
        <FormContent
          formMode="create"
          onCancel={() => undefined}
          onSaveSuccess={() => undefined}
          onBackToDetail={() => undefined}
          onBackToList={() => undefined}
        />,
      );
    });

    await act(async () => {
      const nameInput = Array.from(container.querySelectorAll('input')).find((node) =>
        node.getAttribute('aria-label') === '名称',
      ) as HTMLInputElement | undefined;
      if (!nameInput) throw new Error('missing name input');
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(nameInput), 'value');
      descriptor?.set?.call(nameInput, '带技能的智能体');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const selectSkillsButton = Array.from(container.querySelectorAll('button')).find((node) =>
      node.textContent?.includes('选择技能'),
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      selectSkillsButton?.click();
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === '保存') as
      | HTMLButtonElement
      | undefined;

    await act(async () => {
      saveButton?.click();
    });

    const postCall = apiFetch.mock.calls.find(([url, init]) => String(url) === '/api/agents' && init?.method === 'POST');
    expect(postCall).toBeTruthy();
    const payload = JSON.parse(String(postCall?.[1]?.body));
    expect(payload.skills).toEqual(['daily-briefing', 'email-manager']);
  });

  it('includes selected skills in edit save payloads', async () => {
    await act(async () => {
      root.render(
        <FormContent
          editingAgent={editingAgent}
          formMode="edit"
          onCancel={() => undefined}
          onSaveSuccess={() => undefined}
          onBackToDetail={() => undefined}
          onBackToList={() => undefined}
        />,
      );
    });

    const selectSkillsButton = Array.from(container.querySelectorAll('button')).find((node) =>
      node.textContent?.includes('选择技能'),
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      selectSkillsButton?.click();
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === '保存') as
      | HTMLButtonElement
      | undefined;

    await act(async () => {
      saveButton?.click();
    });

    const patchCall = apiFetch.mock.calls.find(
      ([url, init]) => String(url) === '/api/agents/agent-1' && init?.method === 'PATCH',
    );
    expect(patchCall).toBeTruthy();
    const payload = JSON.parse(String(patchCall?.[1]?.body));
    expect(payload.skills).toEqual(['daily-briefing', 'email-manager']);
  });

  it('shows duplicate name errors inline instead of in the footer', async () => {
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/maas-models')) {
        return new Response(
          JSON.stringify({
            list: [
              {
                id: 'model_config:huawei-maas:glm-5',
                name: 'glm-5',
                accountRef: 'huawei-maas',
                model: 'glm-5',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (String(url).includes('/api/agents')) {
        return new Response(JSON.stringify({ error: '名称已被使用' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    await act(async () => {
      root.render(
        <FormContent
          formMode="create"
          onCancel={() => undefined}
          onSaveSuccess={() => undefined}
          onBackToDetail={() => undefined}
          onBackToList={() => undefined}
        />,
      );
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === '保存') as
      | HTMLButtonElement
      | undefined;

    await act(async () => {
      saveButton?.click();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="name-error"]')?.textContent).toBe('名称已被使用');
    expect(container.textContent).not.toContain('名称已被使用创建失败');
  });

  it('shows empty-name validation inline', async () => {
    await act(async () => {
      root.render(
        <FormContent
          formMode="create"
          onCancel={() => undefined}
          onSaveSuccess={() => undefined}
          onBackToDetail={() => undefined}
          onBackToList={() => undefined}
        />,
      );
    });

    await act(async () => {
      const nameInput = Array.from(container.querySelectorAll('input')).find((node) =>
        node.getAttribute('aria-label') === '名称',
      ) as HTMLInputElement | undefined;
      if (!nameInput) throw new Error('missing name input');
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(nameInput), 'value');
      descriptor?.set?.call(nameInput, '');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === '保存') as
      | HTMLButtonElement
      | undefined;

    await act(async () => {
      saveButton?.click();
    });

    expect(container.querySelector('[data-testid="name-error"]')?.textContent).toContain('支持中文');
  });

  it('shows illegal-character name validation inline immediately', async () => {
    await act(async () => {
      root.render(
        <FormContent
          formMode="create"
          onCancel={() => undefined}
          onSaveSuccess={() => undefined}
          onBackToDetail={() => undefined}
          onBackToList={() => undefined}
        />,
      );
    });

    await act(async () => {
      const nameInput = Array.from(container.querySelectorAll('input')).find((node) =>
        node.getAttribute('aria-label') === '名称',
      ) as HTMLInputElement | undefined;
      if (!nameInput) throw new Error('missing name input');
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(nameInput), 'value');
      descriptor?.set?.call(nameInput, '智能体@123');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="name-error"]')?.textContent).toContain('支持中文');
  });

  it('renders the initial selected model label for edit mode', async () => {
    await act(async () => {
      root.render(
        <FormContent
          editingAgent={editingAgent}
          formMode="edit"
          onCancel={() => undefined}
          onSaveSuccess={() => undefined}
          onBackToDetail={() => undefined}
          onBackToList={() => undefined}
        />,
      );
    });

    expect(container.textContent).toContain('deepseek-v3.2');
  });

  it('shows model missing inline when the bound model no longer exists', async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/maas-models')) {
        return new Response(JSON.stringify({ list: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    await act(async () => {
      root.render(
        <FormContent
          editingAgent={editingAgent}
          formMode="edit"
          onCancel={() => undefined}
          onSaveSuccess={() => undefined}
          onBackToDetail={() => undefined}
          onBackToList={() => undefined}
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="model-error"]')?.textContent).toBe('模型不存在，请重新选择');
  });

  it('uploads avatar through the shared helper', async () => {
    await act(async () => {
      root.render(
        <FormContent
          formMode="create"
          onCancel={() => undefined}
          onSaveSuccess={() => undefined}
          onBackToDetail={() => undefined}
          onBackToList={() => undefined}
        />,
      );
    });

    const fileInput = container.querySelector('input[aria-label="头像"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });

    await act(async () => {
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(uploadAvatarAsset).toHaveBeenCalledWith(file);
  });
});
