/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { notifySkillOptionsChanged } from '@/utils/skill-options-cache';
import styles from './SkillsTab.module.css';
import { CenteredLoadingState } from '../../shared/CenteredLoadingState';
import { EmptyDataState } from '../../shared/EmptyDataState';
import { NoSearchResultsState } from '../../shared/NoSearchResultsState';
import { OverflowTooltip } from '../../shared/OverflowTooltip';
import { SearchInput } from '../../shared/SearchInput';
import { NameInitialIcon } from '../../NameInitialIcon';

interface SearchSkill {
  id: string;
  slug: string;
  name: string;
  description: string;
  version?: string;
  category?: string;
  tags: string[];
  stars?: number;
  repo: { githubOwner: string; githubRepoName: string };
  isInstalled: boolean;
}

interface SearchResult {
  skills: SearchSkill[];
  total: number;
  page: number;
  hasMore: boolean;
}

type InstallStatus = 'installing' | string;
type ViewMode = 'browse' | 'search';

const GENERAL_CATEGORY = '通用技能';
const INSTALLING_LABEL = '安装中';
const INSTALL_LABEL = '安装';
const FALLBACK_DESCRIPTION = '暂未提供技能描述。';
const INSTALLED_LABEL = '已安装';
const SEARCH_ARIA_LABEL = '搜索技能';
const ALL_CATEGORY = '全部';
const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;
const INSTALL_SUCCESS_TITLE = '安装成功';
const INSTALL_FAILURE_TITLE = '安装失败';
const CATEGORY_TAB_PRIORITY = ['办公套件'];

const CATEGORY_MAP: Record<string, string> = {
  'ai-intelligence': 'AI 智能',
  'developer-tools': '开发工具',
  productivity: '效率提升',
  'content-creation': '内容创作',
  'data-analysis': '数据分析',
  'security-compliance': '安全合规',
  'communication-collaboration': '沟通协作',
};

function normalizeCategory(cat: string): string {
  return CATEGORY_MAP[cat] ?? cat;
}

function sortCategoryTabs(categories: string[]): string[] {
  const unique = [...new Set(categories)];
  return unique.sort((left, right) => {
    const leftIndex = CATEGORY_TAB_PRIORITY.indexOf(left);
    const rightIndex = CATEGORY_TAB_PRIORITY.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    }
    return left.localeCompare(right, 'zh-CN');
  });
}

function resolveCategoryParam(category: string): string | null {
  if (!category || category === ALL_CATEGORY) return null;
  return Object.entries(CATEGORY_MAP).find(([, zh]) => zh === category)?.[0] ?? category;
}

function getSkillCategory(skill: SearchSkill): string {
  if (skill.category?.trim()) {
    return normalizeCategory(skill.category.trim());
  }
  const primaryTag = skill.tags.find((tag) => tag.trim().length > 0);
  return primaryTag ? primaryTag.replace(/[-_]/g, ' ') : GENERAL_CATEGORY;
}

function InstallButton({
  slug,
  owner,
  repo,
  status,
  onInstall,
}: {
  slug: string;
  owner: string;
  repo: string;
  status: InstallStatus | undefined;
  onInstall: (owner: string, repo: string, skill: string) => void;
}) {
  if (status === 'installing') {
    return (
      <button type="button" disabled className={`${styles.installButton} ${styles.installButtonMuted}`}>
        {INSTALLING_LABEL}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onInstall(owner, repo, slug)}
      className={`${styles.installButton} ${styles.installButtonPrimary}`}
    >
      {INSTALL_LABEL}
    </button>
  );
}

