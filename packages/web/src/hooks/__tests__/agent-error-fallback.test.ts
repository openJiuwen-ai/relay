/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import {
  APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE,
  getDailyQuotaExhaustedChatMessage,
  MODEL_ARTS_RATE_LIMIT_ERROR_CODE,
  MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE,
  getAgentErrorToastContent,
  getFriendlyAgentErrorMessage,
  getRateLimitChatMessage,
  getSensitiveInputErrorToastContent,
  isDailyQuotaExhaustedAgentError,
  isRateLimitError,
  isSensitiveInputAgentError,
} from '@/hooks/agent-error-fallback';

describe('agent sensitive-input error classification', () => {
  it('detects structured ModelArts sensitive-input errors', () => {
    expect(
      isSensitiveInputAgentError({
        errorCode: MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE,
        error: 'Input text May contain sensitive information, please try again.',
      }),
    ).toBe(true);
  });

  it('detects raw upstream payloads with smart quotes', () => {
    expect(
      isSensitiveInputAgentError({
        error:
          '{‘error’: {‘code’: ‘ModelArts.81011’, ‘message’: ‘Input text May contain sensitive information, please try again.’}}',
      }),
    ).toBe(true);
  });

  it('returns sensitive-input specific bubble copy and toast copy', () => {
    expect(
      getFriendlyAgentErrorMessage({
        errorCode: MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE,
        error: 'Input text May contain sensitive information, please try again.',
      }),
    ).toContain('重新打开一个新会话');

    expect(getSensitiveInputErrorToastContent()).toEqual({
      title: '检测到敏感词',
      message: '当前对话触发了敏感词校验，请重新打开一个新会话后再试。',
    });
  });
});

describe('agent rate-limit error classification', () => {
  it('detects structured ModelArts rate-limit errors', () => {
    expect(
      isRateLimitError({
        errorCode: MODEL_ARTS_RATE_LIMIT_ERROR_CODE,
        error:
          "[181001] model call failed, reason: openAI API async stream error: Error code: 429 - {'error': {'code': 'ModelArts.81101', 'message': 'Too many requests, the rate limit is 2000000 tokens per minute.', 'type': 'TooManyRequests'}, 'error_code': 'ModelArts.81101', 'error_msg': 'Too many requests, the rate limit is 2000000 tokens per minute.'}",
      }),
    ).toBe(true);
  });

  it('returns the fixed retry guidance copy', () => {
    expect(
      getFriendlyAgentErrorMessage({
        errorCode: MODEL_ARTS_RATE_LIMIT_ERROR_CODE,
        error:
          "[181001] model call failed, reason: openAI API async stream error: Error code: 429 - {'error': {'code': 'ModelArts.81101', 'message': 'Too many requests, the rate limit is 2000000 tokens per minute.', 'type': 'TooManyRequests'}, 'error_code': 'ModelArts.81101', 'error_msg': 'Too many requests, the rate limit is 2000000 tokens per minute.'}",
      }),
    ).toBe(getRateLimitChatMessage());
  });
});

describe('agent daily quota exhaustion classification', () => {
  it('detects structured APIG daily quota exhaustion errors', () => {
    expect(
      isDailyQuotaExhaustedAgentError({
        errorCode: APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE,
        error:
          "[181001] model call failed, reason: openAI API async stream error: Error code: 429 - {'error': {'code': 'APIG.0308', 'message': 'Daily quota exhausted', 'type': 'TooManyRequests'}, 'error_code': 'APIG.0308', 'error_msg': 'Daily quota exhausted'}",
      }),
    ).toBe(true);
  });

  it('returns the fixed daily quota guidance copy', () => {
    expect(
      getFriendlyAgentErrorMessage({
        errorCode: APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE,
        error:
          "[181001] model call failed, reason: openAI API async stream error: Error code: 429 - {'error': {'code': 'APIG.0308', 'message': 'Daily quota exhausted', 'type': 'TooManyRequests'}, 'error_code': 'APIG.0308', 'error_msg': 'Daily quota exhausted'}",
      }),
    ).toBe(getDailyQuotaExhaustedChatMessage());
  });
});

