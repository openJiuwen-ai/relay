---
name: web-task-prompt-template
description: >-
  Structured task prompt templates for AI-assisted development in packages/web:
  covers new features, bug fixes, small changes, UI issues, and cross-package workflows.
  Use when writing task descriptions for AI agents, creating PR task sections,
  or standardizing handoff documents for frontend work.
---

# Task prompt templates

This guide provides structured templates for describing tasks to AI agents when working on `packages/web`. Clear task prompts improve AI execution accuracy and reduce iteration cycles.

## How to use this document

1. Choose the template that matches your task type.
2. Fill in the bracketed sections with your specific context.
3. Attach relevant files/screenshots when needed.
4. Verify the AI output manually before committing.

## Template 1: New feature development

Use this when requesting a new feature implementation.

```markdown
## Goal
A one-sentence summary of the task objective

## Feature Details
- User scenario: [Who uses this feature and in what context]
- Expected behavior: [Step-by-step user interaction]
- Edge cases: [Exceptions or unusual scenarios]

## Involved Files
- Added:
  - `src/components/<Feature>/<FeaturePanel>.tsx` — container component
  - `src/components/<Feature>/<FeaturePanelView>.tsx` — view component
- Modified:
  - `src/pages/<Page>.tsx` — [detailed description of changes]
  - `src/stores/<Store>.ts` — [detailed description of changes]
- Deleted:
  - `src/components/<OldComponent>.tsx` — deprecated component

## Technical Requirements
- Follow 300-line component limit
- UI in components, logic in hooks
- Reusable cross-module components in `src/components/shared`
- Explicit type definitions for props

## Verification / Test Cases

### 1. Type Checking
- Expected result: No errors, TypeScript types correct

### 2. Local Start
- Expected result: Page loads successfully without errors

### 3. Functional Test Cases
| Test Case ID | Scenario | Steps | Expected Result | Actual Result | Status |
|-------------|----------|-------|----------------|---------------|--------|
| TC001 | User clicks button to trigger feature | 1. Open page<br>2. Click button | Modal appears with correct content | [Fill in] | ✅/❌ |
| TC002 | Invalid input submission | 1. Enter empty value<br>2. Click submit | Form shows error message | [Fill in] | ✅/❌ |
| TC003 | Responsive layout | Resize browser window | Layout adapts without misalignment | [Fill in] | ✅/❌ |

### 4. Regression Verification
- Check other pages/components for side effects
- Run automated regression tests if available

## Risk Notes
- Functional risk: [Possible impact on business logic]
- UI risk: [Potential layout or theme issues]
- Performance risk: [Possible performance degradation]

## Reference Materials
- Design mockups: [file path or screenshots]
- Reference documentation: [link]
```

## Template 2: Bug fix

Use this when reporting a bug for AI to fix.

```markdown
## Issue Description
[Brief description of the bug]

## Error Messages
[Paste error logs, console output, or screenshots]

## Reproduction Steps
1. [Trigger condition]
2. [Steps to reproduce]
3. Expected: [What should happen]
4. Actual: [What actually happens]

## Impact Scope
- Affected pages: [Pages impacted]
- Affected users: [User flows blocked]

## Clues / Analysis
- Error location: `src/components/<Component>.tsx:line` or `src/hooks/<Hook>.ts:line`
- Possible cause: [Preliminary analysis]

## Fix Constraints
- Minimize changes: prioritize single-point fixes
- Maintain backward compatibility
- Add or update test cases if needed

## Verification / Test Cases
| Test Case ID | Scenario | Steps | Expected Result | Actual Result | Status |
|-------------|----------|-------|----------------|---------------|--------|
| TC001 | Reproduce bug | [Steps] | Error no longer occurs | [Fill in] | ✅/❌ |
| TC002 | Edge case | [Steps] | Feature works correctly | [Fill in] | ✅/❌ |
| TC003 | Regression check | [Other related pages/actions] | Pages behave normally | [Fill in] | ✅/❌ |
```

