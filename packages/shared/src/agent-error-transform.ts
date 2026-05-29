/*
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

export const MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE = 'ModelArts.81011';
export const MODEL_ARTS_RATE_LIMIT_ERROR_CODE = 'ModelArts.81101';
export const APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE = 'APIG.0308';
const MODEL_ARTS_SENSITIVE_INPUT_MESSAGE_FRAGMENT = 'Input text May contain sensitive information';
const MODEL_ARTS_RATE_LIMIT_MESSAGE = '当前请求较多，模型暂时限流，请稍后重试。';
const INSUFFICIENT_QUOTA_MESSAGE = '当前模型额度或账单余额不足，暂时无法处理请求。请检查账户配额/余额后再试。';
const CONTEXT_LENGTH_MESSAGE = '这次输入内容超出模型上下文长度限制。请精简内容或新开会话后重试。';
const AUTH_ERROR_MESSAGE = '模型服务鉴权失败（如 API Key 无效、过期或权限不足）。请检查凭据配置后重试。';
const SERVICE_UNAVAILABLE_MESSAGE = '模型服务当前繁忙或暂不可用，请稍后重试。';
const DAILY_QUOTA_EXHAUSTED_MESSAGE = `您好，截至目前您今日的免费模型使用额度已用尽。
如需继续使用服务，可选择[购买](https://console.huaweicloud.com/modelarts/?region=cn-southwest-2#/model-studio/deployment)华为云MaaS模型服务进行接入；或于次日再次访问，系统将为您重置免费额度。`;
const STREAM_CONNECTION_ERROR_MESSAGE = '响应中断了，可能因为电脑休眠或网络不稳定。请稍后重试。';

// LLM 流式连接错误特征码
const STREAM_ERROR_PATTERNS = ['openAI API async stream error', '[181001]', 'async stream error'];

export type ErrorFallbackKind =
    | 'timeout' // 响应超时
    | 'connection' // 连接失败
    | 'config' // 配置错误
    | 'abrupt_exit' // CLI 异常退出
    | 'max_iterations' // 达到最大迭代次数
    | 'rate_limit' // 模型瞬时限流
    | 'daily_quota' // 当日额度耗尽
    | 'insufficient_quota' // 账号配额/余额不足
    | 'context_length' // 上下文长度超限
    | 'auth' // 鉴权失败
    | 'service_unavailable' // 服务繁忙或不可用
    | 'sensitive_input' // 敏感词校验
    | 'stream_error' // LLM 流式连接中断
    | 'unknown'; // 未分类错误

export interface ErrorFallbackMetadata {
    v: 1;
    kind: ErrorFallbackKind;
    rawError: string;
    timestamp: number;
    serial?: string;
}

/**
 * 生成错误序列号，格式: E-MMdd-HHmm-xxxx
 * 用于用户报错时运维快速定位原始错误日志。
 */
