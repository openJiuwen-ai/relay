/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type ReactNode, useState } from 'react';
import { ActionConfirmModal } from '../../shared/ActionConfirmModal';
import { CheckCircleIcon } from './ConnectorConfigIcons';

interface ConnectorConnectedStateProps {
  label: string;
  disconnecting: boolean;
  onDisconnect: () => void | Promise<void>;
  disconnectTestId: string;
  children?: ReactNode;
}

export function ConnectorConnectedState({
  label,
  disconnecting,
  onDisconnect,
  disconnectTestId,
  children,
}: ConnectorConnectedStateProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirmDisconnect = () => {
    setConfirmOpen(false);
    void onDisconnect();
  };

  const modalTestId = `${disconnectTestId}-confirm-modal`;
  const confirmTestId = `${disconnectTestId}-confirm-submit`;
  const cancelTestId = `${disconnectTestId}-confirm-cancel`;

  return (
    <div className="space-y-2">
      <div
        className="flex h-[34px] w-1/2 items-center gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--tag-bg)] px-3 text-xs text-[var(--text-primary)]"
        data-testid="connector-connected-pill"
      >
        <span className="shrink-0 text-[var(--state-success-text)]">
          <CheckCircleIcon />
        </span>
        <span className="min-w-0 truncate">{label}</span>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={disconnecting}
          className="ml-auto shrink-0 font-medium text-[var(--text-accent)] disabled:opacity-50"
          data-testid={disconnectTestId}
        >
          {disconnecting ? '断开中...' : '断开连接'}
        </button>
      </div>
      <ActionConfirmModal
        open={confirmOpen}
        title="断开连接"
        message="是否确认断开连接？"
        confirmDisabled={disconnecting}
        modalTestId={modalTestId}
        confirmTestId={confirmTestId}
        cancelTestId={cancelTestId}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmDisconnect}
      />
      {children}
    </div>
  );
}
