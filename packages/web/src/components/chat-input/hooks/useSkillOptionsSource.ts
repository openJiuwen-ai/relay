/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchSkillOptionsWithCache,
  SKILL_OPTIONS_UPDATED_EVENT,
  seedSkillOptionsCache,
  type SkillOption,
} from '@/utils/skill-options-cache';

export function useSkillOptionsSource() {
  const [skillOptions, setSkillOptions] = useState<SkillOption[]>([]);
  const [skillOptionsLoading, setSkillOptionsLoading] = useState(false);
  const requestSeqRef = useRef(0);
  const mountedRef = useRef(true);

  const loadSkillOptions = useCallback((force = false) => {
    const requestId = ++requestSeqRef.current;
    setSkillOptionsLoading(true);
    void fetchSkillOptionsWithCache(force ? { force: true } : undefined)
      .then((options) => {
        if (!mountedRef.current || requestSeqRef.current !== requestId) return;
        setSkillOptions(options);
        seedSkillOptionsCache(options);
      })
      .finally(() => {
        if (!mountedRef.current || requestSeqRef.current !== requestId) return;
        setSkillOptionsLoading(false);
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadSkillOptions();
    return () => {
      mountedRef.current = false;
      requestSeqRef.current += 1;
    };
  }, [loadSkillOptions]);

  useEffect(() => {
    const onUpdated = () => loadSkillOptions(true);
    window.addEventListener(SKILL_OPTIONS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(SKILL_OPTIONS_UPDATED_EVENT, onUpdated);
  }, [loadSkillOptions]);

  return {
    skillOptions,
    skillOptionsLoading,
    loadSkillOptions,
  };
}

