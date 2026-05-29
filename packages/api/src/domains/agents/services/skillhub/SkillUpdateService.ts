/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createProviderSymlinks, type ProviderMounts } from './SymlinkManager.js';
import {
  loadInstalledRegistry,
  updateInstalledSkill,
  type InstalledSkillRecord,
} from './InstalledSkillRegistry.js';
import { fetchSkillAllFiles, fetchSkillMetadata } from './SkillHubService.js';
import { resolveInstalledSkillPath, resolveUserSkillsRoot } from './SkillPaths.js';

const CHECK_THROTTLE_MS = 6 * 60 * 60 * 1000;
const MAX_SKILL_UPDATE_FILES = 100;
const MAX_SKILL_UPDATE_FILE_BYTES = 1024 * 1024;
const MAX_SKILL_UPDATE_TOTAL_BYTES = 4 * 1024 * 1024;
const PATH_TRAVERSAL_RE = /[/\\]|\.\./;

export interface SkillUpdateSummary {
  name: string;
  remoteSkillName: string;
  owner: string;
  repo: string;
  installedAt: string;
  lastCheckedAt: string;
  reason: 'version';
  currentVersion?: string;
  latestVersion?: string;
  description?: string;
}

export interface SkillUpdateSkippedSummary {
  name: string;
  reason: 'local-skill' | 'recently-checked' | 'missing-version' | 'missing-directory' | 'unsupported-source';
}

export interface SkillUpdateCheckResult {
  success: true;
  checkedAt: string;
  updates: SkillUpdateSummary[];
  skipped: SkillUpdateSkippedSummary[];
}

export interface SkillUpdateResult {
  success: true;
  name: string;
  updatedAt: string;
  mounts: ProviderMounts;
  previousVersion?: string;
  currentVersion?: string;
}

export class SkillUpdateError extends Error {
  constructor(
    message: string,
    public readonly code: 'CONFLICT' | 'VALIDATION' | 'NOT_FOUND' | 'FORBIDDEN' | 'DOWNLOAD' | 'FILESYSTEM',
  ) {
    super(message);
    this.name = 'SkillUpdateError';
  }
}

const updateLocks = new Set<string>();

function normalizeVersion(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isRecentlyChecked(record: InstalledSkillRecord, nowMs: number): boolean {
  if (!record.lastCheckedAt) return false;
  const checkedAtMs = new Date(record.lastCheckedAt).getTime();
  if (!Number.isFinite(checkedAtMs)) return false;
  return nowMs - checkedAtMs < CHECK_THROTTLE_MS;
}

function toUpdateSummary(record: InstalledSkillRecord, checkedAt: string): SkillUpdateSummary {
  return {
    name: record.name,
    remoteSkillName: record.remoteSkillName,
    owner: record.owner,
    repo: record.repo,
    installedAt: record.installedAt,
    lastCheckedAt: record.lastCheckedAt ?? checkedAt,
    reason: 'version',
    ...(record.installedVersion ? { currentVersion: record.installedVersion } : {}),
    ...(record.latestVersion ? { latestVersion: record.latestVersion } : {}),
    ...(record.displayDescription?.trim() ? { description: record.displayDescription.trim() } : {}),
  };
}

function hasHiddenPathSegment(path: string): boolean {
  return path.split(/[\\/]+/).some((segment) => segment.startsWith('.'));
}

function validateSkillFilePath(filePath: string): void {
  const normalized = filePath.replace(/\\/g, '/');
  if (!normalized || normalized.includes('..') || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new SkillUpdateError(`Invalid skill file path "${filePath}"`, 'VALIDATION');
  }
  if (normalized.startsWith('__MACOSX/') || hasHiddenPathSegment(normalized)) {
    throw new SkillUpdateError(`Unsupported hidden or metadata file path "${filePath}"`, 'VALIDATION');
  }
}

async function writeSkillFiles(skillDir: string, files: Map<string, Buffer>): Promise<void> {
  const skillMd = files.get('SKILL.md');
  if (!skillMd) {
    throw new SkillUpdateError('ZIP does not contain SKILL.md', 'VALIDATION');
  }
  if (skillMd.toString('utf-8').trim().length === 0) {
    throw new SkillUpdateError('SKILL.md content is empty', 'VALIDATION');
  }
  if (files.size > MAX_SKILL_UPDATE_FILES) {
    throw new SkillUpdateError(`Skill contains too many files (${files.size})`, 'VALIDATION');
  }

  let totalBytes = 0;
  const root = resolve(skillDir);
  await mkdir(root, { recursive: true });
  for (const [filePath, fileContent] of files) {
    validateSkillFilePath(filePath);
    if (fileContent.length > MAX_SKILL_UPDATE_FILE_BYTES) {
      throw new SkillUpdateError(`Skill file "${filePath}" exceeds size limit`, 'VALIDATION');
    }
    totalBytes += fileContent.length;
    if (totalBytes > MAX_SKILL_UPDATE_TOTAL_BYTES) {
      throw new SkillUpdateError('Skill update package exceeds total size limit', 'VALIDATION');
    }
    const fullPath = resolve(root, filePath);
    if (!fullPath.startsWith(`${root}\\`) && !fullPath.startsWith(`${root}/`) && fullPath !== root) {
      throw new SkillUpdateError(`Invalid skill file path "${filePath}"`, 'VALIDATION');
    }
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, fileContent);
  }
}

