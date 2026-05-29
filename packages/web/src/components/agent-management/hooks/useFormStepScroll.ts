/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useEffect, useRef } from 'react';
import type { FormStepId } from '../constants';

const FORM_STEP_LOCK_MS = 800;

interface UseFormStepScrollOptions {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  stepRefs: Record<FormStepId, React.RefObject<HTMLElement | null>>;
  isManualOperating: boolean;
  setIsManualOperating: (v: boolean) => void;
}

export function useFormStepScroll({
  scrollContainerRef,
  stepRefs,
  isManualOperating,
  setIsManualOperating,
}: UseFormStepScrollOptions) {
  const manualStepTimerRef = useRef<number | null>(null);

  const clearManualStepTimer = useCallback(() => {
    if (manualStepTimerRef.current !== null) {
      window.clearTimeout(manualStepTimerRef.current);
      manualStepTimerRef.current = null;
    }
  }, []);

  const syncActiveStepFromScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    const soulNode = stepRefs.soul.current;
    if (!container || !soulNode) return;

    const containerRect = container.getBoundingClientRect();
    const soulRect = soulNode.getBoundingClientRect();
    const soulRelativeTop = soulRect.top - containerRect.top;

    // Active step is determined by scroll position
    // This is informational; actual activeStep state lives in FormContent
  }, [scrollContainerRef, stepRefs.soul]);

  const scrollToStep = useCallback(
    (stepId: FormStepId) => {
      const container = scrollContainerRef.current;
      const ref = stepRefs[stepId];
      if (!container || !ref.current) return;

      const containerRect = container.getBoundingClientRect();
      const targetRect = ref.current.getBoundingClientRect();
      const offsetTop = targetRect.top - containerRect.top + container.scrollTop;
      const nextTop = Math.max(0, offsetTop - 24);

      container.scrollTo({
        top: nextTop,
        behavior: 'smooth',
      });
    },
    [scrollContainerRef, stepRefs],
  );

  const scrollToBasicTop = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }, [scrollContainerRef]);

  const handleStepClick = useCallback(
    (stepId: FormStepId) => {
      clearManualStepTimer();
      setIsManualOperating(true);

      if (stepId === 'basic') {
        scrollToBasicTop();
      } else {
        scrollToStep(stepId);
      }

      manualStepTimerRef.current = window.setTimeout(() => {
        manualStepTimerRef.current = null;
        setIsManualOperating(false);
      }, FORM_STEP_LOCK_MS);
    },
    [clearManualStepTimer, setIsManualOperating, scrollToBasicTop, scrollToStep],
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return undefined;

    const handleScroll = () => {
      if (isManualOperating) return;
      syncActiveStepFromScroll();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef, isManualOperating, syncActiveStepFromScroll]);

  useEffect(
    () => () => {
      clearManualStepTimer();
    },
    [clearManualStepTimer],
  );

  return { handleStepClick };
}