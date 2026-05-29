/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { spawnSync } from 'node:child_process';
import {
  closeSync,
  copyFileSync,
  cpSync,
  createWriteStream,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep, win32 } from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { readPyprojectDependencies } from './python-project-deps.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const DEFAULT_WEBVIEW2_VERSION = process.env.CLOWDER_WEBVIEW2_VERSION ?? '1.0.3856.49';
const WEBVIEW2_BOOTSTRAPPER_URL = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703';

const VC_REDIST_VERSION = process.env.CLOWDER_VC_REDIST_VERSION ?? '14.42.34433';
const VC_REDIST_X64_URL = `https://aka.ms/vs/17/release/vc_redist.x64.exe`;

const SEVENZIP_VERSION = process.env.CLOWDER_SEVENZIP_VERSION ?? '26.00';
const SEVENZIP_EXTRA_URL = `https://www.7-zip.org/a/7z${SEVENZIP_VERSION.replace('.', '')}-extra.7z`;
const SEVENZIP_BOOTSTRAP_URL = process.env.CLOWDER_SEVENZIP_BOOTSTRAP_URL ?? 'https://www.7-zip.org/a/7zr.exe';

const stepTimings = [];
let currentStepName = null;
let currentStepStart = null;

function startStep(name) {
  if (currentStepName !== null) {
    const elapsed = Date.now() - currentStepStart;
    stepTimings.push({ name: currentStepName, elapsed });
  }
  currentStepName = name;
  currentStepStart = Date.now();
}

function endCurrentStep() {
  if (currentStepName !== null) {
    const elapsed = Date.now() - currentStepStart;
    stepTimings.push({ name: currentStepName, elapsed });
    currentStepName = null;
  }
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
}

function printTimingSummary() {
  if (stepTimings.length === 0) return;
  const total = stepTimings.reduce((a, b) => a + b.elapsed, 0);
  process.stdout.write('\n[windows-installer] Timing Summary:\n');
  process.stdout.write('─'.repeat(50) + '\n');
  const sorted = [...stepTimings].sort((a, b) => b.elapsed - a.elapsed);
  for (const { name, elapsed } of sorted) {
    const pct = ((elapsed / total) * 100).toFixed(1);
    process.stdout.write(`  ${name.padEnd(35)} ${formatDuration(elapsed).padStart(8)} (${pct}%)\n`);
  }
  process.stdout.write('─'.repeat(50) + '\n');
  process.stdout.write(`  ${'TOTAL'.padEnd(35)} ${formatDuration(total).padStart(8)}\n\n`);
}

const WINDOWS_RUNTIME_NPM_ARGS = [
  'install',
  '--omit=dev',
  '--no-audit',
  '--no-fund',
  '--package-lock=false',
  '--loglevel=error',
];

export const WINDOWS_PRESERVE_PATHS = ['.env', 'office-claw-config.json', 'data', 'logs', '.office-claw', 'workspace'];
export const WINDOWS_MANAGED_TOP_LEVEL_PATHS = [
  'packages',
  'scripts',
  'office-claw-skills',
  'tools',
  'installer-seed',
  'vendor',
  'assets',
  '.office-claw-release.json',
  '.env.example',
  'LICENSE',
  'office-claw-template.json',
  'experts-preset.json',
  'modelarts-preset.json',
  'pnpm-workspace.yaml',
];

const EXCLUDED_TOP_LEVEL_SEGMENTS = new Set(['.git', 'node_modules']);
const EXCLUDED_EXACT_PATHS = new Set([
  '.env',
  'data',
  'logs',
  'uploads',
  'workspace',
  'dist',
  'packages/api/dist',
  'packages/mcp-server/dist',
  'packages/web/dist',
  'packages/web/.next',
]);
const EXCLUDED_PREFIXES = [
  'data/',
  'logs/',
  'uploads/',
  'workspace/',
  'dist/',
  'packages/api/dist/',
  'packages/mcp-server/dist/',
  'packages/web/dist/',
  'packages/web/.next/',
];
const RUNTIME_SCRIPT_FILES = [
  'build-catalog.mjs',
  'crash-logger.mjs',
  'install-auth-config.mjs',
  'install-windows-helpers.ps1',
  'start-entry.mjs',
  'start-windows.ps1',
  'start.bat',
  'stop-windows.ps1',
  'view-crash-logs.mjs',
  'windows-command-helpers.ps1',
  'windows-installer-ui.ps1',
];
const PYTHON_EMBED_VERSION = '3.13.4';
const PYTHON_EMBED_URL = `https://www.python.org/ftp/python/${PYTHON_EMBED_VERSION}/python-${PYTHON_EMBED_VERSION}-embed-amd64.zip`;
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';
const PYTHON_MAJOR_MINOR = PYTHON_EMBED_VERSION.split('.').slice(0, 2).join('');
const ROOT_NODE_MODULES_DIR = join(repoRoot, 'node_modules');
const JIUWENCLAW_VENDOR_DIR = join(repoRoot, 'vendor', 'jiuwenclaw');
const JIUWENCLAW_VENDOR_METADATA_PATH = join(JIUWENCLAW_VENDOR_DIR, '.clowder-source.json');
const JIUWENCLAW_VENDOR_REQUIRED_FILES = [
  'pyproject.toml',
  join('jiuwenclaw', 'app.py'),
  join('scripts', 'jiuwenclaw.spec'),
  join('scripts', 'build-exe.ps1'),
  join('scripts', 'jiuwenclaw_exe_entry.py'),
];
const JIUWENCLAW_PYPROJECT_PATH = join(JIUWENCLAW_VENDOR_DIR, 'pyproject.toml');
const API_RUNTIME_EXTERNAL_DEPENDENCIES = [
  'better-sqlite3',
  'cross-keychain',
  'node-pty',
  'pino',
  'pino-roll',
  'puppeteer',
  'sharp',
  'sqlite-vec',
  'snappy',
  '@napi-rs/keyring',
  '@napi-rs/keyring-win32-x64-msvc',
];
const API_RUNTIME_WORKSPACE_DEPENDENCIES = {
  '@openjiuwen/relay-core': 'file:../core',
  '@openjiuwen/relay-api-server-contracts': 'file:../plugin/api',
  '@openjiuwen/relay-shared': 'file:../shared',
  '@openjiuwen/relay-storage-sqlite': 'file:../sqlite-adapter/api',
};
const RUNTIME_WORKSPACE_DEPENDENCIES = {
  '@openjiuwen/relay-core': 'file:../core',
  '@openjiuwen/relay-api-server-contracts': 'file:../plugin/api',
  '@openjiuwen/relay-shared': 'file:../shared',
  '@openjiuwen/relay-storage-sqlite': 'file:../sqlite-adapter/api',
};
const WINDOWS_RUNTIME_PACKAGE_DIRS = [
  'shared',
  'core',
  join('plugin', 'api'),
  join('sqlite-adapter', 'api'),
  'api',
  'mcp-server',
];
export function normalizeNodeVersion(version) {
  const trimmed = String(version ?? '').trim();
  if (!trimmed) {
    throw new Error('Windows Node version is empty');
  }
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
}

export function pickRedisReleaseAsset(assets) {
  const candidates = [
    /^Redis-.*-Windows-x64-msys2\.zip$/i,
    /^Redis-.*-Windows-x64-cygwin\.zip$/i,
    /^Redis-.*-Windows-x64-msys2-with-Service\.zip$/i,
    /^Redis-.*-Windows-x64-cygwin-with-Service\.zip$/i,
  ];
  for (const pattern of candidates) {
    const asset = assets.find((entry) => pattern.test(entry.name ?? ''));
    if (asset) {
      return asset;
    }
  }
  return null;
}

