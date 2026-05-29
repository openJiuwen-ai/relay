/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback } from 'react';

interface UseCloseMenusCoordinatorParams {
  closeMenusBase: () => void;
  clearSearchFilters: () => void;
  setWorkspaceFilter: (value: string) => void;
}

export function useCloseMenusCoordinator({
  closeMenusBase,
  clearSearchFilters,
  setWorkspaceFilter,
}: UseCloseMenusCoordinatorParams) {
  const closeMenus = useCallback(() => {
    closeMenusBase();
    clearSearchFilters();
    setWorkspaceFilter('');
  }, [clearSearchFilters, closeMenusBase, setWorkspaceFilter]);

  return { closeMenus };
}

