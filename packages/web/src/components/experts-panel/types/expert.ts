/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type ExpertCategory = 'all' | 'design' | 'marketing' | 'growth' | 'content';

export const EXPERT_CATEGORY_LABELS: Record<Exclude<ExpertCategory, 'all'>, string> = {
  design: '设计',
  marketing: '市场营销',
  growth: '运营增长',
  content: '内容策略',
};

export interface Expert {
  expertId: string;
  displayName: string;
  nickname: string;
  avatar: string;
  category: 'design' | 'marketing' | 'growth' | 'content';
  mentionPatterns: string[];
  roleDescription: string;
  personality: string;
  strengths: string[];
  skills?: string[];
  visibility: 'public' | 'private';
  defaultModel: string;
  providerProfileId: string;
}

export interface InvitedExpert {
  expertId: string;
  displayName: string;
  nickname: string;
  avatar: string;
  category: 'design' | 'marketing' | 'growth' | 'content';
  mentionPatterns: string[];
  roleDescription: string;
  invitedAt: number;
}

export interface InvitedExpertsResponse {
  threadId: string;
  invitedExperts: InvitedExpert[];
  total: number;
}

export interface DuplicateResponse {
  ok: boolean;
  agent: {
    expertId: string;
    displayName: string;
  };
}

export const EXPERT_CATEGORIES: Array<{ id: ExpertCategory; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'design', label: '设计' },
  { id: 'marketing', label: '市场营销' },
  { id: 'growth', label: '运营增长' },
  { id: 'content', label: '内容策略' },
];