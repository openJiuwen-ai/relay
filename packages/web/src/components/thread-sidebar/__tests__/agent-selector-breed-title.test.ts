/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F32-b Phase 4 R24 P2-2: Regression test — AgentSelector group title must show
 * breed-level display name, not the first variant's displayName.
 *
 * When a variant overrides displayName, the group heading should still read
 * "布偶猫家族" (from breedDisplayName), NOT "宪宪专用猫家族" (from variant displayName).
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentData } from '@/hooks/useAgentData';

// ── Build multi-variant data where first variant overrides displayName ──
const ragdollVariants: AgentData[] = [
  {
    id: 'opus-custom',
    displayName: '定制布偶', // ← variant-level override, NOT the breed name
    color: { primary: '#9B7EBD', secondary: '#E8DFF5' },
    breedId: 'ragdoll',
    breedDisplayName: '布偶猫', // ← breed-level name
    provider: 'anthropic',
    defaultModel: 'claude-sonnet-4-5-20250929',
    avatar: '/avatars/opus.png',
    mentionPatterns: ['@opus-custom'],
    roleDescription: '',
    personality: '',
    variantLabel: 'Custom',
    isDefaultVariant: false,
    source: 'seed',
  },
  {
    id: 'opus',
    displayName: '布偶猫',
    color: { primary: '#9B7EBD', secondary: '#E8DFF5' },
    breedId: 'ragdoll',
    breedDisplayName: '布偶猫',
    provider: 'anthropic',
    defaultModel: 'claude-sonnet-4-5-20250929',
    avatar: '/avatars/opus.png',
    mentionPatterns: ['@opus'],
    roleDescription: '',
    personality: '',
    isDefaultVariant: true,
    source: 'seed',
  },
];

const breedMap = new Map<string, AgentData[]>([['ragdoll', ragdollVariants]]);

vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({
    agents: ragdollVariants,
    isLoading: false,
    getAgentById: (id: string) => ragdollVariants.find((c) => c.id === id),
    getAgentsByBreed: () => breedMap,
  }),
  formatAgentName: (agent: { displayName: string; variantLabel?: string }) =>
    agent.variantLabel ? `${agent.displayName}（${agent.variantLabel}）` : agent.displayName,
}));

describe('AgentSelector breed group title (R24 P2-2)', () => {
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

  it('shows breedDisplayName in group title, not variant displayName', async () => {
    const { AgentSelector } = await import('../AgentSelector');
    const onChange = vi.fn();

    act(() => {
      root.render(React.createElement(AgentSelector, { selectedAgentIds: [], onSelectionChange: onChange }));
    });

    // Group title text should contain the breed name, NOT the first variant's override
    const groupTitle = container.querySelector('.text-\\[10px\\]');
    expect(groupTitle).toBeTruthy();
    expect(groupTitle?.textContent).toContain('布偶猫家族');
    expect(groupTitle?.textContent).not.toContain('定制布偶家族');
  });

  it('renders all variant chips within the breed group', async () => {
    const { AgentSelector } = await import('../AgentSelector');
    const onChange = vi.fn();

    act(() => {
      root.render(React.createElement(AgentSelector, { selectedAgentIds: [], onSelectionChange: onChange }));
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    // Should have 2 variant chips
    const chipTexts = buttons.map((b) => b.textContent);
    expect(chipTexts.some((t) => t?.includes('定制布偶'))).toBe(true);
    expect(chipTexts.some((t) => t?.includes('Custom'))).toBe(true); // variantLabel
  });
});
