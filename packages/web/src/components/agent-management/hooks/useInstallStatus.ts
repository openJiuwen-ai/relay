/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useRef, useState } from 'react';

type InstallStatusValue = string | null; // 'installing' | 'error' | null

interface UseInstallStatusResult {
  installStatus: Map<string, string>;
  setInstallStatusWithTimer: (slug: string, status: string) => void;
  clearInstallStatus: (slug: string) => void;
}

export function useInstallStatus(): UseInstallStatusResult {
  const [installStatus, setInstallStatus] = useState<Map<string, string>>(new Map());
  const statusTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const setInstallStatusWithTimer = useCallback(
    (slug: string, status: string) => {
      setInstallStatus((prev) => new Map(prev).set(slug, status));
      const existing = statusTimers.current.get(slug);
      if (existing) clearTimeout(existing);
      if (typeof status === 'string' && status !== 'installing') {
        const timer = setTimeout(() => {
          setInstallStatus((prev) => {
            const next = new Map(prev);
            next.delete(slug);
            return next;
          });
          statusTimers.current.delete(slug);
        }, 3000);
        statusTimers.current.set(slug, timer);
      }
    },
    [],
  );

  const clearInstallStatus = useCallback((slug: string) => {
    setInstallStatus((prev) => {
      const next = new Map(prev);
      next.delete(slug);
      return next;
    });
    const existing = statusTimers.current.get(slug);
    if (existing) {
      clearTimeout(existing);
      statusTimers.current.delete(slug);
    }
  }, []);

  return { installStatus, setInstallStatusWithTimer, clearInstallStatus };
}