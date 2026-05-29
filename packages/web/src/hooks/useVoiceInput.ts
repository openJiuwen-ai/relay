/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVoiceSettingsStore } from '@/stores/voiceSettingsStore';
import { correctTranscription, mergeTermEntries, type TermEntry } from '@/utils/transcription-corrector';

export type VoiceState = 'idle' | 'recording' | 'transcribing';

type DesktopVoiceEventPayload = {
  type?: string;
  sessionId?: string;
  text?: string;
  error?: string;
};

type DesktopMessageEvent = {
  data?: unknown;
};

type WebViewBridge = {
  postMessage(message: string): void;
  addEventListener?(eventName: 'message', listener: (event: DesktopMessageEvent) => void): void;
  removeEventListener?(eventName: 'message', listener: (event: DesktopMessageEvent) => void): void;
};

type DesktopWindow = Window & {
  chrome?: { webview?: WebViewBridge };
  webkit?: {
    messageHandlers?: {
      officeClawDesktop?: { postMessage(message: string): void };
    };
  };
};

const DESKTOP_MESSAGE_EVENT = 'office-claw-desktop-message';

function getDesktopBridge(): WebViewBridge | { postMessage(message: string): void } | null {
  if (typeof window === 'undefined') return null;
  const desktopWindow = window as DesktopWindow;
  return desktopWindow.chrome?.webview ?? desktopWindow.webkit?.messageHandlers?.officeClawDesktop ?? null;
}

function parseDesktopPayload(input: unknown): DesktopVoiceEventPayload | null {
  if (!input || typeof input !== 'object') return null;
  return input as DesktopVoiceEventPayload;
}

export function useVoiceInput() {
  const settings = useVoiceSettingsStore((s) => s.settings);
  const language = settings.language;

  const mergedEntries: ReadonlyArray<TermEntry> = useMemo(
    () => mergeTermEntries(settings.customTerms),
    [settings.customTerms],
  );

  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const desktopSessionRef = useRef<string | null>(null);
  const desktopListenerRef = useRef<((event: DesktopMessageEvent) => void) | null>(null);
  const desktopCustomEventRef = useRef<((event: Event) => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const versionRef = useRef(0);
  const entriesRef = useRef(mergedEntries);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const detachDesktopListeners = useCallback(() => {
    if (typeof window === 'undefined') return;
    const desktopWindow = window as DesktopWindow;
    const webview = desktopWindow.chrome?.webview;
    if (webview?.removeEventListener && desktopListenerRef.current) {
      webview.removeEventListener('message', desktopListenerRef.current);
    }
    if (desktopCustomEventRef.current) {
      window.removeEventListener(DESKTOP_MESSAGE_EVENT, desktopCustomEventRef.current as EventListener);
    }
    desktopListenerRef.current = null;
    desktopCustomEventRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript('');
    setPartialTranscript('');
    setDuration(0);
    versionRef.current += 1;
    entriesRef.current = mergedEntries;

    const bridge = getDesktopBridge();
    if (!bridge) {
      setError('当前为浏览器模式，无法使用桌面端原生语音转写');
      setState('idle');
      return;
    }

    detachDesktopListeners();
    const sessionId = `voice-${Date.now()}-${versionRef.current}`;
    desktopSessionRef.current = sessionId;
    const myVersion = versionRef.current;

    const handlePayload = (payload: DesktopVoiceEventPayload | null) => {
      if (!payload || myVersion !== versionRef.current) return;
      if (!payload.type?.startsWith('voice.transcription.')) return;
      if (payload.sessionId && payload.sessionId !== desktopSessionRef.current) return;

      if (payload.type === 'voice.transcription.partial') {
        setPartialTranscript(correctTranscription(payload.text ?? '', entriesRef.current));
        return;
      }

      if (payload.type === 'voice.transcription.final') {
        setTranscript(correctTranscription(payload.text ?? '', entriesRef.current));
        setPartialTranscript('');
        setState('idle');
        clearTimers();
        detachDesktopListeners();
        return;
      }

      if (payload.type === 'voice.transcription.error') {
        setError(payload.error || '原生语音转写失败');
        setState('idle');
        clearTimers();
        detachDesktopListeners();
      }
    };

    const webviewListener = (event: DesktopMessageEvent) => {
      handlePayload(parseDesktopPayload(event.data));
    };
    const customEventListener = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      handlePayload(parseDesktopPayload(detail));
    };

    desktopListenerRef.current = webviewListener;
    desktopCustomEventRef.current = customEventListener;
    const desktopWindow = window as DesktopWindow;
    desktopWindow.chrome?.webview?.addEventListener?.('message', webviewListener);
    window.addEventListener(DESKTOP_MESSAGE_EVENT, customEventListener as EventListener);

    bridge.postMessage(
      JSON.stringify({
        type: 'voice.transcription.start',
        sessionId,
        language: language === 'en' ? 'en-US' : language === 'zh' ? 'zh-CN' : '',
      }),
    );

    startTimeRef.current = Date.now();
    setState('recording');
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, [clearTimers, detachDesktopListeners, language, mergedEntries]);

  const stopRecording = useCallback(() => {
    const bridge = getDesktopBridge();
    if (bridge && state === 'recording') {
      bridge.postMessage(
        JSON.stringify({
          type: 'voice.transcription.stop',
          sessionId: desktopSessionRef.current,
        }),
      );
      clearTimers();
      // Stop should immediately exit recording UI so mic button reappears.
      setState('idle');
    }
  }, [clearTimers, state]);

  useEffect(() => {
    return () => {
      clearTimers();
      detachDesktopListeners();
    };
  }, [clearTimers, detachDesktopListeners]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('office-claw:voice-state', { detail: { state } }));
  }, [state]);

  return {
    state,
    transcript,
    partialTranscript,
    error,
    duration,
    startRecording,
    stopRecording,
  };
}
