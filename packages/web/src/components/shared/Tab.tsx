/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { CSSProperties, MouseEvent } from 'react';

interface TabItem {
  value: string;
  label: string;
}

interface TabProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** 激活 Tab 底部边框颜色，默认 var(--accent-primary) */
  activeBorderColor?: string;
  /** 激活 Tab 文字颜色，默认 var(--text-accent) */
  activeTextColor?: string;
}

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function Tab({ items, value, onChange, className, activeBorderColor, activeTextColor }: TabProps) {
  const handleTabClick = (event: MouseEvent<HTMLButtonElement>, tabValue: string) => {
    event.stopPropagation();
    if (tabValue !== value) {
      onChange(tabValue);
    }
  };

  const containerStyle: CSSProperties = {
    display: 'flex',
    gap: 'var(--space-7)',
    borderBottom: '1px solid var(--border-default)',
  };

  return (
    <div
      role="tablist"
      style={containerStyle}
      className={className}
    >
      {items.map((item) => {
        const isActive = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={(e) => handleTabClick(e, item.value)}
            style={{
              padding: '8px 0',
              fontSize: '14px',
              fontWeight: isActive ? 500 : 400,
              color: isActive ? (activeTextColor ?? 'var(--tab-active-color)') : 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
              borderBottom: isActive ? `2px solid ${activeBorderColor ?? 'var(--tab-active-color)'}` : '2px solid transparent',
              cursor: 'pointer',
              transition: 'color 150ms ease, border-color 150ms ease',
              marginBottom: '-1px',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
