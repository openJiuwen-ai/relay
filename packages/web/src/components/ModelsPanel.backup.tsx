/*
 * @backup KEEP FOR ROLLBACK - DO NOT MODIFY
 *
 * 原始文件，重构过渡期保留用于安全回滚。
 *
 * 新文件：./ModelsPanel/ModelsPanel.tsx（已拆分为 hooks + subcomponents）
 * 任务：03-component-design-and-hook-refactoring
 *
 * 删除条件（全部满足后可删除）：
 * ✅ 新组件单元测试通过
 * ✅ 新组件集成测试通过
 * ⬜ 上线后 2 周无回归问题
 * ⬜ 代码评审批准删除
 *
 * 预计删除时间：2026-06-01 或 v2.4.0 版本发布后
 *
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

'use client';

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { buildNameInitialIconDataUrl } from '@/lib/name-initial-icon';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';
import { API_URL, apiFetch } from '@/utils/api-client';
import { getCanCreateModel, getIsSkipAuth } from '@/utils/userId';
import { MaskIcon } from '@/components/shared/MaskIcon';
import { AppModal } from './AppModal';
import { Button } from './shared/Button';
import { IconButton } from './shared/IconButton';
import { uploadAvatarAsset } from './hub-agent-editor.client';
import { TagEditor } from './hub-tag-editor';
import { NameInitialIcon } from './NameInitialIcon';
import { CenteredLoadingState } from './shared/CenteredLoadingState';
import { EmptyDataState } from './shared/EmptyDataState';
import { NoSearchResultsState } from './shared/NoSearchResultsState';
import { OverflowTooltip } from './shared/OverflowTooltip';
import { PasswordField } from './shared/PasswordField';
import { RefreshButton } from './shared/RefreshButton';
import { SearchInput } from './shared/SearchInput';
import { Textarea } from './shared/Textarea';
import { useConfirm } from './useConfirm';

const ADD_MODEL = '添加模型';
const MODEL_TITLE = '模型';
const SEARCH_PLACEHOLDER = '搜索模型';
const EMPTY_STATE_TITLE = '暂无模型';
const HUAWEI_MAAS_GROUP_LABEL = '华为云 MaaS';
const CUSTOM_MODEL_GROUP_LABEL = '自定义模型';
const SELF_HUAWEI_MAAS_GROUP_LABEL = '自接入华为云 MaaS';
const VENDOR_ICON = '/images/vendor.svg';
const DEFAULT_DEVELOPER = '华为云 MaaS';
const UNKNOWN_PROTOCOL_LABEL = 'unknown';
const CREATE_MODEL_LABEL = '新建模型';
const CREATE_MODEL_RISK_ACK_KEY = 'create-model-risk-ack:v1';
const CREATE_MODEL_RISK_TITLE = '风险提示';
const CREATE_MODEL_RISK_MESSAGE =
  '请注意，当您使用第三方模型时，您承诺将严格遵守第三方的相关条款（包括但不限于 license 协议）。华为云不对第三方产品的合规性和安全性作保证，请您使用前慎重考虑并评估风险。';
const HUAWEI_MAAS_ACCESS_LABEL = '接入华为云Maas模型';
const HUAWEI_MAAS_ACCESS_URL = 'https://api.modelarts-maas.com/openai/v1';
const CREATE_MODEL_CANCEL_LABEL = '取消';
const TEST_CONNECTION_LABEL = '测试连接';
const SAVE_MODEL_LABEL = '保存';
const DELETE_MODEL_LABEL = '删除';
const MODEL_ICON_MAX_BYTES = 200 * 1024;
const DEFAULT_MODEL_ICON_SRC = '/images/mode-default-icon.svg';
const MODEL_NAME_VALIDATION_MESSAGE = '支持中英文、数字及 :._/|\\-，仅支持中英文、数字开头结尾，长度2-64';
const MODEL_NAME_EDGE_PATTERN = '[A-Za-z0-9\\u4E00-\\u9FFF]';
const MODEL_NAME_BODY_PATTERN = '[A-Za-z0-9\\u4E00-\\u9FFF:._/|\\\\-]';
const MODEL_NAME_PATTERN = new RegExp(
  `^${MODEL_NAME_EDGE_PATTERN}(?:${MODEL_NAME_BODY_PATTERN}{0,62}${MODEL_NAME_EDGE_PATTERN})$`,
);

function isValidModelName(value: string) {
  return MODEL_NAME_PATTERN.test(value);
}


function CloseIcon() {
  return <MaskIcon name="close" className="h-4 w-4" />;
}

function ClockIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12L15 13.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

interface MassModelResponseItem {
  id?: string | number;
  object?: string;
  name?: string;
  description?: string;
  protocol?: string;
  labels?: string[];
  developer?: string;
  icon?: string;
  baseUrl?: string;
  accessMode?: string;
  [key: string]: unknown;
}

interface ModelCardData {
  id: string;
  object: string;
  name: string;
  description: string;
  labels: string[];
  developer: string;
  icon?: string;
  protocol: string;
  baseUrl?: string;
  accessMode?: 'huawei_maas_access';
  updatedAt?: string | number;
  [key: string]: unknown;
}

interface ModelCardGroup {
  key: string;
  label: string;
  items: ModelCardData[];
}

interface ModelConfigProviderItem {
  id: string;
  displayName?: string;
  description?: string;
  icon?: string;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  models?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface HeaderInputRow {
  id: string;
  key: string;
  value: string;
}

type CreateModelModalMode = 'default' | 'huawei-maas-access';

function pickStringField(item: MassModelResponseItem, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const value = item[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[,，/|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeUpdatedAt(value: unknown): string | number | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function formatCustomModelUpdatedAt(value: unknown): string | null {
  const normalized = normalizeUpdatedAt(value);
  if (normalized === undefined) return null;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
}

function resolveModelConfigSourceId(cardId: string): string | null {
  if (!cardId.startsWith('model_config:')) return null;
  const parts = cardId.split(':');
  if (parts.length < 3) return null;
  const sourceId = parts[1]?.trim();
  return sourceId ? sourceId : null;
}

function isHuaweiMaasAccessBaseUrl(baseUrl: string | undefined): boolean {
  return normalizeBaseUrlForComparison(baseUrl) === normalizeBaseUrlForComparison(HUAWEI_MAAS_ACCESS_URL);
}

function normalizeModel(item: MassModelResponseItem, index: number): ModelCardData {
  const nameFromKnownFields = pickStringField(item, [
    'name',
    'modelName',
    'model_name',
    'displayName',
    'display_name',
    '名称',
  ]);

  const genericStringEntries = Object.entries(item).filter(
    ([key, value]) => typeof value === 'string' && key !== 'id' && key !== 'object',
  ) as Array<[string, string]>;

  const inferredName =
    nameFromKnownFields ?? genericStringEntries.find(([key]) => !/desc|description|描述/i.test(key))?.[1]?.trim() ?? '';

  // Only use explicit description fields. If none present, leave description empty so
  // the UI doesn't display fallback values like id or DEFAULT_DESC.
  const inferredDescription = pickStringField(item, ['description', 'desc', '描述']) ?? '';

  const id = String(item.id ?? `${inferredName || 'model'}-${index}`);
  const object = String(item.object ?? 'model');
  const labels = normalizeStringArray(item.labels || []);
  const developer =
    pickStringField(item, ['developer', 'provider', 'vendor', 'publisher', 'company']) ?? DEFAULT_DEVELOPER;
  const icon = pickStringField(item, ['icon', 'logo', 'image', 'avatar']);
  const protocol = pickStringField(item, ['protocol']) ?? UNKNOWN_PROTOCOL_LABEL;
  const baseUrl = typeof item.baseUrl === 'string' && item.baseUrl.trim() ? item.baseUrl.trim() : undefined;
  const accessMode = item.accessMode === 'huawei_maas_access' ? 'huawei_maas_access' : undefined;
  const createdAt = normalizeUpdatedAt(item.updatedAt ?? item.updated_at ?? item.updateTime ?? item.update_time);
  const resolvedDeveloper = isHuaweiMaasAccessBaseUrl(baseUrl) ? '其他' : developer;

  return {
    id,
    object,
    name: inferredName,
    description: inferredDescription,
    labels,
    developer: resolvedDeveloper,
    icon,
    protocol,
    ...(baseUrl ? { baseUrl } : {}),
    ...(accessMode ? { accessMode } : {}),
    ...(createdAt !== undefined ? { updatedAt: createdAt } : {}),
  };
}

function normalizeBaseUrlForComparison(baseUrl: string | undefined): string {
  return baseUrl?.trim().replace(/\/+$/, '').toLowerCase() ?? '';
}

function isSelfHuaweiMaaSAccessCard(card: Pick<ModelCardData, 'accessMode' | 'baseUrl'>): boolean {
  return isHuaweiMaasAccessBaseUrl(card.baseUrl);
}

function protocolGroupLabel(card: Pick<ModelCardData, 'protocol' | 'accessMode' | 'baseUrl'>): string {
  if (isSelfHuaweiMaaSAccessCard(card)) return SELF_HUAWEI_MAAS_GROUP_LABEL;
  const trimmed = card.protocol.trim();
  if (trimmed.toLowerCase() === 'huawei_maas') return HUAWEI_MAAS_GROUP_LABEL;
  return CUSTOM_MODEL_GROUP_LABEL;
}

function protocolGroupKey(card: Pick<ModelCardData, 'protocol' | 'accessMode' | 'baseUrl'>): string {
  if (isSelfHuaweiMaaSAccessCard(card)) return 'self_huawei_maas_access';
  const trimmed = card.protocol.trim().toLowerCase();
  if (trimmed === 'huawei_maas') return 'huawei_maas';
  return 'custom_models';
}

function buildModelSearchText(card: ModelCardData): string {
  return [
    card.name,
    card.description,
    card.id,
    card.object,
    card.developer,
    card.protocol,
    protocolGroupLabel(card),
    ...card.labels,
  ]
    .join(' ')
    .toLowerCase();
}

function groupCards(cards: ModelCardData[]): ModelCardGroup[] {
  return cards.reduce<ModelCardGroup[]>((acc, item) => {
    const key = protocolGroupKey(item);
    const existing = acc.find((group) => group.key === key);
    if (existing) {
      existing.items.push(item);
      return acc;
    }
    acc.push({ key, label: protocolGroupLabel(item), items: [item] });
    return acc;
  }, []);
}

function resolveUploadedIconUrl(icon?: string | null): string | null {
  const trimmed = icon?.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('/uploads/') ? `${API_URL}${trimmed}` : trimmed;
}

function isEnvFlagEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

function hasCreateModelRiskAgreed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const value = window.localStorage.getItem(CREATE_MODEL_RISK_ACK_KEY);
    return value === 'true' || value === '1';
  } catch {
    return false;
  }
}

function markCreateModelRiskAgreed(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CREATE_MODEL_RISK_ACK_KEY, 'true');
  } catch {
    // ignore storage failure
  }
}

export function ModelsPanel() {
  const [loading, setLoading] = useState(false);
  const [isSkipAuth, setIsSkipAuth] = useState(false);
  const [canCreateModel, setCanCreateModel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cards, setCards] = useState<ModelCardData[]>([]);
  const [resolvedProjectPath, setResolvedProjectPath] = useState<string | null>(null);
  const [showAddModelModal, setShowAddModelModal] = useState(false);
  const [showCreateModelRiskModal, setShowCreateModelRiskModal] = useState(false);
  const [showCreateModelModal, setShowCreateModelModal] = useState(false);
  const [createModelModalMode, setCreateModelModalMode] = useState<CreateModelModalMode>('default');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createModelError, setCreateModelError] = useState<string | null>(null);
  const [createModelSuccess, setCreateModelSuccess] = useState<string | null>(null);
  const [saveModelBusy, setSaveModelBusy] = useState(false);
  const [modelNameInput, setModelNameInput] = useState('');
  const [modelDescriptionInput, setModelDescriptionInput] = useState('');
  const [modelIconInput, setModelIconInput] = useState('');
  const [modelIconUploading, setModelIconUploading] = useState(false);
  const [modelDisplayNameInput, setModelDisplayNameInput] = useState('');
  const [modelUrlInput, setModelUrlInput] = useState('');
  const [modelApiKeyInput, setModelApiKeyInput] = useState('');
  const [modelHeaderRows, setModelHeaderRows] = useState<HeaderInputRow[]>([]);
  const [headerRowErrors, setHeaderRowErrors] = useState<Map<string, { keyError?: string; valueError?: string }>>(
    new Map(),
  );
  const [headerErrorRowIndex, setHeaderErrorRowIndex] = useState<number | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingOriginalModelName, setEditingOriginalModelName] = useState<string | null>(null);
  const [editingSourceModels, setEditingSourceModels] = useState<string[]>([]);
  const [editModelBusy, setEditModelBusy] = useState(false);
  const modelIconFileInputRef = useRef<HTMLInputElement | null>(null);
  const openHub = useChatStore((s) => s.openHub);
  const currentProjectPath = useChatStore((s) => s.currentProjectPath);
  const confirm = useConfirm();

  const isEditMode = Boolean(editingSourceId);
  const isHuaweiMaasAccessMode = createModelModalMode === 'huawei-maas-access';
  const modelIconPreviewSrc = resolveUploadedIconUrl(modelIconInput) ?? DEFAULT_MODEL_ICON_SRC;
  const trimmedModelName = modelNameInput.trim();
  const isModelNameValid =
    trimmedModelName.length >= 2 && trimmedModelName.length <= 64 && isValidModelName(trimmedModelName);
  const showModelNameValidationError = trimmedModelName.length > 0 && !isModelNameValid;
  const canConfirmCreateModel = isEditMode
    ? isModelNameValid
    : isModelNameValid && modelUrlInput?.trim().length > 0 && modelApiKeyInput?.trim().length > 0;

  const buildModelsUrl = useCallback(() => {
    const query = new URLSearchParams();
    if (currentProjectPath && currentProjectPath !== 'default') {
      query.set('projectPath', currentProjectPath);
    }
    const queryText = query.toString();
    return queryText ? `/api/maas-models?${queryText}` : '/api/maas-models';
  }, [currentProjectPath]);

  const buildModelConfigProfilesUrl = useCallback(() => {
    const query = new URLSearchParams();
    if (currentProjectPath && currentProjectPath !== 'default') {
      query.set('projectPath', currentProjectPath);
    }
    const queryText = query.toString();
    return queryText ? `/api/model-config-profiles?${queryText}` : '/api/model-config-profiles';
  }, [currentProjectPath]);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsRes, providersRes] = await Promise.all([
        apiFetch(buildModelsUrl()),
        apiFetch(buildModelConfigProfilesUrl()),
      ]);
      if (!modelsRes.ok) {
        setCards([]);
        return;
      }
      const json = (await modelsRes.json()) as {
        projectPath?: string;
        list?: MassModelResponseItem[];
        models?: MassModelResponseItem[];
      };
      const providersJson = providersRes.ok
        ? ((await providersRes.json()) as { providers?: ModelConfigProviderItem[] })
        : { providers: [] };
      const providerUpdatedAtById = new Map(
        (providersJson.providers ?? [])
          .filter((provider) => normalizeUpdatedAt(provider.updatedAt ?? provider.createdAt) !== undefined)
          .map((provider) => [provider.id, (provider.updatedAt ?? provider.createdAt) as string]),
      );
      const source = Array.isArray(json.list) ? json.list : Array.isArray(json.models) ? json.models : [];
      setCards(
        source.map(normalizeModel).map((card) => {
          const sourceId = resolveModelConfigSourceId(card.id);
          if (!sourceId || card.updatedAt !== undefined) return card;
          const updatedAt = providerUpdatedAtById.get(sourceId);
          return updatedAt ? { ...card, updatedAt } : card;
        }),
      );
      setResolvedProjectPath(typeof json.projectPath === 'string' ? json.projectPath : null);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [buildModelConfigProfilesUrl, buildModelsUrl]);

  const handleDeleteModel = useCallback(
    async (cardId: string, cardName: string) => {
      if (deletingModelId) return;
      const ok = await confirm({
        title: '删除模型',
        message: `确认删除模型“${cardName || cardId}”？此操作不可恢复。`,
        confirmLabel: '删除',
        cancelLabel: '取消',
        variant: 'default',
      });
      if (!ok) return;
      setDeletingModelId(cardId);
      try {
        // cardId format: model_config:{sourceId}:{modelName} or model_config:{sourceId}
        // extract sourceId (the part after "model_config:" and before the last ":")
        let sourceId = cardId;
        if (cardId.startsWith('model_config:')) {
          const parts = cardId.split(':');
          if (parts.length >= 2) {
            sourceId = parts[1];
          }
        }
        const query = new URLSearchParams();
        if (currentProjectPath && currentProjectPath !== 'default') {
          query.set('projectPath', currentProjectPath);
        }
        const queryText = query.toString();
        const url = `/api/model-config-profiles/${encodeURIComponent(sourceId)}${queryText ? `?${queryText}` : ''}`;
        const res = await apiFetch(url, { method: 'DELETE' });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `删除失败 (${res.status})`);
        }
        await fetchModels();
      } catch (error) {
        console.error('Delete model failed:', error);
      } finally {
        setDeletingModelId(null);
      }
    },
    [confirm, deletingModelId, currentProjectPath, fetchModels],
  );

  useEffect(() => {
    setIsSkipAuth(getIsSkipAuth());
    setCanCreateModel(getCanCreateModel() || isEnvFlagEnabled(process.env.CAN_CREATE_MODEL));
  }, []);

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  const normalizedQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const filteredCards = useMemo(() => {
    if (!normalizedQuery) return cards;
    return cards.filter((card) => buildModelSearchText(card).includes(normalizedQuery));
  }, [cards, normalizedQuery]);

  const groupedCards = useMemo(() => groupCards(filteredCards), [filteredCards]);
  const hasSearchQuery = normalizedQuery.length > 0;
  const showEmptyData = !loading && cards.length === 0;
  const showNoResults = !loading && cards.length > 0 && hasSearchQuery && groupedCards.length === 0;
  const showGroups = !loading && groupedCards.length > 0;

  const resolveProjectPathForPayload = () =>
    resolvedProjectPath || (currentProjectPath && currentProjectPath !== 'default' ? currentProjectPath : undefined);

  const closeCreateModelModal = useCallback(() => {
    setShowCreateModelModal(false);
    setCreateModelModalMode('default');
    setCreateModelError(null);
    setCreateModelSuccess(null);
    setEditingSourceId(null);
    setEditingOriginalModelName(null);
    setEditingSourceModels([]);
    setHeaderRowErrors(new Map());
  }, []);

  const closeCreateModelRiskModal = useCallback(() => {
    setShowCreateModelRiskModal(false);
  }, []);

  useEscapeKey({
    enabled: showCreateModelModal || showCreateModelRiskModal,
    onEscape: () => {
      if (showCreateModelRiskModal) {
        closeCreateModelRiskModal();
        return;
      }
      closeCreateModelModal();
    },
  });

  const resetCreateModelForm = (mode: CreateModelModalMode = 'default') => {
    setModelNameInput('');
    setModelDescriptionInput('');
    setModelIconInput(DEFAULT_MODEL_ICON_SRC);
    setModelDisplayNameInput('');
    setModelUrlInput(mode === 'huawei-maas-access' ? HUAWEI_MAAS_ACCESS_URL : '');
    setModelApiKeyInput('');
    setModelHeaderRows([]);
    setHeaderRowErrors(new Map());
  };

  const handleOpenCreateModelModal = (mode: CreateModelModalMode = 'default') => {
    resetCreateModelForm(mode);
    setCreateModelModalMode(mode);
    setEditingSourceId(null);
    setEditingOriginalModelName(null);
    setEditingSourceModels([]);
    setCreateModelError(null);
    setHeaderRowErrors(new Map());
    setCreateModelSuccess(null);
    setShowCreateModelModal(true);
    setHeaderErrorRowIndex(null);
  };

  const handleOpenCreateModelRiskGuard = () => {
    if (hasCreateModelRiskAgreed()) {
      handleOpenCreateModelModal('default');
      return;
    }
    setShowCreateModelRiskModal(true);
  };

  const handleAgreeCreateModelRisk = () => {
    markCreateModelRiskAgreed();
    setShowCreateModelRiskModal(false);
    handleOpenCreateModelModal('default');
  };

  const handleOpenEditModelModal = async (card: ModelCardData) => {
    const sourceId = resolveModelConfigSourceId(card.id);
    if (!sourceId || editModelBusy) return;

    resetCreateModelForm('default');
    setCreateModelModalMode(isSelfHuaweiMaaSAccessCard(card) ? 'huawei-maas-access' : 'default');
    setCreateModelError(null);
    setCreateModelSuccess(null);
    setEditModelBusy(true);
    setHeaderErrorRowIndex(null);
    setHeaderRowErrors(new Map());
    try {
      const projectPath = resolveProjectPathForPayload();
      const query = new URLSearchParams();
      if (projectPath) query.set('projectPath', projectPath);
      const queryText = query.toString();
      const url = `/api/model-config-profiles${queryText ? `?${queryText}` : ''}`;
      const res = await apiFetch(url);
      const body = (await res.json().catch(() => ({}))) as { providers?: ModelConfigProviderItem[]; error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `请求失败 (${res.status})`);
      }
      const provider = (body.providers ?? []).find((item) => item.id === sourceId);

      setEditingSourceId(sourceId);
      setEditingOriginalModelName(card.name);
      setEditingSourceModels(Array.isArray(provider?.models) ? provider.models : [card.name]);
      setModelNameInput(card.name);
      setModelDescriptionInput(provider?.description ?? card.description ?? '');
      setModelDisplayNameInput(provider?.displayName ?? '');
      setModelIconInput(provider?.icon?.trim() || card.icon?.trim() || '');
      setModelUrlInput(provider?.baseUrl ?? card.baseUrl ?? '');
      setModelApiKeyInput(provider?.apiKey ?? '');
      setModelHeaderRows(headersObjectToRows(provider?.headers));
      setShowCreateModelModal(true);
    } catch (error) {
      setCreateModelError(error instanceof Error ? error.message : String(error));
    } finally {
      setEditModelBusy(false);
    }
  };

  const resolveDraftModelNames = () => {
    if (!editingSourceId) return [modelNameInput.trim()].filter(Boolean);
    const nextModel = modelNameInput.trim();
    const previousModel = editingOriginalModelName?.trim() || '';
    const sourceModels =
      editingSourceModels.length > 0 ? [...editingSourceModels] : previousModel ? [previousModel] : [];
    const replacedModels = sourceModels.map((name) => (name === previousModel ? nextModel : name));
    return Array.from(
      new Set((replacedModels.length > 0 ? replacedModels : [nextModel]).map((name) => name.trim()).filter(Boolean)),
    );
  };

  const handleCreateModel = async () => {
    if (!canConfirmCreateModel || saveModelBusy) return;
    // validate header rows and build headers object
    const buildResult = buildHeadersObject(modelHeaderRows);
    if (buildResult.errorIndex !== null || buildResult.errorMessage) {
      setHeaderErrorRowIndex(buildResult.errorIndex);
      // trigger validateHeaderRows to populate headerRowErrors map
      validateHeaderRows(modelHeaderRows);
      const firstErrorRow = document.querySelector('[data-error-row="true"]');
      firstErrorRow?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setHeaderErrorRowIndex(null);

    setCreateModelError(null);
    setCreateModelSuccess(null);
    setSaveModelBusy(true);
    try {
      const description = modelDescriptionInput.trim();
      const displayName = modelDisplayNameInput.trim();
      const icon = modelIconInput.trim();
      const projectPath = resolveProjectPathForPayload();
      let method: 'POST' | 'PUT' = 'POST';
      let url = '/api/model-config-profiles';
      let payload: Record<string, unknown>;

      if (editingSourceId) {
        method = 'PUT';
        url = `/api/model-config-profiles/${encodeURIComponent(editingSourceId)}`;
        const mergedModels = resolveDraftModelNames();
        payload = {
          ...(displayName ? { displayName } : {}),
          description: description || null,
          ...(icon ? { icon } : {}),
          ...(modelUrlInput.trim() ? { baseUrl: modelUrlInput.trim() } : {}),
          ...(modelApiKeyInput.trim() ? { apiKey: modelApiKeyInput.trim() } : {}),
          ...(buildResult.headers ? { headers: buildResult.headers } : {}),
          models: mergedModels,
          ...(projectPath ? { projectPath } : {}),
        };
      } else {
        payload = {
          sourceId: generateModelConfigSourceId(),
          ...(displayName ? { displayName } : {}),
          ...(description ? { description } : {}),
          ...(icon ? { icon } : {}),
          ...(isHuaweiMaasAccessMode ? { accessMode: 'huawei_maas_access' as const } : {}),
          baseUrl: modelUrlInput.trim(),
          apiKey: modelApiKeyInput.trim(),
          ...(buildResult.headers ? { headers: buildResult.headers } : {}),
          models: [modelNameInput.trim()],
          ...(projectPath ? { projectPath } : {}),
        };
      }

      const res = await apiFetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `请求失败 (${res.status})`);
      }
      resetCreateModelForm();
      closeCreateModelModal();
      await fetchModels();
    } catch (error) {
      setCreateModelError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaveModelBusy(false);
    }
  };

  const handleTestConnection = async () => {
    const url = modelUrlInput.trim();
    const apiKey = modelApiKeyInput.trim();
    const modelName = modelNameInput.trim();
    if (!url || !apiKey) return;
    if (testingConnection) return;

    setTestingConnection(true);
    setCreateModelError(null);
    setCreateModelSuccess(null);

    const showToast = useToastStore.getState().addToast;

    try {
      const res = await apiFetch('/api/maas-test-connection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        suppressAuthRedirect: true,
        body: JSON.stringify({
          baseUrl: url,
          apiKey: apiKey,
          model: modelName || 'default',
        }),
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean };
      if (!res.ok || body.error) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      showToast({ type: 'success', title: '测试连接成功', message: '连接测试成功', duration: 3000 });
    } catch (error) {
      showToast({
        type: 'error',
        title: '测试连接失败',
        message: '请检查模型调用名称或者API Key填写是否正确',
        duration: 5000,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleModelIconUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
      const showToast = useToastStore.getState().addToast;
      showToast({
        type: 'error',
        title: '图标格式不支持',
        message: '仅支持 png、jpeg、jpg 格式图片',
        duration: 3000,
      });
      event.target.value = '';
      return;
    }

    if (file.size > MODEL_ICON_MAX_BYTES) {
      const showToast = useToastStore.getState().addToast;
      showToast({
        type: 'error',
        title: '图标文件过大',
        message: '图片大小不能超过 200KB',
        duration: 3000,
      });
      event.target.value = '';
      return;
    }

    setModelIconUploading(true);
    try {
      const uploaded = await uploadAvatarAsset(file);
      setModelIconInput(uploaded);
    } catch (error) {
      const showToast = useToastStore.getState().addToast;
      showToast({
        type: 'error',
        title: '图标上传失败',
        message: error instanceof Error ? error.message : '图标上传失败',
        duration: 3000,
      });
    } finally {
      setModelIconUploading(false);
      event.target.value = '';
    }
  };

  const handleAddHeaderRow = () => {
    // Before adding a new empty header row, validate existing rows.
    // If there are validation errors (empty key/value or duplicate keys),
    // show the first error and do not add a new row.
    const errors = validateHeaderRows(modelHeaderRows);
    const hasError = Array.from(errors.values()).some((err) => !!(err && (err.keyError || err.valueError)));
    if (hasError) {
      const firstErrorRow = document.querySelector('[data-error-row="true"]');
      firstErrorRow?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const nextRow = createEmptyHeaderRow();
    setModelHeaderRows((rows) => [...rows, nextRow]);
    validateHeaderRows([...modelHeaderRows, nextRow]);
  };

  const handleHeaderRowChange = (rowId: string, field: 'key' | 'value', value: string) => {
    const updatedRows = modelHeaderRows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row));
    setModelHeaderRows(updatedRows);
    validateHeaderRows(updatedRows);
  };

  const validateHeaderRows = (rows: HeaderInputRow[]) => {
    const newErrors = new Map<string, { keyError?: string; valueError?: string }>();
    const keyCountMap = new Map<string, number[]>();

    rows.forEach((row, index) => {
      const key = row.key.trim();
      const value = row.value.trim();
      const rowErrors: { keyError?: string; valueError?: string } = {};

      if (!key && !value) {
        newErrors.set(row.id, {});
        return;
      }

      if (!key && value) {
        rowErrors.keyError = '请填写键名';
      }

      if (key && !value) {
        rowErrors.valueError = '请填写值';
      }

      if (key) {
        const existing = keyCountMap.get(key) || [];
        existing.push(index);
        keyCountMap.set(key, existing);
      }

      if (Object.keys(rowErrors).length > 0) {
        newErrors.set(row.id, rowErrors);
      }
    });

    keyCountMap.forEach((indices, key) => {
      if (indices.length > 1) {
        indices.forEach((index) => {
          const rowId = rows[index].id;
          const existing = newErrors.get(rowId) || {};
          newErrors.set(rowId, { ...existing, keyError: `键名"${key}"重复` });
        });
      }
    });

    setHeaderRowErrors(newErrors);
    return newErrors;
  };

  const handleRemoveHeaderRow = (rowId: string) => {
    const updatedRows = modelHeaderRows.filter((row) => row.id !== rowId);
    setModelHeaderRows(updatedRows);
    validateHeaderRows(updatedRows);
  };

  return (
    <div className="ui-page-shell overflow-hidden">
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
            <Button
              onClick={() => handleOpenCreateModelModal('huawei-maas-access')}
              data-testid="models-open-huawei-maas-model-modal"
            >
              {HUAWEI_MAAS_ACCESS_LABEL}
            </Button>
          ) : null}
          {canCreateModel ? (
            <Button
              onClick={handleOpenCreateModelRiskGuard}
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
            onChange={(value) => setSearchQuery(value)}
            onClear={() => setSearchQuery('')}
            placeholder={SEARCH_PLACEHOLDER}
            clearAriaLabel="清除搜索"
          />
          <RefreshButton
            data-testid="models-refresh-button"
            onClick={() => void fetchModels()}
            disabled={loading}
          />
        </div>
      </section>

      <div className="flex-1 min-h-0 overflow-y-auto pb-2" data-testid="models-scroll-region">
        <div className="flex flex-col gap-4">
          {loading && (
            <div className="flex flex-1 min-h-0 items-center justify-center py-10" data-testid="models-loading-state">
              <CenteredLoadingState />
            </div>
          )}

          {showEmptyData && (
            <div className="flex flex-1 min-h-0 items-center justify-center py-10" data-testid="models-empty-state">
              <EmptyDataState title={EMPTY_STATE_TITLE} />
            </div>
          )}

          {showNoResults && (
            <div
              className="flex flex-1 min-h-0 items-center justify-center py-10"
              data-testid="models-no-results-state"
            >
              <NoSearchResultsState onClear={() => setSearchQuery('')} />
            </div>
          )}

          {showGroups &&
            groupedCards.map((group) => (
              <section key={group.key} className="space-y-3">
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">
                  {group.label} ({group.items.length})
                </h3>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((card) => {
                    const cardIconSrc = resolveUploadedIconUrl(card.icon);
                    const customModelUpdatedAt =
                      card.protocol !== 'huawei_maas' ? formatCustomModelUpdatedAt(card.updatedAt) : null;
                      return (
                      <article
                        key={card.id}
                        className={[
                          'ui-card',
                          group.key === 'huawei_maas' ? null : 'ui-card-hover',
                          'group flex min-h-[194px] flex-col gap-4',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <div>
                          <div className="flex items-start gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {cardIconSrc ? (
                              <img
                                src={cardIconSrc}
                                alt={`${card.name} icon`}
                                width={48}
                                height={48}
                                className="h-12 w-12 shrink-0 rounded-[var(radius-xs)] object-cover"
                                data-testid={`model-card-icon-${card.id}`}
                              />
                            ) : (
                              <div className="h-12 w-12 shrink-0 rounded-[var(radius-xs)]">
                                <NameInitialIcon
                                  name={card.name}
                                  dataTestId={`model-card-icon-${card.id}`}
                                  className="h-full w-full rounded-[var(--radius-md)] border-0 shadow-none"
                                />
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <OverflowTooltip
                                  content={card.name}
                                  className="min-w-0 flex-1"
                                  as="h4"
                                  textClassName="block truncate text-[var(--font-size-xl)] font-semibold text-[var(--text-primary)]"
                                />
                              </div>
                              {card.labels.length > 0 ? (
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  {card.labels.map((label, index) => (
                                    <span key={`${card.id}-label-${label}-${index}`} className="ui-badge-muted">
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <OverflowTooltip content={card.description} className="w-full">
                          <p className="text-[13px] min-h-[44px] leading-[22px] text-[var(--text-secondary)] line-clamp-2 break-all overflow-hidden">
                            {card.description || card.name}
                          </p>
                        </OverflowTooltip>

                        <div className="flex items-end justify-between gap-3">
                          <div className="min-h-5 text-xs leading-[24px]">
                            {card.protocol !== 'huawei_maas' ? (
                              <div className="relative">
                                <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)] transition-opacity duration-200 group-hover:opacity-0">
                                  {customModelUpdatedAt ? (
                                    <>
                                      <span
                                        className="inline-flex h-4 w-4 items-center justify-center"
                                        data-testid={`model-card-updated-at-icon-${card.id}`}
                                      >
                                        <ClockIcon />
                                      </span>
                                      <span data-testid={`model-card-updated-at-${card.id}`}>
                                        {customModelUpdatedAt}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={VENDOR_ICON}
                                        alt={`${card.developer} icon`}
                                        width={16}
                                        height={16}
                                        className="h-4 w-4 rounded-sm object-cover"
                                      />
                                      <span>{card.developer}</span>
                                    </>
                                  )}
                                </span>
                                <div className="absolute left-0 top-0 flex items-center whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                  <button
                                    type="button"
                                    data-testid={`model-card-edit-${card.id}`}
                                    disabled={editModelBusy}
                                    onClick={() => {
                                      void handleOpenEditModelModal(card);
                                    }}
                                    className="whitespace-nowrap text-[14px] font-bold leading-[24px] text-[var(--text-accent)] hover:underline hover:underline-offset-2 disabled:opacity-50"
                                    style={{ textUnderlineOffset: '4px' }}
                                  >
                                    编辑
                                  </button>
                                  <button
                                    type="button"
                                    disabled={deletingModelId === card.id}
                                    onClick={() => {
                                      void handleDeleteModel(card.id, card.name);
                                    }}
                                    data-testid={`model-card-delete-${card.id}`}
                                    className="ml-[24px] whitespace-nowrap text-[14px] font-bold leading-[24px] text-[var(--text-accent)] hover:underline hover:underline-offset-2 disabled:opacity-50"
                                    style={{ textUnderlineOffset: '4px' }}
                                  >
                                    {deletingModelId === card.id ? '删除中...' : DELETE_MODEL_LABEL}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={VENDOR_ICON}
                                  alt={`${card.developer} icon`}
                                  width={16}
                                  height={16}
                                  className="h-4 w-4 rounded-sm object-cover"
                                />
                                <span>{card.developer}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      </div>

      <AppModal
        open={showCreateModelRiskModal}
        onClose={closeCreateModelRiskModal}
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
            <Button
              variant="default"
              data-testid="models-create-model-risk-cancel"
              onClick={closeCreateModelRiskModal}
            >
              取消
            </Button>
            <Button
              data-testid="models-create-model-risk-confirm"
              onClick={handleAgreeCreateModelRisk}
            >
              我已同意
            </Button>
          </div>
        </div>
      </AppModal>

      {showCreateModelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-strong)] p-4"
          data-testid="models-create-model-modal"
        >
          <div className="relative flex w-[500px] max-h-[calc(100vh-4rem)] flex-col gap-5 overflow-hidden rounded-[8px] border border-[var(--modal-border)] bg-[var(--modal-surface)] p-6 shadow-[var(--modal-shadow)]">
            <button
              type="button"
              onClick={closeCreateModelModal}
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
                  onChange={(event) => setModelNameInput(event.target.value)}
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
                  onChange={(event) => setModelDescriptionInput(event.target.value)}
                  placeholder="请输入描述"
                  maxLength={500}
                  showCount
                  formatCount={(current, max) => `${current}/${max ?? 0}`}
                  className="h-[60px] min-h-[60px] w-full"
                />
              </div>
              <div className="hidden space-y-1">
                <p className="text-[12px] leading-[18px] text-[var(--modal-text)]">{'模型展示名称'}</p>
                <input
                  data-testid="models-create-model-display-name-input"
                  value={modelDisplayNameInput}
                  onChange={(event) => setModelDisplayNameInput(event.target.value)}
                  placeholder={'请输入模型展示名称'}
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
                        setModelIconInput(buildNameInitialIconDataUrl(modelNameInput, nextVariant));
                      }}
                      className="h-[28px] w-[28px] min-h-[28px] min-w-[28px] p-0"
                    >
                      <MaskIcon name="random" />
                    </button>
                  </div>
                </div>
                <div className="text-[12px] text-[var(--text-muted)]">
                  {modelIconUploading ? '图标上传中...' : '支持上传 png、jpeg、jpg 格式图片，限制 200KB 内'}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[12px] leading-[18px] text-[var(--modal-text)]">{'访问URL'}</p>
                <input
                  data-testid="models-create-model-url-input"
                  name="cc_model_base_url"
                  value={modelUrlInput}
                  onChange={(event) => setModelUrlInput(event.target.value)}
                  placeholder={'请输入访问URL'}
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
                <p className="text-[12px] leading-[18px] text-[var(--modal-text)]">{'API Key'}</p>
                <PasswordField
                  data-testid="models-create-model-api-key-input"
                  name="cc_model_api_key"
                  value={modelApiKeyInput}
                  onChange={(event) => setModelApiKeyInput(event.target.value)}
                  placeholder={'请输入API Key'}
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
                <p className="text-[12px] leading-[18px] text-[var(--modal-text)]">{'请求头（可选）'}</p>
                <div className="space-y-2">
                  {modelHeaderRows.map((row, index) => {
                    const rowErrors = headerRowErrors.get(row.id) || {};
                    return (
                      <div
                        key={row.id}
                        className={`flex flex-col gap-1`}
                        data-testid={`models-create-model-header-row-${index}`}
                        data-error-row={rowErrors.keyError || rowErrors.valueError ? 'true' : 'false'}
                      >
                        <div className="flex items-center gap-[4px]">
                          <input
                            type="text"
                            value={row.key}
                            onChange={(event) => handleHeaderRowChange(row.id, 'key', event.target.value)}
                            placeholder="请求头的键名"
                            className={`ui-input h-[28px] flex-1 ${
                              rowErrors.keyError
                                ? 'border-[var(--state-error-text)] bg-[var(--state-error-surface)]'
                                : ''
                            }`}
                            data-testid={`models-create-model-header-key-${index}`}
                          />
                          <input
                            type="text"
                            value={row.value}
                            onChange={(event) => handleHeaderRowChange(row.id, 'value', event.target.value)}
                            placeholder="请求头的值"
                            className={`ui-input h-[28px] flex-1 ${
                              rowErrors.valueError
                                ? 'border-[var(--state-error-text)] bg-[var(--state-error-surface)]'
                                : ''
                            }`}
                            data-testid={`models-create-model-header-value-${index}`}
                          />
                          <IconButton
                            label={`请求头 ${index + 1}`}
                            size="sm"
                            onClick={() => handleRemoveHeaderRow(row.id)}
                            className="text-[var(--icon-delete-color)] transition-colors hover:bg-[var(--modal-muted-surface-hover)]"
                            data-testid={`models-create-model-header-remove-${index}`}
                            icon={<MaskIcon name="delete" className="h-4 w-4" />}
                          />
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
                    onClick={handleAddHeaderRow}
                    className="group inline-flex items-center gap-[4px] leading-[18px] text-[12px] text-[var(--text-accent)]"
                    data-testid="models-create-model-header-add"
                  >
                    <MaskIcon name="add" className="h-4 w-4" />
                    <span className="inline-flex h-[18px] items-center border-b border-transparent transition-colors group-hover:border-current">
                      添加
                    </span>
                  </button>
                </div>
                {createModelError && createModelError.includes('请求头键名重复') ? (
                  <p className="mt-1 text-xs text-[var(--state-error-text)]">{createModelError}</p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button variant="default" onClick={closeCreateModelModal}>
                {CREATE_MODEL_CANCEL_LABEL}
              </Button>
              <Button
                variant="default"
                disabled={!canConfirmCreateModel || testingConnection || modelIconUploading || editModelBusy}
                onClick={handleTestConnection}
                data-testid="models-test-connection"
              >
                {testingConnection ? '测试中...' : TEST_CONNECTION_LABEL}
              </Button>
              <Button
                disabled={!canConfirmCreateModel || saveModelBusy || modelIconUploading || editModelBusy}
                onClick={handleCreateModel}
                data-testid="models-create-model-confirm"
              >
                {saveModelBusy ? '保存中...' : SAVE_MODEL_LABEL}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showAddModelModal && (
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
                  setCreateError(null);
                  setShowAddModelModal(false);
                }}
                className="rounded-lg border border-[var(--button-default-border)] bg-[var(--button-default-bg)] px-3 py-1.5 text-xs font-medium text-[var(--button-default-text)] transition-colors hover:border-[var(--button-default-border-hover)] hover:bg-[var(--button-default-bg-hover)] hover:text-[var(--button-default-text-hover)]"
              >
                关闭
              </button>
            </div>
            <ModelsCreateModelConfigSource
              projectPath={currentProjectPath && currentProjectPath !== 'default' ? currentProjectPath : null}
              error={createError}
              onError={setCreateError}
              onCreated={async () => {
                setCreateError(null);
                await fetchModels();
                setShowAddModelModal(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function parseHeadersJson(value: string): Record<string, string> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Headers 必须是 JSON 对象');
  }
  const entries = Object.entries(parsed).map(([key, rawValue]) => {
    const normalizedKey = key.trim();
    const normalizedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!normalizedKey || !normalizedValue) {
      throw new Error('Headers 的 key 和 value 都必须是非空字符串');
    }
    return [normalizedKey, normalizedValue] as const;
  });
  return Object.fromEntries(entries);
}

function generateHeaderRowId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (typeof uuid === 'string' && uuid.trim()) {
    return uuid;
  }
  return `hdr-${Math.random().toString(16).slice(2, 10)}`;
}

function createEmptyHeaderRow(): HeaderInputRow {
  return { id: generateHeaderRowId(), key: '', value: '' };
}

function headersObjectToRows(headers?: Record<string, string> | null): HeaderInputRow[] {
  if (!headers) return [];
  return Object.entries(headers).map(([key, value]) => ({
    id: generateHeaderRowId(),
    key,
    value,
  }));
}

type BuildHeadersResult = {
  headers: Record<string, string> | null;
  errorIndex: number | null;
  errorMessage: string | null;
};

function buildHeadersObject(rows: HeaderInputRow[]): BuildHeadersResult {
  const normalizedEntries: Array<readonly [string, string]> = [];
  const rowIndexMap: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key && !value) continue;
    if (!key || !value) {
      return {
        headers: null,
        errorIndex: i,
        errorMessage: `请求头的键名和值都必须填写`,
      };
    }
    normalizedEntries.push([key, value] as const);
    rowIndexMap.push(i);
  }

  if (normalizedEntries.length === 0) return { headers: null, errorIndex: null, errorMessage: null };

  const duplicatedIndex = normalizedEntries.findIndex(
    ([key], idx) => normalizedEntries.findIndex(([k]) => k === key) !== idx,
  );
  if (duplicatedIndex !== -1) {
    return {
      headers: null,
      errorIndex: rowIndexMap[duplicatedIndex],
      errorMessage: `请求头键名重复：${normalizedEntries[duplicatedIndex][0]}`,
    };
  }

  return { headers: Object.fromEntries(normalizedEntries), errorIndex: null, errorMessage: null };
}

function generateModelConfigSourceId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (typeof uuid === 'string' && uuid.trim()) {
    return uuid.replace(/-/g, '').slice(0, 8);
  }
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
}

function ModelsCreateModelConfigSource({
  projectPath,
  error,
  onError,
  onCreated,
}: {
  projectPath: string | null;
  error: string | null;
  onError: (value: string | null) => void;
  onCreated: () => Promise<void>;
}) {
  const [sourceId, setSourceId] = useState(() => generateModelConfigSourceId());
  const [displayName, setDisplayName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [probeBusy, setProbeBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canCreate =
    displayName.trim().length > 0 && baseUrl.trim().length > 0 && apiKey.trim().length > 0 && models.length > 0;

  const reset = () => {
    setSourceId(generateModelConfigSourceId());
    setDisplayName('');
    setBaseUrl('');
    setApiKey('');
    setHeadersText('');
    setModels([]);
  };

  return (
    <div className="space-y-3">
      {error ? <p className="ui-status-error rounded-lg px-3 py-2 text-sm">{error}</p> : null}
      <select
        value="openai"
        disabled
        aria-label="协议"
        className="w-full rounded border border-[var(--overlay-disabled-border)] bg-[var(--overlay-disabled-bg)] px-3 py-2 text-sm text-[var(--overlay-disabled-text)]"
      >
        <option value="openai">OpenAI</option>
      </select>
      <input
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder="显示名称，如 My OpenAI Proxy"
        autoComplete="off"
        className="ui-input w-full"
      />
      <input
        value={baseUrl}
        onChange={(event) => setBaseUrl(event.target.value)}
        placeholder="Base URL，如 https://api.example.com/v1"
        autoComplete="off"
        className="ui-input w-full"
      />
      <PasswordField
        autoComplete="off"
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        placeholder="API Key"
        className="ui-input w-full rounded px-3 py-2 text-sm"
        toggleTestId="models-create-source-api-key-toggle"
      />
      <Textarea
        value={headersText}
        onChange={(event) => setHeadersText(event.target.value)}
        rows={4}
        placeholder={'可选请求头(JSON)，如 {"X-App-Id":"my-app"}'}
        useDefaultContainerStyles={false}
        useDefaultTextareaStyles={false}
        className="ui-textarea w-full rounded px-3 py-2 text-sm"
      />
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--modal-text-muted)]">可用模型 *</p>
        <TagEditor
          tags={models}
          tone="purple"
          addLabel="+ 添加模型"
          placeholder="输入模型名，如 gpt-4o-mini"
          emptyLabel="(至少添加 1 个模型)"
          onChange={setModels}
          minCount={0}
        />
      </div>
      {successMessage ? (
        <p className="ui-status-success rounded-lg px-3 py-2 text-sm">{successMessage}</p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={saveBusy || !canCreate}
          onClick={async () => {
            onError(null);
            setSuccessMessage(null);
            setSaveBusy(true);
            try {
              const headers = parseHeadersJson(headersText);
              const res = await apiFetch('/api/model-config-profiles', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  ...(projectPath ? { projectPath } : {}),
                  sourceId: sourceId.trim(),
                  displayName: displayName.trim(),
                  baseUrl: baseUrl.trim(),
                  apiKey: apiKey.trim(),
                  ...(headers ? { headers } : {}),
                  models,
                }),
              });
              const body = (await res.json().catch(() => ({}))) as { error?: string };
              if (!res.ok) {
                throw new Error(body.error ?? `请求失败 (${res.status})`);
              }
              reset();
              await onCreated();
            } catch (createError) {
              onError(createError instanceof Error ? createError.message : String(createError));
            } finally {
              setSaveBusy(false);
            }
          }}
          className="rounded bg-[var(--button-primary-bg)] px-3 py-1.5 text-xs font-medium text-[var(--button-primary-text)] transition-colors hover:bg-[var(--button-primary-bg-hover)] hover:text-[var(--button-primary-text-hover)] disabled:bg-[var(--button-disabled-bg)] disabled:text-[var(--button-disabled-text)] disabled:opacity-50"
        >
          {saveBusy ? '保存中...' : SAVE_MODEL_LABEL}
        </button>
      </div>
    </div>
  );
}
