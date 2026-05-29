/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { SkillRef } from '../types';

interface InspirationSkillTagsProps {
  skills: SkillRef[];
}

export function InspirationSkillTags({ skills }: InspirationSkillTagsProps) {
  if (skills.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {skills.map((skill) => (
        <span
          key={skill.id}
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]"
        >
          {skill.icon && (
            <img src={skill.icon} alt="" className="w-3 h-3 mr-1" onError={(e) => {
              e.currentTarget.style.display = 'none';
            }} />
          )}
          {skill.name}
        </span>
      ))}
    </div>
  );
}
