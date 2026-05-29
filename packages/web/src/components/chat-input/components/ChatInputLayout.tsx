/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useEffect, useState } from 'react';
import type {
  ClipboardEvent,
  CSSProperties,
  Dispatch,
  DragEvent,
  KeyboardEvent,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from 'react';
import type { QuickActionConfig } from '@/config/quick-actions';
import type { PathEntry } from '@/hooks/usePathCompletion';
import type { QueueEntry } from '@/stores/chat-types';
import type { ParsedPrompt } from '@/utils/promptParser';
import type { SkillOption } from '@/utils/skill-options-cache';
import type { AgentOption } from '../chat-input-options';
import type { SelectedTemplateSummary, WorkspaceMenuItem } from '../types';
import { ACCEPTED_TYPES, MAX_INPUT_LENGTH } from '../utils/constants';
import { normalizeQuickActionsForSend, normalizeSkillsForSend } from '../utils/helpers';
import { ChatDragUploadOverlay } from './ChatDragUploadOverlay';
import { ChatInputBottomLeft } from './ChatInputBottomLeft';
import { ChatInputBottomRight } from './ChatInputBottomRight';
import { ChatInputMenus } from './ChatInputMenus';
import { ChatInputQueuePanel } from './ChatInputQueuePanel';
import { HistorySearchModal } from './HistorySearchModal';
import { ImagePreview } from './ImagePreview';
import { PathCompletionMenu } from './PathCompletionMenu';
import { QuickActionsPanel } from './QuickActionsPanel';
import type { RichTextareaHandle } from './RichTextarea';
import { RichTextarea } from './RichTextarea';
import type { RichQuickActionOption, RichSkillOption } from './rich-textarea-token-rendering';
import { TemplatePicker } from './TemplatePicker';

export interface ChatInputLayoutProps {
  hasActiveInvocation?: boolean;
  activeMenu: string | null;
  pathCompletion: {
    isOpen: boolean;
    entries: PathEntry[];
    selectedIdx: number;
    setSelectedIdx: (idx: number) => void;
    selectEntry: (entry: PathEntry) => string;
  };
  setInput: (next: string | ((prev: string) => string)) => void;
  textareaRef: RefObject<RichTextareaHandle>;
  mentionDataVersion?: number;

  filteredAgentOptions: AgentOption[];
  showMentions: boolean;
  mentionFilter: string;
  onMentionSearchChange: (value: string) => void;
  closeMenus: () => void;
  setMentionStart: Dispatch<SetStateAction<number>>;
  setMentionEnd: Dispatch<SetStateAction<number>>;
  clearMentionFilter: () => void;
  selectedIdx: number;
  setSelectedIdx: Dispatch<SetStateAction<number>>;
  insertMention: (option: AgentOption) => void;
  menuRef: RefObject<HTMLDivElement>;
  mentionMenuStyle: CSSProperties;

  imageLifecycleStatus: 'idle' | 'preparing' | 'uploading' | 'failed';
  uploadError: string | null;
  fileInputRef: RefObject<HTMLInputElement>;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;

  showQuickPrompts: boolean;
  quickActionsExpanded: boolean;
  quickActionsOverflowing: boolean;
  visibleQuickActions: QuickActionConfig[];
  selectedQuickAction: QuickActionConfig | null;
  queueAwareDisabled: boolean;
  quickActionsContainerRef: RefObject<HTMLDivElement>;
  quickActionsRowRef: RefObject<HTMLDivElement>;
  handleQuickAction: (config: QuickActionConfig) => void;
  handleQuickPrompt: (prompt: string) => void;
  handleExpertCardClick: (card: NonNullable<QuickActionConfig['expertCards']>[number]) => void;
  setQuickActionsExpanded: Dispatch<SetStateAction<boolean>>;

  queueCount: number;
  queuedEntries: QueueEntry[];
  queueAttachmentNamesByEntryId: Record<string, string[]>;
  queueExpanded: boolean;
  queueBusy: boolean;
  queueHighlightedEntryId: string | null;
  queueListRef: RefObject<HTMLDivElement>;
  setQueueExpanded: Dispatch<SetStateAction<boolean>>;
  handleQueueClear: () => Promise<void>;
  handleQueuePinToTop: (entryId: string) => Promise<void>;
  handleQueueDelete: (entryId: string) => Promise<void>;
  handleQueueEdit: (entryId: string) => void;

  showStyleTemplatePopover: boolean;
  styleTemplatePopoverRef: RefObject<HTMLDivElement>;
  selectedTemplate: SelectedTemplateSummary | null;
  onTemplateSelectChange: (template: { id: string; name: string } | null) => void;
  onTemplatePopoverClose: () => void;

  images: File[];
  handleRemoveImage: (index: number) => void;
  isDraggingFiles: boolean;
  input: string;
  handleChange: (value: string, selectionStart: number, selectionEnd: number) => void;
  setIsComposing: Dispatch<SetStateAction<boolean>>;
  resizeTextarea: () => void;
  handleKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  handlePaste: (event: ClipboardEvent<HTMLDivElement>) => void;
  handleDragEnter: (event: DragEvent<HTMLElement>) => void;
  handleDragOver: (event: DragEvent<HTMLElement>) => void;
  handleDragLeave: (event: DragEvent<HTMLElement>) => void;
  handleDrop: (event: DragEvent<HTMLElement>) => void;
  skillOptionsData: SkillOption[] | RichSkillOption[];
  quickActionOptions: RichQuickActionOption[];
  ghostSuggestion: string | null;
  isComposing: boolean;

  skillInsertAnchorRef: MutableRefObject<{ start: number; end: number } | null>;
  routerPush: (path: string) => void;
  skillBtnRef: RefObject<HTMLButtonElement>;
  styleTemplateBtnRef: RefObject<HTMLButtonElement>;
  handleSkillClick: () => void;
  guidedModeEnabled: boolean;
  onToggleGuidedMode: () => void;
  hasPptSkillInInput: boolean;
  handleStyleTemplateClick: () => void;
  onClearSelectedTemplate: () => void;
  showSkillMenu: boolean;
  skillFilter: string;
  onSkillSearchChange: (value: string) => void;
  filteredSkillOptions: SkillOption[];
  skillOptionsLoading: boolean;
  skillOptionRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  insertSkill: (skillName: string) => void;

  setWorkspaceFilter: Dispatch<SetStateAction<string>>;
  folderSelectionEnabled: boolean;
  selectedFolderTitle: string | null;
  folderButtonLabel: string;
  shouldShowFolderTooltip: boolean;
  folderBtnRef: RefObject<HTMLButtonElement>;
  workspaceSearchInputRef: RefObject<HTMLInputElement>;
  workspaceFilter: string;
  showWorkspaceMenu: boolean;
  workspaceMenuItems: WorkspaceMenuItem[];
  workspaceOptionRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  isFolderButtonDisabled: boolean;
  sendTemporarilyDisabled: boolean;
  queueSendDisabled: boolean;
  handleWorkspaceClick: () => void;
  handleWorkspaceMenuSelect: (item: WorkspaceMenuItem) => void;

  handleTranscript: (text: string) => void;
  handleSend: () => void;
  onStop?: () => void;
  handleQueueSend: () => void;
  dragOverlayHost: HTMLElement | null;

  showHistorySearch: boolean;
  handleHistorySelect: (text: string) => void;
  setShowHistorySearch: Dispatch<SetStateAction<boolean>>;

  isTemplate: boolean;
  parsed: ParsedPrompt | null;
  activePlaceholderId: string | null;
  handlePlaceholderFocus: (id: string) => void;
  handlePlaceholderBlur: () => void;
  handlePlaceholderDelete: (id: string) => void;
  handlePlaceholderTabNext: (currentId: string) => void;
}

export function ChatInputLayout({
  hasActiveInvocation,
  activeMenu,
  pathCompletion,
  setInput,
  textareaRef,
  mentionDataVersion,
  filteredAgentOptions,
  showMentions,
  mentionFilter,
  onMentionSearchChange,
  closeMenus,
  setMentionStart,
  setMentionEnd,
  clearMentionFilter,
  selectedIdx,
  setSelectedIdx,
  insertMention,
  menuRef,
  mentionMenuStyle,
  imageLifecycleStatus,
  uploadError,
  fileInputRef,
  handleFileSelect,
  showQuickPrompts,
  quickActionsExpanded,
  quickActionsOverflowing,
  visibleQuickActions,
  selectedQuickAction,
  queueAwareDisabled,
  quickActionsContainerRef,
  quickActionsRowRef,
  handleQuickAction,
  handleQuickPrompt,
  handleExpertCardClick,
  setQuickActionsExpanded,
  queueCount,
  queuedEntries,
  queueAttachmentNamesByEntryId,
  queueExpanded,
  queueBusy,
  queueHighlightedEntryId,
  queueListRef,
  setQueueExpanded,
  handleQueueClear,
  handleQueuePinToTop,
  handleQueueDelete,
  handleQueueEdit,
  showStyleTemplatePopover,
  styleTemplatePopoverRef,
  selectedTemplate,
  onTemplateSelectChange,
  onTemplatePopoverClose,
  images,
  handleRemoveImage,
  isDraggingFiles,
  input,
  handleChange,
  setIsComposing,
  resizeTextarea,
  handleKeyDown,
  handlePaste,
  handleDragEnter,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  skillOptionsData,
  quickActionOptions,
  ghostSuggestion,
  isComposing,
  skillInsertAnchorRef,
  routerPush,
  skillBtnRef,
  styleTemplateBtnRef,
  handleSkillClick,
  guidedModeEnabled,
  onToggleGuidedMode,
  hasPptSkillInInput,
  handleStyleTemplateClick,
  onClearSelectedTemplate,
  showSkillMenu,
  skillFilter,
  onSkillSearchChange,
  filteredSkillOptions,
  skillOptionsLoading,
  skillOptionRefs,
  insertSkill,
  setWorkspaceFilter,
  folderSelectionEnabled,
  selectedFolderTitle,
  folderButtonLabel,
  shouldShowFolderTooltip,
  folderBtnRef,
  workspaceSearchInputRef,
  workspaceFilter,
  showWorkspaceMenu,
  workspaceMenuItems,
  workspaceOptionRefs,
  isFolderButtonDisabled,
  sendTemporarilyDisabled,
  queueSendDisabled,
  handleWorkspaceClick,
  handleWorkspaceMenuSelect,
  handleTranscript,
  handleSend,
  onStop,
  handleQueueSend,
  dragOverlayHost,
  showHistorySearch,
  handleHistorySelect,
  setShowHistorySearch,
  isTemplate,
  parsed,
  activePlaceholderId,
  handlePlaceholderFocus,
  handlePlaceholderBlur,
  handlePlaceholderDelete,
  handlePlaceholderTabNext,
}: ChatInputLayoutProps) {
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleVoiceState = (event: Event) => {
      const customEvent = event as CustomEvent<{ state?: string }>;
      setIsVoiceRecording(customEvent.detail?.state === 'recording');
    };
    window.addEventListener('office-claw:voice-state', handleVoiceState as EventListener);
    return () => {
      window.removeEventListener('office-claw:voice-state', handleVoiceState as EventListener);
    };
  }, []);

  const ghostDisplayInput = normalizeSkillsForSend(normalizeQuickActionsForSend(input));
  const ghostDisplaySuggestion = ghostSuggestion
    ? normalizeSkillsForSend(normalizeQuickActionsForSend(ghostSuggestion))
    : '';
  const ghostDisplaySuffix = ghostDisplaySuggestion.startsWith(ghostDisplayInput)
    ? ghostDisplaySuggestion.slice(ghostDisplayInput.length)
    : ghostDisplaySuggestion;
  const hasQuickActionToken = /\[\[quick_action:[^[\]]+\]\]/.test(input);

  return (
    <div className="relative safe-area-bottom bg-transparent">
      <div
        aria-hidden="true"
        className="chat-layout-rail-glow pointer-events-none absolute bottom-0 left-1/2 z-0 h-[100px] -translate-x-1/2 opacity-[0.25] blur-[50px]"
        style={{ borderRadius: '490px', background: 'var(--chat-input-accent-glow)' }}
      />

      {hasActiveInvocation && (
        <div className="chat-layout-rail hidden items-center gap-2 pt-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--chat-input-queue-accent)] animate-pulse" />
          <span className="text-xs font-medium text-[var(--chat-input-queue-accent)]">正在回复中...</span>
          <span className="hidden text-xs text-[var(--text-label-secondary)]">继续输入，消息会排队</span>
        </div>
      )}

      {pathCompletion.isOpen && !activeMenu && (
        <PathCompletionMenu
          entries={pathCompletion.entries}
          selectedIdx={pathCompletion.selectedIdx}
          onSelectIdx={pathCompletion.setSelectedIdx}
          onSelect={(entry) => {
            const newText = pathCompletion.selectEntry(entry);
            setInput(newText);
            setTimeout(() => textareaRef.current?.focus(), 0);
          }}
        />
      )}

      <ChatInputMenus
        agentOptions={filteredAgentOptions}
        showMentions={showMentions}
        mentionFilter={mentionFilter}
        onMentionFilterChange={onMentionSearchChange}
        onCloseMentionMenu={() => {
          closeMenus();
          setMentionStart(-1);
          setMentionEnd(-1);
          clearMentionFilter();
        }}
        selectedIdx={selectedIdx}
        onSelectIdx={setSelectedIdx}
        onInsertMention={insertMention}
        menuRef={menuRef}
        mentionMenuStyle={mentionMenuStyle}
      />

      {imageLifecycleStatus === 'preparing' && (
        <div className="chat-layout-rail pt-2 text-xs text-[var(--text-muted)]" role="status">
          文件处理中，完成后可发送
        </div>
      )}
      {imageLifecycleStatus === 'uploading' && (
        <div className="chat-layout-rail pt-2 text-xs text-[var(--state-info-text)]" role="status">
          文件上传中，请稍候...
        </div>
      )}
      {imageLifecycleStatus === 'failed' && uploadError && (
        <div className="chat-layout-rail pt-2 text-xs text-[var(--state-error-text)]" role="alert">
          文件发送失败：{uploadError}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="chat-layout-rail relative z-10 pt-2">
        <div className="flex gap-2 items-end">
          <div className="group min-w-0 flex-1">
            <QuickActionsPanel
              showQuickPrompts={showQuickPrompts}
              quickActionsExpanded={quickActionsExpanded}
              quickActionsOverflowing={quickActionsOverflowing}
              visibleQuickActions={visibleQuickActions}
              selectedQuickAction={selectedQuickAction}
              queueAwareDisabled={queueAwareDisabled}
              quickActionsContainerRef={quickActionsContainerRef}
              quickActionsRowRef={quickActionsRowRef}
              onQuickAction={handleQuickAction}
              onQuickPrompt={handleQuickPrompt}
              onExpertCardClick={handleExpertCardClick}
              onToggleExpanded={() => setQuickActionsExpanded((prev) => !prev)}
            />

            {queueCount > 0 && (
              <ChatInputQueuePanel
                queuedEntries={queuedEntries}
                attachmentNamesByEntryId={queueAttachmentNamesByEntryId}
                queueCount={queueCount}
                queueExpanded={queueExpanded}
                queueBusy={queueBusy}
                queueHighlightedEntryId={queueHighlightedEntryId}
                listRef={queueListRef}
                onToggleExpanded={() => setQueueExpanded((prev) => !prev)}
                onClear={() => void handleQueueClear()}
                onPinToTop={(entryId) => void handleQueuePinToTop(entryId)}
                onDelete={(entryId) => void handleQueueDelete(entryId)}
                onEdit={handleQueueEdit}
              />
            )}

            <div className={`relative ${queueCount > 0 ? '-mt-5 z-10' : ''}`}>
              {showStyleTemplatePopover && (
                <div
                  ref={styleTemplatePopoverRef}
                  className="absolute bottom-full left-0 right-0 z-[260] mb-[8px] rounded-[16px] overflow-tooltip overflow-hidden"
                  data-testid="chat-input-style-template-popover"
                >
                  <TemplatePicker
                    selectedTemplateId={selectedTemplate?.id}
                    onSelectChange={onTemplateSelectChange}
                    showCloseButton
                    onClose={onTemplatePopoverClose}
                  />
                </div>
              )}

              <div
                data-chat-input-dropzone="true"
                className={`relative min-h-[114px] w-full min-w-0 overflow-visible rounded-[24px] border chat-input-shell bg-[var(--chat-input-bg)] ${
                  isDraggingFiles ? 'border-[var(--text-accent)]' : ''
                }`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <ImagePreview files={images} onRemove={handleRemoveImage} />
                <div className="relative overflow-hidden rounded-t-[24px]">
                  <RichTextarea
                    ref={textareaRef}
                    value={input}
                    onValueChange={handleChange}
                    mentionDataVersion={mentionDataVersion}
                    onCompositionStateChange={setIsComposing}
                    maxLength={MAX_INPUT_LENGTH}
                    onInput={resizeTextarea}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={
                      hasActiveInvocation ? '继续输入内容，将任务加入待执行队列' : '描述你想研究的主题或@助手协助工作'
                    }
                    className="chat-input-textarea block min-h-[70px] w-full bg-transparent px-[18px] py-4 text-[16px] leading-[24px] text-[var(--text-primary)] whitespace-pre-wrap break-words [overflow-wrap:anywhere] placeholder:text-[var(--text-field-placeholder)] focus:outline-none"
                    disabled={false}
                    skillOptions={skillOptionsData}
                    quickActionOptions={quickActionOptions}
                    promptBlocks={
                      isTemplate && parsed
                        ? {
                            parsed,
                            activePlaceholderId,
                            onFocus: handlePlaceholderFocus,
                            onBlur: handlePlaceholderBlur,
                            onDelete: handlePlaceholderDelete,
                            onTabNext: handlePlaceholderTabNext,
                          }
                        : null
                    }
                  />

                  {ghostSuggestion &&
                    !isComposing &&
                    !pathCompletion.isOpen &&
                    !showMentions &&
                    !hasQuickActionToken &&
                    !/(^|\s)@/.test(input) && (
                      <div
                        data-testid="ghost-suggestion"
                        className="pointer-events-none absolute inset-0 w-full overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-t-[24px] px-[18px] py-4 text-[16px] leading-[24px]"
                        aria-hidden="true"
                      >
                        <span className="select-none opacity-0">{ghostDisplayInput}</span>
                        <span className="text-[var(--text-field-placeholder)]">{ghostDisplaySuffix}</span>
                      </div>
                    )}
                </div>

                <div className="px-[10px] pb-[10px]">
                  <div className={`flex items-center gap-2 ${isVoiceRecording ? 'justify-end' : 'justify-between'}`}>
                    {!isVoiceRecording && (
                      <ChatInputBottomLeft
                      input={input}
                      textareaRef={textareaRef}
                      skillInsertAnchorRef={skillInsertAnchorRef}
                      closeMenus={closeMenus}
                      routerPush={routerPush}
                      skillBtnRef={skillBtnRef}
                      styleTemplateBtnRef={styleTemplateBtnRef}
                      onSkillClick={handleSkillClick}
                      selectedQuickAction={selectedQuickAction}
                      guidedModeEnabled={guidedModeEnabled}
                      onToggleGuidedMode={onToggleGuidedMode}
                      hasPptSkillInInput={hasPptSkillInInput}
                      selectedTemplate={selectedTemplate}
                      onStyleTemplateClick={handleStyleTemplateClick}
                      onClearSelectedTemplate={onClearSelectedTemplate}
                      showSkillMenu={showSkillMenu}
                      menuRef={menuRef}
                      skillFilter={skillFilter}
                      onSkillFilterChange={onSkillSearchChange}
                      filteredSkillOptions={filteredSkillOptions}
                      skillOptionsLoading={skillOptionsLoading}
                      selectedIdx={selectedIdx}
                      setSelectedIdx={setSelectedIdx}
                      skillOptionRefs={skillOptionRefs}
                      onInsertSkill={insertSkill}
                      onCloseMenus={closeMenus}
                      />
                    )}

                    <ChatInputBottomRight
                      fileInputRef={fileInputRef}
                      setWorkspaceFilter={setWorkspaceFilter}
                      closeMenus={closeMenus}
                      folderSelectionEnabled={folderSelectionEnabled}
                      selectedFolderTitle={selectedFolderTitle}
                      folderButtonLabel={folderButtonLabel}
                      shouldShowFolderTooltip={shouldShowFolderTooltip}
                      folderBtnRef={folderBtnRef}
                      menuRef={menuRef}
                      workspaceSearchInputRef={workspaceSearchInputRef}
                      workspaceFilter={workspaceFilter}
                      showWorkspaceMenu={showWorkspaceMenu}
                      workspaceMenuItems={workspaceMenuItems}
                      selectedIdx={selectedIdx}
                      setSelectedIdx={setSelectedIdx}
                      workspaceOptionRefs={workspaceOptionRefs}
                      isFolderButtonDisabled={isFolderButtonDisabled}
                      queueAwareDisabled={queueAwareDisabled}
                      sendTemporarilyDisabled={sendTemporarilyDisabled}
                      imagesCount={images.length}
                      hasActiveInvocation={hasActiveInvocation}
                      inputTrimmed={!!input.trim()}
                      queueSendDisabled={queueSendDisabled}
                      queueCount={queueCount}
                      onWorkspaceClick={handleWorkspaceClick}
                      onWorkspaceSelect={handleWorkspaceMenuSelect}
                      onTranscript={handleTranscript}
                      onSend={handleSend}
                      onStop={onStop}
                      onQueueSend={handleQueueSend}
                    />
                  </div>
                </div>
              </div>

              <p className="mt-2 mb-4 text-center text-[12px] font-normal leading-[20px] text-[var(--text-disabled)]">
                内容由AI生成，仅供参考
              </p>
            </div>
          </div>
        </div>
      </div>

      {showHistorySearch && (
        <HistorySearchModal onSelect={handleHistorySelect} onClose={() => setShowHistorySearch(false)} />
      )}

      <ChatDragUploadOverlay isVisible={isDraggingFiles} host={dragOverlayHost} />
    </div>
  );
}

