/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type AriaRole, type CSSProperties, type MouseEvent, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';

interface AppModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  panelClassName?: string;
  bodyClassName?: string;
  headerClassName?: string;
  titleClassName?: string;
  backdropClassName?: string;
  zIndexClassName?: string;
  disableBackdropClose?: boolean;
  showCloseButton?: boolean;
  closeButtonAriaLabel?: string;
  backdropTestId?: string;
  panelTestId?: string;
  bodyTestId?: string;
  panelRef?: Ref<HTMLDivElement>;
  panelTabIndex?: number;
  panelStyle?: CSSProperties;
  backdropRole?: AriaRole;
  backdropAriaModal?: boolean;
  backdropAriaLabel?: string;
}

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function AppModal({
  open,
  onClose,
  children,
  title,
  panelClassName,
  bodyClassName,
  headerClassName,
  titleClassName,
  backdropClassName,
  zIndexClassName = 'z-50',
  disableBackdropClose = false,
  showCloseButton = true,
  closeButtonAriaLabel = 'close',
  backdropTestId,
  panelTestId,
  bodyTestId,
  panelRef,
  panelTabIndex,
  panelStyle,
  backdropRole,
  backdropAriaModal,
  backdropAriaLabel,
}: AppModalProps) {
  if (!open) return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    // Prevent backdrop clicks from bubbling into underlying page handlers.
    event.stopPropagation();
    if (disableBackdropClose) return;
    onClose();
  };

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    event.stopPropagation();
    if (disableBackdropClose) {
      event.preventDefault();
    }
  };

  const handlePanelClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const showHeader = title || showCloseButton;
  const renderTitle = () => {
    if (!title) return <span />;
    if (typeof title === 'string' || typeof title === 'number') {
      return <h3 className={joinClasses('ui-modal-title', titleClassName)}>{title}</h3>;
    }
    return title;
  };

  const modalNode = (
    <div
      role={backdropRole}
      aria-modal={backdropAriaModal}
      aria-label={backdropAriaLabel}
      className={joinClasses('ui-modal-backdrop', zIndexClassName, backdropClassName)}
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
      data-testid={backdropTestId}
    >
      <div
        ref={panelRef}
        tabIndex={panelTabIndex}
        style={panelStyle}
        className={joinClasses('ui-modal-panel', panelClassName)}
        onClick={handlePanelClick}
        data-testid={panelTestId}
      >
        {showHeader ? (
          <div className={joinClasses('ui-modal-header', headerClassName)}>
            <div className="ui-modal-title-slot">{renderTitle()}</div>
            {showCloseButton ? (
              <button
                type="button"
                onClick={onClose}
                aria-label={closeButtonAriaLabel}
                className="ui-modal-close-button"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
        <div data-testid={bodyTestId} className={bodyClassName}>
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalNode;
  }
  return createPortal(modalNode, document.body);
}
