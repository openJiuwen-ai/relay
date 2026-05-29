/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { resolveOfficeClawHostRoot } from '../../../../utils/office-claw-root.js';
import { parseFrontmatterString } from './frontmatter-parser.js';
import { loadInstalledRegistry, saveInstalledRegistry } from './InstalledSkillRegistry.js';
import {
  resolveOfficialSkillsRoot,
  resolveUserSkillsRoot,
} from './SkillPaths.js';

interface BootstrapEntry {
  name: string;
  category: string;
  trigger: string;
}

interface SkillMeta {
  description?: string;
  triggers?: string[];
}

export interface RuntimeSkillCatalogEntry {
  name: string;
  description: string;
  triggers: string[];
  category: string;
  source: 'local' | 'skillhub';
  contentHash: string;
}

export interface RuntimeSkillCatalogListResult {
  skills: RuntimeSkillCatalogEntry[];
  total: number;
}

export interface RuntimeSkillLoadResult extends RuntimeSkillCatalogEntry {
  skillMarkdown: string;
  skillDir: string;
  files: string[];
  filesOmittedCount: number;
}

interface SkillCatalogServiceOptions {
  hostRoot?: string;
  relatedFileLimit?: number;
}

interface SkillRoots {
  hostRoot: string;
  officialSkillsRoot: string;
  userSkillsRoot: string;
}

interface ResolvedSkillEntry extends RuntimeSkillCatalogEntry {
  skillDir: string;
  skillMarkdown: string;
}

