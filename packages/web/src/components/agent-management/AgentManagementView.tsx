/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentData } from '@/hooks/useAgentData';
import { MaskIcon } from '@/components/shared/MaskIcon';
import type { FormMode, PanelView } from './types';
import { ListGrid } from './components/ListGrid';
import { Toolbar } from './components/Toolbar';
import { DetailContent } from './components/DetailContent';
import { DetailSkillsSection } from './components/DetailSkillsSection';
import { SoulConfig } from './components/SoulConfig';
import { FormContent } from './components/FormContent';
import { Button } from '@/components/shared/Button';

export interface AgentManagementViewProps {
  // State
  agents: AgentData[];
  filteredAgents: AgentData[];
  searchQuery: string;
  sourceFilter: import('./utils').AgentSourceFilter;
  selectedAgent: AgentData | null;
  currentView: PanelView;
  formMode: FormMode;
  editingAgent: AgentData | null;
  previousView: PanelView | null;
  prefillData: Partial<AgentData> | null;
  loading?: boolean;

  // Actions
  onSearchChange: (query: string) => void;
  onClearSearch: () => void;
  onSourceFilterChange: (filter: import('./utils').AgentSourceFilter) => void;
  onRefresh: () => void;
  onSelectAgent: (agentId: string) => void;
  onOpenCreate: () => void;
  onOpenEdit: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onCancel: () => void;
  onSaveSuccess: () => void;
  onBackToDetail: () => void;
  onBackToList: () => void;
}

function ListView({
  agents,
  filteredAgents,
  searchQuery,
  sourceFilter,
  onSearchChange,
  onClearSearch,
  onSourceFilterChange,
  onRefresh,
  onSelectAgent,
  onOpenCreate,
  onOpenEdit,
  onDeleteAgent,
  loading,
}: {
  agents: AgentData[];
  filteredAgents: AgentData[];
  searchQuery: string;
  sourceFilter: import('./utils').AgentSourceFilter;
  onSearchChange: (query: string) => void;
  onClearSearch: () => void;
  onSourceFilterChange: (filter: import('./utils').AgentSourceFilter) => void;
  onRefresh: () => void;
  onSelectAgent: (agentId: string) => void;
  onOpenCreate: () => void;
  onOpenEdit: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  loading?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="ui-page-title">智能体管理({agents.length})</h1>
        <Button variant="major" onClick={onOpenCreate}>
          新建智能体
        </Button>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Toolbar
          searchQuery={searchQuery}
          sourceFilter={sourceFilter}
          onSearchChange={onSearchChange}
          onClearSearch={onClearSearch}
          onSourceFilterChange={onSourceFilterChange}
          onRefresh={onRefresh}
          loading={loading}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <ListGrid
          agents={filteredAgents}
          onSelectAgent={onSelectAgent}
          onEditAgent={onOpenEdit}
          onDeleteAgent={onDeleteAgent}
          searchQuery={searchQuery}
          sourceFilter={sourceFilter}
          onClearSearch={onClearSearch}
          onClearFilter={() => onSourceFilterChange('all')}
        />
      </div>
    </div>
  );
}

function DetailView({
  agent,
  onOpenEdit,
  onBackToList,
}: {
  agent: AgentData;
  onOpenEdit: (agentId: string) => void;
  onBackToList: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-8">
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToList}
            className="text-[12px] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            智能体管理
          </button>
          <span className="text-[12px] text-[var(--text-muted)]">/</span>
          <span className="text-[12px] font-bold text-[var(--text-primary)]">{agent.displayName}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex items-center gap-3 pb-8">
          {agent.avatar && (agent.avatar.startsWith('/uploads/') || agent.avatar.startsWith('/avatars/') || /^https?:\/\//.test(agent.avatar)) ? (
            // biome-ignore lint/performance/noImgElement: runtime upload URL
            <img src={agent.avatar} alt={agent.displayName} className="h-10 w-10 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] text-[14px] font-medium text-white">
              {agent.displayName.charAt(0)}
            </div>
          )}
          <h1 className="min-w-0 flex-1 text-[20px] font-bold text-[var(--text-primary)]">{agent.displayName}</h1>
          <button
            type="button"
            onClick={() => onOpenEdit(agent.id)}
            className="inline-flex h-[18px] shrink-0 items-center gap-1 text-[12px] text-[var(--text-primary)] transition hover:underline hover:underline-offset-2"
          >
            <MaskIcon name="edit" className="h-3.5 w-3.5" />
            <span>编辑</span>
          </button>
        </div>

        <div className='border-b border-[var(--panel-border-outer)] '>
           <DetailContent agent={agent} />
        </div>
        <div className="mt-8">
          <SoulConfig personality={agent.personality} agentId={agent.id} readOnly muted={false} showTitle />
        </div>

        <div className="mt-8">
          <DetailSkillsSection agent={agent} />
        </div>
      </div>
    </div>
  );
}

function FormView({
  editingAgent,
  formMode,
  prefillData,
  onCancel,
  onSaveSuccess,
  onBackToDetail,
  onBackToList,
}: {
  editingAgent: AgentData | null;
  formMode: FormMode;
  prefillData: Partial<AgentData> | null;
  onCancel: () => void;
  onSaveSuccess: () => void;
  onBackToDetail: () => void;
  onBackToList: () => void;
}) {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <FormContent
        editingAgent={editingAgent}
        formMode={formMode}
        prefillData={prefillData}
        onCancel={onCancel}
        onSaveSuccess={onSaveSuccess}
        onBackToDetail={onBackToDetail}
        onBackToList={onBackToList}
      />
    </div>
  );
}

export function AgentManagementView({
  agents,
  filteredAgents,
  searchQuery,
  sourceFilter,
  selectedAgent,
  currentView,
  formMode,
  editingAgent,
  previousView,
  prefillData,
  loading,
  onSearchChange,
  onClearSearch,
  onSourceFilterChange,
  onRefresh,
  onSelectAgent,
  onOpenCreate,
  onOpenEdit,
  onDeleteAgent,
  onCancel,
  onSaveSuccess,
  onBackToDetail,
  onBackToList,
}: AgentManagementViewProps) {
  if (currentView === 'form') {
    return (
      <FormView
        editingAgent={editingAgent}
        formMode={formMode}
        prefillData={prefillData}
        onCancel={onCancel}
        onSaveSuccess={onSaveSuccess}
        onBackToDetail={onBackToDetail}
        onBackToList={onBackToList}
      />
    );
  }

  if (currentView === 'detail' && selectedAgent) {
    return (
      <DetailView
        agent={selectedAgent}
        onOpenEdit={onOpenEdit}
        onBackToList={onBackToList}
      />
    );
  }

  return (
    <ListView
      agents={agents}
      filteredAgents={filteredAgents}
      searchQuery={searchQuery}
      sourceFilter={sourceFilter}
      onSearchChange={onSearchChange}
      onClearSearch={onClearSearch}
      onSourceFilterChange={onSourceFilterChange}
      onRefresh={onRefresh}
      onSelectAgent={onSelectAgent}
      onOpenCreate={onOpenCreate}
      onOpenEdit={onOpenEdit}
      onDeleteAgent={onDeleteAgent}
      loading={loading}
    />
  );
}