/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import {
  type ClipboardEvent,
  type CSSProperties,
  forwardRef,
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
  type UIEvent,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { RichTextareaPromptBlocksProps } from './RichTextareaPromptBlocks';
import { RichTextareaPromptBlocks } from './RichTextareaPromptBlocks';
import {
  buildRichTextareaSegments,
  type RichQuickActionOption,
  type RichSkillOption,
  renderRichTextareaSegments,
  serializeRichTextareaNode,
  serializeRichTextareaNodeSignature,
} from './rich-textarea-token-rendering';

interface RichTextareaProps {
  value: string;
  onValueChange: (value: string, selectionStart: number, selectionEnd: number) => void;
  mentionDataVersion?: number;
  onCompositionStateChange?: (isComposing: boolean) => void;
  onInput?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onPaste?: (e: ClipboardEvent<HTMLDivElement>) => void;
  onScroll?: (e: UIEvent<HTMLDivElement>) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  maxLength?: number;
  skillOptions?: RichSkillOption[];
  quickActionOptions?: RichQuickActionOption[];
  promptBlocks?: RichTextareaPromptBlocksProps | null;
}

export interface RichTextareaHandle {
  focus: () => void;
  getSelectionStart: () => number;
  getSelectionEnd: () => number;
  setSelectionRange: (start: number, end: number) => void;
  getElement: () => HTMLDivElement | null;
  getClientRectAtOffset: (offset: number) => DOMRect | null;
  applyProgrammaticChange: (value: string, selectionStart: number, selectionEnd: number) => void;
}

type HistorySnapshot = { value: string; start: number; end: number };
type GroupedHistoryAction = 'insertText' | 'deleteContentBackward' | 'deleteContentForward' | null;

const HISTORY_STACK_LIMIT = 100;
const HISTORY_GROUP_WINDOW_MS = 1000;

function serializeChildren(root: HTMLElement): string {
  return Array.from(root.childNodes)
    .map((n) => serializeRichTextareaNode(n))
    .join('');
}

type PromptEditableSegment = {
  element: HTMLElement;
  start: number;
  end: number;
  editable: boolean;
};

function collectPromptEditableSegments(root: HTMLElement): PromptEditableSegment[] {
  const segments: PromptEditableSegment[] = [];
  let offset = 0;
  for (const child of Array.from(root.childNodes)) {
    const text = serializeRichTextareaNode(child);
    if (child instanceof HTMLElement) {
      const isFixedBlock = child.dataset.blockIndex !== undefined;
      const isTextPlaceholder = child.dataset.placeholderControl === 'true' && child.dataset.placeholderType === 'text';
      segments.push({
        element: child,
        start: offset,
        end: offset + text.length,
        editable: isFixedBlock || isTextPlaceholder,
      });
    }
    offset += text.length;
  }
  return segments;
}

function getStringDiff(current: string, next: string): { start: number; end: number; inserted: string } {
  let start = 0;
  while (start < current.length && start < next.length && current[start] === next[start]) start += 1;

  let currentEnd = current.length;
  let nextEnd = next.length;
  while (currentEnd > start && nextEnd > start && current[currentEnd - 1] === next[nextEnd - 1]) {
    currentEnd -= 1;
    nextEnd -= 1;
  }

  return { start, end: currentEnd, inserted: next.slice(start, nextEnd) };
}

function findPromptEditableSegment(
  segments: PromptEditableSegment[],
  start: number,
  end: number,
): PromptEditableSegment | null {
  const active = document.activeElement;
  const activeSegment =
    active instanceof HTMLElement
      ? segments.find((segment) => segment.element === active || segment.element.contains(active))
      : null;
  if (activeSegment?.editable && start >= activeSegment.start && end <= activeSegment.end) {
    return activeSegment;
  }

  if (start === end) {
    const boundaryPlaceholder = segments.find(
      (segment) =>
        segment.editable &&
        segment.element.dataset.placeholderControl === 'true' &&
        segment.element.dataset.placeholderType === 'text' &&
        start === segment.start,
    );
    if (boundaryPlaceholder) return boundaryPlaceholder;
  }

  return (
    segments.find((segment) => {
      if (!segment.editable) return false;
      if (start === end) return start >= segment.start && start <= segment.end;
      return start >= segment.start && end <= segment.end;
    }) ?? null
  );
}

function findFallbackPromptTextSegment(segments: PromptEditableSegment[]): PromptEditableSegment | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    const activeSegment = segments.find((segment) => segment.element === active || segment.element.contains(active));
    if (
      activeSegment?.editable &&
      activeSegment.element.dataset.placeholderControl === 'true' &&
      activeSegment.element.dataset.placeholderType === 'text'
    ) {
      return activeSegment;
    }
  }

  return (
    segments.find(
      (segment) =>
        segment.editable &&
        segment.element.dataset.placeholderControl === 'true' &&
        segment.element.dataset.placeholderType === 'text',
    ) ?? null
  );
}

