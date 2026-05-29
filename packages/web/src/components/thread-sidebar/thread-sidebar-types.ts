/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { UseThreadSidebarActionResult } from './useThreadSidebarActions';
import type { UseThreadSidebarDataResult } from './useThreadSidebarData';
import type { UseThreadSidebarLayoutResult } from './useThreadSidebarLayout';

export interface ThreadSidebarProps {
  onClose?: () => void;
  className?: string;
  onThreadSelect?: () => void;
}

export type ThreadSidebarControllerResult =
  & { className?: string }
  & UseThreadSidebarLayoutResult
  & UseThreadSidebarDataResult
  & UseThreadSidebarActionResult;
