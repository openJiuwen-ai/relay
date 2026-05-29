/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '@/components/chat-input/ChatInput';
import type { QueueEntry } from '@/stores/chat-types';

const mockQueueState: { queuedEntries: QueueEntry[] } = {
  queuedEntries: [],
};
let setMockImages: ((files: File[]) => void) | null = null;

const mockFile = new File(['queue-edit-file'], 'queue-edit.pdf', { type: 'application/pdf' });

vi.mock('@/components/icons/SendIcon', () => ({
  SendIcon: () => React.createElement('span', null, 'send'),
}));
vi.mock('@/components/icons/LoadingIcon', () => ({
  LoadingIcon: () => React.createElement('span', null, 'loading'),
}));
vi.mock('@/components/icons/AttachIcon', () => ({
  AttachIcon: () => React.createElement('span', null, 'attach'),
}));
vi.mock('@/utils/compressImage', () => ({
  compressImage: (f: File) => Promise.resolve(f),
}));
vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({
    agents: [],
    isLoading: false,
    getAgentById: () => undefined,
    getAgentsByBreed: () => new Map(),
  }),
}));
vi.mock('@/hooks/useVoiceInput', () => ({
  useVoiceInput: () => ({
    state: 'idle',
    transcript: '',
    partialTranscript: '',
    error: null,
    duration: 0,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePathCompletion', () => ({
  usePathCompletion: () => ({
    entries: [],
    isOpen: false,
    selectedIdx: 0,
    setSelectedIdx: vi.fn(),
    selectEntry: vi.fn(),
    close: vi.fn(),
    detectPath: vi.fn(),
  }),
}));
vi.mock('@/components/chat-input/hooks/useQueueManager', () => ({
  useQueueManager: () => ({
    activeQueueThreadId: 'thread-1',
    queue: mockQueueState.queuedEntries,
    queuedEntries: mockQueueState.queuedEntries,
    queueAttachmentNamesByEntryId: {},
    queueCount: mockQueueState.queuedEntries.length,
    queueExpanded: true,
    setQueueExpanded: vi.fn(),
    queueBusy: false,
    queueHighlightedEntryId: null,
    queueListRef: { current: null },
    handleQueueDelete: vi.fn(),
    handleQueueClear: vi.fn(),
    handleQueuePinToTop: vi.fn(),
    handleQueueMoveToIndex: vi.fn(),
    handleQueueExtractForEdit: vi.fn(async (entryId: string) => {
      return mockQueueState.queuedEntries.find((entry) => entry.id === entryId) ?? null;
    }),
  }),
}));
vi.mock('@/components/chat-input/hooks/useAttachmentManager', async () => {
  const ReactModule = await import('react');
  return {
    useAttachmentManager: () => {
      const [images, setImages] = ReactModule.useState<File[]>([mockFile]);
      setMockImages = (files: File[]) => setImages(files);
      return {
        images,
        setImages,
        isDraggingFiles: false,
        handleFileSelect: vi.fn(),
        handlePaste: vi.fn(),
        handleRemoveImage: vi.fn(),
        handleDragEnter: vi.fn(),
        handleDragOver: vi.fn(),
        handleDragLeave: vi.fn(),
        handleDrop: vi.fn(),
      };
    },
  };
});
vi.mock('@/components/chat-input/components/ChatInputLayout', () => ({
  ChatInputLayout: (props: any) =>
    React.createElement(
      'div',
      null,
      React.createElement('div', { 'data-testid': 'input-value' }, props.input),
      React.createElement('div', { 'data-testid': 'images-count' }, String(props.images?.length ?? 0)),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'prime-input',
          onClick: () => props.setInput('请 [[skill:pdf]] 处理附件'),
        },
        'prime',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'prime-input-2',
          onClick: () => props.setInput('第二条 [[skill:pdf]] 消息'),
        },
        'prime-2',
      ),
      React.createElement(
        'button',
        { type: 'button', 'data-testid': 'queue-send', onClick: () => props.handleQueueSend() },
        'queue-send',
      ),
      React.createElement(
        'button',
        { type: 'button', 'data-testid': 'queue-edit', onClick: () => props.handleQueueEdit('q-edit-1') },
        'queue-edit',
      ),
    ),
}));

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
  mockQueueState.queuedEntries = [];
  setMockImages = null;
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

