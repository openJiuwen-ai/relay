/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { type ThemeType } from '@/hooks/useTheme';
import { ModalCloseIcon } from '@/components/icons/SettingsFeedbackIcons';
import { apiFetch } from '@/utils/api-client';
import { AppModal } from './AppModal';
import VersionUpdatePanel, { type VersionInfo } from './VersionUpdatePanel';
import { UserThemePicker } from './UserThemePicker';
import { MaskIcon } from './shared/MaskIcon';
import { ToggleSwitch } from './shared/ToggleSwitch';
import { SearchEngineConfig } from './search-engine-config/SearchEngineConfig';

const AGENT_ARTS_SERVICE_DECLARATION_URL = 'https://www.huaweicloud.com/declaration/agentarts.html';

type SettingsTabId = 'general' | 'memory' | 'search' | 'privacy' | 'about';

const SETTINGS_TABS: Array<{ id: SettingsTabId; label: string; iconSrc: string }> = [
  { id: 'general', label: '通用设置', iconSrc: '/icons/settings-feedback/settings-gear.svg' },
  { id: 'memory', label: '记忆', iconSrc: '/icons/settings-feedback/settings-memory.svg' },
  { id: 'search', label: '搜索引擎', iconSrc: '/icons/settings-feedback/settings-search.svg' },
  { id: 'privacy', label: '隐私与数据', iconSrc: '/icons/settings-feedback/settings-privacy.svg' },
  { id: 'about', label: '关于我们', iconSrc: '/images/information.svg' },
];

interface UserSettingsModalProps {
  open: boolean;
  onClose: () => void;
  keepAwakeEnabled: boolean;
  isKeepAwakeLoading: boolean;
  isKeepAwakeSaving: boolean;
  onToggleKeepAwake: (checked: boolean) => void;
  theme: ThemeType;
  onSelectTheme: (theme: ThemeType) => void;
  onOpenPrivacyDeclaration: () => void;
  /** 切换到「关于我们」时拉取最新版本信息（/api/lastversion） */
  onAboutTabEnter?: () => void;
  versionInfo: VersionInfo | null;
}

type ConfigResponse = {
  config?: {
    memory?: {
      enabled?: unknown;
    };
  };
};

function SettingItem({
  title,
  description,
  switchNode,
}: {
  title: string;
  description?: string;
  switchNode?: ReactNode;
}) {
  return (
    <section>
      <div className='flex items-center justify-between gap-3'>
        <h4 className='min-w-0 flex-1 text-[14px] font-medium leading-[22px] text-[var(--text-primary)]'>{title}</h4>
        {switchNode ?? null}
      </div>
      {description ? <p className='mt-1 text-[12px] leading-[20px] text-[var(--text-secondary)]'>{description}</p> : null}
    </section>
  );
}

