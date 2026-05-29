#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */


import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const DEFAULT_CONFIG_PATH = resolve(repoRoot, 'packaging', 'windows', 'jiuwenclaw-source.json');
const SOURCE_METADATA_FILE = '.clowder-source.json';

function printHelp() {
  process.stdout.write(`Usage: node scripts/sync-jiuwenclaw-vendor.mjs [options]

Synchronize vendor/jiuwenclaw from an external Git repository before Windows packaging.

Options:
  --config <file>      Override source config path
  --repo-url <url>     Override repository URL
  --ref <ref>          Override git ref (tag / branch / commit)
  --target-dir <dir>   Override vendor target directory
  --cache-dir <dir>    Override local git cache directory
  --help               Show this help
`);
}

function parseArgs(argv) {
  const options = {
    configPath: DEFAULT_CONFIG_PATH,
    repoUrl: null,
    ref: null,
    targetDir: null,
    cacheDir: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--config':
        options.configPath = argv[++index] ? resolve(process.cwd(), argv[index]) : null;
        break;
      case '--repo-url':
        options.repoUrl = argv[++index] ?? null;
        break;
      case '--ref':
        options.ref = argv[++index] ?? null;
        break;
      case '--target-dir':
        options.targetDir = argv[++index] ? resolve(process.cwd(), argv[index]) : null;
        break;
      case '--cache-dir':
        options.cacheDir = argv[++index] ? resolve(process.cwd(), argv[index]) : null;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function ensureDir(targetDir) {
  mkdirSync(targetDir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function normalizeStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  const normalized = value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
  if (normalized.length !== value.length) {
    throw new Error(`${fieldName} contains an empty value`);
  }
  return normalized;
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('JiuwenClaw source config must be a JSON object');
  }

  const requiredFiles = normalizeStringArray(config.requiredFiles ?? [], 'requiredFiles');
  if (requiredFiles.length === 0) {
    throw new Error('JiuwenClaw source config requires at least one required file');
  }

  return {
    repoUrl: String(config.repoUrl ?? '').trim(),
    ref: String(config.ref ?? '').trim(),
    targetDir: String(config.targetDir ?? '').trim(),
    requiredFiles,
  };
}

function resolveEffectiveOptions(parsedOptions, config) {
  const repoUrl = (parsedOptions.repoUrl ?? process.env.JIUWENCLAW_GIT_URL ?? config.repoUrl ?? '').trim();
  const ref = (parsedOptions.ref ?? process.env.JIUWENCLAW_GIT_REF ?? config.ref ?? '').trim();
  const targetDir = parsedOptions.targetDir ?? resolve(repoRoot, config.targetDir || 'vendor/jiuwenclaw');
  const cacheDir =
    parsedOptions.cacheDir ??
    resolve(repoRoot, process.env.JIUWENCLAW_GIT_CACHE_DIR ?? join('dist', '.vendor-cache', 'jiuwenclaw'));
  const extraHeader = String(process.env.JIUWENCLAW_GIT_HTTP_EXTRA_HEADER ?? '').trim();

  if (!targetDir) {
    throw new Error('JiuwenClaw targetDir is empty');
  }

  return {
    repoUrl,
    ref,
    targetDir,
    cacheDir,
    requiredFiles: config.requiredFiles,
    extraHeader,
  };
}

function commandExists(command, args = ['--version']) {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return result.status === 0;
}

function createGitArgs(baseArgs, extraHeader) {
  if (!extraHeader) {
    return baseArgs;
  }
  return ['-c', `http.extraHeader=${extraHeader}`, ...baseArgs];
}

function runGit(args, options = {}) {
  const finalArgs = createGitArgs(args, options.extraHeader ?? '');
  const result = spawnSync('git', finalArgs, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      LANG: 'en_US.UTF-8',
      ...(options.env ?? {}),
    },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = options.capture ? (result.stderr || result.stdout || '').trim() : '';
    throw new Error(detail ? `git ${args.join(' ')} failed: ${detail}` : `git ${args.join(' ')} failed`);
  }

  return options.capture ? (result.stdout ?? '').trim() : '';
}

function validateRequiredFiles(rootDir, requiredFiles) {
  const missing = [];
  for (const relativePath of requiredFiles) {
    if (!existsSync(join(rootDir, relativePath))) {
      missing.push(relativePath);
    }
  }
  return missing;
}

function removeIfExists(targetPath) {
  rmSync(targetPath, { recursive: true, force: true });
}

function copySourceTree(sourceDir, destinationDir) {
  ensureDir(destinationDir);
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name === '.git') {
      continue;
    }

    const sourcePath = join(sourceDir, entry.name);
    const destinationPath = join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      copySourceTree(sourcePath, destinationPath);
      continue;
    }
    copyFileSync(sourcePath, destinationPath);
  }
}

