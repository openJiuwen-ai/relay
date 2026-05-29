/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type ReactNode, useMemo } from 'react';
import { PreviewPanelFolderOpenIcon } from '@/components/file-browser-panel/file-browser-folder-icons';
import { Dropdown } from '@/components/shared/Dropdown';

function MenuIcon({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt="" aria-hidden className="size-4 shrink-0" />;
}

export interface CliOutputFileCardActionsMenuProps {
  menuTriggerTestId?: string;
  openTestId: string;
  openFolderTestId: string;
  supportsSystemOpen: boolean;
  canOpenFile: boolean;
  canOpenFolder: boolean;
  isOpening: boolean;
  isOpeningFolder: boolean;
  isOpeningAction: boolean;
  onOpenDefault: () => void;
  onOpenFolder: () => void;
  onViewAllFiles: () => void;
}

export function CliOutputFileCardActionsMenu({
  menuTriggerTestId,
  openTestId,
  openFolderTestId,
  supportsSystemOpen,
  canOpenFile,
  canOpenFolder,
  isOpening,
  isOpeningFolder,
  isOpeningAction,
  onOpenDefault,
  onOpenFolder,
  onViewAllFiles,
}: CliOutputFileCardActionsMenuProps) {
  const options = useMemo(() => {
    const items: {
      label: string;
      onClick: () => void;
      disabled?: boolean;
      icon?: ReactNode;
      testId?: string;
    }[] = [];

    if (supportsSystemOpen) {
      items.push({
        label: isOpening ? '打开中…' : '默认应用打开',
        testId: openTestId,
        disabled: isOpeningAction || !canOpenFile,
        icon: <img src="/images/file-browser-tree/public-file.svg" alt="" aria-hidden className="size-4 shrink-0" />,
        onClick: onOpenDefault,
      });
    }

    items.push({
      label: isOpeningFolder ? '打开中…' : '在文件夹中显示',
      testId: openFolderTestId,
      disabled: isOpeningAction || !canOpenFolder,
      icon: <span className="flex size-4 items-center justify-center text-[#8C8C8C]"><PreviewPanelFolderOpenIcon width={16} height={16} /></span>,
      onClick: onOpenFolder,
    });

    items.push({
      label: '查看此任务所有文件',
      testId: 'cli-output-file-card-view-all',
      icon: (
        <span className="flex size-4 items-center justify-center text-[#8C8C8C]">
          <svg viewBox="0 0 14.4 14.4"  width="14.400024" height="14.399994" fill="none">
            <rect id="ic_public_collecting_files" width="14.400001" height="14.400001" x="0.000000" y="0.000000" />
            <path id="path1" d="M-9.44e-06 7.19401C-9.44e-06 6.06901 -0.00300944 4.94401 -9.44e-06 3.81901C-0.00300944 3.27301 0.0659906 2.73001 0.197991 2.20501C0.494991 1.08901 1.22099 0.426006 2.33699 0.168006C2.89499 0.0480059 3.46799 -0.0089941 4.03799 5.90092e-06C6.19499 5.90092e-06 8.35199 5.90092e-06 10.512 5.90092e-06C11.055 -0.0029941 11.598 0.0570059 12.129 0.186006C13.278 0.465006 13.968 1.19401 14.229 2.34001C14.349 2.88001 14.403 3.43201 14.397 3.98701C14.397 6.16801 14.397 8.34901 14.397 10.527C14.4 11.067 14.34 11.607 14.214 12.132C13.932 13.281 13.2 13.965 12.057 14.229C11.496 14.349 10.926 14.406 10.353 14.397C8.20499 14.397 6.05699 14.397 3.90899 14.397C3.35999 14.403 2.81399 14.34 2.27999 14.214C1.12499 13.935 0.431991 13.203 0.170991 12.051C0.0359906 11.466 -9.44e-06 10.881 -9.44e-06 10.29C-9.44e-06 9.25801 -9.44e-06 8.22601 -9.44e-06 7.19401Z" fill="rgb(255,255,255)" fill-opacity="0" fillRule="evenodd" />
            <circle id="path2" cx="7.20000029" cy="7.20000029" r="7.20000029" fill="rgb(255,255,255)" fill-opacity="0" />
            <path id="path3" d="M12.7499 8.25002L12.7499 2.85002C12.7499 1.85402 11.9429 1.05002 10.9499 1.05002L3.4499 1.05002C2.4539 1.05002 1.6499 1.85402 1.6499 2.85002L1.6499 8.25002" fillRule="nonzero" stroke="rgb(25,25,25)" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.900000036" />
            <path id="path4" d="M13.65 8.25L13.65 11.55C13.65 12.543 12.843 13.35 11.85 13.35L2.55 13.35C1.554 13.35 0.75 12.543 0.75 11.55L0.75 8.25L5.4 8.25C5.4 9.243 6.204 10.05 7.2 10.05C8.193 10.05 9 9.243 9 8.25L13.65 8.25Z" fillRule="nonzero" stroke="rgb(25,25,25)" stroke-linejoin="round" stroke-width="0.900000036" />
            <path id="路径 21" d="M4.04993 5.85001L7.64993 5.85001" stroke="rgb(25,25,25)" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.900000036" />
            <path id="路径 21" d="M4.04993 3.45001L10.3499 3.45001" stroke="rgb(25,25,25)" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.900000036" />
            <path id="减去顶层" d="M5.03146 8.70001L0.599976 8.70001L0.599976 11.55C0.599976 12.7927 1.60735 13.8 2.84998 13.8L11.55 13.8C12.7926 13.8 13.8 12.7927 13.8 11.55L13.8 8.70001L9.36724 8.70001C9.17706 9.72436 8.2788 10.5 7.19935 10.5C6.11992 10.5 5.22163 9.72436 5.03146 8.70001Z" fill="rgb(255,255,255)" fill-opacity="0" fillRule="evenodd" />
            <path id="减去顶层" d="M10.95 0.600006L3.44995 0.600006C2.20718 0.600006 1.19995 1.60738 1.19995 2.85001L1.19995 7.80001L5.39995 7.80001C5.54995 7.80001 5.66245 7.83751 5.73745 7.91251C5.81245 7.98751 5.84995 8.10001 5.84995 8.25001C5.84995 8.35117 5.86073 8.44992 5.88229 8.54626L5.88229 8.54629C5.88263 8.54787 5.88298 8.54945 5.88334 8.55103C5.90074 8.62711 5.92495 8.70172 5.956 8.77486C6.02428 8.93629 6.12094 9.07939 6.24574 9.20422C6.37057 9.32902 6.51382 9.42568 6.67525 9.49411C6.74818 9.52501 6.82291 9.54919 6.89908 9.56647C6.99664 9.58888 7.09711 9.60001 7.19995 9.60001C7.30288 9.60001 7.40317 9.58882 7.50082 9.56647C7.57699 9.54919 7.65172 9.52501 7.72465 9.49411C7.88608 9.42568 8.02933 9.32902 8.15416 9.20422C8.27896 9.07939 8.37562 8.93629 8.4439 8.77486C8.47495 8.70178 8.49898 8.6272 8.51656 8.55103C8.51692 8.54945 8.51727 8.54787 8.51761 8.54629L8.51761 8.54626C8.53917 8.44992 8.54995 8.35117 8.54995 8.25001C8.54995 8.10001 8.58745 7.98751 8.66245 7.91251C8.73745 7.83751 8.84995 7.80001 8.99995 7.80001L13.2 7.80001L13.2 2.85001C13.2 1.60738 12.1927 0.600006 10.95 0.600006ZM10.95 2.70001L3.44995 2.70001C3.19795 2.70001 2.99995 2.89801 2.99995 3.15001C2.99995 3.40201 3.19795 3.60001 3.44995 3.60001L10.95 3.60001C11.202 3.60001 11.4 3.40201 11.4 3.15001C11.4 2.89801 11.202 2.70001 10.95 2.70001ZM3.44995 5.10001L7.64995 5.10001C7.90195 5.10001 8.09995 5.29801 8.09995 5.55001C8.09995 5.80201 7.90195 6.00001 7.64995 6.00001L3.44995 6.00001C3.19795 6.00001 2.99995 5.80201 2.99995 5.55001C2.99995 5.29801 3.19795 5.10001 3.44995 5.10001Z" fill="rgb(255,255,255)" fill-opacity="0" fillRule="evenodd" />
          </svg>
        </span>
      ),
      onClick: onViewAllFiles,
    });

    return items;
  }, [
    canOpenFile,
    canOpenFolder,
    isOpening,
    isOpeningAction,
    isOpeningFolder,
    onOpenDefault,
    onOpenFolder,
    onViewAllFiles,
    openFolderTestId,
    openTestId,
    supportsSystemOpen,
  ]);

  return (
    <Dropdown
      align="right"
      menuWidth={216}
      menuItemClassName="flex h-8 w-full items-center gap-2 px-3 text-left text-sm text-[#191919] transition-colors hover:bg-[#F5F5F7] disabled:cursor-not-allowed disabled:opacity-40"
      trigger={
        <button
          type="button"
          data-testid={menuTriggerTestId}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-transparent text-[#191919] transition-colors hover:bg-[#F5F5F7]"
          aria-label="更多操作"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="4" cy="8" r="1.25" />
            <circle cx="8" cy="8" r="1.25" />
            <circle cx="12" cy="8" r="1.25" />
          </svg>
        </button>
      }
      options={options}
    />
  );
}
