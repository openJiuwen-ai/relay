/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { ComponentType } from 'react';
import type { LocalGeneratedFileKind } from '../local-generated-files';

export interface FileIconProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

export interface LocalFileKindUiConfig {
  badgeLabel: string;
  cardTestId: string;
  openTestId: string;
  openFolderTestId: string;
  Icon: ComponentType<FileIconProps>;
}

function MarkdownFileIcon({ width = 24, height = 24, className }: FileIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      fill="none"
      className={className}
    >
      <rect id="MD" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <g id="ic_normal_white_grid_pptx">
        <g id="编组-236">
          <path
            id="矩形备份-24"
            d="M25.8325 3.33496L34.5825 12.085L27.7373 12.085C26.6853 12.085 25.8325 11.2322 25.8325 10.1802L25.8325 3.33496L25.8325 3.33496Z"
            fill="rgb(199,201,254)"
            fillRule="evenodd"
          />
          <path
            id="矩形备份-23"
            d="M25.9558 3.33496L25.9409 10.176C25.9386 11.228 26.7895 12.0827 27.8415 12.085L34.6867 12.085L34.6867 33.335C34.6867 35.1759 33.1943 36.6683 31.3534 36.6683L8.85335 36.6683C7.0124 36.6683 5.52002 35.1759 5.52002 33.335L5.52002 6.66829C5.52002 4.82735 7.0124 3.33496 8.85335 3.33496L25.9558 3.33496L25.9558 3.33496Z"
            fill="rgb(116,121,244)"
            fillRule="evenodd"
          />
        </g>
      </g>
      <path
        id="矢量 111"
        d="M11.1118 28.3333L11.1118 20L15.2785 26.6667L19.4451 20L19.4451 28.3333"
        stroke="rgb(255,255,255)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.31428576"
      />
      <path
        id="矢量 112"
        d="M22.7783 28.3333C24.0712 28.3333 24.3044 28.3333 25.2783 28.3333C28.6114 28.3334 29.4454 26.0067 29.445 23.9521C29.4446 21.8975 28.6115 19.9996 25.2783 20C21.9452 20.0004 23.7158 20 22.7783 20L22.7783 28.3333Z"
        stroke="rgb(255,255,255)"
        strokeLinejoin="round"
        strokeWidth="1.31428576"
      />
    </svg>
  );
}

function WordFileIcon({ width = 24, height = 24, className }: FileIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      fill="none"
      className={className}
    >
      <rect id="word" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <g id="ic_normal_white_grid_doc">
        <path
          id="矩形备份-6"
          d="M33.4961 11.251L34.3294 11.251L34.3294 12.0843L33.4961 12.0843L33.4961 11.251Z"
          fill="rgb(255,255,255)"
          fillRule="evenodd"
        />
        <path
          id="矩形备份-23"
          d="M25.9558 3.33496L25.9409 10.176C25.9386 11.228 26.7895 12.0827 27.8415 12.085L34.6867 12.085L34.6867 33.335C34.6867 35.1759 33.1943 36.6683 31.3534 36.6683L8.85335 36.6683C7.0124 36.6683 5.52002 35.1759 5.52002 33.335L5.52002 6.66829C5.52002 4.82735 7.0124 3.33496 8.85335 3.33496L25.9558 3.33496L25.9558 3.33496Z"
          fill="rgb(59,140,250)"
          fillRule="evenodd"
        />
        <path
          id="矩形备份-24"
          d="M25.8325 3.33496L34.5825 12.085L27.7373 12.085C26.6853 12.085 25.8325 11.2322 25.8325 10.1802L25.8325 3.33496L25.8325 3.33496Z"
          fill="rgb(173,205,249)"
          fillRule="evenodd"
        />
        <path
          id="路径-4"
          d="M14.791 20.001L16.9162 28.4886C16.965 28.6837 17.239 28.6927 17.3006 28.5013L19.8444 20.5938C19.904 20.4087 20.1659 20.4088 20.2253 20.594L22.7574 28.4917C22.819 28.684 23.0944 28.6742 23.1422 28.478L25.2077 20.001"
          fillRule="evenodd"
          stroke="rgb(255,255,255)"
          strokeLinecap="round"
          strokeWidth="1.80555582"
        />
      </g>
    </svg>
  );
}

