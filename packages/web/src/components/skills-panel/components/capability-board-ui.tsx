/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type ReactNode } from 'react';
import { skillSourceToLabel } from '@/utils/skill-source-label';
import { OverflowTooltip } from '../../shared/OverflowTooltip';
import { SkillAvatar } from './SkillAvatar';

export interface CapabilityBoardItem {
  id: string;
  type: 'mcp' | 'skill';
  source: 'builtin' | 'external';
  enabled: boolean;
  agents: Record<string, boolean>;
  description?: string;
  triggers?: string[];
  category?: string;
  mounts?: Record<string, boolean>;
  tools?: { name: string; description?: string }[];
  connectionStatus?: 'connected' | 'disconnected' | 'unknown';
  installedAt?: string;
  iconUrl?: string | null;
}

export interface AgentFamily {
  id: string;
  name: string;
  agentIds: string[];
}

export interface SkillHealthSummary {
  allMounted: boolean;
  registrationConsistent: boolean;
  unregistered: string[];
  phantom: string[];
}

export interface CapabilityBoardResponse {
  items: CapabilityBoardItem[];
  agentFamilies: AgentFamily[];
  projectPath: string;
  skillHealth?: SkillHealthSummary;
}

export type ToggleHandler = (
  id: string,
  type: 'mcp' | 'skill',
  enabled: boolean,
  scope?: 'global' | 'agent',
  agentId?: string,
) => void;

export function McpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </svg>
  );
}

export function SkillIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export function ExtensionIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.315 8.685a.98.98 0 0 1 .837-.276c.47.07.802.48.968.925a2.501 2.501 0 1 0 3.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 0 1 .276-.837l1.61-1.61a2.404 2.404 0 0 1 1.705-.707c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.969a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" />
    </svg>
  );
}

function getSourceLabel(source: CapabilityBoardItem['source']): string {
  return skillSourceToLabel(source);
}

export function CapabilitySection({
  title,
  subtitle: _subtitle,
  headerSlot,
  headerSlotClassName,
  titleActionSlot,
  showWhenEmpty,
  emptyState,
  items,
  agentFamilies,
  toggling,
  onToggle,
  onUninstall,
  onUpdateSkill,
  updatingSkillId,
  skillUpdates,
  hideSkillMountStatus: _hideSkillMountStatus,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  headerSlot?: ReactNode;
  headerSlotClassName?: string;
  titleActionSlot?: ReactNode;
  showWhenEmpty?: boolean;
  emptyState?: ReactNode;
  items: CapabilityBoardItem[];
  agentFamilies: AgentFamily[];
  toggling: string | null;
  onToggle: ToggleHandler;
  onUninstall?: (id: string) => void;
  onUpdateSkill?: (id: string) => void;
  updatingSkillId?: string | null;
  skillUpdates?: ReadonlySet<string>;
  hideSkillMountStatus?: boolean;
}) {
  if (items.length === 0 && !showWhenEmpty) return null;

  return (
    <div className="mb-6 pt-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[20px] font-semibold">{title}</p>
          {titleActionSlot ? <div className="shrink-0">{titleActionSlot}</div> : null}
        </div>
        {headerSlot ? <div className={headerSlotClassName ?? 'mt-3'}>{headerSlot}</div> : null}
      </div>
      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <CapabilityCard
              key={`${item.type}:${item.id}`}
              item={item}
              agentFamilies={agentFamilies}
              toggling={toggling}
              onToggle={onToggle}
              onUninstall={onUninstall}
              onUpdateSkill={onUpdateSkill}
              updatingSkillId={updatingSkillId}
              skillUpdates={skillUpdates}
              hideSkillMountStatus={_hideSkillMountStatus}
            />
          ))}
        </div>
      ) : (
        (emptyState ?? null)
      )}
    </div>
  );
}

