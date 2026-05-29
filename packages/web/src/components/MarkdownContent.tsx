/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { Children, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { QUICK_ACTIONS } from '@/config/quick-actions';
import { getFileTypeIcon } from '@/hooks/usePromptBlocks';
import { getMentionColor, getMentionLabel, getMentionRe, getMentionToAgentId } from '@/lib/mention-highlight';
import { readPublicEnv } from '@/utils/client-env';
import { fetchSkillOptionsWithCache, getCachedSkillOptions } from '@/utils/skill-options-cache';
import { stripPptxPagesArtifactCommentsFromMarkdown } from './ppt-studio/pptx-pages-artifact';

const PROJECT_ROOT = readPublicEnv('NEXT_PUBLIC_PROJECT_ROOT') ?? '';
const INSPIRATION_UPLOAD_PATH_PREFIX = '/files/inspiration-upload/';

function renderSkillToken(skillName: string, key: string): ReactNode {
  return (
    <span
      key={key}
      className="inline-flex max-w-full translate-y-[-1px] items-center gap-1 rounded px-1 py-[1px] align-middle text-[rgba(20,118,255,1)]"
      data-skill-token="true"
    >
      <span
        aria-hidden="true"
        className="inline-block h-3.5 w-3.5 shrink-0"
        style={{
          backgroundColor: 'currentColor',
          maskImage: "url('/icons/menu/skills.svg')",
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskImage: "url('/icons/menu/skills.svg')",
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          WebkitMaskSize: 'contain',
        }}
      />
      <span className="truncate">{skillName}</span>
    </span>
  );
}

const VISIBLE_QUICK_ACTIONS = QUICK_ACTIONS.filter((action) => action.show !== false);
const QUICK_ACTIONS_SORTED = [...VISIBLE_QUICK_ACTIONS].sort((a, b) => b.label.length - a.label.length);

function renderQuickActionToken(label: string, key: string): ReactNode {
  const action = VISIBLE_QUICK_ACTIONS.find((item) => item.label === label);
  return (
    <span
      key={key}
      className="inline-flex max-w-full items-center gap-1 rounded-full border px-[8px] py-[3px] align-middle text-[14px] font-normal leading-[22px] text-[#191919]"
      style={{ borderColor: 'rgba(20,118,255,0.8)', backgroundColor: '#eff6ff' }}
      data-quick-action-token="true"
    >
      {action?.icon ? <img src={action.icon} alt="" aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </span>
  );
}

const SKILL_PHRASE_RE = /(使用\s+)([^\n，。！？,.!?]{1,60}?)(\s+技能)/g;

function appendTextWithSkillPhrase(parts: ReactNode[], text: string, keyPrefix: string): void {
  if (!text) return;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  SKILL_PHRASE_RE.lastIndex = 0;
  while ((m = SKILL_PHRASE_RE.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    const full = m[0];
    const skillName = (m[2] ?? '').trim();
    if (!skillName) {
      parts.push(full);
    } else {
      parts.push(renderSkillToken(skillName, `${keyPrefix}-phrase-${m.index}`));
    }
    lastIdx = m.index + full.length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
}

function appendTextWithSkills(
  parts: ReactNode[],
  text: string,
  keyPrefix: string,
  skillNames: string[],
  enableSkillAndQuickActionTokens: boolean,
): void {
  if (!text) return;
  if (!enableSkillAndQuickActionTokens) {
    parts.push(text);
    return;
  }

  const normalizedSkillNames = new Set(skillNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  let cursor = 0;
  let plainStart = 0;

  while (cursor < text.length) {
    const phraseSlice = text.slice(cursor);
    const phraseMatch = /^(使用\s+)([^\n，。！？,.!?]{1,60}?)(\s+技能)/.exec(phraseSlice);
    if (phraseMatch) {
      const full = phraseMatch[0] ?? '';
      const skillName = (phraseMatch[2] ?? '').trim();
      if (skillName && normalizedSkillNames.has(skillName.toLowerCase())) {
        if (cursor > plainStart) parts.push(text.slice(plainStart, cursor));
        parts.push(renderSkillToken(skillName, `${keyPrefix}-phrase-${cursor}`));
        cursor += full.length;
        plainStart = cursor;
        continue;
      }
    }

    let matchedQuickAction: string | null = null;
    for (const action of QUICK_ACTIONS_SORTED) {
      const label = action.label;
      if (!label) continue;
      if (!text.startsWith(label, cursor)) continue;
      const prev = cursor > 0 ? text[cursor - 1] : ' ';
      const next = cursor + label.length < text.length ? text[cursor + label.length] : ' ';
      if (/\s/.test(prev) && /\s/.test(next)) {
        matchedQuickAction = label;
        break;
      }
    }
    if (matchedQuickAction) {
      if (cursor > plainStart) parts.push(text.slice(plainStart, cursor));
      parts.push(renderQuickActionToken(matchedQuickAction, `${keyPrefix}-qa${cursor}`));
      cursor += matchedQuickAction.length;
      plainStart = cursor;
      continue;
    }

    cursor += 1;
  }

  if (plainStart < text.length) parts.push(text.slice(plainStart));
}

function highlightMentionsAndSkills(
  text: string,
  skillNames: string[],
  enableSkillAndQuickActionTokens: boolean,
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  const re = getMentionRe();
  const toAgent = getMentionToAgentId();
  const colorMap = getMentionColor();
  const labelMap = getMentionLabel();

  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      appendTextWithSkills(parts, text.slice(lastIdx, m.index), `p${m.index}`, skillNames, enableSkillAndQuickActionTokens);
    }
    const agentId = toAgent[m[1].toLowerCase()] ?? 'opus';
    void colorMap[agentId];
    const label = labelMap[m[1].toLowerCase()] ?? m[0];
    parts.push(
      <span
        key={`m${m.index}`}
        className="user-question-mention"
        style={{
          color: 'rgb(20, 118, 255)',
          borderRadius: 4,
          padding: '1px 5px',
        }}
      >
        {label}
      </span>,
    );
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) {
    appendTextWithSkills(parts, text.slice(lastIdx), `tail${lastIdx}`, skillNames, enableSkillAndQuickActionTokens);
  }
  return parts;
}

function withMentions(
  children: ReactNode,
  skillNames: string[],
  enableSkillAndQuickActionTokens: boolean,
): ReactNode {
  return Children.map(children, (child) =>
    typeof child === 'string' ? highlightMentionsAndSkills(child, skillNames, enableSkillAndQuickActionTokens) : child,
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = useCallback(() => {
    const text = preRef.current?.textContent ?? '';
    void navigator.clipboard.writeText(text);
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, []);

  return (
    <div className="relative group my-2">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded text-[10px] bg-gray-700 text-gray-300 md:opacity-0 md:group-hover:opacity-100 hover:bg-gray-600 transition-opacity"
      >
        {copied ? '已复制' : '复制'}
      </button>
      <pre
        ref={preRef}
        className="bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto text-xs leading-5 font-mono [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit [&>code]:text-xs"
      >
        {children}
      </pre>
    </div>
  );
}

const FILE_PATH_RE = /(?:^|\s)`?((?:\/[\w.@-]+)+(?:\.[\w]+)(?::(\d+))?)(?:`?)/g;
const REL_PATH_RE = /(?:^|\s)`?((?:packages|src|docs|tests?)\/[\w./@-]+(?:\.[\w]+)(?::(\d+))?)(?:`?)/g;
const INSPIRATION_UPLOAD_PATH_RE = /`?(\/files\/inspiration-upload\/[\w.@-]+(?:\.[\w]+))`?/g;
const WT_TAG_RE = /^\s*\[wt:([a-zA-Z0-9_/-]+)\]/;

function getInspirationUploadFileName(path: string): string | null {
  if (!path.startsWith(INSPIRATION_UPLOAD_PATH_PREFIX)) return null;
  const storedFileName = path.slice(INSPIRATION_UPLOAD_PATH_PREFIX.length);
  if (!storedFileName || storedFileName.includes('/')) return null;
  return storedFileName.replace(/^\d+_/, '') || storedFileName;
}

function renderInspirationFileToken(fileName: string, key: string): ReactNode {
  return (
    <span
      key={key}
      className="inline-flex translate-y-[-1px] items-center gap-[2px] align-middle leading-none whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
      style={{
        color: 'rgba(20, 118, 255, 1)',
      }}
      data-inspiration-file-token="true"
      title={fileName}
    >
      <span aria-hidden="true" className="inline-flex items-center justify-center w-[1em] h-[1em] flex-shrink-0">
        <img src={getFileTypeIcon(fileName)} alt="" className="w-[1em] h-[1em]" />
      </span>
      <span className="inline-block" style={{ wordBreak: 'break-word' }}>
        {fileName}
      </span>
    </span>
  );
}

function linkifyFilePaths(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  const combined = new RegExp(`${INSPIRATION_UPLOAD_PATH_RE.source}|${FILE_PATH_RE.source}|${REL_PATH_RE.source}`, 'g');
  let m: RegExpExecArray | null;

  combined.lastIndex = 0;
  while ((m = combined.exec(text)) !== null) {
    const fullMatch = m[0];
    const leading = fullMatch.match(/^\s/)?.[0] ?? '';
    const path = m[1] ?? m[2] ?? m[4];
    const line = m[3] ?? m[5];
    if (!path) continue;

    const start = m.index + leading.length;
    if (start > lastIdx) parts.push(text.slice(lastIdx, start));

    const inspirationFileName = getInspirationUploadFileName(path);
    if (inspirationFileName) {
      parts.push(renderInspirationFileToken(inspirationFileName, `ifp${m.index}`));
      lastIdx = m.index + fullMatch.length;
      continue;
    }

    const afterMatch = text.slice(m.index + fullMatch.length);
    const wtMatch = afterMatch.match(WT_TAG_RE);
    const worktreeId = wtMatch?.[1] ?? undefined;

    const display = path;
    const isAbsolute = path.startsWith('/');
    const filePath = path.split(':')[0];
    const absPath = isAbsolute ? filePath : PROJECT_ROOT ? `${PROJECT_ROOT}/${filePath}` : null;
    const href = absPath ? `vscode://file${absPath}${line ? `:${line}` : ''}` : null;

    parts.push(
      href ? (
        <FilePathLink
          key={`fp${m.index}`}
          display={display}
          href={href}
        />
      ) : (
        <span key={`fp${m.index}`} className="text-blue-400 font-mono text-[0.85em]">
          {display}
        </span>
      ),
    );

    if (wtMatch) {
      lastIdx = m.index + fullMatch.length + wtMatch[0].length;
      combined.lastIndex = lastIdx;
    } else {
      lastIdx = m.index + fullMatch.length;
    }
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length > 0 ? parts : [text];
}

function FilePathLink({ display, href }: { display: string; href: string }) {
  return (
    <a
      href={href}
      className="text-blue-400 hover:text-blue-300 hover:underline font-mono text-[0.85em] cursor-pointer"
      title={`打开本地编辑器\n${display}`}
    >
      {display}
    </a>
  );
}

function withMentionsAndLinks(
  children: ReactNode,
  skillNames: string[],
  enableSkillAndQuickActionTokens: boolean,
): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child !== 'string') return child;
    const linked = linkifyFilePaths(child);
    return (
      <>
        {linked.map((node, i) =>
          typeof node === 'string' ? (
            <span key={i}>{highlightMentionsAndSkills(node, skillNames, enableSkillAndQuickActionTokens)}</span>
          ) : (
            node
          ),
        )}
      </>
    );
  });
}

