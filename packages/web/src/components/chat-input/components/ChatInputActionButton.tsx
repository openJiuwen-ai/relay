/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState } from 'react';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { LoadingIcon } from '../../icons/LoadingIcon';
import { MicIcon } from '../../icons/MicIcon';
import { RotatingBorderStopIcon } from '../../icons/RotatingBorderStopIcon';
import { SendIcon } from '../../icons/SendIcon';
import { StopRecordingIcon } from '../../icons/StopRecordingIcon';
import { OverflowTooltip } from '../../shared/OverflowTooltip';

interface ChatInputActionButtonProps {
  onTranscript: (text: string) => void;
  onSend: () => void;
  /** F39: Queue-mode send (content will be queued behind running invocation) */
  onQueueSend?: () => void;
  onStop?: () => void;
  disabled?: boolean;
  sendDisabled?: boolean;
  hideIdleMic?: boolean;
  /** Whether the thread has an active invocation (broader than disabled/isLoading) */
  hasActiveInvocation?: boolean;
  hasText: boolean;
  queueLimitReached?: boolean;
  showQueueTooltip?: boolean;
}

/** Renders the action button states:
 *  1. Stop recording
 *  2. Transcribing
 *  3. Queue send (F39: active invocation)
 *  4. Normal send (has text)
 *  5. Mic (default)
 *
 *  Plus voice recording status overlays (REC badge, error).
 *  Keyboard shortcut: Option+V toggles recording. */
export function ChatInputActionButton({
  onTranscript,
  onSend,
  onQueueSend,
  onStop,
  disabled,
  sendDisabled,
  hideIdleMic,
  hasActiveInvocation,
  hasText,
  queueLimitReached,
  showQueueTooltip,
}: ChatInputActionButtonProps) {
  const voice = useVoiceInput();
  const [visibleError, setVisibleError] = useState<string | null>(null);
  const isSendDisabled = Boolean(disabled || sendDisabled);

  useEffect(() => {
    if (voice.transcript) onTranscript(voice.transcript);
  }, [voice.transcript, onTranscript]);

  useEffect(() => {
    if (!voice.error) return;
    setVisibleError(voice.error);
    const timer = window.setTimeout(() => {
      setVisibleError(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [voice.error]);

  // Global keyboard shortcut: Option+V (Alt+V) toggles voice recording
  const { state: voiceState, startRecording, stopRecording } = voice;
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyV') {
        e.preventDefault();
        if (voiceState === 'recording') {
          stopRecording();
        } else if (voiceState === 'idle' && !disabled) {
          startRecording();
        }
      }
    };
    const handleToggleVoice = () => {
      if (voiceState === 'recording') {
        stopRecording();
      } else if (voiceState === 'idle' && !disabled) {
        startRecording();
      }
    };
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('toggle-voice-recording', handleToggleVoice);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('toggle-voice-recording', handleToggleVoice);
    };
  }, [voiceState, startRecording, stopRecording, disabled]);

  // F39: Whether we're in queue mode (cat running + user has typed)
  const isQueueMode = Boolean(hasActiveInvocation && onQueueSend);
  const showIdleMic = !hideIdleMic && voice.state === 'idle';
  const queueTooltip = queueLimitReached
    ? '待执行任务已达到 20 条上限，请等待完成或减少后重试'
    : '加入待执行任务';

  if (voice.state === 'recording') {
    return (
      <div className="relative flex w-full items-center">
        {visibleError && (
          <div className="absolute bottom-full right-0 mb-2 w-[240px] max-w-[70vw] break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-600 shadow-sm">
            {visibleError}
          </div>
        )}
        <div className="relative h-10 w-full overflow-hidden rounded-xl flex items-center justify-center">
          <img src="/icons/chart/home-loading.webp" alt="loading" className="h-full w-[auto] object-cover" />
          <button
            onClick={voice.stopRecording}
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl transition-opacity hover:opacity-90"
            title="停止录音"
            aria-label="停止录音"
          >
            <StopRecordingIcon className="h-6 w-6" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex shrink-0 items-center justify-end">
      {/* Voice recording status */}
      {visibleError && (
        <div className="absolute bottom-full right-0 mb-2 w-[240px] max-w-[70vw] break-words rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-600 shadow-sm">
          {visibleError}
        </div>
      )}

      {showIdleMic && (
        <button
          onClick={voice.startRecording}
          disabled={disabled}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-white hover:text-cocreator-primary disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="开始语音输入 (Alt+V)"
          title="语音输入 (Alt+V)"
        >
          <MicIcon className="w-5 h-5" />
        </button>
      )}

      {/* Primary action button priority chain */}
      {voice.state === 'transcribing' ? (
        <button
          disabled
          className="inline-flex h-8 w-8 shrink-0 cursor-wait items-center justify-center rounded-xl bg-gray-300 text-white"
          title="转写中"
          aria-label="转写中"
        >
          <LoadingIcon className="w-5 h-5" />
        </button>
      ) : isQueueMode ? (
        hasText ? (
          showQueueTooltip ? (
            <OverflowTooltip content={queueTooltip} forceShow className="ml-2 inline-flex">
              <button
                onClick={onQueueSend}
                disabled={isSendDisabled}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[20px] text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 chat-input-send-message"
                aria-label="加入待执行任务"
              >
                <SendIcon className="w-5 h-5" />
              </button>
            </OverflowTooltip>
          ) : (
            <button
              onClick={onQueueSend}
              disabled={isSendDisabled}
              className="ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[20px] text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 chat-input-send-message"
              aria-label="加入待执行任务"
            >
              <SendIcon className="w-5 h-5" />
            </button>
          )
        ) : onStop ? (
          <button
            onClick={() => onStop()}
            className="ml-2 inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-blue-50 chat-input-stop-generation"
            aria-label="停止回答"
            title="停止回答"
          >
            <RotatingBorderStopIcon className="h-5 w-5 shrink-0" />
            <span>停止回答</span>
          </button>
        ) : null
      ) : hasText ? (
        <button
          onClick={onSend}
          disabled={isSendDisabled}
          className="ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[20px] text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 chat-input-send-message"
          aria-label="发送消息"
        >
          <SendIcon className="w-5 h-5" />
        </button>
      ) : null}
    </div>
  );
}

