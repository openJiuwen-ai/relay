/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CapabilitiesConfig, CapabilityEntry } from '@openjiuwen/relay-shared';

const OFFICE_CLAW_SKILLS_MANIFEST = join('office-claw-skills', 'manifest.yaml');

let cachedOfficeClawSkillsSourceDir: string | null = null;

function isSkillDir(dir: string): boolean {
  try {
    return statSync(join(dir, 'SKILL.md')).isFile();
  } catch {
    return false;
  }
}

function listSkillNames(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => (entry.isDirectory() || entry.isSymbolicLink()) && !entry.name.startsWith('_'))
      .map((entry) => entry.name)
      .filter((name) => isSkillDir(join(dir, name)))
      .sort();
  } catch {
    return [];
  }
}

function listFilesRecursively(dir: string, root = dir): string[] {
  let results: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(listFilesRecursively(fullPath, root));
      continue;
    }
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    try {
      const stat = statSync(fullPath);
      results.push(`${fullPath.slice(root.length + 1)}:${stat.size}:${Math.trunc(stat.mtimeMs)}`);
    } catch {
      results.push(`${fullPath.slice(root.length + 1)}:missing`);
    }
  }

  return results.sort();
}

function readCapabilitiesConfigSync(projectRoot: string): CapabilitiesConfig | null {
  try {
    const raw = readFileSync(join(projectRoot, '.office-claw', 'capabilities.json'), 'utf-8');
    const data = JSON.parse(raw) as CapabilitiesConfig;
    if (data.version !== 1 || !Array.isArray(data.capabilities)) return null;
    return data;
  } catch {
    return null;
  }
}

function isSkillDisabledForCat(capability: CapabilityEntry, agentId: string): boolean {
  if (capability.type !== 'skill') return false;
  const override = capability.overrides?.find((item) => item.agentId === agentId);
  const enabled = override ? override.enabled : capability.enabled;
  return !enabled;
}

export function resolveOfficeClawSkillsSourceDir(): string {
  if (cachedOfficeClawSkillsSourceDir) return cachedOfficeClawSkillsSourceDir;

  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== dirname(dir)) {
    const candidate = join(dir, OFFICE_CLAW_SKILLS_MANIFEST);
    if (existsSync(candidate)) {
      cachedOfficeClawSkillsSourceDir = join(dir, 'office-claw-skills');
      return cachedOfficeClawSkillsSourceDir;
    }
    dir = dirname(dir);
  }

  cachedOfficeClawSkillsSourceDir = join(process.cwd(), 'office-claw-skills');
  return cachedOfficeClawSkillsSourceDir;
}

export function resolveRelayClawSharedSkillsDirs(): string[] {
  const dir = resolveOfficeClawSkillsSourceDir();
  return existsSync(join(dir, 'manifest.yaml')) ? [dir] : [];
}

export function listRelayClawSharedSkillNames(): string[] {
  const names = new Set<string>();
  for (const dir of resolveRelayClawSharedSkillsDirs()) {
    for (const name of listSkillNames(dir)) names.add(name);
  }
  return [...names].sort();
}

export function resolveRelayClawOverlaySkillsDir(homeDir: string): string {
  return resolve(homeDir, '.jiuwenclaw', 'agent', 'skills');
}

export function resolveRelayClawDisabledSkills(projectRoot: string, agentId: string): string[] {
  const config = readCapabilitiesConfigSync(projectRoot);
  if (!config) return [];
  return config.capabilities.filter((capability) => isSkillDisabledForCat(capability, agentId)).map((capability) => capability.id).sort();
}

export function buildRelayClawSharedSkillsSignature(): string {
  return buildRelayClawSkillsSignatureForDirs(resolveRelayClawSharedSkillsDirs());
}

export function buildRelayClawSkillsSignatureForDirs(dirs: string[]): string {
  const payload = dirs.map((dir) => ({
    files: listFilesRecursively(dir),
  }));
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function buildRelayClawDisabledSkillsSignature(projectRoot: string, agentId: string): string {
  return createHash('sha256').update(JSON.stringify(resolveRelayClawDisabledSkills(projectRoot, agentId))).digest('hex');
}

export function buildRelayClawAppSignature(appDir: string): string {
  const packageRoot = resolve(appDir, 'jiuwenclaw');
  const payload = existsSync(packageRoot)
    ? {
        root: packageRoot,
        files: listFilesRecursively(packageRoot).filter((entry) => entry.slice(0, entry.indexOf(':')).endsWith('.py')),
      }
    : { root: packageRoot, files: [] as string[] };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
