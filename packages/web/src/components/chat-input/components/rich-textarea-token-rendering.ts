/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { getMentionToAgentId } from '@/lib/mention-highlight';

export interface RichSkillOption {
  name: string;
  iconUrl?: string | null;
}

export interface RichQuickActionOption {
  label: string;
  icon?: string;
  token?: string;
}

export type RichTextareaSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string }
  | { type: 'skill'; text: string; token: string; iconUrl?: string | null }
  | { type: 'quick_action'; text: string; icon?: string; token: string };

type BuildSegmentsOptions = {
  allowTerminalMention?: boolean;
};

const MENTION_RIGHT_WHITESPACE_RE = /\s/;
const SKILL_TOKEN_PREFIX = '[[skill:';
const SKILL_TOKEN_SUFFIX = ']]';
const QUICK_ACTION_TOKEN_PREFIX = '[[quick_action:';
const QUICK_ACTION_TOKEN_SUFFIX = ']]';

function createSkillToken(name: string, token: string, iconUrl?: string | null): RichTextareaSegment {
  return { type: 'skill', text: name, token, iconUrl };
}

function createQuickActionToken(label: string, token: string, icon?: string): RichTextareaSegment {
  return { type: 'quick_action', text: label, icon, token };
}

export function buildRichTextareaSegments(
  value: string,
  skillOptions: RichSkillOption[],
  quickActionOptions: RichQuickActionOption[],
  options: BuildSegmentsOptions = {},
): RichTextareaSegment[] {
  if (!value) return [{ type: 'text', text: '' }];

  const allowTerminalMention = options.allowTerminalMention ?? false;
  const skillOptionByName = new Map(skillOptions.map((item) => [item.name.trim(), item] as const));
  const quickActionIconByLabel = new Map(quickActionOptions.map((item) => [item.label, item.icon]));
  const mentionToAgentId = getMentionToAgentId();
  const mentionAliases = Object.keys(mentionToAgentId).sort((a, b) => b.length - a.length);
  const segments: RichTextareaSegment[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    if (value.startsWith(SKILL_TOKEN_PREFIX, cursor)) {
      const end = value.indexOf(SKILL_TOKEN_SUFFIX, cursor + SKILL_TOKEN_PREFIX.length);
      if (end > cursor) {
        const token = value.slice(cursor, end + SKILL_TOKEN_SUFFIX.length);
        const name = value.slice(cursor + SKILL_TOKEN_PREFIX.length, end).trim();
        if (name) {
          const skill = skillOptionByName.get(name);
          segments.push(createSkillToken(name, token, skill?.iconUrl));
          cursor = end + SKILL_TOKEN_SUFFIX.length;
          continue;
        }
      }
    }

    if (value.startsWith(QUICK_ACTION_TOKEN_PREFIX, cursor)) {
      const end = value.indexOf(QUICK_ACTION_TOKEN_SUFFIX, cursor + QUICK_ACTION_TOKEN_PREFIX.length);
      if (end > cursor) {
        const token = value.slice(cursor, end + QUICK_ACTION_TOKEN_SUFFIX.length);
        const label = value.slice(cursor + QUICK_ACTION_TOKEN_PREFIX.length, end);
        segments.push(createQuickActionToken(label, token, quickActionIconByLabel.get(label)));
        cursor = end + QUICK_ACTION_TOKEN_SUFFIX.length;
        continue;
      }
    }

    const prev = cursor > 0 ? value[cursor - 1] : ' ';
    if (value[cursor] === '@' && /\s/.test(prev)) {
      let matched: { text: string; len: number } | null = null;
      for (const alias of mentionAliases) {
        if (!alias) continue;
        const token = `@${alias}`;
        const raw = value.slice(cursor, cursor + token.length);
        if (raw.toLowerCase() !== token.toLowerCase()) continue;
        const next = value[cursor + token.length];
        if (!next) {
          if (!allowTerminalMention) continue;
        } else if (!MENTION_RIGHT_WHITESPACE_RE.test(next)) {
          continue;
        }
        matched = { text: raw, len: token.length };
        break;
      }
      if (matched) {
        segments.push({ type: 'mention', text: matched.text });
        cursor += matched.len;
        continue;
      }
    }

    segments.push({ type: 'text', text: value[cursor] ?? '' });
    cursor += 1;
  }

  return segments;
}

export function serializeRichTextareaNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\u00A0/g, ' ');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  if (el.dataset.tokenType === 'skill' || el.dataset.tokenType === 'quick-action') return el.dataset.tokenValue ?? '';
  let out = '';
  for (const child of Array.from(el.childNodes)) out += serializeRichTextareaNode(child);
  return out;
}

