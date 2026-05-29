/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// packages/api/src/domains/terminal/types.ts

/** A terminal session bound to a worktree's tmux server */
export interface TerminalSession {
  /** Unique session ID (uuid) */
  id: string;
  /** Which worktree this terminal belongs to */
  worktreeId: string;
  /** tmux server socket name: `officeclaw-{worktreeId}` */
  tmuxSocketName: string;
  /** tmux pane ID within the session (e.g., "%0") */
  paneId: string;
  /** Shell command (e.g., '/bin/zsh') */
  shell: string;
  /** Terminal dimensions */
  cols: number;
  rows: number;
  /** Created at timestamp */
  createdAt: number;
}

/** Info about a tmux pane */
export interface PaneInfo {
  paneId: string;
  panePid: number;
  paneWidth: number;
  paneHeight: number;
}

/** Options for creating a pane */
export interface CreatePaneOpts {
  cols?: number;
  rows?: number;
  cwd?: string;
  shell?: string;
}
