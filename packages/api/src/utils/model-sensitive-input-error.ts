/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

const MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE = 'ModelArts.81011';
const MODEL_ARTS_SENSITIVE_INPUT_MESSAGE_FRAGMENT = 'Input text May contain sensitive information';

function normalizeQuotedText(raw: string): string {
  return raw.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

export function isModelSensitiveInputError(rawError: string | undefined): boolean {
  if (!rawError) return false;
  const normalized = normalizeQuotedText(rawError);
  return (
    normalized.includes(MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE) &&
    normalized.toLowerCase().includes(MODEL_ARTS_SENSITIVE_INPUT_MESSAGE_FRAGMENT.toLowerCase())
  );
}

export function classifyAgentErrorCode(rawError: string | undefined, currentErrorCode?: string): string | undefined {
  if (currentErrorCode) return currentErrorCode;
  if (isModelSensitiveInputError(rawError)) return MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE;
  return undefined;
}

export { MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE, MODEL_ARTS_SENSITIVE_INPUT_MESSAGE_FRAGMENT };
