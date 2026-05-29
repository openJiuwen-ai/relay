/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { QUICK_ACTIONS, type QuickActionConfig } from '@/config/quick-actions';
import type { AgentData } from '@/hooks/useAgentData';
import type { MentionRef } from '@/hooks/useSendMessage';
import type { RichTextareaHandle } from '../components/RichTextarea';
import { QUICK_ACTION_TOKEN_PREFIX, QUICK_ACTION_TOKEN_SUFFIX } from '../utils/constants';
import { buildResolvedMention } from '../utils/helpers';

function stripExpertCardMentionPrefix(content: string, displayNames: string[]): string {
  const displayPrefix = displayNames.map((name) => `@${name}`).join('');
  if (displayPrefix && content.startsWith(displayPrefix)) {
    return content
      .slice(displayPrefix.length)
      .replace(/^[，,]\s*/, '')
      .trimStart();
  }
  return content.replace(/^(?:@[^@\s，,]+)+[，,]?\s*/, '').trimStart();
}

export function getQuickActionToken(label: string): string {
  return `${QUICK_ACTION_TOKEN_PREFIX}${label}${QUICK_ACTION_TOKEN_SUFFIX}`;
}

export function normalizeQuickActionsForSend(input: string): string {
  let output = input;
  for (const action of QUICK_ACTIONS) {
    const token = getQuickActionToken(action.label);
    output = output.split(token).join(action.label);
  }
  return output;
}

interface UseQuickActionsArgs {
  input: string;
  agents: AgentData[];
  queueAwareDisabled: boolean;
  textareaRef: RefObject<RichTextareaHandle | null>;
  applyProgrammaticInput: (next: string, caret: number) => void;
  onQuickActionSelected?: () => void;
  onExpertCardClicked?: () => void;
  onMentionRefsChanged?: (refs: MentionRef[]) => void;
  onMentionRefsCleared?: () => void;
}

