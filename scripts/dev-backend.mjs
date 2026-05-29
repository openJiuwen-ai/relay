#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureDotenvLoaded,
  logError,
  logInfo,
  logSuccess,
  logWarn,
  runBash,
  runCommandAndWait,
  runCommandCapture,
  runStep,
  waitForHttpOk,
} from './dev-runner-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const jiuwenRoot = resolve(projectRoot, 'vendor/jiuwenclaw');
const jiuwenPythonPath = process.platform === 'win32' ? './.venv/Scripts/python.exe' : './.venv/bin/python';
const jiuwenVerifyCommand = `${jiuwenPythonPath} -c "import jiuwenclaw, dotenv; print('jiuwen runtime ok')"`;
let windowsShellCommand;

function getRedisPort() {
  return (process.env.REDIS_PORT || '6399').trim();
}

function getApiServerPort() {
  return (process.env.API_SERVER_PORT || '3004').trim();
}

function getApiHealthUrl() {
  return `http://127.0.0.1:${getApiServerPort()}/health`;
}

function hasWindowsCommand(command) {
  const result = spawnSync('where.exe', [command], { stdio: 'ignore' });
  return result.status === 0;
}

function resolveWindowsShellCommand() {
  if (process.platform !== 'win32') return null;
  if (windowsShellCommand !== undefined) return windowsShellCommand;
  if (hasWindowsCommand('pwsh')) {
    windowsShellCommand = 'pwsh';
    return windowsShellCommand;
  }
  if (hasWindowsCommand('powershell')) {
    windowsShellCommand = 'powershell';
    return windowsShellCommand;
  }
  windowsShellCommand = null;
  return windowsShellCommand;
}

function findFileRecursive(rootDir, targetName) {
  const stack = [rootDir];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) continue;
    let entries = [];
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase() === targetName.toLowerCase()) {
        return fullPath;
      }
    }
  }
  return null;
}

function resolveWindowsRedisBinaries() {
  const portableRoot = resolve(projectRoot, '.office-claw/redis/windows/current');
  const portableServer = findFileRecursive(portableRoot, 'redis-server.exe');
  const portableCli = findFileRecursive(portableRoot, 'redis-cli.exe');
  if (portableServer && portableCli) {
    return { serverPath: portableServer, cliPath: portableCli, source: 'project-local' };
  }

  const globalServer = spawnSync('where.exe', ['redis-server'], { encoding: 'utf8' });
  const globalCli = spawnSync('where.exe', ['redis-cli'], { encoding: 'utf8' });
  if (globalServer.status === 0 && globalCli.status === 0) {
    const serverPath = globalServer.stdout.split(/\r?\n/).find(Boolean)?.trim();
    const cliPath = globalCli.stdout.split(/\r?\n/).find(Boolean)?.trim();
    if (serverPath && cliPath) {
      return { serverPath, cliPath, source: 'global' };
    }
  }

  return null;
}

function resolveRedisBinaries() {
  if (process.platform === 'win32') {
    return resolveWindowsRedisBinaries();
  }
  return { serverPath: 'redis-server', cliPath: 'redis-cli', source: 'path' };
}

function escapePowerShellSingleQuotedString(value) {
  return String(value).replace(/'/g, "''");
}

function runExecutableCapture(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function ensureWindowsPortableRedisInstalled() {
  if (process.platform !== 'win32' || resolveWindowsRedisBinaries()) {
    return;
  }

  const shell = resolveWindowsShellCommand();
  if (!shell) {
    throw new Error('PowerShell not found for Redis auto-install');
  }

  const helperPath = resolve(projectRoot, 'scripts/install-windows-helpers.ps1');
  const helperLiteral = escapePowerShellSingleQuotedString(helperPath);
  const projectRootLiteral = escapePowerShellSingleQuotedString(projectRoot);
  const script = `
function Write-Ok { param([string]$msg) Write-Host "  [OK] $msg" }
function Write-Warn { param([string]$msg) Write-Host "  [!!] $msg" }
function Write-Err { param([string]$msg) Write-Host "  [ERR] $msg" }
. '${helperLiteral}'
$ok = Ensure-WindowsRedis -ProjectRoot '${projectRootLiteral}' -Memory:$false
if (-not $ok) { exit 1 }
`;

  logInfo('Redis binaries missing; attempting first-run portable Redis install');
  const result = await runExecutableCapture(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    cwd: projectRoot,
  });
  if (result.code !== 0) {
    throw new Error(`Redis auto-install failed: ${formatCommandResult(result)}`);
  }
  logSuccess('Portable Redis is available after auto-install');
}

function runShellCapture(command, options = {}) {
  if (process.platform !== 'win32') {
    return runCommandCapture(command, options);
  }
  const shell = resolveWindowsShellCommand();
  if (!shell) {
    throw new Error('未找到可用的 PowerShell（pwsh 或 powershell），请安装 PowerShell 或加入 PATH');
  }
  return runExecutableCapture(shell, ['-NoProfile', '-Command', command], options);
}

function runShellAndWait(command, options = {}) {
  if (process.platform !== 'win32') {
    return runCommandAndWait(command, options);
  }
  const shell = resolveWindowsShellCommand();
  if (!shell) {
    throw new Error('未找到可用的 PowerShell（pwsh 或 powershell），请安装 PowerShell 或加入 PATH');
  }
  return new Promise((resolve, reject) => {
    const child = spawn(shell, ['-NoProfile', '-Command', command], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`命令执行失败: ${command} (exit=${code ?? 'null'})`));
    });
  });
}

