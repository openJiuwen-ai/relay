/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('embedded Agent Teams binding ignores legacy ACP profiles and accepts openai api_key profiles', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'embedded-agentteams-binding-'));
  try {
    const { createProviderProfile } = await import('../dist/config/provider-profiles.js');
    const { resolveEmbeddedAgentTeamsBinding } = await import('../dist/utils/embedded-runtime-bindings.js');

    const legacyAcpProfile = await createProviderProfile(projectRoot, {
      kind: 'acp',
      displayName: 'Agent Teams Local',
      command: 'relay-teams',
      args: ['gateway', 'acp', 'stdio'],
      protocol: 'acp',
      authType: 'none',
      modelAccessMode: 'clowder_default_profile',
      defaultModelProfileRef: 'relay-teams-default',
    });

    const openAiProfile = await createProviderProfile(projectRoot, {
      provider: 'openai',
      name: 'codex-sponsor',
      mode: 'api_key',
      authType: 'api_key',
      protocol: 'openai',
      baseUrl: 'https://openai.example/v1',
      apiKey: 'sk-test',
      models: ['gpt-5.4', 'gpt-4o-mini'],
      setActive: false,
    });

    assert.equal(await resolveEmbeddedAgentTeamsBinding(projectRoot, legacyAcpProfile.id), null);

    const binding = await resolveEmbeddedAgentTeamsBinding(projectRoot, openAiProfile.id);
    assert.ok(binding, 'expected an embedded Agent Teams binding');
    assert.equal(binding.accountRef, openAiProfile.id);
    assert.equal(binding.profile.protocol, 'openai');
    assert.equal(binding.profile.authType, 'api_key');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