function SkillList({
  results,
  installStatus,
  onInstall,
}: {
  results: SearchResult;
  installStatus: Map<string, InstallStatus>;
  onInstall: (owner: string, repo: string, skill: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className={styles.skillGrid}>
        {results.skills.map((skill) => {
          const resolvedDescription = skill.description.trim() || FALLBACK_DESCRIPTION;
          const resolvedAgentegory = getSkillCategory(skill);

          return (
            <article key={skill.id} className={`ui-card ${styles.card}`}>
              <div className={styles.header}>
                <NameInitialIcon name={skill.slug} />
                <div className={styles.content}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <OverflowTooltip
                        content={skill.slug}
                        className="min-w-0"
                        as="h3"
                        textClassName={`${styles.title} block truncate`}
                      />
                      <div className="mt-1 flex flex-wrap items-center gap-2 leading-[18px] text-[var(--text-secondary)] text-xs">
                        <OverflowTooltip
                          content={resolvedAgentegory}
                          className="inline-flex max-w-full min-w-0"
                          as="span"
                          textClassName="ui-badge-muted inline-block max-w-full truncate align-middle leading-[18px]"
                        />
                        {skill.stars !== undefined ? (
                          <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                            <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                              <path d="M6 1.2 7.55 4.3l3.45.5-2.5 2.45.6 3.45L6 9.1l-3.1 1.6.6-3.45L1 4.8l3.45-.5L6 1.2Z" />
                            </svg>
                            <span>{skill.stars}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <OverflowTooltip content={resolvedDescription} className="w-full">
                <p className={styles.description}>{resolvedDescription}</p>
              </OverflowTooltip>

              <div className={styles.footer}>
                {!skill.isInstalled ? (
                  <div className="shrink-0">
                    <InstallButton
                      slug={skill.slug}
                      owner={skill.repo.githubOwner}
                      repo={skill.repo.githubRepoName}
                      status={installStatus.get(skill.slug)}
                      onInstall={onInstall}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled
                    className={`${styles.installButton} ${styles.installButtonSuccess} shrink-0`}
                  >
                    {INSTALLED_LABEL}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function SkillsTab() {
  const addToast = useToastStore((s) => s.addToast);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('browse');
  const [installStatus, setInstallStatus] = useState<Map<string, InstallStatus>>(new Map());
  const statusTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY);
  const [displayCategory, setDisplayCategory] = useState(ALL_CATEGORY);
  const [categories, setCategories] = useState<string[]>([]);
  const latestQueryRef = useRef('');
  const requestSeqRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const searchEffectReadyRef = useRef(false);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  const loadCategories = useCallback(async () => {
    try {
      const res = await apiFetch('/api/skills/categories');
      if (res.ok) {
        const data = (await res.json()) as { categories: string[] };
        setCategories(sortCategoryTabs(data.categories.map(normalizeCategory)));
      }
    } catch {
      // ignore error
    }
  }, []);

  const buildSkillsUrl = useCallback((mode: ViewMode, page: number, query: string, category: string) => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    const categoryParam = resolveCategoryParam(category);
    if (categoryParam) {
      params.set('category', categoryParam);
    }
    if (mode === 'search') {
      params.set('keyword', query);
      return `/api/skills/search?${params.toString()}`;
    }
    return `/api/skills/all?${params.toString()}`;
  }, []);

  const mergeResults = useCallback((prev: SearchResult | null, next: SearchResult, append: boolean): SearchResult => {
    if (!append || !prev) return next;
    return {
      ...next,
      skills: [...prev.skills, ...next.skills],
    };
  }, []);

  const loadPage = useCallback(
    async ({
      mode,
      page,
      append = false,
      query = '',
      category = ALL_CATEGORY,
    }: {
      mode: ViewMode;
      page: number;
      append?: boolean;
      query?: string;
      category?: string;
    }) => {
      const requestId = ++requestSeqRef.current;
      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;

      const setLoadingFn = append ? setLoadingMore : setLoading;
      setLoadingFn(true);

      try {
        const res = await apiFetch(buildSkillsUrl(mode, page, query, category), { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as SearchResult;
        if (requestId !== requestSeqRef.current) return;

        setViewMode(mode);
        setResults((prev) => mergeResults(prev, data, append));
        setDisplayCategory(category);
        setCurrentPage(page);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // ignore error
      } finally {
        if (requestId === requestSeqRef.current) {
          setLoadingFn(false);
        }
      }
    },
    [buildSkillsUrl, mergeResults],
  );

  const handleCategoryChange = useCallback(
    (category: string) => {
      latestQueryRef.current = '';
      setSearchQuery('');
      setActiveCategory(category);
      setCurrentPage(1);
      setViewMode('browse');
      void loadPage({ mode: 'browse', page: 1, category });
    },
    [loadPage],
  );

  const handleClearFilters = useCallback(() => {
    latestQueryRef.current = '';
    setSearchQuery('');
    setCurrentPage(1);
    setViewMode('browse');
    void loadPage({ mode: 'browse', page: 1, category: activeCategory });
  }, [activeCategory, loadPage]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !results?.hasMore) return;
    if (viewMode === 'search') {
      const query = latestQueryRef.current.trim();
      if (!query) return;
      void loadPage({ mode: 'search', page: currentPage + 1, append: true, query, category: activeCategory });
      return;
    }
    void loadPage({ mode: 'browse', page: currentPage + 1, append: true, category: activeCategory });
  }, [activeCategory, currentPage, loadPage, loadingMore, results, viewMode]);

  const setInstallStatusWithTimer = useCallback((slug: string, status: InstallStatus) => {
    setInstallStatus((prev) => new Map(prev).set(slug, status));
    const existing = statusTimers.current.get(slug);
    if (existing) clearTimeout(existing);
    if (typeof status === 'string' && status !== 'installing') {
      const timer = setTimeout(() => {
        setInstallStatus((prev) => {
          const next = new Map(prev);
          next.delete(slug);
          return next;
        });
        statusTimers.current.delete(slug);
      }, 3000);
      statusTimers.current.set(slug, timer);
    }
  }, []);

  const clearInstallStatus = useCallback((slug: string) => {
    setInstallStatus((prev) => {
      const next = new Map(prev);
      next.delete(slug);
      return next;
    });
    const existing = statusTimers.current.get(slug);
    if (existing) {
      clearTimeout(existing);
      statusTimers.current.delete(slug);
    }
  }, []);

  const markSkillInstalled = useCallback((slug: string) => {
    const markInstalled = (result: SearchResult | null): SearchResult | null => {
      if (!result) return result;
      let changed = false;
      const skills = result.skills.map((item) => {
        if (item.slug !== slug || item.isInstalled) return item;
        changed = true;
        return { ...item, isInstalled: true };
      });
      return changed ? { ...result, skills } : result;
    };

    setResults((prev) => markInstalled(prev));
  }, []);

  useEffect(() => {
    const timers = statusTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      activeAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const el = loadMoreTriggerRef.current;
    if (!el || !results?.hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [results?.hasMore, loadingMore, handleLoadMore]);

  useEffect(() => {
    void loadPage({ mode: 'browse', page: 1, category: ALL_CATEGORY });
  }, [loadPage]);

  useEffect(() => {
    if (!searchEffectReadyRef.current) {
      searchEffectReadyRef.current = true;
      return;
    }

    const timer = setTimeout(() => {
      const trimmed = searchQuery.trim();
      latestQueryRef.current = trimmed;
      setCurrentPage(1);

      if (!trimmed) {
        void loadPage({ mode: 'browse', page: 1, category: activeCategory });
        return;
      }

      void loadPage({ mode: 'search', page: 1, query: trimmed, category: activeCategory });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [activeCategory, loadPage, searchQuery]);

  const handleInstall = useCallback(
    async (owner: string, repo: string, skill: string) => {
      setInstallStatusWithTimer(skill, 'installing');
      try {
        const res = await apiFetch('/api/skills/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner,
            repo,
            skill,
            description: results?.skills.find((item) => item.slug === skill)?.description ?? '',
            version: results?.skills.find((item) => item.slug === skill)?.version ?? '',
          }),
        });
        if (res.ok) {
          clearInstallStatus(skill);
          markSkillInstalled(skill);
          notifySkillOptionsChanged();
          addToast({
            type: 'success',
            title: INSTALL_SUCCESS_TITLE,
            message: `"${skill}" 安装成功，可在我的技能中查看`,
            duration: 4000,
          });
        } else {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          const detail = payload.error ?? `HTTP ${res.status}`;
          clearInstallStatus(skill);
          addToast({
            type: 'error',
            title: INSTALL_FAILURE_TITLE,
            message: detail,
            duration: 4000,
          });
        }
      } catch {
        clearInstallStatus(skill);
        addToast({
          type: 'error',
          title: INSTALL_FAILURE_TITLE,
          message: '网络错误，请重试',
          duration: 4000,
        });
      }
    },
    [addToast, clearInstallStatus, markSkillInstalled, results, setInstallStatusWithTimer],
  );

  if (!results && loading) {
    return <CenteredLoadingState />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0" data-testid="hub-skills-fixed-header">
          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 pb-6">
              {[ALL_CATEGORY, ...categories].map((category, index) => (
                <div key={category} className="flex items-center">
                  {index > 0 ? <div aria-hidden="true" className="mr-4 h-4 w-px self-center bg-[#dbdbdb]" /> : null}
                  <button
                    type="button"
                    onClick={() => handleCategoryChange(category)}
                    className={`inline-flex min-h-7 items-center leading-none text-sm transition-colors ${
                      activeCategory === category
                        ? 'font-semibold text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {category}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-0">
            <p className="text-[20px] font-semibold">
              {displayCategory}
              {results ? ` (${results.total})` : ''}
            </p>
            <div className="flex flex-col gap-[var(--space-5)] py-6 sm:flex-row sm:items-center">
              <SearchInput
                wrapperClassName="flex-1"
                aria-label={SEARCH_ARIA_LABEL}
                value={searchQuery}
                onChange={(value) => setSearchQuery(value)}
                onClear={() => setSearchQuery('')}
                placeholder={SEARCH_ARIA_LABEL}
                clearAriaLabel="清除搜索"
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="hub-skills-scroll-region">
          {results ? (
            <>
              {results.skills.length === 0 ? (
                <div
                  className="flex h-full min-h-0 items-center justify-center py-16"
                  data-testid="hub-skills-empty-state-shell"
                >
                  {viewMode === 'search' ? <NoSearchResultsState onClear={handleClearFilters} /> : <EmptyDataState />}
                </div>
              ) : (
                <SkillList results={results} installStatus={installStatus} onInstall={handleInstall} />
              )}
              {results.skills.length > 0 && results.hasMore && (
                <div ref={loadMoreTriggerRef} className="flex justify-center py-4">
                  {loadingMore && <span className="text-sm text-[var(--text-muted)]">加载中...</span>}
                </div>
              )}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
