/*
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { AppModal } from '@/components/AppModal';
import { Button } from '@/components/shared/Button';
import { CREATE_MODEL_RISK_MESSAGE, CREATE_MODEL_RISK_TITLE } from '../utils';

export interface CreateModelRiskModalProps {
  show: boolean;
  onClose: () => void;
  onAgree: () => void;
}

export function CreateModelRiskModal({ show, onClose, onAgree }: CreateModelRiskModalProps) {
  return (
    <AppModal
      open={show}
      onClose={onClose}
      title={CREATE_MODEL_RISK_TITLE}
      panelClassName="w-[550px]"
      disableBackdropClose
      showCloseButton={true}
      backdropTestId="models-create-model-risk-modal"
      panelTestId="models-create-model-risk-modal-panel"
    >
      <div className="space-y-4 pt-[18px]">
        <p className="text-[12px] leading-[18px] text-[var(--text-secondary)]">{CREATE_MODEL_RISK_MESSAGE}</p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="default"
            size="md"
            data-testid="models-create-model-risk-cancel"
            onClick={onClose}
          >
            取消
          </Button>
          <Button variant="major"
            size="md"
            data-testid="models-create-model-risk-confirm"
            onClick={onAgree}
          >
            我已同意
          </Button>
        </div>
      </div>
    </AppModal>
  );
}