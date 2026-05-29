/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { InboundMessageDedup } from '../dist/infrastructure/connectors/InboundMessageDedup.js';

describe('InboundMessageDedup', () => {
  let dedup;
  beforeEach(() => {
    dedup = new InboundMessageDedup();
  });

  it('first message is not duplicate', () => {
    assert.equal(dedup.isDuplicate('feishu', 'chat-A', 'msg-001'), false);
  });

  it('same message ID is duplicate', () => {
    dedup.isDuplicate('feishu', 'chat-A', 'msg-001');
    assert.equal(dedup.isDuplicate('feishu', 'chat-A', 'msg-001'), true);
  });

  it('different connector same msgId is not duplicate', () => {
    dedup.isDuplicate('feishu', 'chat-A', 'msg-001');
    assert.equal(dedup.isDuplicate('dingtalk', 'chat-B', 'msg-001'), false);
  });

  it('same connector same msgId different chatId is not duplicate', () => {
    dedup.isDuplicate('dingtalk', 'chat-A', '42');
    assert.equal(dedup.isDuplicate('dingtalk', 'chat-B', '42'), false);
  });

  it('evicts oldest entries when capacity exceeded', () => {
    const smallDedup = new InboundMessageDedup(3);
    smallDedup.isDuplicate('feishu', 'chat-A', 'msg-1');
    smallDedup.isDuplicate('feishu', 'chat-A', 'msg-2');
    smallDedup.isDuplicate('feishu', 'chat-A', 'msg-3');
    // msg-1 should be evicted after adding msg-4
    smallDedup.isDuplicate('feishu', 'chat-A', 'msg-4');
    assert.equal(smallDedup.isDuplicate('feishu', 'chat-A', 'msg-1'), false);
    assert.equal(smallDedup.isDuplicate('feishu', 'chat-A', 'msg-4'), true);
  });
});
