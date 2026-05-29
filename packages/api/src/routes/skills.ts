/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Skills Route
 * GET  /api/skills          — OfficeClaw 共享 Skills 看板数据
 * GET  /api/skills/search   — 搜索 SkillHub 远程 skill
 * GET  /api/skills/trending — 获取热门 skill
 * GET  /api/skills/preview  — 预览远程 skill SKILL.md 内容
 * GET  /api/skills/detail   — 获取已安装 skill 详情（含目录树）
 * GET  /api/skills/file     — 预览 skill 目录中的文本文件
 * POST /api/skills/install  — 安装远程 skill
 * POST /api/skills/uninstall — 卸载远程 skill
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { parse as parseYaml } from 'yaml';
import { readCapabilitiesConfig } from '../config/capabilities/capability-orchestrator.js';
import { parseSkillFrontmatter } from '../domains/agents/services/skillhub/frontmatter-parser.js';
import type { InstalledSkillRecord } from '../domains/agents/services/skillhub/InstalledSkillRegistry.js';
import { resolveOfficialSkillsRoot, resolveUserSkillsRoot } from '../domains/agents/services/skillhub/SkillPaths.js';
import {
  fetchSkillContent,
  getSkillCategories,
  listAllSkills,
  searchSkills,
  trendingSkills,
} from '../domains/agents/services/skillhub/SkillHubService.js';
import {
  getInstalledRecords,
  installSkill,
  SkillInstallError,
  uninstallSkill,
} from '../domains/agents/services/skillhub/SkillInstallManager.js';
import {
  checkSkillUpdates,
  SkillUpdateError,
  updateSkill,
} from '../domains/agents/services/skillhub/SkillUpdateService.js';
import { resolveOfficeClawHostRoot } from '../utils/office-claw-root.js';
import { resolveUserId } from '../utils/request-identity.js';

type SkillMount = Record<string, boolean>;

interface SkillEntry {
  name: string;
  description?: string;
  category: string;
  trigger: string;
  source: 'local' | 'skillhub';
  skillhubUrl?: string;
  mounts: SkillMount;
}

interface SkillsSummary {
  total: number;
  allMounted: boolean;
  registrationConsistent: boolean;
}

interface SkillsResponse {
  skills: SkillEntry[];
  summary: SkillsSummary;
}

const SKILL_UPLOAD_MAX_FILES = 100;
const SKILL_UPLOAD_MAX_FILE_BYTES = 1024 * 1024;
const SKILL_UPLOAD_MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const SKILL_NAME_CHINESE_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u;
const SKILL_NAME_ALLOWED_RE = /^[A-Za-z0-9-]+$/;

// ─── Skill Detail Types ──────────────────────────────────

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileTreeNode[];
}

interface SkillDetailResponse {
  id: string;
  name: string;
  description?: string;
  triggers?: string[];
  category?: string;
  source: 'builtin' | 'external';
  enabled: boolean;
  installedAt?: string;
  skillhubUrl?: string;
  owner?: string;
  repo?: string;
  remoteSkillName?: string;
  mounts?: SkillMount;
  fileTree?: FileTreeNode[];
  agents: Record<string, boolean>;
}

interface SkillFileResponse {
  path: string;
  content: string;
  size: number;
  mime: string;
  truncated: boolean;
}

// MIME type mapping for text file preview
const MIME_MAP: Record<string, string> = {
  '.ts': 'text/typescript',
  '.tsx': 'text/tsx',
  '.js': 'text/javascript',
  '.jsx': 'text/jsx',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.css': 'text/css',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/toml',
  '.sh': 'text/x-shellscript',
  '.py': 'text/x-python',
  '.txt': 'text/plain',
};

// Supported text MIME types for preview
const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/typescript',
  'text/tsx',
  'text/javascript',
  'text/jsx',
  'application/json',
  'text/yaml',
  'text/css',
  'text/html',
  'image/svg+xml',
  'text/x-shellscript',
  'text/x-python',
]);

function guessMime(filepath: string): string {
  return MIME_MAP[extname(filepath)] ?? 'text/plain';
}

// Max file size for preview (1MB)
const MAX_PREVIEW_SIZE = 1024 * 1024;

const OFFICE_CLAW_ROOT = resolveOfficeClawHostRoot(process.cwd());
const OFFICE_CLAW_SKILLS_SRC = resolveOfficialSkillsRoot(OFFICE_CLAW_ROOT);
const USER_SKILLS_SRC = resolveUserSkillsRoot(OFFICE_CLAW_ROOT);

function normalizeInstalledSkillKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

