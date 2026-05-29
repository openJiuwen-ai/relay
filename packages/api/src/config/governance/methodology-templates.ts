/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F070: Methodology skeleton templates
 *
 * Minimal templates generated in external projects on first bootstrap.
 * Only created if the target file does not already exist (no-overwrite).
 */

export interface MethodologyTemplate {
  readonly relativePath: string;
  readonly content: string;
}

const BACKLOG_TEMPLATE = `---
topics: [backlog]
doc_kind: note
created: {{DATE}}
---

# Feature Roadmap

> **Rules**: Only active Features (idea/spec/in-progress/review). Move to done after completion.
> Details in \`docs/features/Fxxx-*.md\`.

| ID | Name | Status | Owner | Link |
|----|------|--------|-------|------|
`;

const SOP_TEMPLATE = `---
topics: [sop, workflow]
doc_kind: note
created: {{DATE}}
---

# Standard Operating Procedure

## Workflow (6 steps)

| Step | What | Skill |
|------|------|-------|
| 1 | Create worktree | \`worktree\` |
| 2 | Self-check (spec compliance) | \`quality-gate\` |
| 3 | Peer review | \`request-review\` / \`receive-review\` |
| 4 | Merge gate | \`merge-gate\` |
| 5 | PR + cloud review | (merge-gate handles) |
| 6 | Merge + cleanup | (SOP steps) |

## Code Quality

- Biome: \`pnpm check\` / \`pnpm check:fix\`
- Types: \`pnpm lint\`
- File limits: 200 lines warn / 350 hard cap
`;

const FEATURE_TEMPLATE = `---
feature_ids: [Fxxx]
related_features: []
topics: []
doc_kind: spec
created: {{DATE}}
---

# Fxxx: Feature Name

> Status: spec | Owner: TBD

## Why
## What
## Acceptance Criteria
- [ ] AC-1: ...

## Dependencies
## Risk
## Open Questions
`;

export function getMethodologyTemplates(): MethodologyTemplate[] {
  const date = new Date().toISOString().slice(0, 10);
  const fill = (tpl: string) => tpl.replace(/\{\{DATE\}\}/g, date);

  return [
    { relativePath: 'BACKLOG.md', content: fill(BACKLOG_TEMPLATE) },
    { relativePath: 'docs/SOP.md', content: fill(SOP_TEMPLATE) },
    { relativePath: 'docs/features/.gitkeep', content: '' },
    { relativePath: 'docs/decisions/.gitkeep', content: '' },
    { relativePath: 'docs/discussions/.gitkeep', content: '' },
    { relativePath: 'docs/features/TEMPLATE.md', content: fill(FEATURE_TEMPLATE) },
  ];
}
