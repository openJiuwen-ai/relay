/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F134 Phase D: Connector Permission Store
 * Manages group whitelist + admin list + command restriction settings.
 *
 * Two implementations:
 * - MemoryConnectorPermissionStore: for tests and dev fallback
 * - RedisConnectorPermissionStore: for production (persists across restarts)
 */

import type { RedisClient } from '@openjiuwen/relay-shared/utils';

export interface GroupEntry {
  readonly externalChatId: string;
  readonly label?: string;
  readonly addedAt: number;
}

/** F152: Personal user whitelist entry for controlling who can @bot */
export interface UserWhitelistEntry {
  readonly openId: string;      // Feishu/Lark user open_id
  readonly name?: string;       // Display name (optional, from Contact API)
  readonly addedAt: number;     // Timestamp when added
  readonly addedBy?: string;    // userId who added this entry (for audit)
}

export interface PermissionConfig {
  readonly whitelistEnabled: boolean;
  readonly commandAdminOnly: boolean;
  readonly adminOpenIds: readonly string[];
  readonly allowedGroups: readonly GroupEntry[];

  // F152: Personal user whitelist
  readonly userWhitelistEnabled: boolean;    // Toggle for user whitelist check
  readonly allowedUsers: readonly UserWhitelistEntry[];  // Whitelist users
  readonly ownerOpenId?: string;             // QR scanner's open_id (exempt from check)
}

export interface IConnectorPermissionStore {
  // === Group whitelist (all methods require userId for multi-user isolation) ===

  /** Check if a group chat is allowed (returns true if whitelist disabled OR group in whitelist). */
  isGroupAllowed(userId: string, connectorId: string, externalChatId: string): Promise<boolean>;
  allowGroup(userId: string, connectorId: string, externalChatId: string, label?: string): Promise<void>;
  denyGroup(userId: string, connectorId: string, externalChatId: string): Promise<boolean>;
  listAllowedGroups(userId: string, connectorId: string): Promise<readonly GroupEntry[]>;

  isWhitelistEnabled(userId: string, connectorId: string): Promise<boolean>;
  setWhitelistEnabled(userId: string, connectorId: string, enabled: boolean): Promise<void>;

  // === Admin management ===

  isAdmin(userId: string, connectorId: string, senderOpenId: string): Promise<boolean>;
  getAdminOpenIds(userId: string, connectorId: string): Promise<readonly string[]>;
  setAdminOpenIds(userId: string, connectorId: string, openIds: string[]): Promise<void>;

  isCommandAdminOnly(userId: string, connectorId: string): Promise<boolean>;
  setCommandAdminOnly(userId: string, connectorId: string, enabled: boolean): Promise<void>;

  /** True if admin config has ever been explicitly written (even if empty). */
  hasAdminConfig(userId: string, connectorId: string): Promise<boolean>;

  // === F152: Personal user whitelist ===

  /** Check if a Feishu user is allowed (returns true if whitelist disabled OR user in whitelist OR user is owner). */
  isUserAllowed(userId: string, connectorId: string, openId: string): Promise<boolean>;
  allowUser(userId: string, connectorId: string, openId: string, name?: string): Promise<void>;
  denyUser(userId: string, connectorId: string, openId: string): Promise<boolean>;
  listAllowedUsers(userId: string, connectorId: string): Promise<readonly UserWhitelistEntry[]>;

  isUserWhitelistEnabled(userId: string, connectorId: string): Promise<boolean>;
  setUserWhitelistEnabled(userId: string, connectorId: string, enabled: boolean): Promise<void>;

  /** Get the QR scanner's open_id (ownerOpenId) - exempt from whitelist check. */
  getOwnerOpenId(userId: string, connectorId: string): Promise<string | undefined>;
  setOwnerOpenId(userId: string, connectorId: string, openId: string): Promise<void>;

  /** Full snapshot for API/UI consumption. */
  getConfig(userId: string, connectorId: string): Promise<PermissionConfig>;
}

export class MemoryConnectorPermissionStore implements IConnectorPermissionStore {
  // Maps keyed by composite key: "{userId}:{connectorId}"
  private whitelistEnabled = new Map<string, boolean>();
  private commandAdminOnly = new Map<string, boolean>();
  private adminOpenIds = new Map<string, string[]>();
  private allowedGroups = new Map<string, Map<string, GroupEntry>>();

  // F152: Personal user whitelist
  private userWhitelistEnabled = new Map<string, boolean>();
  private allowedUsers = new Map<string, Map<string, UserWhitelistEntry>>();
  private ownerOpenIds = new Map<string, string>();

