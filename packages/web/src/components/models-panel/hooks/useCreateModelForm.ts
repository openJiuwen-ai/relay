/*
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { useCallback, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import {
  buildHeadersObject,
  DEFAULT_MODEL_ICON_SRC,
  generateModelConfigSourceId,
  HUAWEI_MAAS_ACCESS_URL,
  isValidModelName,
  HUAWEI_MAAS_ACCESS_MODE,
  HUAWEI_MAAS_ACCESS_MODAL_MODE,
} from '../utils';
import { useHeaderRowsEditor } from './useHeaderRowsEditor';
import type { CreateModelModalMode, HeaderInputRow, ModelCardData, ModelConfigProviderItem } from '../types/models-panel';

export interface UseCreateModelFormResult {
  // Modal state
  showModal: boolean;
  openModal: (mode?: CreateModelModalMode) => void;
  closeModal: () => void;
  modalMode: CreateModelModalMode;

  // Form fields
  modelNameInput: string;
  setModelNameInput: (value: string) => void;
  modelDescriptionInput: string;
  setModelDescriptionInput: (value: string) => void;
  modelIconInput: string;
  setModelIconInput: (value: string) => void;
  modelDisplayNameInput: string;
  setModelDisplayNameInput: (value: string) => void;
  modelUrlInput: string;
  setModelUrlInput: (value: string) => void;
  modelApiKeyInput: string;
  setModelApiKeyInput: (value: string) => void;

  // Header rows
  headerRows: HeaderInputRow[];
  headerRowErrors: Map<string, { keyError?: string; valueError?: string }>;
  headerErrorRowIndex: number | null;
  handleAddHeaderRow: () => void;
  handleHeaderRowChange: (rowId: string, field: 'key' | 'value', value: string) => void;
  handleRemoveHeaderRow: (rowId: string) => void;

  // Validation
  isModelNameValid: boolean;
  showModelNameValidationError: boolean;
  canConfirm: boolean;

  // Edit mode
  isEditMode: boolean;
  editingSourceId: string | null;
  editingOriginalModelName: string | null;
  editingSourceModels: string[];
  editModelBusy: boolean;
  handleOpenEditModelModal: (card: ModelCardData) => Promise<void>;

  // Actions
  createError: string | null;
  createModelSuccess: string | null;
  saveModelBusy: boolean;
  handleCreateModel: () => Promise<void>;
  handleTestConnection: () => Promise<void>;

  // Risk modal
  showRiskModal: boolean;
  openRiskModal: () => void;
  closeRiskModal: () => void;
  handleAgreeRisk: () => void;

  // Utils
  resolveProjectPathForPayload: () => string | undefined;
}

export function useCreateModelForm(
  resolvedProjectPath: string | null,
  fetchModels: () => Promise<void>,
): UseCreateModelFormResult {
  const currentProjectPath = useChatStore((s) => s.currentProjectPath);

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<CreateModelModalMode>('default');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createModelSuccess, setCreateModelSuccess] = useState<string | null>(null);
  const [saveModelBusy, setSaveModelBusy] = useState(false);

  const [modelNameInput, setModelNameInput] = useState('');
  const [modelDescriptionInput, setModelDescriptionInput] = useState('');
  const [modelIconInput, setModelIconInput] = useState('');
  const [modelDisplayNameInput, setModelDisplayNameInput] = useState('');
  const [modelUrlInput, setModelUrlInput] = useState('');
  const [modelApiKeyInput, setModelApiKeyInput] = useState('');

  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingOriginalModelName, setEditingOriginalModelName] = useState<string | null>(null);
  const [editingSourceModels, setEditingSourceModels] = useState<string[]>([]);
  const [editModelBusy, setEditModelBusy] = useState(false);

  const [showRiskModal, setShowRiskModal] = useState(false);

  const headerEditor = useHeaderRowsEditor();

  const isEditMode = Boolean(editingSourceId);
  const isHuaweiMaasAccessMode = modalMode === HUAWEI_MAAS_ACCESS_MODAL_MODE;

  const resolveProjectPathForPayload = useCallback(
    () => resolvedProjectPath || (currentProjectPath && currentProjectPath !== 'default' ? currentProjectPath : undefined),
    [resolvedProjectPath, currentProjectPath],
  );

  const trimmedModelName = modelNameInput.trim();
  const isModelNameValid =
    trimmedModelName.length >= 2 && trimmedModelName.length <= 64 && isValidModelName(trimmedModelName);
  const showModelNameValidationError = trimmedModelName.length > 0 && !isModelNameValid;
  const canConfirm = isEditMode
    ? isModelNameValid
    : isModelNameValid && modelUrlInput?.trim().length > 0 && modelApiKeyInput?.trim().length > 0;

  const resetForm = useCallback((mode: CreateModelModalMode = 'default') => {
    setModelNameInput('');
    setModelDescriptionInput('');
    setModelIconInput(DEFAULT_MODEL_ICON_SRC);
    setModelDisplayNameInput('');
    setModelUrlInput(mode === HUAWEI_MAAS_ACCESS_MODAL_MODE ? HUAWEI_MAAS_ACCESS_URL : '');
    setModelApiKeyInput('');
    headerEditor.resetRows();
  }, [headerEditor]);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setModalMode('default');
    setCreateError(null);
    setCreateModelSuccess(null);
    setEditingSourceId(null);
    setEditingOriginalModelName(null);
    setEditingSourceModels([]);
    headerEditor.clearErrors();
  }, [headerEditor]);

  const openModal = useCallback((mode: CreateModelModalMode = 'default') => {
    resetForm(mode);
    setModalMode(mode);
    setEditingSourceId(null);
    setEditingOriginalModelName(null);
    setEditingSourceModels([]);
    setCreateError(null);
    headerEditor.clearErrors();
    setCreateModelSuccess(null);
    setShowModal(true);
  }, [resetForm, headerEditor]);

  const openRiskModal = useCallback(() => {
    setShowRiskModal(true);
  }, []);

  const closeRiskModal = useCallback(() => {
    setShowRiskModal(false);
  }, []);

  const handleAgreeRisk = useCallback(() => {
    setShowRiskModal(false);
    openModal('default');
  }, [openModal]);

  const resolveDraftModelNames = useCallback(() => {
    if (!editingSourceId) return [modelNameInput.trim()].filter(Boolean);
    const nextModel = modelNameInput.trim();
    const previousModel = editingOriginalModelName?.trim() || '';
    const sourceModels =
      editingSourceModels.length > 0 ? [...editingSourceModels] : previousModel ? [previousModel] : [];
    const replacedModels = sourceModels.map((name) => (name === previousModel ? nextModel : name));
    return Array.from(
      new Set((replacedModels.length > 0 ? replacedModels : [nextModel]).map((name) => name.trim()).filter(Boolean)),
    );
  }, [editingSourceId, modelNameInput, editingOriginalModelName, editingSourceModels]);

  const handleCreateModel = useCallback(async () => {
    if (!canConfirm || saveModelBusy) return;

    const buildResult = buildHeadersObject(headerEditor.rows);
    if (buildResult.errorIndex !== null || buildResult.errorMessage) {
      headerEditor.setErrorRowIndex(buildResult.errorIndex);
      headerEditor.validateRows(headerEditor.rows);
      return;
    }
    headerEditor.setErrorRowIndex(null);

    setCreateError(null);
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
          ...(isHuaweiMaasAccessMode ? { accessMode: HUAWEI_MAAS_ACCESS_MODE } : {}),
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
      resetForm();
      closeModal();
      await fetchModels();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaveModelBusy(false);
    }
  }, [
    canConfirm,
    saveModelBusy,
    headerEditor,
    modelDescriptionInput,
    modelDisplayNameInput,
    modelIconInput,
    modelUrlInput,
    modelApiKeyInput,
    editingSourceId,
    resolveDraftModelNames,
    isHuaweiMaasAccessMode,
    modelNameInput,
    resolveProjectPathForPayload,
    resetForm,
    closeModal,
    fetchModels,
  ]);

  const handleTestConnection = useCallback(async () => {
    const url = modelUrlInput.trim();
    const apiKey = modelApiKeyInput.trim();
    const modelName = modelNameInput.trim();
    if (!url || !apiKey) return;

    setSaveModelBusy(true);
    setCreateError(null);
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
    } catch {
      showToast({
        type: 'error',
        title: '测试连接失败',
        message: '请检查模型调用名称或者API Key填写是否正确',
        duration: 5000,
      });
    } finally {
      setSaveModelBusy(false);
    }
  }, [modelUrlInput, modelApiKeyInput, modelNameInput]);

  const handleOpenEditModelModal = useCallback(async (card: ModelCardData) => {
    const sourceId = resolveModelConfigSourceId(card.id);
    if (!sourceId || editModelBusy) return;

    resetForm('default');
    setModalMode(card.accessMode === HUAWEI_MAAS_ACCESS_MODE || card.baseUrl?.includes('modelarts-maas') ? HUAWEI_MAAS_ACCESS_MODAL_MODE : 'default');
    setCreateError(null);
    setCreateModelSuccess(null);
    setEditModelBusy(true);
    headerEditor.clearErrors();

    try {
      const projectPath = resolveProjectPathForPayload();
      const query = new URLSearchParams();
      if (projectPath) query.set('projectPath', projectPath);
      const queryText = query.toString();
      const apiUrl = `/api/model-config-profiles${queryText ? `?${queryText}` : ''}`;
      const res = await apiFetch(apiUrl);
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
      headerEditor.setRowsFromHeaders(provider?.headers);
      setShowModal(true);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
    } finally {
      setEditModelBusy(false);
    }
  }, [editModelBusy, resetForm, headerEditor, resolveProjectPathForPayload]);

  return {
    showModal,
    openModal,
    closeModal,
    modalMode,

    modelNameInput,
    setModelNameInput,
    modelDescriptionInput,
    setModelDescriptionInput,
    modelIconInput,
    setModelIconInput,
    modelDisplayNameInput,
    setModelDisplayNameInput,
    modelUrlInput,
    setModelUrlInput,
    modelApiKeyInput,
    setModelApiKeyInput,

    headerRows: headerEditor.rows,
    headerRowErrors: headerEditor.rowErrors,
    headerErrorRowIndex: headerEditor.errorRowIndex,
    handleAddHeaderRow: headerEditor.handleAddRow,
    handleHeaderRowChange: headerEditor.handleRowChange,
    handleRemoveHeaderRow: headerEditor.handleRemoveRow,

    isModelNameValid,
    showModelNameValidationError,
    canConfirm,

    isEditMode,
    editingSourceId,
    editingOriginalModelName,
    editingSourceModels,
    editModelBusy,
    handleOpenEditModelModal,

    createError,
    createModelSuccess,
    saveModelBusy,
    handleCreateModel,
    handleTestConnection,

    showRiskModal,
    openRiskModal,
    closeRiskModal,
    handleAgreeRisk,

    resolveProjectPathForPayload,
  };
}

// Helper function (imported from utils but needs local binding for edit modal)
function resolveModelConfigSourceId(cardId: string): string | null {
  if (!cardId.startsWith('model_config:')) return null;
  const parts = cardId.split(':');
  if (parts.length < 3) return null;
  const sourceId = parts[1]?.trim();
  return sourceId ? sourceId : null;
}