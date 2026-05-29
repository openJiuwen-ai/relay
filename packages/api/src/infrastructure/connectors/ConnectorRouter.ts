/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Connector Router
 * Routes inbound messages from external platforms to OfficeClaw threads.
 *
 * Flow:
 *   1. Dedup check (skip webhook retries)
 *   2. Lookup existing binding or create new thread + binding
 *   3. Post connector message to thread (with ConnectorSource)
 *   4. Broadcast to WebSocket
 *   5. Trigger agent invocation
 *
 * Follows ReviewRouter pattern but for chat platform messages.
 *
 * F088 Multi-Platform Chat Gateway
 */

import type { AgentId, ConnectorSource, MessageContent } from '@openjiuwen/relay-shared';
import { getConnectorDefinition, officeClawRegistry } from '@openjiuwen/relay-shared';
import type { FastifyBaseLogger } from 'fastify';
import { FRONTEND_DEFAULT_USER_ID } from '../../utils/request-identity.js';
import { userVisibleFields } from '../logger.js';
import type { ConnectorCommandLayer } from './ConnectorCommandLayer.js';
import { ConnectorMessageFormatter } from './ConnectorMessageFormatter.js';
import type { IConnectorPermissionStore } from './ConnectorPermissionStore.js';
import type { IConnectorThreadBindingStore } from './ConnectorThreadBindingStore.js';
import type { InboundMessageDedup } from './InboundMessageDedup.js';
import { parseMentions } from './mention-parser.js';
import type { IOutboundAdapter } from './OutboundDeliveryHook.js';

function emitConnectorMessage(
  socketManager:
    | {
        broadcastToRoom(room: string, event: string, data: unknown): void;
        emitToUser?(userId: string, event: string, data: unknown): void;
      }
    | null
    | undefined,
  threadId: string,
  msg: { id: string; content: string; source: ConnectorSource; timestamp: number },
  ownerUserId?: string,
): void {
  socketManager?.broadcastToRoom(`thread:${threadId}`, 'connector_message', {
    threadId,
    message: {
      id: msg.id,
      type: 'connector' as const,
      content: msg.content,
      source: msg.source,
      timestamp: msg.timestamp,
    },
  });
  // F157: For new threads, also emit directly to user (frontend hasn't joined thread room yet)
  if (ownerUserId && socketManager?.emitToUser) {
    socketManager.emitToUser(ownerUserId, 'connector_message', {
      threadId,
      message: {
        id: msg.id,
        type: 'connector' as const,
        content: msg.content,
        source: msg.source,
        timestamp: msg.timestamp,
      },
    });
  }
}

export type RouteResult =
  | { kind: 'routed'; threadId: string; messageId: string }
  | { kind: 'skipped'; reason: string }
  | { kind: 'command'; threadId?: string; messageId?: string };

export interface ConnectorRouterOptions {
  readonly bindingStore: IConnectorThreadBindingStore;
  readonly dedup: InboundMessageDedup;
  readonly messageStore: {
    append(input: {
      threadId: string;
      userId: string;
      agentId: null;
      content: string;
      source: ConnectorSource;
      mentions: AgentId[];
      timestamp: number;
    }): Promise<{ id: string }>;
  };
  readonly threadStore: {
    create(userId: string, title?: string, projectPath?: string): { id: string } | Promise<{ id: string }>;
    updateConnectorHubState(
      threadId: string,
      state: { v: 1; connectorId: string; externalChatId: string; createdAt: number; lastCommandAt?: number } | null,
    ): void | Promise<void>;
    updateLastActive(threadId: string): void | Promise<void>;
    get?(threadId: string):
      | {
          createdBy?: string;
          connectorHubState?: {
            v: 1;
            connectorId: string;
            externalChatId: string;
            createdAt: number;
            lastCommandAt?: number;
          };
        }
      | null
      | Promise<{
          createdBy?: string;
          connectorHubState?: {
            v: 1;
            connectorId: string;
            externalChatId: string;
            createdAt: number;
            lastCommandAt?: number;
          };
        } | null>;
  };
  readonly invokeTrigger: {
    trigger(
      threadId: string,
      agentId: AgentId,
      userId: string,
      message: string,
      messageId: string,
      contentBlocks?: readonly MessageContent[],
      policy?: unknown,
      sender?: { id: string; name?: string },
    ): void;
  };
  readonly socketManager?:
    | {
        broadcastToRoom(room: string, event: string, data: unknown): void;
        emitToUser?(userId: string, event: string, data: unknown): void;
      }
    | undefined;
  readonly defaultUserIdResolver?: (() => string) | undefined;
  readonly defaultUserId: string;
  readonly defaultAgentId: AgentId;
  readonly log: FastifyBaseLogger;
  readonly commandLayer?: ConnectorCommandLayer | undefined;
  readonly permissionStore?: IConnectorPermissionStore | undefined;
  readonly adapters?: Map<string, IOutboundAdapter> | undefined;
  readonly mediaService?:
    | {
        download(
          connectorId: string,
          attachment: {
            type: 'image' | 'file' | 'audio';
            platformKey: string;
            fileName?: string;
            duration?: number;
          },
        ): Promise<{ localUrl: string; absPath: string; mimeType: string }>;
      }
    | undefined;
  readonly sttProvider?:
    | {
        transcribe(request: { audioPath: string; language?: string }): Promise<{ text: string }>;
      }
    | undefined;
}

