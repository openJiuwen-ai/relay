/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState } from 'react';
import { AgentManagement } from './agent-management/AgentManagement';
import { ExpertsPanel } from './experts-panel/ExpertsPanel';
import type { PanelView } from './agent-management/types';
import type { AgentData } from '@/hooks/useAgentData';

type RootTabKey = 'agents' | 'experts';

const ROOT_TABS: Array<{ id: RootTabKey; label: string }> = [
  { id: 'agents', label: '智能体管理' },
  { id: 'experts', label: '智能体广场' },
];

export function AgentsPanel() {
  const [activeTab, setActiveTab] = useState<RootTabKey>('agents');
  const [prefillData, setPrefillData] = useState<Partial<AgentData> | null>(null);
  const [agentPanelView, setAgentPanelView] = useState<PanelView>('list');

  useEffect(() => {
    const handleSwitchToAgents = () => setActiveTab('agents');
    window.addEventListener('agents-panel:switch-to-agents', handleSwitchToAgents as EventListener);
    return () => {
      window.removeEventListener('agents-panel:switch-to-agents', handleSwitchToAgents as EventListener);
    };
  }, []);

  const handleAddExpert = (expert: Partial<AgentData>) => {
    setPrefillData({
      ...expert,
      creationSource: 'experts-plaza' as const,
    });
    setActiveTab('agents');
  };

  // Hide root tabs when in form or detail view within agent management
  const showRootTabs = activeTab === 'experts' || (activeTab === 'agents' && agentPanelView === 'list');

  return (
    <div className="ui-page-shell">
      {showRootTabs && (
        <>
          <div className="flex shrink-0 items-center gap-6 px-1">
            {ROOT_TABS.map((tab) => {
              const isActive = tab.id === activeTab;

              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`agents-panel-tab-${tab.id}`}
                  aria-pressed={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative pb-2 text-[14px] transition ${
                    isActive
                      ? 'font-semibold text-[var(--text-primary)]'
                      : 'font-medium text-[var(--text-label-secondary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div data-testid="agents-panel-divider" className="mb-6 h-px w-full shrink-0 bg-[var(--border-elevated)]" />
        </>
      )}

      <div className="min-h-0 flex-1">
        {activeTab === 'agents' ? (
          <AgentManagement
            prefillData={prefillData}
            onPrefillConsumed={() => setPrefillData(null)}
            onViewChange={setAgentPanelView}
          />
        ) : (
          <ExpertsPanel onAddExpert={handleAddExpert} />
        )}
      </div>
    </div>
  );
}
