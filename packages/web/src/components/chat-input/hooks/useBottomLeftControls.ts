/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useCallback } from 'react';
import type { MouseEvent, MutableRefObject, RefObject } from 'react';
import type { RichTextareaHandle } from '../components/RichTextarea';

interface UseBottomLeftControlsParams {
  input: string;
  textareaRef: RefObject<RichTextareaHandle>;
  skillInsertAnchorRef: MutableRefObject<{ start: number; end: number } | null>;
  closeMenus: () => void;
  routerPush: (path: string) => void;
}

export function useBottomLeftControls({
  input,
  textareaRef,
  skillInsertAnchorRef,
  closeMenus,
  routerPush,
}: UseBottomLeftControlsParams) {
  const onSkillMouseDown = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const ta = textareaRef.current;
      const start = ta?.getSelectionStart() ?? input.length;
      const end = ta?.getSelectionEnd() ?? input.length;
      skillInsertAnchorRef.current = { start, end };
    },
    [input, textareaRef, skillInsertAnchorRef],
  );

  const onOpenSkillManager = useCallback(() => {
    closeMenus();
    routerPush('/skills');
  }, [closeMenus, routerPush]);

  return {
    onSkillMouseDown,
    onOpenSkillManager,
  };
}
