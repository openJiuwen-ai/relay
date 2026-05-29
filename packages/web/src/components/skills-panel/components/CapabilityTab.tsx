/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { notifySkillOptionsChanged } from '@/utils/skill-options-cache';
import type { CapabilityBoardItem, CapabilityBoardResponse, AgentFamily, ToggleHandler } from './capability-board-ui';
import { CapabilityCard } from './capability-board-ui';
import { CenteredLoadingState } from '../../shared/CenteredLoadingState';
import { EmptyDataState } from '../../shared/EmptyDataState';
import { NoSearchResultsState } from '../../shared/NoSearchResultsState';
import { SearchInput } from '../../shared/SearchInput';
import { Button } from '../../shared/Button';
import { useConfirm } from '../../useConfirm';

const ALL_CATEGORY = '全部';
const UNCATEGORIZED = '其他';
const SKILL_SEARCH_PLACEHOLDER = '搜索技能';
const SKILL_SEARCH_ARIA_LABEL = '搜索我的技能';
const CATEGORY_FILTER_ARIA_LABEL = '筛选分类';
const IMPORT_LABEL = '导入';
const CATEGORY_TAB_PRIORITY = ['办公套件'];
const ALL_SKILL_SOURCES = 'all';
type SkillSourceScope = CapabilityBoardItem['source'] | typeof ALL_SKILL_SOURCES;
const SKILL_SCOPE_TABS: readonly { id: SkillSourceScope; label: string }[] = [
  { id: ALL_SKILL_SOURCES, label: '全部' },
  { id: 'external', label: '我添加的' },
  { id: 'builtin', label: '平台精选' },
];
export interface SelectedSkillSummary {
  skillName: string;
  avatarUrl?: string | null;
}

function sortCategoryTabs(categories: string[]): string[] {
  return [...categories].sort((left, right) => {
    const leftIndex = CATEGORY_TAB_PRIORITY.indexOf(left);
    const rightIndex = CATEGORY_TAB_PRIORITY.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    }
    if (left === UNCATEGORIZED) return 1;
    if (right === UNCATEGORIZED) return -1;
    return left.localeCompare(right, 'zh-CN');
  });
}

