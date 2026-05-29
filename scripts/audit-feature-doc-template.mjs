#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */


import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HELP = `Usage: node scripts/audit-feature-doc-template.mjs [options]

Audit docs/features/F*.md against F094 Phase A template baseline.

Options:
  --features-dir <path>   Feature docs directory (default: docs/features)
  --output-json <path>    JSON output path (default: docs/features/assets/F094/phase-a-audit.json)
  --output-md <path>      Markdown output path (default: docs/features/assets/F094/phase-a-audit.md)
  --help                  Show this help
`;

const CHECKS = [
  { key: 'fm_feature_ids', label: 'frontmatter.feature_ids' },
  { key: 'fm_related_features', label: 'frontmatter.related_features' },
  { key: 'fm_topics', label: 'frontmatter.topics' },
  { key: 'fm_doc_kind', label: 'frontmatter.doc_kind' },
  { key: 'fm_created', label: 'frontmatter.created' },
  { key: 'status_line', label: 'Status line (`> **Status**: ... | **Owner**: ...`)' },
  { key: 'section_why', label: '## Why' },
  { key: 'section_what', label: '## What' },
  { key: 'section_acceptance_criteria', label: '## Acceptance Criteria' },
  { key: 'section_dependencies', label: '## Dependencies' },
  { key: 'ac_format', label: 'AC format (`- [ ] AC-A1: ...`)' },
  { key: 'dependency_tags', label: 'Dependency tags (`Evolved from/Blocked by/Related`)' },
  { key: 'section_risk', label: '## Risk' },
];

const TIER_RULES = [
  { tier: 'green', min: 80, max: 100 },
  { tier: 'yellow', min: 50, max: 79.999 },
  { tier: 'red', min: 0, max: 49.999 },
];

