/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type InspirationTagTone =
  | 'html'
  | 'featured'
  | 'document'
  | 'spreadsheet'
  | 'markdown'
  | 'skill'
  | 'agent';

interface InspirationTagProps {
  label: string;
  tone?: InspirationTagTone;
  iconSrc?: string;
  testId?: string;
}

const TONE_CLASSES: Record<InspirationTagTone, string> = {
  html: 'bg-[#0BB8B2]/[0.1] text-[#0BB8B2]',
  featured: 'bg-[#832FD5]/[0.1] text-[#832FD5]',
  document: 'bg-[#3B8CFA]/[0.1] text-[#3B8CFA]',
  spreadsheet: 'bg-[#06BB73]/[0.1] text-[#06BB73]',
  markdown: 'bg-[#7479F4]/[0.1] text-[#7479F4]',
  skill: 'bg-[#1476FF]/[0.1] text-[#1476FF]',
  agent: 'bg-[var(--accent-secondary)]/[0.1] text-[var(--accent-secondary)]',
};

export function InspirationTag({ label, tone = 'featured', iconSrc, testId }: InspirationTagProps) {
  return (
    <span
      className={[
        'inline-flex max-w-[120px] items-center rounded-[2px] px-1 text-xs font-medium',
        TONE_CLASSES[tone],
      ].join(' ')}
      title={label}
      data-testid={testId ?? `inspiration-tag-${tone}`}
    >
      {iconSrc ? (
        <img
          src={iconSrc}
          alt=""
          className="mr-1 h-3 w-3 shrink-0"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
