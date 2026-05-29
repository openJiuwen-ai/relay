/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { digestRichBlocks } from '../dist/domains/agents/services/agents/routing/route-helpers.js';
import { safeParseExtra } from '../dist/domains/agents/services/stores/redis/redis-message-parsers.js';

describe('digestRichBlocks', () => {
  it('returns content unchanged when no extra.rich', () => {
    const msg = { content: 'hello', extra: undefined };
    assert.equal(digestRichBlocks(msg), 'hello');
  });

  it('appends card digest', () => {
    const msg = {
      content: 'here is the result',
      extra: {
        rich: {
          v: 1,
          blocks: [{ id: 'b1', kind: 'card', v: 1, title: 'Review Summary', tone: 'info' }],
        },
      },
    };
    const result = digestRichBlocks(msg);
    assert.ok(result.includes('here is the result'));
    assert.ok(result.includes('[卡片: Review Summary]'));
  });

  it('appends diff digest with filePath', () => {
    const msg = {
      content: 'changes',
      extra: {
        rich: {
          v: 1,
          blocks: [{ id: 'b1', kind: 'diff', v: 1, filePath: 'src/app.ts', diff: '+foo' }],
        },
      },
    };
    const result = digestRichBlocks(msg);
    assert.ok(result.includes('[代码 diff: src/app.ts]'));
  });

  it('appends checklist digest', () => {
    const msg = {
      content: 'todo list',
      extra: {
        rich: {
          v: 1,
          blocks: [
            {
              id: 'b1',
              kind: 'checklist',
              v: 1,
              items: [
                { id: 'i1', text: 'a' },
                { id: 'i2', text: 'b' },
              ],
            },
          ],
        },
      },
    };
    const result = digestRichBlocks(msg);
    assert.ok(result.includes('[清单: 2 项]'));
  });

  it('appends media_gallery digest', () => {
    const msg = {
      content: 'images',
      extra: {
        rich: {
          v: 1,
          blocks: [
            { id: 'b1', kind: 'media_gallery', v: 1, items: [{ url: 'a.png' }, { url: 'b.png' }, { url: 'c.png' }] },
          ],
        },
      },
    };
    const result = digestRichBlocks(msg);
    assert.ok(result.includes('[图片: 3 张]'));
  });
  // P1-1: malformed blocks must not crash digest
  it('does not crash on checklist without items', () => {
    const msg = {
      content: 'text',
      extra: {
        rich: {
          v: 1,
          blocks: [{ id: 'b1', kind: 'checklist', v: 1 /* no items */ }],
        },
      },
    };
    assert.doesNotThrow(() => digestRichBlocks(msg));
  });

  it('does not crash on media_gallery without items', () => {
    const msg = {
      content: 'text',
      extra: {
        rich: {
          v: 1,
          blocks: [{ id: 'b1', kind: 'media_gallery', v: 1 /* no items */ }],
        },
      },
    };
    assert.doesNotThrow(() => digestRichBlocks(msg));
  });

  it('does not crash on card without title', () => {
    const msg = {
      content: 'text',
      extra: {
        rich: {
          v: 1,
          blocks: [{ id: 'b1', kind: 'card', v: 1 /* no title */ }],
        },
      },
    };
    assert.doesNotThrow(() => digestRichBlocks(msg));
  });

  it('does not crash on diff without filePath', () => {
    const msg = {
      content: 'text',
      extra: {
        rich: {
          v: 1,
          blocks: [{ id: 'b1', kind: 'diff', v: 1 /* no filePath */ }],
        },
      },
    };
    assert.doesNotThrow(() => digestRichBlocks(msg));
  });
});

