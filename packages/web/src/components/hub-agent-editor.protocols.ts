/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { ClientValue } from './hub-agent-editor.model';

export function defaultMcpSupportForClient(client: ClientValue): boolean {
  return (
    client === 'anthropic' ||
    client === 'openai' ||
    client === 'google' ||
    client === 'opencode' ||
    client === 'acp'
  );
}