export function shouldCopyRepoPath(relativePath) {
  const normalized = relativePath.split(sep).join('/');
  if (!normalized || normalized === '.') return true;
  const segments = normalized.split('/');
  if (segments.some((segment) => EXCLUDED_TOP_LEVEL_SEGMENTS.has(segment))) return false;
  if (EXCLUDED_EXACT_PATHS.has(normalized)) return false;
  return !EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function shouldUseCommandShell(command, platform = process.platform) {
  if (platform !== 'win32') return false;
  const normalized = String(command ?? '').trim();
  if (!normalized) return false;
  return !normalized.includes('/') && !normalized.includes('\\');
}

function parseArgs(argv) {
  const options = {
    bundleOnly: false,
    skipBuild: false,
    skipPython: false,
    launcherOnly: false,
    nsisOnly: false,
    outputDir: resolve(repoRoot, 'dist', 'windows'),
    cacheDir: null,
    nodeVersion: normalizeNodeVersion(process.env.CLOWDER_WINDOWS_NODE_VERSION ?? process.versions.node),
    nodeZipUrl: process.env.CLOWDER_WINDOWS_NODE_ZIP_URL ?? null,
    redisZipUrl: process.env.CLOWDER_WINDOWS_REDIS_ZIP_URL ?? null,
    webview2Version: DEFAULT_WEBVIEW2_VERSION,
    redisReleaseApi:
      process.env.CLOWDER_WINDOWS_REDIS_RELEASE_API ??
      'https://api.github.com/repos/redis-windows/redis-windows/releases/latest',
  };
  const handlers = new Map([
    [
      '--bundle-only',
      () => {
        options.bundleOnly = true;
        return 0;
      },
    ],
    [
      '--skip-build',
      () => {
        options.skipBuild = true;
        return 0;
      },
    ],
    [
      '--skip-python',
      () => {
        options.skipPython = true;
        return 0;
      },
    ],
    [
      '--launcher-only',
      () => {
        options.launcherOnly = true;
        return 0;
      },
    ],
    [
      '--nsis-only',
      () => {
        options.nsisOnly = true;
        return 0;
      },
    ],
    [
      '--output-dir',
      (value) => {
        options.outputDir = resolve(repoRoot, value ?? '');
        return 1;
      },
    ],
    [
      '--cache-dir',
      (value) => {
        options.cacheDir = resolve(repoRoot, value ?? '');
        return 1;
      },
    ],
    [
      '--node-version',
      (value) => {
        options.nodeVersion = normalizeNodeVersion(value ?? '');
        return 1;
      },
    ],
    [
      '--node-zip-url',
      (value) => {
        options.nodeZipUrl = value ?? null;
        return 1;
      },
    ],
    [
      '--redis-zip-url',
      (value) => {
        options.redisZipUrl = value ?? null;
        return 1;
      },
    ],
    [
      '--webview2-version',
      (value) => {
        options.webview2Version = value ?? options.webview2Version;
        return 1;
      },
    ],
    [
      '--redis-release-api',
      (value) => {
        options.redisReleaseApi = value ?? options.redisReleaseApi;
        return 1;
      },
    ],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    const handler = handlers.get(arg);
    if (!handler) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    index += handler(argv[index + 1]);
  }
  if (!options.cacheDir) {
    options.cacheDir = join(options.outputDir, 'cache');
  }
  return options;
}

function printUsage() {
  process.stdout.write(`Usage: node scripts/build-windows-installer.mjs [options]

Options:
  --bundle-only         Build the offline bundle without invoking makensis
  --skip-build          Reuse existing build artifacts without rebuilding frontend/backend
  --skip-python         Skip Python embed download + pip install (reuse existing tools/python in bundle)
  --launcher-only       Rebuild only the C# desktop launcher into existing bundle, then stop
  --nsis-only           Skip bundle, only repackage existing bundle into exe
  --output-dir <path>   Override dist/windows output root
  --cache-dir <path>    Override download cache directory
  --node-version <ver>  Override bundled Windows Node version
  --node-zip-url <url>  Override Node zip URL
  --redis-zip-url <url> Override Redis zip URL
  --webview2-version <ver>
                        Override the WebView2 SDK version used for the desktop launcher build
  --redis-release-api <url>
                        Override Redis release metadata endpoint
`);
}

function logStep(message) {
  startStep(message);
  process.stdout.write(`\n[windows-installer] ${message}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.stdio ?? 'inherit',
    shell: options.shell ?? shouldUseCommandShell(command),
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function runAndCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: 'pipe',
    shell: options.shell ?? shouldUseCommandShell(command),
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return (result.stdout ?? '').trim();
}

function commandExists(command) {
  if (command.includes('/') || command.includes('\\')) {
    return existsSync(command);
  }
  const probeCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probeCommand, [command], { stdio: 'ignore' });
  return result.status === 0;
}

function envFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function resolveCommandPath(command) {
  if (command.includes('/') || command.includes('\\')) {
    return existsSync(command) ? command : null;
  }
  const probeCommand = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(probeCommand, [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0 || !result.stdout) {
    return null;
  }
  const resolved = result.stdout.split(/\r?\n/).find((line) => line.trim());
  return resolved ? resolved.trim() : null;
}

function findSignTool() {
  const envPath = process.env.WINDOWS_SIGNTOOL_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const pathCommand = resolveCommandPath('signtool.exe') ?? resolveCommandPath('signtool');
  if (pathCommand) {
    return pathCommand;
  }

  if (process.platform !== 'win32') {
    return null;
  }

  const kitsRoot = join(process.env['ProgramFiles(x86)'] ?? '', 'Windows Kits', '10', 'bin');
  if (!existsSync(kitsRoot)) {
    return null;
  }

  const candidates = [];
  for (const sdkVersion of readdirSync(kitsRoot, { withFileTypes: true })) {
    if (!sdkVersion.isDirectory()) {
      continue;
    }
    candidates.push(join(kitsRoot, sdkVersion.name, 'x64', 'signtool.exe'));
    candidates.push(join(kitsRoot, sdkVersion.name, 'arm64', 'signtool.exe'));
  }
  candidates.sort().reverse();
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveWindowsSigningConfig() {
  const enabled = envFlagEnabled(process.env.WINDOWS_SIGNING_ENABLED) || envFlagEnabled(process.env.WINDOWS_SIGNING_REQUIRED);
  const required = envFlagEnabled(process.env.WINDOWS_SIGNING_REQUIRED);
  if (!enabled) {
    return { enabled, required };
  }

  if (process.platform !== 'win32') {
    throw new Error('Windows signing is enabled but can only run on Windows build hosts.');
  }

  const signToolPath = findSignTool();
  if (!signToolPath) {
    throw new Error('Windows signing is enabled but signtool.exe was not found. Set WINDOWS_SIGNTOOL_PATH or install Windows SDK.');
  }

  const timestampUrl = process.env.WINDOWS_SIGN_TIMESTAMP_URL || 'http://timestamp.digicert.com';
  const description = process.env.WINDOWS_SIGN_DESCRIPTION || 'OfficeClaw';
  const thumbprint = process.env.WINDOWS_SIGN_CERT_THUMBPRINT?.trim();
  if (thumbprint) {
    return {
      enabled,
      required,
      signToolPath,
      timestampUrl,
      description,
      mode: 'thumbprint',
      thumbprint,
      certStore: process.env.WINDOWS_SIGN_CERT_STORE || 'My',
      certStoreLocation: process.env.WINDOWS_SIGN_CERT_STORE_LOCATION || 'CurrentUser',
    };
  }

  const pfxPath = process.env.WINDOWS_SIGN_CERT_PATH;
  if (pfxPath) {
    if (!existsSync(pfxPath)) {
      throw new Error(`Windows signing certificate file not found: ${pfxPath}`);
    }
    const pfxPassword = process.env.WINDOWS_SIGN_CERT_PASSWORD;
    if (!pfxPassword) {
      throw new Error('WINDOWS_SIGN_CERT_PASSWORD is required when WINDOWS_SIGN_CERT_PATH is set.');
    }
    return {
      enabled,
      required,
      signToolPath,
      timestampUrl,
      description,
      mode: 'pfx',
      pfxPath,
      pfxPassword,
    };
  }

  throw new Error(
    'Windows signing is enabled but no certificate was configured. Set WINDOWS_SIGN_CERT_THUMBPRINT or WINDOWS_SIGN_CERT_PATH.',
  );
}

function runSignTool(config, args, action) {
  const result = spawnSync(config.signToolPath, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const redactedArgs = args.map((arg, index) => (args[index - 1] === '/p' ? '<redacted>' : arg));
    throw new Error(`${action} failed: ${config.signToolPath} ${redactedArgs.join(' ')} exited with code ${result.status}`);
  }
}

function signWindowsExecutable(filePath, label, config) {
  if (!config.enabled) {
    process.stdout.write(`[windows-installer] Windows signing disabled; skipping ${label}\n`);
    return;
  }
  if (!existsSync(filePath)) {
    throw new Error(`Cannot sign missing file: ${filePath}`);
  }

  process.stdout.write(`[windows-installer] Signing ${label}\n`);
  const args = ['sign', '/fd', 'SHA256', '/tr', config.timestampUrl, '/td', 'SHA256', '/d', config.description];
  if (config.mode === 'thumbprint') {
    args.push('/sha1', config.thumbprint, '/s', config.certStore);
    if (String(config.certStoreLocation).toLowerCase() === 'localmachine') {
      args.push('/sm');
    }
  } else {
    args.push('/f', config.pfxPath, '/p', config.pfxPassword);
  }
  args.push(filePath);
  runSignTool(config, args, `Signing ${label}`);
}

function verifyWindowsSignature(filePath, label, config) {
  if (!config.enabled) {
    return;
  }
  process.stdout.write(`[windows-installer] Verifying ${label} signature\n`);
  runSignTool(config, ['verify', '/pa', '/tw', filePath], `Verifying ${label} signature`);
}

function findUvCommand() {
  if (process.env.UV_PATH && existsSync(process.env.UV_PATH)) {
    return process.env.UV_PATH;
  }

  if (process.platform === 'win32') {
    const userProfile = process.env.USERPROFILE ?? '';
    const localBinCandidates = [
      join(userProfile, '.local', 'bin', 'uv.exe'),
      join(userProfile, '.cargo', 'bin', 'uv.exe'),
    ];
    for (const candidate of localBinCandidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  const candidates = ['uv', 'uvx'];
  for (const cmd of candidates) {
    if (commandExists(cmd)) {
      if (process.platform === 'win32') {
        const where = spawnSync('where.exe', [cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const resolved = where.stdout?.split(/\r?\n/).find((line) => line.trim());
        if (where.status === 0 && resolved) {
          return resolved.trim();
        }
      }
      return cmd;
    }
  }
  return null;
}

function findUsablePython() {
  const candidates = [];
  if (process.platform === 'win32') {
    for (const cmd of ['python3', 'python', 'py']) {
      const where = spawnSync('where', [cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (where.status === 0 && where.stdout) {
        for (const line of where.stdout.split(/\r?\n/).filter(Boolean)) {
          candidates.push({ command: cmd, path: line.trim() });
        }
      }
    }
  } else {
    for (const cmd of ['python3', 'python']) {
      if (commandExists(cmd)) {
        candidates.push({ command: cmd });
      }
    }
  }
  for (const { command, path } of candidates) {
    const exe = path ?? command;
    const args = command === 'py' ? ['-3', '-c', 'import sys'] : ['-c', 'import sys'];
    const result = spawnSync(exe, args, { stdio: 'ignore', timeout: 5000 });
    if (result.status === 0) {
      return { command: exe, isPy: command === 'py' };
    }
  }
  return null;
}

function resolveLocalEsbuildCommand() {
  const binCandidates =
    process.platform === 'win32'
      ? [
          join(ROOT_NODE_MODULES_DIR, '@esbuild', 'win32-x64', 'esbuild.exe'),
          join(ROOT_NODE_MODULES_DIR, '.bin', 'esbuild.cmd'),
          join(ROOT_NODE_MODULES_DIR, '.bin', 'esbuild'),
        ]
      : [join(ROOT_NODE_MODULES_DIR, '.bin', 'esbuild')];
  for (const candidate of binCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`esbuild executable not found in ${join(ROOT_NODE_MODULES_DIR, '.bin')}`);
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function assertFilesExist(rootDir, requiredFiles, label) {
  const missing = requiredFiles.filter((relativePath) => !existsSync(join(rootDir, relativePath)));
  if (missing.length > 0) {
    throw new Error(`${label} is missing required files: ${missing.join(', ')}`);
  }
}

function assertJiuwenClawVendorReady() {
  if (!existsSync(JIUWENCLAW_VENDOR_DIR)) {
    throw new Error(
      'JiuwenClaw vendor source is missing. Run "pnpm vendor:sync:jiuwenclaw" before Windows packaging.',
    );
  }

  assertFilesExist(JIUWENCLAW_VENDOR_DIR, JIUWENCLAW_VENDOR_REQUIRED_FILES, 'JiuwenClaw vendor source');

  if (!existsSync(JIUWENCLAW_VENDOR_METADATA_PATH)) {
    process.stdout.write(
      '[windows-installer] JiuwenClaw vendor metadata missing; continuing with local source tree.\n',
    );
    return;
  }

  try {
    const metadata = JSON.parse(readFileSync(JIUWENCLAW_VENDOR_METADATA_PATH, 'utf8'));
    const summary = metadata?.resolvedCommit || metadata?.requestedRef || metadata?.source;
    if (summary) {
      process.stdout.write(`[windows-installer] JiuwenClaw vendor source: ${summary}\n`);
    }
  } catch (error) {
    process.stdout.write(
      `[windows-installer] Failed to read JiuwenClaw vendor metadata: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

function resetDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function toWindowsPath(path) {
  if (process.platform === 'win32') {
    return path;
  }
  if (!commandExists('wslpath')) {
    throw new Error('wslpath is required to build the Windows WebView2 launcher from Linux');
  }
  return runAndCapture('wslpath', ['-w', path]);
}

function toWslPath(path) {
  if (process.platform === 'win32') {
    return path;
  }
  if (!commandExists('wslpath')) {
    throw new Error('wslpath is required to access Windows staging paths from Linux');
  }
  return runAndCapture('wslpath', ['-u', path]);
}

function toNsisPath(path) {
  return path.replaceAll('\\', '/').replace(/\/?$/, '/');
}

function toNsisFilePath(path) {
  return path;
}

function toNsisDirPath(path) {
  return path.replaceAll('/', '\\').replace(/[\\/]+$/, '');
}

function copyEntry(source, destination) {
  cpSync(source, destination, {
    recursive: true,
    force: true,
    filter(src) {
      const rel = relative(repoRoot, src);
      return shouldCopyRepoPath(rel);
    },
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createIcoFromPng(pngPath, icoPath) {
  const png = readFileSync(pngPath);
  const pngSignature = '89504e470d0a1a0a';
  if (png.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error(`Unsupported PNG icon source: ${pngPath}`);
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = width >= 256 ? 0 : width;
  header[7] = height >= 256 ? 0 : height;
  header[8] = 0;
  header[9] = 0;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  writeFileSync(icoPath, Buffer.concat([header, png]));
}

function copyTopLevelProject(bundleDir) {
  const entries = [
    'office-claw-skills',
    'LICENSE',
    '.env.example',
    '.inner.env',
    'office-claw-template.json',
    'modelarts-preset.json',
    'pnpm-workspace.yaml',
  ];
  for (const entry of entries) {
    const source = join(repoRoot, entry);
    if (!existsSync(source)) {
      throw new Error(`Missing required bundle entry: ${source}`);
    }
    const destination = join(bundleDir, entry);
    ensureDir(dirname(destination));
    copyEntry(source, destination);
  }

  const scriptsDir = join(bundleDir, 'scripts');
  ensureDir(scriptsDir);
  for (const scriptName of RUNTIME_SCRIPT_FILES) {
    const source = join(repoRoot, 'scripts', scriptName);
    if (!existsSync(source)) {
      throw new Error(`Missing runtime script: ${source}`);
    }
    cpSync(source, join(scriptsDir, scriptName), { force: true });
  }
}

async function stageWindowsPython(bundleDir, options) {
  const archiveName = `python-${PYTHON_EMBED_VERSION}-embed-amd64.zip`;
  const archivePath = join(options.cacheDir, archiveName);
  await ensureCachedDownload(PYTHON_EMBED_URL, archivePath);

  const targetDir = join(bundleDir, 'tools', 'python');
  resetDir(targetDir);
  extractZip(archivePath, targetDir);

  // Keep vendor source trees off sys.path while pip bootstraps/installs.
  // Some local checkouts contain generated *.egg-info/*.dist-info metadata that
  // pip/importlib.metadata will eagerly parse, which breaks on Python 3.13.
  writePythonRuntimePth(targetDir, { includeVendorPaths: false });

  // Bootstrap pip
  const getPipPath = join(options.cacheDir, 'get-pip.py');
  await ensureCachedDownload(GET_PIP_URL, getPipPath);
  const pythonExe = join(targetDir, 'python.exe');
  run(pythonExe, [getPipPath, '--no-warn-script-location', '-q']);

  return { version: PYTHON_EMBED_VERSION, url: PYTHON_EMBED_URL };
}

function writePythonRuntimePth(targetDir, options = {}) {
  const pthFile = join(targetDir, `python${PYTHON_MAJOR_MINOR}._pth`);
  if (!existsSync(pthFile)) {
    return;
  }

  const pthLines = [`python${PYTHON_MAJOR_MINOR}.zip`, '.', 'Lib/site-packages'];
  if (options.includeVendorPaths) {
    pthLines.push('../../vendor/jiuwenclaw');
  }
  pthLines.push('import site');

  writeFileSync(pthFile, `${pthLines.join('\n')}\n`, 'utf8');
}

function getJiuwenClawProjectDependencies() {
  return readPyprojectDependencies(JIUWENCLAW_PYPROJECT_PATH);
}

function getSharedRuntimeSupplementalDeps() {
  // Some runtime imports are used directly in JiuwenClaw but are not currently
  // declared in vendor/jiuwenclaw/pyproject.toml.
  return ['httpx>=0.27.0'];
}

function uniquePackages(packages) {
  return [...new Set(packages.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
}

function installSharedPythonDeps(bundleDir) {
  const pythonDir = join(bundleDir, 'tools', 'python');
  const pythonExe = join(pythonDir, 'python.exe');
  const uvCommand = findUvCommand();

  // Install the declared JiuwenClaw project dependencies first, then install the local
  // package with --no-deps so packaging stays aligned with pyproject.toml.
  const jiuwenProjectDeps = uniquePackages([
    ...getJiuwenClawProjectDependencies(),
    ...getSharedRuntimeSupplementalDeps(),
  ]);

  const officeDeps = uniquePackages([
    'python-pptx', // PowerPoint read/write
    'openpyxl', // Excel read/write
    'python-docx', // Word read/write
    'requests', // HTTP integrations used by multiple office skills
    'pillow', // Image processing for report/image skills
    'PyYAML', // YAML config parsing for knowledge skills
    'xlsxwriter', // Excel write (fast, chart support)
    'pypdf', // PDF read/merge/split
    'pdfplumber', // PDF text/table extraction
    'pandas', // Tabular extraction and spreadsheet shaping
    'reportlab', // PDF creation
    'markitdown', // Microsoft multi-format → Markdown converter
  ]);

  const sslDeps = uniquePackages([
    'python-certifi-win32', // Windows SSL certificate store integration for tiktoken HTTPS requests
  ]);

  const allExternalDeps = uniquePackages([
    'setuptools',
    'wheel',
    ...jiuwenProjectDeps,
    ...officeDeps,
    ...sslDeps,
  ]);

  if (uvCommand) {
    const t0 = Date.now();
    run(uvCommand, ['pip', 'install', '--python', pythonExe, ...allExternalDeps]);
    process.stdout.write(`  [uv-pip-install] external deps: ${formatDuration(Date.now() - t0)}\n`);

    const t1 = Date.now();
    run(uvCommand, ['pip', 'install', '--python', pythonExe, '--no-deps', JIUWENCLAW_VENDOR_DIR]);
    process.stdout.write(`  [uv-pip-install] jiuwenclaw vendor: ${formatDuration(Date.now() - t1)}\n`);
  } else {
    process.stdout.write('[windows-installer] uv not found, falling back to pip\n');
    run(pythonExe, ['-m', 'pip', 'install', '--no-warn-script-location', 'setuptools', 'wheel']);
    run(pythonExe, ['-m', 'pip', 'install', '--no-warn-script-location', ...jiuwenProjectDeps]);
    run(pythonExe, ['-m', 'pip', 'install', '--no-warn-script-location', '--no-deps', JIUWENCLAW_VENDOR_DIR]);
    run(pythonExe, ['-m', 'pip', 'install', '--no-warn-script-location', ...officeDeps]);
  }

  const sitePackages = join(bundleDir, 'tools', 'python', 'Lib', 'site-packages');
  removeNamedDirectoriesRecursive(sitePackages, ['tests', 'test', '__tests__']);
  walkFiles(sitePackages, (fullPath, entry) => {
    if (entry.name.endsWith('.pyo')) {
      rmSync(fullPath, { force: true });
    }
  });

  writePythonRuntimePth(pythonDir, { includeVendorPaths: true });
}

function stageVendorPythonSources(bundleDir) {
  const excludeDirs = new Set([
    'dist',
    '.venv',
    '.build-venv',
    'tests',
    'test',
    '.git',
    'node_modules',
    'build',
    '.mypy_cache',
    '.pytest_cache',
  ]);
  const excludeFiles = new Set(['uv.lock', 'PKG-INFO', 'METADATA']);

  function copySourceTree(srcDir, destDir) {
    ensureDir(destDir);
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = join(srcDir, entry.name);
      const destPath = join(destDir, entry.name);
      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) continue;
        if (entry.name.endsWith('.egg-info') || entry.name.endsWith('.dist-info')) continue;
        copySourceTree(srcPath, destPath);
      } else {
        if (excludeFiles.has(entry.name)) continue;
        if (entry.name.endsWith('.pyo')) continue;
        // Use copyFileSync instead of cpSync — cpSync fails on non-ASCII filenames on Windows
        copyFileSync(srcPath, destPath);
      }
    }
  }

  const vendorDir = join(bundleDir, 'vendor');
  ensureDir(vendorDir);
  copySourceTree(JIUWENCLAW_VENDOR_DIR, join(vendorDir, 'jiuwenclaw'));
}

function compileVendorPythonSources(bundleDir) {
  const pythonExe = join(bundleDir, 'tools', 'python', 'python.exe');
  if (!existsSync(pythonExe)) {
    throw new Error(`Bundled Python runtime not found for vendor compilation: ${pythonExe}`);
  }

  const vendorRoots = [join(bundleDir, 'vendor', 'jiuwenclaw')];
  const compilerScriptPath = join(bundleDir, 'tools', 'python', 'compile-vendor-python.py');
  const compilerScript = `import compileall
import os
import py_compile
import shutil
import sys

roots = sys.argv[1:]
if not roots:
    raise SystemExit("no vendor roots provided")

for root in roots:
    ok = compileall.compile_dir(
        root,
        force=True,
        quiet=1,
        legacy=True,
        optimize=0,
        invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH,
    )
    if not ok:
        raise SystemExit(f"failed to compile python sources under {root}")

for root in roots:
    for current_root, dirnames, filenames in os.walk(root):
        for filename in filenames:
            if filename.endswith(".py"):
                os.remove(os.path.join(current_root, filename))
        for dirname in list(dirnames):
            if dirname == "__pycache__":
                shutil.rmtree(os.path.join(current_root, dirname), ignore_errors=True)
`;

  writeFileSync(compilerScriptPath, compilerScript, 'utf8');
  try {
    run(pythonExe, [compilerScriptPath, ...vendorRoots]);
  } finally {
    rmSync(compilerScriptPath, { force: true });
  }
}

function stageInstallerSeed(bundleDir) {
  const seedDir = join(bundleDir, 'installer-seed');
  ensureDir(seedDir);
  const catConfigPath = join(repoRoot, 'office-claw-config.json');
  if (existsSync(catConfigPath)) {
    cpSync(catConfigPath, join(seedDir, 'office-claw-config.json'), { force: true });
  }
}

function copyIfPresent(source, destination) {
  if (!existsSync(source)) {
    return;
  }
  ensureDir(dirname(destination));
  cpSync(source, destination, { recursive: true, force: true });
}

function walkFiles(rootDir, visitor) {
  if (!existsSync(rootDir)) {
    return;
  }
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      visitor(fullPath, entry);
    }
  }
}

function removePaths(rootDir, relativePaths) {
  for (const relativePath of relativePaths) {
    rmSync(join(rootDir, relativePath), { recursive: true, force: true });
  }
}

function removeNamedDirectoriesRecursive(rootDir, directoryNames) {
  if (!existsSync(rootDir)) {
    return;
  }
  const names = new Set(directoryNames);
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const fullPath = join(current, entry.name);
      if (names.has(entry.name)) {
        rmSync(fullPath, { recursive: true, force: true });
        continue;
      }
      stack.push(fullPath);
    }
  }
}

function pruneRuntimePackage(targetDir, options = {}) {
  removePaths(targetDir, options.removePaths ?? []);
  removeNamedDirectoriesRecursive(targetDir, ['test', 'tests', '__tests__', 'example', 'examples', 'doc', 'docs']);
  walkFiles(targetDir, (fullPath, entry) => {
    const fileName = entry.name;
    if (fileName === 'package-lock.json' || fileName === '.package-lock.json') {
      rmSync(fullPath, { force: true });
      return;
    }
    if (fileName.endsWith('.d.ts') || fileName.endsWith('.d.ts.map') || fileName.endsWith('.map')) {
      rmSync(fullPath, { force: true });
      return;
    }
    if (fileName.endsWith('.ts') || fileName.endsWith('.cts') || fileName.endsWith('.mts')) {
      rmSync(fullPath, { force: true });
      return;
    }
    if (fileName.endsWith('.md') || fileName.endsWith('.yml') || fileName.endsWith('.yaml')) {
      rmSync(fullPath, { force: true });
      return;
    }
    if (/^(README|CHANGELOG|CONTRIBUTING)(\..+)?$/i.test(fileName)) {
      rmSync(fullPath, { force: true });
      return;
    }
    if (/^\.(eslintrc|prettierrc|editorconfig|babelrc)/i.test(fileName)) {
      rmSync(fullPath, { force: true });
    }
  });
}

function pruneNativePrebuilds(rootDir) {
  if (!existsSync(rootDir)) return;
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = join(current, entry.name);
      if (entry.name === 'prebuilds') {
        for (const platform of readdirSync(fullPath, { withFileTypes: true })) {
          if (!platform.isDirectory()) continue;
          if (!platform.name.startsWith('win32-x64')) {
            rmSync(join(fullPath, platform.name), { recursive: true, force: true });
          }
        }
        continue;
      }
      stack.push(fullPath);
    }
  }
}

function pruneDateFnsLocales(rootDir) {
  const localeDir = join(rootDir, 'date-fns', 'locale');
  if (!existsSync(localeDir)) return;
  const keepPrefixes = ['en-US', 'zh-CN', '_lib', 'types', 'cdn'];
  for (const entry of readdirSync(localeDir, { withFileTypes: true })) {
    const name = entry.name.replace(/\.(js|cjs|mjs)$/, '');
    if (keepPrefixes.some((p) => name === p)) continue;
    rmSync(join(localeDir, entry.name), { recursive: true, force: true });
  }
}

function resolveInstalledPackageVersion(nodeModulesDir, packageName) {
  const packageJsonPath = join(nodeModulesDir, packageName, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return null;
  }
  const installed = readJson(packageJsonPath);
  return typeof installed.version === 'string' && installed.version.trim().length > 0 ? installed.version.trim() : null;
}

function resolveInstalledPackageVersionFrom(nodeModulesDirs, packageName) {
  for (const nodeModulesDir of nodeModulesDirs) {
    const installedVersion = resolveInstalledPackageVersion(nodeModulesDir, packageName);
    if (installedVersion) {
      return installedVersion;
    }
  }
  return null;
}

function pinRuntimeDependencyVersions(sourceDir, dependencies, overrides = {}) {
  const nodeModulesDirs = [join(sourceDir, 'node_modules'), ROOT_NODE_MODULES_DIR];
  return Object.fromEntries(
    Object.entries(dependencies).map(([dependency, specifier]) => {
      if (overrides[dependency]) {
        return [dependency, overrides[dependency]];
      }
      const installedVersion = resolveInstalledPackageVersionFrom(nodeModulesDirs, dependency);
      return [dependency, installedVersion ?? specifier];
    }),
  );
}

export function createRuntimePackageJson(sourcePath, options = {}) {
  const source = readJson(sourcePath);
  const sourceDir = dirname(sourcePath);
  const runtimePackage = {
    name: source.name,
    version: source.version,
    private: source.private ?? true,
  };

  for (const key of ['type', 'main', 'bin', 'exports', 'types']) {
    if (source[key] !== undefined) {
      runtimePackage[key] = source[key];
    }
  }

  if (options.scripts) {
    runtimePackage.scripts = options.scripts;
  } else if (source.scripts?.start) {
    runtimePackage.scripts = { start: source.scripts.start };
  }

  const dependencies = pinRuntimeDependencyVersions(
    sourceDir,
    source.dependencies ?? {},
    options.dependencyOverrides ?? {
      '@openjiuwen/relay-shared': 'file:../shared',
    },
  );
  if (Object.keys(dependencies).length > 0) {
    runtimePackage.dependencies = dependencies;
  }

  const optionalDependencies = pinRuntimeDependencyVersions(sourceDir, source.optionalDependencies ?? {});
  if (Object.keys(optionalDependencies).length > 0) {
    runtimePackage.optionalDependencies = optionalDependencies;
  }

  return runtimePackage;
}

function createBundledApiRuntimePackageJson(sourcePath) {
  const source = readJson(sourcePath);
  const sourceDir = dirname(sourcePath);
  const runtimePackage = createRuntimePackageJson(sourcePath, {
    scripts: {
      start: 'node dist/cli.js',
    },
  });
  const nodeModulesDirs = [join(sourceDir, 'node_modules'), ROOT_NODE_MODULES_DIR];
  const runtimeDependencies = Object.fromEntries(
    API_RUNTIME_EXTERNAL_DEPENDENCIES.flatMap((dependency) => {
      const installedVersion = resolveInstalledPackageVersionFrom(nodeModulesDirs, dependency);
      if (installedVersion) {
        return [[dependency, installedVersion]];
      }
      const sourceVersion = source.dependencies?.[dependency];
      return sourceVersion ? [[dependency, sourceVersion]] : [];
    }),
  );
  if (Object.keys(runtimeDependencies).length > 0) {
    runtimePackage.dependencies = {
      ...runtimeDependencies,
      ...API_RUNTIME_WORKSPACE_DEPENDENCIES,
    };
  } else {
    runtimePackage.dependencies = { ...API_RUNTIME_WORKSPACE_DEPENDENCIES };
  }
  delete runtimePackage.optionalDependencies;
  return runtimePackage;
}

function stageRuntimePackageTemplate(targetRootDir, packageName, config) {
  const sourceDir = join(repoRoot, 'packages', packageName);
  const targetDir = join(targetRootDir, 'packages', packageName);
  resetDir(targetDir);
  for (const relativePath of config.copyPaths) {
    copyIfPresent(join(sourceDir, relativePath), join(targetDir, relativePath));
  }
  writeJson(join(targetDir, 'package.json'), createRuntimePackageJson(join(sourceDir, 'package.json'), config));
  if (config.writeFiles) {
    for (const [relativePath, content] of Object.entries(config.writeFiles)) {
      writeFileSync(join(targetDir, relativePath), content, 'utf8');
    }
  }
  pruneRuntimePackage(targetDir, { removePaths: config.removePaths ?? [] });
}

function stageRuntimePackageFromSource(targetRootDir, sourceSegments, targetSegments, config = {}) {
  const sourceDir = join(repoRoot, 'packages', ...sourceSegments);
  const targetDir = join(targetRootDir, 'packages', ...targetSegments);
  resetDir(targetDir);
  for (const relativePath of config.copyPaths ?? ['dist']) {
    copyIfPresent(join(sourceDir, relativePath), join(targetDir, relativePath));
  }
  writeJson(
    join(targetDir, 'package.json'),
    createRuntimePackageJson(join(sourceDir, 'package.json'), {
      dependencyOverrides: config.dependencyOverrides ?? RUNTIME_WORKSPACE_DEPENDENCIES,
      scripts: config.scripts,
    }),
  );
  pruneRuntimePackage(targetDir, { removePaths: config.removePaths ?? ['src', 'test', 'tsconfig.json'] });
}

async function stageBundledApiRuntime(targetRootDir) {
  const sourceDir = join(repoRoot, 'packages', 'api');
  const sourceEntry = join(sourceDir, 'dist', 'index.js');
  const targetDir = join(targetRootDir, 'packages', 'api');
  if (!existsSync(sourceEntry)) {
    throw new Error(`Missing API build artifact for bundling: ${sourceEntry}`);
  }

  resetDir(targetDir);
  ensureDir(join(targetDir, 'dist'));
  copyIfPresent(join(sourceDir, 'assets'), join(targetDir, 'assets'));

  try {
    const esbuildCommand = resolveLocalEsbuildCommand();
    const banner = [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { dirname as __pathDirname } from 'node:path';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __pathDirname(__filename);',
    ].join(' ');
    run(esbuildCommand, [
      sourceEntry,
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--target=node20',
      `--outfile=${join(targetDir, 'dist', 'index.js')}`,
      `--banner:js=${banner}`,
      '--minify',
      '--log-level=error',
      ...API_RUNTIME_EXTERNAL_DEPENDENCIES.map((dependency) => `--external:${dependency}`),
    ]);

    writeFileSync(
      join(targetDir, 'dist', 'cli.js'),
      [
        '#!/usr/bin/env node',
        "import { main } from './index.js';",
        '',
        'main().catch((err) => {',
        "  console.error('[api] Fatal error:', err);",
        '  process.exit(1);',
        '});',
        '',
      ].join('\n'),
      'utf8',
    );

    writeJson(join(targetDir, 'package.json'), createBundledApiRuntimePackageJson(join(sourceDir, 'package.json')));
  } catch (error) {
    logStep(
      `API bundling unavailable, falling back to staged dist (${error instanceof Error ? error.message : String(error)})`,
    );
    copyIfPresent(join(sourceDir, 'dist'), join(targetDir, 'dist'));
    writeJson(
      join(targetDir, 'package.json'),
      createRuntimePackageJson(join(sourceDir, 'package.json'), {
        scripts: {
          start: 'node dist/cli.js',
        },
        dependencyOverrides: API_RUNTIME_WORKSPACE_DEPENDENCIES,
      }),
    );
  }
  pruneRuntimePackage(targetDir, { removePaths: ['src', 'test', 'scripts', 'uploads', 'tsconfig.json'] });
}

function getWindowsTempPath() {
  return runAndCapture('powershell.exe', ['-NoProfile', '-Command', '[IO.Path]::GetTempPath()']);
}

function ensureWindowsBuildNode(options) {
  const windowsTemp = getWindowsTempPath();
  const windowsNodeDir = win32.join(windowsTemp, `clowder-node-${options.nodeVersion}`);
  const windowsNodeWslDir = toWslPath(windowsNodeDir);
  const nodeRootName = `node-${options.nodeVersion}-win-x64`;
  const npmCmdPath = win32.join(windowsNodeDir, nodeRootName, 'npm.cmd');
  const npxCmdPath = win32.join(windowsNodeDir, nodeRootName, 'npx.cmd');
  if (!existsSync(toWslPath(npmCmdPath))) {
    resetDir(windowsNodeWslDir);
    const archivePath = join(options.cacheDir, `node-${options.nodeVersion}-win-x64.zip`);
    extractZip(archivePath, windowsNodeWslDir);
  }
  return {
    windowsNodeDir,
    npmCmdPath,
    npxCmdPath,
  };
}

function runWindowsNpmInstall(npmCmdPath, packageWindowsDir) {
  run(npmCmdPath, WINDOWS_RUNTIME_NPM_ARGS, {
    cwd: packageWindowsDir,
    shell: true,
    env: {
      // Runtime packaging does not need Puppeteer's postinstall browser download.
      PUPPETEER_SKIP_DOWNLOAD: '1',
    },
  });
}

function getOfficeSkillPackageDirs(skillsRoot) {
  if (!existsSync(skillsRoot)) {
    return [];
  }
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsRoot, entry.name))
    .filter((skillDir) => existsSync(join(skillDir, 'package.json')));
}

