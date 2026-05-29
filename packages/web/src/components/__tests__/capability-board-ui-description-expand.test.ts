/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type CapabilityBoardItem, CapabilitySection } from '@/components/skills-panel/components/capability-board-ui';

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('CapabilitySection skill card layout', () => {
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

  function mockOverflow(node: Element, { clientWidth, scrollWidth }: { clientWidth: number; scrollWidth: number }) {
    Object.defineProperty(node, 'clientWidth', {
      configurable: true,
      value: clientWidth,
    });
    Object.defineProperty(node, 'scrollWidth', {
      configurable: true,
      value: scrollWidth,
    });
  }

  function mockBlockOverflow(node: Element, clientHeight: number, scrollHeight: number) {
    Object.defineProperty(node, 'clientHeight', {
      configurable: true,
      value: clientHeight,
    });
    Object.defineProperty(node, 'scrollHeight', {
      configurable: true,
      value: scrollHeight,
    });
  }

  it('renders source and uninstall action without expanded detail sections', () => {
    const description = '这是一个用于验证卡片布局的技能描述。';
    const item: CapabilityBoardItem = {
      id: 'cross-cat-handoff',
      type: 'skill',
      source: 'external',
      enabled: true,
      agents: { codex: true },
      description,
      triggers: ['交接'],
    };

    act(() => {
      root.render(
        React.createElement(CapabilitySection, {
          icon: null,
          title: '协作',
          subtitle: 'OfficeClaw Skills',
          items: [item],
          agentFamilies: [],
          toggling: null,
          onToggle: () => {},
          onUninstall: () => {},
        }),
      );
    });

    expect(container.textContent).toContain('来源：用户添加技能');
    expect(container.textContent).toContain(description);
    expect(container.textContent).toContain('卸载');
    expect(container.textContent).not.toContain('触发词');
    expect(container.textContent).not.toContain('挂载状态');
    expect(container.textContent).not.toContain('启用状态（按猫）');
  });

  it('shows a custom tooltip for the skill description instead of relying on title', async () => {
    const description = '这是一段很长的技能描述，用来验证 hover 后展示自定义 tooltip。';
    const item: CapabilityBoardItem = {
      id: 'cross-cat-handoff',
      type: 'skill',
      source: 'external',
      enabled: true,
      agents: { codex: true },
      description,
      triggers: ['交接'],
    };

    await act(async () => {
      root.render(
        React.createElement(CapabilitySection, {
          icon: null,
          title: '协作',
          subtitle: 'OfficeClaw Skills',
          items: [item],
          agentFamilies: [],
          toggling: null,
          onToggle: () => {},
          onUninstall: () => {},
        }),
      );
    });
    await flushEffects();

    const descriptionNode = Array.from(container.querySelectorAll('p')).find((node) => node.textContent === description);
    expect(descriptionNode).not.toBeNull();
    expect(descriptionNode?.getAttribute('title')).toBeNull();

    await act(async () => {
      descriptionNode?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
    if (!descriptionNode) return;
    mockOverflow(descriptionNode, { clientWidth: 200, scrollWidth: 200 });
    mockBlockOverflow(descriptionNode, 44, 88);

    await act(async () => {
      descriptionNode.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain(description);
  });

  it('shows the full skill title in a tooltip when the title is truncated', async () => {
    const title = 'cross-cat-handoff-with-a-very-long-skill-name-for-tooltip';
    const item: CapabilityBoardItem = {
      id: title,
      type: 'skill',
      source: 'external',
      enabled: true,
      agents: { codex: true },
      description: 'description',
      triggers: ['handoff'],
    };

    await act(async () => {
      root.render(
        React.createElement(CapabilitySection, {
          icon: null,
          title: '协作',
          subtitle: 'OfficeClaw Skills',
          items: [item],
          agentFamilies: [],
          toggling: null,
          onToggle: () => {},
          onUninstall: () => {},
        }),
      );
    });
    await flushEffects();

    const titleNode = Array.from(container.querySelectorAll('h3')).find((node) => node.textContent === title);
    expect(titleNode).not.toBeNull();
    expect(titleNode?.getAttribute('title')).toBeNull();
    if (!titleNode) return;

    mockOverflow(titleNode, { clientWidth: 120, scrollWidth: 280 });

    await act(async () => {
      titleNode.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain(title);
  });

  it('keeps my skills category badge auto-sized and shows a tooltip when truncated', async () => {
    const category = '这是一个非常非常长的分类名称用于验证tooltip';
    const item: CapabilityBoardItem = {
      id: 'cross-cat-handoff',
      type: 'skill',
      source: 'external',
      enabled: true,
      agents: { codex: true },
      category,
      description: 'description',
      triggers: ['handoff'],
    };

    await act(async () => {
      root.render(
        React.createElement(CapabilitySection, {
          icon: null,
          title: '协作',
          subtitle: 'OfficeClaw Skills',
          items: [item],
          agentFamilies: [],
          toggling: null,
          onToggle: () => {},
          onUninstall: () => {},
        }),
      );
    });
    await flushEffects();

    const badge = container.querySelector('.ui-badge-muted') as HTMLElement | null;
    expect(badge).not.toBeNull();
    const badgeClasses = badge?.className.split(/\s+/) ?? [];
    expect(badgeClasses).toContain('max-w-full');
    expect(badgeClasses).not.toContain('w-full');

    if (!badge) return;
    mockOverflow(badge, { clientWidth: 96, scrollWidth: 280 });

    await act(async () => {
      badge.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain(category);
  });
});