export function CapabilityTab({
  hideSkillMountStatus,
  onImport,
  onSelectSkill,
  onUpdateSkill,
  skillUpdates,
  updatingSkillId,
  refreshSignal,
}: {
  hideSkillMountStatus?: boolean;
  onImport?: () => void;
  onSelectSkill?: (selection: SelectedSkillSummary) => void;
  onUpdateSkill?: (skillId: string) => void;
  skillUpdates?: ReadonlySet<string>;
  updatingSkillId?: string | null;
  refreshSignal?: number;
}) {
  const [items, setItems] = useState<CapabilityBoardItem[]>([]);
  const [agentFamilies, setAgentFamilies] = useState<AgentFamily[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSkillSource, setActiveSkillSource] = useState<SkillSourceScope>(ALL_SKILL_SOURCES);
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  const confirm = useConfirm();
  const addToast = useToastStore((state) => state.addToast);

  const fetchCapabilities = useCallback(async () => {
    setError(null);
    try {
      const query = new URLSearchParams();
      query.set('probe', 'true');
      const res = await apiFetch(`/api/capabilities?${query.toString()}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        setError((data.error as string) ?? '加载失败');
        return;
      }
      const data = (await res.json()) as CapabilityBoardResponse;
      setItems(data.items);
      setAgentFamilies(data.agentFamilies);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCapabilities();
  }, [fetchCapabilities, refreshSignal]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchCapabilities();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchCapabilities]);

  const handleToggle: ToggleHandler = useCallback(
    async (capabilityId, capabilityType, enabled, scope = 'global', agentId) => {
      const toggleKey = agentId ? `${capabilityType}:${capabilityId}:${agentId}` : `${capabilityType}:${capabilityId}`;
      setToggling(toggleKey);
      try {
        const body: Record<string, unknown> = {
          capabilityId,
          capabilityType,
          scope,
          enabled,
        };
        if (agentId) body.agentId = agentId;

        const res = await apiFetch('/api/capabilities', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          setError((data.error as string) ?? `开关失败 (${res.status})`);
          return;
        }
        await fetchCapabilities();
      } catch {
        setError('网络错误');
      } finally {
        setToggling(null);
      }
    },
    [fetchCapabilities],
  );

  const handleUninstall = useCallback(
    async (skillId: string) => {
      const ok = await confirm({
        title: '卸载技能',
        message: `确定要卸载 “${skillId}” 吗？此操作不可恢复。`,
        confirmLabel: '卸载',
        cancelLabel: '取消',
      });
      if (!ok) return;
      try {
        const res = await apiFetch('/api/skills/uninstall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: skillId }),
        });
        if (res.ok) {
          notifySkillOptionsChanged();
          addToast({
            type: 'success',
            title: '卸载成功',
            message: `"${skillId}" 已卸载`,
            duration: 4000,
          });
          await fetchCapabilities();
          return;
        }
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        const detail = payload.error ?? `HTTP ${res.status}`;
        addToast({
          type: 'error',
          title: '卸载失败',
          message: detail,
          duration: 4000,
        });
      } catch {
        addToast({
          type: 'error',
          title: '卸载失败',
          message: '网络错误，请重试',
          duration: 4000,
        });
      }
    },
    [addToast, confirm, fetchCapabilities],
  );

  const visibleItems = useMemo(() => items.filter((item) => item.type !== 'mcp'), [items]);
  const skillItems = useMemo(() => visibleItems.filter((item) => item.type === 'skill'), [visibleItems]);
  const sourceScopedSkillItems = useMemo(
    () => (activeSkillSource === ALL_SKILL_SOURCES ? skillItems : skillItems.filter((item) => item.source === activeSkillSource)),
    [activeSkillSource, skillItems],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of skillItems) {
      const category = item.category?.trim() || UNCATEGORIZED;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [skillItems]);
  const categoryOptions = useMemo(() => {
    const options = [ALL_CATEGORY];
    const categories = Array.from(categoryCounts.keys());
    const ordered = sortCategoryTabs(categories);
    options.push(...ordered);
    return options;
  }, [categoryCounts]);
  const categoryFilteredItems = useMemo(() => {
    if (activeCategory === ALL_CATEGORY) return sourceScopedSkillItems;
    return sourceScopedSkillItems.filter((item) => (item.category?.trim() || UNCATEGORIZED) === activeCategory);
  }, [activeCategory, sourceScopedSkillItems]);
  const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);
  const filteredDisplayedSkillItems = useMemo(() => {
    if (!normalizedSearchQuery) return categoryFilteredItems;
    return categoryFilteredItems.filter((item) => {
      const haystack = [item.id, item.description ?? '', item.category ?? ''].join(' ').toLowerCase();
      return haystack.includes(normalizedSearchQuery);
    });
  }, [categoryFilteredItems, normalizedSearchQuery]);

  useEffect(() => {
    if (!categoryOptions.includes(activeCategory)) setActiveCategory(ALL_CATEGORY);
  }, [activeCategory, categoryOptions]);

  useEffect(() => {
    if (!isCategoryMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (categoryMenuRef.current?.contains(target)) return;
      setIsCategoryMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isCategoryMenuOpen]);

  const handleSkillSourceChange = useCallback((source: SkillSourceScope) => {
    setSearchQuery('');
    setActiveCategory(ALL_CATEGORY);
    setActiveSkillSource(source);
    setIsCategoryMenuOpen(false);
  }, []);

  const handleCategoryChange = useCallback((category: string) => {
    setSearchQuery('');
    setActiveCategory(category);
    setIsCategoryMenuOpen(false);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setActiveCategory(ALL_CATEGORY);
  }, []);

  const activeSkillSourceLabel = SKILL_SCOPE_TABS.find((tab) => tab.id === activeSkillSource)?.label ?? '全部';

  if (loading) return <CenteredLoadingState />;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {error && <p className="ui-status-error rounded-[var(--radius-md)] px-3 py-2 text-sm">{error}</p>}

      <div data-testid="hub-capability-fixed-header">
        <div className="flex flex-wrap items-center gap-4">
          {SKILL_SCOPE_TABS.map((tab, index) => (
            <div key={tab.id} className="flex items-center">
              {index > 0 ? <div aria-hidden="true" className="mr-4 h-4 w-px self-center bg-[#dbdbdb]" /> : null}
              <button
                type="button"
                onClick={() => handleSkillSourceChange(tab.id)}
                className={`inline-flex min-h-7 items-center leading-none text-sm transition-colors ${activeSkillSource === tab.id
                  ? 'font-semibold text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
              >
                {tab.label}
              </button>
            </div>
          ))}
        </div>
        <div className="pt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[20px] font-semibold">{`${activeSkillSourceLabel} (${filteredDisplayedSkillItems.length})`}</p>
            {onImport ? (
              <Button variant="major" onClick={onImport}>
                {IMPORT_LABEL}
              </Button>
            ) : null}
          </div>
          <div className="py-6">
            <div className="flex items-center gap-2">
              <div ref={categoryMenuRef} className="relative w-[200px] shrink-0">
                <select
                  aria-label={CATEGORY_FILTER_ARIA_LABEL}
                  value={activeCategory}
                  onChange={(event) => handleCategoryChange(event.target.value)}
                  className="sr-only"
                  tabIndex={-1}
                >
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsCategoryMenuOpen((prev) => !prev)}
                  className={`ui-field flex h-[28px] w-[200px] items-center justify-between rounded-[6px] px-[12px] py-[5px] text-xs transition-colors ${isCategoryMenuOpen ? 'border-[#191919]' : ''
                    }`}
                  aria-haspopup="listbox"
                  aria-expanded={isCategoryMenuOpen}
                >
                  <span className="truncate text-[var(--text-primary)]">{activeCategory}</span>
                  <svg
                    className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-200 ${isCategoryMenuOpen ? 'rotate-180' : ''
                      }`}
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {isCategoryMenuOpen ? (
                  <div
                    role="listbox"
                    className="absolute left-0 top-[calc(100%+4px)] z-30 w-[200px] rounded-[6px] bg-[var(--surface-panel)] py-[8px] shadow-[0_2px_12px_0_var(--tooltip-shadow-color)]"
                  >
                    {categoryOptions.map((category) => {
                      const isSelected = category === activeCategory;
                      return (
                        <button
                          key={category}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            handleCategoryChange(category);
                          }}
                          className={`flex h-[32px] w-full items-center px-[16px] py-[7px] text-left text-xs transition-colors hover:bg-[var(--tag-bg)] ${isSelected ? 'text-[var(--text-accent)]' : 'text-[var(--text-primary)]'
                            }`}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <SearchInput
                wrapperClassName="w-full"
                aria-label={SKILL_SEARCH_ARIA_LABEL}
                value={searchQuery}
                onChange={(value) => setSearchQuery(value)}
                onClear={() => setSearchQuery('')}
                placeholder={SKILL_SEARCH_PLACEHOLDER}
                clearAriaLabel="清除搜索"
              />
            </div>
          </div>
        </div>
      </div>

      {skillItems.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-16">
          <EmptyDataState />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="hub-capability-scroll-region">
          {filteredDisplayedSkillItems.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredDisplayedSkillItems.map((item) => (
                <CapabilityCard
                  key={`${item.type}:${item.id}`}
                  item={item}
                  agentFamilies={agentFamilies}
                  toggling={toggling}
                  onToggle={handleToggle}
                  onUninstall={handleUninstall}
                  onUpdateSkill={onUpdateSkill}
                  updatingSkillId={updatingSkillId}
                  skillUpdates={skillUpdates}
                  onClick={
                    item.type === 'skill'
                      ? () =>
                        onSelectSkill?.({
                          skillName: item.id,
                          avatarUrl: item.iconUrl ?? null,
                        })
                      : undefined
                  }
                  hideSkillMountStatus={hideSkillMountStatus}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-full items-center justify-center py-16">
              <NoSearchResultsState onClear={handleClearFilters} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
