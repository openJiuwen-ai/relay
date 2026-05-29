/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@openjiuwen/relay-shared');
});

describe('agent-error-fallback shared delegation', () => {
  it('delegates common constants and helper copy to shared exports', async () => {
    const mockIsRateLimitError = vi.fn(() => true);
    const mockIsSensitiveInputError = vi.fn(() => true);
    const mockGetRateLimitMessage = vi.fn(() => 'shared-rate-limit-message');
    const mockGetFriendlyAgentErrorMessage = vi.fn(() => 'shared-friendly-message');

    vi.doMock('@openjiuwen/relay-shared', () => ({
      MODEL_ARTS_RATE_LIMIT_ERROR_CODE: 'SHARED_RATE_LIMIT',
      MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE: 'SHARED_SENSITIVE',
      isRateLimitError: mockIsRateLimitError,
      isSensitiveInputError: mockIsSensitiveInputError,
      getRateLimitMessage: mockGetRateLimitMessage,
      getFriendlyAgentErrorMessage: mockGetFriendlyAgentErrorMessage,
    }));

    const mod = await import('@/hooks/agent-error-fallback');

    expect(mod.MODEL_ARTS_RATE_LIMIT_ERROR_CODE).toBe('SHARED_RATE_LIMIT');
    expect(mod.MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE).toBe('SHARED_SENSITIVE');
    expect(mod.isRateLimitError({ errorCode: 'ModelArts.81101' })).toBe(true);
    expect(mockIsRateLimitError).toHaveBeenCalledWith({ errorCode: 'ModelArts.81101' });
    expect(mod.isSensitiveInputAgentError({ errorCode: 'ModelArts.81011' })).toBe(true);
    expect(mockIsSensitiveInputError).toHaveBeenCalledWith({ errorCode: 'ModelArts.81011' });
    expect(mod.getRateLimitChatMessage()).toBe('shared-rate-limit-message');
    expect(mockGetRateLimitMessage).toHaveBeenCalledTimes(1);
    expect(mod.getFriendlyAgentErrorMessage({ error: 'anything' })).toBe('shared-friendly-message');
    expect(mockGetFriendlyAgentErrorMessage).toHaveBeenCalledWith({ error: 'anything' });
  });
});
