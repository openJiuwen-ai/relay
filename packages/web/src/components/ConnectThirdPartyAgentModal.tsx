/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState } from 'react';
import { Button } from './shared/Button';
import { MaskIcon } from '@/components/shared/MaskIcon';
import { PasswordField } from './shared/PasswordField';

interface ConnectThirdPartyAgentModalProps {
  open: boolean;
  onClose: () => void;
}

function CloseIcon() {
  return <MaskIcon name="close" className="h-5 w-5" />;
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password';
}) {
  return (
    <label className="block space-y-2.5">
      <span className="text-[14px] font-semibold text-[var(--modal-text)]">{label}</span>
      {type === 'password' ? (
        <PasswordField
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="ui-input h-11 w-full rounded-[12px] px-4 text-[13px] transition"
          toggleTestId="connect-third-party-agent-api-key-toggle"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="ui-input h-11 w-full rounded-[12px] px-4 text-[13px] transition"
        />
      )}
    </label>
  );
}

export function ConnectThirdPartyAgentModal({ open, onClose }: ConnectThirdPartyAgentModalProps) {
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [objectModelName, setObjectModelName] = useState('');

  useEffect(() => {
    if (!open) return;

    setUrl('');
    setApiKey('');
    setObjectModelName('');

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-medium)] px-6 py-8">
      <div
        className="flex h-[642px] w-[550px] flex-col overflow-hidden rounded-[24px] border border-[var(--modal-border)] bg-[var(--modal-surface)] shadow-[var(--modal-shadow)]"
        data-testid="connect-third-party-agent-modal"
      >
        <div className="flex items-center justify-between border-b border-[var(--modal-divider)] px-6 py-5">
          <div>
            <h2 className="text-[24px] font-bold text-[var(--modal-title-text)]">连接三方智能体</h2>
            <p className="mt-1 text-[12px] text-[var(--modal-text-muted)]">先完成界面接入，保存能力后续再接。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--modal-close-icon)] transition-colors hover:bg-[var(--modal-close-hover-bg)] hover:text-[var(--modal-close-icon-hover)]"
            aria-label="关闭连接三方智能体弹窗"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-6 py-6">
          <div className="space-y-5">
            <Field
              label="URL"
              placeholder="请输入服务地址，例如 https://example.com/v1"
              value={url}
              onChange={setUrl}
            />
            <Field
              label="API Key"
              placeholder="请输入 API Key"
              value={apiKey}
              onChange={setApiKey}
              type="password"
            />
            <Field
              label="对象模型名称"
              placeholder="请输入对象模型名称"
              value={objectModelName}
              onChange={setObjectModelName}
            />

            <div className="rounded-[16px] border border-[var(--modal-muted-border)] bg-[var(--modal-muted-surface)] px-4 py-3 text-[12px] leading-6 text-[var(--modal-text-muted)]">
              当前只接入弹窗和表单展示，不会提交也不会保存配置。
            </div>
          </div>

          <div className="mt-auto flex justify-end gap-3 pt-6">
            <Button
            onClick={onClose}
            className="inline-flex h-10 min-w-[96px] items-center justify-center rounded-[10px] border border-[var(--modal-button-muted-border)] bg-[var(--modal-button-muted-bg)] px-4 text-[13px] font-semibold text-[var(--modal-button-muted-text)] transition hover:bg-[var(--modal-button-muted-bg-hover)]"
          >
            取消
          </Button>
          <Button
            disabled
            className="inline-flex h-10 min-w-[96px] cursor-not-allowed items-center justify-center rounded-[10px] border border-[var(--button-disabled-border)] bg-[var(--button-disabled-bg)] px-4 text-[13px] font-semibold text-[var(--button-disabled-text)]"
          >
            保存
          </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
