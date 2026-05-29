/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Project Directory Browser Routes
 * GET /api/projects/browse        - 浏览目录结构
 * GET /api/projects/cwd           - 获取服务器工作目录
 * POST /api/projects/pick-directory - 打开系统原生文件选择器
 * POST /api/projects/open-directory - 在系统文件管理器中打开目录
 * POST /api/projects/read-local-text - 读取本地 UTF-8 文本供内嵌预览（.md/.html/.txt 等；非 Office 二进制）
 */

import { execFile, spawn } from 'node:child_process';
import { mkdir, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, isAbsolute, posix, relative, resolve, win32 } from 'node:path';
import { promisify } from 'node:util';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { findMonorepoRoot } from '../utils/monorepo-root.js';
import { getAllowedRoots, isDenylistMode, isUnderAllowedRoot, validateProjectPath } from '../utils/project-path.js';
import { resolveHeaderUserId } from '../utils/request-identity.js';

const execFileAsync = promisify(execFile);

/** Max bytes returned by POST /api/projects/read-local-text (embedded UTF-8 text preview: md, html, txt, …). */
const LOCAL_TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;
/**
 * Paths under these extensions are read as UTF-8 for in-app preview.
 * Binary artifacts (Office, PDF, PPT…) are intentionally excluded until a dedicated preview pipeline exists.
 */
const LOCAL_UTF8_TEXT_PREVIEW_EXTENSIONS = new Set([
  // Document / markup
  '.md',
  '.markdown',
  '.txt',
  '.log',
  '.html',
  '.htm',
  '.xml',
  '.svg',
  '.rst',
  '.tex',
  '.mdx',
  // Data / config
  '.json',
  '.jsonc',
  '.json5',
  '.csv',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.conf',
  '.config',
  '.env',
  '.properties',
  // Web
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.css',
  '.scss',
  '.less',
  '.sass',
  '.vue',
  '.svelte',
  '.astro',
  // Server / scripting
  '.py',
  '.pyw',
  '.rb',
  '.php',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.ps1',
  '.psm1',
  '.lua',
  '.r',
  '.groovy',
  // Systems
  '.rs',
  '.go',
  '.java',
  '.kt',
  '.kts',
  '.c',
  '.cpp',
  '.cc',
  '.cxx',
  '.h',
  '.hpp',
  '.cs',
  '.swift',
  '.scala',
  '.dart',
  // Functional / other
  '.ex',
  '.exs',
  '.clj',
  '.cljs',
  '.zig',
  '.nim',
  '.cr',
  '.ml',
  '.mli',
  '.fs',
  '.fsi',
  '.fsx',
  '.el',
  '.lisp',
  '.erl',
  '.hrl',
  // Build / infra
  '.makefile',
  '.cmake',
  '.gradle',
  '.tf',
  '.tfvars',
  '.hcl',
  '.nix',
  '.dockerfile',
  // API / schema
  '.graphql',
  '.gql',
  '.proto',
  '.prisma',
  '.thrift',
  '.sol',
  // Misc
  '.sql',
  '.vim',
  '.v',
]);
/** Max bytes per extension for POST /api/projects/read-local-binary-preview. */
const LOCAL_EMBEDDED_BINARY_PREVIEW_MAX_BYTES: Readonly<Record<string, number>> = {
  '.docx': 8 * 1024 * 1024,
  '.xlsx': 16 * 1024 * 1024,
  '.xls': 16 * 1024 * 1024,
  '.csv': 16 * 1024 * 1024,
  '.pdf': 32 * 1024 * 1024,
};
const LOCAL_EMBEDDED_BINARY_PREVIEW_EXTENSIONS = new Set(Object.keys(LOCAL_EMBEDDED_BINARY_PREVIEW_MAX_BYTES));
const PICK_DIRECTORY_INITIAL_DIRECTORY_ENV = 'OFFICE_CLAW_PICK_DIRECTORY_INITIAL_DIRECTORY';
const PICK_DIRECTORY_SELECTED_NAME_ENV = 'OFFICE_CLAW_PICK_DIRECTORY_SELECTED_NAME';

