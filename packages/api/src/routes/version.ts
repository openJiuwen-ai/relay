/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Version Route
 * GET /api/lastversion — 返回最新版本信息
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';
import { getErrorMessage } from '../utils/index.js';

interface VersionRoutesOptions {
  projectRoot?: string;
}

const DEFAULT_VERSION = '0.1.0';

function readVersionFromJsonFile(filePath: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    return typeof parsed?.version === 'string' && parsed.version.trim().length > 0 ? parsed.version.trim() : null;
  } catch {
    return null;
  }
}

function getCurrentVersion(projectRoot: string): string {
  const packageVersion = readVersionFromJsonFile(resolve(projectRoot, 'package.json'));
  if (packageVersion) return packageVersion;

  const releaseVersion = readVersionFromJsonFile(resolve(projectRoot, '.office-claw-release.json'));
  if (releaseVersion) return releaseVersion;

  return DEFAULT_VERSION;
}

function getHuaweiClawVersionUrl(): string {
  const base = (process.env.HUAWEI_CLAW_URL ?? '').trim().replace(/\/+$/, '');
  return base ? `${base}/v1/claw/client-latest-version` : '';
}

let cachedCurversion: string | null = null;

export async function versionRoutes(app: FastifyInstance, opts: VersionRoutesOptions = {}): Promise<void> {
  const projectRoot = opts.projectRoot ?? resolveActiveProjectRoot();

  app.get('/api/lastversion', async (request) => {
    console.log('projectRoot:', projectRoot);
    const curversion = cachedCurversion ?? getCurrentVersion(projectRoot);
    cachedCurversion = curversion;

    const remoteUrl = getHuaweiClawVersionUrl();
    if (!remoteUrl) {
      return {
        curversion,
        lastversion: curversion,
        downloadUrl: '',
        description: '',
      };
    }

    try {
      const userId = (request.headers['x-office-claw-user'] ?? request.headers['x-office-claw-user']) as string;
      if (!userId) {
        throw new Error('Unauthorized: Missing user ID');
      }
      const response = await fetch(remoteUrl, {
        headers: {
          'Content-Type': 'application/json;charset=utf8',
        },
      });
      if (!response.ok) {
        const { error_code, error_message } = await getErrorMessage(response);
        throw new Error(`错误码: ${error_code}, 错误信息: ${error_message}`);
      }
      const data: any = await response.json();
      const lastversion = data.latest_version || curversion;
      return {
        curversion,
        lastversion,
        downloadUrl: data.download_url || '',
        description: data.description || '',
      };
    } catch (err) {
      console.error('获取最新版本信息失败，', err);
      return {
        curversion,
        lastversion: curversion,
        downloadUrl: '',
        description: '',
      };
    }
  });
}
