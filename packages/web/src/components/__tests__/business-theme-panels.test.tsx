/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentManagement } from '@/components/agent-management/AgentManagement';
import { ChannelsPanel } from '@/components/channels-panel/ChannelsPanel';
import { ModelsPanel } from '@/components/models-panel/ModelsPanel';
import { SkillsPanel } from '@/components/skills-panel/SkillsPanel';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({
    agents: [
      {
        id: 'office',
        displayName: 'Office',
        breedDisplayName: 'Office',
        nickname: 'Ops',
        provider: 'openai',
        defaultModel: 'gpt-5',
        mentionPatterns: ['@office'],
        source: 'config',
        roster: { available: true },
      },
    ],
    refresh: vi.fn(),
  }),
}));

vi.mock('@/components/HubAgentEditor', () => ({ HubAgentEditor: () => null }));
vi.mock('@/components/channels-panel/components/ConnectorConfigTab', () => ({
  ConnectorConfigTab: () => React.createElement('div', { 'data-testid': 'connector-panel', className: 'ui-panel' }),
}));
vi.mock('@/components/shared/Alert', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => React.createElement('div', { className: 'alert' }, children),
}));
vi.mock('@/components/skills-panel/CapabilityTab', () => ({
  CapabilityTab: (props: { onImport?: () => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'capability-panel', className: 'ui-panel' },
      props.onImport
        ? React.createElement(
            'button',
            { type: 'button', className: 'ui-button-default', onClick: props.onImport },
            '导入',
          )
        : null,
    ),
}));
vi.mock('@/components/skills-panel/SkillsTab', () => ({
  SkillsTab: () => React.createElement('div', { 'data-testid': 'skills-market-panel', className: 'ui-panel' }),
}));
vi.mock('@/components/HubMemberOverviewCard', () => ({
  HubCoCreatorOverviewCard: () => React.createElement('div', { 'data-testid': 'co-creator-card', className: 'ui-card' }),
  HubMemberOverviewCard: () => React.createElement('div', { 'data-testid': 'member-card', className: 'ui-card' }),
  HubOverviewToolbar: () => React.createElement('button', { 'data-testid': 'add-member-button', className: 'ui-button-primary' }),
}));

const mockApiFetch = vi.mocked(apiFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('business theme panels', () => {
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
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/maas-models') {
        return Promise.resolve(
          jsonResponse({
            list: [
              {
                id: 'gpt-5',
                object: 'model',
                name: 'gpt-5',
                description: 'flagship model',
                labels: ['文本生成'],
                developer: 'OpenAI',
                icon: '/avatars/assistant.svg',
              },
            ],
          }),
        );
      }
      if (url === '/api/config') {
        return Promise.resolve(
          jsonResponse({
            config: {
              agents: {
                office: {
                  model: 'gpt-5',
                },
              },
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockApiFetch.mockReset();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders ModelsPanel with shared page and card tokens', async () => {
    await act(async () => {
      root.render(React.createElement(ModelsPanel));
    });
    await flushEffects();

    const shell = container.firstElementChild as HTMLElement | null;
    expect(shell?.className).toContain('ui-page-shell');
    expect(container.querySelector('h1')?.className).toContain('ui-page-title');
    expect(container.querySelector('article')?.className).toContain('ui-card');
    expect(container.querySelector('article')?.className).toContain('ui-card-hover');
  });

  it('renders AgentManagement with shared page shell and tokenized member surfaces', async () => {
    await act(async () => {
      root.render(React.createElement(AgentManagement));
    });
    await flushEffects();

    // AgentManagement uses flex layout at root (not ui-page-shell)
    const shell = container.firstElementChild as HTMLElement | null;
    expect(shell?.className).toContain('flex');
    expect(container.querySelector('h1')?.className).toContain('ui-page-title');
    expect(container.querySelector('[data-testid="create-agent-button"]')).not.toBeNull();
  });

  it('renders ChannelsPanel with shared page shell and tokenized content surface', async () => {
    await act(async () => {
      root.render(React.createElement(ChannelsPanel));
    });

    const shell = container.firstElementChild as HTMLElement | null;
    expect(shell?.className).toContain('ui-page-shell');
    expect(container.querySelector('h1')?.className).toContain('ui-page-title');
    expect(container.querySelector('[data-testid="connector-panel"]')?.className).toContain('ui-panel');
  });

  it('renders SkillsPanel with shared page shell and tokenized action surfaces', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsPanel));
    });

    const shell = container.firstElementChild as HTMLElement | null;
    expect(shell?.className).toContain('ui-page-shell');
    const contentRegion = shell?.querySelector('.min-h-0.flex-1') as HTMLElement | null;
    expect(contentRegion?.className).toContain('overflow-hidden');
    expect(contentRegion?.className).not.toContain('overflow-y-auto');
    const importButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('导入'));
    expect(importButton?.className).toContain('ui-button-default');
    expect(container.querySelector('[data-testid="capability-panel"]')?.className).toContain('ui-panel');
  });
});
