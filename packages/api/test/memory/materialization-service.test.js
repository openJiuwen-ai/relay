/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

describe('MaterializationService', () => {
  let tmpDir;
  let markersDir;
  let queue;
  let service;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `f102-mat-${randomUUID().slice(0, 8)}`);
    markersDir = join(tmpDir, 'docs', 'markers');
    mkdirSync(markersDir, { recursive: true });
    mkdirSync(join(tmpDir, 'docs', 'lessons'), { recursive: true });

    const { MarkerQueue } = await import('../../dist/domains/memory/MarkerQueue.js');
    const { MaterializationService } = await import('../../dist/domains/memory/MaterializationService.js');

    queue = new MarkerQueue(markersDir);
    service = new MaterializationService(queue, join(tmpDir, 'docs'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('canMaterialize returns true for approved markers', async () => {
    const marker = await queue.submit({
      content: 'A lesson learned',
      source: 'opus:t1',
      status: 'captured',
      targetKind: 'lesson',
    });
    assert.equal(await service.canMaterialize(marker.id), false);

    await queue.transition(marker.id, 'approved');
    assert.equal(await service.canMaterialize(marker.id), true);
  });

  it('materialize creates .md file and transitions marker', async () => {
    const marker = await queue.submit({
      content: 'Redis 6399 is sacred — never touch it in dev',
      source: 'opus:t1',
      status: 'captured',
      targetKind: 'lesson',
    });
    await queue.transition(marker.id, 'approved');

    const result = await service.materialize(marker.id);
    assert.ok(result.outputPath);
    assert.ok(result.anchor);

    // Marker should be transitioned to materialized
    const markers = await queue.list({ status: 'materialized' });
    assert.equal(markers.length, 1);
  });

  it('materialize throws for non-approved marker', async () => {
    const marker = await queue.submit({
      content: 'Test',
      source: 'opus:t1',
      status: 'captured',
    });

    await assert.rejects(() => service.materialize(marker.id), {
      message: /not approved/i,
    });
  });
});