const WINDOWS_PICK_DIRECTORY_SCRIPT = `
$source = @"
using System;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
namespace OfficeClaw {
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IShellItem {
    [PreserveSig] int BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    [PreserveSig] int GetParent(out IShellItem ppsi);
    [PreserveSig] int GetDisplayName(uint sigdnName, out IntPtr ppszName);
    [PreserveSig] int GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    [PreserveSig] int Compare(IShellItem psi, uint hint, out int piOrder);
  }
  [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    [PreserveSig] int SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    [PreserveSig] int SetFileTypeIndex(uint iFileType);
    [PreserveSig] int GetFileTypeIndex(out uint piFileType);
    [PreserveSig] int Advise(IntPtr pfde, out uint pdwCookie);
    [PreserveSig] int Unadvise(uint dwCookie);
    [PreserveSig] int SetOptions(uint fos);
    [PreserveSig] int GetOptions(out uint pfos);
    [PreserveSig] int SetDefaultFolder(IShellItem psi);
    [PreserveSig] int SetFolder(IShellItem psi);
    [PreserveSig] int GetFolder(out IShellItem ppsi);
    [PreserveSig] int GetCurrentSelection(out IShellItem ppsi);
    [PreserveSig] int SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    [PreserveSig] int GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    [PreserveSig] int SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    [PreserveSig] int SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    [PreserveSig] int SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    [PreserveSig] int GetResult(out IShellItem ppsi);
    [PreserveSig] int AddPlace(IShellItem psi, uint fdap);
    [PreserveSig] int SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    [PreserveSig] int Close(int hr);
    [PreserveSig] int SetClientGuid(ref Guid guid);
    [PreserveSig] int ClearClientData();
    [PreserveSig] int SetFilter(IntPtr pFilter);
  }
  [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7"), ClassInterface(ClassInterfaceType.None)]
  public class FileOpenDialog {}
  internal static class NativeMethods {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
    internal static extern int SHCreateItemFromParsingName(string pszPath, IntPtr pbc, ref Guid riid, out IShellItem ppv);
  }
  public static class NativeFolderPicker {
    private const uint FOS_PICKFOLDERS = 0x00000020;
    private const uint FOS_FORCEFILESYSTEM = 0x00000040;
    private const uint FOS_PATHMUSTEXIST = 0x00000800;
    private const uint SIGDN_FILESYSPATH = 0x80058000;
    private const int HRESULT_ERROR_CANCELLED = unchecked((int)0x800704C7);
    private static void ThrowIfFailed(int hr) { if (hr < 0) Marshal.ThrowExceptionForHR(hr); }
    public static string Pick(string title, string initialDirectory, string selectedName) {
      var previousCulture = Thread.CurrentThread.CurrentCulture;
      var previousUICulture = Thread.CurrentThread.CurrentUICulture;
      try {
        // Best-effort localization for common dialog built-in strings.
        var zhCn = CultureInfo.GetCultureInfo("zh-CN");
        Thread.CurrentThread.CurrentCulture = zhCn;
        Thread.CurrentThread.CurrentUICulture = zhCn;

        IFileDialog dialog = (IFileDialog)new FileOpenDialog();
        uint options;
        ThrowIfFailed(dialog.GetOptions(out options));
        ThrowIfFailed(dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST));
        if (!string.IsNullOrWhiteSpace(title)) ThrowIfFailed(dialog.SetTitle(title));
        ThrowIfFailed(dialog.SetOkButtonLabel("确定"));
        ThrowIfFailed(dialog.SetFileNameLabel("文件夹"));
        if (!string.IsNullOrWhiteSpace(initialDirectory)) {
          Guid iid = typeof(IShellItem).GUID;
          IShellItem folder;
          ThrowIfFailed(NativeMethods.SHCreateItemFromParsingName(initialDirectory, IntPtr.Zero, ref iid, out folder));
          ThrowIfFailed(dialog.SetFolder(folder));
          ThrowIfFailed(dialog.SetDefaultFolder(folder));
        }
        if (!string.IsNullOrWhiteSpace(selectedName)) ThrowIfFailed(dialog.SetFileName(selectedName));
        int showHr = dialog.Show(IntPtr.Zero);
        if (showHr == HRESULT_ERROR_CANCELLED) return null;
        ThrowIfFailed(showHr);
        IShellItem result;
        ThrowIfFailed(dialog.GetResult(out result));
        IntPtr namePtr;
        ThrowIfFailed(result.GetDisplayName(SIGDN_FILESYSPATH, out namePtr));
        try { return Marshal.PtrToStringUni(namePtr); }
        finally { if (namePtr != IntPtr.Zero) Marshal.FreeCoTaskMem(namePtr); }
      } finally {
        Thread.CurrentThread.CurrentCulture = previousCulture;
        Thread.CurrentThread.CurrentUICulture = previousUICulture;
      }
    }
  }
}
"@
Add-Type -TypeDefinition $source -Language CSharp
$initialDirectory = $env:${PICK_DIRECTORY_INITIAL_DIRECTORY_ENV}
if ($initialDirectory -and -not (Test-Path -LiteralPath $initialDirectory -PathType Container)) { $initialDirectory = $null }
$selectedName = $env:${PICK_DIRECTORY_SELECTED_NAME_ENV}
$picked = [OfficeClaw.NativeFolderPicker]::Pick("选择文件夹", $initialDirectory, $selectedName)
if ($picked) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $picked
}
`.trim();

const WINDOWS_LIST_DIRECTORY_ATTRIBUTES_SCRIPT = [
  '$dirPath = $env:OFFICE_CLAW_DIRECTORY_ATTRIBUTES_PATH',
  'if (-not $dirPath) { throw "Missing OFFICE_CLAW_DIRECTORY_ATTRIBUTES_PATH" }',
  '$items = Get-ChildItem -LiteralPath $dirPath -Force -Directory | Select-Object Name, Attributes',
  '$result = @()',
  'foreach ($item in $items) {',
  '  $attrs = @($item.Attributes.ToString().Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ })',
  '  $result += [pscustomobject]@{ name = $item.Name; attributes = $attrs }',
  '}',
  'if ($result.Count -eq 0) { Write-Output "[]" } else { $result | ConvertTo-Json -Compress }',
].join('; ');

