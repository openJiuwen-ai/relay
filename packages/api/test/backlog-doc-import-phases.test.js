/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { parseFeatureDocPhases, parseFeatureDocRisks } = await import('../dist/routes/backlog-doc-import.js');

const SAMPLE_DOC = `---
feature_ids: [F058]
related_features: [F049, F037]
---

# F058: Mission Control Enhancements

> **Status**: in-progress | **Owner**: Claude/宪宪

## What

### Phase A: 基础架构

Remote-first sync + YAML parsing

### Phase B: 线程关联 + UI

Fuzzy matching + tab layout

### Phase C: 进度面板 + 依赖修复

Progress dashboard + dependency graph data

## Acceptance Criteria

### Phase A（基础架构）
- [x] AC-A1: Remote-first BACKLOG sync
- [x] AC-A2: YAML frontmatter status parsing

### Phase B（线程关联 + UI）
- [x] AC-B1: Thread fuzzy matching
- [ ] AC-B2: Feature progress dashboard
- [ ] AC-B3: Dependency graph fix

## Risk

| 风险 | 缓解 |
|------|------|
| Feature doc 格式不统一 | 建立标准模板 |
| 依赖图数据源缺失 | 重新 import |
`;

describe('parseFeatureDocPhases', () => {
  it('extracts phases with names from ### Phase X: Name headings', () => {
    const phases = parseFeatureDocPhases(SAMPLE_DOC);
    assert.equal(phases.length, 3);
    assert.equal(phases[0].id, 'A');
    assert.equal(phases[0].name, '基础架构');
    assert.equal(phases[1].id, 'B');
    assert.equal(phases[1].name, '线程关联 + UI');
    assert.equal(phases[2].id, 'C');
    assert.equal(phases[2].name, '进度面板 + 依赖修复');
  });

  it('extracts ACs grouped by phase', () => {
    const phases = parseFeatureDocPhases(SAMPLE_DOC);
    assert.equal(phases[0].acs.length, 2);
    assert.equal(phases[0].acs[0].id, 'AC-A1');
    assert.equal(phases[0].acs[0].text, 'Remote-first BACKLOG sync');
    assert.equal(phases[0].acs[0].done, true);
    assert.equal(phases[0].acs[1].done, true);
    assert.equal(phases[1].acs.length, 3);
    assert.equal(phases[1].acs[0].done, true);
    assert.equal(phases[1].acs[1].done, false);
    assert.equal(phases[2].acs.length, 0);
  });

  it('returns empty array for doc without phases', () => {
    const phases = parseFeatureDocPhases('# Simple doc\n\nNo phases here.');
    assert.equal(phases.length, 0);
  });
});

describe('parseFeatureDocRisks', () => {
  it('extracts risks from markdown table', () => {
    const risks = parseFeatureDocRisks(SAMPLE_DOC);
    assert.equal(risks.length, 2);
    assert.equal(risks[0].risk, 'Feature doc 格式不统一');
    assert.equal(risks[0].mitigation, '建立标准模板');
  });

  it('returns empty array for doc without risk table', () => {
    const risks = parseFeatureDocRisks('# No risks');
    assert.equal(risks.length, 0);
  });

  it('handles 3-column risk table and rows containing 风险 keyword (P1 regression)', () => {
    const doc = `## Risk

| 风险 | 影响 | 缓解 |
|------|------|------|
| 文件系统风险暴露 | 安全隐患 | 加白名单 |
| 性能退化 | 用户体验差 | 加缓存 |
`;
    const risks = parseFeatureDocRisks(doc);
    assert.equal(risks.length, 2, 'should not filter rows containing 风险');
    assert.equal(risks[0].risk, '文件系统风险暴露');
    assert.equal(risks[0].mitigation, '加白名单', 'mitigation should be last column, not 影响');
    assert.equal(risks[1].risk, '性能退化');
    assert.equal(risks[1].mitigation, '加缓存');
  });
});
