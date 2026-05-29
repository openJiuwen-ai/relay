/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

export interface AvailableClient {
  id: string;
  label: string;
  command: string;
  available: boolean;
}

export interface UiHints {
  hiddenHubTabs: string[];
  hiddenEnvCategories: string[];
  hideSkillMountStatus: boolean;
  hideAgentGuides: boolean;
}

interface AvailableClientsState {
  clients: AvailableClient[];
  clientLabels: Record<string, string>;
  uiHints: UiHints;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches the list of known clients and their runtime availability.
 *
 * The Hub configuration UI must keep showing known clients even when a
 * particular CLI is not installed on this machine yet; otherwise packaged
 * runtimes hide valid configuration paths such as OpenAI/Anthropic bindings.
 */
export function useAvailableClients(): AvailableClientsState {
  const [state, setState] = useState<AvailableClientsState>({
    clients: [],
    clientLabels: {},
    uiHints: { hiddenHubTabs: [], hiddenEnvCategories: [], hideSkillMountStatus: false, hideAgentGuides: false },
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/available-clients')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load available clients (${res.status})`);
        return (await res.json()) as { clients: AvailableClient[]; clientLabels?: Record<string, string>; uiHints?: UiHints };
      })
      .then((body) => {
        if (!cancelled) {
          const derivedClientLabels = Object.fromEntries(
            body.clients
              .filter((client) => client.label.trim().length > 0)
              .map((client) => [client.id, client.label]),
          );
          setState({
            clients: body.clients,
            clientLabels: { ...derivedClientLabels, ...(body.clientLabels ?? {}) },
            uiHints: body.uiHints ?? { hiddenHubTabs: [], hiddenEnvCategories: [], hideSkillMountStatus: false, hideAgentGuides: false },
            loading: false,
            error: null,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ clients: [], clientLabels: {}, uiHints: { hiddenHubTabs: [], hiddenEnvCategories: [], hideSkillMountStatus: false, hideAgentGuides: false }, loading: false, error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
