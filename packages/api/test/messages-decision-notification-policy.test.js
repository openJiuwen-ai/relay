/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldMarkDecisionNotification } from '../dist/routes/messages.js';

describe('messages decision notification policy', () => {
  it('marks review/merge contexts as decision-required', () => {
    assert.equal(shouldMarkDecisionNotification('这个 PR 可以合入吗？请你确认'), true);
    assert.equal(shouldMarkDecisionNotification('请 review 后告诉我是否允许 merge'), true);
    assert.equal(shouldMarkDecisionNotification('LGTM 了吗？'), true);
  });

  it('does not mark generic chat contexts', () => {
    assert.equal(shouldMarkDecisionNotification('今天我们把这个功能做完'), false);
    assert.equal(shouldMarkDecisionNotification('智能体回复了日志结果'), false);
  });
});