export type PickDirectoryResult =
  | { status: 'picked'; path: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface NativeDirectoryPickerCommand {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface NativeDirectoryPickerOptions {
  initialDirectory?: string;
  selectedName?: string;
  signal?: AbortSignal;
}

const LOCAL_AGENT_OPENABLE_EXTS = new Set([
  '.ppt',
  '.pptx',
  '.pot',
  '.potx',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  '.pdf',
  '.txt',
  '.log',
  '.json',
  '.md',
  '.markdown',
  '.html',
  '.htm',
]);

export function normalizePickedDirectoryPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (/^[A-Za-z]:[\\/]?$/.test(trimmed)) {
    return `${trimmed[0]}:\\`;
  }
  return trimmed.replace(/[\\/]$/, '');
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildDarwinPickDirectoryScript(initialDirectory?: string): string {
  const prompt = '选择文件夹';
  const escapedPrompt = escapeAppleScriptString(prompt);
  if (!initialDirectory) {
    return `POSIX path of (choose folder with prompt "${escapedPrompt}")`;
  }
  const escapedDirectory = escapeAppleScriptString(initialDirectory);
  return `POSIX path of (choose folder with prompt "${escapedPrompt}" default location POSIX file "${escapedDirectory}")`;
}

export function getPickDirectoryCommand(
  platformName = process.platform,
  options?: NativeDirectoryPickerOptions,
): NativeDirectoryPickerCommand | null {
  switch (platformName) {
    case 'darwin':
      return {
        command: 'osascript',
        args: ['-e', buildDarwinPickDirectoryScript(options?.initialDirectory)],
      };
    case 'win32': {
      const env: Record<string, string> = {};
      if (options?.initialDirectory) {
        env[PICK_DIRECTORY_INITIAL_DIRECTORY_ENV] = options.initialDirectory;
      }
      if (options?.selectedName) {
        env[PICK_DIRECTORY_SELECTED_NAME_ENV] = options.selectedName;
      }
      return {
        command: 'powershell.exe',
        args: ['-NoProfile', '-STA', '-Command', WINDOWS_PICK_DIRECTORY_SCRIPT],
        ...(Object.keys(env).length > 0 ? { env } : {}),
      };
    }
    default:
      return null;
  }
}

function getPathApi(platformName = process.platform) {
  return platformName === 'win32' ? win32 : posix;
}

function isPathUnderRoot(root: string, target: string, platformName = process.platform): boolean {
  const rel = platformName === 'win32' ? win32.relative(root, target) : relative(root, target);
  if (rel === '') return true;
  if (platformName === 'win32' && win32.isAbsolute(rel)) return false;
  return !rel.startsWith('..') && !rel.startsWith('/') && !rel.startsWith('\\');
}

type LocalProjectTargetKind = 'file' | 'directory';

type LocalProjectTargetResult =
  | { ok: true; target: string }
  | { ok: false; status: 400 | 403 | 404 | 409 | 500; error: string };

async function resolveLocalProjectTarget(
  rawPath: string | undefined,
  rawProjectPath: string | undefined,
  kind: LocalProjectTargetKind,
  options?: { requireOpenableExtension?: boolean },
): Promise<LocalProjectTargetResult> {
  const requestedPath = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (!requestedPath) return { ok: false, status: 400, error: 'path required' };

  const projectPath = typeof rawProjectPath === 'string' ? rawProjectPath.trim() : '';
  const hasProjectRoot = projectPath.length > 0 && projectPath !== 'default';
  let target = '';

  if (hasProjectRoot) {
    const root = await validateProjectPath(projectPath);
    if (!root) return { ok: false, status: 403, error: 'projectPath is outside allowed roots or does not exist' };
    target = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(root, requestedPath);
    if (!isPathUnderRoot(root, target)) return { ok: false, status: 403, error: 'path is outside projectPath' };

    try {
      target = await realpath(target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ok: false, status: 404, error: kind === 'file' ? 'File not found' : 'Folder not found' };
      }
      return { ok: false, status: 500, error: `Failed to resolve local ${kind}` };
    }
    if (!isPathUnderRoot(root, target)) return { ok: false, status: 403, error: 'path is outside projectPath' };
  } else {
    if (!isAbsolute(requestedPath)) {
      return { ok: false, status: 409, error: 'projectPath required for relative paths' };
    }
    target = resolve(requestedPath);
    if (!isUnderAllowedRoot(target)) return { ok: false, status: 403, error: 'path is outside allowed roots' };

    try {
      target = await realpath(target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ok: false, status: 404, error: kind === 'file' ? 'File not found' : 'Folder not found' };
      }
      return { ok: false, status: 500, error: `Failed to resolve local ${kind}` };
    }
    if (!isUnderAllowedRoot(target)) return { ok: false, status: 403, error: 'path is outside allowed roots' };
  }

  const extension = extname(target).toLowerCase();
  if (options?.requireOpenableExtension && !LOCAL_AGENT_OPENABLE_EXTS.has(extension)) {
    return { ok: false, status: 400, error: 'Only PPT/PPTX/Word/Excel/PDF/TXT/Markdown/HTML files are supported' };
  }

  try {
    const targetStat = await stat(target);
    if (kind === 'file' && !targetStat.isFile()) return { ok: false, status: 400, error: 'path must point to a file' };
    if (kind === 'directory' && !targetStat.isDirectory()) {
      return { ok: false, status: 400, error: 'path must point to a directory' };
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: false, status: 404, error: kind === 'file' ? 'File not found' : 'Folder not found' };
    }
    return { ok: false, status: 500, error: `Failed to read local ${kind}` };
  }

  return { ok: true, target };
}

export function splitProjectCompletePrefix(
  prefix: string,
  cwd: string,
  platformName = process.platform,
): { parentDir: string; fragment: string } {
  const pathApi = getPathApi(platformName);
  const expandedPrefix =
    prefix.startsWith('~/') || (platformName === 'win32' && prefix.startsWith('~\\'))
      ? homedir() + prefix.slice(1)
      : prefix;
  const absPrefix = pathApi.resolve(cwd, expandedPrefix);
  const hasTrailingSeparator = platformName === 'win32' ? /[\\/]$/.test(prefix) : prefix.endsWith('/');
  return {
    parentDir: hasTrailingSeparator ? absPrefix : pathApi.dirname(absPrefix),
    fragment: hasTrailingSeparator ? '' : pathApi.basename(absPrefix),
  };
}

export function getProjectBrowseParent(validatedPath: string, platformName = process.platform): string | null {
  const pathApi = getPathApi(platformName);
  const parent = pathApi.dirname(validatedPath);
  return parent === validatedPath ? null : parent;
}

