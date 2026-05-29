/*
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { PasswordField } from '@/components/shared/PasswordField';
import { TagEditor } from '@/components/hub-tag-editor';
import { Textarea } from '@/components/shared/Textarea';
import { SAVE_MODEL_LABEL, ADD_MODEL } from '../utils';
import type { UseAddModelFormResult } from '../hooks/useAddModelForm';

export interface AddModelModalProps {
  show: boolean;
  onClose: () => void;
  form: UseAddModelFormResult;
}

export function AddModelModal({ show, onClose, form }: AddModelModalProps) {
  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-strong)] p-4"
      data-testid="models-add-model-modal"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] p-5 shadow-[var(--modal-shadow)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--modal-title-text)]">{ADD_MODEL}</h3>
          <button
            type="button"
            onClick={() => {
              form.reset();
              onClose();
            }}
            className="rounded-lg border border-[var(--button-default-border)] bg-[var(--button-default-bg)] px-3 py-1.5 text-xs font-medium text-[var(--button-default-text)] transition-colors hover:border-[var(--button-default-border-hover)] hover:bg-[var(--button-default-bg-hover)] hover:text-[var(--button-default-text-hover)]"
          >
            关闭
          </button>
        </div>
        <div className="space-y-3">
          {form.error ? <p className="ui-status-error rounded-lg px-3 py-2 text-sm">{form.error}</p> : null}
          <select
            value="openai"
            disabled
            aria-label="协议"
            className="w-full rounded border border-[var(--overlay-disabled-border)] bg-[var(--overlay-disabled-bg)] px-3 py-2 text-sm text-[var(--overlay-disabled-text)]"
          >
            <option value="openai">OpenAI</option>
          </select>
          <input
            value={form.displayName}
            onChange={(event) => form.setDisplayName(event.target.value)}
            placeholder="显示名称，如 My OpenAI Proxy"
            autoComplete="off"
            className="ui-input w-full"
          />
          <input
            value={form.baseUrl}
            onChange={(event) => form.setBaseUrl(event.target.value)}
            placeholder="Base URL，如 https://api.example.com/v1"
            autoComplete="off"
            className="ui-input w-full"
          />
          <PasswordField
            autoComplete="off"
            value={form.apiKey}
            onChange={(event) => form.setApiKey(event.target.value)}
            placeholder="API Key"
            className="ui-input w-full rounded px-3 py-2 text-sm"
            toggleTestId="models-create-source-api-key-toggle"
          />
          <Textarea
            value={form.headersText}
            onChange={(event) => form.setHeadersText(event.target.value)}
            rows={4}
            placeholder={'可选请求头(JSON)，如 {"X-App-Id":"my-app"}'}
            useDefaultContainerStyles={false}
            useDefaultTextareaStyles={false}
            className="ui-textarea w-full rounded px-3 py-2 text-sm"
          />
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--modal-text-muted)]">可用模型 *</p>
            <TagEditor
              tags={form.models}
              tone="purple"
              addLabel="+ 添加模型"
              placeholder="输入模型名，如 gpt-4o-mini"
              emptyLabel="(至少添加 1 个模型)"
              onChange={form.setModels}
              minCount={0}
            />
          </div>
          {form.successMessage ? (
            <p className="ui-status-success rounded-lg px-3 py-2 text-sm">{form.successMessage}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={form.saveBusy || !form.canCreate}
              onClick={() => void form.handleSave()}
              className="rounded bg-[var(--button-primary-bg)] px-3 py-1.5 text-xs font-medium text-[var(--button-primary-text)] transition-colors hover:bg-[var(--button-primary-bg-hover)] hover:text-[var(--button-primary-text-hover)] disabled:bg-[var(--button-disabled-bg)] disabled:text-[var(--button-disabled-text)] disabled:opacity-50"
            >
              {form.saveBusy ? '保存中...' : SAVE_MODEL_LABEL}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}