export function CapabilityCard({
  item,
  agentFamilies: _agentFamilies,
  toggling,
  onToggle,
  onUninstall,
  onUpdateSkill,
  updatingSkillId,
  skillUpdates,
  onClick,
  hideSkillMountStatus: _hideSkillMountStatus,
}: {
  item: CapabilityBoardItem;
  agentFamilies: AgentFamily[];
  toggling: string | null;
  onToggle: ToggleHandler;
  onUninstall?: (id: string) => void;
  onUpdateSkill?: (id: string) => void;
  updatingSkillId?: string | null;
  skillUpdates?: ReadonlySet<string>;
  onClick?: () => void;
  hideSkillMountStatus?: boolean;
}) {
  const isToggling = toggling === `${item.type}:${item.id}`;
  const sourceLabel = getSourceLabel(item.source);
  const resolvedDescription = item.description?.trim() || '暂未提供技能描述。';
  const resolvedAgentegory = item.category?.trim() || '其他';
  const showDeleteAction = item.source === 'external' && typeof onUninstall === 'function';
  const showUpdateAction = item.type === 'skill' && Boolean(skillUpdates?.has(item.id)) && typeof onUpdateSkill === 'function';
  const isUpdating = updatingSkillId === item.id;
  const isClickable = typeof onClick === 'function';

  return (
    <div
      className={`ui-card ui-card-hover group flex flex-col gap-4 ${isClickable ? 'cursor-pointer' : ''}`}
      data-testid={`capability-card-${item.type}-${item.id}`}
      onClick={onClick}
      onKeyDown={
        isClickable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <div className="flex items-start gap-3">
        <SkillAvatar avatarName={item.id} avatarUrl={item.iconUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <OverflowTooltip
              content={item.id}
              className="min-w-0 flex-1"
              as="h3"
              textClassName="block truncate text-base font-semibold text-[var(--text-primary)]"
            />
            {item.connectionStatus ? <StatusDot status={item.connectionStatus} /> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {showUpdateAction ? (
              <span className="ui-badge-muted inline-flex items-center gap-1 border-[rgba(194,87,0,0.28)] bg-[rgba(194,87,0,0.10)] text-[rgba(194,87,0,1)]">
                <svg
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 opacity-80"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 2.1A4.15 4.15 0 0 0 3.85 6.25v2.1c0 .76-.25 1.5-.72 2.1L2.6 11.1h10.8l-.53-.65a3.4 3.4 0 0 1-.72-2.1v-2.1A4.15 4.15 0 0 0 8 2.1Z" />
                  <path d="M6.85 13a1.25 1.25 0 0 0 2.3 0" />
                </svg>
                有更新
              </span>
            ) : null}
            <OverflowTooltip
              content={resolvedAgentegory}
              className="inline-flex max-w-full min-w-0"
              as="span"
              textClassName="ui-badge-muted inline-block max-w-full truncate align-middle leading-[18px]"
            />
          </div>
        </div>
      </div>

      <OverflowTooltip content={resolvedDescription} className="w-full">
        <p className="line-clamp-2 min-h-[44px] text-sm leading-6 text-[var(--text-secondary)]">{resolvedDescription}</p>
      </OverflowTooltip>

      <div className="flex items-end justify-between gap-3">
        <div className="min-h-5 text-xs leading-5">
          {showDeleteAction || showUpdateAction ? (
            <div className="relative">
              <span className="text-[var(--text-muted)] transition-opacity duration-200 group-hover:opacity-0">
                来源：{sourceLabel}
              </span>
              <div className="absolute left-0 top-0 flex items-center gap-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {showUpdateAction ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onUpdateSkill?.(item.id);
                    }}
                    disabled={isUpdating}
                    className="text-[14px] font-bold text-[var(--text-accent)] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUpdating ? '更新中' : '更新'}
                  </button>
                ) : null}
                {showDeleteAction ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onUninstall?.(item.id);
                    }}
                    className="text-[14px] font-bold text-[var(--text-accent)] hover:underline"
                  >
                    卸载
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <span className="text-[var(--text-muted)]">来源：{sourceLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function StatusDot({ status }: { status: 'connected' | 'disconnected' | 'unknown' }) {
  const color =
    status === 'connected'
      ? 'bg-[var(--state-success-text)]'
      : status === 'disconnected'
        ? 'bg-[var(--state-error-text)]'
        : 'bg-[var(--text-muted)]';
  const label = status === 'connected' ? '已连接' : status === 'disconnected' ? '掉线' : '未知';
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} title={label} />;
}
