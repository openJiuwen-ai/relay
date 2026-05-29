/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { QuickActionConfig } from '@/config/quick-actions';
import type { RefObject } from 'react';
import { MaskIcon } from '@/components/shared/MaskIcon';
import {
  EXPERT_CARD_BUTTON_CLASS,
  QUICK_ACTION_BUTTON_CLASS,
  QUICK_ACTION_EXPAND_BUTTON_CLASS,
  QUICK_PROMPT_BUTTON_CLASS,
} from '../utils/constants';

function QuickActionExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-3 w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {expanded ? <path d="M6 9l6 6 6-6" /> : <path d="M18 15l-6-6-6 6" />}
    </svg>
  );
}

function renderExpertCardPreview(card: NonNullable<QuickActionConfig['expertCards']>[number]) {
  const mentionMatch = card.content.match(/^((?:@[^@\s，,]+)+)([，,]?)(.*)$/);
  if (!mentionMatch) {
    return (
      <>
        <span className="font-medium text-[var(--text-accent)]">@{card.agentName}</span>，{card.content}
      </>
    );
  }

  const mentions = mentionMatch[1].match(/@[^@\s，,]+/g) ?? [];
  const separator = mentionMatch[2] || '，';
  const rest = mentionMatch[3];

  return (
    <>
      {mentions.map((mention, index) => (
        <span key={`${card.agentId}-${mention}-${index}`}>
          {index > 0 ? ' ' : ''}
          <span className="font-medium text-[var(--text-accent)]">{mention}</span>
        </span>
      ))}
      {rest ? `${separator}${rest}` : null}
    </>
  );
}

interface QuickActionsPanelProps {
  showQuickPrompts: boolean;
  quickActionsExpanded: boolean;
  quickActionsOverflowing: boolean;
  visibleQuickActions: QuickActionConfig[];
  selectedQuickAction: QuickActionConfig | null;
  queueAwareDisabled: boolean;
  quickActionsContainerRef: RefObject<HTMLDivElement | null>;
  quickActionsRowRef: RefObject<HTMLDivElement | null>;
  onQuickAction: (action: QuickActionConfig) => void;
  onQuickPrompt: (prompt: string) => void;
  onExpertCardClick: (card: NonNullable<QuickActionConfig['expertCards']>[number]) => void;
  onToggleExpanded: () => void;
}

export function QuickActionsPanel({
  showQuickPrompts,
  quickActionsExpanded,
  quickActionsOverflowing,
  visibleQuickActions,
  selectedQuickAction,
  queueAwareDisabled,
  quickActionsContainerRef,
  quickActionsRowRef,
  onQuickAction,
  onQuickPrompt,
  onExpertCardClick,
  onToggleExpanded,
}: QuickActionsPanelProps) {
  return (
    <>
      {!showQuickPrompts && (
        <div
          ref={quickActionsContainerRef}
          className={`relative mb-2 flex gap-2 ${quickActionsExpanded ? 'items-end' : 'items-start'}`}
        >
          <div
            ref={quickActionsRowRef}
            className={`flex min-w-0 flex-1 items-center gap-2 ${
              quickActionsExpanded ? 'flex-wrap overflow-visible' : 'flex-nowrap overflow-hidden'
            } ${
              quickActionsOverflowing && !quickActionsExpanded ? 'chat-input-quick-actions-fade' : ''
            }`}
            data-testid="chat-input-quick-actions-row"
          >
            {visibleQuickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                data-quick-action-button="true"
                onClick={() => onQuickAction(action)}
                disabled={queueAwareDisabled}
                className={QUICK_ACTION_BUTTON_CLASS}
              >
                <MaskIcon src={action.icon} className="h-4 w-4 text-[var(--mask-icon)]" />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
          {quickActionsOverflowing && (
            <button
              type="button"
              aria-label={quickActionsExpanded ? '收起快捷操作' : '展开快捷操作'}
              className={`${QUICK_ACTION_EXPAND_BUTTON_CLASS} ${quickActionsExpanded ? 'self-end' : 'mt-[7px] self-start'}`}
              onClick={onToggleExpanded}
            >
              <QuickActionExpandIcon expanded={quickActionsExpanded} />
            </button>
          )}
        </div>
      )}
      {showQuickPrompts && selectedQuickAction && (
        <div
          className="mb-2 grid gap-2"
          style={{
            gridTemplateColumns: selectedQuickAction.expertCards
              ? 'repeat(3, minmax(0, 1fr))'
              : `repeat(${selectedQuickAction.prompts.length}, minmax(0, 1fr))`,
          }}
        >
          {selectedQuickAction.expertCards
            ? selectedQuickAction.expertCards.map((card) => (
                <button
                  key={card.agentId}
                  type="button"
                  onClick={() => onExpertCardClick(card)}
                  className={EXPERT_CARD_BUTTON_CLASS}
                >
                  <p className="line-clamp-4 text-[13px] leading-[20px] text-[var(--text-secondary)]">
                    {renderExpertCardPreview(card)}
                  </p>
                </button>
              ))
            : selectedQuickAction.prompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => onQuickPrompt(prompt)} className={QUICK_PROMPT_BUTTON_CLASS}>
                  {prompt}
                </button>
              ))}
        </div>
      )}
    </>
  );
}