const DEFAULT_RELATED_FILE_LIMIT = 20;
const QUERY_TOKEN_RE = /[a-z0-9\u4e00-\u9fff][a-z0-9\u4e00-\u9fff-]*/giu;
const QUERY_ALIAS_MAP: Record<string, string[]> = {
  plan: ['planning', 'plans', 'writing-plans', 'writing plans', 'implementation plan'],
  planning: ['plan', 'plans', 'writing-plans', 'writing plans', 'implementation plan'],
  plans: ['plan', 'planning', 'writing-plans', 'writing plans'],
  implementation: ['implementation plan', 'writing-plans', 'writing plans'],
  tdd: ['test driven', 'test-driven', 'red green refactor'],
  brainstorm: ['collaborative-thinking', 'collaborative thinking', 'discussion convergence'],
  discussion: ['collaborative-thinking', 'collaborative thinking', 'discussion convergence'],
  collaboration: ['collab', 'collaborative', 'collaborative-thinking', 'collaborative thinking'],
  collaborative: ['collab', 'collaboration', 'collaborative-thinking', 'collaborative thinking'],
  collab: ['collaboration', 'collaborative', 'collaborative-thinking', 'collaborative thinking'],
  branch: ['worktree', 'git worktree', 'parallel branch'],
  worktree: ['git worktree'],
};
const QUERY_PHRASE_ALIASES: Array<{ pattern: string; aliases: string[] }> = [
  { pattern: 'implementation plan', aliases: ['writing-plans', 'writing plans', 'planning'] },
  { pattern: 'acceptance criteria', aliases: ['writing-plans', '验收标准', 'risk acceptance'] },
  { pattern: 'risk assessment', aliases: ['writing-plans', '风险验收', 'implementation plan'] },
  { pattern: 'test driven', aliases: ['tdd', 'red green refactor'] },
  { pattern: 'test-driven', aliases: ['tdd', 'red green refactor'] },
  { pattern: 'test first', aliases: ['tdd', 'red green refactor'] },
  { pattern: 'failed tests', aliases: ['tdd', 'test first', 'red green refactor'] },
  { pattern: 'minimal implementation', aliases: ['tdd', 'test first'] },
  { pattern: 'refactor checkpoints', aliases: ['tdd', 'red green refactor'] },
  { pattern: 'red green refactor', aliases: ['tdd', 'test driven', 'test first'] },
  { pattern: 'task decomposition', aliases: ['writing-plans', 'planning'] },
  { pattern: 'phase breakdown', aliases: ['writing-plans', 'planning'] },
  { pattern: '写实施计划', aliases: ['writing-plans', 'implementation plan', 'planning'] },
  { pattern: '测试驱动', aliases: ['tdd', 'test first', 'red green refactor'] },
  { pattern: '写测试', aliases: ['tdd', 'test first'] },
  { pattern: '红绿重构', aliases: ['tdd', 'red green refactor'] },
  { pattern: '失败测试', aliases: ['tdd', 'test first', 'red green refactor'] },
  { pattern: '最小实现', aliases: ['tdd', 'test first'] },
  { pattern: '重构检查点', aliases: ['tdd', 'red green refactor'] },
  { pattern: '方案对比', aliases: ['collaborative-thinking', 'brainstorm', 'compare options'] },
  { pattern: 'tradeoff', aliases: ['collaborative-thinking', 'compare options', 'decision compare options'] },
  { pattern: 'tradeoffs', aliases: ['collaborative-thinking', 'compare options', 'decision compare options'] },
  { pattern: 'weigh options', aliases: ['collaborative-thinking', 'compare options'] },
  { pattern: 'recommendation', aliases: ['collaborative-thinking', 'decision compare options'] },
  { pattern: '收敛决策', aliases: ['collaborative-thinking', 'discussion convergence', 'decision compare options'] },
  { pattern: '多角度讨论', aliases: ['collaborative-thinking', 'brainstorm', 'discussion convergence'] },
  { pattern: '多视角', aliases: ['collaborative-thinking', 'brainstorm'] },
  { pattern: '并行分支开发', aliases: ['worktree', 'git worktree', 'parallel branch'] },
  { pattern: '多改动隔离', aliases: ['worktree', 'git worktree', 'branch isolation'] },
  { pattern: '分支隔离', aliases: ['worktree', 'git worktree', 'branch isolation'] },
];
const SKILL_QUERY_HINTS: Record<string, string[]> = {
  'writing-plans': [
    '写计划',
    '写实施计划',
    'implementation plan',
    'planning',
    'task decomposition',
    'phase breakdown',
    '拆分步骤',
  ],
  tdd: [
    'tdd',
    '测试驱动',
    '写测试',
    'test first',
    'red green refactor',
    '红绿重构',
    '失败场景',
    '最小实现',
    '重构检查点',
  ],
  'collaborative-thinking': [
    'collaborative-thinking',
    'brainstorm',
    '讨论',
    '方案对比',
    '收敛决策',
    '多角度讨论',
    '多视角',
    'discussion convergence',
    'compare options',
  ],
  worktree: [
    'worktree',
    'git worktree',
    '并行分支开发',
    '多改动隔离',
    '分支隔离',
    'parallel branch',
    'parallel development',
    'branch isolation',
  ],
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveSkillRoots(options?: SkillCatalogServiceOptions): SkillRoots {
  const hostRoot = options?.hostRoot ? resolve(options.hostRoot) : resolveOfficeClawHostRoot(process.cwd());
  return {
    hostRoot,
    officialSkillsRoot: resolveOfficialSkillsRoot(hostRoot),
    userSkillsRoot: resolveUserSkillsRoot(hostRoot),
  };
}

async function listSkillDirs(skillsRoot: string): Promise<string[]> {
  try {
    const dirs = await readdir(skillsRoot, { withFileTypes: true });
    const names: string[] = [];
    for (const entry of dirs) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      try {
        await readFile(join(skillsRoot, entry.name, 'SKILL.md'), 'utf-8');
        names.push(entry.name);
      } catch {
        // Not a readable skill directory.
      }
    }
    return names.sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function parseBootstrap(skillsRoot: string): Promise<Map<string, BootstrapEntry>> {
  const result = new Map<string, BootstrapEntry>();
  try {
    const content = await readFile(join(skillsRoot, 'BOOTSTRAP.md'), 'utf-8');
    let currentCategory = '';
    for (const line of content.split('\n')) {
      const categoryMatch = line.match(/^###\s+(.+)/);
      if (categoryMatch?.[1]) {
        currentCategory = categoryMatch[1].trim();
        continue;
      }
      const rowMatch = line.match(/^\|\s*`([a-z][-a-z0-9_]*)`\s*\|\s*(.+?)\s*\|/);
      if (rowMatch?.[1]) {
        result.set(rowMatch[1], {
          name: rowMatch[1],
          category: currentCategory || '其他',
          trigger: rowMatch[2]?.trim() ?? '',
        });
      }
    }
  } catch {
    // Missing BOOTSTRAP is acceptable.
  }
  return result;
}

async function parseManifestSkillMeta(skillsRoot: string): Promise<Map<string, SkillMeta>> {
  const result = new Map<string, SkillMeta>();
  try {
    const content = await readFile(join(skillsRoot, 'manifest.yaml'), 'utf-8');
    const parsed = parseYaml(content) as {
      skills?: Record<string, { description?: unknown; triggers?: unknown }>;
    } | null;
    if (!parsed?.skills || typeof parsed.skills !== 'object') return result;
    for (const [name, meta] of Object.entries(parsed.skills)) {
      const description = typeof meta?.description === 'string' ? meta.description.trim() : undefined;
      const triggers = Array.isArray(meta?.triggers)
        ? meta.triggers
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined;
      if (description || (triggers && triggers.length > 0)) {
        result.set(name, {
          ...(description ? { description } : {}),
          ...(triggers?.length ? { triggers } : {}),
        });
      }
    }
  } catch {
    // Missing manifest is acceptable.
  }
  return result;
}

function normalizeTriggers(
  frontmatter: SkillMeta,
  manifest: SkillMeta | undefined,
  bootstrap: BootstrapEntry | undefined,
): string[] {
  if (manifest?.triggers?.length) return manifest.triggers;
  if (frontmatter.triggers?.length) return frontmatter.triggers;
  if (bootstrap?.trigger) return [bootstrap.trigger];
  return [];
}

function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function tokenizeQuery(query: string): string[] {
  return Array.from(query.matchAll(QUERY_TOKEN_RE), (match) => match[0]?.toLowerCase() ?? '').filter(Boolean);
}

function addQueryVariant(variants: Set<string>, value: string): void {
  const normalized = normalizeText(value);
  if (!normalized) return;
  variants.add(normalized);
  for (const token of tokenizeQuery(normalized)) {
    variants.add(token);
  }
  if (normalized.includes('-')) {
    for (const part of normalized
      .split('-')
      .map((item) => item.trim())
      .filter(Boolean)) {
      variants.add(part);
    }
  }
}

function buildQueryVariants(query: string): string[] {
  const normalized = normalizeText(query);
  const variants = new Set<string>();
  if (!normalized) return [];

  addQueryVariant(variants, normalized);

  for (const token of tokenizeQuery(normalized)) {
    addQueryVariant(variants, token);
    for (const alias of QUERY_ALIAS_MAP[token] ?? []) {
      addQueryVariant(variants, alias);
    }
  }

  for (const { pattern, aliases } of QUERY_PHRASE_ALIASES) {
    if (!normalized.includes(normalizeText(pattern))) continue;
    addQueryVariant(variants, pattern);
    for (const alias of aliases) {
      addQueryVariant(variants, alias);
    }
  }

  return [...variants].filter(Boolean);
}

async function collectRelatedFiles(skillDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    const sortedEntries = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sortedEntries) {
      const absPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath);
        continue;
      }
      if (entry.isFile() && entry.name !== 'SKILL.md') {
        files.push(absPath);
      }
    }
  }

  try {
    await walk(skillDir);
  } catch {
    return [];
  }

  return files;
}

