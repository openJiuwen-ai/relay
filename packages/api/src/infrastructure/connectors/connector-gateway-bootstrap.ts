/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Connector Gateway Bootstrap
 *
 * Provides the config/deps types and a compatibility bootstrap entrypoint.
 * Runtime lifecycle is owned by ConnectorRuntimeManager.
 */

import type { AgentId, ConnectorSource } from '@openjiuwen/relay-shared';
import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import type { FastifyBaseLogger } from 'fastify';
import { getConnectorEnvValue } from '../../config/local-secret-store.js';
import type { ConnectorWebhookHandler } from '../../routes/connector-webhooks.js';
import type { ConnectorRuntimeApplySummary } from './ConnectorRuntimeManager.js';
import { ConnectorRuntimeManager } from './ConnectorRuntimeManager.js';
import type { IConnectorPermissionStore } from './ConnectorPermissionStore.js';
import type { IConnectorThreadBindingStore } from './ConnectorThreadBindingStore.js';
import type { OutboundDeliveryHook } from './OutboundDeliveryHook.js';
import type { StreamingOutboundHook } from './StreamingOutboundHook.js';
import type { WeixinAdapter } from './adapters/WeixinAdapter.js';

export interface ConnectorGatewayConfig {
  feishuAppId?: string | undefined;
  feishuAppSecret?: string | undefined;
  feishuVerificationToken?: string | undefined;
  feishuBotOpenId?: string | undefined;
  feishuAdminOpenIds?: string | undefined;
  feishuConnectionMode?: 'webhook' | 'websocket' | undefined;
  dingtalkAppKey?: string | undefined;
  dingtalkAppSecret?: string | undefined;
  weixinBotToken?: string | undefined;
  xiaoyiAk?: string | undefined;
  xiaoyiSk?: string | undefined;
  xiaoyiAgentId?: string | undefined;
  wecomBotId?: string | undefined;
  wecomBotSecret?: string | undefined;
  wecomCorpId?: string | undefined;
  wecomAgentId?: string | undefined;
  wecomAgentSecret?: string | undefined;
  wecomToken?: string | undefined;
  wecomEncodingAesKey?: string | undefined;
  coCreatorUserId?: string | undefined;
  whisperUrl?: string | undefined;
  connectorMediaDir?: string | undefined;
}

export interface ConnectorGatewayDeps {
  readonly bindingStore?: IConnectorThreadBindingStore | undefined;
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
    getById?(id: string): Promise<{ source?: ConnectorSource } | null>;
  };
  readonly threadStore: {
    create(userId: string, title?: string): { id: string } | Promise<{ id: string }>;
    get(id: string):
      | {
          id: string;
          title?: string | null;
          createdAt?: number;
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
          id: string;
          title?: string | null;
          createdAt?: number;
          connectorHubState?: {
            v: 1;
            connectorId: string;
            externalChatId: string;
            createdAt: number;
            lastCommandAt?: number;
          };
        } | null>;
    list(
      userId: string,
    ):
      | Array<{ id: string; title?: string | null; lastActiveAt?: number; backlogItemId?: string }>
      | Promise<Array<{ id: string; title?: string | null; lastActiveAt?: number; backlogItemId?: string }>>;
    updateConnectorHubState(
      threadId: string,
      state: { v: 1; connectorId: string; externalChatId: string; createdAt: number; lastCommandAt?: number } | null,
    ): void | Promise<void>;
    updateLastActive(threadId: string): void | Promise<void>;
  };
  readonly backlogStore?: {
    get(
      itemId: string,
      userId?: string,
    ): { tags: readonly string[] } | null | Promise<{ tags: readonly string[] } | null>;
  };
  readonly invokeTrigger: {
    trigger(
      threadId: string,
      agentId: AgentId,
      userId: string,
      message: string,
      messageId: string,
      ...args: unknown[]
    ): void;
  };
  readonly socketManager?:
    | {
        broadcastToRoom(room: string, event: string, data: unknown): void;
        emitToUser?(userId: string, event: string, data: unknown): void;
      }
    | undefined;
  readonly defaultUserId: string;
  readonly defaultAgentId: AgentId;
  readonly redis?: RedisClient | undefined;
  readonly log: FastifyBaseLogger;
  readonly frontendBaseUrl?: string | undefined;
  readonly hostRoot?: string | undefined;
  readonly webhookHandlers?: Map<string, ConnectorWebhookHandler> | undefined;
  readonly _wsClientFactory?:
    | ((opts: { appId: string; appSecret: string }) => {
        start(opts: unknown): Promise<void>;
        close(opts?: unknown): void;
      })
    | undefined;
  readonly _weixinFetch?: typeof fetch | undefined;
}