function readSkillPackageJson(skillDir) {
  return readJson(join(skillDir, 'package.json'));
}

function hasPlaywrightDependency(pkg) {
  return [pkg.dependencies, pkg.optionalDependencies, pkg.devDependencies].some(
    (group) => typeof group?.playwright === 'string',
  );
}

function getPlaywrightVersion(skillDir) {
  const pkg = readJson(join(skillDir, 'package.json'));
  const playwrightDep = pkg.dependencies?.playwright 
    || pkg.optionalDependencies?.playwright 
    || pkg.devDependencies?.playwright;
  
  if (!playwrightDep) return null;
  
  return playwrightDep.replace(/^[^0d]/, '');
}

function installBundledOfficeSkillDependencies(bundleDir, windowsNode) {
  const skillsRoot = join(bundleDir, 'office-claw-skills');
  const skillPackageDirs = getOfficeSkillPackageDirs(skillsRoot);
  let playwrightPackageDir = null;

  for (const skillDir of skillPackageDirs) {
    runWindowsNpmInstall(windowsNode.npmCmdPath, toWindowsPath(skillDir));
    rmSync(join(skillDir, 'package-lock.json'), { force: true });
    const nmDir = join(skillDir, 'node_modules');
    pruneNativePrebuilds(nmDir);
    pruneDateFnsLocales(nmDir);

    const pkg = readSkillPackageJson(skillDir);
    if (!playwrightPackageDir && hasPlaywrightDependency(pkg)) {
      playwrightPackageDir = skillDir;
    }
  }

  if (playwrightPackageDir) {
    const playwrightBrowsersPath = join(skillsRoot, '.playwright-browsers');
    ensureDir(playwrightBrowsersPath);

    const playwrightVersion = getPlaywrightVersion(playwrightPackageDir);
    const cacheBaseDir = process.env.PLAYWRIGHT_BROWSERS_CACHE_DIR 
      || join(homedir(), '.cache');
    const cacheDir = playwrightVersion 
      ? join(cacheBaseDir, `playwright-browsers-win64-${playwrightVersion}`)
      : join(cacheBaseDir, 'playwright-browsers-win64');

    const cacheExists = existsSync(cacheDir);
    if (cacheExists) {
      process.stdout.write(`  [playwright] Using cached browsers (v${playwrightVersion || 'unknown'})...\n`);
      cpSync(cacheDir, playwrightBrowsersPath, { recursive: true });
    } else {
      run(windowsNode.npxCmdPath, ['playwright', 'install', 'chromium'], {
        cwd: toWindowsPath(playwrightPackageDir),
        shell: true,
        env: {
          PLAYWRIGHT_BROWSERS_PATH: toWindowsPath(playwrightBrowsersPath),
        },
      });
      process.stdout.write(`  [playwright] Caching browsers (v${playwrightVersion || 'unknown'}) for future builds...\n`);
      ensureDir(dirname(cacheDir));
      cpSync(playwrightBrowsersPath, cacheDir, { recursive: true });
    }
  }
}

