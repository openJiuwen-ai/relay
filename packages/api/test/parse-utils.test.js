/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseBoolean, parseCsvEnumList } from '../dist/config/parse-utils.js';

test('parseBoolean handles true/false case-insensitively', () => {
  assert.equal(parseBoolean('true', false), true);
  assert.equal(parseBoolean('FALSE', true), false);
});

test('parseBoolean returns fallback on undefined or invalid values', () => {
  assert.equal(parseBoolean(undefined, true), true);
  assert.equal(parseBoolean('invalid', false), false);
});

test('parseCsvEnumList deduplicates and keeps only allowed values', () => {
  const parsed = parseCsvEnumList('stale,unknown,stale,invalid', ['fresh', 'stale', 'unknown'], ['stale']);
  assert.deepEqual(parsed, ['stale', 'unknown']);
});

test('parseCsvEnumList returns fallback when no allowed values found', () => {
  const parsed = parseCsvEnumList('invalid,also-invalid', ['fresh', 'stale', 'unknown'], ['stale']);
  assert.deepEqual(parsed, ['stale']);
});
