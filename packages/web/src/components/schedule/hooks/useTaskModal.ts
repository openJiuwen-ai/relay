/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useMemo, useState } from 'react';
import type { ScheduledTaskItem } from '../types';
import type { ScheduleTaskDraft } from '../schedule-template-types';
import { getScheduleTaskEditability } from '../utils';

export function useTaskModal() {
  const [selectedTask, setSelectedTask] = useState<ScheduledTaskItem | null>(null);
  const [deleteTargetTask, setDeleteTargetTask] = useState<ScheduledTaskItem | null>(null);
  const [deleteDialogSourceView, setDeleteDialogSourceView] = useState<'card' | 'calendar'>('card');
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [taskEditorOpen, setTaskEditorOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState<ScheduleTaskDraft | null>(null);
  const [editingTask, setEditingTask] = useState<ScheduledTaskItem | null>(null);

  const closeTaskEditor = () => {
    setTaskEditorOpen(false);
    setEditorDraft(null);
    setEditingTask(null);
  };

  const openEditTask = (task: ScheduledTaskItem) => {
    const editability = getScheduleTaskEditability(task);
    if (!editability.editable) {
      return false;
    }
    setSelectedTask(null);
    setEditingTask(task);
    setEditorDraft(editability.draft);
    setTaskEditorOpen(true);
    return true;
  };

  const openCreateTask = (draft: ScheduleTaskDraft) => {
    setEditingTask(null);
    setEditorDraft(draft);
    setTaskEditorOpen(true);
  };

  const openDeleteTask = (task: ScheduledTaskItem, sourceView: 'card' | 'calendar') => {
    if (task.source !== 'dynamic') return;
    setDeleteDialogSourceView(sourceView);
    setDeleteTargetTask(task);
  };

  const closeDeleteDialog = () => {
    setDeleteTargetTask(null);
  };

  const selectedTaskEditability = useMemo(
    () => (selectedTask ? getScheduleTaskEditability(selectedTask) : null),
    [selectedTask],
  );

  return {
    selectedTask,
    setSelectedTask,
    deleteTargetTask,
    setDeleteTargetTask,
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
    getEditingTask: () => editingTask,
  };
}
