/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { resolve } from 'node:path';
import type { AgentId, ConnectorSource } from '@openjiuwen/relay-shared';
import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import * as lark from '@larksuiteoapi/node-sdk';
import type { FastifyBaseLogger } from 'fastify';
import type { ConnectorWebhookHandler, WebhookHandleResult } from '../../routes/connector-webhooks.js';
import { resolveOfficeClawHostRoot } from '../../utils/office-claw-root.js';
import { findMonorepoRoot } from '../../utils/monorepo-root.js';
import { FRONTEND_DEFAULT_USER_ID } from '../../utils/request-identity.js';
import {
  type ConnectorGatewayConfig,
  type ConnectorGatewayDeps,
  loadConnectorGatewayConfig,
} from './connector-gateway-bootstrap.js';
import { DingTalkAdapter } from './adapters/DingTalkAdapter.js';
import { FeishuAdapter } from './adapters/FeishuAdapter.js';
import { FeishuTokenManager } from './adapters/FeishuTokenManager.js';
import { WeixinAdapter } from './adapters/WeixinAdapter.js';
import { XiaoyiAdapter } from './adapters/XiaoyiAdapter.js';
import { assertSafeXiaoyiUri } from './adapters/xiaoyi-protocol.js';
import { ConnectorCommandLayer } from './ConnectorCommandLayer.js';
import {
  type IConnectorPermissionStore,
  MemoryConnectorPermissionStore,
  RedisConnectorPermissionStore,
} from './ConnectorPermissionStore.js';
import { ConnectorRouter } from './ConnectorRouter.js';
import type { IConnectorThreadBindingStore } from './ConnectorThreadBindingStore.js';
import { MemoryConnectorThreadBindingStore } from './ConnectorThreadBindingStore.js';
import { InboundMessageDedup } from './InboundMessageDedup.js';
import { resolveFeishuOpenApiBaseUrl } from './feishu-open-platform.js';
import { ConnectorMediaService } from './media/ConnectorMediaService.js';

const FEISHU_OPEN_API_BASE_URL = resolveFeishuOpenApiBaseUrl();
import { MediaCleanupJob } from './media/MediaCleanupJob.js';
import {
  type IOutboundAdapter,
  type IStreamableOutboundAdapter,
  OutboundDeliveryHook,
} from './OutboundDeliveryHook.js';
import { RedisConnectorThreadBindingStore } from './RedisConnectorThreadBindingStore.js';
import { StreamingOutboundHook } from './StreamingOutboundHook.js';
import { ConnectorOwnerStore, NoopConnectorOwnerStore, type IConnectorOwnerStore } from './ConnectorOwnerStore.js';
import { NoopWeixinSessionStore, type IWeixinSessionStore, WeixinSessionStore } from './WeixinSessionStore.js';

type ConnectorId = 'feishu' | 'dingtalk' | 'weixin' | 'xiaoyi';

export interface ConnectorRuntimeApplyError {
  readonly connectorId: ConnectorId;
  readonly message: string;
}

export interface ConnectorRuntimeApplySummary {
  applied: boolean;
  attemptedConnectors: ConnectorId[];
  appliedConnectors: ConnectorId[];
  unchangedConnectors: ConnectorId[];
  failedConnectors: ConnectorRuntimeApplyError[];
}

export interface ConnectorRuntimeReconciler {
  reconcile(changedKeys: string[]): Promise<ConnectorRuntimeApplySummary>;
  setOwnerUserId(userId: string): Promise<void> | void;
}

interface SharedContext {
  readonly log: FastifyBaseLogger;
  readonly deps: ConnectorGatewayDeps;
  readonly bindingStore: IConnectorThreadBindingStore;
  readonly permissionStore: IConnectorPermissionStore;
  readonly adapters: Map<string, IOutboundAdapter>;
  readonly streamableAdapters: Map<string, IStreamableOutboundAdapter>;
  readonly webhookHandlers: Map<string, ConnectorWebhookHandler>;
  readonly mediaService: ConnectorMediaService;
  readonly connectorRouter: ConnectorRouter;
  readonly cleanupJob: MediaCleanupJob;
  readonly ownerStore: IConnectorOwnerStore;
  readonly ownerUserIdState: { current: string };
  readonly weixinSessionStore: IWeixinSessionStore;
  readonly weixinAdapter: WeixinAdapter;
  readonly messageLookup:
    | ((messageId: string) => Promise<{ source?: { sender?: { id: string; name?: string } } } | null>)
    | undefined;
}

interface ConnectorRuntimeState {
  stop(): Promise<void>;
}

const CONNECTOR_IDS: readonly ConnectorId[] = ['feishu', 'dingtalk', 'weixin', 'xiaoyi'];