function runShellDetached(command, options = {}) {
  if (process.platform !== 'win32') {
    return runBash(command, options);
  }
  const shell = resolveWindowsShellCommand();
  if (!shell) {
    throw new Error('未找到可用的 PowerShell（pwsh 或 powershell），请安装 PowerShell 或加入 PATH');
  }
  return spawn(shell, ['-NoProfile', '-Command', command], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
    detached: options.detached ?? false,
    windowsHide: true,
  });
}

function getRedisAuthArgs(redisUrl) {
  if (!redisUrl) return [];
  try {
    const parsed = new URL(redisUrl);
    const username = decodeURIComponent(parsed.username || '');
    const password = decodeURIComponent(parsed.password || '');
    if (!username && !password) return [];
    const args = [];
    if (username) args.push('--user', username);
    if (password) args.push('-a', password, '--no-auth-warning');
    return args;
  } catch {
    return [];
  }
}

function getRedisDbSuffix(redisUrl) {
  if (!redisUrl) return '';
  try {
    const parsed = new URL(redisUrl);
    return parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
  } catch {
    return '';
  }
}

async function readWindowsRedisPasswordFromCredentialManager() {
  if (process.platform !== 'win32') {
    return '';
  }
  const shell = resolveWindowsShellCommand();
  if (!shell) {
    return '';
  }
  const helperPath = resolve(projectRoot, 'scripts/install-windows-helpers.ps1');
  const script = `& {
    . '${helperPath.replace(/'/g, "''")}';
    $reader = Get-Command 'Read-OfficeClawCredential' -ErrorAction SilentlyContinue;
    if (-not $reader) {
      $reader = Get-Command 'Read-ClowderCredential' -ErrorAction SilentlyContinue;
    }
    if ($reader) {
      $pwd = & $reader -Path 'redis/password';
      if ($pwd) { Write-Output $pwd }
    }
  }`;
  const result = await runExecutableCapture(shell, ['-NoProfile', '-Command', script], { cwd: projectRoot });
  if (result.code !== 0) {
    return '';
  }
  return result.stdout.trim();
}

function buildRedisUrlWithPassword(password, redisPort, dbSuffix = '') {
  const suffix = dbSuffix || '';
  return `redis://:${encodeURIComponent(password)}@localhost:${redisPort}${suffix}`;
}

function redactRedisUrl(redisUrl) {
  if (!redisUrl) return '';
  try {
    const parsed = new URL(redisUrl);
    if (!parsed.username && !parsed.password) {
      return redisUrl;
    }
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return redisUrl.replace(/:\/\/[^@]+@/, '://');
  }
}

function formatCommandResult(result) {
  const stdout = result.stdout.trim() || '<empty>';
  const stderr = result.stderr.trim() || '<empty>';
  return `exit=${result.code} stdout=${stdout} stderr=${stderr}`;
}

