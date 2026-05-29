/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgentData } from '@/hooks/useAgentData';
import { useInspirationTemplate } from '@/hooks/useInspirationTemplate';
import { usePathCompletion } from '@/hooks/usePathCompletion';
import { useChatStore } from '@/stores/chatStore';
import { useInputHistoryStore } from '@/stores/inputHistoryStore';
import { usePlaceholderStore } from '@/stores/placeholderStore';
import { useToastStore } from '@/stores/toastStore';
import { useInvitedExpertsForThread } from '@/components/experts-panel/hooks/useInvitedExpertsForThread';
import { refreshThreadExpertMentionData } from '@/lib/mention-highlight';
import type { MentionRef } from '@/hooks/useSendMessage';
import { ChatInputLayout } from './components/ChatInputLayout';
import { buildExpertOption, buildMentionOptions } from './chat-input-options';
import { deriveImageLifecycleStatus, isImageLifecycleBlockingSend } from './chat-input-upload-state';
import { type RichTextareaHandle } from './components/RichTextarea';
import { useAttachmentManager } from './hooks/useAttachmentManager';
import { useChatInputInputFlow } from './hooks/useChatInputInputFlow';
import { useChatInputKeyboard } from './hooks/useChatInputKeyboard';
import { useChatInputMenus } from './hooks/useChatInputMenus';
import { useChatInputSendFlow } from './hooks/useChatInputSendFlow';
import { useChatInputTemplateFlow } from './hooks/useChatInputTemplateFlow';
import { useCloseMenusCoordinator } from './hooks/useCloseMenusCoordinator';
import { useDraftSync } from './hooks/useDraftSync';
import { useHistorySuggestionSync } from './hooks/useHistorySuggestionSync';
import { useMentionMenuPositioning } from './hooks/useMentionMenuPositioning';
import { useMentionSkillActions } from './hooks/useMentionSkillActions';
import { usePanelMenuCoordinator } from './hooks/usePanelMenuCoordinator';
import { usePanelSearchFill } from './hooks/usePanelSearchFill';
import { usePendingChatInsertSync } from './hooks/usePendingChatInsertSync';
import { useQueueEditDraftManager } from './hooks/useQueueEditDraftManager';
import { useQueueManager } from './hooks/useQueueManager';
import { useQuickActions } from './hooks/useQuickActions';
import { useSkillOptionsSource } from './hooks/useSkillOptionsSource';
import { useTemplateMode } from './hooks/useTemplateMode';
import { useWorkspaceMenu } from './hooks/useWorkspaceMenu';
import type { ChatInputProps, WorkspaceMenuItem } from './types';
import {
  MAX_PENDING_QUEUE,
  QUICK_ACTION_TOKEN_PREFIX,
  TEXTAREA_MAX_HEIGHT,
  TEXTAREA_MIN_HEIGHT,
} from './utils/constants';
import {
  clampInputLength,
  escapeRegExp,
  normalizeMentionsForSend,
  normalizeQuickActionsForSend,
  normalizeSkillsForSend,
  deriveTargetAgentIds,
  reconcileMentionRefs,
} from './utils/helpers';

/** Module-level draft storage — survives component unmount/remount across thread switches */
export const threadDrafts = new Map<string, string>();

