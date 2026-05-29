/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * DingTalk (钉钉) Enterprise Bot Adapter
 * Inbound: Parse Stream events → extract DM + group messages
 * Outbound: Send reply via DingTalk OpenAPI + AI Card streaming
 *
 * Uses dingtalk-stream for Stream mode (no public URL needed).
 * AI Card for rich/streaming replies (create → streaming update → finish).
 *
 * F132 DingTalk + WeCom Chat Gateway — Phase A
 */

import { basename } from 'node:path';
import type { RichBlock } from '@openjiuwen/relay-shared';
import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import type { FastifyBaseLogger } from 'fastify';
import type { MessageEnvelope } from '../ConnectorMessageFormatter.js';
import type { IStreamableOutboundAdapter } from '../OutboundDeliveryHook.js';

const DINGTALK_API_BASE_URL = process.env.DINGTALK_API_BASE_URL!;

// ── Types ──

export interface DingTalkAttachment {
  type: 'image' | 'file' | 'audio';
  /** DingTalk media download code (for images/files/audio) */
  downloadCode?: string;
  fileName?: string;
  duration?: number;
}

export interface DingTalkInboundMessage {
  /** DM: staffId | Group: openConversationId */
  chatId: string;
  /** DingTalk conversationId — used for AI Card delivery routing */
  conversationId: string;
  text: string;
  messageId: string;
  senderId: string;
  chatType: 'p2p' | 'group';
  senderNick?: string;
  conversationTitle?: string;
  attachments?: DingTalkAttachment[];
}

export interface DingTalkAdapterOptions {
  appKey: string;
  appSecret: string;
  /** Robot code (used for sending messages), defaults to appKey */
  robotCode?: string;
  /** Optional Redis client for persisting group chatId set across cold restarts. */
  redis?: RedisClient | undefined;
}

/** AI Card streaming state machine */
type CardState = 'PROCESSING' | 'INPUTING' | 'FINISHED';

interface ActiveCard {
  outTrackId: string;
  state: CardState;
  lastUpdateAt: number;
  lastContentLength: number;
}

// ── AI Card Throttle Config ──

const AI_CARD_THROTTLE_MS = 300;
const AI_CARD_TEMPLATE_ID = 'StandardCard';

// ── Adapter ──

export class DingTalkAdapter implements IStreamableOutboundAdapter {
  readonly connectorId = 'dingtalk';
  private readonly log: FastifyBaseLogger;
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly robotCode: string;
  private readonly redis: RedisClient | undefined;

  // Stream client (dingtalk-stream SDK)
  private streamClient: unknown = null;
  private stopFn: (() => Promise<void>) | null = null;

  // Active AI Card sessions (keyed by outTrackId)
  private readonly activeCards = new Map<string, ActiveCard>();

  // staffId → conversationId mapping (populated from inbound parseEvent)
  // AI Card delivery needs the real conversationId, but the public layer
  // passes externalChatId (= staffId) for outbound routing.
  private readonly staffToConversation = new Map<string, string>();
  private readonly groupConversationIds = new Set<string>();
  private readonly senderNickCache = new Map<string, string>();
  private readonly conversationTitleCache = new Map<string, string>();

  // DI injection points (for testing + runtime override)
  private sendMessageFn:
    | ((params: { chatId: string; content: string; msgType: string; chatType?: 'p2p' | 'group' }) => Promise<unknown>)
    | null = null;
  private createCardFn:
    | ((params: { outTrackId: string; cardData: Record<string, unknown> }) => Promise<unknown>)
    | null = null;
  private streamingCardFn:
    | ((params: { outTrackId: string; content: string; state: CardState }) => Promise<unknown>)
    | null = null;
  private accessTokenFn: (() => Promise<string>) | null = null;
  private downloadMediaFn: ((downloadCode: string) => Promise<string>) | null = null;

  constructor(log: FastifyBaseLogger, options: DingTalkAdapterOptions) {
    this.log = log;
    this.appKey = options.appKey;
    this.appSecret = options.appSecret;
    this.robotCode = options.robotCode ?? options.appKey;
    this.redis = options.redis;
  }

