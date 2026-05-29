/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export interface NameInitialIconTheme {
  background: string;
  borderColor: string;
  textColor: string;
}
const EMPTY_INITIAL_FALLBACK = '#';

function stableHash(input: string): number {
  let hash = 0;
  for (const ch of input) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function getNameInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return EMPTY_INITIAL_FALLBACK;
  const [initial] = Array.from(trimmed);
  return /[a-z]/i.test(initial) ? initial.toUpperCase() : initial;
}

export function getNameInitialIconTheme(name: string): NameInitialIconTheme {
  const seed = name.trim().toLowerCase() || 'empty';
  const hue = stableHash(seed) % 360;
  const accent = `hsl(${hue} 66% 52%)`;

  return {
    background: `linear-gradient(145deg, color-mix(in srgb, var(--surface-card) 86%, ${accent}) 0%, color-mix(in srgb, var(--accent-soft) 70%, ${accent}) 100%)`,
    borderColor: `color-mix(in srgb, var(--border-soft) 60%, ${accent})`,
    textColor: `color-mix(in srgb, var(--text-primary) 70%, ${accent})`,
  };
}

export function buildNameInitialIconDataUrl(name: string, variant = 0): string {
  const normalizedName = name.trim() || EMPTY_INITIAL_FALLBACK;
  const seed = `${normalizedName.toLowerCase()}#${variant}`;
  const baseHue = stableHash(seed) % 360;
  const label = getNameInitial(normalizedName);
  const background = `hsl(${baseHue} 52% 78%)`;
  const textColor = '#1F2937';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="10" fill="${background}" />
      <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="38" font-weight="700" fill="${textColor}">${label}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
