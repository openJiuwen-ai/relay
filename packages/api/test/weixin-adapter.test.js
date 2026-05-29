/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { WeixinAdapter } from '../dist/infrastructure/connectors/adapters/WeixinAdapter.js';

function noopLog() {
  const noop = () => {};
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    child: () => noopLog(),
  };
}

describe('WeixinAdapter', () => {
  describe('parseUpdates', () => {
    it('parses text messages from getupdates response', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = {
        ret: 0,
        get_updates_buf: 'cursor-abc',
        msgs: [
          {
            message_id: 1001,
            from_user_id: 'user-wx-123',
            context_token: 'ctx-token-abc',
            item_list: [{ type: 1, text_item: { text: '你好智能体' } }],
          },
        ],
      };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.sessionExpired, false);
      assert.equal(result.newCursor, 'cursor-abc');
      assert.equal(result.messages.length, 1);

      const msg = result.messages[0];
      assert.equal(msg.chatId, 'user-wx-123');
      assert.equal(msg.text, '你好智能体');
      assert.equal(msg.messageId, '1001');
      assert.equal(msg.senderId, 'user-wx-123');
      assert.equal(msg.contextToken, 'ctx-token-abc');
    });

    it('returns sessionExpired=true on errcode -14', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = { errcode: -14, errmsg: 'session expired' };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.sessionExpired, true);
      assert.equal(result.messages.length, 0);
    });

    it('returns sessionExpired=true on ret -14', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = { ret: -14, errmsg: 'session expired' };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.sessionExpired, true);
      assert.equal(result.messages.length, 0);
    });

    it('handles empty msgs array', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = { ret: 0, get_updates_buf: 'cursor-new', msgs: [] };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.messages.length, 0);
      assert.equal(result.newCursor, 'cursor-new');
      assert.equal(result.sessionExpired, false);
    });

    it('handles non-zero errcode (non-session-expired)', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = { errcode: -1, errmsg: 'unknown error' };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.messages.length, 0);
      assert.equal(result.sessionExpired, false);
    });

    it('handles non-zero ret (non-session-expired)', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = { ret: -1, errmsg: 'unknown error' };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.messages.length, 0);
      assert.equal(result.sessionExpired, false);
    });

    it('skips messages without from_user_id', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = {
        ret: 0,
        msgs: [{ message_id: 1001, context_token: 'ctx', item_list: [{ type: 1, text_item: { text: 'hello' } }] }],
      };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.messages.length, 0);
    });

    it('skips messages without context_token', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = {
        ret: 0,
        msgs: [{ message_id: 1001, from_user_id: 'user1', item_list: [{ type: 1, text_item: { text: 'hello' } }] }],
      };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.messages.length, 0);
    });

    it('skips messages with empty item_list', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = {
        ret: 0,
        msgs: [{ message_id: 1001, from_user_id: 'user1', context_token: 'ctx', item_list: [] }],
      };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.messages.length, 0);
    });

    it('parses image messages as placeholder text', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = {
        ret: 0,
        msgs: [
          {
            message_id: 1002,
            from_user_id: 'user1',
            context_token: 'ctx-2',
            item_list: [{ type: 2, image_item: { url: 'https://cdn.weixin.qq.com/image/123' } }],
          },
        ],
      };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.messages.length, 1);
      assert.equal(result.messages[0].text, '[图片]');
      assert.equal(result.messages[0].attachments?.[0]?.type, 'image');
      assert.deepEqual(JSON.parse(result.messages[0].attachments?.[0]?.mediaUrl), {
        plainUrl: 'https://cdn.weixin.qq.com/image/123',
      });
    });

    it('parses voice messages with transcribed text', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = {
        ret: 0,
        msgs: [
          {
            message_id: 1003,
            from_user_id: 'user1',
            context_token: 'ctx-3',
            item_list: [{ type: 3, voice_item: { text: '语音转文字内容' } }],
          },
        ],
      };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.messages.length, 1);
      assert.equal(result.messages[0].text, '语音转文字内容');
    });

    it('parses voice messages without transcription as placeholder', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = {
        ret: 0,
        msgs: [
          {
            message_id: 1003,
            from_user_id: 'user1',
            context_token: 'ctx-3',
            item_list: [{ type: 3, voice_item: {} }],
          },
        ],
      };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.messages.length, 1);
      assert.equal(result.messages[0].text, '[语音]');
    });

    it('parses voice messages with empty transcription as placeholder', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = {
        ret: 0,
        msgs: [
          {
            message_id: 1033,
            from_user_id: 'user1',
            context_token: 'ctx-voice-empty',
            item_list: [{ type: 3, voice_item: { text: '' } }],
          },
        ],
      };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.messages.length, 1);
      assert.equal(result.messages[0].text, '[语音]');
    });

    it('parses file messages with filename and media reference', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = {
        ret: 0,
        msgs: [
          {
            message_id: 1004,
            from_user_id: 'user1',
            context_token: 'ctx-4',
            item_list: [
              {
                type: 4,
                file_item: {
                  file_name: 'report.pdf',
                  media: { encrypt_query_param: 'enc-param', aes_key: Buffer.from('0123456789abcdef').toString('base64') },
                },
              },
            ],
          },
        ],
      };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.messages.length, 1);
      assert.equal(result.messages[0].text, '[文件] report.pdf');
      assert.equal(result.messages[0].attachments?.[0]?.type, 'file');
      assert.equal(result.messages[0].attachments?.[0]?.fileName, 'report.pdf');
      assert.deepEqual(JSON.parse(result.messages[0].attachments?.[0]?.mediaUrl), {
        encryptQueryParam: 'enc-param',
        aesKey: Buffer.from('0123456789abcdef').toString('base64'),
      });
    });

    it('does not create file attachment when media reference is missing', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = {
        ret: 0,
        msgs: [
          {
            message_id: 1004,
            from_user_id: 'user1',
            context_token: 'ctx-4',
            item_list: [{ type: 4, file_item: { file_name: 'report.pdf' } }],
          },
        ],
      };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.messages.length, 1);
      assert.equal(result.messages[0].text, '[文件] report.pdf');
      assert.equal(result.messages[0].attachments, undefined);
    });

    it('parses multiple messages in one update', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = {
        ret: 0,
        get_updates_buf: 'cursor-multi',
        msgs: [
          {
            message_id: 2001,
            from_user_id: 'user-a',
            context_token: 'ctx-a',
            item_list: [{ type: 1, text_item: { text: 'first' } }],
          },
          {
            message_id: 2002,
            from_user_id: 'user-b',
            context_token: 'ctx-b',
            item_list: [{ type: 1, text_item: { text: 'second' } }],
          },
        ],
      };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.messages.length, 2);
      assert.equal(result.messages[0].text, 'first');
      assert.equal(result.messages[1].text, 'second');
    });

    it('generates fallback messageId when message_id is missing', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = {
        ret: 0,
        msgs: [
          {
            from_user_id: 'user1',
            context_token: 'ctx-1',
            item_list: [{ type: 1, text_item: { text: 'no id' } }],
          },
        ],
      };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.messages.length, 1);
      assert.ok(result.messages[0].messageId.startsWith('weixin-'));
    });

    it('handles response with both ret and errcode (errcode wins for session expired)', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const raw = { errcode: -14, ret: 0 };

      const result = adapter.parseUpdates(raw);
      assert.equal(result.sessionExpired, true);
    });
  });

  describe('sendReply', () => {
    // Helper: sendReply + immediately flush (avoids waiting for debounce timer)
    async function sendAndFlush(adapter, chatId, content) {
      await adapter.sendReply(chatId, content);
      await adapter._flushAllPending();
    }

    it('sends text message via iLink sendmessage API with msg wrapper', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-token-1');

      let capturedBody = null;
      let capturedUrl = null;
      adapter._injectFetch(async (url, opts) => {
        capturedUrl = url;
        capturedBody = JSON.parse(opts.body);
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      await sendAndFlush(adapter, 'user-1', 'Hello from OfficeClaw!');

      assert.ok(capturedUrl.includes('/ilink/bot/sendmessage'));
      assert.ok(capturedBody.msg, 'body must have msg wrapper');
      assert.equal(capturedBody.msg.context_token, 'ctx-token-1');
      assert.equal(capturedBody.msg.to_user_id, 'user-1');
      assert.equal(capturedBody.msg.message_state, 2);
      assert.equal(capturedBody.msg.item_list.length, 1);
      assert.equal(capturedBody.msg.item_list[0].type, 1);
      assert.equal(capturedBody.msg.item_list[0].text_item.text, 'Hello from OfficeClaw!');
      assert.ok(capturedBody.base_info, 'body must include base_info');
    });

    it('BUG-5: token remains reusable after successful send', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-token-1');
      adapter._injectFetch(async () => ({ ok: true, json: async () => ({ ret: 0 }) }));

      await sendAndFlush(adapter, 'user-1', 'Hello');
      assert.ok(adapter.hasContextToken('user-1'), 'token must remain in contextTokens after send');
    });

    it('BUG-5: second send with same token succeeds (token reusable)', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-token-1');
      let sendCount = 0;
      adapter._injectFetch(async () => {
        sendCount++;
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      await sendAndFlush(adapter, 'user-1', 'First reply');
      assert.equal(sendCount, 1);

      // Same token — second send should succeed (BUG-5: token is reusable)
      await sendAndFlush(adapter, 'user-1', 'Second reply');
      assert.equal(sendCount, 2, 'iLink API must be called again — token is reusable');
    });

    it('aggregates multiple sendReply calls within debounce window', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-token-1');
      const sentTexts = [];
      adapter._injectFetch(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        sentTexts.push(body.msg.item_list[0].text_item.text);
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      // Queue two replies without flushing
      const p1 = adapter.sendReply('user-1', '[Cat A] Hello!');
      const p2 = adapter.sendReply('user-1', '[Cat B] Meow!');
      await adapter._flushAllPending();
      await Promise.all([p1, p2]);

      // Should be merged into a single API call
      assert.equal(sentTexts.length, 1);
      assert.ok(sentTexts[0].includes('Cat A'));
      assert.ok(sentTexts[0].includes('Cat B'));
    });

    it('BUG-5: each invocation flushes separately — per-cat messages', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-token-1');

      const sentTexts = [];
      adapter._injectFetch(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        sentTexts.push(body.msg.item_list[0].text_item.text);
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      const p1 = adapter.sendReply('user-1', '[Assistant] First reply');
      await adapter.onDeliveryBatchDone('user-1', false);
      await p1;

      assert.equal(sentTexts.length, 1, 'first cat reply flushed immediately on batchDone');
      assert.ok(sentTexts[0].includes('Assistant'), 'first message is from Assistant');

      const p2 = adapter.sendReply('user-1', '[Office] Second reply');
      await adapter.onDeliveryBatchDone('user-1', true);
      await p2;

      assert.equal(sentTexts.length, 2, 'second cat reply flushed as separate message');
      assert.ok(sentTexts[1].includes('Office'), 'second message is from Office');
    });

    it('queues reply without blocking caller until chainDone flushes the batch', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-token-1');

      const sentTexts = [];
      adapter._injectFetch(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        sentTexts.push(body.msg.item_list[0].text_item.text);
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      let settled = false;
      const queued = adapter.sendReply('user-1', '[Assistant] batched reply').then(() => {
        settled = true;
      });

      await Promise.resolve();
      assert.equal(settled, true, 'sendReply should resolve after queueing, not wait for flush');
      assert.equal(sentTexts.length, 0, 'queueing alone must not send immediately');

      await adapter.onDeliveryBatchDone('user-1', true);
      await queued;

      assert.equal(sentTexts.length, 1, 'batch should send once chainDone=true arrives');
      assert.ok(sentTexts[0].includes('batched reply'));
    });

    it('uses token bound at queue time, not token at flush time (token rotation safety)', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'token-A');

      let capturedToken = null;
      adapter._injectFetch(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        capturedToken = body.msg.context_token;
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      // Queue reply while token-A is active
      const p = adapter.sendReply('user-1', 'reply for message A');

      // Simulate new inbound message arriving with token-B (overwrites Map)
      adapter._injectContextToken('user-1', 'token-B');

      // Flush — should use token-A (bound at queue time), NOT token-B
      await adapter._flushAllPending();
      await p;

      assert.equal(capturedToken, 'token-A', 'must use token bound at queue time, not current Map value');
    });

    it('cross-token replies are NOT merged — new token flushes old bucket first', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'token-A');

      const calls = [];
      adapter._injectFetch(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        calls.push({ token: body.msg.context_token, text: body.msg.item_list[0].text_item.text });
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      // Queue reply for token-A (starts debounce)
      const pA = adapter.sendReply('user-1', 'reply for A');

      // New message arrives with token-B → sendReply with token-B should flush old A bucket first
      adapter._injectContextToken('user-1', 'token-B');
      const pB = adapter.sendReply('user-1', 'reply for B');
      await pB;
      await adapter._flushAllPending();
      await Promise.all([pA, pB]);

      // Must be 2 separate sends: A with token-A, B with token-B
      assert.equal(calls.length, 2, 'must be 2 separate API calls, not merged');
      assert.equal(calls[0].token, 'token-A');
      assert.ok(calls[0].text.includes('reply for A'));
      assert.equal(calls[1].token, 'token-B');
      assert.ok(calls[1].text.includes('reply for B'));
    });

    it('token changes twice during flush — B refuses cross-token merge with C bucket', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'token-A');

      // Gate token-A's fetch so we control when it completes
      let releaseFetchA;
      const fetchGate = new Promise((r) => {
        releaseFetchA = r;
      });
      const calls = [];
      adapter._injectFetch(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        const token = body.msg.context_token;
        if (token === 'token-A') await fetchGate;
        calls.push({ token, text: body.msg.item_list[0].text_item.text });
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      // 1. Queue reply for A
      const pA = adapter.sendReply('user-1', 'reply-A');

      // 2. Token B arrives → sendReply(B) starts flushing A (blocked by fetchGate)
      adapter._injectContextToken('user-1', 'token-B');
      const pB = adapter.sendReply('user-1', 'reply-B');

      // 3. While A flush is blocked, token C arrives + creates pending
      adapter._injectContextToken('user-1', 'token-C');
      const pC = adapter.sendReply('user-1', 'reply-C');

      // 4. Release A's fetch → B resumes → B must NOT merge into C's bucket
      releaseFetchA();
      await adapter._flushAllPending();
      await Promise.allSettled([pA, pB, pC]);

      // A sent with token-A, C sent with token-C. B refused to merge (different token bucket)
      assert.ok(
        calls.some((c) => c.token === 'token-A' && c.text.includes('reply-A')),
        'A must be sent',
      );
      assert.ok(
        calls.some((c) => c.token === 'token-C' && c.text.includes('reply-C')),
        'C must be sent',
      );
      assert.ok(!calls.some((c) => c.text.includes('reply-B') && c.token === 'token-C'), 'B must NOT be merged into C');
    });

    it('BUG-5: flush does not remove contextToken (token stays reusable)', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'token-A');
      adapter._injectFetch(async () => ({ ok: true, json: async () => ({ ret: 0 }) }));

      // Queue reply for token-A
      const p = adapter.sendReply('user-1', 'reply A');

      // Flush — token-A must stay in contextTokens (BUG-5: reusable)
      await adapter._flushAllPending();
      await p;

      assert.ok(adapter.hasContextToken('user-1'), 'token must remain in contextTokens after flush');
    });

    it('no-token reply does not poison bucket for subsequent valid reply', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      let sendCount = 0;
      adapter._injectFetch(async () => {
        sendCount++;
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      // First reply with no token — should be skipped, no bucket created
      await adapter.sendReply('user-1', 'no-token reply');
      assert.equal(sendCount, 0);

      // Now token arrives and second reply queued
      adapter._injectContextToken('user-1', 'valid-token');
      await sendAndFlush(adapter, 'user-1', 'valid reply');

      // The valid reply must be sent
      assert.equal(sendCount, 1, 'valid reply after no-token skip must be sent');
    });

    it('silently skips when no context_token cached', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      let fetchCalled = false;
      adapter._injectFetch(async () => {
        fetchCalled = true;
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      await sendAndFlush(adapter, 'unknown-user', 'This should not send');
      assert.equal(fetchCalled, false);
    });

    it('stops typing when skipping send because context_token is missing', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const calls = [];
      adapter._injectFetch(async (url, opts) => {
        const body = opts?.body ? JSON.parse(opts.body) : {};
        calls.push({ url: String(url), body });
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      // Simulate typing already started for this chat.
      adapter.typingTickets.set('unknown-user', 'ticket-1');
      adapter.startTyping('unknown-user');

      await adapter.sendReply('unknown-user', 'This should not send');

      assert.ok(
        calls.some((c) => c.url.includes('/ilink/bot/sendtyping') && c.body?.status === 2),
        'should send typing stop (status=2) when reply is skipped',
      );
      assert.equal(adapter.typingTimers.has('unknown-user'), false, 'typing timer should be cleared');
    });

    it('strips markdown before sending', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-token-1');

      let capturedText = null;
      adapter._injectFetch(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        capturedText = body.msg.item_list[0].text_item.text;
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      await sendAndFlush(adapter, 'user-1', '**Hello** from [OfficeClaw](https://example.com)!');
      assert.equal(capturedText, 'Hello from OfficeClaw!');
    });

    it('uploads and sends a native file message from sendMedia', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-token-1');
      adapter._injectUploadMedia(async (params) => ({
        downloadEncryptedQueryParam: `download-${params.fileName}`,
        aesKeyHex: '0123456789abcdef0123456789abcdef',
        rawSize: 123,
        encryptedSize: 128,
      }));

      let capturedBody = null;
      adapter._injectFetch(async (_url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      await adapter.sendMedia('user-1', { type: 'file', absPath: '/tmp/report.pdf', fileName: 'report.pdf' });

      const item = capturedBody.msg.item_list[0];
      assert.equal(item.type, 4);
      assert.equal(item.file_item.file_name, 'report.pdf');
      assert.equal(item.file_item.len, '123');
      assert.equal(item.file_item.media.encrypt_query_param, 'download-report.pdf');
      assert.equal(item.file_item.media.encrypt_type, 1);
      assert.equal(capturedBody.msg.context_token, 'ctx-token-1');
    });

    it('flushes pending text before sending media', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-token-1');
      adapter._injectUploadMedia(async () => ({
        downloadEncryptedQueryParam: 'download-report',
        aesKeyHex: '0123456789abcdef0123456789abcdef',
        rawSize: 123,
        encryptedSize: 128,
      }));

      const sentTypes = [];
      adapter._injectFetch(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        sentTypes.push(body.msg.item_list[0].type);
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      await adapter.sendReply('user-1', '先发文字');
      await adapter.sendMedia('user-1', { type: 'file', absPath: '/tmp/report.pdf', fileName: 'report.pdf' });

      assert.deepEqual(sentTypes, [1, 4]);
    });

    it('performs getuploadurl, CDN upload, and file send without upload injection', async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'weixin-send-media-'));
      const filePath = path.join(tempDir, 'report.txt');
      await writeFile(filePath, 'hello weixin');

      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-token-1');
      const calls = [];
      adapter._injectFetch(async (url, opts) => {
        const body = opts?.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : null;
        calls.push({ url: String(url), method: opts?.method, body });
        if (String(url).includes('/ilink/bot/getuploadurl')) {
          return { ok: true, json: async () => ({ ret: 0, upload_full_url: 'https://cdn.example/upload' }) };
        }
        if (String(url) === 'https://cdn.example/upload') {
          return { ok: true, headers: new Headers({ 'x-encrypted-param': 'download-param' }) };
        }
        if (String(url).includes('/ilink/bot/sendmessage')) {
          return { ok: true, json: async () => ({ ret: 0 }) };
        }
        throw new Error(`unexpected fetch ${url}`);
      });

      await adapter.sendMedia('user-1', { type: 'file', absPath: filePath, fileName: 'report.txt' });

      assert.equal(calls.length, 3);
      assert.ok(calls[0].url.includes('/ilink/bot/getuploadurl'));
      assert.equal(calls[0].body.media_type, 3);
      assert.equal(calls[0].body.to_user_id, 'user-1');
      assert.equal(calls[1].url, 'https://cdn.example/upload');
      assert.equal(calls[1].method, 'POST');
      assert.ok(calls[2].url.includes('/ilink/bot/sendmessage'));
      const item = calls[2].body.msg.item_list[0];
      assert.equal(item.type, 4);
      assert.equal(item.file_item.file_name, 'report.txt');
      assert.equal(item.file_item.media.encrypt_query_param, 'download-param');

      await rm(tempDir, { recursive: true, force: true });
    });

    it('sends official sendmessage fields expected by openclaw protocol', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-1');

      let capturedMsg = null;
      adapter._injectFetch(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        capturedMsg = body.msg;
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      await sendAndFlush(adapter, 'user-1', 'hello');

      assert.equal(capturedMsg.from_user_id, '');
      assert.equal(capturedMsg.to_user_id, 'user-1');
      assert.equal(capturedMsg.message_type, 2);
      assert.equal(capturedMsg.message_state, 2);
      assert.equal(capturedMsg.context_token, 'ctx-1');
      assert.match(capturedMsg.client_id, /^office-claw-weixin-/);
    });

    it('parses raw text sendmessage responses without requiring res.json()', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-1');
      adapter._injectFetch(async () => ({
        ok: true,
        text: async () => JSON.stringify({ ret: 0, errmsg: 'ok' }),
      }));

      await sendAndFlush(adapter, 'user-1', 'hello');
    });

    it('throws on non-JSON 200 sendmessage response', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-1');
      adapter._injectFetch(async () => ({
        ok: true,
        text: async () => '<html>gateway error</html>',
      }));

      await assert.rejects(() => sendAndFlush(adapter, 'user-1', 'hello'), /sendmessage returned non-JSON response/);
    });

    it('throws on empty 200 sendmessage response body', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-1');
      adapter._injectFetch(async () => ({
        ok: true,
        text: async () => '',
      }));

      await assert.rejects(() => sendAndFlush(adapter, 'user-1', 'hello'), /sendmessage returned empty response body/);
    });

    it('sends all content in a single sendmessage call (no chunking)', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-1');

      let callCount = 0;
      let capturedTextLen = 0;
      adapter._injectFetch(async (_url, opts) => {
        callCount++;
        const body = JSON.parse(opts.body);
        capturedTextLen = body.msg.item_list[0].text_item.text.length;
        return { ok: true, json: async () => ({ ret: 0 }) };
      });

      const longText = 'A'.repeat(8000);
      await sendAndFlush(adapter, 'user-1', longText);

      assert.equal(callCount, 1, 'must be exactly 1 sendmessage call, no chunking');
      assert.equal(capturedTextLen, 8000, 'full text sent in single call');
    });

    it('throws on HTTP error from sendmessage', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-1');
      adapter._injectFetch(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'server error',
      }));

      await assert.rejects(() => sendAndFlush(adapter, 'user-1', 'test'), /sendmessage HTTP 500/);
    });

    it('throws on errcode -14 from sendmessage', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-1');
      adapter._injectFetch(async () => ({
        ok: true,
        json: async () => ({ errcode: -14, errmsg: 'session expired' }),
      }));

      await assert.rejects(() => sendAndFlush(adapter, 'user-1', 'test'), /errcode -14/);
    });

    it('throws on ret -14 from sendmessage', async () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-1');
      adapter._injectFetch(async () => ({
        ok: true,
        json: async () => ({ ret: -14, errmsg: 'session expired' }),
      }));

      await assert.rejects(() => sendAndFlush(adapter, 'user-1', 'test'), /errcode -14/);
    });
  });

  describe('chunkMessage', () => {
    it('returns single chunk for short messages', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const chunks = adapter.chunkMessage('hello', 2000);
      assert.deepEqual(chunks, ['hello']);
    });

    it('breaks at newlines when possible', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const text = `${'A'.repeat(15)}\n${'B'.repeat(10)}`;
      const chunks = adapter.chunkMessage(text, 20);
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0], 'A'.repeat(15));
      assert.equal(chunks[1], 'B'.repeat(10));
    });

    it('breaks at spaces as fallback', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const text = `${'A'.repeat(15)} ${'B'.repeat(10)}`;
      const chunks = adapter.chunkMessage(text, 20);
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0], 'A'.repeat(15));
      assert.equal(chunks[1], 'B'.repeat(10));
    });

    it('hard-cuts when no natural break point', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const text = 'A'.repeat(50);
      const chunks = adapter.chunkMessage(text, 20);
      assert.equal(chunks.length, 3);
      assert.equal(chunks[0], 'A'.repeat(20));
      assert.equal(chunks[1], 'A'.repeat(20));
      assert.equal(chunks[2], 'A'.repeat(10));
    });
  });

  describe('connectorId', () => {
    it('returns weixin', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      assert.equal(adapter.connectorId, 'weixin');
    });
  });

  describe('stripMarkdownForWeixin', () => {
    it('strips bold and italic markers', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('**bold** and *italic*'), 'bold and italic');
    });

    it('strips link syntax keeping text', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('[click here](https://example.com)'), 'click here');
    });

    it('strips image syntax keeping alt text', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('![cat photo](https://img.com/cat.jpg)'), 'cat photo');
    });

    it('strips fenced code blocks but keeps code content', () => {
      const input = 'before\n```js\nconsole.log("hi")\n```\nafter';
      const result = WeixinAdapter.stripMarkdownForWeixin(input);
      assert.ok(result.includes('console.log("hi")'), 'should preserve code content');
      assert.ok(!result.includes('```'), 'should not contain fence markers');
    });

    it('strips fenced code blocks with non-word info strings (shell-session, c++)', () => {
      const input = 'before\n```shell-session\n$ npm test\n```\nmid\n```c++\nint main() {}\n```\nafter';
      const result = WeixinAdapter.stripMarkdownForWeixin(input);
      assert.ok(result.includes('$ npm test'), 'should preserve shell-session code');
      assert.ok(result.includes('int main() {}'), 'should preserve c++ code');
      assert.ok(!result.includes('```'), 'should not contain fence markers');
      assert.ok(!result.includes('shell-session'), 'should strip info string');
      assert.ok(!result.includes('c++'), 'should strip info string');
    });

    it('preserves single-line fenced code content', () => {
      const result = WeixinAdapter.stripMarkdownForWeixin('run ```npm test``` now');
      assert.ok(result.includes('npm test'), 'should preserve single-line code');
      assert.ok(!result.includes('```'), 'should not contain fence markers');
    });

    it('converts inline code to plain text', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('use `npm install` here'), 'use npm install here');
    });

    it('strips heading markers', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('## Hello World'), 'Hello World');
    });

    it('converts unordered list markers to bullets', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('- item one\n- item two'), '• item one\n• item two');
    });

    it('preserves ordered list markers', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('1. item one\n2. item two'), '1. item one\n2. item two');
    });

    it('strips blockquote markers', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('> quoted text'), 'quoted text');
    });

    it('strips strikethrough markers', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('~~deleted~~'), 'deleted');
    });

    it('preserves literal underscores in identifiers (my_file_name)', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('my_file_name'), 'my_file_name');
    });

    it('preserves literal asterisks in expressions (2*3*4)', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('2*3*4'), '2*3*4');
    });

    it('strips true markdown italic emphasis (*word*)', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('this is *italic* text'), 'this is italic text');
    });

    it('strips true markdown italic emphasis (_word_)', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('this is _italic_ text'), 'this is italic text');
    });

    it('strips emphasis after CJK text (*重点*)', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('这是*重点*，请看'), '这是重点，请看');
    });

    it('strips emphasis inside parentheses (*italic*)', () => {
      const result = WeixinAdapter.stripMarkdownForWeixin('(*italic*)');
      assert.ok(!result.includes('*'), 'should strip asterisks');
      assert.ok(result.includes('italic'), 'should preserve text');
    });

    it('collapses excessive newlines', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('a\n\n\n\nb'), 'a\n\nb');
    });

    it('passes through plain text unchanged', () => {
      assert.equal(WeixinAdapter.stripMarkdownForWeixin('Hello world'), 'Hello world');
    });

    it('handles complex mixed markdown', () => {
      const input =
        '## Summary\n\n**Key point**: use [this tool](https://x.com) for `testing`.\n\n```bash\nnpm test\n```\n\n- Step one\n- Step two';
      const result = WeixinAdapter.stripMarkdownForWeixin(input);
      assert.ok(!result.includes('**'), 'should not contain bold markers');
      assert.ok(!result.includes('```'), 'should not contain code fences');
      assert.ok(!result.includes('['), 'should not contain link brackets');
      assert.ok(result.includes('Key point'), 'should preserve meaningful text');
      assert.ok(result.includes('this tool'), 'should preserve link text');
      assert.ok(result.includes('npm test'), 'should preserve code block content');
    });
  });

  describe('context token management', () => {
    it('caches context_token during parseUpdates processing', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      assert.equal(adapter.hasContextToken('user-1'), false);

      adapter._injectContextToken('user-1', 'ctx-1');
      assert.equal(adapter.hasContextToken('user-1'), true);
    });
  });

  describe('cursor management', () => {
    it('starts with empty cursor', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      assert.equal(adapter._getCursor(), '');
    });

    it('returns new cursor from getupdates response', () => {
      const adapter = new WeixinAdapter('test-token', noopLog());
      const result = adapter.parseUpdates({ ret: 0, get_updates_buf: 'new-cursor', msgs: [] });
      assert.equal(result.newCursor, 'new-cursor');
    });
  });

  describe('auth headers', () => {
    it('includes required iLink auth headers in fetch calls', async () => {
      const adapter = new WeixinAdapter('my-bot-token', noopLog());
      adapter._injectContextToken('user-1', 'ctx-1');

      let capturedHeaders = null;
      adapter._injectFetch(async (_url, opts) => {
        capturedHeaders = opts.headers;
        return { ok: true, json: async () => ({ errcode: 0 }) };
      });

      const p = adapter.sendReply('user-1', 'test');
      await adapter._flushAllPending();
      await p;

      assert.equal(capturedHeaders.AuthorizationType, 'ilink_bot_token');
      assert.equal(capturedHeaders.Authorization, 'Bearer my-bot-token');
      assert.ok(capturedHeaders['X-WECHAT-UIN'], 'X-WECHAT-UIN header must be present');
      assert.equal(capturedHeaders['Content-Type'], 'application/json');
    });

    it('generates X-WECHAT-UIN from crypto-secure random bytes', async () => {
      const originalRandomBytes = crypto.randomBytes;
      crypto.randomBytes = ((size) => {
        assert.equal(size, 4);
        return Buffer.from([0, 0, 0, 42]);
      });

      try {
        const adapter = new WeixinAdapter('my-bot-token', noopLog());
        adapter._injectContextToken('user-1', 'ctx-1');

        let capturedHeaders = null;
        adapter._injectFetch(async (_url, opts) => {
          capturedHeaders = opts.headers;
          return { ok: true, json: async () => ({ errcode: 0 }) };
        });

        const p = adapter.sendReply('user-1', 'test');
        await adapter._flushAllPending();
        await p;

        assert.equal(capturedHeaders['X-WECHAT-UIN'], Buffer.from('42').toString('base64'));
      } finally {
        crypto.randomBytes = originalRandomBytes;
      }
    });
  });

  describe('botToken management', () => {
    it('hasBotToken returns false for empty token', () => {
      const adapter = new WeixinAdapter('', noopLog());
      assert.equal(adapter.hasBotToken(), false);
    });

    it('hasBotToken returns true for non-empty token', () => {
      const adapter = new WeixinAdapter('some-token', noopLog());
      assert.equal(adapter.hasBotToken(), true);
    });

    it('setBotToken updates the token', () => {
      const adapter = new WeixinAdapter('', noopLog());
      assert.equal(adapter.hasBotToken(), false);
      adapter.setBotToken('new-token');
      assert.equal(adapter.hasBotToken(), true);
    });
  });

  describe('QR code login (static methods)', () => {
    afterEach(() => {
      // Reset static fetch to globalThis.fetch after each QR test
      WeixinAdapter._injectStaticFetch(globalThis.fetch);
    });

    describe('fetchQrCode', () => {
      it('falls back to official iLink base URL when ILINK_BASE_URL is unset', async () => {
        const originalBase = process.env.ILINK_BASE_URL;
        delete process.env.ILINK_BASE_URL;
        let capturedUrl = null;
        WeixinAdapter._injectStaticFetch(async (url) => {
          capturedUrl = url;
          return {
            ok: true,
            json: async () => ({
              errcode: 0,
              qrcode: 'payload-default-base',
              qrcode_img_content: 'https://liteapp.weixin.qq.com/q/default',
            }),
          };
        });

        try {
          await WeixinAdapter.fetchQrCode();
          assert.equal(
            capturedUrl,
            'https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode?bot_type=3',
            'should use default official iLink base URL',
          );
        } finally {
          if (typeof originalBase === 'string') {
            process.env.ILINK_BASE_URL = originalBase;
          } else {
            delete process.env.ILINK_BASE_URL;
          }
        }
      });

      it('normalizes trailing slash in ILINK_BASE_URL to avoid double slash URLs', async () => {
        const originalBase = process.env.ILINK_BASE_URL;
        process.env.ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com/';
        let capturedUrl = null;
        WeixinAdapter._injectStaticFetch(async (url) => {
          capturedUrl = url;
          return {
            ok: true,
            json: async () => ({
              errcode: 0,
              qrcode: 'payload-trailing-slash',
              qrcode_img_content: 'https://liteapp.weixin.qq.com/q/trailing',
            }),
          };
        });

        try {
          await WeixinAdapter.fetchQrCode();
          assert.equal(
            capturedUrl,
            'https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode?bot_type=3',
            'should not contain double slash between host and path',
          );
        } finally {
          if (typeof originalBase === 'string') {
            process.env.ILINK_BASE_URL = originalBase;
          } else {
            delete process.env.ILINK_BASE_URL;
          }
        }
      });

      it('returns qrUrl and qrPayload on success', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({
            errcode: 0,
            qrcode_url: 'https://weixin.qq.com/qr/abc123',
            qrcode: 'payload-xyz',
          }),
        }));

        const result = await WeixinAdapter.fetchQrCode();
        assert.ok(result.qrUrl.startsWith('data:image/png;base64,'), 'qrUrl should be a data URI');
        assert.equal(result.qrPayload, 'payload-xyz');
      });

      it('parses real iLink response with qrcode_img_content and ret', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({
            ret: 0,
            qrcode: 'ef1387e07975295290b7d609dd5e3da7',
            qrcode_img_content: 'https://liteapp.weixin.qq.com/q/7GiQu1?qrcode=ef1387e&bot_type=3',
          }),
        }));

        const result = await WeixinAdapter.fetchQrCode();
        assert.ok(result.qrUrl.startsWith('data:image/png;base64,'), 'qrUrl should be a data URI');
        assert.equal(result.qrPayload, 'ef1387e07975295290b7d609dd5e3da7');
      });

      it('prefers qrcode_img_content over qrcode_url when both present', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({
            ret: 0,
            qrcode: 'payload-abc',
            qrcode_img_content: 'https://liteapp.weixin.qq.com/preferred',
            qrcode_url: 'https://weixin.qq.com/fallback',
          }),
        }));

        const result = await WeixinAdapter.fetchQrCode();
        assert.ok(result.qrUrl.startsWith('data:image/png;base64,'), 'qrUrl should be a data URI (from img_content)');
      });

      it('throws on non-zero ret (iLink error format)', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ ret: -1, errmsg: 'bot quota exceeded' }),
        }));

        await assert.rejects(() => WeixinAdapter.fetchQrCode(), /get_bot_qrcode errcode -1.*bot quota exceeded/);
      });

      it('throws on HTTP error', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
        }));

        await assert.rejects(() => WeixinAdapter.fetchQrCode(), /get_bot_qrcode HTTP 502/);
      });

      it('throws on non-zero errcode', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ errcode: -1, errmsg: 'service unavailable' }),
        }));

        await assert.rejects(() => WeixinAdapter.fetchQrCode(), /get_bot_qrcode errcode -1.*service unavailable/);
      });

      it('throws when response missing qrcode_img_content/qrcode_url or qrcode', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ errcode: 0 }),
        }));

        await assert.rejects(() => WeixinAdapter.fetchQrCode(), /missing qrcode_img_content\/qrcode_url or qrcode/);
      });
    });

    describe('pollQrCodeStatus', () => {
      it('returns waiting for status 0', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ errcode: 0, status: 0 }),
        }));

        const result = await WeixinAdapter.pollQrCodeStatus('qr-payload');
        assert.equal(result.status, 'waiting');
      });

      it('returns scanned for status 1', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ errcode: 0, status: 1 }),
        }));

        const result = await WeixinAdapter.pollQrCodeStatus('qr-payload');
        assert.equal(result.status, 'scanned');
      });

      it('returns confirmed with botToken for status 2', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ errcode: 0, status: 2, bot_token: 'live-token-abc' }),
        }));

        const result = await WeixinAdapter.pollQrCodeStatus('qr-payload');
        assert.equal(result.status, 'confirmed');
        assert.equal(result.botToken, 'live-token-abc');
      });

      it('returns error when status 2 but no bot_token', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ errcode: 0, status: 2 }),
        }));

        const result = await WeixinAdapter.pollQrCodeStatus('qr-payload');
        assert.equal(result.status, 'error');
        assert.ok(result.message.includes('confirmed but no bot_token'));
      });

      it('returns expired for status 3', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ errcode: 0, status: 3 }),
        }));

        const result = await WeixinAdapter.pollQrCodeStatus('qr-payload');
        assert.equal(result.status, 'expired');
      });

      it('returns error for unknown status code', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ errcode: 0, status: 99 }),
        }));

        const result = await WeixinAdapter.pollQrCodeStatus('qr-payload');
        assert.equal(result.status, 'error');
        assert.ok(result.message.includes('unknown status 99'));
      });

      it('returns error on HTTP failure', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: false,
          status: 500,
        }));

        const result = await WeixinAdapter.pollQrCodeStatus('qr-payload');
        assert.equal(result.status, 'error');
        assert.ok(result.message.includes('HTTP 500'));
      });

      it('returns error on non-zero errcode', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ errcode: -7, errmsg: 'invalid qrcode' }),
        }));

        const result = await WeixinAdapter.pollQrCodeStatus('qr-payload');
        assert.equal(result.status, 'error');
        assert.ok(result.message.includes('invalid qrcode'));
      });

      it('URL-encodes the qrPayload in the request', async () => {
        let capturedUrl = null;
        WeixinAdapter._injectStaticFetch(async (url) => {
          capturedUrl = url;
          return { ok: true, json: async () => ({ errcode: 0, status: 0 }) };
        });

        await WeixinAdapter.pollQrCodeStatus('payload with spaces&special=chars');
        assert.ok(capturedUrl.includes(encodeURIComponent('payload with spaces&special=chars')));
      });

      it('returns waiting for string status "wait" (real iLink format)', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ ret: 0, status: 'wait' }),
        }));

        const result = await WeixinAdapter.pollQrCodeStatus('qr-payload');
        assert.equal(result.status, 'waiting');
      });

      it('returns expired for string status "expired" (real iLink format)', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ ret: 0, status: 'expired' }),
        }));

        const result = await WeixinAdapter.pollQrCodeStatus('qr-payload');
        assert.equal(result.status, 'expired');
      });

      it('returns confirmed for string status "confirmed" with bot_token', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ ret: 0, status: 'confirmed', bot_token: 'real-token-xyz' }),
        }));

        const result = await WeixinAdapter.pollQrCodeStatus('qr-payload');
        assert.equal(result.status, 'confirmed');
        assert.equal(result.botToken, 'real-token-xyz');
      });

      it('returns scanned for string status "scanned"', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ ret: 0, status: 'scanned' }),
        }));

        const result = await WeixinAdapter.pollQrCodeStatus('qr-payload');
        assert.equal(result.status, 'scanned');
      });

      it('returns error on non-zero ret in poll response', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ ret: -7, errmsg: 'invalid qrcode' }),
        }));

        const result = await WeixinAdapter.pollQrCodeStatus('qr-payload');
        assert.equal(result.status, 'error');
        assert.ok(result.message.includes('invalid qrcode'));
      });

      it('uses a timeout >= 35 s to accommodate iLink long-poll', async () => {
        let capturedOptions = null;
        WeixinAdapter._injectStaticFetch(async (_url, opts) => {
          capturedOptions = opts;
          return { ok: true, json: async () => ({ ret: 0, status: 'wait' }) };
        });

        await WeixinAdapter.pollQrCodeStatus('qr-payload');
        assert.ok(capturedOptions, 'fetch options should be captured');
        assert.ok(capturedOptions.signal, 'signal should be present');
        assert.equal(capturedOptions.signal.aborted, false);
      });
    });

    describe('waitForQrCodeLogin', () => {
      it('returns immediately on confirmed status', async () => {
        let pollCount = 0;
        WeixinAdapter._injectStaticFetch(async () => {
          pollCount++;
          return {
            ok: true,
            json: async () => ({ errcode: 0, status: 2, bot_token: 'confirmed-token' }),
          };
        });

        const result = await WeixinAdapter.waitForQrCodeLogin('qr-payload');
        assert.equal(result.status, 'confirmed');
        assert.equal(result.botToken, 'confirmed-token');
        assert.equal(pollCount, 1);
      });

      it('returns immediately on expired status', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => ({ errcode: 0, status: 3 }),
        }));

        const result = await WeixinAdapter.waitForQrCodeLogin('qr-payload');
        assert.equal(result.status, 'expired');
      });

      it('returns immediately on error status', async () => {
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: false,
          status: 500,
        }));

        const result = await WeixinAdapter.waitForQrCodeLogin('qr-payload');
        assert.equal(result.status, 'error');
      });

      it('calls onStatusChange when status transitions', async () => {
        const responses = [
          { errcode: 0, status: 0 }, // waiting
          { errcode: 0, status: 0 }, // still waiting (no callback)
          { errcode: 0, status: 1 }, // scanned
          { errcode: 0, status: 2, bot_token: 'tk' }, // confirmed
        ];
        let callIdx = 0;
        WeixinAdapter._injectStaticFetch(async () => ({
          ok: true,
          json: async () => responses[Math.min(callIdx++, responses.length - 1)],
        }));

        const statusChanges = [];
        const result = await WeixinAdapter.waitForQrCodeLogin('qr-payload', (s) => {
          statusChanges.push(s.status);
        });

        assert.equal(result.status, 'confirmed');
        // Should have 3 unique transitions: waiting → scanned → confirmed
        assert.deepEqual(statusChanges, ['waiting', 'scanned', 'confirmed']);
      });
    });
  });
});
