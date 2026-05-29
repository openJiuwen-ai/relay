/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

const CHAT_LAYOUT_CHANGED_EVENT = 'office-claw:chat-layout-changed';

function isAtBottom(el: HTMLElement, thresholdPx: number): boolean {
  const distance = el.scrollHeight - el.clientHeight - el.scrollTop;
  return distance <= thresholdPx;
}

export function ScrollToBottomButton({
  scrollContainerRef,
  messagesEndRef,
  thresholdPx = 120,
  recomputeSignal,
}: {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  messagesEndRef: React.RefObject<HTMLElement | null>;
  thresholdPx?: number;
  /** Changes when thread/messages change, to recompute visibility without scroll/resize events. */
  recomputeSignal?: unknown;
  /** Changes when the scroll container / end sentinel is replaced (e.g. thread switch). */
  observerKey?: unknown;
}) {
  const [visible, setVisible] = useState(false);

  const update = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setVisible(!isAtBottom(el, thresholdPx));
  }, [scrollContainerRef, thresholdPx]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [scrollContainerRef, update]);

  // Cloud P2: media-driven layout shifts (e.g. image load) can move the end sentinel
  // without scroll/resize or message updates. IntersectionObserver fires on such shifts.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const scrollEl = scrollContainerRef.current;
    const endEl = messagesEndRef.current;
    if (!scrollEl || !endEl) return;
    if (typeof window.IntersectionObserver !== 'function') return;

    const observer = new window.IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // When the end sentinel is not intersecting the viewport (+threshold margin),
        // the user is no longer near bottom → show the button.
        setVisible(!entry.isIntersecting);
      },
      {
        root: scrollEl,
        threshold: 0,
        rootMargin: `0px 0px ${thresholdPx}px 0px`,
      },
    );

    observer.observe(endEl);
    return () => observer.disconnect();
  }, [scrollContainerRef, messagesEndRef, thresholdPx]);

  // Cloud P2: local UI toggles can change scrollHeight without scroll/resize events.
  useEffect(() => {
    const handler = () => update();
    window.addEventListener(CHAT_LAYOUT_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CHAT_LAYOUT_CHANGED_EVENT, handler);
  }, [update]);

  // Cloud P2: thread switch / message replacement can change scrollTop/scrollHeight without
  // firing scroll events; recompute when callers signal content changes.
  useEffect(() => {
    update();
  }, [update, recomputeSignal]);

  const handleClick = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesEndRef]);

  const classes = useMemo(
    () =>
      'absolute bottom-2 right-8 z-10 w-8 h-8 left-1/2 -translate-x-4 ' +
      'rounded-full border border-gray-200 bg-white shadow-md ' +
      'flex items-center justify-center text-xs text-gray-700 ' +
      'hover:bg-white hover:border-gray-300 transition-colors',
    [],
  );

  if (!visible) return null;

  return (
    <button type="button" aria-label="到最新" className={classes} onClick={handleClick} title="跳到对话底部">
      <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="16.000000" height="16.000000" fill="none">
        <rect id="svg" width="16.000000" height="16.000000" x="0.000000" y="0.000000" />
        <g id="ic_public_sort_down-向下/model/border/ic_public_sort_down1">
          <path id="path1" d="M0.00182263 7.49389C0.00182263 6.3222 -0.00227829 5.1505 0.00182263 3.97881C-0.000534654 3.41183 0.0691532 2.84684 0.209212 2.29743C0.516196 1.13452 1.2737 0.444393 2.43543 0.176661C3.01794 0.0508048 3.61291 -0.00816143 4.20879 0.000906865C6.45571 0.000906865 8.70282 0.000906865 10.9501 0.000906865C11.5177 -0.00261629 12.0836 0.0622952 12.6356 0.194236C13.8325 0.48716 14.5507 1.24525 14.8243 2.43803C14.9473 3.00176 15.0061 3.57761 14.9995 4.15456C14.9995 6.4257 14.9995 8.69703 14.9995 10.9686C15.0026 11.5306 14.9379 12.091 14.8068 12.6376C14.5138 13.8351 13.7522 14.5498 12.5594 14.8234C11.9769 14.9488 11.382 15.0078 10.7861 14.9992C8.54855 14.9992 6.3112 14.9992 4.07404 14.9992C3.50215 15.0039 2.93176 14.9399 2.37509 14.8088C1.17293 14.5159 0.451167 13.7543 0.178163 12.5556C0.038731 11.9463 0.00182263 11.3353 0.00182263 10.719C0.00182263 9.64415 0.00182263 8.56912 0.00182263 7.49389Z" fill="rgb(255,255,255)" fillOpacity="0" fillRule="nonzero" />
          <path id="path1" d="M0.00182263 3.97881C-0.000534654 3.41183 0.0691532 2.84684 0.209212 2.29743C0.516196 1.13452 1.2737 0.444393 2.43543 0.176661C3.01794 0.0508048 3.61291 -0.00816143 4.20879 0.000906865C6.45571 0.000906865 8.70282 0.000906865 10.9501 0.000906865C11.5177 -0.00261629 12.0836 0.0622952 12.6356 0.194236C13.8325 0.48716 14.5507 1.24525 14.8243 2.43803C14.9473 3.00176 15.0061 3.57761 14.9995 4.15456C14.9995 6.4257 14.9995 8.69703 14.9995 10.9686C15.0026 11.5306 14.9379 12.091 14.8068 12.6376C14.5138 13.8351 13.7522 14.5498 12.5594 14.8234C11.9769 14.9488 11.382 15.0078 10.7861 14.9992C8.54855 14.9992 6.3112 14.9992 4.07404 14.9992C3.50215 15.0039 2.93176 14.9399 2.37509 14.8088C1.17293 14.5159 0.451167 13.7543 0.178163 12.5556C0.038731 11.9463 0.00182263 11.3353 0.00182263 10.719C0.00182263 9.64415 0.00182263 8.56912 0.00182263 7.49389C0.00182263 6.3222 -0.00227829 5.1505 0.00182263 3.97881Z" fillRule="nonzero" stroke="rgb(255,255,255)" strokeOpacity="0" strokeWidth="1" />
          <path id="path2" d="M0.00182263 7.49389C0.00182263 6.3222 -0.00227829 5.1505 0.00182263 3.97881C-0.000534654 3.41183 0.0691532 2.84684 0.209212 2.29743C0.516196 1.13452 1.2737 0.444393 2.43543 0.176661C3.01794 0.0508048 3.61291 -0.00816143 4.20879 0.000906865C6.45571 0.000906865 8.70282 0.000906865 10.9501 0.000906865C11.5177 -0.00261629 12.0836 0.0622952 12.6356 0.194236C13.8325 0.48716 14.5507 1.24525 14.8243 2.43803C14.9473 3.00176 15.0061 3.57761 14.9995 4.15456C14.9995 6.4257 14.9995 8.69703 14.9995 10.9686C15.0026 11.5306 14.9379 12.091 14.8068 12.6376C14.5138 13.8351 13.7522 14.5498 12.5594 14.8234C11.9769 14.9488 11.382 15.0078 10.7861 14.9992C8.54855 14.9992 6.3112 14.9992 4.07404 14.9992C3.50215 15.0039 2.93176 14.9399 2.37509 14.8088C1.17293 14.5159 0.451167 13.7543 0.178163 12.5556C0.038731 11.9463 0.00182263 11.3353 0.00182263 10.719C0.00182263 9.64415 0.00182263 8.56912 0.00182263 7.49389Z" opacity="0.200000003" fill="rgb(0,0,0)" fillOpacity="0" fillRule="nonzero" />
          <path id="path2" d="M0.00182263 3.97881C-0.000534654 3.41183 0.0691532 2.84684 0.209212 2.29743C0.516196 1.13452 1.2737 0.444393 2.43543 0.176661C3.01794 0.0508048 3.61291 -0.00816143 4.20879 0.000906865C6.45571 0.000906865 8.70282 0.000906865 10.9501 0.000906865C11.5177 -0.00261629 12.0836 0.0622952 12.6356 0.194236C13.8325 0.48716 14.5507 1.24525 14.8243 2.43803C14.9473 3.00176 15.0061 3.57761 14.9995 4.15456C14.9995 6.4257 14.9995 8.69703 14.9995 10.9686C15.0026 11.5306 14.9379 12.091 14.8068 12.6376C14.5138 13.8351 13.7522 14.5498 12.5594 14.8234C11.9769 14.9488 11.382 15.0078 10.7861 14.9992C8.54855 14.9992 6.3112 14.9992 4.07404 14.9992C3.50215 15.0039 2.93176 14.9399 2.37509 14.8088C1.17293 14.5159 0.451167 13.7543 0.178163 12.5556C0.038731 11.9463 0.00182263 11.3353 0.00182263 10.719C0.00182263 9.64415 0.00182263 8.56912 0.00182263 7.49389C0.00182263 6.3222 -0.00227829 5.1505 0.00182263 3.97881Z" opacity="0.200000003" fillRule="nonzero" stroke="rgb(255,255,255)" strokeOpacity="0" strokeWidth="1" />
          <circle id="path3" cx="8" cy="8" r="8" fill="rgb(255,255,255)" fillOpacity="0" />
          <circle id="path3" cx="8" cy="8" r="8" stroke="rgb(0,0,0)" strokeOpacity="0" strokeWidth="1" />
          <path id="path4" d="M2 9.18268L7.8345 15L13.6667 9.18384M7.8345 15L7.8345 1" stroke="rgb(25,25,25)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" />
          <path id="path5" d="M8.16786 1C8.35196 1 8.50119 1.14927 8.50117 1.33336L8.49967 14.531L13.7646 9.28115C13.885 9.16115 14.074 9.15217 14.2047 9.25402C14.3347 9.38438 14.3657 9.62321 14.2354 9.7532L8.40321 15.5694C8.37319 15.5993 8.33889 15.6223 8.30228 15.6385L8.26497 15.6523L8.22656 15.6615L8.1875 15.6661L8.14821 15.6661L8.11433 15.662L8.072 15.6523C8.02517 15.6356 7.96541 15.6035 7.93094 15.569L2.09798 9.75206C1.97764 9.63208 1.96812 9.44301 2.0696 9.3121C2.19958 9.18173 2.43832 9.14998 2.56869 9.27996L7.83333 14.529L7.8345 1.33331C7.83452 1.16236 7.96321 1.02148 8.12899 1.00224L8.16786 1Z" fill="rgb(255,255,255)" fillOpacity="0" fillRule="nonzero" />
          <path id="path5" d="M8.50117 1.33336L8.49967 14.531L13.7646 9.28115C13.885 9.16115 14.074 9.15217 14.2047 9.25402C14.3347 9.38438 14.3657 9.62321 14.2354 9.7532L8.40321 15.5694C8.37319 15.5993 8.33889 15.6223 8.30228 15.6385L8.26497 15.6523L8.22656 15.6615L8.1875 15.6661L8.14821 15.6661L8.11433 15.662L8.072 15.6523C8.02517 15.6356 7.96541 15.6035 7.93094 15.569L2.09798 9.75206C1.97764 9.63208 1.96812 9.44301 2.0696 9.3121C2.19958 9.18173 2.43832 9.14998 2.56869 9.27996L7.83333 14.529L7.8345 1.33331C7.83452 1.16236 7.96321 1.02148 8.12899 1.00224L8.16786 1C8.35196 1 8.50119 1.14927 8.50117 1.33336Z" fillRule="nonzero" stroke="rgb(255,255,255)" strokeOpacity="0" strokeLinejoin="round" strokeWidth="1" />
        </g>
      </svg>
    </button>
  );
}
