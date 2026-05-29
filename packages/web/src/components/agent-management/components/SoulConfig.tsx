/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { EmptyDataState } from '@/components/shared/EmptyDataState';
import { MarkdownContent } from '@/components/MarkdownContent';
import { MarkdownEditorWrapper } from './MarkdownEditorWrapper';

interface SoulConfigProps {
  personality?: string;
  agentId: string | null;
  readOnly?: boolean;
  muted?: boolean;
  onDraftChange?: (value: string) => void;
  showTitle?: boolean;
}

export function SoulConfig({ personality, agentId, readOnly = false, muted = true, onDraftChange, showTitle = false }: SoulConfigProps) {
  if (!agentId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <EmptyDataState title="当前没有可展示的智能体" />
      </div>
    );
  }

  const titleElement = showTitle ? <h2 className="mb-4 text-[16px] font-semibold text-[var(--text-primary)]">灵魂配置</h2> : null;

  if (readOnly) {
    return (
      <div>
        {titleElement}
        <div className={`h-[480px] overflow-auto rounded-lg border border-[var(--border-default)] p-6${muted ? ' bg-[var(--surface-card-muted)]' : ''}`}>
          <MarkdownContent
            content={personality ?? ''}
            className={`max-w-none text-[14px] leading-7 ${muted ? 'text-[var(--text-secondary)] opacity-80' : 'text-[var(--text-primary)]'} [&_h1]:mb-4 [&_h1]:text-[18px] [&_h1]:font-bold ${muted ? '[&_h1]:text-[var(--text-secondary)]' : ''} [&_h2]:mb-3 [&_h2]:text-[16px] [&_h2]:font-semibold ${muted ? '[&_h2]:text-[var(--text-secondary)]' : ''} [&_h3]:mb-2 [&_h3]:text-[14px] [&_h3]:font-semibold ${muted ? '[&_h3]:text-[var(--text-secondary)]' : ''} [&_p]:mb-3 [&_ul]:mb-3 [&_ol]:mb-3 [&_li]:mb-1`}
            disableCommandPrefix
          />
        </div>
      </div>
    );
  }

  if (!personality?.trim()) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center">
        {titleElement}
        <div className="h-[480px] w-full rounded-lg border border-[var(--border-default)] p-6 text-center">
          <EmptyDataState title="暂无内容" />
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
            请编辑灵魂配置内容，定义智能体的人格、行为准则与底线
          </p>
        </div>
      </div>
    );
  }

  if (!onDraftChange) {
    return (
      <div>
        {titleElement}
        <div className="h-[480px] overflow-auto rounded-lg border border-[var(--border-default)] p-6">
          <MarkdownContent
            content={personality ?? ''}
            className="max-w-none text-[14px] leading-7 text-[var(--text-primary)] [&_h1]:mb-4 [&_h1]:text-[18px] [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-[14px] [&_h3]:font-semibold [&_p]:mb-3 [&_ul]:mb-3 [&_ol]:mb-3 [&_li]:mb-1"
            disableCommandPrefix
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      {titleElement}
      <MarkdownEditorWrapper
        activeWorkingDraft={personality}
        onDraftChange={onDraftChange}
      />
    </div>
  );
}
