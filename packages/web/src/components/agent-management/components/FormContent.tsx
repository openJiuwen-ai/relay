/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { AgentData } from '@/hooks/useAgentData';
import type { FormStepId } from '../constants';
import {
  buildGeneratedAvatarDataUrl,
  getRandomPresetAvatar,
  resolveInitialAvatar,
  isDuplicateNameErrorMessage,
} from '../utils';
import { AGENT_NAME_VALIDATION_MESSAGE, DEFAULT_PRESET_AVATAR } from '../constants';
import { apiFetch } from '@/utils/api-client';
import { normalizeAgentSaveErrorMessage } from '@/utils/agent-save-error';
import { buildAgentPayload } from '../../hub-agent-editor.payload';
import type { HubAgentEditorFormState } from '../../hub-agent-editor.model';
import type { CreateModelOption } from '../types';
import { BasicInfoSection } from './BasicInfoSection';
import { FormFooter } from './FormFooter';
import { FormHeader } from './FormHeader';
import { FormSkillsSection, type SkillBasicInfo } from './FormSkillsSection';
import { FormSoulSection } from './FormSoulSection';
import { FormStepNav } from './FormStepNav';
import { useFormStepScroll } from '../hooks/useFormStepScroll';
import { useModelMenu } from '../hooks/useModelMenu';
import { useModelSelection, normalizeInitialModelName } from '../hooks/useModelSelection';
import { useAvatarUpload } from '../hooks/useAvatarUpload';

interface FormContentProps {
  editingAgent?: AgentData | null;
  formMode: 'create' | 'edit';
  prefillData?: Partial<AgentData> | null;
  onCancel: () => void;
  onSaveSuccess: () => void;
  onBackToDetail: () => void;
  onBackToList: () => void;
}

function autoSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')
    .slice(0, 40);
}

function validateAgentName(name: string): string | null {
  if (!name) return AGENT_NAME_VALIDATION_MESSAGE;
  if (name !== name.trim()) return AGENT_NAME_VALIDATION_MESSAGE;
  if (name.length < 2 || name.length > 64) return AGENT_NAME_VALIDATION_MESSAGE;
  if (!/^[\u4e00-\u9fffA-Za-z0-9 _-]+$/.test(name)) return AGENT_NAME_VALIDATION_MESSAGE;
  return null;
}

function generateRandomAgentId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `agent-${timestamp}${random}`.slice(0, 64);
}

const DEFAULT_ROLE_DESCRIPTION = '通用智能体助手';

