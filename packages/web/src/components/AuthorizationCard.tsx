/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo, useState } from 'react';
import type { AuthPendingRequest, RespondScope } from '@/hooks/useAuthorization';
import { Button } from './shared/Button';

interface AuthorizationCardProps {
  request: AuthPendingRequest;
  onRespond: (requestId: string, granted: boolean, scope: RespondScope, reason?: string) => void | Promise<void>;
  onOpenSecurityManagement?: () => void;
}

type ActionKey = 'allow-once' | 'allow-always' | 'deny';

interface ActionConfig {
  key: ActionKey;
  label: string;
  granted: boolean;
  scope: RespondScope;
  variant?: 'default' | 'danger';
  testId: string;
  className?: string;
}

const CARD_ACTIONS: ActionConfig[] = [
  {
    key: 'allow-once',
    label: '本次允许',
    granted: true,
    scope: 'once',
    testId: 'authorization-card-allow-once',
    variant: 'default',
  },
  {
    key: 'allow-always',
    label: '总是允许',
    granted: true,
    scope: 'global',
    testId: 'authorization-card-allow-always',
    color: 'default',
  },
  {
    key: 'deny',
    label: '拒绝',
    granted: false,
    scope: 'once',
    testId: 'authorization-card-deny',
    variant: 'danger',
  },
];

function parseAuthorizationCopy(reason: string): { title: string | null; body: string } {
  const normalized = reason.replace(/\r\n/g, '\n').trim();
  if (!normalized) return { title: null, body: reason };

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { title: null, body: reason };

  const [title, ...rest] = lines;
  return {
    title: title || null,
    body: rest.join('\n'),
  };
}

export function AuthorizationCard({ request, onRespond, onOpenSecurityManagement }: AuthorizationCardProps) {
  const [submittingAction, setSubmittingAction] = useState<ActionKey | null>(null);
  const parsedCopy = useMemo(() => parseAuthorizationCopy(request.reason), [request.reason]);
  const title = parsedCopy.title ?? request.action;
  const description = parsedCopy.title && parsedCopy.body ? parsedCopy.body : request.reason;

  const activeSubmittingAction = useMemo(
    () => CARD_ACTIONS.find((action) => action.key === submittingAction) ?? null,
    [submittingAction],
  );

  const handleAction = async (action: ActionConfig) => {
    if (submittingAction) return;

    setSubmittingAction(action.key);
    try {
      await Promise.resolve(onRespond(request.requestId, action.granted, action.scope));
      setSubmittingAction(null);
    } catch {
      setSubmittingAction(null);
    }
  };

  return (
    <div
      data-testid="authorization-card"
      className="w-[calc(100%-56px)] max-w-[480px] rounded-[12px] bg-[var(--surface-card-muted)] px-6 py-5 text-[var(--text-primary)]"
      style={{ marginLeft: '56px' }}
    >
      <div className="min-w-0">
        <div data-testid="authorization-card-header" className="flex items-center gap-2">
          <img src="/icons/userprofile/security.svg" alt="" aria-hidden="true" className="h-[20px] w-[20px] shrink-0" />
          <div
            data-testid="authorization-card-title"
            className="min-w-0 flex-1 text-[14px] font-semibold leading-6 text-[var(--text-primary)]"
          >
            {title}
          </div>
        </div>

        <div
          data-testid="authorization-card-description"
          className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-6 text-[var(--text-secondary)]"
        >
          {description}
        </div>
        <p data-testid="authorization-card-helper" className="text-[12px] leading-6 text-[var(--text-secondary)]">
          您可随时在
          <button
            type="button"
            data-testid="authorization-card-security-management"
            onClick={onOpenSecurityManagement}
            className="mx-[1px] inline bg-transparent p-0 text-[12px] leading-6 text-[var(--text-accent)]"
          >
            安全管理
          </button>
          中配置或修改安全策略
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {activeSubmittingAction ? (
          <Button
            variant="default"
            disabled
            data-testid="authorization-card-submitting-action"
          >
            {activeSubmittingAction.label}
          </Button>
        ) : (
          CARD_ACTIONS.map((action) => (
            <Button
              key={action.key}
              variant={action.variant ?? 'default'}
              data-testid={action.testId}
              onClick={() => void handleAction(action)}
              className={action.className}
            >
              {action.label}
            </Button>
          ))
        )}
      </div>
    </div>
  );
}
