/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "./shared/Button";
import { type ThemeType, useTheme } from "@/hooks/useTheme";
import { usePreventSleep } from "@/hooks/usePreventSleep";
import { apiFetch } from "@/utils/api-client";
import { readPublicEnv } from "@/utils/client-env";
import {
  clearAuthIdentity,
  getIsSkipAuth,
  getUserId,
  getUserName,
} from "@/utils/userId";
import { MaskIcon } from "./shared/MaskIcon";
import SecurityManagementModal from "./SecurityManagementModal";
import FeedbackModal from "./FeedbackModal";
import { OverflowTooltip } from "./shared/OverflowTooltip";
import { UsageStatsModal } from "./UsageStatsModal";
import UserSettingsModal from "./UserSettingsModal";

interface VersionInfo {
  curversion: string;
  lastversion: string;
  description: string;
  downloadUrl?: string;
  download_url?: string;
}

function normalizeVersion(version: string): number[] {
  return version
    .trim()
    .replace(/^[^\d]*/, "")
    .split(/[.\-+_]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(a: string, b: string): number {
  const aParts = normalizeVersion(a);
  const bParts = normalizeVersion(b);
  const maxLen = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLen; i += 1) {
    const aVal = aParts[i] ?? 0;
    const bVal = bParts[i] ?? 0;
    if (aVal > bVal) return 1;
    if (aVal < bVal) return -1;
  }

  return 0;
}

interface UserProfileProps {
  className?: string;
  collapsed?: boolean;
}

type CollapsedPanelPosition = {
  left: number;
  bottom: number;
};

const HELP_URL =
  "https://support.huaweicloud.com/officeclaw-agentarts-pc/officeclaw-agentarts-pc-0001.html";
const PRIVACY_DECLARATION_URL =
  "https://www.huaweicloud.com/declaration/sa_prp.html";

const DEFAULT_LOGOUT_URL =
  readPublicEnv('NEXT_PUBLIC_CAS_LOGOUT_URL') ||
  'https://auth.huaweicloud.com/authui/login.html?service=https://auth.huaweicloud.com/authui/v1/oauth2/authorize?';

type LogoutResponse = {
  logoutUrl?: string;
};

async function readLogoutResponse(response: Response): Promise<LogoutResponse | null> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    const data = (await response.json()) as LogoutResponse;
    return data;
  } catch {
    return null;
  }
}

