/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';
import { loadScheduleTemplateCatalog } from './schedule-template-catalog';
import { createScheduleTaskDraft, createEmptyCustomScheduleTaskDraft } from './schedule-template-catalog';
import type { ScheduleTemplateDefinition } from './schedule-template-types';
import type { ScheduledTaskItem } from './types';
import { formatWeekRangeText } from './utils';
import { useTaskState } from './hooks/useTaskState';
import { useTaskActions } from './hooks/useTaskActions';
import { useTaskCalendar } from './hooks/useTaskCalendar';
import { useTaskModal } from './hooks/useTaskModal';
import { SchedulePanelView } from './SchedulePanelView';

type ScheduledTaskPanelProps = {
  onCreateTask?: () => void;
};

const TASK_TIME_ICON = '/icons/schedule.svg';

export function SchedulePanel({ onCreateTask }: ScheduledTaskPanelProps) {
  const addToast = useToastStore((state) => state.addToast);
  const setPendingChatInsert = useChatStore((state) => state.setPendingChatInsert);

  const [viewMode, setViewMode] = useState<'card' | 'calendar'>('calendar');
  const [weekOffset, setWeekOffset] = useState(0);
  const [templates, setTemplates] = useState<ScheduleTemplateDefinition[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [emptyTemplateSectionExpanded, setEmptyTemplateSectionExpanded] = useState(true);

  const baseDate = new Date();

  const { tasks, calendarRuns, isLoading, isRunsLoading, taskEditabilityById, reloadTasks, setTasks } = useTaskState({
    viewMode,
    weekOffset,
  });

  const { weekRangeText } = useTaskCalendar({
    baseDate,
    weekOffset,
    tasks,
    runs: calendarRuns,
  });

  const {
    selectedTask,
    setSelectedTask,
    deleteTargetTask,
    deleteDialogSourceView,
    templatePickerOpen,
    setTemplatePickerOpen,
    taskEditorOpen,
    editorDraft,
    editingTask,
    closeTaskEditor,
    openEditTask,
    openCreateTask,
    openDeleteTask,
    closeDeleteDialog,
    selectedTaskEditability,
    getEditingTask,
  } = useTaskModal();

  const {
    togglingTaskIds,
    isDeletingTask,
    handleToggleTask,
    handleDeleteConfirm,
    handleTaskEditorConfirm,
    handleEditTaskInConversation,
  } = useTaskActions({ reloadTasks, setTasks, getEditingTask, closeEditor: closeTaskEditor });

  const handleCreateFromConversation = () => {
    onCreateTask?.();
  };

  const handleCreateFromTemplate = () => {
    setSelectedTemplateId(null);
    setTemplatePickerOpen(true);
  };

  const handleCreateCustom = () => {
    openCreateTask(createEmptyCustomScheduleTaskDraft());
  };

  const confirmTemplateSelection = () => {
    if (!selectedTemplateId) return;
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) return;

    const draft = createScheduleTaskDraft(template);
    openCreateTask(draft);
    setTemplatePickerOpen(false);
  };

  const handleCreateFromTemplateCard = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) {
      setSelectedTemplateId(templateId);
      setTemplatePickerOpen(true);
      return;
    }
    const draft = createScheduleTaskDraft(template);
    setSelectedTemplateId(templateId);
    openCreateTask(draft);
  };

  const handleEditTask = (task: ScheduledTaskItem) => {
    const success = openEditTask(task);
    if (!success) {
      addToast({
        type: 'error',
        title: '暂不支持编辑',
        message: '该定时任务仅支持通过对话进行编辑',
        duration: 2600,
      });
    }
  };

  const handleSelectTask = (task: ScheduledTaskItem) => {
    setSelectedTask(task);
  };

  const handleDeleteTask = (task: ScheduledTaskItem) => {
    openDeleteTask(task, viewMode);
  };

  const emptyStateTemplateCards = useMemo(() => templates.slice(0, 4), [templates]);

  useEffect(() => {
    if (viewMode !== 'card') return;
    if (tasks.length !== 0) return;
    if (templates.length > 0) return;

    let cancelled = false;

    const loadPreviewTemplates = async () => {
      try {
        const nextTemplates = await loadScheduleTemplateCatalog();
        if (cancelled) return;
        setTemplates(nextTemplates);
      } catch {
        // keep empty preview area on failure
      }
    };

    void loadPreviewTemplates();
    return () => {
      cancelled = true;
    };
  }, [tasks.length, templates.length, viewMode]);

  useEffect(() => {
    if (!templatePickerOpen) return;

    let cancelled = false;

    const loadTemplates = async () => {
      setTemplatesLoading(true);
      try {
        const nextTemplates = await loadScheduleTemplateCatalog();
        if (cancelled) return;
        setTemplates(nextTemplates);
      } finally {
        if (!cancelled) {
          setTemplatesLoading(false);
        }
      }
    };

    void loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [templatePickerOpen]);

  const taskIconMaskStyle = useMemo(
    () =>
      ({
        WebkitMaskImage: `url(${TASK_TIME_ICON})`,
        maskImage: `url(${TASK_TIME_ICON})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        backgroundColor: 'var(--text-muted)',
      }) as const,
    [],
  );

  return (
    <SchedulePanelView
      title="定时任务"
      viewMode={viewMode}
      weekRangeText={weekRangeText}
      baseDate={baseDate}
      weekOffset={weekOffset}
      tasks={tasks}
      calendarRuns={calendarRuns}
      isLoading={isLoading}
      isRunsLoading={isRunsLoading}
      togglingTaskIds={togglingTaskIds}
      taskIconMaskStyle={taskIconMaskStyle}
      taskEditabilityById={taskEditabilityById}
      selectedTask={selectedTask}
      selectedTaskEditability={selectedTaskEditability}
      deleteTargetTask={deleteTargetTask}
      deleteDialogSourceView={deleteDialogSourceView}
      isDeletingTask={isDeletingTask}
      templatePickerOpen={templatePickerOpen}
      templates={templates}
      templatesLoading={templatesLoading}
      selectedTemplateId={selectedTemplateId}
      taskEditorOpen={taskEditorOpen}
      editorDraft={editorDraft}
      editingTask={editingTask}
      emptyTemplateSectionExpanded={emptyTemplateSectionExpanded}
      emptyStateTemplateCards={emptyStateTemplateCards}
      onChangeView={setViewMode}
      onPrevWeek={() => setWeekOffset((prev) => prev - 1)}
      onNextWeek={() => setWeekOffset((prev) => prev + 1)}
      onResetWeek={() => setWeekOffset(0)}
      onCreateFromConversation={handleCreateFromConversation}
      onCreateFromTemplate={handleCreateFromTemplate}
      onCreateCustom={handleCreateCustom}
      onSelectTask={handleSelectTask}
      onEditTask={handleEditTask}
      onEditTaskInConversation={handleEditTaskInConversation}
      onToggleTask={handleToggleTask}
      onDeleteTask={handleDeleteTask}
      onCloseDetailModal={() => setSelectedTask(null)}
      onCloseDeleteDialog={closeDeleteDialog}
      onConfirmDelete={() => handleDeleteConfirm(deleteTargetTask, closeDeleteDialog)}
      onCloseTemplatePicker={() => setTemplatePickerOpen(false)}
      onSelectTemplate={setSelectedTemplateId}
      onConfirmTemplateSelection={confirmTemplateSelection}
      onCloseTaskEditor={closeTaskEditor}
      onConfirmTaskEditor={handleTaskEditorConfirm}
      onCreateFromTemplateCard={handleCreateFromTemplateCard}
      onToggleEmptyTemplates={() => setEmptyTemplateSectionExpanded((prev) => !prev)}
    />
  );
}
