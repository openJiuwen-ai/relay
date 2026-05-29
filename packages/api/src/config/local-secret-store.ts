/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { execFileSync } from 'node:child_process';

export interface LocalSecretBackend {
  get(key: string): string | null;
  getBatch(keys: string[]): Map<string, string>;
  set(key: string, value: string): void;
  delete(key: string): void;
}

const SECRET_SCHEME = 'wincred://';
const SECRET_NAMESPACE = 'OfficeClaw';
const CONNECTOR_SECRET_ENV_VARS = new Set([
  'FEISHU_APP_SECRET',
  'FEISHU_VERIFICATION_TOKEN',
  'DINGTALK_APP_SECRET',
  'XIAOYI_AK',
  'XIAOYI_SK',
  'WEIXIN_BOT_TOKEN',
]);

let backendOverride: LocalSecretBackend | null | undefined;

const SECRET_READ_CACHE = new Map<string, { value: string | null; timestamp: number }>();
const SECRET_CACHE_TTL_MS = 60_000;
let secretCacheEnabled = true;

function encodeSecretPathSegment(value: string): string {
  return encodeURIComponent(value);
}

function decodeSecretPathSegment(value: string): string {
  return decodeURIComponent(value);
}

function buildWinCredTarget(path: string): string {
  return `${SECRET_NAMESPACE}/${path}`;
}

function buildSecretRef(path: string): string {
  return `${SECRET_SCHEME}${buildWinCredTarget(path)}`;
}

function parseSecretRef(ref: string): { scheme: string; target: string } | null {
  if (typeof ref !== 'string' || !ref.startsWith(SECRET_SCHEME)) return null;
  const target = ref.slice(SECRET_SCHEME.length).trim();
  if (!target) return null;
  return { scheme: SECRET_SCHEME.slice(0, -3), target };
}

function encodePowerShellCommand(command: string): string {
  return Buffer.from(command, 'utf16le').toString('base64');
}

function runWindowsCredentialCommand(payload: Record<string, unknown>): string {
  const command = `
$ErrorActionPreference = 'Stop'
$payload = [Console]::In.ReadToEnd()
if (-not $payload) { throw 'Missing payload' }
$json = $payload | ConvertFrom-Json
$action = [string]$json.action
$target = [string]$json.target
$targets = if ($json.PSObject.Properties.Match('targets').Count -gt 0) { $json.targets } else { $null }
$secret = if ($json.PSObject.Properties.Match('secret').Count -gt 0) { [string]$json.secret } else { $null }
$source = @"
using System;
using System.Runtime.InteropServices;
public static class WinCredNative {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public UInt32 Flags;
    public UInt32 Type;
    public string TargetName;
    public string Comment;
    public long LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, UInt32 type, UInt32 reservedFlag, out IntPtr credentialPtr);
  [DllImport("Advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredWrite(ref CREDENTIAL credential, UInt32 flags);
  [DllImport("Advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredDelete(string target, UInt32 type, UInt32 flags);
  [DllImport("Advapi32.dll", SetLastError = true)]
  public static extern void CredFree(IntPtr credentialPtr);
}
"@
Add-Type -TypeDefinition $source
$CRED_TYPE_GENERIC = 1
$CRED_PERSIST_LOCAL_MACHINE = 2

function Read-SingleSecret($t) {
  $credentialPtr = [IntPtr]::Zero
  $ok = [WinCredNative]::CredRead($t, $CRED_TYPE_GENERIC, 0, [ref]$credentialPtr)
  if (-not $ok) {
    $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($err -eq 1168) {
      return $null
    }
    throw "CredRead failed for $t : $err"
  }
  try {
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($credentialPtr, [type][WinCredNative+CREDENTIAL])
    if ($credential.CredentialBlobSize -le 0 -or $credential.CredentialBlob -eq [IntPtr]::Zero) {
      return ''
    }
    $bytes = New-Object byte[] $credential.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $bytes, 0, $credential.CredentialBlobSize)
    return [System.Text.Encoding]::Unicode.GetString($bytes).TrimEnd([char]0)
  } finally {
    if ($credentialPtr -ne [IntPtr]::Zero) {
      [WinCredNative]::CredFree($credentialPtr)
    }
  }
}

switch ($action) {
  'getBatch' {
    $results = @{}
    foreach ($t in $targets) {
      $secretValue = Read-SingleSecret $t
      if ($null -ne $secretValue) {
        $results[$t] = $secretValue
      }
    }
    $results | ConvertTo-Json -Compress
  }
  'get' {
    $credentialPtr = [IntPtr]::Zero
    $ok = [WinCredNative]::CredRead($target, $CRED_TYPE_GENERIC, 0, [ref]$credentialPtr)
    if (-not $ok) {
      $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      if ($err -eq 1168) {
        [Console]::Write('{"found":false}')
        exit 0
      }
      throw "CredRead failed: $err"
    }
    try {
      $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($credentialPtr, [type][WinCredNative+CREDENTIAL])
      if ($credential.CredentialBlobSize -le 0 -or $credential.CredentialBlob -eq [IntPtr]::Zero) {
        [Console]::Write('{"found":true,"secret":""}')
      } else {
        $bytes = New-Object byte[] $credential.CredentialBlobSize
        [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $bytes, 0, $credential.CredentialBlobSize)
        $secretText = [System.Text.Encoding]::Unicode.GetString($bytes).TrimEnd([char]0)
        [Console]::Write(($secretText | ConvertTo-Json -Compress | ForEach-Object { '{"found":true,"secret":' + $_ + '}' }))
      }
    } finally {
      if ($credentialPtr -ne [IntPtr]::Zero) {
        [WinCredNative]::CredFree($credentialPtr)
      }
    }
  }
  'set' {
    $bytes = [System.Text.Encoding]::Unicode.GetBytes($secret)
    $blob = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
    try {
      [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blob, $bytes.Length)
      $credential = New-Object WinCredNative+CREDENTIAL
      $credential.Type = $CRED_TYPE_GENERIC
      $credential.TargetName = $target
      $credential.CredentialBlobSize = $bytes.Length
      $credential.CredentialBlob = $blob
      $credential.Persist = $CRED_PERSIST_LOCAL_MACHINE
      $credential.UserName = $target
      if (-not [WinCredNative]::CredWrite([ref]$credential, 0)) {
        $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "CredWrite failed: $err"
      }
      [Console]::Write('{"ok":true}')
    } finally {
      if ($blob -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::FreeHGlobal($blob)
      }
    }
  }
  'delete' {
    $ok = [WinCredNative]::CredDelete($target, $CRED_TYPE_GENERIC, 0)
    if (-not $ok) {
      $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      if ($err -ne 1168) {
        throw "CredDelete failed: $err"
      }
    }
    [Console]::Write('{"ok":true}')
  }
  default {
    throw "Unsupported action: $action"
  }
}
`;
  const stdout = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShellCommand(command)],
    {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
  return stdout.trim();
}

