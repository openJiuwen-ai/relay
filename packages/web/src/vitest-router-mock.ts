/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { vi } from 'vitest';

/** Mutable router state shared with `react-router-dom` mocks in `test-setup.ts`. */
export const vitestRouter = {
  navigate: vi.fn(),
  pathname: '/',
  search: '',
  hash: '',
  params: {} as Record<string, string | undefined>,
};