## Template 3: Quick iteration / small change

Use this for trivial fixes or minor adjustments.

```markdown
## Change Description
One-sentence summary of the change

## Target File
`src/components/<Component>.tsx:line` — [Specific lines modified]

## Reason for Change
[Why this change is needed]

## Verification / Test Cases
| Test Case ID | Scenario | Steps | Expected Result | Actual Result | Status |
|-------------|----------|-------|----------------|---------------|--------|
| TC001 | Verify minor change | [Steps] | Feature behaves as expected | [Fill in] | ✅/❌ |
```

## Template 4: UI/Visual issue

Use this for layout, style, or visual bugs.

```markdown
## Visual Issue
[Brief description]

## Screenshot Annotations
[Attach screenshot, mark problem points with numbers]

## Design Reference
- Mockup: [file path or screenshot]
- Expected appearance: [Describe correct style]

## Current Implementation
- File: `src/components/<Component>.tsx`
- Classes / CSS files: [Tailwind / CSS reference]

## Fix Direction
[Adjustment direction: padding / class / responsive / etc.]

## Verification / Test Cases
| Test Case ID | Scenario | Steps | Expected Result | Actual Result | Status |
|-------------|----------|-------|----------------|---------------|--------|
| TC001 | Style fix | Open page | Style matches design mockup | [Fill in] | ✅/❌ |
| TC002 | Responsive check | Resize browser | Layout adapts without issues | [Fill in] | ✅/❌ |
| TC003 | Theme switch | Toggle light/dark mode | Styles remain correct | [Fill in] | ✅/❌ |
```

## Template 5: Cross-package change

Use this when changes span multiple packages (api + web).

```markdown
## Involved Modules
- `packages/api`
  - `src/routes/<route>.ts` — [Change description]
  - `src/domains/<domain>.ts` — [Change description]
- `packages/web`
  - `src/components/<Component>.tsx` — [Change description]
  - `src/hooks/<Hook>.ts` — [Change description]
- `packages/shared`
  - `src/types/<type>.ts` — [Change description]

## API Changes (if any)
- Add/modify endpoint: `POST /api/<endpoint>`
- Request parameters: [Description]
- Response structure: [Description]

## Change Order / Dependencies
1. shared types
2. api routes
3. web components

## Verification / Test Cases
| Test Case ID | Scenario | Steps | Expected Result | Actual Result | Status |
|-------------|----------|-------|----------------|---------------|--------|
| TC001 | API change validation | Call endpoint | Returns expected data | [Fill in] | ✅/❌ |
| TC002 | Frontend integration | Open page to trigger feature | Feature displays correctly | [Fill in] | ✅/❌ |
| TC003 | Regression check | Verify other pages/components | No issues | [Fill in] | ✅/❌ |
```

## Checklist for task prompts

Before submitting a task to AI, confirm:

- [ ] Goal is single clear sentence
- [ ] Target files are named explicitly
- [ ] Constraints are listed (line limits, patterns to follow)
- [ ] Verification steps include specific commands
- [ ] Reference files are attached for pattern learning
- [ ] Risks or side effects are noted

## Anti-patterns (avoid)

- Vague goal: "Optimize this component" — does not specify what to optimize  
- No file list: "Just change something" — AI cannot locate the target precisely  
- No verification: Only says "test it" — lacks detailed test steps  
- Over-scoping: A task contains multiple unrelated changes  
- Missing context: No reference files or screenshots provided

## Quick reference

| Task type | Template # | Key sections |
|-----------|------------|--------------|
| New feature | 1 | Goal, files, requirements, verification |
| Bug fix | 2 | Phenomenon, repro, clues, constraints |
| Small change | 3 | Content, file, reason, verify |
| Visual issue | 4 | Screenshot, design ref, fix direction |
| Cross-package | 5 | Modules, API changes, order, verify |

> **Component refactoring template** please refer to [04-component-and-hook-executable-templates.md](04-component-and-hook-executable-templates.md)