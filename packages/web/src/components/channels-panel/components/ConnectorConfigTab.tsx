/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { ActionConfirmModal } from '../../shared/ActionConfirmModal';
import { Button } from '../../shared/Button';
import { CenteredLoadingState } from '../../shared/CenteredLoadingState';
import { HelpPrompt } from '../../shared/HelpPrompt';
import { PasswordField } from '../../shared/PasswordField';
import {
  ConnectorLockIcon,
  DEFAULT_VISUAL,
  ExternalLinkIcon,
  PLATFORM_VISUALS,
  StepBadge,
  WifiIcon,
} from './ConnectorConfigIcons';
import { FeishuPermissionPanel } from './FeishuPermissionPanel';
import { FeishuQrPanel } from './FeishuQrPanel';
import { WeixinQrPanel } from './WeixinQrPanel';

interface PlatformFieldStatus {
  envName: string;
  label: string;
  sensitive: boolean;
  currentValue: string | null;
}

interface PlatformStatus {
  id: string;
  name: string;
  nameEn: string;
  configured: boolean;
  fields: PlatformFieldStatus[];
  docsUrl: string;
  steps: string[];
}

interface ConnectorTestResult {
  ok?: boolean;
  message?: string;
  error?: string;
  details?: string;
  warnings?: string[];
  bot?: {
    openId?: string | null;
    name?: string | null;
  };
}

const QR_ONLY_PLATFORM_IDS = new Set(['feishu', 'weixin']);
const PLATFORM_HELP_LINKS: Record<string, string> = {
  feishu: 'https://support.huaweicloud.com/officeclaw-agentarts-pc/feishu.html',
  weixin: 'https://support.huaweicloud.com/officeclaw-agentarts-pc/weixin.html',
  dingtalk: 'https://support.huaweicloud.com/officeclaw-agentarts-pc/dingtalk.html',
  xiaoyi: 'https://support.huaweicloud.com/officeclaw-agentarts-pc/xiaoyi.html',
};

function readStepText(step: unknown): string | null {
  if (typeof step === 'string') {
    const trimmed = step.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!step || typeof step !== 'object') return null;
  const candidate =
    (step as { text?: unknown; title?: unknown; label?: unknown }).text ??
    (step as { text?: unknown; title?: unknown; label?: unknown }).title ??
    (step as { text?: unknown; title?: unknown; label?: unknown }).label;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePlatform(raw: unknown, index: number): PlatformStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const idRaw = item.id;
  const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : `platform-${index}`;
  const nameRaw = item.name;
  const name = typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : id;
  const nameEnRaw = item.nameEn;
  const nameEn = typeof nameEnRaw === 'string' && nameEnRaw.trim() ? nameEnRaw.trim() : name;
  const docsUrlRaw = item.docsUrl;
  const docsUrl = typeof docsUrlRaw === 'string' ? docsUrlRaw.trim() : '';
  const configured = Boolean(item.configured);

  const fieldsRaw = Array.isArray(item.fields) ? item.fields : [];
  const fields = fieldsRaw.flatMap((field) => {
    if (!field || typeof field !== 'object') return [];
    const current = field as Record<string, unknown>;
    const envNameRaw = current.envName;
    if (typeof envNameRaw !== 'string' || !envNameRaw.trim()) return [];
    const envName = envNameRaw.trim();
    const labelRaw = current.label;
    const label = typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim() : envName;
    const currentValueRaw = current.currentValue;
    const currentValue = typeof currentValueRaw === 'string' ? currentValueRaw : null;
    return [
      {
        envName,
        label,
        sensitive: Boolean(current.sensitive),
        currentValue,
      },
    ];
  });

  const stepsRaw = Array.isArray(item.steps) ? item.steps : [];
  const steps = stepsRaw.flatMap((step) => {
    const normalized = readStepText(step);
    return normalized ? [normalized] : [];
  });

  return {
    id,
    name,
    nameEn,
    configured,
    fields,
    docsUrl,
    steps,
  };
}

function parseDocsLink(rawUrl: string): { href: string; hostname: string } | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return { href: url.toString(), hostname: url.hostname };
  } catch {
    return null;
  }
}

function normalizeConnectorFieldValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function collectConfiguredFieldEntries(
  fields: PlatformFieldStatus[],
  fieldValues: Record<string, string>,
): Array<[string, string]> {
  return fields.flatMap((field) => {
    const value = normalizeConnectorFieldValue(fieldValues[field.envName]);
    return value ? [[field.envName, value]] : [];
  });
}

