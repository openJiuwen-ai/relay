/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { ScheduledTaskItem } from './types';
import type { ScheduleRunItem } from './types';
import type { ScheduleTaskEditability } from './utils';
import type { ScheduleTemplateDefinition, ScheduleTaskDraft } from './schedule-template-types';
import { EmptyDataState } from '../shared/EmptyDataState';
import { CenteredLoadingState } from '../shared/CenteredLoadingState';
import { Toolbar } from './components/Toolbar';
import { TaskList } from './components/TaskList';
import { CalendarView } from './components/CalendarView';
import { EmptyState } from './components/EmptyState';
import { DetailModal } from './components/DetailModal';
import { DeleteModal } from './components/DeleteModal';
import { ScheduleTaskEditorModal } from './components/ScheduleTaskEditorModal';
import { ScheduleTemplatePickerModal } from './components/ScheduleTemplatePickerModal';

type ViewMode = 'card' | 'calendar';

type ScheduledTaskPanelViewProps = {
  title: string;
  viewMode: ViewMode;
  weekRangeText: string;
  baseDate: Date;
  weekOffset: number;
  tasks: ScheduledTaskItem[];
  calendarRuns: ScheduleRunItem[];
  isLoading: boolean;
  isRunsLoading: boolean;
  togglingTaskIds: Set<string>;
  taskIconMaskStyle: CSSProperties;
  taskEditabilityById: Map<string, ScheduleTaskEditability>;
  selectedTask: ScheduledTaskItem | null;
  selectedTaskEditability: ScheduleTaskEditability | null;
  deleteTargetTask: ScheduledTaskItem | null;
  deleteDialogSourceView: 'card' | 'calendar';
  isDeletingTask: boolean;
  templatePickerOpen: boolean;
  templates: ScheduleTemplateDefinition[];
  templatesLoading: boolean;
  selectedTemplateId: string | null;
  taskEditorOpen: boolean;
  editorDraft: ScheduleTaskDraft | null;
  editingTask: ScheduledTaskItem | null;
  emptyTemplateSectionExpanded: boolean;
  emptyStateTemplateCards: ScheduleTemplateDefinition[];
  children?: ReactNode;
  onChangeView: (next: ViewMode) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onResetWeek: () => void;
  onCreateFromConversation: () => void;
  onCreateFromTemplate: () => void;
  onCreateCustom: () => void;
  onSelectTask: (task: ScheduledTaskItem) => void;
  onEditTask: (task: ScheduledTaskItem) => void;
  onEditTaskInConversation: (task: ScheduledTaskItem) => void;
  onToggleTask: (task: ScheduledTaskItem) => Promise<void> | void;
  onDeleteTask: (task: ScheduledTaskItem) => void;
  onCloseDetailModal: () => void;
  onCloseDeleteDialog: () => void;
  onConfirmDelete: () => void;
  onCloseTemplatePicker: () => void;
  onSelectTemplate: (templateId: string | null) => void;
  onConfirmTemplateSelection: () => void;
  onCloseTaskEditor: () => void;
  onConfirmTaskEditor: (draft: ScheduleTaskDraft) => void;
  onCreateFromTemplateCard: (templateId: string) => void;
  onToggleEmptyTemplates: () => void;
};

