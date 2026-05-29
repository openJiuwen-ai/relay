/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * ConnectorMessageFormatter — platform-agnostic message envelope generator.
 *
 * Takes cat reply metadata and produces a unified MessageEnvelope
 * that each adapter converts to its platform format.
 */

// Will import from the module once it exists
// import { ConnectorMessageFormatter, MessageEnvelope } from '../dist/infrastructure/connectors/ConnectorMessageFormatter.js';

describe('ConnectorMessageFormatter', () => {
  // Lazy import so the file can not-exist during the RED phase check
  let ConnectorMessageFormatter;

  it('module can be imported', async () => {
    const mod = await import('../dist/infrastructure/connectors/ConnectorMessageFormatter.js');
    ConnectorMessageFormatter = mod.ConnectorMessageFormatter;
    assert.ok(ConnectorMessageFormatter, 'ConnectorMessageFormatter should be exported');
  });

  it('formats a basic reply without a time footer', async () => {
    const mod = await import('../dist/infrastructure/connectors/ConnectorMessageFormatter.js');
    const formatter = new mod.ConnectorMessageFormatter();

    const envelope = formatter.format({
      catDisplayName: 'Claude/宪宪',
      threadShortId: 'T12',
      threadTitle: '飞书登录bug排查',
      featId: 'F088',
      body: '看了一下回调逻辑，问题出在 OAuth token 过期。',
      deepLinkUrl: 'https://cafe.office-claw.com/t/abc123',
    });

    assert.equal(envelope.header, 'Claude/宪宪');
    assert.equal(envelope.subtitle, '飞书登录bug排查 · F088');
    assert.equal(envelope.body, '看了一下回调逻辑，问题出在 OAuth token 过期。');
    assert.equal(envelope.footer, '');
  });

  it('omits featId from subtitle when not provided', async () => {
    const mod = await import('../dist/infrastructure/connectors/ConnectorMessageFormatter.js');
    const formatter = new mod.ConnectorMessageFormatter();

    const envelope = formatter.format({
      catDisplayName: 'Codex/砚砚',
      threadShortId: 'T7',
      threadTitle: '周报整理',
      body: '已整理完毕。',
      deepLinkUrl: 'https://cafe.office-claw.com/t/def456',
    });

    assert.equal(envelope.subtitle, '周报整理');
    assert.ok(!envelope.subtitle.includes('·'));
  });

  it('omits threadTitle from subtitle when not provided', async () => {
    const mod = await import('../dist/infrastructure/connectors/ConnectorMessageFormatter.js');
    const formatter = new mod.ConnectorMessageFormatter();

    const envelope = formatter.format({
      catDisplayName: 'Claude/宪宪',
      threadShortId: 'T3',
      body: '收到。',
      deepLinkUrl: 'https://cafe.office-claw.com/t/ghi789',
    });

    assert.equal(envelope.subtitle, '');
  });

  it('handles missing deepLinkUrl gracefully without adding a footer', async () => {
    const mod = await import('../dist/infrastructure/connectors/ConnectorMessageFormatter.js');
    const formatter = new mod.ConnectorMessageFormatter();

    const envelope = formatter.format({
      catDisplayName: 'Claude/宪宪',
      threadShortId: 'T1',
      body: 'Hello!',
    });

    assert.equal(envelope.footer, '');
    assert.ok(!envelope.footer.includes('http'));
  });

  it('hides auto-generated connector DM titles from subtitle', async () => {
    const mod = await import('../dist/infrastructure/connectors/ConnectorMessageFormatter.js');
    const formatter = new mod.ConnectorMessageFormatter();

    const envelope = formatter.format({
      catDisplayName: '通用智能体',
      threadShortId: 'thread_mnzvgxvg',
      threadTitle: '钉钉 DM',
      body: '这次处理没有顺利完成。我先结束本次尝试，请稍后重试。',
      deepLinkUrl: 'http://localhost:3003/threads/thread_mnzvgxvgw2vu63t8',
    });

    assert.equal(envelope.subtitle, '');
    assert.equal(envelope.footer, '');
  });

  it('returns a well-typed MessageEnvelope with all 4 fields', async () => {
    const mod = await import('../dist/infrastructure/connectors/ConnectorMessageFormatter.js');
    const formatter = new mod.ConnectorMessageFormatter();

    const envelope = formatter.format({
      catDisplayName: 'Claude/宪宪',
      threadShortId: 'T5',
      threadTitle: 'Test',
      body: 'Content',
      deepLinkUrl: 'https://example.com',
    });

    assert.equal(typeof envelope.header, 'string');
    assert.equal(typeof envelope.subtitle, 'string');
    assert.equal(typeof envelope.body, 'string');
    assert.equal(typeof envelope.footer, 'string');
    assert.deepEqual(Object.keys(envelope).sort(), ['body', 'footer', 'header', 'origin', 'subtitle']);
  });
});
