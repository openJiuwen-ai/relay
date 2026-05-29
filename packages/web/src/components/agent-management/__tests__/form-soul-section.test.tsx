/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentData } from '@/hooks/useAgentData';
import { FormSoulSection } from '@/components/agent-management/components/FormSoulSection';

vi.mock('@/components/PromptSelectionModal', () => ({
  PromptSelectionModal: ({
    open,
    items,
    onConfirm,
  }: {
    open: boolean;
    items: Array<{ id: string; title: string }>;
    onConfirm: (item: { id: string; title: string }) => void;
  }) =>
    open ? (
      <div data-testid="prompt-selection-modal">
        <button type="button" onClick={() => onConfirm(items[0])}>
          插入模板
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/agent-management/components/MarkdownEditorWrapper', () => ({
  MarkdownEditorWrapper: () => <div data-testid="markdown-editor-wrapper" />,
}));

vi.mock('@/components/agent-management/components/SoulConfig', () => ({
  SoulConfig: () => <div data-testid="soul-config" />,
}));

const runtimeAgent: AgentData = {
  id: 'runtime-agent',
  name: 'runtime-agent',
  displayName: '运行时智能体',
  color: { primary: '#111111', secondary: '#eeeeee' },
  mentionPatterns: ['@runtime-agent'],
  provider: 'openai',
  defaultModel: 'gpt-5.4',
  avatar: '',
  roleDescription: '可编辑',
  personality: '',
  teamStrengths: '',
  source: 'runtime',
};

const seedAgent: AgentData = {
  ...runtimeAgent,
  id: 'seed-agent',
  name: 'seed-agent',
  displayName: '预置智能体',
  source: 'seed',
};

describe('FormSoulSection', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders the template trigger and opens the legacy template modal for runtime agent', async () => {
    const onDraftChange = vi.fn();

    await act(async () => {
      root.render(
        <FormSoulSection
          activeWorkingDraft=""
          editingAgent={runtimeAgent}
          onDraftChange={onDraftChange}
        />,
      );
    });

    const trigger = container.querySelector('[data-testid="soul-template-trigger"]') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.click();
    });

    expect(container.querySelector('[data-testid="prompt-selection-modal"]')).not.toBeNull();
  });

  it('shows readOnly soul config for preset agent', async () => {
    const onDraftChange = vi.fn();

    await act(async () => {
      root.render(
        <FormSoulSection
          activeWorkingDraft=""
          editingAgent={seedAgent}
          onDraftChange={onDraftChange}
        />,
      );
    });

    expect(container.querySelector('[data-testid="soul-config"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="soul-template-trigger"]')).toBeNull();
  });

  it('inserts the selected template into the current draft', async () => {
    const onDraftChange = vi.fn();

    await act(async () => {
      root.render(
        <FormSoulSection
          activeWorkingDraft="已有内容"
          editingAgent={runtimeAgent}
          onDraftChange={onDraftChange}
        />,
      );
    });

    const trigger = container.querySelector('[data-testid="soul-template-trigger"]') as HTMLButtonElement | null;

    await act(async () => {
      trigger?.click();
    });

    const confirmButton = Array.from(container.querySelectorAll('button')).find((node) =>
      node.textContent?.includes('插入模板'),
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      confirmButton?.click();
    });

    expect(onDraftChange).toHaveBeenCalledWith(
      '已有内容\n\n## 专业客服助手\n\n### 人格定义 (Persona)\n- 身份：资深客服顾问，擅长复杂问题拆解与安抚沟通。\n- 性格：耐心克制、语气专业、表达清晰。\n- 边界：优先给流程和升级路径，不承诺超出权限范围的结果。\n\n### 行为准则 (Behavior)\n- 精准识别用户诉求与情绪波动，先安抚再给处理路径。\n- 优先提供标准流程与升级建议，避免模糊表述。\n- 回复中同步标注下一步动作和责任归属，方便继续跟进。',
    );
  });
});