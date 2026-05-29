/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useTheme } from '@/hooks/useTheme';
import { useAgentData } from '@/hooks/useAgentData';
import { HubButton } from './HubButton';

interface ChatContainerHeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  threadId: string;
  authPendingCount: number;
  targetAgents?: string[];
  viewMode: 'single' | 'split';
  onToggleViewMode: () => void;
  onOpenMobileStatus: () => void;
  /** F092: Default agent for voice companion */
  defaultVoiceAgentId: string;
}

export function ChatContainerHeader({
  // Sidebar toggle icon hidden by design; keep props for compatibility.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sidebarOpen: _sidebarOpen,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onToggleSidebar: _onToggleSidebar,
  // Header title/indicator removed by design; keep props for compatibility.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  threadId: _threadId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  authPendingCount: _authPendingCount,
  targetAgents = [],
  // F099/OQ-4: viewMode toggle hidden - candidate for removal (KD-7)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  viewMode: _viewMode,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onToggleViewMode: _onToggleViewMode,
  onOpenMobileStatus,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  defaultVoiceAgentId: _defaultVoiceAgentId,
}: ChatContainerHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { getAgentById } = useAgentData();
  const visibleTargets = targetAgents
    .map((id) => ({ id, rowAgent: getAgentById(id) }))
    .filter((entry) => !!entry.rowAgent);
  const nextThemeLabel = theme === 'business' ? '暖色' : theme === 'warm' ? '暗黑' : '商务';

  return (
    <header className="safe-area-top relative h-0 overflow-visible">
      <div className="absolute right-5 top-2 z-20 hidden items-center gap-1">
        {visibleTargets.length > 0 && (
          <div className="mr-2 hidden items-center gap-2 md:flex">
            {visibleTargets.map(({ id, rowAgent }) => (
              <div key={id} className="flex items-center gap-2" title={rowAgent!.displayName}>
                <img src={rowAgent!.avatar} alt={rowAgent!.displayName} className="h-6 w-6 rounded-full" />
                <span className="text-sm text-[var(--text-primary)]">{rowAgent!.displayName}</span>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onOpenMobileStatus}
          className="ui-icon-button lg:hidden"
          title="状态面板"
          aria-label="状态面板"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div className="flex items-center gap-1 hidden">
          <HubButton />
          <button
            type="button"
            onClick={toggleTheme}
            className="ui-icon-button"
            title={`切换到${nextThemeLabel}主题`}
            aria-label={`Switch to ${nextThemeLabel} theme`}
          >
            {theme === 'warm' ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 11h6M9 15h6M9 7h6" />
              </svg>
            ) : theme === 'dark' ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <path d="M2 17h20" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
