/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { OfficeClawConfig, OfficeClawConfigEntry } from '@openjiuwen/relay-shared';
import type { GatewayIdentity } from './identity.js';

export interface CatalogMemberEntry {
  agentId: string;
  config: OfficeClawConfigEntry;
  readonly extend?: Readonly<Record<string, unknown>>;
}

export interface CatalogSnapshot {
  catalog: OfficeClawConfig;
}

export interface CatalogProvider {
  readonly id: string;
  readonly displayName?: string;

  readCatalog(identity: GatewayIdentity): Promise<CatalogSnapshot>;
  writeCatalog(identity: GatewayIdentity, catalog: OfficeClawConfig): Promise<void>;
  getMember?(identity: GatewayIdentity, agentId: string): Promise<CatalogMemberEntry | null>;
  listRoutableMembers?(identity: GatewayIdentity): Promise<CatalogMemberEntry[]>;
  bootstrap?(): Promise<void>;
  shutdown?(): Promise<void>;
}
