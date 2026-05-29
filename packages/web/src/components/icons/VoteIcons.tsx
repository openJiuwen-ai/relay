/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/** Vote system icons — monoline SVG, 24x24, currentColor */

interface IconProps {
  className?: string;
}

/** Ballot box: box with slot + paper going in */
export function BallotIcon({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Box body */}
      <path d="M4 10v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9" />
      {/* Box lid with slot */}
      <path d="M2 10h20" />
      <line x1="9" y1="10" x2="15" y2="10" strokeWidth="3" />
      {/* Paper ballot going into slot */}
      <rect x="9" y="3" width="6" height="8" rx="1" strokeWidth="1.5" />
      <line x1="11" y1="5.5" x2="13" y2="5.5" strokeWidth="1" />
      <line x1="11" y1="7.5" x2="13" y2="7.5" strokeWidth="1" />
    </svg>
  );
}
