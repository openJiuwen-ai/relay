/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';
import styles from './Button.module.css';

type ButtonVariant = 'major' | 'default' | 'danger' | 'ghost';
type ButtonSize = 'lg' | 'md' | 'sm' | 'xs';

const variantClassMap: Record<ButtonVariant, string> = {
  major: styles.uiButtonMajor,
  default: styles.uiButtonDefault,
  danger: styles.uiButtonDanger,
  ghost: styles.uiButtonGhost,
};

const sizeTokens: Record<ButtonSize, { height: number; padding: string; minWidth: number }> = {
  lg: { height: 32, padding: '6px 24px', minWidth: 96 },
  md: { height: 28, padding: '4px 24px', minWidth: 84 },
  sm: { height: 24, padding: '2px 16px', minWidth: 64 },
  xs: { height: 20, padding: '0px 12px', minWidth: 64 },
};

const iconSizeTokens: Record<ButtonSize, { width: number; height: number }> = {
  lg: { width: 32, height: 32 },
  md: { width: 28, height: 28 },
  sm: { width: 24, height: 24 },
  xs: { width: 20, height: 20 },
};

const sizeClassMap: Record<ButtonSize, string> = {
  lg: 'ui-button-lg',
  md: 'ui-button-md',
  sm: 'ui-button-sm',
  xs: 'ui-button-xs',
};

const iconSizeClassMap: Record<ButtonSize, string> = {
  lg: 'ui-button-icon-lg',
  md: 'ui-button-icon-md',
  sm: 'ui-button-icon-sm',
  xs: 'ui-button-icon-xs',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
  hasBorder?: boolean;
  onlyIcon?: boolean;
  isDropDown?: boolean;
  tip?: string;
  autoFocus?: boolean;
  children?: ReactNode;
}

const Spinner = ({ size = 14 }: { size?: number }) => (
  <svg className={styles.buttonLoadingSpinner} width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
    <path d="M8 1.5C8 1.5 14.5 4 14.5 8C14.5 12 8 14.5 8 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const DropdownArrow = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'major',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    block = false,
    hasBorder = true,
    onlyIcon = false,
    isDropDown = false,
    disabled = false,
    tip,
    autoFocus,
    children,
    className,
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;
  const isIconButton = onlyIcon || (!children && (iconLeft || iconRight));
  const noBorder = isIconButton && !hasBorder;
  const hasIconBorder = isIconButton && hasBorder;

  const getSizeClass = () => {
    if (isIconButton) return iconSizeClassMap[size];
    return sizeClassMap[size];
  };

  const getSizeStyle = (): React.CSSProperties => {
    if (isIconButton) {
      const s = iconSizeTokens[size];
      if (noBorder) return { width: 'auto', height: 'auto', padding: 0 };
      return { width: s.width, height: s.height, minWidth: s.width, minHeight: s.height, padding: 0 };
    }
    const s = sizeTokens[size];
    return { height: s.height, padding: s.padding, minWidth: s.minWidth };
  };

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: hasIconBorder ? 6 : 999,
    borderWidth: noBorder ? 0 : 1,
    borderStyle: 'solid',
    fontFamily: 'inherit',
    fontWeight: 400,
    lineHeight: 1,
    fontSize: 12,
    outline: 'none',
    gap: 6,
    width: block ? '100%' : undefined,
    opacity: isDisabled && !loading ? 0.4 : 1,
    pointerEvents: isDisabled ? 'none' : 'auto',
    ...getSizeStyle(),
  };

  const buttonContent = (
    <>
      {loading && <Spinner size={size === 'xs' || size === 'sm' ? 12 : 14} />}
      {!loading && iconLeft && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{iconLeft}</span>}
      {!loading && children && <span>{children}</span>}
      {!loading && iconRight && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{iconRight}</span>}
      {!loading && isDropDown && !isIconButton && <DropdownArrow />}
    </>
  );

  const variantCssClass = isIconButton ? styles.uiButtonIcon : variantClassMap[variant];
  const sizeCssClass = getSizeClass();

  return (
    <button
      ref={ref}
      type="button"
      disabled={isDisabled}
      autoFocus={autoFocus}
      title={tip}
      className={joinClasses(variantCssClass, sizeCssClass, noBorder ? 'ui-button-icon-no-border' : '', className)}
      style={buttonStyle}
      {...props}
    >
      {buttonContent}
    </button>
  );
});
