/*
 * *
 *  Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RichTextareaHandle } from '@/components/chat-input/components/RichTextarea';
import { serializeRichTextareaNode } from '@/components/chat-input/components/rich-textarea-token-rendering';
import { useChatStore } from '@/stores/chatStore';
import { usePlaceholderStore } from '@/stores/placeholderStore';
import { type ParsedPrompt, parsePromptTemplate } from '@/utils/promptParser';

function buildPendingTemplateInput(currentInput: string, pendingText: string): string {
  const separator = currentInput && !currentInput.endsWith('\n') ? '\n' : '';
  return `${currentInput}${separator}${pendingText}`;
}

interface UseInspirationTemplateOptions {
  input: string;
  setInput: (next: string | ((prev: string) => string)) => void;
  textareaRef: RefObject<RichTextareaHandle>;
  onSend?: (finalText: string, files: File[]) => void;
}

export interface InspirationTemplateState {
  isTemplate: boolean;
  parsed: ParsedPrompt | null;
  activePlaceholderId: string | null;
  setActivePlaceholder: (id: string | null) => void;
  handlePlaceholderFocus: (id: string) => void;
  handlePlaceholderBlur: () => void;
  handlePlaceholderDelete: (id: string) => void;
  handlePlaceholderTabNext: (currentId: string) => void;
  buildSendContent: () => { text: string; files: File[] };
  syncInputFromTemplate: () => void;
  resetTemplate: () => void;
}

/**
 * Hook to handle inspiration template flow
 * - Detects if current input is a template with placeholders
 * - Manages placeholder focus/edit state
 * - Builds final content for sending
 */
function buildSendContentFromPromptRoot(root: HTMLElement): { text: string; files: File[] } {
  const fileValues = usePlaceholderStore.getState().fileValues;
  let text = '';
  const files: File[] = [];

  for (const child of Array.from(root.childNodes)) {
    if (child instanceof Text) {
      text += serializeRichTextareaNode(child);
      continue;
    }
    if (
      child instanceof HTMLElement &&
      child.dataset.placeholderControl === 'true' &&
      child.dataset.placeholderType === 'file'
    ) {
      const placeholderId = child.dataset.placeholderId ?? '';
      const fileValue = fileValues[placeholderId];
      text += fileValue?.path ?? child.getAttribute('data-placeholder') ?? child.textContent ?? '';
      if (fileValue?.file) {
        files.push(fileValue.file);
      }
      continue;
    }

    if (
      child instanceof HTMLElement &&
      child.dataset.placeholderControl === 'true' &&
      child.dataset.placeholderType === 'text'
    ) {
      const placeholderId = child.dataset.placeholderId ?? '';
      const textValue = usePlaceholderStore.getState().textValues[placeholderId];
      text += textValue && textValue.length > 0 ? textValue : (child.getAttribute('data-placeholder') ?? '');
      continue;
    }

    text += serializeRichTextareaNode(child);
  }

  return { text, files };
}

