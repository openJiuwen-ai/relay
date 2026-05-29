/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PreviewPanelShell } from '@/components/preview-panels/PreviewPanelShell';

describe('PreviewPanelShell headerActions prop', () => {
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
  });

  it('renders headerActions content before button group', async () => {
    const headerActions = React.createElement('button', { 'data-testid': 'custom-header-action' }, 'Custom Action');

    await act(async () => {
      root.render(
        React.createElement(PreviewPanelShell, {
          panelTestId: 'test-panel',
          title: 'Test Panel',
          onRequestClose: () => {},
          headerActions,
        }, React.createElement('div', null, 'Content')),
      );
    });

    const customAction = container.querySelector('[data-testid="custom-header-action"]');
    expect(customAction).not.toBeNull();
    expect(customAction?.textContent).toBe('Custom Action');
  });

  it('headerActions appears before close/fullscreen buttons', async () => {
    const headerActions = React.createElement('span', { 'data-testid': 'header-marker' }, 'BEFORE');

    await act(async () => {
      root.render(
        React.createElement(PreviewPanelShell, {
          panelTestId: 'test-panel',
          title: 'Test Panel',
          onRequestClose: () => {},
          headerActions,
        }, React.createElement('div', null, 'Content')),
      );
    });

    // Find the buttons container
    const buttonsContainer = container.querySelector('.flex.shrink-0.items-center.gap-1');
    expect(buttonsContainer).not.toBeNull();

    // First child should be the header marker
    const firstChild = buttonsContainer?.firstChild;
    expect(firstChild?.textContent).toBe('BEFORE');
  });

  it('renders both headerActions and extraHeaderContent when both provided', async () => {
    const headerActions = React.createElement('span', { 'data-testid': 'header-actions' }, 'Actions');
    const extraHeaderContent = React.createElement('span', { 'data-testid': 'extra-content' }, 'Extra');

    await act(async () => {
      root.render(
        React.createElement(PreviewPanelShell, {
          panelTestId: 'test-panel',
          title: 'Test Panel',
          onRequestClose: () => {},
          headerActions,
          extraHeaderContent,
        }, React.createElement('div', null, 'Content')),
      );
    });

    // Both should be rendered
    expect(container.querySelector('[data-testid="header-actions"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="extra-content"]')).not.toBeNull();

    // extraHeaderContent comes before headerActions in the DOM
    const buttonsContainer = container.querySelector('.flex.shrink-0.items-center.gap-1');
    const children = Array.from(buttonsContainer?.children || []);
    const extraIndex = children.findIndex((c) => c.getAttribute('data-testid') === 'extra-content');
    const actionsIndex = children.findIndex((c) => c.getAttribute('data-testid') === 'header-actions');
    expect(extraIndex).toBeLessThan(actionsIndex);
  });

  it('does not render headerActions slot when prop is undefined', async () => {
    await act(async () => {
      root.render(
        React.createElement(PreviewPanelShell, {
          panelTestId: 'test-panel',
          title: 'Test Panel',
          onRequestClose: () => {},
          // headerActions not provided
        }, React.createElement('div', null, 'Content')),
      );
    });

    // Should still render close button
    const closeButton = container.querySelector('button[title="关闭预览"]');
    expect(closeButton).not.toBeNull();
  });

  it('headerActions can contain complex elements', async () => {
    const headerActions = React.createElement(
      'div',
      { className: 'flex gap-2' },
      React.createElement('button', { 'data-testid': 'action-a' }, 'A'),
      React.createElement('button', { 'data-testid': 'action-b' }, 'B'),
    );

    await act(async () => {
      root.render(
        React.createElement(PreviewPanelShell, {
          panelTestId: 'test-panel',
          title: 'Test Panel',
          onRequestClose: () => {},
          headerActions,
        }, React.createElement('div', null, 'Content')),
      );
    });

    expect(container.querySelector('[data-testid="action-a"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="action-b"]')).not.toBeNull();
  });
});