/*
 * *
 *  Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { useMemo } from 'react';
import { parsePromptTemplate, type ParsedPrompt } from '@/utils/promptParser';

/**
 * Hook to parse prompt template into blocks
 */
export function usePromptBlocks(template: string | null): ParsedPrompt | null {
  return useMemo(() => {
    if (!template) return null;
    return parsePromptTemplate(template);
  }, [template]);
}

/**
 * Get file type icon based on file extension
 */
export function getFileTypeIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'pdf') return '/icons/files-pdf.svg';
  if (ext === 'doc' || ext === 'docx') return '/icons/files-docx.svg';
  if (ext === 'xls' || ext === 'xlsx' || ext === 'xlsm' || ext === 'xlsb') return '/icons/files-xlsx.svg';
  if (ext === 'ppt' || ext === 'pptx') return '/icons/files-ppt.svg';
  if (ext === 'md') return '/icons/file-md.svg';
  if (ext === 'csv') return '/icons/files-csv.svg';
  if (ext === 'txt' || ext === 'text') return '/icons/files-txt.svg';
  if (ext === 'html' || ext === 'htm') return '/icons/file-html.svg';
  if (ext === 'py' || ext === 'python') return '/icons/file-py.svg';
  if (ext === 'json') return '/icons/file-json.svg';
  if (ext === 'ini' || ext === 'cfg' || ext === 'conf') return '/icons/file-ini.svg';
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh') return '/icons/file-sh.svg';
  if (ext === 'gitignore') return '/icons/file-gitignore.svg';
  if (ext === 'zip' || ext === 'rar' || ext === '7z' || ext === 'tar' || ext === 'gz') return '/icons/file-zip.svg';

  return '/icons/file.svg';
}