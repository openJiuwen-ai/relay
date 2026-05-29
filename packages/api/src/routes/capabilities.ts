/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Capabilities Route — F041 统一能力看板 API
 *
 * GET  /api/capabilities — 返回看板聚合视图 (CapabilityBoardResponse)
 * PATCH /api/capabilities — 开关单个能力 (global or per-agent override)
 *
 * F041 Re-open fixes:
 * - Skill descriptions from SKILL.md frontmatter
 * - Source classification: project-level skills → 'office-claw'
 * - Cat family grouping metadata for frontend
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type {
  CapabilityBoardItem,
  CapabilityBoardResponse,
  CapabilityEntry,
  CapabilityPatchRequest,
  AgentFamily,
  McpToolInfo,
  SkillHealthSummary,
} from '@openjiuwen/relay-shared';
import { officeClawRegistry } from '@openjiuwen/relay-shared';
import type { FastifyPluginAsync } from 'fastify';
import { parse as parseYaml } from 'yaml';
import {
  bootstrapCapabilities,
  type DiscoveryPaths,
  discoverExternalMcpServers,
  generateCliConfigs,
  readCapabilitiesConfig,
  resolveServersForCat,
  toCapabilityEntry,
  writeCapabilitiesConfig,
} from '../config/capabilities/capability-orchestrator.js';
import { loadInstalledRegistry } from '../domains/agents/services/skillhub/InstalledSkillRegistry.js';
import { resolveUserSkillsRoot } from '../domains/agents/services/skillhub/SkillPaths.js';
import { parseFrontmatterString } from '../domains/agents/services/skillhub/frontmatter-parser.js';
import { resolveOfficeClawHostRoot } from '../utils/office-claw-root.js';
import { validateProjectPath } from '../utils/project-path.js';
import {
  listRelayClawSharedSkillNames,
  resolveOfficeClawSkillsSourceDir,
  resolveRelayClawSharedSkillsDirs,
} from '../utils/relayclaw-skills.js';
import { resolveUserId } from '../utils/request-identity.js';
import { type McpProbeResult, probeMcpCapability } from './mcp-probe.js';

// ────────── Helpers ──────────

/**
 * Returns subdirectory names.
 * - ENOENT (dir missing) → [] (normal — not all providers have skill dirs)
 * - Other errors (EACCES, EIO) → null (real scan failure — unsafe to prune)
 */
async function listSubdirs(dir: string, exclude?: string[]): Promise<string[] | null> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !(exclude ?? []).includes(e.name))
      .map((e) => e.name);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      return [];
    }
    return null;
  }
}

/**
 * Returns subdirectory names that contain a readable SKILL.md.
 * This prevents non-skill folders (e.g. office-claw-skills/refs) from being
 * treated as skills and synced into capabilities.json / Hub UI.
 */
async function listSkillSubdirs(dir: string, exclude?: string[]): Promise<string[] | null> {
  const subdirs = await listSubdirs(dir, exclude);
  if (subdirs == null) return null;
  const names: string[] = [];
  for (const name of subdirs) {
    try {
      await readFile(join(dir, name, 'SKILL.md'), 'utf-8');
      names.push(name);
    } catch {
      // Not a skill dir (or unreadable), skip
    }
  }
  return names;
}

const execFileAsync = promisify(execFile);

/**
 * Resolve canonical main repo path (not worktree path).
 * Symlinks point to the main repo, so mount checks must use main repo path.
 */
let cachedMainRepoPath: string | null = null;
let cachedMainRepoPathPromise: Promise<string> | null = null;
async function resolveMainRepoPath(): Promise<string> {
  if (cachedMainRepoPath) return cachedMainRepoPath;
  if (cachedMainRepoPathPromise) return cachedMainRepoPathPromise;
  cachedMainRepoPathPromise = (async () => {
    try {
      const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain']);
      const firstLine = stdout.split('\n')[0] ?? '';
      return firstLine.replace(/^worktree\s+/, '').trim();
    } catch {
      try {
        const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel']);
        return stdout.trim();
      } catch {
        return resolve(process.cwd(), '../..');
      }
    }
  })().then((p) => {
    cachedMainRepoPath = p;
    return p;
  });
  return cachedMainRepoPathPromise;
}

