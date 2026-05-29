/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAvailableClients } from '@/hooks/useAvailableClients';
import { useAgentData } from '@/hooks/useAgentData';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import {
  AccordionSection,
  ALL_TABS,
  findGroupForTab,
  HUB_GROUPS,
  type HubTabId,
  resolveRequestedHubTab,
} from './office-claw-hub.navigation';
import { AgentOverviewTab, type ConfigData, SystemTab } from './config-viewer-tabs';
import { CapabilityTab } from './skills-panel/components/CapabilityTab';
import { HubAgentEditor } from './HubAgentEditor';
import { HubClaudeRescueSection } from './HubClaudeRescueSection';
import { HubCoCreatorEditor } from './HubCoCreatorEditor';
import { HubCommandsTab } from './HubCommandsTab';
import { HubEnvFilesTab } from './HubEnvFilesTab';
import { HubGovernanceTab } from './HubGovernanceTab';
import { HubProviderProfilesTab } from './HubProviderProfilesTab';
import { HubRoutingPolicyTab } from './HubRoutingPolicyTab';
import { SkillsTab } from './skills-panel/components/SkillsTab';
import { PushSettingsPanel } from './PushSettingsPanel';
import { VoiceSettingsPanel } from './VoiceSettingsPanel';

export type { HubTabId } from './office-claw-hub.navigation';
export { findGroupForTab, resolveRequestedHubTab } from './office-claw-hub.navigation';

