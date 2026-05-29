/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

describe('parseTtlEnv', () => {
  let parseTtlEnv;

  before(async () => {
    ({ parseTtlEnv } = await import('../dist/storage/parse-ttl-env.js'));
  });

  it('undefined → undefined', () => {
    assert.equal(parseTtlEnv(undefined), undefined);
  });

  it('empty string → undefined', () => {
    assert.equal(parseTtlEnv(''), undefined);
  });

  it('"0" → 0 (permanent retention)', () => {
    assert.equal(parseTtlEnv('0'), 0);
  });

  it('"86400" → 86400', () => {
    assert.equal(parseTtlEnv('86400'), 86400);
  });

  it('"3.7" → 3 (truncated)', () => {
    assert.equal(parseTtlEnv('3.7'), 3);
  });

  it('"10x" → undefined (not a valid number)', () => {
    assert.equal(parseTtlEnv('10x'), undefined);
  });

  it('"abc" → undefined', () => {
    assert.equal(parseTtlEnv('abc'), undefined);
  });

  it('"Infinity" → undefined', () => {
    assert.equal(parseTtlEnv('Infinity'), undefined);
  });

  it('"NaN" → undefined', () => {
    assert.equal(parseTtlEnv('NaN'), undefined);
  });
});
