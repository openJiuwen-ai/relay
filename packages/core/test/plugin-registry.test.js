/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Tests for ProviderPluginRegistry
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPluginRegistry } from '../dist/plugin/registry.js';

describe('ProviderPluginRegistry', () => {
  it('registers and retrieves a plugin', () => {
    const registry = new ProviderPluginRegistry();
    const plugin = {
      name: 'test',
      providers: ['test-provider'],
      createAgentService: () => ({ async *invoke() {} }),
    };

    registry.register(plugin);

    assert.ok(registry.has('test-provider'));
    assert.equal(registry.get('test-provider'), plugin);
  });

  it('returns undefined for unregistered provider', () => {
    const registry = new ProviderPluginRegistry();
    assert.equal(registry.get('nonexistent'), undefined);
    assert.ok(!registry.has('nonexistent'));
  });

  it('rejects duplicate provider registration', () => {
    const registry = new ProviderPluginRegistry();
    const plugin1 = {
      name: 'p1',
      providers: ['dup'],
      createAgentService: () => ({ async *invoke() {} }),
    };
    const plugin2 = {
      name: 'p2',
      providers: ['dup'],
      createAgentService: () => ({ async *invoke() {} }),
    };

    registry.register(plugin1);
    assert.throws(() => registry.register(plugin2), /already registered/);
  });

  it('supports multi-provider plugins', () => {
    const registry = new ProviderPluginRegistry();
    const plugin = {
      name: 'multi',
      providers: ['a', 'b'],
      createAgentService: () => ({ async *invoke() {} }),
    };

    registry.register(plugin);

    assert.ok(registry.has('a'));
    assert.ok(registry.has('b'));
    assert.equal(registry.get('a'), registry.get('b'));
  });

  it('getAllPlugins deduplicates multi-provider entries', () => {
    const registry = new ProviderPluginRegistry();
    const plugin = {
      name: 'multi',
      providers: ['x', 'y'],
      createAgentService: () => ({ async *invoke() {} }),
    };

    registry.register(plugin);
    assert.equal(registry.getAllPlugins().length, 1);
  });

  it('collects account specs from all plugins', () => {
    const registry = new ProviderPluginRegistry();
    registry.register({
      name: 'p1',
      providers: ['p1'],
      createAgentService: () => ({ async *invoke() {} }),
      accountSpecs: [{ id: 'a1', displayName: 'A1', client: 'anthropic', models: ['m1'] }],
    });
    registry.register({
      name: 'p2',
      providers: ['p2'],
      createAgentService: () => ({ async *invoke() {} }),
      accountSpecs: [{ id: 'a2', displayName: 'A2', client: 'openai', models: ['m2'] }],
    });

    const specs = registry.getAllAccountSpecs();
    assert.equal(specs.length, 2);
    assert.equal(specs[0].id, 'a1');
    assert.equal(specs[1].id, 'a2');
  });

  it('resolves binding metadata', () => {
    const registry = new ProviderPluginRegistry();
    registry.register({
      name: 'bound',
      providers: ['bound'],
      createAgentService: () => ({ async *invoke() {} }),
      binding: { builtinClient: 'anthropic', expectedProtocol: 'anthropic' },
    });

    assert.equal(registry.resolveBuiltinClient('bound'), 'anthropic');
    assert.equal(registry.resolveExpectedProtocol('bound'), 'anthropic');
    assert.equal(registry.resolveBuiltinClient('unregistered'), null);
  });

  it('reset clears all registrations', () => {
    const registry = new ProviderPluginRegistry();
    registry.register({
      name: 'tmp',
      providers: ['tmp'],
      createAgentService: () => ({ async *invoke() {} }),
    });
    assert.ok(registry.has('tmp'));

    registry.reset();
    assert.ok(!registry.has('tmp'));
  });
});