function createMdComponents(skillNames: string[], enableSkillAndQuickActionTokens: boolean): Components {
  return {
    p: ({ children }) => (
      <p className="mb-2 last:mb-0 leading-relaxed">
        {withMentionsAndLinks(children, skillNames, enableSkillAndQuickActionTokens)}
      </p>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold">{withMentions(children, skillNames, enableSkillAndQuickActionTokens)}</strong>
    ),
    em: ({ children }) => <em>{withMentions(children, skillNames, enableSkillAndQuickActionTokens)}</em>,
    del: ({ children }) => (
      <del className="opacity-60">{withMentions(children, skillNames, enableSkillAndQuickActionTokens)}</del>
    ),

    h1: ({ children }) => (
      <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{withMentions(children, skillNames, enableSkillAndQuickActionTokens)}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{withMentions(children, skillNames, enableSkillAndQuickActionTokens)}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{withMentions(children, skillNames, enableSkillAndQuickActionTokens)}</h3>
    ),

    ul: ({ children }) => <ul className="list-disc pl-6 mb-2 space-y-0.5">{children}</ul>,
    ol: ({ children }) => (
      <ol className="list-decimal pl-10 mb-2 space-y-0.5 marker:[font-variant-numeric:tabular-nums]">{children}</ol>
    ),
    li: ({ children }) => <li className="pl-1">{withMentions(children, skillNames, enableSkillAndQuickActionTokens)}</li>,

    blockquote: ({ children }) => (
      <blockquote className="border-l-[3px] border-gray-300 pl-3 my-2 italic opacity-80">{children}</blockquote>
    ),
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
        {withMentions(children, skillNames, enableSkillAndQuickActionTokens)}
      </a>
    ),
    hr: () => <hr className="my-3 border-gray-200" />,

    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    code: ({ className, children }) => (
      <code className={`${className ?? ''} bg-gray-200/50 rounded px-1 py-0.5 text-[0.85em] font-mono`}>{children}</code>
    ),

    table: ({ children }) => (
      <div className="overflow-x-auto my-2">
        <table className="min-w-full text-sm border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
    th: ({ children }) => (
      <th className="border border-gray-300 px-2 py-1 text-left font-semibold text-xs">
        {withMentions(children, skillNames, enableSkillAndQuickActionTokens)}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-gray-300 px-2 py-1">{withMentions(children, skillNames, enableSkillAndQuickActionTokens)}</td>
    ),
  };
}