  private compositeKey(userId: string, connectorId: string): string {
    return `${userId}:${connectorId}`;
  }

  async isGroupAllowed(userId: string, connectorId: string, externalChatId: string): Promise<boolean> {
    const key = this.compositeKey(userId, connectorId);
    if (!this.whitelistEnabled.get(key)) return true;
    const groups = this.allowedGroups.get(key);
    return groups?.has(externalChatId) ?? false;
  }

  async allowGroup(userId: string, connectorId: string, externalChatId: string, label?: string): Promise<void> {
    const key = this.compositeKey(userId, connectorId);
    let groups = this.allowedGroups.get(key);
    if (!groups) {
      groups = new Map();
      this.allowedGroups.set(key, groups);
    }
    groups.set(externalChatId, { externalChatId, label, addedAt: Date.now() });
  }

  async denyGroup(userId: string, connectorId: string, externalChatId: string): Promise<boolean> {
    const key = this.compositeKey(userId, connectorId);
    const groups = this.allowedGroups.get(key);
    return groups?.delete(externalChatId) ?? false;
  }

  async listAllowedGroups(userId: string, connectorId: string): Promise<readonly GroupEntry[]> {
    const key = this.compositeKey(userId, connectorId);
    const groups = this.allowedGroups.get(key);
    return groups ? [...groups.values()] : [];
  }

  async isWhitelistEnabled(userId: string, connectorId: string): Promise<boolean> {
    return this.whitelistEnabled.get(this.compositeKey(userId, connectorId)) ?? false;
  }

  async setWhitelistEnabled(userId: string, connectorId: string, enabled: boolean): Promise<void> {
    this.whitelistEnabled.set(this.compositeKey(userId, connectorId), enabled);
  }

  async isAdmin(userId: string, connectorId: string, senderOpenId: string): Promise<boolean> {
    const admins = this.adminOpenIds.get(this.compositeKey(userId, connectorId));
    return admins?.includes(senderOpenId) ?? false;
  }

  async getAdminOpenIds(userId: string, connectorId: string): Promise<readonly string[]> {
    return this.adminOpenIds.get(this.compositeKey(userId, connectorId)) ?? [];
  }

  async setAdminOpenIds(userId: string, connectorId: string, openIds: string[]): Promise<void> {
    this.adminOpenIds.set(this.compositeKey(userId, connectorId), [...openIds]);
  }

  async hasAdminConfig(userId: string, connectorId: string): Promise<boolean> {
    return this.adminOpenIds.has(this.compositeKey(userId, connectorId));
  }

  async isCommandAdminOnly(userId: string, connectorId: string): Promise<boolean> {
    return this.commandAdminOnly.get(this.compositeKey(userId, connectorId)) ?? false;
  }

  async setCommandAdminOnly(userId: string, connectorId: string, enabled: boolean): Promise<void> {
    this.commandAdminOnly.set(this.compositeKey(userId, connectorId), enabled);
  }

  // === F152: Personal user whitelist ===

  async isUserAllowed(userId: string, connectorId: string, openId: string): Promise<boolean> {
    const key = this.compositeKey(userId, connectorId);
    if (!this.userWhitelistEnabled.get(key)) return true;

    // Check if user is owner (QR scanner) - always exempt
    const ownerOpenId = this.ownerOpenIds.get(key);
    if (openId === ownerOpenId) return true;

    // Check whitelist
    const users = this.allowedUsers.get(key);
    return users?.has(openId) ?? false;
  }

  async allowUser(userId: string, connectorId: string, openId: string, name?: string): Promise<void> {
    const key = this.compositeKey(userId, connectorId);
    let users = this.allowedUsers.get(key);
    if (!users) {
      users = new Map();
      this.allowedUsers.set(key, users);
    }
    users.set(openId, { openId, name, addedAt: Date.now(), addedBy: userId });
  }

  async denyUser(userId: string, connectorId: string, openId: string): Promise<boolean> {
    const key = this.compositeKey(userId, connectorId);
    const users = this.allowedUsers.get(key);
    return users?.delete(openId) ?? false;
  }

  async listAllowedUsers(userId: string, connectorId: string): Promise<readonly UserWhitelistEntry[]> {
    const key = this.compositeKey(userId, connectorId);
    const users = this.allowedUsers.get(key);
    return users ? [...users.values()] : [];
  }

