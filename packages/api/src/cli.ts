#!/usr/bin/env node
/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * OfficeClaw API Server CLI Entry
 * 独立的 CLI 入口点，避免 ESM import hoisting 问题
 */

import { main } from './index.js';

main().catch((err) => {
  console.error('[api] Fatal error:', err);
  process.exit(1);
});