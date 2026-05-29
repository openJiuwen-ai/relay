/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useCallback, useMemo, useState } from 'react';
import type { SelectedTemplateSummary } from '../types';


export function useTemplateMode(input: string) {
  const [guidedModeEnabled, setGuidedModeEnabled] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SelectedTemplateSummary | null>(null);

  const hasPptSkillInInput = useMemo(() => /\[\[skill:[^\]]*ppt[^\]]*\]\]/i.test(input), [input]);

  const onToggleGuidedMode = useCallback(() => {
    setGuidedModeEnabled((prev) => !prev);
  }, []);

  const onClearSelectedTemplate = useCallback(() => {
    setSelectedTemplate(null);
  }, []);

  return {
    guidedModeEnabled,
    setGuidedModeEnabled,
    hasPptSkillInInput,
    selectedTemplate,
    setSelectedTemplate,
    onToggleGuidedMode,
    onClearSelectedTemplate,
  };
}

