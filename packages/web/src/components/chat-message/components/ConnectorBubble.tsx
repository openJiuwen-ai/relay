/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { ConnectorTailwindTheme } from '@openjiuwen/relay-shared';
import { getConnectorDefinition } from '@openjiuwen/relay-shared';
import { useState } from 'react';
import { BallotIcon } from '@/components/icons/VoteIcons';
import { MarkdownContent } from '@/components/MarkdownContent';
import { RichBlocks } from '@/components/rich/RichBlocks';
import type { ChatMessage as ChatMessageType, MessageContent } from '@/stores/chatStore';
import { API_URL } from '@/utils/api-client';
import { ConnectorImage, GitHubIcon, SettingsIcon, UsersIcon } from './icons/ConnectorIcons';
import { Lightbox } from '../../Lightbox';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function ConnectorContentBlocks({ blocks }: { blocks: MessageContent[] }) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'text') {
          return <MarkdownContent key={i} content={block.text} />;
        }
        if (block.type === 'image') {
          const src = block.url.startsWith('/uploads/') ? `${API_URL}${block.url}` : block.url;
          const isSafeUrl = src.startsWith('/') || src.startsWith('http://') || src.startsWith('https://');
          return (
            <img
              key={i}
              src={src}
              alt="attached image"
              className="max-w-full sm:max-w-sm rounded-lg mt-2 border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => isSafeUrl && setLightboxSrc(src)}
            />
          );
        }
        return null;
      })}
      {lightboxSrc && <Lightbox url={lightboxSrc} alt="attached image" onClose={() => setLightboxSrc(null)} />}
    </>
  );
}

interface ConnectorBubbleProps {
  message: ChatMessageType;
}

/** Default theme for connectors without a registered tailwindTheme. */
const DEFAULT_CONNECTOR_THEME: ConnectorTailwindTheme = {
  avatar: 'bg-blue-100 ring-blue-200',
  label: 'text-blue-700',
  labelLink: 'text-blue-700 hover:text-blue-900',
  bubble: 'border border-blue-200 bg-blue-50',
};

/** F056: Designed icon per connector — replaces emoji with SVG/PNG icons. */
function ConnectorIcon({ connector, fallbackIcon }: { connector: string; fallbackIcon: string }) {
  switch (connector) {
    case 'scheduler':
      return <ConnectorImage src="/icons/scheduled-task.svg" alt="定时任务" className="w-5 h-5" />;
    case 'feishu':
      return <ConnectorImage src="/images/connectors/feishu.png" alt="Feishu" className="w-5 h-5" />;
    case 'imessage':
      return <ConnectorImage src="/images/connectors/imessage.png" alt="iMessage" className="w-5 h-5" />;
    case 'weixin':
      return <ConnectorImage src="/images/connectors/weixin.png" alt="WeChat" className="w-5 h-5" />;
    case 'dingtalk':
      return <ConnectorImage src="/images/connectors/dingtalk.png" alt="DingTalk" className="w-5 h-5" />;
    case 'wecom-bot':
      return <ConnectorImage src="/images/connectors/wecom-bot.png" alt="WeCom" className="w-5 h-5" />;
    case 'wecom-agent':
      return <ConnectorImage src="/images/connectors/wecom-agent.png" alt="WeCom Agent" className="w-5 h-5" />;
    case 'github-review':
    case 'github-ci':
      // Preserve legacy non-default icons (e.g., triage stored ⚠️ instead of 🔔)
      if (fallbackIcon !== 'github' && fallbackIcon !== '🔔') {
        return <span>{fallbackIcon}</span>;
      }
      return <GitHubIcon className="w-4 h-4" />;
    case 'vote-result':
      return <BallotIcon className="w-4 h-4" />;
    case 'multi-mention-result':
      return <UsersIcon className="w-4 h-4" />;
    case 'system-command':
      return <SettingsIcon className="w-4 h-4" />;
    default:
      if (fallbackIcon.startsWith('/') || fallbackIcon.startsWith('http')) {
        return <ConnectorImage src={fallbackIcon} alt="connector" className="w-5 h-5" />;
      }
      return <span>{fallbackIcon}</span>;
  }
}

/**
 * F098-B5: Registry-driven connector theme lookup.
 * New connectors only need an entry in CONNECTOR_DEFINITIONS (shared package).
 */
function getConnectorTheme(connector: string | undefined): ConnectorTailwindTheme {
  if (!connector) return DEFAULT_CONNECTOR_THEME;
  const def = getConnectorDefinition(connector);
  return def?.tailwindTheme ?? DEFAULT_CONNECTOR_THEME;
}

/**
 * F97: Connector message bubble for external information sources (GitHub Review, etc.)
 * Left-aligned, blue-gray theme, distinct from cat/user/system messages.
 */
export function ConnectorBubble({ message }: ConnectorBubbleProps) {
  const source = message.source;
  if (!source) return null;

  const theme = getConnectorTheme(source.connector);
  const hasBlocks = message.contentBlocks && message.contentBlocks.length > 0;
  const richBlocks = message.extra?.rich?.blocks;
  // P3 fix (砚砚 R1): protocol whitelist — only render safe URLs as clickable links
  const rawUrl = source.url;
  const srcUrl = rawUrl && /^https?:\/\//.test(rawUrl) ? rawUrl : undefined;

  return (
    <div data-message-id={message.id} className="flex gap-2 mb-4 items-start">
      {/* Connector icon avatar */}
      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-base ${theme.avatar}`}>
        <ConnectorIcon connector={source.connector} fallbackIcon={source.icon} />
      </div>
      <div className="max-w-[85%] md:max-w-[75%] min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {srcUrl ? (
            <a
              href={srcUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-xs font-semibold hover:underline ${theme.labelLink}`}
            >
              {source.label}
            </a>
          ) : (
            <span className={`text-xs font-semibold ${theme.label}`}>{source.label}</span>
          )}
          {source.sender && <span className="text-xs text-gray-500">{source.sender.name || source.sender.id} 说</span>}
          <span className="text-xs text-gray-400">{formatTime(message.timestamp)}</span>
        </div>
        <div className={`${theme.bubble} rounded-2xl rounded-bl-sm px-4 py-3 overflow-hidden`}>
          {hasBlocks ? (
            <ConnectorContentBlocks blocks={message.contentBlocks!} />
          ) : (
            <MarkdownContent content={message.content} />
          )}
          {richBlocks && richBlocks.length > 0 && <RichBlocks blocks={richBlocks} />}
        </div>
      </div>
    </div>
  );
}
