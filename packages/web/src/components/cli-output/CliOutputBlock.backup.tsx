/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * 【备份文件 — 非生产入口】
 *
 * 本文件为拆分重构前 `CliOutputBlock` 的完整单文件备份，仅用于需要时快速对照或恢复旧实现；
 * 运行时请使用 `cli-output-block/` 目录下的模块化实现（见 `cli-output-block/index.ts`）。
 *
 * 计划在 2026-06-01 之后删除本备份文件，请勿在新代码中引用或 import 本文件。
 */

'use client';

import { type ComponentType, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AuthorizationCard } from '@/components/AuthorizationCard';
import { MarkdownContent } from '@/components/MarkdownContent';
import type { AuthPendingRequest, RespondScope } from '@/hooks/useAuthorization';
import type { ChatMessage, CliEvent, CliStatus } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { PptSessionCard } from '../ppt-studio/PptSessionCard';
import type { PptStudioSession } from '../ppt-studio/ppt-studio-types';
import { LoadingSmall } from '../LoadingSmall';
import { LoadingPointStyle } from '../LoadingPointStyle';
import {
  extractDisplayedLocalGeneratedFiles,
  fileNameFromPath,
  findLocalPptLinkedToPptPages,
  formatGeneratedDate,
  getParentDirectoryPath,
  isAbsolutePresentationPath,
  isLocalAgentOpenableExtension,
  resolvePresentationPath,
  type FileVerificationStatus,
  type LocalGeneratedFile,
  type LocalGeneratedFileKind,
  type LocalGeneratedFileMeta,
} from './local-generated-files';
import { useSyncCliOutputPptPreview } from './use-cli-output-ppt-preview';

export {
  extractDisplayedLocalGeneratedFiles,
  findLocalPptLinkedToPptPages,
  formatGeneratedDate,
  isLocalAgentOpenableExtension,
} from './local-generated-files';
export type { LocalGeneratedFile, LocalGeneratedFileKind } from './local-generated-files';

function resolvePptSessionStoreKey(
  sessions: Record<string, PptStudioSession>,
  markerPagesDir: string,
): string {
  if (sessions[markerPagesDir]) return markerPagesDir;
  const norm = markerPagesDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const hit = Object.keys(sessions).find((k) => {
    const nk = k.replace(/\\/g, '/').replace(/\/+$/, '');
    return nk.endsWith(norm) || norm.endsWith(nk);
  });
  return hit ?? markerPagesDir;
}

/* ── Helpers ── */

/** Lighten a hex color toward white by ratio (0-1) */
function lighten(hex: string, ratio: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * ratio);
  const lg = Math.round(g + (255 - g) * ratio);
  const lb = Math.round(b + (255 - b) * ratio);
  return `rgb(${lr}, ${lg}, ${lb})`;
}

/* ── Inline SVG icons (Lucide-style, from Pencil design) ── */

interface FileIconProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

interface LocalFileKindUiConfig {
  badgeLabel: string;
  cardTestId: string;
  openTestId: string;
  openFolderTestId: string;
  Icon: ComponentType<FileIconProps>;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <>
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgb(31, 31, 31)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-transform duration-150 flex-shrink-0"
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="16.000000" height="16.000000" fill="none">
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
  );
}

function ErrorIcon() {
  return (
    <img
      src="/icons/tool-error.svg"
      alt=""
      aria-hidden="true"
      className="w-4 h-4 flex-shrink-0"
    />
  );
}

const PERMISSION_DENIED_MARKERS = [
  '[PERMISSION_DENIED]',
  '[PERMISSION_REJECTED]',
  '[APPROVAL_REQUIRED]',
  'PERMISSION_DENIED:',
  '[permission denied]',
  'command rejected for safety',
];

function isPermissionDeniedResult(detail: string | undefined): boolean {
  if (!detail) return false;
  return PERMISSION_DENIED_MARKERS.some((marker) => detail.includes(marker));
}

function PawPrint() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#64748B"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0"
    >
      <circle cx="11" cy="4" r="2" />
      <circle cx="18" cy="8" r="2" />
      <circle cx="20" cy="16" r="2" />
      <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
    </svg>
  );
}

/* ── Status helpers ── */

function MarkdownFileIcon({ width = 24, height = 24, className }: FileIconProps) {
  return (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" width={width} height={height} fill="none" className={className}>
      <rect id="MD" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <g id="ic_normal_white_grid_pptx">
        <g id="编组-236">
          <path id="矩形备份-24" d="M25.8325 3.33496L34.5825 12.085L27.7373 12.085C26.6853 12.085 25.8325 11.2322 25.8325 10.1802L25.8325 3.33496L25.8325 3.33496Z" fill="rgb(199,201,254)" fill-rule="evenodd" />
          <path id="矩形备份-23" d="M25.9558 3.33496L25.9409 10.176C25.9386 11.228 26.7895 12.0827 27.8415 12.085L34.6867 12.085L34.6867 33.335C34.6867 35.1759 33.1943 36.6683 31.3534 36.6683L8.85335 36.6683C7.0124 36.6683 5.52002 35.1759 5.52002 33.335L5.52002 6.66829C5.52002 4.82735 7.0124 3.33496 8.85335 3.33496L25.9558 3.33496L25.9558 3.33496Z" fill="rgb(116,121,244)" fill-rule="evenodd" />
        </g>
      </g>
      <path id="矢量 111" d="M11.1118 28.3333L11.1118 20L15.2785 26.6667L19.4451 20L19.4451 28.3333" stroke="rgb(255,255,255)" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.31428576" />
      <path id="矢量 112" d="M22.7783 28.3333C24.0712 28.3333 24.3044 28.3333 25.2783 28.3333C28.6114 28.3334 29.4454 26.0067 29.445 23.9521C29.4446 21.8975 28.6115 19.9996 25.2783 20C21.9452 20.0004 23.7158 20 22.7783 20L22.7783 28.3333Z" stroke="rgb(255,255,255)" stroke-linejoin="round" stroke-width="1.31428576" />
    </svg>
  );
}

