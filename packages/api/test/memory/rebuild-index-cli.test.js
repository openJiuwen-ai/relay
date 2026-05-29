/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F102 Phase B: rebuild-index CLI + auto-create tests
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

describe('rebuild-index CLI', () => {
  let tmpDir;
  let docsDir;
  let dbPath;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `f102-cli-${randomUUID().slice(0, 8)}`);
    docsDir = join(tmpDir, 'docs');
    dbPath = join(tmpDir, 'data', 'evidence.sqlite');
    mkdirSync(join(docsDir, 'features'), { recursive: true });
    mkdirSync(join(tmpDir, 'data'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('auto-creates evidence.sqlite on first initialize', async () => {
    assert.equal(existsSync(dbPath), false, 'DB should not exist yet');

    const { SqliteEvidenceStore } = await import('../../dist/domains/memory/SqliteEvidenceStore.js');
    const store = new SqliteEvidenceStore(dbPath);
    await store.initialize();

    assert.equal(existsSync(dbPath), true, 'DB should be created');
    assert.equal(await store.health(), true);

    store.close();
  });

  it('rebuild-index indexes docs and creates consistent FTS', async () => {
    writeFileSync(
      join(docsDir, 'features', 'F042.md'),
      `---
feature_ids: [F042]
topics: [prompt, skills]
doc_kind: spec
---

# F042: Prompt Engineering Audit

Content about prompt engineering.
`,
    );

    const { SqliteEvidenceStore } = await import('../../dist/domains/memory/SqliteEvidenceStore.js');
    const { IndexBuilder } = await import('../../dist/domains/memory/IndexBuilder.js');

    const store = new SqliteEvidenceStore(dbPath);
    await store.initialize();

    const builder = new IndexBuilder(store, docsDir);
    const result = await builder.rebuild();

    assert.equal(result.docsIndexed, 1);

    const item = await store.getByAnchor('F042');
    assert.ok(item);
    assert.equal(item.title, 'F042: Prompt Engineering Audit');

    const consistency = await builder.checkConsistency();
    assert.equal(consistency.ok, true);

    store.close();
  });

  it('second rebuild skips unchanged docs (hash-based)', async () => {
    writeFileSync(
      join(docsDir, 'features', 'F001.md'),
      `---
feature_ids: [F001]
doc_kind: spec
---

# F001: Test
`,
    );

    const { SqliteEvidenceStore } = await import('../../dist/domains/memory/SqliteEvidenceStore.js');
    const { IndexBuilder } = await import('../../dist/domains/memory/IndexBuilder.js');

    const store = new SqliteEvidenceStore(dbPath);
    await store.initialize();
    const builder = new IndexBuilder(store, docsDir);

    const r1 = await builder.rebuild();
    assert.equal(r1.docsIndexed, 1);

    const r2 = await builder.rebuild();
    assert.equal(r2.docsSkipped, 1);
    assert.equal(r2.docsIndexed, 0);

    store.close();
  });
});
