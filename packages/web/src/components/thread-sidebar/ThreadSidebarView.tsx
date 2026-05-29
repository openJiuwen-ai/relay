/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Thread } from '@/stores/chatStore';
import { useDesktopWindowControls } from '@/hooks/useDesktopWindowControls';
import type { ThreadSidebarControllerResult } from './thread-sidebar-types';
import { DirectoryPickerModal } from './DirectoryPickerModal';
import { SectionGroup } from './SectionGroup';
import { ThreadItem } from './ThreadItem';
import { SearchInput } from '../shared/SearchInput';
import { MaskIcon } from '../shared/MaskIcon';
import { ThreadSidebarFooter } from './ThreadSidebarFooter';
import { ThreadSidebarDeleteDialog } from './ThreadSidebarDeleteDialog';
import { getSidebarShellClassName, getThreadSourceLabel } from './thread-sidebar-utils';
import { THREAD_FILTER_OPTIONS } from './thread-sidebar-constants';
import type { ThreadGroup } from './thread-utils';
import { OverflowTooltip } from '../shared/OverflowTooltip';

interface MenuButtonProps {
  label: string;
  testId: string;
  icon: string;
  active: boolean;
  onClick: () => void;
  collapsed: boolean;
  revealClassName: string;
  hidden?: boolean;
}

type MenuItem = Omit<MenuButtonProps, 'collapsed' | 'revealClassName'>;

function MenuButton({ label, testId, icon, active, onClick, collapsed, revealClassName, hidden }: MenuButtonProps) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      className={`ui-menu-item flex ${collapsed ? 'h-8 w-8 items-center justify-center px-0' : 'h-[38px] w-full items-center gap-2 px-2.5'} ${active ? 'ui-menu-item-active' : 'ui-menu-item-inactive'}`}
      data-testid={testId}
      aria-label={collapsed ? label : undefined}
      hidden={hidden}
    >
      <MaskIcon src={icon} className="h-5 w-5 text-[var(--mask-icon)]" />
      <span className={collapsed ? 'sr-only' : `whitespace-nowrap transition-[opacity,transform] duration-150 ease-out ${revealClassName}`}>
        {label}
      </span>
    </button>
  );

  if (!collapsed || hidden) return button;

  return (
    <OverflowTooltip content={label} forceShow placement="right" className="inline-flex">
      {button}
    </OverflowTooltip>
  );
}

