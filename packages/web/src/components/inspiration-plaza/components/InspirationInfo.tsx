/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { useCreateSameFlow } from '../hooks/useCreateSameFlow';
import type { InspirationTemplateDetail } from '../types';
import { AgentCardList } from './AgentCard';
import { CreateSessionDialog } from './CreateSessionDialog';
import { InspirationTag } from './InspirationTag';
import { SkillCardList } from './SkillCard';

interface InspirationInfoProps {
  template: InspirationTemplateDetail;
}

export function InspirationInfo({ template }: InspirationInfoProps) {
  const [showDialog, setShowDialog] = useState(false);
  const createSame = useCreateSameFlow(template);

  const handleDoSame = () => {
    setShowDialog(true);
  };

  const handleCreateNew = () => {
    void createSame({ kind: 'new' });
  };

  const handleSelectExisting = (threadId: string) => {
    void createSame({ kind: 'existing', threadId });
  };

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-card)]">
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="truncate text-sm font-medium text-[var(--text-primary)]" title={template.name}>
            {template.name}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {template.skills.slice(0, 3).map((skill) => (
              <InspirationTag key={skill.id} label={skill.name} iconSrc={skill.icon} tone="skill" />
            ))}
            {template.agents.slice(0, 2).map((agent) => (
              <InspirationTag key={agent.id} label={agent.name} iconSrc={agent.icon} tone="agent" />
            ))}
          </div>

          <div className="mt-6">
            <Button variant="major" size="lg" block onClick={handleDoSame}>
              创建同款
            </Button>
          </div>

          {template.skills.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-medium text-[var(--text-primary)]">使用的技能</h3>
              <SkillCardList skills={template.skills} />
            </div>
          )}

          {template.agents.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-medium text-[var(--text-primary)]">使用的智能体</h3>
              <AgentCardList agents={template.agents} />
            </div>
          )}

          <div className="mt-6">
            <h3 className="mb-2 text-sm font-medium text-[var(--text-primary)]">详细介绍</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
              {template.description}
            </p>
          </div>
        </div>
      </div>

      <CreateSessionDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onCreateNew={handleCreateNew}
        onSelectExisting={handleSelectExisting}
      />
    </>
  );
}
