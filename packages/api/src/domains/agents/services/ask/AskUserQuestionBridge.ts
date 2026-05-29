/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentId } from '@openjiuwen/relay-shared';
import type {
  JiuwenAskUserQuestionPayload,
  JiuwenBridgeAnswerSubmission,
} from '../auth/JiuwenPermissionBridge.js';
import type { SocketManager } from '../../../../infrastructure/websocket/index.js';

export interface AskUserQuestionRecord {
  localRequestId: string;
  jiuwenRequestId: string;
  sessionId: string;
  threadId: string;
  agentId: AgentId;
  invocationId: string;
  source?: string;
  questions: JiuwenAskUserQuestionPayload['questions'];
  createdAt: number;
  status: 'waiting' | 'resolved';
  expiresAtMs?: number;
}

interface IngestAskUserQuestionInput {
  agentId: AgentId;
  threadId: string;
  invocationId: string;
  sessionId: string;
  payload: JiuwenAskUserQuestionPayload;
  submitAnswer: (submission: JiuwenBridgeAnswerSubmission) => Promise<void>;
}

interface AskUserQuestionRecordState extends AskUserQuestionRecord {
  submitAnswer: (submission: JiuwenBridgeAnswerSubmission) => Promise<void>;
}

export class AskUserQuestionBridge {
  private socketManager: SocketManager | null = null;
  private readonly byLocalRequestId = new Map<string, AskUserQuestionRecordState>();

  bindSocketManager(socketManager: SocketManager): void {
    this.socketManager = socketManager;
  }

  async ingestAskUserQuestion(input: IngestAskUserQuestionInput): Promise<AskUserQuestionRecord | null> {
    if (input.payload.source && input.payload.source !== 'ask_tool') {
      return null;
    }
    if (!Array.isArray(input.payload.questions) || input.payload.questions.length === 0) {
      return null;
    }

    const localRequestId = `ask_${input.payload.request_id}`;
    const created: AskUserQuestionRecordState = {
      localRequestId,
      jiuwenRequestId: input.payload.request_id,
      sessionId: input.sessionId,
      threadId: input.threadId,
      agentId: input.agentId,
      invocationId: input.invocationId,
      source: input.payload.source,
      questions: input.payload.questions,
      expiresAtMs: input.payload.expires_at_ms,
      createdAt: Date.now(),
      status: 'waiting',
      submitAnswer: input.submitAnswer,
    };

    const existing = this.byLocalRequestId.get(localRequestId);
    if (existing) {
      this.byLocalRequestId.set(localRequestId, { ...existing, submitAnswer: input.submitAnswer });
      return null;
    }

    this.byLocalRequestId.set(localRequestId, created);
    this.socketManager?.broadcastToRoom(`thread:${input.threadId}`, 'ask_user_question:request', {
      requestId: created.localRequestId,
      threadId: created.threadId,
      source: created.source,
      questions: created.questions,
      agentId: created.agentId,
      createdAt: created.createdAt,
      expiresAtMs: created.expiresAtMs,
    });

    return created;
  }

  async submitAnswer(input: {
    localRequestId: string;
    source?: string;
    answers: JiuwenBridgeAnswerSubmission['answers'];
  }): Promise<AskUserQuestionRecord | null> {
    const record = this.byLocalRequestId.get(input.localRequestId);
    if (!record || record.status !== 'waiting') return null;

    await record.submitAnswer({
      sessionId: record.sessionId,
      jiuwenRequestId: record.jiuwenRequestId,
      source: input.source ?? record.source,
      answers: input.answers,
    });
    record.status = 'resolved';

    this.socketManager?.broadcastToRoom(`thread:${record.threadId}`, 'ask_user_question:response', {
      requestId: record.localRequestId,
      threadId: record.threadId,
      status: 'resolved',
    });

    return record;
  }

  getPending(threadId?: string): Array<Omit<AskUserQuestionRecord, 'localRequestId'> & { requestId: string }> {
    return [...this.byLocalRequestId.values()]
      .filter((record) => record.status === 'waiting' && (!threadId || record.threadId === threadId))
      .sort((left, right) => left.createdAt - right.createdAt)
      .map(({ submitAnswer: _submitAnswer, localRequestId, ...rest }) => ({
        requestId: localRequestId,
        ...rest,
      }));
  }
}

const singleton = new AskUserQuestionBridge();

export function getAskUserQuestionBridge(): AskUserQuestionBridge {
  return singleton;
}