function dispatchProgrammaticInput(element: HTMLElement, inserted: string): void {
  const event =
    typeof InputEvent === 'function'
      ? new InputEvent('input', {
          bubbles: true,
          inputType: 'insertReplacementText',
          data: inserted,
        })
      : new Event('input', { bubbles: true });
  element.dispatchEvent(event);
}

function renderPromptSegmentContent(
  element: HTMLElement,
  value: string,
  skillOptions: RichSkillOption[],
  quickActionOptions: RichQuickActionOption[],
): void {
  renderRichTextareaSegments(
    element,
    buildRichTextareaSegments(value, skillOptions, quickActionOptions, { allowTerminalMention: true }),
  );
}

function applyPromptBlockProgrammaticChange(
  root: HTMLElement,
  nextValue: string,
  selectionStart: number,
  selectionEnd: number,
  skillOptions: RichSkillOption[],
  quickActionOptions: RichQuickActionOption[],
): boolean {
  const current = serializeChildren(root);
  if (current === nextValue) {
    setSelectionOffset(root, selectionStart, selectionEnd);
    return true;
  }

  const diff = getStringDiff(current, nextValue);
  const segments = collectPromptEditableSegments(root);
  const segment = findPromptEditableSegment(segments, diff.start, diff.end);
  if (!segment) {
    const fallback = findFallbackPromptTextSegment(segments);
    if (!fallback) return false;

    renderPromptSegmentContent(fallback.element, nextValue, skillOptions, quickActionOptions);
    const nextStart = Math.max(0, Math.min(nextValue.length, selectionStart));
    const nextEnd = Math.max(nextStart, Math.min(nextValue.length, selectionEnd));
    setSelectionOffset(root, fallback.start + nextStart, fallback.start + nextEnd);
    dispatchProgrammaticInput(fallback.element, nextValue);
    return true;
  }

  const currentText = serializeRichTextareaNode(segment.element);
  const localStart = Math.max(0, diff.start - segment.start);
  const localEnd = Math.max(localStart, diff.end - segment.start);
  const nextSegmentText = `${currentText.slice(0, localStart)}${diff.inserted}${currentText.slice(localEnd)}`;
  renderPromptSegmentContent(segment.element, nextSegmentText, skillOptions, quickActionOptions);
  setSelectionOffset(root, selectionStart, selectionEnd);
  dispatchProgrammaticInput(segment.element, diff.inserted);
  return true;
}

function collectTextNodes(root: HTMLElement): Array<{ node: Node; start: number; end: number }> {
  const out: Array<{ node: Node; start: number; end: number }> = [];
  let offset = 0;
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      out.push({ node, start: offset, end: offset + text.length });
      offset += text.length;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.dataset.tokenType === 'skill' || el.dataset.tokenType === 'quick-action') {
      const token = el.dataset.tokenValue ?? '';
      out.push({ node: el, start: offset, end: offset + token.length });
      offset += token.length;
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(root);
  return out;
}

function getSelectionOffset(root: HTMLElement, atEnd: boolean): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const active = sel.getRangeAt(0);
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(atEnd ? active.endContainer : active.startContainer, atEnd ? active.endOffset : active.startOffset);
  const fragment = range.cloneContents();
  let serialized = '';
  for (const child of Array.from(fragment.childNodes)) {
    serialized += serializeRichTextareaNode(child);
  }
  return serialized.length;
}

