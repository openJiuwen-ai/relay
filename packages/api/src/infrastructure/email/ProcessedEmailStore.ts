/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Processed Email Store
 * Deduplication layer: tracks which emails have already been processed
 * to prevent duplicate agent invocations.
 *
 * Primary dedup key: IMAP UID (unique per mailbox)
 * Secondary dedup: repo+prNumber within a time window (PR-level)
 *
 * BACKLOG #81
 */

export interface IProcessedEmailStore {
  /** Check if an email UID has been processed. */
  isProcessed(uid: number): boolean | Promise<boolean>;

  /** Mark an email UID as processed. */
  markProcessed(uid: number): void | Promise<void>;

  /** Check if a PR has been invoked recently (within window). */
  isPrRecentlyInvoked(repoFullName: string, prNumber: number): boolean | Promise<boolean>;

  /** Mark a PR as recently invoked. */
  markPrInvoked(repoFullName: string, prNumber: number): void | Promise<void>;

  /**
   * Atomically check + mark PR as invoked. Returns true if already invoked
   * (caller should skip), false if freshly claimed (caller proceeds).
   * Prevents concurrent routes for the same PR from both passing the check.
   */
  checkAndMarkPrInvoked(repoFullName: string, prNumber: number): boolean | Promise<boolean>;

  /** Undo a PR claim (rollback after delivery failure). */
  unmarkPrInvoked(repoFullName: string, prNumber: number): void | Promise<void>;
}

/** Default time window for PR-level dedup (5 minutes). */
const PR_DEDUP_WINDOW_MS = 5 * 60 * 1000;

/** Max entries before cleanup (memory impl only). */
const MAX_PROCESSED_ENTRIES = 10000;

/**
 * In-memory implementation with automatic cleanup.
 */
export class MemoryProcessedEmailStore implements IProcessedEmailStore {
  private readonly processedUids = new Set<number>();
  private readonly prInvokedAt = new Map<string, number>();
  private readonly prDedupWindowMs: number;

  constructor(options?: { prDedupWindowMs?: number }) {
    this.prDedupWindowMs = options?.prDedupWindowMs ?? PR_DEDUP_WINDOW_MS;
  }

  isProcessed(uid: number): boolean {
    return this.processedUids.has(uid);
  }

  markProcessed(uid: number): void {
    this.processedUids.add(uid);
    this.cleanupIfNeeded();
  }

  isPrRecentlyInvoked(repoFullName: string, prNumber: number): boolean {
    const key = `${repoFullName}#${prNumber}`;
    const invokedAt = this.prInvokedAt.get(key);
    if (invokedAt == null) return false;
    return Date.now() - invokedAt < this.prDedupWindowMs;
  }

  markPrInvoked(repoFullName: string, prNumber: number): void {
    const key = `${repoFullName}#${prNumber}`;
    this.prInvokedAt.set(key, Date.now());
  }

  checkAndMarkPrInvoked(repoFullName: string, prNumber: number): boolean {
    if (this.isPrRecentlyInvoked(repoFullName, prNumber)) {
      return true; // already claimed
    }
    this.markPrInvoked(repoFullName, prNumber);
    return false; // freshly claimed
  }

  unmarkPrInvoked(repoFullName: string, prNumber: number): void {
    const key = `${repoFullName}#${prNumber}`;
    this.prInvokedAt.delete(key);
  }

  private cleanupIfNeeded(): void {
    if (this.processedUids.size > MAX_PROCESSED_ENTRIES) {
      // Keep only the most recent half
      const arr = [...this.processedUids];
      const keepFrom = Math.floor(arr.length / 2);
      this.processedUids.clear();
      for (let i = keepFrom; i < arr.length; i++) {
        this.processedUids.add(arr[i]!);
      }
    }

    // Cleanup expired PR dedup entries
    const now = Date.now();
    for (const [key, time] of this.prInvokedAt) {
      if (now - time > this.prDedupWindowMs) {
        this.prInvokedAt.delete(key);
      }
    }
  }
}
