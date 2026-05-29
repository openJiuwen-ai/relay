/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readPinnedProjects, writePinnedProjects } from './active-workspace';
import type { StorageLike } from './collapse-state';

function getStorage(): StorageLike {
  return typeof window !== 'undefined' ? window.localStorage : { getItem: () => null, setItem: () => {} };
}

export function useProjectPins() {
  const initialized = useRef(false);
  const [pinnedProjects, setPinnedProjects] = useState<Set<string>>(() => new Set());

  // Read from localStorage on mount
  useEffect(() => {
    if (initialized.current) return;
    setPinnedProjects(readPinnedProjects(getStorage()));
    initialized.current = true;
  }, []);

  // Persist on change
  useEffect(() => {
    if (!initialized.current) return;
    writePinnedProjects(pinnedProjects, getStorage());
  }, [pinnedProjects]);

  const toggleProjectPin = useCallback((projectPath: string) => {
    setPinnedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectPath)) next.delete(projectPath);
      else next.add(projectPath);
      return next;
    });
  }, []);

  return { pinnedProjects, toggleProjectPin };
}
