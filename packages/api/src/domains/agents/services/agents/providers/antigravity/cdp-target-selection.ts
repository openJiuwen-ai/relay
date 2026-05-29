/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * CDP target discovery and ranking.
 * Extracted from AntigravityCdpClient to keep the main file under 350 lines.
 */

export interface CdpTarget {
  id?: string;
  title: string;
  webSocketDebuggerUrl: string;
  type: string;
  url: string;
}

export interface FindEditorTargetOptions {
  /** Substring to match in target title (e.g. project name) to avoid multi-window misrouting */
  titleHint?: string;
}

/** URLs known to be non-interactive agent/extension pages — never pick these. */
const EXCLUDED_URL_PATTERNS = ['workbench-jetski-agent.html', 'extension-host'];

/** Normalise a worktree-suffixed hint: "office-claw-f061-fix" → "office-claw" */
export function normaliseHint(hint: string): string {
  return hint.replace(/-f\d{2,4}[a-z0-9-]*$/i, '');
}

/** Filter pages: skip non-page, Launchpad, excluded URL patterns, empty wsUrl. */
function filterPages(targets: CdpTarget[]): CdpTarget[] {
  return targets.filter((t) => {
    if (t.type !== 'page' || !t.webSocketDebuggerUrl) return false;
    if (t.title.includes('Launchpad')) return false;
    if (EXCLUDED_URL_PATTERNS.some((p) => t.url.includes(p))) return false;
    return true;
  });
}

/** Score and sort candidates: workbench.html URL (+2) > titleHint match (+1) > first page (0). */
function scoreAndSort(pages: CdpTarget[], hint?: string): CdpTarget[] {
  const normHint = hint ? normaliseHint(hint).toLowerCase() : null;
  const scored = pages.map((t) => {
    let score = 0;
    if (t.url.includes('workbench/workbench.html') || t.url.includes('workbench.html')) score += 2;
    if (normHint && t.title.toLowerCase().includes(normHint)) score += 1;
    return { target: t, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.target);
}

/** Pick the single best editor page target.
 *  Backward-compatible API for callers that just need one target. */
export function findEditorTarget(targets: CdpTarget[], options?: FindEditorTargetOptions): CdpTarget | null {
  const ranked = rankEditorTargets(targets, options);
  return ranked[0] ?? null;
}

/** Return all viable editor targets sorted by priority (best first).
 *  Used by connect() to probe candidates in order. */
export function rankEditorTargets(targets: CdpTarget[], options?: FindEditorTargetOptions): CdpTarget[] {
  const pages = filterPages(targets);
  if (pages.length === 0) return [];
  return scoreAndSort(pages, options?.titleHint);
}
