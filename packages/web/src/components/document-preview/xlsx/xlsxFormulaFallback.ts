/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 * ExcelJS does not evaluate formulas; cached values must exist in the file (see
 * https://github.com/exceljs/exceljs#formula-value ). When `<v>` is missing, this
 * module performs a **narrow, heuristic** multi-pass resolve for common spreadsheet
 * patterns (SUM, IF, binary ops, simple refs) using already-known numeric cells.
 */

import type { Cell, Worksheet } from 'exceljs';

const MAX_PASS = (rows: number, cols: number) => Math.max(64, rows * cols * 2);

export function colLettersToIndex(letters: string): number {
  let n = 0;
  const u = letters.toUpperCase();
  for (let i = 0; i < u.length; i += 1) {
    n = n * 26 + (u.charCodeAt(i) - 64);
  }
  return n;
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function getFromCache(cache: Map<string, number>, colLetters: string, row: number): number | undefined {
  const col = colLettersToIndex(colLetters);
  return cache.get(cellKey(row, col));
}

/** Strip formula and whitespace for pattern matching. */
function normalizeFormulaInput(formula: string): string {
  return formula.replace(/^=/u, '').replace(/\s+/gu, '');
}

function seedNumericFromCell(cell: Cell): number | undefined {
  const v = cell.value;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (!v || typeof v !== 'object') return undefined;
  if (!('formula' in v) && !('sharedFormula' in v)) return undefined;
  const r = (v as { result?: unknown }).result;
  return typeof r === 'number' && Number.isFinite(r) ? r : undefined;
}

function evalSum(norm: string, cache: Map<string, number>): number | undefined {
  const m = /^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/iu.exec(norm);
  if (!m) return undefined;
  const c1 = colLettersToIndex(m[1]);
  const r1 = parseInt(m[2], 10);
  const c2 = colLettersToIndex(m[3]);
  const r2 = parseInt(m[4], 10);
  const lowR = Math.min(r1, r2);
  const highR = Math.max(r1, r2);
  const lowC = Math.min(c1, c2);
  const highC = Math.max(c1, c2);
  let sum = 0;
  for (let r = lowR; r <= highR; r += 1) {
    for (let c = lowC; c <= highC; c += 1) {
      const v = cache.get(cellKey(r, c));
      if (v === undefined) return undefined;
      sum += v;
    }
  }
  return sum;
}

function evalIf(norm: string, cache: Map<string, number>, depth: number): number | undefined {
  if (depth > 48) return undefined;
  const m = /^IF\(([A-Z]+)(\d+)=0,0,(.+)\)$/iu.exec(norm);
  if (!m) return undefined;
  const testR = parseInt(m[2], 10);
  const testC = colLettersToIndex(m[1]);
  const testV = cache.get(cellKey(testR, testC));
  if (testV === undefined) return undefined;
  if (testV === 0) return 0;
  return evalArithmetic(m[3], cache, depth + 1);
}

function evalArithmetic(norm: string, cache: Map<string, number>, depth: number): number | undefined {
  if (depth > 48) return undefined;

  const ifVal = evalIf(norm, cache, depth);
  if (ifVal != null) return ifVal;

  const sumVal = evalSum(norm, cache);
  if (sumVal != null) return sumVal;

  const divG = /^\(([A-Z]+)(\d+)-([A-Z]+)(\d+)\)\/([A-Z]+)(\d+)$/iu.exec(norm);
  if (divG) {
    const a = getFromCache(cache, divG[1], parseInt(divG[2], 10));
    const b = getFromCache(cache, divG[3], parseInt(divG[4], 10));
    const c = getFromCache(cache, divG[5], parseInt(divG[6], 10));
    if (a === undefined || b === undefined || c === undefined) return undefined;
    if (c === 0) return 0;
    return (a - b) / c;
  }

  const divS = /^([A-Z]+)(\d+)\/([A-Z]+)(\d+)$/iu.exec(norm);
  if (divS) {
    const a = getFromCache(cache, divS[1], parseInt(divS[2], 10));
    const b = getFromCache(cache, divS[3], parseInt(divS[4], 10));
    if (a === undefined || b === undefined) return undefined;
    if (b === 0) return 0;
    return a / b;
  }

  const bin = /^([A-Z]+)(\d+)([+\-*/])([A-Z]+)(\d+)$/iu.exec(norm);
  if (bin) {
    const a = getFromCache(cache, bin[1], parseInt(bin[2], 10));
    const b = getFromCache(cache, bin[4], parseInt(bin[5], 10));
    if (a === undefined || b === undefined) return undefined;
    const op = bin[3];
    if (op === '+') return a + b;
    if (op === '-') return a - b;
    if (op === '*') return a * b;
    if (op === '/') return b === 0 ? 0 : a / b;
  }

  const single = /^([A-Z]+)(\d+)$/iu.exec(norm);
  if (single) {
    return getFromCache(cache, single[1], parseInt(single[2], 10));
  }

  return undefined;
}

function formulaString(cell: Cell): string | undefined {
  const f = cell.formula;
  return typeof f === 'string' && f.length > 0 ? f : undefined;
}

/**
 * Fill `cache` with numeric values: literals, stored formula results, then iterative
 * evaluation of supported formula shapes until fixed point.
 */
export function buildWorksheetNumericCache(worksheet: Worksheet): Map<string, number> {
  const cache = new Map<string, number>();
  const maxRow = worksheet.actualRowCount;
  const maxCol = worksheet.actualColumnCount;
  if (maxRow === 0 || maxCol === 0) return cache;

  for (let r = 1; r <= maxRow; r += 1) {
    for (let c = 1; c <= maxCol; c += 1) {
      const n = seedNumericFromCell(worksheet.getCell(r, c));
      if (n != null) cache.set(cellKey(r, c), n);
    }
  }

  const limit = MAX_PASS(maxRow, maxCol);
  for (let pass = 0; pass < limit; pass += 1) {
    let progressed = false;
    for (let r = 1; r <= maxRow; r += 1) {
      for (let c = 1; c <= maxCol; c += 1) {
        const k = cellKey(r, c);
        if (cache.has(k)) continue;
        const cell = worksheet.getCell(r, c);
        const fs = formulaString(cell);
        if (!fs) continue;
        const norm = normalizeFormulaInput(fs);
        const val = evalArithmetic(norm, cache, 0);
        if (val != null && Number.isFinite(val)) {
          cache.set(k, val);
          progressed = true;
        }
      }
    }
    if (!progressed) break;
  }

  return cache;
}

/** When ExcelJS has no cached `result`, try the numeric resolution map. */
export function inferFormulaNumeric(cell: Cell, cache: Map<string, number>): number | undefined {
  const fs = formulaString(cell);
  if (!fs) return undefined;
  const norm = normalizeFormulaInput(fs);
  return evalArithmetic(norm, cache, 0);
}
