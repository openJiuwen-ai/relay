/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { applyConnectorSecretUpdates } from '../config/connector-secret-updater.js';
import {
  buildConnectorEnvRefVarName,
  getConnectorEnvValue,
  hasConnectorEnvValue,
} from '../config/local-secret-store.js';
import { DEFAULT_THREAD_ID, type IThreadStore } from '../domains/agents/services/stores/ports/ThreadStore.js';
import type { ConnectorRuntimeReconciler } from '../infrastructure/connectors/ConnectorRuntimeManager.js';
import type { WeixinAdapter } from '../infrastructure/connectors/adapters/WeixinAdapter.js';
import type { IConnectorPermissionStore } from '../infrastructure/connectors/ConnectorPermissionStore.js';
import { DefaultFeishuQrBindClient, type FeishuQrBindClient } from '../infrastructure/connectors/FeishuQrBindClient.js';
import { resolveFeishuOpenApiBaseUrl, resolveFeishuOpenBaseUrl } from '../infrastructure/connectors/feishu-open-platform.js';
import { resolveHeaderUserId } from '../utils/request-identity.js';

const DINGTALK_API_BASE_URL = process.env.DINGTALK_API_BASE_URL!;
const DINGTALK_OPEN_URL = process.env.DINGTALK_OPEN_URL!;
const FEISHU_OPEN_BASE_URL = resolveFeishuOpenBaseUrl();
const FEISHU_OPEN_API_BASE_URL = resolveFeishuOpenApiBaseUrl();
const WEIXIN_CHATBOT_URL = process.env.WEIXIN_CHATBOT_URL!;
const HUAWEI_DEVELOPER_URL = process.env.HUAWEI_DEVELOPER_URL!;

export interface ConnectorHubRoutesOptions {
  threadStore: IThreadStore;
  /**
   * Lazy reference to the WeChat adapter instance.
   * Set after connector gateway starts (which happens post-listen).
   * Null when gateway not started or WeChat not available.
   */
  weixinAdapter?: WeixinAdapter | null;
  /** Called after successful QR login to start the WeChat polling loop */
  startWeixinPolling?: () => void;
  /** Persist + activate a newly acquired WeChat bot token */
  activateWeixinBotToken?: (token: string) => Promise<void> | void;
  /** Clear active WeChat bot token and persisted local session */
  disconnectWeixinBotToken?: () => Promise<void> | void;
  /** F134 Phase D: Permission store for group whitelist + admin management */
  permissionStore?: IConnectorPermissionStore | null;
  envFilePath?: string;
  feishuQrBindClient?: FeishuQrBindClient;
  connectorRuntimeManager?: ConnectorRuntimeReconciler;
}

function requireTrustedHubIdentity(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = resolveHeaderUserId(request);
  if (!userId) {
    reply.status(401);
    return null;
  }
  return userId;
}

function identityRequiredError(): { error: string } {
  return { error: '缺少用户身份，请先登录或携带 X-Office-Claw-User 请求头' };
}

// ── Connector platform config definitions ──

interface ConnectorFieldDef {
  envName: string;
  label: string;
  sensitive: boolean;
  /** When set, this field is only required if the condition env var has the given value */
  requiredWhen?: { envName: string; value: string };
  /** When true, this field is never required for the platform to be "configured" */
  optional?: boolean;
  /** Default value used when the env var is not set — aligns status page with runtime normalization */
  defaultValue?: string;
}

interface PlatformStepDef {
  text: string;
  /** When set, this step only displays when the selected connection mode matches */
  mode?: string;
}

interface PlatformDef {
  id: string;
  name: string;
  nameEn: string;
  fields: ConnectorFieldDef[];
  docsUrl: string;
  /** Steps displayed in the guided wizard — may be mode-filtered */
  steps: PlatformStepDef[];
}

