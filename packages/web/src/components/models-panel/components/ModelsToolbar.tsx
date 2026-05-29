/*
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { MaskIcon } from '@/components/shared/MaskIcon';
import { SearchInput } from '@/components/shared/SearchInput';
import { Button } from '@/components/shared/Button';
import { useChatStore } from '@/stores/chatStore';
import {
  CREATE_MODEL_LABEL,
  HUAWEI_MAAS_ACCESS_LABEL,
  MODEL_TITLE,
  SEARCH_PLACEHOLDER,
} from '../utils';

export interface ModelsToolbarProps {
  loading: boolean;
  isSkipAuth: boolean;
  canCreateModel: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onRefresh: () => void;
  onOpenCreateModel: () => void;
  onOpenHuaweiMaasAccess: () => void;
}

export function ModelsToolbar({
  loading,
  isSkipAuth,
  canCreateModel,
  searchQuery,
  onSearchChange,
  onRefresh,
  onOpenCreateModel,
  onOpenHuaweiMaasAccess,
}: ModelsToolbarProps) {
  const openHub = useChatStore((s) => s.openHub);

  return (
    <>
      <div className="ui-page-header-inline mb-4">
        <h1 className="ui-page-title">{MODEL_TITLE}</h1>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => openHub('provider-profiles')}
            className="hidden rounded-[16px] border border-[var(--button-default-border)] bg-[var(--button-default-bg)] px-3 py-1.5 text-[12px] font-medium text-[var(--button-default-text)] transition-colors hover:border-[var(--button-default-border-hover)] hover:bg-[var(--button-default-bg-hover)] hover:text-[var(--button-default-text-hover)]"
          >
            ACP / 账号配置
          </button>
          {!isSkipAuth ? (
            <Button variant="major"
              onClick={onOpenHuaweiMaasAccess}
              data-testid="models-open-huawei-maas-model-modal"
            >
              {HUAWEI_MAAS_ACCESS_LABEL}
            </Button>
          ) : null}
          {canCreateModel ? (
            <Button variant="major"
              onClick={onOpenCreateModel}
              data-testid="models-open-create-model-modal"
            >
              {CREATE_MODEL_LABEL}
            </Button>
          ) : null}
        </div>
      </div>

      <section className="shrink-0 pb-6" data-testid="models-toolbar">
        <div className="flex items-center gap-2">
          <SearchInput
            wrapperClassName="flex-1"
            aria-label="搜索模型"
            value={searchQuery}
            onChange={onSearchChange}
            onClear={() => onSearchChange('')}
            placeholder={SEARCH_PLACEHOLDER}
            clearAriaLabel="清除搜索"
          />
          <button
            type="button"
            aria-label="刷新"
            title="刷新"
            data-testid="models-refresh-button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-panel)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MaskIcon name="refresh" className="h-4 w-4" />
          </button>
        </div>
      </section>
    </>
  );
}