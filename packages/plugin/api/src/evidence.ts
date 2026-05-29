/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type EvidenceKind =
  | 'feature'
  | 'decision'
  | 'plan'
  | 'session'
  | 'lesson'
  | 'thread'
  | 'discussion'
  | 'research';

export type EvidenceStatus = 'active' | 'done' | 'archived';

export interface EvidenceItem {
  anchor: string;
  kind: EvidenceKind;
  status: EvidenceStatus;
  title: string;
  summary?: string;
  keywords?: string[];
  sourcePath?: string;
  sourceHash?: string;
  supersededBy?: string;
  materializedFrom?: string;
  updatedAt: string;
  drillDown?: {
    tool: string;
    params: Record<string, string>;
    hint: string;
  };
}

export interface Edge {
  fromAnchor: string;
  toAnchor: string;
  relation: 'evolved_from' | 'blocked_by' | 'related' | 'supersedes' | 'invalidates';
}

export interface SearchOptions {
  kind?: EvidenceKind;
  status?: EvidenceStatus;
  keywords?: string[];
  limit?: number;
  scope?: 'docs' | 'memory' | 'threads' | 'sessions' | 'all';
  mode?: 'lexical' | 'semantic' | 'hybrid';
  depth?: 'summary' | 'raw';
}

export interface RebuildResult {
  docsIndexed: number;
  docsSkipped: number;
  durationMs: number;
}

export interface ConsistencyReport {
  ok: boolean;
  docCount: number;
  ftsCount: number;
  mismatches: string[];
}

export interface EvidenceStats {
  backend: string;
  healthy: boolean;
  degraded?: boolean;
  docsCount?: number;
  edgesCount?: number;
  lastRebuildAt?: string | null;
  reason?: string;
}

export interface EvidenceStore {
  search(query: string, options?: SearchOptions): Promise<EvidenceItem[]>;
  upsert(items: EvidenceItem[]): Promise<void>;
  deleteByAnchor(anchor: string): Promise<void>;
  getByAnchor(anchor: string): Promise<EvidenceItem | null>;
  health(): Promise<boolean>;
  initialize(): Promise<void>;
  stats?(): Promise<EvidenceStats>;
}

export interface EvidenceIndex {
  rebuild(options?: { force?: boolean }): Promise<RebuildResult>;
  incrementalUpdate(changedPaths: string[]): Promise<void>;
  checkConsistency(): Promise<ConsistencyReport>;
}

export interface EvidenceProviderInput {
  sqlitePath?: string;
  docsRoot?: string;
  markersDir?: string;
  transcriptDataDir?: string;
  embed?: Record<string, unknown>;
  threadListFn?: () => Promise<
    Array<{
      id: string;
      title: string | null;
      participants: string[];
      threadMemory: { summary: string } | null;
      lastActiveAt: number;
      featureIds?: string[];
    }>
  >;
  messageListFn?: (
    threadId: string,
    limit?: number,
  ) => Promise<Array<{ id: string; content: string; agentId?: string; threadId: string; timestamp: number }>>;
  excludeThreadIdsFn?: () => Promise<Set<string>>;
}

export interface EvidenceServices {
  backend: string;
  store: EvidenceStore;
  index?: EvidenceIndex;
  close?(): void | Promise<void>;
}

export interface EvidenceProvider {
  readonly id: string;
  readonly displayName?: string;
  createEvidenceServices(input: EvidenceProviderInput): EvidenceServices | Promise<EvidenceServices>;
  bootstrap?(): Promise<void>;
  shutdown?(): Promise<void>;
}
