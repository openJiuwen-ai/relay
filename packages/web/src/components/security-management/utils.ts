/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type {
  PermissionDecision,
  PermissionsConfig,
  SecurityPolicyItem,
  ToolPermissionRule,
} from './types';

export function getToolDecision(
  value: PermissionDecision | ToolPermissionRule | undefined,
): PermissionDecision {
  if (!value) return 'allow';
  if (typeof value === 'string') return value;
  return value['*'] ?? 'allow';
}

export function normalizePolicies(config?: PermissionsConfig): SecurityPolicyItem[] {
  const tools = config?.tools ?? {};
  return Object.entries(tools).map(([toolName, value]) => ({
    id: toolName,
    action: toolName,
    approvalRequired: getToolDecision(value) === 'ask',
  }));
}

export function isPermissionsEnabled(config?: PermissionsConfig): boolean {
  return config?.enabled ?? true;
}

export function updateToolValue(
  current: PermissionDecision | ToolPermissionRule | undefined,
  nextDecision: PermissionDecision,
): PermissionDecision | ToolPermissionRule {
  if (!current || typeof current === 'string') {
    return nextDecision;
  }

  return {
    ...current,
    '*': nextDecision,
  };
}

export function formatPaginationPages(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 8) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([
    1,
    2,
    totalPages - 1,
    totalPages,
    currentPage - 2,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    currentPage + 2,
  ]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];

  for (let index = 0; index < sortedPages.length; index += 1) {
    const page = sortedPages[index];
    const previous = sortedPages[index - 1];
    if (previous != null && page - previous > 1) {
      result.push('ellipsis');
    }
    result.push(page);
  }

  return result;
}
