/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueueEntry } from '@/stores/chat-types';
import { ChatInputQueuePanel } from '../chat-input/components/ChatInputQueuePanel';

const NOW = Date.now();

const QUEUE_ENTRY_BASE: QueueEntry = {
  id: 'q1',
  threadId: 'thread-1',
  userId: 'u1',
  content: 'queued message',
  messageId: 'msg-1',
  mergedMessageIds: [],
  source: 'user',
  targetAgents: ['opus'],
  intent: 'execute',
  status: 'queued',
  createdAt: NOW,
};

describe('ChatInputQueuePanel attachments', () => {
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
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('appends file icon and filenames after message content', () => {
    act(() => {
      root.render(
        <ChatInputQueuePanel
          queuedEntries={[QUEUE_ENTRY_BASE]}
          attachmentNamesByEntryId={{ q1: ['spec.pdf', 'demo.xlsx'] }}
          queueCount={1}
          queueExpanded
          queueBusy={false}
          queueHighlightedEntryId={null}
          listRef={createRef<HTMLDivElement>()}
          onToggleExpanded={vi.fn()}
          onClear={vi.fn()}
          onPinToTop={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
    });

    const html = container.innerHTML;
    expect(html).toContain('queued message');
    expect(html).toContain('spec.pdf');
    expect(html).toContain('demo.xlsx');
    expect(html).toContain('/icons/files-pdf.svg');
    expect(html).toContain('/icons/files-xlsx.svg');
  });

  it('uses queue entry attachmentNames when attachment map is empty', () => {
    act(() => {
      root.render(
        <ChatInputQueuePanel
          queuedEntries={[{ ...QUEUE_ENTRY_BASE, attachmentNames: ['server.docx'] }]}
          attachmentNamesByEntryId={{}}
          queueCount={1}
          queueExpanded
          queueBusy={false}
          queueHighlightedEntryId={null}
          listRef={createRef<HTMLDivElement>()}
          onToggleExpanded={vi.fn()}
          onClear={vi.fn()}
          onPinToTop={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
    });

    const html = container.innerHTML;
    expect(html).toContain('queued message');
    expect(html).toContain('server.docx');
  });

  it('renders edit action and triggers callback', () => {
    const onEdit = vi.fn();
    act(() => {
      root.render(
        <ChatInputQueuePanel
          queuedEntries={[{ ...QUEUE_ENTRY_BASE, id: 'q-edit' }]}
          attachmentNamesByEntryId={{}}
          queueCount={1}
          queueExpanded
          queueBusy={false}
          queueHighlightedEntryId={null}
          listRef={createRef<HTMLDivElement>()}
          onToggleExpanded={vi.fn()}
          onClear={vi.fn()}
          onPinToTop={vi.fn()}
          onEdit={onEdit}
          onDelete={vi.fn()}
        />,
      );
    });

    const editButton = container.querySelector('button[aria-label="编辑"]');
    expect(editButton).toBeTruthy();
    act(() => {
      editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onEdit).toHaveBeenCalledWith('q-edit');
  });
});