function ExcelFileIcon({ width = 24, height = 24, className }: FileIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      fill="none"
      className={className}
    >
      <rect id="excel" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <g id="ic_normal_white_grid_xls">
        <path
          id="矩形备份-77"
          d="M25.8325 3.33496L34.5825 12.085L27.7373 12.085C26.6853 12.085 25.8325 11.2322 25.8325 10.1802L25.8325 3.33496L25.8325 3.33496Z"
          fill="rgb(126,237,193)"
          fillRule="evenodd"
        />
        <path
          id="矩形备份-23"
          d="M25.9558 3.33496L25.9409 10.176C25.9386 11.228 26.7895 12.0827 27.8415 12.085L34.6867 12.085L34.6867 33.335C34.6867 35.1759 33.1943 36.6683 31.3534 36.6683L8.85335 36.6683C7.0124 36.6683 5.52002 35.1759 5.52002 33.335L5.52002 6.66829C5.52002 4.82735 7.0124 3.33496 8.85335 3.33496L25.9558 3.33496L25.9558 3.33496Z"
          fill="rgb(6,187,115)"
          fillRule="evenodd"
        />
        <g id="编组-3">
          <g id="编组-2">
            <path
              id="路径-5"
              d="M0 0L12.2267 0"
              stroke="rgb(255,255,255)"
              strokeLinecap="round"
              strokeWidth="1.80555582"
              transform="matrix(0.573677,0.819082,-0.819082,0.573677,16.4517,18.4229)"
            />
            <path
              id="路径-5"
              d="M0 0L12.2267 0"
              stroke="rgb(255,255,255)"
              strokeLinecap="round"
              strokeWidth="1.80555582"
              transform="matrix(-0.573677,0.819082,-0.819082,-0.573677,23.6001,18.4746)"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}

function PdfFileIcon({ width = 24, height = 24, className }: FileIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      fill="none"
      className={className}
    >
      <rect id="pdf" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <g id="ic_normal_white_grid_pdf">
        <path
          id="矩形备份-47"
          d="M25.8325 3.33496L34.5825 12.085L27.7373 12.085C26.6853 12.085 25.8325 11.2322 25.8325 10.1802L25.8325 3.33496L25.8325 3.33496Z"
          fill="rgb(255,191,190)"
          fillRule="evenodd"
        />
        <path
          id="矩形备份-23"
          d="M25.9558 3.33496L25.9409 10.176C25.9386 11.228 26.7895 12.0827 27.8415 12.085L34.6867 12.085L34.6867 33.335C34.6867 35.1759 33.1943 36.6683 31.3534 36.6683L8.85335 36.6683C7.0124 36.6683 5.52002 35.1759 5.52002 33.335L5.52002 6.66829C5.52002 4.82735 7.0124 3.33496 8.85335 3.33496L25.9558 3.33496L25.9558 3.33496Z"
          fill="rgb(255,76,72)"
          fillRule="evenodd"
        />
        <g id="编组">
          <path
            id="多边形"
            d="M23.343 27.6338L16.7632 27.6338L20.0531 21.9355L23.343 27.6338Z"
            fillRule="evenodd"
            stroke="rgb(255,255,255)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.35416675"
          />
          <path
            id="路径"
            d="M20.1496 21.4246C20.962 20.4724 21.3683 19.7558 21.3683 19.2749C21.3683 18.5255 20.7795 17.918 20.0533 17.918C19.327 17.918 18.7383 18.5255 18.7383 19.2749C18.7383 19.7557 19.1442 20.4718 19.956 21.4235"
            fillRule="evenodd"
            stroke="rgb(255,255,255)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.35416675"
          />
          <path
            id="路径备份"
            d="M1.41132 3.50664C2.22376 2.55445 2.62998 1.83788 2.62998 1.35692C2.62998 0.607515 2.04124 0 1.31499 0C0.588741 0 0 0.607515 0 1.35692C0 1.83769 0.405893 2.55388 1.21768 3.50549"
            fillRule="evenodd"
            stroke="rgb(255,255,255)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.35416675"
            transform="matrix(-0.5,0.866025,-0.866025,-0.5,27.4893,28.4678)"
          />
          <path
            id="路径备份-2"
            d="M1.41132 3.50664C2.22376 2.55445 2.62998 1.83788 2.62998 1.35692C2.62998 0.607515 2.04124 0 1.31499 0C0.588741 0 0 0.607515 0 1.35692C0 1.83769 0.405893 2.55388 1.21768 3.50549"
            fillRule="evenodd"
            stroke="rgb(255,255,255)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.35416675"
            transform="matrix(-0.5,-0.866025,0.866025,-0.5,13.9326,30.7461)"
          />
        </g>
      </g>
    </svg>
  );
}