function materializeWorkspaceDependencies(stagePackagesDir, packageName) {
  const workspacePackageScopes = [
    [
      '@office-claw',
      [
        ['shared', join(stagePackagesDir, 'shared')],
        ['core', join(stagePackagesDir, 'core')],
        ['plugin-api', join(stagePackagesDir, 'plugin', 'api')],
        ['sqlite-adapter', join(stagePackagesDir, 'sqlite-adapter', 'api')],
      ],
    ],
    [
      '@openjiuwen',
      [
        ['relay-shared', join(stagePackagesDir, 'shared')],
        ['relay-core', join(stagePackagesDir, 'core')],
        ['relay-api-server-contracts', join(stagePackagesDir, 'plugin', 'api')],
        ['relay-storage-sqlite', join(stagePackagesDir, 'sqlite-adapter', 'api')],
      ],
    ],
  ];

  for (const [scopeName, workspacePackages] of workspacePackageScopes) {
    const scopedModulesDir = join(stagePackagesDir, packageName, 'node_modules', scopeName);
    try {
      if (!lstatSync(scopedModulesDir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const [dependencyName, sourceDir] of workspacePackages) {
      const linkPath = join(scopedModulesDir, dependencyName);
      try {
        if (!lstatSync(linkPath).isSymbolicLink()) continue;
      } catch {
        continue;
      }
      rmSync(linkPath, { recursive: true, force: true });
      cpSync(sourceDir, linkPath, { recursive: true, force: true });
      pruneRuntimePackage(linkPath);
    }
  }
}

async function installWindowsRuntimeDependencies(bundleDir, options) {
  const bundlePackagesDir = join(bundleDir, 'packages');
  const windowsNode = ensureWindowsBuildNode(options);

  for (const packageName of WINDOWS_RUNTIME_PACKAGE_DIRS) {
    const t0 = Date.now();
    runWindowsNpmInstall(windowsNode.npmCmdPath, toWindowsPath(join(bundlePackagesDir, packageName)));
    process.stdout.write(`  [npm-install] ${packageName}: ${formatDuration(Date.now() - t0)}\n`);
    materializeWorkspaceDependencies(bundlePackagesDir, packageName);
    pruneRuntimePackage(join(bundlePackagesDir, packageName));
    const nmDir = join(bundlePackagesDir, packageName, 'node_modules');
    pruneNativePrebuilds(nmDir);
    pruneDateFnsLocales(nmDir);
  }

  const t0 = Date.now();
  installBundledOfficeSkillDependencies(bundleDir, windowsNode);
  process.stdout.write(`  [npm-install] office-claw-skills: ${formatDuration(Date.now() - t0)}\n`);
}

async function minifyJsFilesInPlace(targetDir) {
  const esbuildCommand = resolveLocalEsbuildCommand();
  walkFiles(targetDir, (fullPath, entry) => {
    if (!entry.name.endsWith('.js')) return;
    const tempOut = `${fullPath}.min`;
    try {
      run(esbuildCommand, [
        fullPath,
        '--minify',
        '--platform=node',
        '--format=esm',
        '--target=node20',
        `--outfile=${tempOut}`,
        '--log-level=error',
      ]);
      rmSync(fullPath, { force: true });
      cpSync(tempOut, fullPath, { force: true });
      rmSync(tempOut, { force: true });
    } catch (error) {
      // If minify fails, keep original file
      rmSync(tempOut, { force: true });
    }
  });
}

async function stageBundledMcpServerRuntime(targetRootDir) {
  const sourceDir = join(repoRoot, 'packages', 'mcp-server');
  const sourceEntry = join(sourceDir, 'dist', 'index.js');
  const targetDir = join(targetRootDir, 'packages', 'mcp-server');
  if (!existsSync(sourceEntry)) {
    throw new Error(`Missing mcp-server build artifact for bundling: ${sourceEntry}`);
  }

  resetDir(targetDir);
  ensureDir(join(targetDir, 'dist'));

  try {
    const esbuildCommand = resolveLocalEsbuildCommand();
    const banner = [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { dirname as __pathDirname } from 'node:path';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __pathDirname(__filename);',
    ].join(' ');
    run(esbuildCommand, [
      sourceEntry,
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--target=node20',
      `--outfile=${join(targetDir, 'dist', 'index.js')}`,
      `--banner:js=${banner}`,
      '--minify',
      '--log-level=error',
      '--external:@openjiuwen/relay-shared',
      '--external:@modelcontextprotocol/sdk',
      '--external:zod',
    ]);

    writeJson(
      join(targetDir, 'package.json'),
      createRuntimePackageJson(join(sourceDir, 'package.json'), {
        scripts: {
          start: 'node dist/index.js',
        },
      }),
    );
  } catch (error) {
    logStep(
      `mcp-server bundling unavailable, falling back to staged dist (${error instanceof Error ? error.message : String(error)})`,
    );
    copyIfPresent(join(sourceDir, 'dist'), join(targetDir, 'dist'));
    writeJson(
      join(targetDir, 'package.json'),
      createRuntimePackageJson(join(sourceDir, 'package.json'), {
        scripts: {
          start: 'node dist/index.js',
        },
      }),
    );
  }
  pruneRuntimePackage(targetDir, { removePaths: ['src', 'test', 'tsconfig.json'] });
}

async function stageWorkspacePackages(targetRootDir) {
  stageRuntimePackageTemplate(targetRootDir, 'shared', {
    copyPaths: ['dist'],
    removePaths: ['tsconfig.json'],
  });
  stageRuntimePackageFromSource(targetRootDir, ['core'], ['core'], {
    dependencyOverrides: {
      '@openjiuwen/relay-shared': 'file:../shared',
    },
  });
  stageRuntimePackageFromSource(targetRootDir, ['plugin', 'api'], ['plugin', 'api']);
  stageRuntimePackageFromSource(targetRootDir, ['sqlite-adapter', 'api'], ['sqlite-adapter', 'api'], {
    dependencyOverrides: {
      '@openjiuwen/relay-api-server-contracts': 'file:../../plugin/api',
    },
  });

  // Minify all JS files in shared package
  const sharedDistDir = join(targetRootDir, 'packages', 'shared', 'dist');
  if (existsSync(sharedDistDir)) {
    await minifyJsFilesInPlace(sharedDistDir);
  }

  await stageBundledApiRuntime(targetRootDir);
  await stageBundledMcpServerRuntime(targetRootDir);
}

function stripLeadingDirectory(targetDir, predicate) {
  const matches = [];
  const stack = [targetDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      }
      if (predicate(fullPath, entry)) {
        matches.push(fullPath);
      }
    }
  }
  if (matches.length === 0) {
    throw new Error(`Could not find expected payload in ${targetDir}`);
  }
  return matches[0];
}