export function serializeRichTextareaNodeSignature(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return `t:${(node.textContent ?? '').replace(/\u00A0/g, ' ')}`;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  if (el.dataset.tokenType === 'skill') return `s:${el.dataset.tokenValue ?? ''}`;
  if (el.dataset.tokenType === 'quick-action') return `q:${el.dataset.tokenValue ?? ''}`;
  if (el.dataset.tokenType === 'mention') return `m:${el.textContent ?? ''}`;
  let out = '';
  for (const child of Array.from(el.childNodes)) out += serializeRichTextareaNodeSignature(child);
  return out;
}

export function appendRichTextareaSegment(frag: DocumentFragment, segment: RichTextareaSegment): void {
  if (segment.type === 'text') {
    frag.appendChild(document.createTextNode(segment.text));
    return;
  }

  if (segment.type === 'mention') {
    const span = document.createElement('span');
    span.setAttribute('data-token-type', 'mention');
    span.className = 'text-[var(--text-accent)]';
    span.textContent = segment.text;
    frag.appendChild(span);
    return;
  }

  if (segment.type === 'quick_action') {
    const token = document.createElement('span');
    token.setAttribute('data-token-type', 'quick-action');
    token.setAttribute('data-token-value', segment.token);
    token.setAttribute('contenteditable', 'false');
    token.className =
      'group/quick-action inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border text-[14px] font-normal leading-[22px] text-[var(--text-primary)] align-middle';
    token.style.padding = '2px 8px';
    token.style.marginBottom = '2px';
    token.style.borderColor = 'var(--border-accent)';
    token.style.backgroundColor = 'var(--accent-soft)';
    token.style.cursor = 'pointer';

    if (segment.icon) {
      const icon = createMaskIconElement(segment.icon,'h-4 w-4 text-[var(--mask-icon)] group-hover/quick-action:hidden');
      token.appendChild(icon);
    } else {
      const fallback = document.createElement('span');
      fallback.setAttribute('aria-hidden', 'true');
      fallback.className = 'h-2 w-2 rounded-full bg-[var(--text-accent)] group-hover/quick-action:hidden';
      token.appendChild(fallback);
    }

    const remove = document.createElement('span');
    remove.setAttribute('data-remove-quick-action', '1');
    remove.setAttribute('aria-hidden', 'true');
    remove.className =
      'hidden h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] group-hover/quick-action:inline-flex hover:text-[var(--text-accent)]';
    remove.style.fontSize = '18px';
    remove.style.lineHeight = '18px';
    remove.style.marginBottom = '2px';
    remove.textContent = '×';
    token.appendChild(remove);

    const label = document.createElement('span');
    label.textContent = segment.text;
    token.appendChild(label);
    frag.appendChild(token);
    return;
  }

  const token = document.createElement('span');
  token.setAttribute('data-token-type', 'skill');
  token.setAttribute('data-token-value', segment.token);
  token.setAttribute('contenteditable', 'false');
  token.className =
    'inline-flex max-w-full translate-y-[-1px] items-center gap-1 text-[var(--text-accent)] text-[16px] leading-5 align-middle';

  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.className = 'inline-block h-4 w-4 shrink-0';
  icon.style.backgroundColor = 'currentColor';
  icon.style.maskImage = "url('/icons/menu/skills.svg')";
  icon.style.maskRepeat = 'no-repeat';
  icon.style.maskPosition = 'center';
  icon.style.maskSize = 'contain';
  icon.style.webkitMaskImage = "url('/icons/menu/skills.svg')";
  icon.style.webkitMaskRepeat = 'no-repeat';
  icon.style.webkitMaskPosition = 'center';
  icon.style.webkitMaskSize = 'contain';
  token.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'truncate';
  label.textContent = segment.text;
  token.appendChild(label);
  frag.appendChild(token);
}

function createMaskIconElement(src: string, className: string): HTMLElement {
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.className = ['shrink-0 bg-current', className].filter(Boolean).join(' ');
  icon.style.setProperty('-webkit-mask', `url("${src}") center / contain no-repeat`);
  icon.style.setProperty('mask', `url("${src}") center / contain no-repeat`);
  return icon;
}

export function renderRichTextareaSegments(root: HTMLElement, segments: RichTextareaSegment[]): void {
  const frag = document.createDocumentFragment();
  for (const segment of segments) {
    appendRichTextareaSegment(frag, segment);
  }
  root.replaceChildren(frag);
}
