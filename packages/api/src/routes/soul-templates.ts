/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Soul Template Routes (灵魂模板)
 *
 * GET /api/soul-templates → 获取模板列表
 *
 * 模板数据从 soul-templates.json 配置文件加载
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { resolveOfficeClawHostRoot } from '../utils/office-claw-root.js';

export type SoulTemplatesRoutesOptions = {};

export interface SoulTemplate {
  id: string;
  name: string;
  description: string;
  persona: string[];
  behavior: string[];
}

interface ApiTemplate {
  id: string;
  name: string;
  description: string;
  soulTemplate: {
    persona: string[];
    behavior: string[];
  };
}

function toApiTemplate(template: SoulTemplate): ApiTemplate {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    soulTemplate: {
      persona: template.persona,
      behavior: template.behavior || [],
    },
  };
}

interface SoulTemplatesConfig {
  templates: SoulTemplate[];
}

function loadTemplatesFromFile(): SoulTemplate[] {
  try {
    const configPath = resolve(resolveOfficeClawHostRoot(process.cwd()), 'soul-templates.json');
    const content = readFileSync(configPath, 'utf-8');
    const config: SoulTemplatesConfig = JSON.parse(content);
    return config.templates || [];
  } catch (error) {
    console.warn('[soul-templates] 配置文件加载失败，使用空列表', error);
    return [];
  }
}

export const soulTemplatesRoutes: FastifyPluginAsync<SoulTemplatesRoutesOptions> = async (app) => {
  // GET /api/soul-templates - 获取模板列表（每次请求时实时读取）
  app.get('/api/soul-templates', async () => {
    const templates = loadTemplatesFromFile();
    return {
      templates: templates.map(toApiTemplate),
      total: templates.length,
    };
  });
};