async function downloadFile(url, destination) {
  const tempDestination = `${destination}.partial`;
  rmSync(tempDestination, { force: true });
  const response = await fetch(url, {
    headers: {
      'user-agent': 'office-claw-windows-installer-builder',
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      accept: 'application/octet-stream, application/json',
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${url}: ${response.status} ${response.statusText}`);
  }
  ensureDir(dirname(destination));
  try {
    await pipeline(response.body, createWriteStream(tempDestination));
    rmSync(destination, { force: true });
    renameSync(tempDestination, destination);
  } catch (error) {
    rmSync(tempDestination, { force: true });
    throw error;
  }
}

function tryParseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function resolveArchiveOverride(source, fallbackName) {
  const parsed = tryParseUrl(source);
  if (parsed?.protocol === 'http:' || parsed?.protocol === 'https:') {
    return {
      archiveName: basename(parsed.pathname) || fallbackName,
      url: parsed.toString(),
    };
  }

  const localPath = parsed?.protocol === 'file:' ? fileURLToPath(parsed) : resolve(process.cwd(), source);
  if (!existsSync(localPath)) {
    throw new Error(`Archive override not found: ${localPath}`);
  }

  return {
    archiveName: basename(localPath) || fallbackName,
    localPath,
  };
}

function isValidZipArchive(archivePath) {
  let fd;
  try {
    fd = openSync(archivePath, 'r');
    const stat = fstatSync(fd);
    if (stat.size < 22) {
      return false;
    }
    const tailLength = Math.min(65557, stat.size);
    const buffer = Buffer.alloc(tailLength);
    readSync(fd, buffer, 0, tailLength, stat.size - tailLength);
    return buffer.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      closeSync(fd);
    }
  }
}

function findCachedRedisZip(cacheDir) {
  const patterns = [
    /^(Redis-(.+)-Windows-x64-msys2\.zip)$/i,
    /^(Redis-(.+)-Windows-x64-cygwin\.zip)$/i,
    /^(Redis-(.+)-Windows-x64-msys2-with-Service\.zip)$/i,
    /^(Redis-(.+)-Windows-x64-cygwin-with-Service\.zip)$/i,
  ];
  if (!existsSync(cacheDir)) {
    return null;
  }
  const entries = readdirSync(cacheDir);
  for (const pattern of patterns) {
    for (const entry of entries) {
      const match = pattern.exec(entry);
      if (match && isValidZipArchive(join(cacheDir, entry))) {
        return {
          version: match[2],
          url: `file://${join(cacheDir, entry).replace(/\\/g, '/')}`,
          archiveName: match[1],
          metadataSource: 'local-cache',
        };
      }
    }
  }
  return null;
}