function setSelectionOffset(root: HTMLElement, start: number, end: number): void {
  const nodes = collectTextNodes(root);
  const pick = (offset: number): { node: Node; offset: number } => {
    for (const item of nodes) {
      if (offset <= item.end) {
        if (item.node.nodeType === Node.TEXT_NODE) {
          return {
            node: item.node,
            offset: Math.max(0, Math.min((item.node.textContent ?? '').length, offset - item.start)),
          };
        }
        const parent = item.node.parentNode;
        if (parent) {
          const idx = Array.prototype.indexOf.call(parent.childNodes, item.node);
          if (offset - item.start <= 0) return { node: parent, offset: idx };
          return { node: parent, offset: idx + 1 };
        }
      }
    }
    return { node: root, offset: root.childNodes.length };
  };

  const s = pick(start);
  const e = pick(end);
  const range = document.createRange();
  range.setStart(s.node, s.offset);
  range.setEnd(e.node, e.offset);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

function clampWithSelection(
  nextValue: string,
  selectionStart: number,
  selectionEnd: number,
  maxLength?: number,
): { value: string; start: number; end: number } {
  if (!maxLength || maxLength <= 0 || nextValue.length <= maxLength) {
    return { value: nextValue, start: selectionStart, end: selectionEnd };
  }
  const clampedValue = nextValue.slice(0, maxLength);
  return {
    value: clampedValue,
    start: Math.min(selectionStart, clampedValue.length),
    end: Math.min(selectionEnd, clampedValue.length),
  };
}

function forceSyncPlainText(root: HTMLElement, value: string, start: number, end: number): void {
  root.replaceChildren(document.createTextNode(value));
  setSelectionOffset(root, start, end);
}

function resolvePositionAtOffset(root: HTMLElement, offset: number): { node: Node; offset: number } {
  const nodes = collectTextNodes(root);
  for (const item of nodes) {
    if (offset <= item.end) {
      if (item.node.nodeType === Node.TEXT_NODE) {
        const textLength = (item.node.textContent ?? '').length;
        return { node: item.node, offset: Math.max(0, Math.min(textLength, offset - item.start)) };
      }
      const parent = item.node.parentNode;
      if (parent) {
        const idx = Array.prototype.indexOf.call(parent.childNodes, item.node);
        if (offset - item.start <= 0) return { node: parent, offset: idx };
        return { node: parent, offset: idx + 1 };
      }
    }
  }
  return { node: root, offset: root.childNodes.length };
}

function getClientRectAtOffset(root: HTMLElement, offset: number): DOMRect | null {
  try {
    const pos = resolvePositionAtOffset(root, offset);
    const range = document.createRange();
    range.setStart(pos.node, pos.offset);
    range.setEnd(pos.node, pos.offset);
    const rect = range.getBoundingClientRect();
    if (rect.width !== 0 || rect.height !== 0) return rect;
    const fallback = root.getBoundingClientRect();
    return fallback.width > 0 || fallback.height > 0 ? fallback : null;
  } catch {
    return null;
  }
}

function isTextInsertionKey(e: KeyboardEvent<HTMLDivElement>): boolean {
  if (e.key.length === 1) return true;
  return e.key === 'Enter';
}

function cloneSnapshot(snapshot: HistorySnapshot): HistorySnapshot {
  return { ...snapshot };
}

function isSameSnapshot(left: HistorySnapshot, right: HistorySnapshot): boolean {
  return left.value === right.value && left.start === right.start && left.end === right.end;
}

function normalizeGroupedHistoryAction(inputType: string): GroupedHistoryAction {
  if (inputType === 'insertText' || inputType === 'deleteContentBackward' || inputType === 'deleteContentForward') {
    return inputType;
  }
  return null;
}


export const RichTextarea = forwardRef<RichTextareaHandle, RichTextareaProps>(function RichTextarea(
  {
    value,
    onValueChange,
    mentionDataVersion = 0,
    onCompositionStateChange,
    onInput,
    onKeyDown,
    onPaste,
    onScroll,
    placeholder,
    className,
    style,
    disabled,
    maxLength,
    skillOptions = [],
    quickActionOptions = [],
    promptBlocks = null,
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isPromptBlockMode = promptBlocks !== null;
  const isComposingRef = useRef(false);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const shouldScrollToBottomRef = useRef(false);
  const currentSnapshotRef = useRef<HistorySnapshot>({ value, start: 0, end: 0 });
  const undoStackRef = useRef<HistorySnapshot[]>([]);
  const redoStackRef = useRef<HistorySnapshot[]>([]);
  const pendingInternalValueSyncRef = useRef(false);
  const historyInputGuardRef = useRef<'historyUndo' | 'historyRedo' | null>(null);
  const historyGroupRef = useRef<{ action: GroupedHistoryAction; timestamp: number }>({
    action: null,
    timestamp: 0,
  });
  const [showPlaceholder, setShowPlaceholder] = useState(() => !value);
  const segments = useMemo(
    () => buildRichTextareaSegments(value, skillOptions, quickActionOptions, { allowTerminalMention: true }),
    [value, skillOptions, quickActionOptions, mentionDataVersion],
  );
  const segmentSignature = useMemo(
    () =>
      `${mentionDataVersion}::` +
      segments
        .map((seg) => {
          if (seg.type === 'text') return `t:${seg.text}`;
          if (seg.type === 'mention') return `m:${seg.text}`;
          if (seg.type === 'skill') return `s:${seg.token}`;
          if (seg.type === 'quick_action') return `q:${seg.token}`;
          return '';
        })
        .join(''),
    [segments, mentionDataVersion],
  );

  useImperativeHandle(ref, () => ({
    focus: () => rootRef.current?.focus(),
    getSelectionStart: () => {
      const root = rootRef.current;
      if (!root) return 0;
      return getSelectionOffset(root, false);
    },
    getSelectionEnd: () => {
      const root = rootRef.current;
      if (!root) return 0;
      return getSelectionOffset(root, true);
    },
    setSelectionRange: (start: number, end: number) => {
      const root = rootRef.current;
      if (!root) return;
      setSelectionOffset(root, start, end);
    },
    getElement: () => rootRef.current,
    getClientRectAtOffset: (offset: number) => {
      const root = rootRef.current;
      if (!root) return null;
      return getClientRectAtOffset(root, offset);
    },
    applyProgrammaticChange: (nextValue: string, selectionStart: number, selectionEnd: number) => {
      if (isPromptBlockMode) {
        const root = rootRef.current;
        if (!root) return;
        const next = clampWithSelection(nextValue, selectionStart, selectionEnd, maxLength);
        applyPromptBlockProgrammaticChange(root, next.value, next.start, next.end, skillOptions, quickActionOptions);
        return;
      }
      const next = clampWithSelection(nextValue, selectionStart, selectionEnd, maxLength);
      commitChange(next, 'insertReplacementText');
    },
  }));

  const resetHistoryGroup = () => {
    historyGroupRef.current = { action: null, timestamp: 0 };
  };

  const pushHistorySnapshot = (stack: MutableRefObject<HistorySnapshot[]>, snapshot: HistorySnapshot) => {
    const copy = cloneSnapshot(snapshot);
    const last = stack.current[stack.current.length - 1];
    if (last && isSameSnapshot(last, copy)) return;
    stack.current.push(copy);
    if (stack.current.length > HISTORY_STACK_LIMIT) {
      stack.current.splice(0, stack.current.length - HISTORY_STACK_LIMIT);
    }
  };

  const applySnapshot = (snapshot: HistorySnapshot) => {
    const root = rootRef.current;
    const next = cloneSnapshot(snapshot);
    currentSnapshotRef.current = next;
    pendingSelectionRef.current = { start: next.start, end: next.end };
    pendingInternalValueSyncRef.current = true;
    setShowPlaceholder(next.value.length === 0);
    if (root) {
      forceSyncPlainText(root, next.value, next.start, next.end);
    }
    onValueChange(next.value, next.start, next.end);
    onInput?.();
  };

  const commitChange = (snapshot: HistorySnapshot, inputType = '') => {
    const next = cloneSnapshot(snapshot);
    const current = currentSnapshotRef.current;
    const valueChanged = current.value !== next.value;
    if (valueChanged) {
      const groupedAction = normalizeGroupedHistoryAction(inputType);
      const now = Date.now();
      const shouldGroup =
        groupedAction !== null &&
        historyGroupRef.current.action === groupedAction &&
        now - historyGroupRef.current.timestamp <= HISTORY_GROUP_WINDOW_MS;
      if (!shouldGroup) {
        pushHistorySnapshot(undoStackRef, current);
      }
      redoStackRef.current = [];
      historyGroupRef.current = { action: groupedAction, timestamp: now };
    } else {
      resetHistoryGroup();
    }

    currentSnapshotRef.current = next;
    pendingSelectionRef.current = { start: next.start, end: next.end };
    pendingInternalValueSyncRef.current = true;
    setShowPlaceholder(next.value.length === 0);
    onValueChange(next.value, next.start, next.end);
    onInput?.();
  };

  const applyUndo = () => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    pushHistorySnapshot(redoStackRef, currentSnapshotRef.current);
    resetHistoryGroup();
    applySnapshot(previous);
  };

  const applyRedo = () => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    pushHistorySnapshot(undoStackRef, currentSnapshotRef.current);
    resetHistoryGroup();
    applySnapshot(next);
  };

  const armHistoryInputGuard = (type: 'historyUndo' | 'historyRedo') => {
    historyInputGuardRef.current = type;
    requestAnimationFrame(() => {
      if (historyInputGuardRef.current === type) {
        historyInputGuardRef.current = null;
      }
    });
  };

  useLayoutEffect(() => {
    if (isPromptBlockMode) return;
    const root = rootRef.current;
    if (!root) return;
    // IME composition guard: rebuilding DOM during 拼音组合输入会打断候选词。
    if (isComposingRef.current) return;
    const current = Array.from(root.childNodes)
      .map((n) => serializeRichTextareaNode(n))
      .join('');
    const currentSignature = Array.from(root.childNodes)
      .map((n) => serializeRichTextareaNodeSignature(n))
      .join('');
    if (current === value && currentSignature === segmentSignature) return;

    const active = document.activeElement === root;
    const pendingSelection = active ? pendingSelectionRef.current : null;
    const start = active ? (pendingSelection?.start ?? getSelectionOffset(root, false)) : 0;
    const end = active ? (pendingSelection?.end ?? getSelectionOffset(root, true)) : 0;
    if (pendingSelection) pendingSelectionRef.current = null;
    const prevScrollTop = root.scrollTop;
    const prevClientHeight = root.clientHeight;
    const prevScrollHeight = root.scrollHeight;
    const wasNearBottom = prevScrollTop + prevClientHeight >= prevScrollHeight - 2;
    renderRichTextareaSegments(root, segments);
    if (active) {
      const nextStart = Math.min(start, value.length);
      const nextEnd = Math.min(end, value.length);
      setSelectionOffset(root, nextStart, nextEnd);
      if (shouldScrollToBottomRef.current) {
        shouldScrollToBottomRef.current = false;
        root.scrollTop = root.scrollHeight;
      } else if (wasNearBottom) {
        // Keep caret visible while typing at the bottom of long content.
        root.scrollTop = root.scrollHeight;
      } else {
        // Preserve manual scroll position when user is editing/viewing middle content.
        root.scrollTop = prevScrollTop;
      }
    }
  }, [isPromptBlockMode, segments, segmentSignature, value]);

  useEffect(() => {
    if (isPromptBlockMode) {
      setShowPlaceholder(false);
      return;
    }
    if (isComposingRef.current) return;
    setShowPlaceholder(!value);
  }, [isPromptBlockMode, value]);

  useEffect(() => {
    if (isPromptBlockMode) return;
    if (pendingInternalValueSyncRef.current) {
      pendingInternalValueSyncRef.current = false;
      return;
    }
    const current = currentSnapshotRef.current;
    if (current.value === value) return;
    currentSnapshotRef.current = {
      value,
      start: Math.min(current.start, value.length),
      end: Math.min(current.end, value.length),
    };
    undoStackRef.current = [];
    redoStackRef.current = [];
    resetHistoryGroup();
  }, [isPromptBlockMode, value]);

  useLayoutEffect(() => {
    if (!isPromptBlockMode) return;
    const root = rootRef.current;
    if (!root) return;
    const rawNext = serializeChildren(root);
    const rawStart = getSelectionOffset(root, false);
    const rawEnd = getSelectionOffset(root, true);
    const nextState = clampWithSelection(rawNext, rawStart, rawEnd, maxLength);
    currentSnapshotRef.current = nextState;
    if (value === nextState.value) return;
    pendingSelectionRef.current = { start: nextState.start, end: nextState.end };
    onValueChange(nextState.value, nextState.start, nextState.end);
  }, [isPromptBlockMode, maxLength, onValueChange, value]);

  const resolveEventElement = (target: EventTarget | null): HTMLElement | null => {
    if (!target) return null;
    if (target instanceof HTMLElement) return target;
    if (target instanceof Text) return target.parentElement;
    return null;
  };

  const handlePromptInput = () => {
    const root = rootRef.current;
    if (!root) return;
    const rawNext = serializeChildren(root);
    const rawStart = getSelectionOffset(root, false);
    const rawEnd = getSelectionOffset(root, true);
    const nextState = clampWithSelection(rawNext, rawStart, rawEnd, maxLength);
    currentSnapshotRef.current = nextState;
    pendingSelectionRef.current = { start: nextState.start, end: nextState.end };
    onValueChange(nextState.value, nextState.start, nextState.end);
    onInput?.();
  };

  return (
    <div className="relative">
      {!isPromptBlockMode && showPlaceholder && placeholder && (
        <div className="pointer-events-none absolute left-[18px] top-4 text-[16px] text-[var(--text-field-placeholder)]">
          {placeholder}
        </div>
      )}
      {isPromptBlockMode && promptBlocks ? (
        <RichTextareaPromptBlocks
          ref={rootRef}
          {...promptBlocks}
          className={className}
          style={style}
          skillOptions={skillOptions}
          quickActionOptions={quickActionOptions}
          onInput={handlePromptInput}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onScroll={onScroll}
        />
      ) : (
        <div
          ref={rootRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          className={className}
          style={style}
          role="textbox"
          aria-multiline="true"
          onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
            const target = resolveEventElement(e.target);
            const removeButton = target?.closest('[data-remove-quick-action="1"]') as HTMLElement | null;
            if (!removeButton) return;

            const token = removeButton.closest('[data-token-type="quick-action"]') as HTMLElement | null;
            const tokenValue = token?.dataset.tokenValue ?? '';
            if (!tokenValue) return;

            e.preventDefault();
            const index = value.indexOf(tokenValue);
            if (index < 0) return;
            const rawNext = `${value.slice(0, index)}${value.slice(index + tokenValue.length)}`;
            const next = rawNext.replace(/\s{2,}/g, ' ').trimStart();
            const caret = Math.min(index, next.length);
            commitChange({ value: next, start: caret, end: caret }, 'deleteContentBackward');
          }}
          onMouseDownCapture={(e: MouseEvent<HTMLDivElement>) => {
            const target = resolveEventElement(e.target);
            if (!target) return;
            const skillToken = target.closest('[data-token-type="skill"]');
            if (!skillToken) return;
            // Keep caret stable when clicking highlighted skill token.
            e.preventDefault();
          }}
          onInput={(e) => {
            const native = e.nativeEvent as InputEvent;
            const inputType = native.inputType ?? '';
            if (historyInputGuardRef.current === inputType) {
              historyInputGuardRef.current = null;
              return;
            }
            if (inputType === 'historyUndo') {
              applyUndo();
              return;
            }
            if (inputType === 'historyRedo') {
              applyRedo();
              return;
            }
            const root = rootRef.current;
            if (!root) return;
            if (isComposingRef.current) {
              // Avoid controlled writes during IME composition; commit on compositionend.
              onInput?.();
              return;
            }
            const rawNext = Array.from(root.childNodes)
              .map((n) => serializeRichTextareaNode(n))
              .join('');
            const rawStart = getSelectionOffset(root, false);
            const rawEnd = getSelectionOffset(root, true);
            const nextState = clampWithSelection(rawNext, rawStart, rawEnd, maxLength);
            pendingSelectionRef.current = { start: nextState.start, end: nextState.end };
            if (nextState.value !== rawNext) {
              // Keep DOM immediately in sync when parent state doesn't change
              // (e.g. already at max length and user keeps typing).
              forceSyncPlainText(e.currentTarget, nextState.value, nextState.start, nextState.end);
            }
            commitChange(nextState, inputType);
          }}
          onBeforeInput={(e) => {
            const root = rootRef.current;
            const native = e.nativeEvent as InputEvent;
            const inputType = native.inputType ?? '';
            if (inputType === 'historyUndo') {
              e.preventDefault();
              armHistoryInputGuard('historyUndo');
              applyUndo();
              return;
            }
            if (inputType === 'historyRedo') {
              e.preventDefault();
              armHistoryInputGuard('historyRedo');
              applyRedo();
              return;
            }
            if (!root || !maxLength || maxLength <= 0) return;
            // Let IME composition flow complete naturally; enforce max in onCompositionEnd/onInput.
            if (isComposingRef.current || inputType.includes('Composition')) return;
            if (!inputType.startsWith('insert')) return;
            const current = Array.from(root.childNodes)
              .map((n) => serializeRichTextareaNode(n))
              .join('');
            const start = getSelectionOffset(root, false);
            const end = getSelectionOffset(root, true);
            const selectedLength = Math.max(0, end - start);
            // For insertParagraph/insertLineBreak, data may be null; treat it as one-char insertion.
            const insertedLength = native.data != null ? native.data.length : 1;
            const nextLength = current.length - selectedLength + insertedLength;
            if (nextLength > maxLength) {
              e.preventDefault();
            }
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
            setShowPlaceholder(false);
            onCompositionStateChange?.(true);
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
            onCompositionStateChange?.(false);
            const root = rootRef.current;
            if (!root) return;
            const rawNext = Array.from(root.childNodes)
              .map((n) => serializeRichTextareaNode(n))
              .join('');
            const rawStart = getSelectionOffset(root, false);
            const rawEnd = getSelectionOffset(root, true);
            const nextState = clampWithSelection(rawNext, rawStart, rawEnd, maxLength);
            if (nextState.value !== rawNext) {
              forceSyncPlainText(root, nextState.value, nextState.start, nextState.end);
            }
            commitChange(nextState, 'insertCompositionText');
          }}
          onKeyDown={(e) => {
            const isUndo = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z';
            const isRedo =
              (e.ctrlKey || e.metaKey) &&
              !e.altKey &&
              ((e.shiftKey && e.key.toLowerCase() === 'z') || (!e.shiftKey && e.key.toLowerCase() === 'y'));
            if (isUndo) {
              e.preventDefault();
              applyUndo();
              return;
            }
            if (isRedo) {
              e.preventDefault();
              applyRedo();
              return;
            }
            const root = rootRef.current;
            if (root && maxLength && maxLength > 0 && !isComposingRef.current) {
              // Fallback guard: some browsers/IME flows may skip reliable beforeinput checks.
              // When already at max and no active selection, block text-inserting keys directly.
              const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
              if (!hasModifier && isTextInsertionKey(e)) {
                const current = Array.from(root.childNodes)
                  .map((n) => serializeRichTextareaNode(n))
                  .join('');
                const start = getSelectionOffset(root, false);
                const end = getSelectionOffset(root, true);
                const hasSelection = end > start;
                if (!hasSelection && current.length >= maxLength) {
                  e.preventDefault();
                }
              }
            }
            onKeyDown?.(e);
          }}
          onPaste={(e) => {
            onPaste?.(e);
            if (e.defaultPrevented) return;

            e.preventDefault();
            const root = rootRef.current;
            if (!root) return;
            const plain = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');

            const start = getSelectionOffset(root, false);
            const end = getSelectionOffset(root, true);
            const rawNext = `${value.slice(0, start)}${plain}${value.slice(end)}`;
            const rawCaret = start + plain.length;
            const nextState = clampWithSelection(rawNext, rawCaret, rawCaret, maxLength);
            shouldScrollToBottomRef.current = plain.length > 0;
            commitChange(nextState, 'insertFromPaste');
            if (plain.length > 0) {
              requestAnimationFrame(() => {
                const currentRoot = rootRef.current;
                if (!currentRoot) return;
                currentRoot.scrollTop = currentRoot.scrollHeight;
              });
            }
          }}
          onScroll={onScroll}
        />
      )}
    </div>
  );
});
