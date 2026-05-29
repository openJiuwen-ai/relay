/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect } from 'react';

const DEV_HOSTS = new Set(['localhost', '127.0.0.1']);
const RELOAD_MARKER = 'officeclaw-dev-sw-reset';

export function DevServiceWorkerReset() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    if (!DEV_HOSTS.has(window.location.hostname)) return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;

    const reset = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const unregisterResults = await Promise.all(registrations.map((registration) => registration.unregister()));
      const removedAnyRegistration = unregisterResults.some(Boolean);

      let removedAnyCache = false;
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        if (cacheKeys.length > 0) {
          removedAnyCache = true;
          await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        }
      }

      if (cancelled) return;

      const shouldReload = removedAnyRegistration || removedAnyCache;
      if (!shouldReload) {
        window.sessionStorage.removeItem(RELOAD_MARKER);
        return;
      }

      if (window.sessionStorage.getItem(RELOAD_MARKER) === '1') {
        window.sessionStorage.removeItem(RELOAD_MARKER);
        return;
      }

      window.sessionStorage.setItem(RELOAD_MARKER, '1');
      window.location.reload();
    };

    void reset().catch((error) => {
      console.warn('Failed to reset dev service worker cache', error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
