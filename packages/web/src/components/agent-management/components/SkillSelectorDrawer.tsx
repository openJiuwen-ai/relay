/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/shared/Button';
import { apiFetch } from '@/utils/api-client';
import { SearchInput } from '@/components/shared/SearchInput';
import { NameInitialIcon } from '@/components/NameInitialIcon';
import { OverflowTooltip } from '@/components/shared/OverflowTooltip';
import { setMultipleSkillBasicInfos, type SkillBasicInfo } from './skill-basic-info-cache';
import { useInstallStatus } from '../hooks/useInstallStatus';
import { useSkillSearch, normalizeCategory, type SearchSkill } from '../hooks/useSkillSearch';
import { useSkillInstall } from '../hooks/useSkillInstall';
import { UploadSkillModal } from '@/components/skills-panel/components/UploadSkillModal';
import styles from './SkillSelectorDrawer.module.css';

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  category?: string;
  trigger?: string | string[];
  source?: 'builtin' | 'external';
}

interface SkillSelectorDrawerProps {
  open: boolean;
  selectedSkills: string[];
  skillBasicInfos?: Map<string, SkillBasicInfo>;
  onConfirm: (skills: string[], skillBasicInfos?: Map<string, SkillBasicInfo>) => void;
  onClose: () => void;
}

type ViewMode = 'installed' | 'plaza';

const INSTALLED_TAB = '我的技能';
const SKILL_PLAZA_TAB = '技能广场';
const ALL_CATEGORY = '全部';
const UNCATEGORIZED = '其他';

const ALL_SKILL_SOURCES = 'all';
type SkillSourceScope = 'builtin' | 'external' | typeof ALL_SKILL_SOURCES;
const SKILL_SCOPE_TABS: readonly { id: SkillSourceScope; label: string }[] = [
  { id: ALL_SKILL_SOURCES, label: '全部' },
  { id: 'external', label: '我添加的' },
  { id: 'builtin', label: '平台精选' },
];

const CATEGORY_FILTER_ARIA_LABEL = '筛选分类';

function skillMatchesQuery(skill: SkillInfo, query: string): boolean {
  const lowered = query.toLowerCase();
  return (
    skill.id.toLowerCase().includes(lowered) ||
    skill.name.toLowerCase().includes(lowered) ||
    skill.description.toLowerCase().includes(lowered)
  );
}

interface SkillsResponse {
  skills: Array<{
    name: string;
    description?: string;
    category?: string;
    trigger?: string | string[];
    source?: 'local' | 'skillhub';
  }>;
}

function markSkillInstalled(
  slug: string,
  setSearchResults: (fn: (prev: { skills: SearchSkill[]; total: number; page: number; hasMore: boolean } | null) => { skills: SearchSkill[]; total: number; page: number; hasMore: boolean } | null) => void,
) {
  setSearchResults((prev) => {
    if (!prev) return prev;
    let changed = false;
    const skills = prev.skills.map((item) => {
      if (item.slug !== slug || item.isInstalled) return item;
      changed = true;
      return { ...item, isInstalled: true };
    });
    return changed ? { ...prev, skills } : prev;
  });
}