export interface ConnectorGatewayHandle {
  readonly outboundHook: OutboundDeliveryHook;
  readonly streamingHook: StreamingOutboundHook;
  readonly webhookHandlers: Map<string, ConnectorWebhookHandler>;
  readonly weixinAdapter: WeixinAdapter | null;
  readonly permissionStore: IConnectorPermissionStore;
  readonly startWeixinPolling: () => void;
  readonly activateWeixinBotToken: (token: string) => Promise<void>;
  readonly disconnectWeixinBotToken: () => Promise<void>;
  readonly setOwnerUserId: (userId: string) => Promise<void> | void;
  reconcile(changedKeys: string[]): Promise<ConnectorRuntimeApplySummary>;
  stop(): Promise<void>;
}

export { ConnectorRuntimeManager };
export type { ConnectorRuntimeApplySummary } from './ConnectorRuntimeManager.js';

export function loadConnectorGatewayConfig(): ConnectorGatewayConfig {
  return {
    feishuAppId: getConnectorEnvValue('FEISHU_APP_ID'),
    feishuAppSecret: getConnectorEnvValue('FEISHU_APP_SECRET'),
    feishuVerificationToken: getConnectorEnvValue('FEISHU_VERIFICATION_TOKEN'),
    feishuBotOpenId: process.env.FEISHU_BOT_OPEN_ID,
    feishuAdminOpenIds: process.env.FEISHU_ADMIN_OPEN_IDS,
    feishuConnectionMode: process.env.FEISHU_CONNECTION_MODE === 'websocket' ? 'websocket' : 'webhook',
    dingtalkAppKey: getConnectorEnvValue('DINGTALK_APP_KEY'),
    dingtalkAppSecret: getConnectorEnvValue('DINGTALK_APP_SECRET'),
    weixinBotToken: getConnectorEnvValue('WEIXIN_BOT_TOKEN'),
    xiaoyiAk: getConnectorEnvValue('XIAOYI_AK'),
    xiaoyiSk: getConnectorEnvValue('XIAOYI_SK'),
    xiaoyiAgentId: getConnectorEnvValue('XIAOYI_AGENT_ID'),
    wecomBotId: process.env.WECOM_BOT_ID,
    wecomBotSecret: process.env.WECOM_BOT_SECRET,
    wecomCorpId: process.env.WECOM_CORP_ID,
    wecomAgentId: process.env.WECOM_AGENT_ID,
    wecomAgentSecret: process.env.WECOM_AGENT_SECRET,
    wecomToken: process.env.WECOM_TOKEN,
    wecomEncodingAesKey: process.env.WECOM_ENCODING_AES_KEY,
    coCreatorUserId: process.env.DEFAULT_OWNER_USER_ID,
    whisperUrl: process.env.WHISPER_URL,
    connectorMediaDir: process.env.CONNECTOR_MEDIA_DIR,
  };
}

export async function startConnectorGateway(
  config: ConnectorGatewayConfig,
  deps: ConnectorGatewayDeps,
): Promise<ConnectorGatewayHandle> {
  return ConnectorRuntimeManager.start(config, deps);
}
