/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { Cell, Fill, Font, Worksheet } from 'exceljs';
import { buildWorksheetNumericCache, inferFormulaNumeric } from './xlsxFormulaFallback';
import { formatNumericForDisplay } from './xlsxNumberFormat';

/** Inline styles mapped from Excel cell model (via ExcelJS). */
export type SheetCellCss = {
  backgroundColor?: string;
  color?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
};

export type SheetCell = {
  text: string;
  style?: SheetCellCss;
};

export interface SheetData {
  name: string;
  rows: SheetCell[][];
  /** Column header letters (A, B, C …) derived from the widest row */
  headers: string[];
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function colIndexToLetter(index: number): string {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

function argbToCss(color: { argb?: string } | string | undefined): string | undefined {
  if (color == null) return undefined;
  const raw = typeof color === 'string' ? color : color.argb;
  if (typeof raw !== 'string' || raw.length < 6) return undefined;
  const rgb = raw.length >= 8 ? raw.slice(2) : raw;
  return `#${rgb}`;
}

function fillToBackground(fill: Fill | undefined): string | undefined {
  if (!fill) return undefined;
  if (fill.type === 'pattern') {
    const fg = argbToCss(fill.fgColor);
    if (fg) return fg;
    return argbToCss(fill.bgColor);
  }
  if (fill.type === 'gradient' && fill.stops.length > 0) {
    return argbToCss(fill.stops[0].color);
  }
  return undefined;
}

function fontToStyle(font: Partial<Font> | undefined): SheetCellCss | undefined {
  if (!font) return undefined;
  const s: SheetCellCss = {};
  if (font.color) {
    const c = argbToCss(font.color as { argb: string });
    if (c) s.color = c;
  }
  if (font.bold) s.fontWeight = 'bold';
  if (font.italic) s.fontStyle = 'italic';
  return Object.keys(s).length ? s : undefined;
}

function cellToStyle(cell: Cell): SheetCellCss | undefined {
  const s: SheetCellCss = {};
  const bg = fillToBackground(cell.fill);
  if (bg) s.backgroundColor = bg;
  const fs = fontToStyle(cell.font);
  if (fs?.color) s.color = fs.color;
  if (fs?.fontWeight) s.fontWeight = fs.fontWeight;
  if (fs?.fontStyle) s.fontStyle = fs.fontStyle;
  const h = cell.alignment?.horizontal;
  if (h === 'center' || h === 'left' || h === 'right' || h === 'justify') {
    s.textAlign = h;
  }
  return Object.keys(s).length ? s : undefined;
}

function errorCellToString(v: unknown): string | null {
  if (v && typeof v === 'object' && 'error' in v) {
    const e = (v as { error: unknown }).error;
    if (typeof e === 'string') return e;
  }
  return null;
}

function richTextToString(v: { richText?: Array<{ text: string }> }): string {
  const rt = v.richText;
  return Array.isArray(rt) ? rt.map((x) => x.text).join('') : '';
}

/** Display text for grid cells — avoid `String(object)` → `[object Object]` (formulas, errors, shared formulas). */
function normalizedCellText(cell: Cell, numericCache: Map<string, number>): string {
  const t = cell.text;
  if (typeof t === 'string' && t.trim().length > 0) return t;

  const v = cell.value as unknown;
  const numFmt = cell.numFmt;
  if (v == null || v === '') return '';
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (x == null) return '';
        const err = errorCellToString(x);
        if (err) return err;
        if (typeof x === 'number') return formatNumericForDisplay(x, undefined);
        if (typeof x === 'string' || typeof x === 'boolean') return String(x);
        if (x instanceof Date) return x.toLocaleString();
        if (typeof x === 'object' && x !== null && 'richText' in x) {
          return richTextToString(x as { richText?: Array<{ text: string }> });
        }
        return '';
      })
      .join(', ');
  }
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return typeof v === 'number' ? formatNumericForDisplay(v, numFmt) : String(v);
  }
  if (v instanceof Date) return v.toLocaleString();

  if (typeof v === 'object' && v !== null) {
    const err = errorCellToString(v);
    if (err) return err;

    if ('richText' in v) return richTextToString(v as { richText?: Array<{ text: string }> });

    if ('hyperlink' in v) {
      const h = v as { text?: string };
      return typeof h.text === 'string' ? h.text : '';
    }

    const asFormula = v as { formula?: string; sharedFormula?: string; result?: unknown };
    if (typeof asFormula.formula === 'string' || typeof asFormula.sharedFormula === 'string') {
      const r = asFormula.result;
      if (r == null || r === '') {
        const inferred = inferFormulaNumeric(cell, numericCache);
        if (inferred != null) return formatNumericForDisplay(inferred, numFmt);
        return typeof asFormula.formula === 'string' ? asFormula.formula : asFormula.sharedFormula ?? '';
      }
      const errR = errorCellToString(r);
      if (errR) return errR;
      if (typeof r === 'string' || typeof r === 'boolean') return String(r);
      if (typeof r === 'number') return formatNumericForDisplay(r, numFmt);
      if (r instanceof Date) return r.toLocaleString();
      if (r && typeof r === 'object' && 'richText' in r) {
        return richTextToString(r as { richText?: Array<{ text: string }> });
      }
      return typeof asFormula.formula === 'string' ? asFormula.formula : asFormula.sharedFormula ?? '';
    }

    if ('result' in asFormula) {
      const r = asFormula.result;
      if (r == null || r === '') return '';
      const errR = errorCellToString(r);
      if (errR) return errR;
      if (typeof r === 'string' || typeof r === 'boolean') return String(r);
      if (typeof r === 'number') return formatNumericForDisplay(r, numFmt);
      if (r instanceof Date) return r.toLocaleString();
    }
  }

  return '';
}

