/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentData } from '@/hooks/useAgentData';

export interface CardProps {
  agent: AgentData;
  onClick: (agentId: string) => void;
  onEdit?: (agentId: string) => void;
  onDelete?: (agentId: string) => void;
}

function getNameInitial(name?: string): string {
  if (!name) return '智';
  return name.slice(0, 1).toUpperCase();
}

function getNameInitialTheme(name: string): { background: string; borderColor: string; textColor: string } {
  const colors = [
    { bg: '#FFF4E6', border: '#FFE0B2', text: '#E65100' },
    { bg: '#E3F2FD', border: '#BBDEFB', text: '#1565C0' },
    { bg: '#F3E5F5', border: '#E1BEE7', text: '#7B1FA2' },
    { bg: '#E8F5E9', border: '#C8E6C9', text: '#2E7D32' },
    { bg: '#FFF3E0', border: '#FFE0B2', text: '#E65100' },
    { bg: '#E0F7FA', border: '#B2EBF2', text: '#00838F' },
    { bg: '#FCE4EC', border: '#F8BBD0', text: '#C2185B' },
    { bg: '#F1F8E9', border: '#DCEDC8', text: '#558B2F' },
  ];
  const index = name.charCodeAt(0) % colors.length;
  return {
    background: colors[index].bg,
    borderColor: colors[index].border,
    textColor: colors[index].text,
  };
}

function Avatar({ agent }: { agent: AgentData }) {
  const avatar = agent.avatar?.trim();
  if (avatar && (avatar.startsWith('/uploads/') || avatar.startsWith('/avatars/') || /^https?:\/\//.test(avatar))) {
    return (
      // biome-ignore lint/performance/noImgElement: runtime upload URL
      <img src={avatar} alt={agent.displayName} className="h-12 w-12 shrink-0 rounded-full object-cover" />
    );
  }

  const name = agent.displayName ?? agent.name ?? '智';
  const theme = getNameInitialTheme(name);

  return (
    <div
      aria-hidden="true"
      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border shadow-sm"
      style={{ background: theme.background, borderColor: theme.borderColor }}
    >
      <span className="select-none text-xl font-bold leading-none tracking-[0.02em]" style={{ color: theme.textColor }}>
        {getNameInitial(name)}
      </span>
    </div>
  );
}

export function Card({ agent, onClick, onEdit, onDelete }: CardProps) {
  const modelText = agent.defaultModel || '未配置模型';
  const sourceText =
    agent.source === 'seed' ? '预置' : agent.creationSource === 'experts-plaza' ? '智能体广场' : '用户创建';

  return (
    <article
      className="ui-card ui-card-hover group relative flex h-[196px] cursor-pointer flex-col rounded-[16px] border border-[#e6e6e6] bg-white p-6"
      onClick={() => onClick(agent.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(agent.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`查看智能体 ${agent.displayName}`}
    >
      <div className="mb-4 flex items-start gap-3">
        <Avatar agent={agent} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{agent.displayName}</h3>
          <p className="mt-1 truncate text-[12px] text-[var(--text-muted)]">{modelText}</p>
        </div>
      </div>

      {agent.roleDescription ? (
        <p className="line-clamp-2 mb-4 flex-1 text-[12px] leading-relaxed text-[var(--text-secondary)]">{agent.roleDescription}</p>
      ) : (
        <p className="line-clamp-2 mb-4 flex-1 text-[12px] leading-relaxed text-[var(--text-muted)]">暂无描述</p>
      )}

      <div
        className={`mt-auto flex items-center justify-between text-[12px] text-[var(--text-muted)] transition-opacity ${
          onEdit || onDelete ? 'group-hover:opacity-0 group-hover:pointer-events-none group-focus-within:opacity-0 group-focus-within:pointer-events-none' : ''
        }`}
      >
        <span>来源：{sourceText}</span>
      </div>

      <div
        className={`absolute bottom-6 left-6 right-6 flex items-center gap-4 transition-opacity ${
          onEdit || onDelete ? 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto' : ''
        }`}
      >
        {onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(agent.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onEdit(agent.id);
              }
            }}
            className="bg-transparent p-0 text-[14px] font-normal text-[var(--text-accent)] hover:underline"
          >
            编辑
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(agent.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onDelete(agent.id);
              }
            }}
            className="bg-transparent p-0 text-[14px] font-normal text-[var(--text-accent)] hover:underline"
          >
            删除
          </button>
        )}
      </div>
    </article>
  );
}