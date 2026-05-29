/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useEffect, useState } from 'react';
import type { AgentData } from '@/hooks/useAgentData';
import { NameInitialIcon } from '@/components/NameInitialIcon';
import { getSkillBasicInfo, setSkillBasicInfo } from './skill-basic-info-cache';
import { apiFetch } from '@/utils/api-client';
import styles from './DetailSkillsSection.module.css';

export interface DetailSkillsSectionProps {
  agent: AgentData;
}

interface SkillDetailResponse {
  name: string;
  description?: string;
  category?: string;
  triggers?: string[];
}

export function DetailSkillsSection({ agent }: DetailSkillsSectionProps) {
  const skills = agent.skills;
  const [loadingSkills, setLoadingSkills] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!skills || skills.length === 0) return;

    // Check which skills are missing from cache and need to be fetched
    const missingSkills = skills.filter((name) => !getSkillBasicInfo(name));
    if (missingSkills.length === 0) return;

    setLoadingSkills(new Set(missingSkills));

    // Fetch details for missing skills in parallel
    Promise.all(
      missingSkills.map(async (skillName) => {
        try {
          const res = await apiFetch(`/api/skills/detail?name=${encodeURIComponent(skillName)}`);
          if (res.ok) {
            const data = (await res.json()) as SkillDetailResponse;
            setSkillBasicInfo(skillName, {
              name: data.name,
              description: data.description,
            });
          }
        } finally {
          setLoadingSkills((prev) => {
            const next = new Set(prev);
            next.delete(skillName);
            return next;
          });
        }
      }),
    );
  }, [skills]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">技能配置</h2>

      {skills && skills.length > 0 ? (
        <div className={styles.skillGrid}>
          {skills.map((skillName) => {
            const skillInfo = getSkillBasicInfo(skillName);
            const isLoading = loadingSkills.has(skillName);
            return (
              <div key={skillName} className={styles.skillCard}>
                <NameInitialIcon name={skillName} className={styles.cardIcon} />
                <div className={styles.cardContent}>
                  <span className={styles.cardName}>{skillName}</span>
                  {isLoading ? (
                    <span className={styles.cardDescription}>加载中...</span>
                  ) : (
                    skillInfo?.description && (
                      <span className={styles.cardDescription}>{skillInfo.description}</span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className={styles.emptyState}>未配置</p>
      )}
    </div>
  );
}