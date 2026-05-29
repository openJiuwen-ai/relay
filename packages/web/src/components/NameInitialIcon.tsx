/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { getNameInitial, getNameInitialIconTheme } from '@/lib/name-initial-icon';

export function NameInitialIcon({
  name,
  className = '',
  dataTestId,
}: {
  name: string;
  className?: string;
  dataTestId?: string;
}) {
  const initial = getNameInitial(name);
  const theme = getNameInitialIconTheme(name);

  return (
    <div
      aria-hidden="true"
      data-testid={dataTestId}
      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border shadow-sm ${className}`.trim()}
      style={{ background: theme.background, borderColor: theme.borderColor }}
    >
      <span className="select-none text-xl font-bold leading-none tracking-[0.02em]" style={{ color: theme.textColor }}>
        {initial}
      </span>
    </div>
  );
}