  // ── Inbound: Parse Stream Event ──

  parseEvent(eventBody: unknown): DingTalkInboundMessage | null {
    if (!eventBody || typeof eventBody !== 'object') return null;

    const body = eventBody as Record<string, unknown>;

    this.log.debug(
      { msgtype: body.msgtype, conversationType: body.conversationType, msgId: body.msgId, senderId: body.senderStaffId },
      '[DingTalkAdapter] parseEvent inbound',
    );

    const msgType = body.msgtype as string | undefined;
    if (!msgType) return null;

    const conversationType = body.conversationType as string | undefined;
    if (conversationType !== '1' && conversationType !== '2') return null;

    const isGroup = conversationType === '2';
    const chatType: 'p2p' | 'group' = isGroup ? 'group' : 'p2p';
    const conversationId = (body.conversationId as string) ?? '';
    const openConversationId = (body.openConversationId as string) ?? '';
    const conversationTitle = (body.conversationTitle as string) ?? undefined;
    const messageId = (body.msgId as string) ?? '';
    const senderStaffId = (body.senderStaffId as string) ?? (body.senderId as string) ?? 'unknown';
    const senderNick = (body.senderNick as string) ?? undefined;
    const chatId = isGroup ? (openConversationId || conversationId) : senderStaffId;

    const base = {
      chatId,
      conversationId,
      messageId,
      senderId: senderStaffId,
      chatType,
      senderNick,
      conversationTitle,
    };

    if (conversationId) this.staffToConversation.set(senderStaffId, conversationId);
    if (isGroup && chatId) {
      this.registerGroupChatId(chatId);
      if (senderNick) this.senderNickCache.set(senderStaffId, senderNick);
      if (conversationTitle) this.conversationTitleCache.set(chatId, conversationTitle);
    }

    switch (msgType) {
      case 'text': {
        const textObj = body.text as Record<string, unknown> | undefined;
        const text = textObj?.content as string | undefined;
        if (!text) return null;
        return { ...base, text: text.trim() };
      }
      case 'richText': {
        const richContent = Array.isArray(body.richText) ? (body.richText as unknown[]) : null;
        if (!richContent) return null;
        const textParts: string[] = [];
        const attachments: DingTalkAttachment[] = [];
        for (const node of richContent) {
          const n = node as Record<string, unknown>;
          if (n.text) textParts.push(String(n.text));
          if (n.type === 'picture' && n.downloadCode) {
            attachments.push({ type: 'image', downloadCode: String(n.downloadCode) });
          }
        }
        const text = textParts.join('') || '[富文本]';
        return { ...base, text, ...(attachments.length > 0 ? { attachments } : {}) };
      }
      case 'picture': {
        const downloadCode = (body.content as Record<string, unknown>)?.downloadCode as string | undefined;
        return {
          ...base,
          text: '[图片]',
          attachments: downloadCode ? [{ type: 'image' as const, downloadCode }] : undefined,
        };
      }
      case 'audio': {
        const audioBody = body.content as Record<string, unknown> | undefined;
        const downloadCode = audioBody?.downloadCode as string | undefined;
        const duration = audioBody?.duration as number | undefined;
        return {
          ...base,
          text: '[语音]',
          attachments: downloadCode
            ? [{ type: 'audio' as const, downloadCode, ...(duration != null ? { duration } : {}) }]
            : undefined,
        };
      }
      case 'file': {
        const fileBody = body.content as Record<string, unknown> | undefined;
        const downloadCode = fileBody?.downloadCode as string | undefined;
        const fileName = fileBody?.fileName as string | undefined;
        return {
          ...base,
          text: fileName ? `[文件] ${fileName}` : '[文件]',
          attachments: downloadCode
            ? [{ type: 'file' as const, downloadCode, ...(fileName ? { fileName } : {}) }]
            : undefined,
        };
      }
      default:
        return null;
    }
  }

