/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Mass Models Routes — 聚合当前已配置的模型列表
 */

import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { readAcpModelProfiles } from '../config/acp-model-profiles.js';
import {
  HUAWEI_MAAS_MODEL_SOURCE_ID,
  isModelConfigProviderFallbackEnabled,
  readProjectModelConfigBindings,
  resolveProjectModelConfigPath,
} from '../config/model-config-profiles.js';
import { readProviderProfiles } from '../config/provider-profiles.js';
import { resolveProtocolCredential } from '../integrations/protocol-credential-adapter.js';
import { findMonorepoRoot } from '../utils/monorepo-root.js';
import { resolveUserId } from '../utils/request-identity.js';
import {
  type ProviderProfilesRoutesOptions,
  projectQuerySchema,
  resolveProjectRoot,
} from './provider-profiles.shared.js';

export interface MassModelInfo {
  id: string;
  name: string;
  provider: string;
  accountRef?: string;
  kind: 'provider' | 'acp';
  protocol?: string;
  enabled: boolean;
  description?: string;
  labels?: string[]; // 标签
  developer?: string; // 提供者
  icon?: string; // 图标 URL
  baseUrl?: string;
  accessMode?: 'huawei_maas_access';
  serviceType?: 'maas' | 'claw-plan';
}

export interface MassModelsResponse {
  projectPath: string;
  models: MassModelInfo[];
}

function shouldRefreshFromHeaders(headers: Record<string, unknown>): boolean {
  const raw = headers['x-refresh'];
  if (Array.isArray(raw)) {
    return raw.some((value) => typeof value === 'string' && /^(1|true)$/i.test(value.trim()));
  }
  return typeof raw === 'string' && /^(1|true)$/i.test(raw.trim());
}

const queryModelsBodySchema = z
  .object({
    baseUrl: z.string().trim().min(1),
    apiKey: z.string().trim().min(1),
  })
  .strict();

function normalizeModelQueryItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
}

