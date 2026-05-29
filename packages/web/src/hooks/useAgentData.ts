/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

/**
 * F32-b Phase 3: Central hook for dynamic agent data from /api/agents.
 * Fetches once per session, caches module-level. All consumers share same data.
 * Falls back to static OFFICE_CLAW_CONFIGS from @openjiuwen/relay-shared during initial load.
 */

import { OFFICE_CLAW_CONFIGS } from '@openjiuwen/relay-shared';
import { useEffect, useMemo, useState } from 'react';
import { refreshMentionData } from '@/lib/mention-highlight';
import { apiFetch } from '@/utils/api-client';
import { refreshSpeechAliases } from '@/utils/transcription-corrector';

export interface AgentData {
  id: string;
  name?: string;
  displayName: string;
  nickname?: string;
  color: { primary: string; secondary: string };
  mentionPatterns: string[];
  breedId?: string;
  accountRef?: string;
  /** Legacy compatibility while older runtime data is migrated. */
  providerProfileId?: string;
  provider: string;
  defaultModel: string;
  commandArgs?: string[];
  cliConfigArgs?: string[];
  ocProviderName?: string;
  embeddedAcpExecutablePath?: string;
  embeddedAcpConfig?: {
    executablePath?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    provider?: 'openai_compatible' | 'bigmodel' | 'minimax' | 'echo';
    baseUrl?: string;
    apiKey?: string;
    headers?: Record<string, string>;
    sslVerify?: boolean | null;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    contextWindow?: number;
    connectTimeoutSeconds?: number;
  };
  contextBudget?: {
    maxPromptTokens: number;
    maxContextTokens: number;
    maxMessages: number;
    maxContentLengthPerMsg: number;
  };
  avatar: string;
  roleDescription: string;
  personality: string;
  teamStrengths?: string;
  caution?: string | null;
  strengths?: string[];
  sessionChain?: boolean;
  /** F32-b P4: Human-readable variant label (e.g. "4.5", "Sonnet") */
  variantLabel?: string;
  /** F32-b P4: Whether this is the default variant for its breed */
  isDefaultVariant?: boolean;
  /** F32-b P4: Breed-level display name (e.g. "办公智能体"), for group headings */
  breedDisplayName?: string;
  /** F127: Seed agents come from office-claw-template.json; runtime agents are added later */
  source: 'seed' | 'runtime';
  /** Optional creation provenance for runtime-created agents. */
  creationSource?: 'experts-plaza';
  /** Preset experts are hidden from the generic mention list and shown per thread. */
  expert?: boolean;
  embeddedRuntimeKind?: 'agentteams_acp';
  /** 技能白名单配置 */
  skills?: string[];
  /** F127: Roster metadata used by Hub ownership/lead markers */
  roster?: {
    family: string;
    roles: string[];
    lead: boolean;
    available: boolean;
    evaluation: string;
  } | null;
}

// ── Module-level cache ──────────────────────────────────
let _cached: AgentData[] | null = null;
let _fetchPromise: Promise<FetchResult> | null = null;
const _listeners = new Set<(agents: AgentData[]) => void>();
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10_000;

function notifyListeners(agents: AgentData[]): void {
  for (const listener of _listeners) {
    listener(agents);
  }
}

function buildFallbackAgents(): AgentData[] {
  return Object.values(OFFICE_CLAW_CONFIGS).map((c) => ({
    id: c.id as string,
    displayName: c.displayName,
    nickname: c.nickname,
    color: { primary: c.color.primary, secondary: c.color.secondary },
    mentionPatterns: [...c.mentionPatterns],
    breedId: undefined,
    provider: c.provider,
    defaultModel: c.defaultModel,
    avatar: c.avatar,
    roleDescription: c.roleDescription,
    personality: c.personality,
    teamStrengths: c.teamStrengths,
    caution: c.caution,
    strengths: c.strengths ? [...c.strengths] : undefined,
    sessionChain: c.sessionChain,
      roster: null,
      source: 'seed',
      creationSource: c.creationSource,
      expert: false,
  }));
}

interface FetchResult {
  agents: AgentData[];
  fromApi: boolean;
}

async function fetchAgents(): Promise<FetchResult> {
  try {
    const res = await apiFetch('/api/agents');
    if (!res.ok) return { agents: buildFallbackAgents(), fromApi: false };
    const data = await res.json();
    const agents = Array.isArray(data?.agents) ? normalizeAgents(data.agents) : null;
    return agents ? { agents, fromApi: true } : { agents: buildFallbackAgents(), fromApi: false };
  } catch {
    return { agents: buildFallbackAgents(), fromApi: false };
  }
}