export function SchedulePanelView({
  title,
  viewMode,
  weekRangeText,
  baseDate,
  weekOffset,
  tasks,
  calendarRuns,
  isLoading,
  isRunsLoading,
  togglingTaskIds,
  taskIconMaskStyle,
  taskEditabilityById,
  selectedTask,
  selectedTaskEditability,
  deleteTargetTask,
  deleteDialogSourceView,
  isDeletingTask,
  templatePickerOpen,
  templates,
  templatesLoading,
  selectedTemplateId,
  taskEditorOpen,
  editorDraft,
  editingTask,
  emptyTemplateSectionExpanded,
  emptyStateTemplateCards,
  onChangeView,
  onPrevWeek,
  onNextWeek,
  onResetWeek,
  onCreateFromConversation,
  onCreateFromTemplate,
  onCreateCustom,
  onSelectTask,
  onEditTask,
  onEditTaskInConversation,
  onToggleTask,
  onDeleteTask,
  onCloseDetailModal,
  onCloseDeleteDialog,
  onConfirmDelete,
  onCloseTemplatePicker,
  onSelectTemplate,
  onConfirmTemplateSelection,
  onCloseTaskEditor,
  onConfirmTaskEditor,
  onCreateFromTemplateCard,
  onToggleEmptyTemplates,
}: ScheduledTaskPanelViewProps) {
  const isCalendarLoading = viewMode === 'calendar' && isRunsLoading && tasks.length === 0;
  const showEmptyState = !isLoading && !isCalendarLoading && tasks.length === 0;
  const showCalendarEmptyState = !isLoading && isCalendarLoading && tasks.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-col gap-6">
        <h1 className="ui-page-title">{title}</h1>
        <Toolbar
          viewMode={viewMode}
          weekRangeText={weekRangeText}
          onChangeView={onChangeView}
          onPrevWeek={onPrevWeek}
          onNextWeek={onNextWeek}
          onResetWeek={onResetWeek}
          onCreateFromConversation={onCreateFromConversation}
          onCreateFromTemplate={onCreateFromTemplate}
          onCreateCustom={onCreateCustom}
        />
      </div>

      <div className="ui-panel flex min-h-0 flex-1 flex-col border-0 shadow-none">
        {isLoading || showCalendarEmptyState ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <CenteredLoadingState />
          </div>
        ) : showEmptyState ? (
          <EmptyState
            title="暂无定时任务"
            description="暂无数据，您可以点击创建按钮新增定时任务"
            showTemplates={true}
            templateCards={emptyStateTemplateCards}
            onTemplateClick={onCreateFromTemplateCard}
            emptyTemplateSectionExpanded={emptyTemplateSectionExpanded}
            onToggleTemplates={onToggleEmptyTemplates}
          />
        ) : viewMode === 'calendar' && tasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <EmptyDataState title="本周暂无执行记录" />
            </div>
          </div>
        ) : viewMode === 'card' ? (
          <TaskList
            tasks={tasks}
            taskIconMaskStyle={taskIconMaskStyle}
            togglingTaskIds={togglingTaskIds}
            taskEditabilityById={taskEditabilityById}
            onSelectTask={onSelectTask}
            onEditTask={onEditTask}
            onEditTaskInConversation={onEditTaskInConversation}
            onToggleTask={onToggleTask}
            onDeleteTask={onDeleteTask}
            isModalOpen={!!(deleteTargetTask || selectedTask || taskEditorOpen || templatePickerOpen)}
          />
        ) : (
          <CalendarView
            tasks={tasks}
            runs={calendarRuns}
            baseDate={baseDate}
            weekOffset={weekOffset}
            onSelectTask={onSelectTask}
            onEditTask={onEditTask}
            onEditTaskInConversation={onEditTaskInConversation}
            onToggleTask={onToggleTask}
            onDeleteTask={onDeleteTask}
            togglingTaskIds={togglingTaskIds}
            taskEditabilityById={taskEditabilityById}
          />
        )}
      </div>

      <DetailModal
        task={selectedTask}
        editability={selectedTaskEditability}
        onClose={onCloseDetailModal}
        onEdit={onEditTask}
        onEditInConversation={onEditTaskInConversation}
      />

      <DeleteModal
        task={deleteTargetTask}
        isDeleting={isDeletingTask}
        sourceView={deleteDialogSourceView}
        onClose={onCloseDeleteDialog}
        onConfirm={onConfirmDelete}
      />

      <ScheduleTemplatePickerModal
        open={templatePickerOpen}
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        loading={templatesLoading}
        onClose={onCloseTemplatePicker}
        onSelect={onSelectTemplate}
        onConfirm={onConfirmTemplateSelection}
      />

      <ScheduleTaskEditorModal
        open={taskEditorOpen}
        draft={editorDraft}
        title={editingTask ? '编辑定时任务' : '创建定时任务'}
        onClose={onCloseTaskEditor}
        onConfirm={onConfirmTaskEditor}
      />
    </div>
  );
}