function isBlockedLocalModelHost(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function toQueriedModelList(payload: Record<string, unknown>): Array<{ id: string; name: string; object: string }> {
  const rawModels = normalizeModelQueryItems(payload.data ?? payload.models);
  return rawModels
    .map((item) => {
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id;
      const object = typeof item.object === 'string' && item.object.trim() ? item.object.trim() : 'model';
      return { id, name, object };
    })
    .filter((item) => item.id);
}

const MAAS_MAP: Record<string, Partial<MassModelInfo>> = {
  'deepseek-r1-250528': {
    name: 'DeepSeek-R1-0528',
    description:
      'DeepSeek-R1是一款高效智能体模型，具备强大的长文本处理能力和卓越的成本效益，助力企业实现更智能化的应用。',
    labels: ['文本生成', 'Function Call', '深度思考', '128K'],
    developer: 'DeepSeek',
    icon: '/images/deepseek.svg',
  },
  'DeepSeek-V3': {
    name: 'DeepSeek-V3',
    description: 'DeepSeek-V3 是一款高性能的 AI 语言模型，专为复杂任务设计，具备强大的文本理解和生成能力。',
    labels: ['文本生成', 'Function Call', '128K'],
    developer: 'DeepSeek',
    icon: '/images/deepseek.svg',
  },
  'deepseek-v3.1-terminus': {
    name: 'DeepSeek-V3.1-128K',
    description: 'DeepSeek-V3.1 是在 DeepSeek-V3.1-Base 的基础上进行后训练得到的。',
    labels: ['文本生成', 'Function Call', '深度思考', '128K'],
    developer: 'DeepSeek',
    icon: '/images/deepseek.svg',
  },
  'deepseek-v3.2': {
    name: 'DeepSeek-V3.2',
    description:
      'DeepSeek-V3.2 是一款在计算效率与出色推理及代理能力之间实现出色平衡的模型，整体性能达到了 GPT-5 的水平。',
    labels: ['文本生成', 'Function Call', '深度思考', '160K'],
    developer: 'DeepSeek',
    icon: '/images/deepseek.svg',
  },
  'glm-5': {
    name: 'GLM-5',
    description:
      'GLM-5 在各类学术基准测试中实现了显著提升，并在全球所有开源模型中，在推理、编程和智能体任务方面达到顶尖水平。',
    labels: ['文本生成', 'Function Call', '深度思考', '198K'],
    developer: '智谱.AI',
    icon: '/images/zhipu.svg',
  },
  'glm-5.1': {
    name: 'GLM-5.1',
    description:
      'GLM-5.1 是智谱最新旗舰模型，代码能力大大增强，长程任务显著提升，能够在单次任务中持续、自主地工作长达 8 小时，完成从规划、执行到迭代优化的完整闭环，交付工程级成果。',
    labels: ['文本生成', 'Function Call', '深度思考', '198K'],
    developer: '智谱.AI',
    icon: '/images/zhipu.svg',
  },
  'Kimi-K2': {
    name: 'Kimi-K2',
    description: 'Kimi K2 是一款先进的混合专家（MoE）语言模型，拥有 320 亿激活参数和 1 万亿总参数。',
    labels: ['文本生成', 'Function Call', '128K'],
    developer: 'Kimi',
    icon: '/images/kimi.svg',
  },
  'longcat-flash-chat': {
    name: 'LongCat-Flash-Chat',
    description:
      '美团LongCat-Flash-Chat，采用高效 MoE 架构，总参数 560B ，激活仅需 18.6B-31.3B ，推理效率更高，适配复杂智能体应用。',
    labels: ['文本生成', 'Function Call', '128K'],
    developer: '美团龙猫',
    icon: '/avatars/assistant.svg',
  },
  'qwen3-235b-a22b': {
    name: 'Qwen3-235B-A22B',
    description:
      'Qwen3-235B-A22B是一款因果语言模型，拥有总计2,350亿参数，其中激活220亿参数，非嵌入参数达2,340亿，包含94层结构。',
    labels: ['文本生成', '深度思考', 'Function Call', '128K'],
    developer: '通义千问',
    icon: '/images/qwen.svg',
  },
  'qwen3-32b': {
    name: 'Qwen3-32B',
    description:
      'Qwen3-32B是一款因果语言模型，拥有328亿参数，其中非嵌入参数为312亿，包含64层结构，采用GQA架构，Q有64个注意力头，KV有8个注意力头。',
    labels: ['文本生成', '深度思考', '128K'],
    developer: '通义千问',
    icon: '/images/qwen.svg',
  },
  'qwen3-coder-480b-a35b-instruct': {
    name: 'Qwen3-Coder-480B-A35B-Instruct',
    description: 'Qwen3-Coder在Agent编码、Agent浏览器使用和其他基础编码任务中表现出色，成绩可媲美Claude Sonnet。',
    labels: ['文本生成', 'Function Call', '128K'],
    developer: '通义千问',
    icon: '/images/qwen.svg',
  },
  'qwen3-30b-a3b': {
    name: 'Qwen3-30B-A3B-128K',
    description: 'Qwen3-30B-A3B是一款因果语言模型，拥有总共305亿参数，其中激活33亿参数，非嵌入参数为299亿。',
    labels: ['文本生成', '深度思考', '128K'],
    developer: '通义千问',
    icon: '/images/qwen.svg',
  },
};

export const MAAS_MODEL_WHITELIST = [
  'GLM-5',
  'GLM-5.1',
  'DeepSeek-V3.2',
] as const;

const MAAS_MODEL_WHITELIST_SET = new Set<string>(MAAS_MODEL_WHITELIST);
const MAAS_MODEL_WHITELIST_INDEX = new Map<string, number>(MAAS_MODEL_WHITELIST.map((name, index) => [name, index]));
function normalizeModelList(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  }
  return [];
}

