/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useId } from 'react';

export function AttachIcon({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  const clipPathId = `attachClip_${uid}`;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32.000000" height="32.000000" fill="none">
      <defs>
        <clipPath id="clipPath_0">
          <rect width="32.000000" height="32.000000" x="0.000000" y="0.000000" rx="8.000000" fill="rgb(255,255,255)" />
        </clipPath>
      </defs>
      <rect id="附件按钮" width="32.000000" height="32.000000" x="0.000000" y="0.000000" rx="8.000000" />
      <g id="编组 19">
        <rect id="矩形" width="32.000000" height="32.000000" x="0.000000" y="0.000000" rx="8.000000" fill="rgb(0,0,0)" fillOpacity="0" />
        <rect id="矩形" width="31.000000" height="31.000000" x="0.500000" y="0.500000" rx="7.500000" stroke="rgb(151,151,151)" strokeOpacity="0" strokeWidth="1" />
        <g id="编组 2">
          <rect id="矩形" width="24.000000" height="24.000000" x="4.000000" y="4.000000" fill="rgb(216,216,216)" fillOpacity="0" />
          <rect id="矩形" width="23.000000" height="23.000000" x="4.500000" y="4.500000" stroke="rgb(151,151,151)" strokeOpacity="0" strokeWidth="1" />
          <path id="路径 3" d="M0 4.51293L0 13.2071C0 15.9355 2.21175 18.1472 4.94008 18.1472C7.6684 18.1472 9.88015 15.9355 9.88015 13.2071L9.88015 3.52863C9.88015 1.57982 8.30033 3.35455e-13 6.35153 3.35455e-13C4.40272 3.35455e-13 2.8229 1.57982 2.8229 3.52863L2.8229 12.9362C2.8229 14.1382 3.82248 15.0991 5.02358 15.0517C6.15949 15.0069 7.05725 14.073 7.05725 12.9362L7.05725 4.84722" fill="rgb(216,216,216)" fillOpacity="0" fillRule="evenodd" transform="matrix(0.939693,0.34202,-0.34202,0.939693,14.3848,5.86523)" />
          <path id="路径 3" d="M0 4.51293L0 13.2071C0 15.9355 2.21175 18.1472 4.94008 18.1472C7.6684 18.1472 9.88015 15.9355 9.88015 13.2071L9.88015 3.52863C9.88015 1.57982 8.30033 3.35455e-13 6.35153 3.35455e-13C4.40272 3.35455e-13 2.8229 1.57982 2.8229 3.52863L2.8229 12.9362C2.8229 14.1382 3.82248 15.0991 5.02358 15.0517C6.15949 15.0069 7.05725 14.073 7.05725 12.9362L7.05725 4.84722" fillRule="evenodd" stroke="rgb(128,128,128)" strokeLinecap="round" strokeWidth="1.20000005" transform="matrix(0.939693,0.34202,-0.34202,0.939693,14.3848,5.86523)" />
        </g>
      </g>
    </svg>
  );
}
