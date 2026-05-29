/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DropdownOption {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  /** Applied to the menu item button for tests and automation. */
  testId?: string;
  type?: 'divider';
  children?: DropdownOption[];
}

interface DropdownProps {
  trigger: React.ReactNode;
  options: DropdownOption[];
  align?: 'left' | 'right';
  /** 自定义容器样式 */
  containerClassName?: string;
  /** 自定义菜单样式 */
  menuClassName?: string;
  /** 菜单宽度 */
  menuWidth?: number;
  /** 自定义菜单项样式 */
  menuItemClassName?: string;
}

export function Dropdown({ trigger, options, align = 'right', menuClassName, menuWidth, menuItemClassName }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [activeSubMenu, setActiveSubMenu] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const navigableOptions = options.filter((opt) => opt.type !== 'divider' && !opt.disabled);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setFocusedIndex(-1);
        setActiveSubMenu(null);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleOptionClick = (option: DropdownOption, index: number) => {
    if (option.disabled) return;
    if (option.children && option.children.length > 0) {
      setActiveSubMenu(activeSubMenu === index ? null : index);
      return;
    }
    option.onClick();
    setIsOpen(false);
    setFocusedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        setFocusedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        setIsOpen(false);
        setFocusedIndex(-1);
        setActiveSubMenu(null);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => (prev < navigableOptions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : navigableOptions.length - 1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < navigableOptions.length) {
          const option = navigableOptions[focusedIndex];
          if (option.children && option.children.length > 0) {
            setActiveSubMenu(activeSubMenu === focusedIndex ? null : focusedIndex);
          } else {
            option.onClick();
            setIsOpen(false);
            setFocusedIndex(-1);
          }
        }
        break;
      case 'ArrowRight':
        if (activeSubMenu !== null && navigableOptions[activeSubMenu]?.children) {
          // Will be handled by submenu
        }
        break;
      case 'ArrowLeft':
        if (activeSubMenu !== null) {
          setActiveSubMenu(null);
        }
        break;
    }
  };

  const getSubMenuPosition = () => {
    if (!menuRef.current) return { top: 0, left: 0 };
    const menuRect = menuRef.current.getBoundingClientRect();
    return {
      top: menuRect.top,
      left: menuRect.right,
    };
  };

  const triggerEl = (
    <div
      ref={triggerRef}
      onClick={(e) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }
      }}
      role="button"
      tabIndex={0}
      aria-haspopup="true"
      aria-expanded={isOpen}
    >
      {trigger}
    </div>
  );

  const renderMenuItem = (option: DropdownOption, globalIndex: number) => {
    if (option.type === 'divider') {
      return (
        <div
          key={globalIndex}
          role="separator"
          style={{
            height: '1px',
            backgroundColor: 'rgba(0,0,0,0.08)',
            marginTop: '4px',
            marginBottom: '4px',
          }}
        />
      );
    }

    const isDisabled = option.disabled;
    const isFocused = navigableOptions[focusedIndex] === option;
    const hasChildren = option.children && option.children.length > 0;
    const isSubMenuOpen = activeSubMenu === globalIndex;

    const defaultItemClass = menuItemClassName
      ? ''
      : `w-full text-left text-sm transition-colors text-[#191919] ${
          isFocused ? 'bg-[rgba(245,245,245,1)]' : 'hover:bg-[rgba(245,245,245,1)]'
        }`;

    return (
      <div key={globalIndex} style={{ position: 'relative' }}>
        <button
          ref={(el) => { itemRefs.current[globalIndex] = el; }}
          type="button"
          role="menuitem"
          data-testid={option.testId}
          disabled={isDisabled}
          onClick={() => handleOptionClick(option, globalIndex)}
          onMouseEnter={() => {
            if (hasChildren) {
              setActiveSubMenu(globalIndex);
            }
          }}
          title={option.label}
          aria-haspopup={hasChildren ? 'true' : undefined}
          aria-expanded={hasChildren ? isSubMenuOpen : undefined}
          className={menuItemClassName ?? defaultItemClass}
          style={menuItemClassName ? {
            opacity: isDisabled ? 0.4 : 1,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
          } : {
            height: '32px',
            paddingLeft: '16px',
            paddingRight: hasChildren ? '8px' : '16px',
            maxWidth: '200px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            opacity: isDisabled ? 0.4 : 1,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {option.icon && <span style={{ display: 'flex', alignItems: 'center' }}>{option.icon}</span>}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{option.label}</span>
          {hasChildren && <span style={{ fontSize: '10px' }}>▶</span>}
        </button>
        {hasChildren && isSubMenuOpen && (
          <div
            role="menu"
            className="fixed z-[9999] rounded-lg bg-[var(--surface-card)] overflow-hidden"
            style={{
              top: getSubMenuPosition().top + (globalIndex * 32),
              left: getSubMenuPosition().left,
              boxShadow: '0px 2px 12px rgba(0,0,0,0.16)',
              paddingTop: '8px',
              paddingBottom: '8px',
              minWidth: '180px',
            }}
          >
            {option.children!.map((child, childIndex) =>
              renderMenuItem(child, globalIndex * 1000 + childIndex)
            )}
          </div>
        )}
      </div>
    );
  };

  const menu = isOpen ? (
    <div
      ref={menuRef}
      role="menu"
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
      className={`fixed z-[9999] rounded-lg bg-[var(--surface-card)] overflow-hidden ${menuClassName ?? ''}`}
      style={{
        top: triggerRef.current?.getBoundingClientRect().bottom ?? 0,
        boxShadow: '0px 2px 12px rgba(0,0,0,0.16)',
        paddingTop: '8px',
        paddingBottom: '8px',
        ...(align === 'right'
          ? { right: window.innerWidth - (triggerRef.current?.getBoundingClientRect().right ?? 0) }
          : { left: triggerRef.current?.getBoundingClientRect().left ?? 0 }),
        ...(menuWidth ? { width: menuWidth } : {}),
      }}
    >
      {options.map((option, index) => renderMenuItem(option, index))}
    </div>
  ) : null;

  return (
    <div ref={dropdownRef} className="relative inline-block" onKeyDown={handleKeyDown}>
      {triggerEl}
      {isOpen && createPortal(menu, document.body)}
    </div>
  );
}
