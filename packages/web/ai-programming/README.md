---
name: web-ai-programming-index
description: >-
  Central index for AI/collaborative coding guidelines under packages/web.
  Lists numbered guideline files with links. Use when modifying packages/web,
  when AGENTS.md points here, or when choosing which web guideline file to load
  next (progressive disclosure: read this first, then open only the relevant
  numbered document).
---

# @openjiuwen/relay-web — AI programming guidelines

This directory contains AI and collaborative-coding conventions for `packages/web`; follow them when changing this package. Each guideline is a **standalone file** for easier edits and review.

## Metadata and progressive disclosure

- The top of every Markdown file is **YAML frontmatter** (same shape as Agent Skills): `name` (id) and `description` (capability + when to apply, so the agent can match before loading the body).
- **Layer 1:** Use `name` + `description` only to see if a file applies to the current task.
- **Layer 2:** If it does, read the Markdown **below** the closing `---`.

## Guideline index

| # | File | Summary |
|---|------|---------|
| 1 | [01-ai-task-execution-roles.md](01-ai-task-execution-roles.md) | Task execution by role: Planner, Implementer, Reviewer |
| 2 | [02-bug-investigation-reliability.md](02-bug-investigation-reliability.md) | Bug investigation and reliability |
| 3 | [03-component-design-and-hook-refactoring.md](03-component-design-and-hook-refactoring.md) | Component/hook architecture standards with <=300-line component limit |
| 4 | [04-component-and-hook-executable-templates.md](04-component-and-hook-executable-templates.md) | Copy-ready templates for components, hooks, and oversized-component refactors |
| 5 | [05-task-prompt-template.md](05-task-prompt-template.md) | Structured task prompt templates for features, bugs, small changes, UI issues, and cross-package work |
