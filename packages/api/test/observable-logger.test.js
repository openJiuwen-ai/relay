/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { inferLogComponent, normalizeObservableLogObject, resolveObservableLoggingConfig, userVisibleFields } =
  await import('../dist/infrastructure/logger.js');

describe('observable logger', () => {
  test('resolves logging config from OfficeClaw and Jiuwen-compatible env vars', () => {
    const config = resolveObservableLoggingConfig({
      OFFICE_CLAW_LOG_FORMAT: 'dual',
      JIUWENCLAW_LOG_CONSOLE_ENABLED: 'false',
      OFFICE_CLAW_LOG_FILE_ENABLED: '1',
      JIUWENCLAW_LOG_USER_VISIBLE: '0',
      OFFICE_CLAW_LOG_USER_PROGRESS_VISIBLE: 'true',
      OFFICE_CLAW_LOG_INCLUDE_COMPONENT: 'false',
    });

    assert.deepEqual(config, {
      format: 'dual',
      consoleEnabled: false,
      fileEnabled: true,
      userVisibleTagEnabled: false,
      userProgressTagEnabled: true,
      includeComponent: false,
    });
  });

  test('normalizes critical user-visible logs into structured fields and text tag', () => {
    const normalized = normalizeObservableLogObject(
      userVisibleFields('critical', {
        module: 'routes/messages',
        threadId: 'thread-1',
      }),
      {
        format: 'json',
        consoleEnabled: true,
        fileEnabled: true,
        userVisibleTagEnabled: true,
        userProgressTagEnabled: true,
        includeComponent: true,
      },
    );

    assert.equal(normalized.user_visible, 'critical');
    assert.equal(normalized.user_tag, '[USER]');
    assert.equal(normalized.component, 'gateway');
    assert.equal(normalized.threadId, 'thread-1');
  });

  test('normalizes progress logs and respects disabled progress tag', () => {
    const normalized = normalizeObservableLogObject(
      { module: 'ws', userVisible: 'progress' },
      {
        format: 'text',
        consoleEnabled: true,
        fileEnabled: true,
        userVisibleTagEnabled: true,
        userProgressTagEnabled: false,
        includeComponent: true,
      },
    );

    assert.equal(normalized.user_visible, 'progress');
    assert.equal(normalized.user_tag, undefined);
    assert.equal(normalized.userVisible, undefined);
    assert.equal(normalized.component, 'gateway');
  });

  test('drops invalid user_visible values instead of emitting null-like noise', () => {
    const normalized = normalizeObservableLogObject({
      module: 'agent-router',
      user_visible: null,
      user_tag: '[USER]',
    });

    assert.equal(normalized.user_visible, undefined);
    assert.equal(normalized.user_tag, undefined);
    assert.equal(normalized.component, 'agent_server');
  });

  test('infers components for primary TS Gateway areas', () => {
    assert.equal(inferLogComponent('routes/messages'), 'gateway');
    assert.equal(inferLogComponent('connector-router'), 'channel');
    assert.equal(inferLogComponent('authorization'), 'permissions');
    assert.equal(inferLogComponent('invoke-single-agent'), 'agent_server');
  });
});
