/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { CSSProperties, Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { useCallback } from 'react';
import type { AgentOption } from '../chat-input-options';
import type { RichTextareaHandle } from '../components/RichTextarea';
import type { MentionRef } from '@/hooks/useSendMessage';
import { getSkillToken } from '../utils/helpers';

interface UseMentionSkillActionsParams {
  showMentions: boolean;
  mentionStart: number;
  mentionEnd: number;
  input: string;
  textareaRef: RefObject<RichTextareaHandle>;
  menuRef: RefObject<HTMLDivElement>;
  skillInsertAnchorRef: MutableRefObject<{ start: number; end: number } | null>;
  setInput: (next: string | ((prev: string) => string)) => void;
  setShowMentions: Dispatch<SetStateAction<boolean>>;
  setShowSkillMenu: Dispatch<SetStateAction<boolean>>;
  setMentionStart: Dispatch<SetStateAction<number>>;
  setMentionEnd: Dispatch<SetStateAction<number>>;
  setMentionMenuStyle: Dispatch<SetStateAction<CSSProperties>>;
  clearMentionFilter: () => void;
  clearSkillFilter: () => void;
  onMentionRefInserted?: (ref: MentionRef) => void;
}

export function useMentionSkillActions({
  showMentions,
  mentionStart,
  mentionEnd,
  input,
  textareaRef,
  menuRef,
  skillInsertAnchorRef,
  setInput,
  setShowMentions,
  setShowSkillMenu,
  setMentionStart,
  setMentionEnd,
  setMentionMenuStyle,
  clearMentionFilter,
  clearSkillFilter,
  onMentionRefInserted,
}: UseMentionSkillActionsParams) {
  const updateMentionMenuPosition = useCallback(() => {
    if (!showMentions) return;
    const ta = textareaRef.current;
    const root = ta?.getElement();
    if (!root) return;
    const offset = mentionStart >= 0 ? mentionStart : (ta?.getSelectionStart() ?? 0);
    const anchorRect = ta?.getClientRectAtOffset(offset) ?? root.getBoundingClientRect();
    const menuWidth = 200;
    const menuHeight = Math.max(120, menuRef.current?.offsetHeight ?? 220);
    const viewportPadding = 8;
    const desiredLeft = anchorRect.left;
    const desiredTop = anchorRect.top - menuHeight - 8;
    const maxLeft = window.innerWidth - menuWidth - viewportPadding;
    const maxTop = window.innerHeight - menuHeight - viewportPadding;
    const left = Math.min(Math.max(desiredLeft, viewportPadding), Math.max(viewportPadding, maxLeft));
    const top = Math.min(Math.max(desiredTop, viewportPadding), Math.max(viewportPadding, maxTop));
    setMentionMenuStyle({ left, top });
  }, [mentionStart, menuRef, setMentionMenuStyle, showMentions, textareaRef]);

  const insertMention = useCallback(
    (option: AgentOption) => {
      const cursor = textareaRef.current?.getSelectionStart() ?? input.length;
      const start = mentionStart >= 0 ? mentionStart : cursor;
      const end = mentionEnd >= start ? mentionEnd : cursor;
      const before = input.slice(0, start);
      const after = input.slice(end);
      const mentionText = option.insert.trim();
      const leftJoiner = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
      const rightJoiner = ' ';
      const normalizedAfter = after.replace(/^\s+/, '');
      const nextValue = `${before}${leftJoiner}${mentionText}${rightJoiner}${normalizedAfter}`;
      const cursorPos = (before + leftJoiner + mentionText + rightJoiner).length;
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.applyProgrammaticChange(nextValue, cursorPos, cursorPos);
      } else {
        setInput(nextValue);
      }
      if (mentionText) {
        onMentionRefInserted?.({ catId: option.id, mention: mentionText });
      }
      setShowMentions(false);
      setMentionStart(-1);
      setMentionEnd(-1);
      clearMentionFilter();
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        const cursorPos = (before + leftJoiner + mentionText + rightJoiner).length;
        el.focus();
        el.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    },
    [
      clearMentionFilter,
      input,
      mentionEnd,
      mentionStart,
      setInput,
      setMentionEnd,
      onMentionRefInserted,
      setMentionStart,
      setShowMentions,
      textareaRef,
    ],
  );

  const insertSkill = useCallback(
    (skillName: string) => {
      const ta = textareaRef.current;
      const anchor = skillInsertAnchorRef.current;
      const start = anchor?.start ?? ta?.getSelectionStart() ?? input.length;
      const end = anchor?.end ?? ta?.getSelectionEnd() ?? input.length;
      const before = input.slice(0, start);
      const after = input.slice(end);
      const leftJoiner = before.endsWith(' ') ? '' : ' ';
      const rightJoiner = ' ';
      const normalizedAfter = after.replace(/^\s+/, '');
      const triggerText = getSkillToken(skillName);
      const next = `${before}${leftJoiner}${triggerText}${rightJoiner}${normalizedAfter}`;
      const cursorPos = (before + leftJoiner + triggerText + rightJoiner).length;
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.applyProgrammaticChange(next, cursorPos, cursorPos);
      } else {
        setInput(next);
      }
      setShowSkillMenu(false);
      clearSkillFilter();
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        const cursorPos = (before + leftJoiner + triggerText + rightJoiner).length;
        skillInsertAnchorRef.current = { start: cursorPos, end: cursorPos };
        el.focus();
        el.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    },
    [clearSkillFilter, input, setInput, setShowSkillMenu, skillInsertAnchorRef, textareaRef],
  );

  return {
    updateMentionMenuPosition,
    insertMention,
    insertSkill,
  };
}
