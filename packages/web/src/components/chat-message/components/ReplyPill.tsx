/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { AgentData } from '@/hooks/useAgentData';
import { useCoCreatorConfig } from '@/hooks/useCoCreatorConfig';

interface ReplyPillProps {
  replyPreview: { senderAgentId: string | null; content: string; deleted?: true };
  replyToId: string;
  getAgentById: (id: string) => AgentData | undefined;
}

/**
 * F121: Reply pill badge — shows "↩ @智能体名: 摘要" in breed color.
 * DirectionPill 同款药丸风格，click scrolls to original message.
 */
export function ReplyPill({ replyPreview, replyToId, getAgentById }: ReplyPillProps) {
  const coCreator = useCoCreatorConfig();
  const { senderAgentId, content, deleted } = replyPreview;

  const cat = senderAgentId ? getAgentById(senderAgentId) : undefined;
  const senderLabel = deleted ? '' : cat ? `@${cat.displayName}` : senderAgentId ? `@${senderAgentId}` : coCreator.name;
  const previewText = deleted ? '消息已删除' : content;
  const color = cat?.color.primary ?? '#9B7EBD';

  const handleClick = () => {
    const target = document.querySelector(`[data-message-id="${CSS.escape(replyToId)}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('ring-2', 'ring-offset-1');
    setTimeout(() => target.classList.remove('ring-2', 'ring-offset-1'), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap max-w-[200px] truncate cursor-pointer hover:opacity-80 transition-opacity"
      style={{ backgroundColor: `${color}20`, color }}
      title={deleted ? '消息已删除' : `${senderLabel}: ${content}`}
    >
      ↩ {senderLabel}
      {senderLabel && !deleted ? ': ' : ''}
      {previewText}
    </button>
  );
}
