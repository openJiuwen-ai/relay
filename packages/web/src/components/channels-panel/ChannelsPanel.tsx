/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { ConnectorConfigTab } from './components/ConnectorConfigTab';

export function ChannelsPanel() {
  return (
    <div className="ui-page-shell">
      <div className="ui-page-header">
        <h1 className="ui-page-title">渠道</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ConnectorConfigTab />
      </div>
    </div>
  );
}
