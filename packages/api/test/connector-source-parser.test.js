/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { safeParseConnectorSource } from '../dist/domains/agents/services/stores/redis/redis-message-parsers.js';

describe('safeParseConnectorSource (F97)', () => {
  it('parses valid ConnectorSource JSON', () => {
    const raw = JSON.stringify({
      connector: 'github-review',
      label: 'GitHub Review',
      icon: '🔔',
      url: 'https://github.com/org/repo/pull/42',
    });
    const result = safeParseConnectorSource(raw);
    assert.ok(result);
    assert.strictEqual(result.connector, 'github-review');
    assert.strictEqual(result.label, 'GitHub Review');
    assert.strictEqual(result.icon, '🔔');
    assert.strictEqual(result.url, 'https://github.com/org/repo/pull/42');
  });

  it('returns undefined for undefined input', () => {
    assert.strictEqual(safeParseConnectorSource(undefined), undefined);
  });

  it('returns undefined for empty string', () => {
    assert.strictEqual(safeParseConnectorSource(''), undefined);
  });

  it('returns undefined for invalid JSON', () => {
    assert.strictEqual(safeParseConnectorSource('not json'), undefined);
  });

  it('returns undefined when missing required fields', () => {
    // Missing icon
    const raw = JSON.stringify({ connector: 'github-review', label: 'GitHub Review' });
    assert.strictEqual(safeParseConnectorSource(raw), undefined);
  });

  it('returns undefined for non-string fields', () => {
    const raw = JSON.stringify({ connector: 123, label: 'GitHub Review', icon: '🔔' });
    assert.strictEqual(safeParseConnectorSource(raw), undefined);
  });

  it('returns undefined for null input value', () => {
    const raw = JSON.stringify(null);
    assert.strictEqual(safeParseConnectorSource(raw), undefined);
  });

  it('returns undefined for array input', () => {
    const raw = JSON.stringify(['github-review']);
    assert.strictEqual(safeParseConnectorSource(raw), undefined);
  });

  it('preserves optional url field when absent', () => {
    const raw = JSON.stringify({
      connector: 'github-review',
      label: 'GitHub Review',
      icon: '🔔',
    });
    const result = safeParseConnectorSource(raw);
    assert.ok(result);
    assert.strictEqual(result.url, undefined);
  });
});