function emptySummary(): ConnectorRuntimeApplySummary {
  return {
    applied: true,
    attemptedConnectors: [],
    appliedConnectors: [],
    unchangedConnectors: [],
    failedConnectors: [],
  };
}

function uniqueConnectors(ids: Iterable<ConnectorId>): ConnectorId[] {
  return [...new Set(ids)];
}

function isStreamableAdapter(adapter: IOutboundAdapter): adapter is IStreamableOutboundAdapter {
  return 'sendPlaceholder' in adapter && 'editMessage' in adapter;
}

function normalizeConnectorOwnerUserId(candidate?: string | null): string | null {
  const trimmed = candidate?.trim();
  if (!trimmed || trimmed === FRONTEND_DEFAULT_USER_ID) return null;
  return trimmed;
}

function sameList(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '').trim() === (b ?? '').trim();
}

function connectorConfigured(config: ConnectorGatewayConfig, connectorId: ConnectorId): boolean {
  switch (connectorId) {
    case 'feishu': {
      const wsMode = config.feishuConnectionMode === 'websocket';
      return Boolean(config.feishuAppId && config.feishuAppSecret && (wsMode || config.feishuVerificationToken));
    }
    case 'dingtalk':
      return Boolean(config.dingtalkAppKey && config.dingtalkAppSecret);
    case 'weixin':
      return Boolean(config.weixinBotToken);
    case 'xiaoyi':
      return Boolean(config.xiaoyiAk && config.xiaoyiSk && config.xiaoyiAgentId);
  }
}

function connectorSliceChanged(
  connectorId: ConnectorId,
  prev: ConnectorGatewayConfig,
  next: ConnectorGatewayConfig,
): boolean {
  switch (connectorId) {
    case 'feishu':
      return (
        (prev.feishuAppId ?? '') !== (next.feishuAppId ?? '') ||
        (prev.feishuAppSecret ?? '') !== (next.feishuAppSecret ?? '') ||
        (prev.feishuVerificationToken ?? '') !== (next.feishuVerificationToken ?? '') ||
        (prev.feishuConnectionMode ?? 'webhook') !== (next.feishuConnectionMode ?? 'webhook') ||
        (prev.feishuBotOpenId ?? '') !== (next.feishuBotOpenId ?? '') ||
        !sameList(prev.feishuAdminOpenIds, next.feishuAdminOpenIds)
      );
    case 'dingtalk':
      return (
        (prev.dingtalkAppKey ?? '') !== (next.dingtalkAppKey ?? '') ||
        (prev.dingtalkAppSecret ?? '') !== (next.dingtalkAppSecret ?? '')
      );
    case 'weixin':
      return (prev.weixinBotToken ?? '') !== (next.weixinBotToken ?? '');
    case 'xiaoyi':
      return (
        (prev.xiaoyiAk ?? '') !== (next.xiaoyiAk ?? '') ||
        (prev.xiaoyiSk ?? '') !== (next.xiaoyiSk ?? '') ||
        (prev.xiaoyiAgentId ?? '') !== (next.xiaoyiAgentId ?? '')
      );
  }
}

export function inferConnectorsFromEnvKeys(changedKeys: readonly string[]): ConnectorId[] {
  const ids: ConnectorId[] = [];
  for (const key of changedKeys) {
    if (
      key === 'FEISHU_APP_ID' ||
      key === 'FEISHU_APP_SECRET' ||
      key === 'FEISHU_VERIFICATION_TOKEN' ||
      key === 'FEISHU_CONNECTION_MODE' ||
      key === 'FEISHU_BOT_OPEN_ID' ||
      key === 'FEISHU_ADMIN_OPEN_IDS'
    ) {
      ids.push('feishu');
    } else if (key === 'DINGTALK_APP_KEY' || key === 'DINGTALK_APP_SECRET') {
      ids.push('dingtalk');
    } else if (key === 'WEIXIN_BOT_TOKEN') {
      ids.push('weixin');
    } else if (
      key === 'XIAOYI_AK' ||
      key === 'XIAOYI_SK' ||
      key === 'XIAOYI_AGENT_ID'
    ) {
      ids.push('xiaoyi');
    }
  }
  return uniqueConnectors(ids);
}

export class ConnectorRuntimeManager implements ConnectorRuntimeReconciler {
  readonly outboundHook: OutboundDeliveryHook;
  readonly streamingHook: StreamingOutboundHook;
  readonly webhookHandlers: Map<string, ConnectorWebhookHandler>;
  readonly weixinAdapter: WeixinAdapter;
  readonly permissionStore: IConnectorPermissionStore;