function clickByTestId(testId: string) {
  const button = container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null;
  expect(button).toBeTruthy();
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function getQueueSendOptions(onSend: ReturnType<typeof vi.fn>, callIndex = 0) {
  const call = onSend.mock.calls[callIndex] as unknown[] | undefined;
  return (call?.[4] as { clientDraftId?: string } | undefined) ?? undefined;
}

describe('ChatInput queue edit rehydrate', () => {
  it('restores original skill token and attachments when editing queued message', async () => {
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flushAsync();

    clickByTestId('prime-input');
    clickByTestId('queue-send');

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]?.[0]).toBe('请 使用 pdf 技能 处理附件');
    expect(onSend.mock.calls[0]?.[1]).toEqual([mockFile]);
    expect(onSend.mock.calls[0]?.[3]).toBe('queue');
    const queueOptions = getQueueSendOptions(onSend);
    expect(queueOptions?.clientDraftId).toBeTruthy();
    expect((container.querySelector('[data-testid="images-count"]') as HTMLElement)?.textContent).toBe('0');

    mockQueueState.queuedEntries = [
      {
        id: 'q-edit-1',
        threadId: 'thread-1',
        userId: 'u1',
        content: '请 使用 pdf 技能 处理附件',
        attachmentNames: [mockFile.name],
        messageId: 'msg-q-edit-1',
        mergedMessageIds: [],
        source: 'user',
        targetAgents: ['opus'],
        intent: 'execute',
        status: 'queued',
        createdAt: Date.now(),
        clientDraftId: queueOptions?.clientDraftId,
      },
    ];
    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flushAsync();

    clickByTestId('queue-edit');
    await flushAsync();

    expect((container.querySelector('[data-testid="input-value"]') as HTMLElement)?.textContent).toBe(
      '请 [[skill:pdf]] 处理附件',
    );
    expect((container.querySelector('[data-testid="images-count"]') as HTMLElement)?.textContent).toBe('1');
  });

  it('restores attachments when queue send is merged into existing entry id', async () => {
    const onSend = vi.fn();
    mockQueueState.queuedEntries = [
      {
        id: 'q-edit-1',
        threadId: 'thread-1',
        userId: 'u1',
        content: '历史消息',
        attachmentNames: [],
        messageId: 'msg-old',
        mergedMessageIds: [],
        source: 'user',
        targetAgents: ['opus'],
        intent: 'execute',
        status: 'queued',
        createdAt: Date.now(),
      },
    ];

    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flushAsync();

    clickByTestId('prime-input');
    clickByTestId('queue-send');

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]?.[0]).toBe('请 使用 pdf 技能 处理附件');
    expect(onSend.mock.calls[0]?.[1]).toEqual([mockFile]);
    expect(onSend.mock.calls[0]?.[3]).toBe('queue');
    const queueOptions = getQueueSendOptions(onSend);
    expect(queueOptions?.clientDraftId).toBeTruthy();
    expect((container.querySelector('[data-testid="images-count"]') as HTMLElement)?.textContent).toBe('0');

    // Simulate backend merge: same entry id, content changed but no new queue id.
    mockQueueState.queuedEntries = [
      {
        id: 'q-edit-1',
        threadId: 'thread-1',
        userId: 'u1',
        content: '历史消息\n请 使用 pdf 技能 处理附件',
        attachmentNames: [mockFile.name],
        messageId: 'msg-old',
        mergedMessageIds: ['msg-merged'],
        source: 'user',
        targetAgents: ['opus'],
        intent: 'execute',
        status: 'queued',
        createdAt: Date.now(),
        clientDraftId: queueOptions?.clientDraftId,
      },
    ];
    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flushAsync();

    clickByTestId('queue-edit');
    await flushAsync();

    expect((container.querySelector('[data-testid="input-value"]') as HTMLElement)?.textContent).toBe(
      '请 [[skill:pdf]] 处理附件',
    );
    expect((container.querySelector('[data-testid="images-count"]') as HTMLElement)?.textContent).toBe('1');
  });

  it('binds queued draft in FIFO order across consecutive queue sends', async () => {
    const onSend = vi.fn();
    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flushAsync();

    clickByTestId('prime-input');
    clickByTestId('queue-send');
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]?.[0]).toBe('请 使用 pdf 技能 处理附件');
    expect(onSend.mock.calls[0]?.[1]).toEqual([mockFile]);
    expect(onSend.mock.calls[0]?.[3]).toBe('queue');
    const firstQueueOptions = getQueueSendOptions(onSend, 0);
    expect(firstQueueOptions?.clientDraftId).toBeTruthy();

    act(() => {
      setMockImages?.([]);
    });
    clickByTestId('prime-input-2');
    clickByTestId('queue-send');
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(onSend.mock.calls[1]?.[0]).toBe('第二条 使用 pdf 技能 消息');
    expect(onSend.mock.calls[1]?.[1]).toBeUndefined();
    expect(onSend.mock.calls[1]?.[3]).toBe('queue');
    const secondQueueOptions = getQueueSendOptions(onSend, 1);
    expect(secondQueueOptions?.clientDraftId).toBeTruthy();

    // First queue entry arrives later; should bind first draft (with attachment).
    mockQueueState.queuedEntries = [
      {
        id: 'q-edit-1',
        threadId: 'thread-1',
        userId: 'u1',
        content: '请 使用 pdf 技能 处理附件',
        attachmentNames: [mockFile.name],
        messageId: 'msg-q-edit-1',
        mergedMessageIds: [],
        source: 'user',
        targetAgents: ['opus'],
        intent: 'execute',
        status: 'queued',
        createdAt: Date.now(),
        clientDraftId: firstQueueOptions?.clientDraftId,
      },
    ];
    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flushAsync();

    clickByTestId('queue-edit');
    await flushAsync();

    expect((container.querySelector('[data-testid="input-value"]') as HTMLElement)?.textContent).toBe(
      '请 [[skill:pdf]] 处理附件',
    );
    expect((container.querySelector('[data-testid="images-count"]') as HTMLElement)?.textContent).toBe('1');
  });
});
