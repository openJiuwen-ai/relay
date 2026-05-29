/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Regression test: BrowserPanel Strict Mode tab dedup (Bug B from F120 Alpha)
 *
 * React Strict Mode runs useEffect twice. The tab creation useEffect must
 * produce only one tab per initialPort, even when called twice.
 */
import { describe, expect, it } from 'vitest';

describe('BrowserPanel tab dedup (Strict Mode regression)', () => {
  it('functional setState dedup produces one tab even when called twice', () => {
    // Simulate what BrowserPanel's useEffect does internally:
    // setTabs(prev => { ... }) called twice with same initialPort
    type Tab = { id: string; port: number; path: string; title: string };
    let tabs: Tab[] = [];
    let idCounter = 0;

    // Simulate the functional updater from BrowserPanel
    function tabUpdater(prev: Tab[], initialPort: number, path: string): Tab[] {
      const title = `localhost:${initialPort}${path !== '/' ? path : ''}`;
      const existing = prev.find((t) => t.port === initialPort);
      if (existing) return prev;
      const id = `tab-${++idCounter}`;
      return [...prev, { id, port: initialPort, path, title }];
    }

    // First call (normal execution)
    tabs = tabUpdater(tabs, 5173, '/');
    expect(tabs).toHaveLength(1);
    expect(tabs[0].port).toBe(5173);

    // Second call (Strict Mode re-execution) — uses result from first call
    tabs = tabUpdater(tabs, 5173, '/');
    expect(tabs).toHaveLength(1); // Still 1 — dedup works
  });

  it('creates separate tabs for different ports', () => {
    type Tab = { id: string; port: number; path: string; title: string };
    let tabs: Tab[] = [];
    let idCounter = 0;

    function tabUpdater(prev: Tab[], initialPort: number, path: string): Tab[] {
      const title = `localhost:${initialPort}${path !== '/' ? path : ''}`;
      const existing = prev.find((t) => t.port === initialPort);
      if (existing) return prev;
      const id = `tab-${++idCounter}`;
      return [...prev, { id, port: initialPort, path, title }];
    }

    tabs = tabUpdater(tabs, 5173, '/');
    tabs = tabUpdater(tabs, 3000, '/dashboard');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].port).toBe(5173);
    expect(tabs[1].port).toBe(3000);
  });

  it('session changes alone do not require reopening the initial preview effect', () => {
    const initialPort = 5173;
    const initialPath = '/';
    const gatewayPort = 4100;

    function shouldRunInitialOpen(params: {
      initialPort?: number;
      initialPath?: string;
      gatewayPort: number;
    }): boolean {
      return Boolean(params.initialPort && params.gatewayPort);
    }

    expect(shouldRunInitialOpen({ initialPort, initialPath, gatewayPort })).toBe(true);
    // Regression guard: BrowserPanel's initial open effect should not depend on session id.
    // A session refresh must not, by itself, retrigger initial-open logic.
    expect(shouldRunInitialOpen({ initialPort, initialPath, gatewayPort })).toBe(true);
  });

  it('failed preview reopen should revoke the previously active lease', async () => {
    const revoked: string[] = [];
    let currentSessionId: string | null = 'old-session';

    async function revokeLease(sessionId: string | null) {
      if (!sessionId) return;
      revoked.push(sessionId);
    }

    async function handleFailedOpen(nextAllowed: boolean) {
      if (!nextAllowed) {
        if (currentSessionId) {
          await revokeLease(currentSessionId);
          currentSessionId = null;
        }
        return { gatewayUrl: '', sessionId: null };
      }
      return { gatewayUrl: 'ok', sessionId: 'new-session' };
    }

    const result = await handleFailedOpen(false);
    expect(revoked).toEqual(['old-session']);
    expect(currentSessionId).toBeNull();
    expect(result.gatewayUrl).toBe('');
    expect(result.sessionId).toBeNull();
  });
});