  // ── Name Resolution ──

  resolveSenderName(staffId: string): string | undefined {
    return this.senderNickCache.get(staffId);
  }

  resolveConversationTitle(openConversationId: string): string | undefined {
    return this.conversationTitleCache.get(openConversationId);
  }

  private static readonly REDIS_GROUP_IDS_KEY = 'dingtalk-group-chat-ids';

  registerGroupChatId(chatId: string): void {
    this.groupConversationIds.add(chatId);
    this.redis?.sadd(DingTalkAdapter.REDIS_GROUP_IDS_KEY, chatId).catch(() => {});
  }

  async hydrateGroupChatIds(): Promise<void> {
    if (!this.redis) return;
    try {
      const ids = await this.redis.smembers(DingTalkAdapter.REDIS_GROUP_IDS_KEY);
      for (const id of ids) this.groupConversationIds.add(id);
      this.log.info({ count: ids.length }, '[DingTalkAdapter] Hydrated group chatIds from Redis');
    } catch (err) {
      this.log.warn({ err }, '[DingTalkAdapter] Failed to hydrate group chatIds from Redis');
    }
  }

  // ── Outbound: Send Messages ──

  private prependAtSender(content: string, sender: { id: string; name?: string }): string {
    const name = sender.name ?? this.senderNickCache.get(sender.id) ?? '用户';
    return `@${name} ${content}`;
  }

  async sendReply(externalChatId: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
    const metaChatType = (metadata as { chatType?: 'p2p' | 'group' } | undefined)?.chatType;
    const isGroup = metaChatType === 'group' || this.groupConversationIds.has(externalChatId);
    const sender = (metadata as { replyToSender?: { id: string; name?: string } } | undefined)?.replyToSender;
    const text = isGroup && sender ? this.prependAtSender(content, sender) : content;
    await this.postRobotMessage(externalChatId, 'sampleText', { content: text }, isGroup ? 'group' : undefined);
  }

  async sendMarkdown(
    externalChatId: string,
    title: string,
    text: string,
    chatTypeOverride?: 'p2p' | 'group',
  ): Promise<void> {
    await this.postRobotMessage(externalChatId, 'sampleMarkdown', { title, text }, chatTypeOverride);
  }

  async sendRichMessage(
    externalChatId: string,
    textContent: string,
    _blocks: RichBlock[],
    agentDisplayName: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const chatTypeOverride = (metadata as { chatType?: 'p2p' | 'group' } | undefined)?.chatType;
    const title = agentDisplayName;
    await this.sendMarkdown(externalChatId, title, textContent, chatTypeOverride);
  }

  async sendFormattedReply(
    externalChatId: string,
    envelope: MessageEnvelope,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const metaChatType = (metadata as { chatType?: 'p2p' | 'group' } | undefined)?.chatType;
    const chatTypeOverride = metaChatType === 'group' ? 'group' : undefined;
    const isCallback = envelope.origin === 'callback';
    const headerTitle = isCallback ? `📨 ${envelope.header} · 传话` : envelope.header;

    let cardBody = '';
    if (envelope.subtitle) {
      cardBody += `${envelope.subtitle}\n\n`;
    }
    cardBody += envelope.body;
    if (envelope.footer) {
      cardBody += `\n\n---\n${envelope.footer}`;
    }

    const markdownBody = `**${headerTitle}**\n\n${cardBody}`;

    try {
      await this.sendAICard(externalChatId, headerTitle, cardBody, chatTypeOverride);
    } catch (err) {
      this.log.warn({ err }, '[DingTalkAdapter] AI Card sendFormattedReply failed, falling back to markdown');
      await this.sendMarkdown(externalChatId, headerTitle, markdownBody, chatTypeOverride);
    }
  }

  // ── Streaming: AI Card ──

