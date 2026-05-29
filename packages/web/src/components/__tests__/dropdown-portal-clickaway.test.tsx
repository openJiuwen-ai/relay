/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dropdown } from '@/components/shared/Dropdown';

function Host({ onAction }: { onAction: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (hostRef.current && !hostRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!open) return React.createElement('div', null, 'host closed');

  return React.createElement(
    'div',
    { ref: hostRef },
    React.createElement(Dropdown, {
      trigger: React.createElement('button', { type: 'button', 'data-testid': 'host-trigger' }, 'open'),
      options: [{ label: '执行操作', onClick: onAction }],
    }),
  );
}

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.querySelectorAll('[role="menu"]').forEach((node) => node.remove());
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('Dropdown portal clickaway integration', () => {
  it('keeps option clicks working when an outer mousedown clickaway listener exists', async () => {
    const onAction = vi.fn();

    await act(async () => {
      root.render(React.createElement(Host, { onAction }));
    });
    await flush();

    act(() => {
      (container.querySelector('[data-testid="host-trigger"]') as HTMLButtonElement).click();
    });
    await flush();

    const menuItem = document.querySelector('[role="menuitem"]') as HTMLButtonElement;
    expect(menuItem).toBeTruthy();

    act(() => {
      menuItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      menuItem.click();
    });
    await flush();

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('host closed');
  });
});
