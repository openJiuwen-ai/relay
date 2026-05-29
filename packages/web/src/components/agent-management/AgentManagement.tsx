/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useEffect } from 'react';
import { AgentManagementView } from './AgentManagementView';
import { usePanelState } from './hooks/usePanelState';
import type { PanelView } from './types';
import { useConfirm } from '@/components/useConfirm';
import { apiFetch } from '@/utils/api-client';
import { useToastStore } from '@/stores/toastStore';
import type { AgentData } from '@/hooks/useAgentData';

interface AgentManagementProps {
  prefillData?: Partial<AgentData> | null;
  onPrefillConsumed?: () => void;
  onViewChange?: (view: PanelView) => void;
}

export function AgentManagement({ prefillData: externalPrefill, onPrefillConsumed, onViewChange }: AgentManagementProps = {}) {
  const state = usePanelState();
  const confirm = useConfirm();
  const addToast = useToastStore((s) => s.addToast);

  // Sync external prefill into panel state
  useEffect(() => {
    if (externalPrefill) {
      state.prefillAgent(externalPrefill);
      onPrefillConsumed?.();
    }
  }, [externalPrefill]);

  // Notify parent of view changes
  useEffect(() => {
    onViewChange?.(state.currentView);
  }, [state.currentView, onViewChange]);

  const handleOpenEdit = useCallback((agentId: string) => {
    state.handleOpenEdit(agentId);
  }, [state]);

  const handleDeleteAgent = useCallback(
    async (agentId: string) => {
      const agent = state.agents.find((a) => a.id === agentId);
      if (!agent) return;

      const confirmed = await confirm({
        title: '确认删除智能体',
        message: `确定要删除智能体「${agent.displayName}」吗？删除后将不可恢复。`,
        confirmLabel: '删除',
        cancelLabel: '取消',
      });
      if (!confirmed) return;

      try {
        const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        addToast({ type: 'success', title: '删除成功', message: `智能体「${agent.displayName}」已删除`, duration: 2600 });
        await state.refresh();
      } catch {
        addToast({ type: 'error', title: '删除失败', message: '智能体删除失败，请稍后重试', duration: 2600 });
      }
    },
    [state, confirm],
  );

  const handleBackToDetail = useCallback(() => {
    state.setCurrentView('detail');
  }, [state]);

  const handleSaveSuccess = useCallback(() => {
    state.handleCancel();
    void state.refresh();
  }, [state]);

  const handleBackToList = useCallback(() => {
    state.setCurrentView('list');
  }, [state]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AgentManagementView
        agents={state.agents}
        filteredAgents={state.filteredAgents}
        searchQuery={state.searchQuery}
        sourceFilter={state.sourceFilter}
        selectedAgent={state.selectedAgent}
        currentView={state.currentView}
        formMode={state.formMode}
        editingAgent={state.editingAgent}
        previousView={state.previousView}
        prefillData={state.prefillData}
        onSearchChange={state.setSearchQuery}
        onClearSearch={() => state.setSearchQuery('')}
        onSourceFilterChange={state.setSourceFilter}
        onRefresh={state.refresh}
        onSelectAgent={state.handleSelectAgent}
        onOpenCreate={state.handleOpenCreate}
        onOpenEdit={handleOpenEdit}
        onDeleteAgent={handleDeleteAgent}
        onCancel={state.handleCancel}
        onSaveSuccess={handleSaveSuccess}
        onBackToDetail={handleBackToDetail}
        onBackToList={handleBackToList}
      />
    </div>
  );
}