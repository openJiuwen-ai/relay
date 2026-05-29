/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE,
  getDailyQuotaExhaustedMessage,
  MODEL_ARTS_RATE_LIMIT_ERROR_CODE,
  MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE,
  getRateLimitMessage,
  isDailyQuotaExhaustedError,
  isRateLimitError,
  isSensitiveInputError,
} from '../src/index.js';

describe('shared agent error exports', () => {
  it('exports common error helpers for frontend reuse', () => {
    assert.equal(APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE, 'APIG.0308');
    assert.equal(MODEL_ARTS_RATE_LIMIT_ERROR_CODE, 'ModelArts.81101');
    assert.equal(MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE, 'ModelArts.81011');
    assert.equal(
      getDailyQuotaExhaustedMessage(),
      `您好，截至目前您今日的免费模型使用额度已用尽。
如需继续使用服务，可选择[购买](https://console.huaweicloud.com/modelarts/?region=cn-southwest-2#/model-studio/deployment)华为云MaaS模型服务进行接入；或于次日再次访问，系统将为您重置免费额度。`,
    );
    assert.equal(getRateLimitMessage(), '当前请求较多，模型暂时限流，请稍后重试。');
    assert.equal(isDailyQuotaExhaustedError({ errorCode: APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE }), true);
    assert.equal(isRateLimitError({ errorCode: MODEL_ARTS_RATE_LIMIT_ERROR_CODE }), true);
    assert.equal(
      isSensitiveInputError({
        errorCode: MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE,
        error: 'Input text May contain sensitive information, please try again.',
      }),
      true,
    );
  });
});
