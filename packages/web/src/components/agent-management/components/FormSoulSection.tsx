/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useMemo, useState } from 'react';
import type { AgentData } from '@/hooks/useAgentData';
import { MaskIcon } from '@/components/shared/MaskIcon';
import { PromptSelectionModal, type PromptSelectionItem } from '@/components/PromptSelectionModal';
import { MarkdownEditorWrapper } from './MarkdownEditorWrapper';
import { SoulConfig } from './SoulConfig';
import { INSPIRATION_TEMPLATES, buildTemplateMarkdown } from '../constants';

const PROMPT_SELECTION_ITEMS: PromptSelectionItem[] = INSPIRATION_TEMPLATES.map((template) => ({
  id: template.id,
  title: template.title,
  description: template.description,
  content: buildTemplateMarkdown(template),
}));

interface FormSoulSectionProps {
  activeWorkingDraft: string;
  editingAgent?: AgentData | null;
  onDraftChange: (value: string) => void;
}

export function FormSoulSection({ activeWorkingDraft, editingAgent, onDraftChange }: FormSoulSectionProps) {
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  const initialSelectedId = useMemo(() => PROMPT_SELECTION_ITEMS[0]?.id ?? null, []);
  const readOnly = editingAgent?.source === 'seed';

  const handleApplyTemplate = useCallback(
    (templateId: string) => {
      const template = INSPIRATION_TEMPLATES.find((item) => item.id === templateId);
      if (!template) return;

      const markdown = buildTemplateMarkdown(template);
      const existing = activeWorkingDraft.trim();
      onDraftChange(existing ? `${existing}\n\n${markdown}` : markdown);
      setTemplateModalOpen(false);
    },
    [activeWorkingDraft, onDraftChange],
  );

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between gap-4 pb-4">
        <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">灵魂配置</h2>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => setTemplateModalOpen(true)}
            className="inline-flex h-[18px] shrink-0 items-center gap-1 text-[12px] text-[var(--text-primary)] transition hover:underline hover:underline-offset-2"
            data-testid="soul-template-trigger"
          >
            <MaskIcon name="template" className="h-3.5 w-3.5" />
            <span>模板</span>
          </button>
        ) : null}
      </div>

      {readOnly ? (
        <SoulConfig personality={editingAgent?.personality} agentId={editingAgent?.id ?? null} readOnly />
      ) : (
        <>
          <div className="h-[480px] rounded-lg border border-[var(--border-default)]">
            <MarkdownEditorWrapper activeWorkingDraft={activeWorkingDraft} onDraftChange={onDraftChange} />
          </div>

          <PromptSelectionModal
            open={templateModalOpen}
            items={PROMPT_SELECTION_ITEMS}
            title="灵魂模板"
            searchPlaceholder="输入关键字搜索"
            cancelLabel="取消"
            confirmLabel="插入"
            initialSelectedId={initialSelectedId}
            onClose={() => setTemplateModalOpen(false)}
            onConfirm={(item) => handleApplyTemplate(item.id)}
          />
        </>
      )}
    </div>
  );
}