  async isUserWhitelistEnabled(userId: string, connectorId: string): Promise<boolean> {
    return this.userWhitelistEnabled.get(this.compositeKey(userId, connectorId)) ?? false;
  }

  async setUserWhitelistEnabled(userId: string, connectorId: string, enabled: boolean): Promise<void> {
    this.userWhitelistEnabled.set(this.compositeKey(userId, connectorId), enabled);
  }

  async getOwnerOpenId(userId: string, connectorId: string): Promise<string | undefined> {
    return this.ownerOpenIds.get(this.compositeKey(userId, connectorId));
  }

  async setOwnerOpenId(userId: string, connectorId: string, openId: string): Promise<void> {
    this.ownerOpenIds.set(this.compositeKey(userId, connectorId), openId);
  }

  async getConfig(userId: string, connectorId: string): Promise<PermissionConfig> {
    return {
      whitelistEnabled: await this.isWhitelistEnabled(userId, connectorId),
      commandAdminOnly: await this.isCommandAdminOnly(userId, connectorId),
      adminOpenIds: await this.getAdminOpenIds(userId, connectorId),
      allowedGroups: await this.listAllowedGroups(userId, connectorId),
      userWhitelistEnabled: await this.isUserWhitelistEnabled(userId, connectorId),
      allowedUsers: await this.listAllowedUsers(userId, connectorId),
      ownerOpenId: await this.getOwnerOpenId(userId, connectorId),
    };
  }
}

/**
 * Redis-backed permission store. Survives restarts.
 *
 * F152: Multi-user isolation - all keys include userId.
 * Keys (all prefixed by ioredis keyPrefix if configured):
 *   Hash  connector-perm:{userId}:{connectorId}         → { whitelistEnabled, commandAdminOnly, adminOpenIds (JSON), userWhitelistEnabled, ownerOpenId }
 *   Hash  connector-perm-groups:{userId}:{connectorId}  → { externalChatId → JSON({ label, addedAt }) }
 *   Hash  connector-perm-users:{userId}:{connectorId}   → { openId → JSON({ name, addedAt, addedBy }) }
 */
export class RedisConnectorPermissionStore implements IConnectorPermissionStore {
  constructor(private readonly redis: RedisClient) {}

  private compositeKey(userId: string, cid: string): string {
    return `${userId}:${cid}`;
  }

  private configKey(userId: string, cid: string): string {
    return `connector-perm:${this.compositeKey(userId, cid)}`;
  }
  private groupsKey(userId: string, cid: string): string {
    return `connector-perm-groups:${this.compositeKey(userId, cid)}`;
  }
  private usersKey(userId: string, cid: string): string {
    return `connector-perm-users:${this.compositeKey(userId, cid)}`;
  }

  async isGroupAllowed(userId: string, connectorId: string, externalChatId: string): Promise<boolean> {
    const enabled = await this.redis.hget(this.configKey(userId, connectorId), 'whitelistEnabled');
    if (enabled !== 'true') return true;
    const exists = await this.redis.hexists(this.groupsKey(userId, connectorId), externalChatId);
    return exists === 1;
  }

  async allowGroup(userId: string, connectorId: string, externalChatId: string, label?: string): Promise<void> {
    await this.redis.hset(this.groupsKey(userId, connectorId), externalChatId, JSON.stringify({ label, addedAt: Date.now() }));
  }

  async denyGroup(userId: string, connectorId: string, externalChatId: string): Promise<boolean> {
    const removed = await this.redis.hdel(this.groupsKey(userId, connectorId), externalChatId);
    return removed > 0;
  }

  async listAllowedGroups(userId: string, connectorId: string): Promise<readonly GroupEntry[]> {
    const all = await this.redis.hgetall(this.groupsKey(userId, connectorId));
    return Object.entries(all).map(([chatId, json]) => {
      const parsed = JSON.parse(json as string) as { label?: string; addedAt?: number };
      return { externalChatId: chatId, label: parsed.label, addedAt: parsed.addedAt ?? 0 };
    });
  }

  async isWhitelistEnabled(userId: string, connectorId: string): Promise<boolean> {
    return (await this.redis.hget(this.configKey(userId, connectorId), 'whitelistEnabled')) === 'true';
  }

  async setWhitelistEnabled(userId: string, connectorId: string, enabled: boolean): Promise<void> {
    await this.redis.hset(this.configKey(userId, connectorId), 'whitelistEnabled', String(enabled));
  }

