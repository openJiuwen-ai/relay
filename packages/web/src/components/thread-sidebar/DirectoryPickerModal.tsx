/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatAgentName, useAgentData } from '@/hooks/useAgentData';
import { apiFetch } from '@/utils/api-client';
import { AgentSelector } from './AgentSelector';
import { DirectoryBrowser } from './DirectoryBrowser';
import { projectDisplayName } from './thread-utils';

/** F33: Session binding passed alongside thread creation */
export interface SessionBinding {
  agentId: string;
  cliSessionId: string;
}

/** F095 Phase C: All options collected by the new-thread modal */
export interface NewThreadOptions {
  projectPath?: string;
  preferredAgentIds?: string[];
  sessionBindings?: SessionBinding[];
  title?: string;
  pinned?: boolean;
  backlogItemId?: string;
}

interface BacklogItemSummary {
  id: string;
  title: string;
  status: string;
}

export function DirectoryPickerModal({
  existingProjects,
  onSelect,
  onCancel,
}: {
  existingProjects: string[];
  onSelect: (opts: NewThreadOptions) => void;
  onCancel: () => void;
}) {
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [sessionInputs, setSessionInputs] = useState<Record<string, string>>({});
  const [bindExpanded, setBindExpanded] = useState(false);
  const [cwdPath, setCwdPath] = useState<string | null>(null);
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState<string | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [pathError, setPathError] = useState<string | null>(null);
  const { getAgentById } = useAgentData();
  const modalRef = useRef<HTMLDivElement>(null);

  // F068-R7: Two-step flow — select project first, then confirm
  // 'lobby' sentinel means user explicitly chose "大厅 (无项目)"
  const [selectedPath, setSelectedPath] = useState<string | 'lobby' | null>(null);
  // P2 fix: clear stale pathError whenever user selects a project
  const handleSelectPath = useCallback((path: string | 'lobby') => {
    setPathError(null);
    setSelectedPath(path);
  }, []);

  // F095 Phase C: new fields
  const [threadTitle, setThreadTitle] = useState('');
  const [pinOnCreate, setPinOnCreate] = useState(false);
  const [backlogItems, setBacklogItems] = useState<BacklogItemSummary[]>([]);
  const [selectedBacklogItemId, setSelectedBacklogItemId] = useState('');

  // Fetch active backlog items for feat dropdown
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/backlog/items');
        if (res.ok) {
          const data = await res.json();
          const active = (data.items ?? []).filter(
            (item: BacklogItemSummary) => item.status !== 'done' && item.status !== 'cancelled',
          );
          setBacklogItems(active);
        }
      } catch {
        // ignore — backlog is optional
      }
    })();
  }, []);

  const selectWithOptions = useCallback(
    (projectPath: string | undefined) => {
      const bindings: SessionBinding[] = [];
      for (const [agentId, sid] of Object.entries(sessionInputs)) {
        const trimmed = sid.trim();
        if (trimmed && selectedAgentIds.includes(agentId)) {
          bindings.push({ agentId, cliSessionId: trimmed });
        }
      }
      onSelect({
        projectPath,
        preferredAgentIds: selectedAgentIds.length > 0 ? selectedAgentIds : undefined,
        sessionBindings: bindings.length > 0 ? bindings : undefined,
        title: threadTitle.trim() || undefined,
        pinned: pinOnCreate || undefined,
        backlogItemId: selectedBacklogItemId || undefined,
      });
    },
    [onSelect, selectedAgentIds, sessionInputs, threadTitle, pinOnCreate, selectedBacklogItemId],
  );

  // F068-R7: Confirm creation with currently selected project
  const confirmCreate = useCallback(() => {
    if (selectedPath === null) return;
    selectWithOptions(selectedPath === 'lobby' ? undefined : selectedPath);
  }, [selectedPath, selectWithOptions]);

  // F113: Handle directory selection from the web-based browser
  const handleBrowserSelect = useCallback(
    (path: string) => {
      handleSelectPath(path);
      setShowBrowser(false);
    },
    [handleSelectPath],
  );

  // F068: Submit path from text input — validate via browse endpoint before accepting
  const handlePathSubmit = useCallback(async () => {
    const trimmed = pathInput.trim();
    if (!trimmed) return;
    setPathError(null);
    try {
      const res = await apiFetch(`/api/projects/browse?path=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        const data = await res.json();
        setPathError(data.error || '路径无效');
        return;
      }
      // Valid directory — select the canonicalized path
      const data = await res.json();
      handleSelectPath(data.current);
    } catch {
      setPathError('无法连接到服务器');
    }
  }, [pathInput, handleSelectPath]);

  // Fetch cwd for "推荐" badge
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/projects/cwd');
        if (res.ok) {
          const data = await res.json();
          setCwdPath(typeof data?.path === 'string' ? data.path : null);
          setDefaultWorkspacePath(typeof data?.workspacePath === 'string' ? data.workspacePath : null);
        }
      } catch {
        // ignore — cwd is optional
      }
    })();
  }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const [agentsExpanded, setAgentsExpanded] = useState(false);
  const recommendedPath = defaultWorkspacePath ?? cwdPath;
  const selectionSummary = selectedAgentIds.length > 0 ? `已选 ${selectedAgentIds.length}` : '';

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-medium)]"
    >
      <div
        ref={modalRef}
        className="mx-4 flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-[var(--modal-border)] bg-[var(--modal-surface)] shadow-[var(--modal-shadow)]"
      >
        {/* ── Header + Title ── */}
        <div className="border-b border-[var(--modal-divider)] px-5 pb-3 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-[var(--modal-title-text)]">新建会话</h2>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md p-1 text-[var(--modal-close-icon)] transition-colors hover:bg-[var(--modal-close-hover-bg)] hover:text-[var(--modal-close-icon-hover)]"
            >
              <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
          <input
            type="text"
            value={threadTitle}
            onChange={(e) => setThreadTitle(e.target.value)}
            placeholder="会话标题（可选）"
            maxLength={200}
            className="ui-input w-full text-sm px-3 py-2 rounded-lg"
          />
        </div>

        {/* ── Project list (PRIMARY ACTION — takes most space, hidden when browser is open) ── */}
        <div className={`overflow-y-auto px-5 py-3 space-y-1 ${showBrowser ? 'hidden' : 'flex-1 min-h-[180px]'}`}>
          <div className="text-[10px] text-[var(--modal-empty-text)] font-medium mb-1">选择项目</div>

          {recommendedPath && !existingProjects.includes(recommendedPath) && (
            <button
              type="button"
              onClick={() => handleSelectPath(recommendedPath)}
              className={`w-full text-left px-3 py-2.5 text-sm text-[var(--modal-text)] hover:bg-[var(--modal-selected-surface)] rounded-lg transition-colors flex items-center gap-2 ${selectedPath === recommendedPath ? 'border border-[var(--modal-selected-border)] bg-[var(--modal-selected-surface)]' : 'border border-[var(--modal-selected-border)] bg-[var(--modal-muted-surface)]'}`}
              title={recommendedPath}
            >
              <FolderIcon />
              <div className="min-w-0 flex-1">
                <span className="font-medium block truncate">{projectDisplayName(recommendedPath)}</span>
                <span className="text-[10px] text-[var(--modal-empty-text)] block truncate">{recommendedPath}</span>
              </div>
              <span className="text-[10px] text-[var(--modal-accent-text)] flex-shrink-0">推荐</span>
            </button>
          )}

          {existingProjects.map((path) => (
            <button
              type="button"
              key={path}
              onClick={() => handleSelectPath(path)}
              className={`w-full text-left px-3 py-2.5 text-sm text-[var(--modal-text)] hover:bg-[var(--modal-selected-surface)] rounded-lg transition-colors flex items-center gap-2 ${selectedPath === path ? 'border border-[var(--modal-selected-border)] bg-[var(--modal-selected-surface)]' : ''}`}
              title={path}
            >
              <FolderIcon />
              <div className="min-w-0 flex-1">
                <span className="font-medium block truncate">{projectDisplayName(path)}</span>
                <span className="text-[10px] text-[var(--modal-empty-text)] block truncate">{path}</span>
              </div>
            </button>
          ))}

          <button
            type="button"
            onClick={() => handleSelectPath('lobby')}
            className={`w-full text-left px-3 py-2.5 text-sm text-[var(--modal-text-muted)] hover:bg-[var(--modal-selected-surface)] rounded-lg transition-colors flex items-center gap-2 ${selectedPath === 'lobby' ? 'border border-[var(--modal-selected-border)] bg-[var(--modal-selected-surface)]' : ''}`}
          >
            <span className="text-base">🏠</span>
            <span>大厅 (无项目)</span>
          </button>
        </div>

        {/* ── Options bar: feat + pin + cats toggle (hidden when browser is open) ── */}
        <div
          className={`px-5 py-2 border-t border-[var(--modal-divider)] flex items-center gap-3 flex-wrap ${showBrowser ? 'hidden' : ''}`}
        >
          {backlogItems.length > 0 && (
            <div className="flex-1 min-w-[140px]">
              <select
                value={selectedBacklogItemId}
                onChange={(e) => setSelectedBacklogItemId(e.target.value)}
                className="w-full text-xs px-2 py-1.5 rounded border border-[var(--modal-muted-border)] bg-[var(--modal-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--border-accent)] text-[var(--modal-text-muted)]"
              >
                <option value="">关联 Feature（可选）</option>
                {backlogItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-[var(--modal-text-muted)] cursor-pointer flex-shrink-0">
            <input
              type="checkbox"
              checked={pinOnCreate}
              onChange={(e) => setPinOnCreate(e.target.checked)}
              className="rounded border-[var(--modal-muted-border)] text-[var(--modal-accent-text)] focus:ring-[var(--border-accent)]"
            />
            <span>创建后置顶</span>
          </label>
          <button
            type="button"
            onClick={() => setAgentsExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-[var(--modal-text-muted)] hover:text-[var(--modal-text)] transition-colors ml-auto"
          >
            <span>{agentsExpanded ? '收起列表' : '选智能体'}</span>
            {selectionSummary && <span className="text-[var(--modal-accent-text)]">({selectionSummary})</span>}
            <svg
              aria-hidden="true"
              className={`w-3 h-3 transition-transform ${agentsExpanded ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* ── Cat selector (collapsed by default, hidden when browser is open) ── */}
        {agentsExpanded && !showBrowser && (
          <div className="px-5 py-2 border-t border-[var(--modal-divider)]">
            <AgentSelector selectedAgentIds={selectedAgentIds} onSelectionChange={setSelectedAgentIds} />
            {/* F33: Session binding */}
            {selectedAgentIds.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setBindExpanded((v) => !v)}
                  className="w-full text-xs text-[var(--modal-text-muted)] hover:text-[var(--modal-text)] flex items-center justify-between transition-colors py-1"
                >
                  <span>绑定外部 Session (可选)</span>
                  <svg
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 transition-transform ${bindExpanded ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                {bindExpanded && (
                  <div className="mt-1.5 space-y-2">
                    <p className="text-[10px] text-[var(--modal-empty-text)]">粘贴 Claude Code / Codex 的 Session ID，创建后自动绑定</p>
                    {selectedAgentIds.map((agentId) => {
                      const agent = getAgentById(agentId);
                      const label = agent ? formatAgentName(agent) : agentId;
                      return (
                        <div key={agentId} className="flex items-center gap-2">
                          <span className="text-[11px] text-[var(--modal-text-muted)] w-16 truncate flex-shrink-0" title={label}>
                            {label}
                          </span>
                          <input
                            value={sessionInputs[agentId] ?? ''}
                            onChange={(e) => setSessionInputs((prev) => ({ ...prev, [agentId]: e.target.value }))}
                            placeholder="CLI Session ID"
                            maxLength={500}
                            className="ui-input ui-input-soft flex-1 text-[11px] font-mono px-2 py-1 rounded"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── F113: Inline directory browser (replaces osascript picker) ── */}
        {showBrowser && (
          <div className="border-t border-[var(--modal-divider)] flex-1 min-h-0 flex flex-col overflow-hidden">
            <DirectoryBrowser
              initialPath={
                selectedPath && selectedPath !== 'lobby'
                  ? selectedPath
                  : defaultWorkspacePath ?? cwdPath ?? undefined
              }
              activeProjectPath={
                selectedPath && selectedPath !== 'lobby'
                  ? selectedPath
                  : defaultWorkspacePath ?? undefined
              }
              onSelect={handleBrowserSelect}
              onCancel={() => setShowBrowser(false)}
            />
          </div>
        )}

        {/* ── Bottom: browse button + path input + confirm ── */}
        <div className="px-5 py-3 border-t border-[var(--modal-divider)] space-y-2 flex-shrink-0">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowBrowser((v) => !v)}
              className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                showBrowser ? 'bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]' : 'bg-[var(--modal-button-muted-bg)] hover:bg-[var(--modal-button-muted-bg-hover)] text-[var(--modal-text)]'
              }`}
            >
              <FolderOpenIcon />
              <span>{showBrowser ? '收起浏览' : '浏览文件夹...'}</span>
            </button>
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) handlePathSubmit();
              }}
              placeholder="或输入路径..."
              className="ui-input flex-1 text-xs px-3 py-2 rounded-lg"
            />
            {pathInput.trim() && (
              <button
                type="button"
                onClick={handlePathSubmit}
                className="px-2.5 py-2 rounded-lg bg-[var(--modal-button-muted-bg)] text-[var(--modal-text)] hover:bg-[var(--modal-button-muted-bg-hover)] transition-colors"
                aria-label="跳转到路径"
              >
                <svg aria-hidden="true" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </div>
          {pathError && <p className="text-[10px] text-[var(--modal-danger-text)]">{pathError}</p>}
          {/* F068-R7: Selected path hint + confirm button */}
          <div className="flex items-center gap-2 pt-1">
            {selectedPath && (
              <span
                className={`truncate flex-1 ${
                  showBrowser
                    ? 'text-xs font-medium text-[var(--modal-accent-text)] bg-[var(--modal-selected-surface)] px-2 py-1 rounded-md'
                    : 'text-[11px] text-[var(--modal-text-muted)]'
                }`}
                title={selectedPath === 'lobby' ? '大厅' : selectedPath}
              >
                已选：{selectedPath === 'lobby' ? '大厅 (无项目)' : projectDisplayName(selectedPath)}
              </span>
            )}
            <button
              type="button"
              onClick={confirmCreate}
              disabled={selectedPath === null}
              className="ml-auto px-5 py-2 rounded-lg bg-[var(--button-primary-bg)] hover:bg-[var(--button-primary-bg-hover)] text-[var(--button-primary-text)] text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              创建会话
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`w-4 h-4 flex-shrink-0 ${className ?? ''}`}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
    </svg>
  );
}

function FolderOpenIcon() {
  return (
    <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      <path fillRule="evenodd" d="M2 8h16v4a2 2 0 01-2 2H4a2 2 0 01-2-2V8z" clipRule="evenodd" opacity="0.4" />
    </svg>
  );
}
