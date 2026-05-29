/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it, vi } from 'vitest';
import type { AgentData } from '@/hooks/useAgentData';
import {
  buildGeneratedAvatarDataUrl,
  agentToCardData,
  filterAgents,
  formatAvatarUrl,
  getRandomPresetAvatar,
  resolveInitialAvatar,
} from '../utils';
import { DEFAULT_PRESET_AVATAR, PRESET_AVATARS } from '../constants';

vi.mock('@/utils/api-client', () => ({
  API_URL: 'http://api.test',
}));

function mockAgent(overrides: Partial<AgentData> = {}): AgentData {
  return {
    id: 'agent-1',
    displayName: '测试智能体',
    name: 'test-agent',
    color: { primary: '#123456', secondary: '#abcdef' },
    mentionPatterns: ['@agent-1'],
    provider: 'openai',
    defaultModel: 'gpt-5',
    avatar: '',
    roleDescription: 'helper',
    personality: 'persona',
    teamStrengths: 'collab',
    source: 'runtime',
    ...overrides,
  };
}

describe('agent-management/utils', () => {
  describe('agentToCardData', () => {
    it('converts AgentData to AgentCardData with displayName', () => {
      const agent = mockAgent();
      const card = agentToCardData(agent);
      expect(card.id).toBe('agent-1');
      expect(card.displayName).toBe('测试智能体');
      expect(card.source).toBe('runtime');
    });

    it('falls back to name when displayName is null', () => {
      const agent = { ...mockAgent(), displayName: null as unknown as string, name: 'test-agent' };
      const card = agentToCardData(agent);
      expect(card.displayName).toBe('test-agent');
    });

    it('falls back to 未命名 when both displayName and name are null', () => {
      const agent = { ...mockAgent(), displayName: null as unknown as string, name: null as unknown as string };
      const card = agentToCardData(agent);
      expect(card.displayName).toBe('未命名');
    });
  });

  describe('filterAgents', () => {
    it('returns all agents when searchQuery is empty', () => {
      const agents = [mockAgent({ id: '1' }), mockAgent({ id: '2' })];
      expect(filterAgents(agents, '')).toHaveLength(2);
      expect(filterAgents(agents, '  ')).toHaveLength(2);
    });

    it('filters agents by displayName case-insensitively', () => {
      const agents = [
        mockAgent({ id: '1', displayName: '测试智能体' }),
        mockAgent({ id: '2', displayName: '另一个智能体' }),
      ];
      expect(filterAgents(agents, '测试')).toHaveLength(1);
      expect(filterAgents(agents, 'test')).toHaveLength(0);
      expect(filterAgents(agents, '智能体')).toHaveLength(2);
    });

    it('returns empty array when no match', () => {
      const agents = [mockAgent({ displayName: '测试智能体' })];
      expect(filterAgents(agents, '不存在')).toHaveLength(0);
    });
  });

  describe('formatAvatarUrl', () => {
    it('prefixes /uploads with API_URL', () => {
      expect(formatAvatarUrl('/uploads/avatar.png')).toBe('http://api.test/uploads/avatar.png');
    });

    it('keeps external URLs unchanged', () => {
      expect(formatAvatarUrl('https://example.com/avatar.png')).toBe('https://example.com/avatar.png');
    });

    it('keeps data URLs unchanged', () => {
      const dataUrl = 'data:image/svg+xml;base64,ABC123';
      expect(formatAvatarUrl(dataUrl)).toBe(dataUrl);
    });

    it('keeps relative paths unchanged', () => {
      expect(formatAvatarUrl('/avatars/agent.png')).toBe('/avatars/agent.png');
    });
  });

  describe('buildGeneratedAvatarDataUrl', () => {
    it('generates valid SVG data URL', () => {
      const dataUrl = buildGeneratedAvatarDataUrl('测试');
      expect(dataUrl.startsWith('data:image/svg+xml;charset=UTF-8,')).toBe(true);
      expect(dataUrl).toContain('%3Csvg');
    });

    it('uses first character as label uppercase', () => {
      const dataUrl = buildGeneratedAvatarDataUrl('assistant');
      expect(dataUrl).toContain('data:image/svg+xml');
      expect(dataUrl).toContain('A');
    });

    it('defaults to 智 when name is empty', () => {
      const dataUrl = buildGeneratedAvatarDataUrl('');
      expect(dataUrl).toContain('data:image/svg+xml');
      expect(dataUrl).toContain('%E6%99%BA');
    });

    it('trims whitespace before extracting first character', () => {
      const dataUrl = buildGeneratedAvatarDataUrl('  hi  ');
      expect(dataUrl).toContain('data:image/svg+xml');
      expect(dataUrl).toContain('H');
    });
  });

  describe('getRandomPresetAvatar', () => {
    it('returns one of the preset avatars', () => {
      const avatar = getRandomPresetAvatar();
      expect(PRESET_AVATARS).toContain(avatar);
    });

    it('is deterministic based on Math.random distribution', () => {
      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        results.add(getRandomPresetAvatar());
      }
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('resolveInitialAvatar', () => {
    it('returns trimmed avatar from member', () => {
      const agent = mockAgent({ avatar: '  /uploads/avatar.png  ' });
      expect(resolveInitialAvatar(agent)).toBe('/uploads/avatar.png');
    });

    it('returns empty string when avatar is empty', () => {
      const agent = mockAgent({ avatar: '' });
      expect(resolveInitialAvatar(agent)).toBe('');
    });

    it('returns empty string for null member', () => {
      expect(resolveInitialAvatar(null)).toBe('');
    });

    it('returns empty string for member with whitespace-only avatar', () => {
      const agent = mockAgent({ avatar: '   ' });
      expect(resolveInitialAvatar(agent)).toBe('');
    });
  });

  describe('constants', () => {
    it('DEFAULT_PRESET_AVATAR equals first preset avatar', () => {
      expect(DEFAULT_PRESET_AVATAR).toBe(PRESET_AVATARS[0]);
    });

    it('PRESET_AVATARS has 9 avatars', () => {
      expect(PRESET_AVATARS).toHaveLength(9);
    });

    it('all preset avatars start with /avatars/', () => {
      PRESET_AVATARS.forEach((avatar) => {
        expect(avatar.startsWith('/avatars/')).toBe(true);
      });
    });
  });
});