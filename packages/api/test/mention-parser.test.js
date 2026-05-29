/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseMentions } from '../dist/infrastructure/connectors/mention-parser.js';

const allPatterns = new Map([
  ['opus', ['@opus', '@claude', '@office', '@宪宪']],
  ['codex', ['@codex', '@assistant', '@codex-review', '@砚砚']],
  ['gemini', ['@gemini', '@design', '@gemini-design', '@烁烁']],
]);

describe('parseMentions', () => {
  it('returns matched agentId for @opus', () => {
    const result = parseMentions('@opus hello', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opus');
  });

  it('returns matched agentId for @assistant', () => {
    const result = parseMentions('@assistant 请review', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'codex');
  });

  it('returns matched agentId for @砚砚 (nickname)', () => {
    const result = parseMentions('@砚砚 你看看这个', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'codex');
  });

  it('returns defaultAgentId when no mention found', () => {
    const result = parseMentions('hello world', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opus');
  });

  it('matches mention anywhere in text', () => {
    const result = parseMentions('hey @codex check this', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'codex');
  });

  it('returns first match when multiple cats mentioned', () => {
    const result = parseMentions('@codex @gemini hello', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'codex');
  });

  it('is case-insensitive for English patterns', () => {
    const result = parseMentions('@OPUS hello', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opus');
  });

  it('does not match partial words like @opusxyz', () => {
    const result = parseMentions('@opusxyz hello', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opus'); // default, not matched
  });

  it('matches @mention at end of text', () => {
    const result = parseMentions('please review @codex', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'codex');
  });

  it('matches @mention followed by punctuation', () => {
    const result = parseMentions('@gemini, 看看这个', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'gemini');
  });

  it('returns default when patterns map is empty', () => {
    const result = parseMentions('@opus hello', new Map(), 'opus');
    assert.equal(result.targetAgentId, 'opus');
  });

  // P1-1: CJK full-width punctuation after mention
  it('matches @mention followed by Chinese full-width comma', () => {
    const result = parseMentions('@assistant，看下这个', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'codex');
  });

  it('matches @mention followed by Chinese full-width period', () => {
    const result = parseMentions('@claude。你好', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opus');
  });

  it('matches @mention followed by Chinese full-width exclamation', () => {
    const result = parseMentions('@砚砚！快来', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'codex');
  });

  it('matches @mention followed by Chinese full-width question mark', () => {
    const result = parseMentions('@烁烁？你在吗', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'gemini');
  });

  // P1-2: first-in-text mention wins, not first-in-map
  it('returns first mention by text position, not map iteration order', () => {
    // gemini appears first in text, codex second — gemini should win
    const result = parseMentions('@gemini hi @codex', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'gemini');
  });

  it('returns first mention by text position with CJK patterns', () => {
    // design appears before claude in text
    const result = parseMentions('请 @design 和 @claude 一起看', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'gemini');
  });

  // R2-P1: email/domain false positive — left boundary constraint
  it('does not match @codex inside email address', () => {
    const result = parseMentions('请发到 foo@codex.com 再看', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opus'); // default, not codex
  });

  it('does not match @opus inside domain-like string', () => {
    // Use codex as default to distinguish false match from default
    const result = parseMentions('visit site@opus.dev for details', allPatterns, 'codex');
    assert.equal(result.targetAgentId, 'codex'); // default codex, not opus
  });

  it('still matches @codex at start of text (left boundary = BOL)', () => {
    const result = parseMentions('@codex check this', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'codex');
  });

  it('still matches @codex after CJK text without space', () => {
    // In CJK writing, there's often no space before @mention
    const result = parseMentions('帮忙看看@codex', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'codex');
  });

  // Cloud-R1-P1: period directly before @mention should still match
  it('matches @codex after sentence-ending period without space', () => {
    const result = parseMentions('ok.@codex please', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'codex');
  });

  // Cloud-R2-P2: bracket punctuation after mention
  it('matches @codex wrapped in parentheses', () => {
    const result = parseMentions('(@codex) ping', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'codex');
  });

  it('matches @codex followed by closing bracket', () => {
    const result = parseMentions('see [@codex]', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'codex');
  });

  it('matches full-width ＠ mention from IM clients', () => {
    const result = parseMentions('请 ＠assistant 看一下', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'codex');
  });
});
