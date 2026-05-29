/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  normalizeNodeVersion,
  pickRedisReleaseAsset,
  shouldCopyRepoPath,
  shouldUseCommandShell,
  WINDOWS_MANAGED_TOP_LEVEL_PATHS,
  WINDOWS_PRESERVE_PATHS,
} from '../../../scripts/build-windows-installer.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, '..', '..', '..');
const buildScript = readFileSync(join(repoRoot, 'scripts', 'build-windows-installer.mjs'), 'utf8');
const launcherBuildScript = readFileSync(join(repoRoot, 'scripts', 'build-windows-webview2-launcher.ps1'), 'utf8');
const launcherSource = readFileSync(join(repoRoot, 'packaging', 'windows', 'desktop', 'OfficeClawDesktop.cs'), 'utf8');
const apiClientSource = readFileSync(join(repoRoot, 'packages', 'web', 'src', 'utils', 'api-client.ts'), 'utf8');
const nsisScript = readFileSync(join(repoRoot, 'packaging', 'windows', 'installer.nsi'), 'utf8');
const windowsInstallHelpersScript = readFileSync(join(repoRoot, 'scripts', 'install-windows-helpers.ps1'), 'utf8');
const packageManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const vendorSyncScript = readFileSync(join(repoRoot, 'scripts', 'sync-jiuwenclaw-vendor.mjs'), 'utf8');
const jiuwenSourceConfig = JSON.parse(
  readFileSync(join(repoRoot, 'packaging', 'windows', 'jiuwenclaw-source.json'), 'utf8'),
);
const ciWorkflow = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');

test('Windows offline installer keeps mutable state outside managed payload cleanup', () => {
  assert.deepEqual(WINDOWS_PRESERVE_PATHS, ['.env', 'office-claw-config.json', 'data', 'logs', '.office-claw', 'workspace']);
  assert.ok(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('packages'));
  assert.ok(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('scripts'));
  assert.ok(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('office-claw-skills'));
  assert.ok(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('tools'));
  assert.ok(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('installer-seed'));
  assert.ok(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('vendor'));
  assert.equal(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('docs'), false);
  assert.equal(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('README.md'), false);
  assert.equal(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('AGENTS.md'), false);
  assert.equal(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('CLAUDE.md'), false);
  assert.equal(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('GEMINI.md'), false);
  assert.equal(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('data'), false);
  assert.equal(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('.office-claw'), false);
  assert.equal(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('inspiration-preset.json'), false);
  assert.equal(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('inspiration-products'), false);
  assert.equal(WINDOWS_MANAGED_TOP_LEVEL_PATHS.includes('inspiration-thumbnails'), false);
});

test('Windows offline installer stages inspiration assets inside the API runtime payload', () => {
  assert.doesNotMatch(buildScript, /'inspiration-preset\.json'/);
  assert.doesNotMatch(buildScript, /'inspiration-products'/);
  assert.doesNotMatch(buildScript, /'inspiration-thumbnails'/);
  assert.match(buildScript, /copyIfPresent\(join\(sourceDir, 'assets'\), join\(targetDir, 'assets'\)\)/);
});

test('Windows WebView2 launcher build resolves System.Speech outside the framework root', () => {
  assert.match(launcherBuildScript, /function Resolve-FrameworkReference/);
  assert.match(launcherBuildScript, /WPF\\\$assemblyFile/);
  assert.match(launcherBuildScript, /Microsoft\.NET\\assembly\\GAC_MSIL/);
  assert.match(
    launcherBuildScript,
    /Resolve-FrameworkReference -FrameworkDir \$frameworkDir -AssemblyName "System\.Speech\.dll"/,
  );
});

