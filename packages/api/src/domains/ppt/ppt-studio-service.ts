/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { BRIDGE_SCRIPT } from '../preview/bridge-script.js';
import { resolvePptPathUnderRoot, resolvePptProjectRoot } from './ppt-path-security.js';

const execFileAsync = promisify(execFile);
const PAGE_FILE_RE = /^page-(\d+)\.pptx\.html$/i;
const BLOCK_ID_RE = /data-block-id=(["'])(.*?)\1/gi;
const SLIDE_ID_RE = /data-slide-id=(["'])(.*?)\1/i;
const TITLE_TAG_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const TITLE_BLOCK_RE = /<([a-z0-9:-]+)[^>]*data-block-type=(["'])title\2[^>]*>([\s\S]*?)<\/\1>/i;

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(MODULE_DIR, '../../../../..');
const PPTX_CRAFT_ROOT = join(REPO_ROOT, 'office-claw-skills', 'pptx-craft');
const HTML_TO_PPTX_SCRIPT = join(PPTX_CRAFT_ROOT, 'html-to-pptx', 'scripts', 'convert.js');

export interface PptStudioSlideMeta {
  slideId: string;
  pageNumber: number;
  htmlPath: string;
  title: string | null;
  blockCount: number;
  updatedAt: number;
  sha256: string;
  url: string;
}

export interface PptStudioSessionSnapshot {
  pagesDir: string;
  deckTitle: string;
  status: 'generating' | 'editable';
  slides: PptStudioSlideMeta[];
}

export interface PptStudioSlideDocument {
  html: string;
  sha256: string;
  htmlPath: string;
}

export interface PptStudioExportResult {
  pagesDir: string;
  outputPath: string;
  downloadUrl: string;
  size: number;
  stdout: string;
  stderr: string;
}

export interface PptStudioExportArgs {
  inputDir: string;
  outputPath: string;
}

export type PptStudioExportRunner = (args: PptStudioExportArgs) => Promise<{ stdout: string; stderr: string }>;

export interface PptStudioServiceOptions {
  exportRunner?: PptStudioExportRunner;
}

function toWorkspacePath(root: string, target: string): string {
  return relative(root, target).split('\\').join('/');
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function stripTags(input: string): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html: string): string | null {
  const titleTag = html.match(TITLE_TAG_RE)?.[1];
  const titleBlock = html.match(TITLE_BLOCK_RE)?.[3];
  const raw = stripTags(titleBlock ?? titleTag ?? '');
  return raw || null;
}

function extractSlideId(html: string, fallbackPageNumber: number): string {
  return html.match(SLIDE_ID_RE)?.[2] ?? `slide-${fallbackPageNumber}`;
}

function extractBlockCount(html: string): number {
  const blockIds = new Set<string>();
  let match = BLOCK_ID_RE.exec(html);
  while (match) {
    if (match[2]) blockIds.add(match[2]);
    match = BLOCK_ID_RE.exec(html);
  }
  BLOCK_ID_RE.lastIndex = 0;
  return blockIds.size;
}

function injectBridge(html: string): string {
  if (html.includes('data-office-claw-bridge="true"')) return html;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${BRIDGE_SCRIPT}</head>`);
  }
  if (html.includes('<body')) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${BRIDGE_SCRIPT}`);
  }
  return `${BRIDGE_SCRIPT}${html}`;
}

async function resolvePagesDir(
  projectRoot: string,
  pagesDir: string,
): Promise<{ root: string; resolvedPagesDir: string }> {
  const root = await resolvePptProjectRoot(projectRoot);
  const resolvedPagesDir = await resolvePptPathUnderRoot(root, pagesDir, { mustExist: false });
  return { root, resolvedPagesDir };
}

async function listPageFiles(resolvedPagesDir: string): Promise<Array<{ pageNumber: number; absolutePath: string }>> {
  const entries = await readdir(resolvedPagesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = entry.name.match(PAGE_FILE_RE);
      if (!match) return null;
      return {
        pageNumber: Number.parseInt(match[1] ?? '0', 10),
        absolutePath: join(resolvedPagesDir, entry.name),
      };
    })
    .filter((entry): entry is { pageNumber: number; absolutePath: string } => Boolean(entry))
    .sort((left, right) => left.pageNumber - right.pageNumber);
}

function defaultDeckTitle(pagesDir: string, slides: PptStudioSlideMeta[]): string {
  if (slides[0]?.title) return slides[0].title;
  const parts = pagesDir.split('/').filter(Boolean);
  if (parts.length >= 2 && parts[parts.length - 1] === 'pages') {
    return parts[parts.length - 2] ?? 'deck';
  }
  return parts[parts.length - 1] ?? 'deck';
}

function sanitizeDeckFileName(input: string): string {
  const cleaned = input
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 50);
  return cleaned || 'deck';
}

async function runDefaultExport(args: PptStudioExportArgs): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(process.execPath, [HTML_TO_PPTX_SCRIPT, args.inputDir, args.outputPath], {
    cwd: PPTX_CRAFT_ROOT,
    timeout: 10 * 60 * 1000,
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
  };
}

export function createPptStudioService(options: PptStudioServiceOptions = {}) {
  const exportRunner = options.exportRunner ?? runDefaultExport;

  return {
    async discoverSession(projectRoot: string, pagesDir: string): Promise<PptStudioSessionSnapshot> {
      const { root, resolvedPagesDir } = await resolvePagesDir(projectRoot, pagesDir);
      const normalizedPagesDir = toWorkspacePath(root, resolvedPagesDir);
      const resolvedSlides: PptStudioSlideMeta[] = [];

      try {
        const directoryStat = await stat(resolvedPagesDir);
        if (!directoryStat.isDirectory()) {
          throw new Error(`PPT pages directory is not a directory: ${pagesDir}`);
        }

        const pageFiles = await listPageFiles(resolvedPagesDir);
        for (const pageFile of pageFiles) {
          const [html, fileStat] = await Promise.all([
            readFile(pageFile.absolutePath, 'utf-8'),
            stat(pageFile.absolutePath),
          ]);
          const htmlPath = toWorkspacePath(root, pageFile.absolutePath);
          resolvedSlides.push({
            slideId: extractSlideId(html, pageFile.pageNumber),
            pageNumber: pageFile.pageNumber,
            htmlPath,
            title: extractTitle(html),
            blockCount: extractBlockCount(html),
            updatedAt: Math.trunc(fileStat.mtimeMs),
            sha256: sha256(html),
            url: `/api/ppt-studio/slide?projectRoot=${encodeURIComponent(projectRoot)}&path=${encodeURIComponent(htmlPath)}`,
          });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      return {
        pagesDir: normalizedPagesDir,
        deckTitle: defaultDeckTitle(normalizedPagesDir, resolvedSlides),
        status: resolvedSlides.length > 0 ? 'editable' : 'generating',
        slides: resolvedSlides,
      };
    },

    async readSlideHtml(projectRoot: string, htmlPath: string): Promise<PptStudioSlideDocument> {
      const root = await resolvePptProjectRoot(projectRoot);
      const resolvedHtmlPath = await resolvePptPathUnderRoot(root, htmlPath, { mustExist: true });
      const html = await readFile(resolvedHtmlPath, 'utf-8');
      return {
        html: injectBridge(html),
        sha256: sha256(html),
        htmlPath: toWorkspacePath(root, resolvedHtmlPath),
      };
    },

    async exportDeck(
      projectRoot: string,
      pagesDir: string,
      outputPath?: string,
      deckTitle?: string,
    ): Promise<PptStudioExportResult> {
      const { root } = await resolvePagesDir(projectRoot, pagesDir);
      const resolvedPagesDirExisting = await resolvePptPathUnderRoot(root, pagesDir, { mustExist: true });
      const pageFiles = await listPageFiles(resolvedPagesDirExisting);
      if (pageFiles.length === 0) {
        throw new Error('No page-N.pptx.html files found for export');
      }

      const normalizedPagesDir = toWorkspacePath(root, resolvedPagesDirExisting);
      const defaultOutputPath = (() => {
        const baseDir = dirname(normalizedPagesDir);
        const baseName = sanitizeDeckFileName(deckTitle ?? basename(baseDir) ?? 'deck');
        return `${baseDir}/${baseName}.pptx`;
      })();

      const normalizedOutputPath = outputPath?.trim() || defaultOutputPath;
      const resolvedOutputPath = await resolvePptPathUnderRoot(root, normalizedOutputPath, { mustExist: false });
      await mkdir(dirname(resolvedOutputPath), { recursive: true });

      const runResult = await exportRunner({
        inputDir: resolvedPagesDirExisting,
        outputPath: resolvedOutputPath,
      });

      const outputStat = await stat(resolvedOutputPath);
      const finalOutputPath = toWorkspacePath(root, resolvedOutputPath);

      return {
        pagesDir: normalizedPagesDir,
        outputPath: finalOutputPath,
        downloadUrl: `/api/ppt-studio/download?projectRoot=${encodeURIComponent(projectRoot)}&path=${encodeURIComponent(finalOutputPath)}`,
        size: outputStat.size,
        stdout: runResult.stdout,
        stderr: runResult.stderr,
      };
    },
  };
}
