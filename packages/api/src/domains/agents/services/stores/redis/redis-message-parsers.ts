/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis message field parsers — 从 RedisMessageStore 拆出的纯函数
 *
 * F23: 拆分以减少 RedisMessageStore.ts 行数
 */

import type { AgentId, ConnectorSource, MessageContent, RichMessageExtra, TaskRunPersistExtra } from '@openjiuwen/relay-shared';
import type { MessageMetadata } from '../../types.js';
import type { StoredToolEvent } from '../ports/MessageStore.js';

export function safeParseMentions(raw: string | undefined): readonly AgentId[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function safeParseToolEvents(raw: string | undefined): readonly StoredToolEvent[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function safeParseContentBlocks(raw: string | undefined): readonly MessageContent[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** F22+F52: Parse extra field (contains rich blocks, stream metadata, cross-post origin) */
export function safeParseExtra(raw: string | undefined):
  | {
      rich?: RichMessageExtra;
      stream?: { invocationId: string; durationMs?: number; userStopped?: boolean };
      crossPost?: { sourceThreadId: string; sourceInvocationId?: string };
      taskRuns?: TaskRunPersistExtra;
    }
  | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;

    const result: {
      rich?: RichMessageExtra;
      stream?: { invocationId: string; durationMs?: number; userStopped?: boolean };
      crossPost?: { sourceThreadId: string; sourceInvocationId?: string };
      taskRuns?: TaskRunPersistExtra;
    } = {};
    let hasField = false;

    // Validate rich sub-field shape
    if (parsed.rich && typeof parsed.rich === 'object' && parsed.rich.v === 1 && Array.isArray(parsed.rich.blocks)) {
      result.rich = parsed.rich as RichMessageExtra;
      hasField = true;
    }

    // Validate stream sub-field shape (#80: draft dedup key; durationMs from invocation_complete)
    if (parsed.stream && typeof parsed.stream === 'object' && typeof parsed.stream.invocationId === 'string') {
      const dm = (parsed.stream as { durationMs?: unknown }).durationMs;
      const durationMs =
        typeof dm === 'number' && Number.isFinite(dm) && dm >= 0 ? dm : undefined;
      const us = (parsed.stream as { userStopped?: unknown }).userStopped;
      const userStopped = us === true ? true : undefined;
      result.stream =
        durationMs !== undefined
          ? { invocationId: parsed.stream.invocationId, durationMs, ...(userStopped ? { userStopped: true } : {}) }
          : { invocationId: parsed.stream.invocationId, ...(userStopped ? { userStopped: true } : {}) };
      hasField = true;
    }

    // F52: Validate crossPost sub-field shape
    if (
      parsed.crossPost &&
      typeof parsed.crossPost === 'object' &&
      typeof parsed.crossPost.sourceThreadId === 'string'
    ) {
      result.crossPost = {
        sourceThreadId: parsed.crossPost.sourceThreadId,
        ...(typeof parsed.crossPost.sourceInvocationId === 'string'
          ? { sourceInvocationId: parsed.crossPost.sourceInvocationId }
          : {}),
      };
      hasField = true;
    }

    // Jiuwen / relay-claw: per-task thinking + tools + text (must survive Redis round-trip)
    if (
      parsed.taskRuns &&
      typeof parsed.taskRuns === 'object' &&
      parsed.taskRuns !== null &&
      parsed.taskRuns.v === 1 &&
      Array.isArray(parsed.taskRuns.segments)
    ) {
      result.taskRuns = parsed.taskRuns as TaskRunPersistExtra;
      hasField = true;
    }

    return hasField ? result : undefined;
  } catch {
    return undefined;
  }
}

/** F97: Parse connector source field */
export function safeParseConnectorSource(raw: string | undefined): ConnectorSource | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.connector === 'string' &&
      typeof parsed.label === 'string' &&
      typeof parsed.icon === 'string'
    ) {
      return parsed as ConnectorSource;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function safeParseMetadata(raw: string | undefined): MessageMetadata | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.provider === 'string' &&
      typeof parsed.model === 'string'
    ) {
      return parsed as MessageMetadata;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