function uniqueById(models: MassModelInfo[]): MassModelInfo[] {
  const seen = new Set<string>();
  return models.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function uniquePayloadById(models: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  return models.filter((item, index) => {
    const rawId = item.id;
    const id = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : `index:${index}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function toMassModelList(models: Array<Record<string, unknown>>): MassModelInfo[] {
  return models.map((item, index) => {
    const rawId = item.id;
    const rawName = item.name;
    const rawDescription = item.description ?? item.descriptionssss ?? item.desc;
    const modelId = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : `maas:${index}`;
    const name =
      typeof rawName === 'string' && rawName.trim()
        ? rawName.trim()
        : typeof rawId === 'string' && rawId.trim()
          ? rawId.trim()
          : modelId;
    return {
      ...item,
      id: `model_config:${HUAWEI_MAAS_MODEL_SOURCE_ID}:${modelId}`,
      name,
      provider: 'Huawei MaaS',
      accountRef: HUAWEI_MAAS_MODEL_SOURCE_ID,
      kind: 'provider',
      protocol: 'huawei_maas',
      enabled: true,
      ...(typeof rawDescription === 'string' && rawDescription.trim() ? { description: rawDescription.trim() } : {}),
      ...(MAAS_MAP[rawId as string] ?? {}),
    } satisfies MassModelInfo;
  });
}

export function filterMaaSModelsByWhitelist(models: MassModelInfo[]): MassModelInfo[] {
  return models
    .filter((model) => MAAS_MODEL_WHITELIST_SET.has(model.name))
    .sort((left, right) => {
      const leftIndex = MAAS_MODEL_WHITELIST_INDEX.get(left.name) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = MAAS_MODEL_WHITELIST_INDEX.get(right.name) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
}

function toConfiguredModelList(
  bindings: Array<{
    id: string;
    models: string[];
    displayName?: string;
    description?: string;
    icon?: string;
    protocol?: string;
    baseUrl?: string;
    accessMode?: 'huawei_maas_access';
    serviceType?: 'maas' | 'claw-plan';
  }>,
): MassModelInfo[] {
  return bindings.flatMap((binding) =>
    binding.models.map((modelName) => ({
      id: `model_config:${binding.id}:${modelName}`,
      name: modelName,
      provider: binding.protocol === 'huawei_maas' ? 'Huawei MaaS' : binding.displayName?.trim() || binding.id,
      accountRef: binding.id,
      kind: 'provider' as const,
      ...(binding.protocol ? { protocol: binding.protocol } : {}),
      enabled: true,
      ...(binding.baseUrl ? { baseUrl: binding.baseUrl } : {}),
      ...(binding.accessMode ? { accessMode: binding.accessMode } : {}),
      ...(binding.serviceType ? { serviceType: binding.serviceType } : {}),
      description:
        binding.protocol === 'huawei_maas'
          ? '来自 ~/.office-claw/model.json'
          : binding.description?.trim(),
      ...(binding.icon ? { icon: binding.icon } : {}),
    })),
  );
}

async function readCachedMaaSModels(modelJsonPath: string): Promise<Array<Record<string, unknown>>> {
  const modelJsonRaw = await readFile(modelJsonPath, 'utf-8');
  if (!modelJsonRaw.trim()) return [];
  const parsed = JSON.parse(modelJsonRaw) as Record<string, unknown>;
  return normalizeModelList(parsed[HUAWEI_MAAS_MODEL_SOURCE_ID]);
}

async function readCachedModelConfig(modelJsonPath: string): Promise<Record<string, unknown>> {
  const modelJsonRaw = await readFile(modelJsonPath, 'utf-8');
  if (!modelJsonRaw.trim()) return {};
  const parsed = JSON.parse(modelJsonRaw) as unknown;
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? { ...(parsed as Record<string, unknown>) }
    : {};
}

async function aggregateConfiguredModels(projectRoot: string): Promise<MassModelsResponse> {
  const [providerProfiles, acpModelProfiles] = await Promise.all([
    readProviderProfiles(projectRoot),
    readAcpModelProfiles(projectRoot),
  ]);

  const providerModels = providerProfiles.providers.flatMap((profile) =>
    (profile.models ?? []).map((modelName) => ({
      id: `provider:${profile.id}:${modelName}`,
      name: modelName,
      provider: profile.displayName,
      kind: 'provider' as const,
      ...(profile.protocol ? { protocol: profile.protocol } : {}),
      enabled: true,
      description: `来自 ${profile.displayName}`,
    })),
  );

  const acpModels = acpModelProfiles.profiles.map((profile) => ({
    id: `acp:${profile.id}:${profile.model}`,
    name: profile.model,
    provider: profile.displayName,
    kind: 'acp' as const,
    ...(profile.provider ? { protocol: profile.provider } : {}),
    enabled: true,
    description: `ACP Model Profile · ${profile.displayName}`,
  }));

  return {
    projectPath: projectRoot,
    models: uniqueById([...providerModels, ...acpModels]),
  };
}

export const maasModelsRoutes: FastifyPluginAsync<ProviderProfilesRoutesOptions> = async (app, opts) => {
  const fetchImpl = opts.fetchImpl ?? fetch;

  const handleListModels = async (request: any, reply: any) => {
    const parsed = projectQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid query', details: parsed.error.issues };
    }

    const projectRoot = await resolveProjectRoot(parsed.data.projectPath);
    if (!projectRoot) {
      reply.status(400);
      return { error: 'Invalid project path: must be an existing directory under allowed roots' };
    }

    const modelJsonPath = resolveProjectModelConfigPath(projectRoot);
    const modelConfigBindings = (await readProjectModelConfigBindings(projectRoot)) ?? [];
    const configuredNonHuaweiModels = toConfiguredModelList(
      modelConfigBindings.filter((binding) => binding.protocol !== 'huawei_maas'),
    );
    const shouldRefresh = shouldRefreshFromHeaders(request.headers as Record<string, unknown>);

    if (!shouldRefresh) {
      try {
        const cachedModels = await readCachedMaaSModels(modelJsonPath);
        if (cachedModels.length > 0) {
          const filteredMaaSModels = filterMaaSModelsByWhitelist(toMassModelList(cachedModels));
          return {
            success: true,
            list: [...filteredMaaSModels, ...configuredNonHuaweiModels],
            projectPath: projectRoot,
          };
        }
      } catch (readError) {
        if ((readError as { code?: string })?.code !== 'ENOENT') {
          console.warn('读取 model.json 失败，继续调用远程接口:', readError);
        }
      }
    }

    const userId = resolveUserId(request);
    if (userId) {
      try {
        const runtimeConfig = resolveProtocolCredential('huawei_maas', userId);
        if (!runtimeConfig) throw new Error('huawei_maas credential not available');
        const modelResponse = await fetchImpl(`${runtimeConfig.baseUrl}/models`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json;charset=utf8',
            ...runtimeConfig.defaultHeaders,
          },
        });

        if (!modelResponse.ok) {
          throw new Error(`${modelResponse.status}`);
        }

        const data = (await modelResponse.json()) as Record<string, unknown>;
        const incomingModels = normalizeModelList(data.data);
        let existingModels: Array<Record<string, unknown>> = [];

        await mkdir(dirname(modelJsonPath), { recursive: true });
        let existingConfig: Record<string, unknown> = {};
        try {
          existingConfig = await readCachedModelConfig(modelJsonPath);
          existingModels = await readCachedMaaSModels(modelJsonPath);
        } catch (readError) {
          if ((readError as { code?: string })?.code !== 'ENOENT') {
            console.warn('读取 model.json 失败，将以新数据继续写入:', readError);
          }
        }

        const mergedModels = uniquePayloadById([...existingModels, ...incomingModels]);
        await writeFile(
          modelJsonPath,
          `${JSON.stringify({ ...existingConfig, [HUAWEI_MAAS_MODEL_SOURCE_ID]: mergedModels }, null, 2)}\n`,
          'utf-8',
        );
        const filteredMaaSModels = filterMaaSModelsByWhitelist(toMassModelList(incomingModels));
        return {
          success: true,
          list: [...filteredMaaSModels, ...configuredNonHuaweiModels],
          projectPath: projectRoot,
        };
      } catch (error) {
        console.error('获取 Huawei MaaS 模型失败，将回退到本地聚合模型列表:', error);
      }
    }

    if (configuredNonHuaweiModels.length > 0) {
      return {
        success: true,
        list: configuredNonHuaweiModels,
        projectPath: projectRoot,
      };
    }

    if (isModelConfigProviderFallbackEnabled()) {
      return await aggregateConfiguredModels(projectRoot);
    }

    return {
      projectPath: projectRoot,
      models: [],
    } satisfies MassModelsResponse;
  };

  app.get('/api/maas-models', handleListModels);

  app.post('/api/maas-models-query', async (request, reply) => {
    const parsed = queryModelsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Missing baseUrl or apiKey', details: parsed.error.issues };
    }

    let modelUrl: URL;
    try {
      const normalizedBaseUrl = parsed.data.baseUrl.replace(/\/+$/, '');
      modelUrl = new URL(`${normalizedBaseUrl}/v2/models`);
    } catch {
      reply.status(400);
      return { error: 'Invalid baseUrl' };
    }

    if (isBlockedLocalModelHost(modelUrl)) {
      reply.status(400);
      return { error: 'Invalid baseUrl: localhost is not allowed' };
    }

    request.log.info({ baseUrlHost: modelUrl.host }, 'maas_models_query_started');

    try {
      const response = await fetchImpl(modelUrl.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${parsed.data.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        request.log.warn({ statusCode: response.status, baseUrlHost: modelUrl.host }, 'maas_models_query_failed');
        reply.status(response.status);
        return { error: `HTTP ${response.status}: ${errorBody}` };
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const models = toQueriedModelList(payload);
      request.log.info({ baseUrlHost: modelUrl.host, modelCount: models.length }, 'maas_models_query_success');
      return { models };
    } catch (error) {
      request.log.warn({ err: error, baseUrlHost: modelUrl.host }, 'maas_models_query_failed');
      reply.status(500);
      return { error: error instanceof Error ? error.message : 'Query failed' };
    }
  });

  app.post('/api/maas-test-connection', async (request, reply) => {
    const { baseUrl, apiKey, model } = request.body as {
      baseUrl?: string;
      apiKey?: string;
      model?: string;
    };

    if (!baseUrl || !apiKey) {
      reply.status(400);
      return { error: 'Missing baseUrl or apiKey' };
    }

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'default',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        reply.status(res.status);
        return { error: `HTTP ${res.status}: ${errorBody}` };
      }

      return { success: true };
    } catch (error) {
      reply.status(500);
      return { error: error instanceof Error ? error.message : 'Connection failed' };
    }
  });

  app.post('/api/maas-send', async (_request, reply) => {
    reply.status(410);
    return {
      error: 'OfficeClaw no longer proxies Huawei MaaS model calls. Runtime auth is passed to downstream agents.',
    };
  });
};
