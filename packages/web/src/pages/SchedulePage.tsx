/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { QUICK_ACTIONS } from '@/config/quick-actions';
import { useChatStore } from '@/stores/chatStore';
import { SchedulePanel } from '@/components/schedule/SchedulePanel';

const HOME_DRAFT_THREAD_ID = '__new__';
const QUICK_ACTION_TOKEN_PREFIX = '[[quick_action:';
const QUICK_ACTION_TOKEN_SUFFIX = ']]';
const SCHEDULED_TASK_QUICK_ACTION_ICON = '/icons/schedule.svg';

function buildScheduledTaskQuickActionInsertText(): string | null {
  const scheduledTaskAction = QUICK_ACTIONS.find((action) => action.icon === SCHEDULED_TASK_QUICK_ACTION_ICON);
  const label = scheduledTaskAction?.label?.trim();
  if (!label) return null;
  return `${QUICK_ACTION_TOKEN_PREFIX}${label}${QUICK_ACTION_TOKEN_SUFFIX} `;
}

export default function SchedulePage() {
  const navigate = useNavigate();
  const setPendingChatInsert = useChatStore((s) => s.setPendingChatInsert);
  const scheduledTaskQuickActionInsertText = useMemo(() => buildScheduledTaskQuickActionInsertText(), []);

  const handleCreateTask = () => {
    if (!scheduledTaskQuickActionInsertText) return;
    setPendingChatInsert({
      threadId: HOME_DRAFT_THREAD_ID,
      text: scheduledTaskQuickActionInsertText,
    });
    navigate('/');
  };

  return (
    <div className="h-full overflow-y-auto ui-shell-surface px-8 py-8">
      <SchedulePanel onCreateTask={handleCreateTask} />
    </div>
  );
}
