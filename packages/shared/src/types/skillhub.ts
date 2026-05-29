/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * SkillHub shared types
 */

export interface SkillHubSkill {
  id: string;
  slug: string;
  name: string;
  description: string;
  version?: string;
  tags: string[];
  repo: {
    githubOwner: string;
    githubRepoName: string;
  };
  stars?: number;
  downloads?: number;
}

export interface SkillHubSearchResponse {
  data: SkillHubSkill[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface SkillHubResolveEntry {
  skill: SkillHubSkill;
  score: number;
  confidence: number;
  fetchUrl: string;
}

export interface SkillHubResolveResponse {
  data: SkillHubResolveEntry[];
  query: string;
  tokens: string[];
  matched: number;
  threshold: number;
  ambiguity: string;
}

export interface SkillHubInstallRequest {
  owner: string;
  repo: string;
  skill: string;
  localName?: string;
  description?: string;
  version?: string;
}

export interface SkillHubInstallResult {
  success: boolean;
  name: string;
  localPath: string;
  mounts: Record<string, boolean>;
  error?: string;
}

export interface SkillHubUninstallRequest {
  name: string;
}

export interface InstalledSkillInfo {
  name: string;
  source: 'local' | 'skillhub';
  skillhubUrl?: string;
  installedAt?: string;
}
