/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { readBubbleExpandPref, writeBubbleExpandPref } from '@/lib/chat-bubble-expand-prefs';
import type { CliStatus } from '@/stores/chat-types';

export function useCliOutputBlockExpansion({
  status,
  defaultExpanded,
  hasPendingAuthorization,
  persistExpandKey,
}: {
  status: CliStatus;
  defaultExpanded: boolean;
  hasPendingAuthorization: boolean;
  /** When set, persist outer CLI block expand/collapse across refresh / thread switch */
  persistExpandKey?: string;
}) {
  const isExport =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('export') === 'true';
  const forceExpanded = status === 'streaming' || isExport || hasPendingAuthorization;

  const [expanded, setExpanded] = useState(() => {
    if (persistExpandKey && !forceExpanded) {
      const p = readBubbleExpandPref(persistExpandKey);
      if (p !== undefined) return p;
    }
    return forceExpanded || defaultExpanded;
  });

  const userInteracted = useRef(
    Boolean(
      persistExpandKey &&
        readBubbleExpandPref(persistExpandKey) !== undefined &&
        !forceExpanded,
    ),
  );
  const hasMounted = useRef(false);

  useLayoutEffect(() => {
    if (!persistExpandKey) return;
    if (forceExpanded) return;
    const p = readBubbleExpandPref(persistExpandKey);
    if (p !== undefined) {
      userInteracted.current = true;
      setExpanded(p);
    }
  }, [persistExpandKey, forceExpanded]);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (
      prevStatusRef.current === 'streaming' &&
      status !== 'streaming' &&
      !userInteracted.current &&
      !hasPendingAuthorization
    ) {
      setExpanded(false);
    }
    prevStatusRef.current = status;
  }, [hasPendingAuthorization, status]);

  useEffect(() => {
    if (forceExpanded) {
      setExpanded(true);
    }
  }, [forceExpanded]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dispatch layout sync when expanded toggles
  useLayoutEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('office-claw:chat-layout-changed'));
    }
  }, [expanded]);

  const handleToggle = () => {
    userInteracted.current = true;
    setExpanded((v) => {
      const next = !v;
      if (persistExpandKey) {
        writeBubbleExpandPref(persistExpandKey, next);
      }
      return next;
    });
  };

  return {
    expanded,
    userInteracted,
    handleToggle,
  };
}
