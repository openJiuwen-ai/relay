/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  commandHelpersScript,
  helpersScript,
  installScript,
  startBatScript,
  startWindowsScript,
  stopWindowsScript,
  uiHelpersScript,
} from './windows-portable-redis-test-helpers.js';

test('Windows service job failure sets exit code 1 instead of falling through with success', () => {
  assert.match(startWindowsScript, /\$serviceFailure = \$false/);
  assert.match(startWindowsScript, /\$serviceFailure = \$true/);
  assert.match(startWindowsScript, /if \(\$serviceFailure\) \{\s+exit 1\s+\}/s);
});

test('Windows installer exits immediately when native installs are cancelled by the user', () => {
  assert.match(installScript, /function Test-InstallerCancellation/);
  assert.match(installScript, /function Exit-InstallerIfCancelled/);
  assert.match(installScript, /\$exceptionType = \$exception\.GetType\(\)\.FullName/);
  assert.match(installScript, /\$exceptionType -eq 'System\.Management\.Automation\.PipelineStoppedException'/);
  assert.match(installScript, /\$exceptionType -eq 'System\.Management\.Automation\.OperationStoppedException'/);
  assert.doesNotMatch(installScript, /-is \[System\.Management\.Automation\.OperationStoppedException\]/);
  assert.match(installScript, /if \(Test-InstallerCancellation -ErrorRecord \$ErrorRecord\) \{/);
  assert.match(installScript, /Write-Err "\$Context cancelled by user"/);
  assert.match(installScript, /Exit-InstallerIfCancelled -ErrorRecord \$_ -Context "pnpm installation"/);
  assert.match(installScript, /Exit-InstallerIfCancelled -ErrorRecord \$frozenInstallError -Context "pnpm install"/);
  assert.match(installScript, /exit 1/);
});

test('Windows PowerShell scripts stay ASCII-only to avoid console codepage issues', () => {
  const windowsScriptBundle = [
    installScript,
    helpersScript,
    uiHelpersScript,
    startWindowsScript,
    stopWindowsScript,
  ].join('\n');

  assert.equal(
    [...windowsScriptBundle].some((char) => char.charCodeAt(0) > 0x7f),
    false,
  );
});

test('Windows startup resolves portable Redis from the shared helper before global PATH lookup', () => {
  assert.match(startWindowsScript, /install-windows-helpers\.ps1/);
  assert.match(helpersScript, /function Test-CommandLineContainsLiteral/);
  assert.match(helpersScript, /IndexOf\(\$Needle, \[System\.StringComparison\]::OrdinalIgnoreCase\) -ge 0/);
  assert.match(startWindowsScript, /Resolve-PortableRedisBinaries -ProjectRoot \$ProjectRoot/);
  assert.match(startWindowsScript, /Resolve-PortableRedisLayout -ProjectRoot \$ProjectRoot/);
  assert.match(helpersScript, /function Resolve-GlobalRedisBinaries/);
  assert.match(helpersScript, /Get-Command redis-server -ErrorAction SilentlyContinue/);
});

test('Windows startup provisions vendored jiuwenClaw runtime before API client detection', () => {
  assert.match(helpersScript, /function Ensure-WindowsDareRuntime/);
  assert.match(helpersScript, /vendor\\dare-cli/);
  assert.match(helpersScript, /& \$venvPython -m pip install -r requirements\.txt "httpx\[socks\]"/);
  assert.match(startWindowsScript, /\$dareRuntimeReady = Ensure-WindowsDareRuntime -ProjectRoot \$ProjectRoot/);
  assert.match(helpersScript, /function Ensure-WindowsJiuwenClawRuntime/);
  assert.match(helpersScript, /vendor\\jiuwenclaw/);
  assert.match(helpersScript, /\.venv\\Scripts\\python\.exe/);
  assert.match(helpersScript, /Resolve-ToolCommandWithRetry -Name "python" -Attempts 2/);
  assert.match(helpersScript, /Resolve-ToolCommandWithRetry -Name "py" -Attempts 2/);
  assert.match(
    helpersScript,
    /Runtime startup: no pip install allowed\. Dependencies must be installed at build\/install time\./,
  );
  assert.doesNotMatch(helpersScript, /& \$venvPython -m pip install -e \./);
  assert.match(startWindowsScript, /\$jiuwenClawRuntimeReady = Ensure-WindowsJiuwenClawRuntime -ProjectRoot \$ProjectRoot/);
});

test('Windows startup quotes portable Redis file arguments before Start-Process', () => {
  assert.match(helpersScript, /function Quote-WindowsProcessArgument/);
  assert.match(startWindowsScript, /Quote-WindowsProcessArgument -Value \$redisLayout\.Data/);
  assert.match(startWindowsScript, /Quote-WindowsProcessArgument -Value \$redisLogFile/);
  assert.match(startWindowsScript, /Quote-WindowsProcessArgument -Value \$redisPidFile/);
  assert.match(helpersScript, /Quote-WindowsProcessArgument -Value \$AclFilePath/);
});

test('Windows stop script only stops OfficeClaw-owned API and frontend listeners', () => {
  assert.match(
    stopWindowsScript,
    /\$RunDir = if \(\$ProjectRoot\) \{ Join-Path \$ProjectRoot "\.office-claw\/run\/windows" \} else \{ \$null \}/,
  );
  assert.match(stopWindowsScript, /Get-ManagedProcessId/);
  assert.match(stopWindowsScript, /Test-OfficeClawOwnedProcess/);
  assert.match(
    stopWindowsScript,
    /\$isOfficeClawOwned = \$isManagedPid -or \(Test-OfficeClawOwnedProcess -ProcessId \$conn\.OwningProcess -OfficeClawProjectRoot \$ProjectRoot\)/,
  );
  assert.match(stopWindowsScript, /Write-Warn "Skipping non-OfficeClaw \$Name listener on port \$Port/);
  assert.match(stopWindowsScript, /Write-Warn "\$Name \(port \$Port\) - no OfficeClaw-owned listener found"/);
  assert.match(stopWindowsScript, /\$normalizedRoot = \$OfficeClawProjectRoot\.TrimEnd\('\\', '\/'\) \+ '\\'/);
  assert.match(
    stopWindowsScript,
    /Test-CommandLineContainsLiteral -CommandLine \$commandLine -Needle \$normalizedRoot/,
  );
});

test('Windows startup preserves runtime Redis overrides, validates artifacts, and exits when service jobs stop', () => {
  assert.match(startWindowsScript, /\$ConfiguredRedisUrl = if \(\$env:REDIS_URL\)/);
  assert.match(helpersScript, /function Test-LocalRedisUrl/);
  assert.match(helpersScript, /function Get-RedactedRedisUrl/);
  assert.match(
    startWindowsScript,
    /\$useExternalRedis = \$useRedis -and \$configuredRedisUrl -and -not \(Test-LocalRedisUrl -RedisUrl \$configuredRedisUrl -RedisPort \$RedisPort\)/,
  );
  assert.match(startWindowsScript, /\$configuredRedisUrl = \$ConfiguredRedisUrl/);
  assert.match(startWindowsScript, /\$safeConfiguredRedisUrl = Get-RedactedRedisUrl -RedisUrl \$configuredRedisUrl/);
  assert.match(startWindowsScript, /Write-Ok "Using external Redis: \$safeConfiguredRedisUrl"/);
  assert.match(startWindowsScript, /\$safeEffectiveRedisUrl = Get-RedactedRedisUrl -RedisUrl \$effectiveRedisUrl/);
  assert.match(
    startWindowsScript,
    /\$storageMode = if \(\$useRedis -and \$safeEffectiveRedisUrl\) \{ "Redis \(\$safeEffectiveRedisUrl\)" \}/,
  );
  assert.match(startWindowsScript, /\$runtimeEnvOverrides = @\{/);
  assert.match(startWindowsScript, /REDIS_URL = \$env:REDIS_URL/);
  assert.match(startWindowsScript, /MEMORY_STORE = \$env:MEMORY_STORE/);
  assert.match(startWindowsScript, /try \{\s+# -- Build \(unless -Quick\) -+\s+if \(-not \$Quick\) \{/s);
  assert.match(startWindowsScript, /\$apiEntry = Join-Path \$ProjectRoot "packages\/api\/dist\/index\.js"/);
  assert.match(startWindowsScript, /API build artifact not found - run without -Quick first to build/);
  assert.match(startWindowsScript, /Write-Err "Build failed: shared";\s+throw "Build failed: shared"/);
  assert.match(startWindowsScript, /Write-Err "Build failed: mcp-server";\s+throw "Build failed: mcp-server"/);
  assert.match(startWindowsScript, /Write-Err "Build failed: api";\s+throw "Build failed: api"/);
  assert.match(startWindowsScript, /Write-Err "Build failed: web";\s+throw "Build failed: web"/);
  assert.match(startWindowsScript, /\$nextCli = @\(/);
  assert.match(startWindowsScript, /Join-Path \$ProjectRoot "packages\/web\/node_modules\/next\/dist\/bin\/next"/);
  assert.match(startWindowsScript, /Join-Path \$ProjectRoot "node_modules\/next\/dist\/bin\/next"/);
  assert.match(
    startWindowsScript,
    /Write-Err "Next CLI not found - run pnpm install first or rebuild the packaged bundle"/,
  );
  assert.match(startWindowsScript, /Service job '\$\(\$job.Name\)' stopped \(\$\(\$job.State\)\)/);
});

test('Windows startup preserves configured REDIS_URL with DB suffix and credentials when local Redis is already running', () => {
  assert.match(
    startWindowsScript,
    /if \(\$configuredRedisUrl\) \{\s+\$env:REDIS_URL = \$configuredRedisUrl\s+\} else \{\s+\$env:REDIS_URL = "redis:\/\/localhost:\$RedisPort"\s+\}/s,
  );
});

test('Windows startup reuses existing local Redis listeners even when they are not OfficeClaw-owned', () => {
  assert.match(
    startWindowsScript,
    /\$redisConnections = Get-NetTCPConnection -LocalPort \$RedisPort -State Listen -ErrorAction SilentlyContinue/,
  );
  assert.match(startWindowsScript, /\$managedRedisPid = Get-ManagedProcessId -PidFile \$redisPidFile/);
  assert.match(
    startWindowsScript,
    /\$isOfficeClawOwned = \$isManagedPid -or \(Test-OfficeClawOwnedProcess -ProcessId \$conn\.OwningProcess -ProjectRoot \$ProjectRoot\)/,
  );
  assert.match(
    startWindowsScript,
    /Write-Warn "Redis port \$RedisPort is in use by non-OfficeClaw PID \$\(\$conn\.OwningProcess\) - reusing existing local Redis"/,
  );
  assert.doesNotMatch(startWindowsScript, /throw "Redis port \$RedisPort is in use by a non-OfficeClaw process"/);
});

test('Windows startup only stops OfficeClaw-owned listeners and records managed service PIDs', () => {
  assert.match(startWindowsScript, /\$RunDir = Join-Path \$ProjectRoot "\.office-claw\/run\/windows"/);
  assert.match(startWindowsScript, /\$ApiPidFile = Join-Path \$RunDir "api-\$ApiPort\.pid"/);
  assert.match(startWindowsScript, /function Get-ManagedProcessId/);
  assert.match(startWindowsScript, /function Set-ManagedProcessId/);
  assert.match(startWindowsScript, /function Test-OfficeClawOwnedProcess/);
  assert.match(startWindowsScript, /Get-CimInstance Win32_Process -Filter "ProcessId = \$ProcessId"/);
  assert.match(
    startWindowsScript,
    /Test-CommandLineContainsLiteral -CommandLine \$commandLine -Needle \$normalizedRoot/,
  );
  assert.match(startWindowsScript, /Port \$Port \(\$Name\) is in use by non-OfficeClaw PID/);
  assert.match(
    startWindowsScript,
    /Stop-PortProcess -Port \(\[int\]\$ApiPort\) -Name "API" -PidFile \$ApiPidFile -ProjectRoot \$ProjectRoot/,
  );
  assert.match(startWindowsScript, /Set-ManagedProcessId -Port \(\[int\]\$ApiPort\) -PidFile \$ApiPidFile/);
  assert.match(startWindowsScript, /Clear-ManagedProcessId -PidFile \$ApiPidFile/);
});

test('Windows ownership checks treat project roots as literal strings instead of wildcard patterns', () => {
  assert.match(
    startWindowsScript,
    /Test-CommandLineContainsLiteral -CommandLine \$commandLine -Needle \(\$ProjectRoot \+ '"'\)/,
  );
  assert.match(
    stopWindowsScript,
    /Test-CommandLineContainsLiteral -CommandLine \$commandLine -Needle \(\$OfficeClawProjectRoot \+ '"'\)/,
  );
  assert.match(
    stopWindowsScript,
    /Test-CommandLineContainsLiteral -CommandLine \$cmdLine -Needle \$ProjectRoot/,
  );
  assert.doesNotMatch(startWindowsScript, /-like "\*\$normalizedRoot\*"/);
  assert.doesNotMatch(stopWindowsScript, /-like "\*\$OfficeClawProjectRoot/);
});

test('Windows bundled runtime prefers random frontend, API, and Redis ports and persists runtime state for shutdown', () => {
  assert.match(helpersScript, /function Test-TruthyEnvFlag/);
  assert.match(helpersScript, /function Test-TcpPortAvailable/);
  assert.match(helpersScript, /function Find-AvailableTcpPort/);
  assert.match(helpersScript, /function Read-WindowsRuntimeStateFile/);
  assert.match(helpersScript, /function Write-WindowsRuntimeStateFile/);
  assert.match(helpersScript, /function Remove-WindowsRuntimeStateFile/);
  assert.match(startWindowsScript, /\$RuntimeStateFile = Join-Path \$RunDir "runtime-state\.json"/);
  assert.match(startWindowsScript, /\$ConfiguredRedisUrl = if \(\$env:REDIS_URL\) \{ \$env:REDIS_URL\.Trim\(\) \} else \{ "" \}/);
  assert.match(startWindowsScript, /\$BundledDefaultRedisUrl = "redis:\/\/localhost:\$ConfiguredRedisPort"/);
  assert.match(
    startWindowsScript,
    /if \(\$PreferRandomPorts -and \$ConfiguredRedisUrl -and \(\$ConfiguredRedisUrl\.ToLowerInvariant\(\) -eq \$BundledDefaultRedisUrl\.ToLowerInvariant\(\)\)\) \{/,
  );
  assert.match(
    startWindowsScript,
    /\$UseRandomFrontendApiPorts = \$PreferRandomPorts -and \$ConfiguredApiPort -eq 3004 -and \$ConfiguredWebPort -eq 3003/,
  );
  assert.match(startWindowsScript, /Find-AvailableFrontendApiPorts/);
  assert.match(
    startWindowsScript,
    /\$UseRandomRedisPort = \$PreferRandomPorts -and -not \$ConfiguredRedisUrl -and \$ConfiguredRedisPort -eq 6399/,
  );
  assert.match(startWindowsScript, /Write-Ok "Redis port selected: \$RedisPort \(random\)"/);
  assert.match(startWindowsScript, /Write-WindowsRuntimeStateFile -StateFile \$RuntimeStateFile -State/);
  assert.match(startWindowsScript, /RedisStartedByLauncher = \[bool\]\$startedRedis/);
  assert.match(startWindowsScript, /NEXT_PUBLIC_API_URL = "http:\/\/127\.0\.0\.1:\$ApiPort"/);
  assert.match(startWindowsScript, /Remove-WindowsRuntimeStateFile -StateFile \$RuntimeStateFile/);
});

test('Windows startup reuses Credential Manager Redis auth and keeps runtime state redacted', () => {
  assert.match(startWindowsScript, /Read-OfficeClawCredential -Path "redis\/password"/);
  assert.match(startWindowsScript, /Write-OfficeClawCredential -Path "redis\/password" -Secret \$localRedisPassword/);
  assert.match(startWindowsScript, /Write-Ok "Redis auth: connected with Credential Manager password"/);
  assert.match(startWindowsScript, /Write-Ok "Redis auth: new password generated"/);
  assert.match(
    startWindowsScript,
    /RedisUrl = if \(\$redisAuthFromCM -and \$env:REDIS_URL\) \{ Get-RedactedRedisUrl -RedisUrl \$env:REDIS_URL \}/,
  );
  assert.match(startWindowsScript, /RedisAuthFromCredentialManager = \[bool\]\$redisAuthFromCM/);
  assert.match(stopWindowsScript, /\$redisAuthFromCM = \[bool\]\(\$runtimeState -and \$runtimeState.RedisAuthFromCredentialManager\)/);
  assert.match(stopWindowsScript, /Read-OfficeClawCredential -Path "redis\/password"/);
  assert.match(
    stopWindowsScript,
    /\$configuredRedisUrl = "redis:\/\/:\$\{escapedPwd\}@localhost:\$\{RedisPort\}"/,
  );
});

test('Windows stop script force-stops Redis that was started by the launcher during uninstall', () => {
  assert.match(stopWindowsScript, /\$redisStartedByLauncher = \[bool\]\(\$runtimeState -and \$runtimeState\.RedisStartedByLauncher\)/);
  assert.match(stopWindowsScript, /if \(\$redisStartedByLauncher\) \{\s+\$ownedRedisConnections = @\(\$redisConnections\)\s+\}/s);
  assert.match(stopWindowsScript, /if \(\$redisStartedByLauncher\) \{\s+break\s+\}/s);
  assert.match(stopWindowsScript, /elseif \(\$redisStartedByLauncher -and \$managedRedisPid\) \{/);
  assert.match(stopWindowsScript, /Stop-Process -Id \$managedRedisPid -Force -ErrorAction SilentlyContinue/);
  assert.match(stopWindowsScript, /Write-Warn "Redis required forced termination \(port \$RedisPort\)"/);
});

test('Windows installer and startup reuse shared tool resolution instead of raw pnpm PATH lookups', () => {
  assert.match(installScript, /Resolve-ToolCommand -Name "pnpm"/);
  assert.match(installScript, /\$corepackCommand = Resolve-ToolCommand -Name "corepack"/);
  assert.match(installScript, /\$npmCommand = Resolve-ToolCommand -Name "npm"/);
  assert.match(startWindowsScript, /Resolve-BundledNodeCommand -ProjectRoot \$ProjectRoot/);
  assert.match(startWindowsScript, /\$nodeCommand = Resolve-ToolCommand -Name "node"/);
  assert.match(startWindowsScript, /\$pnpmCommand = Resolve-ToolCommand -Name "pnpm"/);
  assert.match(startWindowsScript, /& \$pnpmCommand run build/);
  assert.match(startWindowsScript, /param\(\$root, \$port, \$nextCli, \$nodeCommand\)/);
  assert.match(startWindowsScript, /& \$nodeCommand \$nextCli dev \(Join-Path \$root "packages\/web"\) -p \$port/);
  assert.match(
    startWindowsScript,
    /& \$nodeCommand \$nextCli start \(Join-Path \$root "packages\/web"\) -p \$port -H 127\.0\.0\.1/,
  );
});

test('Windows CLI install and vendored runtimes reuse retry-based tool resolution helpers', () => {
  assert.match(commandHelpersScript, /function Resolve-ToolCommandWithRetry/);
  assert.match(commandHelpersScript, /param\(\[string\]\$Name, \[int\]\$Attempts = 1, \[int\]\$DelayMs = 500\)/);
  assert.match(commandHelpersScript, /for \(\$attempt = 0; \$attempt -lt \$Attempts; \$attempt\+\+\)/);
  assert.match(commandHelpersScript, /Start-Sleep -Milliseconds \$DelayMs/);
  assert.match(helpersScript, /Resolve-ToolCommandWithRetry -Name "python" -Attempts 2/);
  assert.match(helpersScript, /Resolve-ToolCommandWithRetry -Name "py" -Attempts 2/);
});

test('Windows PATH refresh preserves shell-provided shim entries while appending machine and user paths', () => {
  assert.match(commandHelpersScript, /function Merge-ToolPathSegments/);
  assert.match(commandHelpersScript, /\$processPath = \$env:Path/);
  assert.match(
    commandHelpersScript,
    /Merge-ToolPathSegments -PathValues @\(\$processPath, \$machinePath, \$userPath\)/,
  );
  assert.match(commandHelpersScript, /\$normalized = \$candidate\.TrimEnd\('\\'\)\.ToLowerInvariant\(\)/);
  assert.match(installScript, /function Refresh-Path \{\s+Sync-ToolPath\s+\}/s);
  assert.doesNotMatch(
    installScript,
    /\$env:Path = \[System\.Environment\]::GetEnvironmentVariable\("Path", "Machine"\) \+ ";" \+\s+\[System\.Environment\]::GetEnvironmentVariable\("Path", "User"\)/,
  );
});

test('Windows stop script resolves redis-cli through the shared helper chain before shutdown', () => {
  assert.match(stopWindowsScript, /install-windows-helpers\.ps1/);
  assert.match(stopWindowsScript, /\$RuntimeStateFile = if \(\$RunDir\) \{ Join-Path \$RunDir "runtime-state\.json" \} else \{ \$null \}/);
  assert.match(stopWindowsScript, /Read-WindowsRuntimeStateFile -StateFile \$RuntimeStateFile/);
  assert.match(stopWindowsScript, /Resolve-PortableRedisBinaries -ProjectRoot \$ProjectRoot/);
  assert.match(stopWindowsScript, /Resolve-PortableRedisLayout -ProjectRoot \$ProjectRoot/);
  assert.match(stopWindowsScript, /Resolve-GlobalRedisBinaries/);
  assert.match(stopWindowsScript, /\$redisCli = \$redisCommands\.CliPath/);
  assert.doesNotMatch(stopWindowsScript, /& redis-cli -p \$RedisPort ping/);
  assert.match(stopWindowsScript, /\$configuredRedisUrl = if \(\$runtimeState -and \$runtimeState\.RedisUrl\)/);
  assert.match(stopWindowsScript, /\$ApiPidFile = if \(\$runtimeState -and \$runtimeState\.ApiPidFile\)/);
  assert.match(stopWindowsScript, /\$redisPidFile = if \(\$runtimeState -and \$runtimeState\.RedisPidFile\)/);
  assert.match(
    stopWindowsScript,
    /\$redisConnections = Get-NetTCPConnection -LocalPort \$RedisPort -State Listen -ErrorAction SilentlyContinue/,
  );
  assert.match(stopWindowsScript, /\$managedRedisPid = Get-ManagedProcessId -ManagedPidFile \$redisPidFile/);
  assert.match(
    stopWindowsScript,
    /\$isOfficeClawOwned = \$isManagedPid -or \(Test-OfficeClawOwnedProcess -ProcessId \$conn\.OwningProcess -OfficeClawProjectRoot \$ProjectRoot\)/,
  );
  assert.match(stopWindowsScript, /Write-Warn "Skipping non-OfficeClaw Redis listener on port \$RedisPort/);
  assert.match(stopWindowsScript, /Get-RedisAuthArgs\s+-RedisUrl\s+\$configuredRedisUrl/);
  assert.match(stopWindowsScript, /@redisAuthArgs\s+ping/);
  assert.match(stopWindowsScript, /@redisAuthArgs\s+shutdown/);
  assert.match(stopWindowsScript, /Remove-WindowsRuntimeStateFile -StateFile \$RuntimeStateFile/);
});

test('Windows start.bat delegates to start-windows.ps1', () => {
  assert.match(startBatScript, /powershell/i);
  assert.match(startBatScript, /start-windows\.ps1/);
});

test('Windows installer generates .env before building so NEXT_PUBLIC_API_URL is baked into the web bundle', () => {
  const envStepMatch = installScript.match(/Step (\d+)\/\d+ - Generate \.env/);
  const buildStepMatch = installScript.match(/Step (\d+)\/\d+ - Install dependencies and build/);
  assert.ok(envStepMatch, 'install.ps1 must have a "Generate .env" step');
  assert.ok(buildStepMatch, 'install.ps1 must have an "Install dependencies and build" step');
  assert.ok(
    Number(envStepMatch[1]) < Number(buildStepMatch[1]),
    `.env generation (Step ${envStepMatch[1]}) must come before build (Step ${buildStepMatch[1]})`,
  );
  assert.match(installScript, /SetEnvironmentVariable\(\$key, \$val, "Process"\)/);
});

test('Windows installer strips surrounding quotes when loading .env into the build session', () => {
  assert.match(installScript, /\$val = \$Matches\[2\]\.Trim\(\)\.Trim\('"'\)\.Trim\("'"\)/);
  assert.match(installScript, /SetEnvironmentVariable\(\$key, \$val, "Process"\)/);
});

test('Windows installer overwrites stale process env with the current repo .env before build', () => {
  assert.match(installScript, /SetEnvironmentVariable\(\$key, \$val, "Process"\)/);
  assert.doesNotMatch(installScript, /if \(-not \[System\.Environment\]::GetEnvironmentVariable\(\$key\)\) \{/);
});
