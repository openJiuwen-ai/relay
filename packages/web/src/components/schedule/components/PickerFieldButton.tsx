/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { INPUT_BOX_CLASS } from '../utils/editor';

interface PickerFieldButtonProps {
  value: string;
  placeholder: string;
  onClick: () => void;
  testId: string;
}

export function PickerFieldButton({ value, placeholder, onClick, testId }: PickerFieldButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex w-full items-center justify-between overflow-hidden px-3 text-left outline-none before:pointer-events-none before:absolute before:right-3 before:top-1/2 before:h-5 before:w-5 before:-translate-y-1/2 before:bg-white before:content-[''] after:pointer-events-none after:absolute after:right-[18px] after:top-1/2 after:h-[7px] after:w-[7px] after:-translate-y-[62%] after:rotate-45 after:border-b-[1.6px] after:border-r-[1.6px] after:border-[#98A2B3] after:content-[''] ${INPUT_BOX_CLASS}`}
      data-testid={testId}
    >
      <span className={`min-w-0 block truncate whitespace-nowrap ${value ? 'text-[#101828]' : 'text-[#98A2B3]'}`}>
        {value || placeholder}
      </span>
      <span className="text-[#98A2B3]" aria-hidden="true" />
    </button>
  );
}
