/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo } from 'react';
import type { LocalGeneratedFile } from '@/components/cli-output/local-generated-files';
import { FileListItem } from './FileListItem';

interface ArtifactFileListProps {
  artifacts: LocalGeneratedFile[];
  selectedFilePath: string | null;
  onSelect: (path: string) => void;
  /** 文件名包含（不分大小写） */
  filterQuery?: string;
  flattenActions?: boolean;
}

export function ArtifactFileList({
  artifacts,
  selectedFilePath,
  onSelect,
  filterQuery = '',
  flattenActions = false,
}: ArtifactFileListProps) {
  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return artifacts;
    return artifacts.filter((f) => f.name.toLowerCase().includes(q));
  }, [artifacts, filterQuery]);
  if (artifacts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
        <p className="text-[13px] text-gray-400">暂无产物文件</p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-6 text-center">
        <p className="text-[13px] text-[#BFBFBF]">没有匹配的文件</p>
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto px-0.5 py-1">
      {filtered.map((file) => (
        <li key={file.path}>
          <FileListItem
            entry={{ name: file.name, path: file.path, kind: file.kind, isDirectory: false }}
            file={file}
            isActive={selectedFilePath === file.path}
            onClick={onSelect}
            flattenActions={flattenActions}
          />
        </li>
      ))}
    </ul>
  );
}