/** Walk up from CWD to find pnpm-workspace.yaml — the monorepo root. */
const PROJECT_ROOT = resolveOfficeClawHostRoot(process.cwd());

function getProjectRoot(): string {
  return PROJECT_ROOT;
}

const OFFICE_CLAW_SKILLS_SRC = resolveOfficeClawSkillsSourceDir();

/**
 * P1-1 fix: All CLI config paths are project-level (not user-level).
 * This ensures multi-project isolation — different projects have different configs.
 */
function getDiscoveryPaths(projectRoot: string) {
  return {
    claudeConfig: join(projectRoot, '.mcp.json'),
    codexConfig: join(projectRoot, '.codex', 'config.toml'),
    geminiConfig: join(projectRoot, '.gemini', 'settings.json'),
  };
}

function getCliConfigPaths(projectRoot: string) {
  return {
    anthropic: join(projectRoot, '.mcp.json'),
    openai: join(projectRoot, '.codex', 'config.toml'),
    google: join(projectRoot, '.gemini', 'settings.json'),
  };
}

interface SkillMeta {
  description?: string;
  triggers?: string[];
}

/**
 * Extract description + triggers from a SKILL.md frontmatter.
 * Triggers are embedded in descriptions:
 *   'Triggers on "X", "Y", "Z"' or '触发词："X"、"Y"'
 */