test('Windows bundled API runtime includes the CLI entry used by start-windows', () => {
  assert.match(buildScript, /start: 'node dist\/cli\.js'/);
  assert.match(buildScript, /writeFileSync\(\s*join\(targetDir, 'dist', 'cli\.js'\)/);
  assert.match(buildScript, /"import \{ main \} from '\.\/index\.js';"/);
  assert.match(buildScript, /console\.error\('\[api\] Fatal error:', err\)/);
});

test('Windows offline installer normalizes bundled Node versions and filters copied repo paths', () => {
  assert.equal(normalizeNodeVersion('22.20.0'), 'v22.20.0');
  assert.equal(normalizeNodeVersion('v20.11.1'), 'v20.11.1');

  assert.equal(shouldCopyRepoPath('packages/api/src/index.ts'), true);
  assert.equal(shouldCopyRepoPath('docs/README.md'), true);
  assert.equal(shouldCopyRepoPath('.env'), false);
  assert.equal(shouldCopyRepoPath('data/evidence.sqlite'), false);
  assert.equal(shouldCopyRepoPath('logs/api.log'), false);
  assert.equal(shouldCopyRepoPath('uploads'), false);
  assert.equal(shouldCopyRepoPath('uploads/avatar.png'), false);
  assert.equal(shouldCopyRepoPath('workspace'), false);
  assert.equal(shouldCopyRepoPath('workspace/project/file.ts'), false);
  assert.equal(shouldCopyRepoPath('node_modules/next/package.json'), false);
  assert.equal(shouldCopyRepoPath('packages/api/dist/index.js'), false);
  assert.equal(shouldCopyRepoPath('packages/web/.next/server.js'), false);
  assert.equal(shouldUseCommandShell('pnpm', 'win32'), true);
  assert.equal(shouldUseCommandShell('powershell.exe', 'win32'), true);
  assert.equal(shouldUseCommandShell('C:\\tools\\pnpm.cmd', 'win32'), false);
  assert.equal(shouldUseCommandShell('pnpm', 'linux'), false);
});

test('Windows offline installer resolves uv before installing Python deps', () => {
  assert.match(buildScript, /const where = spawnSync\('where\.exe', \[cmd\]/);
  assert.match(buildScript, /return resolved\.trim\(\)/);
  assert.match(buildScript, /run\(uvCommand, \['pip', 'install', '--python', pythonExe, \.\.\.allExternalDeps\]\)/);
});

test('Windows offline installer signs launcher and setup when signing is enabled', () => {
  assert.match(buildScript, /function resolveWindowsSigningConfig\(\)/);
  assert.match(buildScript, /WINDOWS_SIGNING_ENABLED/);
  assert.match(buildScript, /WINDOWS_SIGNING_REQUIRED/);
  assert.match(buildScript, /WINDOWS_SIGNTOOL_PATH/);
  assert.match(buildScript, /WINDOWS_SIGN_CERT_THUMBPRINT/);
  assert.match(buildScript, /WINDOWS_SIGN_CERT_PATH/);
  assert.match(buildScript, /WINDOWS_SIGN_CERT_PASSWORD/);
  assert.match(buildScript, /http:\/\/timestamp\.digicert\.com/);
  assert.match(buildScript, /args\[index - 1\] === '\/p' \? '<redacted>' : arg/);
  assert.match(buildScript, /signtool\.exe/);
  assert.match(buildScript, /'sign', '\/fd', 'SHA256', '\/tr'/);
  assert.match(buildScript, /'verify', '\/pa', '\/tw'/);
  assert.match(
    buildScript,
    /signWindowsExecutable\(launcherExe, 'OfficeClaw\.exe', signingConfig\);[\s\S]*?createPayload7z\(bundleDir, sevenZip\.path, payload7z\);/,
  );
  assert.match(
    buildScript,
    /invokeMakensis\(installerScript, outputExe, payload7z, sevenZip\.path, packageJson\.version\);[\s\S]*?signWindowsExecutable\(outputExe, 'Windows installer', signingConfig\);/,
  );
});

test('Windows offline installer prefers plain Redis portable zips before service bundles', () => {
  const asset = pickRedisReleaseAsset([
    { name: 'Redis-8.2.1-Windows-x64-msys2-with-Service.zip', browser_download_url: 'https://example.com/service.zip' },
    { name: 'Redis-8.2.1-Windows-x64-cygwin.zip', browser_download_url: 'https://example.com/cygwin.zip' },
    { name: 'Redis-8.2.1-Windows-x64-msys2.zip', browser_download_url: 'https://example.com/msys2.zip' },
  ]);
  assert.equal(asset?.name, 'Redis-8.2.1-Windows-x64-msys2.zip');
});

test('Windows offline bundle builder deploys production packages and bundles Windows runtimes', () => {
  assert.match(buildScript, /WINDOWS_RUNTIME_NPM_ARGS = \[\s*'install',\s*'--omit=dev'/);
  assert.match(
    buildScript,
    /const entries = \[\s*'office-claw-skills',\s*'LICENSE',\s*'\.env\.example',\s*'\.inner\.env',\s*'office-claw-template\.json',\s*'modelarts-preset\.json',\s*'pnpm-workspace\.yaml',\s*\]/,
  );
  assert.match(buildScript, /RUNTIME_SCRIPT_FILES = \[/);
  assert.match(buildScript, /stageRuntimePackageTemplate\(targetRootDir, 'shared'/);
  assert.match(buildScript, /const API_RUNTIME_EXTERNAL_DEPENDENCIES = \[/);
  assert.match(buildScript, /'better-sqlite3'/);
  assert.match(buildScript, /'sqlite-vec'/);
  assert.match(buildScript, /await stageBundledApiRuntime\(targetRootDir\)/);
  assert.match(buildScript, /API_RUNTIME_WORKSPACE_DEPENDENCIES = \{/);
  assert.match(buildScript, /'@office-claw\/plugin-api': 'file:\.\.\/plugin\/api'/);
  assert.match(buildScript, /'@office-claw\/sqlite-adapter': 'file:\.\.\/sqlite-adapter\/api'/);
  assert.match(buildScript, /stageRuntimePackageFromSource\(targetRootDir, \['sqlite-adapter', 'api'\], \['sqlite-adapter', 'api'\]/);
  assert.match(buildScript, /function resolveLocalEsbuildCommand\(\)/);
  assert.match(buildScript, /const esbuildCommand = resolveLocalEsbuildCommand\(\)/);
  assert.match(buildScript, /'--bundle'/);
  assert.match(buildScript, /'--format=esm'/);
  assert.match(
    buildScript,
    /API_RUNTIME_EXTERNAL_DEPENDENCIES\.map\(\(dependency\) => `--external:\$\{dependency\}`\)/,
  );
  assert.match(buildScript, /createRequire as __createRequire/);
  assert.match(buildScript, /fileURLToPath as __fileURLToPath/);
  assert.match(buildScript, /const __dirname = __pathDirname\(__filename\)/);
  assert.match(buildScript, /createBundledApiRuntimePackageJson/);
  assert.match(buildScript, /API bundling unavailable, falling back to staged dist/);
  assert.match(buildScript, /await stageBundledMcpServerRuntime\(targetRootDir\)/);
  assert.match(buildScript, /stageStandaloneWebRuntime\(targetRootDir\)/);
  assert.match(buildScript, /'@office-claw\/shared': 'file:\.\.\/shared'/);
  assert.match(buildScript, /WEB_STATIC_SERVER_SOURCE = join\(repoRoot, 'packages', 'web', 'scripts', 'packaged-static-server\.cjs'\)/);
  assert.match(buildScript, /copyFileSync\(WEB_STATIC_SERVER_SOURCE, join\(targetDir, 'server\.cjs'\)\)/);
  assert.match(buildScript, /function createStandaloneWebRuntimePackageJson\(sourcePath\)/);
  assert.match(buildScript, /function resolveInstalledPackageVersionFrom\(nodeModulesDirs, packageName\)/);
  assert.match(buildScript, /cpSync\(WEB_DIST_DIR, join\(targetDir, 'dist'\), \{ recursive: true, force: true \}\)/);
  assert.match(buildScript, /runWindowsNpmInstall\(windowsNode\.npmCmdPath/);
  assert.match(buildScript, /const WINDOWS_RUNTIME_PACKAGE_DIRS = \[/);
  assert.match(buildScript, /join\('sqlite-adapter', 'api'\)/);
  assert.match(buildScript, /stageInstallerSeed\(bundleDir\)/);
  assert.match(buildScript, /__pycache__/);
  assert.match(buildScript, /py_compile\.PycInvalidationMode\.UNCHECKED_HASH/);
  assert.match(buildScript, /run\('pnpm', \['--filter', '@office-claw\/shared', 'run', 'build'\]\)/);
  assert.match(buildScript, /shell: options\.shell \?\? shouldUseCommandShell\(command\)/);
  assert.match(buildScript, /materializeWorkspaceDependencies\(bundlePackagesDir, packageName\)/);
  assert.match(buildScript, /lstatSync\(linkPath\)\.isSymbolicLink\(\)/);
  assert.match(buildScript, /powershell\.exe/);
  assert.match(buildScript, /--package-lock=false/);
  assert.match(buildScript, /--loglevel=error/);
  assert.match(
    buildScript,
    /removeNamedDirectoriesRecursive\(targetDir, \['test', 'tests', '__tests__', 'example', 'examples', 'doc', 'docs'\]\)/,
  );
  assert.match(buildScript, /fileName === 'package-lock\.json' \|\| fileName === '\.package-lock\.json'/);
  assert.match(buildScript, /removePaths\(targetDir, \['corepack', 'include', 'share'\]\)/);
  assert.match(buildScript, /computeMaxRelativePathLength\(bundleDir\)/);
  assert.match(buildScript, /node-\$\{options\.nodeVersion\}-win-x64\.zip/);
  assert.match(buildScript, /redis-windows\/redis-windows\/releases\/latest/);
  assert.match(buildScript, /resolveArchiveOverride\(options\.redisZipUrl, 'redis-windows\.zip'\)/);
  assert.match(buildScript, /parsed\?\.protocol === 'file:'/);
  assert.match(buildScript, /copyFileSync\(download\.localPath, archivePath\)/);
  assert.match(
    buildScript,
    /If GitHub API is unreachable, rerun with --redis-zip-url <url-or-local-zip> or set CLOWDER_WINDOWS_REDIS_ZIP_URL\./,
  );
  assert.match(buildScript, /build-windows-webview2-launcher\.ps1/);
  assert.match(buildScript, /wslpath is required to build the Windows WebView2 launcher from Linux/);
  assert.match(buildScript, /Building WebView2 desktop launcher/);
  assert.match(buildScript, /Finalizing runtime bundle/);
  assert.match(buildScript, /CLOWDER_SEVENZIP_BOOTSTRAP_URL/);
  assert.match(buildScript, /join\(options\.cacheDir, '7zr\.exe'\)/);
  assert.match(buildScript, /extract7zArchive\(extraArchivePath, tempExtractDir, sevenZipExtractor\)/);
  assert.match(buildScript, /writeReleaseMetadata\(bundleDir, \{/);
});

test('Windows packaging syncs JiuwenClaw vendor before source staging', () => {
  assert.equal(packageManifest.scripts['vendor:sync:jiuwenclaw'], 'node ./scripts/sync-jiuwenclaw-vendor.mjs');
  assert.match(packageManifest.scripts['package:windows'], /^pnpm vendor:sync:jiuwenclaw && /);
  assert.match(packageManifest.scripts['package:windows:bundle'], /^pnpm vendor:sync:jiuwenclaw && /);
  assert.match(packageManifest.scripts['package:windows:jiuwen-wheel'], /^pnpm jiuwenclaw:wheel:sync && /);
  assert.match(packageManifest.scripts['package:windows:jiuwen-wheel'], /--jiuwenclaw-vendor-source wheel/);
  assert.match(packageManifest.scripts['package:windows:bundle:jiuwen-wheel'], /^pnpm jiuwenclaw:wheel:sync && /);
  assert.match(packageManifest.scripts['package:windows:bundle:jiuwen-wheel'], /--bundle-only --jiuwenclaw-vendor-source wheel/);
  assert.match(packageManifest.scripts['package:windows:python-wheelhouse'], /^pnpm vendor:sync:jiuwenclaw && /);
  assert.match(packageManifest.scripts['package:windows:python-wheelhouse:win'], /^pnpm vendor:sync:jiuwenclaw && /);
  assert.doesNotMatch(packageManifest.scripts['package:macos'], /vendor:sync:jiuwenclaw/);

  assert.equal(jiuwenSourceConfig.targetDir, 'vendor/jiuwenclaw');
  assert.ok(jiuwenSourceConfig.requiredFiles.includes('pyproject.toml'));
  assert.ok(jiuwenSourceConfig.requiredFiles.includes('jiuwenclaw/app.py'));
  assert.ok(jiuwenSourceConfig.requiredFiles.includes('scripts/jiuwenclaw.spec'));
  assert.ok(jiuwenSourceConfig.requiredFiles.includes('scripts/build-exe.ps1'));
  assert.ok(jiuwenSourceConfig.requiredFiles.includes('scripts/jiuwenclaw_exe_entry.py'));

  assert.match(vendorSyncScript, /JIUWENCLAW_GIT_URL/);
  assert.match(vendorSyncScript, /JIUWENCLAW_GIT_REF/);
  assert.match(vendorSyncScript, /JIUWENCLAW_GIT_HTTP_EXTRA_HEADER/);
  assert.match(vendorSyncScript, /function replaceDirectoryAtomically/);
  assert.match(vendorSyncScript, /\^\[0-9a-f\]\{7,40\}\$/i);
  assert.match(vendorSyncScript, /runGit\(\['fetch', '--force', '--tags', 'origin'\]/);
  assert.match(vendorSyncScript, /runGit\(\['rev-parse', '--verify', `\$\{ref\}\^\{commit\}`\]/);
  assert.match(vendorSyncScript, /SOURCE_METADATA_FILE = '\.clowder-source\.json'/);
  assert.match(vendorSyncScript, /resolvedCommit/);

  assert.match(buildScript, /function assertJiuwenClawVendorReady/);
  assert.match(buildScript, /Run "pnpm vendor:sync:jiuwenclaw"/);
  assert.match(buildScript, /const JIUWENCLAW_VENDOR_REQUIRED_FILES = \[/);
  assert.match(buildScript, /assertJiuwenClawVendorReady\(\);/);
  assert.match(buildScript, /--jiuwenclaw-vendor-source must be "source" or "wheel"/);
  assert.match(buildScript, /function stageJiuwenClawVendorFromWheel/);
  assert.match(buildScript, /materializeJiuwenClawWheelSource/);
  assert.match(buildScript, /join\(targetDir, 'jiuwenclaw'\)/);
  assert.match(buildScript, /join\(vendorDir, 'jiuwenclaw-wheel-source-manifest\.json'\)/);

  assert.match(ciWorkflow, /pnpm package:windows:bundle -- --skip-build/);
});

test('DARE build spec exposes a standalone CLI executable with mirrored packaging scripts', () => {
  const dareSpec = readFileSync(join(repoRoot, 'vendor', 'dare-cli', 'scripts', 'dare.spec'), 'utf8');
  const dareBuildScript = readFileSync(join(repoRoot, 'vendor', 'dare-cli', 'scripts', 'build-exe.ps1'), 'utf8');
  const dareEntry = readFileSync(join(repoRoot, 'vendor', 'dare-cli', 'scripts', 'dare_exe_entry.py'), 'utf8');
  const dareReadme = readFileSync(join(repoRoot, 'vendor', 'dare-cli', 'scripts', 'README-pyinstaller.md'), 'utf8');

  assert.match(dareSpec, /collect_submodules\("client"\)/);
  assert.match(dareSpec, /collect_submodules\("dare_framework"\)/);
  assert.match(dareSpec, /client\/examples\/basic\.script\.txt/);
  assert.match(dareSpec, /copy_metadata\("langchain-openai", recursive=True\)/);
  assert.match(dareSpec, /name="dare"/);
  assert.match(dareBuildScript, /Resolve-UvCommand/);
  assert.match(dareBuildScript, /\.build-venv/);
  assert.match(dareBuildScript, /requirements\.txt/);
  assert.match(dareBuildScript, /PyInstaller/);
  assert.match(dareEntry, /multiprocessing\.freeze_support/);
  assert.match(dareEntry, /sync_main/);
  assert.match(dareReadme, /dist\/dare\.exe/);
});

test('Windows WebView2 launcher build bundles the required SDK files and desktop host logic', () => {
  assert.match(launcherBuildScript, /microsoft\.web\.webview2\.\$WebView2Version\.nupkg/);
  assert.match(launcherBuildScript, /Microsoft\.Web\.WebView2\.Core\.dll/);
  assert.match(launcherBuildScript, /Microsoft\.Web\.WebView2\.WinForms\.dll/);
  assert.match(launcherBuildScript, /WebView2Loader\.dll/);
  assert.match(launcherBuildScript, /OfficeClaw\.exe/);
  assert.match(launcherBuildScript, /csc\.exe/);
  assert.match(launcherBuildScript, /\/win32icon:\$IconFile/);
  assert.match(launcherBuildScript, /lib\\net462\\Microsoft\.Web\.WebView2\.Core\.dll/);
  assert.match(launcherBuildScript, /\.NETFramework,Version=v4\.6\.2/);

  assert.match(launcherSource, /new WebView2/);
  assert.match(launcherSource, /EnsureCoreWebView2Async/);
  assert.match(launcherSource, /start-windows\.ps1/);
  assert.match(launcherSource, /stop-windows\.ps1/);
  assert.match(launcherSource, /Local\\OfficeClaw\.WebView2Desktop/);
  assert.match(launcherSource, /http:\/\/127\.0\.0\.1:/);
});

test('Windows desktop launcher reads runtime state, minimizes to tray, and exits through the tray menu', () => {
  assert.match(launcherSource, /runtime-state\.json/);
  assert.match(launcherSource, /NotifyIcon/);
  assert.match(launcherSource, /ContextMenuStrip/);
  assert.match(launcherSource, /RestoreFromExternalActivation/);
  assert.match(launcherSource, /Text = "OfficeClaw"/);
  assert.match(launcherSource, /HideToTray/);
  assert.match(launcherSource, /RequestExit/);
  assert.match(launcherSource, /TryReadRuntimeStateValue/);
  assert.match(launcherSource, /ShowBalloonTip/);
});

test('Windows desktop launcher keeps splash visible until the main WebView finishes its first successful navigation', () => {
  assert.match(launcherSource, /RevealMainWebView/);
  assert.match(launcherSource, /_webView\.SendToBack\(\)/);
  assert.match(launcherSource, /NavigationCompleted \+= \(_, eventArgs\) =>/);
  assert.match(launcherSource, /if \(!_mainWebViewShown && eventArgs\.IsSuccess\)/);
  assert.match(launcherSource, /Controls\.Remove\(_splashWebView\)/);
  assert.doesNotMatch(launcherSource, /Controls\.Clear\(\)/);
});

test('Windows startup script pins bundled config roots for packaged releases', () => {
  assert.match(buildScript, /'office-claw-template\.json'/);
  assert.match(buildScript, /'\.office-claw-release\.json'/);
  assert.match(launcherSource, /AppDomain\.CurrentDomain\.BaseDirectory/);
  const startWindowsScript = readFileSync(join(repoRoot, 'scripts', 'start-windows.ps1'), 'utf8');
  assert.doesNotMatch(startWindowsScript, /Mount-InstallerSkills/);
  assert.match(startWindowsScript, /if \(\$bundledRelease\) \{/);
  assert.match(startWindowsScript, /\$runtimeEnvOverrides\.OFFICE_CLAW_CONFIG_ROOT = \$ProjectRoot/);
  assert.match(startWindowsScript, /\$runtimeEnvOverrides\.CAT_TEMPLATE_PATH = \$bundledTemplatePath/);
  assert.match(startWindowsScript, /Set-RuntimeEnvDefault -Overrides \$runtimeEnvOverrides -Name "OFFICE_CLAW_AUTH_PROVIDER" -DefaultValue "no-auth"/);
  assert.match(startWindowsScript, /Set-RuntimeEnvDefault -Overrides \$runtimeEnvOverrides -Name "OFFICE_CLAW_EVIDENCE_PROVIDER_MODULES" -DefaultValue "@office-claw\/sqlite-adapter\/evidence"/);
  assert.match(startWindowsScript, /Set-RuntimeEnvDefault -Overrides \$runtimeEnvOverrides -Name "OFFICE_CLAW_SCHEDULER_PROVIDER_MODULES" -DefaultValue "@office-claw\/sqlite-adapter\/scheduler"/);
  assert.match(startWindowsScript, /\$webStandaloneServer = Join-Path \$ProjectRoot "packages\/web\/server\.cjs"/);
  assert.match(
    startWindowsScript,
    /\$usingStandaloneWebRuntime = \(-not \$Dev\) -and \(Test-Path \$webStandaloneServer\)/,
  );
  assert.match(startWindowsScript, /Starting Frontend \(port \$WebPort, standalone\)/);
  assert.match(startWindowsScript, /\$env:HOSTNAME = "127\.0\.0\.1"/);
  assert.match(launcherSource, /packages", "web", "dist", "index\.html"/);
  assert.match(launcherSource, /"\.office-claw-release\.json"/);
});

test('Windows packaged runtime does not mount OfficeClaw skills into external CLI skill directories', () => {
  const startWindowsScript = readFileSync(join(repoRoot, 'scripts', 'start-windows.ps1'), 'utf8');
  const installScript = readFileSync(join(repoRoot, 'scripts', 'install.ps1'), 'utf8');

  assert.doesNotMatch(startWindowsScript, /Mount-InstallerSkills/);
  assert.doesNotMatch(installScript, /Mount-InstallerSkills/);
  assert.doesNotMatch(windowsInstallHelpersScript, /\$env:USERPROFILE\\\.claude/);
  assert.doesNotMatch(windowsInstallHelpersScript, /\$env:USERPROFILE\\\.codex/);
  assert.doesNotMatch(windowsInstallHelpersScript, /\$env:USERPROFILE\\\.gemini/);
  assert.doesNotMatch(windowsInstallHelpersScript, /Mount-InstallerSkillDirectory/);
  assert.doesNotMatch(windowsInstallHelpersScript, /Sync-InstallerSkillFile/);
  assert.doesNotMatch(windowsInstallHelpersScript, /mklink \/J/);
});

test('SymlinkManager does not create symlinks to external CLI directories', () => {
  const symlinkManagerSource = readFileSync(
    join(repoRoot, 'packages', 'api', 'src', 'domains', 'agents', 'services', 'skillhub', 'SymlinkManager.ts'),
    'utf8',
  );
  assert.doesNotMatch(symlinkManagerSource, /\.claude/);
  assert.doesNotMatch(symlinkManagerSource, /\.codex/);
  assert.doesNotMatch(symlinkManagerSource, /\.gemini/);
  assert.doesNotMatch(symlinkManagerSource, /symlink\(/);
});

test('Local desktop web client derives API URL from the loopback frontend port instead of a baked localhost:3004 value', () => {
  assert.match(apiClientSource, /function isLoopbackHost/);
  assert.match(apiClientSource, /if \(isLoopbackHost\(location\?\.hostname\)\)/);
  assert.match(apiClientSource, /const frontendPort = Number\(location\?\.port \?\? ''\) \|\| 3003/);
  assert.match(apiClientSource, /const apiPort = frontendPort \+ 1/);
});

test('NSIS installer detects existing WebView2 and VC++ runtimes before repair install', () => {
  assert.match(nsisScript, /!define DOTNET462_RELEASE 394802/);
  assert.match(nsisScript, /Function DetectDotNet462Runtime/);
  assert.match(nsisScript, /ReadRegDWORD \$0 HKLM "SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full" "Release"/);
  assert.match(nsisScript, /ReadRegDWORD \$0 HKLM "SOFTWARE\\WOW6432Node\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full" "Release"/);
  assert.match(nsisScript, /Call DetectDotNet462Runtime/);
  assert.match(nsisScript, /缺少 \.NET Framework 4\.6\.2 或更高版本/);
  assert.match(nsisScript, /Function DetectWebView2Runtime/);
  assert.match(nsisScript, /Function DetectVcRedistX64Runtime/);
  assert.match(nsisScript, /HKLM:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients/);
  assert.match(nsisScript, /HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients/);
  assert.match(nsisScript, /HKCU:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients/);
  assert.match(nsisScript, /HKCU:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients/);
  assert.match(
    nsisScript,
    /IfFileExists "\$PROGRAMFILES\\Microsoft\\EdgeWebView\\Application\\\*\\msedgewebview2\.exe" webview2_found_file 0/,
  );
  assert.match(
    nsisScript,
    /IfFileExists "\$LOCALAPPDATA\\Microsoft\\EdgeWebView\\Application\\\*\\msedgewebview2\.exe" webview2_found_file 0/,
  );
  assert.match(nsisScript, /WebView2 检测: 常见安装路径中已发现运行时文件/);
  assert.match(nsisScript, /WebView2 检测: 常见路径和注册表路径均未发现运行时文件/);
  assert.match(nsisScript, /HKLM:\\SOFTWARE\\Microsoft\\VisualStudio\\14\.0\\VC\\Runtimes\\x64/);
  assert.match(nsisScript, /HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14\.0\\VC\\Runtimes\\x64/);
  assert.match(nsisScript, /HKCU:\\SOFTWARE\\Microsoft\\VisualStudio\\14\.0\\VC\\Runtimes\\x64/);
  assert.match(nsisScript, /HKCU:\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14\.0\\VC\\Runtimes\\x64/);
  assert.match(nsisScript, /Sysnative\\WindowsPowerShell\\v1\.0\\powershell\.exe/);
  assert.match(nsisScript, /vcruntime140\.dll/);
  assert.match(nsisScript, /vcruntime140_1\.dll/);
  assert.match(nsisScript, /msvcp140\.dll/);
  assert.match(nsisScript, /msvcp140_1\.dll/);
  assert.match(nsisScript, /msvcp140_2\.dll/);
  assert.match(nsisScript, /concrt140\.dll/);
  assert.match(nsisScript, /vcomp140\.dll/);
  assert.match(nsisScript, /Join-Path \$\$env:WINDIR \\"System32\\"/);
  assert.match(nsisScript, /\$\$item\.Installed -eq 1/);
  assert.match(nsisScript, /vc_redist\.x64\.exe.*-Wait -PassThru; exit \$\$p\.ExitCode/);
  assert.match(nsisScript, /\$\{ElseIf\} \$2 == 3010/);
  assert.match(nsisScript, /SetRebootFlag true/);
  assert.match(nsisScript, /MicrosoftEdgeWebview2Setup\.exe.*-Wait -PassThru; exit \$\$p\.ExitCode/);
  assert.match(nsisScript, /DetailPrint "WebView2 运行时已就绪，跳过安装"/);
  assert.match(nsisScript, /DetailPrint "未检测到可用 WebView2 运行时，执行修复安装\.\.\."/);
  assert.match(nsisScript, /DetailPrint "正在复检 WebView2 运行时\.\.\."/);
  assert.match(nsisScript, /DetailPrint "WebView2 运行时复检通过"/);
  assert.match(nsisScript, /警告: WebView2 运行时安装后复检失败/);
  assert.match(nsisScript, /DetailPrint "VC\+\+ x64 运行时已就绪，跳过安装"/);
  assert.match(nsisScript, /DetailPrint "未检测到可用 VC\+\+ x64 运行时，执行修复安装\.\.\."/);
  assert.match(nsisScript, /DetailPrint "正在复检 VC\+\+ x64 运行时\.\.\."/);
  assert.match(nsisScript, /DetailPrint "VC\+\+ x64 运行时复检通过"/);
  assert.match(nsisScript, /警告: VC\+\+ x64 运行时安装后复检失败/);
  assert.match(nsisScript, /VC\+\+ x64 运行时复检未通过，系统重启后可能完成生效/);
  assert.doesNotMatch(nsisScript, /webview2_registry_ghost:/);
  assert.doesNotMatch(
    nsisScript,
    /ReadRegStr \$0 HKLM "SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5\}" "pv"/,
  );
});

test('NSIS installer enforces 64-bit Windows requirement', () => {
  assert.match(nsisScript, /!include "x64\.nsh"/);
  assert.match(nsisScript, /Function EnsureX64Windows/);
  assert.match(nsisScript, /\$\{IfNot\} \$\{RunningX64\}/);
  assert.match(nsisScript, /当前安装包仅支持 64 位 Windows/);
  assert.match(nsisScript, /Call EnsureX64Windows/);
});

test('NSIS installer handles runtime installation failures gracefully without rollback', () => {
  assert.match(nsisScript, /警告: WebView2 安装未完成.*桌面启动器可能无法使用/);
  assert.match(nsisScript, /警告: WebView2 安装程序未找到/);
  assert.match(nsisScript, /警告: VC\+\+ 运行时库安装失败/);
  assert.match(nsisScript, /警告: VC\+\+ 安装程序未找到/);
  assert.match(nsisScript, /警告: 7za 解压返回错误码/);
  assert.doesNotMatch(nsisScript, /Function PrepareInstallRollback/);
  assert.doesNotMatch(nsisScript, /Function RollbackInstall/);
  assert.doesNotMatch(nsisScript, /Function FailInstall/);
  assert.doesNotMatch(nsisScript, /Function WriteRollbackBackupScript/);
  assert.doesNotMatch(nsisScript, /Function WriteRollbackRestoreScript/);
  assert.doesNotMatch(nsisScript, /Call PrepareInstallRollback/);
  assert.doesNotMatch(nsisScript, /Call CommitInstallRollback/);
  assert.doesNotMatch(nsisScript, /安装已停止，并已尝试回滚/);
  assert.doesNotMatch(nsisScript, /安装回滚/);
});

test('NSIS installer is per-user, upgrades in-place, and preserves runtime data on uninstall', () => {
  assert.match(nsisScript, /!define DEFAULT_INSTALL_DIR "\$LOCALAPPDATA\\Programs\\\$\{APP_NAME\}"/);
  assert.match(nsisScript, /!define AUTOSTART_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Run"/);
  assert.match(nsisScript, /!define AUTOSTART_VALUE "\$\{APP_NAME\}"/);
  assert.match(nsisScript, /InstallDir "\$\{DEFAULT_INSTALL_DIR\}"/);
  assert.match(nsisScript, /InstallDirRegKey HKCU "\$\{INSTALL_KEY\}" "InstallDir"/);
  assert.match(nsisScript, /Page custom DirectoryPageCreate DirectoryPageLeave/);
  assert.match(nsisScript, /Page custom OptionsPageCreate OptionsPageLeave/);
  assert.match(nsisScript, /Var SelectedInstallDir/);
  assert.match(nsisScript, /Var ExistingInstallDir/);
  assert.match(nsisScript, /Var AgreeRadio/);
  assert.match(nsisScript, /Var DisagreeRadio/);
  assert.match(nsisScript, /Var NextButton/);
  assert.match(nsisScript, /Var DirectoryDialog/);
  assert.match(nsisScript, /Var DirectoryInput/);
  assert.match(nsisScript, /Var DirectoryBrowseButton/);
  assert.match(nsisScript, /Var IsExistingInstall/);
  assert.match(nsisScript, /Var CreateStartMenuShortcut/);
  assert.match(nsisScript, /Var CreateDesktopShortcut/);
  assert.match(nsisScript, /Var EnableAutoStart/);
  assert.match(nsisScript, /Function LicensePageCreate/);
  assert.match(nsisScript, /Function OnAgreementChanged/);
  assert.match(nsisScript, /Function UpdateNextButtonState/);
  assert.match(nsisScript, /\$\{NSD_CreateLink\} 56u 25u 100% 10u "/);
  assert.match(nsisScript, /\$\{NSD_CreateLink\} 56u 40u 100% 10u "/);
  assert.match(nsisScript, /\$\{NSD_CreateRadioButton\} 0 100u 100% 12u "/);
  assert.match(nsisScript, /\$\{NSD_CreateRadioButton\} 0 115u 100% 12u "/);
  assert.match(nsisScript, /NSD_GetState} \$AgreeRadio \$0/);
  assert.match(nsisScript, /Function DirectoryPageCreate/);
  assert.match(nsisScript, /Function DirectoryPageLeave/);
  assert.match(nsisScript, /Function OnDirectoryBrowseClicked/);
  assert.match(nsisScript, /Function NormalizeSelectedInstallDir/);
  assert.match(nsisScript, /Function OptionsPageCreate/);
  assert.match(nsisScript, /Function OptionsPageLeave/);
  assert.match(nsisScript, /Function ResolveInstallOptionDefaults/);
  assert.match(nsisScript, /Call ResolveInstallOptionDefaults/);
  assert.match(nsisScript, /RequestExecutionLevel user/);
  assert.match(nsisScript, /Function CloseRunningServices/);
  assert.match(
    nsisScript,
    /nsExec::ExecToLog 'cmd \/c if exist "\$INSTDIR\\packages" rd \/s \/q "\$INSTDIR\\packages"'/,
  );
  assert.match(nsisScript, /nsExec::ExecToLog 'cmd \/c if exist "\$INSTDIR\\tools" rd \/s \/q "\$INSTDIR\\tools"'/);
  assert.doesNotMatch(nsisScript, /if exist "\$INSTDIR\\office-claw-skills" rd \/s \/q/);
  assert.match(nsisScript, /IfFileExists "\$INSTDIR\\\.env" \+2 0/);
  assert.match(nsisScript, /CopyFiles \/SILENT "\$INSTDIR\\\.env\.example" "\$INSTDIR\\\.env"/);
  assert.match(
    nsisScript,
    /CopyFiles \/SILENT "\$INSTDIR\\installer-seed\\office-claw-config\.json" "\$INSTDIR\\office-claw-config\.json"/,
  );
  assert.match(nsisScript, /WriteRegStr HKCU "\$\{UNINSTALL_KEY\}" "DisplayVersion" "\$\{APP_VERSION\}"/);
  assert.match(nsisScript, /WriteRegStr HKCU "\$\{UNINSTALL_KEY\}" "Publisher" "Huawei Cloud"/);
  assert.match(
    nsisScript,
    /CreateShortCut "\$\{STARTMENU_DIR\}\\\$\{APP_NAME\}\.lnk" "\$INSTDIR\\OfficeClaw\.exe" "" "\$INSTDIR\\assets\\app\.ico"/,
  );
  assert.match(
    nsisScript,
    /CreateShortCut "\$DESKTOP\\\$\{APP_NAME\}\.lnk" "\$INSTDIR\\OfficeClaw\.exe" "" "\$INSTDIR\\assets\\app\.ico"/,
  );
  assert.match(nsisScript, /Function WriteAutoStartRegistry/);
  assert.match(
    nsisScript,
    /WriteRegStr HKCU "\$\{AUTOSTART_KEY\}" "\$\{AUTOSTART_VALUE\}" '"\$INSTDIR\\OfficeClaw\.exe"'/,
  );
  assert.match(nsisScript, /Call WriteAutoStartRegistry/);
  assert.match(nsisScript, /Delete "\$DESKTOP\\\$\{APP_NAME\}\.lnk"/);
  assert.match(nsisScript, /DeleteRegValue HKCU "\$\{AUTOSTART_KEY\}" "\$\{AUTOSTART_VALUE\}"/);
  assert.match(nsisScript, /Delete "\$INSTDIR\\OfficeClaw\.exe"/);
  assert.match(nsisScript, /Delete "\$INSTDIR\\OfficeClaw\.exe\.config"/);
  assert.match(nsisScript, /Delete "\$INSTDIR\\Microsoft\.Web\.WebView2\.Core\.dll"/);
  assert.match(nsisScript, /Delete "\$INSTDIR\\Microsoft\.Web\.WebView2\.WinForms\.dll"/);
  assert.match(nsisScript, /Delete "\$INSTDIR\\WebView2Loader\.dll"/);
  assert.match(nsisScript, /Start-Process -FilePath.*MicrosoftEdgeWebview2Setup\.exe.*-Verb RunAs -Wait/);
  assert.match(nsisScript, /DetailPrint "WebView2 运行时已就绪"/);
  assert.doesNotMatch(nsisScript, /Delete "\$INSTDIR\\assets\\app\.ico"/);
  assert.doesNotMatch(nsisScript, /rd \/s \/q "\$INSTDIR\\assets"/);
  assert.match(nsisScript, /MessageBox MB_YESNO\|MB_ICONQUESTION "/);
});

test('NSIS installer blocks concurrent installer sessions before touching shared install state', () => {
  assert.match(nsisScript, /!define INSTALLER_MUTEX_NAME "Local\\\$\{COMPANY_KEY\}\.\$\{APP_NAME\}\.InstallerSession"/);
  assert.match(nsisScript, /Var InstallerMutexHandle/);
  assert.match(nsisScript, /Function AcquireInstallerSessionMutex/);
  assert.match(nsisScript, /Function un\.AcquireInstallerSessionMutex/);
  assert.match(nsisScript, /System::Call 'kernel32::CreateMutexW\(p0, i0, w "\$\{INSTALLER_MUTEX_NAME\}"\) p\.r0 \?e'/);
  assert.match(nsisScript, /StrCpy \$InstallerMutexHandle \$0/);
  assert.match(nsisScript, /Pop \$1/);
  assert.match(nsisScript, /\$\{If\} \$1 == 183/);
  assert.match(nsisScript, /MessageBox MB_OK\|MB_ICONEXCLAMATION "/);
  assert.match(nsisScript, /Function \.onInit[\s\S]*?Call AcquireInstallerSessionMutex/);
  assert.match(nsisScript, /Function un\.onInit[\s\S]*?Call un\.AcquireInstallerSessionMutex/);
});

test('NSIS installer reuses the recorded install dir instead of allowing duplicate installs elsewhere', () => {
  assert.match(nsisScript, /Function ResolveExistingInstallDir/);
  assert.match(nsisScript, /ReadRegStr \$0 HKCU "\$\{INSTALL_KEY\}" "InstallDir"/);
  assert.match(nsisScript, /IfFileExists "\$0\\uninstall\.exe" existing_install \+2/);
  assert.match(nsisScript, /IfFileExists "\$0\\OfficeClaw\.exe" existing_install 0/);
  assert.match(nsisScript, /Call ResolveExistingInstallDir/);
  assert.match(nsisScript, /StrCpy \$INSTDIR \$ExistingInstallDir/);
  assert.match(nsisScript, /StrCpy \$SelectedInstallDir \$ExistingInstallDir/);
  assert.match(nsisScript, /StrCpy \$IsExistingInstall "1"/);
  assert.match(nsisScript, /Function DirectoryPageCreate/);
  assert.match(nsisScript, /安装目录不可修改，如需更换位置请先卸载当前版本/);
  assert.match(nsisScript, /EnableWindow \$DirectoryInput 0/);
});

test('NSIS installer normalizes fresh custom install roots to an OfficeClaw subdirectory', () => {
  assert.match(nsisScript, /Function NormalizeSelectedInstallDir/);
  assert.match(nsisScript, /Call NormalizeSelectedInstallDir/);
  assert.match(nsisScript, /StrCpy \$SelectedInstallDir "\$0\\\$\{APP_NAME\}"/);
  assert.match(nsisScript, /StrCpy \$INSTDIR \$SelectedInstallDir/);
  assert.match(nsisScript, /StrCpy \$4 \$0 "" \$3/);
  assert.match(nsisScript, /StrCpy \$SelectedInstallDir \$0/);
});

test('NSIS installer updates the directory page field immediately after browsing to a parent folder', () => {
  assert.match(nsisScript, /Function DirectoryPageCreate/);
  assert.match(nsisScript, /自动在其下创建 \$\{APP_NAME\} 子目录/);
  assert.match(nsisScript, /\$\{NSD_CreateText\} 55u 35u 205u 12u "\$SelectedInstallDir"/);
  assert.match(nsisScript, /\$\{NSD_CreateButton\} 265u 35u 35u 12u "浏览\.\.\."/);
  assert.match(nsisScript, /Function OnDirectoryBrowseClicked/);
  assert.match(nsisScript, /NSD_GetText} \$DirectoryInput \$0/);
  assert.match(nsisScript, /nsDialogs::SelectFolderDialog "选择安装目录" \$0/);
  assert.match(nsisScript, /\$\{If\} \$0 == error/);
  assert.match(nsisScript, /StrCpy \$SelectedInstallDir \$0/);
  assert.match(nsisScript, /Call NormalizeSelectedInstallDir/);
  assert.match(nsisScript, /NSD_SetText} \$DirectoryInput \$SelectedInstallDir/);
});

test('F142: SkillInstallManager does not contain recoverMissingSymlinks (removed — SkillHub uses MCP injection)', () => {
  const skillInstallSource = readFileSync(
    join(repoRoot, 'packages', 'api', 'src', 'domains', 'cats', 'services', 'skillhub', 'SkillInstallManager.ts'),
    'utf8',
  );
  assert.ok(!skillInstallSource.includes('recoverMissingSymlinks'), 'recoverMissingSymlinks should be removed');
});
