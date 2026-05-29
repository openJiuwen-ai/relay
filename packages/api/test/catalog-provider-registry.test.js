/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('CatalogProviderRegistry', () => {
  it('registerModule accepts cloud provider modules exported via catalogProvider', async () => {
    const { CatalogProviderRegistry } = await import('../dist/config/catalog-provider-registry.js');

    const registry = new CatalogProviderRegistry();
    const provider = {
      id: 'cloud-test',
      displayName: 'Cloud Test',
      async readCatalog() {
        return { catalog: { version: 2, breeds: [], roster: {}, reviewPolicy: {
          requireDifferentFamily: true,
          preferActiveInThread: true,
          preferLead: true,
          excludeUnavailable: true,
        } } };
      },
      async writeCatalog() {},
      async getMember(identity, agentId) {
        return {
          agentId,
          config: {
            id: agentId,
            name: 'Cloud Agent',
            displayName: 'Cloud Agent',
            avatar: '/avatars/cloud.png',
            color: { primary: '#111827', secondary: '#d1d5db' },
            mentionPatterns: ['@cloud'],
            provider: 'openai',
            defaultModel: 'gpt-5.4',
            mcpSupport: false,
          },
          extend: { userId: identity.userId },
        };
      },
    };

    await registry.registerModule('virtual:cloud-provider', async () => ({
      catalogProvider: provider,
    }));

    assert.deepEqual(registry.listIds(), ['cloud-test']);
    assert.equal(registry.getActive().id, 'cloud-test');
    assert.equal(registry.get('cloud-test'), provider);
  });
});
