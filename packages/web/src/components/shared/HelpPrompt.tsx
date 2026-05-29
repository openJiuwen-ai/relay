/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type MouseEventHandler } from 'react';
import { OverflowTooltip } from './OverflowTooltip';

interface HelpPromptProps {
  tooltip?: string;
  ariaLabel?: string;
  href?: string;
  target?: string;
  rel?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
  className?: string;
  iconClassName?: string;
  testId?: string;
}

const DEFAULT_LABEL = '查看帮助文档';
const DEFAULT_TRIGGER_CLASS =
  'inline-flex h-5 w-5 items-center justify-center text-[var(--help-prompt-icon)] transition-colors hover:text-[var(--help-prompt-icon-hover)]';
const DEFAULT_ICON_CLASS =
  'h-4 w-4 shrink-0 bg-current [mask-image:url(/icons/userprofile/help.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] [-webkit-mask-image:url(/icons/userprofile/help.svg)] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain]';

export function HelpPrompt({
  tooltip = DEFAULT_LABEL,
  ariaLabel = tooltip || DEFAULT_LABEL,
  href,
  target = '_blank',
  rel = 'noopener noreferrer',
  onClick,
  className = DEFAULT_TRIGGER_CLASS,
  iconClassName = DEFAULT_ICON_CLASS,
  testId,
}: HelpPromptProps) {
  const icon = <span aria-hidden="true" className={iconClassName} />;

  const trigger = href ? (
    <a
      href={href}
      target={target}
      rel={rel}
      aria-label={ariaLabel}
      onClick={onClick}
      className={className}
      data-testid={testId}
    >
      {icon}
    </a>
  ) : (
    <button type="button" aria-label={ariaLabel} onClick={onClick} className={className} data-testid={testId}>
      {icon}
    </button>
  );

  if (!tooltip) return trigger;

  return (
    <OverflowTooltip content={tooltip} forceShow className="inline-flex">
      {trigger}
    </OverflowTooltip>
  );
}
