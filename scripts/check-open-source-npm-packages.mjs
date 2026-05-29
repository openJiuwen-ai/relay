#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */


import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXCLUDED_PACKAGES, PUBLIC_PACKAGES } from './open-source-npm-package-list.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const pnpm = 'pnpm';
const tar = process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar';
const shouldSmokeInstall = process.argv.includes('--smoke-install');
const shouldKeepPacks = process.argv.includes('--keep-packs');
const shouldCleanPackDestination = process.argv.includes('--clean-pack-destination');
const packDestinationArg = readArgValue('--pack-destination');
const packDestination = packDestinationArg ? resolve(repoRoot, packDestinationArg) : null;
const packGitHead = readArgValue('--git-head') ?? currentGitHead();
const packManifestFileName = 'open-source-npm-packs.json';
const publicPackageSet = new Set(PUBLIC_PACKAGES);
const excludedPackageSet = new Set(Object.keys(EXCLUDED_PACKAGES));
const forbiddenPackageNames = [...excludedPackageSet];
const forbiddenSpecPatterns = ['workspace:', 'file:', 'link:'];

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function currentGitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: options.env ?? process.env,
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${output ? `\n${output}` : ''}`);
  }

  return result;
}

function findPackageJsonFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') continue;

    const child = join(dir, entry.name);
    const packageJsonPath = join(child, 'package.json');
    try {
      if (statSync(packageJsonPath).isFile()) {
        results.push(packageJsonPath);
      }
    } catch {
      results.push(...findPackageJsonFiles(child));
      continue;
    }

    results.push(...findPackageJsonFiles(child));
  }
  return results;
}

function dependencyEntries(pkg) {
  return [
    ...Object.entries(pkg.dependencies ?? {}),
    ...Object.entries(pkg.peerDependencies ?? {}),
    ...Object.entries(pkg.optionalDependencies ?? {}),
  ];
}

function checkNoForbiddenSpecs(pkg, context) {
  for (const [depName, version] of dependencyEntries(pkg)) {
    if (forbiddenPackageNames.includes(depName)) {
      fail(`${context} depends on excluded package ${depName}`);
    }
    if (typeof version === 'string' && forbiddenSpecPatterns.some((pattern) => version.startsWith(pattern))) {
      fail(`${context} dependency ${depName} uses forbidden spec ${version}`);
    }
  }
}

function checkNoExcludedDependencies(pkg, context) {
  for (const [depName] of dependencyEntries(pkg)) {
    if (forbiddenPackageNames.includes(depName)) {
      fail(`${context} depends on excluded package ${depName}`);
    }
  }
}

function collectExportTargets(exportsField) {
  const targets = [];

  function visit(value) {
    if (typeof value === 'string') {
      targets.push(value);
      return;
    }
    if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) visit(nested);
    }
  }

  visit(exportsField);
  return targets.filter((target) => target.startsWith('./'));
}

function fileExistsInExtractedPackage(extractedPackageDir, target) {
  const normalized = target.replace(/^\.\//, '');
  if (normalized.includes('*')) {
    const prefix = normalized.slice(0, normalized.indexOf('*'));
    return readdirSync(join(extractedPackageDir, dirname(prefix)), { recursive: true }).length > 0;
  }
  try {
    return statSync(join(extractedPackageDir, normalized)).isFile();
  } catch {
    return false;
  }
}

function checkRequiredPackageFile(packageDir, context, fileName) {
  try {
    if (statSync(join(packageDir, fileName)).isFile()) return;
  } catch {
    // Report the same missing-file failure for absent and unreadable files.
  }

  fail(`${context} is missing ${fileName}`);
}

function packageDependsOn(pkg, dependencyName) {
  return dependencyEntries(pkg).some(([depName]) => depName === dependencyName);
}

function checkApiServerMetadata(pkg, context) {
  if (packageDependsOn(pkg, '@openjiuwen/relay-storage-sqlite')) {
    fail(`${context} must not depend on @openjiuwen/relay-storage-sqlite`);
  }
  if (String(pkg.scripts?.build ?? '').includes('@openjiuwen/relay-storage-sqlite')) {
    fail(`${context} build script must not build @openjiuwen/relay-storage-sqlite`);
  }
}

function checkPackageMetadata(packageDir, pkg) {
  const context = `${pkg.name} (${relative(repoRoot, packageDir)})`;

  if (pkg.private === true) fail(`${context} must not be private`);
  if (!pkg.license) fail(`${context} is missing license`);
  if (pkg.name?.startsWith('@') && pkg.publishConfig?.access !== 'public')
    fail(`${context} must set publishConfig.access = public`);

  for (const fileName of ['README.md', 'LICENSE']) checkRequiredPackageFile(packageDir, context, fileName);

  checkNoExcludedDependencies(pkg, context);
  if (pkg.name === '@openjiuwen/relay-api-server') checkApiServerMetadata(pkg, context);
}

function validateWorkspacePackages() {
  const packageJsonFiles = findPackageJsonFiles(join(repoRoot, 'packages'));
  const byName = new Map();

  for (const packageJsonPath of packageJsonFiles) {
    const pkg = readJson(packageJsonPath);
    if (!pkg.name) continue;
    const packageDir = dirname(packageJsonPath);
    byName.set(pkg.name, { packageDir, pkg });

    if (!publicPackageSet.has(pkg.name) && !excludedPackageSet.has(pkg.name)) {
      fail(`${pkg.name} is not classified as public or excluded`);
    }
  }

  for (const packageName of PUBLIC_PACKAGES) {
    const entry = byName.get(packageName);
    if (!entry) {
      fail(`public package ${packageName} is missing from workspace`);
      continue;
    }
    checkPackageMetadata(entry.packageDir, entry.pkg);
  }

  for (const packageName of excludedPackageSet) {
    const entry = byName.get(packageName);
    if (!entry) continue;
    if (entry.pkg.private !== true) {
      warn(
        `${packageName} is excluded from open-source npm publish but is not private: true (${EXCLUDED_PACKAGES[packageName]})`,
      );
    }
  }

  return byName;
}

function packWorkspacePackage(packageDir, packDir, gitHead) {
  const packageJsonPath = join(packageDir, 'package.json');
  const originalPackageJson = readFileSync(packageJsonPath, 'utf8');
  const packArgs = ['pack', '--pack-destination', packDir];

  function runPack() {
    const jsonResult = spawnSync(pnpm, ['pack', '--json', '--pack-destination', packDir], {
      cwd: packageDir,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (jsonResult.status === 0) return;
    const combinedOutput = `${jsonResult.stdout ?? ''}${jsonResult.stderr ?? ''}`;
    if (!combinedOutput.includes('Unknown option')) {
      process.stderr.write(jsonResult.stdout);
      process.stderr.write(jsonResult.stderr);
      fail(`pnpm pack --json --pack-destination ${packDir} failed`);
      return;
    }
    run(pnpm, packArgs, { cwd: packageDir, capture: true });
  }

  if (!gitHead) {
    runPack();
    return;
  }

  const pkg = JSON.parse(originalPackageJson);
  pkg.gitHead = gitHead;

  try {
    writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
    runPack();
  } finally {
    writeFileSync(packageJsonPath, originalPackageJson);
  }
}

function packPublicPackages(byName, packDir, gitHead) {
  const tarballs = [];
  if (shouldCleanPackDestination) {
    for (const name of readdirSync(packDir)) {
      if (name.endsWith('.tgz') || name === packManifestFileName) unlinkSync(join(packDir, name));
    }
  }

  for (const packageName of PUBLIC_PACKAGES) {
    const entry = byName.get(packageName);
    if (!entry) continue;

    console.log(`\n[check:npm-open-source] packing ${packageName}`);
    const before = new Set(readdirSync(packDir));
    packWorkspacePackage(entry.packageDir, packDir, gitHead);
    const after = readdirSync(packDir).filter((name) => name.endsWith('.tgz') && !before.has(name));

    if (after.length !== 1) {
      fail(`${packageName} produced ${after.length} new tarballs`);
      continue;
    }
    tarballs.push({
      packageName,
      packageDir: entry.packageDir,
      gitHead,
      tarball: join(packDir, after[0]),
    });
  }

  return tarballs;
}

function writePackManifest(packedPackages, packDir) {
  const packages = packedPackages.map(({ packageDir, gitHead, tarball }) => {
    const pkg = readJson(join(packageDir, 'package.json'));
    return {
      name: pkg.name,
      version: pkg.version,
      gitHead,
      tarball: basename(tarball),
    };
  });

  writeFileSync(join(packDir, packManifestFileName), `${JSON.stringify({ packages }, null, 2)}\n`);
}

function checkTarball(tarball, extractRoot) {
  const targetDir = mkdtempSync(join(extractRoot, 'pkg-'));
  run(tar, ['-xzf', tarball, '-C', targetDir], { capture: true });

  const extractedPackageDir = join(targetDir, 'package');
  const pkg = readJson(join(extractedPackageDir, 'package.json'));
  const context = `${pkg.name} tarball`;

  checkNoForbiddenSpecs(pkg, context);

  if (pkg.name === '@openjiuwen/relay-api-server') {
    for (const [depName] of dependencyEntries(pkg)) {
      if (depName === '@openjiuwen/relay-storage-sqlite') {
        fail(`${context} must not depend on @openjiuwen/relay-storage-sqlite`);
      }
    }
  }

  for (const fieldName of ['main', 'types']) {
    if (pkg[fieldName] && !fileExistsInExtractedPackage(extractedPackageDir, pkg[fieldName])) {
      fail(`${context} ${fieldName} target does not exist: ${pkg[fieldName]}`);
    }
  }

  for (const target of collectExportTargets(pkg.exports)) {
    if (!fileExistsInExtractedPackage(extractedPackageDir, target)) {
      fail(`${context} exports target does not exist: ${target}`);
    }
  }
}

function fileDependencySpec(filePath) {
  return `file:${filePath.replace(/\\/g, '/')}`;
}

function smokeInstall(packedPackages, smokeDir) {
  const localPackageSpecs = Object.fromEntries(
    packedPackages.map(({ packageName, tarball }) => [packageName, fileDependencySpec(tarball)]),
  );
  writeFileSync(
    join(smokeDir, 'package.json'),
    `${JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: localPackageSpecs,
        pnpm: {
          overrides: localPackageSpecs,
        },
      },
      null,
      2,
    )}\n`,
  );
  run(pnpm, ['install', '--ignore-scripts'], { cwd: smokeDir });

  const smokeScript = `await import('@openjiuwen/relay-shared');
