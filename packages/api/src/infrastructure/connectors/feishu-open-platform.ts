/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

const FEISHU_DEFAULT_OPEN_BASE_URL = 'https://open.feishu.cn';

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveFeishuOpenBaseUrl(rawValue = process.env.FEISHU_OPEN_API_BASE_URL): string {
  const normalized = stripTrailingSlashes((rawValue ?? FEISHU_DEFAULT_OPEN_BASE_URL).trim() || FEISHU_DEFAULT_OPEN_BASE_URL);
  if (normalized.endsWith('/open-apis')) {
    return normalized.slice(0, -'/open-apis'.length);
  }
  return normalized;
}

export function resolveFeishuOpenApiBaseUrl(rawValue = process.env.FEISHU_OPEN_API_BASE_URL): string {
  return `${resolveFeishuOpenBaseUrl(rawValue)}/open-apis`;
}