function WordFileIcon({ width = 24, height = 24, className }: FileIconProps) {
  return (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" width={width} height={height} fill="none" className={className}>
      <rect id="word" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <g id="ic_normal_white_grid_doc">
        <path id="矩形备份-6" d="M33.4961 11.251L34.3294 11.251L34.3294 12.0843L33.4961 12.0843L33.4961 11.251Z" fill="rgb(255,255,255)" fill-rule="evenodd" />
        <path id="矩形备份-23" d="M25.9558 3.33496L25.9409 10.176C25.9386 11.228 26.7895 12.0827 27.8415 12.085L34.6867 12.085L34.6867 33.335C34.6867 35.1759 33.1943 36.6683 31.3534 36.6683L8.85335 36.6683C7.0124 36.6683 5.52002 35.1759 5.52002 33.335L5.52002 6.66829C5.52002 4.82735 7.0124 3.33496 8.85335 3.33496L25.9558 3.33496L25.9558 3.33496Z" fill="rgb(59,140,250)" fill-rule="evenodd" />
        <path id="矩形备份-24" d="M25.8325 3.33496L34.5825 12.085L27.7373 12.085C26.6853 12.085 25.8325 11.2322 25.8325 10.1802L25.8325 3.33496L25.8325 3.33496Z" fill="rgb(173,205,249)" fill-rule="evenodd" />
        <path id="路径-4" d="M14.791 20.001L16.9162 28.4886C16.965 28.6837 17.239 28.6927 17.3006 28.5013L19.8444 20.5938C19.904 20.4087 20.1659 20.4088 20.2253 20.594L22.7574 28.4917C22.819 28.684 23.0944 28.6742 23.1422 28.478L25.2077 20.001" fill-rule="evenodd" stroke="rgb(255,255,255)" stroke-linecap="round" stroke-width="1.80555582" />
      </g>
    </svg>
  );
}

function ExcelFileIcon({ width = 24, height = 24, className }: FileIconProps) {
  return (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" width={width} height={height} fill="none" className={className}>
      <rect id="excel" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <g id="ic_normal_white_grid_xls">
        <path id="矩形备份-77" d="M25.8325 3.33496L34.5825 12.085L27.7373 12.085C26.6853 12.085 25.8325 11.2322 25.8325 10.1802L25.8325 3.33496L25.8325 3.33496Z" fill="rgb(126,237,193)" fill-rule="evenodd" />
        <path id="矩形备份-23" d="M25.9558 3.33496L25.9409 10.176C25.9386 11.228 26.7895 12.0827 27.8415 12.085L34.6867 12.085L34.6867 33.335C34.6867 35.1759 33.1943 36.6683 31.3534 36.6683L8.85335 36.6683C7.0124 36.6683 5.52002 35.1759 5.52002 33.335L5.52002 6.66829C5.52002 4.82735 7.0124 3.33496 8.85335 3.33496L25.9558 3.33496L25.9558 3.33496Z" fill="rgb(6,187,115)" fill-rule="evenodd" />
        <g id="编组-3">
          <g id="编组-2">
            <path id="路径-5" d="M0 0L12.2267 0" stroke="rgb(255,255,255)" stroke-linecap="round" stroke-width="1.80555582" transform="matrix(0.573677,0.819082,-0.819082,0.573677,16.4517,18.4229)" />
            <path id="路径-5" d="M0 0L12.2267 0" stroke="rgb(255,255,255)" stroke-linecap="round" stroke-width="1.80555582" transform="matrix(-0.573677,0.819082,-0.819082,-0.573677,23.6001,18.4746)" />
          </g>
        </g>
      </g>
</svg>
  );
}

function PdfFileIcon({ width = 24, height = 24, className }: FileIconProps) {
  return (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" width={width} height={height} fill="none" className={className}>
      <rect id="pdf" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <g id="ic_normal_white_grid_pdf">
        <path id="矩形备份-47" d="M25.8325 3.33496L34.5825 12.085L27.7373 12.085C26.6853 12.085 25.8325 11.2322 25.8325 10.1802L25.8325 3.33496L25.8325 3.33496Z" fill="rgb(255,191,190)" fill-rule="evenodd" />
        <path id="矩形备份-23" d="M25.9558 3.33496L25.9409 10.176C25.9386 11.228 26.7895 12.0827 27.8415 12.085L34.6867 12.085L34.6867 33.335C34.6867 35.1759 33.1943 36.6683 31.3534 36.6683L8.85335 36.6683C7.0124 36.6683 5.52002 35.1759 5.52002 33.335L5.52002 6.66829C5.52002 4.82735 7.0124 3.33496 8.85335 3.33496L25.9558 3.33496L25.9558 3.33496Z" fill="rgb(255,76,72)" fill-rule="evenodd" />
        <g id="编组">
          <path id="多边形" d="M23.343 27.6338L16.7632 27.6338L20.0531 21.9355L23.343 27.6338Z" fill-rule="evenodd" stroke="rgb(255,255,255)" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.35416675" />
          <path id="路径" d="M20.1496 21.4246C20.962 20.4724 21.3683 19.7558 21.3683 19.2749C21.3683 18.5255 20.7795 17.918 20.0533 17.918C19.327 17.918 18.7383 18.5255 18.7383 19.2749C18.7383 19.7557 19.1442 20.4718 19.956 21.4235" fill-rule="evenodd" stroke="rgb(255,255,255)" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.35416675" />
          <path id="路径备份" d="M1.41132 3.50664C2.22376 2.55445 2.62998 1.83788 2.62998 1.35692C2.62998 0.607515 2.04124 0 1.31499 0C0.588741 0 0 0.607515 0 1.35692C0 1.83769 0.405893 2.55388 1.21768 3.50549" fill-rule="evenodd" stroke="rgb(255,255,255)" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.35416675" transform="matrix(-0.5,0.866025,-0.866025,-0.5,27.4893,28.4678)" />
          <path id="路径备份-2" d="M1.41132 3.50664C2.22376 2.55445 2.62998 1.83788 2.62998 1.35692C2.62998 0.607515 2.04124 0 1.31499 0C0.588741 0 0 0.607515 0 1.35692C0 1.83769 0.405893 2.55388 1.21768 3.50549" fill-rule="evenodd" stroke="rgb(255,255,255)" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.35416675" transform="matrix(-0.5,-0.866025,0.866025,-0.5,13.9326,30.7461)" />
        </g>
      </g>
    </svg>
  );
}