await import('@openjiuwen/relay-api-server-contracts');
await import('@openjiuwen/relay-web-contracts');
await import('@openjiuwen/relay-core');
await import('@openjiuwen/relay-storage-sqlite');
await import('@openjiuwen/relay-mcp-server');
await import('@openjiuwen/relay-api-server/server');
await import('@openjiuwen/relay-web');
await import('@openjiuwen/relay-web/components');
await import('@openjiuwen/relay-web/config');
await import('@openjiuwen/relay-web/constants');
await import('@openjiuwen/relay-web/hooks');
await import('@openjiuwen/relay-web/lib');
await import('@openjiuwen/relay-web/pages');
await import('@openjiuwen/relay-web/services');
await import('@openjiuwen/relay-web/shared');
await import('@openjiuwen/relay-web/stores');
await import('@openjiuwen/relay-web/utils');
console.log('import-smoke-ok');
`;
  const smokeFile = join(smokeDir, 'smoke.mjs');
  writeFileSync(smokeFile, smokeScript);
  run(process.execPath, [smokeFile], { cwd: smokeDir });
}

const tempRoot = mkdtempSync(join(tmpdir(), 'officeclaw-npm-open-source-'));

try {
  const byName = validateWorkspacePackages();
  if (failures.length === 0) {
    const packDir = packDestination ?? join(tempRoot, 'packs');
    const extractRoot = join(tempRoot, 'extract');
    const smokeDir = join(tempRoot, 'smoke');
    for (const dir of [packDir, extractRoot, smokeDir]) {
      mkdirSync(dir, { recursive: true });
    }

    if (!packGitHead) warn('gitHead could not be resolved; packed package.json files will not include gitHead');

    const packedPackages = packPublicPackages(byName, packDir, packGitHead);
    for (const { tarball } of packedPackages) checkTarball(tarball, extractRoot);
    if (failures.length === 0 && shouldSmokeInstall) {
      smokeInstall(packedPackages, smokeDir);
    }
    if (failures.length === 0 && shouldKeepPacks && packDestination) {
      writePackManifest(packedPackages, packDir);
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  if (!shouldKeepPacks) {
    rmSync(tempRoot, { recursive: true, force: true });
  } else {
    rmSync(join(tempRoot, 'extract'), { recursive: true, force: true });
    rmSync(join(tempRoot, 'smoke'), { recursive: true, force: true });
  }
}

for (const message of warnings) {
  console.warn(`[check:npm-open-source] warning: ${message}`);
}

if (failures.length > 0) {
  console.error('\n[check:npm-open-source] failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

if (shouldKeepPacks && packDestination) {
  console.log(`[check:npm-open-source] packs kept in ${packDestination}`);
}

console.log(`\n[check:npm-open-source] ok${shouldSmokeInstall ? ' with smoke install' : ''}`);
