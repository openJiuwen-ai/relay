/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../shared/Button';
import { AgentSelector } from './AgentSelector';

interface ThreadAgentSettingsProps {
  threadId: string;
  currentAgentIds: string[];
  onSave: (threadId: string, agentIds: string[]) => void | Promise<void>;
}

/**
 * F32-b Phase 3: Inline popover to edit a thread's preferredAgentIds.
 * Shown as a small icon button; opens AgentSelector in a positioned dropdown.
 */
export function ThreadAgentSettings({ threadId, currentAgentIds, onSave }: ThreadAgentSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(currentAgentIds);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync when prop changes (e.g. server-side update)
  useEffect(() => {
    if (!isOpen) setSelectedAgentIds(currentAgentIds);
  }, [currentAgentIds, isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSelectedAgentIds(currentAgentIds); // revert on cancel
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, currentAgentIds]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(false);
    try {
      await onSave(threadId, selectedAgentIds);
      setIsOpen(false);
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  }, [threadId, selectedAgentIds, onSave]);

  const hasChanged =
    JSON.stringify([...selectedAgentIds].sort()) !== JSON.stringify([...currentAgentIds].sort());

  /** Fixed position so popover escapes sidebar overflow-y-auto clipping */
  const getPopoverStyle = (): React.CSSProperties => {
    if (!buttonRef.current) return {};
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 256; // 16rem
    return {
      position: 'fixed',
      top: rect.bottom + 4,
      left: Math.max(8, rect.right - width),
      width,
    };
  };

  return (
    <div ref={popoverRef}>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`p-0.5 rounded transition-all ${
          currentAgentIds.length > 0
            ? 'text-cocreator-primary'
            : 'opacity-0 group-hover:opacity-100 text-gray-300 hover:text-cocreator-primary'
        }`}
        title="设置默认智能体"
      >
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1C4.7 1 2 3.2 2 6c0 1.4.7 2.6 1.7 3.5-.1.8-.4 1.6-.9 2.3a.5.5 0 00.4.8c1.2 0 2.3-.5 3.1-1.1.5.1 1.1.2 1.7.2 3.3 0 6-2.2 6-5S11.3 1 8 1z" />
        </svg>
      </button>
      {isOpen && (
        <div
          style={getPopoverStyle()}
          className="ui-overlay-card rounded-lg p-3 z-50"
          data-testid="thread-agent-settings-popover"
          onClick={(e) => e.stopPropagation()}
        >
          <AgentSelector selectedAgentIds={selectedAgentIds} onSelectionChange={setSelectedAgentIds} />
          {saveError && <p className="text-[10px] text-red-500 mt-1">保存失败，请重试</p>}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
            {selectedAgentIds.length > 0 && (
              <button
                onClick={() => setSelectedAgentIds([])}
                className="text-[10px] text-gray-400 hover:text-red-400"
              >
                清除
              </button>
            )}
            <div className="flex gap-1.5 ml-auto">
              <Button
                color="default"
                onClick={() => {
                  setIsOpen(false);
                  setSelectedAgentIds(currentAgentIds);
                }}
                className="px-2 py-0.5"
              >
                取消
              </Button>
              <Button
                color="major"
                onClick={() => void handleSave()}
                disabled={!hasChanged || isSaving}
                className="px-2 py-0.5"
              >
                {isSaving ? '...' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