export function useInspirationTemplate({
  input,
  setInput,
  textareaRef,
}: UseInspirationTemplateOptions): InspirationTemplateState {
  const pendingChatInsert = useChatStore((s) => s.pendingChatInsert);
  const setPendingChatInsert = useChatStore((s) => s.setPendingChatInsert);

  const [activePlaceholderId, setActivePlaceholderId] = useState<string | null>(null);
  const consumedRef = useRef<boolean>(false);
  const pendingRef = useRef(pendingChatInsert);
  const parsedPersistRef = useRef<ParsedPrompt | null>(null);

  useEffect(() => {
    pendingRef.current = pendingChatInsert;
  }, [pendingChatInsert]);

  const templateText = pendingChatInsert?.inspirationData?.prompt ?? pendingChatInsert?.text;
  const insertedTemplateText = pendingChatInsert?.text ?? templateText;
  const inputIsTemplate = Boolean(input?.includes('{{'));
  const isTemplateCandidate = Boolean(templateText?.includes('{{')) || inputIsTemplate;

  // Handle re-mount case: when ChatInput remounts (e.g., navigating back to new session),
  // pendingChatInsert may already be null but input still contains template syntax.
  // Re-parse the input to restore placeholder state.
  useEffect(() => {
    if (parsedPersistRef.current) return;
    if (!inputIsTemplate) return;

    const newParsed = parsePromptTemplate(input);
    parsedPersistRef.current = newParsed;
  }, [input, inputIsTemplate]);

  useEffect(() => {
    if (templateText && isTemplateCandidate && !consumedRef.current) {
      const parseSource =
        inputIsTemplate || !insertedTemplateText ? input : buildPendingTemplateInput(input, insertedTemplateText);
      const newParsed = parsePromptTemplate(parseSource);
      parsedPersistRef.current = newParsed;
      consumedRef.current = true;
      setPendingChatInsert(null);
    }
  }, [input, inputIsTemplate, insertedTemplateText, templateText, isTemplateCandidate, setPendingChatInsert]);

  useEffect(() => {
    const currentParsed = parsedPersistRef.current;
    if (currentParsed && currentParsed.placeholderIds.length > 0) {
      setActivePlaceholderId(currentParsed.placeholderIds[0]);
    }
  }, []);

  const isTemplate = Boolean(parsedPersistRef.current);

  const setActivePlaceholder = useCallback((id: string | null) => {
    setActivePlaceholderId(id);
  }, []);

  const handlePlaceholderFocus = useCallback((id: string) => {
    setActivePlaceholderId(id);
  }, []);

  const handlePlaceholderBlur = useCallback(() => {
    // Don't blur immediately if there are pending changes
  }, []);

  const handlePlaceholderTabNext = useCallback((currentId: string) => {
    const currentParsed = parsedPersistRef.current;
    if (!currentParsed) return;
    const currentIdx = currentParsed.placeholderIds.indexOf(currentId);
    if (currentIdx < currentParsed.placeholderIds.length - 1) {
      setActivePlaceholderId(currentParsed.placeholderIds[currentIdx + 1]);
    }
  }, []);

  const syncInputFromTemplate = useCallback(() => {
    const currentParsed = parsedPersistRef.current;
    if (!currentParsed) return;

    const textValues = usePlaceholderStore.getState().textValues;
    const fileValues = usePlaceholderStore.getState().fileValues;

    let resultText = '';

    for (const block of currentParsed.blocks) {
      if (block.type === 'fixed') {
        resultText += block.content;
      } else if (block.type === 'placeholder') {
        const placeholder = block.placeholder;
        if (placeholder.type === 'text') {
          const textValue = textValues[placeholder.id];
          resultText += textValue ?? placeholder.defaultText;
        } else if (placeholder.type === 'file') {
          const fileValue = fileValues[placeholder.id];
          resultText += fileValue?.name ?? placeholder.defaultText;
        }
      }
    }

    setInput(resultText);
  }, [setInput]);

  const resetTemplate = useCallback(() => {
    parsedPersistRef.current = null;
    consumedRef.current = false;
    setActivePlaceholderId(null);
  }, []);

  const handlePlaceholderDelete = useCallback(
    (id: string) => {
      if (activePlaceholderId === id) {
        setActivePlaceholderId(null);
      }

      const currentParsed = parsedPersistRef.current;
      if (!currentParsed) return;

      const blockIndex = currentParsed.blocks.findIndex(
        (block) => block.type === 'placeholder' && block.placeholder.id === id,
      );
      if (blockIndex < 0) return;

      const newBlocks = currentParsed.blocks.filter((_, idx) => idx !== blockIndex);
      const newPlaceholderIds = currentParsed.placeholderIds.filter((pid) => pid !== id);

      parsedPersistRef.current = {
        blocks: newBlocks,
        placeholderIds: newPlaceholderIds,
      };

      const textValues = usePlaceholderStore.getState().textValues;
      const fileValues = usePlaceholderStore.getState().fileValues;
      const newTextValues = { ...textValues };
      const newFileValues = { ...fileValues };
      delete newTextValues[id];
      delete newFileValues[id];
      usePlaceholderStore.setState({ textValues: newTextValues, fileValues: newFileValues });

      // Sync input with new template content
      syncInputFromTemplate();
    },
    [activePlaceholderId, syncInputFromTemplate],
  );

  const buildSendContent = useCallback(() => {
    const currentParsed = parsedPersistRef.current;
    const root = textareaRef.current?.getElement();
    if (!currentParsed || !root) {
      return { text: input, files: [] };
    }
    return buildSendContentFromPromptRoot(root);
  }, [input, textareaRef]);

  return {
    isTemplate,
    parsed: parsedPersistRef.current,
    activePlaceholderId,
    setActivePlaceholder,
    handlePlaceholderFocus,
    handlePlaceholderBlur,
    handlePlaceholderDelete,
    handlePlaceholderTabNext,
    buildSendContent,
    syncInputFromTemplate,
    resetTemplate,
  };
}
