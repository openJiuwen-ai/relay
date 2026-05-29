/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useMemo } from 'react';
import { Dropdown } from '@/components/shared/Dropdown';

import { LOCAL_FILE_KIND_UI } from '@/components/cli-output/cli-output-block/CliOutputFileKindIcons';
import type { LocalGeneratedFile } from '@/components/cli-output/local-generated-files';
import { PreviewPanelFolderClosedIcon, PreviewPanelFolderOpenIcon } from './file-browser-folder-icons';
import type { FileBrowserEntry } from './file-browser-panel-types';
import { openLocalProjectFile, openLocalProjectFolder, resolveFolderPath } from './file-browser-utils';
import { previewFileTreeRasterIconSrc } from './preview-file-tree-raster-icons';

/** 单层缩进步长（与工作区树对齐） */
const TREE_INDENT_PX = 20;
const TREE_BASE_PAD_PX = 8;

interface FileListItemProps {
  entry: FileBrowserEntry;
  file?: LocalGeneratedFile;
  isActive: boolean;
  depth?: number;
  onClick: (path: string) => void;
  /** flat：产物扁平列表；tree：与工作区文件夹行对齐（预留 chevron 列） */
  variant?: 'tree' | 'list';
  /** 是否平铺显示操作按钮（如“打开文件”、“打开目录”），仅在产物列表/窄屏模式下使用 */
  flattenActions?: boolean;
}

function formatArtifactDate(timestamp?: number): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${min}`;
}

export function FileListItem({
  entry,
  file,
  isActive,
  depth = 0,
  onClick,
  variant = 'list',
  flattenActions = false,
}: FileListItemProps) {
  const uiConfig = LOCAL_FILE_KIND_UI[entry.kind];
  const Icon = uiConfig.Icon;
  const rasterSrc = previewFileTreeRasterIconSrc(entry);

  const isTree = variant === 'tree';
  const isList = variant === 'list';
  const paddingLeft = isTree ? TREE_BASE_PAD_PX + depth * TREE_INDENT_PX : 10 + depth * 14;
  /** chevron 列宽，与同目录文件夹行的 chevron 容器一致 */
  const treeChevronReserveClass = 'w-[18px] shrink-0';

  const handleOpenFolder = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    void openLocalProjectFolder(resolveFolderPath(entry.path));
  }, [entry.path]);

  const handleOpenFile = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    void openLocalProjectFile(entry.path);
  }, [entry.path]);

  const dropdownOptions = useMemo(() => [
    {
      label: '默认应用打开',
      icon: <img src="/images/file-browser-tree/public-file.svg" alt="" aria-hidden className="size-4 shrink-0" />,
      onClick: handleOpenFile,
    },
    {
      label: '在文件夹中显示',
      icon: (
        <span className="flex size-4 items-center justify-center text-[#8C8C8C]">
          <PreviewPanelFolderOpenIcon width={16} height={16} />
        </span>
      ),
      onClick: handleOpenFolder,
    },
  ], [handleOpenFile, handleOpenFolder]);

  return (
    <div
      className={`group relative flex w-full items-center rounded-[4px] ${isActive ? 'bg-[#F0F4FF]' : ''} ${
        isList ? 'min-h-[52px]' : 'min-h-[40px]'
      }`}
    >
      <button
        type="button"
        title={entry.path}
        onClick={() => onClick(entry.path)}
        className={`flex w-full items-center gap-2 rounded-[4px] py-2 text-left text-[13px] leading-[20px] transition-colors ${
          isActive ? 'text-[#1F1F1F]' : 'text-[#434343] hover:bg-[#F7F7F9]'
        } ${isList ? 'min-h-[52px]' : 'min-h-[40px]'} ${flattenActions ? 'pr-[68px]' : 'pr-[32px]'}`}
        style={{ paddingLeft }}
      >
        {isTree ? <span className={treeChevronReserveClass} aria-hidden /> : null}
        <span className={`shrink-0 ${entry.isDirectory ? 'text-[#737373]' : ''}`}>
          {entry.isDirectory ? (
            <PreviewPanelFolderClosedIcon />
          ) : rasterSrc ? (
            <img
              src={rasterSrc}
              alt=""
              className="size-4 shrink-0 object-contain"
              width={16}
              height={16}
              draggable={false}
            />
          ) : (
            <Icon width={16} height={16} />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-[2px]">
          <span className="min-w-0 truncate">{entry.name}</span>
          {isList && file?.fallbackGeneratedAt ? (
            <span className="truncate text-[12px] leading-[18px] text-[#8C8C8C]">
              {formatArtifactDate(file.fallbackGeneratedAt)}
            </span>
          ) : null}
        </div>
      </button>

      {flattenActions ? (
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={handleOpenFile}
            className="flex size-8 items-center justify-center rounded-md text-[#8C8C8C] transition-colors hover:bg-[rgba(0,0,0,0.06)] hover:text-[#434343]"
            title="默认应用打开"
          >
            <img src="/images/file-browser-tree/public-file.svg" alt="" aria-hidden className="size-4 shrink-0" />
          </button>
          <button
            type="button"
            onClick={handleOpenFolder}
            className="flex size-8 items-center justify-center rounded-md text-[#8C8C8C] transition-colors hover:bg-[rgba(0,0,0,0.06)] hover:text-[#434343]"
            title="在文件夹中显示"
          >
            <PreviewPanelFolderOpenIcon width={16} height={16} />
          </button>
        </div>
      ) : (
        <Dropdown
          align="right"
          menuWidth={180}
          menuItemClassName="flex h-8 w-full items-center gap-2 px-3 text-left text-sm text-[#191919] transition-colors hover:bg-[#F5F5F7]"
          trigger={
            <button
              type="button"
              className={`absolute right-2 top-1/2 flex size-6 shrink-0 -translate-y-1/2 items-center justify-center rounded-md text-[#8C8C8C] transition-colors hover:bg-[rgba(0,0,0,0.06)] hover:text-[#434343] ${
                isActive ? 'opacity-100' : 'opacity-0 hover:opacity-100 group-hover:opacity-100'
              }`}
              title="更多"
              aria-label="更多"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <circle cx="2.5" cy="7" r="1.5" />
                <circle cx="7" cy="7" r="1.5" />
                <circle cx="11.5" cy="7" r="1.5" />
              </svg>
            </button>
          }
          options={dropdownOptions}
        />
      )}
    </div>
  );
}
