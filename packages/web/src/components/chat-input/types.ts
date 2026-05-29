/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { RefObject } from 'react';
import type { SendMessageOptions, UploadStatus, WhisperOptions } from '@/hooks/useSendMessage';
import type { DeliveryMode } from '@/stores/chat-types';

export interface WorkspaceOptionItem {
  path: string;
  name: string;
  title?: string;
}

export type WorkspaceMenuItem =
  | { kind: 'empty' }
  | { kind: 'open' }
  | { kind: 'workspace'; option: WorkspaceOptionItem };

export interface SelectedTemplateSummary {
  id: string;
  name: string;
}

export interface ChatInputProps {
  threadId?: string;
  onSend: (
    content: string,
    images?: File[],
    whisper?: WhisperOptions,
    deliveryMode?: DeliveryMode,
    sendOptions?: SendMessageOptions,
  ) => void;
  onStop?: () => void;
  disabled?: boolean;
  hasActiveInvocation?: boolean;
  uploadStatus?: UploadStatus;
  uploadError?: string | null;
  folderSelectionEnabled?: boolean;
  selectedFolderName?: string | null;
  selectedFolderTitle?: string | null;
  workspaceOptions?: WorkspaceOptionItem[];
  onSelectEmptyWorkspace?: () => void;
  onSelectExistingWorkspace?: (path: string) => void;
  onOpenFolderPicker?: () => void;
  dragDropScopeRef?: RefObject<HTMLDivElement | null>;
}

