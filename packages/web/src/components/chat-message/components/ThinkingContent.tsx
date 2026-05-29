/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LoadingPointStyle } from '@/components/LoadingPointStyle';
import { MarkdownContent } from '@/components/MarkdownContent';
import { InterruptedStopIcon } from '@/components/cli-output/cli-output-block/CliOutputBasicIcons';
import { readBubbleExpandPref, writeBubbleExpandPref } from '@/lib/chat-bubble-expand-prefs';
import type { CliEvent } from '@/stores/chat-types';

const STREAMING_THINKING_RENDER_LIMIT = 120_000;

function ThinkingChevron({ expanded, color }: { expanded: boolean; color?: string }) {
  return (
    <>
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color || '#6B7280'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-shrink-0 transition-transform duration-150"
        style={{ display: 'none', transform: expanded ? 'rotate(-90deg)' : 'rotate(90deg)' }}
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
      <svg
        style={{ transform: expanded ? 'rotate(-180deg)' : 'rotate(0deg)' }}
        viewBox="0 0 16 16"
        xmlns="http://www.w3.org/2000/svg"
        width="16.000000"
        height="16.000000"
        fill="none"
      >
        <rect id="收起-regular" width="16.000000" height="16.000000" x="0.000000" y="0.000000" />
        <path
          id="路径"
          d="M6.3 0C6.6866 0 7 0.313401 7 0.7L7 6.5C7 6.77614 6.77614 7 6.5 7C6.22386 7 6 6.77614 6 6.5L6 1L0.5 1C0.25454 1 0.0503915 0.823125 0.00805569 0.589876L0 0.5C0 0.223858 0.223858 0 0.5 0L6.3 0Z"
          fill="rgb(128,128,128)"
          fillRule="nonzero"
          transform="matrix(-0.707107,0.707107,-0.707107,-0.707107,12.9492,6)"
        />
      </svg>
    </>
  );
}

