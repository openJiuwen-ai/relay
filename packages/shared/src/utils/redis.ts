/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis 连接和 Session 存储
 * 用于管理智能体的 Session 状态
 */

import { Redis } from 'ioredis';

export type RedisClient = Redis;

export interface RedisConfig {
  url: string;
  keyPrefix?: string;
}

export function getDefaultRedisConfig(): RedisConfig {
  return {
    url: process.env['REDIS_URL']!,
    keyPrefix: process.env['REDIS_KEY_PREFIX'] ?? 'office-claw:',
  };
}

export function createRedisClient(config?: Partial<RedisConfig>): RedisClient {
  const finalConfig = { ...getDefaultRedisConfig(), ...config };
  const keyPrefix = finalConfig.keyPrefix ?? 'office-claw:';

  const client = new Redis(finalConfig.url, {
    keyPrefix,
    retryStrategy: (times: number) => {
      // Allow up to 30 reconnect attempts (~2-3 minutes total).
      // This tolerates macOS sleep/wake cycles where the loopback Redis socket
      // is briefly disrupted and needs time to re-establish.
      if (times > 30) {
        console.error('[Redis] Max retry attempts reached');
        return null;
      }
      return Math.min(times * 500, 5000);
    },
    maxRetriesPerRequest: 3,
  });

  client.on('connect', () => console.log('[Redis] Connected'));
  client.on('error', (err: Error) => console.error('[Redis] Error:', err.message));
  client.on('close', () => console.log('[Redis] Connection closed'));

  return client;
}

export const SessionKeys = {
  /** Session key now includes threadId for isolation (茶话会夺魂 bug fix #38) */
  session: (userId: string, agentId: string, threadId: string) => `sessions:${userId}:${agentId}:${threadId}`,
  /** Per-agent delivery cursor for exact incremental context transport */
  deliveryCursor: (userId: string, agentId: string, threadId: string) => `delivery-cursor:${userId}:${agentId}:${threadId}`,
  /** Per-agent mention ack cursor — tracks last acknowledged @mention (#77) */
  mentionAck: (userId: string, agentId: string, threadId: string) => `mention-ack:${userId}:${agentId}:${threadId}`,
  agentState: (agentId: string) => `state:${agentId}`,
  taskQueue: (agentId: string) => `tasks:${agentId}`,
  messageChannel: () => 'chat:messages',
} as const;

/**
 * Lua script: atomic compare-and-set for monotonic cursor advancement.
 * SET key to value only if value > current (lexicographic). Sets TTL on success.
 * KEYS[1] = cursor key, ARGV[1] = new value, ARGV[2] = TTL seconds.
 * Returns 1 if set, 0 if noop.
 */
const SET_IF_GREATER_LUA = `
local cur = redis.call('GET', KEYS[1])
if cur and ARGV[1] <= cur then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
return 1
`;

export class SessionStore {
  constructor(public readonly redis: RedisClient) {}

  async getSessionId(userId: string, agentId: string, threadId: string): Promise<string | null> {
    return this.redis.get(SessionKeys.session(userId, agentId, threadId));
  }

  async setSessionId(
    userId: string,
    agentId: string,
    threadId: string,
    sessionId: string,
    ttlSeconds = 86400,
  ): Promise<void> {
    await this.redis.set(SessionKeys.session(userId, agentId, threadId), sessionId, 'EX', ttlSeconds);
  }

  async deleteSession(userId: string, agentId: string, threadId: string): Promise<void> {
    await this.redis.del(SessionKeys.session(userId, agentId, threadId));
  }

  async getDeliveryCursor(userId: string, agentId: string, threadId: string): Promise<string | null> {
    return this.redis.get(SessionKeys.deliveryCursor(userId, agentId, threadId));
  }

  /**
   * Atomically set delivery cursor only if messageId > current value.
   * Uses Lua script for atomic compare-and-set to prevent concurrent regression.
   * Returns true if cursor was advanced, false if noop.
   */
  async setDeliveryCursor(
    userId: string,
    agentId: string,
    threadId: string,
    messageId: string,
    ttlSeconds = 604800, // 7 days (#40)
  ): Promise<boolean> {
    const key = SessionKeys.deliveryCursor(userId, agentId, threadId);
    const result = (await this.redis.eval(SET_IF_GREATER_LUA, 1, key, messageId, String(ttlSeconds))) as number;
    return result === 1;
  }

  async deleteDeliveryCursor(userId: string, agentId: string, threadId: string): Promise<number> {
    return this.redis.del(SessionKeys.deliveryCursor(userId, agentId, threadId));
  }

  /** Get the last acknowledged mention message ID for an agent in a thread (#77) */
  async getMentionAckCursor(userId: string, agentId: string, threadId: string): Promise<string | null> {
    return this.redis.get(SessionKeys.mentionAck(userId, agentId, threadId));
  }

  /**
   * Atomically set mention ack cursor only if messageId > current value.
   * Uses Lua script for atomic compare-and-set to prevent concurrent regression.
   * Returns true if cursor was advanced, false if noop (already at or past messageId).
   */
  async setMentionAckCursor(
    userId: string,
    agentId: string,
    threadId: string,
    messageId: string,
    ttlSeconds = 604800, // 7 days, same as delivery cursor
  ): Promise<boolean> {
    const key = SessionKeys.mentionAck(userId, agentId, threadId);
    const result = (await this.redis.eval(SET_IF_GREATER_LUA, 1, key, messageId, String(ttlSeconds))) as number;
    return result === 1;
  }

  /** Delete a mention ack cursor (#77) */
  async deleteMentionAckCursor(userId: string, agentId: string, threadId: string): Promise<number> {
    return this.redis.del(SessionKeys.mentionAck(userId, agentId, threadId));
  }

  async getAgentState(agentId: string): Promise<Record<string, unknown> | null> {
    const state = await this.redis.get(SessionKeys.agentState(agentId));
    if (!state) {
      return null;
    }
    try {
      return JSON.parse(state) as Record<string, unknown>;
    } catch (err) {
      console.error(`[SessionStore] Invalid JSON for key ${SessionKeys.agentState(agentId)}:`, err);
      return null;
    }
  }

  async setAgentState(agentId: string, state: Record<string, unknown>): Promise<void> {
    await this.redis.set(SessionKeys.agentState(agentId), JSON.stringify(state));
  }
}