function TxtFileIcon({ width = 24, height = 24, className }: FileIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      fill="none"
      className={className}
    >
      <rect id="text" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <g id="编组-89">
        <rect id="矩形" width="33.333332" height="33.333336" x="3.333496" y="3.333984" />
        <g id="ic_normal_white_grid_documents">
          <path
            id="矩形备份-81"
            d="M25.8335 3.33398L34.5835 12.084L27.7383 12.084C26.6863 12.084 25.8335 11.2312 25.8335 10.1792L25.8335 3.33398L25.8335 3.33398Z"
            fill="rgb(199,201,254)"
            fillRule="evenodd"
          />
          <path
            id="矩形备份-23"
            d="M25.9568 3.33398L25.9418 10.1751C25.9395 11.227 26.7905 12.0817 27.8424 12.084L34.6877 12.084L34.6877 33.334C34.6877 35.1749 33.1953 36.6673 31.3543 36.6673L8.85433 36.6673C7.01338 36.6673 5.521 35.1749 5.521 33.334L5.521 6.66732C5.521 4.82637 7.01338 3.33398 8.85433 3.33398L25.9568 3.33398L25.9568 3.33398Z"
            fill="rgb(116,121,244)"
            fillRule="evenodd"
          />
          <g id="编组-249">
            <rect
              id="矩形"
              width="15.625000"
              height="1.666667"
              x="12.187500"
              y="18.541992"
              rx="0.833333"
              fill="rgb(255,255,255)"
            />
            <rect
              id="矩形备份"
              width="15.625000"
              height="1.666667"
              x="12.187500"
              y="23.541992"
              rx="0.833333"
              fill="rgb(255,255,255)"
            />
            <rect
              id="矩形备份-2"
              width="9.479168"
              height="1.666667"
              x="12.187500"
              y="28.541992"
              rx="0.833333"
              fill="rgb(255,255,255)"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}

function PptFileIcon({ width = 24, height = 24, className }: FileIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      fill="none"
      className={className}
    >
      <rect id="ppt" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <g id="ic_normal_white_grid_pptx">
        <g id="编组-236">
          <path
            id="矩形备份-24"
            d="M25.8325 3.33496L34.5825 12.085L27.7373 12.085C26.6853 12.085 25.8325 11.2322 25.8325 10.1802L25.8325 3.33496L25.8325 3.33496Z"
            fill="rgb(254,201,176)"
            fillRule="evenodd"
          />
          <path
            id="矩形备份-23"
            d="M25.9558 3.33496L25.9409 10.176C25.9386 11.228 26.7895 12.0827 27.8415 12.085L34.6867 12.085L34.6867 33.335C34.6867 35.1759 33.1943 36.6683 31.3534 36.6683L8.85335 36.6683C7.0124 36.6683 5.52002 35.1759 5.52002 33.335L5.52002 6.66829C5.52002 4.82735 7.0124 3.33496 8.85335 3.33496L25.9558 3.33496L25.9558 3.33496Z"
            fill="rgb(255,119,55)"
            fillRule="evenodd"
          />
        </g>
        <g id="编组-2">
          <path
            id="路径-7"
            d="M20.5487 18.5439L16.7193 18.5439C16.4596 18.5439 16.249 18.7545 16.249 19.0143L16.249 29.8838"
            fillRule="evenodd"
            stroke="rgb(255,255,255)"
            strokeLinecap="round"
            strokeWidth="1.91840291"
          />
          <path
            id="路径"
            d="M16.96 24.9265L20.5947 24.9265C22.348 24.9265 23.7693 23.5051 23.7693 21.7518C23.7693 19.9985 22.348 18.5439 20.5947 18.5439"
            fillRule="evenodd"
            stroke="rgb(255,255,255)"
            strokeLinecap="round"
            strokeWidth="1.91840291"
          />
        </g>
      </g>
    </svg>
  );
}