/** Collapsible thinking panel — same dark surface as CLI block, with brain SVG */
export function ThinkingContent({
  content,
  className,
  label = '深度思考中',
  defaultExpanded = false,
  expandInExport = true,
  status,
  events,
  inline = false,
  persistExpandKey,
}: {
  content: string;
  className?: string;
  label?: string;
  defaultExpanded?: boolean;
  expandInExport?: boolean;
  breedColor?: string;
  status?: 'done' | 'streaming' | 'failed' | 'interrupted';
  events: CliEvent[];
  /** When true, render thinking text only (no collapsible header) — for per-task grouped UI */
  inline?: boolean;
  persistExpandKey?: string;
}) {
  const isExport =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('export') === 'true';
  const shouldExpand = (isExport && expandInExport) || defaultExpanded;
  const userTouchedRef = useRef(
    Boolean(
      persistExpandKey &&
        !inline &&
        readBubbleExpandPref(persistExpandKey) !== undefined &&
        status !== 'streaming',
    ),
  );
  const [expanded, setExpanded] = useState(() => {
    if (persistExpandKey && !inline && status !== 'streaming') {
      const p = readBubbleExpandPref(persistExpandKey);
      if (p !== undefined) return p;
    }
    return shouldExpand;
  });
  const prevStatusRef = useRef(status);
  const autoCollapsedRef = useRef(false);
  const hasMounted = useRef(false);
  const toolUses = events.filter((e) => e.kind === 'tool_use');
  useEffect(() => {
    if (isExport) {
      setExpanded((isExport && expandInExport) || defaultExpanded);
      prevStatusRef.current = status;
      return;
    }

    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;

    if (status === 'streaming') {
      autoCollapsedRef.current = false;
      setExpanded(true);
      return;
    }

    if (prevStatus === 'streaming' && (status === 'done' || status === 'failed' || status === 'interrupted')) {
      autoCollapsedRef.current = true;
      if (!userTouchedRef.current) {
        setExpanded(false);
      }
      return;
    }

    if (!autoCollapsedRef.current && !userTouchedRef.current) {
      setExpanded(defaultExpanded);
    }
  }, [defaultExpanded, expandInExport, isExport, status]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: expanded is intentional — dispatch on toggle
  useLayoutEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('office-claw:chat-layout-changed'));
    }
  }, [expanded]);
  const previewLength = 60;
  const normalizedContent = content;
  const isStreaming = status === 'streaming';
  const isStreamingContentTrimmed = isStreaming && normalizedContent.length > STREAMING_THINKING_RENDER_LIMIT;
  const streamingContent = isStreamingContentTrimmed
    ? normalizedContent.slice(-STREAMING_THINKING_RENDER_LIMIT)
    : normalizedContent;
  const preview =
    normalizedContent.length > previewLength ? `${normalizedContent.slice(0, previewLength)}…` : normalizedContent;

  if (inline) {
    return (
      <div className={`task-inline-thinking overflow-hidden${toolUses.length > 0 ? ' pb-2' : ''}`}>
        <div className="text-[12px] leading-relaxed cli-output-md text-[#595959] mb-1 mt-1">
          {isStreaming ? (
            <div
              data-testid="thinking-inline-streaming"
              className={`whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[#595959] ${className ?? ''}`}
            >
              {isStreamingContentTrimmed && (
                <div className="mb-2 text-[11px] text-[#8C8C8C]">
                  仅展示最近 {STREAMING_THINKING_RENDER_LIMIT.toLocaleString()} 个字符，完整思考将在结束后保留。
                </div>
              )}
              {streamingContent}
            </div>
          ) : (
            <MarkdownContent content={normalizedContent} className={className} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`thinking-output-container overflow-hidden pt-2${toolUses.length > 0 ? ' pb-4' : ''}`}>
      <button
        type="button"
        data-testid="thinking-toggle"
        onClick={() => {
          userTouchedRef.current = true;
          setExpanded((v) => {
            const next = !v;
            if (persistExpandKey) {
              writeBubbleExpandPref(persistExpandKey, next);
            }
            return next;
          });
        }}
        className="thinking-button w-full flex items-center gap-2 px-2 text-[14px] font-mono transition-colors"
      >
        {status === 'streaming' && <LoadingPointStyle className="w-4 h-4 flex-shrink-0" />}
        {status === 'interrupted' && <InterruptedStopIcon className="w-5 h-5 flex-shrink-0 mt-[1px]" />}
        {status === 'done' && (
          <svg
            className="mt-[2px]"
            viewBox="0 0 16 16"
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            fill="none"
          >
            <mask id="mask_5" width="16.000000" height="16.000008" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
              <g filter="url(#pixso_custom_mask_type_alpha)">
                <g id="mask431_3429">
                  <path
                    id="减去顶层"
                    d="M16 0L0 0L0 16L16 16L16 0ZM7.39177 11.0114L12.4626 5.67807C12.6556 5.47511 12.6478 5.16407 12.4448 4.97104C12.2419 4.77814 11.9308 4.78597 11.738 4.98894L7.0288 9.94191L4.52863 7.32161C4.33543 7.11897 4.0244 7.11181 3.82177 7.30501C3.61913 7.49837 3.6118 7.80941 3.80517 8.01188L6.66763 11.0119C6.7827 11.1325 6.89927 11.1942 7.01693 11.1969C7.13477 11.1997 7.27117 11.1263 7.39177 11.0114Z"
                    fill="rgb(255,255,255)"
                    fillOpacity="0"
                    fillRule="evenodd"
                  />
                </g>
              </g>
            </mask>
            <mask id="mask_4" width="16.000000" height="16.000000" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
              <g filter="url(#pixso_custom_mask_type_alpha)">
                <g id="clip431_3420">
                  <rect id="support" width="16.000000" height="16.000000" x="0.000000" y="0.000000" fill="rgb(0,0,0)" />
                </g>
              </g>
            </mask>
            <defs>
              <filter id="pixso_custom_mask_type_alpha">
                <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0 " />
              </filter>
            </defs>
            <mask id="mask_3" width="16.000000" height="16.000000" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
              <g filter="url(#pixso_custom_mask_type_alpha)">
                <g id="clip431_3419">
                  <rect
                    id="ic_public_success-成功/base/ic_public_success"
                    width="16.000000"
                    height="16.000000"
                    x="0.000000"
                    y="0.000000"
                    fill="rgb(0,0,0)"
                  />
                </g>
              </g>
            </mask>
            <rect id="ic_public_success" width="16.000000" height="16.000000" x="0.000000" y="0.000000" />
            <rect
              id="ic_public_success-成功/base/ic_public_success"
              width="16.000000"
              height="16.000000"
              x="0.000000"
              y="0.000000"
              fill="rgb(255,255,255)"
              fillOpacity="0"
            />
            <g id="clip path group" mask="url(#mask_3)">
              <g id="组合 5142">
                <g id="clip path group" mask="url(#mask_4)">
                  <g id="组合 5143">
                    <path
                      id="path1"
                      d="M1.66378e-05 7.9924C1.66378e-05 6.7424 -0.0033167 5.4924 1.66378e-05 4.2424C-0.0033167 3.63574 0.07335 3.0324 0.220017 2.44907C0.546683 1.20907 1.35335 0.469071 2.59668 0.185737C3.21335 0.052404 3.85335 -0.0109293 4.48668 -0.000929316C6.88002 -0.000929316 9.27668 -0.000929316 11.68 -0.000929316C12.2833 -0.00426265 12.8867 0.0590707 13.4767 0.205737C14.7533 0.515737 15.52 1.3224 15.81 2.59907C15.9434 3.19907 16.0033 3.80907 15.9967 4.42907C15.9967 6.8524 15.9967 9.27574 15.9967 11.6957C16 12.2957 15.9333 12.8924 15.79 13.4757C15.4767 14.7557 14.6667 15.5157 13.3934 15.8091C12.77 15.9424 12.1367 16.0057 11.5033 15.9957C9.11668 15.9957 6.72668 15.9957 4.34335 15.9957C3.73335 16.0024 3.12335 15.9324 2.53335 15.7924C1.25002 15.4824 0.476683 14.6691 0.186683 13.3857C0.0400166 12.7391 1.66378e-05 12.0891 1.66378e-05 11.4324C1.66378e-05 10.2857 1.66378e-05 9.13574 1.66378e-05 7.9924Z"
                      fill="rgb(255,255,255)"
                      fillOpacity="0"
                      fillRule="evenodd"
                    />
                    <circle id="path2" cx="8" cy="8" r="8" fill="rgb(255,255,255)" fillOpacity="0" />
                  </g>
                </g>
                <ellipse
                  id="path3"
                  rx="7.333333"
                  ry="7.333102"
                  cx="8.00008202"
                  cy="7.99911785"
                  stroke="rgb(92,179,0)"
                  strokeWidth="1"
                />
                <path
                  id="path6"
                  d="M4.16675 7.66732L7.02675 10.6673L12.0967 5.33398"
                  fillRule="nonzero"
                  stroke="rgb(92,179,0)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1"
                />
                <g id="mask" mask="url(#mask_5)">
                  <g id="组合 5144">
                    <ellipse
                      id="path4"
                      rx="8.000000"
                      ry="7.999748"
                      cx="8"
                      cy="7.99974823"
                      fill="rgb(255,255,255)"
                      fillOpacity="0"
                    />
                  </g>
                </g>
                <path
                  id="path6 (边框)"
                  d="M12.4601 5.67729L7.39005 11.0106C7.27005 11.124 7.13339 11.1973 7.01672 11.1973C6.89672 11.194 6.78005 11.1306 6.66672 11.0106L3.80339 8.01062C3.61005 7.80729 3.61672 7.49729 3.82005 7.30396C4.02339 7.11062 4.33339 7.11729 4.52672 7.32062L7.02672 9.94062L11.7367 4.98729C11.9301 4.78396 12.2401 4.77729 12.4434 4.97062C12.6467 5.16396 12.6534 5.47396 12.4601 5.67729Z"
                  fill="rgb(255,255,255)"
                  fillOpacity="0"
                  fillRule="evenodd"
                />
              </g>
            </g>
          </svg>
        )}
        {status === 'failed' && (
          <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none">
            <mask id="mask_2" width="16.000000" height="16.000008" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
              <g filter="url(#pixso_custom_mask_type_alpha)">
                <g id="mask431_3429">
                  <path
                    id="减去顶层"
                    d="M16 0L0 0L0 16L16 16L16 0ZM7.39177 11.0114L12.4626 5.67807C12.6556 5.47511 12.6478 5.16407 12.4448 4.97104C12.2419 4.77814 11.9308 4.78597 11.738 4.98894L7.0288 9.94191L4.52863 7.32161C4.33543 7.11897 4.0244 7.11181 3.82177 7.30501C3.61913 7.49837 3.6118 7.80941 3.80517 8.01188L6.66763 11.0119C6.7827 11.1325 6.89927 11.1942 7.01693 11.1969C7.13477 11.1997 7.27117 11.1263 7.39177 11.0114Z"
                    fill="rgb(255,255,255)"
                    fillOpacity="0"
                    fillRule="evenodd"
                  />
                </g>
              </g>
            </mask>
            <mask id="mask_1" width="16.000000" height="16.000000" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
              <g filter="url(#pixso_custom_mask_type_alpha)">
                <g id="clip431_3420">
                  <rect id="support" width="16.000000" height="16.000000" x="0.000000" y="0.000000" fill="rgb(0,0,0)" />
                  <path
                    id="合并"
                    d="M9.72492 10.2286C9.65951 10.2286 9.59888 10.217 9.54302 10.1939C9.48689 10.1707 9.43559 10.1359 9.38909 10.0894L7.1 7.80031L4.81091 10.0894C4.76441 10.1359 4.7131 10.1707 4.65697 10.1939Q4.57318 10.2286 4.47508 10.2286Q4.37698 10.2286 4.29319 10.1939C4.23706 10.1707 4.18575 10.1359 4.13925 10.0894C4.09254 10.0427 4.05758 9.99115 4.03438 9.93476C4.01146 9.87908 4 9.81869 4 9.75358C4 9.68846 4.01146 9.62807 4.03438 9.57239Q4.06919 9.48781 4.13925 9.41775L6.42835 7.12866L4.13925 4.83957Q4.06919 4.7695 4.03438 4.68493Q4 4.60141 4 4.50374Q4 4.40607 4.03438 4.32256L4.03438 4.32256Q4.06919 4.23798 4.13925 4.16791Q4.20932 4.09785 4.2939 4.06304Q4.37741 4.02866 4.47508 4.02866Q4.57275 4.02866 4.65627 4.06304Q4.74084 4.09785 4.81091 4.16791L7.1 6.457L9.38909 4.16791C9.50103 4.05597 9.61298 4 9.72492 4C9.83686 4 9.9488 4.05597 10.0607 4.16791C10.1075 4.21462 10.1424 4.26617 10.1656 4.32255C10.1885 4.37823 10.2 4.43863 10.2 4.50374Q10.2 4.60141 10.1656 4.68493C10.1424 4.74131 10.1075 4.79286 10.0607 4.83957L7.77165 7.12866L10.0607 9.41775C10.1075 9.46446 10.1424 9.51601 10.1656 9.57239C10.1885 9.62807 10.2 9.68847 10.2 9.75358C10.2 9.81869 10.1885 9.87909 10.1656 9.93477C10.1424 9.99115 10.1075 10.0427 10.0607 10.0894C10.0142 10.1359 9.96293 10.1707 9.90681 10.1939C9.85095 10.217 9.79032 10.2286 9.72492 10.2286Z"
                    fill="rgb(255,255,255)"
                    fillRule="evenodd"
                  />
                </g>
              </g>
            </mask>
            <defs>
              <filter id="pixso_custom_mask_type_alpha">
                <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0 " />
              </filter>
            </defs>
            <mask id="mask_0" width="16.000000" height="16.000000" x="0.000000" y="0.000000" maskUnits="userSpaceOnUse">
              <g filter="url(#pixso_custom_mask_type_alpha)">
                <g id="clip431_3419">
                  <rect
                    id="ic_public_success-成功/base/ic_public_success"
                    width="16.000000"
                    height="16.000000"
                    x="0.000000"
                    y="0.000000"
                    fill="rgb(0,0,0)"
                  />
                </g>
              </g>
            </mask>
            <rect id="ic_public_error" width="16.000000" height="16.000000" x="0.000000" y="0.000000" />
            <rect
              id="ic_public_success-成功/base/ic_public_success"
              width="16.000000"
              height="16.000000"
              x="0.000000"
              y="0.000000"
              fill="rgb(255,255,255)"
              fillOpacity="0"
            />
            <g id="clip path group" mask="url(#mask_0)">
              <g id="组合 5142">
                <g id="clip path group" mask="url(#mask_1)">
                  <g id="组合 5143">
                    <path
                      id="path1"
                      d="M1.66378e-05 7.9924C1.66378e-05 6.7424 -0.0033167 5.4924 1.66378e-05 4.2424C-0.0033167 3.63574 0.07335 3.0324 0.220017 2.44907C0.546683 1.20907 1.35335 0.469071 2.59668 0.185737C3.21335 0.052404 3.85335 -0.0109293 4.48668 -0.000929316C6.88002 -0.000929316 9.27668 -0.000929316 11.68 -0.000929316C12.2833 -0.00426265 12.8867 0.0590707 13.4767 0.205737C14.7533 0.515737 15.52 1.3224 15.81 2.59907C15.9434 3.19907 16.0033 3.80907 15.9967 4.42907C15.9967 6.8524 15.9967 9.27574 15.9967 11.6957C16 12.2957 15.9333 12.8924 15.79 13.4757C15.4767 14.7557 14.6667 15.5157 13.3934 15.8091C12.77 15.9424 12.1367 16.0057 11.5033 15.9957C9.11668 15.9957 6.72668 15.9957 4.34335 15.9957C3.73335 16.0024 3.12335 15.9324 2.53335 15.7924C1.25002 15.4824 0.476683 14.6691 0.186683 13.3857C0.0400166 12.7391 1.66378e-05 12.0891 1.66378e-05 11.4324C1.66378e-05 10.2857 1.66378e-05 9.13574 1.66378e-05 7.9924Z"
                      fill="rgb(255,255,255)"
                      fillOpacity="0"
                      fillRule="evenodd"
                    />
                    <circle id="path2" cx="8" cy="8" r="8" fill="rgb(255,255,255)" fillOpacity="0" />
                  </g>
                </g>
                <ellipse
                  id="path3"
                  rx="7.333333"
                  ry="7.333102"
                  cx="8.00008202"
                  cy="7.99911785"
                  stroke="rgb(242,48,48)"
                  strokeWidth="1"
                />
                <g id="mask" mask="url(#mask_2)">
                  <g id="组合 5144">
                    <ellipse
                      id="path4"
                      rx="8.000000"
                      ry="7.999748"
                      cx="8"
                      cy="7.99974823"
                      fill="rgb(255,255,255)"
                      fillOpacity="0"
                    />
                  </g>
                </g>
                <path
                  id="path6 (边框)"
                  d="M12.4601 5.67729L7.39005 11.0106C7.27005 11.124 7.13339 11.1973 7.01672 11.1973C6.89672 11.194 6.78005 11.1306 6.66672 11.0106L3.80339 8.01062C3.61005 7.80729 3.61672 7.49729 3.82005 7.30396C4.02339 7.11062 4.33339 7.11729 4.52672 7.32062L7.02672 9.94062L11.7367 4.98729C11.9301 4.78396 12.2401 4.77729 12.4434 4.97062C12.6467 5.16396 12.6534 5.47396 12.4601 5.67729Z"
                  fill="rgb(255,255,255)"
                  fillOpacity="0"
                  fillRule="evenodd"
                />
                <path
                  id="合并"
                  d="M10.7249 11.2286C10.6595 11.2286 10.5989 11.217 10.543 11.1939C10.4869 11.1707 10.4356 11.1359 10.3891 11.0894L8.1 8.80031L5.81091 11.0894C5.76441 11.1359 5.7131 11.1707 5.65697 11.1939Q5.57318 11.2286 5.47508 11.2286Q5.37698 11.2286 5.29319 11.1939C5.23706 11.1707 5.18575 11.1359 5.13925 11.0894C5.09254 11.0427 5.05758 10.9911 5.03438 10.9348C5.01146 10.8791 5 10.8187 5 10.7536C5 10.6885 5.01146 10.6281 5.03438 10.5724Q5.06919 10.4878 5.13925 10.4177L7.42835 8.12866L5.13925 5.83957Q5.06919 5.7695 5.03438 5.68493Q5 5.60141 5 5.50374Q5 5.40607 5.03438 5.32256L5.03438 5.32256Q5.06919 5.23798 5.13925 5.16791Q5.20932 5.09785 5.2939 5.06304Q5.37741 5.02866 5.47508 5.02866Q5.57275 5.02866 5.65627 5.06304Q5.74084 5.09785 5.81091 5.16791L8.1 7.457L10.3891 5.16791C10.501 5.05597 10.613 5 10.7249 5C10.8369 5 10.9488 5.05597 11.0607 5.16791C11.1075 5.21462 11.1424 5.26617 11.1656 5.32255C11.1885 5.37823 11.2 5.43863 11.2 5.50374Q11.2 5.60141 11.1656 5.68493C11.1424 5.74131 11.1075 5.79286 11.0607 5.83957L8.77165 8.12866L11.0607 10.4177C11.1075 10.4645 11.1424 10.516 11.1656 10.5724C11.1885 10.6281 11.2 10.6885 11.2 10.7536C11.2 10.8187 11.1885 10.8791 11.1656 10.9348C11.1424 10.9912 11.1075 11.0427 11.0607 11.0894C11.0142 11.1359 10.9629 11.1707 10.9068 11.1939C10.8509 11.217 10.7903 11.2286 10.7249 11.2286Z"
                  fill="rgb(242,48,48)"
                  fillRule="evenodd"
                />
              </g>
            </g>
          </svg>
        )}
        <span className="text-[16px] font-bold font-sans" style={{ color: 'rgb(31, 31, 31)' }}>
          {label}
        </span>
        <span style={{ color: 'rgb(31, 31, 31)' }}>
          <ThinkingChevron expanded={expanded} color={'rgb(31, 31, 31)'} />
        </span>
        {!expanded && (
          <span className="hidden truncate max-w-[240px]" style={{ color: 'rgb(31, 31, 31)' }}>
            {preview}
          </span>
        )}
      </button>
      {expanded && (
        <div className="thinking-output-body">
          <div
            style={{ padding: '8px 0 8px 28px' }}
            className="text-[12px] leading-relaxed cli-output-md text-[#595959]"
          >
            {isStreaming ? (
              <div
                data-testid="thinking-streaming-body"
                className={`whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[#595959] ${
                  className ?? ''
                }`}
              >
                {isStreamingContentTrimmed && (
                  <div className="mb-2 text-[11px] text-[#8C8C8C]">
                    仅展示最近 {STREAMING_THINKING_RENDER_LIMIT.toLocaleString()} 个字符，完整思考将在结束后保留。
                  </div>
                )}
                {streamingContent}
              </div>
            ) : (
              <MarkdownContent content={normalizedContent} className={className} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