export function generateErrorSerial(): string {
    const now = new Date();
    const datePart = [
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('');
    const timePart = [
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
    ].join('');
    const rand = ((Math.random() * 0x10000) | 0).toString(16).padStart(4, '0');
    return `E-${datePart}-${timePart}-${rand}`;
}

export interface ErrorLike {
    agentId?: string;
    error?: string;
    errorCode?: string;
    metadata?: { provider?: string; model?: string };
}

function normalizeQuotedText(rawError: string): string {
    return rawError.replace(/['']/g, "'").replace(/[""]/g, '"');
}

function matchesGenericRateLimit(normalizedError: string): boolean {
    return (
        /\b429\b/.test(normalizedError) ||
        /too many requests/i.test(normalizedError) ||
        /rate[\s_-]*limit(ed|ing)?/i.test(normalizedError) ||
        /toomanyrequests/i.test(normalizedError) ||
        /限流|请求过于频繁|请求较多/.test(normalizedError)
    );
}

export function isSensitiveInputError(msg: ErrorLike | string): boolean {
    if (typeof msg === 'string') {
        const normalized = normalizeQuotedText(msg);
        return (
            normalized.includes(MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE) &&
            normalized.toLowerCase().includes(MODEL_ARTS_SENSITIVE_INPUT_MESSAGE_FRAGMENT.toLowerCase())
        );
    }
    if (msg.errorCode === MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE) return true;
    const rawError = msg.error?.trim();
    if (!rawError) return false;
    const normalized = normalizeQuotedText(rawError);
    return (
        normalized.includes(MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE) &&
        normalized.toLowerCase().includes(MODEL_ARTS_SENSITIVE_INPUT_MESSAGE_FRAGMENT.toLowerCase())
    );
}

export function isRateLimitError(msg: ErrorLike | string): boolean {
    if (typeof msg === 'string') {
        const normalized = normalizeQuotedText(msg);
        if (isDailyQuotaExhaustedError(normalized)) return false;
        return normalized.includes(MODEL_ARTS_RATE_LIMIT_ERROR_CODE) || matchesGenericRateLimit(normalized);
    }

    if (msg.errorCode === APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE) return false;
    if (msg.errorCode === MODEL_ARTS_RATE_LIMIT_ERROR_CODE) return true;

    const rawError = msg.error?.trim();
    if (!rawError) return false;
    const normalized = normalizeQuotedText(rawError);
    if (isDailyQuotaExhaustedError(normalized)) return false;
    return normalized.includes(MODEL_ARTS_RATE_LIMIT_ERROR_CODE) || matchesGenericRateLimit(normalized);
}

export function isDailyQuotaExhaustedError(msg: ErrorLike | string): boolean {
    if (typeof msg === 'string') {
        const normalized = normalizeQuotedText(msg);
        return normalized.includes(APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE);
    }
    if (msg.errorCode === APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE) return true;
    const rawError = msg.error?.trim();
    if (!rawError) return false;
    const normalized = normalizeQuotedText(rawError);
    return normalized.includes(APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE);
}

function isTimeoutError(rawError: string): boolean {
    return /响应超时|timed out|timeout/i.test(rawError);
}

function isAbruptExitError(rawError: string): boolean {
    // 排除 "connection closed unexpectedly" 因为它应该归类为连接错误
    // 只匹配 CLI 异常退出相关的错误
    return /CLI\s*异常退出|abnormal exit|exited unexpectedly|subprocess exited/i.test(rawError);
}

function isConnectionError(rawError: string): boolean {
    return /connection failed|connection closed unexpectedly|WebSocket connection closed/i.test(rawError);
}

function isStreamConnectionError(rawError: string): boolean {
    return STREAM_ERROR_PATTERNS.some((p) => rawError.includes(p));
}

function isMaxIterationsReachedError(rawError: string): boolean {
    return /max iterations reached|max_iterations_reached/i.test(rawError);
}

function isHuaweiMaaSSessionError(rawError: string): boolean {
    return /huawei maas session (not found|expired)/i.test(rawError);
}

function isInsufficientQuotaError(rawError: string): boolean {
    return (
        /insufficient[\s_-]*quota|quota[\s_-]*exceeded|insufficient[\s_-]*credit/i.test(rawError) ||
        /billing[\s_-]*(hard|soft)?[\s_-]*limit/i.test(rawError) ||
        /额度不足|配额不足|余额不足|账单额度不足/.test(rawError)
    );
}

function isContextLengthError(rawError: string): boolean {
    return (
        /context length|context window|maximum context length|max(?:imum)? tokens?/i.test(rawError) ||
        /prompt (is )?too long|too many tokens/i.test(rawError) ||
        /上下文(长度)?超限|超出.*(上下文|token).*限制/.test(rawError)
    );
}

function isAuthError(rawError: string): boolean {
    return (
        /\b(401|403)\b/.test(rawError) ||
        /unauthorized|forbidden|authentication failed|invalid api[\s_-]*key|access denied|permission denied/i.test(
            rawError,
        ) ||
        /未授权|鉴权失败|权限不足|密钥无效|token无效/.test(rawError)
    );
}

function isServiceUnavailableError(rawError: string): boolean {
    return (
        /\b(503|529)\b/.test(rawError) ||
        /service unavailable|server overloaded|model overloaded|temporarily unavailable|upstream overload/i.test(
            rawError,
        ) ||
        /服务繁忙|服务不可用|模型繁忙|系统繁忙|过载/.test(rawError)
    );
}

type ConfigurationMatch = {
    pattern: RegExp;
    message: string;
};

const CONFIGURATION_MATCHES: ConfigurationMatch[] = [
    {
        pattern: /WebSocket URL is not configured/i,
        message: '当前智能体缺少 WebSocket 地址配置，暂时无法启动。请先配置对应智能体的连接地址后再重试。',
    },
    {
        pattern: /provider profile is not configured|bound provider profile/i,
        message: '当前智能体未绑定可用的 provider profile，暂时无法处理请求。请先检查并绑定正确的 provider profile。',
    },
    {
        pattern: /requires a default model profile|default model profile|model profile is missing/i,
        message: '当前智能体缺少默认 model profile 配置，暂时无法处理请求。请先为对应 provider profile 配置默认模型。',
    },
    {
        pattern: /model profile ".+" not found or missing apiKey|missing apiKey|API key/i,
        message:
            '当前智能体的模型配置缺少 API Key 或模型档案不存在，暂时无法处理请求。请检查对应 model profile 的 API Key 配置。',
    },
];

function isConfigurationError(rawError: string): boolean {
    return (
        CONFIGURATION_MATCHES.some(({ pattern }) => pattern.test(rawError)) ||
        /not configured|sidecar exited|CLI path/i.test(rawError)
    );
}

function getConfigurationErrorMessage(rawError: string): string {
    const matched = CONFIGURATION_MATCHES.find(({ pattern }) => pattern.test(rawError));
    if (matched) return matched.message;
    return `当前智能体配置存在问题，暂时无法处理这次请求。请检查配置后重试。原始错误：${rawError}`;
}

export function classifyError(rawError: string): ErrorFallbackKind {
    if (isDailyQuotaExhaustedError(rawError)) return 'daily_quota';
    if (isInsufficientQuotaError(rawError)) return 'insufficient_quota';
    if (isRateLimitError(rawError)) return 'rate_limit';
    if (isSensitiveInputError(rawError)) return 'sensitive_input';
    if (isContextLengthError(rawError)) return 'context_length';
    if (isAuthError(rawError)) return 'auth';
    if (isServiceUnavailableError(rawError)) return 'service_unavailable';
    if (isTimeoutError(rawError)) return 'timeout';
    if (isAbruptExitError(rawError)) return 'abrupt_exit';
    if (isConfigurationError(rawError)) return 'config';
    if (isStreamConnectionError(rawError)) return 'stream_error';
    if (isConnectionError(rawError)) return 'connection';
    if (isMaxIterationsReachedError(rawError)) return 'max_iterations';
    return 'unknown';
}

export function getRateLimitMessage(): string {
    return MODEL_ARTS_RATE_LIMIT_MESSAGE;
}

export function getDailyQuotaExhaustedMessage(): string {
    return DAILY_QUOTA_EXHAUSTED_MESSAGE;
}

export function getFriendlyAgentErrorMessage(msg: ErrorLike, serial?: string): string {
    let rawError = msg.error?.trim() || 'Unknown error';

    // 截断过长的错误消息（统一在共享模块处理）
    const MAX_RAW_ERROR_LENGTH = 1000;
    if (rawError.length > MAX_RAW_ERROR_LENGTH) {
        rawError = rawError.slice(0, MAX_RAW_ERROR_LENGTH) + '... (truncated)';
    }

    let message: string;

    if (isDailyQuotaExhaustedError(msg)) {
        message = getDailyQuotaExhaustedMessage();
    } else if (isInsufficientQuotaError(rawError)) {
        message = INSUFFICIENT_QUOTA_MESSAGE;
    } else if (isRateLimitError(msg)) {
        message = getRateLimitMessage();
    } else if (isSensitiveInputError(msg)) {
        message = '检测到输入内容触发了敏感词校验。请重新打开一个新会话后再试。';
    } else if (isContextLengthError(rawError)) {
        message = CONTEXT_LENGTH_MESSAGE;
    } else if (isAuthError(rawError)) {
        message = AUTH_ERROR_MESSAGE;
    } else if (isServiceUnavailableError(rawError)) {
        message = SERVICE_UNAVAILABLE_MESSAGE;
    } else if (isTimeoutError(rawError)) {
        message = '这次响应超时了，我先结束本次尝试。请稍后直接重试。';
    } else if (isAbruptExitError(rawError)) {
        message = '这次响应中断了，我没能稳定完成处理。请重试一次；如果连续出现，请稍后再试。';
    } else if (isConfigurationError(rawError)) {
        message = getConfigurationErrorMessage(rawError);
    } else if (isConnectionError(rawError)) {
        message = '当前智能体连接不稳定，暂时无法完成这次处理。请稍后重试；如果持续出现，说明后端服务可能需要检查。';
    } else if (isStreamConnectionError(rawError)) {
        message = STREAM_CONNECTION_ERROR_MESSAGE;
    } else if (isMaxIterationsReachedError(rawError)) {
        message = '已达到本次对话允许的最大思考轮数，任务未在限定的轮数内完成。';
    } else {
        message = '这次处理没有顺利完成。我先结束本次尝试，请稍后重试。';
    }

    if (serial) {
        message += `\n[错误参考号: ${serial}]`;
    }
    return message;
}