async function readSkillMeta(skillDir: string): Promise<SkillMeta> {
  const skillMdPath = join(skillDir, 'SKILL.md');
  try {
    const content = await readFile(skillMdPath, 'utf-8');
    const frontmatter = parseFrontmatterString(content);
    const desc = frontmatter.description?.trim() ?? '';
    if (!desc) return {};

    // Prefer explicit frontmatter `triggers` when available.
    const triggers: string[] = frontmatter.triggers ? [...frontmatter.triggers] : [];

    // Backward compatibility: extract triggers from description text for legacy skills.
    if (triggers.length === 0) {
      // English: Triggers on "X", "Y", "Z"
      const enMatch = desc.match(/[Tt]riggers?\s+on\s+"([^"]+)"(,\s*"([^"]+)")*/);
      if (enMatch) {
        const allQuoted = desc.match(/[Tt]riggers?\s+on\s+(.*)/);
        if (allQuoted) {
          for (const m of allQuoted[1]?.matchAll(/"([^"]+)"/g)) {
            triggers.push(m[1]!);
          }
        }
      }
      // Chinese: 触发词："X"、"Y" or 触发词：X、Y
      const cnMatch = desc.match(/触发词[：:]\s*(.*)/);
      if (cnMatch) {
        const raw = cnMatch[1]!;
        // Quoted: "X"、"Y"
        for (const m of raw.matchAll(/["""]([^"""]+)["""]/g)) {
          triggers.push(m[1]!);
        }
        // Unquoted fallback: X、Y、Z
        if (triggers.length === 0) {
          triggers.push(
            ...raw
              .split(/[、,，]/)
              .map((s) => s.trim())
              .filter(Boolean),
          );
        }
      }
    }

    // Clean description: strip trigger suffix for display
    let cleanDesc = desc
      .replace(/\s*[Tt]riggers?\s+on\s+.*$/, '')
      .replace(/\s*触发词[：:].*$/, '')
      .replace(/\.\s*$/, '')
      .trim();
    if (!cleanDesc) cleanDesc = desc;

    const result: SkillMeta = { description: cleanDesc };
    if (triggers.length > 0) result.triggers = triggers;
    return result;
  } catch {
    return {};
  }
}

/**
 * Parse BOOTSTRAP.md to extract skill → category mapping.
 * Categories come from ### headers, skills from table rows.
 */
async function parseBootstrapCategories(skillsSrcDir: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const bootstrapPath = join(skillsSrcDir, 'BOOTSTRAP.md');
  try {
    const content = await readFile(bootstrapPath, 'utf-8');
    let currentCategory = '';
    for (const line of content.split('\n')) {
      const categoryMatch = line.match(/^###\s+(.+)/);
      if (categoryMatch?.[1]) {
        currentCategory = categoryMatch[1].trim();
        continue;
      }
      const rowMatch = line.match(/^\|\s*`([a-z][-a-z0-9]*)`\s*\|/);
      if (rowMatch?.[1] && currentCategory) {
        result.set(rowMatch[1], currentCategory);
      }
    }
  } catch {
    // BOOTSTRAP.md not found — no categories
  }
  return result;
}

/**
 * Get all skill names defined in BOOTSTRAP.md (preset skills).
 * These are the official skills provided by us.
 */
async function getBootstrapSkillNames(skillsSrcDir: string): Promise<Set<string>> {
  const bootstrapPath = join(skillsSrcDir, 'BOOTSTRAP.md');
  try {
    const content = await readFile(bootstrapPath, 'utf-8');
    const names = new Set<string>();
    for (const line of content.split('\n')) {
      const rowMatch = line.match(/^\|\s*`([a-z][-a-z0-9]*)`\s*\|/);
      if (rowMatch?.[1]) {
        names.add(rowMatch[1]);
      }
    }
    return names;
  } catch {
    return new Set();
  }
}

/**
 * Parse manifest.yaml and extract skill description/triggers.
 * F042: manifest is the routing source-of-truth.
 */
async function parseManifestSkillMeta(skillsSrcDir: string): Promise<Map<string, SkillMeta>> {
  const result = new Map<string, SkillMeta>();
  const manifestPath = join(skillsSrcDir, 'manifest.yaml');
  try {
    const content = await readFile(manifestPath, 'utf-8');
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
        result.set(name, {
          ...(description ? { description } : {}),
          ...(triggers && triggers.length > 0 ? { triggers } : {}),
        });
      }
    }
  } catch {
    // manifest missing or invalid — fallback to SKILL.md metadata
  }
  return result;
}

/** Known MCP server descriptions */
const MCP_DESCRIPTIONS: Record<string, string> = {
  'office-claw-collab': '协作工具 — 消息、上下文、任务、权限等（协作核心）',
  'office-claw-memory': '记忆工具 — 证据检索、反思、会话链回放',
  'office-claw-signals': '信号工具 — inbox 检索、搜索、摘要',
};
const MAX_CONCURRENT_MCP_PROBES = 4;
const DOCKER_GATEWAY_DESCRIPTION_BASE =
  'Docker MCP Gateway（聚合器）— 工具来自启用的子 server，不等于 Docker 本体工具集。';

function isDockerGatewayCapability(cap: CapabilityEntry): boolean {
  const command = cap.mcpServer?.command?.toLowerCase();
  const args = cap.mcpServer?.args?.map((arg) => arg.toLowerCase()) ?? [];
  return command === 'docker' && args[0] === 'mcp' && args[1] === 'gateway' && args[2] === 'run';
}

function inferDockerGatewayFamilies(tools: McpToolInfo[] | undefined): string[] {
  if (!tools || tools.length === 0) return [];
  const names = tools.map((tool) => tool.name);
  const families: string[] = [];
  if (names.some((name) => name.startsWith('browser_'))) families.push('playwright(browser_*)');
  if (names.some((name) => name === 'search' || name === 'listNamespaces' || name === 'getRepositoryInfo')) {
    families.push('dockerhub');
  }
  if (names.some((name) => name === 'docker' || name.startsWith('mcp-') || name === 'code-mode')) {
    families.push('docker-gateway');
  }
  return families;
}

export function describeMcpCapability(cap: CapabilityEntry, tools?: McpToolInfo[]): string | undefined {
  const known = MCP_DESCRIPTIONS[cap.id];
  if (known) return known;
  if (!isDockerGatewayCapability(cap)) return undefined;
  const families = inferDockerGatewayFamilies(tools);
  return families.length > 0
    ? `${DOCKER_GATEWAY_DESCRIPTION_BASE} 当前探测到：${families.join(' / ')}`
    : DOCKER_GATEWAY_DESCRIPTION_BASE;
}

/**
 * Build agent family grouping from officeClawRegistry.
 * Groups agentIds by breedId (e.g. ragdoll → [opus, opus-45, sonnet]).
 */
function buildAgentFamilies(): AgentFamily[] {
  const familyMap = new Map<string, { name: string; agentIds: string[] }>();

  for (const agentId of officeClawRegistry.getAllIds()) {
    const entry = officeClawRegistry.tryGet(agentId as string);
    if (!entry) continue;
    const breedId = entry.config.breedId ?? 'unknown';
    const breedName = entry.config.breedDisplayName ?? breedId;

    let family = familyMap.get(breedId);
    if (!family) {
      family = { name: breedName, agentIds: [] };
      familyMap.set(breedId, family);
    }
    family.agentIds.push(agentId as string);
  }

  return Array.from(familyMap.entries()).map(([id, f]) => ({
    id,
    name: f.name,
    agentIds: f.agentIds.sort(),
  }));
}

// ────────── Route Plugin ──────────

export const capabilitiesRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /api/capabilities ──
  app.get('/api/capabilities', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    // Multi-project: accept ?projectPath=... to manage capabilities for any project
    const query = request.query as { projectPath?: string; probe?: string | boolean };
    const probeEnabled = query.probe === true || query.probe === 'true' || query.probe === '1';
    let projectRoot = getProjectRoot();
    if (query.projectPath) {
      const validated = await validateProjectPath(query.projectPath);
      if (!validated) {
        reply.status(400);
        return { error: 'Invalid project path: must be an existing directory under allowed roots' };
      }
      projectRoot = validated;
    }

    // 1. Load or bootstrap capabilities.json
    let config = await readCapabilitiesConfig(projectRoot);
    if (!config) {
      // Multi-project: when bootstrapping a non-office-claw project, still point the
      // OfficeClaw MCP server to THIS repo (host), not the managed project root.
        config = await bootstrapCapabilities(projectRoot, getDiscoveryPaths(projectRoot), {
          officeClawRepoRoot: getProjectRoot(),
        });
      }

    // Always regenerate CLI configs so that config changes (e.g. new env
    // placeholders for Gemini MCP) are applied to existing environments
    // without requiring a full re-bootstrap.  writeXxxMcpConfig functions
    // are idempotent merge-writers, so repeated calls are safe and cheap.
    await generateCliConfigs(config, getCliConfigPaths(projectRoot));

    // 2. Discover skills (filesystem scan — separate from MCP)
    // Only scan OfficeClaw's own skill directories. External CLI directories
    // (~/.claude/skills, ~/.codex/skills, ~/.gemini/skills) are not scanned
    // to avoid including unrelated skills from other agent runtimes.

    // Scan office-claw-skills/ for official skills
    const hostRoot = resolveOfficeClawHostRoot(process.cwd());
    const officeClawSkillsDir = OFFICE_CLAW_SKILLS_SRC;
    const userInstalledSkillsDir = resolveUserSkillsRoot(hostRoot);
    const officeClawOwnSkills = await listSkillSubdirs(officeClawSkillsDir);
    const userInstalledSkills = await listSkillSubdirs(userInstalledSkillsDir);
    const hasProjectOfficeClawSkillsDir = existsSync(officeClawSkillsDir);

    // Official skills come from office-claw-skills/ directory
    const projectSkillNames = new Set([
      ...(officeClawOwnSkills ?? []),
      ...(userInstalledSkills ?? []),
    ]);

    const agentIds = officeClawRegistry.getAllIds().map((id) => id as string);
    const relayclawSkillNames = listRelayClawSharedSkillNames();
    const relayclawApplicableSkillNames = [
      ...new Set([...relayclawSkillNames, ...(userInstalledSkills ?? [])]),
    ];
    const relayclawApplicableSkills = new Map<string, string[]>();
    for (const agentId of agentIds) {
      const entry = officeClawRegistry.tryGet(agentId);
      if (entry?.config.provider === 'relayclaw') {
        relayclawApplicableSkills.set(agentId, relayclawApplicableSkillNames);
      }
    }

    const providerSkills: Record<string, string[]> = {
      anthropic: [
        ...new Set([...(officeClawOwnSkills ?? []), ...(userInstalledSkills ?? [])]),
      ],
      relayclaw: relayclawApplicableSkillNames,
    };

    // 3. Sync discovered skills into capabilities.json
    const installedRegistry = await loadInstalledRegistry(hostRoot);
    const remoteInstalledNames = new Set(installedRegistry.skills.map((s) => s.name));
    const installedAtMap = new Map<string, string>();
    const installedDescriptionMap = new Map<string, string>();
    for (const record of installedRegistry.skills) {
      installedAtMap.set(record.name, record.installedAt);
      if (record.displayDescription?.trim()) {
        installedDescriptionMap.set(record.name, record.displayDescription.trim());
      }
    }
    const allSkillNames = new Set<string>();
    for (const skills of Object.values(providerSkills)) {
      for (const s of skills) allSkillNames.add(s);
    }
    // Cloud P2: include source-only OfficeClaw skills (present in office-claw-skills/ but not mounted
    // into any provider directory yet) so mount health can detect missing mounts.
    if (officeClawOwnSkills !== null) {
      for (const s of officeClawOwnSkills) allSkillNames.add(s);
    }
    if (userInstalledSkills !== null) {
      for (const s of userInstalledSkills) allSkillNames.add(s);
    }

    let configDirty = false;
    // Add newly discovered skills
    for (const skillName of allSkillNames) {
      const exists = config.capabilities.some((c) => c.type === 'skill' && c.id === skillName);
      if (!exists) {
        // F041 re-open fix: project-level skills → 'builtin', user-level → 'external'
        const source = remoteInstalledNames.has(skillName)
          ? ('external' as const)
          : projectSkillNames.has(skillName)
            ? ('builtin' as const)
            : ('external' as const);
        config.capabilities.push({
          id: skillName,
          type: 'skill',
          enabled: true,
          source,
        });
        configDirty = true;
      }
    }

    // 4. Build skill metadata lookup (description + triggers + category)
    // Categories + registration must be parsed from the SAME root used for mount checks.
    const mainRepo = await resolveMainRepoPath();
    const mainSkillsSrc = join(mainRepo, 'office-claw-skills');
    // Use dir existence (not skill count) to avoid treating existing-but-empty as "missing".
    const mountSkillsSrc =
      officeClawOwnSkills !== null && hasProjectOfficeClawSkillsDir ? officeClawSkillsDir : mainSkillsSrc;

    // Also fix source for existing skills
    // Only skills in BOOTSTRAP.md are official (office-claw), others are external
    const bootstrapSkillNames = await getBootstrapSkillNames(mountSkillsSrc);
    for (const cap of config.capabilities) {
      if (cap.type !== 'skill') continue;
      const isPresetSkill = bootstrapSkillNames.has(cap.id);
      const newSource = isPresetSkill ? 'builtin' : 'external';
      if (cap.source !== newSource) {
        cap.source = newSource;
        configDirty = true;
      }
    }

    const [skillCategoryMap, manifestMetaMap] = await Promise.all([
      parseBootstrapCategories(mountSkillsSrc),
      parseManifestSkillMeta(mountSkillsSrc),
    ]);
    const skillMetaMap = new Map<string, SkillMeta>();

    const skillDirCandidates: { name: string; dir: string }[] = [];
    for (const name of allSkillNames) {
      skillDirCandidates.push({ name, dir: join(userInstalledSkillsDir, name) });
    }

    const metaResults = await Promise.all(
      skillDirCandidates.map(async ({ name, dir }) => ({
        name,
        meta: await readSkillMeta(dir),
      })),
    );
    for (const { name, meta } of metaResults) {
      if (meta.description && !skillMetaMap.has(name)) {
        skillMetaMap.set(name, meta);
      }
    }

    // 5. Build board items from capabilities.json
    const items: CapabilityBoardItem[] = [];

    // MCP capabilities
    for (const cap of config.capabilities) {
      if (cap.type !== 'mcp') continue;
      const agents: Record<string, boolean> = {};
      for (const agentId of agentIds) {
        const servers = resolveServersForCat(config, agentId);
        const server = servers.find((s) => s.name === cap.id);
        agents[agentId] = server?.enabled ?? false;
      }
      const mcpItem: CapabilityBoardItem = {
        id: cap.id,
        type: 'mcp',
        source: cap.source,
        enabled: cap.enabled,
        agents,
      };
      const mcpDesc = describeMcpCapability(cap);
      if (mcpDesc) mcpItem.description = mcpDesc;
      items.push(mcpItem);
    }

    // Skill capabilities (from capabilities.json, presence from filesystem)
    for (const cap of config.capabilities) {
      if (cap.type !== 'skill') continue;
      const agents: Record<string, boolean> = {};
      for (const agentId of agentIds) {
        const entry = officeClawRegistry.tryGet(agentId);
        const provider = entry?.config.provider ?? 'unknown';
        const presentForProvider =
          provider === 'relayclaw'
            ? (relayclawApplicableSkills.get(agentId) ?? []).includes(cap.id)
            : (providerSkills[provider] ?? []).includes(cap.id);
        if (!presentForProvider) continue; // Sparse agents: omit irrelevant agents so frontend filter works
        const override = cap.overrides?.find((o) => o.agentId === agentId);
        const enabled = override ? override.enabled : cap.enabled;
        agents[agentId] = enabled;
      }
      const skillItem: CapabilityBoardItem = {
        id: cap.id,
        type: 'skill',
        source: cap.source,
        enabled: cap.enabled,
        agents,
      };
      const meta =
        cap.source === 'builtin' ? (manifestMetaMap.get(cap.id) ?? skillMetaMap.get(cap.id)) : skillMetaMap.get(cap.id);
      const installedDescription = installedDescriptionMap.get(cap.id);
      if (installedDescription) skillItem.description = installedDescription;
      else if (meta?.description) skillItem.description = meta.description;
      if (meta?.triggers) skillItem.triggers = meta.triggers;
      const category = skillCategoryMap.get(cap.id);
      skillItem.category = category ?? (remoteInstalledNames.has(cap.id) ? '技能扩展' : '其他');
      if (installedAtMap.has(cap.id)) {
        skillItem.installedAt = installedAtMap.get(cap.id);
      }
      items.push(skillItem);
    }

    // Optional MCP probe: fill connectionStatus + tools via tools/list.
    if (probeEnabled) {
      const mcpCaps = config.capabilities.filter((cap) => cap.type === 'mcp');
      const mcpItemById = new Map(
        items
          .filter((item): item is CapabilityBoardItem & { type: 'mcp' } => item.type === 'mcp')
          .map((item) => [item.id, item] as const),
      );
      const probeEntries: Array<readonly [string, McpProbeResult]> = [];
      const probeOne = async (cap: (typeof mcpCaps)[number]): Promise<readonly [string, McpProbeResult]> => {
        const boardItem = mcpItemById.get(cap.id);
        const anyAgentEnabled = boardItem ? Object.values(boardItem.agents).some(Boolean) : cap.enabled;
        if (!anyAgentEnabled) {
          return [cap.id, { connectionStatus: 'unknown' }] as const;
        }
        const probe = await probeMcpCapability(cap, { projectRoot });
        return [cap.id, probe] as const;
      };
      for (let i = 0; i < mcpCaps.length; i += MAX_CONCURRENT_MCP_PROBES) {
        const chunk = mcpCaps.slice(i, i + MAX_CONCURRENT_MCP_PROBES);
        const chunkEntries = await Promise.all(chunk.map(probeOne));
        probeEntries.push(...chunkEntries);
      }
      const probeMap = new Map(probeEntries);
      for (const item of items) {
        if (item.type !== 'mcp') continue;
        const probe = probeMap.get(item.id);
        if (!probe) continue;
        item.connectionStatus = probe.connectionStatus;
        if (probe.tools) item.tools = probe.tools;
        const cap = mcpCaps.find((entry) => entry.id === item.id);
        if (cap) {
          const dynamicDesc = describeMcpCapability(cap, probe.tools);
          if (dynamicDesc) item.description = dynamicDesc;
        }
      }
    }

    // 6. Mount health check for office-claw skills
    // Multi-project: validate mounts against the selected project's office-claw-skills
    // if it exists; otherwise fall back to host repo's office-claw-skills.

    const mountSourceNames = new Set(
      mountSkillsSrc === officeClawSkillsDir
        ? (officeClawOwnSkills ?? [])
        : ((await listSkillSubdirs(mountSkillsSrc)) ?? []),
    );
    const officeClawSkillItems = items.filter((i) => i.type === 'skill' && i.source === 'builtin');
    const relayclawSharedSkillsEnabled = resolveRelayClawSharedSkillsDirs().length > 0;
    for (const item of officeClawSkillItems) {
      item.mounts = {
        relayclaw: relayclawSharedSkillsEnabled && mountSourceNames.has(item.id),
      };
    }

    // Registration consistency: BOOTSTRAP.md vs source dir (exclude remote-installed skills)
    const bootstrapNames = new Set(skillCategoryMap.keys());
    const unregistered = [...mountSourceNames].filter((n) => !bootstrapNames.has(n) && !remoteInstalledNames.has(n));
    const phantom = [...bootstrapNames].filter((n) => !mountSourceNames.has(n));
    let allMounted =
      officeClawSkillItems.length > 0 &&
      officeClawSkillItems.every((item) => item.mounts && Object.values(item.mounts).every(Boolean));
    // If we have expected office-claw skills (source dir non-empty) but discovered none,
    // treat as unhealthy (likely broken mounts).
    if (!allMounted && officeClawSkillItems.length === 0 && mountSourceNames.size > 0) allMounted = false;
    const skillHealth: SkillHealthSummary = {
      allMounted,
      registrationConsistent: unregistered.length === 0 && phantom.length === 0,
      unregistered,
      phantom,
    };

    // 7. F070: Governance health for external projects
    const officeClawRoot = getProjectRoot();
    let governanceHealth: CapabilityBoardResponse['governanceHealth'];
    if (projectRoot !== officeClawRoot) {
      const { GovernanceRegistry } = await import('../config/governance/governance-registry.js');
      const registry = new GovernanceRegistry(officeClawRoot);
      governanceHealth = await registry.checkHealth(projectRoot);
    }

    // Sort skills by installedAt descending (newest first), items without installedAt keep original order
    items.sort((a, b) => {
      if (a.type !== 'skill' || b.type !== 'skill') return 0;
      const aTime = a.installedAt ? new Date(a.installedAt).getTime() : Infinity;
      const bTime = b.installedAt ? new Date(b.installedAt).getTime() : Infinity;
      return bTime - aTime;
    });

    // 8. Build response with agent family + project metadata
    const response: CapabilityBoardResponse = {
      items,
      agentFamilies: buildAgentFamilies(),
      projectPath: projectRoot,
      skillHealth,
    };
    if (governanceHealth) {
      response.governanceHealth = governanceHealth;
    }

    return response;
  });

  // ── PATCH /api/capabilities ──
  app.patch('/api/capabilities', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    const body = request.body as CapabilityPatchRequest | undefined;
    if (!body || !body.capabilityId || !body.capabilityType || !body.scope || typeof body.enabled !== 'boolean') {
      reply.status(400);
      return { error: 'Required: capabilityId, capabilityType (mcp|skill), scope (global|agent), enabled (boolean)' };
    }

    if (body.scope === 'agent' && !body.agentId) {
      reply.status(400);
      return { error: 'agentId required when scope is "agent"' };
    }

    // Multi-project: accept projectPath in body
    let projectRoot = getProjectRoot();
    if (body.projectPath) {
      const validated = await validateProjectPath(body.projectPath);
      if (!validated) {
        reply.status(400);
        return { error: 'Invalid project path: must be an existing directory under allowed roots' };
      }
      projectRoot = validated;
    }

    const config = await readCapabilitiesConfig(projectRoot);
    if (!config) {
      reply.status(404);
      return { error: 'capabilities.json not found. Run GET first to bootstrap.' };
    }

    // Compound lookup: id + type disambiguates same-name MCP/skill entries
    const capIndex = config.capabilities.findIndex((c) => c.id === body.capabilityId && c.type === body.capabilityType);
    if (capIndex === -1) {
      reply.status(404);
      return { error: `Capability "${body.capabilityId}" (type=${body.capabilityType}) not found` };
    }

    const cap = config.capabilities[capIndex]!;

    if (body.scope === 'global') {
      cap.enabled = body.enabled;
    } else {
      // Per-agent override
      if (!cap.overrides) cap.overrides = [];
      const existing = cap.overrides.find((o) => o.agentId === body.agentId!);
      if (existing) {
        existing.enabled = body.enabled;
      } else {
        cap.overrides.push({ agentId: body.agentId!, enabled: body.enabled });
      }
      // Clean up: remove override if it matches global (no-op override)
      if (body.enabled === cap.enabled) {
        cap.overrides = cap.overrides.filter((o) => o.agentId !== body.agentId!);
        if (cap.overrides.length === 0) delete cap.overrides;
      }
    }

    // Persist and regenerate CLI configs
    await writeCapabilitiesConfig(projectRoot, config);
    await generateCliConfigs(config, getCliConfigPaths(projectRoot));

    return { ok: true, capability: cap };
  });

  // ── POST /api/governance/confirm — F070: First-time confirmation ──
  app.post('/api/governance/confirm', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const body = request.body as { projectPath?: string } | undefined;
    if (!body?.projectPath) {
      reply.status(400);
      return { error: 'Required: projectPath' };
    }

    const validated = await validateProjectPath(body.projectPath);
    if (!validated) {
      reply.status(400);
      return { error: 'Invalid project path' };
    }

    const officeClawRoot = getProjectRoot();
    if (validated === officeClawRoot) {
      reply.status(400);
      return { error: 'Cannot confirm governance for OfficeClaw itself' };
    }

    const { GovernanceBootstrapService } = await import('../config/governance/governance-bootstrap.js');
    const service = new GovernanceBootstrapService(officeClawRoot);
    const report = await service.bootstrap(validated, { dryRun: false });

    return { ok: true, report };
  });


  // ── GET /api/governance/health — F070: All project health ──
  app.get('/api/governance/health', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const officeClawRoot = getProjectRoot();
    const { GovernanceRegistry } = await import('../config/governance/governance-registry.js');
    const registry = new GovernanceRegistry(officeClawRoot);
    const entries = await registry.listAll();

    const healthResults = await Promise.all(entries.map((entry) => registry.checkHealth(entry.projectPath)));

    return { projects: healthResults };
  });

  // ── POST /api/governance/discover — F070: Find unsynced external projects ──
  // Frontend sends known external projectPaths (from thread data),
  // backend cross-references with registry to find never-synced ones.
  app.post('/api/governance/discover', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const body = request.body as { projectPaths?: string[] } | undefined;
    if (!body?.projectPaths || !Array.isArray(body.projectPaths)) {
      reply.status(400);
      return { error: 'Required: projectPaths (string[])' };
    }

    const officeClawRoot = getProjectRoot();
    const { GovernanceRegistry } = await import('../config/governance/governance-registry.js');
    const registry = new GovernanceRegistry(officeClawRoot);

    const unsynced: string[] = [];
    for (const pp of body.projectPaths) {
      if (typeof pp !== 'string' || pp === 'default' || pp === officeClawRoot) continue;
      const entry = await registry.get(pp);
      if (!entry) {
        unsynced.push(pp);
      }
    }

    return { unsynced };
  });
};
