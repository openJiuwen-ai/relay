/*
 * *
 *  Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { usePlaceholderStore } from '@/stores/placeholderStore';
import type { TextPlaceholder } from '@/utils/promptParser';
import {
  buildRichTextareaSegments,
  type RichQuickActionOption,
  type RichSkillOption,
  type RichTextareaSegment,
  renderRichTextareaSegments,
  serializeRichTextareaNode,
  serializeRichTextareaNodeSignature,
} from './rich-textarea-token-rendering';

interface TextPlaceholderBlockProps {
  placeholder: TextPlaceholder;
  isActive: boolean;
  skillOptions: RichSkillOption[];
  quickActionOptions: RichQuickActionOption[];
  onFocus: () => void;
  onBlur: () => void;
  onDelete: () => void;
  onTabNext: () => void;
}

export function TextPlaceholderBlock({
  placeholder,
  isActive,
  skillOptions,
  quickActionOptions,
  onFocus,
  onBlur,
  onDelete,
  onTabNext,
}: TextPlaceholderBlockProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const userInput = usePlaceholderStore((s) => s.textValues[placeholder.id] ?? '');
  const setTextValue = usePlaceholderStore((s) => s.setTextValue);
  const segments = useMemo(
    () =>
      buildRichTextareaSegments(userInput, skillOptions, quickActionOptions, {
        allowTerminalMention: true,
      }),
    [quickActionOptions, skillOptions, userInput],
  );
  const hasRichTokens = useMemo(() => segments.some((segment) => segment.type !== 'text'), [segments]);
  const segmentSignature = useMemo(
    () =>
      segments
        .map((segment) => {
          if (segment.type === 'text') return `t:${segment.text}`;
          if (segment.type === 'mention') return `m:${segment.text}`;
          if (segment.type === 'skill') return `s:${segment.token}`;
          return `q:${segment.token}`;
        })
        .join(''),
    [segments],
  );

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;

    const currentText = Array.from(el.childNodes)
      .map((node) => serializeRichTextareaNode(node))
      .join('');
    const currentSignature = Array.from(el.childNodes)
      .map((node) => serializeRichTextareaNodeSignature(node))
      .join('');
    if (currentText === userInput && currentSignature === segmentSignature) return;

    const selection = window.getSelection();
    const isFocused = document.activeElement === el && selection && selection.rangeCount > 0;
    const activeSelection = isFocused ? getSelectionOffsetsWithinElement(el, selection.getRangeAt(0)) : null;
    const nextSegments: RichTextareaSegment[] = hasRichTokens ? segments : [{ type: 'text', text: userInput }];

    renderRichTextareaSegments(el, nextSegments);

    if (activeSelection) {
      setSelectionOffsetsWithinElement(el, activeSelection.start, activeSelection.end);
    }
  }, [hasRichTokens, segments, segmentSignature, userInput]);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (isActive && el && document.activeElement !== el) {
      el.focus();
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [isActive]);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLSpanElement>) => {
      const value = Array.from(e.currentTarget.childNodes)
        .map((node) => serializeRichTextareaNode(node))
        .join('');
      setTextValue(placeholder.id, value);
    },
    [placeholder.id, setTextValue],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        onTabNext();
        return;
      }

      // Don't prevent arrow keys - let them bubble to container for navigation
      if (e.key === 'Backspace') {
        if (userInput.length === 0) {
          e.preventDefault();
          onDelete();
          return;
        }
      }
    },
    [userInput.length, onDelete, onTabNext],
  );

  const handleFocus = useCallback(() => {
    onFocus();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    onBlur();
  }, [onBlur]);

  const isEmpty = userInput.length === 0;

  return (
    <span
      ref={textRef}
      contentEditable
      suppressContentEditableWarning
      className="prompt-placeholder-text inline rounded-[6px] px-[4px] py-[1px] align-baseline outline-none whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
      style={{
        backgroundColor: 'rgba(20, 118, 255, 0.08)',
        color: isEmpty ? 'rgba(20, 118, 255, 0.4)' : 'rgba(20, 118, 255, 1)',
      }}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      data-placeholder={placeholder.defaultText}
      data-placeholder-empty={isEmpty ? 'true' : 'false'}
      data-placeholder-id={placeholder.id}
      data-placeholder-control="true"
      data-placeholder-type="text"
    />
  );
}

function getSelectionOffsetsWithinElement(
  element: HTMLSpanElement,
  range: Range,
): { start: number; end: number } | null {
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return null;

  const startRange = document.createRange();
  startRange.selectNodeContents(element);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = document.createRange();
  endRange.selectNodeContents(element);
  endRange.setEnd(range.endContainer, range.endOffset);

  return {
    start: serializeSelectionRange(startRange),
    end: serializeSelectionRange(endRange),
  };
}

function serializeSelectionRange(range: Range): number {
  const fragment = range.cloneContents();
  let serialized = '';
  for (const child of Array.from(fragment.childNodes)) {
    serialized += serializeRichTextareaNode(child);
  }
  return serialized.length;
}

function setSelectionOffsetsWithinElement(element: HTMLSpanElement, start: number, end: number): void {
  const nodes: Array<{ node: Node; start: number; end: number }> = [];
  let offset = 0;
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      nodes.push({ node, start: offset, end: offset + text.length });
      offset += text.length;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.dataset.tokenType === 'skill' || el.dataset.tokenType === 'quick-action') {
      const token = el.dataset.tokenValue ?? '';
      nodes.push({ node, start: offset, end: offset + token.length });
      offset += token.length;
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(element);

  const pick = (target: number): { node: Node; offset: number } => {
    for (const item of nodes) {
      if (target <= item.end) {
        if (item.node.nodeType === Node.TEXT_NODE) {
          return {
            node: item.node,
            offset: Math.max(0, Math.min((item.node.textContent ?? '').length, target - item.start)),
          };
        }
        const parent = item.node.parentNode;
        if (parent) {
          const idx = Array.prototype.indexOf.call(parent.childNodes, item.node);
          if (target - item.start <= 0) return { node: parent, offset: idx };
          return { node: parent, offset: idx + 1 };
        }
      }
    }
    return { node: element, offset: element.childNodes.length };
  };

  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const s = pick(start);
  const e = pick(end);
  range.setStart(s.node, s.offset);
  range.setEnd(e.node, e.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}
