/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import VersionUpdatePanel, { type VersionInfo } from './VersionUpdatePanel';

export interface VersionUpdateModalProps {
  open: boolean;
  onCancel: () => void;
  versionInfo?: VersionInfo | null;
}

const VersionUpdateModal: React.FC<VersionUpdateModalProps> = ({ open, onCancel, versionInfo }) => {
  useEscapeKey({
    enabled: open,
    onEscape: onCancel,
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-strong)]">
      <div
        data-testid="version-update-card"
        className="relative w-[360px] max-w-[90vw] max-h-[520px] rounded-[16px] border border-[var(--modal-border)] bg-[var(--modal-surface)] text-center shadow-[var(--modal-shadow)]"
        style={{
          backgroundImage: 'url("/images/version-bg.svg")',
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <VersionUpdatePanel variant="modal" active={open} versionInfo={versionInfo} onDismiss={onCancel} />
      </div>
    </div>
  );
};

export default VersionUpdateModal;