function excelWorksheetToSheetData(worksheet: Worksheet): SheetData {
  const maxRow = worksheet.actualRowCount;
  const maxCol = worksheet.actualColumnCount;
  if (maxRow === 0 || maxCol === 0) {
    return { name: worksheet.name, rows: [], headers: [] };
  }
  const numericCache = buildWorksheetNumericCache(worksheet);
  const headers = Array.from({ length: maxCol }, (_, i) => colIndexToLetter(i));
  const rows: SheetCell[][] = [];
  for (let r = 1; r <= maxRow; r += 1) {
    const dataRow: SheetCell[] = [];
    for (let c = 1; c <= maxCol; c += 1) {
      const cell = worksheet.getCell(r, c);
      dataRow.push({
        text: normalizedCellText(cell, numericCache),
        style: cellToStyle(cell),
      });
    }
    rows.push(dataRow);
  }
  return { name: worksheet.name, rows, headers };
}

async function parseWithExcelJs(data: Uint8Array): Promise<SheetData[]> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  await workbook.xlsx.load(buffer as never);
  return workbook.worksheets.map((ws) => excelWorksheetToSheetData(ws));
}

/** RFC4180-style: quoted fields, `""` escape; delimiter `,` or `\t`. */
function parseDelimitedText(text: string, delimiter: ',' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += c;
        i += 1;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  row.push(field);
  rows.push(row);
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell === '')) {
    rows.pop();
  }
  return rows;
}

function sniffDelimiter(text: string): ',' | '\t' {
  const line = text.split(/\r?\n/u).find((l) => l.trim().length > 0) ?? '';
  const tabs = (line.match(/\t/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

function gridToSheetData(name: string, grid: string[][]): SheetData {
  const maxCols = grid.reduce((m, r) => Math.max(m, r.length), 0);
  if (maxCols === 0) {
    return { name, rows: [], headers: [] };
  }
  const headers = Array.from({ length: maxCols }, (_, i) => colIndexToLetter(i));
  const rows: SheetCell[][] = grid.map((r) =>
    headers.map((_, i) => ({ text: r[i] ?? '' })),
  );
  return { name, rows, headers };
}

/** When bytes are not OOXML (zip), try UTF-8 CSV / TSV (no extra dependency). */
function tryParseUtf8Delimited(data: Uint8Array): SheetData[] | null {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return null;
  }
  if (text.includes('\0')) return null;
  const stripped = text.replace(/^\uFEFF/u, '');
  if (!/[\r\n]/u.test(stripped)) return null;
  const delim = sniffDelimiter(stripped);
  const grid = parseDelimitedText(stripped, delim);
  if (grid.length === 0) return null;
  return [gridToSheetData('Sheet1', grid)];
}

/**
 * Parse from base64: **ExcelJS** for `.xlsx` / `.xlsm` (styles via cell fill/font).
 * Fallback: UTF-8 **CSV/TSV** parsed in-app (no styles). Legacy `.xls` (BIFF) is not supported.
 */
export async function parseXlsxBase64ToSheets(b64: string): Promise<SheetData[]> {
  const data = base64ToUint8Array(b64);
  try {
    const sheets = await parseWithExcelJs(data);
    if (sheets.length > 0) return sheets;
  } catch {
    // not OOXML
  }
  const delimited = tryParseUtf8Delimited(data);
  if (delimited) return delimited;
  throw new Error(
    '无法预览：请使用 .xlsx / .xlsm，或 UTF-8 编码的 .csv。旧版 .xls 请用 Excel 另存为 .xlsx 后再预览。',
  );
}
