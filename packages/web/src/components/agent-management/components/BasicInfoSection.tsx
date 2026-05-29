/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { createPortal } from 'react-dom';
import type { ChangeEvent, RefObject } from 'react';
import { MaskIcon } from '@/components/shared/MaskIcon';
import { Textarea } from '@/components/shared/Textarea';
import { ModelSelectDropdown, ModelSelectTriggerIcon, ModelSelectValueDraft } from './ModelSelectDropdown';
import type { CreateModelOption } from '../types';
import { formatAvatarUrl } from '../utils';

function SparklesIcon() {
  return <MaskIcon name="random" className="block h-[28px] w-[28px]" />;
}

interface BasicInfoSectionProps {
  avatarError: string | null;
  displayAvatar: string;
  draftDefaultModel: string;
  draftDescription: string;
  draftName: string;
  fileInputRef: RefObject<HTMLInputElement>;
  inlineNameError: string | null;
  loadingModels: boolean;
  modelGroups: Array<{ id: string; label: string; items: CreateModelOption[] }>;
  modelMenuOpen: boolean;
  modelMenuPosition: { top: number; left: number; width: number } | null;
  modelMenuRef: RefObject<HTMLDivElement>;
  modelTriggerRef: RefObject<HTMLButtonElement>;
  modelError: string | null;
  onAvatarUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onDescriptionChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onRandomAvatar: () => void;
  onSelectModel: (modelId: string) => void;
  onToggleModelMenu: () => void;
  selectedModel: CreateModelOption | null;
  openAbove: boolean;
  uploadingAvatar: boolean;
}

export function BasicInfoSection({
  avatarError,
  displayAvatar,
  draftDefaultModel,
  draftDescription,
  draftName,
  fileInputRef,
  inlineNameError,
  loadingModels,
  modelGroups,
  modelMenuOpen,
  modelMenuPosition,
  modelMenuRef,
  modelTriggerRef,
  modelError,
  onAvatarUpload,
  onDescriptionChange,
  onNameChange,
  onRandomAvatar,
  onSelectModel,
  onToggleModelMenu,
  selectedModel,
  openAbove,
  uploadingAvatar,
}: BasicInfoSectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">基础信息</h2>

      <div className="flex flex-col gap-2">
        <label className="text-[12px] text-[var(--text-primary)]">名称</label>
        <input
          type="text"
          value={draftName}
          onChange={(event) => onNameChange(event.target.value)}
          maxLength={64}
          className="ui-input h-[36px] w-full rounded-[6px] px-4 text-[14px]"
          placeholder="请输入智能体名称"
        />
        {inlineNameError ? <p className="text-[12px] text-[var(--state-error-text)]">{inlineNameError}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[12px] text-[var(--text-primary)]">描述（可选）</label>
        <Textarea
          value={draftDescription}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="请输入描述"
          maxLength={1000}
          showCount
          formatCount={(current, max) => `${current}/${max ?? 0}`}
          className="h-[80px] min-h-[80px] max-h-[160px] w-full overflow-y-auto text-[14px]"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[12px] text-[var(--text-primary)]">图标</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group relative flex h-11 w-11 items-center justify-center rounded-full border border-transparent transition"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={formatAvatarUrl(displayAvatar)} alt="Avatar" className="h-full w-full rounded-full object-cover" />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-[var(--modal-loading-overlay)] opacity-0 transition group-hover:opacity-100">
              <MaskIcon name="edit" preserveOriginalColor className="h-4 w-4" />
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            onChange={onAvatarUpload}
            className="hidden"
          />
          <div className="h-11 pt-[22px]">
            <div aria-hidden="true" className="h-[16px] w-px bg-[var(--border-default)]" />
          </div>
          <div className="h-11 pt-[16px]">
            <button
              type="button"
              onClick={onRandomAvatar}
              title="换一换"
              className="h-[28px] w-[28px] min-h-[28px] min-w-[28px] rounded-[6px]"
            >
              <SparklesIcon />
            </button>
          </div>
        </div>
        {avatarError ? <p className="text-[12px] text-[var(--state-error-text)]">{avatarError}</p> : null}
        <p className="text-[12px] text-[var(--text-muted)]">
          {uploadingAvatar ? '上传中...' : '支持 png、jpeg、jpg 格式，限制 200KB 内'}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[12px] text-[var(--text-primary)]">模型</label>
        {modelGroups.length > 0 || selectedModel ? (
          <>
            <button
              ref={modelTriggerRef}
              type="button"
              aria-label="Model"
              aria-haspopup="listbox"
              aria-expanded={modelMenuOpen}
              aria-invalid={Boolean(modelError)}
              onClick={onToggleModelMenu}
              className="ui-field flex h-[28px] w-full items-center justify-between rounded-[6px] bg-[var(--surface-panel)] px-[10px] text-left text-[12px]"
            >
              <ModelSelectValueDraft item={selectedModel} loading={loadingModels} />
              <ModelSelectTriggerIcon />
            </button>
            {modelError ? <p className="text-[12px] text-[var(--state-error-text)]">{modelError}</p> : null}

            {modelMenuOpen && modelMenuPosition
              ? createPortal(
                  <div
                    ref={modelMenuRef}
                    className="fixed z-[70]"
                    style={{
                      top: modelMenuPosition.top,
                      left: modelMenuPosition.left,
                      width: modelMenuPosition.width,
                      transform: openAbove ? 'translateY(-100%)' : undefined,
                    }}
                  >
                    <ModelSelectDropdown
                      groups={modelGroups}
                      selectedId={selectedModel?.id ?? draftDefaultModel}
                      onSelect={(item) => onSelectModel(item.id)}
                    />
                  </div>,
                  document.body,
                )
              : null}
          </>
        ) : (
          <div className="ui-field flex h-[28px] w-full items-center rounded-[6px] px-4 text-[12px] text-[var(--text-muted)]">
            {loadingModels ? '加载模型中...' : '暂无可用模型'}
          </div>
        )}
      </div>
    </div>
  );
}
