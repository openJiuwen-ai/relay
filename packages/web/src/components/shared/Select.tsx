/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange' | 'children'>;

interface SelectProps<T extends string = string> extends NativeButtonProps {
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T, option: SelectOption<T>) => void;
  placeholder?: string;
  popupClassName?: string;
}

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function SelectArrow({ open }: { open: boolean }) {
  return (
    <svg
      className={joinClasses('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getNextEnabledIndex<T extends string>(
  options: Array<SelectOption<T>>,
  startIndex: number,
  direction: 1 | -1,
) {
  if (options.length === 0) return -1;

  let index = startIndex;
  for (let checked = 0; checked < options.length; checked += 1) {
    index = (index + direction + options.length) % options.length;
    if (!options[index]?.disabled) {
      return index;
    }
  }

  return -1;
}

export function Select<T extends string = string>({
  value,
  options,
  onChange,
  placeholder = '请选择',
  popupClassName,
  className,
  disabled = false,
  id,
  ...buttonProps
}: SelectProps<T>) {
  const reactId = useId();
  const selectId = id ?? `select-${reactId}`;
  const listboxId = `${selectId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const getInitialActiveIndex = () => {
    if (selectedIndex >= 0 && !options[selectedIndex]?.disabled) return selectedIndex;
    return getNextEnabledIndex(options, -1, 1);
  };

  const openPopup = () => {
    if (disabled || options.length === 0) return;
    setOpen(true);
    setActiveIndex(getInitialActiveIndex());
  };

  const closePopup = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const selectOption = (option: SelectOption<T>) => {
    if (option.disabled) return;
    onChange(option.value, option);
    closePopup();
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) {
        return;
      }
      closePopup();
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (!open) {
          openPopup();
          return;
        }
        setActiveIndex((current) => getNextEnabledIndex(options, current, 1));
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (!open) {
          openPopup();
          return;
        }
        setActiveIndex((current) => getNextEnabledIndex(options, current, -1));
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (!open) {
          openPopup();
          return;
        }
        const activeOption = options[activeIndex];
        if (activeOption) {
          selectOption(activeOption);
        }
        break;
      }
      case 'Escape':
        if (open) {
          event.preventDefault();
          closePopup();
        }
        break;
      case 'Tab':
        closePopup();
        break;
    }
  };

  const triggerRect = triggerRef.current?.getBoundingClientRect();
  const popupStyle: CSSProperties = triggerRect
    ? {
        top: triggerRect.bottom + 4,
        left: triggerRect.left,
        minWidth: triggerRect.width,
      }
    : {};

  const popup = open ? (
    <div
      ref={popupRef}
      id={listboxId}
      role="listbox"
      data-testid="select-popup"
      className={joinClasses(
        'fixed z-[9999] overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-card)] py-1 shadow-[0_2px_12px_rgba(0,0,0,0.16)]',
        popupClassName,
      )}
      style={popupStyle}
    >
      {options.map((option, index) => {
        const isSelected = option.value === value;
        const isActive = index === activeIndex;
        const optionId = `${listboxId}-option-${option.value}`;

        return (
          <button
            key={option.value}
            id={optionId}
            type="button"
            role="option"
            aria-selected={isSelected}
            disabled={option.disabled}
            className={joinClasses(
              'flex min-h-8 w-full items-center bg-[var(--surface-card)] px-3 text-left text-sm transition-colors',
              isSelected ? 'text-[#1476FF]' : 'text-[var(--text-primary)]',
              isActive && !isSelected ? 'bg-[#F5F5F5]' : '',
              option.disabled ? 'cursor-not-allowed opacity-40' : '',
              !option.disabled && !isSelected ? 'cursor-pointer hover:bg-[#F5F5F5]' : '',
              !option.disabled && isSelected ? 'cursor-pointer' : '',
            )}
            onMouseEnter={() => {
              if (!option.disabled) setActiveIndex(index);
            }}
            onClick={() => selectOption(option)}
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      <button
        {...buttonProps}
        ref={triggerRef}
        id={selectId}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${options[activeIndex]?.value}` : undefined}
        disabled={disabled}
        className={joinClasses(
          'ui-input inline-flex h-8 items-center justify-between gap-2 px-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40',
          open && 'border-[var(--input-border-active)]',
          className,
        )}
        onClick={() => {
          if (open) {
            closePopup();
          } else {
            openPopup();
          }
        }}
        onKeyDown={handleKeyDown}
      >
        <span className={joinClasses('min-w-0 flex-1 truncate', !selectedOption && 'text-[var(--text-field-placeholder)]')}>
          {selectedOption?.label ?? placeholder}
        </span>
        <SelectArrow open={open} />
      </button>
      {open && createPortal(popup, document.body)}
    </>
  );
}
