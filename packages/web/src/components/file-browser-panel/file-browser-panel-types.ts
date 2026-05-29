/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { RefObject } from 'react';
import type { LocalGeneratedFile } from '@/components/cli-output/local-generated-files';

/** Top-level panel tab. */
export type PanelTab = 'tasks' | 'artifacts' | 'workspace';

/** A single entry in the file browser list (artifact or workspace file). */
export interface FileBrowserEntry {
  name: string;
  path: string;
  /** Inferred from extension; 'other' for unknown or directories. */
  kind: import('@/components/cli-output/local-generated-files').LocalGeneratedFileKind;
  isDirectory: boolean;
}

/** Props passed to the top-level FileBrowserPanel. */
export interface FileBrowserPanelProps {
  /** All send_file_to_user artifacts for the current thread. */
  artifacts: LocalGeneratedFile[];
  /** Thread workspace root (absolute path). */
  projectPath: string;
  threadId: string;
  onClose: () => void;
  fullScreenContainerRef?: RefObject<HTMLDivElement | null>;
}

/** Shared state managed by useFileBrowserState. */
export interface FileBrowserState {
  activeTab: PanelTab;
  selectedFilePath: string | null;
  setActiveTab: (tab: PanelTab) => void;
  setSelectedFilePath: (path: string | null) => void;
}