export function resolveNativePickerOptions(
  selectedPath?: string,
  fallbackDirectory?: string,
  platformName = process.platform,
): NativeDirectoryPickerOptions {
  const pathApi = getPathApi(platformName);
  if (selectedPath) {
    const parent = pathApi.dirname(selectedPath);
    if (parent === selectedPath) {
      return { initialDirectory: selectedPath };
    }
    return {
      initialDirectory: parent,
      selectedName: pathApi.basename(selectedPath),
    };
  }
  if (fallbackDirectory) {
    return { initialDirectory: fallbackDirectory };
  }
  return {};
}

/**
 * Shell out to the host OS native folder picker.
 * Returns a discriminated result: picked / cancelled / error.
 */
export async function execPickDirectory(options: NativeDirectoryPickerOptions = {}): Promise<PickDirectoryResult> {
  const picker = getPickDirectoryCommand(process.platform, options);
  if (!picker) {
    return {
      status: 'error',
      message: `Native directory picker is not supported on ${process.platform}. Enter the project path manually.`,
    };
  }

  try {
    const { stdout } = await execFileAsync(picker.command, picker.args, {
      ...(options.signal ? { signal: options.signal } : {}),
      ...(picker.env ? { env: { ...process.env, ...picker.env } } : {}),
    });
    const picked = normalizePickedDirectoryPath(stdout);
    if (!picked) return { status: 'cancelled' };
    const pickedStat = await stat(picked);
    if (!pickedStat.isDirectory()) return { status: 'error', message: 'Selected path is not a directory' };
    return { status: 'picked', path: picked };
  } catch (err: unknown) {
    const stderr = String((err as { stderr?: unknown }).stderr ?? '');
    const errorName = String((err as { name?: unknown }).name ?? '');
    const errorCode = String((err as { code?: unknown }).code ?? '');
    if (options.signal?.aborted || errorName === 'AbortError' || errorCode === 'ABORT_ERR') {
      return { status: 'cancelled' };
    }
    const errorMessage = err instanceof Error ? err.message : String(err);
    const cancelSignal = `${stderr}\n${errorMessage}`;
    if (cancelSignal.includes('User canceled') || cancelSignal.includes('(-128)') || cancelSignal.includes(' -128')) {
      return { status: 'cancelled' };
    }
    return { status: 'error', message: stderr || (err instanceof Error ? err.message : 'Unknown error') };
  }
}

/** Swappable reference for testing — route calls this instead of execPickDirectory directly */
export let _pickDirectoryImpl: (options?: NativeDirectoryPickerOptions) => Promise<PickDirectoryResult> =
  execPickDirectory;
export function setPickDirectoryImpl(
  fn: (options?: NativeDirectoryPickerOptions) => Promise<PickDirectoryResult>,
): void {
  _pickDirectoryImpl = fn;
}

interface OpenDirectoryCommand {
  command: string;
  args: string[];
}

interface OpenDirectoryResult {
  status: 'opened' | 'error';
  message?: string;
}

export function getOpenDirectoryCommand(
  platformName: NodeJS.Platform,
  directoryPath: string,
): OpenDirectoryCommand | null {
  if (platformName === 'win32') return { command: 'explorer.exe', args: [directoryPath] };
  if (platformName === 'darwin') return { command: 'open', args: [directoryPath] };
  if (platformName === 'linux') return { command: 'xdg-open', args: [directoryPath] };
  return null;
}

export async function execOpenDirectory(directoryPath: string): Promise<OpenDirectoryResult> {
  const opener = getOpenDirectoryCommand(process.platform, directoryPath);
  if (!opener) {
    return {
      status: 'error',
      message: `Opening directories is not supported on ${process.platform}.`,
    };
  }

  return new Promise((resolveOpen) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const settle = (result: OpenDirectoryResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveOpen(result);
    };
    timeout = setTimeout(() => settle({ status: 'opened' }), 500);

    try {
      const child = spawn(opener.command, opener.args, {
        detached: true,
        stdio: 'ignore',
      });
      child.once('error', (error) => settle({ status: 'error', message: error.message }));
      child.once('spawn', () => {
        child.unref();
        settle({ status: 'opened' });
      });
    } catch (error) {
      settle({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  });
}

/** Swappable reference for testing — route calls this instead of execOpenDirectory directly */
export let _openDirectoryImpl: (directoryPath: string) => Promise<OpenDirectoryResult> = execOpenDirectory;
export function setOpenDirectoryImpl(fn: (directoryPath: string) => Promise<OpenDirectoryResult>): void {
  _openDirectoryImpl = fn;
}

export interface ProjectEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export function shouldHideProjectBrowseEntry(
  name: string,
  platformName = process.platform,
  options?: { isHidden?: boolean; isSystem?: boolean },
): boolean {
  if (!name) return true;
  if (name.startsWith('.')) return true;
  if (name === 'node_modules') return true;
  if (platformName === 'win32' && (options?.isHidden || options?.isSystem)) return true;
  return false;
}

interface WindowsDirectoryAttributeRecord {
  name: string;
  attributes: string[];
}

export function parseWindowsDirectoryAttributesPayload(payload: string): WindowsDirectoryAttributeRecord[] {
  const trimmed = payload.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as
      | { name?: unknown; attributes?: unknown }
      | Array<{ name?: unknown; attributes?: unknown }>;
    const records = Array.isArray(parsed) ? parsed : [parsed];
    return records
      .map((record) => {
        const name = typeof record?.name === 'string' ? record.name : '';
        const attrs = Array.isArray(record?.attributes)
          ? record.attributes.filter((value): value is string => typeof value === 'string').map((value) => value.trim())
          : [];
        return { name, attributes: attrs.filter(Boolean) };
      })
      .filter((record) => record.name);
  } catch {
    return [];
  }
}

export async function listWindowsHiddenSystemEntryNames(
  dirPath: string,
  platformName = process.platform,
): Promise<Set<string>> {
  if (platformName !== 'win32') return new Set();

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-Command', WINDOWS_LIST_DIRECTORY_ATTRIBUTES_SCRIPT],
      {
        timeout: 10_000,
        env: {
          ...process.env,
          OFFICE_CLAW_DIRECTORY_ATTRIBUTES_PATH: dirPath,
        },
      },
    );
    const hiddenNames = new Set<string>();
    for (const record of parseWindowsDirectoryAttributesPayload(stdout)) {
      const attributes = new Set(record.attributes);
      if (
        shouldHideProjectBrowseEntry(record.name, platformName, {
          isHidden: attributes.has('Hidden'),
          isSystem: attributes.has('System'),
        })
      ) {
        hiddenNames.add(record.name);
      }
    }
    return hiddenNames;
  } catch {
    return new Set();
  }
}

