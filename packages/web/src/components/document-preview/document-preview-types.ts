/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/** General embedded file preview in the secondary pane (not PPT Studio slide workspace). */
export type DocumentPreviewKind = 'markdown' | 'html' | 'docx' | 'xlsx' | 'pdf';

type EmbeddedDocumentPreviewBase = {
  path: string;
  /** Thread project path (`currentProjectPath` style) when resolved */
  projectPath?: string;
  displayName: string;
  threadId: string;
};

export type ActiveDocumentPreview =
  | ({ kind: 'markdown' } & EmbeddedDocumentPreviewBase)
  | ({ kind: 'html' } & EmbeddedDocumentPreviewBase)
  | ({ kind: 'docx' } & EmbeddedDocumentPreviewBase)
  | ({ kind: 'xlsx' } & EmbeddedDocumentPreviewBase)
  | ({ kind: 'pdf' } & EmbeddedDocumentPreviewBase);