  private currentConfig: ConnectorGatewayConfig;
  private readonly log: FastifyBaseLogger;
  private readonly deps: ConnectorGatewayDeps;
  private readonly adapters: Map<string, IOutboundAdapter>;
  private readonly streamableAdapters: Map<string, IStreamableOutboundAdapter>;
  private readonly connectorRouter: ConnectorRouter;
  private readonly mediaService: ConnectorMediaService;
  private readonly cleanupJob: MediaCleanupJob;
  private readonly ownerStore: IConnectorOwnerStore;
  private readonly ownerUserIdState: { current: string };
  private readonly weixinSessionStore: IWeixinSessionStore;
  private readonly runtimes = new Map<ConnectorId, ConnectorRuntimeState>();
  private reconcileChain: Promise<ConnectorRuntimeApplySummary> = Promise.resolve(emptySummary());

  private constructor(ctx: SharedContext, config: ConnectorGatewayConfig) {
    this.currentConfig = { ...config };
    this.log = ctx.log;
    this.deps = ctx.deps;
    this.adapters = ctx.adapters;
    this.streamableAdapters = ctx.streamableAdapters;
    this.webhookHandlers = ctx.webhookHandlers;
    this.permissionStore = ctx.permissionStore;
    this.connectorRouter = ctx.connectorRouter;
    this.mediaService = ctx.mediaService;
    this.cleanupJob = ctx.cleanupJob;
    this.ownerStore = ctx.ownerStore;
    this.ownerUserIdState = ctx.ownerUserIdState;
    this.weixinSessionStore = ctx.weixinSessionStore;
    this.weixinAdapter = ctx.weixinAdapter;
    this.outboundHook = new OutboundDeliveryHook({
      bindingStore: ctx.bindingStore,
      adapters: ctx.adapters,
      log: ctx.log,
      mediaPathResolver: buildMediaPathResolver(config.connectorMediaDir ?? 'data/connector-media'),
      messageLookup: ctx.messageLookup,
    });
    this.streamingHook = new StreamingOutboundHook({
      bindingStore: ctx.bindingStore,
      adapters: ctx.streamableAdapters,
      log: ctx.log,
    });

    this.weixinAdapter.setOnSessionExpired(() => {
      this.weixinAdapter.setBotToken('');
      try {
        this.weixinSessionStore.clear();
      } catch (err) {
        this.log.warn({ err }, '[ConnectorGateway] Failed to clear persisted WeChat session after expiry');
      }
      void this.stopConnector('weixin').catch((err) => {
        this.log.warn({ err }, '[ConnectorGateway] Failed to stop WeChat runtime after session expiry');
      });
      this.log.warn('[ConnectorGateway] WeChat session expired — user must re-scan QR code');
    });
  }

  static async start(config: ConnectorGatewayConfig, deps: ConnectorGatewayDeps): Promise<ConnectorRuntimeManager> {
    const ctx = await createSharedContext(config, deps);
    const manager = new ConnectorRuntimeManager(ctx, config);
    const initialConnectors = CONNECTOR_IDS.filter((connectorId) => {
      if (connectorId === 'weixin') {
        return manager.weixinAdapter.hasBotToken();
      }
      return connectorConfigured(config, connectorId);
    });

    if (initialConnectors.length === 0) {
      manager.log.info('[ConnectorGateway] No pre-configured connectors — gateway created for WeChat QR login support');
    }

    for (const connectorId of initialConnectors) {
      await manager.applyConnector(connectorId, undefined, config, false);
    }

    if (!manager.weixinAdapter.hasBotToken()) {
      manager.log.info('[ConnectorGateway] WeChat adapter registered (awaiting QR login)');
    }

    return manager;
  }

  startWeixinPolling = (): void => {
    if (!this.weixinAdapter.hasBotToken()) return;
    void this.enableWeixinRuntime(this.currentConfig).catch((err) => {
      this.log.error({ err }, '[ConnectorGateway] Failed to start WeChat polling');
    });
  };