describe('getFriendlyAgentErrorMessage', () => {
  it('does not suggest changing the prompt for timeout errors', () => {
    expect(getFriendlyAgentErrorMessage({ error: 'request timed out before completion' })).toBe(
      '这次响应超时了，我先结束本次尝试。请稍后直接重试。',
    );
  });

  it('explains missing provider profile configuration explicitly', () => {
    expect(getFriendlyAgentErrorMessage({ error: 'ACP provider profile is not configured' })).toBe(
      '当前智能体未绑定可用的 provider profile，暂时无法处理请求。请先检查并绑定正确的 provider profile。',
    );
  });

  it('explains missing websocket configuration explicitly', () => {
    expect(getFriendlyAgentErrorMessage({ error: 'jiuwen WebSocket URL is not configured' })).toBe(
      '当前智能体缺少 WebSocket 地址配置，暂时无法启动。请先配置对应智能体的连接地址后再重试。',
    );
  });

  it('falls back to raw error details for uncovered configuration problems', () => {
    expect(getFriendlyAgentErrorMessage({ error: 'DARE CLI path is not configured' })).toBe(
      '当前智能体配置存在问题，暂时无法处理这次请求。请检查配置后重试。原始错误：DARE CLI path is not configured',
    );
    expect(getFriendlyAgentErrorMessage({ error: 'sidecar exited during startup' })).toBe(
      '当前智能体配置存在问题，暂时无法处理这次请求。请检查配置后重试。原始错误：sidecar exited during startup',
    );
  });

  it('uses a retry-only generic fallback', () => {
    expect(getFriendlyAgentErrorMessage({ error: 'some unexpected upstream failure' })).toBe(
      '这次处理没有顺利完成。我先结束本次尝试，请稍后重试。',
    );
  });

  it('explains jiuwenclaw max ReAct iterations explicitly', () => {
    expect(
      getFriendlyAgentErrorMessage({
        error: 'Max iterations reached without completion',
      }),
    ).toBe('已达到本次对话允许的最大思考轮数，任务未在限定的轮数内完成。');
    expect(getFriendlyAgentErrorMessage({ error: 'max_iterations_reached' })).toBe(
      '已达到本次对话允许的最大思考轮数，任务未在限定的轮数内完成。',
    );
  });

  it('distinguishes connection errors from abrupt exit errors', () => {
    // Connection errors
    expect(getFriendlyAgentErrorMessage({ error: 'connection failed' })).toBe(
      '当前智能体连接不稳定，暂时无法完成这次处理。请稍后重试；如果持续出现，说明后端服务可能需要检查。',
    );
    expect(
      getFriendlyAgentErrorMessage({ error: 'assistant connection failed: WebSocket connection closed unexpectedly' }),
    ).toBe('当前智能体连接不稳定，暂时无法完成这次处理。请稍后重试；如果持续出现，说明后端服务可能需要检查。');

    // Abrupt exit errors (should NOT match "connection closed unexpectedly" in connection context)
    expect(getFriendlyAgentErrorMessage({ error: 'CLI 异常退出 (code: 1, signal: none)' })).toBe(
      '这次响应中断了，我没能稳定完成处理。请重试一次；如果连续出现，请稍后再试。',
    );
    expect(getFriendlyAgentErrorMessage({ error: 'subprocess exited unexpectedly' })).toBe(
      '这次响应中断了，我没能稳定完成处理。请重试一次；如果连续出现，请稍后再试。',
    );
  });
});

describe('getAgentErrorToastContent', () => {
  it('uses generic error toast title for non-sensitive agent failures', () => {
    expect(
      getAgentErrorToastContent({
        agentId: 'codex',
        error: 'request timed out before completion',
      }),
    ).toEqual({
      title: 'codex 出错',
      message: '这次响应超时了，我先结束本次尝试。请稍后直接重试。',
    });
  });

  it('includes known error subtype labels in toast message', () => {
    expect(
      getAgentErrorToastContent({
        agentId: 'codex',
        error: 'some unexpected upstream failure',
        content: JSON.stringify({ errorSubtype: 'error_max_budget_usd' }),
      }),
    ).toEqual({
      title: 'codex 出错',
      message: '这次处理没有顺利完成。我先结束本次尝试，请稍后重试。 (预算用尽)',
    });
  });

  it('prefers cat display name for toast title when available', () => {
    expect(
      getAgentErrorToastContent({
        agentId: 'agent-abc123',
        agentDisplayName: '产品分析助手',
        error: 'request timed out before completion',
      }),
    ).toEqual({
      title: '产品分析助手 出错',
      message: '这次响应超时了，我先结束本次尝试。请稍后直接重试。',
    });
  });
});
