/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppModal } from '../../AppModal';
import { TimePickerField } from './TimePickerField';
import { DatePickerField } from './DatePickerField';
import { IntervalUnitSelectField } from './IntervalUnitSelectField';
import { PresetSelectField } from './PresetSelectField';
import { SessionSelectField } from './SessionSelectField';
import type { SessionSelectOption } from './SessionSelectField';
import type { ScheduleTaskDraft } from '../schedule-template-types';
import {
  WEEKDAY_OPTIONS,
  INPUT_BOX_CLASS,
  PROMPT_MIN_HEIGHT,
  PROMPT_DEFAULT_HEIGHT,
  PROMPT_INFO_ROW_HEIGHT,
  SHOW_EFFECTIVE_DATE_RANGE_UI,
  EffectivePreset,
  toDateValue,
} from '../utils/editor';
import {
  useEditorState,
  buildNormalizedDraft,
  useFormValidation,
  type EditorState,
} from '../hooks/useEditorState';
import { useSessionOptions } from '../hooks/useSessionOptions';
import { Button } from '@/components/shared/Button';

interface ScheduleTaskEditorModalProps {
  open: boolean;
  draft: ScheduleTaskDraft | null;
  title?: string;
  onClose: () => void;
  onConfirm: (draft: ScheduleTaskDraft) => void | Promise<void>;
}

type EditorFrequencyMode = 'daily' | 'interval' | 'once';
type SessionMode = 'existing' | 'new';

export function ScheduleTaskEditorModal({
  open,
  draft,
  title = '创建定时任务',
  onClose,
  onConfirm,
}: ScheduleTaskEditorModalProps) {
  const { editorState, setEditorState, resetEditorState, handleWeekdayToggle, handleFrequencyModeChange, handleSessionModeChange } = useEditorState(draft);
  const [promptHeight, setPromptHeight] = useState(PROMPT_DEFAULT_HEIGHT);
  const [submitting, setSubmitting] = useState(false);
  const { sessionOptions, sessionsLoading, sessionsError } = useSessionOptions(open);

  const isFormValid = useFormValidation(editorState);

  useEffect(() => {
    if (!open) return;
    resetEditorState(draft);
    setPromptHeight(PROMPT_DEFAULT_HEIGHT);
    setSubmitting(false);
  }, [draft, open, resetEditorState]);

  const handleConfirm = useCallback(async () => {
    if (!isFormValid) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(buildNormalizedDraft(editorState));
    } finally {
      setSubmitting(false);
    }
  }, [isFormValid, submitting, onConfirm, editorState]);

  const handlePromptResizeStart = useCallback((event: { clientY: number; preventDefault: () => void }) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = promptHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextHeight = startHeight + (moveEvent.clientY - startY);
      setPromptHeight(Math.max(PROMPT_MIN_HEIGHT, nextHeight));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [promptHeight]);

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={title}
      panelClassName="w-[550px] max-h-[calc(100vh-4rem)] overflow-hidden"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden pt-4"
      panelTestId="schedule-task-editor-modal"
      bodyTestId="schedule-task-editor-modal-body"
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
        <div>
          <label className="mb-2 block text-[14px] font-normal leading-5 text-[#101828]">名称</label>
          <input
            type="text"
            value={editorState.taskName}
            maxLength={64}
            onChange={(event) => setEditorState((current) => ({ ...current, taskName: event.target.value }))}
            className={`w-full px-3 outline-none focus:border-[#4C8DFF] ${INPUT_BOX_CLASS}`}
            data-testid="schedule-editor-task-name"
          />
        </div>

        <div>
          <label className="mb-2 block text-[14px] font-normal leading-5 text-[#101828]">提示词</label>
          <div
            className="relative rounded-[6px] border border-[rgba(194,194,194,1)] bg-white transition focus-within:border-[rgba(20,118,255,1)]"
            data-testid="schedule-editor-prompt-container"
          >
            <textarea
              value={editorState.prompt}
              maxLength={1000}
              onChange={(event) => setEditorState((current) => ({ ...current, prompt: event.target.value }))}
              className="w-full resize-none border-0 bg-transparent px-3 pt-3 text-[14px] leading-6 text-[#101828] outline-none"
              style={{ height: `${promptHeight}px`, minHeight: `${PROMPT_MIN_HEIGHT}px`, paddingBottom: `${PROMPT_INFO_ROW_HEIGHT + 12}px`, paddingRight: '24px' }}
              data-testid="schedule-editor-prompt"
            />
            <div className="absolute inset-x-0 bottom-0 flex h-6 items-center justify-end gap-2 rounded-b-[6px] bg-white px-3 pr-3 text-[12px] leading-none text-[#667085]">
              <span data-testid="schedule-editor-prompt-count">{editorState.prompt.length}/1000</span>
              <button
                type="button"
                onMouseDown={handlePromptResizeStart}
                className="flex h-4 w-4 cursor-nwse-resize items-end justify-end text-[#667085]"
                data-testid="schedule-editor-prompt-resize-handle"
                aria-label="调整提示词输入框高度"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M4 10L10 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M7 10L10 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <FrequencySection
          editorState={editorState}
          onFrequencyModeChange={handleFrequencyModeChange}
          onWeekdayToggle={handleWeekdayToggle}
          setEditorState={setEditorState}
        />

        {SHOW_EFFECTIVE_DATE_RANGE_UI && editorState.frequencyMode !== 'once' ? (
          <div>
            <label className="mb-2 block text-[14px] font-normal leading-5 text-[#101828]">
              生效日期区间
              <span className="ml-1 text-[12px] font-normal text-[#667085]">（可选，留空表示始终生效）</span>
            </label>
            <PresetSelectField
              value={editorState.effectivePreset}
              onChange={(value) => setEditorState((current) => ({ ...current, effectivePreset: value }))}
            />
          </div>
        ) : null}

        <SessionSection
          editorState={editorState}
          onSessionModeChange={handleSessionModeChange}
          setEditorState={setEditorState}
          sessionOptions={sessionOptions}
          sessionsLoading={sessionsLoading}
          sessionsError={sessionsError}
        />
      </div>

      <div className="flex shrink-0 items-center justify-end gap-3 pt-5">
        <Button
          variant="default"
          onClick={onClose}
          data-testid="schedule-editor-cancel"
        >
          取消
        </Button>
        <Button
          variant="major"
          onClick={handleConfirm}
          disabled={!isFormValid || submitting}
          data-testid="schedule-editor-confirm"
        >
          确定
        </Button>
      </div>
    </AppModal>
  );
}

