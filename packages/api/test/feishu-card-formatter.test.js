/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatFeishuCard } from '../dist/infrastructure/connectors/adapters/feishu-card-formatter.js';

describe('formatFeishuCard', () => {
  it('formats card block as Lark interactive card', () => {
    const blocks = [{ id: 'b1', kind: 'card', v: 1, title: 'Review', bodyMarkdown: 'LGTM' }];
    const card = formatFeishuCard(blocks, 'Claude');
    assert.equal(card.header.title.content, '[Claude] Review');
    assert.ok(card.elements.length > 0);
  });

  it('formats checklist as card elements', () => {
    const blocks = [
      {
        id: 'b2',
        kind: 'checklist',
        v: 1,
        title: 'TODO',
        items: [
          { id: 'i1', text: 'Tests', checked: true },
          { id: 'i2', text: 'Deploy' },
        ],
      },
    ];
    const card = formatFeishuCard(blocks, 'Claude');
    const content = JSON.stringify(card);
    assert.ok(content.includes('Tests'));
    assert.ok(content.includes('Deploy'));
  });

  it('formats diff as code block element', () => {
    const blocks = [{ id: 'b3', kind: 'diff', v: 1, filePath: 'src/a.ts', diff: '+line' }];
    const card = formatFeishuCard(blocks, 'Claude');
    const content = JSON.stringify(card);
    assert.ok(content.includes('src/a.ts'));
  });

  it('sets card header color from tone', () => {
    const blocks = [{ id: 'b1', kind: 'card', v: 1, title: 'Warning', tone: 'warning' }];
    const card = formatFeishuCard(blocks, 'Claude');
    assert.equal(card.header.template, 'orange');
  });

  it('handles multiple blocks in single card', () => {
    const blocks = [
      { id: 'b1', kind: 'card', v: 1, title: 'Summary', bodyMarkdown: 'Done' },
      { id: 'b2', kind: 'checklist', v: 1, items: [{ id: 'i1', text: 'Item' }] },
    ];
    const card = formatFeishuCard(blocks, 'Claude');
    assert.ok(card.elements.length >= 2);
  });

  it('uses generic title when no card block present', () => {
    const blocks = [{ id: 'b1', kind: 'checklist', v: 1, items: [{ id: 'i1', text: 'X' }] }];
    const card = formatFeishuCard(blocks, 'Codex');
    assert.equal(card.header.title.content, '[Codex]');
  });

  // P1-2: textContent must not be discarded
  it('includes textContent as leading element when provided', () => {
    const blocks = [{ id: 'b1', kind: 'card', v: 1, title: 'Review', bodyMarkdown: 'LGTM' }];
    const card = formatFeishuCard(blocks, 'Claude', 'Here is my summary');
    const content = JSON.stringify(card);
    assert.ok(content.includes('Here is my summary'));
    // textContent should be first element
    assert.equal(card.elements[0].tag, 'markdown');
    assert.ok(card.elements[0].content.includes('Here is my summary'));
  });

  it('omits textContent element when textContent is empty', () => {
    const blocks = [{ id: 'b1', kind: 'card', v: 1, title: 'Review', bodyMarkdown: 'LGTM' }];
    const card = formatFeishuCard(blocks, 'Claude', '');
    // Should still work, first element is body markdown not textContent
    assert.ok(card.elements[0].content.includes('LGTM'));
  });
});
