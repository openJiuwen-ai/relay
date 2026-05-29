/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { TaskProgressState } from '@/stores/chat-types';

export function buildContinueMessage(agentId: string, progress: TaskProgressState): string {
  const tasks = progress.tasks ?? [];
  const remaining = tasks.filter((t) => t.status !== 'completed');

  const lines: string[] = [];
  lines.push(`@${agentId} 🔁 继续上次任务（已中断，上次 checklist 见下）`);
  lines.push('');

  const render = (label: string, list: typeof tasks) => {
    if (list.length === 0) return;
    lines.push(`${label}:`);
    for (const t of list) {
      const mark = t.status === 'completed' ? '[x]' : '[ ]';
      lines.push(`- ${mark} ${t.subject}`);
    }
    lines.push('');
  };

  render('未完成', remaining);
  render('全部任务', tasks);

  lines.push('请从“未完成”项继续推进；如计划需要调整，也请直接更新 checklist。');
  return lines.join('\n');
}
