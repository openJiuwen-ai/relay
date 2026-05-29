/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animate a number from its previous value to the target over `durationMs`.
 * Uses requestAnimationFrame with ease-out easing for a smooth "count-up" effect.
 *
 * Returns the current display value (integer).
 */
export function useCountUp(target: number, durationMs = 800): number {
  const [display, setDisplay] = useState(target);
  const prevTarget = useRef(target);
  const rafId = useRef<number>();

  useEffect(() => {
    const from = prevTarget.current;
    prevTarget.current = target;

    // No animation needed for same value or zero
    if (from === target) return;

    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      // ease-out: 1 - (1 - t)^3
      const eased = 1 - (1 - progress) ** 3;
      const current = Math.round(from + (target - from) * eased);
      setDisplay(current);

      if (progress < 1) {
        rafId.current = requestAnimationFrame(tick);
      }
    }

    rafId.current = requestAnimationFrame(tick);

    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [target, durationMs]);

  return display;
}
