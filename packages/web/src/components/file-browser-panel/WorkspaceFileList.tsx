/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PreviewPanelFolderClosedIcon, PreviewPanelFolderOpenIcon } from './file-browser-folder-icons';
import { FileListItem } from './FileListItem';
import type { FileBrowserEntry } from './file-browser-panel-types';
import { useWorkspaceFiles } from './useWorkspaceFiles';

function normPathFs(p: string): string {
  return p.replace(/\\/g, '/');
}

/** 关键字过滤：命中文件/文件夹名时保留结点及必要的上级目录 */
function filterWorkspaceEntries(entries: FileBrowserEntry[], query: string, workspaceRoot: string): FileBrowserEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  const rootTrim = normPathFs(workspaceRoot).replace(/[/\\]+$/, '');
  const matched = new Set<string>();

  function addSubtree(dirNorm: string) {
    for (const o of entries) {
      const op = normPathFs(o.path);
      if (op.startsWith(`${dirNorm}/`)) matched.add(op);
    }
  }

  function addAncestors(normPathStr: string) {
    let p = normPathStr;
    while (p.length > rootTrim.length) {
      const i = p.lastIndexOf('/');
      if (i < rootTrim.length || i <= 0) break;
      p = p.slice(0, i);
      matched.add(p);
    }
  }

  for (const e of entries) {
    if (!e.name.toLowerCase().includes(q)) continue;
    const np = normPathFs(e.path);
    matched.add(np);
    if (e.isDirectory) addSubtree(np);
    addAncestors(np);
  }

  return entries.filter((entry) => matched.has(normPathFs(entry.path)));
}

interface WorkspaceFileListProps {
  projectPath: string;
  selectedFilePath: string | null;
  onSelect: (path: string) => void;
  filterQuery?: string;
  flattenActions?: boolean;
}

interface TreeNodeInnerProps {
  entry: FileBrowserEntry;
  depth: number;
  allEntries: FileBrowserEntry[];
  expandedDirs: Set<string>;
  selectedFilePath: string | null;
  onToggleDir: (path: string) => void;
  onSelect: (path: string) => void;
  flattenActions?: boolean;
}

function TreeFolderChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 text-[#8C8C8C] transition-transform duration-150 ease-out ${expanded ? 'rotate-0' : '-rotate-90'}`}
      aria-hidden
    >
      <title>{expanded ? '收起' : '展开'}</title>
      <path d="M3 6l4 4 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TreeFolderDecorationIcon({ expanded }: { expanded: boolean }) {
  return expanded ? <PreviewPanelFolderOpenIcon /> : <PreviewPanelFolderClosedIcon />;
}

const TREE_DEPTH_STEP_PX = 20;
const TREE_EDGE_PAD_PX = 8;

/**
 * Renders a two-level expandable file tree for the workspace.
 * Directories can be expanded/collapsed; files trigger onSelect.
 */