export let _listWindowsHiddenSystemEntryNamesImpl: (dirPath: string) => Promise<Set<string>> = (dirPath) =>
  listWindowsHiddenSystemEntryNames(dirPath);
export function setListWindowsHiddenSystemEntryNamesImpl(fn: (dirPath: string) => Promise<Set<string>>): void {
  _listWindowsHiddenSystemEntryNamesImpl = fn;
}

export async function listWindowsDriveRoots(platformName = process.platform): Promise<ProjectEntry[]> {
  if (platformName !== 'win32') return [];

  const drives: Array<ProjectEntry | null> = await Promise.all(
    Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index)).map(async (letter) => {
      const drivePath = `${letter}:\\`;
      try {
        const driveStat = await stat(drivePath);
        if (!driveStat.isDirectory()) return null;

        const realDrivePath = await realpath(drivePath).catch(() => drivePath);
        if (!isUnderAllowedRoot(realDrivePath)) return null;

        return {
          name: `${letter}:`,
          path: drivePath,
          isDirectory: true,
        };
      } catch {
        return null;
      }
    }),
  );

  return drives.filter((entry): entry is ProjectEntry => entry !== null);
}

/** Swappable reference for testing. */
export let _listWindowsDriveRootsImpl: () => Promise<ProjectEntry[]> = () => listWindowsDriveRoots();
export function setListWindowsDriveRootsImpl(fn: () => Promise<ProjectEntry[]>): void {
  _listWindowsDriveRootsImpl = fn;
}

async function describeInvalidProjectPath(rawPath: string): Promise<string> {
  const absPath = resolve(rawPath);
  try {
    const resolvedPath = await realpath(absPath);
    const info = await stat(resolvedPath);
    if (!info.isDirectory()) return '路径不是目录';
    return isDenylistMode() ? '目录位于受限系统路径下' : '目录不在允许路径内';
  } catch (error) {
    const code = error && typeof error === 'object' ? Reflect.get(error, 'code') : undefined;
    if (code === 'ENOENT') return '目录不存在';
    return isDenylistMode() ? '目录位于受限系统路径下或无法解析' : '目录不在允许路径内或无法解析';
  }
}

function summarizeOpenError(error: unknown): string {
  if (!error) return 'unknown_error';
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    const message = (error as { message?: unknown }).message;
    return [typeof code === 'string' ? code : '', typeof message === 'string' ? message : '']
      .filter(Boolean)
      .join(': ');
  }
  return String(error);
}

export async function openInDefaultApp(targetPath: string): Promise<void> {
  switch (process.platform) {
    case 'win32':
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-Command', 'Start-Process -FilePath $env:OFFICE_CLAW_TARGET_PATH'],
        {
          timeout: 15_000,
          env: { ...process.env, OFFICE_CLAW_TARGET_PATH: targetPath },
        },
      );
      return;
    case 'darwin':
      await execFileAsync('open', [targetPath], { timeout: 15_000 });
      return;
    default:
      await execFileAsync('xdg-open', [targetPath], { timeout: 15_000 });
  }
}

export async function openDirectoryInFileManager(targetPath: string): Promise<void> {
  switch (process.platform) {
    case 'win32':
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-Command', 'Start-Process -FilePath explorer.exe -ArgumentList $env:OFFICE_CLAW_TARGET_PATH'],
        {
          timeout: 15_000,
          env: { ...process.env, OFFICE_CLAW_TARGET_PATH: targetPath },
        },
      );
      return;
    case 'darwin':
      await execFileAsync('open', [targetPath], { timeout: 15_000 });
      return;
    default:
      await execFileAsync('xdg-open', [targetPath], { timeout: 15_000 });
  }
}

export let _openInDefaultAppImpl: (targetPath: string) => Promise<void> = openInDefaultApp;
export function setOpenInDefaultAppImpl(fn: (targetPath: string) => Promise<void>): void {
  _openInDefaultAppImpl = fn;
}

export let _openDirectoryInFileManagerImpl: (targetPath: string) => Promise<void> = openDirectoryInFileManager;
export function setOpenDirectoryInFileManagerImpl(fn: (targetPath: string) => Promise<void>): void {
  _openDirectoryInFileManagerImpl = fn;
}

