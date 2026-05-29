/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { MediaCleanupJob } from '../dist/infrastructure/connectors/media/MediaCleanupJob.js';

const TMP = join(tmpdir(), 'media-cleanup-test');
const ONE_HOUR = 60 * 60 * 1000;
const TWENTY_FIVE_HOURS = 25 * ONE_HOUR;

const noopLog = /** @type {any} */ ({
  info: () => {},
  error: () => {},
});

describe('MediaCleanupJob', () => {
  beforeEach(async () => {
    await mkdir(TMP, { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP, { recursive: true, force: true });
  });

  test('removes files older than TTL', async () => {
    const oldFile = join(TMP, 'old.jpg');
    const newFile = join(TMP, 'new.jpg');
    await writeFile(oldFile, 'old-data');
    await writeFile(newFile, 'new-data');

    // Set old file mtime to 25 hours ago
    const oldTime = new Date(Date.now() - TWENTY_FIVE_HOURS);
    await utimes(oldFile, oldTime, oldTime);

    const job = new MediaCleanupJob({
      mediaDir: TMP,
      ttlMs: 24 * ONE_HOUR,
      intervalMs: ONE_HOUR,
      log: noopLog,
    });

    const removed = await job.sweep();
    assert.equal(removed, 1);

    // old.jpg should be gone
    await assert.rejects(() => stat(oldFile), { code: 'ENOENT' });
    // new.jpg should remain
    const s = await stat(newFile);
    assert.ok(s.isFile());
  });

  test('preserves files newer than TTL', async () => {
    await writeFile(join(TMP, 'a.jpg'), 'data-a');
    await writeFile(join(TMP, 'b.png'), 'data-b');

    const job = new MediaCleanupJob({
      mediaDir: TMP,
      ttlMs: 24 * ONE_HOUR,
      intervalMs: ONE_HOUR,
      log: noopLog,
    });

    const removed = await job.sweep();
    assert.equal(removed, 0);
  });

  test('handles non-existent directory gracefully', async () => {
    const job = new MediaCleanupJob({
      mediaDir: join(TMP, 'does-not-exist'),
      ttlMs: 24 * ONE_HOUR,
      intervalMs: ONE_HOUR,
      log: noopLog,
    });

    const removed = await job.sweep();
    assert.equal(removed, 0);
  });

  test('start() and stop() lifecycle', async () => {
    const job = new MediaCleanupJob({
      mediaDir: TMP,
      ttlMs: 24 * ONE_HOUR,
      intervalMs: 100_000, // won't fire during test
      log: noopLog,
    });

    job.start();
    job.stop();
    // No assertion needed — just verifying no crash
  });
});
