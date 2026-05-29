/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Tab } from '@/components/shared/Tab';
import { SearchInput } from '@/components/shared/SearchInput';
import { MaskIcon } from '@/components/shared/MaskIcon';
import { Button } from '@/components/shared/Button';
import { Dropdown } from '@/components/shared/Dropdown';
import { OverflowTooltip } from '@/components/shared/OverflowTooltip';
import { PromptDialog } from '@/components/shared/PromptDialog';
import { useToastStore } from '@/stores/toastStore';
import { useConfirm } from '@/components/useConfirm';
import { apiFetch } from '@/utils/api-client';
import styles from './TemplatePicker.module.css';

interface TemplateItem {
  id: string;
  name: string;
  thumbnailUrl: string;
  source: 'preset' | 'my';
  status: 'ready' | 'parsing' | 'failed';
  filePath?: string;
}

interface TemplatePickerProps {
  selectedTemplateId?: string;
  onSelectChange: (template: TemplateItem | null) => void;
  /** 是否显示右侧关闭按钮，默认 false */
  showCloseButton?: boolean;
  /** 关闭按钮点击回调 */
  onClose?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = ['.pptx'];
const PPT_UPLOAD_FORMAT_MESSAGE = '仅支持 .pptx 格式文件';
const PPT_UPLOAD_SIZE_MESSAGE = '仅支持上传 100MB 以下的 PPT';
const MAX_PPT_TEMPLATE_NAME_LENGTH = 30;
const PPT_UPLOAD_NAME_LENGTH_MESSAGE = `上传文件名长度不能超过 ${MAX_PPT_TEMPLATE_NAME_LENGTH} 个字符（不含 .pptx 后缀）`;

interface ApiTemplateItem {
  templateId: string;
  name: string;
  source: 'builtin' | 'user';
  status: 'ready' | 'generating' | 'failed';
  previewImageUrl?: string | null;
}

interface ApiTemplateListResponse {
  templates?: ApiTemplateItem[];
  total?: number;
  builtinCount?: number;
  userCount?: number;
}

function mapApiTemplate(template: ApiTemplateItem): TemplateItem {
  return {
    id: template.templateId,
    name: template.name,
    thumbnailUrl: template.previewImageUrl ?? '',
    source: template.source === 'builtin' ? 'preset' : 'my',
    status: template.status === 'ready' ? 'ready' : template.status === 'failed' ? 'failed' : 'parsing',
  };
}

function isValidPptFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg
      className={styles.uploadIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

interface TemplateCardProps {
  template: TemplateItem;
  onMakeSame: (template: TemplateItem) => void;
  onRename?: (template: TemplateItem) => void;
  onDelete?: (template: TemplateItem) => void;
}

function TemplateCard({ template, onMakeSame, onRename, onDelete, isSelected }: TemplateCardProps & { isSelected?: boolean }) {
  const isDisabled = template.status === 'parsing';

  const renderMoreMenu = () => {
    if (template.source !== 'my' || !onRename || !onDelete) {
      return null;
    }

    return (
      <Dropdown
        trigger={
          <button
            type="button"
            className={`p-1 rounded hover:bg-[var(--surface-hover)] transition-colors ${styles.moreMenuBtn}`}
            data-testid={`template-card-menu-trigger-${template.id}`}
          >
            <img src="/icons/more-trigger.svg" alt="更多" className="h-4 w-4" />
          </button>
        }
        options={[
          { label: '重命名', onClick: () => onRename(template) },
          { label: '删除', onClick: () => onDelete(template), danger: true },
        ]}
        align="right"
        containerClassName="flex-shrink-0"
      />
    );
  };

  return (
    <div
      role="presentation"
      aria-disabled={isDisabled}
      className={[
        styles.card,
        isDisabled ? styles.cardDisabled : '',
        isSelected ? styles.cardSelected : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`template-card-${template.id}`}
    >
      <div className={styles.previewContainer}>
        {template.thumbnailUrl ? (
          <img
            src={template.thumbnailUrl}
            alt={template.name}
            className={styles.previewImage}
            draggable={false}
          />
        ) : (
          <img
            src="/images/ppt-template/template-default.png"
            alt={template.name}
            className={styles.previewImage}
            draggable={false}
          />
        )}
      </div>
      <div className={styles.cardTitleArea}>
        <OverflowTooltip content={template.name} className={styles.cardNameTooltip}>
          <div className={styles.cardName}>{template.name}</div>
        </OverflowTooltip>
        {renderMoreMenu()}
      </div>
      {!isDisabled && (
        <div className={styles.cardAction}>
          <Button variant="major"
            onClick={(e) => {
              e.stopPropagation();
              onMakeSame(template);
            }}
          >
            做同款
          </Button>
        </div>
      )}
    </div>
  );
}

const MemoizedTemplateCard = memo(TemplateCard);

interface UploadCardProps {
  isDragOver: boolean;
  isUploading: boolean;
  /** 是否有模板正在生成中 */
  isGenerating: boolean;
  /** 文件选择回调 */
  onFileSelect: (file: File) => void;
  /** 独占整个内容区（我的模板为空时） */
  isFull?: boolean;
}

function UploadCard({ isDragOver: isDragOverProp, isUploading, isGenerating, onFileSelect, isFull }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const addToast = useToastStore((state) => state.addToast);

  const isDragOver = isDragOverProp || dragOver;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (isUploading || isGenerating) return;

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    if (!isValidPptFile(file)) {
      addToast({
        type: 'error',
        title: '上传失败',
        message: PPT_UPLOAD_FORMAT_MESSAGE,
        duration: 4000,
      });
      return;
    }
    onFileSelect(file);
  };

  const handleClick = () => {
    if (isUploading || isGenerating) return;
    inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!isValidPptFile(file)) {
      addToast({
        type: 'error',
        title: '上传失败',
        message: PPT_UPLOAD_FORMAT_MESSAGE,
        duration: 4000,
      });
      return;
    }
    onFileSelect(file);
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const isDisabled = isUploading || isGenerating;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="上传 PPT 模板"
      aria-disabled={isDisabled}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className={[
        styles.uploadCard,
        isDragOver ? styles.uploadCardDragOver : '',
        isDisabled ? styles.uploadCardDisabled : '',
        isFull ? styles.uploadCardFull : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="upload-card"
      data-is-full={isFull ? 'true' : 'false'}
      data-drag-over={isDragOver}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pptx"
        onChange={handleInputChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className={styles.uploadContent}>
        <PlusIcon />
        <span className={styles.uploadText}>导入模版</span>
        <span className={styles.uploadHint}>拖拽或点击上传 .pptx 文件，大小不超过 100MB</span>
      </div>
    </div>
  );
}

interface LoadingCardProps {
  name: string;
}

function LoadingCard({ name: _name }: LoadingCardProps) {
  return (
    <div
      className={styles.loadingCard}
      aria-label="模版生成中"
      data-testid={`loading-card-${_name}`}
    >
      <span className={styles.loadingLabel}>模版生成中...</span>
    </div>
  );
}

interface FailedCardProps extends LoadingCardProps {
  onDelete: () => void;
}

function FailedCard({ name, onDelete }: FailedCardProps) {
  return (
    <div className={[styles.loadingCard, styles.failedCard].join(' ')} aria-label="模版生成失败" data-testid={`failed-card-${name}`}>
      <div className={styles.previewContainer}>
        <img src="/images/ppt-template/template-error.png" alt={name} className={styles.previewImage} draggable={false} />
      </div>
      <div className={styles.failedTitleArea}>
        <div className={styles.failedNameArea}>
          <OverflowTooltip content={name} forceShow className={styles.failedNameTooltip}>
            <span className={styles.failedName}>{name}</span>
          </OverflowTooltip>
          <OverflowTooltip content="模版生成失败，请删除后重新上传" forceShow className={styles.failedInfoIcon}>
            <img src="/icons/status/info-error.svg" alt="错误" width={16} height={16} />
          </OverflowTooltip>
        </div>
        <span
          className={styles.failedDeleteBtn}
          onClick={onDelete}
          data-testid={`failed-card-delete-${name}`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onDelete(); }}
        >
          <MaskIcon name="delete" className={styles.failedDeleteIcon} />
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

const TAB_ITEMS = [
  { value: 'preset', label: '平台推荐' },
  { value: 'my', label: '我的模板' },
];

export function TemplatePicker({ selectedTemplateId, onSelectChange, showCloseButton = false, onClose }: TemplatePickerProps) {
  const [activeTab, setActiveTab] = useState<'preset' | 'my'>('preset');
  const [presetTemplates, setPresetTemplates] = useState<TemplateItem[]>([]);
  const [myTemplates, setMyTemplates] = useState<TemplateItem[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [pollingIds, setPollingIds] = useState<string[]>([]);
  const [renameDialogTemplate, setRenameDialogTemplate] = useState<TemplateItem | null>(null);
  const [renameDialogValue, setRenameDialogValue] = useState('');
  const failedTemplateIdsRef = useRef<Set<string>>(new Set());
  const addToast = useToastStore((state) => state.addToast);
  const confirm = useConfirm();

  const refreshTemplates = useCallback(async () => {
    const res = await apiFetch('/api/ppt-templates');
    if (!res.ok) {
      throw new Error(`模板列表加载失败: HTTP ${res.status}`);
    }
    const data = (await res.json()) as ApiTemplateListResponse;
    const mapped = (data.templates ?? []).map(mapApiTemplate);
    const failedTemplates = mapped.filter((item) => item.source === 'my' && item.status === 'failed');
    const nextFailedIds = new Set(failedTemplates.map((item) => item.id));
    for (const failedTemplate of failedTemplates) {
      if (failedTemplateIdsRef.current.has(failedTemplate.id)) continue;
      addToast({
        type: 'error',
        title: '模板生成失败',
        message: `模板“${failedTemplate.name}”生成失败，请重新上传或删除该模板`,
        duration: 4000,
      });
    }
    failedTemplateIdsRef.current = nextFailedIds;
    setPresetTemplates(mapped.filter((item) => item.source === 'preset'));
    setMyTemplates(mapped.filter((item) => item.source === 'my'));
    setPollingIds(
      mapped
        .filter((item) => item.source === 'my' && item.status === 'parsing')
        .map((item) => item.id),
    );
    return mapped;
  }, [addToast]);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as 'preset' | 'my');
    setSearchKeyword('');
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchKeyword(value);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchKeyword('');
  }, []);

  const filteredMyTemplates = useMemo(
    () =>
      searchKeyword
        ? myTemplates.filter((t) => t.name.toLowerCase().includes(searchKeyword.toLowerCase()))
        : myTemplates,
    [searchKeyword, myTemplates],
  );

  const templates = activeTab === 'preset' ? presetTemplates : filteredMyTemplates;

  const handleMakeSame = useCallback(
    (template: TemplateItem) => {
      if (template.status !== 'ready') return;
      onSelectChange(template);
    },
    [onSelectChange],
  );

  const handleRename = useCallback(
    async (template: TemplateItem) => {
      setRenameDialogTemplate(template);
      setRenameDialogValue(template.name);
    },
    [],
  );

  const handleRenameConfirm = useCallback(
    async (nextName: string) => {
      if (!renameDialogTemplate) return;
      const normalizedName = normalizeTemplateName(nextName);
      if (!normalizedName || normalizedName === renameDialogTemplate.name) {
        setRenameDialogTemplate(null);
        return;
      }
      if (!isValidTemplateName(normalizedName)) {
        addToast({ type: 'error', title: '重命名失败', message: getTemplateNameValidationMessage(), duration: 4000 });
        return;
      }
      try {
        const res = await apiFetch(`/api/ppt-templates/${encodeURIComponent(renameDialogTemplate.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: normalizedName }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? `HTTP ${res.status}`);
        }
        await refreshTemplates();
        addToast({ type: 'success', title: '重命名成功', message: `模板已重命名为"${normalizedName}"`, duration: 2500 });
      } catch (error) {
        addToast({
          type: 'error',
          title: '重命名失败',
          message: error instanceof Error ? error.message : '模板重命名失败',
          duration: 4000,
        });
      } finally {
        setRenameDialogTemplate(null);
      }
    },
    [addToast, refreshTemplates, renameDialogTemplate],
  );

  const handleDelete = useCallback(
    async (template: TemplateItem) => {
      const ok = await confirm({ title: '确认删除模版', message: `确定要删除模板”${template.name}”吗？删除后，该模版将不可恢复`, confirmLabel: '删除' });
      if (!ok) return;
      try {
        const res = await apiFetch(`/api/ppt-templates/${encodeURIComponent(template.id)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? `HTTP ${res.status}`);
        }
        if (selectedTemplateId === template.id) {
          onSelectChange(null);
        }
        await refreshTemplates();
        addToast({ type: 'success', title: '删除成功', message: `模板”${template.name}”已删除`, duration: 2500 });
      } catch (error) {
        addToast({
          type: 'error',
          title: '删除失败',
          message: error instanceof Error ? error.message : '模板删除失败',
          duration: 4000,
        });
      }
    },
    [addToast, confirm, onSelectChange, refreshTemplates, selectedTemplateId],
  );

  const handleFileSelect = useCallback(async (file: File) => {
    if (file.size > MAX_PPT_TEMPLATE_FILE_SIZE) {
      addToast({ type: 'error', title: '上传失败', message: PPT_UPLOAD_SIZE_MESSAGE, duration: 4000 });
      return;
    }

    const uploadBaseName = file.name.replace(/\.(ppt|pptx)$/i, '').trim();
    if (uploadBaseName.length > MAX_PPT_TEMPLATE_NAME_LENGTH) {
      addToast({ type: 'error', title: '上传失败', message: PPT_UPLOAD_NAME_LENGTH_MESSAGE, duration: 4000 });
      return;
    }

    const normalizedName = normalizeTemplateName(uploadBaseName);
    // Create a placeholder template with parsing status
    const tempId = `uploading-${Date.now()}`;
    const newTemplate: TemplateItem = {
      id: tempId,
      name: normalizedName,
      thumbnailUrl: '',
      source: 'my',
      status: 'parsing',
    };

    setIsUploading(true);
    setMyTemplates((prev) => [newTemplate, ...prev]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', newTemplate.name);
      const res = await apiFetch('/api/ppt-templates/upload', {
        method: 'POST',
        body: formData,
      });
      const data = (await res.json().catch(() => null)) as { template?: ApiTemplateItem; error?: string } | null;
      if (!res.ok || !data?.template) {
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const uploadedTemplate = data.template;
      setMyTemplates((prev) => [mapApiTemplate(uploadedTemplate), ...prev.filter((t) => t.id !== tempId)]);
      setPollingIds((prev) =>
        uploadedTemplate.status === 'ready'
          ? prev
          : Array.from(new Set([...prev, uploadedTemplate.templateId])),
      );
      addToast({ type: 'success', title: '上传成功', message: '模板已开始生成', duration: 2500 });
    } catch (error) {
      // On error, remove the placeholder
      setMyTemplates((prev) => prev.filter((t) => t.id !== tempId));
      const refreshedTemplates = await refreshTemplates().catch(() => null);
      const hasFailedTemplate = refreshedTemplates?.some(
        (template) => template.source === 'my' && template.status === 'failed' && template.name === newTemplate.name,
      );
      if (!hasFailedTemplate) {
        addToast({
          type: 'error',
          title: '上传失败',
          message: error instanceof Error ? error.message : '模板上传失败',
          duration: 4000,
        });
      }
    } finally {
      setIsUploading(false);
    }
  }, [addToast, refreshTemplates]);

  useEffect(() => {
    void refreshTemplates().catch((error) => {
      addToast({
        type: 'error',
        title: '加载失败',
        message: error instanceof Error ? error.message : '模板列表加载失败',
        duration: 4000,
      });
    });
  }, [addToast, refreshTemplates]);

  useEffect(() => {
    if (pollingIds.length === 0) return;
    const timer = window.setInterval(() => {
      void refreshTemplates().catch(() => {
        // Best effort polling; keep quiet to avoid repeated toast spam.
      });
    }, 2000);
    return () => {
      window.clearInterval(timer);
    };
  }, [pollingIds, refreshTemplates]);

  const renderGrid = () => {
    // 我的模板为空（无搜索关键词）：上传卡片独占整个内容区
    if (activeTab === 'my' && myTemplates.length === 0 && !searchKeyword) {
      return (
        <div className={styles.grid}>
          <UploadCard
            isDragOver={false}
            isUploading={isUploading}
            isGenerating={pollingIds.length > 0}
            onFileSelect={handleFileSelect}
            isFull
          />
        </div>
      );
    }

    if (templates.length === 0) {
      return (
        <div className={styles.grid}>
          {activeTab === 'my' && (
            <UploadCard
              isDragOver={false}
              isUploading={isUploading}
              isGenerating={pollingIds.length > 0}
              onFileSelect={handleFileSelect}
            />
          )}
          <div className={styles.emptyState}>
            {activeTab === 'preset' ? '暂无论置模板' : '未找到匹配的模板'}
          </div>
        </div>
      );
    }

    return (
      <div className={styles.grid}>
        {activeTab === 'my' && (
          <UploadCard
            isDragOver={false}
            isUploading={isUploading}
            isGenerating={pollingIds.length > 0}
            onFileSelect={handleFileSelect}
          />
        )}
        {templates.map((template) => {
          if (template.status === 'parsing') {
            return <LoadingCard key={template.id} name={template.name} />;
          }
          if (template.status === 'failed') {
            return <FailedCard key={template.id} name={template.name} onDelete={() => void handleDelete(template)} />;
          }
          return (
            <MemoizedTemplateCard
              key={template.id}
              template={template}
              onMakeSame={handleMakeSame}
              onRename={handleRename}
              onDelete={handleDelete}
              isSelected={selectedTemplateId === template.id}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className={styles.container} data-testid="template-picker">
      <div className={styles.tabRow}>
        <div className={styles.tabSection}>
          <Tab
            items={TAB_ITEMS}
            value={activeTab}
            onChange={handleTabChange}
            activeBorderColor="var(--tab-active-color)"
            activeTextColor="var(--tab-active-color)"
          />
        </div>
        {showCloseButton && (
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className={styles.closeBtn}
          >
            <MaskIcon name="close" className="h-4 w-4" />
          </button>
        )}
      </div>

      {activeTab === 'my' && myTemplates.length > 3 && (
        <div className={styles.searchSection}>
          <SearchInput
            value={searchKeyword}
            onChange={handleSearchChange}
            onClear={handleSearchClear}
            placeholder="搜索我的模板..."
            wrapperClassName="w-full"
          />
        </div>
      )}

      <div className={styles.cardGrid}>{renderGrid()}</div>

      <PromptDialog
        open={renameDialogTemplate !== null}
        title="编辑模版名称"
        inputValue={renameDialogValue}
        inputPlaceholder="请输入新的模板名称"
        confirmLabel="确认"
        cancelLabel="取消"
        onConfirm={handleRenameConfirm}
        onCancel={() => setRenameDialogTemplate(null)}
        onInputChange={setRenameDialogValue}
        confirmDisabled={!renameDialogValue.trim() || renameDialogValue.trim() === renameDialogTemplate?.name}
      />
    </div>
  );
}
const MAX_PPT_TEMPLATE_FILE_SIZE = 100 * 1024 * 1024;
const PPT_TEMPLATE_NAME_PATTERN = /^[A-Za-z0-9\u4e00-\u9fa5_-]+(?:[ ]+[A-Za-z0-9\u4e00-\u9fa5_-]+)*$/;

function normalizeTemplateName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function isValidTemplateName(value: string): boolean {
  const normalized = normalizeTemplateName(value);
  return normalized.length > 0 && normalized.length <= MAX_PPT_TEMPLATE_NAME_LENGTH && PPT_TEMPLATE_NAME_PATTERN.test(normalized);
}

function getTemplateNameValidationMessage(): string {
  return `模板名称仅支持汉字、字母、数字、中划线、下划线和空格，且长度不超过 ${MAX_PPT_TEMPLATE_NAME_LENGTH} 个字符`;
}
