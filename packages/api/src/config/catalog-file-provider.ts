/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { CatalogMemberEntry, CatalogProvider, CatalogSnapshot, GatewayIdentity } from '@openjiuwen/relay-api-server-contracts';
import type { OfficeClawConfig } from '@openjiuwen/relay-shared';
import { toAllAgentConfigs } from './office-claw-config-loader.js';
import { readRuntimeAgentCatalog, writeAndValidateCatalog } from './runtime-office-claw-catalog.js';

export class FileCatalogProvider implements CatalogProvider {
  readonly id = 'file';
  readonly displayName = 'Local File';

  constructor(private readonly projectRoot: string) {}

  async readCatalog(_identity: GatewayIdentity): Promise<CatalogSnapshot> {
    return { catalog: readRuntimeAgentCatalog(this.projectRoot) };
  }

  async writeCatalog(_identity: GatewayIdentity, catalog: OfficeClawConfig): Promise<void> {
    writeAndValidateCatalog(this.projectRoot, catalog);
  }

  async getMember(_identity: GatewayIdentity, agentId: string): Promise<CatalogMemberEntry | null> {
    const { catalog } = await this.readCatalog(_identity);
    const configs = toAllAgentConfigs(catalog);
    const config = configs[agentId];
    if (!config) return null;
    return { agentId, config, extend: config.extend ? { ...config.extend } : undefined };
  }

  async listRoutableMembers(_identity: GatewayIdentity): Promise<CatalogMemberEntry[]> {
    const { catalog } = await this.readCatalog(_identity);
    const configs = toAllAgentConfigs(catalog);
    return Object.entries(configs).map(([agentId, config]) => ({
      agentId,
      config,
      extend: config.extend ? { ...config.extend } : undefined,
    }));
  }
}
