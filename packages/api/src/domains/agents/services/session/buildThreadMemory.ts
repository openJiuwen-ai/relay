/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * buildThreadMemory — F065 Phase B
 * Pure function: merges existing ThreadMemory with a new extractive digest,
 * producing an updated rolling summary. Rule-based (no LLM).
 *
 * Merge strategy:
 * 1. Format new digest as single session summary line
 * 2. Prepend to existing summary
 * 3. Trim oldest lines from end if over maxTokens
 * 4. Increment sessionsIncorporated
 */

import { estimateTokens } from '../../../../utils/token-counter.js';
import type { ThreadMemoryV1 } from '../stores/ports/ThreadStore.js';
import type { ExtractiveDigestV1 } from './TranscriptWriter.js';

const MAX_TOOLS_DISPLAY = 10;
const MAX_FILES_DISPLAY = 10;

function formatTimeShort(epoch: number): string {
  const d = new Date(epoch);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatSessionLine(digest: ExtractiveDigestV1, sessionNumber: number): string {
  const duration = Math.round((digest.time.sealedAt - digest.time.createdAt) / 60000);
  const timeRange = `${formatTimeShort(digest.time.createdAt)}-${formatTimeShort(digest.time.sealedAt)}`;

  // Tools (deduplicated, capped)
  const allTools = [...new Set(digest.invocations.flatMap((inv) => inv.toolNames ?? []))];
  const toolsDisplay = allTools.slice(0, MAX_TOOLS_DISPLAY).join(', ');
  const toolsExtra = allTools.length > MAX_TOOLS_DISPLAY ? ` +${allTools.length - MAX_TOOLS_DISPLAY} more` : '';

  // Files (capped)
  const files = digest.filesTouched
    .slice(0, MAX_FILES_DISPLAY)
    .map((f) => f.path)
    .join(', ');
  const filesExtra =
    digest.filesTouched.length > MAX_FILES_DISPLAY ? ` +${digest.filesTouched.length - MAX_FILES_DISPLAY} more` : '';

  // Errors
  const errorPart =
    digest.errors.length > 0 ? ` ${digest.errors.length} error${digest.errors.length > 1 ? 's' : ''}.` : '';

  return `Session #${sessionNumber} (${timeRange}, ${duration}min): ${toolsDisplay}${toolsExtra}. Files: ${files}${filesExtra}.${errorPart}`;
}

export function buildThreadMemory(
  existing: ThreadMemoryV1 | null,
  newDigest: ExtractiveDigestV1,
  maxTokens: number,
): ThreadMemoryV1 {
  // R1 P1-1: session number comes from digest.seq (1-based display), not merge count
  const sessionNumber = newDigest.seq + 1;
  const mergeCount = (existing?.sessionsIncorporated ?? 0) + 1;
  const newLine = formatSessionLine(newDigest, sessionNumber);

  // Prepend new session line to existing summary
  const existingLines = existing?.summary ? existing.summary.split('\n') : [];
  const allLines = [newLine, ...existingLines];

  // Trim oldest lines (from end) until within token budget
  let summary = allLines.join('\n');
  while (estimateTokens(summary) > maxTokens && allLines.length > 1) {
    allLines.pop();
    summary = allLines.join('\n');
  }

  // R1 P2-1 hard-cap: if single remaining line still exceeds maxTokens,
  // truncate it (rough char-level cut, re-estimate)
  if (estimateTokens(summary) > maxTokens) {
    const ratio = maxTokens / Math.max(1, estimateTokens(summary));
    summary = `${summary.slice(0, Math.floor(summary.length * ratio * 0.9))}...`;
  }

  return {
    v: 1,
    summary,
    sessionsIncorporated: mergeCount,
    updatedAt: Date.now(),
  };
}