export function ThreadSidebarView(controller: ThreadSidebarControllerResult) {
  const { startDrag } = useDesktopWindowControls();
  const sidebarBrandDragStateRef = useRef<{ isDragging: boolean; startX: number; startY: number }>({
    isDragging: false,
    startX: 0,
    startY: 0,
  });
  const {
    className,
    pathname,
    threads,
    isLoadingThreads,
    getThreadState,
    scrollRegionRef,
    normalizedQuery,
    displayThreadGroups,
    collapsedThreadItems,
    showNoResults,
    activeThreadIdFromRoute,
    existingProjects,
    govHealth,
    pinnedProjects,
    isCollapsed,
    toggleGroup,
    toggleProjectPin,
    handleNewChat,
    handleMenuNavigate,
    handleRename,
    handleDeleteRequest,
    handleTogglePin,
    handleToggleFavorite,
    handleUpdatePreferredAgents,
    handleSelect,
    showPicker,
    createInProject,
    bindWarning,
    filterPanelStyle,
    filterPanelRef,
    filterToggleRef,
    isSidebarCollapsed,
    isSidebarCollapsedLayout,
    sidebarContentRevealClassName,
    toggleSidebarCollapsed,
    searchQuery,
    isSearchOpen,
    showFilter,
    filterOption,
    handleSearchChange,
    handleSearchClear,
    toggleSearch,
    toggleFilter,
    selectFilter,
    deleteTarget,
    deleteTargetSharedCount,
    deleteTargetIsShared,
    deleteWorkspace,
    setDeleteWorkspace,
    closePicker,
    closeDeleteDialog,
    handleDeleteConfirm,
  } = controller;

  const handleSidebarBrandMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    sidebarBrandDragStateRef.current = {
      isDragging: false,
      startX: event.clientX,
      startY: event.clientY,
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const state = sidebarBrandDragStateRef.current;
      if (state.startX === 0 || state.isDragging) return;

      const deltaX = Math.abs(event.clientX - state.startX);
      const deltaY = Math.abs(event.clientY - state.startY);
      if (deltaX <= 5 && deltaY <= 5) return;

      state.isDragging = true;
      startDrag();
    };

    const handleMouseUp = () => {
      sidebarBrandDragStateRef.current = {
        isDragging: false,
        startX: 0,
        startY: 0,
      };
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [startDrag]);

  const isChatMenu = pathname === '/';
  const isModelsMenu = pathname === '/models';
  const isAgentsMenu = pathname === '/agents';
  const isChannelsMenu = pathname === '/channels';
  const isSkillsMenu = pathname === '/skills';
  const isScheduledTasksMenu = pathname === '/schedule';
  const isInspirationMenu = pathname === '/inspiration';
  const menuItems: MenuItem[] = [
    { label: '新建会话', testId: 'sidebar-new-chat', icon: '/icons/menu/new-chat.svg', active: isChatMenu, onClick: handleNewChat },
    { label: '模型', testId: 'sidebar-menu-models', icon: '/icons/menu/models.svg', active: isModelsMenu, onClick: () => handleMenuNavigate('/models') },
    { label: '智能体', testId: 'sidebar-menu-agents', icon: '/icons/menu/agents.svg', active: isAgentsMenu, onClick: () => handleMenuNavigate('/agents') },
    { label: '渠道', testId: 'sidebar-menu-channels', icon: '/icons/menu/channels.svg', active: isChannelsMenu, onClick: () => handleMenuNavigate('/channels') },
    { label: '技能', testId: 'sidebar-menu-skills', icon: '/icons/menu/skills.svg', active: isSkillsMenu, onClick: () => handleMenuNavigate('/skills') },
    { label: '定时任务', testId: 'sidebar-menu-scheduled-tasks', icon: '/icons/menu/schedule.svg', active: isScheduledTasksMenu, onClick: () => handleMenuNavigate('/schedule') },
    { label: '灵感广场', testId: 'sidebar-menu-inspiration', icon: '/icons/menu/inspiration.svg', active: isInspirationMenu, onClick: () => handleMenuNavigate('/inspiration') },
  ];

  const renderThreadItem = (thread: Thread, indented = false, iconOnly = false) => (
    <ThreadItem
      key={thread.id}
      id={thread.id}
      title={thread.title}
      participants={thread.participants}
      lastActiveAt={thread.lastActiveAt}
      isActive={activeThreadIdFromRoute === thread.id}
      onSelect={handleSelect}
      onDelete={handleDeleteRequest}
      onRename={handleRename}
      onTogglePin={handleTogglePin}
      onToggleFavorite={handleToggleFavorite}
      onUpdatePreferredAgents={handleUpdatePreferredAgents}
      isPinned={thread.pinned}
      isFavorited={thread.favorited}
      threadState={getThreadState(thread.id)}
      indented={indented}
      preferredAgentIds={thread.preferredAgentIds}
      invitedExpertIds={thread.invitedExpertIds}
      isHubThread={!!thread.connectorHubState}
      sourceLabel={getThreadSourceLabel(thread)}
      iconOnly={iconOnly}
    />
  );

  const renderGroup = (group: ThreadGroup) => {
    const groupKey = group.projectPath ?? group.type;
    const groupIcon =
      group.type === 'favorites' ? 'star' : group.type === 'archived-container' ? 'archive' : undefined;

    if (group.type === 'archived-container') {
      return (
        <SectionGroup
          key="archived-container"
          label={group.label}
          icon="archive"
          count={group.archivedGroups?.length ?? 0}
          isCollapsed={isCollapsed('archived-container')}
          onToggle={() => toggleGroup('archived-container')}
        >
          {group.archivedGroups?.map((subgroup) => {
            const subgroupKey = subgroup.projectPath ?? subgroup.type;
            return (
              <SectionGroup
                key={subgroupKey}
                label={subgroup.label}
                count={subgroup.threads.length}
                isCollapsed={isCollapsed(subgroupKey)}
                onToggle={() => toggleGroup(subgroupKey)}
                projectPath={subgroup.projectPath}
                governanceStatus={subgroup.projectPath ? govHealth[subgroup.projectPath] : undefined}
                onToggleProjectPin={subgroup.projectPath ? () => toggleProjectPin(subgroup.projectPath!) : undefined}
                isProjectPinned={subgroup.projectPath ? pinnedProjects.has(subgroup.projectPath) : undefined}
              >
                {subgroup.threads.map((thread) => renderThreadItem(thread, true))}
              </SectionGroup>
            );
          })}
        </SectionGroup>
      );
    }

    return (
      <SectionGroup
        key={groupKey}
        label={group.label}
        icon={groupIcon}
        count={group.threads.length}
        isCollapsed={group.type === 'pinned' || group.type === 'recent' ? false : isCollapsed(groupKey)}
        onToggle={group.type === 'pinned' || group.type === 'recent' ? () => { } : () => toggleGroup(groupKey)}
        hideToggle={group.type === 'pinned' || group.type === 'recent'}
        hideCount={group.type === 'pinned' || group.type === 'recent'}
        projectPath={group.projectPath}
        governanceStatus={group.projectPath ? govHealth[group.projectPath] : undefined}
        onToggleProjectPin={group.type === 'project' && group.projectPath ? () => toggleProjectPin(group.projectPath!) : undefined}
        isProjectPinned={group.type === 'project' && group.projectPath ? pinnedProjects.has(group.projectPath) : undefined}
      >
        {group.threads.map((thread) => renderThreadItem(thread, group.type === 'project'))}
      </SectionGroup>
    );
  };

  return (
    <>
      <aside className={getSidebarShellClassName(className, isSidebarCollapsed)} data-testid="thread-sidebar-shell">
        <div
          className={`ui-sidebar-section ui-sidebar-section-no-divider flex ${isSidebarCollapsedLayout
              ? 'flex-col items-center gap-2 px-0 pt-[3px] pb-1'
              : 'items-center justify-between border-0 px-3 py-[14px]'
            }`}
        >
          {isSidebarCollapsed && (
            <div className="flex w-8 flex-col items-center border-b border-[var(--border-default)]">
              <OverflowTooltip content="展开侧边栏" forceShow placement="right" className="inline-flex">
                <button
                  type="button"
                  onClick={toggleSidebarCollapsed}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--menu-hover-bg)] hover:text-[var(--text-primary)]"
                  aria-label="展开侧边栏"
                >
                  <MaskIcon name="arrowRight" className="h-4 w-4" />
                </button>
              </OverflowTooltip>
            </div>
          )}
          {!isSidebarCollapsedLayout && (
            <div className="flex select-none items-center gap-3" onMouseDown={handleSidebarBrandMouseDown} data-testid="thread-sidebar-brand-drag">
              <img src="/images/lobster.svg" alt="OfficeClaw" draggable={false} className="h-[48px] w-[48px] rounded-lg" />
              <span className={`whitespace-nowrap text-[20px] font-semibold leading-none tracking-tight text-[var(--text-primary)] transition-[opacity,transform] duration-150 ease-out ${sidebarContentRevealClassName}`}>
                OfficeClaw
              </span>
            </div>
          )}
          {!isSidebarCollapsedLayout && (
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--menu-hover-bg)] hover:text-[var(--text-primary)]"
              aria-label="收起侧边栏"
              title="收起侧边栏"
            >
              <MaskIcon name="arrowLeft" className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className={`ui-sidebar-section ${isSidebarCollapsedLayout ? 'ui-sidebar-section-no-divider px-0 py-2.5' : 'px-3 py-2.5'}`}>
          <div className={`flex flex-col ${isSidebarCollapsedLayout ? 'items-center gap-0.5' : 'items-start gap-1.5'}`}>
            {menuItems.map((item) => (
              <MenuButton key={item.testId} {...item} collapsed={isSidebarCollapsedLayout} revealClassName={sidebarContentRevealClassName} />
            ))}
          </div>
        </div>

        {isSidebarCollapsedLayout && (
          <div className="mx-auto flex h-6 w-8 items-center justify-center" aria-hidden="true">
            <div className="h-1 w-1 rounded-full bg-[#dbdbdb]" />
          </div>
        )}

        {!isSidebarCollapsedLayout && bindWarning && (
          <div className="ui-status-warning border-b border-[var(--border-default)] px-3 py-1.5 text-[10px]">{bindWarning}</div>
        )}

        {!isSidebarCollapsedLayout && (
          <div className={`relative px-4 pb-1 pt-2 transition-[opacity,transform] duration-150 ease-out ${sidebarContentRevealClassName}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">会话消息</span>
              <div className="flex items-center">
                <button
                  ref={filterToggleRef}
                  type="button"
                  onClick={toggleFilter}
                  className={`rounded p-1 transition-colors ${showFilter || filterOption !== 'all' ? 'text-[var(--text-accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-accent)]'}`}
                  title="筛选会话"
                  data-testid="thread-filter-toggle"
                >
                  <svg className="h-4 w-4 align-middle" viewBox="0 0 16 16" fill="currentColor">
                    <path
                      id="_减去顶层"
                      d="M12.308 1.84961L3.68802 1.84961C3.38802 1.84961 3.09802 1.94961 2.86802 2.13961C2.40802 2.60961 2.26802 3.44961 2.68802 3.96961L5.86802 7.85961L5.86802 13.6396C5.86802 13.9196 6.08802 14.1396 6.36802 14.1396L9.72802 14.1396C9.95802 14.0896 10.138 13.8896 10.138 13.6396L10.138 7.85961L13.328 3.96961C13.518 3.73961 13.618 3.44961 13.618 3.14961C13.618 2.42961 13.028 1.84961 12.308 1.84961ZM12.608 3.14961C12.608 2.97961 12.478 2.84961 12.308 2.84961L3.68802 2.84961C3.61802 2.84961 3.54802 2.86961 3.49802 2.91961C3.36802 3.01961 3.34802 3.20961 3.45802 3.33961L6.74802 7.36961C6.81802 7.45961 6.85802 7.56961 6.85802 7.68961L6.85802 13.1496L9.12802 13.1496L9.12802 7.68961C9.12802 7.59961 9.14802 7.51961 9.19802 7.43961L12.548 3.33961C12.588 3.28961 12.608 3.21961 12.608 3.14961Z"
                      fillRule="evenodd"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={toggleSearch}
                  className={`rounded p-1 transition-colors ${isSearchOpen || normalizedQuery.length > 0 ? 'text-[var(--text-accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-accent)]'}`}
                  title="搜索会话"
                  data-testid="thread-search-toggle"
                >
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path
                      d="M1.72656 7.17676C1.72656 4.13919 4.189 1.67676 7.22656 1.67676C10.2641 1.67676 12.7266 4.13919 12.7266 7.17676C12.7266 8.50784 12.2537 9.72845 11.4668 10.6798L14.2009 13.3786C14.3974 13.5726 14.3995 13.8892 14.2055 14.0857C14.033 14.2604 13.7637 14.2814 13.568 14.1477L10.7625 11.3897C9.80641 12.1929 8.57299 12.6768 7.22656 12.6768C4.189 12.6768 1.72656 10.2143 1.72656 7.17676ZM11.7266 7.17676C11.7266 4.69147 9.71184 2.67676 7.22656 2.67676C4.74128 2.67676 2.72656 4.69147 2.72656 7.17676C2.72656 9.66205 4.74128 11.6768 7.22656 11.6768C9.71184 11.6768 11.7266 9.66205 11.7266 7.17676Z"
                      fillRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {(isSearchOpen || normalizedQuery.length > 0) && (
              <SearchInput
                wrapperClassName="mt-2"
                value={searchQuery}
                onChange={handleSearchChange}
                onClear={handleSearchClear}
                placeholder="搜索会话"
                autoComplete="off"
                aria-label="搜索会话"
              />
            )}

            {showFilter &&
              filterPanelStyle &&
              typeof document !== 'undefined' &&
              createPortal(
                <div ref={filterPanelRef} className="ui-overlay-card fixed z-[99999] w-[200px] rounded-[6px] p-4" style={filterPanelStyle}>
                  <div className="text-[12px] font-[400] leading-[18px] text-[var(--text-label-secondary)]">会话时间</div>
                  <div className="mt-3 flex flex-col">
                    {THREAD_FILTER_OPTIONS.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`block w-full whitespace-nowrap px-3 py-2 text-left text-xs font-[400] leading-[18px] text-[var(--overlay-text)] transition-colors hover:bg-[var(--overlay-item-hover-bg)] focus-visible:bg-[var(--overlay-item-hover-bg)] focus-visible:outline-none ${filterOption === item.key ? 'text-[var(--text-accent)]' : ''}`}
                        style={{ marginBottom: item.key === '6m' ? '0' : '14px' }}
                        onClick={() => selectFilter(item.key)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>,
                document.body,
              )}
          </div>
        )}

        <div
          ref={scrollRegionRef}
          className={`flex-1 overflow-y-auto ${!isSidebarCollapsedLayout ? `transition-[opacity,transform] duration-150 ease-out ${sidebarContentRevealClassName}` : 'ui-sidebar-collapsed-scroll overflow-x-hidden'}`}
          data-testid="thread-sidebar-scroll-region"
        >
          {isLoadingThreads && threads.length === 0 && <div className="py-4 text-center text-xs text-[var(--text-label-secondary)]">加载中..</div>}

          {isSidebarCollapsedLayout ? (
            <div className="flex flex-col items-center gap-1 py-2">{collapsedThreadItems.map((thread) => renderThreadItem(thread, false, true))}</div>
          ) : showNoResults ? (
            <div className="flex h-full min-h-[120px] flex-col items-center justify-center px-3 py-4 text-center text-xs text-[var(--text-label-secondary)]">
              <div className="text-[14px] font-[400] text-[var(--text-primary)]">没有结果</div>
              <div className="mt-1 flex gap-1 text-[12px] font-[400] text-[var(--text-secondary)]">
                请
                <button type="button" onClick={handleNewChat} className="text-[12px] font-[400] text-[var(--text-accent)]">
                  新建会话
                </button>
              </div>
            </div>
          ) : (
            displayThreadGroups.map((group) => renderGroup(group))
          )}
        </div>

        <ThreadSidebarFooter isSidebarCollapsedLayout={isSidebarCollapsedLayout} sidebarContentRevealClassName={sidebarContentRevealClassName} />
      </aside>

      {showPicker && <DirectoryPickerModal existingProjects={existingProjects} onSelect={createInProject} onCancel={closePicker} />}

      <ThreadSidebarDeleteDialog
        deleteTarget={deleteTarget}
        deleteTargetSharedCount={deleteTargetSharedCount}
        deleteTargetIsShared={deleteTargetIsShared}
        deleteWorkspace={deleteWorkspace}
        setDeleteWorkspace={setDeleteWorkspace}
        onClose={closeDeleteDialog}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