function TreeNode({
  entry,
  depth,
  allEntries,
  expandedDirs,
  selectedFilePath,
  onToggleDir,
  onSelect,
  flattenActions,
}: TreeNodeInnerProps) {
  const rowPadLeft = TREE_EDGE_PAD_PX + depth * TREE_DEPTH_STEP_PX;

  if (!entry.isDirectory) {
    return (
      <FileListItem
        entry={entry}
        isActive={selectedFilePath === entry.path}
        depth={depth}
        variant="tree"
        onClick={onSelect}
        flattenActions={flattenActions}
      />
    );
  }

  const isExpanded = expandedDirs.has(entry.path);
  const children = allEntries.filter((e) => {
    if (e.path === entry.path) return false;
    const parent = e.path.replace(/[\\/][^\\/]+$/, '');
    return parent === entry.path;
  });

  return (
    <>
      <button
        type="button"
        title={entry.path}
        onClick={() => onToggleDir(entry.path)}
        className={`group flex min-h-[40px] w-full items-center gap-2 rounded-[4px] py-2 pr-2 text-left text-[13px] leading-[20px] text-[#434343] transition-colors hover:bg-[#F7F7F9]`}
        style={{ paddingLeft: rowPadLeft }}
      >
        <span className="flex w-[18px] shrink-0 justify-center">
          <TreeFolderChevronIcon expanded={isExpanded} />
        </span>
        <span className="shrink-0 text-[#737373]">
          <TreeFolderDecorationIcon expanded={isExpanded} />
        </span>
        <span className="min-w-0 truncate font-normal">{entry.name}</span>
      </button>
      {isExpanded && children.length > 0 ? (
        <ul role="presentation" className="relative mt-0 list-none">
          {children.map((child, index) => {
            const isFirst = index === 0;
            const isLast = index === children.length - 1;
            return (
              <li key={child.path} className="relative">
                {/* 垂直连线 */}
                <div
                  className="absolute z-10 border-l border-[#E5E5E5] pointer-events-none"
                  style={{
                    left: `${17 + depth * TREE_DEPTH_STEP_PX}px`,
                    top: isFirst ? '-12px' : '0',
                    bottom: isLast ? 'auto' : '0',
                    height: isLast ? (isFirst ? '32px' : '20px') : 'auto',
                  }}
                />
                {/* 水平分支线 */}
                <div
                  className="absolute top-[20px] z-10 h-px bg-[#E5E5E5] pointer-events-none"
                  style={{
                    left: `${17 + depth * TREE_DEPTH_STEP_PX}px`,
                    width: child.isDirectory ? '11px' : '25px',
                  }}
                />
                <TreeNode
                  entry={child}
                  depth={depth + 1}
                  allEntries={allEntries}
                  expandedDirs={expandedDirs}
                  selectedFilePath={selectedFilePath}
                  onToggleDir={onToggleDir}
                  onSelect={onSelect}
                  flattenActions={flattenActions}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

export function WorkspaceFileList({
  projectPath,
  selectedFilePath,
  onSelect,
  filterQuery = '',
  flattenActions = false,
}: WorkspaceFileListProps) {
  const { entries, status, reload } = useWorkspaceFiles(projectPath);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const filteredEntries = useMemo(
    () => filterWorkspaceEntries(entries, filterQuery, projectPath),
    [entries, filterQuery, projectPath],
  );

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  useEffect(() => {
    const q = filterQuery.trim();
    if (!q) return;
    const dirs = filteredEntries.filter((e) => e.isDirectory).map((e) => e.path);
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      for (const d of dirs) next.add(d);
      return next;
    });
  }, [filterQuery, filteredEntries]);

  if (status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-[13px] text-[#BFBFBF]">加载中...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-[13px] text-[#BFBFBF]">加载文件列表失败</p>
        <button type="button" onClick={reload} className="text-[12px] text-blue-500 hover:underline">
          重试
        </button>
      </div>
    );
  }

  if (status === 'idle' || !projectPath || projectPath === 'default') {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-[13px] text-[#BFBFBF]">未找到工作区</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-[13px] text-[#BFBFBF]">工作区暂无文件</p>
      </div>
    );
  }

  if (filteredEntries.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-6 text-center">
        <p className="text-[13px] text-[#BFBFBF]">没有匹配的条目</p>
      </div>
    );
  }

  const topLevel = filteredEntries.filter((e) => {
    const norm = normPathFs(e.path);
    const base = normPathFs(projectPath).replace(/[/\\]+$/, '');
    const rel = norm.startsWith(base) ? norm.slice(base.length).replace(/^\/+/, '') : norm;
    return rel.length > 0 && !rel.includes('/');
  });

  return (
    <ul className="list-none flex-1 overflow-y-auto py-1 pl-2 pr-0.5">
      {topLevel.map((entry) => (
        <li key={entry.path}>
          <TreeNode
            entry={entry}
            depth={0}
            allEntries={filteredEntries}
            expandedDirs={expandedDirs}
            selectedFilePath={selectedFilePath}
            onToggleDir={toggleDir}
            onSelect={onSelect}
            flattenActions={flattenActions}
          />
        </li>
      ))}
    </ul>
  );
}
