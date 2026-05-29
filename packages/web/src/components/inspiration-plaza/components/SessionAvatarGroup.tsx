/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentData } from '@/hooks/useAgentData';
import { API_URL } from '@/utils/api-client';

interface SessionAvatarGroupProps {
  participants: string[];
  getAgentById: (id: string) => AgentData | null | undefined;
  size?: number;
}

interface AvatarData {
  avatarSrc: string;
  color: string;
  displayName: string;
}

function getAvatarInitial(name?: string): string {
  const normalized = (name ?? '').replace(/^@/, '').trim();
  const first = normalized.slice(0, 1);
  return (first || '智').toUpperCase();
}

function isImageAvatar(avatar: string): boolean {
  return /^(https?:\/\/|\/|data:image)/.test(avatar);
}

function getAvatarSrc(avatar: string): string {
  if (!avatar) return '';
  return avatar.startsWith('/uploads/') ? `${API_URL}${avatar}` : avatar;
}

function AvatarCircle({ avatar, size }: { avatar: AvatarData; size: number }) {
  if (isImageAvatar(avatar.avatarSrc)) {
    return (
      <div className="overflow-hidden rounded-full" style={{ width: size, height: size }}>
        <img src={avatar.avatarSrc} alt={avatar.displayName} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center justify-center rounded-full font-semibold text-[var(--thread-avatar-initial-text)]"
      style={{ width: size, height: size, backgroundColor: avatar.color, fontSize: size <= 16 ? 10 : 12 }}
    >
      {getAvatarInitial(avatar.displayName)}
    </div>
  );
}

function getGridPosition(size: number, index: number) {
  const positions = [
    { left: 0, top: 0 },
    { left: size * 0.5, top: 0 },
    { left: 0, top: size * 0.5 },
    { left: size * 0.5, top: size * 0.5 },
  ];
  return positions[index] ?? positions[0]!;
}

export function SessionAvatarGroup({ participants, getAgentById, size = 32 }: SessionAvatarGroupProps) {
  const avatars = participants.slice(0, 4).map((participantId) => {
    const agent = getAgentById(participantId);
    if (!agent) {
      return { avatarSrc: '', color: 'var(--accent-primary)', displayName: participantId };
    }
    return {
      avatarSrc: getAvatarSrc(agent.avatar?.trim() ?? ''),
      color: agent.color?.primary ?? 'var(--accent-primary)',
      displayName: agent.displayName ?? participantId,
    };
  });

  if (avatars.length === 0) {
    return (
      <div className="ui-avatar-fallback-shell shrink-0" style={{ width: size, height: size }}>
        <span className="inline-flex h-full w-full items-center justify-center rounded-full bg-[var(--accent-primary)] text-xs font-semibold text-[var(--thread-avatar-initial-text)]">
          智
        </span>
      </div>
    );
  }

  if (avatars.length === 1) {
    return (
      <div className="shrink-0">
        <AvatarCircle avatar={avatars[0]!} size={size} />
      </div>
    );
  }

  if (avatars.length === 2) {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {avatars.map((avatar, index) => (
          <div key={avatar.displayName} className="absolute top-[6px]" style={{ left: index === 0 ? 1 : 11, zIndex: index === 0 ? 10 : 0 }}>
            <AvatarCircle avatar={avatar} size={size * 0.6} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {avatars.map((avatar, index) => {
        const position = getGridPosition(size, index);
        return (
          <div
            key={`${avatar.displayName}-${index}`}
            className="absolute overflow-hidden rounded-full"
            style={{ width: size * 0.5, height: size * 0.5, left: position.left, top: position.top }}
          >
            <AvatarCircle avatar={avatar} size={size * 0.5} />
          </div>
        );
      })}
    </div>
  );
}
