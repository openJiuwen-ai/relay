/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

export interface ClaudeRescueSessionItem {
  sessionId: string;
  transcriptPath: string;
  removableThinkingTurns: number;
  detectedBy: 'api_error_entry' | 'short_signature';
}

export interface ClaudeRescueResultItem {
  sessionId: string;
  status: 'repaired' | 'clean' | 'missing';
  removedTurns: number;
  backupPath: string | null;
  reason?: string;
}

export interface ClaudeRescueRunResult {
  status: 'ok' | 'partial' | 'noop';
  rescuedCount: number;
  skippedCount: number;
  results: ClaudeRescueResultItem[];
}
