#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * macOS .app + .dmg build script for OfficeClaw.
 *
 * Parallel to build-windows-installer.mjs — same phase structure, macOS-specific tooling.
 *
 * Phases:
 *   1. pnpm build (unless --skip-build)
 *   2. Stage workspace packages (shared, api, mcp-server, web standalone)
 *   3. Stage vendor Python sources
 *   4. Bundle Python embeddable runtime (unless --skip-python)
 *   5. Bundle Node.js arm64
 *   6. Bundle Redis arm64
 *   7. Install macOS runtime npm dependencies
 *   8. Compile Swift desktop launcher (unless --skip-launcher)
 *   9. Create .app bundle
 *  10. Create .dmg (unless --bundle-only)
 *
 * Usage:
 *   node scripts/build-macos-installer.mjs                  # full build
 *   node scripts/build-macos-installer.mjs --bundle-only    # .app only, no .dmg
 *   node scripts/build-macos-installer.mjs --skip-build     # skip pnpm build
 *   node scripts/build-macos-installer.mjs --skip-python    # reuse existing Python
 *   node scripts/build-macos-installer.mjs --dmg-only       # repackage existing .app
 *   node scripts/build-macos-installer.mjs --launcher-only  # rebuild Swift launcher only
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

// ─── Constants ──────────────────────────────────────────────────────

const MACOS_PRESERVE_PATHS = ['.env', 'office-claw-config.json', 'data', 'logs', '.office-claw'];
const MACOS_MANAGED_TOP_LEVEL_PATHS = [
  'packages',
  'scripts',
  'office-claw-skills',
  'tools',
  'installer-seed',
  'vendor',
  '.office-claw-release.json',
  '.env.example',
  'LICENSE',
  'office-claw-template.json',
  'modelarts-preset.json',
  'pnpm-workspace.yaml',
];

const EXCLUDED_TOP_LEVEL_SEGMENTS = new Set(['.git', 'node_modules']);
const EXCLUDED_EXACT_PATHS = new Set([
  '.env',
  'data',
  'logs',
  'dist',
  'packages/api/dist',
  'packages/mcp-server/dist',
  'packages/web/.next',
]);
const EXCLUDED_PREFIXES = [
  'data/',
  'logs/',
  'dist/',
  'packages/api/dist/',
  'packages/mcp-server/dist/',
  'packages/web/.next/',
];

const RUNTIME_SCRIPT_FILES = ['install-auth-config.mjs', 'start-entry.mjs', 'start-macos.sh'];

const MACOS_ARCH = process.arch === 'arm64' ? 'arm64' : 'x64';
const NODE_PLATFORM_SUFFIX = MACOS_ARCH === 'arm64' ? 'darwin-arm64' : 'darwin-x64';

const PYTHON_EMBED_VERSION = '3.13.4';

const INCLUDE_SQLITE_ADAPTER = process.env.OFFICE_CLAW_INCLUDE_SQLITE_ADAPTER !== '0';
const API_BASE_RUNTIME_EXTERNAL_DEPENDENCIES = [
  'node-pty',
  'pino',
  'pino-roll',
  'puppeteer',
  'sharp',
];
const API_SQLITE_RUNTIME_EXTERNAL_DEPENDENCIES = ['better-sqlite3', 'sqlite-vec'];
const API_RUNTIME_EXTERNAL_DEPENDENCIES = [
  ...API_BASE_RUNTIME_EXTERNAL_DEPENDENCIES,
  ...(INCLUDE_SQLITE_ADAPTER ? API_SQLITE_RUNTIME_EXTERNAL_DEPENDENCIES : []),
];
const WEB_RUNTIME_DEPENDENCIES = ['next', 'react', 'react-dom', 'sharp'];

const WEB_STANDALONE_BUILD_DIR = join(repoRoot, 'packages', 'web', '.next', 'standalone');
const WEB_STANDALONE_APP_DIR = join(WEB_STANDALONE_BUILD_DIR, 'packages', 'web');
const WEB_STANDALONE_NODE_MODULES_DIR = join(WEB_STANDALONE_BUILD_DIR, 'node_modules');
const WEB_BUILD_STATIC_DIR = join(repoRoot, 'packages', 'web', '.next', 'static');
const WEB_PUBLIC_DIR = join(repoRoot, 'packages', 'web', 'public');
const ROOT_NODE_MODULES_DIR = join(repoRoot, 'node_modules');

// Runtime web server (CommonJS); .cjs so Node treats as CJS when package.json has "type": "module"
const RUNTIME_WEB_STANDALONE_SERVER = `const fs = require('node:fs');
const path = require('node:path');

function resolveApiBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_API_URL?.replace(/\\/+$/, '');
  if (explicit) return explicit;
  const apiPort = Number(process.env.API_SERVER_PORT);
  if (Number.isInteger(apiPort) && apiPort > 0) return \`http://localhost:\${apiPort}\`;
  const frontendPort = Number(process.env.FRONTEND_PORT);
  if (Number.isInteger(frontendPort) && frontendPort > 0) return \`http://localhost:\${frontendPort + 1}\`;
  return 'http://localhost:3004';
}

const dir = __dirname;
process.env.NODE_ENV = 'production';
process.chdir(__dirname);
const currentPort = parseInt(process.env.PORT, 10) || 3000;
const hostname = process.env.HOSTNAME || '127.0.0.1';
let keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT, 10);

const requiredServerFiles = JSON.parse(
  fs.readFileSync(path.join(__dirname, '.next', 'required-server-files.json'), 'utf8'),
);
const nextConfig = requiredServerFiles.config || {};
const rewrites = nextConfig._originalRewrites || {};
const afterFiles = Array.isArray(rewrites.afterFiles)
  ? rewrites.afterFiles.filter((entry) => entry && entry.source !== '/uploads/:path*')
  : [];

nextConfig._originalRewrites = {
  beforeFiles: Array.isArray(rewrites.beforeFiles) ? rewrites.beforeFiles : [],
  afterFiles: [
    ...afterFiles,
    { source: '/uploads/:path*', destination: \`\${resolveApiBaseUrl()}/uploads/:path*\` },
  ],
  fallback: Array.isArray(rewrites.fallback) ? rewrites.fallback : [],
};

process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);
require('next');
const { startServer } = require('next/dist/server/lib/start-server');

if (Number.isNaN(keepAliveTimeout) || !Number.isFinite(keepAliveTimeout) || keepAliveTimeout < 0) {
  keepAliveTimeout = undefined;
}

startServer({
  dir, isDev: false, config: nextConfig,
  hostname, port: currentPort, allowRetry: false, keepAliveTimeout,
}).catch((err) => { console.error(err); process.exit(1); });
`;