export function buildInstalledSkillKeySet(
  records: InstalledSkillRecord[],
  localSkillNames: string[] = [],
): Set<string> {
  const keys = new Set<string>();
  const localSkillNameSet = new Set(localSkillNames.map((n) => n.toLowerCase()));
  for (const localSkillName of localSkillNames) {
    const localKey = normalizeInstalledSkillKey(localSkillName);
    if (localKey) keys.add(localKey);
  }
  for (const record of records) {
    const localName = normalizeInstalledSkillKey(record.name);
    if (localName && localSkillNameSet.has(localName)) {
      keys.add(localName);
      const remoteName = normalizeInstalledSkillKey(record.remoteSkillName);
      if (remoteName) keys.add(remoteName);
    }
  }
  return keys;
}

function isInstalledSkill(installedKeys: Set<string>, slug: string): boolean {
  const slugKey = normalizeInstalledSkillKey(slug);
  if (!slugKey) return false;
  return installedKeys.has(slugKey);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizeErrorMessage(message: string): string {
  return message.replace(/^Error:\s*/, '').trim();
}

function translateKnownErrorDetail(message: string): string | null {
  const normalized = normalizeErrorMessage(message);
  if (!normalized) return null;

  if (normalized === 'ZIP does not contain SKILL.md') {
    return '技能压缩包中缺少 SKILL.md';
  }
  if (normalized === 'SKILL.md content is empty') {
    return 'SKILL.md 内容不能为空';
  }

  let match = normalized.match(/^Invalid skill name "(.+)": contains path traversal$/);
  if (match) {
    return `技能名称“${match[1]}”不合法`;
  }

  match = normalized.match(/^Local skill "(.+)" already exists\. Cannot overwrite a local skill\.$/);
  if (match) {
    return `本地技能“${match[1]}”已存在，不能覆盖本地技能`;
  }

  match = normalized.match(/^Failed to download skill: (.+)$/);
  if (match) {
    const nested = translateErrorDetail(match[1]);
    return nested ? `下载技能失败：${nested}` : '下载技能失败，请稍后重试';
  }

  match = normalized.match(/^SKILL\.md exceeds (\d+) bytes$/);
  if (match) {
    return `SKILL.md 超出大小限制（${match[1]} 字节）`;
  }

  match = normalized.match(/^Skill "(.+)" is not installed via SkillHub$/);
  if (match) {
    return `技能“${match[1]}”不是通过技能广场安装的`;
  }

  match = normalized.match(/^Skill “(.+)” is a local skill\. Cannot uninstall local skills\.$/);
  if (match) {
    return `技能”${match[1]}”是本地技能，不能卸载`;
  }

  match = normalized.match(/^Skill “(.+)” is an official skill\. Cannot uninstall official skills\.$/);
  if (match) {
    return `技能”${match[1]}”是官方技能，不能卸载`;
  }

  match = normalized.match(/^Skill “(.+)” not found in user skills directory$/);
  if (match) {
    return `未找到技能”${match[1]}”`;
  }

  match = normalized.match(/^Tencent SkillHub error (\d+):/);
  if (match) {
    return `技能广场服务异常（状态码 ${match[1]}）`;
  }

  match = normalized.match(/^Tencent SkillHub API error: (.+)$/);
  if (match) {
    const nested = translateErrorDetail(match[1]);
    return nested ? `技能广场接口返回错误：${nested}` : '技能广场接口返回错误';
  }

  match = normalized.match(/^Tencent skill download failed: (\d+)$/);
  if (match) {
    return `技能下载失败（状态码 ${match[1]}）`;
  }

  match = normalized.match(/^Skill "(.+)" not found$/);
  if (match) {
    return `未找到技能“${match[1]}”`;
  }

  match = normalized.match(/^File (.+) exceeds (\d+)MB limit$/);
  if (match) {
    return `文件“${match[1]}”超过 ${match[2]}MB 限制`;
  }

  match = normalized.match(/^Total upload size exceeds (\d+)MB limit$/);
  if (match) {
    return `上传文件总大小超过 ${match[1]}MB 限制`;
  }

  return null;
}

export function translateSkillErrorMessage(message: string): string | null {
  return translateKnownErrorDetail(message);
}

function translateErrorDetail(error: unknown): string | null {
  const message = normalizeErrorMessage(getErrorMessage(error));
  if (!message) return null;

  const translated = translateKnownErrorDetail(message);
  if (translated) return translated;
  if (SKILL_NAME_CHINESE_RE.test(message)) return message;
  if (/^\d+$/.test(message)) return message;
  return null;
}

function formatErrorMessage(prefix: string, error: unknown): string {
  const detail = translateErrorDetail(error);
  if (!detail) return `${prefix}，请稍后重试`;
  return `${prefix}：${detail}`;
}

async function listSkillDirs(skillsSrc: string): Promise<string[]> {
  try {
    const { readdir } = await import('node:fs/promises');
    const dirs = await readdir(skillsSrc, { withFileTypes: true });
    const names: string[] = [];
    for (const e of dirs) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      try {
        await readFile(join(skillsSrc, e.name, 'SKILL.md'), 'utf-8');
        names.push(e.name);
      } catch {
        // skip
      }
    }
    return names;
  } catch {
    return [];
  }
}

