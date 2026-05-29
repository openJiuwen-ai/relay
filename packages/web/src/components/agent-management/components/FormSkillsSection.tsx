/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useState } from 'react';
import type { AgentData } from '@/hooks/useAgentData';
import { MaskIcon } from '@/components/shared/MaskIcon';
import { SkillSelectorDrawer } from './SkillSelectorDrawer';
import type { SkillBasicInfo } from './skill-basic-info-cache';
export type { SkillBasicInfo } from './skill-basic-info-cache';
import { NameInitialIcon } from '@/components/NameInitialIcon';
import styles from './FormSkillsSection.module.css';

interface FormSkillsSectionProps {
  editingAgent?: AgentData | null;
  skills: string[];
  skillBasicInfos?: Map<string, SkillBasicInfo>;
  onSkillsChange: (skills: string[], skillBasicInfos?: Map<string, SkillBasicInfo>) => void;
}

export function FormSkillsSection({ editingAgent, skills, skillBasicInfos, onSkillsChange }: FormSkillsSectionProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const readOnly = editingAgent?.source === 'seed';

  const handleRemoveSkill = useCallback(
    (skillToRemove: string) => {
      const newSkills = skills.filter((s) => s !== skillToRemove);
      const newDetails = new Map(skillBasicInfos);
      newDetails.delete(skillToRemove);
      onSkillsChange(newSkills, newDetails);
    },
    [skills, skillBasicInfos, onSkillsChange],
  );

  const handleConfirm = useCallback(
    (selectedSkills: string[], selectedSkillBasicInfos?: Map<string, SkillBasicInfo>) => {
      onSkillsChange(selectedSkills, selectedSkillBasicInfos);
      setDrawerOpen(false);
    },
    [onSkillsChange],
  );

  return (
    <div className="pt-6">
      <div className="flex items-center justify-between gap-4 pb-4">
        <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">技能配置</h2>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex h-[18px] shrink-0 items-center gap-1 text-[12px] text-[var(--text-primary)] transition hover:underline hover:underline-offset-2"
          >
            <MaskIcon name="add" className="h-3.5 w-3.5" />
            <span>添加技能</span>
          </button>
        )}
      </div>

      {skills.length > 0 ? (
        <div className={styles.skillGrid}>
          {skills.map((skill) => (
            <div key={skill} className={styles.skillCard}>
              <NameInitialIcon name={skill} className={styles.cardIcon} />
              <div className={styles.cardContent}>
                <span className={styles.cardName}>{skill}</span>
                {skillBasicInfos?.get(skill)?.description && (
                  <span className={styles.cardDescription}>{skillBasicInfos.get(skill)?.description}</span>
                )}
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleRemoveSkill(skill)}
                  className={styles.deleteButton}
                  aria-label={`删除技能 ${skill}`}
                >
                  <MaskIcon name="delete" className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>暂未配置技能</div>
      )}

      <SkillSelectorDrawer
        open={drawerOpen}
        selectedSkills={skills}
        skillBasicInfos={skillBasicInfos}
        onConfirm={handleConfirm}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}