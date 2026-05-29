/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 * Best-effort display formatting from Excel `numFmt` + float cleanup (IEEE-754 noise).
 */

/** Strip quoted literals in Excel formats ("USD" etc.). */
function stripQuotedChunks(numFmt: string): string {
  return numFmt.replace(/"[^"]*"|'[^']*'/gu, '');
}

function firstPositiveSection(numFmt: string): string {
  const s = stripQuotedChunks(numFmt).trim();
  const semi = s.indexOf(';');
  return semi >= 0 ? s.slice(0, semi) : s;
}

function wantsThousandsSeparator(section: string): boolean {
  return /#,\s*##|#,##|,##0/u.test(section);
}

/** Decimal places before `%` in `0.0%`-style formats. */
function percentFractionDigits(section: string): number {
  const beforePct = section.split('%')[0] ?? '';
  const m = /\.(0+)/u.exec(beforePct);
  if (m) return m[1].length;
  return 0;
}

/**
 * Fraction digits for non-percent numeric formats (first positive section).
 * No `.` → treated as integer pattern when section looks numeric.
 */
function numberFractionDigits(section: string): number | null {
  if (/%/u.test(section)) return null;
  if (/^\s*General\s*$/iu.test(section)) return null;
  if (/[dmyh]([^a-z]|$)|^[\s]*\[/iu.test(section)) return null;

  const m = /\.(0+)/u.exec(section);
  if (m) return m[1].length;

  if (!/\./u.test(section) && /[0#]/.test(section)) return 0;
  return null;
}

function snapNearInteger(n: number, eps = 1e-9): number {
  if (!Number.isFinite(n)) return n;
  const r = Math.round(n);
  if (Math.abs(n - r) < eps) return r;
  return n;
}

function roundToDecimalPlaces(n: number, places: number): number {
  if (places <= 0) {
    const r = Math.round(n);
    return Math.abs(n - r) < 1e-12 ? r : Math.round(n + Number.EPSILON * Math.sign(n));
  }
  const p = 10 ** places;
  return Math.round((n + Number.EPSILON * Math.sign(n)) * p) / p;
}

function formatGeneral(n: number): string {
  let x = snapNearInteger(n, 1e-7);
  if (Math.abs(x - Math.round(x)) < 1e-7) return String(Math.round(x));
  x = Number.parseFloat(x.toPrecision(12));
  return String(x);
}

/**
 * Format a numeric cell for grid display (aligned with `numFmt` when parsable).
 */
export function formatNumericForDisplay(value: number, numFmt: string | undefined): string {
  if (!Number.isFinite(value)) return String(value);

  const raw = (numFmt ?? '').trim();
  if (!raw || /^General$/iu.test(raw)) {
    return formatGeneral(value);
  }

  const section = firstPositiveSection(raw);

  if (/%/u.test(section)) {
    const fd = percentFractionDigits(section);
    const pct = roundToDecimalPlaces(value * 100, fd);
    const cleaned = snapNearInteger(pct, 1e-9);
    return `${cleaned}%`;
  }

  const fdNum = numberFractionDigits(section);
  if (fdNum != null) {
    let n = roundToDecimalPlaces(value, fdNum);
    n = snapNearInteger(n, fdNum === 0 ? 1e-7 : 1e-9);
    if (wantsThousandsSeparator(section)) {
      return n.toLocaleString('en-US', {
        minimumFractionDigits: fdNum,
        maximumFractionDigits: fdNum,
        useGrouping: true,
      });
    }
    if (fdNum === 0) return String(Math.round(n));
    return n.toFixed(fdNum);
  }

  return formatGeneral(value);
}