  activateWeixinBotToken = async (token: string): Promise<void> => {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new Error('WeChat bot token must not be empty');
    }
    this.weixinAdapter.setBotToken(trimmed);
    this.weixinSessionStore.save(trimmed);
    await this.enableWeixinRuntime({ ...this.currentConfig, weixinBotToken: trimmed });
  };

  disconnectWeixinBotToken = async (): Promise<void> => {
    await this.stopConnector('weixin');
    this.weixinAdapter.setBotToken('');
    this.weixinSessionStore.clear();
  };

  setOwnerUserId = async (userId: string): Promise<void> => {
    const trimmed = userId.trim();
    if (!trimmed) {
      throw new Error('Connector owner userId must not be empty');
    }
    this.ownerUserIdState.current = trimmed;
    this.ownerStore.save(trimmed);
    this.log.info({ ownerUserId: trimmed }, '[ConnectorGateway] Connector owner updated');
  };

  async stop(): Promise<void> {
    this.cleanupJob.stop();
    await Promise.allSettled(CONNECTOR_IDS.map((connectorId) => this.stopConnector(connectorId)));
    this.log.info('[ConnectorGateway] Stopped');
  }

  reconcile(changedKeys: string[]): Promise<ConnectorRuntimeApplySummary> {
    const keys = [...new Set(changedKeys)];
    const queued = this.reconcileChain.then(
      () => this.reconcileNow(keys),
      () => this.reconcileNow(keys),
    );
    this.reconcileChain = queued.catch(() => emptySummary());
    return queued;
  }

  private async reconcileNow(changedKeys: string[]): Promise<ConnectorRuntimeApplySummary> {
    const attemptedConnectors = inferConnectorsFromEnvKeys(changedKeys);
    if (attemptedConnectors.length === 0) {
      return emptySummary();
    }

    const nextConfig = loadConnectorGatewayConfig();
    const summary: ConnectorRuntimeApplySummary = {
      applied: true,
      attemptedConnectors,
      appliedConnectors: [],
      unchangedConnectors: [],
      failedConnectors: [],
    };

    for (const connectorId of attemptedConnectors) {
      if (!connectorSliceChanged(connectorId, this.currentConfig, nextConfig)) {
        summary.unchangedConnectors.push(connectorId);
        continue;
      }
      try {
        await this.applyConnector(connectorId, this.currentConfig, nextConfig, true);
        summary.appliedConnectors.push(connectorId);
      } catch (err) {
        summary.failedConnectors.push({
          connectorId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    summary.applied = summary.failedConnectors.length === 0;
    return summary;
  }

  private async applyConnector(
    connectorId: ConnectorId,
    previousConfig: ConnectorGatewayConfig | undefined,
    nextConfig: ConnectorGatewayConfig,
    rollbackOnFailure: boolean,
  ): Promise<void> {
    const wasConfigured =
      connectorId === 'weixin'
        ? this.weixinAdapter.hasBotToken() || Boolean(previousConfig?.weixinBotToken)
        : connectorConfigured(previousConfig ?? {}, connectorId);
    const shouldBeConfigured =
      connectorId === 'weixin'
        ? this.weixinAdapter.hasBotToken() || Boolean(nextConfig.weixinBotToken)
        : connectorConfigured(nextConfig, connectorId);

    await this.stopConnector(connectorId);

    try {
      if (shouldBeConfigured) {
        await this.startConnector(connectorId, nextConfig);
      }
      this.currentConfig = mergeConnectorConfig(this.currentConfig, nextConfig, connectorId);
    } catch (err) {
      if (rollbackOnFailure && previousConfig && wasConfigured) {
        try {
          await this.startConnector(connectorId, previousConfig);
          this.currentConfig = mergeConnectorConfig(this.currentConfig, previousConfig, connectorId);
          this.log.warn({ connectorId }, '[ConnectorGateway] Connector runtime rolled back to previous config');
        } catch (rollbackErr) {
          this.log.error({ err: rollbackErr, connectorId }, '[ConnectorGateway] Connector runtime rollback failed');
        }
      }
      throw err;
    }
  }

  private async startConnector(connectorId: ConnectorId, config: ConnectorGatewayConfig): Promise<void> {
    switch (connectorId) {
      case 'feishu':
        await this.startFeishu(config);
        return;
      case 'dingtalk':
        await this.startDingtalk(config);
        return;
      case 'weixin':
        await this.enableWeixinRuntime(config);
        return;
      case 'xiaoyi':
        await this.startXiaoyi(config);
    }
  }

  private async stopConnector(connectorId: ConnectorId): Promise<void> {
    const runtime = this.runtimes.get(connectorId);
    this.runtimes.delete(connectorId);
    if (runtime) {
      await runtime.stop();
    }
    if (connectorId !== 'weixin') {
      this.unregisterAdapter(connectorId);
    }
    if (connectorId === 'feishu') {
      this.webhookHandlers.delete('feishu');
      this.mediaService.setFeishuDownloadFn(undefined);
    } else if (connectorId === 'dingtalk') {
      this.mediaService.setDingtalkDownloadFn(undefined);
    } else if (connectorId === 'weixin') {
      this.mediaService.setWeixinDownloadFn(undefined);
    } else if (connectorId === 'xiaoyi') {
      this.mediaService.setXiaoyiDownloadFn(undefined);
    }
  }

  private registerAdapter(connectorId: ConnectorId, adapter: IOutboundAdapter): void {
    this.adapters.set(connectorId, adapter);
    if (isStreamableAdapter(adapter)) {
      this.streamableAdapters.set(connectorId, adapter);
    } else {
      this.streamableAdapters.delete(connectorId);
    }
  }

  private unregisterAdapter(connectorId: ConnectorId): void {
    this.adapters.delete(connectorId);
    this.streamableAdapters.delete(connectorId);
  }

  private async seedFeishuAdminOpenIds(config: ConnectorGatewayConfig): Promise<void> {
    const adminOpenIds = config.feishuAdminOpenIds
      ? config.feishuAdminOpenIds
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
    if (adminOpenIds.length === 0) return;

    // F152: Use owner userId for multi-user isolation
    const userId = this.ownerUserIdState.current;
    const alreadyConfigured = await this.permissionStore.hasAdminConfig(userId, 'feishu');
    if (!alreadyConfigured) {
      await this.permissionStore.setAdminOpenIds(userId, 'feishu', adminOpenIds);
      this.log.info(
        { adminCount: adminOpenIds.length, userId },
        '[ConnectorGateway] Feishu admin open_ids seeded from env (first boot)',
      );
      return;
    }

    this.log.info('[ConnectorGateway] Feishu admin config already persisted, env seed skipped');
  }

  private async startFeishu(config: ConnectorGatewayConfig): Promise<void> {
    const wsMode = config.feishuConnectionMode === 'websocket';
    if (!config.feishuAppId || !config.feishuAppSecret || (!wsMode && !config.feishuVerificationToken)) return;

    await this.seedFeishuAdminOpenIds(config);

    const feishu = new FeishuAdapter(config.feishuAppId, config.feishuAppSecret, this.log, {
      verificationToken: config.feishuVerificationToken,
    });
    const feishuTokenManager = new FeishuTokenManager({
      appId: config.feishuAppId,
      appSecret: config.feishuAppSecret,
    });
    feishu._injectTokenManager(feishuTokenManager);
    this.registerAdapter('feishu', feishu);

    const envBotOpenId = config.feishuBotOpenId;
    if (envBotOpenId) {
      feishu.setBotOpenId(envBotOpenId);
      this.log.info({ botOpenId: envBotOpenId }, '[Feishu] Bot open_id set from config');
    } else {
      feishuTokenManager
        .getTenantAccessToken()
        .then(async (token) => {
          try {
            const res = await fetch(`${FEISHU_OPEN_API_BASE_URL}/bot/v3/info`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data = (await res.json()) as { bot?: { open_id?: string } };
            const openId = data?.bot?.open_id;
            if (openId) {
              feishu.setBotOpenId(openId);
              this.log.info({ botOpenId: openId }, '[Feishu] Bot open_id resolved via API');
            }
          } catch (err) {
            this.log.warn({ err }, '[Feishu] Failed to resolve bot open_id — group chat @bot detection disabled');
          }
        })
        .catch(() => {});
    }

    this.mediaService.setFeishuDownloadFn(async (fileKey: string, type: string, messageId?: string) => {
      const token = await feishuTokenManager.getTenantAccessToken();
      if (!messageId) throw new Error('Feishu download requires messageId');
      const resourceType = type === 'image' ? 'image' : 'file';
      const url = `${FEISHU_OPEN_API_BASE_URL}/im/v1/messages/${messageId}/resources/${fileKey}?type=${resourceType}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Feishu resource download failed: ${res.status} ${res.statusText}`);
      }
      return Buffer.from(await res.arrayBuffer());
    });

    const routeFeishuParsedEvent = async (parsed: NonNullable<ReturnType<FeishuAdapter['parseEvent']>>) => {
      const attachments = parsed.attachments?.map((attachment) => ({
        type: attachment.type,
        platformKey: attachment.feishuKey,
        messageId: parsed.messageId,
        ...(attachment.fileName ? { fileName: attachment.fileName } : {}),
        ...(attachment.duration != null ? { duration: attachment.duration } : {}),
      }));

      let senderName = parsed.senderName;
      let chatName = parsed.chatName;
      if (parsed.chatType === 'group') {
        if (!senderName) {
          senderName = await feishu.resolveSenderName(parsed.senderId).catch(() => undefined);
        }
        if (!chatName) {
          chatName = await feishu.resolveChatName(parsed.chatId).catch(() => undefined);
        }
      }
      // F152: Pass sender for both P2P and group (needed for whitelist check + /myid command)
      const sender = parsed.senderId !== 'unknown'
        ? { id: parsed.senderId, ...(senderName ? { name: senderName } : {}) }
        : undefined;

      return this.connectorRouter.route(
        'feishu',
        parsed.chatId,
        parsed.text,
        parsed.messageId,
        attachments,
        sender,
        parsed.chatType,
        chatName,
      );
    };

    if (wsMode) {
      this.webhookHandlers.delete('feishu');
      const eventDispatcher = new lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (data: Record<string, unknown>) => {
          const envelope = {
            header: { event_type: 'im.message.receive_v1' },
            event: data,
          };
          const parsed = feishu.parseEvent(envelope);
          if (!parsed) return;
          const result = await routeFeishuParsedEvent(parsed);
          if (result.kind === 'skipped' || result.kind === 'command') return;
          void feishu.addReaction(parsed.messageId, 'THUMBSUP');
        },
      });

      const wsClient = this.deps._wsClientFactory
        ? this.deps._wsClientFactory({ appId: config.feishuAppId, appSecret: config.feishuAppSecret })
        : new lark.WSClient({
            appId: config.feishuAppId,
            appSecret: config.feishuAppSecret,
            loggerLevel: lark.LoggerLevel.info,
          });

      try {
        await wsClient.start({ eventDispatcher });
        this.log.info('[ConnectorGateway] Feishu adapter started (WebSocket long-connection mode)');
      } catch (err) {
        this.log.warn({ err }, '[Feishu] WSClient initial connection failed — will auto-reconnect');
      }

      this.runtimes.set('feishu', {
        stop: async () => {
          try {
            wsClient.close({ force: true });
          } catch {
            // ignore close errors
          }
        },
      });
      return;
    }

    this.webhookHandlers.set('feishu', {
      connectorId: 'feishu',
      handleWebhook: async (body, _headers): Promise<WebhookHandleResult> => {
        const challenge = feishu.isVerificationChallenge(body);
        if (challenge) {
          return { kind: 'challenge', response: { challenge: challenge.challenge } };
        }

        if (!feishu.verifyEventToken(body)) {
          this.log.warn('[Feishu] Webhook rejected: invalid verification token');
          return { kind: 'error', status: 403, message: 'Invalid verification token' };
        }

        const cardAction = feishu.parseCardAction(body);
        if (cardAction) {
          const actionText = JSON.stringify(cardAction.actionValue);
          const result = await this.connectorRouter.route(
            'feishu',
            cardAction.chatId,
            actionText,
            `card-action-${Date.now()}`,
          );
          return result.kind === 'skipped'
            ? { kind: 'skipped', reason: result.reason }
            : { kind: 'processed', messageId: result.kind === 'routed' ? result.messageId : 'card-action' };
        }

        const parsed = feishu.parseEvent(body);
        if (!parsed) {
          return { kind: 'skipped', reason: 'unsupported_event' };
        }

        const result = await routeFeishuParsedEvent(parsed);
        if (result.kind === 'skipped') return { kind: 'skipped', reason: result.reason };
        if (result.kind === 'command') return { kind: 'processed', messageId: 'command' };

        void feishu.addReaction(parsed.messageId, 'THUMBSUP');
        return { kind: 'processed', messageId: result.messageId };
      },
    });

    this.runtimes.set('feishu', {
      stop: async () => {},
    });
    this.log.info('[ConnectorGateway] Feishu adapter registered (webhook mode)');
  }

  private async startDingtalk(config: ConnectorGatewayConfig): Promise<void> {
    if (!config.dingtalkAppKey || !config.dingtalkAppSecret) return;
    const dingtalk = new DingTalkAdapter(this.log, {
      appKey: config.dingtalkAppKey,
      appSecret: config.dingtalkAppSecret,
      redis: this.deps.redis,
    });
    this.registerAdapter('dingtalk', dingtalk);

    this.mediaService.setDingtalkDownloadFn(async (downloadCode: string) => {
      const downloadUrl = await dingtalk.downloadMedia(downloadCode);
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`DingTalk media fetch failed: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    });

    await dingtalk.hydrateGroupChatIds();

    await dingtalk.startStream(async (msg) => {
      const attachments = msg.attachments?.map((attachment) => ({
        type: attachment.type,
        platformKey: attachment.downloadCode ?? '',
        ...(attachment.fileName ? { fileName: attachment.fileName } : {}),
        ...(attachment.duration != null ? { duration: attachment.duration } : {}),
      }));
      const sender = { id: msg.senderId, name: msg.senderNick };
      await this.connectorRouter.route(
        'dingtalk',
        msg.chatId,
        msg.text,
        msg.messageId,
        attachments,
        sender,
        msg.chatType,
        msg.conversationTitle,
      );
    });

    this.runtimes.set('dingtalk', {
      stop: async () => {
        await dingtalk.stopStream();
      },
    });
    this.log.info('[ConnectorGateway] DingTalk adapter started (Stream mode)');
  }

  private async enableWeixinRuntime(config: ConnectorGatewayConfig): Promise<void> {
    if (config.weixinBotToken) {
      this.weixinAdapter.setBotToken(config.weixinBotToken);
    }
    if (!this.weixinAdapter.hasBotToken()) return;

    this.mediaService.setWeixinDownloadFn(async (mediaRef: string, type: 'image' | 'file' | 'audio') => {
      return this.weixinAdapter.downloadMedia(mediaRef, type);
    });

    this.weixinAdapter.startPolling(async (msg) => {
      const attachments = msg.attachments?.map((attachment) => ({
        type: attachment.type,
        platformKey: attachment.mediaUrl,
        ...(attachment.fileName ? { fileName: attachment.fileName } : {}),
      }));
      await this.connectorRouter.route('weixin', msg.chatId, msg.text, msg.messageId, attachments);
    });

    this.runtimes.set('weixin', {
      stop: async () => {
        await this.weixinAdapter.stopPolling();
      },
    });
    this.log.info(
      { source: config.weixinBotToken ? 'env' : 'persisted_session' },
      '[ConnectorGateway] WeChat adapter started (iLink Bot long polling)',
    );
  }

  private async startXiaoyi(config: ConnectorGatewayConfig): Promise<void> {
    if (!config.xiaoyiAk || !config.xiaoyiSk || !config.xiaoyiAgentId) return;
    const xiaoyi = new XiaoyiAdapter(this.log, {
      agentId: config.xiaoyiAgentId,
      ak: config.xiaoyiAk,
      sk: config.xiaoyiSk,
    });
    this.registerAdapter('xiaoyi', xiaoyi);

    this.mediaService.setXiaoyiDownloadFn(async (uri: string) => {
      assertSafeXiaoyiUri(uri);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      try {
        const res = await fetch(uri, { signal: controller.signal, redirect: 'error' });
        if (!res.ok) throw new Error(`XiaoYi media fetch failed: ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      } finally {
        clearTimeout(timeout);
      }
    });

    await xiaoyi.startStream(async (msg) => {
      const attachments = msg.attachments?.map((attachment) => ({
        type: attachment.type,
        platformKey: attachment.xiaoyiUri,
        ...(attachment.fileName ? { fileName: attachment.fileName } : {}),
      }));
      await this.connectorRouter.route('xiaoyi', msg.chatId, msg.text, msg.messageId, attachments, {
        id: msg.senderId,
      });
    });

    this.runtimes.set('xiaoyi', {
      stop: async () => {
        await xiaoyi.stopStream();
      },
    });
    this.log.info('[ConnectorGateway] XiaoYi adapter started (OpenClaw WebSocket mode)');
  }
}