  async isAdmin(userId: string, connectorId: string, senderOpenId: string): Promise<boolean> {
    const raw = await this.redis.hget(this.configKey(userId, connectorId), 'adminOpenIds');
    if (!raw) return false;
    const ids = JSON.parse(raw) as string[];
    return ids.includes(senderOpenId);
  }

  async getAdminOpenIds(userId: string, connectorId: string): Promise<readonly string[]> {
    const raw = await this.redis.hget(this.configKey(userId, connectorId), 'adminOpenIds');
    return raw ? (JSON.parse(raw) as string[]) : [];
  }

  async setAdminOpenIds(userId: string, connectorId: string, openIds: string[]): Promise<void> {
    await this.redis.hset(this.configKey(userId, connectorId), 'adminOpenIds', JSON.stringify(openIds));
  }

  async hasAdminConfig(userId: string, connectorId: string): Promise<boolean> {
    return (await this.redis.hexists(this.configKey(userId, connectorId), 'adminOpenIds')) === 1;
  }

  async isCommandAdminOnly(userId: string, connectorId: string): Promise<boolean> {
    return (await this.redis.hget(this.configKey(userId, connectorId), 'commandAdminOnly')) === 'true';
  }

  async setCommandAdminOnly(userId: string, connectorId: string, enabled: boolean): Promise<void> {
    await this.redis.hset(this.configKey(userId, connectorId), 'commandAdminOnly', String(enabled));
  }

  // === F152: Personal user whitelist ===

  async isUserAllowed(userId: string, connectorId: string, openId: string): Promise<boolean> {
    const key = this.configKey(userId, connectorId);
    const enabled = await this.redis.hget(key, 'userWhitelistEnabled');
    if (enabled !== 'true') return true;

    // Check if user is owner (QR scanner) - always exempt
    const ownerOpenId = await this.redis.hget(key, 'ownerOpenId');
    if (openId === ownerOpenId) return true;

    // Check whitelist
    const exists = await this.redis.hexists(this.usersKey(userId, connectorId), openId);
    return exists === 1;
  }

  async allowUser(userId: string, connectorId: string, openId: string, name?: string): Promise<void> {
    await this.redis.hset(this.usersKey(userId, connectorId), openId, JSON.stringify({ name, addedAt: Date.now(), addedBy: userId }));
  }

  async denyUser(userId: string, connectorId: string, openId: string): Promise<boolean> {
    const removed = await this.redis.hdel(this.usersKey(userId, connectorId), openId);
    return removed > 0;
  }

  async listAllowedUsers(userId: string, connectorId: string): Promise<readonly UserWhitelistEntry[]> {
    const all = await this.redis.hgetall(this.usersKey(userId, connectorId));
    return Object.entries(all).map(([openId, json]) => {
      const parsed = JSON.parse(json as string) as { name?: string; addedAt?: number; addedBy?: string };
      return { openId, name: parsed.name, addedAt: parsed.addedAt ?? 0, addedBy: parsed.addedBy };
    });
  }

  async isUserWhitelistEnabled(userId: string, connectorId: string): Promise<boolean> {
    return (await this.redis.hget(this.configKey(userId, connectorId), 'userWhitelistEnabled')) === 'true';
  }

  async setUserWhitelistEnabled(userId: string, connectorId: string, enabled: boolean): Promise<void> {
    await this.redis.hset(this.configKey(userId, connectorId), 'userWhitelistEnabled', String(enabled));
  }

  async getOwnerOpenId(userId: string, connectorId: string): Promise<string | undefined> {
    const raw = await this.redis.hget(this.configKey(userId, connectorId), 'ownerOpenId');
    return raw ?? undefined;
  }

  async setOwnerOpenId(userId: string, connectorId: string, openId: string): Promise<void> {
    await this.redis.hset(this.configKey(userId, connectorId), 'ownerOpenId', openId);
  }

  async getConfig(userId: string, connectorId: string): Promise<PermissionConfig> {
    return {
      whitelistEnabled: await this.isWhitelistEnabled(userId, connectorId),
      commandAdminOnly: await this.isCommandAdminOnly(userId, connectorId),
      adminOpenIds: await this.getAdminOpenIds(userId, connectorId),
      allowedGroups: await this.listAllowedGroups(userId, connectorId),
      userWhitelistEnabled: await this.isUserWhitelistEnabled(userId, connectorId),
      allowedUsers: await this.listAllowedUsers(userId, connectorId),
      ownerOpenId: await this.getOwnerOpenId(userId, connectorId),
    };
  }
}