async function listInstalledLocalSkillNames(): Promise<string[]> {
  const [officialSkillNames, userSkillNames] = await Promise.all([
    listSkillDirs(OFFICE_CLAW_SKILLS_SRC),
    listSkillDirs(USER_SKILLS_SRC),
  ]);
  return [...new Set([...officialSkillNames, ...userSkillNames])];
}

async function listAllInstalledSkillNames(): Promise<string[]> {
  const [officialSkillNames, userSkillNames] = await Promise.all([
    listSkillDirs(OFFICE_CLAW_SKILLS_SRC),
    listSkillDirs(USER_SKILLS_SRC),
  ]);
  const officialSkillNameSet = new Set(officialSkillNames);
  return [...officialSkillNames, ...userSkillNames.filter((name) => !officialSkillNameSet.has(name))];
}

function resolveExistingSkillDir(skillName: string): string | null {
  const officialSkillDir = join(OFFICE_CLAW_SKILLS_SRC, skillName);
  if (existsSync(officialSkillDir)) return officialSkillDir;

  const userSkillDir = join(USER_SKILLS_SRC, skillName);
  if (existsSync(userSkillDir)) return userSkillDir;

  return null;
}

interface BootstrapEntry {
  name: string;
  category: string;
  trigger: string;
}

interface SkillMeta {
  description?: string;
  triggers?: string[];
}

async function parseBootstrap(bootstrapPath: string): Promise<Map<string, BootstrapEntry>> {
  const result = new Map<string, BootstrapEntry>();
  try {
    const content = await readFile(bootstrapPath, 'utf-8');
    const lines = content.split('\n');
    let currentCategory = '';
    for (const line of lines) {
      const categoryMatch = line.match(/^###\s+(.+)/);
      if (categoryMatch?.[1]) {
        currentCategory = categoryMatch[1].trim();
        continue;
      }
      const rowMatch = line.match(/^\|\s*`([a-z][-a-z0-9_]*)`\s*\|\s*(.+?)\s*\|/);
      if (rowMatch?.[1]) {
        result.set(rowMatch[1], { name: rowMatch[1], category: currentCategory, trigger: rowMatch[2]?.trim() ?? '' });
      }
    }
  } catch {
    // not found
  }
  return result;
}

async function parseManifestSkillMeta(skillsSrcDir: string): Promise<Map<string, SkillMeta>> {
  const result = new Map<string, SkillMeta>();
  try {
    const content = await readFile(join(skillsSrcDir, 'manifest.yaml'), 'utf-8');
    const parsed = parseYaml(content) as {
      skills?: Record<string, { description?: unknown; triggers?: unknown }>;
    } | null;
    if (!parsed?.skills || typeof parsed.skills !== 'object') return result;
    for (const [name, meta] of Object.entries(parsed.skills)) {
      const description = typeof meta?.description === 'string' ? meta.description.trim() : undefined;
      const triggers = Array.isArray(meta?.triggers)
        ? meta.triggers
            .filter((v): v is string => typeof v === 'string')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
      if (description || (triggers && triggers.length > 0)) {
        result.set(name, { ...(description ? { description } : {}), ...(triggers?.length ? { triggers } : {}) });
      }
    }
  } catch {
    // skip
  }
  return result;
}

async function getBootstrapNames(skillsSrcDir: string): Promise<Set<string>> {
  return new Set((await parseBootstrap(join(skillsSrcDir, 'BOOTSTRAP.md'))).keys());
}

// ─── File Tree Builder ───────────────────────────────────

const SKIP_FILES = new Set(['.git', '.DS_Store', 'Thumbs.db', 'node_modules', '.next', 'dist']);

async function buildSkillFileTree(skillDir: string, maxDepth: number = 3): Promise<FileTreeNode[]> {
  async function scanDir(dirPath: string, depth: number): Promise<FileTreeNode[]> {
    if (depth >= maxDepth) return [];

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      const nodes: FileTreeNode[] = [];

      // Sort: directories first, then files, alphabetically within each group
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (const entry of sorted) {
        // Skip hidden files and system files
        if (entry.name.startsWith('.') || SKIP_FILES.has(entry.name)) {
          continue;
        }

        const fullPath = join(dirPath, entry.name);
        const relPath = relative(skillDir, fullPath);

        if (entry.isDirectory()) {
          const children = await scanDir(fullPath, depth + 1);
          nodes.push({
            name: entry.name,
            path: relPath,
            type: 'directory',
            children: children.length > 0 ? children : undefined,
          });
        } else {
          const fileStat = await stat(fullPath);
          nodes.push({
            name: entry.name,
            path: relPath,
            type: 'file',
            size: fileStat.size,
          });
        }
      }

      return nodes;
    } catch {
      return [];
    }
  }

  return scanDir(skillDir, 0);
}