function HtmlFileIcon({ width = 24, height = 24, className }: FileIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      fill="none"
      className={className}
    >
      <defs>
        <clipPath id="clipPath_0">
          <rect width="16.666666" height="16.666666" x="11.666992" y="15.000000" fill="rgb(255,255,255)" />
        </clipPath>
      </defs>
      <rect id="html" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <rect id="矩形" width="40.000000" height="40.000000" x="0.000000" y="0.000000" />
      <g id="ic_normal_white_grid_xls">
        <path
          id="矩形备份-77"
          d="M25.8325 3.33496L34.5825 12.085L27.7373 12.085C26.6853 12.085 25.8325 11.2322 25.8325 10.1802L25.8325 3.33496L25.8325 3.33496Z"
          fill="rgb(138,228,225)"
          fillRule="evenodd"
        />
        <path
          id="矩形备份-23"
          d="M25.9558 3.33496L25.9409 10.176C25.9386 11.228 26.7895 12.0827 27.8415 12.085L34.6867 12.085L34.6867 33.335C34.6867 35.1759 33.1943 36.6683 31.3534 36.6683L8.85335 36.6683C7.0124 36.6683 5.52002 35.1759 5.52002 33.335L5.52002 6.66829C5.52002 4.82735 7.0124 3.33496 8.85335 3.33496L25.9558 3.33496L25.9558 3.33496Z"
          fill="rgb(11,184,178)"
          fillRule="evenodd"
        />
        <g id="ic_public_earth_net" clipPath="url(#clipPath_0)">
          <rect id="ic_public_earth_net" width="16.666666" height="16.666666" x="11.666992" y="15.000000" />
          <g id="ic_public_earth_net-地球/base/ic_public_earth_net">
            <path
              id="path4"
              d="M24.9636 19.1818C25.2745 19.1818 25.5829 19.1924 25.8885 19.2133C26.5919 20.3052 27 21.605 27 23C27 26.866 23.866 30 20 30C17.07 30 14.5605 28.1999 13.517 25.6452C15.8572 21.7715 20.108 19.1818 24.9636 19.1818ZM20 16C20.3226 16 20.6401 16.0218 20.9511 16.0641C23.1353 20.0274 23.2524 25.003 20.8248 29.2077C20.6695 29.4767 20.5063 29.7382 20.3356 29.9922C20.2243 29.9973 20.1124 30 20 30C16.134 30 13 26.866 13 23C13 19.134 16.134 16 20 16ZM20 16C23.866 16 27 19.134 27 23C27 24.6174 26.4515 26.1066 25.5303 27.2919C21.0063 27.2014 16.639 24.815 14.2115 20.6105C14.056 20.341 13.9108 20.0683 13.776 19.793C14.9394 17.5401 17.2899 16 20 16Z"
              fill="rgb(255,255,255)"
              fillOpacity="0"
              fillRule="evenodd"
            />
            <path
              id="path4"
              d="M25.8885 19.2133C26.5919 20.3052 27 21.605 27 23C27 26.866 23.866 30 20 30C17.07 30 14.5605 28.1999 13.517 25.6452C15.8572 21.7715 20.108 19.1818 24.9636 19.1818C25.2745 19.1818 25.5829 19.1924 25.8885 19.2133ZM20 30C16.134 30 13 26.866 13 23C13 19.134 16.134 16 20 16C20.3226 16 20.6401 16.0218 20.9511 16.0641C23.1353 20.0274 23.2524 25.003 20.8248 29.2077C20.6695 29.4767 20.5063 29.7382 20.3356 29.9922C20.2243 29.9973 20.1124 30 20 30M20 16C23.866 16 27 19.134 27 23M27 23C27 24.6174 26.4515 26.1066 25.5303 27.2919C21.0063 27.2014 16.639 24.815 14.2115 20.6105C14.056 20.341 13.9108 20.0683 13.776 19.793C14.9394 17.5401 17.2899 16 20 16"
              fillRule="evenodd"
              stroke="rgb(255,255,255)"
              strokeLinejoin="round"
              strokeWidth="1.20000005"
            />
            <path
              id="path5"
              d="M20 30C23.866 30 27 26.866 27 23C27 19.134 23.866 16 20 16C16.134 16 13 19.134 13 23C13 26.866 16.134 30 20 30Z"
              fill="rgb(255,255,255)"
              fillOpacity="0"
              fillRule="nonzero"
            />
            <path
              id="path5"
              d="M27 23C27 19.134 23.866 16 20 16C16.134 16 13 19.134 13 23C13 26.866 16.134 30 20 30C23.866 30 27 26.866 27 23Z"
              fillRule="nonzero"
              stroke="rgb(255,255,255)"
              strokeLinejoin="round"
              strokeWidth="1.20000005"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}

