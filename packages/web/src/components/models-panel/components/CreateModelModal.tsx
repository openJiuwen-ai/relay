/*
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { MaskIcon } from '@/components/shared/MaskIcon';
import { Button } from '@/components/shared/Button';
import { PasswordField } from '@/components/shared/PasswordField';
import { Textarea } from '@/components/shared/Textarea';
import { useToastStore } from '@/stores/toastStore';
import { uploadAvatarAsset } from '@/components/hub-agent-editor.client';
import { buildNameInitialIconDataUrl } from '@/lib/name-initial-icon';
import {
  CREATE_MODEL_CANCEL_LABEL,
  DEFAULT_MODEL_ICON_SRC,
  MODEL_ICON_MAX_BYTES,
  MODEL_NAME_VALIDATION_MESSAGE,
  SAVE_MODEL_LABEL,
  TEST_CONNECTION_LABEL,
  HUAWEI_MAAS_ACCESS_LABEL,
  CREATE_MODEL_LABEL,
  HUAWEI_MAAS_ACCESS_MODAL_MODE,
  resolveUploadedIconUrl,
} from '../utils';
import type { CreateModelModalMode, HeaderInputRow } from '../types/models-panel';

function CloseIcon() {
  return <MaskIcon name="close" className="h-4 w-4" />;
}

export interface CreateModelModalProps {
  show: boolean;
  onClose: () => void;
  modalMode: CreateModelModalMode;
  isEditMode: boolean;

  // Form fields
  modelNameInput: string;
  onModelNameChange: (value: string) => void;
  modelDescriptionInput: string;
  onModelDescriptionChange: (value: string) => void;
  modelIconInput: string;
  onModelIconChange: (value: string) => void;
  modelDisplayNameInput: string;
  onModelDisplayNameChange: (value: string) => void;
  modelUrlInput: string;
  onModelUrlChange: (value: string) => void;
  modelApiKeyInput: string;
  onModelApiKeyChange: (value: string) => void;

  // Header rows
  headerRows: HeaderInputRow[];
  headerRowErrors: Map<string, { keyError?: string; valueError?: string }>;
  headerErrorRowIndex: number | null;
  onAddHeaderRow: () => void;
  onHeaderRowChange: (rowId: string, field: 'key' | 'value', value: string) => void;
  onRemoveHeaderRow: (rowId: string) => void;

  // Validation
  isModelNameValid: boolean;
  showModelNameValidationError: boolean;
  canConfirm: boolean;

  // Actions
  createError: string | null;
  saveModelBusy: boolean;
  testingConnection: boolean;
  editModelBusy: boolean;
  onCreate: () => void;
  onTestConnection: () => void;
}

export function CreateModelModal({
  show,
  onClose,
  modalMode,
  isEditMode,
  modelNameInput,
  onModelNameChange,
  modelDescriptionInput,
  onModelDescriptionChange,
  modelIconInput,
  onModelIconChange,
  modelDisplayNameInput,
  onModelDisplayNameChange,
  modelUrlInput,
  onModelUrlChange,
  modelApiKeyInput,
  onModelApiKeyChange,
  headerRows,
  headerRowErrors,
  headerErrorRowIndex,
  onAddHeaderRow,
  onHeaderRowChange,
  onRemoveHeaderRow,
  // isModelNameValid - not used in render
  showModelNameValidationError,
  canConfirm,
  createError,
  saveModelBusy,
  testingConnection,
  editModelBusy,
  onCreate,
  onTestConnection,
}: CreateModelModalProps) {
  const modelIconFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isIconUploading, setIsIconUploading] = useState(false);
  const isHuaweiMaasAccessMode = modalMode === HUAWEI_MAAS_ACCESS_MODAL_MODE;
  const modelIconPreviewSrc = resolveUploadedIconUrl(modelIconInput) ?? DEFAULT_MODEL_ICON_SRC;

  // Scroll to first header row error when validation fails
  useEffect(() => {
    if (headerErrorRowIndex !== null) {
      const errorRow = document.querySelector('[data-error-row="true"]');
      errorRow?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [headerErrorRowIndex]);

  const handleModelIconUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      useToastStore.getState().addToast({
        type: 'error',
        title: '图标格式不支持',
        message: '仅支持 png、jpeg、jpg 格式图片',
        duration: 3000,
      });
      event.target.value = '';
      return;
    }

    if (file.size > MODEL_ICON_MAX_BYTES) {
      useToastStore.getState().addToast({
        type: 'error',
        title: '图标文件过大',
        message: '图片大小不能超过 200KB',
        duration: 3000,
      });
      event.target.value = '';
      return;
    }

    setIsIconUploading(true);
    try {
      const uploaded = await uploadAvatarAsset(file);
      onModelIconChange(uploaded);
    } catch (error) {
      useToastStore.getState().addToast({
        type: 'error',
        title: '图标上传失败',
        message: error instanceof Error ? error.message : '图标上传失败',
        duration: 3000,
      });
    } finally {
      setIsIconUploading(false);
      event.target.value = '';
    }
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-strong)] p-4"
      data-testid="models-create-model-modal"
    >
      <div className="relative flex w-[500px] max-h-[calc(100vh-4rem)] flex-col gap-5 overflow-hidden rounded-[8px] border border-[var(--modal-border)] bg-[var(--modal-surface)] p-6 shadow-[var(--modal-shadow)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="absolute right-5 top-5 flex h-6 w-6 items-center justify-center rounded text-[var(--modal-close-icon)] transition-colors hover:bg-[var(--modal-close-hover-bg)] hover:text-[var(--modal-close-icon-hover)]"
        >
          <CloseIcon />
        </button>
        <div className="pr-10">
          <h3 className="text-[16px] font-bold text-[var(--modal-title-text)]">
            {isEditMode ? '编辑' : isHuaweiMaasAccessMode ? HUAWEI_MAAS_ACCESS_LABEL : CREATE_MODEL_LABEL}
          </h3>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1">
            <p className="text-[12px] leading-[18px] text-[var(--modal-text)]">
              {isHuaweiMaasAccessMode ? '模型调用名称' : '模型名称'}
            </p>
            <input
              data-testid="models-create-model-name-input"
              value={modelNameInput}
              onChange={(event) => onModelNameChange(event.target.value)}
              placeholder={isHuaweiMaasAccessMode ? '请输入模型调用名称' : '请输入模型名称'}
              className="ui-input w-full"
              style={{ height: '28px' }}
              required
            />
            {showModelNameValidationError ? (
              <p
                data-testid="models-create-model-name-error"
                className="mt-1 text-xs text-[var(--state-error-text)]"
              >
                {MODEL_NAME_VALIDATION_MESSAGE}
              </p>
            ) : null}
          </div>

          <div className="space-y-2.5">
            <div className="text-[12px] text-[var(--text-primary)]">模型描述（可选）</div>
            <Textarea
              data-testid="models-create-model-description-textarea"
              value={modelDescriptionInput}
              onChange={(event) => onModelDescriptionChange(event.target.value)}
              placeholder="请输入描述"
              maxLength={500}
              showCount
              formatCount={(current, max) => `${current}/${max ?? 0}`}
              className="h-[60px] min-h-[60px] w-full"
            />
          </div>

          <div className="hidden space-y-1">
            <p className="text-[12px] leading-[18px] text-[var(--modal-text)]">模型展示名称</p>
            <input
              data-testid="models-create-model-display-name-input"
              value={modelDisplayNameInput}
              onChange={(event) => onModelDisplayNameChange(event.target.value)}
              placeholder="请输入模型展示名称"
              className="ui-input w-full"
              style={{ height: '28px' }}
              required
            />
          </div>

          <div className="space-y-2.5">
            <div className="text-[12px] text-[var(--text-primary)]">图标（可选）</div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Upload model icon"
                onClick={() => modelIconFileInputRef.current?.click()}
                className="group relative flex h-11 w-11 items-center justify-center rounded-[var(--radius-xs)] transition overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={modelIconPreviewSrc} alt="Model icon preview" className="h-full w-full object-cover" />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--modal-loading-overlay)] opacity-0 transition group-hover:opacity-100">
                  <MaskIcon name="edit" preserveOriginalColor className="h-4 w-4" />
                </span>
              </button>
              <input
                ref={modelIconFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleModelIconUpload}
                className="hidden"
                data-testid="models-create-model-icon-file-input"
              />
              <div className="h-11 pt-[22px]">
                <div aria-hidden="true" className="h-[16px] w-px bg-[var(--border-default)]" />
              </div>
              <div className="h-11 pt-[16px]">
                <button
                  type="button"
                  aria-label="Random model icon"
                  onClick={() => {
                    const nextVariant = Math.floor(Math.random() * 10_000);
                    onModelIconChange(buildNameInitialIconDataUrl(modelNameInput, nextVariant));
                  }}
                  className="h-[28px] w-[28px] min-h-[28px] min-w-[28px] p-0"
                >
                  <MaskIcon name="random" />
                </button>
              </div>
            </div>
            <div className="text-[12px] text-[var(--text-muted)]">
              {isIconUploading ? '图标上传中...' : '支持上传 png、jpeg、jpg 格式图片，限制 200KB 内'}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[12px] leading-[18px] text-[var(--modal-text)]">访问URL</p>
            <input
              data-testid="models-create-model-url-input"
              name="cc_model_base_url"
              value={modelUrlInput}
              onChange={(event) => onModelUrlChange(event.target.value)}
              placeholder="请输入访问URL"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={isHuaweiMaasAccessMode}
              className={`ui-input w-full ${
                isHuaweiMaasAccessMode
                  ? 'cursor-not-allowed border-[var(--overlay-disabled-border)] bg-[var(--overlay-disabled-bg)] text-[var(--overlay-disabled-text)]'
                  : ''
              }`}
              style={{ height: '28px' }}
              required
            />
          </div>

          <div className="space-y-1">
            <p className="text-[12px] leading-[18px] text-[var(--modal-text)]">API Key</p>
            <PasswordField
              data-testid="models-create-model-api-key-input"
              name="cc_model_api_key"
              value={modelApiKeyInput}
              onChange={(event) => onModelApiKeyChange(event.target.value)}
              placeholder="请输入API Key"
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="ui-input w-full"
              style={{ height: '28px' }}
              required
              toggleTestId="models-create-model-api-key-toggle"
            />
          </div>

          <div className="space-y-1">
            <p className="text-[12px] leading-[18px] text-[var(--modal-text)]">请求头（可选）</p>
            <div className="space-y-2">
              {headerRows.map((row, index) => {
                const rowErrors = headerRowErrors.get(row.id) || {};
                return (
                  <div
                    key={row.id}
                    className="flex flex-col gap-1"
                    data-testid={`models-create-model-header-row-${index}`}
                    data-error-row={rowErrors.keyError || rowErrors.valueError ? 'true' : 'false'}
                  >
                    <div className="flex items-center gap-[4px]">
                      <input
                        type="text"
                        value={row.key}
                        onChange={(event) => onHeaderRowChange(row.id, 'key', event.target.value)}
                        placeholder="请求头的键名"
                        className={`ui-input h-[28px] flex-1 ${
                          rowErrors.keyError ? 'border-[var(--state-error-text)] bg-[var(--state-error-surface)]' : ''
                        }`}
                        data-testid={`models-create-model-header-key-${index}`}
                      />
                      <input
                        type="text"
                        value={row.value}
                        onChange={(event) => onHeaderRowChange(row.id, 'value', event.target.value)}
                        placeholder="请求头的值"
                        className={`ui-input h-[28px] flex-1 ${
                          rowErrors.valueError ? 'border-[var(--state-error-text)] bg-[var(--state-error-surface)]' : ''
                        }`}
                        data-testid={`models-create-model-header-value-${index}`}
                      />
                      <button
                        type="button"
                        onClick={() => onRemoveHeaderRow(row.id)}
                        aria-label={`请求头 ${index + 1}`}
                        className="inline-flex h-6 w-6 min-h-6 min-w-6 items-center justify-center rounded-[8px] p-0 text-[var(--icon-delete-color)] transition-colors hover:bg-[var(--modal-muted-surface-hover)]"
                        data-testid={`models-create-model-header-remove-${index}`}
                      >
                        <MaskIcon name="delete" className="h-4 w-4" />
                      </button>
                    </div>
                    {(rowErrors.keyError || rowErrors.valueError) && (
                      <div className="break-all px-1 text-xs text-[var(--state-error-text)]">
                        {rowErrors.keyError || rowErrors.valueError}
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={onAddHeaderRow}
                className="group inline-flex items-center gap-[4px] leading-[18px] text-[12px] text-[var(--text-accent)]"
                data-testid="models-create-model-header-add"
              >
                <MaskIcon name="add" className="h-4 w-4" />
                <span className="inline-flex h-[18px] items-center border-b border-transparent transition-colors group-hover:border-current">
                  添加
                </span>
              </button>
            </div>
            {createError && createError.includes('请求头键名重复') ? (
              <p className="mt-1 text-xs text-[var(--state-error-text)]">{createError}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="default" onClick={onClose}>
            {CREATE_MODEL_CANCEL_LABEL}
          </Button>
          <Button variant="default"
            disabled={!canConfirm || testingConnection || isIconUploading || editModelBusy}
            onClick={onTestConnection}
            data-testid="models-test-connection"
          >
            {testingConnection ? '测试中...' : TEST_CONNECTION_LABEL}
          </Button>
          <Button
            disabled={!canConfirm || saveModelBusy || isIconUploading || editModelBusy}
            onClick={onCreate}
            data-testid="models-create-model-confirm"
          >
            {saveModelBusy ? '保存中...' : SAVE_MODEL_LABEL}
          </Button>
        </div>
      </div>
    </div>
  );
}