/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * @openjiuwen/relay-api-server-contracts — Unified plugin contracts for OfficeClaw extensions.
 *
 * Extension points:
 *   - Auth:     import type { AuthProvider } from '@openjiuwen/relay-api-server-contracts/auth';
 *   - Identity: import type { GatewayIdentity } from '@openjiuwen/relay-api-server-contracts/identity';
 *   - Storage:  import type { OfficeClawStorageProvider } from '@openjiuwen/relay-api-server-contracts/storage';
 */
export type {
  AuthenticateFailure,
  AuthenticateInput,
  AuthenticateOutcome,
  AuthenticateResult,
  AuthFieldOption,
  AuthFieldSchema,
  AuthPresentation,
  AuthPresentationMode,
  AuthProvider,
  AuthSessionInfo,
  ExternalPrincipal,
  ProtocolCredentialResult,
} from './auth.js';
export type { MetricsProvider, MetricsProviderInput, MetricsReporterConfig } from './metrics.js';
export type { RuntimeEnvStore } from './runtime-env.js';
export type { GatewayIdentity } from './identity.js';
export type { CatalogMemberEntry, CatalogProvider, CatalogSnapshot } from './catalog.js';
export type {
  ConsistencyReport,
  Edge,
  EvidenceIndex,
  EvidenceItem,
  EvidenceKind,
  EvidenceProvider,
  EvidenceProviderInput,
  EvidenceServices,
  EvidenceStats,
  EvidenceStatus,
  EvidenceStore,
  RebuildResult,
  SearchOptions,
} from './evidence.js';
export type {
  DynamicTaskDef,
  DynamicTaskPort,
  EmissionPort,
  EmissionRecord,
  EmissionRow,
  GlobalControl,
  GlobalControlPort,
  PackTemplateDef,
  PackTemplatePort,
  RunLedgerPort,
  RunLedgerQuery,
  RunLedgerRecord,
  RunLedgerRow,
  RunOutcome,
  RunStats,
  SchedulerPersistence,
  SchedulerProvider,
  SchedulerProviderInput,
  TaskOverride,
  TriggerSpec,
} from './scheduler.js';
