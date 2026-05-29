/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CredentialResolutionContext } from '@openjiuwen/relay-core';
import { createModuleLogger } from '../../infrastructure/logger.js';
import { tcpProbe } from '../../utils/tcp-probe.js';

const log = createModuleLogger('protocol-credential-helpers');

function deriveProxySlug(profileId: string): string {
  const match = profileId.match(/^profile-([a-f0-9]+)/);
  return match?.[1] ?? profileId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function registerProxyUpstream(projectRoot: string, slug: string, targetUrl: string): void {
  const dir = resolve(projectRoot, '.office-claw');
  const filePath = resolve(dir, 'proxy-upstreams.json');
  let upstreams: Record<string, string> = {};
  try {
    if (existsSync(filePath)) {
      upstreams = JSON.parse(readFileSync(filePath, 'utf-8'));
    }
  } catch {
    /* start fresh */
  }
  if (upstreams[slug] === targetUrl) return;
  upstreams[slug] = targetUrl;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(upstreams, null, 2)}\n`);
}

export async function buildAnthropicProtocolEnv(ctx: CredentialResolutionContext): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  const { resolvedAccount, defaultModel, configProjectRoot } = ctx;

  if (resolvedAccount?.authType === 'api_key') {
    env.OFFICE_CLAW_ANTHROPIC_PROFILE_MODE = 'api_key';
    if (resolvedAccount.apiKey) env.OFFICE_CLAW_ANTHROPIC_API_KEY = resolvedAccount.apiKey;
    if (defaultModel) env.OFFICE_CLAW_ANTHROPIC_MODEL_OVERRIDE = defaultModel;
    if (resolvedAccount.baseUrl) {
      const proxyPortStr = process.env.ANTHROPIC_PROXY_PORT || '9877';
      const proxyPortNum = parseInt(proxyPortStr, 10);
      const proxyEnabled = process.env.ANTHROPIC_PROXY_ENABLED !== '0';
      if (proxyEnabled && !Number.isNaN(proxyPortNum) && proxyPortNum > 0 && proxyPortNum <= 65535) {
        const proxyAlive = await tcpProbe('127.0.0.1', proxyPortNum);
        if (proxyAlive) {
          const slug = deriveProxySlug(resolvedAccount.id);
          registerProxyUpstream(configProjectRoot, slug, resolvedAccount.baseUrl);
          env.OFFICE_CLAW_ANTHROPIC_BASE_URL = `http://127.0.0.1:${proxyPortStr}/${slug}`;
        } else {
          log.warn(
            { proxyPort: proxyPortStr, baseUrl: resolvedAccount.baseUrl },
            'Proxy unreachable, falling back to direct upstream',
          );
          env.OFFICE_CLAW_ANTHROPIC_BASE_URL = resolvedAccount.baseUrl;
        }
      } else {
        if (proxyEnabled && (Number.isNaN(proxyPortNum) || proxyPortNum <= 0 || proxyPortNum > 65535)) {
          log.warn({ proxyPort: proxyPortStr }, 'Invalid ANTHROPIC_PROXY_PORT, falling back to direct upstream');
        }
        env.OFFICE_CLAW_ANTHROPIC_BASE_URL = resolvedAccount.baseUrl;
      }
    }
  } else {
    env.OFFICE_CLAW_ANTHROPIC_PROFILE_MODE = 'subscription';
  }
  return env;
}

export function buildOpenAiProtocolEnv(ctx: CredentialResolutionContext): Record<string, string> {
  const env: Record<string, string> = {};
  const { resolvedAccount, modelConfigBinding } = ctx;

  if (modelConfigBinding?.protocol === 'openai') {
    env.CODEX_AUTH_MODE = 'api_key';
    if (modelConfigBinding.apiKey) {
      env.OPENAI_API_KEY = modelConfigBinding.apiKey;
      env.OPENROUTER_API_KEY = modelConfigBinding.apiKey;
    }
    if (modelConfigBinding.baseUrl) {
      env.OPENAI_BASE_URL = modelConfigBinding.baseUrl;
      env.OPENAI_API_BASE = modelConfigBinding.baseUrl;
    }
    if (modelConfigBinding.headers && Object.keys(modelConfigBinding.headers).length > 0) {
      const headersJson = JSON.stringify(modelConfigBinding.headers);
      env.OPENAI_DEFAULT_HEADERS = headersJson;
      env.default_headers = headersJson;
    }
  } else if (resolvedAccount?.authType === 'api_key') {
    env.CODEX_AUTH_MODE = 'api_key';
    if (resolvedAccount.apiKey) {
      env.OPENAI_API_KEY = resolvedAccount.apiKey;
      env.OPENROUTER_API_KEY = resolvedAccount.apiKey;
    }
    if (resolvedAccount.baseUrl) {
      env.OPENAI_BASE_URL = resolvedAccount.baseUrl;
      env.OPENAI_API_BASE = resolvedAccount.baseUrl;
    }
  } else if (ctx.boundAccountRef) {
    env.CODEX_AUTH_MODE = 'oauth';
  }
  return env;
}

export function buildHuaweiMaaSProtocolEnv(
  resolveRuntimeConfig: (userId: string) => { baseUrl: string; apiKey: string; defaultHeaders: Record<string, string> },
  ctx: CredentialResolutionContext,
): Record<string, string> {
  const runtimeConfig = resolveRuntimeConfig(ctx.userId);
  const headersJson = JSON.stringify(runtimeConfig.defaultHeaders);
  return {
    OFFICE_CLAW_HUAWEI_MAAS_ENABLED: '1',
    OFFICE_CLAW_HUAWEI_MAAS_BASE_URL: runtimeConfig.baseUrl,
    OFFICE_CLAW_HUAWEI_MAAS_HEADERS_JSON: headersJson,
    CODEX_AUTH_MODE: 'api_key',
    OPENAI_API_KEY: runtimeConfig.apiKey,
    OPENAI_BASE_URL: runtimeConfig.baseUrl,
    OPENAI_API_BASE: runtimeConfig.baseUrl,
    OPENAI_DEFAULT_HEADERS: headersJson,
    default_headers: headersJson,
  };
}

export function buildGoogleProtocolEnv(ctx: CredentialResolutionContext): Record<string, string> {
  const env: Record<string, string> = {};
  const { resolvedAccount } = ctx;

  if (resolvedAccount?.authType === 'api_key' && resolvedAccount.apiKey) {
    env.GEMINI_API_KEY = resolvedAccount.apiKey;
    env.GOOGLE_API_KEY = resolvedAccount.apiKey;
    env.OPENROUTER_API_KEY = resolvedAccount.apiKey;
    if (resolvedAccount.baseUrl) {
      env.GEMINI_BASE_URL = resolvedAccount.baseUrl;
    }
  }
  return env;
}