interface Props {
  content: string;
  className?: string;
  disableCommandPrefix?: boolean;
  basePath?: string;
  enableSkillAndQuickActionTokens?: boolean;
}

export function isRelativeMdLink(href: string | undefined): href is string {
  if (!href) return false;
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/')) return false;
  return /\.mdx?(?:#|$)/.test(href);
}

export function resolveRelativePath(base: string, relative: string): string {
  const clean = relative.split('#')[0];
  const parts = base ? base.split('/') : [];
  for (const seg of clean.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

export function MarkdownContent({
  content,
  className,
  disableCommandPrefix,
  basePath,
  enableSkillAndQuickActionTokens = false,
}: Props) {
  const [skillNames, setSkillNames] = useState<string[]>(() =>
    (getCachedSkillOptions() ?? []).map((item) => item.name),
  );

  useEffect(() => {
    let active = true;
    void fetchSkillOptionsWithCache().then((options) => {
      if (!active) return;
      setSkillNames(options.map((item) => item.name));
    });

    return () => {
      active = false;
    };
  }, []);

  const cmdMatch = disableCommandPrefix ? null : /^(\/\w+)/.exec(content);
  const md = cmdMatch ? content.slice(cmdMatch[1].length) : content;

  const mdStripped = useMemo(() => stripPptxPagesArtifactCommentsFromMarkdown(md), [md]);

  const components = useMemo(() => {
    const baseComponents = createMdComponents(skillNames, enableSkillAndQuickActionTokens);
    return basePath != null
      ? { ...baseComponents, a: createWorkspaceLinkComponent(basePath, skillNames, enableSkillAndQuickActionTokens) }
      : baseComponents;
  }, [basePath, skillNames, enableSkillAndQuickActionTokens]);

  return (
    <div
      className={`markdown-content font-sans break-words ${className ?? ''}`}
      style={{ fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif' }}
    >
      {cmdMatch && <span className="text-indigo-500">{cmdMatch[1]}</span>}
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {mdStripped}
      </ReactMarkdown>
    </div>
  );
}

function createWorkspaceLinkComponent(
  basePath: string,
  skillNames: string[],
  enableSkillAndQuickActionTokens: boolean,
): Components['a'] {
  return function WorkspaceLink({ href, children }) {
    if (isRelativeMdLink(href)) {
      const resolved = resolveRelativePath(basePath, href);
      return (
        <span
          className="text-gray-500 break-all"
          title={`历史 workspace 文档链接已下线: ${resolved}`}
        >
          {withMentions(children, skillNames, enableSkillAndQuickActionTokens)}
        </span>
      );
    }

    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline break-all">
        {withMentions(children, skillNames, enableSkillAndQuickActionTokens)}
      </a>
    );
  };
}
