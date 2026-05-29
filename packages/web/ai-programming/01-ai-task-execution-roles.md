---
name: web-ai-task-execution-roles
description: >-
  Planner / Implementer / Reviewer split for AI-assisted work: understand the
  task, break it into steps, list target files, risks, and a test plan; implement
  only in scope with small diffs; review plan adherence, scope creep, tests, and
  ESLint. Recommended flow ends with a manual app run before commit. Use when
  planning or executing multi-step changes in packages/web, or when coordinating
  agent roles on frontend work.
---

# AI task execution: split by role

## Planner

- Understand the task
- Break it into steps
- Name the files in scope
- Surface risks
- Define a test plan

## Implementer

- Follow the plan strictly
- Touch only the agreed files
- Make small, minimal changes

## Reviewer

- Check that the implementation matches the plan
- Check for out-of-scope edits
- Check test coverage
- Check code quality (including ESLint)

## Recommended flow

**Planner → Implementer → Reviewer**

After changes, **run the app and verify manually** before you commit; only commit when you are confident nothing is wrong.
