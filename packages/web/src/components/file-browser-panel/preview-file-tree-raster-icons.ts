/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { LocalGeneratedFileKind } from '@/components/cli-output/local-generated-files';
import type { FileBrowserEntry } from './file-browser-panel-types';

const TREE = '/images/file-browser-tree' as const;

/** 预览面板「工作产物」「全部文件」列表/树中行内图标（.svg，内嵌原始位图以保持配色）。 */
export function previewFileTreeRasterIconSrc(entry: FileBrowserEntry): string | undefined {
  if (entry.isDirectory) return undefined;
  const base = entry.name.split(/[/\\]/).pop() ?? entry.name;
  if (base.toLowerCase() === '.gitignore') return `${TREE}/gitignore.svg`;

  const byKind: Record<LocalGeneratedFileKind, string> = {
    ppt: `${TREE}/ppt.svg`,
    markdown: `${TREE}/markdown.svg`,
    docx: `${TREE}/word.svg`,
    pdf: `${TREE}/pdf.svg`,
    xlsx: `${TREE}/xlsx.svg`,
    txt: `${TREE}/public-file.svg`,
    html: `${TREE}/code.svg`,
    code: `${TREE}/code.svg`,
    other: `${TREE}/public-file.svg`,
  };
  return byKind[entry.kind];
}