function writeSourceMetadata(targetDir, metadata) {
  writeFileSync(join(targetDir, SOURCE_METADATA_FILE), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

function replaceDirectoryAtomically(tempDir, targetDir) {
  const backupDir = `${targetDir}.backup-${process.pid}-${Date.now()}`;
  const targetExists = existsSync(targetDir);

  if (targetExists) {
    try {
      renameSync(targetDir, backupDir);
    } catch (error) {
      if (error.code === 'EBUSY') {
        throw new Error(
          `目录被占用，无法更新。\n\n解决方法:\n  1. 关闭所有使用该目录的终端/编辑器/进程\n  2. 如果在 Windows 上，检查是否有 PowerShell/终端窗口停留在该目录\n  3. 重新执行: pnpm vendor:sync:jiuwenclaw\n\n目标目录: ${relative(repoRoot, targetDir)}`,
        );
      }
      throw error;
    }
  }

  try {
    renameSync(tempDir, targetDir);
  } catch (error) {
    if (targetExists && existsSync(backupDir) && !existsSync(targetDir)) {
      renameSync(backupDir, targetDir);
    }
    throw error;
  }

  if (targetExists) {
    removeIfExists(backupDir);
  }
}

function ensureCacheRepo(cacheDir, repoUrl, extraHeader) {
  if (existsSync(join(cacheDir, '.git'))) {
    runGit(['remote', 'set-url', 'origin', repoUrl], { cwd: cacheDir, extraHeader });
    return;
  }

  removeIfExists(cacheDir);
  ensureDir(dirname(cacheDir));
  runGit(['clone', '--no-checkout', '--config', 'core.autocrlf=false', repoUrl, cacheDir], { extraHeader });
}

function fetchRefIntoCache(cacheDir, ref, extraHeader) {
  const commitLikeRef = /^[0-9a-f]{7,40}$/i.test(ref);
  if (commitLikeRef) {
    runGit(['fetch', '--force', '--tags', 'origin'], { cwd: cacheDir, extraHeader });
    const resolvedCommit = runGit(['rev-parse', '--verify', `${ref}^{commit}`], {
      cwd: cacheDir,
      extraHeader,
      capture: true,
    });
    if (!resolvedCommit) {
      throw new Error(`Git ref could not be resolved to a commit after fetch: ${ref}`);
    }
    return resolvedCommit;
  }

  try {
    runGit(['fetch', '--force', '--depth', '1', 'origin', ref], { cwd: cacheDir, extraHeader });
    return runGit(['rev-parse', '--verify', 'FETCH_HEAD^{commit}'], {
      cwd: cacheDir,
      extraHeader,
      capture: true,
    });
  } catch {
    runGit(['fetch', '--force', 'origin', ref], { cwd: cacheDir, extraHeader });
    return runGit(['rev-parse', '--verify', 'FETCH_HEAD^{commit}'], {
      cwd: cacheDir,
      extraHeader,
      capture: true,
    });
  }
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function logStep(step, message) {
  process.stdout.write(`  ${step} ${message}\n`);
}

function logSuccess(message) {
  process.stdout.write(`  ✓ ${message}\n`);
}

function logError(message) {
  process.stderr.write(`  ✗ ${message}\n`);
}

function reuseExistingVendor(targetDir, requiredFiles, repoUrl, ref) {
  const missing = validateRequiredFiles(targetDir, requiredFiles);
  if (missing.length > 0) {
    throw new Error(
      `JiuwenClaw source is not configured and existing vendor is incomplete: ${missing.join(', ')}. Configure JIUWENCLAW_GIT_URL and JIUWENCLAW_GIT_REF or restore ${relative(repoRoot, targetDir)}.`,
    );
  }

  writeSourceMetadata(targetDir, {
    source: 'existing-local',
    repoUrl: repoUrl || null,
    requestedRef: ref || null,
    resolvedCommit: null,
    syncedAt: new Date().toISOString(),
  });
  logSuccess(`使用现有目录 ${relative(repoRoot, targetDir)}（未配置远程源）`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  log('');
  log('📦 同步 JiuwenClaw 代码');
  log('');

  if (!commandExists('git')) {
    logError('未找到 git 命令');
    throw new Error('请先安装 git');
  }

  if (!existsSync(options.configPath)) {
    logError(`配置文件不存在: ${options.configPath}`);
    throw new Error('请检查 packaging/windows/jiuwenclaw-source.json');
  }

  const config = validateConfig(readJson(options.configPath));
  const effective = resolveEffectiveOptions(options, config);
  const tempDir = `${effective.targetDir}.tmp-${process.pid}`;

  if (!effective.repoUrl || !effective.ref) {
    if (existsSync(effective.targetDir)) {
      reuseExistingVendor(effective.targetDir, effective.requiredFiles, effective.repoUrl, effective.ref);
      return;
    }
    logError('未配置远程仓库源');
    throw new Error(
      '请设置 JIUWENCLAW_GIT_URL 和 JIUWENCLAW_GIT_REF 环境变量，或填写 packaging/windows/jiuwenclaw-source.json',
    );
  }

  logStep('>', `仓库: ${effective.repoUrl}`);
  logStep('>', `分支: ${effective.ref}`);
  log('');

  logStep('1', '更新本地缓存...');
  ensureCacheRepo(effective.cacheDir, effective.repoUrl, effective.extraHeader);
  const resolvedRef = fetchRefIntoCache(effective.cacheDir, effective.ref, effective.extraHeader);
  logSuccess(`已获取最新代码`);

  logStep('2', '检出代码...');
  runGit(['checkout', '--force', resolvedRef], { cwd: effective.cacheDir, extraHeader: effective.extraHeader });
  runGit(['clean', '-fdx'], { cwd: effective.cacheDir, extraHeader: effective.extraHeader });

  const resolvedCommit = runGit(['rev-parse', 'HEAD'], {
    cwd: effective.cacheDir,
    extraHeader: effective.extraHeader,
    capture: true,
  });
  logSuccess(`检出完成 (${resolvedCommit.slice(0, 7)})`);

  logStep('3', '复制到目标目录...');
  removeIfExists(tempDir);
  ensureDir(dirname(effective.targetDir));
  copySourceTree(effective.cacheDir, tempDir);
  removeIfExists(join(tempDir, 'docs'));
  logSuccess('已复制并清理 docs/');

  logStep('4', '验证文件完整性...');
  const missing = validateRequiredFiles(tempDir, effective.requiredFiles);
  if (missing.length > 0) {
    removeIfExists(tempDir);
    logError(`缺少必要文件: ${missing.join(', ')}`);
    throw new Error('同步的代码不完整');
  }
  logSuccess('文件完整');

  writeSourceMetadata(tempDir, {
    source: 'git-sync',
    repoUrl: effective.repoUrl,
    requestedRef: effective.ref,
    resolvedCommit,
    syncedAt: new Date().toISOString(),
  });

  logStep('5', '替换目标目录...');
  replaceDirectoryAtomically(tempDir, effective.targetDir);
  logSuccess(`已更新 ${relative(repoRoot, effective.targetDir)}`);

  log('');
  log('✅ 同步完成');
  log(`   目录: ${relative(repoRoot, effective.targetDir)}`);
  log(`   版本: ${resolvedCommit.slice(0, 7)} (${effective.ref})`);
  log('');
}

try {
  main();
} catch (error) {
  log('');
  logError(error instanceof Error ? error.message : String(error));
  log('');
  process.exit(1);
}
