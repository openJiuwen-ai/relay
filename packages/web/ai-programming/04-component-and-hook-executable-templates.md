---
name: web-component-and-hook-executable-templates
description: >-
  Executable templates for packages/web component development and refactoring:
  ready-to-copy skeletons for presentational components, container components,
  custom hooks, file layout, and migration checklists under the <=300-line
  component rule.
---

# Component and hook executable templates

This guide provides copy-ready templates for implementing the architecture rules in `03-component-design-and-hook-refactoring.md`.

## How to use this document

- Start from the file layout template.
- Choose a component template (presentational or container).
- Add hooks using the hook templates.
- Validate with the checklists at the end.

## Standard file layout template

Use this structure for medium/large features:

```text
src/components/<feature>/
  <FeaturePanel>.tsx                    # container (<=300 lines)
  <FeaturePanelView>.tsx                # presentational UI
  components/
    <FeatureToolbar>.tsx
    <FeatureList>.tsx
    <FeatureEmptyState>.tsx
  hooks/
    use<Feature>State.ts
    use<Feature>Actions.ts
    use<Feature>Keyboard.ts             # optional
    use<Feature>Effects.ts              # optional
  types.ts
  constants.ts
  utils.ts
```

If a component is reused by multiple modules, place it in:

```text
src/components/shared/
  <ReusableComponent>.tsx
```

## Template A: Presentational component (UI-only)

Use this for pure rendering with minimal view logic.

```tsx
import React from 'react';

export interface FeaturePanelViewProps {
  title: string;
  items: Array<{ id: string; label: string }>;
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}

export function FeaturePanelView({
  title,
  items,
  loading,
  selectedId,
  onSelect,
  onRefresh,
}: FeaturePanelViewProps) {
  return (
    <section aria-label={title}>
      <header className="flex items-center justify-between">
        <h2>{title}</h2>
        <button type="button" onClick={onRefresh} disabled={loading}>
          Refresh
        </button>
      </header>

      {loading ? (
        <p>Loading...</p>
      ) : items.length === 0 ? (
        <p>No data</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={selectedId === item.id}
                onClick={() => onSelect(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

## Template B: Container/orchestrator component

Use this as the only component that wires hooks to view components.

```tsx
import React from 'react';
import { FeaturePanelView } from './FeaturePanelView';
import { useFeatureState } from './hooks/useFeatureState';
import { useFeatureActions } from './hooks/useFeatureActions';

export interface FeaturePanelProps {
  projectId: string;
}

export function FeaturePanel({ projectId }: FeaturePanelProps) {
  const state = useFeatureState({ projectId });
  const actions = useFeatureActions({ projectId, selectedId: state.selectedId });

  return (
    <FeaturePanelView
      title="Feature Panel"
      items={state.items}
      loading={state.loading}
      selectedId={state.selectedId}
      onSelect={state.setSelectedId}
      onRefresh={actions.refresh}
    />
  );
}
```

## Template C: State hook

Use this hook for local state, derived state, and data loading lifecycle.

```ts
import { useEffect, useMemo, useState } from 'react';

interface UseFeatureStateParams {
  projectId: string;
}

interface FeatureItem {
  id: string;
  label: string;
}

export interface UseFeatureStateResult {
  items: FeatureItem[];
  loading: boolean;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  selectedItem: FeatureItem | null;
}

export function useFeatureState({ projectId }: UseFeatureStateParams): UseFeatureStateResult {
  const [items, setItems] = useState<FeatureItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    void Promise.resolve([
      { id: `${projectId}-1`, label: 'Item 1' },
      { id: `${projectId}-2`, label: 'Item 2' },
    ])
      .then((data) => {
        if (!active) return;
        setItems(data);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  return {
    items,
    loading,
    selectedId,
    setSelectedId,
    selectedItem,
  };
}
```

## Template D: Actions hook

Use this hook for event handlers and business actions.

```ts
import { useCallback } from 'react';

interface UseFeatureActionsParams {
  projectId: string;
  selectedId: string | null;
}

export interface UseFeatureActionsResult {
  refresh: () => void;
  removeSelected: () => Promise<void>;
}

export function useFeatureActions({
  projectId,
  selectedId,
}: UseFeatureActionsParams): UseFeatureActionsResult {
  const refresh = useCallback(() => {
    // Trigger data revalidation or dispatch refresh event.
    window.dispatchEvent(new CustomEvent('feature:refresh', { detail: { projectId } }));
  }, [projectId]);

  const removeSelected = useCallback(async () => {
    if (!selectedId) return;
    // Replace with real API call.
    await Promise.resolve();
  }, [selectedId]);

  return {
    refresh,
    removeSelected,
  };
}
```

## Template E: Keyboard hook (optional)

Use this when keyboard logic becomes non-trivial.

```ts
import { useCallback } from 'react';

interface UseFeatureKeyboardParams {
  isMenuOpen: boolean;
  optionCount: number;
  selectedIdx: number;
  setSelectedIdx: (updater: (prev: number) => number) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function useFeatureKeyboard({
  isMenuOpen,
  optionCount,
  selectedIdx,
  setSelectedIdx,
  onConfirm,
  onClose,
}: UseFeatureKeyboardParams) {
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isMenuOpen) return;
      if (optionCount === 0) {
        if (e.key === 'Escape') onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((prev) => (prev + 1) % optionCount);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((prev) => (prev - 1 + optionCount) % optionCount);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [isMenuOpen, onClose, onConfirm, optionCount, selectedIdx, setSelectedIdx],
  );

  return { onKeyDown };
}
```

## Refactoring template for oversized component (>300 lines)

Use this checklist in PR description:

```md
## Refactor plan
- [ ] Step 1: Move constants and pure helpers to `constants.ts` / `utils.ts`
- [ ] Step 2: Extract state hook (`useXxxState`)
- [ ] Step 3: Extract actions hook (`useXxxActions`)
- [ ] Step 4: Extract keyboard/effects hooks (if needed)
- [ ] Step 5: Split large JSX into presentational subcomponents
- [ ] Step 6: Keep container as orchestrator only

## Constraints
- [ ] Every component file <= 300 lines
- [ ] Components render UI only
- [ ] Hooks own logic and side effects
- [ ] Cross-module reusable components are placed in `src/components/shared`
- [ ] No behavior regression in key user paths

## Verification
- [ ] Type check passes
- [ ] Lint passes
- [ ] Existing tests pass
- [ ] Manual sanity scenarios completed
```

## PR review template

Use this for reviewer comments:

```md
### Component architecture review
- Responsibility clarity: Pass / Needs work
- UI/logic separation: Pass / Needs work
- File length rule (<=300): Pass / Needs work
- Hook API quality: Pass / Needs work
- Regression risk: Low / Medium / High

### Required fixes
1.
2.
3.
```

## Line budget recommendation

Use explicit budgets for predictability:

- Container component: 150-260 lines
- Presentational component: 80-220 lines
- Hook files: 80-220 lines each
- Utility files: no strict limit, but keep cohesive and focused

If one file grows too fast, split by behavior domain immediately.

