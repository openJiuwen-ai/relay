/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { LoadingSmall } from '../LoadingSmall';

export function CenteredLoadingState() {
  return (
    <div
      className="flex h-full min-h-[240px] w-full items-center justify-center"
      data-testid="skills-loading-state"
      aria-label="loading"
    >
      <LoadingSmall className="h-4 w-4" />
    </div>
  );
}
