/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type CSSProperties, type RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import {
  FILTER_PANEL_GAP_PX,
  FILTER_PANEL_WIDTH_PX,
  SIDEBAR_CONTENT_REVEAL_MS,
  type ThreadFilterOption,
} from './thread-sidebar-constants';
import { shouldCollapseSidebar } from './thread-sidebar-utils';

function useResponsiveSidebarCollapse(hasPptPreview: boolean) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isExpandedContentVisible, setIsExpandedContentVisible] = useState(true);
  const breakpointCollapsedRef = useRef<boolean | null>(null);
  const hasManualSidebarToggleRef = useRef(false);
  const revealContentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRevealContentTimer = useCallback(() => {
    if (revealContentTimerRef.current) {
      clearTimeout(revealContentTimerRef.current);
      revealContentTimerRef.current = null;
    }
  }, []);

  const applySidebarCollapsed = useCallback(
    (nextCollapsed: boolean, revealExpandedContentImmediately: boolean) => {
      clearRevealContentTimer();
      setIsSidebarCollapsed(nextCollapsed);

      if (nextCollapsed) {
        setIsExpandedContentVisible(false);
        return;
      }

      if (revealExpandedContentImmediately) {
        setIsExpandedContentVisible(true);
        return;
      }

      setIsExpandedContentVisible(false);
      revealContentTimerRef.current = setTimeout(() => {
        setIsExpandedContentVisible(true);
        revealContentTimerRef.current = null;
      }, SIDEBAR_CONTENT_REVEAL_MS);
    },
    [clearRevealContentTimer],
  );

  useLayoutEffect(() => {
    const syncToBreakpoint = () => {
      const nextBreakpointCollapsed = shouldCollapseSidebar(hasPptPreview);
      if (breakpointCollapsedRef.current === nextBreakpointCollapsed) return;
      const isInitialSync = breakpointCollapsedRef.current === null;
      breakpointCollapsedRef.current = nextBreakpointCollapsed;
      if (hasManualSidebarToggleRef.current) return;
      applySidebarCollapsed(nextBreakpointCollapsed, isInitialSync);
    };

    syncToBreakpoint();
    window.addEventListener('resize', syncToBreakpoint);
    return () => {
      window.removeEventListener('resize', syncToBreakpoint);
      clearRevealContentTimer();
    };
  }, [applySidebarCollapsed, clearRevealContentTimer, hasPptPreview]);

  const toggleSidebarCollapsed = useCallback(() => {
    hasManualSidebarToggleRef.current = true;
    applySidebarCollapsed(!isSidebarCollapsed, false);
  }, [applySidebarCollapsed, isSidebarCollapsed]);

  return { isSidebarCollapsed, isExpandedContentVisible, toggleSidebarCollapsed };
}

export interface UseThreadSidebarLayoutResult {
  searchQuery: string;
  isSearchOpen: boolean;
  showFilter: boolean;
  filterOption: ThreadFilterOption;
  filterPanelStyle: CSSProperties | null;
  filterPanelRef: RefObject<HTMLDivElement>;
  filterToggleRef: RefObject<HTMLButtonElement>;
  isSidebarCollapsed: boolean;
  isExpandedContentVisible: boolean;
  isSidebarCollapsedLayout: boolean;
  sidebarContentRevealClassName: string;
  toggleSidebarCollapsed: () => void;
  handleSearchChange: (value: string) => void;
  handleSearchClear: () => void;
  toggleSearch: () => void;
  toggleFilter: () => void;
  selectFilter: (value: ThreadFilterOption) => void;
  resetSearchAndFilter: () => void;
}

export function useThreadSidebarLayout(): UseThreadSidebarLayoutResult {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterOption, setFilterOption] = useState<ThreadFilterOption>('all');
  const [filterPanelStyle, setFilterPanelStyle] = useState<CSSProperties | null>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const filterToggleRef = useRef<HTMLButtonElement>(null);
  const rightPanelMode = useChatStore((state) => state.rightPanelMode);
  const hasWidePreviewLayout =
    rightPanelMode === 'pptStudio' || rightPanelMode === 'fileBrowser' || rightPanelMode === 'documentPreview' || rightPanelMode === 'outlinePreview';
  const { isSidebarCollapsed, isExpandedContentVisible, toggleSidebarCollapsed } =
    useResponsiveSidebarCollapse(hasWidePreviewLayout);
  const isSidebarCollapsedLayout = isSidebarCollapsed;
  const sidebarContentRevealClassName = isExpandedContentVisible
    ? 'opacity-100 translate-x-0'
    : 'opacity-0 -translate-x-1 pointer-events-none';

  useLayoutEffect(() => {
    if (!showFilter) {
      setFilterPanelStyle(null);
      return;
    }

    const updateFilterPanelPosition = () => {
      const rect = filterToggleRef.current?.getBoundingClientRect();
      if (!rect) return;

      const maxRight = Math.max(FILTER_PANEL_GAP_PX, window.innerWidth - FILTER_PANEL_WIDTH_PX - FILTER_PANEL_GAP_PX);
      setFilterPanelStyle({
        top: Math.max(FILTER_PANEL_GAP_PX, rect.bottom + FILTER_PANEL_GAP_PX),
        right: Math.min(Math.max(FILTER_PANEL_GAP_PX, window.innerWidth - rect.right), maxRight),
      });
    };

    updateFilterPanelPosition();
    window.addEventListener('resize', updateFilterPanelPosition);
    window.addEventListener('scroll', updateFilterPanelPosition, true);
    return () => {
      window.removeEventListener('resize', updateFilterPanelPosition);
      window.removeEventListener('scroll', updateFilterPanelPosition, true);
    };
  }, [showFilter]);

  useLayoutEffect(() => {
    if (!showFilter) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (filterPanelRef.current?.contains(target)) return;
      if (filterToggleRef.current?.contains(target)) return;
      setShowFilter(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showFilter]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setFilterOption('all');
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
    setShowFilter(false);
  }, []);

  const toggleSearch = useCallback(() => {
    setIsSearchOpen((prev) => !prev);
    setShowFilter(false);
    setFilterOption('all');
  }, []);

  const toggleFilter = useCallback(() => {
    setShowFilter((prev) => !prev);
    setIsSearchOpen(false);
    setSearchQuery('');
  }, []);

  const selectFilter = useCallback((value: ThreadFilterOption) => {
    setFilterOption(value);
    setShowFilter(false);
  }, []);

  const resetSearchAndFilter = useCallback(() => {
    setSearchQuery('');
    setIsSearchOpen(false);
    setShowFilter(false);
    setFilterOption('all');
  }, []);

  return {
    searchQuery,
    isSearchOpen,
    showFilter,
    filterOption,
    filterPanelStyle,
    filterPanelRef,
    filterToggleRef,
    isSidebarCollapsed,
    isExpandedContentVisible,
    isSidebarCollapsedLayout,
    sidebarContentRevealClassName,
    toggleSidebarCollapsed,
    handleSearchChange,
    handleSearchClear,
    toggleSearch,
    toggleFilter,
    selectFilter,
    resetSearchAndFilter,
  };
}
