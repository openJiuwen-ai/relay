/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, win32 } from 'node:path';

export type PptTemplateSource = 'builtin' | 'user';
export type PptTemplateStatus = 'ready' | 'generating' | 'failed';

export interface PptTemplateRecord {
  templateId: string;
  name: string;
  source: PptTemplateSource;
  status: PptTemplateStatus;
  description?: string;
  previewImageUrl?: string | null;
  previewImagePath?: string;
  templateDir?: string;
  originFileName?: string;
  originFilePath?: string;
  generatorSkill?: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

interface SafePathOptions {
  mustExist?: boolean;
}

interface TemplateMetaEntry {
  id: string;
  name: string;
  path?: string;
  templateDir?: string;
  keywords?: string[];
  description?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: PptTemplateStatus;
  lastError?: string;
  originFileName?: string;
  originFilePath?: string;
  generatorSkill?: string;
}

interface TemplateMetaDocument {
  templates: TemplateMetaEntry[];
}

interface PersistedTemplateDescriptor {
  meta: TemplateMetaEntry;
  templateDir: string;
  templateMainFile: string;
  previewImagePath?: string;
  templateDataPath: string;
  directoryMtimeMs: number;
}

interface TemplateDirectoryMeta {
  // Persist the template identity inside the directory so root index rebuilds keep the same id.
  id?: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  generatorSkill?: string;
}

interface FinalizeGeneratedTemplateOptions {
  expectedName: string;
  beforeTemplateDirs?: readonly string[];
  placeholderTemplateId?: string;
}

const BUILTIN_TEMPLATES: ReadonlyArray<Omit<PptTemplateRecord, 'createdAt' | 'updatedAt'>> = [
  {
    templateId: 'builtin:light-tech',
    name: '浅色科技风',
    source: 'builtin',
    status: 'ready',
    previewImageUrl: null,
    description: '适合科技、产品、方案汇报',
  },
  {
    templateId: 'builtin:dark-tech',
    name: '深色科技风',
    source: 'builtin',
    status: 'ready',
    previewImageUrl: null,
    description: '适合深色科技感展示',
  },
  {
    templateId: 'builtin:paper-humanities',
    name: '纸质人文风',
    source: 'builtin',
    status: 'ready',
    previewImageUrl: null,
    description: '适合人文、教育、内容表达',
  },
  {
    templateId: 'builtin:huawei',
    name: '华为风格',
    source: 'builtin',
    status: 'ready',
    previewImageUrl: null,
    description: '适合企业汇报与方案展示',
  },
];

const PPT_TEMPLATE_NAME_PATTERN = /^[A-Za-z0-9\u4e00-\u9fa5_-]+(?:[ ]+[A-Za-z0-9\u4e00-\u9fa5_-]+)*$/;
export const MAX_PPT_TEMPLATE_NAME_LENGTH = 30;
export const MAX_PPT_UPLOAD_FILE_BASE_NAME_LENGTH = 30;

function nowIso(): string {
  return new Date().toISOString();
}

function isPathWithinRoot(absPath: string, root: string): boolean {
  const rel = relative(root, absPath);
  if (rel === '') return true;
  if (process.platform === 'win32' && win32.isAbsolute(rel)) return false;
  return !rel.startsWith('..') && !rel.startsWith('/') && !rel.startsWith('\\');
}

function normalizeTemplateName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function getUploadFileBaseName(filename: string): string {
  return basename(filename, extname(filename)).trim();
}

function getTemplateNameLengthValidationMessage(): string {
  return `模板名称长度不能超过 ${MAX_PPT_TEMPLATE_NAME_LENGTH} 个字符`;
}

function getUploadFileNameLengthValidationMessage(): string {
  return `上传文件名长度不能超过 ${MAX_PPT_UPLOAD_FILE_BASE_NAME_LENGTH} 个字符（不含扩展名）`;
}

export function isValidPptTemplateNameLength(name: string): boolean {
  return normalizeTemplateName(name).length <= MAX_PPT_TEMPLATE_NAME_LENGTH;
}

export function isValidPptTemplateName(name: string): boolean {
  const normalized = normalizeTemplateName(name);
  return normalized.length > 0 && isValidPptTemplateNameLength(normalized) && PPT_TEMPLATE_NAME_PATTERN.test(normalized);
}

export function assertValidPptTemplateNameLength(name: string): void {
  if (isValidPptTemplateNameLength(name)) return;
  const err = new Error(getTemplateNameLengthValidationMessage());
  err.name = 'InvalidTemplateNameError';
  throw err;
}

export function assertValidPptUploadFileNameLength(filename: string): void {
  if (getUploadFileBaseName(filename).length <= MAX_PPT_UPLOAD_FILE_BASE_NAME_LENGTH) return;
  const err = new Error(getUploadFileNameLengthValidationMessage());
  err.name = 'InvalidPptTemplateUploadFileNameError';
  throw err;
}

export function assertValidPptTemplateName(name: string): void {
  assertValidPptTemplateNameLength(name);
  if (isValidPptTemplateName(name)) return;
  const err = new Error(`模板名称仅支持汉字、字母、数字、中划线、下划线和空格，且长度不超过 ${MAX_PPT_TEMPLATE_NAME_LENGTH} 个字符`);
  err.name = 'InvalidTemplateNameError';
  throw err;
}

function slugifyIdentifier(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\-\u4e00-\u9fa5]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || `template-${Date.now()}`;
}

