/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyInstance } from 'fastify';
import { createModuleLogger } from '../infrastructure/logger.js';
import type { IThreadStore } from '../domains/agents/services/stores/ports/ThreadStore.js';
import { getExpertCatalog } from '../domains/agents/services/experts/ExpertCatalog.js';

const log = createModuleLogger('routes/experts');

const EXPERT_CATEGORY_COLORS: Record<string, { primary: string; secondary: string }> = {
  design: { primary: '#FF6B6B', secondary: '#FFE0E0' },
  marketing: { primary: '#4ECDC4', secondary: '#D8F7F4' },
  growth: { primary: '#45B7D1', secondary: '#D8EFF8' },
  content: { primary: '#96CEB4', secondary: '#DDEFE4' },
};

export interface ExpertsRoutesOptions {
  threadStore: IThreadStore;
}

export async function expertsRoutes(fastify: FastifyInstance, options: ExpertsRoutesOptions): Promise<void> {
  const { threadStore } = options;
  const catalog = getExpertCatalog();

  fastify.get('/api/experts', {
    handler: async (request, reply) => {
      const category = (request.query as { category?: string }).category;
      if (!catalog.isInitialized) {
        return reply.status(500).send({ error: 'EXPERT_CATALOG_NOT_LOADED', message: '专家目录未初始化' });
      }

      const experts = category ? catalog.getExpertsByCategory(category) : catalog.getAllExperts();
      return reply.send({ experts, total: experts.length });
    },
  });

  fastify.get('/api/threads/:threadId/experts', {
    handler: async (request, reply) => {
      const { threadId } = request.params as { threadId: string };
      const thread = await threadStore.get(threadId);
      if (!thread) {
        return reply.status(404).send({ error: 'THREAD_NOT_FOUND', message: 'Thread 不存在' });
      }

      const invitedExpertIds = await threadStore.getInvitedExperts(threadId);
      const invitedExperts = invitedExpertIds
        .map((expertId) => {
          const expert = catalog.getExpert(expertId);
          if (!expert) return null;
          return {
            expertId: expert.expertId,
            displayName: expert.displayName,
            nickname: expert.nickname,
            avatar: expert.avatar,
            category: expert.category,
            mentionPatterns: expert.mentionPatterns,
            roleDescription: expert.roleDescription,
            invitedAt: thread.createdAt,
          };
        })
        .filter(Boolean);

      return reply.send({ threadId, invitedExperts, total: invitedExperts.length });
    },
  });

  fastify.post('/api/threads/:threadId/experts/:expertId/invite', {
    handler: async (request, reply) => {
      const { threadId, expertId } = request.params as { threadId: string; expertId: string };
      if (!catalog.isInitialized) {
        return reply.status(500).send({ error: 'EXPERT_CATALOG_NOT_LOADED', message: '专家目录未初始化' });
      }
      if (!expertId.startsWith('expert-')) {
        return reply.status(400).send({ error: 'INVALID_EXPERT', message: 'expertId 格式无效' });
      }
      const expert = catalog.getExpert(expertId);
      if (!expert) {
        return reply.status(400).send({ error: 'INVALID_EXPERT', message: '该 expertId 不是有效的预置专家' });
      }
      const thread = await threadStore.get(threadId);
      if (!thread) {
        return reply.status(404).send({ error: 'THREAD_NOT_FOUND', message: 'Thread 不存在' });
      }
      const invitedExperts = await threadStore.getInvitedExperts(threadId);
      if (invitedExperts.includes(expertId)) {
        return reply.status(409).send({ error: 'ALREADY_INVITED', message: '专家已在邀请列表中' });
      }

      await threadStore.inviteExpert(threadId, expertId);
      log.info({ threadId, expertId }, '[experts] expert invited');
      return reply.send({ ok: true });
    },
  });

  fastify.delete('/api/threads/:threadId/experts/:expertId', {
    handler: async (request, reply) => {
      const { threadId, expertId } = request.params as { threadId: string; expertId: string };
      if (!catalog.isInitialized) {
        return reply.status(500).send({ error: 'EXPERT_CATALOG_NOT_LOADED', message: '专家目录未初始化' });
      }
      if (!expertId.startsWith('expert-')) {
        return reply.status(400).send({ error: 'NOT_AN_EXPERT', message: '被移除者不是预置专家' });
      }
      const expert = catalog.getExpert(expertId);
      if (!expert) {
        return reply.status(400).send({ error: 'NOT_AN_EXPERT', message: '被移除者不是预置专家' });
      }
      const thread = await threadStore.get(threadId);
      if (!thread) {
        return reply.status(404).send({ error: 'THREAD_NOT_FOUND', message: 'Thread 不存在' });
      }
      const invitedExperts = await threadStore.getInvitedExperts(threadId);
      if (!invitedExperts.includes(expertId)) {
        return reply.status(404).send({ error: 'EXPERT_NOT_IN_THREAD', message: '专家不在邀请列表中' });
      }

      await threadStore.removeExpert(threadId, expertId);
      log.info({ threadId, expertId }, '[experts] expert removed');
      return reply.send({ ok: true });
    },
  });
}