async function ensureRedisReady() {
  const redisPort = getRedisPort();
  let redis = resolveRedisBinaries();
  if (!redis && process.platform === 'win32') {
    await ensureWindowsPortableRedisInstalled();
    redis = resolveRedisBinaries();
  }
  if (!redis) {
    throw new Error('未找到 Redis。可安装到系统 PATH，或使用项目内的 .office-claw/redis/windows 便携版');
  }

  const configuredRedisUrl = process.env.REDIS_URL || `redis://localhost:${redisPort}`;
  const redisDbSuffix = getRedisDbSuffix(configuredRedisUrl);
  const localRedisUrl = `redis://localhost:${redisPort}${redisDbSuffix}`;

  let windowsCredentialPassword = '';
  let windowsCredentialLoaded = false;
  const getWindowsCredentialPassword = async () => {
    if (windowsCredentialLoaded) {
      return windowsCredentialPassword;
    }
    windowsCredentialPassword = await readWindowsRedisPasswordFromCredentialManager();
    windowsCredentialLoaded = true;
    return windowsCredentialPassword;
  };

  const pingRedisOnWindows = async () => {
    const pingWithoutAuth = await runExecutableCapture(redis.cliPath, ['-p', redisPort, 'ping'], {
      cwd: projectRoot,
    });
    if (pingWithoutAuth.code === 0 && pingWithoutAuth.stdout.trim() === 'PONG') {
      return { ping: pingWithoutAuth, redisUrl: localRedisUrl };
    }
    if (!/NOAUTH/i.test(pingWithoutAuth.stdout + pingWithoutAuth.stderr)) {
      return { ping: pingWithoutAuth, redisUrl: localRedisUrl };
    }

    const authCandidates = [];
    const configuredAuthArgs = getRedisAuthArgs(configuredRedisUrl);
    if (configuredAuthArgs.length > 0) {
      authCandidates.push({ redisUrl: configuredRedisUrl, authArgs: configuredAuthArgs });
    }

    const cmPassword = await getWindowsCredentialPassword();
    if (cmPassword) {
      const cmRedisUrl = buildRedisUrlWithPassword(cmPassword, redisPort, redisDbSuffix);
      const cmAuthArgs = getRedisAuthArgs(cmRedisUrl);
      if (cmAuthArgs.length > 0 && cmRedisUrl !== configuredRedisUrl) {
        authCandidates.push({ redisUrl: cmRedisUrl, authArgs: cmAuthArgs });
      }
    }

    let lastPing = pingWithoutAuth;
    for (const candidate of authCandidates) {
      const pingWithAuth = await runExecutableCapture(
        redis.cliPath,
        ['-p', redisPort, ...candidate.authArgs, 'ping'],
        { cwd: projectRoot },
      );
      lastPing = pingWithAuth;
      if (pingWithAuth.code === 0 && pingWithAuth.stdout.trim() === 'PONG') {
        return { ping: pingWithAuth, redisUrl: candidate.redisUrl };
      }
    }

    return { ping: lastPing, redisUrl: localRedisUrl };
  };

  let pingResult =
    process.platform === 'win32'
      ? await pingRedisOnWindows()
      : {
          ping: await runCommandCapture(`${redis.cliPath} -p ${redisPort} ping`, { cwd: projectRoot }),
          redisUrl: configuredRedisUrl,
        };
  let pingBeforeStart = pingResult.ping;
  let pingRedisUrl = pingResult.redisUrl;

  if (pingBeforeStart.code === 0 && pingBeforeStart.stdout.trim() === 'PONG') {
    process.env.REDIS_URL = pingRedisUrl;
    logInfo(`Redis 已在端口 ${redisPort} 运行（来源: ${redis.source}，PING=PONG）`);
    return;
  }

  logWarn(`Redis initial ping failed: ${formatCommandResult(pingBeforeStart)}`);
  logInfo(`启动 Redis: ${redis.serverPath} --port ${redisPort} --bind 127.0.0.1`);
  const redisProcess =
    process.platform === 'win32'
      ? spawn(redis.serverPath, ['--port', redisPort, '--bind', '127.0.0.1'], {
          cwd: projectRoot,
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        })
      : runBash(`${redis.serverPath} --port ${redisPort} --bind 127.0.0.1`, {
          cwd: projectRoot,
          detached: true,
          stdio: 'ignore',
        });
  let redisProcessError = null;
  let redisProcessExitCode;
  redisProcess.on('error', (error) => {
    redisProcessError = error;
  });
  redisProcess.on('exit', (code) => {
    redisProcessExitCode = code;
  });
  redisProcess.unref();

  const startedAt = Date.now();
  while (Date.now() - startedAt <= 15_000) {
    pingResult =
      process.platform === 'win32'
        ? await pingRedisOnWindows()
        : {
            ping: await runCommandCapture(`${redis.cliPath} -p ${redisPort} ping`, { cwd: projectRoot }),
            redisUrl: configuredRedisUrl,
          };
    const ping = pingResult.ping;
    pingRedisUrl = pingResult.redisUrl;
    if (ping.code === 0 && ping.stdout.trim() === 'PONG') {
      process.env.REDIS_URL = pingRedisUrl;
      logSuccess(`Redis 启动成功（端口 ${redisPort}，PING=PONG）`);
      return;
    }
    if (redisProcessError) {
      throw new Error(`Redis process failed to start: ${redisProcessError.message}`);
    }
    if (redisProcessExitCode !== undefined) {
      throw new Error(
        `Redis process exited before readiness (exit=${redisProcessExitCode ?? 'null'}); last ping: ${formatCommandResult(ping)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Redis did not become ready within 15s on port ${redisPort}; last ping: ${formatCommandResult(pingResult.ping)}`,
  );
}

function configureApprovalRecordProviderDefaults() {
  process.env.OFFICE_CLAW_STORAGE_PROVIDER_MODULES =
    process.env.OFFICE_CLAW_STORAGE_PROVIDER_MODULES || '@openjiuwen/relay-storage-sqlite';
  process.env.OFFICE_CLAW_APPROVAL_RECORD_PROVIDER =
    process.env.OFFICE_CLAW_APPROVAL_RECORD_PROVIDER || 'sqlite-approval-records';
}

async function setupRedisStorage() {
  const redisPort = getRedisPort();
  try {
    await ensureRedisReady();
    process.env.REDIS_URL = process.env.REDIS_URL || `redis://localhost:${redisPort}`;
    process.env.REDIS_PORT = redisPort;
    delete process.env.MEMORY_STORE;
    logSuccess(`存储模式: Redis (${redactRedisUrl(process.env.REDIS_URL)})`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logError(`Redis startup failed: ${reason}`);
    throw new Error(`Redis is required for dev:backend but is unavailable: ${reason}`);
  }
}

async function initJiuwen() {
  const uvCheck = await runShellCapture('uv --version', { cwd: jiuwenRoot });
  if (uvCheck.code !== 0) {
    logWarn('未检测到 uv，跳过九问运行时初始化（相关能力在本次会话不可用）');
    logWarn('如需启用九问，请先安装 uv 后重试: https://docs.astral.sh/uv/');
    return;
  }

  const verifyBeforeInit = await runShellCapture(jiuwenVerifyCommand, { cwd: jiuwenRoot });
  if (verifyBeforeInit.code === 0 && verifyBeforeInit.stdout.trim().includes('jiuwen runtime ok')) {
    logSuccess('检测到九问运行时已初始化，跳过 uv sync');
    return;
  }

  logInfo('九问运行时未就绪，执行 uv sync 初始化');
  await runShellAndWait('uv sync', { cwd: jiuwenRoot });

  const verify = await runShellCapture(jiuwenVerifyCommand, { cwd: jiuwenRoot });

  if (verify.code !== 0) {
    throw new Error(`九问运行时校验失败:\n${verify.stderr || verify.stdout}`);
  }

  const output = verify.stdout.trim();
  if (!output.includes('jiuwen runtime ok')) {
    throw new Error(`九问运行时校验输出异常: ${output || '<empty>'}`);
  }

  logSuccess('九问运行时校验通过（jiuwen runtime ok）');
}

async function startBackendAndKeepAlive() {
  const apiHealthUrl = getApiHealthUrl();
  logInfo('启动 API 后端: pnpm -F @openjiuwen/relay-api-server dev');
  const apiProcess = runShellDetached('pnpm -F @openjiuwen/relay-api-server dev', {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });

  let apiExited = false;
  apiProcess.on('exit', () => {
    apiExited = true;
  });

  const startedAt = Date.now();
  let healthOk = false;
  while (Date.now() - startedAt <= 45_000) {
    if (apiExited) {
      throw new Error('API 进程在健康检查通过前已退出');
    }
    const ok = await waitForHttpOk(apiHealthUrl, { timeoutMs: 1_000, intervalMs: 500 });
    if (ok) {
      logSuccess(`后端健康检查通过: ${apiHealthUrl}`);
      healthOk = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  if (!healthOk) {
    const retryOk = await waitForHttpOk(apiHealthUrl, { timeoutMs: 5_000, intervalMs: 1_000 });
    if (retryOk) {
      logSuccess(`后端健康检查延迟通过: ${apiHealthUrl}`);
      healthOk = true;
    }
  }

  if (!healthOk) {
    if (!apiExited) {
      logWarn(`后端健康检查未通过，但 API 进程仍在运行：${apiHealthUrl}`);
      logWarn('将继续保持进程存活，建议在浏览器中手动访问 /health 进行确认');
    } else {
      throw new Error(`后端健康检查超时，未通过: ${apiHealthUrl}`);
    }
  }

  logInfo('后端服务已就绪，按 Ctrl+C 停止');

  const forwardSignal = (signal) => {
    if (!apiProcess.killed) {
      apiProcess.kill(signal);
    }
  };
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  await new Promise((resolve, reject) => {
    apiProcess.on('exit', (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`API 进程退出，exit=${code}`));
    });
    apiProcess.on('error', reject);
  });
}

async function main() {
  console.log('🐾 dev:backend 启动器');
  await runStep('准备环境变量 (.env)', async () => {
    await ensureDotenvLoaded(projectRoot);
  });
  configureApprovalRecordProviderDefaults();

  await runStep('初始化存储（Redis 必须可用）', setupRedisStorage);
  await runStep('初始化并验证九问', initJiuwen);
  await runStep('启动并验证 API 后端', startBackendAndKeepAlive);
}

main().catch((error) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
