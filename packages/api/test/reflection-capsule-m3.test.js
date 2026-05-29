/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');

describe('F086 M3: Reflection capsule infrastructure', () => {
  it('docs/reflections/README.md exists with capsule schema template', () => {
    const readmePath = resolve(ROOT, 'docs/reflections/README.md');
    assert.ok(existsSync(readmePath), 'Missing docs/reflections/README.md');
    const content = readFileSync(readmePath, 'utf-8');
    // Check all required fields are documented (as markdown headers or YAML keys)
    const requiredFields = [
      'capsule_id',
      'context',
      'What Worked',
      'What Failed',
      'Trigger Missed',
      'Doc Links',
      'Rule Update Target',
    ];
    for (const field of requiredFields) {
      assert.ok(content.includes(field), `Missing capsule field: ${field}`);
    }
  });

  it('naming convention documented', () => {
    const content = readFileSync(resolve(ROOT, 'docs/reflections/README.md'), 'utf-8');
    assert.ok(content.includes('YYYY-MM-DD'), 'Missing naming convention');
    assert.ok(content.includes('capsule.md'), 'Missing capsule suffix');
  });

  it('feat-lifecycle completion has reflection capsule step', () => {
    const content = readFileSync(resolve(ROOT, 'office-claw-skills/feat-lifecycle/SKILL.md'), 'utf-8');
    assert.ok(content.includes('反思胶囊'), 'Missing reflection capsule step in completion');
    assert.ok(content.includes('docs/reflections'), 'Missing reflections directory reference');
  });

  it('proof-of-concept capsule exists', () => {
    const reflectionsDir = resolve(ROOT, 'docs/reflections');
    assert.ok(existsSync(reflectionsDir), 'Missing docs/reflections/ directory');
    const files = readdirSync(reflectionsDir);
    const capsules = files.filter((f) => f.endsWith('-capsule.md'));
    assert.ok(capsules.length >= 1, 'No capsule files found');
  });

  it('doc index script exists', () => {
    const scriptPath = resolve(ROOT, 'scripts/build-doc-index.mjs');
    assert.ok(existsSync(scriptPath), 'Missing scripts/build-doc-index.mjs');
  });
});
