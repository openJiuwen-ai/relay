/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

type MaskIconName =
  | 'persona'
  | 'collab'
  | 'skills'
  | 'template'
  | 'edit'
  | 'close'
  | 'check'
  | 'more'
  | 'delete'
  | 'refresh'
  | 'random'
  | 'attach'
  | 'add'
  | 'information'
  | 'link'
  | 'link-blue'
  | 'chevronLeft'
  | 'chevronRight'
  | 'arrowLeft'
  | 'arrowRight';

const ICON_PATHS: Record<MaskIconName, string> = {
  persona: '/images/agent-management-icons/agent-persona.svg',
  collab: '/images/agent-management-icons/agent-collab.svg',
  skills: '/images/agent-management-icons/agent-skills.svg',
  template: '/images/agent-management-icons/agent-template.svg',
  edit: '/images/agent-management-icons/agent-edit.svg',
  close: '/images/agent-management-icons/agent-close.svg',
  check: '/images/agent-management-icons/agent-check.svg',
  more: '/images/agent-management-icons/agent-more.svg',
  delete: '/images/agent-management-icons/agent-delete.svg',
  refresh: '/images/agent-management-icons/agent-refresh.svg',
  random: '/images/agent-management-icons/agent-random-avatar.svg',
  attach: '/icons/attach.svg',
  add: '/images/add.svg',
  link: '/icons/link.svg',
  'link-blue': '/images/link-blue.svg',
  information: '/icons/information.svg',
  chevronLeft: '/icons/chevron-left.svg',
  chevronRight: '/icons/chevron-right.svg',
  arrowLeft: '/icons/arrow-left.svg',
  arrowRight: '/icons/arrow-right.svg',
};

type MaskIconProps = {
  name?: MaskIconName;
  src?: string;
  className?: string;
  preserveOriginalColor?: boolean;
  testId?: string;
};

export function MaskIcon({ name, src, className, preserveOriginalColor = false, testId }: MaskIconProps) {
  const iconSrc = src ?? (name ? ICON_PATHS[name] : '');
  if (!iconSrc) return null;

  if (preserveOriginalColor || name === 'random') {
    return <img src={iconSrc} alt="" aria-hidden="true" data-testid={testId} className={className ?? 'h-5 w-5'} />;
  }

  return (
    <i
      aria-hidden="true"
      data-testid={testId}
      className={['shrink-0 bg-current', className ?? 'h-5 w-5'].filter(Boolean).join(' ')}
      style={{
        WebkitMask: `url("${iconSrc}") center / contain no-repeat`,
        mask: `url("${iconSrc}") center / contain no-repeat`,
      }}
    />
  );
}
