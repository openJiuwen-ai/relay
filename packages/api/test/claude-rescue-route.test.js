/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check
import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const AUTH_HEADERS = { 'x-office-claw-user': 'test-user' };

describe('claude rescue routes', () => {
  async function buildApp(overrides = {}) {
    const Fastify = (await import('fastify')).default;
    const { claudeRescueRoutes } = await import('../dist/routes/claude-rescue.js');

    const app = Fastify();
    await app.register(claudeRescueRoutes, {
      findBrokenClaudeThinkingSessions:
        overrides.findBrokenClaudeThinkingSessions ??
        (async () => ({
          sessions: [],
        })),
      rescueClaudeThinkingSessions:
        overrides.rescueClaudeThinkingSessions ??
        (async () => ({
          status: 'noop',
          rescuedCount: 0,
          skippedCount: 0,
          results: [],
        })),
    });
    await app.ready();
    return app;
  }

  it('GET /api/claude-rescue/sessions requires identity', async () => {
    const app = await buildApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/claude-rescue/sessions' });
      assert.equal(res.statusCode, 401);
    } finally {
      await app.close();
    }
  });

  it('GET /api/claude-rescue/sessions returns structured session scan results', async () => {
    const app = await buildApp({
      findBrokenClaudeThinkingSessions: async () => ({
        sessions: [
          {
            sessionId: 'broken-1',
            transcriptPath: '/tmp/broken-1.jsonl',
            removableThinkingTurns: 12,
            detectedBy: 'api_error_entry',
          },
        ],
      }),
    });

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/claude-rescue/sessions',
        headers: AUTH_HEADERS,
      });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json(), {
        sessions: [
          {
            sessionId: 'broken-1',
            transcriptPath: '/tmp/broken-1.jsonl',
            removableThinkingTurns: 12,
            detectedBy: 'api_error_entry',
          },
        ],
      });
    } finally {
      await app.close();
    }
  });

  it('POST /api/claude-rescue/rescue rescues selected sessions and returns structured summary', async () => {
    let receivedBody = null;
    const app = await buildApp({
      findBrokenClaudeThinkingSessions: async () => ({
        sessions: [
          {
            sessionId: 'broken-1',
            transcriptPath: '/tmp/broken-1.jsonl',
            removableThinkingTurns: 12,
            detectedBy: 'api_error_entry',
          },
          {
            sessionId: 'broken-2',
            transcriptPath: '/tmp/broken-2.jsonl',
            removableThinkingTurns: 8,
            detectedBy: 'api_error_entry',
          },
        ],
      }),
      rescueClaudeThinkingSessions: async (body) => {
        receivedBody = body;
        return {
          status: 'ok',
          rescuedCount: 1,
          skippedCount: 0,
          results: [
            {
              sessionId: 'broken-1',
              status: 'repaired',
              removedTurns: 12,
              backupPath: '/tmp/backups/broken-1.jsonl',
            },
          ],
        };
      },
    });

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/claude-rescue/rescue',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          sessionIds: ['broken-1'],
        }),
      });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(receivedBody, {
        sessionIds: ['broken-1'],
        targets: [
          {
            sessionId: 'broken-1',
            transcriptPath: '/tmp/broken-1.jsonl',
          },
        ],
      });
      assert.deepEqual(res.json(), {
        status: 'ok',
        rescuedCount: 1,
        skippedCount: 0,
        results: [
          {
            sessionId: 'broken-1',
            status: 'repaired',
            removedTurns: 12,
            backupPath: '/tmp/backups/broken-1.jsonl',
          },
        ],
      });
    } finally {
      await app.close();
    }
  });

  it('POST /api/claude-rescue/rescue rejects unknown sessionIds after trusted re-scan', async () => {
    const app = await buildApp({
      findBrokenClaudeThinkingSessions: async () => ({
        sessions: [
          {
            sessionId: 'broken-1',
            transcriptPath: '/tmp/broken-1.jsonl',
            removableThinkingTurns: 12,
            detectedBy: 'api_error_entry',
          },
        ],
      }),
    });

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/claude-rescue/rescue',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          sessionIds: ['missing-1'],
        }),
      });

      assert.equal(res.statusCode, 400);
      assert.deepEqual(res.json(), {
        error: 'No rescue targets matched the requested sessionIds',
      });
    } finally {
      await app.close();
    }
  });
});
