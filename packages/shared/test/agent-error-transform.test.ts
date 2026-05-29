/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyError, getFriendlyAgentErrorMessage, getRateLimitMessage } from '../src/agent-error-transform.js';

describe('classifyError', () => {
  it('classifies timeout errors', () => {
    assert.equal(classifyError('request timed out before completion'), 'timeout');
    assert.equal(classifyError('Connection timeout'), 'timeout');
  });

  it('classifies connection errors', () => {
    assert.equal(classifyError('connection failed'), 'connection');
    assert.equal(classifyError('connection closed unexpectedly'), 'connection');
    assert.equal(classifyError('WebSocket connection closed'), 'connection');
  });

  it('classifies config errors', () => {
    assert.equal(classifyError('WebSocket URL is not configured'), 'config');
    assert.equal(classifyError('provider profile is not configured'), 'config');
    assert.equal(classifyError('model profile is missing'), 'config');
  });

  it('classifies auth errors', () => {
    assert.equal(classifyError('Invalid API key'), 'auth');
    assert.equal(classifyError('401 Unauthorized: invalid_api_key'), 'auth');
    assert.equal(classifyError('403 forbidden: permission denied'), 'auth');
  });

  it('classifies abrupt exit errors', () => {
    assert.equal(classifyError('CLI 异常退出 (code: 1)'), 'abrupt_exit');
    assert.equal(classifyError('subprocess exited unexpectedly'), 'abrupt_exit');
    assert.equal(classifyError('abnormal exit'), 'abrupt_exit');
  });

  it('classifies max iterations errors', () => {
    assert.equal(classifyError('max iterations reached'), 'max_iterations');
    assert.equal(classifyError('max_iterations_reached'), 'max_iterations');
  });

  it('classifies sensitive input errors', () => {
    assert.equal(
      classifyError('ModelArts.81011: Input text May contain sensitive information'),
      'sensitive_input',
    );
  });

  it('classifies temporary model rate limit errors', () => {
    assert.equal(
      classifyError(
        "[181001] model call failed, reason: openAI API async stream error: Error code: 429 - {'error': {'code': 'ModelArts.81101', 'message': 'Too many requests', 'type': 'TooManyRequests'}}",
      ),
      'rate_limit',
    );
  });

  it('classifies generic 429 rate limit errors without vendor code', () => {
    assert.equal(classifyError('openai api error: status 429, rate limit exceeded, try again later'), 'rate_limit');
  });

  it('classifies daily quota exhaustion errors', () => {
    assert.equal(
      classifyError(
        "[181001] model call failed, reason: openAI API async stream error: Error code: 429 - {'error': {'code': 'APIG.0308', 'message': 'Daily quota exhausted', 'type': 'TooManyRequests'}, 'error_code': 'APIG.0308', 'error_msg': 'Daily quota exhausted'}",
      ),
      'daily_quota',
    );
  });

  it('classifies insufficient quota / billing errors', () => {
    assert.equal(classifyError('openai error: insufficient_quota'), 'insufficient_quota');
    assert.equal(classifyError('billing hard limit reached for this account'), 'insufficient_quota');
  });

  it('classifies context length exceeded errors', () => {
    assert.equal(
      classifyError('maximum context length exceeded: this model supports 128000 tokens'),
      'context_length',
    );
  });

  it('classifies service unavailable/overloaded errors', () => {
    assert.equal(classifyError('503 Service Unavailable'), 'service_unavailable');
    assert.equal(classifyError('529 model overloaded, try again later'), 'service_unavailable');
  });

  it('classifies unknown errors', () => {
    assert.equal(classifyError('Something went wrong'), 'unknown');
    assert.equal(classifyError('Random error message'), 'unknown');
  });
});

describe('getFriendlyAgentErrorMessage', () => {
  it('generates friendly message for timeout errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
      error: '响应超时',
      metadata: { provider: 'anthropic', model: 'claude-3' },
    });
    assert.match(msg, /超时|重试/);
  });

  it('generates friendly message for connection errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'codex',
      error: 'connection failed',
      metadata: { provider: 'openai', model: 'gpt-4' },
    });
    assert.match(msg, /连接|重试/);
  });

  it('generates friendly message for config errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
      error: 'Invalid API key',
    });
    assert.match(msg, /WebSocket|配置/);
  });

  it('generates friendly message for auth errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
      error: '401 Unauthorized: invalid_api_key',
    });
    assert.match(msg, /鉴权失败|API Key|权限不足/);
  });

  it('generates friendly message for sensitive input errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
      error: 'ModelArts.81011: Input text May contain sensitive information',
    });
    assert.match(msg, /敏感词|新会话/);
  });

  it('generates retry guidance for temporary model rate limit errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
      error:
        "[181001] model call failed, reason: openAI API async stream error: Error code: 429 - {'error': {'code': 'ModelArts.81101', 'message': 'Too many requests', 'type': 'TooManyRequests'}, 'error_code': 'ModelArts.81101', 'error_msg': 'Too many requests'}",
      errorCode: 'ModelArts.81101',
    });
    assert.equal(msg, getRateLimitMessage());
  });

  it('generates retry guidance for generic 429 rate limit errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
      error: 'openai api error: status 429, rate limit exceeded, try again later',
    });
    assert.equal(msg, getRateLimitMessage());
  });

  it('generates friendly message for daily quota exhaustion errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
      error:
        "[181001] model call failed, reason: openAI API async stream error: Error code: 429 - {'error': {'code': 'APIG.0308', 'message': 'Daily quota exhausted', 'type': 'TooManyRequests'}, 'error_code': 'APIG.0308', 'error_msg': 'Daily quota exhausted'}",
      errorCode: 'APIG.0308',
    });
    assert.match(msg, /免费模型使用额度已用尽|MaaS/);
  });

  it('generates friendly message for insufficient quota errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
      error: 'insufficient_quota: billing hard limit reached',
    });
    assert.match(msg, /额度|配额|余额/);
  });

  it('generates friendly message for context length errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
      error: 'maximum context length exceeded',
    });
    assert.match(msg, /上下文|精简内容|新开会话/);
  });

  it('generates friendly message for service unavailable errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
      error: '529 model overloaded',
    });
    assert.match(msg, /繁忙|不可用|稍后重试/);
  });

  it('truncates long error messages', () => {
    const longError = 'x'.repeat(2000);
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
      error: longError,
    });
    assert.ok(msg.length < longError.length);
  });

  it('handles missing error field', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
    });
    assert.match(msg, /没有顺利完成/);
  });

  it('handles empty error string', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
      error: '',
    });
    assert.match(msg, /没有顺利完成|重试/);
  });

  it('generates friendly message for abrupt exit errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
      error: 'CLI 异常退出',
    });
    assert.match(msg, /中断|重试/);
  });

  it('generates friendly message for max iterations errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      agentId: 'jiuwen',
      error: 'max iterations reached',
    });
    assert.match(msg, /最大思考轮数/);
  });
});
