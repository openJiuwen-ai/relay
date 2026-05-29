/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type {
  EvidenceProvider,
  EvidenceProviderInput,
  EvidenceServices,
  EvidenceStats,
} from '@openjiuwen/relay-api-server-contracts/evidence';
import { createMemoryServices } from './factory.js';

export const evidenceProvider: EvidenceProvider = {
  id: 'sqlite',
  displayName: 'SQLite Evidence',
  async createEvidenceServices(input: EvidenceProviderInput): Promise<EvidenceServices> {
    const services = await createMemoryServices({
      type: 'sqlite',
      sqlitePath: input.sqlitePath,
      docsRoot: input.docsRoot,
      markersDir: input.markersDir,
      transcriptDataDir: input.transcriptDataDir,
      embed: input.embed as Parameters<typeof createMemoryServices>[0]['embed'],
      threadListFn: input.threadListFn as Parameters<typeof createMemoryServices>[0]['threadListFn'],
      messageListFn: input.messageListFn as Parameters<typeof createMemoryServices>[0]['messageListFn'],
      excludeThreadIdsFn: input.excludeThreadIdsFn as Parameters<typeof createMemoryServices>[0]['excludeThreadIdsFn'],
    });

    const store = services.evidenceStore as typeof services.evidenceStore & { stats?: () => Promise<EvidenceStats> };
    if (!store.stats && 'getDb' in services.store) {
      store.stats = async () => {
        const db = services.store.getDb();
        const docCount = (db.prepare('SELECT count(*) AS c FROM evidence_docs').get() as { c: number }).c;
        const edgeCount = (db.prepare('SELECT count(*) AS c FROM edges').get() as { c: number }).c;
        const lastUpdated = (db.prepare('SELECT max(updated_at) AS t FROM evidence_docs').get() as { t: string | null }).t;
        return {
          backend: 'sqlite',
          healthy: true,
          docsCount: docCount,
          edgesCount: edgeCount,
          lastRebuildAt: lastUpdated,
        };
      };
    }

    return {
      backend: 'sqlite',
      store: services.evidenceStore,
      index: services.indexBuilder,
      close: () => services.store.close(),
    };
  },
};

export default evidenceProvider;