/* ─── Main Hub modal ─── */
export function OfficeClawHub() {
  const hubState = useChatStore((s) => s.hubState);
  const closeHub = useChatStore((s) => s.closeHub);
  const { agents, getAgentById, refresh } = useAgentData();
  const { clientLabels, uiHints } = useAvailableClients();

  const hiddenTabs = new Set(uiHints.hiddenHubTabs);
  const visibleGroups = useMemo(
    () =>
      HUB_GROUPS.map((group) => ({
        ...group,
        tabs: group.tabs.filter((t) => !hiddenTabs.has(t.id)),
      })).filter((group) => group.tabs.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uiHints.hiddenHubTabs.join()],
  );

  const open = hubState?.open ?? false;
  const rawRequestedTab = hubState?.tab as HubTabId | undefined;
  const normalizedRequestedTab = rawRequestedTab ? resolveRequestedHubTab(rawRequestedTab, getAgentById) : undefined;

  const [tab, setTab] = useState<HubTabId>('agents');
  const [expandedGroup, setExpandedGroup] = useState<string | null>('agents');
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [capTabEverOpened, setCapTabEverOpened] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [coCreatorEditorOpen, setCoCreatorEditorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<(typeof agents)[number] | null>(null);
  const [createDraft, setCreateDraft] = useState<Parameters<typeof HubAgentEditor>[0]['draft']>(null);
  const [togglingAgentId, setTogglingAgentId] = useState<string | null>(null);

  // P1 fix: Render-time state sync (React 18 "adjusting state on props change" pattern).
  // Avoids first-frame flash that useEffect would cause on deep-link opens.
  const [lastSyncKey, setLastSyncKey] = useState('');
  const syncKey = open ? `open:${normalizedRequestedTab ?? ''}` : 'closed';
  if (syncKey !== lastSyncKey) {
    setLastSyncKey(syncKey);
    if (open) {
      if (!normalizedRequestedTab) {
        setExpandedGroup('agents');
        setTab('agents');
      } else {
        const group = findGroupForTab(normalizedRequestedTab);
        setExpandedGroup(group?.id ?? 'agents');
        setTab(group ? normalizedRequestedTab : 'agents');
      }
    }
  }

  useEffect(() => {
    if (!open) return;
    const isValid = ALL_TABS.some((t) => t.id === tab);
    if (!isValid) setTab('agents');
  }, [open, tab]);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroup((prev) => (prev === groupId ? null : groupId));
  }, []);

  const selectTab = useCallback((tabId: HubTabId) => {
    setTab(tabId);
  }, []);

  const openAddMember = useCallback(() => {
    setEditingAgent(null);
    setCreateDraft(null);
    setEditorOpen(true);
  }, []);

  const openEditMember = useCallback((agent: (typeof agents)[number]) => {
    setCreateDraft(null);
    setEditingAgent(agent);
    setEditorOpen(true);
  }, []);

  const openCoCreatorEditor = useCallback(() => {
    setCoCreatorEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingAgent(null);
    setCreateDraft(null);
  }, []);

  const closeCoCreatorEditor = useCallback(() => {
    setCoCreatorEditorOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (tab === 'capabilities') setCapTabEverOpened(true);
  }, [open, tab]);

  const fetchData = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await apiFetch('/api/config');
      if (res.ok) {
        const d = (await res.json()) as { config: ConfigData };
        setConfig(d.config);
      } else {
        setFetchError('配置加载失败');
      }
    } catch {
      setFetchError('网络错误');
    }
  }, []);

  const handleEditorSaved = useCallback(async () => {
    await Promise.all([fetchData(), refresh()]);
  }, [fetchData, refresh]);

  const handleToggleAvailability = useCallback(
    async (agent: (typeof agents)[number]) => {
      setTogglingAgentId(agent.id);
      setFetchError(null);
      try {
        const res = await apiFetch(`/api/agents/${agent.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ available: agent.roster?.available === false }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          setFetchError((payload.error as string) ?? `成员状态切换失败 (${res.status})`);
          return;
        }
        await Promise.all([fetchData(), refresh()]);
      } catch {
        setFetchError('成员状态切换失败');
      } finally {
        setTogglingAgentId(null);
      }
    },
    [fetchData, refresh],
  );

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const modalRef = useRef<HTMLDivElement>(null);

  // Trap focus inside modal when open — prevents keystrokes leaking to sidebar search
  useEffect(() => {
    if (!open) return;
    const el = modalRef.current;
    if (el) el.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeHub();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, closeHub]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-medium)]">
      <div
        ref={modalRef}
        tabIndex={-1}
        className="rounded-2xl shadow-xl max-w-4xl w-full mx-4 h-[85vh] flex flex-col outline-none"
        style={{ background: 'var(--surface-app)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ flexShrink: 0 }}>
          <h2 className="text-base font-bold text-[var(--text-primary)]">OfficeClaw Hub</h2>
          <button
            onClick={closeHub}
            className="text-lg text-[var(--text-label-secondary)] transition-colors hover:text-[var(--text-primary)]"
            title="关闭"
            aria-label="关闭"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3" style={{ minHeight: 0 }}>
          {fetchError && (
            <p className="rounded-lg bg-[var(--state-error-surface)] px-3 py-2 text-sm text-[var(--state-error-text)]">
              {fetchError}
            </p>
          )}

          {/* Accordion navigation */}
          <div className="space-y-2">
            {visibleGroups.map((g) => (
              <AccordionSection
                key={g.id}
                group={g}
                expanded={expandedGroup === g.id}
                activeTab={tab}
                onToggle={() => toggleGroup(g.id)}
                onSelectTab={selectTab}
              />
            ))}
          </div>

          {/* Tab content */}
          <div className="rounded-xl bg-[var(--surface-panel)] p-4 shadow-[var(--card-shadow)]">
            {(tab === 'capabilities' || capTabEverOpened) && (
              <div className={tab === 'capabilities' ? '' : 'hidden'}>
                <CapabilityTab hideSkillMountStatus={uiHints.hideSkillMountStatus} />
              </div>
            )}
            {tab === 'agents' &&
              (config ? (
                <AgentOverviewTab
                  config={config}
                  members={agents}
                  clientLabels={Object.keys(clientLabels).length > 0 ? clientLabels : undefined}
                  onAddMember={openAddMember}
                  onEditCoCreator={openCoCreatorEditor}
                  onEditMember={openEditMember}
                  onToggleAvailability={handleToggleAvailability}
                  togglingAgentId={togglingAgentId}
                />
              ) : !fetchError ? (
                <p className="text-sm text-[var(--text-label-secondary)]">加载中...</p>
              ) : null)}
            {tab === 'system' &&
              (config ? (
                <SystemTab config={config} hiddenHubTabs={uiHints.hiddenHubTabs} />
              ) : !fetchError ? (
                <p className="text-sm text-[var(--text-label-secondary)]">加载中...</p>
              ) : null)}
            {tab === 'commands' && <HubCommandsTab />}
            {tab === 'routing' && <HubRoutingPolicyTab />}
            {tab === 'env' && <HubEnvFilesTab hiddenCategories={uiHints.hiddenEnvCategories} hideAgentGuides={uiHints.hideAgentGuides} />}
            {tab === 'provider-profiles' && <HubProviderProfilesTab />}
            {tab === 'voice' && <VoiceSettingsPanel />}
            {tab === 'notify' && <PushSettingsPanel />}
            {tab === 'governance' && <HubGovernanceTab />}
            {tab === 'rescue' && <HubClaudeRescueSection />}
            {tab === 'skills' && <SkillsTab />}
          </div>
        </div>
        <HubAgentEditor
          open={editorOpen}
          member={editingAgent}
          configAgent={editingAgent ? config?.agents[editingAgent.id] : undefined}
          draft={createDraft}
          onClose={closeEditor}
          onSaved={handleEditorSaved}
        />
        <HubCoCreatorEditor
          open={coCreatorEditorOpen}
          coCreator={config?.coCreator}
          onClose={closeCoCreatorEditor}
          onSaved={handleEditorSaved}
        />
      </div>
    </div>
  );
}