  async sendPlaceholder(externalChatId: string, text: string): Promise<string> {
    const outTrackId = `oc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      await this.createAICardInstance(externalChatId, outTrackId, text);

      this.activeCards.set(outTrackId, {
        outTrackId,
        state: 'PROCESSING',
        lastUpdateAt: 0,
        lastContentLength: 0,
      });

      return outTrackId;
    } catch (err) {
      this.log.warn({ err }, '[DingTalkAdapter] sendPlaceholder failed');
      return '';
    }
  }

  async editMessage(_externalChatId: string, platformMessageId: string, text: string): Promise<void> {
    const card = this.activeCards.get(platformMessageId);
    if (!card) {
      this.log.warn({ platformMessageId }, '[DingTalkAdapter] editMessage: no active card found');
      return;
    }

    const now = Date.now();
    if (now - card.lastUpdateAt < AI_CARD_THROTTLE_MS) return;

    try {
      const newState: CardState = card.state === 'PROCESSING' ? 'INPUTING' : card.state;

      await this.updateAICardStreaming(platformMessageId, text, newState);

      card.state = newState;
      card.lastUpdateAt = now;
      card.lastContentLength = text.length;
    } catch (err) {
      this.log.warn({ err, platformMessageId }, '[DingTalkAdapter] editMessage streaming update failed');
    }
  }

  async deleteMessage(platformMessageId: string): Promise<void> {
    const card = this.activeCards.get(platformMessageId);
    if (!card) return;

    try {
      await this.updateAICardStreaming(platformMessageId, '', 'FINISHED');
    } catch (err) {
      this.log.warn({ err, platformMessageId }, '[DingTalkAdapter] deleteMessage (finish card) failed');
    } finally {
      this.activeCards.delete(platformMessageId);
    }
  }

  // ── Media ──

  async sendMedia(
    externalChatId: string,
    payload: {
      type: 'image' | 'file' | 'audio';
      url?: string;
      absPath?: string;
      fileName?: string;
      [key: string]: unknown;
    },
  ): Promise<void> {
    const url = typeof payload.url === 'string' && payload.url.length > 0 ? payload.url : undefined;
    const absPath = typeof payload.absPath === 'string' && payload.absPath.length > 0 ? payload.absPath : undefined;

    if (payload.type === 'image' && url) {
      await this.sendDingTalkImageMessage(externalChatId, url);
      return;
    }

    const mediaReference =
      url ??
      (typeof payload.fileName === 'string' && payload.fileName.length > 0
        ? payload.fileName
        : absPath
          ? basename(absPath)
          : undefined);

    if (mediaReference) {
      const label = payload.type === 'image' ? '🖼️' : payload.type === 'audio' ? '🔊' : '📎';
      await this.sendReply(externalChatId, `${label} ${mediaReference}`);
      return;
    }
    this.log.warn({ type: payload.type }, '[DingTalkAdapter] sendMedia: no URL available, skipping');
  }

  async downloadMedia(downloadCode: string): Promise<string> {
    if (this.downloadMediaFn) return this.downloadMediaFn(downloadCode);

    const accessToken = await this.getAccessToken();
    const url = `${DINGTALK_API_BASE_URL}/v1.0/robot/messageFiles/download`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': accessToken,
      },
      body: JSON.stringify({ downloadCode, robotCode: this.robotCode }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      throw new Error(`DingTalk media download error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as { downloadUrl?: string };
    if (!data.downloadUrl) throw new Error('DingTalk media download: missing downloadUrl in response');
    return data.downloadUrl;
  }

  // ── Stream Connection ──