function TxtFileIcon({ width = 24, height = 24, className }: FileIconProps) {
  return (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" width={width} height={height} fill="none" className={className}>
      <rect id="text" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <g id="编组-89">
        <rect id="矩形" width="33.333332" height="33.333336" x="3.333496" y="3.333984" />
        <g id="ic_normal_white_grid_documents">
          <path id="矩形备份-81" d="M25.8335 3.33398L34.5835 12.084L27.7383 12.084C26.6863 12.084 25.8335 11.2312 25.8335 10.1792L25.8335 3.33398L25.8335 3.33398Z" fill="rgb(199,201,254)" fill-rule="evenodd" />
          <path id="矩形备份-23" d="M25.9568 3.33398L25.9418 10.1751C25.9395 11.227 26.7905 12.0817 27.8424 12.084L34.6877 12.084L34.6877 33.334C34.6877 35.1749 33.1953 36.6673 31.3543 36.6673L8.85433 36.6673C7.01338 36.6673 5.521 35.1749 5.521 33.334L5.521 6.66732C5.521 4.82637 7.01338 3.33398 8.85433 3.33398L25.9568 3.33398L25.9568 3.33398Z" fill="rgb(116,121,244)" fill-rule="evenodd" />
          <g id="编组-249">
            <rect id="矩形" width="15.625000" height="1.666667" x="12.187500" y="18.541992" rx="0.833333" fill="rgb(255,255,255)" />
            <rect id="矩形备份" width="15.625000" height="1.666667" x="12.187500" y="23.541992" rx="0.833333" fill="rgb(255,255,255)" />
            <rect id="矩形备份-2" width="9.479168" height="1.666667" x="12.187500" y="28.541992" rx="0.833333" fill="rgb(255,255,255)" />
          </g>
        </g>
      </g>
    </svg>
  );
}

function PptFileIcon({ width = 24, height = 24, className }: FileIconProps) {
  return (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" width={width} height={height} fill="none" className={className}>
      <rect id="ppt" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <g id="ic_normal_white_grid_pptx">
        <g id="编组-236">
          <path id="矩形备份-24" d="M25.8325 3.33496L34.5825 12.085L27.7373 12.085C26.6853 12.085 25.8325 11.2322 25.8325 10.1802L25.8325 3.33496L25.8325 3.33496Z" fill="rgb(254,201,176)" fill-rule="evenodd" />
          <path id="矩形备份-23" d="M25.9558 3.33496L25.9409 10.176C25.9386 11.228 26.7895 12.0827 27.8415 12.085L34.6867 12.085L34.6867 33.335C34.6867 35.1759 33.1943 36.6683 31.3534 36.6683L8.85335 36.6683C7.0124 36.6683 5.52002 35.1759 5.52002 33.335L5.52002 6.66829C5.52002 4.82735 7.0124 3.33496 8.85335 3.33496L25.9558 3.33496L25.9558 3.33496Z" fill="rgb(255,119,55)" fill-rule="evenodd" />
        </g>
        <g id="编组-2">
          <path id="路径-7" d="M20.5487 18.5439L16.7193 18.5439C16.4596 18.5439 16.249 18.7545 16.249 19.0143L16.249 29.8838" fill-rule="evenodd" stroke="rgb(255,255,255)" stroke-linecap="round" stroke-width="1.91840291" />
          <path id="路径" d="M16.96 24.9265L20.5947 24.9265C22.348 24.9265 23.7693 23.5051 23.7693 21.7518C23.7693 19.9985 22.348 18.5439 20.5947 18.5439" fill-rule="evenodd" stroke="rgb(255,255,255)" stroke-linecap="round" stroke-width="1.91840291" />
        </g>
      </g>
    </svg>
  );
}