export class ConnectorRouter {
  private readonly formatter = new ConnectorMessageFormatter();
  private readonly hubThreadResolvers = new Map<string, Promise<string | undefined>>();
  /** Per-chat mutex lock to prevent concurrent route() calls from creating duplicate threads. */
  private readonly routeLocks = new Map<string, Promise<unknown>>();
  constructor(private readonly opts: ConnectorRouterOptions) {}

  private normalizeOwnerUserId(candidate?: string | null): string | null {
    const trimmed = candidate?.trim();
    if (!trimmed || trimmed === FRONTEND_DEFAULT_USER_ID) return null;
    return trimmed;
  }

  /**
   * Resolve the effective owner userId at call time.
   * Prefers bound userId from connector-thread binding when available.
   * Refuses to treat the browser fallback identity ("default-user") as a real connector owner.
   */
  private resolveOwnerUserId(preferredUserId?: string): string | null {
    const boundUserId = this.normalizeOwnerUserId(preferredUserId);
    if (boundUserId) return boundUserId;
    const resolvedOwnerUserId = this.normalizeOwnerUserId(this.opts.defaultUserIdResolver?.());
    if (resolvedOwnerUserId) return resolvedOwnerUserId;
    const dynamicOwnerUserId = this.normalizeOwnerUserId(process.env.DEFAULT_OWNER_USER_ID);
    if (dynamicOwnerUserId) return dynamicOwnerUserId;
    return this.normalizeOwnerUserId(this.opts.defaultUserId);
  }