export function UserProfile({ className, collapsed }: UserProfileProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showAboutPanel, setShowAboutPanel] = useState(false);
  const [showUsageStats, setShowUsageStats] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showSecurityManagement, setShowSecurityManagement] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSkipAuth, setIsSkipAuth] = useState(false);
  const [aboutPopoverTop, setAboutPopoverTop] = useState(0);
  const [aboutPopoverLeft, setAboutPopoverLeft] = useState(0);
  const [collapsedPanelPosition, setCollapsedPanelPosition] =
    useState<CollapsedPanelPosition | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const profilePanelRef = useRef<HTMLDivElement>(null);
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const aboutAnchorRef = useRef<HTMLDivElement>(null);
  const aboutPopoverRef = useRef<HTMLDivElement>(null);
  const userId = getUserId();
  const storedUserName = getUserName();
  const { theme, setTheme } = useTheme();
  const {
    enabled: keepAwakeEnabled,
    isLoading: isKeepAwakeLoading,
    isSaving: isKeepAwakeSaving,
    toggle: handleKeepAwakeToggle,
  } = usePreventSleep();

  const checkVersion = useCallback(async () => {
    if (typeof window === "undefined") return;

    try {
      const res = await apiFetch("/api/lastversion");
      if (!res.ok) return;

      const data = (await res.json()) as VersionInfo;
      if (!data?.curversion) return;

      setVersionInfo(data);

      const isNewVersionAvailable =
        !!data.lastversion &&
        !!data.curversion &&
        compareVersions(data.lastversion, data.curversion) > 0;

      if (!isNewVersionAvailable) {
        const taskId = `version-${data.curversion}`;
        try {
          await apiFetch("/api/download/clear", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId }),
          });
        } catch {}
      }
    } catch {}
  }, []);

  const handleAboutTabEnter = useCallback(() => {
    void checkVersion();
  }, [checkVersion]);

  const userName =
    storedUserName || (userId === "default-user" ? "未登录" : userId);
  const avatarLetter = userName.charAt(0).toUpperCase();
  const profileActionClass =
    "ui-overlay-item flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-[14px] font-normal leading-[22px] text-[var(--overlay-text)]";
  const profileSubActionClass =
    "ui-overlay-item flex w-full items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-left text-[14px] font-normal leading-[22px] text-[var(--overlay-text)]";

  const calculatePopoverPosition = (anchorElement: HTMLDivElement | null) => {
    if (!profilePanelRef.current || !anchorElement) return null;

    const profilePanelRect = profilePanelRef.current.getBoundingClientRect();
    const anchorRect = anchorElement.getBoundingClientRect();

    return {
      top: anchorRect.top,
      left: profilePanelRect.right,
    };
  };

  const updateAboutPopoverPosition = () => {
    const position = calculatePopoverPosition(aboutAnchorRef.current);
    if (!position) return;
    setAboutPopoverTop(position.top);
    setAboutPopoverLeft(position.left);
  };

  const updateCollapsedPanelPosition = useCallback(() => {
    if (!collapsed || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setCollapsedPanelPosition({
      left: rect.right + 8,
      bottom: Math.max(8, window.innerHeight - rect.bottom),
    });
  }, [collapsed]);

  const handleTogglePanel = () => {
    setShowPanel((prev) => {
      const next = !prev;
      if (next && collapsed) {
        updateCollapsedPanelPosition();
      }
      if (!next) {
        setShowAboutPanel(false);
      }
      return next;
    });
  };

  const handleOpenUsageStats = () => {
    setShowUsageStats(true);
    setShowAboutPanel(false);
    setShowPanel(false);
  };

  const handleOpenUserSettings = () => {
    setShowUserSettings(true);
    setShowAboutPanel(false);
    setShowPanel(false);
  };

  const handleCloseUserSettings = () => {
    setShowUserSettings(false);
  };

  const handleCloseUsageStats = () => {
    setShowUsageStats(false);
  };

  const handleOpenFeedbackModal = () => {
    setShowFeedbackModal(true);
    setShowAboutPanel(false);
    setShowPanel(false);
  };

  const handleCloseFeedbackModal = () => {
    setShowFeedbackModal(false);
  };

  const handleOpenSecurityManagement = () => {
    setShowSecurityManagement(true);
    setShowAboutPanel(false);
    setShowPanel(false);
  };

  const handleCloseSecurityManagement = () => {
    setShowSecurityManagement(false);
  };

  const handleSelectTheme = (nextTheme: ThemeType) => {
    setTheme(nextTheme);
  };

  const handleOpenHelp = () => {
    window.open(HELP_URL, "_blank", "noopener,noreferrer");
    setShowAboutPanel(false);
    setShowPanel(false);
  };

  const openAboutPanel = () => {
    updateAboutPopoverPosition();
    setShowAboutPanel(true);
  };

  const handleToggleAboutPanel = () => {
    if (showAboutPanel) {
      setShowAboutPanel(false);
      return;
    }
    openAboutPanel();
  };

  const handleOpenPrivacyDeclaration = () => {
    window.open(PRIVACY_DECLARATION_URL, "_blank", "noopener,noreferrer");
    setShowAboutPanel(false);
    setShowPanel(false);
  };

  const finishLogout = (logoutUrl?: string) => {
    clearAuthIdentity();
    setShowAboutPanel(false);
    setShowPanel(false);
    window.location.assign(logoutUrl || DEFAULT_LOGOUT_URL);
  };

  const handleLogout = async () => {
    setIsLoading(true);
    let redirected = false;
    try {
      const response = await apiFetch("/api/logout", {
        method: "POST",
      });

      if (response.ok) {
        const data = await readLogoutResponse(response);
        redirected = true;
        finishLogout(
          typeof data?.logoutUrl === "string" ? data.logoutUrl : undefined,
        );
        return;
      }

      redirected = true;
      finishLogout();
      return;
    } catch (err) {
      console.error("退出登录错误:", err);
      redirected = true;
      finishLogout();
      return;
    } finally {
      if (!redirected) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsideUserProfile =
        panelRef.current?.contains(target) ||
        aboutPopoverRef.current?.contains(target);

      if (!isInsideUserProfile) {
        setShowPanel(false);
        setShowAboutPanel(false);
      }
    };

    if (showPanel || showAboutPanel) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPanel, showAboutPanel]);

  useEffect(() => {
    if (!showPanel || !showAboutPanel) return;

    updateAboutPopoverPosition();

    const handlePositionChange = () => {
      if (showAboutPanel) {
        updateAboutPopoverPosition();
      }
    };

    const scrollElement = panelScrollRef.current;
    window.addEventListener("resize", handlePositionChange);
    scrollElement?.addEventListener("scroll", handlePositionChange, {
      passive: true,
    });

    return () => {
      window.removeEventListener("resize", handlePositionChange);
      scrollElement?.removeEventListener("scroll", handlePositionChange);
    };
  }, [showPanel, showAboutPanel]);

  useEffect(() => {
    if (!showPanel || !collapsed) return;
    updateCollapsedPanelPosition();
    window.addEventListener("resize", updateCollapsedPanelPosition);
    window.addEventListener("scroll", updateCollapsedPanelPosition, true);
    return () => {
      window.removeEventListener("resize", updateCollapsedPanelPosition);
      window.removeEventListener("scroll", updateCollapsedPanelPosition, true);
    };
  }, [collapsed, showPanel, updateCollapsedPanelPosition]);

  useEffect(() => {
    setIsSkipAuth(getIsSkipAuth());
  }, []);

  const collapsedPanelStyle: CSSProperties | undefined =
    collapsed && collapsedPanelPosition
      ? {
          left: collapsedPanelPosition.left,
          bottom: collapsedPanelPosition.bottom,
        }
      : undefined;

  const profileButton = (
    <button
      type="button"
      onClick={handleTogglePanel}
      className={`group border-none flex w-full items-center text-left text-[var(--text-primary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)] ${
        collapsed ? "h-12 justify-center px-0 py-0" : "gap-3 px-3 py-3"
      }`}
      data-testid="user-profile-toggle"
      aria-label={collapsed ? userName : undefined}
    >
      <div
        className={`flex flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-avatar-shell)] ${collapsed ? "h-[20px] w-[20px]" : "h-9 w-9"}`}
      >
        <span
          className={`font-bold text-[var(--text-primary)] ${collapsed ? "text-xs" : "text-sm"}`}
        >
          {avatarLetter}
        </span>
      </div>

      {!collapsed && (
        <>
          <OverflowTooltip content={userName} className="min-w-0 flex-1">
            <div
              data-testid="user-profile-name"
              className="truncate text-[16px] font-medium text-[var(--text-primary)]"
            >
              {userName}
            </div>
          </OverflowTooltip>

          <svg
            className="h-4 w-4 shrink-0 text-[var(--text-primary)] transition-transform"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </>
      )}
    </button>
  );

  return (
    <div className={`border-none relative ${className ?? ""}`} ref={panelRef}>
      {collapsed ? (
        <OverflowTooltip content={userName} forceShow placement="right" className="block">
          {profileButton}
        </OverflowTooltip>
      ) : (
        profileButton
      )}

      {showPanel && (
        <div
          className={`ui-overlay-card z-50 rounded-[var(--radius-lg)] ${
            collapsed
              ? "fixed w-[240px]"
              : "absolute bottom-full left-3 right-3 -mb-[4px]"
          }`}
          style={collapsedPanelStyle}
          data-testid="user-profile-panel"
          ref={profilePanelRef}
        >
          <div
            className="p-4 border-none"
            data-testid="user-profile-panel-scroll"
            ref={panelScrollRef}
          >
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-avatar-shell)]">
                  <span className="text-base font-bold text-[var(--text-primary)]">
                    {avatarLetter}
                  </span>
                </div>
                <OverflowTooltip content={userName} className="min-w-0 flex-1">
                  <div
                    data-testid="user-profile-panel-name"
                    className="truncate text-[16px] font-normal text-[var(--text-primary)]"
                  >
                    {userName}
                  </div>
                </OverflowTooltip>
              </div>
            </div>

            <div className="mb-3 border-t border-[var(--panel-divider)]" />

            <div
              className="space-y-3"
              data-testid="user-profile-content-actions"
            >
              <button
                type="button"
                className={profileActionClass}
                onClick={handleOpenUserSettings}
                data-testid="user-profile-settings-trigger"
              >
                <MaskIcon src="/icons/settings-feedback/settings-gear.svg" className="h-5 w-5 shrink-0" />
                设置
              </button>

              <button
                className={profileActionClass}
                onClick={handleOpenSecurityManagement}
              >
                <MaskIcon src="/icons/userprofile/security.svg" className="h-5 w-5 text-[var(--mask-icon)]" />
                安全管理
              </button>

              <button
                className={profileActionClass}
                onClick={handleOpenUsageStats}
              >
                <MaskIcon src="/icons/userprofile/usage.svg" className="h-5 w-5 text-[var(--mask-icon)]" />
                用量统计
              </button>

              <div
                className="relative"
                data-testid="user-profile-about-anchor"
                ref={aboutAnchorRef}
              >
                <button
                  type="button"
                  className={profileActionClass}
                  onClick={handleToggleAboutPanel}
                  data-testid="user-profile-about-trigger"
                >
                  <span className="flex-1 text-left">帮助与反馈</span>
                  <svg
                    data-testid="user-profile-about-arrow"
                    className="h-4 w-4 shrink-0 text-[var(--overlay-text)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {!isSkipAuth && (
              <>
                <div className="mt-3 border-t border-[var(--panel-divider)]" />
                <Button
                  onClick={handleLogout}
                  disabled={isLoading}
                  variant="default"
                  className="mt-4 h-7 w-full text-[12px]"
                >
                  {isLoading ? "退出中..." : "退出登录"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {showPanel && showAboutPanel && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={aboutPopoverRef}
              className="ui-overlay-card fixed z-[99999] min-w-[180px] rounded-[var(--radius-md)] shadow-[var(--overlay-shadow)]"
              data-testid="user-about-popover"
              style={{
                top: `${aboutPopoverTop}px`,
                left: `${aboutPopoverLeft}px`,
              }}
            >
              <div className="p-[16px]">
                <div className="flex flex-col" data-testid="user-about-options">
                  <button
                    type="button"
                    className={profileSubActionClass + " hidden"}
                    data-testid="user-about-feedback-action"
                    onClick={handleOpenFeedbackModal}
                  >
                    <span className="flex-1 text-left">问题反馈</span>
                  </button>
                  <button
                    type="button"
                    className={profileSubActionClass}
                    data-testid="user-about-help-action"
                    onClick={handleOpenHelp}
                  >
                    <span className="flex-1 text-left">帮助文档</span>
                    <MaskIcon name="link" className="h-4 w-4 shrink-0" />
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {showUsageStats ? (
        <UsageStatsModal
          open={showUsageStats}
          onClose={handleCloseUsageStats}
        />
      ) : null}
      <SecurityManagementModal
        open={showSecurityManagement}
        onClose={handleCloseSecurityManagement}
      />
      <FeedbackModal open={showFeedbackModal} onClose={handleCloseFeedbackModal} />
      <UserSettingsModal
        open={showUserSettings}
        onClose={handleCloseUserSettings}
        keepAwakeEnabled={keepAwakeEnabled}
        isKeepAwakeLoading={isKeepAwakeLoading}
        isKeepAwakeSaving={isKeepAwakeSaving}
        onToggleKeepAwake={handleKeepAwakeToggle}
        theme={theme}
        onSelectTheme={handleSelectTheme}
        onOpenPrivacyDeclaration={handleOpenPrivacyDeclaration}
        onAboutTabEnter={handleAboutTabEnter}
        versionInfo={versionInfo}
      />
    </div>
  );
}
