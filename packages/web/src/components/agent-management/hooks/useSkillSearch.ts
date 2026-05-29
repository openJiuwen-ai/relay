/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useRef, useState } from 'react';
import type React from 'react';
import { apiFetch } from '@/utils/api-client';

const PAGE_SIZE = 24;

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

function resolveCategoryParam(category: string): string | null {
  if (!category || category === '全部') return null;
  return Object.entries(CATEGORY_MAP).find(([, zh]) => zh === category)?.[0] ?? category;
}

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

interface UseSkillSearchResult {
  searchResults: SearchResult | null;
  setSearchResults: React.Dispatch<React.SetStateAction<SearchResult | null>>;
  searchLoading: boolean;
  loadingMore: boolean;
  currentPage: number;
  categories: string[];
  activeCategory: string;
  loadPage: (opts: { page: number; append?: boolean; category?: string }) => Promise<void>;
  loadCategories: () => Promise<void>;
  handleLoadMore: () => void;
  setActiveCategory: (category: string) => void;
}

export function useSkillSearch(): UseSkillSearchResult {
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('全部');

  const requestSeqRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);

  const buildSkillsUrl = useCallback((page: number, category: string) => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    const categoryParam = resolveCategoryParam(category);
    if (categoryParam) {
      params.set('category', categoryParam);
    }
    return `/api/skills/all?${params.toString()}`;
  }, []);

  const loadPage = useCallback(
    async ({
      page,
      append = false,
      category = '全部',
    }: {
      page: number;
      append?: boolean;
      category?: string;
    }) => {
      const requestId = ++requestSeqRef.current;
      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;

      const setLoadingFn = append ? setLoadingMore : setSearchLoading;
      setLoadingFn(true);

      try {
        const res = await apiFetch(buildSkillsUrl(page, category ?? '全部'), { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as SearchResult;
        if (requestId !== requestSeqRef.current) return;

        setSearchResults((prev) => {
          if (!append || !prev) return data;
          return {
            ...data,
            skills: [...prev.skills, ...data.skills],
          };
        });
        setCurrentPage(page);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      } finally {
        if (requestId === requestSeqRef.current) {
          setLoadingFn(false);
        }
      }
    },
    [buildSkillsUrl],
  );

  const loadCategories = useCallback(async () => {
    try {
      const res = await apiFetch('/api/skills/categories');
      if (res.ok) {
        const data = (await res.json()) as { categories: string[] };
        const sorted = [...new Set(data.categories)].sort((left, right) =>
          left.localeCompare(right, 'zh-CN'),
        );
        setCategories(sorted.map(normalizeCategory));
      }
    } catch {
      // ignore error
    }
  }, []);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !searchResults?.hasMore) return;
    void loadPage({ page: currentPage + 1, append: true, category: activeCategory });
  }, [loadingMore, searchResults?.hasMore, currentPage, loadPage, activeCategory]);

  return {
    searchResults,
    setSearchResults,
    searchLoading,
    loadingMore,
    currentPage,
    categories,
    activeCategory,
    loadPage,
    loadCategories,
    handleLoadMore,
    setActiveCategory,
  };
}

export { normalizeCategory, resolveCategoryParam };
export type { SearchSkill };