async function ensureCachedDownload(url, destination) {
  if (existsSync(destination)) {
    if (destination.toLowerCase().endsWith('.zip') && !isValidZipArchive(destination)) {
      rmSync(destination, { force: true });
    } else {
      return destination;
    }
  }
  await downloadFile(url, destination);
  if (destination.toLowerCase().endsWith('.zip') && !isValidZipArchive(destination)) {
    rmSync(destination, { force: true });
    throw new Error(`Downloaded archive is not a valid zip: ${destination}`);
  }
  return destination;
}

function extractZip(archivePath, destination) {
  if (archivePath.toLowerCase().endsWith('.zip') && !isValidZipArchive(archivePath)) {
    throw new Error(`Zip archive is corrupt or incomplete: ${archivePath}`);
  }
  resetDir(destination);
  const runners = [];
  const usablePython = findUsablePython();
  if (usablePython) {
    const pythonExtractArgs = [
      '-c',
      'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',
      archivePath,
      destination,
    ];
    if (usablePython.isPy) {
      runners.push([usablePython.command, ['-3', ...pythonExtractArgs]]);
    } else {
      runners.push([usablePython.command, pythonExtractArgs]);
    }
  }
  if (process.platform === 'win32' && commandExists('powershell')) {
    runners.push([
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`,
      ],
    ]);
  }
  if (process.platform === 'win32') {
    const where = spawnSync('where', ['tar'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (where.status === 0 && where.stdout) {
      for (const tarPath of where.stdout.split(/\r?\n/).filter(Boolean)) {
        runners.push([tarPath.trim(), ['-xf', archivePath, '-C', destination]]);
      }
    }
  }
  let lastError = null;
  for (const [command, args] of runners) {
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.status === 0) {
      return;
    }
    lastError = new Error(`${command} failed extracting ${archivePath}`);
  }
  throw lastError ?? new Error(`No supported zip extractor found for ${archivePath}`);
}

function extract7zArchive(archivePath, destination, sevenZipExePath = null) {
  resetDir(destination);
  if (sevenZipExePath) {
    run(sevenZipExePath, ['x', archivePath, `-o${destination}`, '-y'], { shell: false });
    return;
  }
  run('tar', ['-xf', archivePath, '-C', destination]);
}

async function stageWindowsNode(bundleDir, options) {
  const nodeUrl =
    options.nodeZipUrl ?? `https://nodejs.org/dist/${options.nodeVersion}/node-${options.nodeVersion}-win-x64.zip`;
  const archiveName = basename(new URL(nodeUrl).pathname);
  const archivePath = join(options.cacheDir, archiveName);
  await ensureCachedDownload(nodeUrl, archivePath);

  const tempExtract = join(options.cacheDir, 'extract-node');
  extractZip(archivePath, tempExtract);
  const nodeRoot = dirname(
    stripLeadingDirectory(tempExtract, (_fullPath, entry) => entry.isFile() && entry.name.toLowerCase() === 'node.exe'),
  );
  const targetDir = join(bundleDir, 'tools', 'node');
  resetDir(targetDir);
  cpSync(nodeRoot, targetDir, { recursive: true, force: true });
  // Keep node_modules (contains npm and its dependencies, needed for runtime skill installation)
  removePaths(targetDir, ['corepack', 'include', 'share']);
  walkFiles(targetDir, (fullPath, entry) => {
    if (entry.name.endsWith('.map') || entry.name.endsWith('.md')) {
      rmSync(fullPath, { force: true });
    }
  });
  return { version: options.nodeVersion, url: nodeUrl, archiveName };
}

async function resolveRedisDownload(options) {
  if (options.redisZipUrl) {
    const override = resolveArchiveOverride(options.redisZipUrl, 'redis-windows.zip');
    return {
      version: 'manual-override',
      archiveName: override.archiveName,
      metadataSource: override.localPath ? 'manual-override-file' : 'manual-override',
      ...(override.localPath ? { localPath: override.localPath } : { url: override.url }),
    };
  }
  // Check for cached Redis zip before hitting GitHub API
  if (options.cacheDir && existsSync(options.cacheDir)) {
    const cachedRedis = findCachedRedisZip(options.cacheDir);
    if (cachedRedis) {
      logStep(`Using cached Redis: ${cachedRedis.archiveName} (skipping GitHub API)`);
      return cachedRedis;
    }
  }
  let response;
  try {
    response = await fetch(options.redisReleaseApi, {
      headers: {
        'user-agent': 'office-claw-windows-installer-builder',
        ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        accept: 'application/vnd.github+json',
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Redis release metadata request failed: ${detail}. If GitHub API is unreachable, rerun with --redis-zip-url <url-or-local-zip> or set CLOWDER_WINDOWS_REDIS_ZIP_URL.`,
    );
  }
  if (!response.ok) {
    throw new Error(`Redis release metadata request failed: ${response.status} ${response.statusText}`);
  }
  const release = await response.json();
  const asset = pickRedisReleaseAsset(release.assets ?? []);
  if (!asset?.browser_download_url) {
    throw new Error(`No Windows Redis zip asset found in ${options.redisReleaseApi}`);
  }
  return {
    version: release.tag_name ?? 'latest',
    url: asset.browser_download_url,
    archiveName: asset.name ?? basename(new URL(asset.browser_download_url).pathname),
    metadataSource: options.redisReleaseApi,
  };
}

async function stageWindowsRedis(bundleDir, options) {
  const download = await resolveRedisDownload(options);
  const archivePath = join(options.cacheDir, download.archiveName);
  if (download.localPath) {
    ensureDir(dirname(archivePath));
    if (resolve(download.localPath) !== resolve(archivePath)) {
      copyFileSync(download.localPath, archivePath);
    }
    if (!isValidZipArchive(archivePath)) {
      throw new Error(`Redis archive override is not a valid zip: ${archivePath}`);
    }
  } else {
    await ensureCachedDownload(download.url, archivePath);
  }

  const tempExtract = join(options.cacheDir, 'extract-redis');
  extractZip(archivePath, tempExtract);
  const redisRoot = dirname(
    stripLeadingDirectory(
      tempExtract,
      (_fullPath, entry) => entry.isFile() && entry.name.toLowerCase() === 'redis-server.exe',
    ),
  );

  const redisLayout = join(bundleDir, '.office-claw', 'redis', 'windows');
  const currentDir = join(redisLayout, 'current');
  resetDir(currentDir);
  cpSync(redisRoot, currentDir, { recursive: true, force: true });
  ensureDir(join(redisLayout, 'data'));
  ensureDir(join(redisLayout, 'logs'));
  writeFileSync(join(redisLayout, 'current-release.txt'), `${download.version}\n`, 'utf8');
  return download;
}

function writeReleaseMetadata(bundleDir, metadata) {
  const targetPath = join(bundleDir, '.office-claw-release.json');
  const tempPath = `${targetPath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  rmSync(targetPath, { force: true });
  cpSync(tempPath, targetPath, { force: true });
  rmSync(tempPath, { force: true });
}

function ensureRuntimeSkeleton(bundleDir) {
  ensureDir(join(bundleDir, 'data'));
  ensureDir(join(bundleDir, 'logs'));
  ensureDir(join(bundleDir, '.office-claw'));
  ensureDir(join(bundleDir, 'tools', 'webview2'));
}

async function stageWebView2Installer(bundleDir, options) {
  const webview2Dir = join(bundleDir, 'tools', 'webview2');
  const installerPath = join(webview2Dir, 'MicrosoftEdgeWebview2Setup.exe');

  if (existsSync(installerPath)) {
    logStep('WebView2 installer already exists, skipping download');
    return;
  }

  logStep('Downloading WebView2 Bootstrapper...');
  const archiveName = 'MicrosoftEdgeWebview2Setup.exe';
  const archivePath = join(options.cacheDir, archiveName);
  await ensureCachedDownload(WEBVIEW2_BOOTSTRAPPER_URL, archivePath);

  cpSync(archivePath, installerPath, { force: true });
  logStep('WebView2 Bootstrapper downloaded');
}

async function stageVcRedistInstaller(bundleDir, options) {
  const vcDir = join(bundleDir, 'tools', 'vc-redist');
  ensureDir(vcDir);
  const installerPath = join(vcDir, 'vc_redist.x64.exe');

  if (existsSync(installerPath)) {
    logStep('VC++ Redist installer already exists, skipping download');
    return;
  }

  logStep('Downloading VC++ Redistributable (x64)...');
  const archiveName = 'vc_redist.x64.exe';
  const archivePath = join(options.cacheDir, archiveName);
  await ensureCachedDownload(VC_REDIST_X64_URL, archivePath);

  cpSync(archivePath, installerPath, { force: true });
  logStep('VC++ Redistributable downloaded');
}

async function stageSevenZipExe(options) {
  const extraArchiveName = `7z${SEVENZIP_VERSION.replace('.', '')}-extra.7z`;
  const extraArchivePath = join(options.cacheDir, extraArchiveName);
  await ensureCachedDownload(SEVENZIP_EXTRA_URL, extraArchivePath);
  const sevenZipExtractor = process.platform === 'win32' ? join(options.cacheDir, '7zr.exe') : null;
  if (sevenZipExtractor) {
    await ensureCachedDownload(SEVENZIP_BOOTSTRAP_URL, sevenZipExtractor);
  }

  const tempExtractDir = join(options.cacheDir, 'extract-7z-extra');
  extract7zArchive(extraArchivePath, tempExtractDir, sevenZipExtractor);

  // Use x64 version for better multi-threading performance
  const sevenZipExePath = join(tempExtractDir, 'x64', '7za.exe');
  if (!existsSync(sevenZipExePath)) {
    throw new Error(`7za.exe (x64) not found in 7z-extra archive at ${sevenZipExePath}`);
  }

  const targetPath = join(options.outputDir, '7za.exe');
  cpSync(sevenZipExePath, targetPath, { force: true });

  return { version: SEVENZIP_VERSION, path: targetPath };
}

function createPayload7z(bundleDir, sevenZipExePath, outputPath) {
  rmSync(outputPath, { force: true });

  // mx=5 压缩级别，mmt=on 启用多线程压缩/解压
  run(sevenZipExePath, ['a', '-t7z', '-mx=5', '-m0=lzma2', '-mmt=on', outputPath, join(bundleDir, '*')]);

  if (!existsSync(outputPath)) {
    throw new Error(`Failed to create payload.7z: ${outputPath}`);
  }
}

function computeMaxRelativePathLength(bundleDir) {
  let maxLength = 0;
  const stack = [bundleDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      const relativePath = relative(bundleDir, fullPath).replaceAll('/', '\\');
      if (relativePath.length > maxLength) {
        maxLength = relativePath.length;
      }
    }
  }
  return maxLength;
}

function ensureBuildArtifacts(options) {
  if (options.skipBuild) {
    return;
  }
  logStep('Building shared, mcp-server, and api');
  run('pnpm', ['--filter', '@openjiuwen/relay-shared', 'run', 'build']);
  run('pnpm', ['--filter', '@openjiuwen/relay-mcp-server', 'run', 'build']);
  run('pnpm', ['--filter', '@openjiuwen/relay-api-server', 'run', 'build']);
}

function buildWindowsDesktopLauncher(bundleDir, options) {
  const launcherScript = join(repoRoot, 'scripts', 'build-windows-webview2-launcher.ps1');
  const launcherSource = join(repoRoot, 'packaging', 'windows', 'desktop', 'OfficeClawDesktop.cs');
  const launcherIconPath = join(repoRoot, 'packaging', 'windows', 'assets', 'app.ico');
  if (!existsSync(launcherScript) || !existsSync(launcherSource)) {
    throw new Error('Missing WebView2 launcher build assets');
  }
  if (!commandExists('powershell.exe')) {
    throw new Error('powershell.exe is required to build the Windows WebView2 launcher');
  }

  run('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    toWindowsPath(launcherScript),
    '-SourceFile',
    toWindowsPath(launcherSource),
    '-OutputDir',
    toWindowsPath(bundleDir),
    '-CacheDir',
    toWindowsPath(options.cacheDir),
    '-WebView2Version',
    options.webview2Version,
    ...(existsSync(launcherIconPath) ? ['-IconFile', toWindowsPath(launcherIconPath)] : []),
  ]);
}

function buildInstallerOutputPath(outputDir, version) {
  return join(outputDir, `OfficeClaw-${version}-windows-x64-setup.exe`);
}

function createPayloadTar(bundleDir, tarPath) {
  rmSync(tarPath, { force: true });
  const tarExe =
    process.platform === 'win32' ? join(process.env.SYSTEMROOT ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  run(tarExe, ['-czf', tarPath, '-C', bundleDir, '.']);
  if (!existsSync(tarPath)) {
    throw new Error(`Failed to create payload archive: ${tarPath}`);
  }
}

function findMakensis() {
  const envPath = process.env.MAKENSIS_PATH;
  if (envPath && commandExists(envPath)) return envPath;
  if (commandExists('makensis')) return 'makensis';
  if (process.platform === 'win32') {
    const candidates = [
      join(process.env.ProgramFiles ?? '', 'NSIS', 'makensis.exe'),
      join(process.env['ProgramFiles(x86)'] ?? '', 'NSIS', 'makensis.exe'),
    ];
    for (const candidate of candidates) {
      if (candidate && existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function invokeMakensis(installerScript, outputExe, payload7z, sevenZipExe, version) {
  const makensisCommand = findMakensis();
  if (!makensisCommand) {
    throw new Error('makensis not found on PATH or in Program Files. Install NSIS or run with --bundle-only.');
  }
  const definePrefix = process.platform === 'win32' ? '/D' : '-D';
  run(makensisCommand, [
    `${definePrefix}APP_VERSION=${version}`,
    `${definePrefix}PAYLOAD_7Z="${toNsisFilePath(payload7z)}"`,
    `${definePrefix}SEVENZIP_EXE="${toNsisFilePath(sevenZipExe)}"`,
    `${definePrefix}OUTPUT_EXE="${toNsisFilePath(outputExe)}"`,
    `"${toNsisFilePath(installerScript)}"`,
  ]);
}

function stageWindowsDesktopAssets(bundleDir) {
  logStep('Staging desktop assets');
  const assetsSource = join(repoRoot, 'packaging', 'windows', 'assets');
  if (existsSync(assetsSource)) {
    cpSync(assetsSource, join(bundleDir, 'assets'), { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const bundleDir = join(options.outputDir, 'bundle');
  const installerScript = join(repoRoot, 'packaging', 'windows', 'installer.nsi');
  const outputExe = buildInstallerOutputPath(options.outputDir, packageJson.version);
  const signingConfig = resolveWindowsSigningConfig();
  const launcherExe = join(bundleDir, 'OfficeClaw.exe');

  ensureDir(options.outputDir);
  ensureDir(options.cacheDir);

  // --nsis-only: repackage existing bundle into exe without rebuilding
  if (options.nsisOnly) {
    if (!existsSync(bundleDir)) {
      throw new Error(`Bundle not found at ${bundleDir}. Run without --nsis-only first.`);
    }
    if (!findMakensis()) {
      throw new Error('makensis not found. Install NSIS (https://nsis.sourceforge.io) or set MAKENSIS_PATH.');
    }
    const sevenZip = await stageSevenZipExe(options);
    logStep('Creating payload archive (7z format)');
    const payload7z = join(options.outputDir, 'payload.7z');
    signWindowsExecutable(launcherExe, 'OfficeClaw.exe', signingConfig);
    verifyWindowsSignature(launcherExe, 'OfficeClaw.exe', signingConfig);
    createPayload7z(bundleDir, sevenZip.path, payload7z);
    logStep('Compiling NSIS installer');
    invokeMakensis(installerScript, outputExe, payload7z, sevenZip.path, packageJson.version);
    signWindowsExecutable(outputExe, 'Windows installer', signingConfig);
    verifyWindowsSignature(outputExe, 'Windows installer', signingConfig);
    endCurrentStep();
    process.stdout.write(`\n[windows-installer] Installer ready at ${outputExe}\n`);
    printTimingSummary();
    return;
  }

  // --launcher-only: rebuild C# launcher into existing bundle
  if (options.launcherOnly) {
    if (!existsSync(bundleDir)) {
      throw new Error(`Bundle not found at ${bundleDir}. Run without --launcher-only first.`);
    }
    logStep('Building WebView2 desktop launcher');
    buildWindowsDesktopLauncher(bundleDir, options);
    signWindowsExecutable(launcherExe, 'OfficeClaw.exe', signingConfig);
    verifyWindowsSignature(launcherExe, 'OfficeClaw.exe', signingConfig);
    stageWindowsDesktopAssets(bundleDir);
    endCurrentStep();
    process.stdout.write(`\n[windows-installer] Launcher rebuilt in ${bundleDir}\n`);
    printTimingSummary();
    return;
  }

  if (!options.bundleOnly && !findMakensis()) {
    throw new Error(
      'makensis not found. Install NSIS (https://nsis.sourceforge.io) or set MAKENSIS_PATH, or use --bundle-only.',
    );
  }

  assertJiuwenClawVendorReady();

  // --skip-python: reuse existing tools/python; don't wipe bundle dir
  if (!options.skipPython) {
    logStep('Preparing output directories');
    resetDir(bundleDir);
  } else {
    logStep('Preparing output directories (keeping existing Python)');
    if (!existsSync(bundleDir)) {
      throw new Error(`Bundle not found at ${bundleDir}. Run without --skip-python first to build the full bundle.`);
    }
  }

  ensureBuildArtifacts(options);

  logStep('Copying project sources');
  copyTopLevelProject(bundleDir);
  stageInstallerSeed(bundleDir);

  logStep('Staging vendor Python sources');
  stageVendorPythonSources(bundleDir);

  let pythonEmbed;
  if (!options.skipPython) {
    logStep('Bundling Python embeddable runtime');
    pythonEmbed = await stageWindowsPython(bundleDir, options);

    logStep('Installing shared Python dependencies');
    installSharedPythonDeps(bundleDir);
  } else {
    logStep('Skipping Python embed + pip install (--skip-python)');
    const releaseMetaPath = join(bundleDir, '.office-claw-release.json');
    const existingMeta = existsSync(releaseMetaPath) ? JSON.parse(readFileSync(releaseMetaPath, 'utf8')) : {};
    pythonEmbed = existingMeta.pythonEmbed ?? { version: PYTHON_EMBED_VERSION, url: PYTHON_EMBED_URL };
  }

  logStep('Compiling vendor Python sources to pyc');
  compileVendorPythonSources(bundleDir);

  logStep('Preparing runtime package payload');
  await stageWorkspacePackages(bundleDir);

  logStep('Bundling Windows Node runtime');
  const windowsNode = await stageWindowsNode(bundleDir, options);

  logStep('Bundling portable Redis');
  const redis = await stageWindowsRedis(bundleDir, options);

  logStep('Installing Windows runtime dependencies');
  await installWindowsRuntimeDependencies(bundleDir, options);

  logStep('Building WebView2 desktop launcher');
  buildWindowsDesktopLauncher(bundleDir, options);
  signWindowsExecutable(launcherExe, 'OfficeClaw.exe', signingConfig);
  verifyWindowsSignature(launcherExe, 'OfficeClaw.exe', signingConfig);

  stageWindowsDesktopAssets(bundleDir);

  logStep('Finalizing runtime bundle');
  ensureRuntimeSkeleton(bundleDir);
  await stageWebView2Installer(bundleDir, options);
  await stageVcRedistInstaller(bundleDir, options);
  writeReleaseMetadata(bundleDir, {
    name: 'OfficeClaw',
    version: packageJson.version,
    generatedAt: new Date().toISOString(),
    managedTopLevelPaths: WINDOWS_MANAGED_TOP_LEVEL_PATHS,
    preservedPaths: WINDOWS_PRESERVE_PATHS,
    windowsNode,
    pythonEmbed,
    redis,
    webview2Version: options.webview2Version,
    vcRedistVersion: VC_REDIST_VERSION,
    maxRelativePathLength: computeMaxRelativePathLength(bundleDir),
  });

  if (options.bundleOnly) {
    endCurrentStep();
    process.stdout.write(`\n[windows-installer] Offline bundle ready at ${bundleDir}\n`);
    printTimingSummary();
    return;
  }

  logStep('Extracting 7-Zip standalone executable');
  const sevenZip = await stageSevenZipExe(options);

  logStep('Creating payload archive (7z format)');
  const payload7z = join(options.outputDir, 'payload.7z');
  createPayload7z(bundleDir, sevenZip.path, payload7z);

  logStep('Compiling NSIS installer');
  invokeMakensis(installerScript, outputExe, payload7z, sevenZip.path, packageJson.version);
  signWindowsExecutable(outputExe, 'Windows installer', signingConfig);
  verifyWindowsSignature(outputExe, 'Windows installer', signingConfig);
  endCurrentStep();
  process.stdout.write(`\n[windows-installer] Installer ready at ${outputExe}\n`);
  printTimingSummary();
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((error) => {
    console.error(`[windows-installer] ${error.message}`);
    process.exit(1);
  });
}
