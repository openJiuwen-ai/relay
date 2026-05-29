/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InspirationAgentTags } from '../components/InspirationAgentTags';
import type { AgentRef } from '../types';

describe('InspirationAgentTags', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders nothing when agents array is empty', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationAgentTags, { agents: [] }));
    });

    expect(container.innerHTML).toBe('');
  });

  it('renders single agent tag', async () => {
    const agents: AgentRef[] = [{ id: 'agent-1', name: '智能体1', catId: 'office' }];

    await act(async () => {
      root.render(React.createElement(InspirationAgentTags, { agents }));
    });

    expect(container.textContent).toContain('智能体1');
  });

  it('renders multiple agent tags', async () => {
    const agents: AgentRef[] = [
      { id: 'agent-1', name: '智能体一', catId: 'office' },
      { id: 'agent-2', name: '智能体二', catId: 'dare' },
      { id: 'agent-3', name: '智能体三', catId: 'relay' },
    ];

    await act(async () => {
      root.render(React.createElement(InspirationAgentTags, { agents }));
    });

    expect(container.textContent).toContain('智能体一');
    expect(container.textContent).toContain('智能体二');
    expect(container.textContent).toContain('智能体三');
  });

  it('renders agent tag with icon when icon is provided', async () => {
    const agents: AgentRef[] = [{ id: 'agent-1', name: '带图标的智能体', catId: 'office', icon: '/icons/agent.png' }];

    await act(async () => {
      root.render(React.createElement(InspirationAgentTags, { agents }));
    });

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/icons/agent.png');
  });

  it('renders agent tag without icon when icon is not provided', async () => {
    const agents: AgentRef[] = [{ id: 'agent-1', name: '无图标智能体', catId: 'office' }];

    await act(async () => {
      root.render(React.createElement(InspirationAgentTags, { agents }));
    });

    const img = container.querySelector('img');
    expect(img).toBeNull();
    expect(container.textContent).toContain('无图标智能体');
  });

  it('renders agents in a flex wrap container', async () => {
    const agents: AgentRef[] = [
      { id: 'agent-1', name: '智能体1', catId: 'office' },
      { id: 'agent-2', name: '智能体2', catId: 'dare' },
    ];

    await act(async () => {
      root.render(React.createElement(InspirationAgentTags, { agents }));
    });

    const containerElement = container.querySelector('.flex-wrap');
    expect(containerElement).not.toBeNull();
  });
});