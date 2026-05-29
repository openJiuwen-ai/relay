/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { RefObject } from 'react';
import type { InspirationTemplate } from '../types';
import { buildTemplateMarkdown } from '../constants';
import { Button } from '@/components/shared/Button';
import { MarkdownContent } from '@/components/MarkdownContent';
import { OverflowTooltip } from '@/components/shared/OverflowTooltip';

function ChevronLeftIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={props.className}>
      <path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={props.className}>
      <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface MarkdownEditorProps {
  activeTab: 'persona' | 'collab';
  activeWorkingDraft: string;
  editorSurfaceRef: RefObject<HTMLDivElement | null>;
  editorTextareaRef: RefObject<HTMLTextAreaElement | null>;
  isPersonaEmpty: boolean;
  onApplyTemplate: (templateId: string) => void;
  onAfterApplyTemplate?: () => void;
  onDraftChange: (value: string) => void;
  onNextTemplatePage: () => void;
  onPrevTemplatePage: () => void;
  templatePage: number;
  templatePageCount: number;
  visibleTemplates: InspirationTemplate[];
  appliedTemplateKey?: number;
}

export function MarkdownEditor({
  activeTab,
  activeWorkingDraft,
  editorSurfaceRef,
  editorTextareaRef,
  isPersonaEmpty,
  onApplyTemplate,
  onAfterApplyTemplate,
  onDraftChange,
  onNextTemplatePage,
  onPrevTemplatePage,
  templatePage,
  templatePageCount,
  visibleTemplates,
  appliedTemplateKey,
}: MarkdownEditorProps) {
  const showTemplates = activeTab === 'persona';

  return (
    <div
      data-testid={isPersonaEmpty ? 'agent-tab-empty-editor' : 'agent-tab-editor'}
      className="relative flex min-h-0 flex-1 flex-col p-4 h-full"
    >
      <div ref={editorSurfaceRef as RefObject<HTMLDivElement>} className="min-h-0 flex-1">
        <textarea
          ref={editorTextareaRef as RefObject<HTMLTextAreaElement>}
          value={activeWorkingDraft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="请输入你的智能体人格、语气、规则描述，或选择下方模板自动生成"
          className="ui-textarea ui-textarea-plain block h-full min-h-0 w-full resize-none overflow-y-auto rounded-none text-[12px] leading-7"
          data-testid="agent-tab-textarea"
        />
      </div>

      {showTemplates ? (
        <div className={`${isPersonaEmpty ? 'mt-4' : 'mt-4'} flex shrink-0 flex-col ${isPersonaEmpty ? '' : 'hidden'}`}>
          <div className="mx-auto w-full">
            <div className="mb-2 flex items-center justify-between gap-3 text-[12px] text-[var(--text-muted)]">
              <span>灵魂模板</span>
              {templatePageCount > 1 ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onPrevTemplatePage}
                    disabled={templatePage === 0}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] transition enabled:hover:bg-[var(--surface-card-muted)] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="上一页模板"
                  >
                    <ChevronLeftIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onNextTemplatePage}
                    disabled={templatePage >= templatePageCount - 1}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] transition enabled:hover:bg-[var(--surface-card-muted)] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="下一页模板"
                  >
                    <ChevronRightIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {visibleTemplates.map((template) => (
                <OverflowTooltip
                  key={`${template.id}-${appliedTemplateKey}`}
                  content={template.title}
                  forceShow
                  placement="top"
                  className="block"
                  customContent={
                    <div className="w-[320px] max-w-[calc(100vw-24px)] p-4" data-template-preview-tooltip="1">
                      <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{template.title}</h3>
                      <div className="mt-3 min-h-0 max-h-[260px] overflow-y-auto">
                        <MarkdownContent
                          content={buildTemplateMarkdown(template)}
                          className="text-[12px] leading-[1.55] text-[var(--text-secondary)] [&_h2]:mb-3 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:text-[var(--text-primary)] [&_h3]:mb-2 [&_h3]:text-[12px] [&_h3]:font-semibold [&_h3]:text-[var(--text-primary)] [&_ul]:mb-3 [&_ul]:space-y-1.5"
                          disableCommandPrefix
                        />
                      </div>
                      <div className="mt-4 flex justify-end">
                        <Button variant="major" onClick={() => { onApplyTemplate(template.id); onAfterApplyTemplate?.(); }}>
                          插入模板
                        </Button>
                      </div>
                    </div>
                  }
                >
                  <button
                    type="button"
                    className="h-[98px] w-full rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-panel)] px-4 py-4 text-left transition-[border-color,background-color,box-shadow] hover:border-[var(--card-hover-border)] hover:bg-[var(--card-hover-bg)] hover:shadow-[var(--card-hover-shadow)]"
                  >
                    <div className="text-[14px] font-semibold text-[var(--text-primary)]">{template.title}</div>
                    <div className="mt-2 line-clamp-2 text-[12px] leading-5 text-[var(--text-muted)]">{template.description}</div>
                  </button>
                </OverflowTooltip>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
