/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useState } from 'react';
import type { SheetData } from './xlsxWorkbook';

function SheetTable({ sheet }: { sheet: SheetData }) {
  if (sheet.rows.length === 0) {
    return <p className="p-4 text-sm text-gray-400">（空工作表）</p>;
  }

  return (
    <div className="overflow-auto">
      <table className="xlsx-oc-grid min-w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-8 border border-neutral-300 bg-neutral-100 px-2 py-1 text-center text-neutral-500" />
            {sheet.headers.map((h) => (
              <th
                key={h}
                className="min-w-[80px] border border-neutral-300 bg-neutral-100 px-2 py-1 text-center font-medium text-neutral-600"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, rowIdx) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={rowIdx}>
              <td className="sticky left-0 z-10 border border-neutral-300 bg-neutral-50 px-2 py-1 text-center text-neutral-400">
                {rowIdx + 1}
              </td>
              {sheet.headers.map((_, colIdx) => {
                const cell = row[colIdx] ?? { text: '' };
                return (
                  // eslint-disable-next-line react/no-array-index-key
                  <td
                    key={colIdx}
                    className="border border-neutral-300 px-2 py-1 text-neutral-900"
                    style={cell.style}
                  >
                    {cell.text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Spreadsheet grid only — parsing lives in `useXlsxSheetParse` (avoids effect compilation issues in this module). */
export function XlsxDocumentPreview({ sheets, title }: { sheets: SheetData[]; title: string }) {
  const [activeSheet, setActiveSheet] = useState(0);
  const safeIndex = sheets.length > 0 ? Math.min(activeSheet, sheets.length - 1) : 0;
  const currentSheet = sheets[safeIndex];

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-label={title}>
      {sheets.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-3 py-1">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActiveSheet(i)}
              className={[
                'whitespace-nowrap rounded px-3 py-1 text-xs font-medium transition-colors',
                i === safeIndex
                  ? 'bg-white text-blue-600 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:bg-white hover:text-gray-800',
              ].join(' ')}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">{currentSheet && <SheetTable sheet={currentSheet} />}</div>
    </div>
  );
}
