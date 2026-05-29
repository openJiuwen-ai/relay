---
name: web-component-design-and-hook-refactoring
description: >-
  Component architecture and refactoring standard for packages/web: enforce
  single responsibility, UI-only components, logic-focused hooks, and strict
  file-size limits (max 300 lines per component). Use when creating or
  refactoring React components and extracting business logic into hooks.
---

# Component design and hook refactoring standard

This document defines mandatory rules for building and refactoring components in `packages/web`.

## Goals

- Keep every UI component focused, readable, and testable.
- Enforce strict separation of concerns: **components render UI, hooks manage logic**.
- Limit component file size to control complexity and reduce regression risk.
- Make refactoring incremental, verifiable, and safe.

## Core principles

### 1) Single Responsibility Principle (SRP)

Each component must have one clear responsibility.

- A component should answer one question: "What UI does this unit render?"
- A hook should answer one question: "What behavior/state does this unit manage?"
- If a file has multiple unrelated responsibilities, split it.

### 2) UI in components, logic in hooks

Components should be mostly declarative view composition.

- Components:
  - Receive data via props or hook return values.
  - Render markup and wire event handlers.
  - Contain only minimal UI-local logic (e.g., class selection, tiny formatting).
- Hooks:
  - Manage state transitions, side effects, async flows, and domain rules.
  - Encapsulate reusable behavior and expose a stable interface.
  - Never return JSX.

### 3) File size hard limit

- **Hard limit:** every component file must be **<= 300 lines**.
- **Recommended target:** 120-220 lines for most components.
- If a component exceeds 300 lines, refactoring is required before merge.

## Mandatory constraints

### Component constraints

- A component must not directly implement:
  - Complex async orchestration.
  - Multi-branch business workflow/state machine logic.
  - API request retry/backoff/error recovery flows.
  - Cross-cutting side effects that are not purely UI concerns.
- Keep render functions shallow:
  - Avoid deeply nested JSX branches in a single file.
  - Extract repeated JSX blocks into subcomponents.
- Props must be explicit and typed. Avoid passing broad objects when a narrow contract is possible.

### Hook constraints

- Hooks must have focused scope (one domain behavior per hook).
- Hooks should expose:
  - State values.
  - Computed derived values.
  - Event handlers/actions.
  - Status flags (`loading`, `error`, `disabledReason`, etc.) when relevant.
- Hooks should avoid hidden coupling:
  - Do not read unrelated global state unless required by design.
  - Keep dependencies explicit and stable.

### Shared component placement

If a component is reused by multiple modules/features, it must be moved to the shared component directory:

- **Required location:** `packages/web/src/components/shared`
- Do not keep cross-module reusable components inside a single feature folder.
- Keep shared components generic and UI-focused; feature-specific business logic must stay in hooks or feature-level containers.

## Recommended file structure

For a non-trivial feature:

- `FeaturePanel.tsx` (container composition, <= 300 lines)
- `FeaturePanelView.tsx` (optional pure view)
- `hooks/useFeaturePanelState.ts`
- `hooks/useFeaturePanelActions.ts`
- `hooks/useFeaturePanelKeyboard.ts` (only if keyboard logic is substantial)
- `components/FeatureToolbar.tsx`
- `components/FeatureList.tsx`
- `components/FeatureEmptyState.tsx`
- `types/feature-panel.ts`
- `utils/feature-panel-*.ts` (pure helpers)

## Refactoring playbook (for oversized components)

Apply this sequence when refactoring a large component:

1. **Map responsibilities**
   - Identify state domains, side effects, event handlers, and render sections.
   - Group logic by behavior domain (input, menu, queue, network, keyboard, etc.).
2. **Extract pure helpers first**
   - Move constants, formatters, normalizers, validators to `utils`.
3. **Extract hooks by behavior domain**
   - Move state + side effects + handlers out of component.
   - Keep each hook API small and explicit.
4. **Extract UI sections**
   - Split large JSX sections into focused presentational components.
5. **Reduce orchestrator**
   - Keep the top-level component as orchestration + composition only.
6. **Verify behavior parity**
   - Run tests and manual scenarios after each extraction step.

## Hook design checklist

Before finalizing a hook, confirm:

- Name communicates behavior (`useXxxState`, `useXxxActions`, `useXxxMenu`).
- Inputs are minimal and typed.
- Output API is stable and does not leak internals.
- Side effects are isolated and cleanup is correct.
- No JSX is returned.
- The hook can be tested independently (directly or via consumer behavior).

## Component design checklist

Before finalizing a component, confirm:

- File length is <= 300 lines.
- Responsibility is singular and obvious.
- JSX is readable with limited nesting.
- No business-heavy logic is embedded in render body.
- Event handlers are either simple delegators or hook actions.
- Accessibility basics are present (semantic elements, labels, keyboard handling).

## Anti-patterns (must avoid)

- "God component": state machine + networking + rendering in one file.
- Hook that returns JSX or manipulates DOM for rendering concerns.
- Component importing many stores/services directly when a dedicated hook can isolate it.
- 10+ local `useState` values with mixed concerns in one component.
- Massive inline callbacks that contain business rules.

## Definition of done (DoD)

A component refactor is complete only when all conditions are true:

- Component file is <= 300 lines.
- Responsibilities are separated: UI in components, behavior in hooks.
- Behavior parity is validated (automated tests and/or manual checklist).
- No new lint/type errors introduced.
- Public contracts (props/hook API) are clear and documented in code.

## Enforcement in reviews

Reviewers should block changes when:

- A new or modified component exceeds 300 lines without approved exception.
- Business logic is added to view components instead of hooks.
- A refactor increases coupling or reduces testability.

Review comments should include:

- Which responsibility is misplaced.
- Where to extract (target hook/component).
- Minimal follow-up steps to reach compliance.

## Exception policy

Exceptions are rare and temporary.

- An exception must include:
  - Why the limit cannot be met now.
  - A concrete follow-up refactor task.
  - A deadline or milestone.
- Exception does not remove SRP or separation-of-concerns requirements.

## Quick reference

- **Component max length:** 300 lines (hard limit)
- **Component role:** UI rendering and composition
- **Hook role:** state, side effects, business logic, event orchestration
- **Design rule:** one responsibility per file
- **Shared component path:** `packages/web/src/components/shared` for cross-module reuse