function mergeConnectorConfig(
  base: ConnectorGatewayConfig,
  incoming: ConnectorGatewayConfig,
  connectorId: ConnectorId,
): ConnectorGatewayConfig {
  switch (connectorId) {
    case 'feishu':
      return {
        ...base,
        feishuAppId: incoming.feishuAppId,
        feishuAppSecret: incoming.feishuAppSecret,
        feishuVerificationToken: incoming.feishuVerificationToken,
        feishuBotOpenId: incoming.feishuBotOpenId,
        feishuAdminOpenIds: incoming.feishuAdminOpenIds,
        feishuConnectionMode: incoming.feishuConnectionMode,
      };
    case 'dingtalk':
      return {
        ...base,
        dingtalkAppKey: incoming.dingtalkAppKey,
        dingtalkAppSecret: incoming.dingtalkAppSecret,
      };
    case 'weixin':
      return {
        ...base,
        weixinBotToken: incoming.weixinBotToken,
      };
    case 'xiaoyi':
      return {
        ...base,
        xiaoyiAk: incoming.xiaoyiAk,
        xiaoyiSk: incoming.xiaoyiSk,
        xiaoyiAgentId: incoming.xiaoyiAgentId,
      };
  }
}

async function createSharedContext(config: ConnectorGatewayConfig, deps: ConnectorGatewayDeps): Promise<SharedContext> {
  const { log } = deps;
  const hostRoot = deps.hostRoot ?? resolveOfficeClawHostRoot(process.cwd());
  const bindingStore =
    deps.bindingStore ??
    (deps.redis ? new RedisConnectorThreadBindingStore(deps.redis) : new MemoryConnectorThreadBindingStore());
  log.info({ store: deps.redis ? 'redis' : 'memory' }, '[ConnectorGateway] Binding store initialized');

  const permissionStore: IConnectorPermissionStore = deps.redis
    ? new RedisConnectorPermissionStore(deps.redis)
    : new MemoryConnectorPermissionStore();
  const ownerStore = deps.hostRoot ? new ConnectorOwnerStore(hostRoot) : new NoopConnectorOwnerStore();
  const adapters = new Map<string, IOutboundAdapter>();
  const streamableAdapters = new Map<string, IStreamableOutboundAdapter>();
  const webhookHandlers = deps.webhookHandlers ?? new Map<string, ConnectorWebhookHandler>();
  const dedup = new InboundMessageDedup();
  const commandLayer = new ConnectorCommandLayer({
    bindingStore,
    socketManager: deps.socketManager,
    threadStore: deps.threadStore,
    ...(deps.backlogStore ? { backlogStore: deps.backlogStore } : {}),
    frontendBaseUrl: deps.frontendBaseUrl ?? 'http://localhost:3003',
    permissionStore,
  });

  const mediaDir = resolve(findMonorepoRoot(), config.connectorMediaDir ?? 'data/connector-media');
  const mediaService = new ConnectorMediaService({ mediaDir });

  let sttProvider:
    | { transcribe(request: { audioPath: string; language?: string }): Promise<{ text: string }> }
    | undefined;
  if (config.whisperUrl) {
    const { WhisperSttProvider } = await import('./media/WhisperSttProvider.js');
    sttProvider = new WhisperSttProvider({ baseUrl: config.whisperUrl });
  }

  const persistedOwner = normalizeConnectorOwnerUserId(ownerStore.load()?.ownerUserId);
  const configuredOwner = normalizeConnectorOwnerUserId(config.coCreatorUserId);
  const fallbackOwner = normalizeConnectorOwnerUserId(deps.defaultUserId);
  const effectiveUserId = persistedOwner || configuredOwner || fallbackOwner || '';
  const ownerUserIdState = { current: effectiveUserId };
  const connectorRouter = new ConnectorRouter({
    bindingStore,
    dedup,
    messageStore: deps.messageStore,
    threadStore: deps.threadStore,
    invokeTrigger: deps.invokeTrigger,
    socketManager: deps.socketManager,
    defaultUserIdResolver: () => ownerUserIdState.current,
    defaultUserId: effectiveUserId,
    defaultAgentId: deps.defaultAgentId,
    log,
    commandLayer,
    permissionStore,
    adapters,
    mediaService,
    sttProvider,
  });

  const cleanupJob = new MediaCleanupJob({
    mediaDir: resolve(mediaDir),
    ttlMs: 24 * 60 * 60 * 1000,
    intervalMs: 60 * 60 * 1000,
    log,
  });
  cleanupJob.start();
  log.info('[ConnectorGateway] Media cleanup job started (24h TTL, 1h sweep)');

  const weixinSessionStore = deps.hostRoot ? new WeixinSessionStore(hostRoot) : new NoopWeixinSessionStore();
  const persistedWeixinSession = !config.weixinBotToken ? weixinSessionStore.load() : null;
  const effectiveWeixinBotToken = config.weixinBotToken || persistedWeixinSession?.botToken;
  const weixinAdapter = new WeixinAdapter(effectiveWeixinBotToken ?? '', log);
  if (deps._weixinFetch) {
    weixinAdapter._injectFetch(deps._weixinFetch);
  }
  adapters.set('weixin', weixinAdapter);
  if (isStreamableAdapter(weixinAdapter)) {
    streamableAdapters.set('weixin', weixinAdapter);
  }

  const messageLookup = deps.messageStore.getById
    ? async (messageId: string) => {
        const result = await deps.messageStore.getById!(messageId);
        return result as { source?: { sender?: { id: string; name?: string } } } | null;
      }
    : undefined;

  return {
    log,
    deps,
    bindingStore,
    permissionStore,
    adapters,
    streamableAdapters,
    webhookHandlers,
    mediaService,
    connectorRouter,
    cleanupJob,
    ownerStore,
    ownerUserIdState,
    weixinSessionStore,
    weixinAdapter,
    messageLookup,
  };
}

function buildMediaPathResolver(mediaDir: string): (url: string) => string | undefined {
  const monoRoot = findMonorepoRoot();
  const uploadDir = resolve(monoRoot, process.env.UPLOAD_DIR ?? 'data/uploads');
  const ttsCacheDir = resolve(monoRoot, process.env.TTS_CACHE_DIR ?? 'data/tts-cache');
  const resolvedMediaDir = resolve(monoRoot, mediaDir);

  return (url: string): string | undefined => {
    const safeResolve = (base: string, suffix: string): string | undefined => {
      const resolvedPath = resolve(base, suffix);
      return resolvedPath.startsWith(base + '/') || resolvedPath === base ? resolvedPath : undefined;
    };
    if (url.startsWith('/uploads/')) return safeResolve(uploadDir, url.slice('/uploads/'.length));
    if (url.startsWith('/api/tts/audio/')) return safeResolve(ttsCacheDir, url.slice('/api/tts/audio/'.length));
    if (url.startsWith('/api/connector-media/')) {
      return safeResolve(resolvedMediaDir, url.slice('/api/connector-media/'.length));
    }
    return undefined;
  };
}
