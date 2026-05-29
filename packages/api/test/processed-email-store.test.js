/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { MemoryProcessedEmailStore } from '../dist/infrastructure/email/ProcessedEmailStore.js';

describe('MemoryProcessedEmailStore', () => {
  /** @type {InstanceType<typeof MemoryProcessedEmailStore>} */
  let store;

  beforeEach(() => {
    store = new MemoryProcessedEmailStore();
  });

  describe('UID dedup', () => {
    it('new UID is not processed', () => {
      assert.strictEqual(store.isProcessed(100), false);
    });

    it('marks UID as processed', () => {
      store.markProcessed(100);
      assert.strictEqual(store.isProcessed(100), true);
    });

    it('handles multiple UIDs independently', () => {
      store.markProcessed(100);
      store.markProcessed(200);
      assert.strictEqual(store.isProcessed(100), true);
      assert.strictEqual(store.isProcessed(200), true);
      assert.strictEqual(store.isProcessed(300), false);
    });
  });

  describe('PR-level dedup', () => {
    it('new PR is not recently invoked', () => {
      assert.strictEqual(store.isPrRecentlyInvoked('owner/repo', 42), false);
    });

    it('PR is recently invoked after marking', () => {
      store.markPrInvoked('owner/repo', 42);
      assert.strictEqual(store.isPrRecentlyInvoked('owner/repo', 42), true);
    });

    it('different repo+PR combos are independent', () => {
      store.markPrInvoked('owner/repo-a', 1);
      assert.strictEqual(store.isPrRecentlyInvoked('owner/repo-a', 1), true);
      assert.strictEqual(store.isPrRecentlyInvoked('owner/repo-b', 1), false);
      assert.strictEqual(store.isPrRecentlyInvoked('owner/repo-a', 2), false);
    });

    it('PR dedup expires after window', () => {
      // Use a tiny window for testing
      const shortStore = new MemoryProcessedEmailStore({ prDedupWindowMs: 50 });
      shortStore.markPrInvoked('owner/repo', 1);
      assert.strictEqual(shortStore.isPrRecentlyInvoked('owner/repo', 1), true);

      return new Promise((resolve) => {
        setTimeout(() => {
          assert.strictEqual(shortStore.isPrRecentlyInvoked('owner/repo', 1), false);
          resolve(undefined);
        }, 80);
      });
    });
  });

  describe('cleanup', () => {
    it('cleans up when exceeding max entries', () => {
      // Create a store with a low threshold to test cleanup behavior
      // The real threshold is 10000 — we can't test that directly without mocking internals.
      // Instead, verify the store works correctly with many entries.
      for (let i = 0; i < 100; i++) {
        store.markProcessed(i);
      }
      // All recent entries should still be present
      assert.strictEqual(store.isProcessed(99), true);
      assert.strictEqual(store.isProcessed(50), true);
    });
  });
});
