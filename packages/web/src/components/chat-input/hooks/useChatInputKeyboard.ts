/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useCallback } from 'react';
import type { Dispatch, KeyboardEvent, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { PathEntry } from '@/hooks/usePathCompletion';
import { useInputHistoryStore } from '@/stores/inputHistoryStore';
import type { AgentOption } from '../chat-input-options';
import { restoreSkillTokensFromSendText } from '../utils/helpers';
import type { WorkspaceMenuItem } from '../types';
import type { RichTextareaHandle } from '../components/RichTextarea';

interface UseChatInputKeyboardParams {
  input: string;
  hasActiveInvocation?: boolean;
  activeMenu: 'mention' | 'skill' | 'workspace' | null;
  activeOptionsCount: number;
  selectedIdx: number;
  setSelectedIdx: Dispatch<SetStateAction<number>>;
  filteredAgentOptions: AgentOption[];
  filteredSkillOptions: Array<{ name: string }>;
  workspaceMenuItems: WorkspaceMenuItem[];
  textareaRef: RefObject<RichTextareaHandle>;
  setInput: (next: string | ((prev: string) => string)) => void;
  closeMenus: () => void;
  clearMentionFilter: () => void;
  clearSkillFilter: () => void;
  setMentionStart: Dispatch<SetStateAction<number>>;
  setMentionEnd: Dispatch<SetStateAction<number>>;
  insertMention: (option: AgentOption) => void;
  insertSkill: (skillName: string) => void;
  handleWorkspaceMenuSelect: (item: WorkspaceMenuItem) => void;
  handleSend: () => void;
  handleQueueSend: () => void;
  setGhostSuggestion: Dispatch<SetStateAction<string | null>>;
  ghostRef: MutableRefObject<string | null>;
  setShowHistorySearch: Dispatch<SetStateAction<boolean>>;
  pathCompletion: {
    isOpen: boolean;
    entries: PathEntry[];
    selectedIdx: number;
    setSelectedIdx: (idx: number) => void;
    selectEntry: (entry: PathEntry) => string;
    close: () => void;
  };
}

function isOpenHistoryShortcut(e: KeyboardEvent<HTMLDivElement>): boolean {
  return e.ctrlKey && e.key === 'r';
}

function isInsertNewlineShortcut(e: KeyboardEvent<HTMLDivElement>): boolean {
  return e.ctrlKey && e.key === 'Enter';
}

export function useChatInputKeyboard({
  input,
  hasActiveInvocation,
  activeMenu,
  activeOptionsCount,
  selectedIdx,
  setSelectedIdx,
  filteredAgentOptions,
  filteredSkillOptions,
  workspaceMenuItems,
  textareaRef,
  setInput,
  closeMenus,
  clearMentionFilter,
  clearSkillFilter,
  setMentionStart,
  setMentionEnd,
  insertMention,
  insertSkill,
  handleWorkspaceMenuSelect,
  handleSend,
  handleQueueSend,
  setGhostSuggestion,
  ghostRef,
  setShowHistorySearch,
  pathCompletion,
}: UseChatInputKeyboardParams) {
  const closeAllMenus = useCallback(() => {
    closeMenus();
    setMentionStart(-1);
    setMentionEnd(-1);
    clearMentionFilter();
    clearSkillFilter();
  }, [clearMentionFilter, clearSkillFilter, closeMenus, setMentionEnd, setMentionStart]);

  const handleMenuNavigation = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): boolean => {
      if (!activeMenu) return false;

      if (activeOptionsCount === 0) {
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab' || e.key === 'Escape') {
          e.preventDefault();
        }
        closeAllMenus();
        return true;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % activeOptionsCount);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + activeOptionsCount) % activeOptionsCount);
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (activeMenu === 'mention') {
          const opt = filteredAgentOptions[selectedIdx];
          if (!opt) {
            closeMenus();
            return true;
          }
          insertMention(opt);
          return true;
        }
        if (activeMenu === 'skill') {
          const skill = filteredSkillOptions[selectedIdx];
          if (!skill) {
            closeMenus();
            return true;
          }
          insertSkill(skill.name);
          return true;
        }
        const item = workspaceMenuItems[selectedIdx];
        if (!item) {
          closeMenus();
          return true;
        }
        handleWorkspaceMenuSelect(item);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenus();
        setMentionStart(-1);
        setMentionEnd(-1);
        return true;
      }
      return false;
    },
    [
      activeMenu,
      activeOptionsCount,
      closeAllMenus,
      closeMenus,
      filteredAgentOptions,
      filteredSkillOptions,
      handleWorkspaceMenuSelect,
      insertMention,
      insertSkill,
      selectedIdx,
      setMentionEnd,
      setMentionStart,
      setSelectedIdx,
      workspaceMenuItems,
    ],
  );

  const handlePathCompletionNavigation = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): boolean => {
      if (!pathCompletion.isOpen) return false;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        pathCompletion.setSelectedIdx((pathCompletion.selectedIdx + 1) % pathCompletion.entries.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        pathCompletion.setSelectedIdx(
          (pathCompletion.selectedIdx - 1 + pathCompletion.entries.length) % pathCompletion.entries.length,
        );
        return true;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const entry = pathCompletion.entries[pathCompletion.selectedIdx];
        if (entry) {
          const newText = pathCompletion.selectEntry(entry);
          const el = textareaRef.current;
          if (el) {
            el.applyProgrammaticChange(newText, newText.length, newText.length);
          } else {
            setInput(newText);
          }
        }
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        pathCompletion.close();
        return true;
      }
      return false;
    },
    [pathCompletion, setInput, textareaRef],
  );

  const handleHistoryGhostAccept = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): boolean => {
      if (e.key !== 'Tab' && e.key !== 'ArrowRight') return false;

      const ta = textareaRef.current;
      const currentVal = input;
      const selectionStart = ta?.getSelectionStart() ?? currentVal.length;
      const selectionEnd = ta?.getSelectionEnd() ?? currentVal.length;
      const cursorAtEnd = selectionStart === selectionEnd && selectionStart === currentVal.length;
      if (e.key === 'ArrowRight' && !cursorAtEnd) return false;

      const match = useInputHistoryStore.getState().findMatch(currentVal);
      if (!match) return false;
      const restoredMatch = restoreSkillTokensFromSendText(match, []);

      e.preventDefault();
      const el = textareaRef.current;
      if (el) {
        el.applyProgrammaticChange(restoredMatch, restoredMatch.length, restoredMatch.length);
      } else {
        setInput(restoredMatch);
      }
      ghostRef.current = null;
      setGhostSuggestion(null);
      return true;
    },
    [ghostRef, input, setGhostSuggestion, setInput, textareaRef],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.nativeEvent.isComposing) return;

      if (isOpenHistoryShortcut(e)) {
        e.preventDefault();
        closeAllMenus();
        setShowHistorySearch(true);
        return;
      }

      if (isInsertNewlineShortcut(e)) {
        e.preventDefault();
        const ta = textareaRef.current;
        const start = ta?.getSelectionStart() ?? input.length;
        const end = ta?.getSelectionEnd() ?? input.length;
        const next = `${input.slice(0, start)}\n${input.slice(end)}`;
        setInput(next);
        closeMenus();
        pathCompletion.close();
        setTimeout(() => {
          textareaRef.current?.focus();
          textareaRef.current?.setSelectionRange(start + 1, start + 1);
        }, 0);
        return;
      }

      if (handleMenuNavigation(e)) return;
      if (handlePathCompletionNavigation(e)) return;
      if (handleHistoryGhostAccept(e)) return;

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (hasActiveInvocation) handleQueueSend();
        else handleSend();
      }
    },
    [
      closeAllMenus,
      closeMenus,
      handleHistoryGhostAccept,
      handleMenuNavigation,
      handlePathCompletionNavigation,
      handleQueueSend,
      handleSend,
      hasActiveInvocation,
      input,
      pathCompletion,
      setInput,
      setShowHistorySearch,
      textareaRef,
    ],
  );

  return { handleKeyDown };
}
