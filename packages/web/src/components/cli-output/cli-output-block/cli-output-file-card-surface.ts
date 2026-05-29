/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { PPT_PREVIEW_SELECTED_OUTLINE_CLASS } from '@/components/ppt-studio/ppt-preview-selection';

/** Shared layout for CLI output file preview cards (chat attachment strip). */
export const CLI_OUTPUT_FILE_CARD_LAYOUT_CLASS =
  'cli-output-doc-card mt-2 max-w-[485px] font-sans box-border flex items-center gap-4 rounded-xl bg-white px-5 py-4 transition-[border-color] duration-200';

export function cliOutputFileCardBorderClass(isPreviewSelected: boolean): string {
  return isPreviewSelected
    ? 'border border-solid border-[#2E7CF6]'
    : 'border border-solid border-gray-200 hover:border-[#BFDBFE]';
}

/** Loading placeholder card — same footprint as the final card. */
export const CLI_OUTPUT_FILE_CARD_LOADING_SURFACE_CLASS =
  'mt-2 max-w-[485px] font-sans flex items-center gap-4 rounded-xl border border-solid border-gray-200 bg-white px-5 py-4';