async function replaceSkillDirectory(hostRoot: string, name: string, files: Map<string, Buffer>): Promise<void> {
  const skillsRoot = resolveUserSkillsRoot(hostRoot);
  const skillDir = resolveInstalledSkillPath(hostRoot, name);
  if (!existsSync(skillDir)) {
    throw new SkillUpdateError(`Skill "${name}" not found in user skills directory`, 'NOT_FOUND');
  }

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmpDir = join(skillsRoot, `.tmp-update-${name}-${suffix}`);
  const backupDir = join(hostRoot, '.office-claw', 'skill-backups', name, suffix);

  try {
    await writeSkillFiles(tmpDir, files);
    await mkdir(dirname(backupDir), { recursive: true });
    await rename(skillDir, backupDir);
    try {
      await rename(tmpDir, skillDir);
    } catch (err) {
      await rename(backupDir, skillDir).catch(() => {});
      throw err;
    }
  } catch (err) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    if (err instanceof SkillUpdateError) throw err;
    throw new SkillUpdateError(err instanceof Error ? err.message : String(err), 'FILESYSTEM');
  }
}

async function checkOneSkill(
  hostRoot: string,
  record: InstalledSkillRecord,
  checkedAt: string,
): Promise<{ update?: SkillUpdateSummary; skipped?: SkillUpdateSkippedSummary }> {
  if (record.source !== 'skillhub') {
    return { skipped: { name: record.name, reason: record.source === 'local' ? 'local-skill' : 'unsupported-source' } };
  }

  const metadata = await fetchSkillMetadata(record.remoteSkillName);
  const latestVersion = normalizeVersion(metadata?.version);
  if (!latestVersion) {
    await updateInstalledSkill(hostRoot, record.name, (current) => ({
      ...current,
      lastCheckedAt: checkedAt,
      updateStatus: 'unknown',
      lastUpdateError: 'Remote skill version is missing',
    }));
    return { skipped: { name: record.name, reason: 'missing-version' } };
  }

  const installedVersion = normalizeVersion(record.installedVersion);
  const nextStatus = installedVersion && installedVersion !== latestVersion ? 'available' : 'current';
  const updated = await updateInstalledSkill(hostRoot, record.name, (current) => ({
    ...current,
    installedVersion: installedVersion ?? latestVersion,
    latestVersion,
    lastCheckedAt: checkedAt,
    updateStatus: nextStatus,
    lastUpdateError: undefined,
  }));

  if (updated?.updateStatus === 'available') {
    return { update: toUpdateSummary(updated, checkedAt) };
  }
  return {};
}