export default function UserSettingsModal({
  open,
  onClose,
  keepAwakeEnabled,
  isKeepAwakeLoading,
  isKeepAwakeSaving,
  onToggleKeepAwake,
  theme,
  onSelectTheme,
  onOpenPrivacyDeclaration,
  onAboutTabEnter,
  versionInfo,
}: UserSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [isMemorySaving, setIsMemorySaving] = useState(false);
  const [improveDataEnabled, setImproveDataEnabled] = useState(false);
  /** 停留在「关于我们」时不会重复请求；离开该 tab 后再进入会再拉取一次 */
  const aboutVersionFetchedRef = useRef(false);

  useEscapeKey({ enabled: open, onEscape: onClose });

  useEffect(() => {
    if (!open) return;
    setActiveTab('general');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void apiFetch('/api/config')
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as ConfigResponse;
      })
      .then((data) => {
        const enabled = data?.config?.memory?.enabled;
        if (!cancelled && typeof enabled === 'boolean') {
          setMemoryEnabled(enabled);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      aboutVersionFetchedRef.current = false;
      return;
    }
    if (activeTab !== 'about') {
      aboutVersionFetchedRef.current = false;
      return;
    }
    if (aboutVersionFetchedRef.current) return;
    aboutVersionFetchedRef.current = true;
    onAboutTabEnter?.();
  }, [open, activeTab, onAboutTabEnter]);

  const activeTabLabel = useMemo(
    () => SETTINGS_TABS.find((tab) => tab.id === activeTab)?.label ?? '设置',
    [activeTab],
  );

  const handleMemoryToggle = async (checked: boolean) => {
    const previous = memoryEnabled;
    setMemoryEnabled(checked);
    setIsMemorySaving(true);
    try {
      const response = await apiFetch('/api/handle_memory_toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: checked }),
      });
      if (!response.ok) {
        setMemoryEnabled(previous);
      }
    } catch {
      setMemoryEnabled(previous);
    } finally {
      setIsMemorySaving(false);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      disableBackdropClose
      showCloseButton={false}
      backdropClassName='p-0'
      panelClassName='relative flex max-h-[90vh] w-[900px] min-h-[480px] h-[550px] max-w-[calc(100vw-32px)] flex-col overflow-hidden !p-0 rounded-[12px] bg-[var(--modal-surface)]'
      bodyClassName='flex min-h-0 flex-1 flex-row p-0'
      panelTestId='user-settings-modal'
      bodyTestId='user-settings-modal-body'
      backdropTestId='user-settings-modal-backdrop'
    >
      <button
        type='button'
        onClick={onClose}
        aria-label='关闭设置弹窗'
        className='absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]'
      >
        <ModalCloseIcon className="h-4 w-4" />
      </button>
      <aside className='ui-sidebar-shell flex w-[180px] shrink-0 flex-col self-stretch px-[12px] py-[24px]'>
        <h3 className='px-[12px] text-[18px] font-medium leading-[28px] text-[var(--text-primary)]'>设置</h3>
        <nav className='mt-4 flex flex-col gap-[10px]'>
          {SETTINGS_TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type='button'
                onClick={() => setActiveTab(tab.id)}
                data-testid={`user-settings-tab-${tab.id}`}
                className={`flex h-[38px] w-[156px] items-center text-[var(--text-primary)] gap-2 rounded-[8px] py-[8px] pl-[8px] pr-[12px] text-left text-[14px] leading-[22px] transition-colors ${
                  isActive
                    ? 'bg-[var(--surface-selected)] font-medium'
                    : 'font-normal hover:bg-[var(--surface-neutral-white)]'
                }`}
              >
                <MaskIcon src={tab.iconSrc} className='h-5 w-5 shrink-0 object-contain' />
                <span className='min-w-0 flex-1 truncate'>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <section className='w-[720px] min-h-0 shrink-0 self-stretch bg-[var(--surface-panel)] px-[24px] py-[24px] overflow-hidden'>
        {activeTab !== 'search' && (
            <h3 className='text-[16px] font-medium leading-[24px] text-[var(--text-primary)]'>{activeTabLabel}</h3>
          )}
        <div className={`h-full flex flex-col divide-y divide-[var(--panel-divider)] [&>*]:py-4 [&>*:first-child]:pt-0 ${activeTab === 'search' ? '':'pt-6'} ${activeTab === 'about' ? 'content-center' : ''}`}>
          {activeTab === 'general' ? (
            <>
              <SettingItem
                title='防休眠'
                description='开启后电脑不会进入休眠模式，方便远程操控以及自动化任务持续执行。'
                switchNode={
                  <ToggleSwitch
                    checked={keepAwakeEnabled}
                    onToggle={onToggleKeepAwake}
                    ariaLabel='切换防休眠'
                    disabled={isKeepAwakeLoading || isKeepAwakeSaving}
                    testId='user-settings-keep-awake-switch'
                  />
                }
              />
              <section>
                <h4 className='text-[14px] font-medium leading-[22px] text-[var(--text-primary)]'>主题模式</h4>
                <div className='mt-2'>
                  <UserThemePicker theme={theme} onSelectTheme={onSelectTheme} />
                </div>
              </section>
            </>
          ) : null}

          {activeTab === 'memory' ? (
            <SettingItem
              title='长期记忆'
              description='开启后，大模型会记住你对话中提到的偏好和习惯，提供个性化的回复。'
              switchNode={
                <ToggleSwitch
                  checked={memoryEnabled}
                  onToggle={(checked) => void handleMemoryToggle(checked)}
                  ariaLabel='切换长期记忆'
                  disabled={isMemorySaving}
                  testId='user-settings-memory-switch'
                />
              }
            />
          ) : null}

          {activeTab === 'search' ? (
            <SearchEngineConfig />
          ) : null}

          {activeTab === 'privacy' ? (
            <>
              <section>
                <div className='flex items-center justify-between gap-3'>
                  <h4 className='text-[14px] font-medium leading-[22px] text-[var(--text-primary)]'>
                    数据用于帮助模型改进效果
                  </h4>
                  <ToggleSwitch
                    checked={improveDataEnabled}
                    onToggle={setImproveDataEnabled}
                    ariaLabel='切换数据用于帮助模型改进效果'
                    testId='user-settings-improve-data-switch'
                  />
                </div>
                <p className='mt-1 text-[12px] leading-[20px] text-[var(--text-secondary)]'>
                  开启后，我们将收集您提交的对话内容、OfficeClaw 相应生成的内容及执行链路日志等数据，相关数据会在脱敏处理后用于模型优化和服务改进。您可随时开启或关闭。详情见
                  <button
                    type='button'
                    className='ml-1 cursor-pointer border-none bg-transparent p-0 text-[var(--switch-on-bg)] underline-offset-2 hover:bg-transparent'
                    onClick={() => window.open(AGENT_ARTS_SERVICE_DECLARATION_URL, '_blank', 'noopener,noreferrer')}
                  >
                    《AgentArts服务声明》
                  </button>
                </p>
              </section>
              <div className='flex items-center'>
                <button
                  type='button'
                  onClick={onOpenPrivacyDeclaration}
                  aria-label='打开隐私声明'
                  className='inline-flex items-center gap-1.5 border-none bg-transparent p-0 text-left hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--switch-on-bg)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-panel)]'
                  data-testid='user-settings-privacy-declaration'
                >
                  <span className='text-[14px] font-medium leading-[22px] text-[var(--text-primary)]'>隐私声明</span>
                  <MaskIcon src='/icons/settings-feedback/settings-link.svg' className='h-4 w-4 shrink-0' />
                </button>
              </div>
            </>
          ) : null}

          {activeTab === 'about' ? (
            <VersionUpdatePanel
              variant='embedded'
              active={open && activeTab === 'about'}
              versionInfo={versionInfo}
            />
          ) : null}
        </div>
      </section>
    </AppModal>
  );
}
