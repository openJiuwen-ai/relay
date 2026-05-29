/*
 * *
 *  Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import {
  type ClipboardEvent,
  type CSSProperties,
  type FormEvent,
  forwardRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type UIEvent,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import type { FilePlaceholder, ParsedPrompt, TextPlaceholder } from '@/utils/promptParser';
import { usePromptBlockKeyboardNavigation } from '../hooks/usePromptBlockKeyboardNavigation';
import { FilePlaceholderBlock } from './FilePlaceholderBlock';
import {
  buildRichTextareaSegments,
  type RichQuickActionOption,
  type RichSkillOption,
  type RichTextareaSegment,
} from './rich-textarea-token-rendering';
import { TextPlaceholderBlock } from './TextPlaceholderBlock';

export interface RichTextareaPromptBlocksProps {
  parsed: ParsedPrompt;
  activePlaceholderId: string | null;
  onFocus: (id: string) => void;
  onBlur: () => void;
  onDelete: (id: string) => void;
  onTabNext: (currentId: string) => void;
  onInput?: (e: FormEvent<HTMLDivElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onPaste?: (e: ClipboardEvent<HTMLDivElement>) => void;
  onScroll?: (e: UIEvent<HTMLDivElement>) => void;
  skillOptions?: RichSkillOption[];
  quickActionOptions?: RichQuickActionOption[];
  className?: string;
  style?: CSSProperties;
}

function placeCaretFromClick(e: MouseEvent<HTMLSpanElement>): void {
  e.stopPropagation();
  const selection = window.getSelection();
  if (!selection) return;

  let range: Range | null = null;
  if (typeof document.caretRangeFromPoint === 'function') {
    range = document.caretRangeFromPoint(e.clientX, e.clientY);
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
    }
  }

  if (!range) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

interface RichPromptFixedBlockProps {
  blockIndex: number;
  content: string;
  skillOptions: RichSkillOption[];
  quickActionOptions: RichQuickActionOption[];
}

function RichPromptFixedBlock({ blockIndex, content, skillOptions, quickActionOptions }: RichPromptFixedBlockProps) {
  const segments = useMemo(
    () => buildRichTextareaSegments(content, skillOptions, quickActionOptions, { allowTerminalMention: true }),
    [content, quickActionOptions, skillOptions],
  );

  return (
    <span
      contentEditable
      suppressContentEditableWarning
      className="outline-none focus:outline-none"
      data-block-index={blockIndex}
      onClick={placeCaretFromClick}
    >
      {segments.map((segment, segmentIndex) => renderSegmentNode(segment, `${blockIndex}-${segmentIndex}`))}
    </span>
  );
}

function renderSegmentNode(segment: RichTextareaSegment, key: string): ReactNode {
  if (segment.type === 'text') {
    return <span key={key}>{segment.text}</span>;
  }

  if (segment.type === 'mention') {
    return (
      <span key={key} data-token-type="mention" className="text-[var(--text-accent)]">
        {segment.text}
      </span>
    );
  }

  if (segment.type === 'quick_action') {
    return (
      <span
        key={key}
        data-token-type="quick-action"
        data-token-value={segment.token}
        contentEditable={false}
        className="group/quick-action inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border text-[14px] font-normal leading-[22px] text-[var(--text-primary)] align-middle"
        style={{
          padding: '2px 8px',
          marginBottom: '2px',
          borderColor: 'var(--border-accent)',
          backgroundColor: 'var(--accent-soft)',
          cursor: 'pointer',
        }}
      >
        {segment.icon ? (
          <img
            src={segment.icon}
            alt=""
            aria-hidden="true"
            className="h-4 w-4 shrink-0 group-hover/quick-action:hidden"
          />
        ) : (
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-[var(--text-accent)] group-hover/quick-action:hidden"
          />
        )}
        <span
          data-remove-quick-action="1"
          aria-hidden="true"
          className="hidden h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--text-muted)] group-hover/quick-action:inline-flex hover:text-[var(--text-accent)]"
          style={{ fontSize: '18px', lineHeight: '18px', marginBottom: '2px' }}
        >
          ×
        </span>
        <span>{segment.text}</span>
      </span>
    );
  }

  return (
    <span
      key={key}
      data-token-type="skill"
      data-token-value={segment.token}
      contentEditable={false}
      className="inline-flex max-w-full translate-y-[-1px] items-center gap-1 text-[var(--text-accent)] text-[16px] leading-5 align-middle"
    >
      <span
        aria-hidden="true"
        className="inline-block h-4 w-4 shrink-0"
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
      <span className="truncate">{segment.text}</span>
    </span>
  );
}

export const RichTextareaPromptBlocks = forwardRef<HTMLDivElement, RichTextareaPromptBlocksProps>(
  function RichTextareaPromptBlocks(
    {
      parsed,
      activePlaceholderId,
      onFocus,
      onBlur,
      onDelete,
      onTabNext,
      onInput,
      onKeyDown,
      onPaste,
      onScroll,
      skillOptions = [],
      quickActionOptions = [],
      className,
      style,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => containerRef.current as HTMLDivElement);

    const handleFocus = useCallback((id: string) => onFocus(id), [onFocus]);
    const handleBlur = useCallback(() => onBlur(), [onBlur]);
    const handleDelete = useCallback((id: string) => onDelete(id), [onDelete]);
    const handleTabNext = useCallback((currentId: string) => onTabNext(currentId), [onTabNext]);

    usePromptBlockKeyboardNavigation({ containerRef, parsed, onFocus, onBlur, onDelete: handleDelete });

    return (
      <div
        ref={containerRef}
        className={className ? `${className} outline-none` : 'outline-none'}
        style={style}
        tabIndex={0}
        role="textbox"
        aria-multiline="true"
        onInput={onInput}
        onKeyDown={(e) => {
          if (e.defaultPrevented) return;
          onKeyDown?.(e);
        }}
        onPaste={onPaste}
        onScroll={onScroll}
      >
        {parsed.blocks.map((block, index) => {
          if (block.type === 'fixed') {
            return (
              <RichPromptFixedBlock
                key={`fixed-${index}`}
                blockIndex={index}
                content={block.content}
                skillOptions={skillOptions}
                quickActionOptions={quickActionOptions}
              />
            );
          }

          if (block.type === 'placeholder') {
            const placeholder = block.placeholder;
            const isActive = placeholder.id === activePlaceholderId;

            if (placeholder.type === 'text') {
              return (
                <TextPlaceholderBlock
                  key={placeholder.id}
                  placeholder={placeholder as TextPlaceholder}
                  isActive={isActive}
                  skillOptions={skillOptions}
                  quickActionOptions={quickActionOptions}
                  onFocus={() => handleFocus(placeholder.id)}
                  onBlur={handleBlur}
                  onDelete={() => handleDelete(placeholder.id)}
                  onTabNext={() => handleTabNext(placeholder.id)}
                />
              );
            }

            if (placeholder.type === 'file') {
              return (
                <FilePlaceholderBlock
                  key={placeholder.id}
                  placeholder={placeholder as FilePlaceholder}
                  isActive={isActive}
                  onFocus={() => handleFocus(placeholder.id)}
                  onBlur={handleBlur}
                  onDelete={() => handleDelete(placeholder.id)}
                  onTabNext={() => handleTabNext(placeholder.id)}
                />
              );
            }
          }

          return null;
        })}
      </div>
    );
  },
);
