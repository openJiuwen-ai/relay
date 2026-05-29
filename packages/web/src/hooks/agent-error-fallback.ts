/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import {
  APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE,
  MODEL_ARTS_RATE_LIMIT_ERROR_CODE,
  MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE,
  getDailyQuotaExhaustedMessage,
  getFriendlyAgentErrorMessage as getSharedFriendlyAgentErrorMessage,
  getRateLimitMessage,
  isDailyQuotaExhaustedError as isSharedDailyQuotaExhaustedError,
  isRateLimitError as isSharedRateLimitError,
  isSensitiveInputError as isSharedSensitiveInputError,
  type ErrorLike as SharedErrorLike,
} from '@openjiuwen/relay-shared';

export { APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE, MODEL_ARTS_RATE_LIMIT_ERROR_CODE, MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE };

export type ErrorLike = SharedErrorLike & {
  agentDisplayName?: string;
};

export function isRateLimitError(msg: ErrorLike): boolean {
  return isSharedRateLimitError(msg);
}

export function getRateLimitChatMessage(): string {
  return getRateLimitMessage();
}

export function isDailyQuotaExhaustedAgentError(msg: ErrorLike): boolean {
  return isSharedDailyQuotaExhaustedError(msg);
}

export function getDailyQuotaExhaustedChatMessage(): string {
  return getDailyQuotaExhaustedMessage();
}

export function isSensitiveInputAgentError(msg: ErrorLike): boolean {
  return isSharedSensitiveInputError(msg);
}

export function getSensitiveInputErrorToastContent(): { title: string; message: string } {
  return {
    title: '检测到敏感词',
    message: '当前对话触发了敏感词校验，请重新打开一个新会话后再试。',
  };
}

const ERROR_SUBTYPE_LABELS: Record<string, string> = {
  error_max_turns: '超出 turn 限制',
  error_max_budget_usd: '预算用尽',
  error_during_execution: '运行时错误',
  error_max_structured_output_retries: '结构化输出重试超限',
};

export function getFriendlyAgentErrorMessage(msg: ErrorLike): string {
  return getSharedFriendlyAgentErrorMessage(msg);
}

function getErrorSubtypeLabel(rawContent?: string): string | null {
  if (!rawContent) return null;
  try {
    const parsed = JSON.parse(rawContent) as { errorSubtype?: unknown };
    if (typeof parsed.errorSubtype !== 'string') return null;
    return ERROR_SUBTYPE_LABELS[parsed.errorSubtype] ?? null;
  } catch {
    return null;
  }
}

export function getAgentErrorToastContent(msg: ErrorLike & { content?: string }): { title: string; message: string } {
  if (isSensitiveInputAgentError(msg)) {
    return getSensitiveInputErrorToastContent();
  }

  const subtypeLabel = getErrorSubtypeLabel(msg.content);
  const baseMessage = getFriendlyAgentErrorMessage(msg);
  const agentLabel = msg.agentDisplayName?.trim() || msg.agentId?.trim();

  return {
    title: agentLabel ? `${agentLabel} 出错` : '智能体出错',
    message: subtypeLabel ? `${baseMessage} (${subtypeLabel})` : baseMessage,
  };
}