export function ChatInput({
  threadId,
  onSend,
  onStop,
  disabled,
  hasActiveInvocation,
  uploadStatus = 'idle',
  uploadError = null,
  folderSelectionEnabled = false,
  selectedFolderName = null,
  selectedFolderTitle = null,
  workspaceOptions = [],
  onSelectEmptyWorkspace,
  onSelectExistingWorkspace,
  onOpenFolderPicker,
  dragDropScopeRef,
}: ChatInputProps) {
  const navigate = useNavigate();
  const { agents } = useAgentData();
  const { invitedExperts } = useInvitedExpertsForThread({ threadId: threadId ?? null });
  const [mentionDataVersion, setMentionDataVersion] = useState(0);
  useEffect(() => {
    refreshThreadExpertMentionData(invitedExperts);
    setMentionDataVersion((version) => version + 1);
    return () => {
      refreshThreadExpertMentionData([]);
    };
  }, [invitedExperts]);
  const expertOptions = useMemo(() => invitedExperts.map((expert) => buildExpertOption(expert)), [invitedExperts]);
  const mentionOptions = useMemo(() => buildMentionOptions(agents, expertOptions), [agents, expertOptions]);
  const replaceThreadTargetAgents = useChatStore((s) => s.replaceThreadTargetAgents);

  const [input, setInputState] = useState(() => (threadId ? (threadDrafts.get(threadId) ?? '') : ''));
  const [mentionRefs, setMentionRefs] = useState<MentionRef[]>([]);
  const setInput = useCallback((next: string | ((prev: string) => string)) => {
    if (typeof next === 'function') {
      setInputState((prev) => clampInputLength((next as (prev: string) => string)(prev)));
      return;
    }
    setInputState(clampInputLength(next));
  }, []);
  const appendMentionRef = useCallback((ref: MentionRef) => {
    setMentionRefs((prev) => [...prev, ref]);
  }, []);
  const replaceMentionRefs = useCallback((refs: MentionRef[]) => {
    setMentionRefs(refs);
  }, []);
  const clearMentionRefs = useCallback(() => {
    setMentionRefs([]);
  }, []);
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionEnd, setMentionEnd] = useState(-1);
  const [mentionMenuStyle, setMentionMenuStyle] = useState<CSSProperties>({});
  const isPreparingImages = false;
  const [isComposing, setIsComposing] = useState(false);
  const [ghostSuggestion, setGhostSuggestion] = useState<string | null>(null);
  const [dragOverlayHost, setDragOverlayHost] = useState<HTMLElement | null>(null);
  const [resolvedDragDropScope, setResolvedDragDropScope] = useState<HTMLElement | null>(null);
  const ghostRef = useRef<string | null>(null);
  const [showHistorySearch, setShowHistorySearch] = useState(false);
  const {
    guidedModeEnabled,
    setGuidedModeEnabled,
    hasPptSkillInInput,
    selectedTemplate,
    setSelectedTemplate,
    onToggleGuidedMode,
    onClearSelectedTemplate,
  } = useTemplateMode(input);
  const {
    showMentions,
    setShowMentions,
    showSkillMenu,
    setShowSkillMenu,
    showWorkspaceMenu,
    setShowWorkspaceMenu,
    showStyleTemplatePopover,
    setShowStyleTemplatePopover,
    selectedIdx,
    setSelectedIdx,
    closeMenus: closeMenusBase,
    toggleSkillMenu,
    toggleWorkspaceMenu,
    toggleStyleTemplatePopover,
  } = useChatInputMenus();
  const { skillOptions: skillOptionsData, skillOptionsLoading, loadSkillOptions } = useSkillOptionsSource();
  const {
    mentionFilter,
    skillFilter,
    filteredAgentOptions,
    filteredSkillOptions,
    setMentionFilterValue,
    onMentionSearchChange,
    onSkillSearchChange,
    clearMentionFilter,
    clearSkillFilter,
    clearSearchFilters,
  } = usePanelSearchFill({ agentOptions: mentionOptions, skillOptions: skillOptionsData, setSelectedIdx });
  const textareaRef = useRef<RichTextareaHandle>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const skillBtnRef = useRef<HTMLButtonElement>(null);
  const styleTemplateBtnRef = useRef<HTMLButtonElement>(null);
  const folderBtnRef = useRef<HTMLButtonElement>(null);
  const skillOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const workspaceOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const workspaceSearchInputRef = useRef<HTMLInputElement>(null);
  const skillInsertAnchorRef = useRef<{ start: number; end: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleTemplatePopoverRef = useRef<HTMLDivElement>(null);
  const imageLifecycleStatus = deriveImageLifecycleStatus(isPreparingImages, uploadStatus);
  const sendTemporarilyDisabled = isImageLifecycleBlockingSend(imageLifecycleStatus);
  // When a thread is actively running, we still allow queue-send paths.
  // Some parents may pass disabled=true during processing; do not let that
  // block queue-send (button / Enter / quick-scene follow-up sends).
  const queueAwareDisabled = Boolean(disabled && !hasActiveInvocation);
  const addToast = useToastStore((s) => s.addToast);
  const {
    images,
    setImages,
    isDraggingFiles,
    handleFileSelect,
    handlePaste,
    handleRemoveImage,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useAttachmentManager(addToast as any, resolvedDragDropScope);
  const folderButtonLabel = selectedFolderName?.trim() || '选择文件夹';
  const isFolderButtonDisabled = disabled || !folderSelectionEnabled;
  const shouldShowFolderTooltip = Boolean(selectedFolderTitle?.trim());
  const {
    activeQueueThreadId,
    queuedEntries,
    queueAttachmentNamesByEntryId,
    queueCount,
    queueExpanded,
    setQueueExpanded,
    queueBusy,
    queueHighlightedEntryId,
    queueListRef,
    handleQueueDelete,
    handleQueueExtractForEdit,
    handleQueueClear,
    handleQueuePinToTop,
    handleQueueMoveToIndex,
  } = useQueueManager({ threadId, hasActiveInvocation, addToast: addToast as any });
  const queueSendDisabled = Boolean(hasActiveInvocation && queueCount >= MAX_PENDING_QUEUE);

  const pendingChatInsert = useChatStore((s) => s.pendingChatInsert);
  const setPendingChatInsert = useChatStore((s) => s.setPendingChatInsert);
  const consumedPendingChatInsertRef = useRef<{
    threadId: string;
    text: string;
    replaceTrailingMentionTrigger?: boolean;
    suppressMentionMenu?: boolean;
    mentionRefs?: MentionRef[];
  } | null>(null);
  const prevThreadIdRef = useRef<string | undefined>(threadId);

  const handleTranscript = useCallback((text: string) => {
    setInput((prev) => {
      const separator = prev && !prev.endsWith(' ') ? ' ' : '';
      return prev + separator + text;
    });
  }, []);

  const applyProgrammaticInput = useCallback((next: string, caret: number) => {
    const el = textareaRef.current;
    if (el) {
      el.applyProgrammaticChange(next, caret, caret);
      return;
    }
    setInput(next);
  }, []);

  const {
    selectedQuickAction,
    showQuickPrompts,
    quickActionsExpanded,
    quickActionsOverflowing,
    visibleQuickActions,
    quickActionOptions,
    quickActionsContainerRef,
    quickActionsRowRef,
    setQuickActionsExpanded,
    handleQuickAction,
    handleQuickPrompt,
    handleExpertCardClick,
    onExternalQuickActionInsert,
    resetQuickActions,
  } = useQuickActions({
    input,
    agents,
    queueAwareDisabled,
    textareaRef,
    applyProgrammaticInput,
    onMentionRefsChanged: replaceMentionRefs,
    onMentionRefsCleared: clearMentionRefs,
    onQuickActionSelected: () => {
      setQueueExpanded(false);
      setGuidedModeEnabled(false);
    },
  });

  const { workspaceFilter, setWorkspaceFilter, workspaceMenuItems, selectWorkspaceMenuItem } = useWorkspaceMenu({
    workspaceOptions,
    onSelectEmptyWorkspace,
    onSelectExistingWorkspace,
    onOpenFolderPicker,
  });

  const { activeMenu, activeOptionsCount } = usePanelMenuCoordinator({
    showMentions,
    showSkillMenu,
    showWorkspaceMenu,
    filteredAgentOptionsLength: filteredAgentOptions.length,
    filteredSkillOptionsLength: filteredSkillOptions.length,
    workspaceMenuItems,
    selectedIdx,
    setSelectedIdx,
    skillOptionRefs,
    workspaceOptionRefs,
    folderSelectionEnabled,
    setShowWorkspaceMenu,
  });

  const addHistoryEntry = useInputHistoryStore((s) => s.addEntry);
  const findHistoryMatch = useInputHistoryStore((s) => s.findMatch);

  // F080-P2: path completion
  const pathCompletion = usePathCompletion(input);
  const skillNames = useMemo(() => skillOptionsData.map((option) => option.name), [skillOptionsData]);

  const {
    handleQueueEdit,
    handleQueueSend: handleQueueSendWithDraft,
    handleQueueDeleteSafe,
    handleQueueClearSafe,
    resolveQueueSendOptions,
    resetQueueEditState,
  } = useQueueEditDraftManager({
    activeQueueThreadId,
    queuedEntries,
    input,
    images,
    skillNames,
    setInput,
    setImages,
    setQueueExpanded,
    textareaRef,
    handleQueueExtractForEdit,
    handleQueueMoveToIndex,
    handleQueueDelete,
    handleQueueClear,
  });

  const {
    isTemplate,
    parsed,
    activePlaceholderId,
    handlePlaceholderFocus,
    handlePlaceholderBlur,
    handlePlaceholderDelete,
    handlePlaceholderTabNext,
    buildSendContent,
    resetTemplate,
  } = useInspirationTemplate({
    input,
    setInput,
    textareaRef,
    onSend: undefined,
  });

  const { handleSend: handleSendBase, handleQueueSend: handleQueueSendBase } = useChatInputSendFlow({
    input,
    images,
    mentionOptions,
    queueAwareDisabled,
    sendTemporarilyDisabled,
    guidedModeEnabled,
    selectedQuickActionLabel: selectedQuickAction?.label,
    hasPptSkillInInput,
    selectedTemplate,
    queueSendDisabled,
    mentionRefs,
    onSend,
    addHistoryEntry,
    setInput,
    setImages,
    setShowMentions,
    setShowSkillMenu,
    setShowWorkspaceMenu,
    setSelectedTemplate,
    setQueueExpanded,
    clearMentionRefs,
    setGhostSuggestion,
    ghostRef,
    resetQuickActions,
    resolveQueueSendOptions,
  });
  const handleQueueSend = useCallback(
    () => handleQueueSendWithDraft(handleQueueSendBase),
    [handleQueueSendBase, handleQueueSendWithDraft],
  );

  useEffect(() => {
    setMentionRefs((prev) => reconcileMentionRefs(input, prev));
  }, [input, mentionRefs]);

  const handleSend = useCallback(() => {
    if (isTemplate && parsed) {
      const { text, files } = buildSendContent();
      const payload = normalizeMentionsForSend(
        normalizeSkillsForSend(normalizeQuickActionsForSend(text.trim())),
        mentionOptions,
      )
        .replace(/[^\S\r\n]{2,}/g, ' ')
        .trim();
      if (payload) {
        onSend(payload, files.length > 0 ? files : undefined);
        resetTemplate();
        usePlaceholderStore.getState().clearAll();
        setInput('');
        setPendingChatInsert(null);
        return true;
      }
      return false;
    }
    const didSend = handleSendBase();
    if (didSend) {
      resetQueueEditState();
    }
    return didSend;
  }, [
    isTemplate,
    parsed,
    mentionOptions,
    buildSendContent,
    onSend,
    handleSendBase,
    resetQueueEditState,
    resetTemplate,
    setPendingChatInsert,
  ]);

  const { closeMenus } = useCloseMenusCoordinator({
    closeMenusBase,
    clearSearchFilters,
    setWorkspaceFilter,
  });

  const handleWorkspaceMenuSelect = useCallback(
    (item: WorkspaceMenuItem) => {
      selectWorkspaceMenuItem(item);
      closeMenus();
    },
    [closeMenus, selectWorkspaceMenuItem],
  );

  const { updateMentionMenuPosition, insertMention, insertSkill } = useMentionSkillActions({
    showMentions,
    mentionStart,
    mentionEnd,
    input,
    textareaRef,
    menuRef,
    skillInsertAnchorRef,
    setInput,
    setShowMentions,
    setShowSkillMenu,
    setMentionStart,
    setMentionEnd,
    setMentionMenuStyle,
    clearMentionFilter,
    clearSkillFilter,
    onMentionRefInserted: appendMentionRef,
  });

  const { handleChange } = useChatInputInputFlow({
    setInput,
    setShowMentions,
    setShowSkillMenu,
    setMentionStart,
    setMentionEnd,
    setMentionFilterValue,
    clearMentionFilter,
    clearSkillFilter,
    closeMenus,
    setSelectedIdx,
    skillInsertAnchorRef,
  });

  useEffect(() => {
    if (!threadId) return;
    const typedMentionIds = deriveTargetAgentIds(input, mentionRefs, mentionOptions);
    replaceThreadTargetAgents(threadId, typedMentionIds);
  }, [input, mentionOptions, mentionRefs, replaceThreadTargetAgents, threadId]);

  const handleHistorySelect = useCallback(
    (text: string) => {
      setInput(text);
      clearMentionRefs();
      setShowHistorySearch(false);
      ghostRef.current = null;
      setGhostSuggestion(null);
      closeMenus();
      clearMentionFilter();
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [clearMentionRefs, closeMenus],
  );
  const { handleKeyDown } = useChatInputKeyboard({
    input,
    hasActiveInvocation,
    activeMenu,
    activeOptionsCount,
    selectedIdx,
    setSelectedIdx,
    filteredAgentOptions,
    filteredSkillOptions,
    workspaceMenuItems,
    textareaRef,
    setInput,
    closeMenus,
    clearMentionFilter,
    clearSkillFilter,
    setMentionStart,
    setMentionEnd,
    insertMention,
    insertSkill,
    handleWorkspaceMenuSelect,
    handleSend,
    handleQueueSend,
    setGhostSuggestion,
    ghostRef,
    setShowHistorySearch,
    pathCompletion,
  });

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current?.getElement();
    if (!ta) return;
    const prevScrollTop = ta.scrollTop;
    const prevClientHeight = ta.clientHeight;
    const prevScrollHeight = ta.scrollHeight;
    const wasNearBottom = prevScrollTop + prevClientHeight >= prevScrollHeight - 2;
    ta.style.height = 'auto';
    const contentHeight = ta.scrollHeight;
    const nextHeight = Math.max(TEXTAREA_MIN_HEIGHT, Math.min(contentHeight, TEXTAREA_MAX_HEIGHT));
    const nextOverflowY = contentHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
    const nextHeightCss = `${nextHeight}px`;
    if (ta.style.height !== nextHeightCss) ta.style.height = nextHeightCss;
    if (ta.style.overflowY !== nextOverflowY) ta.style.overflowY = nextOverflowY;
    if (nextOverflowY === 'auto') {
      if (wasNearBottom) ta.scrollTop = ta.scrollHeight;
      else ta.scrollTop = prevScrollTop;
    } else {
      ta.scrollTop = 0;
    }
  }, []);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  useMentionMenuPositioning({
    showMentions,
    input,
    mentionFilter,
    updateMentionMenuPosition,
  });

  const handleSkillClick = useCallback(() => {
    const ta = textareaRef.current;
    const start = ta?.getSelectionStart() ?? input.length;
    const end = ta?.getSelectionEnd() ?? input.length;
    skillInsertAnchorRef.current = { start, end };
    toggleSkillMenu(() => loadSkillOptions(true));
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [input, loadSkillOptions, toggleSkillMenu]);

  const handleWorkspaceClick = useCallback(() => {
    toggleWorkspaceMenu();
  }, [toggleWorkspaceMenu]);

  const handleStyleTemplateClick = useCallback(() => {
    toggleStyleTemplatePopover();
  }, [toggleStyleTemplatePopover]);

  const { onTemplateSelectChange, onTemplatePopoverClose } = useChatInputTemplateFlow({
    showStyleTemplatePopover,
    styleTemplatePopoverRef,
    styleTemplateBtnRef,
    setShowStyleTemplatePopover,
    selectedQuickActionLabel: selectedQuickAction?.label,
    setSelectedTemplate,
  });

  usePendingChatInsertSync({
    pendingChatInsert,
    setPendingChatInsert,
    threadId,
    quickActionTokenPrefix: QUICK_ACTION_TOKEN_PREFIX,
    consumedRef: consumedPendingChatInsertRef,
    textareaRef,
    setInput,
    onExternalQuickActionInsert,
    onExternalMentionInsert: (filter, start) => {
      setShowMentions(true);
      setMentionStart(start);
      setMentionEnd(start + filter.length + 1);
      setMentionFilterValue(filter);
      setSelectedIdx(0);
    },
    onMentionRefsChanged: replaceMentionRefs,
    onMentionRefsCleared: clearMentionRefs,
  });

  useDraftSync({ threadId, input, threadDrafts });

  useLayoutEffect(() => {
    if (prevThreadIdRef.current !== threadId) {
      clearMentionRefs();
      prevThreadIdRef.current = threadId;
    }
  }, [clearMentionRefs, threadId]);

  useHistorySuggestionSync({
    input,
    findHistoryMatch,
    ghostRef,
    setGhostSuggestion,
  });

  useEffect(() => {
    if (!activeMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // React 18 may flush state synchronously during event bubbling,
      // detaching the original target (e.g. layer 1 unmounts when drilling
      // into layer 2). A detached target is not a genuine outside click.
      if (!target.isConnected) return;
      const activeTrigger =
        activeMenu === 'skill' ? skillBtnRef.current : activeMenu === 'workspace' ? folderBtnRef.current : null;
      if (menuRef.current && !menuRef.current.contains(target) && !activeTrigger?.contains(target)) {
        closeMenus();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeMenu, closeMenus]);

  useEffect(() => {
    const explicitScope = dragDropScopeRef?.current ?? null;
    if (explicitScope) {
      setResolvedDragDropScope(explicitScope);
      setDragOverlayHost(explicitScope);
      return;
    }
    const fallbackScope =
      typeof document !== 'undefined'
        ? (document.querySelector('[data-chat-drop-scope="true"]') as HTMLElement | null)
        : null;
    setResolvedDragDropScope(fallbackScope);
    setDragOverlayHost(fallbackScope);
  }, [dragDropScopeRef, threadId]);

  useEffect(() => {
    if (threadId === '__new__') {
      usePlaceholderStore.getState().clearAll();
    }
  }, [threadId]);

  return (
    <ChatInputLayout
      hasActiveInvocation={hasActiveInvocation}
      activeMenu={activeMenu}
      pathCompletion={pathCompletion}
      setInput={setInput}
      textareaRef={textareaRef}
      mentionDataVersion={mentionDataVersion}
      filteredAgentOptions={filteredAgentOptions}
      showMentions={showMentions}
      mentionFilter={mentionFilter}
      onMentionSearchChange={onMentionSearchChange}
      closeMenus={closeMenus}
      setMentionStart={setMentionStart}
      setMentionEnd={setMentionEnd}
      clearMentionFilter={clearMentionFilter}
      selectedIdx={selectedIdx}
      setSelectedIdx={setSelectedIdx}
      insertMention={insertMention}
      menuRef={menuRef}
      mentionMenuStyle={mentionMenuStyle}
      imageLifecycleStatus={imageLifecycleStatus}
      uploadError={uploadError}
      fileInputRef={fileInputRef}
      handleFileSelect={handleFileSelect}
      showQuickPrompts={showQuickPrompts}
      quickActionsExpanded={quickActionsExpanded}
      quickActionsOverflowing={quickActionsOverflowing}
      visibleQuickActions={visibleQuickActions}
      selectedQuickAction={selectedQuickAction}
      queueAwareDisabled={queueAwareDisabled}
      quickActionsContainerRef={quickActionsContainerRef}
      quickActionsRowRef={quickActionsRowRef}
      handleQuickAction={handleQuickAction}
      handleQuickPrompt={handleQuickPrompt}
      handleExpertCardClick={handleExpertCardClick}
      setQuickActionsExpanded={setQuickActionsExpanded}
      queueCount={queueCount}
      queuedEntries={queuedEntries}
      queueAttachmentNamesByEntryId={queueAttachmentNamesByEntryId}
      queueExpanded={queueExpanded}
      queueBusy={queueBusy}
      queueHighlightedEntryId={queueHighlightedEntryId}
      queueListRef={queueListRef}
      setQueueExpanded={setQueueExpanded}
      handleQueueClear={handleQueueClearSafe}
      handleQueuePinToTop={handleQueuePinToTop}
      handleQueueDelete={handleQueueDeleteSafe}
      handleQueueEdit={handleQueueEdit}
      showStyleTemplatePopover={showStyleTemplatePopover}
      styleTemplatePopoverRef={styleTemplatePopoverRef}
      selectedTemplate={selectedTemplate}
      onTemplateSelectChange={onTemplateSelectChange}
      onTemplatePopoverClose={onTemplatePopoverClose}
      images={images}
      handleRemoveImage={handleRemoveImage}
      isDraggingFiles={isDraggingFiles}
      input={input}
      handleChange={handleChange}
      setIsComposing={setIsComposing}
      resizeTextarea={resizeTextarea}
      handleKeyDown={handleKeyDown}
      handlePaste={handlePaste}
      handleDragEnter={handleDragEnter}
      handleDragOver={handleDragOver}
      handleDragLeave={handleDragLeave}
      handleDrop={handleDrop}
      skillOptionsData={skillOptionsData}
      quickActionOptions={quickActionOptions}
      ghostSuggestion={ghostSuggestion}
      isComposing={isComposing}
      skillInsertAnchorRef={skillInsertAnchorRef}
      routerPush={navigate}
      skillBtnRef={skillBtnRef}
      styleTemplateBtnRef={styleTemplateBtnRef}
      handleSkillClick={handleSkillClick}
      guidedModeEnabled={guidedModeEnabled}
      onToggleGuidedMode={onToggleGuidedMode}
      hasPptSkillInInput={hasPptSkillInInput}
      handleStyleTemplateClick={handleStyleTemplateClick}
      onClearSelectedTemplate={onClearSelectedTemplate}
      showSkillMenu={showSkillMenu}
      skillFilter={skillFilter}
      onSkillSearchChange={onSkillSearchChange}
      filteredSkillOptions={filteredSkillOptions}
      skillOptionsLoading={skillOptionsLoading}
      skillOptionRefs={skillOptionRefs}
      insertSkill={insertSkill}
      setWorkspaceFilter={setWorkspaceFilter}
      folderSelectionEnabled={folderSelectionEnabled}
      selectedFolderTitle={selectedFolderTitle}
      folderButtonLabel={folderButtonLabel}
      shouldShowFolderTooltip={shouldShowFolderTooltip}
      folderBtnRef={folderBtnRef}
      workspaceSearchInputRef={workspaceSearchInputRef}
      workspaceFilter={workspaceFilter}
      showWorkspaceMenu={showWorkspaceMenu}
      workspaceMenuItems={workspaceMenuItems}
      workspaceOptionRefs={workspaceOptionRefs}
      isFolderButtonDisabled={isFolderButtonDisabled}
      sendTemporarilyDisabled={sendTemporarilyDisabled}
      queueSendDisabled={queueSendDisabled}
      handleWorkspaceClick={handleWorkspaceClick}
      handleWorkspaceMenuSelect={handleWorkspaceMenuSelect}
      handleTranscript={handleTranscript}
      handleSend={handleSend}
      onStop={onStop}
      handleQueueSend={handleQueueSend}
      dragOverlayHost={dragOverlayHost}
      showHistorySearch={showHistorySearch}
      handleHistorySelect={handleHistorySelect}
      setShowHistorySearch={setShowHistorySearch}
      isTemplate={isTemplate}
      parsed={parsed}
      activePlaceholderId={activePlaceholderId}
      handlePlaceholderFocus={handlePlaceholderFocus}
      handlePlaceholderBlur={handlePlaceholderBlur}
      handlePlaceholderDelete={handlePlaceholderDelete}
      handlePlaceholderTabNext={handlePlaceholderTabNext}
    />
  );
}
