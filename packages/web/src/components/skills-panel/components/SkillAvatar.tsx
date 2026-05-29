/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { NameInitialIcon } from '../../NameInitialIcon';

export function SkillAvatar({
  avatarName,
  avatarUrl,
  className = '',
  dataTestId,
}: {
  avatarName: string;
  avatarUrl?: string | null;
  className?: string;
  dataTestId?: string;
}) {
  const normalizedAvatarUrl = avatarUrl?.trim();

  if (normalizedAvatarUrl) {
    return (
      <img
        src={normalizedAvatarUrl}
        alt={`${avatarName} avatar`}
        data-testid={dataTestId}
        className={`h-12 w-12 shrink-0 rounded-[10px] border border-[var(--border-default)] object-cover shadow-sm ${className}`.trim()}
      />
    );
  }

  return <NameInitialIcon name={avatarName} className={className} dataTestId={dataTestId} />;
}
