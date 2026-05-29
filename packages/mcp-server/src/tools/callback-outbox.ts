/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Callback outbox persistence for at-least-once delivery
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getRetryDelaysMs, postJsonWithRetry } from './callback-retry.js';

const DEFAULT_OUTBOX_MAX_FLUSH_BATCH = 20;
const DEFAULT_OUTBOX_MAX_ATTEMPTS = 10;
const OUTBOX_FILE_SUFFIX = '.json';

interface OutboxEntry {
  id: string;
  queuedAt: number;
  apiUrl: string;
  path: string;
  body: Record<string, unknown>;
  attempts: number;
  lastError: string;
}

export interface CallbackRequest {
  apiUrl: string;
  path: string;
  body: Record<string, unknown>;
}

function parseIntEnv(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOutboxEnabled(): boolean {
  const raw = (process.env['OFFICE_CLAW_CALLBACK_OUTBOX_ENABLED'] ?? 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function getOutboxDir(): string {
  const fromEnv = process.env['OFFICE_CLAW_CALLBACK_OUTBOX_DIR'];
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
  return join(homedir(), '.office-claw', 'callback-outbox');
}

function getOutboxMaxFlushBatch(): number {
  const parsed = parseIntEnv(process.env['OFFICE_CLAW_CALLBACK_OUTBOX_MAX_FLUSH_BATCH']);
  if (parsed === null || parsed < 0) return DEFAULT_OUTBOX_MAX_FLUSH_BATCH;
  return parsed;
}

function getOutboxMaxAttempts(): number {
  const parsed = parseIntEnv(process.env['OFFICE_CLAW_CALLBACK_OUTBOX_MAX_ATTEMPTS']);
  if (parsed === null || parsed < 0) return DEFAULT_OUTBOX_MAX_ATTEMPTS;
  return parsed;
}

function parseOutboxEntry(raw: string): OutboxEntry | null {
  try {
    const parsed = JSON.parse(raw) as Partial<OutboxEntry>;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.queuedAt !== 'number' ||
      typeof parsed.apiUrl !== 'string' ||
      typeof parsed.path !== 'string' ||
      typeof parsed.attempts !== 'number' ||
      typeof parsed.lastError !== 'string' ||
      typeof parsed.body !== 'object' ||
      parsed.body === null
    ) {
      return null;
    }
    return parsed as OutboxEntry;
  } catch {
    return null;
  }
}

async function enqueueOutbox(entry: OutboxEntry): Promise<boolean> {
  try {
    const dir = getOutboxDir();
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${entry.queuedAt}-${entry.id}${OUTBOX_FILE_SUFFIX}`);
    await writeFile(file, JSON.stringify(entry), 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function flushOutbox(): Promise<void> {
  if (!isOutboxEnabled()) return;
  const dir = getOutboxDir();
  if (!existsSync(dir)) return;

  const retryDelaysMs = getRetryDelaysMs();
  const maxFlushBatch = getOutboxMaxFlushBatch();
  const maxAttempts = getOutboxMaxAttempts();
  const files = (await readdir(dir))
    .filter((name) => name.endsWith(OUTBOX_FILE_SUFFIX) && !name.endsWith('.processing'))
    .sort()
    .slice(0, maxFlushBatch);

  for (const name of files) {
    const originalPath = join(dir, name);
    const processingPath = `${originalPath}.processing`;

    try {
      await rename(originalPath, processingPath);
    } catch {
      continue;
    }

    try {
      const raw = await readFile(processingPath, 'utf8');
      const entry = parseOutboxEntry(raw);
      if (!entry || entry.attempts >= maxAttempts) {
        await unlink(processingPath);
        continue;
      }

      const replay = await postJsonWithRetry(`${entry.apiUrl}${entry.path}`, JSON.stringify(entry.body), retryDelaysMs);
      if (replay.ok) {
        await unlink(processingPath);
        continue;
      }
      if (!replay.failure.retryable || entry.attempts + 1 >= maxAttempts) {
        await unlink(processingPath);
        continue;
      }

      const updated: OutboxEntry = {
        ...entry,
        attempts: entry.attempts + 1,
        lastError: replay.failure.error,
      };
      await writeFile(processingPath, JSON.stringify(updated), 'utf8');
      await rename(processingPath, originalPath);
    } catch {
      try {
        await rename(processingPath, originalPath);
      } catch {
        // Keep best-effort semantics.
      }
    }
  }
}

export async function sendCallbackRequest(
  request: CallbackRequest,
  options?: { enableOutbox?: boolean },
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const enableOutbox = options?.enableOutbox === true && isOutboxEnabled();
  if (enableOutbox) await flushOutbox();

  const retryDelaysMs = getRetryDelaysMs();
  const payload = JSON.stringify(request.body);
  const result = await postJsonWithRetry(`${request.apiUrl}${request.path}`, payload, retryDelaysMs);
  if (result.ok) return { ok: true, data: result.data };

  if (enableOutbox && result.failure.retryable) {
    const queuedAt = Date.now();
    const queued = await enqueueOutbox({
      id: randomUUID(),
      queuedAt,
      apiUrl: request.apiUrl,
      path: request.path,
      body: request.body,
      attempts: 0,
      lastError: result.failure.error,
    });
    if (queued) {
      return {
        ok: true,
        data: { status: 'queued_for_retry', queuedAt },
      };
    }
  }

  return { ok: false, error: result.failure.error };
}
