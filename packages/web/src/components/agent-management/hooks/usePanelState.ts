/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useMemo, useState } from 'react';
import { useAgentData, type AgentData } from '@/hooks/useAgentData';
import type { FormMode, PanelView } from '../types';
import { filterAgents, type AgentSourceFilter } from '../utils';

export interface UsePanelStateResult {
  agents: AgentData[];
  filteredAgents: AgentData[];
  searchQuery: string;
  sourceFilter: AgentSourceFilter;
  selectedAgentId: string | null;
  selectedAgent: AgentData | null;
  currentView: PanelView;
  formMode: FormMode;
  editingAgentId: string | null;
  editingAgent: AgentData | null;
  previousView: PanelView | null;
  prefillData: Partial<AgentData> | null;
  setSearchQuery: (query: string) => void;
  setSourceFilter: (filter: AgentSourceFilter) => void;
  setSelectedAgentId: (id: string | null) => void;
  setCurrentView: (view: PanelView) => void;
  setFormMode: (mode: FormMode) => void;
  setEditingAgentId: (id: string | null) => void;
  setPreviousView: (view: PanelView | null) => void;
  handleSelectAgent: (agentId: string) => void;
  handleOpenCreate: () => void;
  handleOpenEdit: (agentId: string) => void;
  handleCancel: () => void;
  refresh: () => Promise<AgentData[]>;
  prefillAgent: (data: Partial<AgentData>) => void;
}

export function usePanelState(): UsePanelStateResult {
  const { agents = [], refresh } = useAgentData();
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<AgentSourceFilter>('all');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<PanelView>('list');
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [previousView, setPreviousView] = useState<PanelView | null>(null);
  const [prefillData, setPrefillData] = useState<Partial<AgentData> | null>(null);

  const filteredAgents = useMemo(() => filterAgents(agents, searchQuery, sourceFilter), [agents, searchQuery, sourceFilter]);

  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    return agents.find((agent) => agent.id === selectedAgentId) ?? null;
  }, [agents, selectedAgentId]);

  const editingAgent = useMemo(() => {
    if (!editingAgentId) return null;
    return agents.find((agent) => agent.id === editingAgentId) ?? null;
  }, [agents, editingAgentId]);

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setPreviousView(currentView);
    setCurrentView('detail');
  }, [currentView]);

  const handleOpenCreate = useCallback(() => {
    setEditingAgentId(null);
    setFormMode('create');
    setPreviousView(currentView);
    setCurrentView('form');
  }, [currentView]);

  const handleOpenEdit = useCallback((agentId: string) => {
    setEditingAgentId(agentId);
    setSelectedAgentId(agentId);
    setFormMode('edit');
    setPreviousView(currentView);
    setCurrentView('form');
  }, [currentView]);

  const handleCancel = useCallback(() => {
    if (previousView) {
      setCurrentView(previousView);
      setPreviousView(null);
    } else {
      setCurrentView('list');
    }
    setEditingAgentId(null);
    setPrefillData(null);
  }, [previousView]);

  const prefillAgent = useCallback((data: Partial<AgentData>) => {
    setPrefillData(data);
    setFormMode('create');
    setPreviousView(currentView);
    setCurrentView('form');
  }, [currentView]);

  return {
    agents,
    filteredAgents,
    searchQuery,
    sourceFilter,
    selectedAgentId,
    selectedAgent,
    currentView,
    formMode,
    editingAgentId,
    editingAgent,
    previousView,
    prefillData,
    setSearchQuery,
    setSourceFilter,
    setSelectedAgentId,
    setCurrentView,
    setFormMode,
    setEditingAgentId,
    setPreviousView,
    handleSelectAgent,
    handleOpenCreate,
    handleOpenEdit,
    handleCancel,
    refresh,
    prefillAgent,
  };
}