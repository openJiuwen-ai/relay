/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Keyboard shortcut registry — single source of truth for all shortcuts.
 * Used by useSplitPaneKeys, ChatInputActionButton (dispatch) and HubCommandsTab (display).
 *
 * To add a new shortcut:
 * 1. Add a ShortcutDefinition here
 * 2. Add the handler in the appropriate hook/component
 * The "命令速查" tab picks it up automatically.
 */

export interface ShortcutDefinition {
  /** Display string, e.g. '⌥V' */
  keys: string;
  /** Human-readable description (Chinese) */
  description: string;
  /** When this shortcut is active */
  context: '全局' | '分屏模式';
}

export const SHORTCUTS: ShortcutDefinition[] = [
  { keys: '⌥V (Option+V)', description: '切换语音录入', context: '全局' },
  { keys: '⌘\\ (Cmd+\\)', description: '切换单屏 / 分屏', context: '全局' },
  { keys: '⌘1 / ⌘2 / ⌘3 / ⌘4', description: '选择分屏窗格', context: '分屏模式' },
];
