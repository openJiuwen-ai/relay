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

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const startWindowsScript = readFileSync(join(repoRoot, 'scripts', 'start-windows.ps1'), 'utf8');
const devBackendScript = readFileSync(join(repoRoot, 'scripts', 'dev-backend.mjs'), 'utf8');
const devAllScript = readFileSync(join(repoRoot, 'scripts', 'dev-all.mjs'), 'utf8');

test('Windows startup fails closed when Redis startup or ping fails', () => {
  assert.doesNotMatch(startWindowsScript, /falling back to memory storage/i);
  assert.doesNotMatch(startWindowsScript, /using memory storage/i);
  assert.match(startWindowsScript, /function Invoke-RedisCliCommand/);
  assert.match(startWindowsScript, /\$process\.WaitForExit\(\$TimeoutMs\)/);
  assert.match(startWindowsScript, /function Write-RedisLogTail/);
  assert.match(startWindowsScript, /Ensure-WindowsRedis -ProjectRoot \$ProjectRoot -Memory:\$false/);
  assert.match(startWindowsScript, /Redis start failed: ping did not return PONG/);
  assert.match(startWindowsScript, /Redis startup failed: Redis binaries not found/);
  assert.match(startWindowsScript, /Write-RedisLogTail -RedisLogFile \$redisLogFile/);
  assert.match(startWindowsScript, /throw "Redis start failed: ping did not return PONG on port \$RedisPort"/);
  assert.match(startWindowsScript, /Memory mode \(-Memory\) - data will be lost on restart/);
  assert.match(startWindowsScript, /\$env:MEMORY_STORE = "1"/);
});

test('Windows startup fails closed when the local Redis port is occupied by a non-Redis listener', () => {
  assert.match(startWindowsScript, /Redis port \$RedisPort already has a listener \(PID \$\(\$redisListener\.OwningProcess\)\); probing with redis-cli/);
  assert.match(startWindowsScript, /Redis port \$RedisPort is in use but did not respond to Redis PING/);
  assert.match(startWindowsScript, /Redis listener PID: \$\(\$redisListener\.OwningProcess\)/);
  assert.match(startWindowsScript, /throw "Redis port \$RedisPort is occupied by a non-Redis or incompatible Redis process"/);
});

test('Windows startup preflights external Redis before starting API', () => {
  assert.match(startWindowsScript, /function Get-ExternalRedisPreflightError/);
  assert.match(startWindowsScript, /External Redis preflight failed: AUTH failed/);
  assert.match(startWindowsScript, /External Redis preflight failed: SELECT \$dbPath failed/);
  assert.match(startWindowsScript, /External Redis preflight failed: PING failed/);
  assert.match(startWindowsScript, /\$externalRedisError = Get-ExternalRedisPreflightError -RedisUrl \$configuredRedisUrl/);
  assert.match(startWindowsScript, /throw \$externalRedisError/);
  assert.match(startWindowsScript, /External Redis preflight passed \(PING=PONG\)/);
});

test('dev backend fails closed instead of enabling MEMORY_STORE on Redis failure', () => {
  assert.doesNotMatch(devBackendScript, /function enableMemoryMode/);
  assert.doesNotMatch(devBackendScript, /setupStorageWithFallback/);
  assert.doesNotMatch(devBackendScript, /process\.env\.MEMORY_STORE\s*=\s*['"]1['"]/);
  assert.match(devBackendScript, /function setupRedisStorage/);
  assert.match(devBackendScript, /async function ensureWindowsPortableRedisInstalled/);
  assert.match(devBackendScript, /Redis auto-install failed:/);
  assert.match(devBackendScript, /Redis startup failed:/);
  assert.match(devBackendScript, /Redis is required for dev:backend but is unavailable/);
});

test('dev all inherits the backend Redis fail-closed policy', () => {
  assert.match(devAllScript, /scripts\/dev-backend\.mjs/);
});