export const CONNECTOR_PLATFORMS: PlatformDef[] = [
  {
    id: 'feishu',
    name: '飞书',
    nameEn: 'Feishu / Lark',
    fields: [],
    docsUrl: FEISHU_OPEN_BASE_URL + '/document/home/introduction-to-custom-app-development/self-built-application-development-process',
    steps: [
      { text: '点击「生成二维码」按钮' },
      { text: '使用飞书扫描二维码并确认授权' },
      { text: '授权成功后自动连接，无需重启服务' },
    ],
  },
  {
    id: 'weixin',
    name: '微信',
    nameEn: 'WeChat Personal',
    fields: [],
    docsUrl: WEIXIN_CHATBOT_URL + '/',
    steps: [
      { text: '点击「生成二维码」按钮' },
      { text: '使用微信扫描二维码并确认授权' },
      { text: '授权成功后自动连接，无需重启服务' },
    ],
  },
  {
    id: 'dingtalk',
    name: '钉钉',
    nameEn: 'DingTalk',
    fields: [
      { envName: 'DINGTALK_APP_KEY', label: 'App Key', sensitive: false },
      { envName: 'DINGTALK_APP_SECRET', label: 'App Secret', sensitive: true },
    ],
    docsUrl: DINGTALK_OPEN_URL + '/document/dingstart/robot-application-overview',
    steps: [
      { text: '在钉钉开放平台创建企业内部应用，获取 App Key 和 App Secret' },
      { text: '在「机器人与消息推送」中开启机器人能力' },
      { text: '填写以下配置并保存，连接器会立即热生效' },
    ],
  },
  {
    id: 'xiaoyi',
    name: '小艺',
    nameEn: 'Huawei XiaoYi',
    fields: [
      { envName: 'XIAOYI_AGENT_ID', label: 'Agent ID', sensitive: false },
      { envName: 'XIAOYI_AK', label: 'Access Key (AK)', sensitive: true },
      { envName: 'XIAOYI_SK', label: 'Secret Key (SK)', sensitive: true },
    ],
    docsUrl: HUAWEI_DEVELOPER_URL + '/consumer/cn/hag/abilityportal/',
    steps: [
      { text: '在华为小艺开放平台创建智能体，新建凭证获取 AK / SK' },
      { text: '配置白名单分组，添加调试用华为账号' },
      { text: '填写以下配置并保存，连接器会立即热生效' },
    ],
  },
];

/** Mask a sensitive value: show only that it is set, no suffix. Aligns with env-registry *** policy. */
function maskSensitiveValue(_value: string): string {
  return '••••••••';
}

export interface PlatformFieldStatus {
  envName: string;
  label: string;
  sensitive: boolean;
  /** null = not set, masked string = set (sensitive fields show last 4 chars) */
  currentValue: string | null;
}

export interface PlatformStepStatus {
  text: string;
  mode?: string;
}

export interface PlatformStatus {
  id: string;
  name: string;
  nameEn: string;
  configured: boolean;
  fields: PlatformFieldStatus[];
  docsUrl: string;
  steps: PlatformStepStatus[];
}

export function buildConnectorStatus(env: Record<string, string | undefined> = process.env): PlatformStatus[] {
  return CONNECTOR_PLATFORMS.map((platform) => {
    const fields: PlatformFieldStatus[] = platform.fields.map((f) => {
      const raw = getConnectorEnvValue(f.envName, env);
      const ref = env[buildConnectorEnvRefVarName(f.envName)];
      const isSet =
        (raw != null && raw !== '' && !raw.startsWith('(未设置')) ||
        (typeof ref === 'string' && ref.trim().length > 0 && !ref.startsWith('(未设置'));
      const effectiveValue = isSet ? (raw ?? ref ?? null) : (f.defaultValue ?? null);
      return {
        envName: f.envName,
        label: f.label,
        sensitive: f.sensitive,
        currentValue: effectiveValue ? (f.sensitive ? maskSensitiveValue(effectiveValue) : effectiveValue) : null,
      };
    });

    let configured: boolean;
    if (platform.id === 'feishu') {
      configured = Boolean(env.FEISHU_APP_ID && getConnectorEnvValue('FEISHU_APP_SECRET', env));
    } else if (platform.fields.length === 0) {
      configured = false;
    } else {
      configured = platform.fields.every((f) => {
        if (f.optional) return true;
        return hasConnectorEnvValue(f.envName, env);
      });
    }

    return {
      id: platform.id,
      name: platform.name,
      nameEn: platform.nameEn,
      configured,
      fields,
      docsUrl: platform.docsUrl,
      steps: platform.steps,
    };
  });
}

