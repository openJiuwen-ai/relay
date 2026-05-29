---
name: web-bug-investigation-reliability
description: >-
  Bug triage and reliability for packages/web: provide timestamped logs for
  hard-to-reproduce issues; for UI bugs, use screenshots with numbered callouts,
  region boxes, and design references (prefer green-zone design mocks). Clarify
  scope and granularity; combine superpowers-style workflows with systematic
  debugging. Check for regressions after fixes; always verify—do not treat
  AI-only output as sufficient (e.g. Tailwind class limits). Prefer minimal
  diffs for small bugs. Use when debugging, fixing UI or visual issues, or
  hardening reliability in packages/web.
---

# Bug investigation and reliability

## Key practices

### Logs and timelines

- **Provide logs, especially time-ordered traces.** Some bugs cannot be fully fixed in one pass; have tools or the AI **add logging**, then feed logs back to the model—this often helps with “tight loop” or runaway-behavior issues and improves fix quality.

### UI and visual issues

- Provide **screenshots + annotations + a short text description.**
- Use **1/2 (or similar) callouts**; **box** the relevant UI region.
- Attach design assets when you have them; **prefer green-zone** design mockups to stay aligned with the official spec.

### Scope and granularity

- **Narrow the problem** and distinguish **coarse vs. fine** bugs (trivial fix vs. wide impact).
- Combine the workspace **superpowers** skills with a **systematic debugging** process: narrow the repro before making broad edits.

### Side effects

- After a fix, **check for side effects**—other pages, other user paths, performance, and data.

### Verification and trust

- **You must verify after every change. AI output is not automatically correct.** Example: a shadow change where Tailwind classes did not apply or were not supported in some build paths—**humans** had to double-check and patch.

## In practice

- **Small bugs are usually cheap to fix; prefer the smallest change** (single hot spot, touch fewer files when possible).
- Cautionary tale: a “user rejected a tool, show it in red” change touched **dozens of files**; strict **scoping, named files, and post-fix verification** reduce that class of risk and rework.
