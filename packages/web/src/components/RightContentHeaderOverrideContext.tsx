/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { RightContentHeaderPanelToggle } from './RightContentHeader';

export interface RightContentHeaderOverride {
  leftContent?: ReactNode;
  panelToggle?: RightContentHeaderPanelToggle;
}

interface RightContentHeaderOverrideContextValue {
  override: RightContentHeaderOverride | null;
  setOverride: Dispatch<SetStateAction<RightContentHeaderOverride | null>>;
}

const RightContentHeaderOverrideContext = createContext<RightContentHeaderOverrideContextValue | null>(null);

export function RightContentHeaderOverrideProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<RightContentHeaderOverride | null>(null);
  const value = useMemo(() => ({ override, setOverride }), [override]);

  return (
    <RightContentHeaderOverrideContext.Provider value={value}>{children}</RightContentHeaderOverrideContext.Provider>
  );
}

export function useCurrentRightContentHeaderOverride(): RightContentHeaderOverride | null {
  return useContext(RightContentHeaderOverrideContext)?.override ?? null;
}

export function useRightContentHeaderOverride(override: RightContentHeaderOverride | null) {
  const context = useContext(RightContentHeaderOverrideContext);
  const setOverride = context?.setOverride;

  useEffect(() => {
    if (!setOverride) return;
    setOverride(override);
    return () => setOverride(null);
  }, [setOverride, override]);
}
