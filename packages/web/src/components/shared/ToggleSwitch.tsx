/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

"use client";

interface ToggleSwitchProps {
  checked: boolean;
  onToggle: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  testId?: string;
}

export function ToggleSwitch({
  checked,
  onToggle,
  ariaLabel,
  disabled = false,
  testId,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onToggle(!checked)}
      className={[
        "relative inline-flex h-[20px] w-[40px] shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        checked
          ? "bg-[var(--switch-on-bg)]"
          : "bg-[var(--switch-off-bg)]",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-[16px] w-[16px] rounded-full bg-[var(--modal-switch-thumb)] shadow-sm transition-transform duration-200",
          checked ? "translate-x-[22px]" : "translate-x-[2px]",
        ].join(" ")}
      />
    </button>
  );
}
