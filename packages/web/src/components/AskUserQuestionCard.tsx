/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  AskUserQuestionAnswer,
  AskUserQuestionItem,
  AskUserQuestionOption,
} from '@/stores/chat-types';
import { Button } from './shared/Button';

interface AskUserQuestionCardProps {
  requestId: string;
  source?: string;
  questions: AskUserQuestionItem[];
  currentPage?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  expiresAtMs?: number;
  onSubmit: (payload: {
    request_id: string;
    source?: string;
    answers: AskUserQuestionAnswer[];
  }) => void;
  onCancel?: (payload: {
    request_id: string;
    source?: string;
    answers: AskUserQuestionAnswer[];
  }) => void;
  className?: string;
}

interface InternalAnswerState {
  selectedOption?: string;
  customInput?: string;
}

const OTHER_OPTION_LABEL = '其他';

function clampPage(page: number, total: number): number {
  if (total <= 0) return 0;
  if (page < 0) return 0;
  if (page > total - 1) return total - 1;
  return page;
}

function joinClassName(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

function getOptionsWithOther(options: AskUserQuestionOption[]): AskUserQuestionOption[] {
  if (options.some((option) => option.label === OTHER_OPTION_LABEL)) {
    return options;
  }
  return [...options, { label: OTHER_OPTION_LABEL }];
}

function buildAnswers(
  questions: AskUserQuestionItem[],
  state: InternalAnswerState[],
): AskUserQuestionAnswer[] {
  return questions.map((question, index) => {
    const selectedOption = state[index]?.selectedOption;
    const trimmedCustomInput = state[index]?.customInput?.trim();

    return {
      question: question.question,
      selected_options: selectedOption ? [selectedOption] : [],
      custom_input: selectedOption === OTHER_OPTION_LABEL && trimmedCustomInput ? trimmedCustomInput : null,
    };
  });
}

export function AskUserQuestionCard({
  requestId,
  source,
  questions,
  currentPage,
  defaultPage = 0,
  onPageChange,
  expiresAtMs,
  onSubmit,
  onCancel,
  className,
}: AskUserQuestionCardProps) {
  const isControlledPage = typeof currentPage === 'number';
  const [internalPage, setInternalPage] = useState(() => clampPage(defaultPage, questions.length));
  const [answersState, setAnswersState] = useState<InternalAnswerState[]>([]);
  const [submitStatus, setSubmitStatus] = useState<'pending' | 'skipped' | 'confirmed'>('pending');
  const otherInputRef = useRef<HTMLInputElement>(null);
  const optionsContainerRef = useRef<HTMLDivElement>(null);
  const pageIndex = clampPage(isControlledPage ? currentPage ?? 0 : internalPage, questions.length);
  const current = questions[pageIndex];
  const titleId = useId();
  const totalPages = questions.length;
  const canGoPrev = pageIndex > 0;
  const canGoNext = pageIndex < totalPages - 1;
  const primaryActionLabel = canGoNext ? '下一步' : '确认';

  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!expiresAtMs) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [expiresAtMs]);

  const countdown = useMemo(() => {
    if (!expiresAtMs) return null;
    return Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
  }, [expiresAtMs, tick]);

  useEffect(() => {
    if (countdown === 0 && submitStatus === 'pending') {
      setSubmitStatus('skipped');
      setTimeout(() => {
        onCancel?.({
          request_id: requestId,
          source,
          answers: buildAnswers(questions, answersState),
        });
      }, 1200);
    }
  }, [countdown, submitStatus, requestId, source, questions, answersState, onCancel]);

  const currentOptions = useMemo(() => (current ? getOptionsWithOther(current.options) : []), [current]);
  const selectedValue = answersState[pageIndex]?.selectedOption;
  const customInputValue = answersState[pageIndex]?.customInput ?? '';

  useEffect(() => {
    if (selectedValue === OTHER_OPTION_LABEL) {
      otherInputRef.current?.focus({ preventScroll: true });
      optionsContainerRef.current?.scrollTo({
        top: optionsContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
      // 切换"其他"输入框后，滚动确保卡片底部边框可见
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 50);
    }
  }, [selectedValue]);

  const rootClassName = useMemo(
    () =>
      joinClassName(
        'flex w-full flex-1 min-h-0 bg-white rounded-[15px] flex-col overflow-hidden px-5 py-4 text-[var(--text-primary)]',
        className,
      ),
    [className],
  );

  const cardRef = useRef<HTMLDivElement>(null);

  const setPage = (nextPage: number) => {
    const clamped = clampPage(nextPage, totalPages);
    if (!isControlledPage) {
      setInternalPage(clamped);
    }
    onPageChange?.(clamped);
    // 切换页面后滚动，确保卡片底部边框完全可见
    setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 50);
  };

  if (current == null) {
    return null;
  }

  return (
    <div
      ref={cardRef}
      className="w-[560px] max-w-[85%] max-h-[318px] flex flex-col relative rounded-[16px] shadow-[var(--card-shadow)] p-[1px] bg-[linear-gradient(to_right,#FAC4FF_0%,#8086FE_27%,#EF83FA_57%,#FFCFCF_80%,#FFDEDE_100%)]"
    >
      <section className={rootClassName} aria-labelledby={titleId} data-testid="ask-user-question-card-root">
        <header className="mb-4 flex shrink-0 items-start justify-between gap-4">
          <h2 id={titleId} className="min-w-0 flex-1 text-[16px] font-semibold leading-[1.4] text-[var(--text-primary)]">
            {current.question}
          </h2>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-[14px]" data-testid="ask-user-question-card-page-indicator">
              {pageIndex + 1} / {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="上一页"
                data-testid="ask-user-question-card-prev"
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-card-muted)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canGoPrev}
                onClick={() => setPage(pageIndex - 1)}
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M11.5 5L6.5 10L11.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="下一页"
                data-testid="ask-user-question-card-next"
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-card-muted)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canGoNext}
                onClick={() => setPage(pageIndex + 1)}
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M8.5 5L13.5 10L8.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <div ref={optionsContainerRef} className="min-h-0 flex-1 overflow-y-auto py-1 pr-1" data-testid="ask-user-question-card-options">
          <div className="flex flex-col gap-1">
            {currentOptions.map((option) => {
              const selected = selectedValue === option.label;

              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={option.disabled}
                  data-testid={`ask-user-question-card-option-${option.label}`}
                  className={joinClassName(
                    'flex min-h-[38px] w-full items-center rounded-[8px] border border-[1px] px-4 py-2 transition-[border-color,background-color,box-shadow,color] duration-200',
                    selected
                      ? 'border-[var(--connector-tab-border-selected)] bg-[var(--surface-panel)]'
                      : 'border-transparent bg-[#fafafa] hover:border-[var(--border-default)] hover:bg-[var(--surface-panel)]',
                    option.disabled && 'cursor-not-allowed opacity-50',
                  )}
                  aria-pressed={selected}
                  onClick={() => {
                    if (option.disabled) return;
                    setAnswersState((currentState) => {
                      const nextState = [...currentState];
                      nextState[pageIndex] = {
                        selectedOption: option.label,
                        customInput: nextState[pageIndex]?.customInput ?? '',
                      };
                      return nextState;
                    });
                  }}
                >
                  <span className="block text-[14px] leading-[1.5] text-[var(--text-primary)] text-left">
                    {option.description ? `${option.label} (${option.description})` : option.label}
                  </span>
                </button>
              );
            })}
            {selectedValue === OTHER_OPTION_LABEL ? (
              <input
                ref={otherInputRef}
                type="text"
                className="ui-input mt-2 w-full rounded-[8px] px-3 py-2 text-[14px]"
                placeholder="请输入"
                data-testid="ask-user-question-card-other-input"
                value={customInputValue}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setAnswersState((currentState) => {
                    const nextState = [...currentState];
                    nextState[pageIndex] = {
                      selectedOption: OTHER_OPTION_LABEL,
                      customInput: nextValue,
                    };
                    return nextState;
                  });
                }}
              />
            ) : null}
          </div>
        </div>

        <footer className="mt-4 flex shrink-0 items-center gap-3">
          {submitStatus === 'pending' ? (
            <>
              <Button
                variant="default"
                onClick={() => {
                  setSubmitStatus('skipped');
                  setTimeout(() => {
                    onCancel?.({
                      request_id: requestId,
                      source,
                      answers: buildAnswers(questions, answersState),
                    });
                  }, 1200);
                }}
              >
                {countdown != null ? `跳过 (${countdown}s)` : '跳过'}
              </Button>
              <Button
                color="major"
                onClick={() => {
                  if (canGoNext) {
                    setPage(pageIndex + 1);
                    return;
                  }

                  setSubmitStatus('confirmed');
                  setTimeout(() => {
                    onSubmit({
                      request_id: requestId,
                      source,
                      answers: buildAnswers(questions, answersState),
                    });
                  }, 1200);
                }}
              >
                {primaryActionLabel}
              </Button>
            </>
          ) : (
            <Button variant="default" disabled>
              {submitStatus === 'skipped' ? '已跳过' : '已确认'}
            </Button>
          )}
        </footer>
      </section>
    </div>
  );
}
