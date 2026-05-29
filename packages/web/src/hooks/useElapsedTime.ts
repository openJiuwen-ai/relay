/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useEffect, useState } from 'react';

/**
 * Hook to track elapsed time from a start timestamp.
 * Returns elapsed time in milliseconds, updating every 100ms.
 *
 * @param startedAt - Unix timestamp in milliseconds, or undefined if not started
 * @returns Elapsed time in milliseconds
 */
export function useElapsedTime(startedAt: number | undefined): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }

    // Immediately calculate once to avoid initial render delay
    setElapsed(Date.now() - startedAt);

    const interval = setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 100); // 0.1s precision

    return () => clearInterval(interval);
  }, [startedAt]);

  return elapsed;
}
