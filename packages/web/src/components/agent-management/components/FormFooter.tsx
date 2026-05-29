/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { Button } from '@/components/shared/Button';

interface FormFooterProps {
  error: string | null;
  formMode: 'create' | 'edit';
  isConfirmDisabled: boolean;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}

export function FormFooter({ error, formMode, isConfirmDisabled, onCancel, onSave, saving }: FormFooterProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--panel-divider)] bg-[var(--surface-panel)] px-8 py-4">
      {error ? (
        <div className="rounded-[var(--radius-md)] bg-[var(--state-error-bg)] px-4 py-[6px] text-[14px] text-[var(--state-error-text)]">
          {error}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-3">
        <Button variant="default" onClick={onCancel}>
          取消
        </Button>
        <Button variant="major" onClick={onSave} disabled={isConfirmDisabled}>
          {saving ? (formMode === 'edit' ? '保存中...' : '创建中...') : formMode === 'edit' ? '保存' : '创建'}
        </Button>
      </div>
    </div>
  );
}