export function ConnectorConfigTab() {
  const addToast = useToastStore((s) => s.addToast);
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveResult, setSaveResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [confirmDisconnectPlatformId, setConfirmDisconnectPlatformId] = useState<string | null>(null);

  const fetchStatus = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const res = await apiFetch('/api/connector/status');
      if (!res.ok) return;
      const data = await res.json();
      const nextPlatforms = Array.isArray(data?.platforms)
        ? data.platforms
            .map((item: unknown, index: number) => normalizePlatform(item, index))
            .filter((item: unknown): item is PlatformStatus => item !== null)
        : [];
      setPlatforms(nextPlatforms);
    } catch {
      // fall through
    } finally {
      if (background) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (platforms.length === 0) {
      setSelectedPlatformId(null);
      return;
    }
    setSelectedPlatformId((prev) => {
      if (prev && platforms.some((platform) => platform.id === prev)) return prev;
      return platforms[0]?.id ?? null;
    });
  }, [platforms]);

  const handleSelect = (platformId: string) => {
    setSelectedPlatformId(platformId);
    setFieldValues({});
    setSaveResult(null);
  };

  const handleSave = async (platform: PlatformStatus) => {
    const fieldEntries = collectConfiguredFieldEntries(platform.fields, fieldValues);
    const updates = fieldEntries.map(([name, value]) => ({ name, value }));

    if (updates.length === 0) {
      addToast({
        type: 'error',
        title: '保存配置失败',
        message: '请至少填写一项配置',
        duration: 5000,
      });
      return;
    }

    setSaving(true);
    setSaveResult(null);

    if (TESTABLE_PLATFORMS.includes(platform.id)) {
      const payload = Object.fromEntries(fieldEntries);
      const testRes = await apiFetch(`/api/connector/test/${platform.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const testData = (await testRes.json().catch(() => ({}))) as ConnectorTestResult;
      if (!testRes.ok || !testData.ok) {
        setSaving(false);
        addToast({
          type: 'error',
          title: '保存配置失败',
          message: '测试连接不成功，请检查配置是否正确',
          duration: 5000,
        });
        return;
      }
    }

    try {
      const res = await apiFetch('/api/config/env', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast({
          type: 'error',
          title: '保存配置失败',
          message: data.error ?? '保存失败',
          duration: 5000,
        });
        return;
      }
      const data = await res.json().catch(() => ({}));
      const runtime = data?.runtime as
        | {
            applied?: boolean;
            failedConnectors?: Array<{ connectorId?: string; message?: string }>;
          }
        | undefined;
      const failedConnectors = Array.isArray(runtime?.failedConnectors) ? runtime.failedConnectors : [];
      addToast(
        runtime && runtime.applied === false
          ? {
              type: 'error',
              title: '保存配置成功',
              message: `配置已保存，但热生效失败：${failedConnectors
                .map((item) => item.connectorId || 'unknown')
                .join('、')}。请查看 API 日志。`,
              duration: 5000,
            }
          : {
              type: 'success',
              title: '保存配置成功',
              message: '配置已保存并立即生效。',
              duration: 3000,
            },
      );
      setFieldValues({});
      await fetchStatus({ background: true });
    } catch {
      addToast({
        type: 'error',
        title: '保存配置失败',
        message: '网络错误',
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  };

  const TESTABLE_PLATFORMS = ['dingtalk', 'xiaoyi'];

  const handleTestConnection = async (platform: PlatformStatus) => {
    if (!TESTABLE_PLATFORMS.includes(platform.id)) {
      addToast({
        type: 'info',
        title: '测试连接即将上线',
        message: '该平台测试连接功能即将上线',
        duration: 3000,
      });
      return;
    }

    setTesting(true);
    setSaveResult(null);
    try {
      const payload = Object.fromEntries(collectConfiguredFieldEntries(platform.fields, fieldValues));
      const res = await apiFetch(`/api/connector/test/${platform.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as ConnectorTestResult;
      if (!res.ok || !data.ok) {
        const pieces = data.error ?? data.details ?? '测试失败';
        addToast({
          type: 'error',
          title: '测试连接失败',
          message: pieces,
          duration: 5000,
        });
        return;
      }

      const warnings = Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [];
      const warningText = warnings.length > 0 ? `；${warnings.join('；')}` : '';
      // Feishu includes bot info in response
      const botSuffix = data.bot?.name?.trim() || data.bot?.openId?.trim();
      const botText = botSuffix ? ` 已识别 ${botSuffix}` : '';
      addToast({
        type: 'success',
        title: '测试连接成功',
        message: `${data.message ?? '连接测试成功'}${botText}${warningText}`,
        duration: 3000,
      });
    } catch {
      addToast({
        type: 'error',
        title: '测试连接失败',
        message: '网络错误',
        duration: 5000,
      });
    } finally {
      setTesting(false);
    }
  };

  // 断开连接处理
  const handleDisconnect = async (platformId: string) => {
    setDisconnecting(platformId);
    setSaveResult(null);
    try {
      const res = await apiFetch(`/api/connector/${platformId}/disconnect`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast({
          type: 'error',
          title: '断开连接失败',
          message: data.error ?? '断开失败',
          duration: 5000,
        });
        return;
      }
      const data = await res.json().catch(() => ({}));
      const runtime = data?.runtime as { applied?: boolean } | undefined;
      addToast(
        runtime?.applied === false
          ? {
              type: 'error',
              title: '断开连接成功',
              message: '已断开连接，但热生效失败。请查看 API 日志。',
              duration: 5000,
            }
          : {
              type: 'success',
              title: '断开连接成功',
              message: '已断开连接。',
              duration: 3000,
            },
      );
      await fetchStatus({ background: true });
    } catch {
      addToast({
        type: 'error',
        title: '断开连接失败',
        message: '网络错误',
        duration: 5000,
      });
    } finally {
      setDisconnecting(null);
    }
  };

  const handleConfirmDisconnect = () => {
    if (!confirmDisconnectPlatformId) return;
    const platformId = confirmDisconnectPlatformId;
    setConfirmDisconnectPlatformId(null);
    void handleDisconnect(platformId);
  };

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <CenteredLoadingState />
      </div>
    );
  }
  if (platforms.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--text-muted)]">无法加载平台配置信息</p>;
  }

  const selectedPlatform = platforms.find((platform) => platform.id === selectedPlatformId) ?? platforms[0] ?? null;
  const selectedPlatformHelpLink = selectedPlatform
    ? parseDocsLink(PLATFORM_HELP_LINKS[selectedPlatform.id] ?? '')
    : null;

  return (
    <div className="ui-panel flex h-full min-h-0 overflow-hidden">
      <div
        className="h-full w-[322px] shrink-0 space-y-2 overflow-y-auto border-r border-[#f0f0f0] px-4 py-6"
        data-testid="connector-left-pane"
      >
        {platforms.map((platform) => {
          const isSelected = selectedPlatform?.id === platform.id;
          const v = PLATFORM_VISUALS[platform.id] ?? DEFAULT_VISUAL;
          return (
            <button
              key={platform.id}
              type="button"
              onClick={() => handleSelect(platform.id)}
              data-testid={`platform-item-${platform.id}`}
              className="flex w-full items-center gap-3 border px-4 py-3.5 text-left transition-colors [border-radius:var(--connector-tab-radius)]"
              style={{
                borderColor: isSelected
                  ? 'var(--connector-tab-border-selected)'
                  : 'var(--connector-tab-border-default)',
                backgroundColor: isSelected ? 'var(--connector-tab-bg-selected)' : 'var(--connector-tab-bg-default)',
              }}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center">{v.icon}</span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[14px] font-semibold text-[var(--text-primary)]">{platform.name}</span>
                <span
                  className={`ui-status-badge ${platform.configured ? 'ui-status-badge-configured' : 'ui-status-badge-unconfigured'}`}
                >
                  {platform.configured ? '已启用' : '未配置'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="flex h-full min-w-0 flex-1 flex-col gap-6 overflow-auto px-12 py-6"
        data-testid="connector-right-pane"
      >
        <div className="flex items-center gap-[4px]">
          <p className="text-[var(--text-primary)] font-semibold">配置</p>
          {selectedPlatformHelpLink && (
            <HelpPrompt
              href={selectedPlatformHelpLink.href}
              tooltip="查看帮助文档"
              ariaLabel="查看帮助文档"
              testId={`platform-help-link-${selectedPlatform?.id}`}
            />
          )}
        </div>
        {selectedPlatform &&
          (() => {
            const platform = selectedPlatform;
            const guideSteps = platform.steps.slice(0, -1);
            const docsLink = parseDocsLink(platform.docsUrl);
            const saveStepNum = guideSteps.length + 2;

            return (
              <div className="space-y-3.5" data-testid={`platform-card-${platform.id}`}>
                {QR_ONLY_PLATFORM_IDS.has(platform.id) && (
                  <div className="space-y-3.5">
                    {platform.steps.map((step, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <StepBadge num={idx + 1} />
                          <span className="text-[14px]">{step}</span>
                        </div>
                        {idx === 0 && (
                          <div className="ml-[26px]">
                            {platform.id === 'feishu' ? (
                              <FeishuQrPanel
                                configured={platform.configured}
                                onConfirmed={() => void fetchStatus({ background: true })}
                                onDisconnected={() => void fetchStatus({ background: true })}
                              />
                            ) : (
                              <WeixinQrPanel
                                configured={platform.configured}
                                onConfigured={() => fetchStatus({ background: true })}
                                onDisconnected={() => fetchStatus({ background: true })}
                              />
                            )}
                            {/* F152: Feishu permission panel (whitelist) */}
                            {platform.id === 'feishu' && platform.configured && <FeishuPermissionPanel />}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!QR_ONLY_PLATFORM_IDS.has(platform.id) && (
                  <div className="space-y-3.5">
                    {guideSteps.map((step, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <StepBadge num={idx + 1} />
                          <span className="text-[14px]">{step}</span>
                        </div>
                        {idx === 0 && docsLink && (
                          <a
                            href={docsLink.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ui-button-default ml-[26px] inline-flex items-center gap-1.5"
                          >
                            <ExternalLinkIcon />
                            <span>
                              {docsLink.hostname} {'->'} 查看官方文档
                            </span>
                          </a>
                        )}
                      </div>
                    ))}

                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <StepBadge num={guideSteps.length + 1} />
                        <span className="text-[14px]">填写应用凭证</span>
                      </div>
                      <div className="ml-[26px] space-y-4">
                        {platform.fields.map((field) => (
                          <div key={field.envName} className="w-1/2">
                            <label htmlFor={`config-${field.envName}`} className="mb-1 block text-sm">
                              {field.label}
                              {field.sensitive && (
                                <span
                                  className="ml-1 inline-flex align-middle text-[var(--state-warning-text)]"
                                  data-testid={`connector-lock-${platform.id}`}
                                >
                                  <ConnectorLockIcon platformId={platform.id} />
                                </span>
                              )}
                            </label>
                            {field.sensitive ? (
                              <PasswordField
                                id={`config-${field.envName}`}
                                name={`connector-${field.envName}`}
                                placeholder={field.currentValue ? '已设置（输入新值覆盖）' : '未设置'}
                                value={fieldValues[field.envName] ?? ''}
                                onChange={(e) =>
                                  setFieldValues((prev) => ({ ...prev, [field.envName]: e.target.value }))
                                }
                                autoComplete="new-password"
                                autoCapitalize="off"
                                autoCorrect="off"
                                spellCheck={false}
                                data-form-type="other"
                                data-1p-ignore="true"
                                data-lpignore="true"
                                className="ui-input"
                                data-testid={`field-${field.envName}`}
                                toggleTestId={`connector-password-toggle-${field.envName}`}
                              />
                            ) : (
                              <input
                                id={`config-${field.envName}`}
                                type="text"
                                name={`connector-${field.envName}`}
                                placeholder={field.currentValue ?? '未设置'}
                                value={fieldValues[field.envName] ?? ''}
                                onChange={(e) =>
                                  setFieldValues((prev) => ({ ...prev, [field.envName]: e.target.value }))
                                }
                                autoComplete="off"
                                autoCapitalize="off"
                                autoCorrect="off"
                                spellCheck={false}
                                data-form-type="other"
                                data-1p-ignore="true"
                                data-lpignore="true"
                                className="ui-input"
                                data-testid={`field-${field.envName}`}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <StepBadge num={saveStepNum} />
                        <span className="text-[14px]">测试连接并保存</span>
                      </div>
                      {saveResult && (
                        <div
                          className={`ml-[26px] rounded-[var(--radius-md)] px-3 py-2 text-xs ${
                            saveResult.type === 'success' ? 'ui-status-success' : 'ui-status-error'
                          }`}
                          data-testid="save-result"
                        >
                          {saveResult.message}
                        </div>
                      )}
                      <div className="ml-[26px] flex items-center gap-2">
                        <Button
                          variant="default"
                          onClick={() => void handleTestConnection(platform)}
                          disabled={testing || isRefreshing}
                        >
                          <span className="flex items-center gap-1">
                            <WifiIcon />
                            {testing ? '测试中...' : '测试连接'}
                          </span>
                        </Button>
                        <Button
                          variant="major"
                          onClick={() => handleSave(platform)}
                          disabled={saving || isRefreshing}
                          data-testid={`save-${platform.id}`}
                        >
                          {saving ? '保存中...' : '保存配置'}
                        </Button>
                        {platform.configured && (
                          <Button
                            variant="default"
                            onClick={() => setConfirmDisconnectPlatformId(platform.id)}
                            disabled={disconnecting === platform.id || isRefreshing}
                            className="text-red-500 hover:text-red-700"
                            data-testid={`disconnect-${platform.id}`}
                          >
                            {disconnecting === platform.id ? '断开中...' : '断开连接'}
                          </Button>
                        )}
                        <ActionConfirmModal
                          open={confirmDisconnectPlatformId === platform.id}
                          title="断开连接"
                          message="是否确认断开连接？"
                          confirmDisabled={disconnecting === platform.id}
                          modalTestId={`disconnect-${platform.id}-confirm-modal`}
                          confirmTestId={`disconnect-${platform.id}-confirm-submit`}
                          cancelTestId={`disconnect-${platform.id}-confirm-cancel`}
                          onCancel={() => setConfirmDisconnectPlatformId(null)}
                          onConfirm={handleConfirmDisconnect}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
      </div>
    </div>
  );
}