function HtmlFileIcon({ width = 24, height = 24, className }: FileIconProps) {
  return (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" width={width} height={height} fill="none" className={className}>
      <defs>
        <clipPath id="clipPath_0">
          <rect width="16.666666" height="16.666666" x="11.666992" y="15.000000" fill="rgb(255,255,255)" />
        </clipPath>
      </defs>
      <rect id="html" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <g id="ic_normal_white_grid_xls">
        <path id="矩形备份-77" d="M25.8325 3.33496L34.5825 12.085L27.7373 12.085C26.6853 12.085 25.8325 11.2322 25.8325 10.1802L25.8325 3.33496L25.8325 3.33496Z" fill="rgb(138,228,225)" fill-rule="evenodd" />
        <path id="矩形备份-23" d="M25.9558 3.33496L25.9409 10.176C25.9386 11.228 26.7895 12.0827 27.8415 12.085L34.6867 12.085L34.6867 33.335C34.6867 35.1759 33.1943 36.6683 31.3534 36.6683L8.85335 36.6683C7.0124 36.6683 5.52002 35.1759 5.52002 33.335L5.52002 6.66829C5.52002 4.82735 7.0124 3.33496 8.85335 3.33496L25.9558 3.33496L25.9558 3.33496Z" fill="rgb(11,184,178)" fill-rule="evenodd" />
        <g id="ic_public_earth_net" clip-path="url(#clipPath_0)">
          <rect id="ic_public_earth_net" width="16.666666" height="16.666666" x="11.666992" y="15.000000" />
          <g id="ic_public_earth_net-地球/base/ic_public_earth_net">
            <path id="path4" d="M24.9636 19.1818C25.2745 19.1818 25.5829 19.1924 25.8885 19.2133C26.5919 20.3052 27 21.605 27 23C27 26.866 23.866 30 20 30C17.07 30 14.5605 28.1999 13.517 25.6452C15.8572 21.7715 20.108 19.1818 24.9636 19.1818ZM20 16C20.3226 16 20.6401 16.0218 20.9511 16.0641C23.1353 20.0274 23.2524 25.003 20.8248 29.2077C20.6695 29.4767 20.5063 29.7382 20.3356 29.9922C20.2243 29.9973 20.1124 30 20 30C16.134 30 13 26.866 13 23C13 19.134 16.134 16 20 16ZM20 16C23.866 16 27 19.134 27 23C27 24.6174 26.4515 26.1066 25.5303 27.2919C21.0063 27.2014 16.639 24.815 14.2115 20.6105C14.056 20.341 13.9108 20.0683 13.776 19.793C14.9394 17.5401 17.2899 16 20 16Z" fill="rgb(255,255,255)" fill-opacity="0" fill-rule="evenodd" />
            <path id="path4" d="M25.8885 19.2133C26.5919 20.3052 27 21.605 27 23C27 26.866 23.866 30 20 30C17.07 30 14.5605 28.1999 13.517 25.6452C15.8572 21.7715 20.108 19.1818 24.9636 19.1818C25.2745 19.1818 25.5829 19.1924 25.8885 19.2133ZM20 30C16.134 30 13 26.866 13 23C13 19.134 16.134 16 20 16C20.3226 16 20.6401 16.0218 20.9511 16.0641C23.1353 20.0274 23.2524 25.003 20.8248 29.2077C20.6695 29.4767 20.5063 29.7382 20.3356 29.9922C20.2243 29.9973 20.1124 30 20 30M20 16C23.866 16 27 19.134 27 23M27 23C27 24.6174 26.4515 26.1066 25.5303 27.2919C21.0063 27.2014 16.639 24.815 14.2115 20.6105C14.056 20.341 13.9108 20.0683 13.776 19.793C14.9394 17.5401 17.2899 16 20 16" fill-rule="evenodd" stroke="rgb(255,255,255)" stroke-linejoin="round" stroke-width="1.20000005" />
            <path id="path5" d="M20 30C23.866 30 27 26.866 27 23C27 19.134 23.866 16 20 16C16.134 16 13 19.134 13 23C13 26.866 16.134 30 20 30Z" fill="rgb(255,255,255)" fill-opacity="0" fill-rule="nonzero" />
            <path id="path5" d="M27 23C27 19.134 23.866 16 20 16C16.134 16 13 19.134 13 23C13 26.866 16.134 30 20 30C23.866 30 27 26.866 27 23Z" fill-rule="nonzero" stroke="rgb(255,255,255)" stroke-linejoin="round" stroke-width="1.20000005" />
          </g>
        </g>
      </g>
    </svg>
  );
}

const LOCAL_FILE_KIND_UI: Record<LocalGeneratedFileKind, LocalFileKindUiConfig> = {
  markdown: { badgeLabel: 'MD', cardTestId: 'cli-output-markdown-card', openTestId: 'cli-output-markdown-open', openFolderTestId: 'cli-output-markdown-open-folder', Icon: MarkdownFileIcon },
  docx: { badgeLabel: 'DOC', cardTestId: 'cli-output-word-card', openTestId: 'cli-output-word-open', openFolderTestId: 'cli-output-word-open-folder', Icon: WordFileIcon },
  xlsx: { badgeLabel: 'XLS', cardTestId: 'cli-output-excel-card', openTestId: 'cli-output-excel-open', openFolderTestId: 'cli-output-excel-open-folder', Icon: ExcelFileIcon },
  pdf: { badgeLabel: 'PDF', cardTestId: 'cli-output-pdf-card', openTestId: 'cli-output-pdf-open', openFolderTestId: 'cli-output-pdf-open-folder', Icon: PdfFileIcon },
  txt: { badgeLabel: 'TXT', cardTestId: 'cli-output-txt-card', openTestId: 'cli-output-txt-open', openFolderTestId: 'cli-output-txt-open-folder', Icon: TxtFileIcon },
  ppt: { badgeLabel: 'PPT', cardTestId: 'cli-output-ppt-card', openTestId: 'cli-output-ppt-open', openFolderTestId: 'cli-output-ppt-open-folder', Icon: PptFileIcon },
  html: { badgeLabel: 'HTML', cardTestId: 'cli-output-html-card', openTestId: 'cli-output-html-open', openFolderTestId: 'cli-output-html-open-folder', Icon: HtmlFileIcon },
  code: { badgeLabel: 'CODE', cardTestId: 'cli-output-code-card', openTestId: 'cli-output-code-open', openFolderTestId: 'cli-output-code-open-folder', Icon: TxtFileIcon },
  other: {
    badgeLabel: 'FILE',
    cardTestId: 'cli-output-other-card',
    openTestId: 'cli-output-other-open',
    openFolderTestId: 'cli-output-other-open-folder',
    Icon: TxtFileIcon,
  },
};

