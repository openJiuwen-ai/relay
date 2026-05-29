/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * InstalledSkillRegistry — .office-claw/installed-skills.json 持久化层
 *
 * 管理通过 SkillHub 安装的远程 skill 记录。
 * 使用全局 mutex 串行化读写，防止并发丢失更新。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface InstalledSkillRecord {
  name: string;
  source: 'skillhub' | 'local';
  skillhubUrl: string;
  owner: string;
  repo: string;
  remoteSkillName: string;
  installedAt: string; // ISO 8601
  displayDescription?: string;
  installedVersion?: string;
  latestVersion?: string;
  lastCheckedAt?: string;
  lastUpdatedAt?: string;
  updateStatus?: 'unknown' | 'current' | 'available' | 'failed';
  lastUpdateError?: string;
}

export interface InstalledSkillsRegistry {
  version: number;
  skills: InstalledSkillRecord[];
}

const REGISTRY_FILENAME = 'installed-skills.json';
const EMPTY_REGISTRY: InstalledSkillsRegistry = { version: 1, skills: [] };

/** 全局 mutex：确保同一时刻只有一个 install/uninstall 操作修改 registry */
let pendingOperation: Promise<void> = Promise.resolve();

async function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const prev = pendingOperation;
  let release!: () => void;
  pendingOperation = new Promise<void>((r) => {
    release = r;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

/** 获取 registry 文件路径 */
function getRegistryPath(officeClawRoot: string): string {
  return join(officeClawRoot, '.office-claw', REGISTRY_FILENAME);
}

/** 读取 installed-skills.json，损坏时返回空 registry */
export async function loadInstalledRegistry(officeClawRoot: string): Promise<InstalledSkillsRegistry> {
  try {
    const raw = await readFile(getRegistryPath(officeClawRoot), 'utf-8');
    const parsed = JSON.parse(raw) as InstalledSkillsRegistry;
    if (!parsed || typeof parsed.version !== 'number' || !Array.isArray(parsed.skills)) {
      return { ...EMPTY_REGISTRY };
    }
    return parsed;
  } catch {
    return { ...EMPTY_REGISTRY };
  }
}

/** 写入 installed-skills.json（串行化） */
export async function saveInstalledRegistry(officeClawRoot: string, registry: InstalledSkillsRegistry): Promise<void> {
  await serialize(async () => {
    const filePath = getRegistryPath(officeClawRoot);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(registry, null, 2)}\n`, 'utf-8');
  });
}

/** 追加一条安装记录（串行化） */
export async function addInstalledSkill(officeClawRoot: string, record: InstalledSkillRecord): Promise<void> {
  await serialize(async () => {
    const registry = await loadInstalledRegistry(officeClawRoot);
    // 覆盖同名条目（幂等安装）
    registry.skills = registry.skills.filter((s) => s.name !== record.name);
    registry.skills.push(record);
    const filePath = getRegistryPath(officeClawRoot);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(registry, null, 2)}\n`, 'utf-8');
  });
}

/** 移除一条安装记录（串行化） */
export async function removeInstalledSkill(officeClawRoot: string, name: string): Promise<void> {
  await serialize(async () => {
    const registry = await loadInstalledRegistry(officeClawRoot);
    registry.skills = registry.skills.filter((s) => s.name !== name);
    const filePath = getRegistryPath(officeClawRoot);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(registry, null, 2)}\n`, 'utf-8');
  });
}

export async function updateInstalledSkill(
  catCafeRoot: string,
  name: string,
  updater: (record: InstalledSkillRecord) => InstalledSkillRecord,
): Promise<InstalledSkillRecord | null> {
  return serialize(async () => {
    const registry = await loadInstalledRegistry(catCafeRoot);
    const index = registry.skills.findIndex((s) => s.name === name);
    if (index === -1) return null;
    const nextRecord = updater(registry.skills[index]!);
    registry.skills[index] = nextRecord;
    const filePath = getRegistryPath(catCafeRoot);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(registry, null, 2)}\n`, 'utf-8');
    return nextRecord;
  });
}