export const LOCAL_FILE_KIND_UI: Record<LocalGeneratedFileKind, LocalFileKindUiConfig> = {
  markdown: {
    badgeLabel: 'MD',
    cardTestId: 'cli-output-markdown-card',
    openTestId: 'cli-output-markdown-open',
    openFolderTestId: 'cli-output-markdown-open-folder',
    Icon: MarkdownFileIcon,
  },
  docx: {
    badgeLabel: 'DOC',
    cardTestId: 'cli-output-word-card',
    openTestId: 'cli-output-word-open',
    openFolderTestId: 'cli-output-word-open-folder',
    Icon: WordFileIcon,
  },
  xlsx: {
    badgeLabel: 'XLS',
    cardTestId: 'cli-output-excel-card',
    openTestId: 'cli-output-excel-open',
    openFolderTestId: 'cli-output-excel-open-folder',
    Icon: ExcelFileIcon,
  },
  pdf: {
    badgeLabel: 'PDF',
    cardTestId: 'cli-output-pdf-card',
    openTestId: 'cli-output-pdf-open',
    openFolderTestId: 'cli-output-pdf-open-folder',
    Icon: PdfFileIcon,
  },
  txt: {
    badgeLabel: 'TXT',
    cardTestId: 'cli-output-txt-card',
    openTestId: 'cli-output-txt-open',
    openFolderTestId: 'cli-output-txt-open-folder',
    Icon: TxtFileIcon,
  },
  ppt: {
    badgeLabel: 'PPT',
    cardTestId: 'cli-output-ppt-card',
    openTestId: 'cli-output-ppt-open',
    openFolderTestId: 'cli-output-ppt-open-folder',
    Icon: PptFileIcon,
  },
  html: {
    badgeLabel: 'HTML',
    cardTestId: 'cli-output-html-card',
    openTestId: 'cli-output-html-open',
    openFolderTestId: 'cli-output-html-open-folder',
    Icon: HtmlFileIcon,
  },
  code: {
    badgeLabel: 'CODE',
    cardTestId: 'cli-output-code-card',
    openTestId: 'cli-output-code-open',
    openFolderTestId: 'cli-output-code-open-folder',
    Icon: TxtFileIcon,
  },
  other: {
    badgeLabel: 'FILE',
    cardTestId: 'cli-output-other-card',
    openTestId: 'cli-output-other-open',
    openFolderTestId: 'cli-output-other-open-folder',
    Icon: TxtFileIcon,
  },
};
