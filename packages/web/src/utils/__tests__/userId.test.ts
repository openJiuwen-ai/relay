/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getDomainId, setUserId } from '@/utils/userId';

describe('getDomainId', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('returns the domain prefix from the current userId', () => {
    setUserId('domain-1:alice');

    expect(getDomainId()).toBe('domain-1');
  });

  it('returns an empty string when userId has no domain prefix', () => {
    setUserId('alice');

    expect(getDomainId()).toBe('');
  });
});
