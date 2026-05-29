/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F080-P2: Path completion hook.
 * Detects path patterns in input text and fetches completions from the API.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';

export interface PathEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

/** Regex to detect path-like suffixes at end of input */
const PATH_PATTERN = /(?:^|\s)([.~/][\w/._-]*|packages\/[\w/._-]*)$/;

const DEBOUNCE_MS = 200;

export function usePathCompletion(input: string) {
  const [entries, setEntries] = useState<PathEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastPrefixRef = useRef<string>('');
  const cwd = useChatStore((s) => s.currentProjectPath);

  const detectPath = useCallback((text: string): string | null => {
    const match = text.match(PATH_PATTERN);
    return match ? match[1] : null;
  }, []);

  const isOpenRef = useRef(false);

  const close = useCallback(() => {
    setIsOpen(false);
    isOpenRef.current = false;
    setEntries([]);
    setSelectedIdx(0);
    // NOTE: do NOT clear lastPrefixRef — it prevents the effect from
    // re-fetching the same prefix after Esc/select (P1 fix from codex R1)
  }, []);

  const selectEntry = useCallback(
    (entry: PathEntry): string => {
      // Replace the path prefix in input with the completed path
      const match = input.match(PATH_PATTERN);
      if (!match) return input;
      const beforePath = input.slice(0, match.index! + (match[0].startsWith(' ') ? 1 : 0));
      const completedName = entry.isDirectory ? entry.name : entry.name;
      // Build the completed prefix: parent path + selected name
      const pathPrefix = match[1];
      const lastSlash = pathPrefix.lastIndexOf('/');
      const parentPart = lastSlash >= 0 ? pathPrefix.slice(0, lastSlash + 1) : '';
      const newText = beforePath + parentPart + completedName;
      // Pre-set lastPrefixRef to the new completed path so the effect
      // won't re-fetch and reopen the menu (P1 fix from codex R1)
      const newPathMatch = newText.match(PATH_PATTERN);
      if (newPathMatch) lastPrefixRef.current = newPathMatch[1];
      close();
      return newText;
    },
    [input, close],
  );

  useEffect(() => {
    const pathPrefix = detectPath(input);

    if (!pathPrefix) {
      // Abort any in-flight fetch — prevents stale response from reopening
      // the menu after user deletes the path token (cloud review P1 fix)
      abortRef.current?.abort();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (isOpenRef.current) close();
      return;
    }

    // Don't re-fetch for same prefix (prevents reopen after Esc/select)
    if (pathPrefix === lastPrefixRef.current) return;
    lastPrefixRef.current = pathPrefix;

    // Cancel previous
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const cwdParam = cwd && cwd !== 'default' ? `&cwd=${encodeURIComponent(cwd)}` : '';
        const res = await apiFetch(
          `/api/projects/complete?prefix=${encodeURIComponent(pathPrefix)}&limit=10${cwdParam}`,
        );
        if (controller.signal.aborted) return;
        if (!res.ok) {
          close();
          return;
        }
        const data = await res.json();
        if (controller.signal.aborted) return;
        const items: PathEntry[] = data.entries ?? [];
        setEntries(items);
        setIsOpen(items.length > 0);
        isOpenRef.current = items.length > 0;
        setSelectedIdx(0);
      } catch {
        if (!controller.signal.aborted) close();
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [input, cwd, detectPath, close]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    entries,
    isOpen,
    selectedIdx,
    setSelectedIdx,
    selectEntry,
    close,
    detectPath,
  };
}
