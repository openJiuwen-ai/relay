/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback } from 'react';

export function isCommandInvocation(input: string, command: string): boolean {
  if (!input.startsWith(command)) return false;
  if (input.length === command.length) return true;
  return /\s/.test(input.charAt(command.length));
}

export function useChatCommands() {
  const processCommand = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_input: string, _overrideThreadId?: string): Promise<boolean> => {
      return false;
    },
    [],
  );

  return { processCommand };
}