async function buildResolvedSkillEntries(options?: SkillCatalogServiceOptions): Promise<ResolvedSkillEntry[]> {
  const roots = resolveSkillRoots(options);
  const [officialSkillNames, userSkillNames, bootstrapEntries, manifestMeta, installedRegistry] = await Promise.all([
    listSkillDirs(roots.officialSkillsRoot),
    listSkillDirs(roots.userSkillsRoot),
    parseBootstrap(roots.officialSkillsRoot),
    parseManifestSkillMeta(roots.officialSkillsRoot),
    loadInstalledRegistry(roots.hostRoot),
  ]);
  const officialSkillNameSet = new Set(officialSkillNames);
  const userSkillNameSet = new Set(userSkillNames);

  const mergedOfficialSkillNameSet = new Set(officialSkillNames);
  const skillNames = [...officialSkillNames, ...userSkillNames.filter((name) => !mergedOfficialSkillNameSet.has(name))];

  const installedByName = new Map(installedRegistry.skills.map((record) => [record.name, record]));
  const orderedNames: string[] = [];
  const seen = new Set<string>();

  for (const name of bootstrapEntries.keys()) {
    if (skillNames.includes(name) && !seen.has(name)) {
      orderedNames.push(name);
      seen.add(name);
    }
  }
  for (const name of skillNames) {
    if (!seen.has(name)) {
      orderedNames.push(name);
      seen.add(name);
    }
  }

  const entries = await Promise.all(
    orderedNames.map(async (name): Promise<ResolvedSkillEntry> => {
      const skillDir = mergedOfficialSkillNameSet.has(name)
        ? join(roots.officialSkillsRoot, name)
        : join(roots.userSkillsRoot, name);
      const skillMarkdown = await readFile(join(skillDir, 'SKILL.md'), 'utf-8');
      const frontmatter = parseFrontmatterString(skillMarkdown);
      const bootstrap = bootstrapEntries.get(name);
      const manifest = manifestMeta.get(name);
      const source = installedByName.has(name) ? ('skillhub' as const) : ('local' as const);
      return {
        name,
        description: manifest?.description ?? frontmatter.description ?? '',
        triggers: normalizeTriggers(frontmatter, manifest, bootstrap),
        category: bootstrap?.category ?? (source === 'skillhub' ? '技能扩展' : '其他'),
        source,
        contentHash: computeContentHash(skillMarkdown),
        skillDir,
        skillMarkdown,
      };
    }),
  );

  const allExistingSkillNames = new Set(officialSkillNames.concat(userSkillNames));
  const staleRecords = installedRegistry.skills.filter((r) => !allExistingSkillNames.has(r.name));
  if (staleRecords.length > 0) {
    const validRegistry = {
      ...installedRegistry,
      skills: installedRegistry.skills.filter((r) => allExistingSkillNames.has(r.name)),
    };
    await saveInstalledRegistry(roots.hostRoot, validRegistry);
  }

  return entries;
}

