/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

const { CliRawArchive } = await import('../dist/domains/agents/services/session/CliRawArchive.js');

const TEST_ARCHIVE_DIR = './test-cli-raw-archive';

function formatToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('CliRawArchive', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ARCHIVE_DIR)) {
      await rm(TEST_ARCHIVE_DIR, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    if (existsSync(TEST_ARCHIVE_DIR)) {
      await rm(TEST_ARCHIVE_DIR, { recursive: true, force: true });
    }
  });

  test('appends entries to the same invocation file in order', async () => {
    const archive = new CliRawArchive({ archiveDir: TEST_ARCHIVE_DIR });

    await archive.append('inv-1', { seq: 1, type: 'thread.started' });
    await archive.append('inv-1', { seq: 2, type: 'item.completed' });

    const file = join(TEST_ARCHIVE_DIR, formatToday(), 'inv-1.ndjson');
    assert.equal(existsSync(file), true);

    const content = await readFile(file, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 2);

    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    assert.equal(first.payload.seq, 1);
    assert.equal(second.payload.seq, 2);
  });

  test('writes different invocationIds to different files', async () => {
    const archive = new CliRawArchive({ archiveDir: TEST_ARCHIVE_DIR });

    await archive.append('inv-a', { marker: 'A' });
    await archive.append('inv-b', { marker: 'B' });

    const dir = join(TEST_ARCHIVE_DIR, formatToday());
    const fileA = join(dir, 'inv-a.ndjson');
    const fileB = join(dir, 'inv-b.ndjson');

    assert.equal(existsSync(fileA), true);
    assert.equal(existsSync(fileB), true);

    const a = JSON.parse((await readFile(fileA, 'utf-8')).trim());
    const b = JSON.parse((await readFile(fileB, 'utf-8')).trim());
    assert.equal(a.payload.marker, 'A');
    assert.equal(b.payload.marker, 'B');
  });

  test('rejects invalid invocationId path traversal attempts', async () => {
    const archive = new CliRawArchive({ archiveDir: TEST_ARCHIVE_DIR });

    await assert.rejects(archive.append('../etc/passwd', { marker: 'x' }), /Invalid invocationId/);
  });

  test('supports concurrent append calls for same invocation', async () => {
    const archive = new CliRawArchive({ archiveDir: TEST_ARCHIVE_DIR });

    const events = Array.from({ length: 20 }, (_, index) => ({
      seq: index + 1,
      type: 'item.completed',
    }));

    await Promise.all(events.map((event) => archive.append('inv-concurrent', event)));

    const file = join(TEST_ARCHIVE_DIR, formatToday(), 'inv-concurrent.ndjson');
    assert.equal(existsSync(file), true);

    const content = await readFile(file, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 20);

    const found = new Set(lines.map((line) => JSON.parse(line).payload.seq));
    assert.equal(found.size, 20);
    for (let i = 1; i <= 20; i += 1) {
      assert.equal(found.has(i), true);
    }
  });
});
