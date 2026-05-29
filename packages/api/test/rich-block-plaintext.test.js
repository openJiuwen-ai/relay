/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderRichBlockPlaintext } from '../dist/infrastructure/connectors/rich-block-plaintext.js';

describe('renderRichBlockPlaintext', () => {
  it('renders card with title and body', () => {
    const block = { id: 'b1', kind: 'card', v: 1, title: 'Review Summary', bodyMarkdown: 'All good' };
    const result = renderRichBlockPlaintext(block);
    assert.ok(result.includes('Review Summary'));
    assert.ok(result.includes('All good'));
  });

  it('renders card with fields', () => {
    const block = { id: 'b1', kind: 'card', v: 1, title: 'Status', fields: [{ label: 'P1', value: '0' }] };
    const result = renderRichBlockPlaintext(block);
    assert.ok(result.includes('P1'));
    assert.ok(result.includes('0'));
  });

  it('renders checklist with checked/unchecked items', () => {
    const block = {
      id: 'b2',
      kind: 'checklist',
      v: 1,
      title: 'TODO',
      items: [
        { id: 'i1', text: 'Write tests', checked: true },
        { id: 'i2', text: 'Deploy' },
      ],
    };
    const result = renderRichBlockPlaintext(block);
    assert.ok(result.includes('✅ Write tests'));
    assert.ok(result.includes('☐ Deploy'));
  });

  it('renders diff with file path', () => {
    const block = { id: 'b3', kind: 'diff', v: 1, filePath: 'src/index.ts', diff: '+added line' };
    const result = renderRichBlockPlaintext(block);
    assert.ok(result.includes('src/index.ts'));
    assert.ok(result.includes('+added line'));
  });

  it('renders audio with text', () => {
    const block = { id: 'b4', kind: 'audio', v: 1, url: 'https://x.mp3', text: 'Hello world' };
    const result = renderRichBlockPlaintext(block);
    assert.ok(result.includes('Hello world'));
  });

  it('renders media_gallery with items', () => {
    const block = {
      id: 'b5',
      kind: 'media_gallery',
      v: 1,
      items: [{ url: 'https://img.png', caption: 'Screenshot' }],
    };
    const result = renderRichBlockPlaintext(block);
    assert.ok(result.includes('Screenshot'));
  });

  it('renders unknown kind gracefully', () => {
    const block = { id: 'b6', kind: 'unknown_future', v: 1 };
    const result = renderRichBlockPlaintext(block);
    assert.equal(typeof result, 'string');
  });
});