function scoreQuery(skill: RuntimeSkillCatalogEntry, query: string): number {
  const variants = buildQueryVariants(query);
  const normalizedQuery = normalizeText(query);
  const queryTokens = new Set(tokenizeQuery(normalizedQuery));
  const skillName = normalizeText(skill.name);
  const description = normalizeText(skill.description);
  const category = normalizeText(skill.category);
  const triggers = skill.triggers.map((item) => normalizeText(item)).filter(Boolean);
  const hints = (SKILL_QUERY_HINTS[skill.name] ?? []).map((item) => normalizeText(item)).filter(Boolean);
  let score = 0;

  if (normalizedQuery === skillName) score += 100;
  if (queryTokens.has(skillName)) score += 140;
  if (variants.includes(skillName)) score += 40;

  for (const phrase of [...new Set([...triggers, ...hints])]) {
    if (!phrase) continue;
    if (normalizedQuery === phrase) {
      score += 35;
      continue;
    }
    if (normalizedQuery.includes(phrase)) {
      score += 18;
      continue;
    }
    if (normalizedQuery.length >= 4 && phrase.includes(normalizedQuery)) {
      score += 8;
    }
  }

  for (const variant of variants) {
    if (!variant) continue;
    if (variant === skillName) {
      score += 24;
      continue;
    }
    if (skillName.includes(variant)) score += variant.length >= 4 ? 12 : 6;
    if (hints.some((item) => item.includes(variant))) score += variant.length >= 4 ? 10 : 5;
    if (triggers.some((item) => item.includes(variant))) score += variant.length >= 4 ? 8 : 4;
    if (description.includes(variant)) score += variant.length >= 4 ? 4 : 2;
    if (category.includes(variant)) score += 1;
  }
  return score;
}

export function createSkillCatalogService(options?: SkillCatalogServiceOptions) {
  const relatedFileLimit = options?.relatedFileLimit ?? DEFAULT_RELATED_FILE_LIMIT;

  return {
    async listSkills(input?: { query?: string; limit?: number }): Promise<RuntimeSkillCatalogListResult> {
      const query = input?.query?.trim().toLowerCase();
      const resolved = await buildResolvedSkillEntries(options);
      const filtered = query
        ? resolved
            .map((skill) => ({ skill, score: scoreQuery(skill, query) }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
            .map((entry) => entry.skill)
        : resolved;
      const limited = input?.limit && input.limit > 0 ? filtered.slice(0, input.limit) : filtered;
      return {
        skills: limited.map(({ skillDir: _skillDir, skillMarkdown: _skillMarkdown, ...skill }) => skill),
        total: filtered.length,
      };
    },

    async loadSkill(name: string): Promise<RuntimeSkillLoadResult | null> {
      const normalizedName = name.trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalizedName) || normalizedName.includes('..')) {
        return null;
      }

      const resolved = await buildResolvedSkillEntries(options);
      const entry = resolved.find((skill) => skill.name === normalizedName);
      if (!entry) return null;

      const relatedFiles = await collectRelatedFiles(entry.skillDir);
      const files = relatedFiles.slice(0, relatedFileLimit);

      return {
        name: entry.name,
        description: entry.description,
        triggers: entry.triggers,
        category: entry.category,
        source: entry.source,
        contentHash: entry.contentHash,
        skillMarkdown: entry.skillMarkdown,
        skillDir: entry.skillDir,
        files,
        filesOmittedCount: Math.max(0, relatedFiles.length - files.length),
      };
    },
  };
}
