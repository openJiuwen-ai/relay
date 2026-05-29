/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type {
  EvidenceItem,
  EvidenceProvider,
  EvidenceProviderInput,
  EvidenceServices,
  EvidenceStats,
  EvidenceStore,
  SearchOptions,
} from '@openjiuwen/relay-api-server-contracts/evidence';

class NoopEvidenceStore implements EvidenceStore {
  async search(_query: string, _options?: SearchOptions): Promise<EvidenceItem[]> {
    return [];
  }

  async upsert(_items: EvidenceItem[]): Promise<void> {}

  async deleteByAnchor(_anchor: string): Promise<void> {}

  async getByAnchor(_anchor: string): Promise<EvidenceItem | null> {
    return null;
  }

  async health(): Promise<boolean> {
    return true;
  }

  async initialize(): Promise<void> {}

  async stats(): Promise<EvidenceStats> {
    return {
      backend: 'noop',
      healthy: true,
      degraded: true,
      docsCount: 0,
      edgesCount: 0,
      lastRebuildAt: null,
      reason: 'evidence_provider_noop',
    };
  }
}

export function createNoopEvidenceProvider(): EvidenceProvider {
  return {
    id: 'noop',
    displayName: 'No-op Evidence',
    createEvidenceServices(_input: EvidenceProviderInput): EvidenceServices {
      return {
        backend: 'noop',
        store: new NoopEvidenceStore(),
      };
    },
  };
}
