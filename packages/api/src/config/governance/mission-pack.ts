/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F070 Phase 2: Dispatch Mission Pack
 *
 * Builds structured mission context from thread metadata and formats
 * it for system prompt injection when dispatching cats to external projects.
 */
import type { DispatchMissionPack } from '@openjiuwen/relay-shared';

export interface ThreadContext {
  title?: string | undefined;
  phase?: string | undefined;
  backlogItemId?: string | undefined;
}

/**
 * Build a structured mission pack from thread metadata.
 * This is injected into the system prompt when dispatching to external projects.
 */
export function buildMissionPack(thread: ThreadContext): DispatchMissionPack {
  return {
    mission: thread.title ?? 'External project task',
    workItem: thread.backlogItemId ?? thread.title ?? 'unspecified',
    phase: thread.phase ?? 'unknown',
    doneWhen: [],
    links: [],
  };
}

/**
 * Format mission pack as a prompt block for system prompt injection.
 */
export function formatMissionPackPrompt(pack: DispatchMissionPack): string {
  const lines = [
    '## Dispatch Mission Context',
    '',
    `mission:    ${pack.mission}`,
    `work_item:  ${pack.workItem}`,
    `phase:      ${pack.phase}`,
  ];

  if (pack.doneWhen.length > 0) {
    lines.push('done_when:');
    for (const criterion of pack.doneWhen) {
      lines.push(`  - ${criterion}`);
    }
  }

  if (pack.links.length > 0) {
    lines.push('links:');
    for (const link of pack.links) {
      lines.push(`  - ${link}`);
    }
  }

  return lines.join('\n');
}