export function SkillSelectorDrawer({
  open,
  selectedSkills,
  skillBasicInfos,
  onConfirm,
  onClose,
}: SkillSelectorDrawerProps) {
  const [activeTab, setActiveTab] = useState<ViewMode>('installed');
  const [query, setQuery] = useState('');
  const [draftSelected, setDraftSelected] = useState<string[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [internalSkillBasicInfos, setInternalSkillBasicInfos] = useState<Map<string, SkillBasicInfo>>(new Map());
  const [loading, setLoading] = useState(false);

  const [activeSourceScope, setActiveSourceScope] = useState<SkillSourceScope>(ALL_SKILL_SOURCES);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const searchEffectReadyRef = useRef(false);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  const { installStatus, setInstallStatusWithTimer, clearInstallStatus } = useInstallStatus();
  const { searchResults, setSearchResults, searchLoading, loadingMore, loadPage, loadCategories, handleLoadMore, activeCategory, setActiveCategory, categories } =
    useSkillSearch();
  const { handleInstall } = useSkillInstall();

  useEffect(() => {
    if (!open) return;
    setDraftSelected(selectedSkills);
    setQuery('');
    setLoading(true);
    apiFetch('/api/skills')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SkillsResponse | null) => {
        if (data?.skills) {
          const skillInfoList = data.skills.map((s) => ({
            id: s.name,
            name: s.name,
            description: typeof s.description === 'string' ? s.description : '',
            category: s.category,
            trigger: s.trigger,
            source: (s.source === 'skillhub' ? 'external' : 'builtin') as 'builtin' | 'external',
          }));
          setSkills(skillInfoList);
          const detailsMap = new Map<string, SkillBasicInfo>();
          data.skills.forEach((s) => {
            detailsMap.set(s.name, { name: s.name, description: s.description });
          });
          setInternalSkillBasicInfos(detailsMap);
          setMultipleSkillBasicInfos(Array.from(detailsMap.values()));
        }
      })
      .finally(() => setLoading(false));
  }, [open, selectedSkills]);

  useEffect(() => {
    if (activeTab === 'plaza') {
      void loadCategories();
      void loadPage({ page: 1, category: ALL_CATEGORY });
    }
  }, [activeTab, loadCategories, loadPage]);

  useEffect(() => {
    if (!searchEffectReadyRef.current) {
      searchEffectReadyRef.current = true;
      return;
    }

    if (activeTab !== 'plaza') return;
    if (!query.trim()) return;

    const timer = setTimeout(() => {
      setActiveCategory(ALL_CATEGORY);
      void loadPage({ page: 1, category: ALL_CATEGORY });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, activeTab, loadPage, setActiveCategory]);

  const handleCategoryChange = useCallback(
    (category: string) => {
      setQuery('');
      setActiveCategory(category);
      void loadPage({ page: 1, category });
    },
    [loadPage, setActiveCategory],
  );

  const handleUploadSuccess = useCallback(() => {
    setUploadModalOpen(false);
    apiFetch('/api/skills')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SkillsResponse | null) => {
        if (data?.skills) {
          const skillInfoList = data.skills.map((s) => ({
            id: s.name,
            name: s.name,
            description: typeof s.description === 'string' ? s.description : '',
            category: s.category,
            trigger: s.trigger,
            source: (s.source === 'skillhub' ? 'external' : 'builtin') as 'builtin' | 'external',
          }));
          setSkills(skillInfoList);
          const detailsMap = new Map<string, SkillBasicInfo>();
          data.skills.forEach((s) => {
            detailsMap.set(s.name, { name: s.name, description: s.description });
          });
          setInternalSkillBasicInfos(detailsMap);
          setMultipleSkillBasicInfos(Array.from(detailsMap.values()));
        }
      });
  }, []);

  useEffect(() => {
    const el = loadMoreTriggerRef.current;
    if (!el || !searchResults?.hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [searchResults?.hasMore, loadingMore, handleLoadMore]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!categoryMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (categoryMenuRef.current?.contains(target)) return;
      setCategoryMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [categoryMenuOpen]);

  const filteredSkills = useMemo(() => {
    if (activeTab === 'plaza') return [];
    let filtered = skills;
    if (activeSourceScope !== ALL_SKILL_SOURCES) {
      filtered = filtered.filter((skill) => skill.source === activeSourceScope);
    }
    if (activeCategory !== ALL_CATEGORY) {
      filtered = filtered.filter((skill) => (skill.category?.trim() || UNCATEGORIZED) === activeCategory);
    }
    const normalized = query.trim().toLowerCase();
    if (!normalized) return filtered;
    return filtered.filter((skill) => skillMatchesQuery(skill, normalized));
  }, [activeTab, query, skills, activeSourceScope, activeCategory]);

  const installedCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const skill of skills) {
      if (activeSourceScope !== ALL_SKILL_SOURCES && skill.source !== activeSourceScope) continue;
      cats.add(skill.category?.trim() || UNCATEGORIZED);
    }
    return Array.from(cats).sort();
  }, [skills, activeSourceScope]);

  const plazaSkills = useMemo(() => {
    if (activeTab !== 'plaza') return [];
    return searchResults?.skills ?? [];
  }, [activeTab, searchResults]);

  const toggleSkill = useCallback((skillId: string) => {
    setDraftSelected((prev) => {
      if (prev.includes(skillId)) {
        return prev.filter((id) => id !== skillId);
      }
      return [...prev, skillId];
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const allSkillInfos = new Map([...(skillBasicInfos ?? new Map()), ...internalSkillBasicInfos]);
    onConfirm(draftSelected, allSkillInfos);
  }, [draftSelected, skillBasicInfos, internalSkillBasicInfos, onConfirm]);

  const onInstallSkill = useCallback(
    async (owner: string, repo: string, skill: string, skillDescription: string, skillVersion: string) => {
      setInstallStatusWithTimer(skill, 'installing');
      await handleInstall(owner, repo, skill, skillDescription, skillVersion);
      clearInstallStatus(skill);
      markSkillInstalled(skill, setSearchResults);
    },
    [handleInstall, setInstallStatusWithTimer, clearInstallStatus],
  );

  if (!open) return null;

  const displaySkills = activeTab === 'installed' ? filteredSkills : plazaSkills;
  const isLoading = activeTab === 'installed' ? loading : searchLoading;
  const hasResults = displaySkills.length > 0;

  return (
    <div className={styles.backdrop} data-testid="skill-selector-drawer">
      <div className={styles.drawer}>
        <div className={styles.header}>
          <h2 className={styles.title}>选择技能</h2>
          <button
            type="button"
            onClick={onClose}
            className={styles.closeButton}
            aria-label="关闭技能选择"
          >
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.tabsWrapper}>
            <div className={styles.tabs}>
              <button
                type="button"
                onClick={() => setActiveTab('installed')}
                className={`${styles.tab} ${activeTab === 'installed' ? styles.tabActive : ''}`}
              >
                {INSTALLED_TAB}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('plaza')}
                className={`${styles.tab} ${activeTab === 'plaza' ? styles.tabActive : ''}`}
              >
                {SKILL_PLAZA_TAB}
              </button>
            </div>
          </div>

          {activeTab === 'installed' && (
            <div className={styles.categoriesWrapper}>
              <div className={styles.categories}>
                {SKILL_SCOPE_TABS.map((tab, index) => (
                  <div key={tab.id} className={styles.categoryItem}>
                    {index > 0 ? <div aria-hidden="true" className={styles.categoryDivider} /> : null}
                    <button
                      type="button"
                      onClick={() => setActiveSourceScope(tab.id)}
                      className={`${styles.categoryTab} ${activeSourceScope === tab.id ? styles.categoryTabActive : ''}`}
                    >
                      {tab.label}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'plaza' && categories.length > 0 && (
            <div className={styles.categoriesWrapper}>
              <div className={styles.categories}>
                {[ALL_CATEGORY, ...categories].map((category, index) => (
                  <div key={category} className={styles.categoryItem}>
                    {index > 0 ? <div aria-hidden="true" className={styles.categoryDivider} /> : null}
                    <button
                      type="button"
                      onClick={() => handleCategoryChange(category)}
                      className={`${styles.categoryTab} ${activeCategory === category ? styles.categoryTabActive : ''}`}
                    >
                      {category}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'installed' && (
            <div className={styles.categoriesWrapper}>
              <Button variant="default" onClick={() => setUploadModalOpen(true)}>
                导入技能
              </Button>
            </div>
          )}

          <div className={styles.searchWrapper}>
            {activeTab === 'installed' && installedCategories.length > 0 && (
              <div ref={categoryMenuRef} className="relative w-[200px] shrink-0">
                <select
                  aria-label={CATEGORY_FILTER_ARIA_LABEL}
                  value={activeCategory}
                  onChange={(event) => handleCategoryChange(event.target.value)}
                  className="sr-only"
                  tabIndex={-1}
                >
                  {[ALL_CATEGORY, ...installedCategories].map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCategoryMenuOpen((prev) => !prev)}
                  className={`ui-field flex h-[28px] w-[200px] items-center justify-between rounded-[6px] px-[12px] py-[5px] text-xs transition-colors ${categoryMenuOpen ? 'border-[#191919]' : ''}`}
                  aria-haspopup="listbox"
                  aria-expanded={categoryMenuOpen}
                >
                  <span className="truncate text-[var(--text-primary)]">{activeCategory}</span>
                  <svg
                    className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-200 ${categoryMenuOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {categoryMenuOpen && (
                  <div
                    role="listbox"
                    className="absolute left-0 top-[calc(100%+4px)] z-30 w-[200px] rounded-[6px] bg-[var(--surface-panel)] py-[8px] shadow-[0_2px_12px_0_var(--tooltip-shadow-color)]"
                  >
                    {[ALL_CATEGORY, ...installedCategories].map((cat) => {
                      const isSelected = cat === activeCategory;
                      return (
                        <button
                          key={cat}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            handleCategoryChange(cat);
                            setCategoryMenuOpen(false);
                          }}
                          className={`flex h-[32px] w-full items-center px-[16px] py-[7px] text-left text-xs transition-colors hover:bg-[var(--tag-bg)] ${isSelected ? 'text-[var(--text-accent)]' : 'text-[var(--text-primary)]'}`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <SearchInput
              wrapperClassName="w-full"
              value={query}
              onChange={(value: string) => setQuery(value)}
              placeholder={activeTab === 'installed' ? '输入关键字搜索技能' : '搜索技能广场'}
              aria-label="搜索技能"
              data-testid="skill-search-input"
            />
          </div>

          <div className={styles.content}>
            {isLoading ? (
              <div className={styles.emptyState}>加载中...</div>
            ) : !hasResults ? (
              <div className={styles.emptyState}>没有匹配到技能</div>
            ) : (
              <>
                <div className={styles.skillGrid}>
                  {displaySkills.map((skill) => {
                    const skillId = activeTab === 'installed' ? (skill as SkillInfo).id : (skill as SearchSkill).slug;
                    const skillName = activeTab === 'installed' ? (skill as SkillInfo).name : (skill as SearchSkill).name;
                    const skillDesc =
                      activeTab === 'installed'
                        ? (skill as SkillInfo).description
                        : (skill as SearchSkill).description;
                    const skillCategory =
                      activeTab === 'installed'
                        ? (skill as SkillInfo).category
                        : normalizeCategory((skill as SearchSkill).category ?? '');
                    const isSelected = draftSelected.includes(skillId);
                    const isInstalled = activeTab === 'plaza' ? (skill as SearchSkill).isInstalled : false;
                    return (
                      <article
                        key={skillId}
                        className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
                        onClick={() => {
                          if (activeTab === 'plaza' && !isInstalled) return;
                          toggleSkill(skillId);
                        }}
                      >
                        <div className={styles.cardHeader}>
                          <NameInitialIcon name={skillName || skillId} />
                          <div className={styles.cardContent}>
                            <OverflowTooltip
                              content={skillName}
                              className="min-w-0"
                              as="h3"
                              textClassName={`${styles.cardTitle} block truncate`}
                            />
                            <div className="mt-1 flex flex-wrap items-center gap-2 leading-[18px] text-xs">
                              {skillCategory && <span className={styles.badge}>{skillCategory}</span>}
                            </div>
                          </div>
                          {activeTab === 'plaza' && !isInstalled ? null : (
                            <div className={`${styles.checkbox} ${isSelected ? styles.checkboxChecked : ''}`}>
                              {isSelected ? (
                                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              ) : (
                                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                  <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                                </svg>
                              )}
                            </div>
                          )}
                        </div>

                        <OverflowTooltip content={skillDesc || '暂未提供技能描述。'} className="w-full">
                          <p className={styles.cardDescription}>{skillDesc || '暂未提供技能描述。'}</p>
                        </OverflowTooltip>

                        {activeTab === 'plaza' && (
                          <div className={styles.cardFooter}>
                            {isInstalled ? (
                              <span className="shrink-0 text-xs" style={{ color: 'var(--text-disabled)' }}>
                                已安装
                              </span>
                            ) : (skill as SearchSkill).repo.githubOwner && (skill as SearchSkill).repo.githubRepoName ? (
                              <button
                                type="button"
                                className={styles.installButton}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void onInstallSkill(
                                    (skill as SearchSkill).repo.githubOwner,
                                    (skill as SearchSkill).repo.githubRepoName,
                                    (skill as SearchSkill).slug,
                                    (skill as SearchSkill).description,
                                    (skill as SearchSkill).version ?? '',
                                  );
                                }}
                              >
                                安装
                              </button>
                            ) : null}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
                {activeTab === 'plaza' && searchResults?.hasMore && (
                  <div ref={loadMoreTriggerRef} className={styles.loadMore}>
                    {loadingMore && <span className="text-sm text-[var(--text-muted)]">加载中...</span>}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <span className="text-xs" style={{ color: 'var(--text-primary)', lineHeight: '18px' }}>
            已选：{draftSelected.length}
          </span>
          <div className="flex gap-3">
            <Button onClick={onClose} variant="default">
              取消
            </Button>
            <Button onClick={handleConfirm} color="major">
              确认
            </Button>
          </div>
        </div>
      </div>

      <UploadSkillModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}