  async startStream(onMessage: (msg: DingTalkInboundMessage) => Promise<void>): Promise<void> {
    try {
      const { DWClient, EventAck, TOPIC_ROBOT } = await import('dingtalk-stream');

      const client = new DWClient({
        clientId: this.appKey,
        clientSecret: this.appSecret,
        debug: false,
      });

      client.registerCallbackListener(TOPIC_ROBOT, async (res: unknown) => {
        const downstream = res as { headers?: { messageId?: string }; data?: string };
        const messageId = downstream.headers?.messageId ?? '';
        try {
          const data = downstream.data ? JSON.parse(downstream.data) : null;
          if (!data) return;

          const parsed = this.parseEvent(data);
          if (parsed) {
            await onMessage(parsed);
          }
        } catch (err) {
          this.log.error({ err }, '[DingTalkAdapter] Stream message handler error');
        } finally {
          if (messageId) client.socketCallBackResponse(messageId, EventAck.SUCCESS);
        }
      });

      await client.connect();
      this.streamClient = client;
      this.stopFn = async () => {
        try {
          client.disconnect();
        } catch {
          // ignore disconnect errors
        }
      };

      this.log.info('[DingTalkAdapter] Stream connection established');
    } catch (err) {
      this.log.error({ err }, '[DingTalkAdapter] Failed to start Stream connection');
      throw err;
    }
  }

  async stopStream(): Promise<void> {
    if (this.stopFn) {
      await this.stopFn();
      this.stopFn = null;
      this.streamClient = null;
      this.log.info('[DingTalkAdapter] Stream connection stopped');
    }
  }

  // ── Private: DingTalk OpenAPI Calls ──

  private async postRobotMessage(
    chatId: string,
    msgKey: string,
    msgParam: Record<string, unknown>,
    chatTypeOverride?: 'p2p' | 'group',
  ): Promise<unknown> {
    const isGroup = chatTypeOverride === 'group' || this.groupConversationIds.has(chatId);

    if (this.sendMessageFn) {
      return this.sendMessageFn({
        chatId,
        content: JSON.stringify(msgParam),
        msgType: msgKey,
        chatType: isGroup ? 'group' : 'p2p',
      });
    }

    const accessToken = await this.getAccessToken();
    const url = isGroup
      ? `${DINGTALK_API_BASE_URL}/v1.0/robot/groupMessages/send`
      : `${DINGTALK_API_BASE_URL}/v1.0/robot/oToMessages/batchSend`;

    const payload = isGroup
      ? { robotCode: this.robotCode, openConversationId: chatId, msgKey, msgParam: JSON.stringify(msgParam) }
      : { robotCode: this.robotCode, userIds: [chatId], msgKey, msgParam: JSON.stringify(msgParam) };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': accessToken,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      throw new Error(`DingTalk ${isGroup ? 'group ' : ''}send error ${res.status}: ${body}`);
    }

