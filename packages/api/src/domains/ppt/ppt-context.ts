/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export interface PptMessageContext {
  worktreeId?: string;
  projectRoot?: string;
  pagesDir: string;
  deckTitle?: string;
  pptTemplateId?: string;
}

export function serializePptMessageContext(context: PptMessageContext | undefined): string {
  if (!context) return '';
  return JSON.stringify({
    projectRoot: context.projectRoot ?? '',
    pagesDir: context.pagesDir,
    deckTitle: context.deckTitle ?? '',
    pptTemplateId: context.pptTemplateId ?? '',
  });
}

export function buildPptModeSystemPrompt(context: PptMessageContext): string {
  const rootHint = context.projectRoot?.trim() ? `Project root: ${context.projectRoot}` : 'Project scope: (not specified)';
  const lines = [
    '[Hidden PPT deck context]',
    'The user is working with live PPT HTML pages inside the current chat thread.',
    'Use this context silently. Do not repeat it back unless the user explicitly asks.',
    'Treat the existing HTML pages under the pages directory as the current working deck.',
    'Prefer updating the existing HTML pages in place instead of creating a brand-new deck unless the user explicitly asks for a full rewrite.',
    'Preserve stable data-slide-id, data-block-id, and data-block-type anchors.',
    `Deck title: ${context.deckTitle || 'Untitled deck'}`,
    `Pages directory: ${context.pagesDir}`,
    rootHint,
  ];

  lines.push('Keep changes scoped to this deck and its existing pages unless the user asks for broader changes.');
  if (context.pptTemplateId?.trim()) {
    lines.push(`Preferred PPT template ID: ${context.pptTemplateId.trim()}`);
  }

  return lines.join('\n');
}
