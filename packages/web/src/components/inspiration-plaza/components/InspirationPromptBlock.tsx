/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

interface InspirationPromptBlockProps {
  prompt: string;
}

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

function renderPromptWithPlaceholders(prompt: string) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g');

  while ((match = regex.exec(prompt)) !== null) {
    if (match.index > lastIndex) {
      parts.push(prompt.slice(lastIndex, match.index));
    }
    parts.push(
      <span
        key={match.index}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--placeholder-unfilled-bg,#fff3e0)] text-[var(--placeholder-unfilled-text,#e65100)] font-mono text-sm"
      >
        {match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < prompt.length) {
    parts.push(prompt.slice(lastIndex));
  }

  return parts;
}

export function InspirationPromptBlock({ prompt }: InspirationPromptBlockProps) {
  return (
    <div className="bg-[var(--surface-muted)] rounded-lg p-4">
      <pre className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words font-mono">
        {renderPromptWithPlaceholders(prompt)}
      </pre>
    </div>
  );
}