function parseArgs(argv) {
  const options = {
    featuresDir: path.resolve(process.cwd(), 'docs', 'features'),
    outputJson: path.resolve(process.cwd(), 'docs', 'features', 'assets', 'F094', 'phase-a-audit.json'),
    outputMd: path.resolve(process.cwd(), 'docs', 'features', 'assets', 'F094', 'phase-a-audit.md'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log(HELP);
      process.exit(0);
    }
    if (arg === '--features-dir') {
      options.featuresDir = path.resolve(process.cwd(), argv[index + 1] ?? 'docs/features');
      index += 1;
      continue;
    }
    if (arg === '--output-json') {
      options.outputJson = path.resolve(
        process.cwd(),
        argv[index + 1] ?? 'docs/features/assets/F094/phase-a-audit.json',
      );
      index += 1;
      continue;
    }
    if (arg === '--output-md') {
      options.outputMd = path.resolve(process.cwd(), argv[index + 1] ?? 'docs/features/assets/F094/phase-a-audit.md');
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeFeatureId(raw) {
  if (typeof raw !== 'string') return null;
  const match = raw.match(/f?(\d{1,4})/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return `F${String(parsed).padStart(3, '0')}`;
}

function extractFrontmatter(content) {
  const match = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/);
  if (!match) {
    return { raw: null, map: {} };
  }

  const map = {};
  for (const line of match[1].split(/\r?\n/)) {
    const parsed = line.match(/^([a-z_]+):\s*(.+)?$/i);
    if (!parsed) continue;
    const key = parsed[1].trim();
    const value = (parsed[2] ?? '').trim();
    map[key] = value;
  }
  return { raw: match[1], map };
}

function hasSection(content, name) {
  const re = new RegExp(`^##\\s+${escapeRegex(name)}(?:\\s|$)`, 'm');
  return re.test(content);
}

function hasStatusLine(content) {
  const firstLines = content.split('\n').slice(0, 40).join('\n');
  return /^>\s*\*\*Status\*\*:\s*.+\|\s*\*\*Owner\*\*:\s*.+$/m.test(firstLines);
}

function hasAcFormat(content) {
  return /^\s*-\s*\[[ xX]\]\s*AC-[A-Z]\d+\s*:/m.test(content);
}

function hasDependencyTags(content) {
  return /\*\*(Evolved from|Blocked by|Related)\*\*\s*:/i.test(content);
}

function parseFeatureIds(frontmatterValue) {
  if (!frontmatterValue) return [];
  if (!frontmatterValue.startsWith('[') || !frontmatterValue.endsWith(']')) {
    const normalized = normalizeFeatureId(frontmatterValue);
    return normalized ? [normalized] : [];
  }
  const values = frontmatterValue
    .slice(1, -1)
    .split(',')
    .map((part) => normalizeFeatureId(part.trim()))
    .filter(Boolean);
  return [...new Set(values)];
}

function inferFeatureId(filename, frontmatter) {
  const fromFrontmatter = parseFeatureIds(frontmatter.feature_ids)[0];
  if (fromFrontmatter) return fromFrontmatter;
  return normalizeFeatureId(path.basename(filename, '.md')) ?? 'UNKNOWN';
}

function classify(scorePercent) {
  const matched = TIER_RULES.find((rule) => scorePercent >= rule.min && scorePercent <= rule.max);
  return matched?.tier ?? 'red';
}

function toPercent(passed, total) {
  if (total === 0) return 0;
  return Math.round((passed / total) * 10000) / 100;
}

function sortByFeatureIdThenName(a, b) {
  const aId = normalizeFeatureId(a.featureId);
  const bId = normalizeFeatureId(b.featureId);
  const aNum = aId ? Number.parseInt(aId.slice(1), 10) : Number.MAX_SAFE_INTEGER;
  const bNum = bId ? Number.parseInt(bId.slice(1), 10) : Number.MAX_SAFE_INTEGER;
  if (aNum !== bNum) return aNum - bNum;
  return a.file.localeCompare(b.file);
}

function sortByFeatureIdOnly(a, b) {
  const aId = normalizeFeatureId(a.featureId);
  const bId = normalizeFeatureId(b.featureId);
  const aNum = aId ? Number.parseInt(aId.slice(1), 10) : Number.MAX_SAFE_INTEGER;
  const bNum = bId ? Number.parseInt(bId.slice(1), 10) : Number.MAX_SAFE_INTEGER;
  if (aNum !== bNum) return aNum - bNum;
  return String(a.featureId).localeCompare(String(b.featureId));
}

function buildRecord(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const file = path.basename(filePath);
  const frontmatter = extractFrontmatter(content).map;
  const featureId = inferFeatureId(file, frontmatter);

  const result = {
    fm_feature_ids: Boolean(frontmatter.feature_ids),
    fm_related_features: Boolean(frontmatter.related_features),
    fm_topics: Boolean(frontmatter.topics),
    fm_doc_kind: Boolean(frontmatter.doc_kind),
    fm_created: Boolean(frontmatter.created),
    status_line: hasStatusLine(content),
    section_why: hasSection(content, 'Why'),
    section_what: hasSection(content, 'What'),
    section_acceptance_criteria: hasSection(content, 'Acceptance Criteria'),
    section_dependencies: hasSection(content, 'Dependencies'),
    ac_format: hasAcFormat(content),
    dependency_tags: hasDependencyTags(content),
    section_risk: hasSection(content, 'Risk'),
  };

  const passed = CHECKS.filter((check) => result[check.key]).length;
  const scorePercent = toPercent(passed, CHECKS.length);
  const tier = classify(scorePercent);

  const missing = CHECKS.filter((check) => !result[check.key]).map((check) => check.label);

  return {
    file,
    featureId,
    frontmatterDocKind: frontmatter.doc_kind ?? null,
    scorePercent,
    passedChecks: passed,
    totalChecks: CHECKS.length,
    tier,
    missing,
  };
}

function listFeatureFiles(featuresDir) {
  return fs
    .readdirSync(featuresDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /^F\d+.*\.md$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(featuresDir, name));
}

function summarize(records) {
  const summary = {
    totalDocs: records.length,
    tierCounts: { green: 0, yellow: 0, red: 0 },
    averageScorePercent: 0,
    missingFrequency: {},
    duplicateFeatureIds: [],
  };

  let scoreSum = 0;
  const idToFiles = new Map();
  for (const record of records) {
    summary.tierCounts[record.tier] += 1;
    scoreSum += record.scorePercent;
    for (const missing of record.missing) {
      summary.missingFrequency[missing] = (summary.missingFrequency[missing] ?? 0) + 1;
    }
    if (!idToFiles.has(record.featureId)) {
      idToFiles.set(record.featureId, []);
    }
    idToFiles.get(record.featureId).push(record.file);
  }

  summary.averageScorePercent = records.length > 0 ? Math.round((scoreSum / records.length) * 100) / 100 : 0;

  for (const [featureId, files] of idToFiles.entries()) {
    if (files.length > 1) {
      summary.duplicateFeatureIds.push({ featureId, files: [...files].sort((a, b) => a.localeCompare(b)) });
    }
  }
  summary.duplicateFeatureIds.sort(sortByFeatureIdOnly);

  const sortedMissing = Object.entries(summary.missingFrequency).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  summary.missingFrequency = Object.fromEntries(sortedMissing);

  return summary;
}

function markdownTableRow(cols) {
  return `| ${cols.join(' | ')} |`;
}

function toMarkdown(report, relJsonPath) {
  const lines = [];
  lines.push('---');
  lines.push('feature_ids: [F094]');
  lines.push('related_features: [F058, F086, F088]');
  lines.push('topics: [documentation, audit, feature-docs, quality]');
  lines.push('doc_kind: note');
  lines.push(`created: ${report.generatedDate}`);
  lines.push('---');
  lines.push('');
  lines.push('# F094 Phase A 审计报告（模板合规度）');
  lines.push('');
  lines.push(`- 生成时间：${report.generatedAt}`);
  lines.push(`- 审计范围：\`${report.featuresDirRelative}/F*.md\``);
  lines.push('- 分档规则：Green >= 80%，Yellow 50%-79.99%，Red < 50%');
  lines.push(`- 机器明细：\`${relJsonPath}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(markdownTableRow(['总文档数', 'Green', 'Yellow', 'Red', '平均分']));
  lines.push(markdownTableRow(['---', '---', '---', '---', '---']));
  lines.push(
    markdownTableRow([
      String(report.summary.totalDocs),
      String(report.summary.tierCounts.green),
      String(report.summary.tierCounts.yellow),
      String(report.summary.tierCounts.red),
      `${report.summary.averageScorePercent}%`,
    ]),
  );
  lines.push('');

  lines.push('## 缺失项频次（Top）');
  lines.push('');
  lines.push(markdownTableRow(['缺失项', '文档数']));
  lines.push(markdownTableRow(['---', '---']));
  for (const [name, count] of Object.entries(report.summary.missingFrequency)) {
    lines.push(markdownTableRow([name, String(count)]));
  }
  lines.push('');

  lines.push('## 重复 Feature ID');
  lines.push('');
  if (report.summary.duplicateFeatureIds.length === 0) {
    lines.push('- 无');
  } else {
    for (const duplicate of report.summary.duplicateFeatureIds) {
      lines.push(`- ${duplicate.featureId}: ${duplicate.files.join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## 分档清单');
  lines.push('');
  for (const tier of ['green', 'yellow', 'red']) {
    const tierRecords = report.records.filter((record) => record.tier === tier);
    lines.push(`### ${tier.toUpperCase()} (${tierRecords.length})`);
    if (tierRecords.length === 0) {
      lines.push('');
      lines.push('- 无');
      lines.push('');
      continue;
    }
    lines.push('');
    lines.push(markdownTableRow(['Feature', '文件', '分数', '缺失项数']));
    lines.push(markdownTableRow(['---', '---', '---', '---']));
    for (const record of tierRecords) {
      lines.push(
        markdownTableRow([
          record.featureId,
          `\`${record.file}\``,
          `${record.scorePercent}%`,
          String(record.missing.length),
        ]),
      );
    }
    lines.push('');
  }

  lines.push('## Red 文档缺失详情');
  lines.push('');
  const redRecords = report.records.filter((record) => record.tier === 'red');
  if (redRecords.length === 0) {
    lines.push('- 无');
    lines.push('');
  } else {
    for (const record of redRecords) {
      lines.push(`### ${record.featureId} \`${record.file}\``);
      lines.push(`- 分数：${record.scorePercent}% (${record.passedChecks}/${record.totalChecks})`);
      lines.push(`- 缺失：${record.missing.join('；')}`);
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function run() {
  const options = parseArgs(process.argv.slice(2));
  const featureFiles = listFeatureFiles(options.featuresDir);
  const records = featureFiles.map(buildRecord).sort(sortByFeatureIdThenName);

  const generatedAt = new Date().toISOString();
  const generatedDate = generatedAt.slice(0, 10);

  const report = {
    generatedAt,
    generatedDate,
    featuresDir: options.featuresDir,
    featuresDirRelative: path.relative(process.cwd(), options.featuresDir),
    checks: CHECKS,
    summary: summarize(records),
    records,
  };

  ensureDir(options.outputJson);
  ensureDir(options.outputMd);
  fs.writeFileSync(options.outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const relJsonPath = path.relative(path.dirname(options.outputMd), options.outputJson);
  fs.writeFileSync(options.outputMd, toMarkdown(report, relJsonPath), 'utf8');

  console.log(
    `[audit-feature-doc-template] docs=${report.summary.totalDocs} green=${report.summary.tierCounts.green} yellow=${report.summary.tierCounts.yellow} red=${report.summary.tierCounts.red}`,
  );
  console.log(`[audit-feature-doc-template] output-json=${path.relative(process.cwd(), options.outputJson)}`);
  console.log(`[audit-feature-doc-template] output-md=${path.relative(process.cwd(), options.outputMd)}`);
}

run();
