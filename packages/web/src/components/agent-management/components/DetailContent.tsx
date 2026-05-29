/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentData } from '@/hooks/useAgentData';
import { OverflowTooltip } from '@/components/shared/OverflowTooltip';

export interface DetailContentProps {
  agent: AgentData;
}

export function DetailContent({ agent }: DetailContentProps) {
  const modelText = agent.defaultModel || '未配置模型';

  return (
    <div className="flex flex-col gap-4 pb-8">
      <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">基础信息</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="min-w-0 flex flex-col gap-2">
          <h2 className="text-[12px] font-medium text-[var(--text-muted)]">描述</h2>
          <OverflowTooltip
            content={agent.roleDescription || '暂无描述'}
            className="block w-full min-w-0"
            placement="top"
          >
            <span className="block min-w-0 truncate text-[14px] text-[var(--text-primary)]">
              {agent.roleDescription || '暂无描述'}
            </span>
          </OverflowTooltip>
        </div>

        <div className="min-w-0 flex flex-col gap-2">
          <h2 className="text-[12px] font-medium text-[var(--text-muted)]">模型</h2>
          <p className="break-words text-[14px] text-[var(--text-primary)]">{modelText}</p>
        </div>
      </div>
    </div>
  );
}