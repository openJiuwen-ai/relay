/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useState } from 'react';
import { MaskIcon } from '@/components/shared/MaskIcon';
import { Alert } from '@/components/shared/Alert';
import { Button } from '@/components/shared/Button';
import { PasswordField } from '@/components/shared/PasswordField';
import type { SearchEngine, SearchEngineId } from '../search-engine-config.types';

const API_URLS: Record<string, string> = {
  perplexity: 'https://www.perplexity.ai/settings/api',
  serper: 'https://serper.dev/api-key',
  jina: 'https://jina.ai/reader/',
  bocha: 'https://bochaai.com/',
};

interface SearchEngineEditViewProps {
  engine: SearchEngine;
  value: string;
  configured?: boolean;
  onSave: (engineId: SearchEngineId, value: string) => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

export function SearchEngineEditView({
  engine,
  value,
  configured = false,
  onSave,
  onCancel,
  saving = false,
}: SearchEngineEditViewProps) {
  const [inputValue, setInputValue] = useState(value);
  const [showTip, setShowTip] = useState(true);
  const [touched, setTouched] = useState(false);

  const showError = touched && !inputValue.trim();

  const handleSave = () => {
    setTouched(true);
    if (!inputValue.trim()) return;
    onSave(engine.id, inputValue.trim());
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 hover:bg-[var(--surface-hover-muted)] transition-colors"
        >
          <MaskIcon name="chevronLeft" className="h-4 w-4" />
        </button>
        <span className="text-[16px] font-medium" style={{ color: 'rgba(25, 25, 25, 1)' }}>
          配置
        </span>
      </div>

      {showTip && (
        <Alert mode="prompt" closable onClose={() => setShowTip(false)}>
          <span className="text-[12px]">
            请前往对应网站获取API key后填入此处
            <a
              href={API_URLS[engine.id] ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--text-accent)] hover:underline"
            >
              前往获取
              <MaskIcon name="link-blue" className="h-4 w-4" />
            </a>
          </span>
        </Alert>
      )}

      <div className="space-y-1.5">
        <label htmlFor={`search-engine-${engine.id}`} className="text-[12px] text-[var(--text-primary)]">
          {engine.inputLabel}
        </label>
        <PasswordField
          id={`search-engine-${engine.id}`}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={'请输入'}
          autoComplete="new-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-form-type="other"
          data-1p-ignore="true"
          data-lpignore="true"
          className={`ui-input w-full ${showError ? 'border-red-500' : ''}`}
          style={showError ? { backgroundColor: '#fef2f2 !important' } : undefined}
          disabled={saving}
        />
        {showError && <p className="text-[12px] text-red-500">输入内容不能为空</p>}
      </div>

      {/*
        底部按钮区始终贴底：
        - 父容器 flex-col h-full 使内容区占满可用高度
        - mt-auto 将此 div 推至flex主轴末端
        - 内容少时与 form 之间保持 gap-4；内容多时自然向下撑开
      */}
      <div className="flex justify-end gap-2 pt-4 mt-auto">
        <Button variant="default" onClick={onCancel} disabled={saving}>
          取消
        </Button>
        <Button variant="major" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </Button>
      </div>
    </div>
  );
}
