/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { create } from 'zustand';

const STORAGE_KEY = 'office-claw-input-history';
const LEGACY_STORAGE_KEY = 'cat-cafe-input-history';
const MAX_ENTRIES = 500;

function loadEntries(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries = parsed.filter((item): item is string => typeof item === 'string');
    if (localStorage.getItem(STORAGE_KEY) === null && localStorage.getItem(LEGACY_STORAGE_KEY) !== null && entries.length) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function saveEntries(entries: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  } catch {
    // localStorage full or unavailable
  }
}

interface InputHistoryState {
  entries: string[];
  addEntry: (text: string) => void;
  findMatch: (prefix: string) => string | null;
  search: (query: string) => string[];
  loadFromStorage: () => void;
  clearHistory: () => void;
}

export const useInputHistoryStore = create<InputHistoryState>((set, get) => ({
  entries: loadEntries(),

  addEntry: (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set((state) => {
      const filtered = state.entries.filter((e) => e !== trimmed);
      const next = [trimmed, ...filtered].slice(0, MAX_ENTRIES);
      saveEntries(next);
      return { entries: next };
    });
  },

  findMatch: (prefix: string) => {
    if (!prefix) return null;
    const lower = prefix.toLowerCase();
    const { entries } = get();
    for (const entry of entries) {
      if (entry.toLowerCase().startsWith(lower) && entry.toLowerCase() !== lower) {
        return entry;
      }
    }
    return null;
  },

  search: (query: string) => {
    if (!query) return [];
    const lower = query.toLowerCase();
    return get().entries.filter((e) => e.toLowerCase().includes(lower));
  },

  loadFromStorage: () => {
    set({ entries: loadEntries() });
  },

  clearHistory: () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    set({ entries: [] });
  },
}));
