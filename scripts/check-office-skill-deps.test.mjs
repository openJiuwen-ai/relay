/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function readText(path) {
  return readFileSync(path, 'utf8');
}

const wheelhousePath = join(repoRoot, 'packaging', 'windows', 'python-runtime-wheelhouse.json');
const buildScriptPath = join(repoRoot, 'scripts', 'build-windows-installer.mjs');
const installScriptPath = join(repoRoot, 'scripts', 'install.ps1');
const startWindowsScriptPath = join(repoRoot, 'scripts', 'start-windows.ps1');
const startDevScriptPath = join(repoRoot, 'scripts', 'start-dev.sh');
const helperScriptPath = join(repoRoot, 'scripts', 'ensure-office-skill-node-deps.mjs');
const minimaxPdfPackagePath = join(repoRoot, 'office-claw-skills', 'minimax-pdf', 'package.json');
const frontendDevPackagePath = join(repoRoot, 'office-claw-skills', 'frontend-dev', 'package.json');

const wheelhouse = JSON.parse(readText(wheelhousePath));
const wheelhousePackages = new Set(wheelhouse.groups.flatMap((group) => group.packages ?? []));
const buildScript = readText(buildScriptPath);
const installScript = readText(installScriptPath);
const startWindowsScript = readText(startWindowsScriptPath);
const startDevScript = readText(startDevScriptPath);
const helperScript = readText(helperScriptPath);
const minimaxPdfPackage = JSON.parse(readText(minimaxPdfPackagePath));
const frontendDevPackage = JSON.parse(readText(frontendDevPackagePath));

test('office skills Python runtime dependencies are explicitly bundled', () => {
  for (const pkg of [
    'python-docx',
    'pypdf',
    'pdfplumber',
    'pandas',
    'reportlab',
    'openpyxl',
    'xlsxwriter',
    'requests',
    'pillow',
    'PyYAML',
    'coze_workload_identity',
  ]) {
    assert.equal(wheelhousePackages.has(pkg), true, `wheelhouse missing ${pkg}`);
    assert.match(buildScript, new RegExp(`['"]${pkg.replaceAll('.', '\\.')}['"]`), `build script missing ${pkg}`);
  }
});

test('office skill package manifests exist for local Node-based dependencies', () => {
  assert.equal(existsSync(minimaxPdfPackagePath), true, 'minimax-pdf package.json missing');
  assert.equal(existsSync(frontendDevPackagePath), true, 'frontend-dev package.json missing');
  assert.equal(minimaxPdfPackage.dependencies.playwright, '1.57.0');
  assert.equal(frontendDevPackage.dependencies.react, '^18.2.0');
  assert.equal(frontendDevPackage.dependencies['@react-three/fiber'], '^8.17.10');
});

test('Windows bundle staging installs office skill package directories and shared Playwright browsers', () => {
  assert.match(
    buildScript,
    /function getOfficeSkillPackageDirs\(skillsRoot\)/,
    'missing office skill package directory scanner',
  );
  assert.match(
    buildScript,
    /readdirSync\(skillsRoot, \{ withFileTypes: true \}\)/,
    'bundle build should scan skill directories dynamically',
  );
  assert.match(
    buildScript,
    /existsSync\(join\(skillDir, 'package\.json'\)\)/,
    'bundle build should detect skill package manifests',
  );
  assert.match(
    buildScript,
    /runWindowsNpmInstall\(windowsNode\.npmCmdPath, toWindowsPath\(skillDir\)\)/,
    'bundle build should install each skill package directory',
  );
  assert.match(
    buildScript,
    /PLAYWRIGHT_BROWSERS_PATH: toWindowsPath\(playwrightBrowsersPath\)/,
    'bundle build should pin a shared Playwright browsers path',
  );
  assert.match(
    buildScript,
    /run\(windowsNode\.npxCmdPath, \['playwright', 'install', 'chromium'\]/,
    'bundle build should install Playwright Chromium for skill packages',
  );
});

test('runtime startup and install flows invoke the office skill dependency helper', () => {
  assert.match(
    installScript,
    /Ensure-OfficeSkillNodeDependencies -ProjectRoot \$ProjectRoot/,
    'install.ps1 must install office skill runtime dependencies',
  );
  assert.match(
    startWindowsScript,
    /Ensure-OfficeSkillNodeDependencies -ProjectRoot \$ProjectRoot/,
    'start-windows.ps1 must refresh office skill runtime dependencies',
  );
  assert.match(
    startWindowsScript,
    /\$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path \$ProjectRoot "office-claw-skills\\\.playwright-browsers"/,
    'start-windows.ps1 must export PLAYWRIGHT_BROWSERS_PATH',
  );
  assert.match(
    startDevScript,
    /node "\$PROJECT_DIR\/scripts\/ensure-office-skill-node-deps\.mjs" --quiet/,
    'start-dev.sh must refresh office skill runtime dependencies',
  );
});

test('office skill dependency helper maintains a shared Playwright browser cache', () => {
  assert.match(helperScript, /const SKILL_STAMP_FILE = '\.office-claw-node-deps\.json'/);
  assert.match(helperScript, /function hasPlaywrightDependency\(pkg\)/);
  assert.match(helperScript, /const playwrightBrowsersPath = join\(options\.skillsRoot, '\.playwright-browsers'\)/);
  assert.match(helperScript, /run\(npxCommand, \['playwright', 'install', 'chromium'\]/);
});
