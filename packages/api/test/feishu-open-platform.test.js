/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveFeishuOpenApiBaseUrl,
  resolveFeishuOpenBaseUrl,
} from '../dist/infrastructure/connectors/feishu-open-platform.js';

describe('feishu-open-platform', () => {
  it('accepts root open domain for API calls', () => {
    assert.equal(resolveFeishuOpenBaseUrl('https://open.feishu.cn'), 'https://open.feishu.cn');
    assert.equal(resolveFeishuOpenApiBaseUrl('https://open.feishu.cn'), 'https://open.feishu.cn/open-apis');
  });

  it('accepts explicit /open-apis base for API calls', () => {
    assert.equal(resolveFeishuOpenBaseUrl('https://open.feishu.cn/open-apis'), 'https://open.feishu.cn');
    assert.equal(resolveFeishuOpenApiBaseUrl('https://open.feishu.cn/open-apis'), 'https://open.feishu.cn/open-apis');
  });

  it('strips trailing slash variants', () => {
    assert.equal(resolveFeishuOpenBaseUrl('https://open.feishu.cn/'), 'https://open.feishu.cn');
    assert.equal(resolveFeishuOpenApiBaseUrl('https://open.feishu.cn/open-apis/'), 'https://open.feishu.cn/open-apis');
  });
});