export const skillsRoutes: FastifyPluginAsync = async (app) => {
  // ────────────────────────────────────────────────────────
  // GET /api/skills
  // ────────────────────────────────────────────────────────
  app.get('/api/skills', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: '缺少用户身份信息' };
    }

    const [sourceSkills, bootstrapEntries, manifestMeta, installedRecords] = await Promise.all([
      listAllInstalledSkillNames(),
      parseBootstrap(join(OFFICE_CLAW_SKILLS_SRC, 'BOOTSTRAP.md')),
      parseManifestSkillMeta(OFFICE_CLAW_SKILLS_SRC),
      getInstalledRecords(OFFICE_CLAW_ROOT),
    ]);

    const installedNameSet = new Set(installedRecords.map((r) => r.name));
    const installedRecordMap = new Map(installedRecords.map((r) => [r.name, r]));

    const sourceSet = new Set(sourceSkills);
    const mountLookup = new Map<string, SkillEntry>();

    await Promise.all(
      sourceSkills.map(async (name) => {
        const skillDir = resolveExistingSkillDir(name);
        if (!skillDir) return;

        const isRemote = installedNameSet.has(name);
        const entry = bootstrapEntries.get(name);
        const meta = manifestMeta.get(name);
        const frontmatter = await parseSkillFrontmatter(skillDir);
        const installedDescription = installedRecordMap.get(name)?.displayDescription?.trim();

        let trigger = '';
        let category = entry?.category ?? '其他';
        let description = meta?.description ?? frontmatter.description;
        let source: 'local' | 'skillhub' = 'local';
        let skillhubUrl: string | undefined;

        if (isRemote) {
          description = installedDescription || frontmatter.description || description;
          trigger = frontmatter.triggers?.join('、') ?? '';
          category = '技能扩展';
          source = 'skillhub';
          skillhubUrl = installedRecordMap.get(name)?.skillhubUrl;
        } else {
          trigger = meta?.triggers?.length ? meta.triggers.join('、') : (frontmatter.triggers?.join('、') ?? entry?.trigger ?? '');
        }

        mountLookup.set(name, {
          name,
          ...(description ? { description } : {}),
          category,
          trigger,
          source,
          skillhubUrl,
          mounts: {},
        });
      }),
    );

    const ordered: string[] = [];
    const bootstrapOrdered = new Set<string>();
    for (const bsName of bootstrapEntries.keys()) {
      if (sourceSet.has(bsName)) {
        ordered.push(bsName);
        bootstrapOrdered.add(bsName);
      }
    }
    for (const name of sourceSkills) {
      if (!bootstrapOrdered.has(name)) ordered.push(name);
    }
    const skills = ordered.map((n) => mountLookup.get(n)!).filter(Boolean);

    const bootstrapNames = new Set(bootstrapEntries.keys());
    const unregistered = sourceSkills.filter((n) => !bootstrapNames.has(n) && !installedNameSet.has(n));
    const phantom = [...bootstrapNames].filter((n) => !sourceSet.has(n));
    const registrationConsistent = unregistered.length === 0 && phantom.length === 0;

    const allMounted = true;

    return { skills, summary: { total: skills.length, allMounted, registrationConsistent } } satisfies SkillsResponse;
  });

  // ────────────────────────────────────────────────────────
  // GET /api/skills/search
  // ────────────────────────────────────────────────────────
  app.get('/api/skills/search', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: '缺少用户身份信息' };
    }

    const query = (request.query as { keyword?: string }).keyword;
    if (!query) {
      reply.status(400);
      return { error: '缺少必填查询参数：keyword' };
    }

    const page = Number((request.query as { page?: string }).page) || 1;
    const limit = Number((request.query as { limit?: string }).limit) || 20;
    const category = (request.query as { category?: string }).category;

    try {
      const result = await searchSkills(query, { page, limit, category });
      const [installedRecords, localSkillNames] = await Promise.all([
        getInstalledRecords(OFFICE_CLAW_ROOT),
        listInstalledLocalSkillNames(),
      ]);
      const installedKeys = buildInstalledSkillKeySet(installedRecords, localSkillNames);
      return {
        skills: result.data.map((s) => ({ ...s, isInstalled: isInstalledSkill(installedKeys, s.slug) })),
        total: result.total,
        page: result.page,
        hasMore: result.hasMore,
      };
    } catch (err) {
      reply.status(502);
      return { error: formatErrorMessage('技能广场暂时不可用', err) };
    }
  });

  // ────────────────────────────────────────────────────────
  // GET /api/skills/trending
  // ────────────────────────────────────────────────────────
  app.get('/api/skills/trending', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: '缺少用户身份信息' };
    }

    try {
      const result = await trendingSkills();
      const [installedRecords, localSkillNames] = await Promise.all([
        getInstalledRecords(OFFICE_CLAW_ROOT),
        listInstalledLocalSkillNames(),
      ]);
      const installedKeys = buildInstalledSkillKeySet(installedRecords, localSkillNames);
      return {
        skills: result.data.map((s) => ({ ...s, isInstalled: isInstalledSkill(installedKeys, s.slug) })),
        total: result.total,
        page: result.page,
        hasMore: result.hasMore,
      };
    } catch (err) {
      reply.status(502);
      return { error: formatErrorMessage('技能广场暂时不可用', err) };
    }
  });

  // ────────────────────────────────────────────────────────
  // GET /api/skills/all — 获取全部技能（分页）
  // ────────────────────────────────────────────────────────
  app.get('/api/skills/all', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: '缺少用户身份信息' };
    }

    const q = request.query as { page?: string; limit?: string; category?: string };
    const page = parseInt(q.page ?? '1', 10);
    const limit = parseInt(q.limit ?? '24', 10);
    const category = q.category;

    try {
      const result = await listAllSkills({ page, limit, category });
      const [installedRecords, localSkillNames] = await Promise.all([
        getInstalledRecords(OFFICE_CLAW_ROOT),
        listInstalledLocalSkillNames(),
      ]);
      const installedKeys = buildInstalledSkillKeySet(installedRecords, localSkillNames);

      return {
        skills: result.data.map((s) => ({ ...s, isInstalled: isInstalledSkill(installedKeys, s.slug) })),
        total: result.total,
        page: result.page,
        hasMore: result.hasMore,
      };
    } catch (err) {
      reply.status(502);
      return { error: formatErrorMessage('技能广场暂时不可用', err) };
    }
  });

  // ────────────────────────────────────────────────────────
  // GET /api/skills/categories — 获取技能分类列表
  // ────────────────────────────────────────────────────────
  app.get('/api/skills/categories', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: '缺少用户身份信息' };
    }

    try {
      const categories = await getSkillCategories();
      return { categories };
    } catch (err) {
      reply.status(502);
      return { error: formatErrorMessage('技能广场暂时不可用', err) };
    }
  });

  // ────────────────────────────────────────────────────────
  // GET /api/skills/preview
  // ────────────────────────────────────────────────────────
  app.get('/api/skills/preview', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: '缺少用户身份信息' };
    }

    const q = request.query as { owner?: string; repo?: string; skill?: string };
    if (!q.owner || !q.repo || !q.skill) {
      reply.status(400);
      return { error: '缺少必填参数：owner、repo、skill' };
    }

    try {
      const content = await fetchSkillContent(q.owner, q.repo, q.skill);
      return { content, owner: q.owner, repo: q.repo, skill: q.skill };
    } catch (err) {
      reply.status(502);
      return { error: formatErrorMessage('获取技能预览失败', err) };
    }
  });

  // ────────────────────────────────────────────────────────
  // POST /api/skills/install
  // ────────────────────────────────────────────────────────
  app.post('/api/skills/install', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: '缺少用户身份信息' };
    }

    const body = request.body as {
      owner?: string;
      repo?: string;
      skill?: string;
      localName?: string;
      description?: string;
      version?: string;
    };
    if (!body.owner || !body.repo || !body.skill) {
      reply.status(400);
      return { error: '缺少必填参数：owner、repo、skill' };
    }

    try {
      return await installSkill(OFFICE_CLAW_ROOT, {
        owner: body.owner,
        repo: body.repo,
        skill: body.skill,
        localName: body.localName,
        description: body.description,
        version: body.version,
      });
    } catch (err) {
      if (err instanceof SkillInstallError) {
        const map: Record<string, number> = {
          CONFLICT: 409,
          VALIDATION: 422,
          NOT_FOUND: 404,
          FORBIDDEN: 403,
          DOWNLOAD: 502,
        };
        reply.status(map[err.code] ?? 500);
        return {
          success: false,
          error: translateSkillErrorMessage(err.message) ?? '安装技能失败，请稍后重试',
          code: err.code,
        };
      }
      reply.status(500);
      return { success: false, error: formatErrorMessage('安装技能失败', err) };
    }
  });

  // ────────────────────────────────────────────────────────
  // POST /api/skills/check-updates
  // ────────────────────────────────────────────────────────
  app.post('/api/skills/check-updates', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: '缺少用户身份信息' };
    }

    const body = (request.body ?? {}) as { force?: boolean };
    try {
      return await checkSkillUpdates(OFFICE_CLAW_ROOT, { force: body.force === true });
    } catch (err) {
      reply.status(500);
      return { success: false, error: formatErrorMessage('检查技能更新失败', err) };
    }
  });

  // ────────────────────────────────────────────────────────
  // POST /api/skills/update
  // ────────────────────────────────────────────────────────
  app.post('/api/skills/update', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: '缺少用户身份信息' };
    }

    const body = request.body as { name?: string };
    if (!body.name) {
      reply.status(400);
      return { success: false, error: '缺少必填参数：name' };
    }

    try {
      return await updateSkill(OFFICE_CLAW_ROOT, body.name);
    } catch (err) {
      if (err instanceof SkillUpdateError) {
        const map: Record<string, number> = {
          CONFLICT: 409,
          VALIDATION: 422,
          NOT_FOUND: 404,
          FORBIDDEN: 403,
          DOWNLOAD: 502,
          FILESYSTEM: 500,
        };
        reply.status(map[err.code] ?? 500);
        return {
          success: false,
          error: translateSkillErrorMessage(err.message) ?? '更新技能失败，请稍后重试',
          code: err.code,
        };
      }
      reply.status(500);
      return { success: false, error: formatErrorMessage('更新技能失败', err) };
    }
  });

  // ────────────────────────────────────────────────────────
  // POST /api/skills/uninstall
  // ────────────────────────────────────────────────────────
  app.post('/api/skills/uninstall', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: '缺少用户身份信息' };
    }

    const body = request.body as { name?: string };
    if (!body.name) {
      reply.status(400);
      return { error: '缺少必填参数：name' };
    }

    try {
      const bootstrapNames = await getBootstrapNames(OFFICE_CLAW_SKILLS_SRC);
      await uninstallSkill(OFFICE_CLAW_ROOT, body.name, bootstrapNames);
      return { success: true, name: body.name };
    } catch (err) {
      if (err instanceof SkillInstallError) {
        const map: Record<string, number> = {
          CONFLICT: 409,
          VALIDATION: 422,
          NOT_FOUND: 404,
          FORBIDDEN: 403,
          DOWNLOAD: 502,
        };
        reply.status(map[err.code] ?? 500);
        return {
          success: false,
          error: translateSkillErrorMessage(err.message) ?? '卸载技能失败，请稍后重试',
          code: err.code,
        };
      }
      reply.status(500);
      return { success: false, error: formatErrorMessage('卸载技能失败', err) };
    }
  });

  // ────────────────────────────────────────────────────────
  // GET /api/skills/detail — 获取已安装 skill 详情
  // ────────────────────────────────────────────────────────
  app.get('/api/skills/detail', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: '缺少用户身份信息' };
    }

    const q = request.query as { name?: string };
    if (!q.name) {
      reply.status(400);
      return { error: '缺少必填参数：name' };
    }

    const skillName = q.name.trim();

    // Security: prevent path traversal
    if (!skillName || /[\\/]|(\.\.)/.test(skillName)) {
      reply.status(400);
      return { error: '技能名称不合法' };
    }

    const skillDir = resolveExistingSkillDir(skillName);
    const skillDirExists = !!skillDir;

    // For office-claw skills, require SKILL.md to exist
    // For external skills (from capabilities.json), allow missing files
    if (skillDir && !existsSync(join(skillDir, 'SKILL.md'))) {
      // Directory exists but no SKILL.md - still allow for external skills
      // We'll check capabilities.json later to determine if it's a valid skill
    }

    try {
      // Parallel fetch all data sources
      const [bootstrapEntries, manifestMeta, installedRecords, fileTree, capabilitiesConfig] = await Promise.all([
        parseBootstrap(join(OFFICE_CLAW_SKILLS_SRC, 'BOOTSTRAP.md')),
        parseManifestSkillMeta(OFFICE_CLAW_SKILLS_SRC),
        getInstalledRecords(OFFICE_CLAW_ROOT),
        skillDir ? buildSkillFileTree(skillDir) : Promise.resolve([]),
        readCapabilitiesConfig(OFFICE_CLAW_ROOT),
      ]);

      // Check if skill exists in capabilities.json
      const capabilityEntry = capabilitiesConfig?.capabilities.find((c) => c.id === skillName && c.type === 'skill');

      // If skill directory doesn't exist and not in capabilities, return 404
      if (!skillDirExists && !capabilityEntry) {
        reply.status(404);
        return { error: `未找到技能“${skillName}”` };
      }

      // Determine source: check capabilities.json first, then installed records
      // Only treat as external if from SkillHub (source === 'skillhub'), not local uploads
      const isExternalCap = capabilityEntry?.source === 'external';
      const installedRecord = installedRecords.find((r) => r.name === skillName);
      const isSkillhubInstalled = installedRecord?.source === 'skillhub';
      const isLocalInstalled = installedRecord?.source === 'local';
      const isRemote = isSkillhubInstalled || isExternalCap || isLocalInstalled;
      const source: 'builtin' | 'external' = isRemote ? 'external' : 'builtin';

      // Get category
      const bootstrapEntry = bootstrapEntries.get(skillName);
      const category = isRemote ? '技能扩展' : (bootstrapEntry?.category ?? '其他');

      // Get description and triggers from manifest or frontmatter (only if directory exists)
      let meta = manifestMeta.get(skillName);
      if (!meta && skillDirExists) {
        const frontmatter = await parseSkillFrontmatter(skillDir);
        if (frontmatter.description || frontmatter.triggers?.length) {
          meta = {
            description: frontmatter.description,
            triggers: frontmatter.triggers,
          };
        }
      }
      const installedDescription = installedRecord?.displayDescription?.trim();
      if (installedDescription) {
        meta = {
          ...meta,
          description: installedDescription,
        };
      }
      const frontmatterCategory = skillDirExists ? (await parseSkillFrontmatter(skillDir)).category?.trim() : undefined;
      const resolvedCategory = isLocalInstalled ? frontmatterCategory || category : category;

      // Build response
      const response: SkillDetailResponse = {
        id: skillName,
        name: skillName,
        source,
        enabled: capabilityEntry?.enabled ?? true,
        category: resolvedCategory,
        agents: {},
        fileTree,
      };

      if (meta?.description) response.description = meta.description;
      if (meta?.triggers?.length) response.triggers = meta.triggers;

      // Remote skill extra info
      if (isRemote) {
        if (installedRecord) {
          response.installedAt = installedRecord.installedAt;
          response.skillhubUrl = installedRecord.skillhubUrl;
          response.owner = installedRecord.owner;
          response.repo = installedRecord.repo;
          response.remoteSkillName = installedRecord.remoteSkillName;
        }
      }

      response.mounts = {};

      return response;
    } catch (err) {
      reply.status(500);
      return { error: formatErrorMessage('获取技能详情失败', err) };
    }
  });

  // ────────────────────────────────────────────────────────
  // GET /api/skills/file — 预览 skill 目录中的文本文件
  // ────────────────────────────────────────────────────────
  app.get('/api/skills/file', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: '缺少用户身份信息' };
    }

    const q = request.query as { name?: string; path?: string };
    if (!q.name || !q.path) {
      reply.status(400);
      return { error: '缺少必填参数：name、path' };
    }

    const skillName = q.name.trim();
    const filePath = q.path.trim();

    if (!skillName || /[\\/]|(\.\.)/.test(skillName)) {
      reply.status(400);
      return { error: '技能名称不合法' };
    }
    if (filePath.includes('..') || filePath.startsWith('/')) {
      reply.status(400);
      return { error: '文件路径不合法' };
    }

    const fileName = filePath.split(/[/\\]/).pop() ?? '';
    if (fileName.startsWith('.')) {
      reply.status(403);
      return { error: '不允许读取隐藏文件' };
    }

    const skillDir = resolveExistingSkillDir(skillName);
    if (!skillDir) {
      reply.status(404);
      return { error: `未找到技能“${skillName}”` };
    }

    const fullPath = join(skillDir, filePath);
    const resolvedPath = resolve(fullPath);
    const resolvedSkillDir = resolve(skillDir);
    if (!resolvedPath.startsWith(resolvedSkillDir + sep) && resolvedPath !== resolvedSkillDir) {
      reply.status(403);
      return { error: '检测到非法路径访问' };
    }

    try {
      const fileStat = await stat(resolvedPath);
      if (fileStat.isDirectory()) {
        reply.status(400);
        return { error: '该路径是目录，不能直接预览' };
      }

      const mime = guessMime(resolvedPath);
      if (!TEXT_MIME_TYPES.has(mime) && !mime.startsWith('text/')) {
        reply.status(415);
        return { error: '当前文件类型不支持预览，仅支持文本文件' };
      }

      const truncated = fileStat.size > MAX_PREVIEW_SIZE;
      const content = await readFile(resolvedPath, 'utf-8');
      const displayContent = truncated ? content.slice(0, MAX_PREVIEW_SIZE) : content;

      return {
        path: filePath,
        content: displayContent,
        size: fileStat.size,
        mime,
        truncated,
      } satisfies SkillFileResponse;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        reply.status(404);
        return { error: '文件不存在' };
      }
      reply.status(500);
      return { error: formatErrorMessage('读取文件失败', e) };
    }
  });

  // ────────────────────────────────────────────────────────
  // POST /api/skills/upload — 上传本地 skill（JSON 格式）
  // ────────────────────────────────────────────────────────
  app.post('/api/skills/upload', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: '缺少用户身份信息' };
    }

    const body = request.body as {
      name?: string;
      files?: { path: string; content: string }[];
    };

    if (!body.name || !body.files?.length) {
      reply.status(400);
      return { success: false, error: '缺少技能名称或文件内容' };
    }
    if (body.files.length > SKILL_UPLOAD_MAX_FILES) {
      reply.status(422);
      return { success: false, error: `文件数量过多，最多允许 ${SKILL_UPLOAD_MAX_FILES} 个` };
    }

    const skillName = body.name.trim();
    if (!skillName || /[\\/]|(\.\.)/.test(skillName)) {
      reply.status(422);
      return { success: false, error: '技能名称不合法' };
    }
    if (!SKILL_NAME_ALLOWED_RE.test(skillName)) {
      reply.status(422);
      return { success: false, error: '技能名称不能包含中文字符' };
    }

    const skillsDir = resolve(USER_SKILLS_SRC);
    const skillDir = join(skillsDir, skillName);
    if (resolveExistingSkillDir(skillName)) {
      reply.status(409);
      return { success: false, error: `技能“${skillName}”已存在` };
    }
    let createdSkillDir = false;

    try {
      // Detect common prefix directory (e.g. all files under "my-skill/" folder)
      // If all paths share the same first directory, strip it
      const paths = body.files.map((f) => f.path.replace(/\\/g, '/'));
      let prefix = '';
      if (paths.length > 0) {
        const firstSegment = paths[0].split('/')[0];
        if (firstSegment && paths.every((p) => p.startsWith(`${firstSegment}/`))) {
          prefix = `${firstSegment}/`;
        }
      }

      const preparedFiles: { originalPath: string; strippedPath: string; fullPath: string; content: Buffer }[] = [];
      let totalBytes = 0;

      for (const file of body.files) {
        const relPath = file.path.replace(/\\/g, '/');
        const stripped = prefix ? relPath.slice(prefix.length) : relPath;
        if (stripped.includes('..') || stripped.startsWith('/')) continue;
        const fullPath = resolve(skillDir, stripped);
        if (!fullPath.startsWith(resolve(skillDir) + sep)) continue;
        const content = Buffer.from(file.content, 'base64');
        if (content.length > SKILL_UPLOAD_MAX_FILE_BYTES) {
          reply.status(422);
          return {
            success: false,
            error: `文件“${stripped}”超过 ${Math.floor(SKILL_UPLOAD_MAX_FILE_BYTES / (1024 * 1024))}MB 限制`,
          };
        }
        totalBytes += content.length;
        if (totalBytes > SKILL_UPLOAD_MAX_TOTAL_BYTES) {
          reply.status(422);
          return {
            success: false,
            error: `上传文件总大小超过 ${Math.floor(SKILL_UPLOAD_MAX_TOTAL_BYTES / (1024 * 1024))}MB 限制`,
          };
        }
        preparedFiles.push({ originalPath: file.path, strippedPath: stripped, fullPath, content });
      }

      await mkdir(skillDir, { recursive: true });
      createdSkillDir = true;

      for (const file of preparedFiles) {
        await mkdir(dirname(file.fullPath), { recursive: true });
        await writeFile(file.fullPath, file.content);
      }

      // Verify SKILL.md exists
      if (!existsSync(join(skillDir, 'SKILL.md'))) {
        if (createdSkillDir) {
          await rm(skillDir, { recursive: true, force: true }).catch(() => {});
        }
        reply.status(422);
        return { success: false, error: '上传的文件中必须包含 SKILL.md' };
      }

      // Create symlinks
      const { createProviderSymlinks } = await import('../domains/agents/services/skillhub/SymlinkManager.js');
      const mounts = await createProviderSymlinks(skillName, skillsDir);

      // Register in installed-skills.json
      const { addInstalledSkill } = await import('../domains/agents/services/skillhub/InstalledSkillRegistry.js');
      await addInstalledSkill(OFFICE_CLAW_ROOT, {
        name: skillName,
        source: 'local',
        skillhubUrl: '',
        owner: 'local',
        repo: 'upload',
        remoteSkillName: skillName,
        installedAt: new Date().toISOString(),
      });

      return {
        success: true,
        name: skillName,
        localPath: `.office-claw/skills/${skillName}`,
        files: preparedFiles.map((f) => f.originalPath),
        mounts,
      };
    } catch (err) {
      if (createdSkillDir) {
        await rm(skillDir, { recursive: true, force: true }).catch(() => {});
      }
      reply.status(500);
      return { success: false, error: formatErrorMessage('上传技能失败', err) };
    }
  });
};