describe('safeParseExtra', () => {
  it('returns undefined for empty/null', () => {
    assert.equal(safeParseExtra(undefined), undefined);
    assert.equal(safeParseExtra(''), undefined);
  });

  it('parses valid rich extra', () => {
    const raw = JSON.stringify({ rich: { v: 1, blocks: [{ id: 'b1', kind: 'card' }] } });
    const result = safeParseExtra(raw);
    assert.ok(result);
    assert.ok(result.rich);
    assert.equal(result.rich.v, 1);
    assert.equal(result.rich.blocks.length, 1);
  });

  it('returns undefined for invalid JSON', () => {
    assert.equal(safeParseExtra('{broken'), undefined);
  });

  it('returns undefined for wrong rich version', () => {
    const raw = JSON.stringify({ rich: { v: 2, blocks: [] } });
    assert.equal(safeParseExtra(raw), undefined);
  });

  it('returns undefined for rich without blocks array', () => {
    const raw = JSON.stringify({ rich: { v: 1, blocks: 'not-array' } });
    assert.equal(safeParseExtra(raw), undefined);
  });

  // #80: stream.invocationId support
  it('parses stream-only extra', () => {
    const raw = JSON.stringify({ stream: { invocationId: 'inv-1' } });
    const result = safeParseExtra(raw);
    assert.ok(result, 'stream-only should not return undefined');
    assert.equal(result.stream?.invocationId, 'inv-1');
    assert.equal(result.rich, undefined);
  });

  it('preserves stream.userStopped when true', () => {
    const raw = JSON.stringify({ stream: { invocationId: 'inv-stop', userStopped: true } });
    const result = safeParseExtra(raw);
    assert.ok(result);
    assert.equal(result.stream?.invocationId, 'inv-stop');
    assert.equal(result.stream?.userStopped, true);
  });

  it('drops stream.userStopped when false', () => {
    const raw = JSON.stringify({ stream: { invocationId: 'inv-n', userStopped: false } });
    const result = safeParseExtra(raw);
    assert.ok(result);
    assert.equal(result.stream?.invocationId, 'inv-n');
    assert.equal(result.stream?.userStopped, undefined);
  });

  it('parses rich + stream together', () => {
    const raw = JSON.stringify({
      rich: { v: 1, blocks: [{ id: 'b1', kind: 'card' }] },
      stream: { invocationId: 'inv-2' },
    });
    const result = safeParseExtra(raw);
    assert.ok(result);
    assert.ok(result.rich, 'rich should be preserved');
    assert.equal(result.rich.blocks.length, 1);
    assert.equal(result.stream?.invocationId, 'inv-2');
  });

  it('preserves stream.durationMs when valid', () => {
    const raw = JSON.stringify({ stream: { invocationId: 'inv-3', durationMs: 42_500 } });
    const result = safeParseExtra(raw);
    assert.ok(result);
    assert.equal(result.stream?.invocationId, 'inv-3');
    assert.equal(result.stream?.durationMs, 42_500);
  });

  it('drops non-finite stream.durationMs', () => {
    const raw = JSON.stringify({ stream: { invocationId: 'inv-4', durationMs: Number.NaN } });
    const result = safeParseExtra(raw);
    assert.ok(result);
    assert.equal(result.stream?.invocationId, 'inv-4');
    assert.equal(result.stream?.durationMs, undefined);
  });

  it('ignores stream with invalid shape (no invocationId)', () => {
    const raw = JSON.stringify({ stream: { foo: 'bar' } });
    assert.equal(safeParseExtra(raw), undefined);
  });

  it('ignores stream with non-string invocationId', () => {
    const raw = JSON.stringify({ stream: { invocationId: 123 } });
    assert.equal(safeParseExtra(raw), undefined);
  });

  it('parses taskRuns extra (jiuwen per-task aggregation)', () => {
    const taskRuns = {
      v: 1,
      segments: [
        {
          taskId: 'skill_step:1',
          title: 'Stage 1',
          thinking: 't1',
          toolEvents: [],
          text: 'hello',
        },
      ],
    };
    const raw = JSON.stringify({ stream: { invocationId: 'inv-x' }, taskRuns });
    const result = safeParseExtra(raw);
    assert.ok(result);
    assert.equal(result.stream?.invocationId, 'inv-x');
    assert.ok(result.taskRuns);
    assert.equal(result.taskRuns.v, 1);
    assert.equal(result.taskRuns.segments.length, 1);
    assert.equal(result.taskRuns.segments[0].taskId, 'skill_step:1');
  });
});
