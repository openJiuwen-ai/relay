/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * ConnectorMessageFormatter — Platform-agnostic message envelope generator.
 *
 * Converts agent reply metadata into a unified MessageEnvelope structure.
 * Each platform adapter then converts the envelope to its native format
 * (Feishu interactive card, Slack Block Kit, etc.).
 *
 * This is the public layer — business logic lives here, adapters only render.
 *
 * F088 Multi-Platform Chat Gateway
 */

export type MessageOrigin = 'callback' | 'agent' | 'system';

export interface MessageEnvelope {
  /** Agent identity line, e.g. "办公智能体" */
  readonly header: string;
  /** Thread context, e.g. "T12 飞书登录bug排查 · F088" */
  readonly subtitle: string;
  /** Message body (markdown supported) */
  readonly body: string;
  /** Footer text (currently unused, reserved for future use) */
  readonly footer: string;
  /** Where this message originated from — adapters can render differently */
  readonly origin?: MessageOrigin | undefined;
}

export interface FormatInput {
  readonly agentDisplayName: string;
  readonly headerTitle?: string | undefined;
  readonly threadShortId: string;
  readonly threadTitle?: string | undefined;
  readonly featId?: string | undefined;
  readonly body: string;
  readonly deepLinkUrl?: string | undefined;
  readonly origin?: MessageOrigin | undefined;
}

export class ConnectorMessageFormatter {
  format(input: FormatInput): MessageEnvelope {
    const header = input.headerTitle?.trim() || input.agentDisplayName;

    const subtitleParts: string[] = [];
    const normalizedThreadTitle = this.normalizeThreadTitle(input.threadTitle);
    if (normalizedThreadTitle) subtitleParts.push(normalizedThreadTitle);
    if (input.featId) subtitleParts.push(input.featId);
    const subtitle = subtitleParts.join(' · ');

    return { header, subtitle, body: input.body, footer: '', origin: input.origin };
  }

  /**
   * Format a minimal envelope with agent identity only (no thread metadata).
   * Phase E: ensures every message is a distinct card even without threadMeta.
   */
  formatMinimal(input: {
    agentDisplayName: string;
    headerTitle?: string;
    body: string;
    origin?: MessageOrigin;
  }): MessageEnvelope {
    return {
      header: input.headerTitle?.trim() || input.agentDisplayName,
      subtitle: '',
      body: input.body,
      footer: '',
      origin: input.origin,
    };
  }

  /** Format a system/command response (no agent identity, lightweight envelope). */
  formatCommand(body: string): MessageEnvelope {
    return {
      header: 'OfficeClaw',
      subtitle: '',
      body,
      footer: '',
    };
  }

  private normalizeThreadTitle(title?: string | undefined): string {
    const trimmed = title?.trim();
    if (!trimmed) return '';
    if (this.isConnectorAutoThreadTitle(trimmed)) return '';
    return trimmed;
  }

  private isConnectorAutoThreadTitle(title: string): boolean {
    return /\sDM$/u.test(title) || /群聊\s*·/u.test(title);
  }
}
