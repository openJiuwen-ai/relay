/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export const ACCEPTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/markdown',
  'text/x-markdown',
  'text/plain',
  'text/csv',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.xlsm',
  '.xlsb',
  '.ppt',
  '.pptx',
  '.md',
  '.txt',
  '.csv',
].join(',');

export const SUPPORTED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.ms-excel.sheet.binary.macroenabled.12',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/markdown',
  'text/x-markdown',
  'text/plain',
  'text/csv',
]);

export const SUPPORTED_ATTACHMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'xlsm',
  'xlsb',
  'ppt',
  'pptx',
  'md',
  'txt',
  'csv',
]);

export const UNSUPPORTED_FILE_TYPE_MESSAGE = '该附件类型暂不支持';
export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const FILE_SIZE_EXCEEDED_MESSAGE = '文件大小超过限制，最大支持 100MB';
export const TEXTAREA_MIN_HEIGHT = 70;
export const TEXTAREA_MAX_HEIGHT = 260;
export const MAX_INPUT_LENGTH = 5000;
export const MAX_ATTACHMENT_FILES = 5;
export const MAX_PENDING_QUEUE = 20;
export const SKILL_TOKEN_PREFIX = '[[skill:';
export const SKILL_TOKEN_SUFFIX = ']]';
export const QUICK_ACTION_TOKEN_PREFIX = '[[quick_action:';
export const QUICK_ACTION_TOKEN_SUFFIX = ']]';
export const QUICK_ACTION_BUTTON_CLASS =
  'inline-flex shrink-0 items-center gap-1 rounded-[20px] border border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-1.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)] disabled:cursor-not-allowed disabled:opacity-50';
export const QUICK_ACTION_EXPAND_BUTTON_CLASS =
  'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-panel)] text-[var(--text-label-secondary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)] hover:text-[var(--text-accent)]';
export const QUICK_PROMPT_BUTTON_CLASS =
  'min-w-0 rounded-[16px] border border-[var(--border-default)] bg-[var(--surface-panel)] px-4 py-2 text-left text-[14px] font-normal leading-[22px] text-[var(--text-primary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)]';
export const EXPERT_CARD_BUTTON_CLASS =
  'group min-w-0 rounded-[16px] border border-[var(--border-default)] bg-[var(--surface-panel)] px-4 py-3 text-left transition-colors hover:bg-[var(--overlay-item-hover-bg)] hover:border-[var(--border-accent)]';
export const SKILL_TRIGGER_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-[7px] text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)]';
export const ICON_BUTTON_CLASS =
  'inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-label-secondary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)] hover:text-[var(--text-accent)] disabled:cursor-not-allowed disabled:opacity-30';