export function FormContent({ editingAgent, formMode, prefillData, onCancel, onSaveSuccess, onBackToDetail, onBackToList }: FormContentProps) {
  const [draftName, setDraftName] = useState(editingAgent?.displayName ?? prefillData?.displayName ?? 'BOT');
  const [draftDescription, setDraftDescription] = useState(editingAgent?.roleDescription ?? prefillData?.roleDescription ?? '');
  const [draftAvatar, setDraftAvatar] = useState<string>(
    editingAgent ? resolveInitialAvatar(editingAgent) : prefillData?.avatar ?? DEFAULT_PRESET_AVATAR,
  );
  const [draftDefaultModel, setDraftDefaultModel] = useState(normalizeInitialModelName(editingAgent?.defaultModel ?? prefillData?.defaultModel));
  const [activeWorkingDraft, setActiveWorkingDraft] = useState(editingAgent?.personality ?? prefillData?.personality ?? '');
  const [isManualOperating, setIsManualOperating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [nameSubmitError, setNameSubmitError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  const [draftSkills, setDraftSkills] = useState<string[]>(editingAgent?.skills ?? prefillData?.skills ?? []);
  const [draftSkillBasicInfos, setDraftSkillBasicInfos] = useState<Map<string, SkillBasicInfo>>(new Map());
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [agentId] = useState(() => editingAgent?.id ?? generateRandomAgentId());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const basicRef = useRef<HTMLDivElement>(null);
  const soulRef = useRef<HTMLDivElement | null>(null);
  const skillsRef = useRef<HTMLDivElement | null>(null);

  const nameError = useMemo(() => validateAgentName(draftName), [draftName]);
  const inlineNameError = nameError ?? nameSubmitError;
  const isConfirmDisabled = Boolean(inlineNameError) || saving;
  const displayAvatar = draftAvatar ? draftAvatar : buildGeneratedAvatarDataUrl(draftName || '智');

  const stepRefs: Record<FormStepId, React.RefObject<HTMLElement | null>> = {
    basic: basicRef,
    soul: soulRef,
    skills: skillsRef,
  };

  const { handleStepClick } = useFormStepScroll({
    scrollContainerRef,
    stepRefs,
    isManualOperating,
    setIsManualOperating,
  });

  const editingAccountRef = editingAgent?.accountRef ?? editingAgent?.providerProfileId ?? null;
  const {
    models: marketplaceModels,
    loading: loadingModels,
    selectedModel,
    missingModel,
    onSelectModel: onModelSelect,
    resolveForSave,
  } =
    useModelSelection({
      editingDefaultModel: editingAgent?.defaultModel,
      editingAccountRef,
      defaultToFirstModel: formMode === 'create',
    });

  const modelGroups = useMemo(() => {
    if (marketplaceModels.length === 0) return [];

    const groups: Array<{ id: string; label: string; items: CreateModelOption[] }> = [];
    const huaweiModels: CreateModelOption[] = [];
    const thirdPartyModels: CreateModelOption[] = [];

    for (const model of marketplaceModels) {
      if (model.groupId === 'huawei-maas') {
        huaweiModels.push(model);
      } else {
        thirdPartyModels.push(model);
      }
    }

    if (huaweiModels.length > 0) {
      groups.push({ id: 'huawei-maas', label: '华为云 MaaS', items: huaweiModels });
    }
    if (thirdPartyModels.length > 0) {
      groups.push({ id: 'third-party', label: '第三方模型', items: thirdPartyModels });
    }

    return groups;
  }, [marketplaceModels]);

  const { modelMenuPosition, openAbove } = useModelMenu({
    modelGroupCount: modelGroups.length,
    modelItemCount: modelGroups.reduce((total, group) => total + group.items.length, 0),
    modelMenuOpen,
    modelMenuRef,
    modelTriggerRef,
    onClose: () => setModelMenuOpen(false),
  });

  const { uploading: uploadingAvatar, error: avatarError, handleUpload: handleAvatarUpload } = useAvatarUpload({
    onSuccess: (url) => setDraftAvatar(url),
  });

  const onSelectModel = useCallback(
    (modelId: string) => {
      onModelSelect(modelId);
      const selected = marketplaceModels.find((item) => item.id === modelId);
      setDraftDefaultModel(selected?.model ?? normalizeInitialModelName(modelId));
      setModelError(null);
      setModelMenuOpen(false);
    },
    [onModelSelect, marketplaceModels],
  );

  const handleSave = useCallback(async () => {
    if (nameError) {
      return;
    }

    setSaving(true);
    setGlobalError(null);
    setModelError(null);

    try {
      const resolved = resolveForSave();
      const resolvedAccountRef = resolved?.accountRef ?? editingAccountRef ?? '';
      const resolvedModel = resolved?.model ?? selectedModel?.model ?? draftDefaultModel;
      if (!resolvedModel) {
        setModelError('请选择一个模型');
        return;
      }
      const safeName = draftName.trim();
      const safeDescription =
        draftDescription.trim() || (formMode === 'create' ? DEFAULT_ROLE_DESCRIPTION : editingAgent?.roleDescription ?? '');
      const mentionSeed = autoSlug(safeName) || agentId;
      const formState: HubAgentEditorFormState = {
        agentId,
        name: safeName,
        displayName: safeName,
        nickname: '',
        avatar: draftAvatar,
        colorPrimary: '#9B7EBD',
        colorSecondary: '#E8DFF5',
        mentionPatterns: `@${mentionSeed}`,
        roleDescription: safeDescription,
        personality: activeWorkingDraft,
        teamStrengths: '',
        caution: '',
        strengths: '',
        client: selectedModel?.client ?? 'relayclaw',
        accountRef: resolvedAccountRef,
        defaultModel: resolvedModel,
        commandArgs: '',
        cliConfigArgs: [],
        ocProviderName: '',
        embeddedAcpExecutablePath: '',
        embeddedAcpArgs: '',
        embeddedAcpCwd: '',
        embeddedAcpEnvText: '',
        sessionChain: 'true',
        maxPromptTokens: '',
        maxContextTokens: '',
        maxMessages: '',
        maxContentLengthPerMsg: '',
        ...(prefillData?.creationSource ? { creationSource: prefillData.creationSource } : {}),
      };
      const payload = buildAgentPayload(formState, editingAgent ?? null);
      payload.skills = draftSkills;

      const method = formMode === 'edit' && editingAgent ? 'PATCH' : 'POST';
      const url = formMode === 'edit' && editingAgent ? `/api/agents/${editingAgent.id}` : '/api/agents';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({}))) as { error?: string };
        const nextError = normalizeAgentSaveErrorMessage(error.error) ?? (formMode === 'edit' ? '保存失败' : '创建失败');
        if (nextError === '模型不存在，请重新选择') {
          setModelError(nextError);
          return;
        }
        if (isDuplicateNameErrorMessage(nextError)) {
          setNameSubmitError(nextError);
          return;
        }
        throw new Error(nextError);
      }

      onSaveSuccess();
    } catch (err) {
      const nextError =
        normalizeAgentSaveErrorMessage(err instanceof Error ? err.message : null) ?? (formMode === 'edit' ? '保存失败' : '创建失败');
      if (nextError === '模型不存在，请重新选择') setModelError(nextError);
      else if (isDuplicateNameErrorMessage(nextError)) setNameSubmitError(nextError);
      else setGlobalError(nextError);
    } finally {
      setSaving(false);
    }
  }, [
    draftName,
    draftDescription,
    draftDefaultModel,
    draftAvatar,
    draftSkills,
    activeWorkingDraft,
    formMode,
    editingAgent,
    editingAccountRef,
    nameError,
    agentId,
    prefillData,
    resolveForSave,
    selectedModel,
    onSaveSuccess,
  ]);

  const displayName = editingAgent?.displayName ?? prefillData?.displayName ?? '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid min-h-full w-full max-w-[1480px] grid-cols-[minmax(112px,132px)_minmax(0,1092px)_minmax(112px,132px)] gap-x-8 px-6 pb-6 lg:px-8">
          <div className="sticky top-0 z-10 row-span-2 min-w-0 self-start justify-self-stretch">
            <div className="flex justify-end">
              <FormStepNav activeStep="basic" onStepClick={handleStepClick} />
            </div>
          </div>

          <div className="sticky top-0 z-10 col-start-2 row-start-1 min-w-0 bg-[var(--surface-panel)] pb-4">
            <FormHeader
              displayName={displayName}
              formMode={formMode}
              onBackToDetail={onBackToDetail}
              onBackToList={onBackToList}
            />
          </div>

          <div className="col-start-2 row-start-2 min-w-0 mt-4">
            <div ref={basicRef} className="flex flex-col gap-12">
                <BasicInfoSection
                  avatarError={avatarError}
                  displayAvatar={displayAvatar}
                  draftDefaultModel={draftDefaultModel}
                  draftDescription={draftDescription}
                  draftName={draftName}
                  fileInputRef={fileInputRef}
                  inlineNameError={inlineNameError}
                  loadingModels={loadingModels}
                  modelGroups={modelGroups}
                  modelMenuOpen={modelMenuOpen}
                  modelMenuPosition={modelMenuPosition}
                  modelMenuRef={modelMenuRef}
                  modelTriggerRef={modelTriggerRef}
                  modelError={modelError ?? (missingModel ? '模型不存在，请重新选择' : null)}
                  onAvatarUpload={handleAvatarUpload}
                  onDescriptionChange={setDraftDescription}
                  onNameChange={(value) => {
                    setDraftName(value);
                    setNameSubmitError(null);
                  }}
                  onRandomAvatar={() => setDraftAvatar(getRandomPresetAvatar())}
                  onSelectModel={onSelectModel}
                  onToggleModelMenu={() => setModelMenuOpen((prev) => !prev)}
                  selectedModel={selectedModel}
                  openAbove={openAbove}
                  uploadingAvatar={uploadingAvatar}
                />

                <div ref={soulRef}>
                  <FormSoulSection
                    activeWorkingDraft={activeWorkingDraft}
                    editingAgent={editingAgent}
                    onDraftChange={setActiveWorkingDraft}
                  />
                </div>

                <div ref={skillsRef}>
                  <FormSkillsSection
                    editingAgent={editingAgent}
                    skills={draftSkills}
                    skillBasicInfos={draftSkillBasicInfos}
                    onSkillsChange={(skills, skillBasicInfos) => {
                      setDraftSkills(skills);
                      if (skillBasicInfos) setDraftSkillBasicInfos(skillBasicInfos);
                    }}
                  />
                </div>
            </div>
          </div>
        </div>
      </div>

      <FormFooter
        error={globalError}
        formMode={formMode}
        isConfirmDisabled={isConfirmDisabled}
        onCancel={onCancel}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}
