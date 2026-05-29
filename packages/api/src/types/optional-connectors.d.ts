/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

declare module '@wecom/aibot-node-sdk' {
  export function generateReqId(prefix: string): string;

  interface WeComBotFrame {
    headers: { req_id: string; [key: string]: unknown };
    body?: Record<string, unknown>;
  }

  interface WeComBotWsClientOptions {
    botId: string;
    secret: string;
    maxReconnectAttempts?: number;
  }

  class WSClient {
    constructor(options: WeComBotWsClientOptions);
    on(event: 'authenticated', handler: () => void | Promise<void>): void;
    on(event: 'disconnected', handler: (reason: string) => void | Promise<void>): void;
    on(event: 'reconnecting', handler: (attempt: number) => void | Promise<void>): void;
    on(event: 'error', handler: (error: Error) => void | Promise<void>): void;
    on(event: string, handler: (frame: WeComBotFrame) => void | Promise<void>): void;
    connect(): Promise<void>;
    close(): Promise<void>;
    disconnect(): void;
    sendText(payload: Record<string, unknown>): Promise<unknown>;
    sendMarkdown(payload: Record<string, unknown>): Promise<unknown>;
    sendTemplateCard(payload: Record<string, unknown>): Promise<unknown>;
    replyText(payload: Record<string, unknown>): Promise<unknown>;
    replyMarkdown(payload: Record<string, unknown>): Promise<unknown>;
    replyTemplateCard(payload: Record<string, unknown>): Promise<unknown>;
    downloadFile(url: string, aesKey?: string): Promise<{ buffer: Buffer; filename?: string }>;
  }

  const AiBot: {
    WSClient: typeof WSClient;
  };

  export default AiBot;
}