export function useQuickActions({
  input,
  agents,
  queueAwareDisabled,
  textareaRef,
  applyProgrammaticInput,
  onQuickActionSelected,
  onExpertCardClicked,
  onMentionRefsChanged,
  onMentionRefsCleared,
}: UseQuickActionsArgs) {
  const [selectedQuickAction, setSelectedQuickAction] = useState<QuickActionConfig | null>(null);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const [pendingQuickPromptExpand, setPendingQuickPromptExpand] = useState(false);
  const [quickActionsExpanded, setQuickActionsExpanded] = useState(false);
  const [quickActionsOverflowing, setQuickActionsOverflowing] = useState(false);

  const quickActionsContainerRef = useRef<HTMLDivElement>(null);
  const quickActionsRowRef = useRef<HTMLDivElement>(null);
  const expertCardClickedRef = useRef(false);

  const visibleQuickActions = useMemo(() => QUICK_ACTIONS.filter((action) => action.show !== false), []);

  const handleQuickAction = useCallback(
    (action: QuickActionConfig) => {
      const token = getQuickActionToken(action.label);
      const next = `${token} `;
      applyProgrammaticInput(next, next.length);
      setPendingQuickPromptExpand(false);
      setShowQuickPrompts(true);
      expertCardClickedRef.current = false;
      onMentionRefsCleared?.();
      onQuickActionSelected?.();
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(next.length, next.length);
      }, 0);
    },
    [applyProgrammaticInput, onMentionRefsCleared, onQuickActionSelected, textareaRef],
  );

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      const startIdx = input.indexOf(QUICK_ACTION_TOKEN_PREFIX);
      const endIdx =
        startIdx >= 0 ? input.indexOf(QUICK_ACTION_TOKEN_SUFFIX, startIdx + QUICK_ACTION_TOKEN_PREFIX.length) : -1;

      let next = input;
      let caret = input.length;
      if (startIdx >= 0 && endIdx > startIdx) {
        const tokenEndExclusive = endIdx + QUICK_ACTION_TOKEN_SUFFIX.length;
        const before = input.slice(0, tokenEndExclusive);
        const after = input.slice(tokenEndExclusive).replace(/^\s+/, '');
        const joiner = after.length > 0 ? ' ' : '';
        next = `${before} ${prompt}${joiner}${after}`;
        caret = next.length;
      } else {
        const ta = textareaRef.current;
        const start = ta?.getSelectionStart() ?? input.length;
        const end = ta?.getSelectionEnd() ?? input.length;
        const before = input.slice(0, start);
        const after = input.slice(end);
        const leftJoiner = before.endsWith(' ') || before.length === 0 ? '' : ' ';
        const rightJoiner = after.startsWith(' ') || after.length === 0 ? '' : ' ';
        next = `${before}${leftJoiner}${prompt}${rightJoiner}${after}`;
        caret = next.length;
      }

      applyProgrammaticInput(next, caret);
      setPendingQuickPromptExpand(false);
      setShowQuickPrompts(false);
      onMentionRefsCleared?.();
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      }, 0);
    },
    [applyProgrammaticInput, input, onMentionRefsCleared, textareaRef],
  );

  const handleExpertCardClick = useCallback(
    (card: NonNullable<QuickActionConfig['expertCards']>[number]) => {
      const mentionTargets =
        card.mentionTargetIds
          ?.map((id) => agents.find((row) => row.id === id))
          .filter((row): row is AgentData => Boolean(row)) ?? [];
      const mentionText = mentionTargets
        .map(buildResolvedMention)
        .filter((item): item is string => Boolean(item))
        .join(' ');
      const mentionRefs = mentionTargets
        .map((agent) => {
          const mention = buildResolvedMention(agent);
          return mention ? ({ catId: agent.id, mention } satisfies MentionRef) : null;
        })
        .filter((item): item is MentionRef => item !== null);
      const displayNames = mentionTargets.map((row) => row.displayName.trim()).filter(Boolean);
      const body = mentionText ? stripExpertCardMentionPrefix(card.content, displayNames) : card.content;
      const fullText = mentionText ? `${mentionText} ${body}`.trim() : `@${card.agentName} ${card.content}`;

      const startIdx = input.indexOf(QUICK_ACTION_TOKEN_PREFIX);
      const endIdx =
        startIdx >= 0 ? input.indexOf(QUICK_ACTION_TOKEN_SUFFIX, startIdx + QUICK_ACTION_TOKEN_PREFIX.length) : -1;

      let next = input;
      let caret = 0;
      if (startIdx >= 0 && endIdx > startIdx) {
        const tokenEndExclusive = endIdx + QUICK_ACTION_TOKEN_SUFFIX.length;
        const before = input.slice(0, tokenEndExclusive);
        const after = input.slice(tokenEndExclusive).replace(/^\s+/, '');
        const rightJoiner = after.length > 0 ? ' ' : '';
        next = `${before} ${fullText}${rightJoiner}${after}`;
        caret = (before + ' ' + fullText).length;
      } else {
        const ta = textareaRef.current;
        const start = ta?.getSelectionStart() ?? input.length;
        const end = ta?.getSelectionEnd() ?? input.length;
        const before = input.slice(0, start);
        const after = input.slice(end);
        const leftJoiner = before.endsWith(' ') || before.length === 0 ? '' : ' ';
        const rightJoiner = after.startsWith(' ') || after.length === 0 ? '' : ' ';
        next = `${before}${leftJoiner}${fullText}${rightJoiner}${after}`;
        caret = (before + leftJoiner + fullText).length;
      }

      applyProgrammaticInput(next, caret);
      expertCardClickedRef.current = true;
      setShowQuickPrompts(false);
      if (mentionRefs.length > 0) onMentionRefsChanged?.(mentionRefs);
      else onMentionRefsCleared?.();
      onExpertCardClicked?.();
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      }, 0);
    },
    [applyProgrammaticInput, agents, input, onExpertCardClicked, onMentionRefsChanged, onMentionRefsCleared, textareaRef],
  );

  const measureQuickActionsOverflow = useCallback(() => {
    const row = quickActionsRowRef.current;
    const container = quickActionsContainerRef.current;
    if (!row) {
      setQuickActionsOverflowing(false);
      return;
    }
    const actionButtons = Array.from(row.querySelectorAll<HTMLElement>('[data-quick-action-button="true"]'));
    const gap = Number.parseFloat(window.getComputedStyle(row).columnGap || '0') || 0;
    const actionButtonsWidth = actionButtons.reduce((total, button) => total + button.getBoundingClientRect().width, 0);
    const singleLineWidth = actionButtonsWidth + Math.max(0, actionButtons.length - 1) * gap;
    const availableWidth = container?.clientWidth || row.clientWidth;
    setQuickActionsOverflowing(singleLineWidth > availableWidth + 1);
  }, []);

  useLayoutEffect(() => {
    measureQuickActionsOverflow();
    const row = quickActionsRowRef.current;
    const container = quickActionsContainerRef.current;
    if (!row || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measureQuickActionsOverflow());
    observer.observe(row);
    if (container) observer.observe(container);
    return () => observer.disconnect();
  }, [measureQuickActionsOverflow, visibleQuickActions]);

  useEffect(() => {
    let frameId: number | null = null;
    const handleResize = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = null;
        measureQuickActionsOverflow();
      });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [measureQuickActionsOverflow]);

  useEffect(() => {
    if (!quickActionsOverflowing) setQuickActionsExpanded(false);
  }, [quickActionsOverflowing]);

  useEffect(() => {
    if (showQuickPrompts) setQuickActionsExpanded(false);
  }, [showQuickPrompts]);

  useEffect(() => {
    const matched = visibleQuickActions.find((action) => input.includes(getQuickActionToken(action.label))) ?? null;
    setSelectedQuickAction(matched);
  }, [input, visibleQuickActions]);

  useEffect(() => {
    if (selectedQuickAction) {
      if (selectedQuickAction.expertCards && selectedQuickAction.expertCards.length > 0) {
        setShowQuickPrompts(!expertCardClickedRef.current);
        if (pendingQuickPromptExpand) setPendingQuickPromptExpand(false);
        return;
      }
      const hasMatchedPrompt = selectedQuickAction.prompts.some((prompt) => input.includes(prompt));
      setShowQuickPrompts(!hasMatchedPrompt);
      if (pendingQuickPromptExpand) setPendingQuickPromptExpand(false);
      return;
    }

    if (!pendingQuickPromptExpand) setShowQuickPrompts(false);
  }, [input, pendingQuickPromptExpand, selectedQuickAction]);

  const onExternalQuickActionInsert = useCallback(() => {
    setPendingQuickPromptExpand(false);
    setShowQuickPrompts(true);
    expertCardClickedRef.current = false;
  }, []);

  const resetQuickActions = useCallback(() => {
    setSelectedQuickAction(null);
    setPendingQuickPromptExpand(false);
    setShowQuickPrompts(false);
    setQuickActionsExpanded(false);
    expertCardClickedRef.current = false;
    onMentionRefsCleared?.();
  }, [onMentionRefsCleared]);

  const quickActionOptions = useMemo(
    () =>
      QUICK_ACTIONS.map((action) => ({
        label: action.label,
        icon: action.icon,
        token: getQuickActionToken(action.label),
      })),
    [],
  );

  return {
    selectedQuickAction,
    showQuickPrompts,
    quickActionsExpanded,
    quickActionsOverflowing,
    visibleQuickActions,
    quickActionOptions,
    quickActionsContainerRef,
    quickActionsRowRef,
    setQuickActionsExpanded,
    handleQuickAction,
    handleQuickPrompt,
    handleExpertCardClick,
    onExternalQuickActionInsert,
    resetQuickActions,
    queueAwareDisabled,
  };
}