interface FrequencySectionProps {
  editorState: EditorState;
  onFrequencyModeChange: (mode: EditorFrequencyMode) => void;
  onWeekdayToggle: (weekday: string) => void;
  setEditorState: React.Dispatch<React.SetStateAction<EditorState>>;
}

function FrequencySection({ editorState, onFrequencyModeChange, onWeekdayToggle, setEditorState }: FrequencySectionProps) {
  const todayValue = toDateValue(new Date());
  const isOnceToday = editorState.onceDate === todayValue;
  const currentHour = `${new Date().getHours()}`.padStart(2, '0');
  const currentMinute = `${new Date().getMinutes()}`.padStart(2, '0');

  return (
    <div>
      <div className="mb-2 block text-[14px] font-normal leading-5 text-[#101828]">执行频率</div>
      <div className="flex flex-wrap gap-3">
        {[
          { value: 'daily' as const, label: '重复' },
          { value: 'interval' as const, label: '按间隔' },
          { value: 'once' as const, label: '单次' },
        ].map((option) => {
          const selected = editorState.frequencyMode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onFrequencyModeChange(option.value)}
              className={[
                'inline-flex items-center justify-center rounded-[6px] border px-6 py-[5px] text-[14px] font-normal transition',
                selected
                  ? 'border-[1.5px] border-[rgba(20,118,255,1)] bg-[rgba(240,247,255,1)] text-[rgba(25,25,25,1)]'
                  : 'border-[rgba(194,194,194,1)] text-[rgba(89,89,89,1)]',
              ].join(' ')}
              data-testid={`schedule-editor-frequency-${option.value}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {editorState.frequencyMode === 'daily' ? (
        <div className="mt-3 flex items-start gap-3">
          <TimePickerField
            value={editorState.time}
            onChange={(value) => setEditorState((current) => ({ ...current, time: value }))}
            testIdPrefix="schedule-editor-daily-time"
          />
          <div className="flex min-w-0 flex-1 gap-2">
            {WEEKDAY_OPTIONS.map((option) => {
              const selected = editorState.weekdays.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onWeekdayToggle(option.value)}
                  className={[
                    'inline-flex h-7 w-10 items-center justify-center rounded-[6px] border text-[14px] font-normal transition',
                    selected
                      ? 'border-[1.5px] border-[rgba(20,118,255,1)] bg-[rgba(240,247,255,1)] text-[rgba(25,25,25,1)]'
                      : 'border-[rgba(194,194,194,1)] text-[rgba(89,89,89,1)]',
                  ].join(' ')}
                  data-testid={`schedule-editor-weekday-${option.value}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {editorState.frequencyMode === 'interval' ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[14px] leading-5 text-[#344054]">每隔</span>
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={editorState.intervalValue}
            onChange={(event) => setEditorState((current) => ({ ...current, intervalValue: event.target.value }))}
            className={`w-[132px] px-3 outline-none focus:border-[rgba(20,118,255,1)] ${INPUT_BOX_CLASS}`}
            data-testid="schedule-editor-interval-value"
          />
          <IntervalUnitSelectField
            value={editorState.intervalUnit}
            onChange={(value) => setEditorState((current) => ({ ...current, intervalUnit: value }))}
          />
        </div>
      ) : null}

      {editorState.frequencyMode === 'once' ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="shrink-0">
            <DatePickerField
              value={editorState.onceDate}
              onChange={(value) => setEditorState((current) => ({ ...current, onceDate: value }))}
            />
          </div>
          <div className="shrink-0">
            <TimePickerField
              value={editorState.onceTime}
              onChange={(value) => setEditorState((current) => ({ ...current, onceTime: value }))}
              testIdPrefix="schedule-editor-once-time"
              isHourDisabled={(hour) => isOnceToday && hour < currentHour}
              isMinuteDisabled={(hour, minute) => isOnceToday && hour === currentHour && minute < currentMinute}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface SessionSectionProps {
  editorState: EditorState;
  onSessionModeChange: (sessionMode: SessionMode) => void;
  setEditorState: React.Dispatch<React.SetStateAction<EditorState>>;
  sessionOptions: SessionSelectOption[];
  sessionsLoading: boolean;
  sessionsError: boolean;
}

function SessionSection({ editorState, onSessionModeChange, setEditorState, sessionOptions, sessionsLoading, sessionsError }: SessionSectionProps) {
  return (
    <div>
      <div className="mb-2 block text-[14px] font-normal leading-5 text-[#101828]">选择会话</div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onSessionModeChange('existing')}
          className={[
            'inline-flex items-center justify-center rounded-[6px] border px-6 py-[5px] text-[14px] font-normal transition',
            editorState.sessionMode === 'existing'
              ? 'border-[1.5px] border-[rgba(20,118,255,1)] bg-[rgba(240,247,255,1)] text-[rgba(25,25,25,1)]'
              : 'border-[rgba(194,194,194,1)] text-[rgba(89,89,89,1)]',
          ].join(' ')}
          data-testid="schedule-editor-session-existing"
        >
          选择已有会话
        </button>
        <button
          type="button"
          onClick={() => onSessionModeChange('new')}
          className={[
            'inline-flex items-center justify-center rounded-[6px] border px-6 py-[5px] text-[14px] font-normal transition',
            editorState.sessionMode === 'new'
              ? 'border-[1.5px] border-[rgba(20,118,255,1)] bg-[rgba(240,247,255,1)] text-[rgba(25,25,25,1)]'
              : 'border-[rgba(194,194,194,1)] text-[rgba(89,89,89,1)]',
          ].join(' ')}
          data-testid="schedule-editor-session-new"
        >
          新建会话
        </button>
      </div>
      {editorState.sessionMode === 'existing' ? (
        <div className="mt-3">
          <SessionSelectField
            value={editorState.sessionId}
            onChange={(value) => setEditorState((current) => ({ ...current, sessionId: value }))}
            options={sessionOptions}
            loading={sessionsLoading}
            hasError={sessionsError}
          />
        </div>
      ) : null}
    </div>
  );
}