    return res.json();
  }

  private async sendDingTalkImageMessage(
    chatId: string,
    photoURL: string,
    chatTypeOverride?: 'p2p' | 'group',
  ): Promise<unknown> {
    return this.postRobotMessage(chatId, 'sampleImageMsg', { photoURL }, chatTypeOverride);
  }

  private async createAICardInstance(
    chatId: string,
    outTrackId: string,
    headerText: string,
    chatTypeOverride?: 'p2p' | 'group',
  ): Promise<void> {
    const isGroup = chatTypeOverride === 'group' || this.groupConversationIds.has(chatId);

    if (!isGroup) {
      const conversationId = this.staffToConversation.get(chatId);
      if (!conversationId) {
        throw new Error(`No conversationId mapped for staffId=${chatId}; AI Card requires a prior inbound message`);
      }

      if (this.createCardFn) {
        await this.createCardFn({ outTrackId, cardData: { headerText, conversationId, chatType: 'p2p' } });
        return;
      }

      const accessToken = await this.getAccessToken();
      const url = `${DINGTALK_API_BASE_URL}/v1.0/card/instances/createAndDeliver`;

      const cardData = {
        outTrackId,
        cardTemplateId: AI_CARD_TEMPLATE_ID,
        openSpaceId: `dtv1.card//IM_ROBOT.${this.robotCode}`,
        cardData: {
          cardParamMap: {
            title: headerText,
            content: '...',
            status: 'PROCESSING',
          },
        },
        imRobotOpenSpaceModel: {
          supportForward: true,
        },
        imRobotOpenDeliverModel: {
          spaceType: 'IM_ROBOT',
          robotCode: this.robotCode,
          extension: JSON.stringify({
            conversationType: '1',
            conversationId,
          }),
        },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': accessToken,
        },
        body: JSON.stringify(cardData),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '(unreadable)');
        throw new Error(`DingTalk AI Card create error ${res.status}: ${body}`);
      }
      return;
    }

    if (this.createCardFn) {
      await this.createCardFn({
        outTrackId,
        cardData: { headerText, chatType: 'group', openConversationId: chatId },
      });
      return;
    }

    const accessToken = await this.getAccessToken();
    const url = `${DINGTALK_API_BASE_URL}/v1.0/card/instances/createAndDeliver`;

    const cardData = {
      outTrackId,
      cardTemplateId: AI_CARD_TEMPLATE_ID,
      openSpaceId: `dtv1.card//IM_GROUP.${chatId}`,
      cardData: {
        cardParamMap: {
          title: headerText,
          content: '...',
          status: 'PROCESSING',
        },
      },
      imGroupOpenSpaceModel: {
        supportForward: true,
      },
      imGroupOpenDeliverModel: {
        robotCode: this.robotCode,
        openConversationId: chatId,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': accessToken,
      },
      body: JSON.stringify(cardData),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      throw new Error(`DingTalk AI Card group create error ${res.status}: ${body}`);
    }
  }

  private async updateAICardStreaming(outTrackId: string, content: string, state: CardState): Promise<void> {
    if (this.streamingCardFn) {
      await this.streamingCardFn({ outTrackId, content, state });
      return;
    }

    const accessToken = await this.getAccessToken();
    const url = `${DINGTALK_API_BASE_URL}/v1.0/card/streaming`;

    const payload = {
      outTrackId,
      key: 'content',
      content,
      isFull: true,
      isFinalize: state === 'FINISHED',
      guid: `${outTrackId}-${Date.now()}`,
    };

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': accessToken,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      throw new Error(`DingTalk AI Card streaming error ${res.status}: ${body}`);
    }
  }

  private async sendAICard(
    chatId: string,
    title: string,
    body: string,
    chatTypeOverride?: 'p2p' | 'group',
  ): Promise<void> {
    const outTrackId = `oc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.createAICardInstance(chatId, outTrackId, title, chatTypeOverride);
    await this.updateAICardStreaming(outTrackId, body, 'FINISHED');
  }

  private cachedToken: { token: string; expiresAt: number } | null = null;

  private async getAccessToken(): Promise<string> {
    if (this.accessTokenFn) return this.accessTokenFn();

    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return this.cachedToken.token;
    }

    const url = `${DINGTALK_API_BASE_URL}/v1.0/oauth2/accessToken`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appKey: this.appKey, appSecret: this.appSecret }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      throw new Error(`DingTalk accessToken error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as { accessToken?: string; expireIn?: number };
    const token = data.accessToken;
    if (!token) throw new Error('DingTalk accessToken response missing token');

    const expiresAt = now + (data.expireIn ?? 7200) * 1000;
    this.cachedToken = { token, expiresAt };
    return token;
  }

  // ── Test Helpers ──

  /** @internal */
  _injectSendMessage(
    fn: (params: { chatId: string; content: string; msgType: string; chatType?: 'p2p' | 'group' }) => Promise<unknown>,
  ): void {
    this.sendMessageFn = fn;
  }

  /** @internal */
  _injectCreateCard(fn: (params: { outTrackId: string; cardData: Record<string, unknown> }) => Promise<unknown>): void {
    this.createCardFn = fn;
  }

  /** @internal */
  _injectStreamingCard(
    fn: (params: { outTrackId: string; content: string; state: CardState }) => Promise<unknown>,
  ): void {
    this.streamingCardFn = fn;
  }

  /** @internal */
  _injectAccessToken(fn: () => Promise<string>): void {
    this.accessTokenFn = fn;
  }

  /** @internal */
  _injectDownloadMedia(fn: (downloadCode: string) => Promise<string>): void {
    this.downloadMediaFn = fn;
  }
}
