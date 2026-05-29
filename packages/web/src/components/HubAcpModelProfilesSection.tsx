/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { HubAcpModelProfileItem, type AcpModelProfileEditPayload } from './HubAcpModelProfileItem';
import type { AcpModelProfileItem } from './hub-provider-profiles.types';

export function HubAcpModelProfilesSection({
  profiles,
  busyId,
  onSave,
  onDelete,
}: {
  profiles: AcpModelProfileItem[];
  busyId: string | null;
  onSave: (profileId: string, payload: AcpModelProfileEditPayload) => Promise<void>;
  onDelete: (profileId: string) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-[#5C5AB1]">ACP Model Profiles</p>
      {profiles.map((profile) => (
        <HubAcpModelProfileItem
          key={profile.id}
          profile={profile}
          busy={busyId === profile.id}
          onSave={onSave}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
