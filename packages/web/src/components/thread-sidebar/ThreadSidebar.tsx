/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { ThreadSidebarView } from './ThreadSidebarView';
import { useThreadSidebarController } from './useThreadSidebarController';

interface ThreadSidebarProps {
  onClose?: () => void;
  className?: string;
  onThreadSelect?: () => void;
}

export function ThreadSidebar(props: ThreadSidebarProps) {
  const controller = useThreadSidebarController(props);
  return <ThreadSidebarView {...controller} />;
}