export const connectorHubRoutes: FastifyPluginAsync<ConnectorHubRoutesOptions> = async (app, opts) => {
  const { threadStore } = opts;
  const feishuQrBindClient = opts.feishuQrBindClient ?? new DefaultFeishuQrBindClient();

  app.get('/api/connector/hub-threads', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) {
      return identityRequiredError();
    }
    const allThreads = await threadStore.list(userId);
    const hubThreads = allThreads
      .filter((t) => t.connectorHubState && t.id !== DEFAULT_THREAD_ID)
      .sort((a, b) => (b.connectorHubState?.createdAt ?? 0) - (a.connectorHubState?.createdAt ?? 0));
    return {
      threads: hubThreads.map((t) => ({
        id: t.id,
        title: t.title,
        connectorId: t.connectorHubState?.connectorId,
        externalChatId: t.connectorHubState?.externalChatId,
        createdAt: t.connectorHubState?.createdAt,
        lastCommandAt: t.connectorHubState?.lastCommandAt,
      })),
    };
  });

  app.get('/api/connector/status', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) {
      return identityRequiredError();
    }
    const status = buildConnectorStatus();
    // F137: WeChat "configured" is based on adapter having a live bot_token, not env vars
    const weixinStatus = status.find((p) => p.id === 'weixin');
    if (weixinStatus) {
      const adapter = opts.weixinAdapter;
      weixinStatus.configured = adapter != null && adapter.hasBotToken() && adapter.isPolling();
    }
    return { platforms: status };
  });

  // ── Feishu QR code login routes ──

  app.post('/api/connector/feishu/qrcode', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return identityRequiredError();

    try {
      const result = await feishuQrBindClient.create();
      return result;
    } catch (err) {
      app.log.error({ err }, '[Feishu QR] Failed to fetch QR code');
      reply.status(502);
      return { error: '获取飞书二维码失败，请稍后重试' };
    }
  });

  app.get('/api/connector/feishu/qrcode-status', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return identityRequiredError();

    const { qrPayload } = request.query as { qrPayload?: string };
    if (!qrPayload) {
      reply.status(400);
      return { error: '缺少 qrPayload 参数' };
    }

    try {
      const status = await feishuQrBindClient.poll(qrPayload);
      if (status.status !== 'confirmed') {
        return status;
      }

      const updates = [
        { name: 'FEISHU_APP_ID', value: status.appId ?? null },
        { name: 'FEISHU_APP_SECRET', value: status.appSecret ?? null },
        { name: 'FEISHU_CONNECTION_MODE', value: 'websocket' },
        { name: 'FEISHU_VERIFICATION_TOKEN', value: null },
      ];
      const result = await applyConnectorSecretUpdates(updates, {
        envFilePath: opts.envFilePath,
        reconciler: opts.connectorRuntimeManager,
      });
      await opts.connectorRuntimeManager?.setOwnerUserId?.(userId);

      // F152: Store QR scanner's open_id as whitelist exempt user
      if (status.ownerOpenId && opts.permissionStore) {
        await opts.permissionStore.setOwnerOpenId(userId, 'feishu', status.ownerOpenId);
        app.log.info({ userId, ownerOpenId: status.ownerOpenId }, '[Feishu QR] Stored owner open_id for whitelist exemption');
      }

      return { status: 'confirmed', ...(result.runtime ? { runtime: result.runtime } : {}), ownerOpenId: status.ownerOpenId };
    } catch (err) {
      app.log.error({ err }, '[Feishu QR] Failed to poll QR status');
      reply.status(502);
      return { error: '查询飞书二维码状态失败，请稍后重试' };
    }
  });

  app.post('/api/connector/feishu/disconnect', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return identityRequiredError();

    const result = await applyConnectorSecretUpdates(
      [
        { name: 'FEISHU_APP_ID', value: null },
        { name: 'FEISHU_APP_SECRET', value: null },
        { name: 'FEISHU_CONNECTION_MODE', value: null },
        { name: 'FEISHU_VERIFICATION_TOKEN', value: null },
        { name: 'FEISHU_BOT_OPEN_ID', value: null },
      ],
      { envFilePath: opts.envFilePath, reconciler: opts.connectorRuntimeManager },
    );
    app.log.info({ userId }, '[Feishu] Disconnected by user');
    return { ok: true, ...(result.runtime ? { runtime: result.runtime } : {}) };
  });

  // ── DingTalk connectivity test ──

  app.post('/api/connector/test/dingtalk', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) {
      return identityRequiredError();
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const readInput = (key: string): string | undefined => {
      const value = body[key];
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const readEnv = (key: string): string | undefined => {
      const value = getConnectorEnvValue(key);
      return value && !value.startsWith('(未设置') ? value : undefined;
    };

    const appKey = readInput('DINGTALK_APP_KEY') ?? readEnv('DINGTALK_APP_KEY');
    const appSecret = readInput('DINGTALK_APP_SECRET') ?? readEnv('DINGTALK_APP_SECRET');

    if (!appKey || !appSecret) {
      reply.status(400);
      return { ok: false, error: '缺少 DINGTALK_APP_KEY 或 DINGTALK_APP_SECRET' };
    }

    try {
      const tokenRes = await fetch(`${DINGTALK_API_BASE_URL}/v1.0/oauth2/accessToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey, appSecret }),
      });

      const tokenData = (await tokenRes.json().catch(() => ({}))) as {
        accessToken?: string;
        expireIn?: number;
        code?: string;
        message?: string;
      };

      if (!tokenRes.ok || !tokenData.accessToken) {
        reply.status(502);
        return {
          ok: false,
          error: '钉钉认证失败，请确认 App Key / App Secret 是否正确',
          details: tokenData.message
            ? `钉钉接口返回异常：${tokenData.message}`
            : `钉钉接口返回异常，HTTP ${tokenRes.status}`,
        };
      }

      return {
        ok: true,
        message: '钉钉应用认证成功，AccessToken 可正常获取。',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      reply.status(502);
      return {
        ok: false,
        error: '钉钉连接测试失败，请检查网络或 App Key / App Secret',
        details: `请求钉钉接口失败：${message}`,
      };
    }
  });

  // ── XiaoYi connectivity test ──

  app.post('/api/connector/test/xiaoyi', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) {
      return identityRequiredError();
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const readInput = (key: string): string | undefined => {
      const value = body[key];
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const readEnv = (key: string): string | undefined => {
      const value = getConnectorEnvValue(key);
      return value && !value.startsWith('(未设置') ? value : undefined;
    };

    const ak = readInput('XIAOYI_AK') ?? readEnv('XIAOYI_AK');
    const sk = readInput('XIAOYI_SK') ?? readEnv('XIAOYI_SK');
    const agentId = readInput('XIAOYI_AGENT_ID') ?? readEnv('XIAOYI_AGENT_ID');

    if (!ak || !sk || !agentId) {
      reply.status(400);
      return { ok: false, error: '缺少 XIAOYI_AK、XIAOYI_SK 或 XIAOYI_AGENT_ID' };
    }

    try {
      const { generateXiaoyiSignature } = await import('../infrastructure/connectors/adapters/XiaoyiAdapter.js');

      const timestamp = Date.now().toString();
      const signature = generateXiaoyiSignature(sk, timestamp);

      const wsUrl =
        (process.env.XIAOYI_WS_PRIMARY_URL ?? 'wss://hag.cloud.huawei.com') +
        '/openclaw/v1/ws/link';

      const { WebSocket } = await import('ws');

      const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const timeout = setTimeout(() => {
          ws.close();
          resolve({ ok: false, error: 'WebSocket 握手超时（5秒）' });
        }, 5_000);

        const ws = new WebSocket(wsUrl, {
          headers: {
            'x-access-key': ak,
            'x-sign': signature,
            'x-ts': timestamp,
            'x-agent-id': agentId,
          },
        });

        ws.on('open', () => {
          clearTimeout(timeout);
          ws.close();
          resolve({ ok: true });
        });

        ws.on('error', (err: Error) => {
          clearTimeout(timeout);
          resolve({ ok: false, error: err.message });
        });
      });

      if (!result.ok) {
        reply.status(502);
        return {
          ok: false,
          error: '小艺平台连接测试失败，请检查 AK / SK / Agent ID',
          details: result.error,
        };
      }

      return {
        ok: true,
        message: '小艺平台 WebSocket 握手成功，凭据有效。',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      reply.status(502);
      return {
        ok: false,
        error: '小艺连接测试失败，请检查 AK / SK / Agent ID',
        details: `请求小艺平台失败：${message}`,
      };
    }
  });

  // ── F137: WeChat QR code login routes ──

  app.post('/api/connector/weixin/qrcode', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return identityRequiredError();

    try {
      const { WeixinAdapter: WA } = await import('../infrastructure/connectors/adapters/WeixinAdapter.js');
      const result = await WA.fetchQrCode();
      return { qrUrl: result.qrUrl, qrPayload: result.qrPayload };
    } catch (err) {
      app.log.error({ err }, '[WeChat QR] Failed to fetch QR code');
      reply.status(502);
      return { error: '获取微信二维码失败，请稍后重试' };
    }
  });

  app.get('/api/connector/weixin/qrcode-status', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return identityRequiredError();

    const { qrPayload } = request.query as { qrPayload?: string };
    if (!qrPayload) {
      reply.status(400);
      return { error: '缺少 qrPayload 参数' };
    }

    try {
      const { WeixinAdapter: WA } = await import('../infrastructure/connectors/adapters/WeixinAdapter.js');
      const status = await WA.pollQrCodeStatus(qrPayload);

      if (status.status === 'confirmed') {
        if (!opts.activateWeixinBotToken && !opts.weixinAdapter) {
          app.log.error('[WeChat QR] QR confirmed but adapter not available — token would be lost');
          reply.status(503);
          return { error: '微信连接器尚未就绪，请稍后重试' };
        }
        if (opts.activateWeixinBotToken) {
          await opts.activateWeixinBotToken(status.botToken);
        } else {
          opts.weixinAdapter?.setBotToken(status.botToken);
          opts.startWeixinPolling?.();
        }
        await opts.connectorRuntimeManager?.setOwnerUserId?.(userId);
        app.log.info('[WeChat QR] Auto-activated — bot_token set server-side, polling started');
        return { status: 'confirmed' };
      }

      return status;
    } catch (err) {
      app.log.error({ err }, '[WeChat QR] Failed to poll QR status');
      reply.status(502);
      return { error: '查询微信二维码状态失败，请稍后重试' };
    }
  });

  app.post('/api/connector/weixin/activate', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return identityRequiredError();

    const adapter = opts.weixinAdapter;
    if (!adapter) {
      reply.status(503);
      return { error: '微信连接器不可用，连接网关尚未启动' };
    }

    if (!adapter.hasBotToken()) {
      reply.status(409);
      return { error: '当前没有可用的 bot_token，请先完成二维码登录' };
    }

    opts.startWeixinPolling?.();
    await opts.connectorRuntimeManager?.setOwnerUserId?.(userId);
    app.log.info('[WeChat QR] Manual activate — polling started');

    return { ok: true, polling: adapter.isPolling() };
  });

  app.post('/api/connector/weixin/disconnect', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return identityRequiredError();

    const adapter = opts.weixinAdapter;
    if (!adapter || !opts.disconnectWeixinBotToken) {
      reply.status(503);
      return { error: '微信连接器不可用，连接网关尚未启动' };
    }

    await opts.disconnectWeixinBotToken();
    app.log.info('[WeChat QR] Manual disconnect — bot_token cleared, polling stopped');

    return { ok: true, configured: adapter.hasBotToken() && adapter.isPolling() };
  });

  // ── DingTalk disconnect ──
  app.post('/api/connector/dingtalk/disconnect', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return identityRequiredError();

    const result = await applyConnectorSecretUpdates(
      [
        { name: 'DINGTALK_APP_KEY', value: null },
        { name: 'DINGTALK_APP_SECRET', value: null },
      ],
      { envFilePath: opts.envFilePath, reconciler: opts.connectorRuntimeManager },
    );
    app.log.info({ userId }, '[DingTalk] Disconnected by user');
    return { ok: true, ...(result.runtime ? { runtime: result.runtime } : {}) };
  });

  // ── XiaoYi disconnect ──
  app.post('/api/connector/xiaoyi/disconnect', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return identityRequiredError();

    const result = await applyConnectorSecretUpdates(
      [
        { name: 'XIAOYI_AK', value: null },
        { name: 'XIAOYI_SK', value: null },
        { name: 'XIAOYI_AGENT_ID', value: null },
      ],
      { envFilePath: opts.envFilePath, reconciler: opts.connectorRuntimeManager },
    );
    app.log.info({ userId }, '[XiaoYi] Disconnected by user');
    return { ok: true, ...(result.runtime ? { runtime: result.runtime } : {}) };
  });

  // ── F134 Phase D: Connector Permission API ──
  // F152: All methods now require userId for multi-user isolation

  app.get('/api/connector/permissions/:connectorId', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return identityRequiredError();
    const { connectorId } = request.params as { connectorId: string };
    const store = opts.permissionStore;
    if (!store) {
      return {
        whitelistEnabled: false,
        commandAdminOnly: false,
        adminOpenIds: [],
        allowedGroups: [],
        userWhitelistEnabled: false,
        allowedUsers: [],
        ownerOpenId: undefined,
      };
    }
    return store.getConfig(userId, connectorId);
  });

  app.put('/api/connector/permissions/:connectorId', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return identityRequiredError();
    const { connectorId } = request.params as { connectorId: string };
    const store = opts.permissionStore;
    if (!store) {
      reply.status(503);
      return { error: '渠道权限存储不可用' };
    }
    const body = request.body as {
      whitelistEnabled?: boolean;
      commandAdminOnly?: boolean;
      adminOpenIds?: string[];
      allowedGroups?: Array<{ externalChatId: string; label?: string }>;
      // F152: Personal user whitelist
      userWhitelistEnabled?: boolean;
      allowedUsers?: Array<{ openId: string; name?: string }>;
      ownerOpenId?: string;
    };

    // Group whitelist
    if (body.whitelistEnabled !== undefined) {
      await store.setWhitelistEnabled(userId, connectorId, body.whitelistEnabled);
    }
    if (body.commandAdminOnly !== undefined) {
      await store.setCommandAdminOnly(userId, connectorId, body.commandAdminOnly);
    }
    if (body.adminOpenIds !== undefined) {
      await store.setAdminOpenIds(userId, connectorId, body.adminOpenIds);
    }
    if (body.allowedGroups !== undefined) {
      const current = await store.listAllowedGroups(userId, connectorId);
      for (const g of current) await store.denyGroup(userId, connectorId, g.externalChatId);
      for (const g of body.allowedGroups) await store.allowGroup(userId, connectorId, g.externalChatId, g.label);
    }

    // F152: Personal user whitelist
    if (body.userWhitelistEnabled !== undefined) {
      await store.setUserWhitelistEnabled(userId, connectorId, body.userWhitelistEnabled);
    }
    if (body.allowedUsers !== undefined) {
      const current = await store.listAllowedUsers(userId, connectorId);
      for (const u of current) await store.denyUser(userId, connectorId, u.openId);
      for (const u of body.allowedUsers) await store.allowUser(userId, connectorId, u.openId, u.name);
    }
    if (body.ownerOpenId !== undefined) {
      await store.setOwnerOpenId(userId, connectorId, body.ownerOpenId);
    }

    return store.getConfig(userId, connectorId);
  });
};