async function resolveDefaultWorkspacePath(start = process.cwd()): Promise<string | null> {
  try {
    const monorepoRoot = findMonorepoRoot(start);
    const workspacePath = resolve(monorepoRoot, 'workspace');
    await mkdir(workspacePath, { recursive: true });

    const resolvedWorkspacePath = await realpath(workspacePath);
    if (!isUnderAllowedRoot(resolvedWorkspacePath)) return null;

    const info = await stat(resolvedWorkspacePath);
    return info.isDirectory() ? resolvedWorkspacePath : null;
  } catch {
    return null;
  }
}

function requireTrustedProjectIdentity(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = resolveHeaderUserId(request);
  if (!userId) {
    reply.status(401);
    return null;
  }
  return userId;
}

export const projectsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/projects/cwd - return server's working directory
  app.get('/api/projects/cwd', async () => {
    const cwd = process.cwd();
    const workspacePath = await resolveDefaultWorkspacePath(cwd);
    return {
      path: cwd,
      name: basename(cwd),
      ...(workspacePath ? { workspacePath } : {}),
    };
  });

  // POST /api/projects/pick-directory - open native folder picker
  app.post('/api/projects/pick-directory', async (request, reply) => {
    if (!requireTrustedProjectIdentity(request, reply)) {
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }
    const body = (request.body ?? {}) as { initialPath?: unknown; initialDirectory?: unknown };
    const requestedInitialPath =
      typeof body.initialPath === 'string' && body.initialPath.trim() ? body.initialPath.trim() : undefined;
    const validatedInitialPath = requestedInitialPath ? await validateProjectPath(requestedInitialPath) : null;
    const requestedInitialDirectory =
      typeof body.initialDirectory === 'string' && body.initialDirectory.trim()
        ? body.initialDirectory.trim()
        : undefined;
    const validatedInitialDirectory = requestedInitialDirectory
      ? await validateProjectPath(requestedInitialDirectory)
      : null;
    const pickerOptions = resolveNativePickerOptions(
      validatedInitialPath ?? undefined,
      validatedInitialDirectory ?? undefined,
    );
    const pickerAbortController = new AbortController();
    let pickerSettled = false;
    const abortPickerOnClose = () => {
      if (!pickerSettled) {
        pickerAbortController.abort();
      }
    };
    reply.raw.once('close', abortPickerOnClose);

    let result: PickDirectoryResult;
    try {
      result = await _pickDirectoryImpl({
        ...pickerOptions,
        signal: pickerAbortController.signal,
      });
    } finally {
      pickerSettled = true;
      reply.raw.removeListener('close', abortPickerOnClose);
    }
    if (result.status === 'cancelled') {
      reply.status(204);
      return;
    }
    if (result.status === 'error') {
      reply.status(500);
      return { error: result.message };
    }
    const validated = await validateProjectPath(result.path);
    if (!validated) {
      reply.status(403);
      return {
        error: isDenylistMode() ? '所选目录位于受限系统路径下' : '所选目录不在允许路径内',
        selectedPath: result.path,
        restrictedRoots: isDenylistMode() ? getAllowedRoots() : undefined,
        allowedRoots: isDenylistMode() ? undefined : getAllowedRoots(),
      };
    }
    return { path: validated, name: basename(validated) };
  });

  // POST /api/projects/open-directory - reveal an existing project directory in the system file manager
  app.post('/api/projects/open-directory', async (request, reply) => {
    if (!requireTrustedProjectIdentity(request, reply)) {
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const body = (request.body ?? {}) as { path?: unknown };
    const requestedPath = typeof body.path === 'string' && body.path.trim() ? body.path.trim() : null;
    if (!requestedPath) {
      reply.status(400);
      return { error: 'Missing required field: path' };
    }

    const validated = await validateProjectPath(requestedPath);
    if (!validated) {
      reply.status(403);
      return {
        error: await describeInvalidProjectPath(requestedPath),
        selectedPath: requestedPath,
        restrictedRoots: isDenylistMode() ? getAllowedRoots() : undefined,
        allowedRoots: isDenylistMode() ? undefined : getAllowedRoots(),
      };
    }

    const result = await _openDirectoryImpl(validated);
    if (result.status === 'error') {
      reply.status(500);
      return { error: result.message ?? 'Failed to open directory' };
    }

    return { success: true };
  });

  app.post<{ Body: { path?: string; projectPath?: string } }>(
    '/api/projects/local-file-meta',
    async (request, reply) => {
      if (!requireTrustedProjectIdentity(request, reply)) {
        return { error: 'Identity required (X-Office-Claw-User header)' };
      }
      const { path: filePath, projectPath } = request.body ?? {};
      const resolved = await resolveLocalProjectTarget(filePath, projectPath, 'file', {
        requireOpenableExtension: true,
      });
      if (!resolved.ok) {
        reply.status(resolved.status);
        return { error: resolved.error };
      }

      try {
        const targetStat = await stat(resolved.target);
        return {
          path: resolved.target,
          fileName: basename(resolved.target),
          size: targetStat.size,
          generatedAt: Math.trunc(targetStat.mtimeMs),
        };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
          reply.status(404);
          return { error: 'File not found' };
        }
        reply.status(500);
        return { error: 'Failed to read local file metadata' };
      }
    },
  );

  app.post<{ Body: { path?: string; projectPath?: string } }>(
    '/api/projects/read-local-text',
    async (request, reply) => {
      if (!requireTrustedProjectIdentity(request, reply)) {
        return { error: 'Identity required (X-Office-Claw-User header)' };
      }
      const { path: filePath, projectPath } = request.body ?? {};
      // No requireOpenableExtension here — LOCAL_UTF8_TEXT_PREVIEW_EXTENSIONS is the security boundary.
      const resolved = await resolveLocalProjectTarget(filePath, projectPath, 'file');
      if (!resolved.ok) {
        reply.status(resolved.status);
        return { error: resolved.error };
      }

      const fileName = basename(resolved.target);
      const ext = extname(resolved.target).toLowerCase();
      // Also allow dotfiles with no further extension (.gitignore, .gitkeep, .editorconfig, …)
      const isDotfileNoExt = !ext && /^\.[a-z][a-z0-9_-]*$/i.test(fileName);
      if (!LOCAL_UTF8_TEXT_PREVIEW_EXTENSIONS.has(ext) && !isDotfileNoExt) {
        reply.status(400);
        return {
          error:
            'Only text / code files can be read for preview. For .docx / .xlsx / .csv use read-local-binary-preview; other binaries use open-local.',
        };
      }

      try {
        const targetStat = await stat(resolved.target);
        if (!targetStat.isFile()) {
          reply.status(400);
          return { error: 'path must point to a file' };
        }
        if (targetStat.size > LOCAL_TEXT_PREVIEW_MAX_BYTES) {
          reply.status(413);
          return { error: `File too large for text preview (max ${LOCAL_TEXT_PREVIEW_MAX_BYTES} bytes)` };
        }
        const content = await readFile(resolved.target, 'utf8');
        return {
          path: resolved.target,
          fileName: basename(resolved.target),
          content,
        };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
          reply.status(404);
          return { error: 'File not found' };
        }
        reply.status(500);
        return { error: 'Failed to read local file' };
      }
    },
  );

  const handleReadLocalBinaryPreview = async (
    request: FastifyRequest<{ Body: { path?: string; projectPath?: string } }>,
    reply: FastifyReply,
  ) => {
    if (!requireTrustedProjectIdentity(request, reply)) {
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }
    const { path: filePath, projectPath } = request.body ?? {};
    const resolved = await resolveLocalProjectTarget(filePath, projectPath, 'file', { requireOpenableExtension: true });
    if (!resolved.ok) {
      reply.status(resolved.status);
      return { error: resolved.error };
    }

    const ext = extname(resolved.target).toLowerCase();
    if (!LOCAL_EMBEDDED_BINARY_PREVIEW_EXTENSIONS.has(ext)) {
      reply.status(400);
      return {
        error: 'Only .docx, .xlsx, .xls, .csv, and .pdf files are supported for embedded binary preview',
      };
    }

    const maxBytes = LOCAL_EMBEDDED_BINARY_PREVIEW_MAX_BYTES[ext];

    try {
      const targetStat = await stat(resolved.target);
      if (!targetStat.isFile()) {
        reply.status(400);
        return { error: 'path must point to a file' };
      }
      if (targetStat.size > maxBytes) {
        reply.status(413);
        return { error: `File too large for preview (max ${maxBytes} bytes for ${ext} files)` };
      }
      const buffer = await readFile(resolved.target);
      return {
        path: resolved.target,
        fileName: basename(resolved.target),
        contentBase64: buffer.toString('base64'),
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        reply.status(404);
        return { error: 'File not found' };
      }
      reply.status(500);
      return { error: 'Failed to read local file for preview' };
    }
  };

  app.post('/api/projects/read-local-binary-preview', handleReadLocalBinaryPreview);

  app.post<{ Body: { path?: string; projectPath?: string } }>(
    '/api/projects/open-local-folder',
    async (request, reply) => {
      if (!requireTrustedProjectIdentity(request, reply)) {
        return { error: 'Identity required (X-Office-Claw-User header)' };
      }
      const { path: folderPath, projectPath } = request.body ?? {};
      const resolved = await resolveLocalProjectTarget(folderPath, projectPath, 'directory');
      if (!resolved.ok) {
        reply.status(resolved.status);
        return { error: resolved.error };
      }

      try {
        await _openDirectoryInFileManagerImpl(resolved.target);
        return { ok: true };
      } catch (e) {
        reply.status(500);
        return { error: 'Failed to open local folder', details: summarizeOpenError(e) };
      }
    },
  );

  app.post<{ Body: { path?: string; projectPath?: string } }>('/api/projects/open-local', async (request, reply) => {
    if (!requireTrustedProjectIdentity(request, reply)) {
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }
    const { path: filePath, projectPath } = request.body ?? {};
    const resolved = await resolveLocalProjectTarget(filePath, projectPath, 'file', { requireOpenableExtension: true });
    if (!resolved.ok) {
      reply.status(resolved.status);
      return { error: resolved.error };
    }

    try {
      await _openInDefaultAppImpl(resolved.target);
      return { ok: true };
    } catch (e) {
      reply.status(500);
      return { error: 'Failed to open local file', details: summarizeOpenError(e) };
    }
  });

  // GET /api/projects/complete?prefix=src/comp&cwd=/path/to/project&limit=10
  app.get('/api/projects/complete', async (request, reply) => {
    if (!requireTrustedProjectIdentity(request, reply)) {
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }
    const query = request.query as { prefix?: string; cwd?: string; limit?: string };
    if (!query.prefix && query.prefix !== '') {
      reply.status(400);
      return { error: 'prefix parameter is required' };
    }
    const prefix = query.prefix;
    const limit = Math.min(Math.max(parseInt(query.limit || '10', 10) || 10, 1), 50);

    const cwd = query.cwd || process.cwd();
    const { parentDir, fragment } = splitProjectCompletePrefix(prefix, cwd);

    // Validate parent directory
    const validatedParent = await validateProjectPath(parentDir);
    if (!validatedParent) {
      reply.status(403);
      return {
        error: isDenylistMode()
          ? 'Access denied: path is under a restricted system directory'
          : 'Access denied: path is outside allowed roots',
      };
    }

    try {
      const entries = await readdir(validatedParent, { withFileTypes: true });
      const hiddenEntryNames = await _listWindowsHiddenSystemEntryNamesImpl(validatedParent);
      const results: ProjectEntry[] = [];

      for (const entry of entries) {
        if (shouldHideProjectBrowseEntry(entry.name)) continue;
        if (hiddenEntryNames.has(entry.name)) continue;
        if (fragment && !entry.name.startsWith(fragment)) continue;

        const childPath = resolve(validatedParent, entry.name);
        try {
          const childReal = await realpath(childPath);
          if (!isUnderAllowedRoot(childReal)) continue;
          const isDir = entry.isDirectory();
          results.push({
            name: isDir ? `${entry.name}/` : entry.name,
            path: childReal,
            isDirectory: isDir,
          });
        } catch {}
      }

      // Sort: directories first, then alphabetically within each group
      results.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return { entries: results.slice(0, limit) };
    } catch {
      return { entries: [] };
    }
  });

  // GET /api/projects/list-files?path=/some/dir&maxDepth=2 - recursively list files and directories
  app.get('/api/projects/list-files', async (request, reply) => {
    if (!requireTrustedProjectIdentity(request, reply)) {
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }
    const query = request.query as { path?: string; maxDepth?: string };
    const targetPath = (query.path || '').trim();
    if (!targetPath) {
      reply.status(400);
      return { error: 'path parameter is required' };
    }

    const maxDepth = Math.min(Math.max(parseInt(query.maxDepth || '4', 10) || 4, 1), 6);

    const validatedPath = await validateProjectPath(targetPath);
    if (!validatedPath) {
      reply.status(403);
      return {
        error: isDenylistMode()
          ? 'Access denied: path is under a restricted system directory'
          : 'Access denied: path is outside allowed roots',
      };
    }

    const MAX_ENTRIES = 300;
    const results: Array<{ name: string; path: string; isDirectory: boolean; extension: string }> = [];

    async function walkDir(dirPath: string, depth: number): Promise<void> {
      if (results.length >= MAX_ENTRIES) return;
      if (depth > maxDepth) return;
      let rawEntries: string[];
      try {
        rawEntries = await readdir(dirPath);
      } catch {
        return;
      }
      const hiddenEntryNames = await _listWindowsHiddenSystemEntryNamesImpl(dirPath);

      const sorted = [...rawEntries].sort((a, b) => a.localeCompare(b));

      // Entries to always skip in the file browser (build artifacts / package caches).
      const SKIP_ENTRIES = new Set(['node_modules', '.git', '__pycache__', '.next', 'dist', '.DS_Store']);

      for (const entryName of sorted) {
        if (results.length >= MAX_ENTRIES) return;
        if (SKIP_ENTRIES.has(entryName)) continue;
        if (hiddenEntryNames.has(entryName)) continue;

        const childPath = resolve(dirPath, entryName);
        let childReal: string;
        let childStat: Awaited<ReturnType<typeof stat>> | null = null;
        try {
          childReal = await realpath(childPath);
          childStat = await stat(childReal);
        } catch {
          continue;
        }
        if (!isUnderAllowedRoot(childReal)) continue;

        const isDir = childStat.isDirectory();
        results.push({
          name: entryName,
          path: childReal,
          isDirectory: isDir,
          extension: isDir ? '' : extname(entryName).toLowerCase(),
        });

        if (isDir && depth < maxDepth) {
          await walkDir(childReal, depth + 1);
        }
      }
    }

    try {
      await walkDir(validatedPath, 1);
      return { path: validatedPath, entries: results };
    } catch (err) {
      reply.status(500);
      return { error: `Failed to list files: ${err instanceof Error ? err.message : String(err)}` };
    }
  });

  // GET /api/projects/browse?path=/some/dir - list subdirectories
  app.get('/api/projects/browse', async (request, reply) => {
    if (!requireTrustedProjectIdentity(request, reply)) {
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }
    const query = request.query as { path?: string };
    const targetPath = query.path || homedir();

    // Validate path: realpath() resolves symlinks, then boundary check
    const validatedPath = await validateProjectPath(targetPath);
    if (!validatedPath) {
      reply.status(403);
      return {
        error: isDenylistMode()
          ? 'Access denied: path is under a restricted system directory'
          : 'Access denied: path is outside allowed roots',
      };
    }

    try {
      const entries = await readdir(validatedPath, { withFileTypes: true });
      const hiddenEntryNames = await _listWindowsHiddenSystemEntryNamesImpl(validatedPath);
      const drives = await _listWindowsDriveRootsImpl();
      const dirs: ProjectEntry[] = [];

      for (const entry of entries) {
        if (shouldHideProjectBrowseEntry(entry.name)) continue;
        if (hiddenEntryNames.has(entry.name)) continue;

        if (entry.isDirectory()) {
          // Resolve child realpath to prevent symlink escape in entries
          const childPath = resolve(validatedPath, entry.name);
          try {
            const childReal = await realpath(childPath);
            if (!isUnderAllowedRoot(childReal)) continue;
            dirs.push({ name: entry.name, path: childReal, isDirectory: true });
          } catch {}
        }
      }

      // Sort alphabetically
      dirs.sort((a, b) => a.name.localeCompare(b.name));

      const parentDir = getProjectBrowseParent(validatedPath);
      const canGoUp = parentDir !== null && isUnderAllowedRoot(parentDir);

      return {
        current: validatedPath,
        name: basename(validatedPath),
        parent: canGoUp ? parentDir : null,
        homePath: homedir(),
        drives,
        entries: dirs,
      };
    } catch (err) {
      reply.status(400);
      return {
        error: `Cannot read directory: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });
};