function withBuiltinTimestamps(record: Omit<PptTemplateRecord, 'createdAt' | 'updatedAt'>): PptTemplateRecord {
  const now = nowIso();
  return { ...record, createdAt: now, updatedAt: now };
}

function toUserTemplateId(styleId: string): string {
  return `user:${styleId}`;
}

function fromUserTemplateId(templateId: string): string {
  return templateId.startsWith('user:') ? templateId.slice('user:'.length) : templateId;
}

export class PptTemplateStore {
  readonly rootDir: string;
  readonly templateMetaPath: string;
  readonly uploadsDir: string;
  readonly hostRoot: string;
  readonly defaultPreviewPath: string;
  readonly builtinPreviewDir: string;
  private readonly transientTemplates = new Map<string, PptTemplateRecord>();

  constructor(rootDir: string, hostRoot: string) {
    this.rootDir = resolve(rootDir);
    this.templateMetaPath = join(this.rootDir, 'template-meta.json');
    this.hostRoot = resolve(hostRoot);
    this.uploadsDir = join(this.rootDir, '_uploads');
    this.defaultPreviewPath = join(this.hostRoot, 'packages', 'web', 'public', 'images', 'default-ppt-template.png');
    this.builtinPreviewDir = join(this.hostRoot, 'packages', 'web', 'public', 'images', 'ppt-template');
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await mkdir(this.uploadsDir, { recursive: true });
    const existing = await this.readTemplateMetaDocument();
    if (!existing) {
      const bootstrapped = await this.scanTemplateDirectoriesForIndex();
      await this.writeTemplateMetaDocument({ templates: bootstrapped.map((descriptor) => descriptor.meta) });
    }
    await this.recoverUnfinishedTemplates();
  }

