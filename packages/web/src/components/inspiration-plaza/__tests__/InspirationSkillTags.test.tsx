/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InspirationSkillTags } from '../components/InspirationSkillTags';
import type { SkillRef } from '../types';

describe('InspirationSkillTags', () => {
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

  it('renders nothing when skills array is empty', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationSkillTags, { skills: [] }));
    });

    expect(container.innerHTML).toBe('');
  });

  it('renders single skill tag', async () => {
    const skills: SkillRef[] = [{ id: 'skill-1', name: '技能1' }];

    await act(async () => {
      root.render(React.createElement(InspirationSkillTags, { skills }));
    });

    expect(container.textContent).toContain('技能1');
  });

  it('renders multiple skill tags', async () => {
    const skills: SkillRef[] = [
      { id: 'skill-1', name: '技能一' },
      { id: 'skill-2', name: '技能二' },
      { id: 'skill-3', name: '技能三' },
    ];

    await act(async () => {
      root.render(React.createElement(InspirationSkillTags, { skills }));
    });

    expect(container.textContent).toContain('技能一');
    expect(container.textContent).toContain('技能二');
    expect(container.textContent).toContain('技能三');
  });

  it('renders skill tag with icon when icon is provided', async () => {
    const skills: SkillRef[] = [{ id: 'skill-1', name: '带图标的技能', icon: '/icons/skill.png' }];

    await act(async () => {
      root.render(React.createElement(InspirationSkillTags, { skills }));
    });

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/icons/skill.png');
  });

  it('renders skill tag without icon when icon is not provided', async () => {
    const skills: SkillRef[] = [{ id: 'skill-1', name: '无图标技能' }];

    await act(async () => {
      root.render(React.createElement(InspirationSkillTags, { skills }));
    });

    const img = container.querySelector('img');
    expect(img).toBeNull();
    expect(container.textContent).toContain('无图标技能');
  });

  it('renders skills in a flex wrap container', async () => {
    const skills: SkillRef[] = [
      { id: 'skill-1', name: '技能1' },
      { id: 'skill-2', name: '技能2' },
    ];

    await act(async () => {
      root.render(React.createElement(InspirationSkillTags, { skills }));
    });

    const containerElement = container.querySelector('.flex-wrap');
    expect(containerElement).not.toBeNull();
  });
});