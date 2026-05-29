/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Task Extractor
 * Extracts actionable tasks from conversation history using LLM.
 * Part of 4-A feature for Phase 4.0.
 */

import { type AgentId, type CreateTaskInput, officeClawRegistry } from '@openjiuwen/relay-shared';
import { getAllAgentIdsFromConfig } from '../../../../config/office-claw-config-loader.js';
import type { StoredMessage } from '../stores/ports/MessageStore.js';
import type { AgentService } from '../types.js';

/** Get all valid agentIds dynamically from the registry */
function getValidAgentIds(): readonly string[] {
  const ids = officeClawRegistry.getAllIds();
  // F032 P2: use config fallback instead of hardcoded agent names
  return ids.length > 0 ? ids : getAllAgentIdsFromConfig();
}

export interface ExtractedTask {
  title: string;
  why: string;
  ownerAgentId?: AgentId | null;
  sourceMessageId?: string;
}

export interface ExtractionOptions {
  threadId: string;
  userId: string;
  signal?: AbortSignal;
  /** Max messages to analyze (default: 50) */
  maxMessages?: number;
}

export interface ExtractionResult {
  tasks: ExtractedTask[];
  /** True if LLM failed and we fell back to pattern matching */
  degraded: boolean;
  /** Reason for degradation */
  reason?: string;
}

/** Format messages for LLM context */
function formatMessagesForExtraction(messages: StoredMessage[]): string {
  return messages
    .map((m, i) => {
      const speaker = m.agentId ? `[${m.agentId}]` : '[User]';
      const idLabel = `(msg-${i})`;
      return `${idLabel} ${speaker}: ${m.content}`;
    })
    .join('\n\n');
}

/**
 * Normalize sourceIndex from LLM response.
 * Handles: number, string number ("3"), msg-N format ("msg-3"), or undefined.
 */
function normalizeSourceIndex(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string') {
    // Try parsing "msg-N" format
    const msgMatch = value.match(/^msg-(\d+)$/i);
    if (msgMatch) {
      return parseInt(msgMatch[1]!, 10);
    }
    // Try parsing plain number string
    const num = parseInt(value, 10);
    if (!Number.isNaN(num) && num >= 0) {
      return num;
    }
  }
  return null;
}

/** Parse LLM JSON response */
function parseExtractedTasks(response: string, messages: StoredMessage[]): ExtractedTask[] | null {
  // Try to extract JSON array from response
  const jsonMatch = response.match(/\[[\s\S]*?\]/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      title?: unknown;
      why?: unknown;
      ownerAgentId?: unknown;
      sourceIndex?: unknown;
    }>;

    return parsed
      .filter(
        (item): item is { title: string; why: string; ownerAgentId?: unknown; sourceIndex?: unknown } =>
          typeof item.title === 'string' && typeof item.why === 'string',
      )
      .map((item) => {
        const task: ExtractedTask = {
          title: item.title.slice(0, 200),
          why: item.why.slice(0, 500),
        };
        // Validate ownerAgentId is a known agent
        if (typeof item.ownerAgentId === 'string' && getValidAgentIds().includes(item.ownerAgentId)) {
          task.ownerAgentId = item.ownerAgentId as AgentId;
        }
        // Normalize and validate sourceIndex
        const idx = normalizeSourceIndex(item.sourceIndex);
        if (idx !== null && messages[idx]) {
          task.sourceMessageId = messages[idx]?.id;
        }
        return task;
      });
  } catch {
    return null;
  }
}

/** Fallback pattern matching for TODO/task extraction */
function extractByPatterns(messages: StoredMessage[]): ExtractedTask[] {
  const tasks: ExtractedTask[] = [];
  const patterns = [
    /- \[ \] (.+)/g, // Markdown checkbox
    /TODO:?\s*(.+)/gi, // TODO: or TODO
    /#task\s+(.+)/gi, // #task tag
    /Action Item:?\s*(.+)/gi, // Action item
  ];

  for (const msg of messages) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(msg.content)) !== null) {
        const title = match[1]?.trim();
        if (title && title.length > 3 && title.length < 200) {
          tasks.push({
            title,
            why: 'Extracted from conversation',
            sourceMessageId: msg.id,
          });
        }
      }
    }
  }

  return tasks;
}

/** Build the extraction prompt */
function buildExtractionPrompt(contextText: string): string {
  return `You are a task extraction assistant. Analyze the following conversation and extract actionable tasks.

For each task, provide:
- title: A concise, actionable title (max 100 chars)
- why: Brief explanation of why this task is needed (max 200 chars)
- ownerAgentId: If someone is clearly assigned, use one of: ${getValidAgentIds()
    .map((id) => `"${id}"`)
    .join(', ')}. Otherwise null.
- sourceIndex: The message index (msg-N) that originated this task

Return a JSON array. Example:
[
  {"title": "Implement user auth", "why": "Security requirement", "ownerAgentId": "opus", "sourceIndex": 3},
  {"title": "Add unit tests", "why": "Ensure code quality", "ownerAgentId": null, "sourceIndex": 5}
]

If no tasks are found, return an empty array: []

Conversation:
${contextText}

Extract tasks as JSON:`;
}

/**
 * Extract tasks from conversation history.
 * Uses LLM for intelligent extraction with pattern matching fallback.
 */
export async function extractTasks(
  messages: StoredMessage[],
  agentService: AgentService,
  options: ExtractionOptions,
): Promise<ExtractionResult> {
  const { signal, maxMessages = 50 } = options;

  if (messages.length === 0) {
    return { tasks: [], degraded: false };
  }

  // Limit messages to analyze
  const recentMessages = messages.slice(-maxMessages);
  const contextText = formatMessagesForExtraction(recentMessages);

  // Check if aborted before LLM call
  if (signal?.aborted) {
    return { tasks: [], degraded: true, reason: 'Aborted before extraction' };
  }

  try {
    // Call LLM for extraction
    const prompt = buildExtractionPrompt(contextText);
    let fullResponse = '';

    for await (const msg of agentService.invoke(prompt, {})) {
      if (signal?.aborted) {
        return { tasks: [], degraded: true, reason: 'Aborted during extraction' };
      }
      if (msg.type === 'text' && msg.content) {
        fullResponse += msg.content;
      }
      if (msg.type === 'error') {
        throw new Error(msg.error ?? 'LLM error');
      }
    }

    const parsed = parseExtractedTasks(fullResponse, recentMessages);
    if (parsed) {
      return { tasks: parsed, degraded: false };
    }

    // LLM response wasn't valid JSON, fall back to patterns
    const patternTasks = extractByPatterns(recentMessages);
    return {
      tasks: patternTasks,
      degraded: true,
      reason: 'LLM response was not valid JSON, used pattern matching',
    };
  } catch (err) {
    // LLM failed, fall back to pattern matching
    const patternTasks = extractByPatterns(recentMessages);
    return {
      tasks: patternTasks,
      degraded: true,
      reason: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Convert extracted tasks to CreateTaskInput for storage.
 */
export function toCreateTaskInputs(
  extracted: ExtractedTask[],
  threadId: string,
  createdBy: AgentId | 'user',
): CreateTaskInput[] {
  return extracted.map((task) => {
    const base = {
      threadId,
      title: task.title,
      why: task.why,
      createdBy,
      ownerAgentId: task.ownerAgentId ?? null,
    };
    // Only add sourceMessageId if present
    if (task.sourceMessageId) {
      return { ...base, sourceMessageId: task.sourceMessageId } as CreateTaskInput;
    }
    return base as CreateTaskInput;
  });
}
