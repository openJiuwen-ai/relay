/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computePackChecksum,
  GOVERNANCE_PACK_VERSION,
} from '../../dist/config/governance/governance-pack.js';

describe('governance-pack', () => {
  it('pack version is 2.0.0', () => {
    assert.equal(GOVERNANCE_PACK_VERSION, '2.0.0');
  });

  it('pack version is semver', () => {
    assert.match(GOVERNANCE_PACK_VERSION, /^\d+\.\d+\.\d+$/);
  });

  it('checksum is stable for same content', () => {
    const a = computePackChecksum();
    const b = computePackChecksum();
    assert.strictEqual(a, b);
  });

  it('checksum is a 12-char hex string', () => {
    const checksum = computePackChecksum();
    assert.match(checksum, /^[0-9a-f]{12}$/);
  });
});