  async list(source: 'builtin' | 'user' | 'all' = 'all', includeGenerating = true): Promise<PptTemplateRecord[]> {
    const builtinTemplates = BUILTIN_TEMPLATES.map(withBuiltinTimestamps);
    const registeredUserTemplates = await this.loadIndexedUserTemplates();
    const transientUserTemplates = Array.from(this.transientTemplates.values());
    let combined = [...builtinTemplates, ...registeredUserTemplates, ...transientUserTemplates];
    if (source !== 'all') {
      combined = combined.filter((template) => template.source === source);
    }
    if (!includeGenerating) {
      combined = combined.filter((template) => template.status !== 'generating');
    }
    const deduped = new Map<string, PptTemplateRecord>();
    for (const template of combined) {
      deduped.set(template.templateId, template);
    }
    const sorted = Array.from(deduped.values()).sort((a, b) => {
      if (a.source !== b.source) return a.source === 'builtin' ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return Promise.all(sorted.map(async (template) => this.attachPreviewImage(await this.sanitizeTemplateRecord(template))));
  }

  async get(templateId: string): Promise<PptTemplateRecord | null> {
    const transient = this.transientTemplates.get(templateId);
    if (transient) {
      return this.attachPreviewImage(await this.sanitizeTemplateRecord(transient));
    }
    const templates = await this.loadIndexedUserTemplates();
    const template = templates.find((entry) => entry.templateId === templateId) ?? BUILTIN_TEMPLATES.map(withBuiltinTimestamps).find((entry) => entry.templateId === templateId) ?? null;
    return template ? this.attachPreviewImage(await this.sanitizeTemplateRecord(template)) : null;
  }

  async createUserTemplate(input: {
    name: string;
    originFileName?: string;
    originFilePath?: string;
    status?: PptTemplateStatus;
    templateDir?: string;
    lastError?: string;
  }): Promise<PptTemplateRecord> {
    const persistedTemplates = await this.loadIndexedUserTemplates();
    const transientTemplates = Array.from(this.transientTemplates.values());
    const name = normalizeTemplateName(input.name);
    assertValidPptTemplateNameLength(name);
    this.assertNameAvailable(name, persistedTemplates, transientTemplates);

    const templateId = toUserTemplateId(randomUUID());
    const now = nowIso();
    const safeTemplateDir = input.templateDir ? await this.assertSafePath(input.templateDir, this.rootDir) : undefined;
    const safeOriginFilePath = input.originFilePath ? await this.assertSafePath(input.originFilePath, this.uploadsDir) : undefined;
    const record: PptTemplateRecord = {
      templateId,
      name,
      source: 'user',
      status: input.status ?? 'generating',
      previewImageUrl: null,
      ...(safeTemplateDir ? { templateDir: safeTemplateDir } : {}),
      ...(input.originFileName ? { originFileName: input.originFileName } : {}),
      ...(safeOriginFilePath ? { originFilePath: safeOriginFilePath } : {}),
      generatorSkill: 'ppt-template-generate',
      createdAt: now,
      updatedAt: now,
      ...(input.lastError ? { lastError: input.lastError } : {}),
    };
    this.transientTemplates.set(templateId, record);
    await this.upsertTemplateMetaForRecord(record, fromUserTemplateId(templateId));
    return record;
  }

  async updateUserTemplate(templateId: string, patch: Partial<PptTemplateRecord>): Promise<PptTemplateRecord | null> {
    this.assertUserTemplateMutationAllowed(templateId);
    const current = (await this.get(templateId)) ?? this.transientTemplates.get(templateId) ?? null;
    if (!current) return null;
    const persistedTemplates = await this.loadIndexedUserTemplates();
    const transientTemplates = Array.from(this.transientTemplates.values());
    const nextName = patch.name ? normalizeTemplateName(patch.name) : current.name;
    if (nextName !== current.name) {
      assertValidPptTemplateName(nextName);
      this.assertNameAvailable(nextName, persistedTemplates, transientTemplates, templateId);
    }
    const safePatch = await this.sanitizeTemplatePatch(patch);
    const nextTemplateDir = nextName !== current.name ? await this.renameTemplateAssets(current, nextName) : current.templateDir;
    const updated: PptTemplateRecord = {
      ...current,
      ...safePatch,
      ...(patch.name ? { name: nextName } : {}),
      templateId: current.templateId,
      source: 'user',
      updatedAt: nowIso(),
      ...(nextTemplateDir ? { templateDir: nextTemplateDir } : {}),
      ...(nextTemplateDir && current.previewImagePath
        ? { previewImagePath: this.rebasePathToDirectory(current.previewImagePath, nextTemplateDir) }
        : {}),
    };
    if (this.transientTemplates.has(templateId)) {
      this.transientTemplates.set(templateId, updated);
      return updated;
    }
    await this.writeTemplateDirectoryMeta(updated);
    await this.upsertTemplateMetaForRecord(updated, fromUserTemplateId(templateId));
    return updated;
  }

  async deleteUserTemplate(templateId: string): Promise<PptTemplateRecord | null> {
    this.assertUserTemplateMutationAllowed(templateId);
    const current = (await this.get(templateId)) ?? this.transientTemplates.get(templateId) ?? null;
    if (!current) return null;
    this.transientTemplates.delete(templateId);
    await this.removeTemplateMetaEntry(templateId);
    const safeTemplateDir = await this.resolveSafeTemplateDir(current, { mustExist: true });
    if (safeTemplateDir) {
      await rm(safeTemplateDir, { recursive: true, force: true });
    }
    const safeOriginFilePath = await this.resolveSafeOriginFilePath(current, { mustExist: true });
    if (safeOriginFilePath) {
      await rm(safeOriginFilePath, { force: true });
    }
    return current;
  }

  async resolveTemplatePromptPaths(templateId: string): Promise<{ templateDir: string; templateMainFile: string } | null> {
    const template = await this.get(templateId);
    if (!template || template.source !== 'user' || template.status !== 'ready') return null;
    const templateDir = await this.resolveSafeTemplateDir(template, { mustExist: true });
    if (!templateDir) return null;
    const discoveredMainFile = await this.resolveDiscoveredTemplateMainFile(templateDir);
    const templateMainFile = discoveredMainFile
      ? await this.resolveSafePath(discoveredMainFile, this.rootDir, { mustExist: true })
      : undefined;
    if (!templateMainFile) return null;
    return { templateDir, templateMainFile };
  }

  async finalizeGeneratedTemplate(templateId: string, options: FinalizeGeneratedTemplateOptions): Promise<PptTemplateRecord | null> {
    const transient = this.transientTemplates.get(templateId);
    if (!transient) {
      return this.get(templateId);
    }
    const resolved = await this.resolveFinalizedTemplate({ ...options, placeholderTemplateId: templateId });
    if (!resolved) return null;
    const updated: PptTemplateRecord = {
      ...resolved,
      templateId: transient.templateId,
      createdAt: transient.createdAt,
      originFileName: transient.originFileName,
      originFilePath: transient.originFilePath,
      generatorSkill: 'ppt-template-generate',
      updatedAt: nowIso(),
      lastError: undefined,
    };
    await this.writeTemplateDirectoryMeta(updated);
    await this.removeTemplateMetaEntry(templateId);
    await this.upsertTemplateMetaForRecord(updated, fromUserTemplateId(updated.templateId));
    this.transientTemplates.delete(templateId);
    return this.attachPreviewImage(await this.sanitizeTemplateRecord(updated));
  }

  async markGenerationFailed(templateId: string, lastError: string): Promise<PptTemplateRecord | null> {
    const transient = this.transientTemplates.get(templateId) ?? (await this.get(templateId));
    if (!transient || transient.source !== 'user') return null;
    const failed: PptTemplateRecord = {
      ...transient,
      status: 'failed',
      updatedAt: nowIso(),
      lastError,
    };
    this.transientTemplates.set(templateId, failed);
    await this.upsertTemplateMetaForRecord(failed, fromUserTemplateId(templateId));
    return failed;
  }

  async saveUploadedSource(filename: string, buffer: Buffer): Promise<string> {
    await mkdir(this.uploadsDir, { recursive: true });
    assertValidPptUploadFileNameLength(filename);
    const safeExt = extname(filename).toLowerCase() || '.pptx';
    const candidate = join(this.uploadsDir, `upload-${Date.now()}-${randomUUID()}${safeExt}`);
    const absPath = resolve(candidate);
    await writeFile(absPath, buffer);
    return absPath;
  }

  async createTemplateDir(name: string): Promise<string> {
    const dir = join(this.rootDir, normalizeTemplateName(name));
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async templateOutputExists(filePath: string): Promise<boolean> {
    try {
      const info = await stat(filePath);
      return info.isFile() && info.size > 0;
    } catch {
      return false;
    }
  }

  async getPersistedTemplateDirs(): Promise<string[]> {
    return this.listPersistedTemplateDirectories();
  }

  async getGenerationOutputSnapshot(beforeTemplateDirs: readonly string[] = []): Promise<{
    templateDirCount: number;
    addedTemplateDirCount: number;
    readyTemplateDirCount: number;
    addedFileCount: number;
    addedTotalBytes: number;
    addedLatestMtimeMs: number;
    addedTemplateDirs: string[];
  }> {
    const previousDirs = new Set(beforeTemplateDirs.map((dir) => resolve(dir)));
    const templateDirs = await this.listPersistedTemplateDirectories();
    const addedTemplateDirs = templateDirs.filter((dir) => !previousDirs.has(resolve(dir)));
    const readyTemplateDirChecks = await Promise.all(addedTemplateDirs.map((dir) => this.validateTemplateArtifacts(dir)));
    const directorySnapshots = await Promise.all(addedTemplateDirs.map((dir) => this.collectDirectorySnapshot(dir)));
    return {
      templateDirCount: templateDirs.length,
      addedTemplateDirCount: addedTemplateDirs.length,
      readyTemplateDirCount: readyTemplateDirChecks.filter(Boolean).length,
      addedFileCount: directorySnapshots.reduce((sum, snapshot) => sum + snapshot.fileCount, 0),
      addedTotalBytes: directorySnapshots.reduce((sum, snapshot) => sum + snapshot.totalBytes, 0),
      addedLatestMtimeMs: directorySnapshots.reduce(
        (latest, snapshot) => Math.max(latest, snapshot.latestMtimeMs),
        0,
      ),
      addedTemplateDirs: addedTemplateDirs.map((dir) => relative(this.rootDir, dir).split('\\').join('/')),
    };
  }

  private async collectDirectorySnapshot(dir: string): Promise<{
    fileCount: number;
    totalBytes: number;
    latestMtimeMs: number;
  }> {
    let fileCount = 0;
    let totalBytes = 0;
    let latestMtimeMs = 0;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const child = await this.collectDirectorySnapshot(entryPath);
        fileCount += child.fileCount;
        totalBytes += child.totalBytes;
        latestMtimeMs = Math.max(latestMtimeMs, child.latestMtimeMs);
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await stat(entryPath);
      fileCount += 1;
      totalBytes += info.size;
      latestMtimeMs = Math.max(latestMtimeMs, info.mtimeMs);
    }
    return { fileCount, totalBytes, latestMtimeMs };
  }

  private async loadIndexedUserTemplates(): Promise<PptTemplateRecord[]> {
    const doc = (await this.readTemplateMetaDocument()) ?? { templates: [] };
    const templates = await Promise.all(doc.templates.map((entry) => this.mapTemplateMetaEntry(entry)));
    return templates.filter((entry): entry is PptTemplateRecord => Boolean(entry));
  }

  private async mapTemplateMetaEntry(entry: TemplateMetaEntry): Promise<PptTemplateRecord | null> {
    if (typeof entry.id !== 'string' || !entry.id.trim()) return null;
    if (typeof entry.name !== 'string' || !entry.name.trim()) return null;
    const status = entry.status ?? 'ready';
    const templateMainFile = await this.resolveRegisteredTemplateMainFile(entry.path);
    const resolvedTemplateDir = typeof entry.templateDir === 'string' ? await this.resolveSafePath(entry.templateDir, this.rootDir) : undefined;
    const templateDir = templateMainFile ? dirname(templateMainFile) : resolvedTemplateDir;
    if (status === 'ready' && !templateMainFile) return null;
    const previewImagePath = templateDir ? await this.resolveDiscoveredPreviewPath(templateDir) : undefined;
    const createdAt = this.normalizeOptionalIsoTimestamp(entry.createdAt) ?? nowIso();
    const updatedAt = this.normalizeOptionalIsoTimestamp(entry.updatedAt) ?? createdAt;
    return {
      templateId: toUserTemplateId(entry.id),
      name: normalizeTemplateName(entry.name),
      source: 'user',
      status,
      description: entry.description,
      previewImagePath,
      templateDir,
      originFileName: entry.originFileName ?? entry.source,
      ...(entry.originFilePath ? { originFilePath: entry.originFilePath } : {}),
      generatorSkill: entry.generatorSkill ?? 'ppt-template-generate',
      createdAt,
      updatedAt,
      ...(entry.lastError ? { lastError: entry.lastError } : {}),
    };
  }

  private async resolveRegisteredTemplateMainFile(indexPath: string | undefined): Promise<string | undefined> {
    if (typeof indexPath !== 'string') return undefined;
    const resolved = this.resolvePathFromRoot(indexPath, this.rootDir);
    if (!resolved) return undefined;
    return this.resolveSafePath(resolved, this.rootDir, { mustExist: true });
  }

  private async resolveFinalizedTemplate(options: FinalizeGeneratedTemplateOptions): Promise<PptTemplateRecord | null> {
    const indexedTemplates = await this.loadIndexedUserTemplates();
    const normalizedName = normalizeTemplateName(options.expectedName);
    const exact = indexedTemplates.find(
      (entry) =>
        entry.status === 'ready' &&
        Boolean(entry.templateDir) &&
        normalizeTemplateName(entry.name) === normalizedName,
    );
    if (exact) return exact;

    const existingDoc = (await this.readTemplateMetaDocument()) ?? { templates: [] };
    const placeholderEntryId = options.placeholderTemplateId
      ? fromUserTemplateId(options.placeholderTemplateId)
      : undefined;
    const seedEntries = placeholderEntryId
      ? existingDoc.templates.filter((entry) => entry.id !== placeholderEntryId)
      : existingDoc.templates;
    const previousDirs = new Set((options.beforeTemplateDirs ?? []).map((dir) => resolve(dir)));
    const descriptors = await this.scanTemplateDirectoriesForIndex(seedEntries);
    const addedTemplates = descriptors.filter((entry) => !previousDirs.has(resolve(entry.templateDir)));
    if (addedTemplates.length === 0) return null;
    const latest = [...addedTemplates].sort((a, b) => a.directoryMtimeMs - b.directoryMtimeMs)[addedTemplates.length - 1];
    return latest ? this.mapTemplateMetaEntry(latest.meta) : null;
  }

  private assertNameAvailable(
    name: string,
    persistedTemplates: readonly PptTemplateRecord[],
    transientTemplates: readonly PptTemplateRecord[],
    excludeTemplateId?: string,
  ): void {
    const builtinConflict = BUILTIN_TEMPLATES.some((template) => template.name === name && template.templateId !== excludeTemplateId);
    const userConflict = [...persistedTemplates, ...transientTemplates].some(
      (template) => template.name === name && template.templateId !== excludeTemplateId,
    );
    if (builtinConflict || userConflict) {
      const err = new Error(`Template name conflict: ${name}`);
      err.name = 'TemplateNameConflictError';
      throw err;
    }
  }

  private async renameTemplateAssets(current: PptTemplateRecord, nextName: string): Promise<string | undefined> {
    const resolvedCurrentDir = await this.resolveSafeTemplateDir(current, { mustExist: true });
    if (!resolvedCurrentDir) return current.templateDir;
    const resolvedNextDir = resolve(this.rootDir, nextName);

    if (resolvedCurrentDir !== resolvedNextDir) {
      await rename(resolvedCurrentDir, resolvedNextDir);
    }

    const discoveredMainFile = await this.resolveDiscoveredTemplateMainFile(resolvedNextDir);
    const oldMainFile = discoveredMainFile ?? join(resolvedNextDir, `${current.name}.md`);
    const nextMainFile = join(resolvedNextDir, `${nextName}.md`);
    if (oldMainFile !== nextMainFile) {
      try {
        const info = await stat(oldMainFile);
        if (info.isFile()) {
          await rename(oldMainFile, nextMainFile);
        }
      } catch {
        // Best-effort rename: keep directory move even if main md is absent.
      }
    }

    return resolvedNextDir;
  }

  private async readTemplateMetaDocument(): Promise<TemplateMetaDocument | null> {
    try {
      const raw = await readFile(this.templateMetaPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<TemplateMetaDocument>;
      return {
        templates: Array.isArray(parsed.templates)
          ? parsed.templates.filter((entry): entry is TemplateMetaEntry => typeof entry === 'object' && entry !== null)
          : [],
      };
    } catch {
      return null;
    }
  }

  private async writeTemplateMetaDocument(doc: TemplateMetaDocument): Promise<void> {
    await writeFile(this.templateMetaPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf-8');
  }

  private async removeTemplateMetaEntry(templateId: string): Promise<void> {
    const doc = (await this.readTemplateMetaDocument()) ?? { templates: [] };
    const entryId = fromUserTemplateId(templateId);
    const nextTemplates = doc.templates.filter((entry) => entry.id !== entryId);
    if (nextTemplates.length === doc.templates.length) return;
    await this.writeTemplateMetaDocument({ templates: nextTemplates });
  }

  private async upsertTemplateMetaForRecord(template: PptTemplateRecord, templateId: string): Promise<void> {
    const doc = (await this.readTemplateMetaDocument()) ?? { templates: [] };
    const existingIndex = doc.templates.findIndex((entry) => entry.id === templateId);
    const existingEntry = existingIndex >= 0 ? doc.templates[existingIndex] : undefined;
    const templateDir = template.templateDir ? await this.assertSafePath(template.templateDir, this.rootDir) : undefined;
    const discoveredMainFile = templateDir ? await this.resolveDiscoveredTemplateMainFile(templateDir) : undefined;
    const relativePath = template.status === 'ready' && discoveredMainFile
      ? (await this.relativePathFromRoot(discoveredMainFile)) ?? relative(this.rootDir, discoveredMainFile).split('\\').join('/')
      : template.status === 'ready'
      ? existingEntry?.path
      : undefined;

    const nextEntry: TemplateMetaEntry = {
      id: templateId,
      name: template.name,
      ...(relativePath ? { path: relativePath } : {}),
      ...(templateDir
        ? {
            templateDir:
              (await this.relativePathFromRoot(templateDir)) ?? relative(this.rootDir, templateDir).split('\\').join('/'),
          }
        : existingEntry?.templateDir
        ? { templateDir: existingEntry.templateDir }
        : {}),
      ...(template.description ? { description: template.description } : existingEntry?.description ? { description: existingEntry.description } : {}),
      ...(template.originFileName ? { source: template.originFileName, originFileName: template.originFileName } : existingEntry?.source ? { source: existingEntry.source } : existingEntry?.originFileName ? { originFileName: existingEntry.originFileName } : {}),
      ...(template.originFilePath
        ? {
            originFilePath:
              (await this.relativePathFromRoot(template.originFilePath)) ??
              relative(this.rootDir, template.originFilePath).split('\\').join('/'),
          }
        : existingEntry?.originFilePath
        ? { originFilePath: existingEntry.originFilePath }
        : {}),
      ...(template.generatorSkill ? { generatorSkill: template.generatorSkill } : existingEntry?.generatorSkill ? { generatorSkill: existingEntry.generatorSkill } : {}),
      ...(existingEntry?.keywords && existingEntry.keywords.length > 0 ? { keywords: existingEntry.keywords } : {}),
      createdAt: this.normalizeOptionalIsoTimestamp(existingEntry?.createdAt) ?? template.createdAt,
      updatedAt: template.updatedAt,
      status: template.status,
      ...(template.lastError ? { lastError: template.lastError } : {}),
    };

    if (existingIndex >= 0) {
      doc.templates[existingIndex] = nextEntry;
    } else {
      doc.templates.push(nextEntry);
    }
    await this.writeTemplateMetaDocument(doc);
  }

  private async registerTemplateDirectory(
    templateDir: string,
    descriptor?: PersistedTemplateDescriptor,
  ): Promise<PptTemplateRecord | null> {
    const doc = (await this.readTemplateMetaDocument()) ?? { templates: [] };
    const reservedIds = new Set(doc.templates.map((entry) => entry.id));
    const nextDescriptor = descriptor ?? (await this.buildTemplateDescriptorFromDirectory(templateDir, reservedIds));
    if (!nextDescriptor) return null;

    const existingIndex = doc.templates.findIndex(
      (entry) => entry.id === nextDescriptor.meta.id || entry.path === nextDescriptor.meta.path,
    );
    if (existingIndex >= 0) {
      doc.templates[existingIndex] = nextDescriptor.meta;
    } else {
      doc.templates.push(nextDescriptor.meta);
    }
    await this.writeTemplateMetaDocument(doc);
    return this.mapTemplateMetaEntry(nextDescriptor.meta);
  }

  private async scanTemplateDirectoriesForIndex(seedEntries: readonly TemplateMetaEntry[] = []): Promise<PersistedTemplateDescriptor[]> {
    const templateDirs = await this.listPersistedTemplateDirectories();
    const descriptors: PersistedTemplateDescriptor[] = [];
    const reservedIds = new Set(seedEntries.map((entry) => entry.id));
    for (const templateDir of templateDirs) {
      const descriptor = await this.buildTemplateDescriptorFromDirectory(templateDir, reservedIds);
      if (!descriptor) continue;
      reservedIds.add(descriptor.meta.id);
      descriptors.push(descriptor);
    }
    return descriptors;
  }

  private async buildTemplateDescriptorFromDirectory(
    templateDir: string,
    reservedIds: Set<string>,
  ): Promise<PersistedTemplateDescriptor | null> {
    const safeTemplateDir = await this.resolveSafePath(templateDir, this.rootDir, { mustExist: true });
    if (!safeTemplateDir) return null;
    const artifacts = await this.validateTemplateArtifacts(safeTemplateDir);
    if (!artifacts) return null;
    const { templateMainFile, previewImagePath, templateDataPath } = artifacts;
    const templateName = normalizeTemplateName(basename(templateMainFile, extname(templateMainFile)) || basename(safeTemplateDir));
    if (!templateName) return null;
    const dirStat = await stat(safeTemplateDir);
    const templateDirectoryMeta = await this.readTemplateDirectoryMeta(safeTemplateDir);
    const metaId = this.allocateUniqueDiscoveredId(templateDirectoryMeta?.id, templateName, reservedIds);
    const pathFromRoot =
      (await this.relativePathFromRoot(templateMainFile)) ?? relative(this.rootDir, templateMainFile).split('\\').join('/');
    const meta: TemplateMetaEntry = {
      id: metaId,
      name: templateName,
      path: pathFromRoot,
      templateDir: (await this.relativePathFromRoot(safeTemplateDir)) ?? relative(this.rootDir, safeTemplateDir).split('\\').join('/'),
      createdAt: this.normalizeDateToIso(dirStat.birthtimeMs > 0 ? dirStat.birthtime : dirStat.mtime),
      updatedAt: this.normalizeDateToIso(dirStat.mtime),
      status: 'ready',
      generatorSkill: 'ppt-template-generate',
    };
    return {
      meta,
      templateDir: safeTemplateDir,
      templateMainFile,
      previewImagePath,
      templateDataPath,
      directoryMtimeMs: dirStat.mtimeMs,
    };
  }

  private getTemplateDirectoryMetaPath(templateDir: string): string {
    return join(templateDir, 'template-meta.json');
  }

  private async readTemplateDirectoryMeta(templateDir: string): Promise<TemplateDirectoryMeta | null> {
    const metaPath = this.getTemplateDirectoryMetaPath(templateDir);
    try {
      const raw = await readFile(metaPath, 'utf-8');
      const parsed = JSON.parse(raw) as TemplateDirectoryMeta;
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }

  private async writeTemplateDirectoryMeta(template: PptTemplateRecord): Promise<void> {
    if (!template.templateDir) return;
    const templateDir = await this.assertSafePath(template.templateDir, this.rootDir);
    const metaPath = this.getTemplateDirectoryMetaPath(templateDir);
    const nextMeta: TemplateDirectoryMeta = {
      id: fromUserTemplateId(template.templateId),
      name: template.name,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      generatorSkill: template.generatorSkill,
    };
    await writeFile(metaPath, `${JSON.stringify(nextMeta, null, 2)}\n`, 'utf-8');
  }

  private async validateTemplateArtifacts(
    templateDir: string,
  ): Promise<{ templateMainFile: string; previewImagePath: string; templateDataPath: string } | null> {
    const templateMainFile = await this.resolveDiscoveredTemplateMainFile(templateDir);
    if (!templateMainFile) return null;
    const previewImagePath = await this.resolveDiscoveredPreviewPath(templateDir);
    if (!previewImagePath) return null;
    const templateDataPath = join(templateDir, 'temp', 'template_data.json');
    if (!(await this.templateOutputExists(templateDataPath))) return null;
    return {
      templateMainFile,
      previewImagePath,
      templateDataPath,
    };
  }

  private async listPersistedTemplateDirectories(): Promise<string[]> {
    const entries = await readdir(this.rootDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name !== basename(this.uploadsDir))
      .map((entry) => join(this.rootDir, entry.name));
  }

  private allocateUniqueDiscoveredId(rawId: string | undefined, name: string, reservedIds: Set<string>): string {
    const preferred = rawId?.trim() ? slugifyIdentifier(rawId) : slugifyIdentifier(name);
    if (!reservedIds.has(preferred)) return preferred;
    let index = 1;
    while (reservedIds.has(`${preferred}-${index}`)) {
      index += 1;
    }
    return `${preferred}-${index}`;
  }

  private async resolveDiscoveredTemplateMainFile(templateDir: string): Promise<string | undefined> {
    const entries = await readdir(templateDir, { withFileTypes: true });
    const mdFiles = entries
      .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.md')
      .map((entry) => entry.name);
    if (mdFiles.length === 0) return undefined;
    const preferredFile = `${basename(templateDir)}.md`;
    const mainFile = mdFiles.includes(preferredFile) ? preferredFile : mdFiles.sort((a, b) => a.localeCompare(b))[0];
    return join(templateDir, mainFile);
  }

  private normalizeOptionalIsoTimestamp(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }

  private normalizeDateToIso(value: Date): string {
    return value.toISOString();
  }

  private async relativePathFromRoot(filePath: string): Promise<string | undefined> {
    try {
      const realRoot = await realpath(this.rootDir);
      const realFilePath = await realpath(filePath);
      if (!isPathWithinRoot(realFilePath, realRoot)) return undefined;
      return relative(realRoot, realFilePath).split('\\').join('/');
    } catch {
      return undefined;
    }
  }

  private async resolveDiscoveredPreviewPath(templateDir: string): Promise<string | undefined> {
    const slidesDir = join(templateDir, 'slides');
    for (const candidate of ['slide-001.png', 'slide-01.png', 'slide-1.png']) {
      const full = join(slidesDir, candidate);
      try {
        const info = await stat(full);
        if (info.isFile()) return full;
      } catch {
        // Try next candidate.
      }
    }
    return undefined;
  }

  private async attachPreviewImage(template: PptTemplateRecord): Promise<PptTemplateRecord> {
    let previewImagePath = template.source === 'builtin' ? this.resolveBuiltinPreviewPath(template.templateId) : template.previewImagePath;
    if (template.source === 'builtin' && previewImagePath) {
      try {
        const info = await stat(previewImagePath);
        if (!info.isFile()) {
          previewImagePath = this.defaultPreviewPath;
        }
      } catch {
        previewImagePath = this.defaultPreviewPath;
      }
    }
    const previewImageUrl = await this.readImageAsDataUrl(previewImagePath);
    return {
      ...template,
      previewImageUrl,
      ...(previewImagePath ? { previewImagePath } : {}),
    };
  }

  private resolveBuiltinPreviewPath(templateId: string): string {
    const builtinId = templateId.startsWith('builtin:') ? templateId.slice('builtin:'.length) : templateId;
    return join(this.builtinPreviewDir, `${builtinId}.png`);
  }

  private async readImageAsDataUrl(filePath: string | undefined): Promise<string | null> {
    if (!filePath) return null;
    try {
      const buffer = await readFile(filePath);
      const ext = extname(filePath).toLowerCase();
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch {
      return null;
    }
  }

  private assertUserTemplateMutationAllowed(templateId: string): void {
    if (!templateId.startsWith('user:')) {
      const err = new Error(`Builtin template mutation not allowed: ${templateId}`);
      err.name = 'BuiltinTemplateMutationNotAllowedError';
      throw err;
    }
  }

  private async sanitizeTemplateRecord(template: PptTemplateRecord): Promise<PptTemplateRecord> {
    if (template.source !== 'user') return template;
    const safeTemplateDir = await this.resolveSafeTemplateDir(template);
    const safeOriginFilePath = await this.resolveSafeOriginFilePath(template);
    return {
      ...template,
      templateDir: safeTemplateDir,
      originFilePath: safeOriginFilePath,
    };
  }

  private async sanitizeTemplatePatch(patch: Partial<PptTemplateRecord>): Promise<Partial<PptTemplateRecord>> {
    const nextPatch: Partial<PptTemplateRecord> = { ...patch };
    if (patch.templateDir) {
      nextPatch.templateDir = await this.assertSafePath(patch.templateDir, this.rootDir);
    }
    if (patch.originFilePath) {
      nextPatch.originFilePath = await this.assertSafePath(patch.originFilePath, this.uploadsDir);
    }
    return nextPatch;
  }

  private async resolveSafeTemplateDir(template: PptTemplateRecord, options: SafePathOptions = {}): Promise<string | undefined> {
    if (!template.templateDir) return undefined;
    return this.resolveSafePath(template.templateDir, this.rootDir, options);
  }

  private async resolveSafeOriginFilePath(template: PptTemplateRecord, options: SafePathOptions = {}): Promise<string | undefined> {
    if (!template.originFilePath) return undefined;
    return this.resolveSafePath(template.originFilePath, this.rootDir, options);
  }

  private async recoverUnfinishedTemplates(): Promise<void> {
    const doc = await this.readTemplateMetaDocument();
    if (!doc || doc.templates.length === 0) return;
    let changed = false;
    const recoveredAt = nowIso();
    for (const entry of doc.templates) {
      if (entry.status !== 'generating') continue;
      entry.status = 'failed';
      entry.lastError = '服务在模板生成过程中退出，任务未完成，请重新上传';
      entry.updatedAt = recoveredAt;
      changed = true;
    }
    if (changed) {
      await this.writeTemplateMetaDocument(doc);
    }
  }

  private async assertSafePath(rawPath: string, allowedRoot: string): Promise<string> {
    const safePath =
      (await this.resolveSafePath(rawPath, allowedRoot, { mustExist: true })) ??
      (await this.resolveSafePath(rawPath, allowedRoot));
    if (!safePath) {
      const err = new Error(`Path escapes controlled root: ${rawPath}`);
      err.name = 'TemplatePathSecurityError';
      throw err;
    }
    return safePath;
  }

  private async resolveSafePath(rawPath: string, allowedRoot: string, options: SafePathOptions = {}): Promise<string | undefined> {
    const trimmed = rawPath.trim();
    if (!trimmed || trimmed.includes('\0')) return undefined;
    try {
      const realRoot = await realpath(allowedRoot);
      const realCandidate = await realpath(trimmed);
      if (isPathWithinRoot(realCandidate, realRoot)) {
        return realCandidate;
      }
      return undefined;
    } catch {
      // Fall through to lexical validation for relative paths or non-existent paths.
    }
    const resolvedPath = this.tryResolvePathWithinRoot(rawPath, allowedRoot);
    if (!resolvedPath) return undefined;
    if (!options.mustExist) return resolvedPath;
    try {
      const realRoot = await realpath(allowedRoot);
      const real = await realpath(resolvedPath);
      return isPathWithinRoot(real, realRoot) ? real : undefined;
    } catch {
      return undefined;
    }
  }

  private resolvePathFromRoot(rawPath: string, allowedRoot: string): string | undefined {
    const trimmed = rawPath.trim();
    if (!trimmed || trimmed.includes('\0')) return undefined;
    const resolvedRoot = resolve(allowedRoot);
    const resolvedPath = resolve(resolvedRoot, trimmed);
    return isPathWithinRoot(resolvedPath, resolvedRoot) ? resolvedPath : undefined;
  }

  private tryResolvePathWithinRoot(rawPath: string, allowedRoot: string): string | undefined {
    const trimmed = rawPath.trim();
    if (!trimmed || trimmed.includes('\0')) return undefined;
    const resolvedRoot = resolve(allowedRoot);
    const resolvedPath = resolve(resolvedRoot, trimmed);
    return isPathWithinRoot(resolvedPath, resolvedRoot) ? resolvedPath : undefined;
  }

  private rebasePathToDirectory(filePath: string, nextDir: string): string {
    return join(nextDir, ...filePath.split(/[\\/]+/).slice(-2));
  }
}
