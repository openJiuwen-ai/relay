/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MAX_SCHEDULE_TASK_LABEL_LENGTH, normalizeScheduleTaskLabel } from '../src/utils/schedule-label.js';

describe('schedule task label validation', () => {
  test('accepts labels up to 64 JavaScript string length characters', () => {
    assert.equal(MAX_SCHEDULE_TASK_LABEL_LENGTH, 64);
    assert.deepEqual(normalizeScheduleTaskLabel('a'.repeat(64)), { value: 'a'.repeat(64) });
    assert.deepEqual(normalizeScheduleTaskLabel('中'.repeat(64)), { value: '中'.repeat(64) });
  });

  test('rejects labels over 64 JavaScript string length characters', () => {
    assert.deepEqual(normalizeScheduleTaskLabel('a'.repeat(65)), {
      error: 'display.label must be at most 64 characters',
    });
    assert.deepEqual(normalizeScheduleTaskLabel('中'.repeat(65)), {
      error: 'display.label must be at most 64 characters',
    });
  });

  test('counts emoji by JavaScript string length', () => {
    assert.deepEqual(normalizeScheduleTaskLabel('😀'.repeat(32)), { value: '😀'.repeat(32) });
    assert.deepEqual(normalizeScheduleTaskLabel('😀'.repeat(33)), {
      error: 'display.label must be at most 64 characters',
    });
  });

  test('trims labels and rejects blank input', () => {
    assert.deepEqual(normalizeScheduleTaskLabel(`  ${'a'.repeat(64)}  `), { value: 'a'.repeat(64) });
    assert.deepEqual(normalizeScheduleTaskLabel('   '), { error: 'display.label must be a non-empty string' });
    assert.deepEqual(normalizeScheduleTaskLabel(null), { error: 'display.label must be a string' });
  });
});
