/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';

interface UseHistorySuggestionSyncParams {
  input: string;
  findHistoryMatch: (text: string) => string | null;
  ghostRef: MutableRefObject<string | null>;
  setGhostSuggestion: Dispatch<SetStateAction<string | null>>;
}

export function useHistorySuggestionSync({
  input,
  findHistoryMatch,
  ghostRef,
  setGhostSuggestion,
}: UseHistorySuggestionSyncParams) {
  useEffect(() => {
    const match = input.trim() ? findHistoryMatch(input) : null;
    ghostRef.current = match;
    setGhostSuggestion(match);
  }, [findHistoryMatch, ghostRef, input, setGhostSuggestion]);
}