export async function checkSkillUpdates(
  hostRoot: string,
  options?: { force?: boolean; now?: Date },
): Promise<SkillUpdateCheckResult> {
  const now = options?.now ?? new Date();
  const checkedAt = now.toISOString();
  const registry = await loadInstalledRegistry(hostRoot);
  const updates: SkillUpdateSummary[] = [];
  const skipped: SkillUpdateSkippedSummary[] = [];
  const nowMs = now.getTime();

  for (const record of registry.skills) {
    if (record.source !== 'skillhub') {
      skipped.push({ name: record.name, reason: record.source === 'local' ? 'local-skill' : 'unsupported-source' });
      continue;
    }
    if (!existsSync(resolveInstalledSkillPath(hostRoot, record.name))) {
      skipped.push({ name: record.name, reason: 'missing-directory' });
      continue;
    }
    if (!options?.force && isRecentlyChecked(record, nowMs)) {
      const installedVersion = normalizeVersion(record.installedVersion);
      const latestVersion = normalizeVersion(record.latestVersion);
      if (installedVersion && latestVersion && installedVersion !== latestVersion) {
        const updated = await updateInstalledSkill(hostRoot, record.name, (current) => ({
          ...current,
          updateStatus: 'available',
          lastUpdateError: undefined,
        }));
        updates.push(toUpdateSummary(updated ?? record, checkedAt));
        continue;
      }
      if (record.updateStatus === 'available') {
        updates.push(toUpdateSummary(record, checkedAt));
      } else {
        skipped.push({ name: record.name, reason: 'recently-checked' });
      }
      continue;
    }

    try {
      const result = await checkOneSkill(hostRoot, record, checkedAt);
      if (result?.update) updates.push(result.update);
      if (result?.skipped) skipped.push(result.skipped);
    } catch (err) {
      await updateInstalledSkill(hostRoot, record.name, (current) => ({
        ...current,
        lastCheckedAt: checkedAt,
        updateStatus: 'failed',
        lastUpdateError: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  return { success: true, checkedAt, updates, skipped };
}

export async function updateSkill(hostRoot: string, name: string): Promise<SkillUpdateResult> {
  const skillName = name.trim();
  if (!skillName || PATH_TRAVERSAL_RE.test(skillName)) {
    throw new SkillUpdateError(`Invalid skill name "${skillName}"`, 'VALIDATION');
  }
  if (updateLocks.has(skillName)) {
    throw new SkillUpdateError(`Skill "${skillName}" update is already running`, 'CONFLICT');
  }

  updateLocks.add(skillName);
  const updatedAt = new Date().toISOString();
  try {
    const registry = await loadInstalledRegistry(hostRoot);
    const record = registry.skills.find((item) => item.name === skillName);
    if (!record) {
      throw new SkillUpdateError(`Skill "${skillName}" is not installed`, 'NOT_FOUND');
    }
    if (record.source !== 'skillhub') {
      throw new SkillUpdateError(`Skill "${skillName}" is not installed via SkillHub`, 'FORBIDDEN');
    }

    const metadata = await fetchSkillMetadata(record.remoteSkillName).catch(() => null);
    const currentVersion = normalizeVersion(metadata?.version) ?? normalizeVersion(record.latestVersion);
    let files: Map<string, Buffer>;
    try {
      files = await fetchSkillAllFiles(record.owner, record.repo, record.remoteSkillName, { force: true });
    } catch (err) {
      throw new SkillUpdateError(
        `Failed to download skill update: ${err instanceof Error ? err.message : String(err)}`,
        'DOWNLOAD',
      );
    }

    await replaceSkillDirectory(hostRoot, skillName, files);
    const mounts = await createProviderSymlinks(skillName, resolveUserSkillsRoot(hostRoot));
    await updateInstalledSkill(hostRoot, skillName, (current) => ({
      ...current,
      ...(currentVersion ? { installedVersion: currentVersion, latestVersion: currentVersion } : {}),
      lastUpdatedAt: updatedAt,
      lastCheckedAt: updatedAt,
      updateStatus: 'current',
      lastUpdateError: undefined,
    }));

    return {
      success: true,
      name: skillName,
      updatedAt,
      mounts,
      ...(record.installedVersion ? { previousVersion: record.installedVersion } : {}),
      ...(currentVersion ? { currentVersion } : {}),
    };
  } catch (err) {
    await updateInstalledSkill(hostRoot, skillName, (current) => ({
      ...current,
      updateStatus: 'failed',
      lastUpdateError: err instanceof Error ? err.message : String(err),
    })).catch(() => {});
    throw err;
  } finally {
    updateLocks.delete(skillName);
  }
}
