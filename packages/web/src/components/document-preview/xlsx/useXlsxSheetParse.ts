/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState } from 'react';
import type { SheetData } from './xlsxWorkbook';
import { parseXlsxBase64ToSheets } from './xlsxWorkbook';

export type XlsxSheetParseState =
  | { status: 'idle' }
  | { status: 'parsing' }
  | { status: 'ok'; sheets: SheetData[] }
  | { status: 'error'; message: string };

/** Runs SheetJS parse when base64 payload is ready (keeps `useEffect` out of the preview UI component). */
export function useXlsxSheetParse(contentBase64: string | null | undefined): XlsxSheetParseState {
  const [state, setState] = useState<XlsxSheetParseState>({ status: 'idle' });

  useEffect(() => {
    if (!contentBase64?.trim()) {
      setState({ status: 'idle' });
      return;
    }
    const b64 = contentBase64.trim();
    let cancelled = false;
    setState({ status: 'parsing' });

    void parseXlsxBase64ToSheets(b64)
      .then((sheets) => {
        if (cancelled) return;
        setState({ status: 'ok', sheets });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', message: e instanceof Error ? e.message : 'Excel 预览失败' });
      });

    return () => {
      cancelled = true;
    };
  }, [contentBase64]);

  return state;
}
