#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */


import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const repoRoot = process.cwd();
const pnpm = 'pnpm';
const tar = process.platform === 'win32' ? 'tar.exe' : 'tar';
const packDestination = 'dist/packs';
const packManifestPath = resolve(repoRoot, packDestination, 'open-source-npm-packs.json');
const publishSummaryPath = resolve(repoRoot, packDestination, 'open-source-npm-publish-summary.txt');

function run(args, options = {}) {
  const result = spawnSync(pnpm, args, {
    cwd: repoRoot,
    encoding: options.capture ? 'utf8' : undefined,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0 && !options.allowFailure) {
    if (options.capture) {
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      console.error(output);
    }
    process.exit(result.status ?? 1);
  }

  return result;
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: options.capture ? 'utf8' : undefined,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0 && !options.allowFailure) {
    if (options.capture) {
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      console.error(output);
    }
    process.exit(result.status ?? 1);
  }

  return result;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function hashBuffer(buffer, algorithm = 'sha256') {
  return createHash(algorithm).update(buffer).digest('hex');
}

function hashFile(filePath, algorithm = 'sha256') {
  return hashBuffer(readFileSync(filePath), algorithm);
}

function shortHash(value) {
  return value.slice(0, 12);
}

function currentGitHead() {
  const result = runCommand('git', ['rev-parse', 'HEAD'], { capture: true, allowFailure: true });
  if (result.status !== 0) return 'unknown';
  return result.stdout.trim();
}

function collectKeyFileTargets(pkg) {
  const targets = new Map();

  function add(label, target) {
    if (typeof target !== 'string') return;
    const normalized = target.replace(/^\.\//, '');
    if (!normalized || normalized.includes('*')) return;
    const existing = targets.get(normalized);
    if (existing) {
      existing.labels.push(label);
      return;
    }
    targets.set(normalized, { labels: [label], path: normalized });
  }

  add('main', pkg.main);
  add('types', pkg.types);

  for (const [binName, binTarget] of Object.entries(pkg.bin ?? {})) {
    add(`bin ${binName}`, binTarget);
  }

  function visitExports(value, label) {
    if (typeof value === 'string') {
      add(label, value);
      return;
    }
    if (!value || typeof value !== 'object') return;

    for (const [key, nested] of Object.entries(value)) {
      visitExports(nested, `${label} ${key}`);
    }
  }

  for (const [exportName, exportValue] of Object.entries(pkg.exports ?? {})) {
    visitExports(exportValue, `export ${exportName}`);
  }

  return [...targets.values()];
}

function inspectTarball({ name, version, tarball }, releaseGitHead) {
  const tarballPath = resolve(repoRoot, packDestination, tarball);
  const extractDir = mkdtempSync(join(tmpdir(), 'officeclaw-npm-publish-summary-'));

  try {
    runCommand(tar, ['-xzf', tarballPath, '-C', extractDir], { capture: true });
    const packageDir = join(extractDir, 'package');
    const packageJsonPath = join(packageDir, 'package.json');
    const pkg = readJson(packageJsonPath);
    const packageGitHead = pkg.gitHead ?? releaseGitHead;
    const gitHeadSource = pkg.gitHead ? 'package' : 'current';
    const tarballHash = hashFile(tarballPath, 'sha512');
    const packageJsonHash = hashFile(packageJsonPath);
    const lines = [``, `[release:npm-open-source] tarball summary: ${pkg.name}@${pkg.version}`];

    if (pkg.name !== name || pkg.version !== version) {
      lines.push(`[release:npm-open-source] manifest mismatch: expected ${name}@${version}`);
    }
    lines.push(`  tarball: ${relative(repoRoot, tarballPath)} sha512=${shortHash(tarballHash)}`);
    lines.push(`  gitHead: ${packageGitHead}${gitHeadSource === 'current' ? ' (current HEAD)' : ''}`);
    lines.push(`  package.json: sha256=${shortHash(packageJsonHash)}`);

    for (const { labels, path } of collectKeyFileTargets(pkg)) {
      const filePath = join(packageDir, path);
      const labelText = labels.join(', ');
      try {
        if (!statSync(filePath).isFile()) {
          lines.push(`  ${path} [${labelText}] missing`);
          continue;
        }
        lines.push(`  ${path} [${labelText}] sha256=${shortHash(hashFile(filePath))}`);
      } catch {
        lines.push(`  ${path} [${labelText}] missing`);
      }
    }

    return {
      gitHead: packageGitHead,
      lines,
      name: pkg.name,
      tarball: relative(repoRoot, tarballPath),
      tarballHash,
      version: pkg.version,
    };
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
}

function writeTarballSummary(manifest, releaseGitHead) {
  const packages = manifest.packages.map((entry) => inspectTarball(entry, releaseGitHead));
  const text = [
    '[release:npm-open-source] publish input summary',
    ...packages.flatMap((entry) => entry.lines),
    '',
  ].join('\n');

  writeFileSync(publishSummaryPath, text);
  return { packages, path: publishSummaryPath, text };
}

function printTarballSummary(summary) {
  console.log(`\n${summary.text.trimEnd()}`);
  console.log(`[release:npm-open-source] publish input summary saved to ${relative(repoRoot, summary.path)}`);
}

function printFinalTarballSummary(summary) {
  console.log(`\n[release:npm-open-source] publish input summary saved to ${relative(repoRoot, summary.path)}`);
  console.log('[release:npm-open-source] tarball quick summary');
  for (const entry of summary.packages) {
    console.log(
      `  ${entry.name}@${entry.version} ${entry.tarball} sha512=${shortHash(entry.tarballHash)} gitHead=${shortHash(
        entry.gitHead,
      )}`,
    );
  }
}

function packageVersionIsPublished(packageName, version) {
  const result = run(['view', `${packageName}@${version}`, 'version', '--json'], {
    allowFailure: true,
    capture: true,
  });

  if (result.status === 0) return true;

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  if (/E404|404 Not Found|No match found|ERR_PNPM_NO_MATCHING_VERSION/.test(output)) {
    return false;
  }

  console.error(output.trim());
  process.exit(result.status ?? 1);
}

function gitTagExists(tagName) {
  const result = spawnSync('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${tagName}`], {
    cwd: repoRoot,
    stdio: 'ignore',
  });

  return result.status === 0;
}

function ensureGitTag(packageName, version) {
  const tagName = `${packageName}@${version}`;
  if (gitTagExists(tagName)) return;

  const result = spawnSync('git', ['tag', tagName], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const skipSmoke = process.env.SKIP_NPM_OPEN_SOURCE_SMOKE === '1' || process.argv.includes('--skip-smoke');
const localOnly = process.argv.includes('--local-only');
const releaseGitHead = currentGitHead();

run(['build:npm-open-source']);

const checkArgs = [
  'scripts/check-open-source-npm-packages.mjs',
  '--pack-destination',
  packDestination,
  '--keep-packs',
  '--clean-pack-destination',
];
if (releaseGitHead !== 'unknown') {
  checkArgs.push('--git-head', releaseGitHead);
}

if (skipSmoke) {
  console.log('[release:npm-open-source] skipping smoke:npm-open-source');
} else {
  checkArgs.push('--smoke-install');
}

runNode(checkArgs);
const manifest = readJson(packManifestPath);
const publishSummary = writeTarballSummary(manifest, releaseGitHead);
printTarballSummary(publishSummary);

if (localOnly) {
  console.log('[release:npm-open-source] local-only mode completed; remote publish skipped');
} else {
  for (const { name, version, tarball } of manifest.packages) {
    if (packageVersionIsPublished(name, version)) {
      console.log(`[release:npm-open-source] ${name}@${version} already published; skipping`);
      continue;
    }

    const tarballPath = resolve(repoRoot, packDestination, tarball);
    console.log(`[release:npm-open-source] publishing ${name}@${version} from ${relative(repoRoot, tarballPath)}`);
    run(['publish', tarballPath, '--access', 'public', '--no-git-checks', '--ignore-scripts']);
    ensureGitTag(name, version);
  }
}

printFinalTarballSummary(publishSummary);
console.log(`[release:npm-open-source] packs kept in ${packDestination}`);