// ─── Helpers ────────────────────────────────────────────────────────

let stepCounter = 0;
function logStep(message) {
  stepCounter++;
  console.log(`\n[${stepCounter}] ${message}`);
}

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: repoRoot, ...options });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')} (exit ${result.status})`);
  }
}

function runAndCapture(command, args = [], options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', cwd: repoRoot, ...options });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
  return (result.stdout ?? '').trim();
}

function commandExists(cmd) {
  const result = spawnSync('which', [cmd], { encoding: 'utf8', stdio: 'pipe' });
  return result.status === 0;
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function resetDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function shouldCopyRepoPath(relativePath) {
  const normalized = relativePath.split(sep).join('/');
  if (!normalized || normalized === '.') return true;
  const segments = normalized.split('/');
  if (segments.some((s) => EXCLUDED_TOP_LEVEL_SEGMENTS.has(s))) return false;
  if (EXCLUDED_EXACT_PATHS.has(normalized)) return false;
  return !EXCLUDED_PREFIXES.some((p) => normalized.startsWith(p));
}

function copyEntry(source, destination) {
  cpSync(source, destination, {
    recursive: true,
    force: true,
    filter(src) {
      return shouldCopyRepoPath(relative(repoRoot, src));
    },
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'office-claw-macos-installer-builder',
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      accept: 'application/octet-stream, application/json',
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${url}: ${response.status} ${response.statusText}`);
  }
  ensureDir(dirname(destination));
  await pipeline(response.body, createWriteStream(destination));
}

async function ensureCachedDownload(url, destination) {
  if (existsSync(destination)) return destination;
  await downloadFile(url, destination);
  return destination;
}

function walkFiles(rootDir, visitor) {
  if (!existsSync(rootDir)) return;
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      visitor(fullPath, entry);
    }
  }
}

function removeNamedDirectoriesRecursive(rootDir, directoryNames) {
  if (!existsSync(rootDir)) return;
  const names = new Set(directoryNames);
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const fullPath = join(current, entry.name);
      if (names.has(entry.name)) {
        rmSync(fullPath, { recursive: true, force: true });
        continue;
      }
      stack.push(fullPath);
    }
  }
}

function removePaths(rootDir, relativePaths) {
  for (const p of relativePaths) {
    rmSync(join(rootDir, p), { recursive: true, force: true });
  }
}

function pruneRuntimePackage(targetDir, options = {}) {
  removePaths(targetDir, options.removePaths ?? []);
  removeNamedDirectoriesRecursive(targetDir, ['test', 'tests', '__tests__', 'example', 'examples', 'doc', 'docs']);
  walkFiles(targetDir, (fullPath, entry) => {
    const name = entry.name;
    if (name === 'package-lock.json' || name === '.package-lock.json') {
      rmSync(fullPath, { force: true });
      return;
    }
    if (name.endsWith('.d.ts') || name.endsWith('.d.ts.map') || name.endsWith('.map')) {
      rmSync(fullPath, { force: true });
      return;
    }
    if (name.endsWith('.ts') || name.endsWith('.cts') || name.endsWith('.mts')) {
      rmSync(fullPath, { force: true });
      return;
    }
    if (name.endsWith('.md') || name.endsWith('.yml') || name.endsWith('.yaml')) {
      rmSync(fullPath, { force: true });
      return;
    }
    if (/^(README|CHANGELOG|CONTRIBUTING)(\..+)?$/i.test(name)) {
      rmSync(fullPath, { force: true });
      return;
    }
    if (/^\.(eslintrc|prettierrc|editorconfig|babelrc)/i.test(name)) {
      rmSync(fullPath, { force: true });
    }
  });
}

function pruneNativePrebuilds(rootDir) {
  if (!existsSync(rootDir)) return;
  const keepPrefix = `darwin-${MACOS_ARCH}`;
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
          if (!platform.name.startsWith(keepPrefix)) {
            rmSync(join(fullPath, platform.name), { recursive: true, force: true });
          }
        }
        continue;
      }
      stack.push(fullPath);
    }
  }
}

// ─── Parse Args ─────────────────────────────────────────────────────

function parseArgs(argv) {
  const options = {
    bundleOnly: false,
    skipBuild: false,
    skipPython: false,
    skipLauncher: false,
    launcherOnly: false,
    dmgOnly: false,
    outputDir: resolve(repoRoot, 'dist', 'macos'),
    cacheDir: null,
    nodeVersion: `v${process.versions.node}`,
    nodeUrl: process.env.CLOWDER_MACOS_NODE_URL ?? null,
    redisUrl: process.env.CLOWDER_MACOS_REDIS_URL ?? null,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--bundle-only':
        options.bundleOnly = true;
        break;
      case '--skip-build':
        options.skipBuild = true;
        break;
      case '--skip-python':
        options.skipPython = true;
        break;
      case '--skip-launcher':
        options.skipLauncher = true;
        break;
      case '--launcher-only':
        options.launcherOnly = true;
        break;
      case '--dmg-only':
        options.dmgOnly = true;
        break;
      case '--output-dir':
        options.outputDir = resolve(argv[++i]);
        break;
      case '--cache-dir':
        options.cacheDir = resolve(argv[++i]);
        break;
      case '--node-version':
        options.nodeVersion = argv[++i];
        break;
    }
  }

  if (!options.cacheDir) {
    options.cacheDir = join(options.outputDir, '.cache');
  }
  if (!options.nodeVersion.startsWith('v')) {
    options.nodeVersion = `v${options.nodeVersion}`;
  }

  return options;
}

// ─── Stage Functions ────────────────────────────────────────────────

function copyTopLevelProject(bundleDir) {
  const entries = [
    'office-claw-skills',
    'LICENSE',
    '.env.example',
    '.inner.env',
    'office-claw-template.json',
    'experts-preset.json',
    'modelarts-preset.json',
    'pnpm-workspace.yaml',
  ];
  for (const entry of entries) {
    const source = join(repoRoot, entry);
    if (!existsSync(source)) {
      throw new Error(`Missing required bundle entry: ${source}`);
    }
    ensureDir(dirname(join(bundleDir, entry)));
    copyEntry(source, join(bundleDir, entry));
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

function stageInstallerSeed(bundleDir) {
  const seedDir = join(bundleDir, 'installer-seed');
  ensureDir(seedDir);
  const catConfigPath = join(repoRoot, 'office-claw-config.json');
  if (existsSync(catConfigPath)) {
    cpSync(catConfigPath, join(seedDir, 'office-claw-config.json'), { force: true });
  }
}

function stageVendorPythonSources(bundleDir) {
  const excludeDirs = new Set([
    'dist',
    '.venv',
    '.build-venv',
    '__pycache__',
    'tests',
    'test',
    '.git',
    'node_modules',
    'build',
    '.mypy_cache',
    '.pytest_cache',
  ]);
  const excludeFiles = new Set(['uv.lock']);

  function copySourceTree(srcDir, destDir) {
    ensureDir(destDir);
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = join(srcDir, entry.name);
      const destPath = join(destDir, entry.name);
      if (entry.isDirectory()) {
        if (excludeDirs.has(entry.name)) continue;
        copySourceTree(srcPath, destPath);
      } else {
        if (excludeFiles.has(entry.name)) continue;
        if (entry.name.endsWith('.pyc') || entry.name.endsWith('.pyo')) continue;
        copyFileSync(srcPath, destPath);
      }
    }
  }

  const vendorDir = join(bundleDir, 'vendor');
  ensureDir(vendorDir);
  copySourceTree(join(repoRoot, 'vendor', 'jiuwenclaw'), join(vendorDir, 'jiuwenclaw'));
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

function createRuntimePackageJson(sourcePath, options = {}) {
  const source = readJson(sourcePath);
  const sourceDir = dirname(sourcePath);
  const runtimePackage = {
    name: source.name,
    version: source.version,
    private: source.private ?? true,
  };
  for (const key of ['type', 'main', 'bin', 'exports', 'types']) {
    if (source[key] !== undefined) runtimePackage[key] = source[key];
  }
  if (options.scripts) {
    runtimePackage.scripts = options.scripts;
  } else if (source.scripts?.start) {
    runtimePackage.scripts = { start: source.scripts.start };
  }
  const dependencies = pinRuntimeDependencyVersions(sourceDir, source.dependencies ?? {}, {
    '@openjiuwen/relay-shared': 'file:../shared',
  });
  if (Object.keys(dependencies).length > 0) runtimePackage.dependencies = dependencies;
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
    scripts: { start: 'node dist/index.js' },
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
    runtimePackage.dependencies = runtimeDependencies;
  } else {
    delete runtimePackage.dependencies;
  }
  if (INCLUDE_SQLITE_ADAPTER) {
    runtimePackage.dependencies = {
      ...(runtimePackage.dependencies ?? {}),
      '@openjiuwen/relay-storage-sqlite': 'file:../sqlite-adapter',
    };
  }
  delete runtimePackage.optionalDependencies;
  return runtimePackage;
}

function stageRuntimePackageTemplate(targetRootDir, packageName, options = {}) {
  const sourceDir = join(repoRoot, 'packages', packageName);
  const targetDir = join(targetRootDir, 'packages', packageName);
  ensureDir(targetDir);

  const runtimePkg = createRuntimePackageJson(join(sourceDir, 'package.json'), options);
  writeJson(join(targetDir, 'package.json'), runtimePkg);

  for (const entry of options.copyPaths ?? []) {
    const src = join(sourceDir, entry);
    if (existsSync(src)) {
      cpSync(src, join(targetDir, entry), { recursive: true, force: true });
    }
  }
  pruneRuntimePackage(targetDir, options);
}

function stageRuntimePackageTemplateFromSource(targetRootDir, sourceRelativePath, targetPackageName, options = {}) {
  const sourceDir = join(repoRoot, sourceRelativePath);
  const targetDir = join(targetRootDir, 'packages', targetPackageName);
  ensureDir(targetDir);

  const runtimePkg = createRuntimePackageJson(join(sourceDir, 'package.json'), options);
  writeJson(join(targetDir, 'package.json'), runtimePkg);

  for (const entry of options.copyPaths ?? []) {
    const src = join(sourceDir, entry);
    if (existsSync(src)) {
      cpSync(src, join(targetDir, entry), { recursive: true, force: true });
    }
  }
  pruneRuntimePackage(targetDir, options);
}

function resolveLocalEsbuildCommand() {
  const candidate = join(ROOT_NODE_MODULES_DIR, '.bin', 'esbuild');
  if (existsSync(candidate)) return candidate;
  throw new Error(`esbuild executable not found in ${join(ROOT_NODE_MODULES_DIR, '.bin')}`);
}

async function stageBundledApiRuntime(targetRootDir) {
  const esbuild = resolveLocalEsbuildCommand();
  const targetDir = join(targetRootDir, 'packages', 'api');
  const distDir = join(targetDir, 'dist');
  ensureDir(distDir);
  const assetSourceDir = join(repoRoot, 'packages', 'api', 'assets');
  if (existsSync(assetSourceDir)) {
    cpSync(assetSourceDir, join(targetDir, 'assets'), { recursive: true, force: true });
  }

  // ESM banner: provide CJS shims so bundled code can use require() for native modules
  const banner = [
    "import { createRequire as __createRequire } from 'node:module';",
    "import { dirname as __pathDirname } from 'node:path';",
    "import { fileURLToPath as __fileURLToPath } from 'node:url';",
    'const require = __createRequire(import.meta.url);',
    'const __filename = __fileURLToPath(import.meta.url);',
    'const __dirname = __pathDirname(__filename);',
  ].join(' ');

  run(esbuild, [
    join(repoRoot, 'packages', 'api', 'src', 'index.ts'),
    '--bundle',
    '--platform=node',
    '--target=node20',
    '--format=esm',
    `--outfile=${join(distDir, 'index.js')}`,
    `--banner:js=${banner}`,
    '--sourcemap=external',
    '--log-level=error',
    ...API_RUNTIME_EXTERNAL_DEPENDENCIES.map((dep) => `--external:${dep}`),
    '--external:@openjiuwen/relay-shared',
  ]);

  writeJson(
    join(targetDir, 'package.json'),
    createBundledApiRuntimePackageJson(join(repoRoot, 'packages', 'api', 'package.json')),
  );
}

function createStandaloneWebRuntimePackageJson(sourcePath) {
  const source = readJson(sourcePath);
  const sourceDir = dirname(sourcePath);
  const runtimePackage = createRuntimePackageJson(sourcePath, {
    scripts: { start: 'node server.cjs' },
  });
  const nodeModulesDirs = [WEB_STANDALONE_NODE_MODULES_DIR, join(sourceDir, 'node_modules'), ROOT_NODE_MODULES_DIR];
  const runtimeDependencies = Object.fromEntries(
    WEB_RUNTIME_DEPENDENCIES.flatMap((dependency) => {
      const installedVersion = resolveInstalledPackageVersionFrom(nodeModulesDirs, dependency);
      if (installedVersion) {
        return [[dependency, installedVersion]];
      }
      const sourceVersion = source.dependencies?.[dependency];
      return sourceVersion ? [[dependency, sourceVersion]] : [];
    }),
  );
  if (Object.keys(runtimeDependencies).length > 0) {
    runtimePackage.dependencies = runtimeDependencies;
  } else {
    delete runtimePackage.dependencies;
  }
  delete runtimePackage.optionalDependencies;
  return runtimePackage;
}

function stageStandaloneWebRuntime(targetRootDir) {
  const targetDir = join(targetRootDir, 'packages', 'web');

  if (!existsSync(WEB_STANDALONE_BUILD_DIR)) {
    throw new Error(`Next.js standalone build not found. Run 'pnpm build' with NEXT_STANDALONE=1 first.`);
  }

  resetDir(targetDir);
  cpSync(WEB_STANDALONE_APP_DIR, targetDir, { recursive: true, force: true });

  if (existsSync(WEB_STANDALONE_NODE_MODULES_DIR)) {
    cpSync(WEB_STANDALONE_NODE_MODULES_DIR, join(targetDir, 'node_modules'), { recursive: true, force: true });
  }

  const nextStaticTarget = join(targetDir, '.next', 'static');
  if (existsSync(WEB_BUILD_STATIC_DIR)) {
    ensureDir(nextStaticTarget);
    cpSync(WEB_BUILD_STATIC_DIR, nextStaticTarget, { recursive: true, force: true });
  }

  if (existsSync(WEB_PUBLIC_DIR)) {
    cpSync(WEB_PUBLIC_DIR, join(targetDir, 'public'), { recursive: true, force: true });
  }

  // Remove pnpm-symlinked node_modules — npm install will recreate with real files.
  rmSync(join(targetDir, 'node_modules'), { recursive: true, force: true });

  writeFileSync(join(targetDir, 'server.cjs'), RUNTIME_WEB_STANDALONE_SERVER, 'utf8');
  writeJson(
    join(targetDir, 'package.json'),
    createStandaloneWebRuntimePackageJson(join(repoRoot, 'packages', 'web', 'package.json')),
  );
}

async function stageWorkspacePackages(targetRootDir) {
  stageRuntimePackageTemplate(targetRootDir, 'shared', {
    copyPaths: ['dist'],
    removePaths: ['tsconfig.json'],
  });
  if (INCLUDE_SQLITE_ADAPTER) {
    stageRuntimePackageTemplateFromSource(targetRootDir, join('packages', 'sqlite-adapter', 'api'), 'sqlite-adapter', {
      copyPaths: ['dist'],
      removePaths: ['src', 'test', 'tsconfig.json'],
    });
  }
  await stageBundledApiRuntime(targetRootDir);
  stageRuntimePackageTemplate(targetRootDir, 'mcp-server', {
    copyPaths: ['dist'],
    removePaths: ['src', 'test', 'tsconfig.json'],
  });
  stageStandaloneWebRuntime(targetRootDir);
}

// ─── Node.js ────────────────────────────────────────────────────────

async function stageMacosNode(bundleDir, options) {
  const nodeUrl =
    options.nodeUrl ??
    `https://nodejs.org/dist/${options.nodeVersion}/node-${options.nodeVersion}-${NODE_PLATFORM_SUFFIX}.tar.gz`;
  const archiveName = basename(new URL(nodeUrl).pathname);
  const archivePath = join(options.cacheDir, archiveName);
  await ensureCachedDownload(nodeUrl, archivePath);

  const tempExtract = join(options.cacheDir, 'extract-node');
  resetDir(tempExtract);
  run('tar', ['-xzf', archivePath, '-C', tempExtract]);

  // Find the extracted node directory
  const extracted = readdirSync(tempExtract).find((d) => d.startsWith('node-'));
  if (!extracted) throw new Error('Node.js extraction failed — no node-* directory found');
  const nodeRoot = join(tempExtract, extracted);

  const targetDir = join(bundleDir, 'tools', 'node');
  resetDir(targetDir);

  // Copy bin/node
  ensureDir(join(targetDir, 'bin'));
  cpSync(join(nodeRoot, 'bin', 'node'), join(targetDir, 'bin', 'node'), { force: true });

  // Copy lib (needed for npm/npx if we use them)
  if (existsSync(join(nodeRoot, 'lib'))) {
    cpSync(join(nodeRoot, 'lib'), join(targetDir, 'lib'), { recursive: true, force: true });
  }

  // Prune docs
  removePaths(targetDir, ['share', 'include', 'CHANGELOG.md', 'README.md', 'LICENSE']);

  return { version: options.nodeVersion, url: nodeUrl, archiveName };
}

// ─── Redis ──────────────────────────────────────────────────────────

async function stageMacosRedis(bundleDir, options) {
  const targetDir = join(bundleDir, 'tools', 'redis', 'bin');
  ensureDir(targetDir);

  if (options.redisUrl) {
    // Download pre-built Redis binary from custom URL
    const archiveName = basename(new URL(options.redisUrl).pathname);
    const archivePath = join(options.cacheDir, archiveName);
    await ensureCachedDownload(options.redisUrl, archivePath);

    const tempExtract = join(options.cacheDir, 'extract-redis');
    resetDir(tempExtract);

    if (archiveName.endsWith('.tar.gz') || archiveName.endsWith('.tgz')) {
      run('tar', ['-xzf', archivePath, '-C', tempExtract]);
    } else if (archiveName.endsWith('.zip')) {
      run('unzip', ['-q', archivePath, '-d', tempExtract]);
    }

    // Find redis-server in extracted files
    const findResult = spawnSync('find', [tempExtract, '-name', 'redis-server', '-type', 'f'], {
      encoding: 'utf8',
    });
    const redisBin = (findResult.stdout ?? '').trim().split('\n')[0];
    if (redisBin) {
      cpSync(redisBin, join(targetDir, 'redis-server'), { force: true });
      spawnSync('chmod', ['+x', join(targetDir, 'redis-server')]);
    }

    const cliResult = spawnSync('find', [tempExtract, '-name', 'redis-cli', '-type', 'f'], {
      encoding: 'utf8',
    });
    const redisCli = (cliResult.stdout ?? '').trim().split('\n')[0];
    if (redisCli) {
      cpSync(redisCli, join(targetDir, 'redis-cli'), { force: true });
      spawnSync('chmod', ['+x', join(targetDir, 'redis-cli')]);
    }

    return { version: 'custom', url: options.redisUrl };
  }

  // Default: compile Redis from source or use system binary
  if (commandExists('redis-server')) {
    const systemRedis = runAndCapture('which', ['redis-server']);
    const systemCli = runAndCapture('which', ['redis-cli']);
    cpSync(systemRedis, join(targetDir, 'redis-server'), { force: true });
    cpSync(systemCli, join(targetDir, 'redis-cli'), { force: true });
    spawnSync('chmod', ['+x', join(targetDir, 'redis-server')]);
    spawnSync('chmod', ['+x', join(targetDir, 'redis-cli')]);

    const versionOutput = runAndCapture('redis-server', ['--version']);
    const versionMatch = versionOutput.match(/v=(\S+)/);
    return { version: versionMatch?.[1] ?? 'system', source: 'system-copy' };
  }

  // Compile from source as fallback
  console.log('  No system Redis found — compiling from source...');
  const redisVersion = '7.2.7';
  const redisSourceUrl = `https://download.redis.io/releases/redis-${redisVersion}.tar.gz`;
  const archivePath = join(options.cacheDir, `redis-${redisVersion}.tar.gz`);
  await ensureCachedDownload(redisSourceUrl, archivePath);

  const tempExtract = join(options.cacheDir, 'redis-source');
  resetDir(tempExtract);
  run('tar', ['-xzf', archivePath, '-C', tempExtract]);

  const redisSourceDir = join(tempExtract, `redis-${redisVersion}`);
  run('make', ['-j4', 'BUILD_TLS=no'], { cwd: redisSourceDir });

  cpSync(join(redisSourceDir, 'src', 'redis-server'), join(targetDir, 'redis-server'), { force: true });
  cpSync(join(redisSourceDir, 'src', 'redis-cli'), join(targetDir, 'redis-cli'), { force: true });
  spawnSync('chmod', ['+x', join(targetDir, 'redis-server')]);
  spawnSync('chmod', ['+x', join(targetDir, 'redis-cli')]);

  return { version: redisVersion, source: 'compiled-from-source' };
}

// ─── Python ─────────────────────────────────────────────────────────

function findBestPython() {
  // Prefer Python 3.11-3.13 (some packages require <3.14)
  const candidates = [
    '/opt/homebrew/bin/python3.13',
    '/opt/homebrew/bin/python3.12',
    '/opt/homebrew/bin/python3.11',
    '/usr/local/bin/python3.13',
    '/usr/local/bin/python3.12',
    '/usr/local/bin/python3.11',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    'python3',
  ];
  for (const candidate of candidates) {
    if (!commandExists(candidate)) continue;
    const version = runAndCapture(candidate, ['--version']).replace('Python ', '');
    const [major, minor] = version.split('.').map(Number);
    if (major >= 3 && minor >= 11) return { path: candidate, version };
  }
  // Fall back to any python3
  if (commandExists('python3')) {
    const version = runAndCapture('python3', ['--version']).replace('Python ', '');
    return { path: 'python3', version };
  }
  return null;
}

async function stageMacosPython(bundleDir, options) {
  const targetDir = join(bundleDir, 'tools', 'python');
  const python = findBestPython();

  if (python) {
    console.log(`  Using Python: ${python.version} at ${python.path}`);
    resetDir(targetDir);
    run(python.path, ['-m', 'venv', targetDir]);
    // Upgrade pip first
    const pipExe = join(targetDir, 'bin', 'pip3');
    if (existsSync(pipExe)) {
      const upgradeResult = spawnSync(pipExe, ['install', '-q', '--upgrade', 'pip', 'setuptools', 'wheel'], {
        stdio: 'inherit',
        cwd: repoRoot,
      });
      if (upgradeResult.status !== 0) {
        console.warn('  ⚠ pip upgrade failed, continuing with existing version');
      }
    }
    return { version: python.version, source: 'venv' };
  }

  console.warn('  ⚠ Python3 not found — Python-dependent features will not work');
  return { version: 'none', source: 'missing' };
}

function tryPipInstall(pipExe, args, label) {
  const result = spawnSync(pipExe, args, { stdio: 'inherit', cwd: repoRoot });
  if (result.status !== 0) {
    console.warn(`  ⚠ ${label} install failed (non-fatal, continuing)`);
    return false;
  }
  return true;
}

function installSharedPythonDeps(bundleDir) {
  const pipExe = join(bundleDir, 'tools', 'python', 'bin', 'pip3');
  if (!existsSync(pipExe)) return;

  const pipArgs = ['install', '-q', '--no-warn-script-location'];

  // DARE dependencies
  const dareDeps = [
    'anthropic',
    'langchain-openai',
    'langchain-core',
    'httpx>=0.27.0',
    'starlette>=0.37.0',
    'uvicorn>=0.30.0',
    'chromadb>=0.4.0',
  ];
  tryPipInstall(pipExe, [...pipArgs, ...dareDeps], 'DARE deps');

  // JiuwenClaw core runtime deps (openjiuwen may not be on PyPI — non-fatal)
  const jiuwenCoreDeps = [
    'psutil>=7.0',
    'loguru>=0.7',
    'ruamel.yaml>=0.18',
    'python-dotenv>=1.0',
    'websockets>=12.0',
    'aiosqlite>=0.22',
    'croniter>=2.0',
    'mutagen>=1.47',
    'greenlet>=3.0',
  ];
  tryPipInstall(pipExe, [...pipArgs, ...jiuwenCoreDeps], 'JiuwenClaw core deps');
  tryPipInstall(pipExe, [...pipArgs, 'openjiuwen==0.1.7'], 'openjiuwen');
  tryPipInstall(pipExe, [...pipArgs, '--no-deps', join(repoRoot, 'vendor', 'jiuwenclaw')], 'JiuwenClaw package');

  // Office automation
  const officeDeps = [
    'python-pptx',
    'openpyxl',
    'python-docx',
    'requests',
    'pillow',
    'PyYAML',
    'coze_workload_identity',
    'xlsxwriter',
    'pypdf',
    'pdfplumber',
    'reportlab',
    'markitdown',
  ];
  tryPipInstall(pipExe, [...pipArgs, ...officeDeps], 'Office deps');

  // Relay-teams CLI
  tryPipInstall(pipExe, [...pipArgs, 'relay-teams'], 'relay-teams');

  // Prune
  const sitePackages = join(bundleDir, 'tools', 'python', 'lib');
  removeNamedDirectoriesRecursive(sitePackages, ['__pycache__', 'tests', 'test', '__tests__']);
}

// ─── Runtime Dependencies ───────────────────────────────────────────

function materializeSharedDependency(stagePackagesDir, packageName) {
  const sharedLinkPath = join(stagePackagesDir, packageName, 'node_modules', '@office-claw', 'shared');
  try {
    const stat = spawnSync('test', ['-L', sharedLinkPath]);
    if (stat.status !== 0) {
      return;
    }
  } catch {
    return;
  }
  rmSync(sharedLinkPath, { recursive: true, force: true });
  cpSync(join(stagePackagesDir, 'shared'), sharedLinkPath, { recursive: true, force: true });
  pruneRuntimePackage(sharedLinkPath);
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

function hasPlaywrightDependency(pkg) {
  return [pkg.dependencies, pkg.optionalDependencies, pkg.devDependencies].some(
    (group) => typeof group?.playwright === 'string',
  );
}

function installMacosRuntimeDependencies(bundleDir) {
  const bundlePackagesDir = join(bundleDir, 'packages');
  const npmArgs = ['install', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false', '--loglevel=error'];

  for (const packageName of ['api', 'mcp-server', 'web']) {
    const pkgDir = join(bundlePackagesDir, packageName);
    if (!existsSync(join(pkgDir, 'package.json'))) continue;

    run('npm', npmArgs, { cwd: pkgDir });
    materializeSharedDependency(bundlePackagesDir, packageName);
    pruneRuntimePackage(join(pkgDir));
    pruneNativePrebuilds(join(pkgDir, 'node_modules'));
  }

  const skillsRoot = join(bundleDir, 'office-claw-skills');
  const skillPackageDirs = getOfficeSkillPackageDirs(skillsRoot);
  let playwrightPackageDir = null;

  for (const skillDir of skillPackageDirs) {
    run('npm', npmArgs, { cwd: skillDir });
    rmSync(join(skillDir, 'package-lock.json'), { force: true });
    pruneNativePrebuilds(join(skillDir, 'node_modules'));
    pruneDateFnsLocales(join(skillDir, 'node_modules'));

    const pkg = readJson(join(skillDir, 'package.json'));
    if (!playwrightPackageDir && hasPlaywrightDependency(pkg)) {
      playwrightPackageDir = skillDir;
    }
  }

  if (playwrightPackageDir) {
    const playwrightBrowsersPath = join(skillsRoot, '.playwright-browsers');
    ensureDir(playwrightBrowsersPath);
    run('npx', ['playwright', 'install', 'chromium'], {
      cwd: playwrightPackageDir,
      env: {
        PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath,
      },
    });
  }
}

// ─── Swift Launcher ─────────────────────────────────────────────────

function buildSwiftLauncher(appContentsDir) {
  const swiftSource = join(repoRoot, 'packaging', 'macos', 'desktop', 'OfficeClawDesktop.swift');
  if (!existsSync(swiftSource)) {
    throw new Error(`Swift source not found: ${swiftSource}`);
  }

  const macosDir = join(appContentsDir, 'MacOS');
  ensureDir(macosDir);

  run('swiftc', [
    swiftSource,
    '-o',
    join(macosDir, 'OfficeClaw'),
    '-parse-as-library',
    '-framework',
    'Cocoa',
    '-framework',
    'WebKit',
    '-framework',
    'UserNotifications',
    '-O',
    '-target',
    `${MACOS_ARCH}-apple-macosx13.0`,
  ]);

  console.log('  Swift launcher compiled successfully.');
}

// ─── Codesign ───────────────────────────────────────────────────────

function codesignApp(appPath) {
  const entitlements = join(appPath, 'Contents', 'OfficeClaw.entitlements');
  const entArgs = existsSync(entitlements) ? ['--entitlements', entitlements] : [];

  // Ad-hoc sign the entire .app so Gatekeeper doesn't silently block it.
  // --deep signs nested code (frameworks, helpers) as well.
  // --force replaces any existing linker-only signature on the binary.
  run('codesign', ['--force', '--deep', '--sign', '-', ...entArgs, appPath]);
  console.log('  Ad-hoc codesign complete.');
}

// ─── App Bundle ─────────────────────────────────────────────────────

function assembleAppBundle(bundleDir, appPath) {
  const contentsDir = join(appPath, 'Contents');
  const resourcesDir = join(contentsDir, 'Resources');
  ensureDir(resourcesDir);

  // Copy Info.plist with version substitution
  const infoPlistTemplate = readFileSync(join(repoRoot, 'packaging', 'macos', 'desktop', 'Info.plist'), 'utf8');
  writeFileSync(
    join(contentsDir, 'Info.plist'),
    infoPlistTemplate.replace(/__VERSION__/g, packageJson.version),
    'utf8',
  );

  // Copy entitlements (for future codesigning)
  cpSync(
    join(repoRoot, 'packaging', 'macos', 'desktop', 'OfficeClaw.entitlements'),
    join(contentsDir, 'OfficeClaw.entitlements'),
    { force: true },
  );

  // Copy the staged bundle into Resources
  cpSync(bundleDir, resourcesDir, { recursive: true, force: true });

  // Copy app icon if available
  const pngIcon = join(repoRoot, 'packaging', 'windows', 'assets', 'app.ico');
  if (existsSync(pngIcon)) {
    // For now just copy — proper .icns conversion can be added later
    cpSync(pngIcon, join(resourcesDir, 'AppIcon.icns'), { force: true });
  }

  return contentsDir;
}

// ─── DMG ────────────────────────────────────────────────────────────

function createDmg(appPath, dmgPath, volumeName) {
  rmSync(dmgPath, { force: true });

  const dmgRoot = join(dirname(dmgPath), 'dmg-staging');
  resetDir(dmgRoot);

  cpSync(appPath, join(dmgRoot, basename(appPath)), { recursive: true, force: true });
  spawnSync('ln', ['-s', '/Applications', join(dmgRoot, 'Applications')]);

  run('hdiutil', ['create', '-volname', volumeName, '-srcfolder', dmgRoot, '-ov', '-format', 'UDZO', dmgPath]);

  rmSync(dmgRoot, { recursive: true, force: true });
}

// ─── Build Artifacts ────────────────────────────────────────────────

function ensureBuildArtifacts(options) {
  if (options.skipBuild) {
    console.log('  Skipping pnpm build (--skip-build)');
    return;
  }

  logStep('Building project (pnpm build)');
  run('pnpm', ['build'], {
    env: { ...process.env, NEXT_STANDALONE: '1' },
  });
}

function ensureRuntimeSkeleton(bundleDir) {
  for (const dir of ['data', 'logs', '.office-claw']) {
    ensureDir(join(bundleDir, dir));
  }
}

function writeReleaseMetadata(bundleDir, metadata) {
  writeJson(join(bundleDir, '.office-claw-release.json'), metadata);
}

function computeMaxRelativePathLength(bundleDir) {
  let maxLen = 0;
  walkFiles(bundleDir, (fullPath) => {
    const rel = relative(bundleDir, fullPath);
    if (rel.length > maxLen) maxLen = rel.length;
  });
  return maxLen;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const bundleDir = join(options.outputDir, 'bundle');
  const appName = 'OfficeClaw.app';
  const appPath = join(options.outputDir, appName);
  const dmgPath = join(options.outputDir, `OfficeClaw-${packageJson.version}-macos-${MACOS_ARCH}.dmg`);

  ensureDir(options.outputDir);
  ensureDir(options.cacheDir);

  // --dmg-only: repackage existing .app
  if (options.dmgOnly) {
    if (!existsSync(appPath)) {
      throw new Error(`.app not found at ${appPath}. Run without --dmg-only first.`);
    }
    logStep('Creating DMG');
    createDmg(appPath, dmgPath, 'OfficeClaw');
    logStep(`DMG ready at ${dmgPath}`);
    return;
  }

  // --launcher-only: rebuild Swift launcher into existing .app
  if (options.launcherOnly) {
    if (!existsSync(appPath)) {
      throw new Error(`.app not found at ${appPath}. Run without --launcher-only first.`);
    }
    logStep('Rebuilding Swift launcher');
    buildSwiftLauncher(join(appPath, 'Contents'));
    logStep('Codesigning .app bundle (ad-hoc)');
    codesignApp(appPath);
    logStep(`Launcher rebuilt in ${appPath}`);
    return;
  }

  // Full build or bundle-only
  if (!options.skipPython) {
    logStep('Preparing output directories');
    resetDir(bundleDir);
  } else {
    logStep('Preparing output directories (keeping existing Python)');
    if (!existsSync(bundleDir)) {
      throw new Error(`Bundle not found at ${bundleDir}. Run without --skip-python first.`);
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
    logStep('Setting up Python runtime');
    pythonEmbed = await stageMacosPython(bundleDir, options);

    logStep('Installing shared Python dependencies');
    installSharedPythonDeps(bundleDir);
  } else {
    logStep('Skipping Python setup (--skip-python)');
    const releaseMetaPath = join(bundleDir, '.office-claw-release.json');
    const existingMeta = existsSync(releaseMetaPath) ? JSON.parse(readFileSync(releaseMetaPath, 'utf8')) : {};
    pythonEmbed = existingMeta.pythonEmbed ?? { version: PYTHON_EMBED_VERSION, source: 'skipped' };
  }

  logStep('Preparing runtime package payload');
  await stageWorkspacePackages(bundleDir);

  logStep('Bundling Node.js runtime');
  const macosNode = await stageMacosNode(bundleDir, options);

  logStep('Bundling Redis');
  const redis = await stageMacosRedis(bundleDir, options);

  logStep('Installing macOS runtime dependencies');
  installMacosRuntimeDependencies(bundleDir);

  // Apply modelarts preset to generate filtered cat-catalog (3 cats instead of all dev cats)
  const presetFile = join(bundleDir, 'modelarts-preset.json');
  const installerScript = join(bundleDir, 'scripts', 'install-auth-config.mjs');
  if (existsSync(presetFile) && existsSync(installerScript)) {
    logStep('Applying modelarts preset');
    try {
      run('node', [installerScript, 'modelarts-preset', 'apply', '--project-dir', bundleDir]);
    } catch (e) {
      console.warn(`  Warning: preset apply failed (${e.message}), will retry on first boot`);
    }
  }

  logStep('Finalizing runtime bundle');
  ensureRuntimeSkeleton(bundleDir);
  writeReleaseMetadata(bundleDir, {
    name: 'OfficeClaw',
    version: packageJson.version,
    platform: 'macos',
    arch: MACOS_ARCH,
    generatedAt: new Date().toISOString(),
    managedTopLevelPaths: MACOS_MANAGED_TOP_LEVEL_PATHS,
    preservedPaths: MACOS_PRESERVE_PATHS,
    node: macosNode,
    pythonEmbed,
    redis,
    maxRelativePathLength: computeMaxRelativePathLength(bundleDir),
  });

  // Build .app
  logStep('Assembling .app bundle');
  rmSync(appPath, { recursive: true, force: true });
  const contentsDir = assembleAppBundle(bundleDir, appPath);

  if (!options.skipLauncher) {
    logStep('Compiling Swift desktop launcher');
    buildSwiftLauncher(contentsDir);
  }

  // Ad-hoc codesign the .app bundle so macOS Gatekeeper allows launch
  logStep('Codesigning .app bundle (ad-hoc)');
  codesignApp(appPath);

  if (options.bundleOnly) {
    logStep(`.app bundle ready at ${appPath}`);
    return;
  }

  logStep('Creating DMG');
  createDmg(appPath, dmgPath, 'OfficeClaw');
  logStep(`DMG ready at ${dmgPath}`);
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((error) => {
    console.error(`[macos-installer] ${error.message}`);
    process.exit(1);
  });
}