function normalizeAgents(rawAgents: unknown[]): AgentData[] {
  return rawAgents.map((raw) => {
    const agent = raw as Partial<AgentData>;
    return {
      ...agent,
      id: agent.id ?? '',
      displayName: agent.displayName ?? agent.id ?? '',
      color: agent.color ?? { primary: '#000000', secondary: '#ffffff' },
      mentionPatterns: Array.isArray(agent.mentionPatterns) ? agent.mentionPatterns : [],
      accountRef: agent.accountRef ?? agent.providerProfileId,
      provider: agent.provider ?? 'openai',
      defaultModel: agent.defaultModel ?? '',
      avatar: agent.avatar ?? '',
      roleDescription: agent.roleDescription ?? '',
      personality: agent.personality ?? '',
      embeddedAcpExecutablePath: agent.embeddedAcpExecutablePath,
      embeddedAcpConfig: agent.embeddedAcpConfig,
      teamStrengths: agent.teamStrengths,
      caution: agent.caution,
      strengths: Array.isArray(agent.strengths) ? agent.strengths : undefined,
      sessionChain: agent.sessionChain,
      roster: agent.roster ?? null,
      source: agent.source ?? 'seed',
      creationSource: agent.creationSource,
      expert: agent.expert ?? false,
      embeddedRuntimeKind: agent.embeddedRuntimeKind,
      skills: Array.isArray(agent.skills) ? agent.skills : undefined,
    };
  });
}

async function refreshAgentsNow(): Promise<FetchResult> {
  _cached = null;
  _fetchPromise = fetchAgents();
  const result = await _fetchPromise;
  if (result.fromApi) {
    _cached = result.agents;
  } else {
    _fetchPromise = null;
  }
  refreshMentionData(result.agents);
  refreshSpeechAliases(result.agents);
  notifyListeners(result.agents);
  return result;
}

// ── Hook ────────────────────────────────────────────────

export function useAgentData() {
  const [agents, setAgents] = useState<AgentData[]>(() => _cached ?? buildFallbackAgents());
  const [isLoading, setIsLoading] = useState(!_cached);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const listener = (nextAgents: AgentData[]) => {
      setAgents(nextAgents);
      setIsLoading(false);
    };
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (_cached) {
      setAgents(_cached);
      setIsLoading(false);
      return;
    }
    if (!_fetchPromise) {
      _fetchPromise = fetchAgents();
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    _fetchPromise.then(({ agents: result, fromApi }) => {
      if (fromApi) {
        _cached = result;
      } else {
        _fetchPromise = null;
        // Schedule retry for already-mounted hooks (max 3 attempts, 10s apart)
        if (retryCount < MAX_RETRIES) {
          retryTimer = setTimeout(() => {
            if (!cancelled) setRetryCount((c) => c + 1);
          }, RETRY_DELAY_MS);
        }
      }
      refreshMentionData(result);
      refreshSpeechAliases(result);
      notifyListeners(result);
      if (!cancelled) {
        setAgents(result);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [retryCount]);

  const refresh = useMemo(
    () => async () => {
      setIsLoading(true);
      const result = await refreshAgentsNow();
      setAgents(result.agents);
      setIsLoading(false);
      return result.agents;
    },
    [],
  );

  const getAgentById = useMemo(() => {
    const map = new Map(agents.map((a) => [a.id, a]));
    return (id: string) => map.get(id);
  }, [agents]);

  const getAgentsByBreed = useMemo(() => {
    return () => {
      const groups = new Map<string, AgentData[]>();
      for (const agent of agents) {
        const key = agent.breedId ?? agent.id;
        const arr = groups.get(key) ?? [];
        arr.push(agent);
        groups.set(key, arr);
      }
      return groups;
    };
  }, [agents]);

  return {
    agents,
    isLoading,
    getAgentById,
    getAgentsByBreed,
    refresh,
  };
}

/** Format agent name with optional variant label for multi-variant disambiguation */
export function formatAgentName(agent: { displayName: string; variantLabel?: string }): string {
  return agent.variantLabel ? `${agent.displayName}（${agent.variantLabel}）` : agent.displayName;
}

/** Get cached agents synchronously (for non-hook contexts). Returns fallback if not loaded. */
export function getCachedAgents(): AgentData[] {
  return _cached ?? buildFallbackAgents();
}

/** Reset module-level cache (for testing) */
export function _resetAgentDataCache(): void {
  _cached = null;
  _fetchPromise = null;
  _listeners.clear();
}