class WindowsCredentialBackend implements LocalSecretBackend {
  get(key: string): string | null {
    const raw = runWindowsCredentialCommand({ action: 'get', target: key });
    const parsed = JSON.parse(raw) as { found?: boolean; secret?: string };
    if (!parsed.found) return null;
    return typeof parsed.secret === 'string' ? parsed.secret : '';
  }

  getBatch(keys: string[]): Map<string, string> {
    if (keys.length === 0) return new Map();
    const raw = runWindowsCredentialCommand({ action: 'getBatch', targets: keys });
    const parsed = JSON.parse(raw) as Record<string, string>;
    const result = new Map<string, string>();
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        result.set(key, value);
      }
    }
    return result;
  }

  set(key: string, value: string): void {
    runWindowsCredentialCommand({ action: 'set', target: key, secret: value });
  }

  delete(key: string): void {
    runWindowsCredentialCommand({ action: 'delete', target: key });
  }
}

function defaultBackend(): LocalSecretBackend | null {
  return process.platform === 'win32' ? new WindowsCredentialBackend() : null;
}

function getBackend(): LocalSecretBackend | null {
  return backendOverride !== undefined ? backendOverride : defaultBackend();
}

function normalizeConnectorEnvValue(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function setLocalSecretBackendForTests(backend: LocalSecretBackend | null | undefined): void {
  backendOverride = backend;
}

export function resetLocalSecretBackendForTests(): void {
  backendOverride = undefined;
}

export function isLocalSecretStorageEnabled(): boolean {
  return getBackend() != null;
}

export function buildConnectorEnvRefVarName(name: string): string {
  return `${name}_REF`;
}

export function isConnectorSecretBackedEnvVarName(name: string): boolean {
  return CONNECTOR_SECRET_ENV_VARS.has(name);
}

export function buildConnectorEnvSecretRef(name: string): string {
  return buildSecretRef(`env/${encodeSecretPathSegment(name)}`);
}

export function readSecretRef(ref: string | undefined | null): string | null {
  if (!ref) return null;
  const parsed = parseSecretRef(ref);
  if (!parsed) return null;
  const backend = getBackend();
  if (!backend) return null;

  if (secretCacheEnabled) {
    const cached = SECRET_READ_CACHE.get(parsed.target);
    if (cached && Date.now() - cached.timestamp < SECRET_CACHE_TTL_MS) {
      return cached.value;
    }
  }

  const value = backend.get(parsed.target);

  if (secretCacheEnabled) {
    SECRET_READ_CACHE.set(parsed.target, { value, timestamp: Date.now() });
  }

  return value;
}

export function preloadSecretRefs(refs: (string | undefined | null)[]): void {
  const backend = getBackend();
  if (!backend || !secretCacheEnabled) return;

  const targetsToFetch: string[] = [];
  const refToTarget = new Map<string, string>();

  for (const ref of refs) {
    if (!ref) continue;
    const parsed = parseSecretRef(ref);
    if (!parsed) continue;

    const cached = SECRET_READ_CACHE.get(parsed.target);
    if (cached && Date.now() - cached.timestamp < SECRET_CACHE_TTL_MS) {
      continue;
    }

    if (!refToTarget.has(ref)) {
      refToTarget.set(ref, parsed.target);
      targetsToFetch.push(parsed.target);
    }
  }

  if (targetsToFetch.length === 0) return;

  const results = backend.getBatch(targetsToFetch);
  const now = Date.now();

  for (const target of targetsToFetch) {
    const value = results.has(target) ? results.get(target)! : null;
    SECRET_READ_CACHE.set(target, { value, timestamp: now });
  }
}

export function writeSecretRef(ref: string, value: string): void {
  const parsed = parseSecretRef(ref);
  if (!parsed) throw new Error(`Unsupported secret ref: ${ref}`);
  const backend = getBackend();
  if (!backend) throw new Error('Local secret storage is not available');
  backend.set(parsed.target, value);
  SECRET_READ_CACHE.delete(parsed.target);
}

export function deleteSecretRef(ref: string | undefined | null): void {
  if (!ref) return;
  const parsed = parseSecretRef(ref);
  if (!parsed) return;
  const backend = getBackend();
  if (!backend) return;
  backend.delete(parsed.target);
  SECRET_READ_CACHE.delete(parsed.target);
}

export function getConnectorEnvValue(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const direct = normalizeConnectorEnvValue(env[name]);
  if (direct != null) return direct;
  if (!isConnectorSecretBackedEnvVarName(name)) return undefined;
  return normalizeConnectorEnvValue(readSecretRef(env[buildConnectorEnvRefVarName(name)]));
}

export function hasConnectorEnvValue(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (normalizeConnectorEnvValue(env[name]) != null) return true;
  if (!isConnectorSecretBackedEnvVarName(name)) return false;
  const ref = env[buildConnectorEnvRefVarName(name)];
  return typeof ref === 'string' && ref.trim().length > 0;
}

export function persistConnectorEnvSecret(name: string, value: string): { refName: string; refValue: string } {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} must not be empty`);
  const refName = buildConnectorEnvRefVarName(name);
  const refValue = buildConnectorEnvSecretRef(name);
  writeSecretRef(refValue, trimmed);
  return { refName, refValue };
}

export function clearConnectorEnvSecret(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const refName = buildConnectorEnvRefVarName(name);
  deleteSecretRef(env[refName] ?? buildConnectorEnvSecretRef(name));
  return refName;
}

export function buildProviderProfileApiKeyRef(profileId: string): string {
  return buildSecretRef(`profiles/${encodeSecretPathSegment(profileId)}/apiKey`);
}

export function buildModelConfigSourceApiKeyRef(projectRoot: string, sourceId: string): string {
  return buildSecretRef(
    `model-config/${encodeSecretPathSegment(projectRoot)}/${encodeSecretPathSegment(sourceId)}/apiKey`,
  );
}

export function buildProviderProfileEnvRef(profileId: string): string {
  return buildSecretRef(`profiles/${encodeSecretPathSegment(profileId)}/env`);
}

export function buildWeixinSessionRef(): string {
  return buildSecretRef('connectors/weixin/session-bot-token');
}

export function encodeProviderProfileEnvSecret(env: Record<string, string>): string {
  return JSON.stringify(env);
}

export function decodeProviderProfileEnvSecret(raw: string | null): Record<string, string> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  } catch {
    return undefined;
  }
}

export function decodeSecretRefForTests(ref: string): string | null {
  const parsed = parseSecretRef(ref);
  return parsed ? parsed.target : null;
}

export function decodeProviderProfileIdFromRef(ref: string): string | null {
  const parsed = parseSecretRef(ref);
  if (!parsed) return null;
  const match = parsed.target.match(/^OfficeClaw\/profiles\/([^/]+)\/(?:apiKey|env)$/);
  return match ? decodeSecretPathSegment(match[1] ?? '') : null;
}

export function clearSecretCache(): void {
  SECRET_READ_CACHE.clear();
}

export function setSecretCacheEnabled(enabled: boolean): void {
  secretCacheEnabled = enabled;
  if (!enabled) {
    SECRET_READ_CACHE.clear();
  }
}

export function getSecretCacheStats(): { size: number; enabled: boolean; ttlMs: number } {
  return {
    size: SECRET_READ_CACHE.size,
    enabled: secretCacheEnabled,
    ttlMs: SECRET_CACHE_TTL_MS,
  };
}
