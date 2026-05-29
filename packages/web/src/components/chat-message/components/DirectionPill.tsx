/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentData } from '@/hooks/useAgentData';
import type { DirectionInfo } from '@/lib/parse-direction';

interface DirectionPillProps {
  direction: DirectionInfo;
  getAgentById: (id: string) => AgentData | undefined;
}

/**
 * F098: Direction pill badge — shows "→ @智能体" in breed color.
 * Placed in ChatMessage header row, after timestamp.
 */
export function DirectionPill({ direction, getAgentById }: DirectionPillProps) {
  const labels = direction.targets.map((target) => {
    if (direction.type === 'crossPost') return target;
    const cat = getAgentById(target);
    return cat ? `@${cat.displayName}` : `@${target}`;
  });
  const text = `${direction.arrow} ${labels.join(' + ')}`;

  // Breed color from first target cat (fallback to ragdoll purple)
  const firstCat = direction.type !== 'crossPost' ? getAgentById(direction.targets[0]) : undefined;
  const color = firstCat?.color.primary ?? '#9B7EBD';

  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {text}
    </span>
  );
}
