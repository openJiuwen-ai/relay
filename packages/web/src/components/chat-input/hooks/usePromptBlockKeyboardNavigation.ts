/*
 * *
 *  Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { useEffect, type RefObject } from 'react';
import type { ParsedPrompt } from '@/utils/promptParser';

interface UsePromptBlockKeyboardNavigationParams {
  containerRef: RefObject<HTMLElement>;
  parsed: ParsedPrompt;
  onFocus: (id: string) => void;
  onBlur: () => void;
  onDelete?: (id: string) => void;
}

type CaretEdge = 'start' | 'end';
type ArrowDirection = 'left' | 'right';

function isEditableTextPlaceholder(element: HTMLElement): boolean {
  return element.getAttribute('contenteditable') === 'true';
}

function findPlaceholderControl(container: HTMLElement, placeholderId: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>('[data-placeholder-control="true"]')).find(
      (element) => element.dataset.placeholderId === placeholderId,
    ) ?? null
  );
}

function findFixedBlock(container: HTMLElement, blockIndex: number): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>('[data-block-index]')).find(
      (element) => Number(element.dataset.blockIndex) === blockIndex,
    ) ?? null
  );
}

function placeCaretInFixedBlock(
  container: HTMLElement,
  blockIndex: number,
  edge: CaretEdge,
  onBlur: () => void,
): boolean {
  const fixedBlock = findFixedBlock(container, blockIndex);
  const selection = window.getSelection();
  if (!fixedBlock || !selection) return false;

  fixedBlock.focus();
  onBlur();

  const range = document.createRange();
  range.selectNodeContents(fixedBlock);
  range.collapse(edge === 'start');
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function focusPlaceholder(
  container: HTMLElement,
  placeholderId: string,
  edge: CaretEdge,
  onFocus: (id: string) => void,
): boolean {
  const control = findPlaceholderControl(container, placeholderId);
  if (!control) return false;

  control.focus();
  if (control instanceof HTMLInputElement) {
    const caret = edge === 'start' ? 0 : control.value.length;
    control.setSelectionRange(caret, caret);
  } else if (isEditableTextPlaceholder(control)) {
    placeCaretInEditableElement(control, edge);
  }
  onFocus(placeholderId);
  return true;
}

function placeCaretAtContainerEdge(container: HTMLElement, edge: CaretEdge, onBlur: () => void): boolean {
  const selection = window.getSelection();
  if (!selection) return false;

  container.focus();
  onBlur();

  const range = document.createRange();
  range.selectNodeContents(container);
  range.collapse(edge === 'start');
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function moveToBlockBoundary(
  container: HTMLElement,
  parsed: ParsedPrompt,
  blockIndex: number,
  edge: CaretEdge,
  onFocus: (id: string) => void,
  onBlur: () => void,
): boolean {
  const block = parsed.blocks[blockIndex];
  if (!block) return placeCaretAtContainerEdge(container, edge, onBlur);

  if (block.type === 'fixed') {
    return placeCaretInFixedBlock(container, blockIndex, edge, onBlur);
  }

  return focusPlaceholder(container, block.placeholder.id, edge, onFocus);
}

function moveFromBlock(
  container: HTMLElement,
  parsed: ParsedPrompt,
  blockIndex: number,
  direction: ArrowDirection,
  onFocus: (id: string) => void,
  onBlur: () => void,
): boolean {
  const targetIndex = direction === 'left' ? blockIndex - 1 : blockIndex + 1;
  const targetEdge = direction === 'left' ? 'end' : 'start';
  return moveToBlockBoundary(container, parsed, targetIndex, targetEdge, onFocus, onBlur);
}

function getPlaceholderBlockIndex(parsed: ParsedPrompt, placeholderId: string): number {
  return parsed.blocks.findIndex(
    (block) => block.type === 'placeholder' && block.placeholder.id === placeholderId,
  );
}

function getFixedBlockIndexFromRange(container: HTMLElement, range: Range): number | null {
  const startNode = range.startContainer;
  const startElement = startNode instanceof Element ? startNode : startNode.parentElement;
  const fixedBlock = startElement?.closest<HTMLElement>('[data-block-index]');
  if (!fixedBlock || !container.contains(fixedBlock)) return null;

  const blockIndex = Number(fixedBlock.dataset.blockIndex);
  return Number.isFinite(blockIndex) ? blockIndex : null;
}

function getCaretTextOffset(range: Range, container: HTMLElement): number | null {
  if (!container.contains(range.startContainer)) return null;

  const beforeCaret = document.createRange();
  beforeCaret.selectNodeContents(container);
  beforeCaret.setEnd(range.startContainer, range.startOffset);
  return beforeCaret.toString().length;
}

function isCaretAtBoundary(range: Range, container: HTMLElement, edge: CaretEdge): boolean {
  const caretOffset = getCaretTextOffset(range, container);
  if (caretOffset === null) return false;

  return edge === 'start' ? caretOffset === 0 : caretOffset === container.textContent?.length;
}

function isFixedCaretAtBoundary(range: Range, fixedBlock: HTMLElement, edge: CaretEdge): boolean {
  return isCaretAtBoundary(range, fixedBlock, edge);
}

function getActivePlaceholderControl(container: HTMLElement): HTMLElement | null {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return null;
  if (!container.contains(activeElement)) return null;
  return activeElement.dataset.placeholderControl === 'true' ? activeElement : null;
}

function shouldMoveFromTextInput(input: HTMLInputElement, direction: ArrowDirection): boolean {
  const selectionStart = input.selectionStart ?? 0;
  const selectionEnd = input.selectionEnd ?? selectionStart;
  if (selectionStart !== selectionEnd) return false;

  return direction === 'left' ? selectionStart === 0 : selectionEnd === input.value.length;
}

function getEditableTextNode(element: HTMLElement, edge: CaretEdge): Text | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode() as Text | null;
  let candidate: Text | null = null;

  while (current) {
    if (current.data.length > 0) {
      candidate = current;
      if (edge === 'start') return candidate;
    }
    current = walker.nextNode() as Text | null;
  }

  return candidate;
}

function placeCaretInEditableElement(element: HTMLElement, edge: CaretEdge): boolean {
  const selection = window.getSelection();
  if (!selection) return false;

  const range = document.createRange();
  const textNode = getEditableTextNode(element, edge);
  if (textNode) {
    range.setStart(textNode, edge === 'start' ? 0 : textNode.data.length);
  } else {
    range.selectNodeContents(element);
    range.collapse(edge === 'start');
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function shouldMoveFromEditableText(element: HTMLElement, direction: ArrowDirection): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  if (!range.collapsed) return false;

  const edge = direction === 'left' ? 'start' : 'end';
  return isCaretAtBoundary(range, element, edge);
}

function shouldMoveFromPlaceholderControl(control: HTMLElement, direction: ArrowDirection): boolean {
  if (control instanceof HTMLInputElement) {
    return shouldMoveFromTextInput(control, direction);
  }
  if (isEditableTextPlaceholder(control)) {
    return shouldMoveFromEditableText(control, direction);
  }
  return true;
}

export function usePromptBlockKeyboardNavigation({
  containerRef,
  parsed,
  onFocus,
  onBlur,
  onDelete,
}: UsePromptBlockKeyboardNavigationParams & { onDelete?: (id: string) => void }) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const activePlaceholderControl = getActivePlaceholderControl(container);
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;

      // Handle Backspace
      if (event.key === 'Backspace' && range && range.collapsed) {
        const fixedBlockIndex = getFixedBlockIndexFromRange(container, range);
        const fixedBlock = fixedBlockIndex !== null ? findFixedBlock(container, fixedBlockIndex) : null;

        // Backspace at start of fixed block - try to delete preceding placeholder
        if (fixedBlock && isFixedCaretAtBoundary(range, fixedBlock, 'start') && fixedBlockIndex !== null) {
          const placeholderIndex = fixedBlockIndex - 1;
          if (placeholderIndex >= 0) {
            const block = parsed.blocks[placeholderIndex];
            if (block?.type === 'placeholder') {
              event.preventDefault();
              onDelete?.(block.placeholder.id);
              // Position cursor at end of block before deleted placeholder
              const targetIndex = placeholderIndex - 1;
              const targetBlock = parsed.blocks[targetIndex];
              if (targetBlock?.type === 'fixed') {
                moveToBlockBoundary(container, parsed, targetIndex, 'end', onFocus, onBlur);
              } else if (targetBlock?.type === 'placeholder') {
                focusPlaceholder(container, targetBlock.placeholder.id, 'end', onFocus);
              } else {
                placeCaretAtContainerEdge(container, 'end', onBlur);
              }
              return;
            }
          }
        }

        // Backspace in fixed block (not at boundary) - let browser handle normally
        if (fixedBlockIndex !== null) return;

        // Backspace at start of placeholder content - delete placeholder
        if (activePlaceholderControl) {
          const placeholderId = activePlaceholderControl.dataset.placeholderId;
          if (!placeholderId) return;

          const blockIndex = getPlaceholderBlockIndex(parsed, placeholderId);
          if (blockIndex < 0) return;

          const block = parsed.blocks[blockIndex];
          if (block?.type !== 'placeholder') return;

          // Check if caret is at start of placeholder content
          const caretOffset = getCaretTextOffset(range, activePlaceholderControl);
          if (caretOffset === 0) {
            event.preventDefault();
            onDelete?.(placeholderId);
            // Position cursor at block before deleted placeholder
            const targetIndex = blockIndex - 1;
            if (targetIndex >= 0) {
              const targetBlock = parsed.blocks[targetIndex];
              if (targetBlock?.type === 'fixed') {
                moveToBlockBoundary(container, parsed, targetIndex, 'end', onFocus, onBlur);
              } else if (targetBlock?.type === 'placeholder') {
                focusPlaceholder(container, targetBlock.placeholder.id, 'end', onFocus);
              } else {
                placeCaretAtContainerEdge(container, 'end', onBlur);
              }
            } else {
              placeCaretAtContainerEdge(container, 'start', onBlur);
            }
            return;
          }
        }
        return;
      }

      // Handle ArrowLeft/ArrowRight
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;

      const direction: ArrowDirection = event.key === 'ArrowLeft' ? 'left' : 'right';

      if (activePlaceholderControl) {
        const placeholderId = activePlaceholderControl.dataset.placeholderId;
        if (!placeholderId) return;
        if (!shouldMoveFromPlaceholderControl(activePlaceholderControl, direction)) {
          return;
        }

        const blockIndex = getPlaceholderBlockIndex(parsed, placeholderId);
        if (blockIndex < 0) return;

        event.preventDefault();
        moveFromBlock(container, parsed, blockIndex, direction, onFocus, onBlur);
        return;
      }

      if (!range || !range.collapsed) return;

      const fixedBlockIndex = getFixedBlockIndexFromRange(container, range);
      if (fixedBlockIndex === null) return;

      const fixedBlock = findFixedBlock(container, fixedBlockIndex);
      if (!fixedBlock) return;

      const edge = direction === 'left' ? 'start' : 'end';
      if (!isFixedCaretAtBoundary(range, fixedBlock, edge)) return;

      event.preventDefault();
      moveFromBlock(container, parsed, fixedBlockIndex, direction, onFocus, onBlur);
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, onBlur, onFocus, onDelete, parsed]);
}
