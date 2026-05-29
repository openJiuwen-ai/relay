/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * In-memory deduplication for inbound connector messages.
 * Prevents webhook retries from triggering duplicate agent invocations.
 */
export class InboundMessageDedup {
  private readonly seen = new Map<string, number>();
  private readonly maxSize: number;

  constructor(maxSize = 10_000) {
    this.maxSize = maxSize;
  }

  isDuplicate(connectorId: string, chatId: string, messageId: string): boolean {
    const key = `${connectorId}:${chatId}:${messageId}`;
    if (this.seen.has(key)) return true;
    this.evictIfNeeded();
    this.seen.set(key, Date.now());
    return false;
  }

  private evictIfNeeded(): void {
    if (this.seen.size < this.maxSize) return;
    // Evict oldest entry
    const oldest = this.seen.keys().next().value;
    if (oldest !== undefined) this.seen.delete(oldest);
  }
}
