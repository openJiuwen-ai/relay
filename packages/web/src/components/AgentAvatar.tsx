/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo, useState } from 'react';
import { useAgentData } from '@/hooks/useAgentData';
import { useExpertCatalog } from '@/hooks/useExpertCatalog';
import { hexToRgba } from '@/lib/color-utils';
import { API_URL } from '@/utils/api-client';
import type { AgentStreamStatus } from '@/components/status-helpers';

interface AgentAvatarProps {
  agentId: string;
  size?: number;
  status?: AgentStreamStatus;
  showRing?: boolean;
}

function agentAvatarInitial(name?: string): string {
  const normalized = (name ?? '').replace(/^@/, '').trim();
  const first = normalized.slice(0, 1);
  return (first || '智').toUpperCase();
}

function isImageAvatarSrc(src: string): boolean {
  return /^(https?:\/\/|\/|data:image)/.test(src);
}

export function AgentAvatar({ agentId, size = 32, status, showRing = false }: AgentAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const { getAgentById } = useAgentData();
  const { getExpertById } = useExpertCatalog();
  const rowAgent = getAgentById(agentId);
  const expert = rowAgent ? null : getExpertById(agentId);
  const resolvedAgent = rowAgent ?? expert;

  const isStreaming = status === 'streaming';
  const isError = status === 'error';
  const ringColor = resolvedAgent?.color.primary ?? '#9CA3AF';
  const glowShadow = isStreaming && resolvedAgent ? `0 0 10px ${hexToRgba(ringColor, 0.5)}` : undefined;

  const { avatarRaw, resolvedSrc, showImage } = useMemo(() => {
    const raw = resolvedAgent?.avatar?.trim() ?? '';
    const fallbackPath = `/avatars/${agentId}.png`;
    const base = raw || fallbackPath;
    const resolved = base.startsWith('/uploads/') ? `${API_URL}${base}` : base;
    const image = isImageAvatarSrc(resolved);
    return { avatarRaw: raw, resolvedSrc: resolved, showImage: image };
  }, [resolvedAgent?.avatar, agentId]);

  const fontSize = size <= 16 ? 10 : size <= 24 ? 11 : 12;

  return (
    <div
      className={`answer-avatar rounded-full flex-shrink-0 flex items-center justify-center transition-shadow duration-300 overflow-hidden ${
        showRing ? 'ring-2 ' : ''
      }${isStreaming ? 'animate-pulse' : ''}`}
      style={{
        width: size,
        height: size,
        ['--tw-ring-color' as string]: isError ? '#ef4444' : ringColor,
        boxShadow: glowShadow,
      }}
    >
      {showImage && !imgError ? (
        <img
          src={resolvedSrc}
          alt={resolvedAgent?.displayName ?? agentId}
          width={size}
          height={size}
          className="h-full w-full object-cover bg-gray-100"
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{
            backgroundColor: resolvedAgent?.color?.primary ?? '#7AAEFF',
            fontSize,
            lineHeight: 1,
          }}
          aria-hidden={showImage ? true : undefined}
          title={resolvedAgent?.displayName ?? agentId}
        >
          {showImage && imgError
            ? agentAvatarInitial(resolvedAgent?.displayName ?? agentId)
            : avatarRaw || agentAvatarInitial(resolvedAgent?.displayName ?? agentId)}
        </div>
      )}
    </div>
  );
}
