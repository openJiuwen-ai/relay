/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { UserProfile } from '../UserProfile';
interface ThreadSidebarFooterProps {
  isSidebarCollapsedLayout: boolean;
  sidebarContentRevealClassName: string;
}

export function ThreadSidebarFooter({
  isSidebarCollapsedLayout,
  sidebarContentRevealClassName,
}: ThreadSidebarFooterProps) {
  return (
    <>
      {!isSidebarCollapsedLayout && <div className="mx-4 border-t border-[var(--border-default)]" />}

      <UserProfile collapsed={isSidebarCollapsedLayout} />
    </>
  );
}