function LocalFileAttachmentCard({
  file,
  projectPath,
  status,
}: {
  file: LocalGeneratedFile;
  projectPath?: string | null;
  status: CliStatus;
}) {
  const [isOpening, setIsOpening] = useState(false);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [fileStatus, setFileStatus] = useState<FileVerificationStatus>('checking');
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [defaultProjectPath, setDefaultProjectPath] = useState<string | null>(null);
  const addToast = useToastStore((s) => s.addToast);
  const { badgeLabel, cardTestId, openTestId, openFolderTestId, Icon } = LOCAL_FILE_KIND_UI[file.kind];
  const displayName = useMemo(
    () => (file.name && file.name.trim() ? file.name.trim() : fileNameFromPath(file.path) || '未命名文件'),
    [file.name, file.path],
  );

  const resolvedPath = useMemo(
    () => resolvePresentationPath(file.path, projectPath, defaultProjectPath),
    [defaultProjectPath, file.path, projectPath],
  );
  const resolvedFileFolder = useMemo(() => (resolvedPath ? getParentDirectoryPath(resolvedPath) : null), [resolvedPath]);
  const isAbsoluteFilePath = useMemo(() => isAbsolutePresentationPath(file.path), [file.path]);
  const effectiveProjectPath = useMemo(
    () => (isAbsoluteFilePath ? null : projectPath && projectPath !== 'default' ? projectPath : defaultProjectPath),
    [defaultProjectPath, isAbsoluteFilePath, projectPath],
  );
  const needsDefaultProjectPath = !isAbsoluteFilePath && (!projectPath || projectPath === 'default');
  const canOpenFile = Boolean(resolvedPath) && (!needsDefaultProjectPath || Boolean(effectiveProjectPath));
  const canOpenFolder = Boolean(resolvedFileFolder) && (!needsDefaultProjectPath || Boolean(effectiveProjectPath));
  const supportsSystemOpen = Boolean(resolvedPath && isLocalAgentOpenableExtension(resolvedPath));
  const isOpeningAction = isOpening || isOpeningFolder;

  useEffect(() => {
    let cancelled = false;

    async function loadDefaultProjectPath(): Promise<void> {
      if (isAbsoluteFilePath) return;
      if (projectPath && projectPath !== 'default') return;

      try {
        const response = await apiFetch('/api/projects/cwd');
        if (!response.ok) {
          if (!cancelled) setFileStatus('error');
          return;
        }
        const payload = (await response.json()) as { path?: string };
        if (!cancelled && typeof payload.path === 'string' && payload.path.trim()) {
          setDefaultProjectPath(payload.path.trim());
        } else if (!cancelled) {
          setFileStatus('error');
        }
      } catch {
        if (!cancelled) {
          setDefaultProjectPath(null);
          setFileStatus('error');
        }
      }
    }

    void loadDefaultProjectPath();
    return () => {
      cancelled = true;
    };
  }, [isAbsoluteFilePath, projectPath]);

  useEffect(() => {
    let cancelled = false;

    async function loadMeta(): Promise<void> {
      if (!resolvedPath) return;
      if (needsDefaultProjectPath && !effectiveProjectPath) return;
      try {
        const response = await apiFetch('/api/projects/local-file-meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: resolvedPath, ...(effectiveProjectPath ? { projectPath: effectiveProjectPath } : {}) }),
        });
        if (!response.ok) {
          if (!cancelled) {
            if (status === 'streaming') {
              retryTimer.current = setTimeout(loadMeta, 1000);
            }
            setFileStatus(response.status === 404 ? 'not-found' : 'error');
          }
          return;
        }
        const payload = (await response.json()) as LocalGeneratedFileMeta;
        if (!cancelled && typeof payload.generatedAt === 'number') {
          setGeneratedAt(payload.generatedAt);
          setFileStatus('exists');
        }
      } catch {
        if (!cancelled) {
          setGeneratedAt(null);
          setFileStatus('error');
          if (status === 'streaming') {
            retryTimer.current = setTimeout(loadMeta, 1000);
          }
        }
      }
    }

    void loadMeta();
    return () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      cancelled = true;
    };
  }, [effectiveProjectPath, needsDefaultProjectPath, resolvedPath, status]);

  async function handleOpen(): Promise<void> {
    if (isOpening || !resolvedPath || !canOpenFile || !supportsSystemOpen) return;
    setIsOpening(true);
    try {
      const res = await apiFetch('/api/projects/open-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: resolvedPath, ...(effectiveProjectPath ? { projectPath: effectiveProjectPath } : {}) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const message =
          typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : '无法在系统中打开该文件';
        addToast({ type: 'error', title: '打开失败', message, duration: 4000 });
      }
    } finally {
      setIsOpening(false);
    }
  }

  async function handleOpenFolder(): Promise<void> {
    if (isOpeningFolder || !resolvedFileFolder || !canOpenFolder) return;
    setIsOpeningFolder(true);
    try {
      const res = await apiFetch('/api/projects/open-local-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: resolvedFileFolder, ...(effectiveProjectPath ? { projectPath: effectiveProjectPath } : {}) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const message =
          typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : '无法在文件管理器中打开该文件夹';
        addToast({ type: 'error', title: '打开文件夹失败', message, duration: 4000 });
      }
    } finally {
      setIsOpeningFolder(false);
    }
  }

  const renderLoadingState = () => (
    <div
      data-testid={`${cardTestId}-loading`}
      className="mt-2 max-w-[392px] font-sans flex items-center gap-4 rounded-xl bg-gray-50 border border-gray-200 px-5 py-4"
    >
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl">
        <LoadingSmall className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-gray-600" title={displayName}>
          {displayName}
        </div>
        <div className="mt-1 text-sm leading-4 text-gray-400">正在验证文件...</div>
      </div>
    </div>
  );

  if (resolvedPath && fileStatus === 'checking' && status === 'streaming') {
    return renderLoadingState();
  }

  return (
    <div
      data-testid={cardTestId}
      className="cli-output-doc-card mt-2 max-w-[485px] font-sans flex items-center gap-4 rounded-xl bg-[#F8F8F8] px-5 py-4"
    >
      <div
        title={badgeLabel}
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-[11px] font-semibold tracking-[0.16em]"
      >
        <Icon width={24} height={24} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[#191919]" title={displayName}>
          {displayName}
        </div>
        <div className="mt-1 break-all text-sm leading-4 text-[#808080]">
          {formatGeneratedDate(generatedAt ?? file.fallbackGeneratedAt ?? null)}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          data-testid={openFolderTestId}
          onClick={() => {
            void handleOpenFolder();
          }}
          disabled={isOpeningAction || !canOpenFolder}
          className="inline-flex items-center h-[24px] rounded-full border border-[#595959] bg-white px-4 py-0.75 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isOpeningFolder ? '打开中...' : '打开文件夹'}
        </button>
        {supportsSystemOpen ? (
          <button
            type="button"
            data-testid={openTestId}
            onClick={() => {
              void handleOpen();
            }}
            disabled={isOpeningAction || !canOpenFile}
            className="inline-flex items-center h-[24px] rounded-full border border-[#595959] bg-white px-4 py-0.75 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isOpening ? '打开中...' : '打开'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function buildSummary(events: CliEvent[], status: CliStatus): string {
  const toolCount = events.filter((e) => e.kind === 'tool_use').length;
  if (status === 'streaming') {
    return '正在执行工具调用';
  }
  return `已执行${toolCount}次工具调用`;
}

/* ── Tool row — design: [status] [wrench] [name] [detail] [result] ── */

function ToolRow({
  event,
  resultDetail,
  isActive,
  status,
  hasResultMatch,
  onUserInteract,
  accent,
}: {
  event: CliEvent;
  resultDetail?: string;
  isActive: boolean;
  status: CliStatus;
  /** F142: Whether a matching tool_result was found for this tool_use */
  hasResultMatch?: boolean;
  onUserInteract?: () => void;
  accent: string;
}) {
  const [rowExpanded, setRowExpanded] = useState(false);
  const detailToRender = resultDetail ?? event.detail;
  const hasDetail = detailToRender != null;
  const shouldRenderMarkdown = resultDetail != null;
  // F142: Only show waiting spinner while stream is active; once finalized,
  // unmatched rows should not spin forever.
  const isWaitingForResult = status === 'streaming' && event.kind === 'tool_use' && !hasResultMatch;
  const showLoading = isActive || isWaitingForResult;
  const showError =
    hasResultMatch &&
    !showLoading &&
    (isPermissionDeniedResult(resultDetail) ||
      (resultDetail &&
        (resultDetail.startsWith('[ERROR]:') ||
          resultDetail.startsWith('Error:') ||
          resultDetail.startsWith('[PERMISSION_REJECTED]'))));
  const showCheck = hasResultMatch && !showLoading && !showError;
  // Design: active = breed bg 20% + left border 2px + lighter text
  const accentLight = lighten(accent, 0.6); // ~#C084FC equivalent

  return (
    <div
      data-testid={`tool-row-${event.id}`}
      className="w-full text-left rounded text-[11px] flex flex-col gap-2"
      style={{ padding: '4px 0 4px 28px', borderRadius: 4 }}
    >
      {/* 标题行：点击切换展开/收起 */}
      <button
        type="button"
        className="w-full text-left cursor-pointer flex"
        onClick={() => {
          setRowExpanded((v) => !v);
          onUserInteract?.();
        }}
      >
        <div className="flex items-center gap-2 mr-2">
          {/* Status icon */}
          {showLoading ? (
            <LoadingSmall className="w-4 h-4 flex-shrink-0" />
          ) : showError ? (
            <ErrorIcon />
          ) : showCheck ? (
            <CheckIcon />
          ) : null}
          {/* Tool label (full) */}
          <span className="truncate" style={{ color: isActive ? 'rgb(89, 89, 89)' : 'rgb(89, 89, 89)' }}>
            <span className="font-[14px]">{event.label?.split(' ')[0]}</span>
            {event.label?.includes(' ') && (
              <span
                style={{ color: isActive ? accentLight : '#64748B', display: 'none' }}
              >{` ${event.label.split(' ').slice(1).join(' ')}`}</span>
            )}
          </span>
        </div>
        {/* Detail — hidden by default, shown on click */}
        {hasDetail && <ChevronIcon expanded={rowExpanded} />}
      </button>
      {rowExpanded && hasDetail && detailToRender && (
        <div
          className={`w-[calc(100%-24px)] mt-1 ml-6 break-words [overflow-wrap:anywhere] text-[12px] rounded-lg bg-[rgb(248_248_248)] p-[12px]${
            shouldRenderMarkdown ? '' : ' whitespace-pre-wrap'
          }`}
          style={{ color: '#64748B' }}
        >
          {shouldRenderMarkdown ? (
            <MarkdownContent content={detailToRender} disableCommandPrefix />
          ) : (
            detailToRender
          )}
        </div>
      )}
    </div>
  );
}

/* ── Collapsible tools section ── */

/** F142: Find matching tool_result for a tool_use by toolCallId.
 *  Falls back to index-based matching when toolCallId is missing. */
function findMatchingResult(toolUse: CliEvent, toolResults: CliEvent[], index: number): CliEvent | undefined {
  if (toolUse.toolCallId) {
    const matches = toolResults.filter((r) => r.toolCallId === toolUse.toolCallId);
    if (matches.length === 0) return undefined;
    return [...matches].reverse().find((r) => (r.detail ?? '').trim().length > 0) ?? matches[matches.length - 1];
  }
  return toolResults[index];
}

function ToolsSection({
  toolUses,
  toolResults,
  lastToolId,
  status,
  onUserInteract,
  accent,
}: {
  toolUses: CliEvent[];
  toolResults: CliEvent[];
  lastToolId: string | undefined;
  status: CliStatus;
  onUserInteract: () => void;
  accent: string;
}) {
  // 外层 expanded 已控制 ToolsSection 的整体显示，内层始终展开工具列表
  const [toolsExpanded, setToolsExpanded] = useState(true);
  const toolsUserInteracted = useRef(false);

  const toolSummary = `${toolUses.length} tool${toolUses.length > 1 ? 's' : ''}`;

  return (
    <div className="pt-1">
      <button
        type="button"
        data-testid="tools-section-toggle"
        className="w-full hidden items-center gap-1.5 py-1.5 text-[12px] rounded transition-colors"
        style={{ color: '#94A3B8' }}
        onClick={() => {
          toolsUserInteracted.current = true;
          setToolsExpanded((v) => !v);
          onUserInteract();
        }}
      >
        <span>{toolsExpanded ? toolSummary : `${toolSummary} (collapsed)`}</span>
        <ChevronIcon expanded={toolsExpanded} />
      </button>
      {toolsExpanded && (
        <div className="space-y-0.5">
          {toolUses.map((e, i) => {
            const result = findMatchingResult(e, toolResults, i);
            return (
              <ToolRow
                key={e.id}
                event={e}
                resultDetail={result?.detail}
                isActive={e.id === lastToolId}
                status={status}
                hasResultMatch={result != null}
                onUserInteract={onUserInteract}
                accent={accent}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main component ── */

interface CliOutputBlockProps {
  events: CliEvent[];
  status: CliStatus;
  message?: ChatMessage;
  suppressedGeneratedFileNames?: string[];
  thinkingMode?: 'debug' | 'play';
  defaultExpanded?: boolean;
  breedColor?: string;
  projectPath?: string | null;
  authorizationRequests?: AuthPendingRequest[];
  onAuthorizationRespond?: (
    requestId: string,
    granted: boolean,
    scope: RespondScope,
    reason?: string,
  ) => void | Promise<void>;
  onOpenSecurityManagement?: () => void;
}

export function CliOutputBlock({
  events,
  status,
  message,
  suppressedGeneratedFileNames,
  thinkingMode,
  defaultExpanded = false,
  breedColor,
  projectPath,
  authorizationRequests,
  onAuthorizationRespond,
  onOpenSecurityManagement,
}: CliOutputBlockProps) {
  const currentThreadId = useChatStore((state) => state.currentThreadId);
  const workspaceWorktreeId = useChatStore((state) => state.workspaceWorktreeId);
  const isExport =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('export') === 'true';
  const hasPendingAuthorization = (authorizationRequests?.length ?? 0) > 0;
  const forceExpanded = status === 'streaming' || isExport || hasPendingAuthorization;
  const [expanded, setExpanded] = useState(forceExpanded || defaultExpanded);
  const userInteracted = useRef(false);
  const hasMounted = useRef(false);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (
      prevStatusRef.current === 'streaming' &&
      status !== 'streaming' &&
      !userInteracted.current &&
      !hasPendingAuthorization
    ) {
      setExpanded(false);
    }
    prevStatusRef.current = status;
  }, [hasPendingAuthorization, status]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: expanded is intentional — dispatch on toggle
  useEffect(() => {
    if (forceExpanded) {
      setExpanded(true);
    }
  }, [forceExpanded]);

  const localGeneratedFiles = useMemo(() => {
    const hiddenNames = new Set((suppressedGeneratedFileNames ?? []).map((fileName) => fileName.toLowerCase()));
    return extractDisplayedLocalGeneratedFiles(events).filter((file) => !hiddenNames.has(file.name.toLowerCase()));
  }, [events, suppressedGeneratedFileNames]);

  const pptMarkerSpecs = useSyncCliOutputPptPreview({
    events,
    status,
    currentThreadId,
    workspaceWorktreeId,
  });

  const primaryMarkerPagesDir = useMemo(
    () => (pptMarkerSpecs.length > 0 ? pptMarkerSpecs[pptMarkerSpecs.length - 1]!.pagesDir : null),
    [pptMarkerSpecs],
  );

  const pptSessionStoreKey = useChatStore((s) =>
    primaryMarkerPagesDir ? resolvePptSessionStoreKey(s.pptStudioSessions, primaryMarkerPagesDir) : null,
  );

  const pptSessionDeckTitle = useChatStore((s) => {
    if (!primaryMarkerPagesDir) return undefined;
    const key = resolvePptSessionStoreKey(s.pptStudioSessions, primaryMarkerPagesDir);
    return s.pptStudioSessions[key]?.deckTitle;
  });

  const linkedPptFileForSession = useMemo(
    () =>
      primaryMarkerPagesDir
        ? findLocalPptLinkedToPptPages(localGeneratedFiles, primaryMarkerPagesDir, pptSessionDeckTitle)
        : undefined,
    [localGeneratedFiles, primaryMarkerPagesDir, pptSessionDeckTitle],
  );

  const localFilesForAttachmentCards = useMemo(
    () =>
      linkedPptFileForSession
        ? localGeneratedFiles.filter((f) => f.path !== linkedPptFileForSession.path)
        : localGeneratedFiles,
    [linkedPptFileForSession, localGeneratedFiles],
  );

  useLayoutEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('office-claw:chat-layout-changed'));
    }
  }, [expanded]);

  if (events.length === 0) return null;

  const summary = buildSummary(events, status);
  const toolUses = events.filter((e) => e.kind === 'tool_use');
  const toolResults = events.filter((e) => e.kind === 'tool_result');
  const textEvents = events.filter((e) => e.kind === 'text');
  const lastToolId = status === 'streaming' ? [...events].reverse().find((e) => e.kind === 'tool_use')?.id : undefined;
  const accent = breedColor || '#7C3AED';

  const bodyMarkdown = textEvents.map((e) => e.content).join('\n');

  const handleToggle = () => {
    userInteracted.current = true;
    setExpanded((v) => !v);
  };

  return (
    <div className="cli-output-container overflow-hidden">
      {/* Header — design: chevron(accent) + summary(slate-400) + paw chip */}
      {toolUses.length > 0 && (
        <button
          type="button"
          data-testid="cli-output-toggle"
          onClick={handleToggle}
          className="cli-output-button w-full flex items-center gap-2 text-[14px] transition-colors"
        >
          {status === 'streaming' && <LoadingPointStyle className="w-4 h-4 flex-shrink-0" />}
          {status === 'done' && (
            <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none">
              <mask
                id="mask_5"
                width="16.000000"
                height="16.000008"
                x="0.000000"
                y="0.000000"
                maskUnits="userSpaceOnUse"
              >
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
              <mask
                id="mask_4"
                width="16.000000"
                height="16.000000"
                x="0.000000"
                y="0.000000"
                maskUnits="userSpaceOnUse"
              >
                <g filter="url(#pixso_custom_mask_type_alpha)">
                  <g id="clip431_3420">
                    <rect
                      id="support"
                      width="16.000000"
                      height="16.000000"
                      x="0.000000"
                      y="0.000000"
                      fill="rgb(0,0,0)"
                    />
                  </g>
                </g>
              </mask>
              <defs>
                <filter id="pixso_custom_mask_type_alpha">
                  <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0 " />
                </filter>
              </defs>
              <mask
                id="mask_3"
                width="16.000000"
                height="16.000000"
                x="0.000000"
                y="0.000000"
                maskUnits="userSpaceOnUse"
              >
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
              <mask
                id="mask_2"
                width="16.000000"
                height="16.000008"
                x="0.000000"
                y="0.000000"
                maskUnits="userSpaceOnUse"
              >
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
              <mask
                id="mask_1"
                width="16.000000"
                height="16.000000"
                x="0.000000"
                y="0.000000"
                maskUnits="userSpaceOnUse"
              >
                <g filter="url(#pixso_custom_mask_type_alpha)">
                  <g id="clip431_3420">
                    <rect
                      id="support"
                      width="16.000000"
                      height="16.000000"
                      x="0.000000"
                      y="0.000000"
                      fill="rgb(0,0,0)"
                    />
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
              <mask
                id="mask_0"
                width="16.000000"
                height="16.000000"
                x="0.000000"
                y="0.000000"
                maskUnits="userSpaceOnUse"
              >
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
          <span className="text-[16px] font-bold font-sans">{summary}</span>
          <span style={{ color: 'rgb(31, 31, 31)' }}>
            <ChevronIcon expanded={expanded} />
          </span>
          <span className="ml-auto hidden items-center gap-1" style={{ color: '#64748B', fontSize: 10 }}>
            {thinkingMode === 'debug' ? (
              <>
                <PawPrint />
                <span>shared</span>
              </>
            ) : (
              <span>private</span>
            )}
          </span>
        </button>
      )}

      {/* Expanded body */}
      {expanded && (
        <div data-testid="cli-output-body">
          {toolUses.length > 0 && (
            <ToolsSection
              toolUses={toolUses}
              toolResults={toolResults}
              lastToolId={lastToolId}
              status={status}
              onUserInteract={() => {
                userInteracted.current = true;
              }}
              accent={accent}
            />
          )}
          {authorizationRequests && authorizationRequests.length > 0 && onAuthorizationRespond && (
            <div data-testid="cli-output-authorization" className="space-y-3 pt-3">
              {authorizationRequests.map((request) => (
                <AuthorizationCard
                  key={request.requestId}
                  request={request}
                  onRespond={onAuthorizationRespond}
                  onOpenSecurityManagement={onOpenSecurityManagement}
                />
              ))}
            </div>
          )}
          {textEvents.length > 0 && (
            <>
              {toolUses.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '8px 12px 4px 12px',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 10,
                      color: '#475569',
                      display: 'none',
                    }}
                  >
                    ─── stdout ───
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
      {(toolUses.length > 0 || message?.thinking) && <div className="h-0 border-t-[1px] border-[#F0F0F0] my-3" />}
      <div className="cli-output-md pb-2 text-base leading-relaxed" data-testid="cli-output-markdown">
        <div>
          <MarkdownContent content={bodyMarkdown} />
        </div>
      </div>
      {localFilesForAttachmentCards.map((file) => (
        <LocalFileAttachmentCard
          key={`${file.kind}:${file.path}`}
          file={file}
          projectPath={projectPath}
          status={status}
        />
      ))}
      {primaryMarkerPagesDir && pptSessionStoreKey != null ? (
        <PptSessionCard
          pagesDir={pptSessionStoreKey}
          projectPath={projectPath}
          status={status}
          linkedPptFile={linkedPptFileForSession}
        />
      ) : null}
    </div>
  );
}
