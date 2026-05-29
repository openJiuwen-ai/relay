/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createAgentId,
  officeClawRegistry,
  type OfficeClawConfigEntry,
} from '@openjiuwen/relay-shared';
import { findMonorepoRoot } from '../../../../utils/monorepo-root.js';
import { createModuleLogger } from '../../../../infrastructure/logger.js';

const log = createModuleLogger('expert-catalog');

export interface ExpertConfig {
  expertId: string;
  displayName: string;
  nickname: string;
  avatar: string;
  category: 'design' | 'marketing' | 'growth' | 'content';
  tags: Array<{ label: string; color?: string }>;
  mentionPatterns: string[];
  roleDescription: string;
  personality: string;
  strengths: string[];
  skills?: string[];
  visibility: 'public' | 'private';
  defaultModel: string;
  providerProfileId: string;
}

interface ExpertsJson {
  version: number;
  experts: ExpertConfig[];
}

const EXPERT_PREFIX = 'expert-';
const EXPERT_PROVIDER = 'relayclaw';

const EXPERT_CATEGORY_COLORS: Record<ExpertConfig['category'], { primary: string; secondary: string }> = {
  design: { primary: '#FF6B6B', secondary: '#FFE0E0' },
  marketing: { primary: '#4ECDC4', secondary: '#D8F7F4' },
  growth: { primary: '#45B7D1', secondary: '#D8EFF8' },
  content: { primary: '#96CEB4', secondary: '#DDEFE4' },
};

export class ExpertCatalog {
  private experts: Map<string, ExpertConfig> = new Map();
  private mentionToExpertId: Map<string, string> = new Map();
  private initialized = false;

  load(configPath?: string): void {
    const root = findMonorepoRoot(process.cwd());
    const filePath = configPath ?? resolve(root, 'experts-preset.json');

    if (!existsSync(filePath)) {
      log.warn({ filePath }, '[ExpertCatalog] experts-preset.json not found, expert features will be disabled');
      return;
    }

    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as ExpertsJson;

      if (!parsed.experts || !Array.isArray(parsed.experts)) {
        log.error('[ExpertCatalog] experts-preset.json has invalid format: missing experts array');
        return;
      }

      this.experts.clear();
      this.mentionToExpertId.clear();

      for (const expert of parsed.experts) {
        if (!expert.expertId || !expert.expertId.startsWith(EXPERT_PREFIX)) {
          log.warn({ expertId: expert.expertId }, '[ExpertCatalog] expertId must start with expert- prefix, skipping');
          continue;
        }
        this.experts.set(expert.expertId, expert);
        for (const pattern of expert.mentionPatterns) {
          const normalized = pattern.toLowerCase().replace(/^@/, '');
          this.mentionToExpertId.set(normalized, expert.expertId);
        }
      }

      this.initialized = true;
      log.info({ count: this.experts.size }, '[ExpertCatalog] loaded expert configs');
    } catch (err) {
      log.error({ err, filePath }, '[ExpertCatalog] failed to load experts-preset.json');
    }
  }

  getAllExperts(): ExpertConfig[] {
    return Array.from(this.experts.values());
  }

  getExpertsByCategory(category: string): ExpertConfig[] {
    if (category === 'all') return this.getAllExperts();
    return this.getAllExperts().filter((expert) => expert.category === category);
  }

  getExpert(expertId: string): ExpertConfig | undefined {
    return this.experts.get(expertId);
  }

  isExpert(agentId: string): boolean {
    return this.experts.has(agentId);
  }

  resolveMention(mention: string): string | null {
    const normalized = mention.toLowerCase().replace(/^@/, '');
    return this.mentionToExpertId.get(normalized) ?? null;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}

export function expertConfigToAgentConfig(expert: ExpertConfig): OfficeClawConfigEntry {
  const color = EXPERT_CATEGORY_COLORS[expert.category] ?? EXPERT_CATEGORY_COLORS.content;
  return {
    id: createAgentId(expert.expertId),
    name: expert.displayName,
    displayName: expert.displayName,
    nickname: expert.nickname?.trim() || undefined,
    avatar: expert.avatar,
    color,
    mentionPatterns: [...expert.mentionPatterns],
    accountRef: expert.providerProfileId,
    provider: EXPERT_PROVIDER,
    defaultModel: expert.defaultModel,
    mcpSupport: true,
    breedId: expert.category,
    roleDescription: expert.roleDescription,
    personality: expert.personality,
    strengths: [...expert.strengths],
    skills: expert.skills ? [...expert.skills] : undefined,
    expert: true,
  };
}

export function getExpertAgentConfigs(): Record<string, OfficeClawConfigEntry> {
  const catalog = getExpertCatalog();
  if (!catalog.isInitialized) return {};

  const configs: Record<string, OfficeClawConfigEntry> = {};
  for (const expert of catalog.getAllExperts()) {
    const config = expertConfigToAgentConfig(expert);
    configs[config.id] = config;
  }
  return configs;
}

export function registerExpertAgents(
  registry: Pick<typeof officeClawRegistry, 'has' | 'register'> = officeClawRegistry,
): Record<string, OfficeClawConfigEntry> {
  const registered = getExpertAgentConfigs();
  for (const [id, config] of Object.entries(registered)) {
    if (!registry.has(config.id)) {
      registry.register(id, config);
    }
  }
  return registered;
}

let catalogInstance: ExpertCatalog | null = null;

export function getExpertCatalog(): ExpertCatalog {
  if (!catalogInstance) {
    catalogInstance = new ExpertCatalog();
  }
  return catalogInstance;
}

export function initExpertCatalog(configPath?: string): void {
  getExpertCatalog().load(configPath);
}
