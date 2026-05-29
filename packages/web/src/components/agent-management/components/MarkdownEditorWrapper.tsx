/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useRef, useState } from 'react';
import { MarkdownEditor } from './MarkdownEditor';
import { INSPIRATION_TEMPLATES, TEMPLATE_PAGE_SIZE, buildTemplateMarkdown } from '../constants';

interface MarkdownEditorWrapperProps {
  activeWorkingDraft: string;
  onDraftChange: (value: string) => void;
}

export function MarkdownEditorWrapper({
  activeWorkingDraft,
  onDraftChange,
}: MarkdownEditorWrapperProps) {
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [templatePage, setTemplatePage] = useState(0);
  const [appliedTemplateKey, setAppliedTemplateKey] = useState(0);

  const templatePageCount = Math.max(1, Math.ceil(INSPIRATION_TEMPLATES.length / TEMPLATE_PAGE_SIZE));
  const visibleTemplates = INSPIRATION_TEMPLATES.slice(
    templatePage * TEMPLATE_PAGE_SIZE,
    templatePage * TEMPLATE_PAGE_SIZE + TEMPLATE_PAGE_SIZE,
  );

  const handleApplyTemplate = useCallback(
    (templateId: string) => {
      const template = INSPIRATION_TEMPLATES.find((t) => t.id === templateId);
      if (!template) return;

      const markdown = buildTemplateMarkdown(template);
      const existing = activeWorkingDraft.trim();
      onDraftChange(existing ? `${existing}\n\n${markdown}` : markdown);
      setAppliedTemplateKey((k) => k + 1);
    },
    [activeWorkingDraft, onDraftChange],
  );

  const handleAfterApplyTemplate = useCallback(() => {
    setAppliedTemplateKey((k) => k + 1);
  }, []);

  return (
    <MarkdownEditor
      activeTab="persona"
      activeWorkingDraft={activeWorkingDraft}
      editorSurfaceRef={editorSurfaceRef}
      editorTextareaRef={editorTextareaRef}
      isPersonaEmpty={!activeWorkingDraft.trim()}
      onApplyTemplate={handleApplyTemplate}
      onAfterApplyTemplate={handleAfterApplyTemplate}
      onDraftChange={onDraftChange}
      onNextTemplatePage={() => setTemplatePage((p) => Math.min(templatePageCount - 1, p + 1))}
      onPrevTemplatePage={() => setTemplatePage((p) => Math.max(0, p - 1))}
      templatePage={templatePage}
      templatePageCount={templatePageCount}
      visibleTemplates={visibleTemplates}
      appliedTemplateKey={appliedTemplateKey}
    />
  );
}