  /**
   * Per-chat mutex: serialize concurrent route() calls for the same connectorId:externalChatId.
   * Prevents the race where two Feishu events (text + file) for the same chat both create threads.
   */
  private async withRouteLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.routeLocks.get(key) ?? Promise.resolve();
    const next = prev.then(() => fn());
    this.routeLocks.set(key, next);
    try {
      return await next;
    } finally {
      if (this.routeLocks.get(key) === next) {
        this.routeLocks.delete(key);
      }
    }
  }

  /** Build @-mention patterns from officeClawRegistry for parseMentions. */
  private getMentionPatterns(): Map<string, string[]> {
    const patterns = new Map<string, string[]>();
    for (const agentId of officeClawRegistry.getAllIds()) {
      const entry = officeClawRegistry.tryGet(agentId);
      if (!entry?.config) continue;

      const derived = new Set<string>(entry.config.mentionPatterns ?? []);
      for (const raw of [
        entry.config.displayName,
        entry.config.name,
        entry.config.nickname,
        entry.config.id,
        agentId,
      ]) {
        if (typeof raw !== 'string') continue;
        const value = raw.trim();
        if (!value) continue;
        derived.add(value.startsWith('@') ? value : `@${value}`);
      }
      if (derived.size > 0) {
        patterns.set(agentId, [...derived]);
      }
    }
    return patterns;
  }

  async route(
    connectorId: string,
    externalChatId: string,
    text: string,
    externalMessageId: string,
    attachments?: Array<{
      type: 'image' | 'file' | 'audio';
      platformKey: string;
      fileName?: string;
      duration?: number;
      messageId?: string;
    }>,
    sender?: { id: string; name?: string },
    chatType?: 'p2p' | 'group',
    chatName?: string,
  ): Promise<RouteResult> {
    const lockKey = `${connectorId}:${externalChatId}`;
    return this.withRouteLock(lockKey, async () => {
      const { bindingStore, dedup, messageStore, threadStore, invokeTrigger, socketManager, log } = this.opts;

      // 1. Dedup check
      if (dedup.isDuplicate(connectorId, externalChatId, externalMessageId)) {
        log.info({ connectorId, externalMessageId }, '[ConnectorRouter] Duplicate message skipped');
        return { kind: 'skipped', reason: 'duplicate' };
      }

      const trimmedText = text.trim();

      // Resolve binding + owner early so invalid legacy bindings do not keep routing into "未登录/default-user".
      let binding = await bindingStore.getByExternal(connectorId, externalChatId);
      if (binding && !this.normalizeOwnerUserId(binding.userId)) {
        log.warn(
          { connectorId, externalChatId, threadId: binding.threadId, userId: binding.userId },
          '[ConnectorRouter] Dropping invalid connector binding with unresolved owner',
        );
        await bindingStore.remove(connectorId, externalChatId);
        binding = null;
      }

      const bindingUserId = this.normalizeOwnerUserId(binding?.userId);
      let ownerUserId = bindingUserId;

      if (!ownerUserId && chatType === 'group' && sender?.id) {
        const senderDmBinding = await bindingStore.getByExternal(connectorId, sender.id);
        if (senderDmBinding) {
          ownerUserId = this.normalizeOwnerUserId(senderDmBinding.userId);
          log.info(
            { connectorId, externalChatId, senderId: sender.id, resolvedOwner: ownerUserId },
            '[ConnectorRouter] Group owner resolved from sender DM binding',
          );
        }
      }

      if (!ownerUserId) {
        ownerUserId = this.resolveOwnerUserId();
      }

      if (!binding && !ownerUserId) {
        log.warn(
          { connectorId, externalChatId },
          '[ConnectorRouter] Owner unresolved, skipping inbound connector message',
        );
        return { kind: 'skipped', reason: 'owner_unresolved' };
      }

      // F152: Resolve userId for permission checks
      const permUserId = (bindingUserId || ownerUserId)!;

      // 1a. F134 Phase D: Group whitelist check
      if (chatType === 'group' && this.opts.permissionStore) {
        const commandName = trimmedText.split(/\s+/, 1)[0]?.toLowerCase();
        const isAdminAllowGroupCommand =
          this.opts.commandLayer &&
          sender &&
          commandName === '/allow-group' &&
          (await this.opts.permissionStore.isAdmin(permUserId, connectorId, sender.id));

        if (isAdminAllowGroupCommand) {
          log.info(
            { connectorId, externalChatId, senderId: sender.id },
            '[ConnectorRouter] Admin /allow-group bypasses whitelist precheck',
          );
        } else {
          const allowed = await this.opts.permissionStore.isGroupAllowed(permUserId, connectorId, externalChatId);
          if (!allowed) {
            const adapter = this.opts.adapters?.get(connectorId);
            if (adapter) {
              await adapter.sendReply(externalChatId, '🔒 此群未授权使用 bot。请联系管理员使用 /allow-group 授权。');
              // F151: close XiaoYi task immediately — no agent invocation will follow
              if (adapter.onDeliveryBatchDone) {
                await adapter.onDeliveryBatchDone(externalChatId, true).catch(() => {});
              }
            }
            log.info({ connectorId, externalChatId }, '[ConnectorRouter] Group not in whitelist, skipped');
            return { kind: 'skipped', reason: 'group_not_allowed' };
          }
        }
      }

      // 1a-2. F152: Personal user whitelist check (P2P and group)
      // Exception: /myid command is always allowed so users can discover their open_id
      if (this.opts.permissionStore && sender?.id) {
        const userWhitelistEnabled = await this.opts.permissionStore.isUserWhitelistEnabled(permUserId, connectorId);
        const commandName = trimmedText.split(/\s+/, 1)[0]?.toLowerCase();
        const isMyIdCommand = commandName === '/myid';

        if (userWhitelistEnabled && !isMyIdCommand) {
          // Check if sender is the QR scanner (owner) - exempt from whitelist
          const ownerOpenId = await this.opts.permissionStore.getOwnerOpenId(permUserId, connectorId);
          if (sender.id === ownerOpenId) {
            log.info({ connectorId, senderId: sender.id }, '[ConnectorRouter] QR scanner bypasses user whitelist');
          } else {
            // Check if sender is in the whitelist
            const allowedUsers = await this.opts.permissionStore.listAllowedUsers(permUserId, connectorId);
            const inWhitelist = allowedUsers.some((u) => u.openId === sender.id);

            if (!inWhitelist) {
              const adapter = this.opts.adapters?.get(connectorId);
              if (adapter) {
                await adapter.sendReply(
                  externalChatId,
                  '🔒 您不在授权白名单中，请发送您的 open_id 给管理员开通白名单。如需获取 open_id，请给我发送 /myid 命令。',
                );
                if (adapter.onDeliveryBatchDone) {
                  await adapter.onDeliveryBatchDone(externalChatId, true).catch(() => {});
                }
              }
              log.info({ connectorId, senderId: sender.id }, '[ConnectorRouter] User not in whitelist, skipped');
              return { kind: 'skipped', reason: 'user_not_allowed' };
            }
          }
        }
      }

      // 1b. Command interception — handle /commands before agent routing
      if (this.opts.commandLayer && trimmedText.startsWith('/')) {
        // F134 Phase D: admin-only commands in group chats
        if (chatType === 'group' && sender && this.opts.permissionStore) {
          const isAdmin = await this.opts.permissionStore.isAdmin(permUserId, connectorId, sender.id);
          const cmdAdminOnly = await this.opts.permissionStore.isCommandAdminOnly(permUserId, connectorId);
          if (cmdAdminOnly && !isAdmin) {
            const adapter = this.opts.adapters?.get(connectorId);
            if (adapter) {
              await adapter.sendReply(externalChatId, '🔒 此命令仅管理员可用。');
              // F151: close XiaoYi task immediately — no agent invocation will follow
              if (adapter.onDeliveryBatchDone) {
                await adapter.onDeliveryBatchDone(externalChatId, true).catch(() => {});
              }
            }
            log.info({ connectorId, senderId: sender.id }, '[ConnectorRouter] Non-admin command in group, blocked');
            return { kind: 'skipped', reason: 'command_admin_only' };
          }
        }
        const cmdResult = await this.opts.commandLayer.handle(
          connectorId,
          externalChatId,
          ownerUserId!,
          text,
          sender?.id,
        );
        if (cmdResult.kind !== 'not-command' && cmdResult.response) {
          const adapter = this.opts.adapters?.get(connectorId);
          if (adapter) {
            if (adapter.sendFormattedReply) {
              const envelope = this.formatter.formatCommand(cmdResult.response);
              await adapter.sendFormattedReply(externalChatId, envelope);
            } else {
              await adapter.sendReply(externalChatId, cmdResult.response);
            }
            // F151: close XiaoYi task — command response is the final output
            if (adapter.onDeliveryBatchDone) {
              await adapter.onDeliveryBatchDone(externalChatId, true).catch(() => {});
            }
          }
          // ISSUE-8 (8A): Store command exchange in Hub thread, not conversation thread
          const cmdDef = getConnectorDefinition(connectorId);
          const chatLabel =
            chatType === 'group'
              ? `${cmdDef?.displayName ?? connectorId}群聊 · ${chatName || externalChatId.slice(-8)}`
              : undefined;
          const hubThreadId = await this.resolveHubThread(connectorId, externalChatId, chatLabel);
          const stored = await this.storeCommandExchange(connectorId, hubThreadId, text, cmdResult.response);
          log.info(
            { connectorId, command: cmdResult.kind, hubThreadId },
            '[ConnectorRouter] Command handled → Hub thread',
          );

          // /thread: forward message content to the target thread
          if (cmdResult.forwardContent && cmdResult.newActiveThreadId) {
            const fwdThreadId = cmdResult.newActiveThreadId;
            const fwdText = cmdResult.forwardContent;
            const def2 = getConnectorDefinition(connectorId);
            const fwdSource: ConnectorSource = {
              connector: connectorId,
              label: def2?.displayName ?? connectorId,
              icon: def2?.icon ?? 'message',
            };
            const mentionPatterns = this.getMentionPatterns();
            const { targetAgentId } = parseMentions(fwdText, mentionPatterns, this.opts.defaultAgentId);
            const fwdTimestamp = Date.now();
            const fwdStored = await messageStore.append({
              threadId: fwdThreadId,
              userId: ownerUserId!,
              agentId: null,
              content: fwdText,
              source: fwdSource,
              mentions: [targetAgentId],
              timestamp: fwdTimestamp,
            });
            emitConnectorMessage(socketManager, fwdThreadId, {
              id: fwdStored.id,
              content: fwdText,
              source: fwdSource,
              timestamp: fwdTimestamp,
            });
            invokeTrigger.trigger(fwdThreadId, targetAgentId, ownerUserId!, fwdText, fwdStored.id);
            log.info({ connectorId, threadId: fwdThreadId }, '[ConnectorRouter] /thread message forwarded');
            return { kind: 'routed', threadId: fwdThreadId, messageId: fwdStored.id };
          }

          const result: RouteResult = { kind: 'command' };
          if (hubThreadId) (result as { threadId?: string }).threadId = hubThreadId;
          if (stored?.responseId) (result as { messageId?: string }).messageId = stored.responseId;
          return result;
        }
      }

      // Phase 5+6: Process media attachments
      let resolvedText = text;
      let contentBlocks: MessageContent[] | undefined;
      if (attachments?.length && this.opts.mediaService) {
        const result = await this.processAttachments(connectorId, text, attachments);
        resolvedText = result.text;
        if (result.contentBlocks.length > 0) contentBlocks = result.contentBlocks;
      }

      // 2. Lookup or create binding
      let isNewThread = false;
      if (!binding) {
        isNewThread = true;
        const def = getConnectorDefinition(connectorId);
        const groupLabel = def?.displayName ?? connectorId;
        const title =
          chatType === 'group'
            ? `${groupLabel}群聊 · ${chatName || externalChatId.slice(-8)}`
            : `${def?.displayName ?? connectorId} DM`;
        const thread = await threadStore.create(ownerUserId!, title);
        binding = await bindingStore.bind(connectorId, externalChatId, thread.id, ownerUserId!);
        socketManager?.emitToUser?.(ownerUserId!, 'thread_created', {
          threadId: thread.id,
          source: 'connector_auto',
        });
        log.info(
          { connectorId, externalChatId, threadId: thread.id },
          '[ConnectorRouter] New thread created for external chat',
        );
      }

      // 3. Post connector message
      const def = getConnectorDefinition(connectorId);
      const source: ConnectorSource = {
        connector: connectorId,
        label:
          chatType === 'group'
            ? `${def?.displayName ?? connectorId}群聊 · ${chatName || externalChatId.slice(-8)}`
            : (def?.displayName ?? connectorId),
        icon: def?.icon ?? 'message',
        ...(sender ? { sender } : {}),
      };

      // Parse @-mentions to determine target agent
      const mentionPatterns = this.getMentionPatterns();
      const { targetAgentId } = parseMentions(resolvedText, mentionPatterns, this.opts.defaultAgentId);
      log.debug(
        {
          connectorId,
          externalChatId,
          targetAgentId,
          defaultAgentId: this.opts.defaultAgentId,
          hasAtSign: resolvedText.includes('@'),
          contentLen: resolvedText.length,
        },
        '[ConnectorRouter] Mention parse result',
      );

      const messageTimestamp = Date.now();
      const stored = await messageStore.append({
        threadId: binding.threadId,
        userId: ownerUserId!,
        agentId: null,
        content: resolvedText,
        source,
        mentions: [targetAgentId],
        timestamp: messageTimestamp,
      });

      // Update thread lastActiveAt so it appears at top of sidebar list
      await this.opts.threadStore.updateLastActive(binding.threadId);

      // 4. Broadcast to WebSocket
      // F157: Pass ownerUserId so connector_message is sent via emitToUser for sidebar real-time updates
      emitConnectorMessage(
        socketManager,
        binding.threadId,
        {
          id: stored.id,
          content: resolvedText,
          source,
          timestamp: messageTimestamp,
        },
        ownerUserId ?? undefined,
      );

      // 5. Trigger agent invocation (use parsed targetAgentId)
      invokeTrigger.trigger(
        binding.threadId,
        targetAgentId,
        ownerUserId!,
        resolvedText,
        stored.id,
        contentBlocks,
        undefined,
        sender,
      );

      log.info(
        userVisibleFields('critical', {
          connectorId,
          externalChatId,
          threadId: binding.threadId,
          messageId: stored.id,
        }),
        '[ConnectorRouter] Message routed',
      );

      return {
        kind: 'routed',
        threadId: binding.threadId,
        messageId: stored.id,
      };
    }); // withRouteLock
  }

  private async processAttachments(
    connectorId: string,
    originalText: string,
    attachments: Array<{
      type: 'image' | 'file' | 'audio';
      platformKey: string;
      fileName?: string;
      duration?: number;
      messageId?: string;
    }>,
  ): Promise<{ text: string; contentBlocks: MessageContent[] }> {
    const parts: string[] = [];
    const contentBlocks: MessageContent[] = [];

    for (const att of attachments) {
      try {
        const downloaded = await this.opts.mediaService?.download(connectorId, att);
        if (!downloaded) {
          throw new Error(`Media service unavailable for ${connectorId}`);
        }

        if (att.type === 'audio' && this.opts.sttProvider) {
          try {
            const result = await this.opts.sttProvider.transcribe({ audioPath: downloaded.absPath });
            parts.push(`🎤 ${result.text}`);
          } catch (sttErr) {
            this.opts.log.warn({ err: sttErr, connectorId }, '[ConnectorRouter] STT failed, using placeholder');
            parts.push(originalText);
          }
        } else if (att.type === 'image') {
          parts.push(`${originalText} ${downloaded.localUrl}`);
          contentBlocks.push({ type: 'image', url: downloaded.absPath });
        } else {
          parts.push(`${originalText} ${downloaded.localUrl}`);
        }
      } catch (err) {
        this.opts.log.warn({ err, connectorId }, '[ConnectorRouter] Media download failed');
        parts.push(originalText);
      }
    }

    return { text: parts.length > 0 ? parts.join('\n') : originalText, contentBlocks };
  }

  private async resolveHubThread(
    connectorId: string,
    externalChatId: string,
    chatLabel?: string,
  ): Promise<string | undefined> {
    const key = `${connectorId}:${externalChatId}`;
    const inFlight = this.hubThreadResolvers.get(key);
    if (inFlight) return inFlight;

    const binding = await this.opts.bindingStore.getByExternal(connectorId, externalChatId);
    if (!binding) return undefined;
    const ownerUserId = this.resolveOwnerUserId(binding.userId);
    if (!ownerUserId) return undefined;
    const reusableHubThreadId = await this.resolveReusableHubThreadId(
      binding,
      ownerUserId,
      connectorId,
      externalChatId,
    );
    if (reusableHubThreadId) return reusableHubThreadId;

    const inFlightAfterRead = this.hubThreadResolvers.get(key);
    if (inFlightAfterRead) return inFlightAfterRead;

    const creation = this.resolveHubThreadOnce(connectorId, externalChatId, chatLabel).finally(() => {
      if (this.hubThreadResolvers.get(key) === creation) {
        this.hubThreadResolvers.delete(key);
      }
    });
    this.hubThreadResolvers.set(key, creation);
    return creation;
  }

  private async resolveHubThreadOnce(
    connectorId: string,
    externalChatId: string,
    chatLabel?: string,
  ): Promise<string | undefined> {
    const { bindingStore, threadStore, log, socketManager } = this.opts;
    const binding = await bindingStore.getByExternal(connectorId, externalChatId);
    if (!binding) return undefined;
    const ownerUserId = this.resolveOwnerUserId(binding.userId);
    if (!ownerUserId) return undefined;
    const reusableHubThreadId = await this.resolveReusableHubThreadId(
      binding,
      ownerUserId,
      connectorId,
      externalChatId,
    );
    if (reusableHubThreadId) return reusableHubThreadId;

    const def = getConnectorDefinition(connectorId);
    const label = def?.displayName ?? connectorId;
    const hubTitle = chatLabel ? `${chatLabel} IM Hub` : `${label} IM Hub`;
    const hubThread = await threadStore.create(ownerUserId, hubTitle);
    await threadStore.updateConnectorHubState(hubThread.id, {
      v: 1,
      connectorId,
      externalChatId,
      createdAt: Date.now(),
    });
    await bindingStore.setHubThread(connectorId, externalChatId, hubThread.id);
    socketManager?.emitToUser?.(ownerUserId, 'thread_created', {
      threadId: hubThread.id,
      source: 'connector_hub',
    });
    log.info({ connectorId, externalChatId, hubThreadId: hubThread.id }, '[ConnectorRouter] Hub thread created');
    return hubThread.id;
  }

  private async resolveReusableHubThreadId(
    binding: { hubThreadId?: string },
    ownerUserId: string,
    connectorId: string,
    externalChatId: string,
  ): Promise<string | undefined> {
    const hubThreadId = binding.hubThreadId?.trim();
    if (!hubThreadId) return undefined;
    if (!this.opts.threadStore.get) return hubThreadId;

    const hubThread = await this.opts.threadStore.get(hubThreadId);
    if (!hubThread) return undefined;
    if (hubThread.createdBy && hubThread.createdBy !== ownerUserId) return undefined;
    if (!hubThread.connectorHubState) return undefined;
    if (hubThread.connectorHubState.connectorId !== connectorId) return undefined;
    if (hubThread.connectorHubState.externalChatId !== externalChatId) return undefined;
    return hubThreadId;
  }

  private async storeCommandExchange(
    connectorId: string,
    threadId: string | undefined,
    commandText: string,
    responseText: string,
  ): Promise<{ commandId: string; responseId: string } | undefined> {
    if (!threadId) return undefined;
    const { messageStore, socketManager } = this.opts;
    const def = getConnectorDefinition(connectorId);
    const now = Date.now();
    const commandTimestamp = now;
    const responseTimestamp = now + 1;

    // Store inbound command
    const cmdMsg = await messageStore.append({
      threadId,
      userId: this.resolveOwnerUserId() ?? FRONTEND_DEFAULT_USER_ID,
      agentId: null,
      content: commandText,
      source: { connector: connectorId, label: def?.displayName ?? connectorId, icon: def?.icon ?? 'message' },
      mentions: [],
      timestamp: commandTimestamp,
    });

    // Store outbound system response
    const resMsg = await messageStore.append({
      threadId,
      userId: this.resolveOwnerUserId() ?? FRONTEND_DEFAULT_USER_ID,
      agentId: null,
      content: responseText,
      source: { connector: 'system-command', label: 'OfficeClaw', icon: 'settings' },
      mentions: [],
      timestamp: responseTimestamp,
    });

    // Broadcast both
    emitConnectorMessage(socketManager, threadId, {
      id: cmdMsg.id,
      content: commandText,
      source: { connector: connectorId, label: def?.displayName ?? connectorId, icon: def?.icon ?? 'message' },
      timestamp: commandTimestamp,
    });
    emitConnectorMessage(socketManager, threadId, {
      id: resMsg.id,
      content: responseText,
      source: { connector: 'system-command', label: 'OfficeClaw', icon: 'settings' },
      timestamp: responseTimestamp,
    });

    // G+: Update lastCommandAt on the Hub thread for audit visibility
    const { threadStore } = this.opts;
    if (threadStore.get) {
      const thread = await threadStore.get(threadId);
      if (thread?.connectorHubState) {
        await threadStore.updateConnectorHubState(threadId, {
          ...thread.connectorHubState,
          lastCommandAt: now,
        });
      }
    }

    return { commandId: cmdMsg.id, responseId: resMsg.id };
  }
}
