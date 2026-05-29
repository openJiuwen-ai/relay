/*
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

'use client';

import { useCallback, useState } from 'react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useConfirm } from '@/components/useConfirm';
import { apiFetch } from '@/utils/api-client';
import { useChatStore } from '@/stores/chatStore';
import { CenteredLoadingState } from '@/components/shared/CenteredLoadingState';
import { EmptyDataState } from '@/components/shared/EmptyDataState';
import { NoSearchResultsState } from '@/components/shared/NoSearchResultsState';
import { hasCreateModelRiskAgreed, markCreateModelRiskAgreed, EMPTY_STATE_TITLE, HUAWEI_MAAS_ACCESS_MODAL_MODE } from './utils';
import { useModelsPanelData } from './hooks/useModelsPanelData';
import { useCreateModelForm } from './hooks/useCreateModelForm';
import { useAddModelForm } from './hooks/useAddModelForm';
import { ModelsToolbar } from './components/ModelsToolbar';
import { ModelGroupSection } from './components/ModelGroupSection';
import { CreateModelModal } from './components/CreateModelModal';
import { CreateModelRiskModal } from './components/CreateModelRiskModal';
import { AddModelModal } from './components/AddModelModal';
import type { ModelCardData } from './types/models-panel';

export function ModelsPanel() {
  const confirm = useConfirm();
  const currentProjectPath = useChatStore((s) => s.currentProjectPath);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [showAddModelModal, setShowAddModelModal] = useState(false);

  const modelsData = useModelsPanelData();
  const fetchModels = modelsData.fetchModels;
  const createForm = useCreateModelForm(modelsData.resolvedProjectPath, fetchModels);

  const addModelForm = useAddModelForm(
    currentProjectPath && currentProjectPath !== 'default' ? currentProjectPath : null,
    async () => {
      await fetchModels();
      setShowAddModelModal(false);
    },
    () => {}, // error handled internally by form
  );

  const handleDeleteModel = useCallback(
    async (cardId: string, cardName: string) => {
      if (deletingModelId) return;
      const ok = await confirm({
        title: '删除模型',
        message: `确认删除模型"${cardName || cardId}"？此操作不可恢复。`,
        confirmLabel: '删除',
        cancelLabel: '取消',
        variant: 'default',
      });
      if (!ok) return;
      setDeletingModelId(cardId);
      try {
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

  const handleOpenCreateModelRiskGuard = useCallback(() => {
    if (hasCreateModelRiskAgreed()) {
      createForm.openModal('default');
      return;
    }
    createForm.openRiskModal();
  }, [createForm]);

  useEscapeKey({
    enabled: createForm.showModal || createForm.showRiskModal,
    onEscape: () => {
      if (createForm.showRiskModal) {
        createForm.closeRiskModal();
        return;
      }
      createForm.closeModal();
    },
  });

  return (
    <div className="ui-page-shell overflow-hidden">
      <ModelsToolbar
        loading={modelsData.loading}
        isSkipAuth={modelsData.isSkipAuth}
        canCreateModel={modelsData.canCreateModel}
        searchQuery={modelsData.searchQuery}
        onSearchChange={modelsData.setSearchQuery}
        onRefresh={() => void modelsData.fetchModels()}
        onOpenCreateModel={handleOpenCreateModelRiskGuard}
        onOpenHuaweiMaasAccess={() => createForm.openModal(HUAWEI_MAAS_ACCESS_MODAL_MODE)}
      />

      <div className="flex-1 min-h-0 overflow-y-auto pb-2" data-testid="models-scroll-region">
        <div className="flex flex-col gap-4 h-full">
          {modelsData.loading && (
            <div className="flex flex-1 min-h-0 items-center justify-center py-10" data-testid="models-loading-state">
              <CenteredLoadingState />
            </div>
          )}

          {modelsData.showEmptyData && (
            <div className="flex flex-1 min-h-0 items-center justify-center py-10" data-testid="models-empty-state">
              <EmptyDataState title={EMPTY_STATE_TITLE} />
            </div>
          )}

          {modelsData.showNoResults && (
            <div className="flex flex-1 min-h-0 items-center justify-center py-10" data-testid="models-no-results-state">
              <NoSearchResultsState onClear={() => modelsData.setSearchQuery('')} />
            </div>
          )}

          {modelsData.showGroups &&
            modelsData.groupedCards.map((group) => (
              <ModelGroupSection
                key={group.key}
                group={group}
                deletingModelId={deletingModelId}
                editModelBusy={createForm.editModelBusy}
                onEdit={(card: ModelCardData) => void createForm.handleOpenEditModelModal(card)}
                onDelete={handleDeleteModel}
              />
            ))}
        </div>
      </div>

      <CreateModelRiskModal
        show={createForm.showRiskModal}
        onClose={createForm.closeRiskModal}
        onAgree={() => {
          markCreateModelRiskAgreed();
          createForm.handleAgreeRisk();
        }}
      />

      <CreateModelModal
        show={createForm.showModal}
        onClose={createForm.closeModal}
        modalMode={createForm.modalMode}
        isEditMode={createForm.isEditMode}
        modelNameInput={createForm.modelNameInput}
        onModelNameChange={createForm.setModelNameInput}
        modelDescriptionInput={createForm.modelDescriptionInput}
        onModelDescriptionChange={createForm.setModelDescriptionInput}
        modelIconInput={createForm.modelIconInput}
        onModelIconChange={createForm.setModelIconInput}
        modelDisplayNameInput={createForm.modelDisplayNameInput}
        onModelDisplayNameChange={createForm.setModelDisplayNameInput}
        modelUrlInput={createForm.modelUrlInput}
        onModelUrlChange={createForm.setModelUrlInput}
        modelApiKeyInput={createForm.modelApiKeyInput}
        onModelApiKeyChange={createForm.setModelApiKeyInput}
        headerRows={createForm.headerRows}
        headerRowErrors={createForm.headerRowErrors}
        headerErrorRowIndex={createForm.headerErrorRowIndex}
        onAddHeaderRow={createForm.handleAddHeaderRow}
        onHeaderRowChange={createForm.handleHeaderRowChange}
        onRemoveHeaderRow={createForm.handleRemoveHeaderRow}
        isModelNameValid={createForm.isModelNameValid}
        showModelNameValidationError={createForm.showModelNameValidationError}
        canConfirm={createForm.canConfirm}
        createError={createForm.createError}
        saveModelBusy={createForm.saveModelBusy}
        testingConnection={createForm.saveModelBusy}
        editModelBusy={createForm.editModelBusy}
        onCreate={() => void createForm.handleCreateModel()}
        onTestConnection={() => void createForm.handleTestConnection()}
      />

      <AddModelModal
        show={showAddModelModal}
        onClose={() => {
          addModelForm.reset();
          setShowAddModelModal(false);
        }}
        form={addModelForm}
      />
    </div>
  );
}