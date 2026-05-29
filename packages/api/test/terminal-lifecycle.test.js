/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

/**
 * Terminal session lifecycle tests (route-level).
 *
 * These tests verify the core lifecycle contract:
 * 1. WS disconnect does NOT delete the session or kill the pane
 * 2. Re-mount can reconnect to an existing disconnected session
 * 3. Only explicit DELETE kills the pane and cleans up
 * 4. GET /sessions filters by userId
 *
 * We test the session store logic directly (extracted from routes)
 * to avoid needing a full Fastify + tmux + PTY setup.
 */

// ---------------------------------------------------------------------------
// Minimal in-memory session store (mirrors the route's ActiveSession + store)
// We'll extract this into a real module after the tests pass.
// ---------------------------------------------------------------------------

/** @typedef {'connected' | 'disconnected'} SessionStatus */

/**
 * @typedef {Object} ActiveSession
 * @property {string} id
 * @property {string} worktreeId
 * @property {string} paneId
 * @property {string} userId
 * @property {SessionStatus} status
 * @property {number} createdAt
 */

// Import the session store once it exists
// For RED phase, we define the expected interface and import will fail
import { TerminalSessionStore } from '../dist/domains/terminal/session-store.js';

describe('TerminalSessionStore', () => {
  /** @type {TerminalSessionStore} */
  let store;

  beforeEach(() => {
    store = new TerminalSessionStore();
  });

  // ── Test 1: WS disconnect does NOT remove session ──────────────────
  it('markDisconnected keeps session alive (does not remove)', () => {
    const session = store.create({
      worktreeId: 'wt-1',
      paneId: '%0',
      userId: 'alice',
    });

    assert.equal(store.get(session.id)?.status, 'connected');

    store.markDisconnected(session.id);

    const after = store.get(session.id);
    assert.ok(after, 'session should still exist after disconnect');
    assert.equal(after.status, 'disconnected');
  });

  // ── Test 2: Re-mount reconnects to existing disconnected session ───
  it('findReconnectable returns disconnected session for same worktree + user', () => {
    const session = store.create({
      worktreeId: 'wt-1',
      paneId: '%0',
      userId: 'alice',
    });
    store.markDisconnected(session.id);

    const found = store.findReconnectable('wt-1', 'alice');
    assert.ok(found, 'should find reconnectable session');
    assert.equal(found.id, session.id);
    assert.equal(found.paneId, '%0');
  });

  it('findReconnectable does NOT return connected session', () => {
    store.create({
      worktreeId: 'wt-1',
      paneId: '%0',
      userId: 'alice',
    });
    // Session is still connected — should not be "reconnectable"
    const found = store.findReconnectable('wt-1', 'alice');
    assert.equal(found, undefined, 'connected session is not reconnectable');
  });

  it('findReconnectable does NOT return other user sessions', () => {
    const session = store.create({
      worktreeId: 'wt-1',
      paneId: '%0',
      userId: 'alice',
    });
    store.markDisconnected(session.id);

    const found = store.findReconnectable('wt-1', 'bob');
    assert.equal(found, undefined, 'should not return sessions belonging to other users');
  });

  // ── Test 3: Only explicit remove() deletes session ─────────────────
  it('remove() deletes the session', () => {
    const session = store.create({
      worktreeId: 'wt-1',
      paneId: '%0',
      userId: 'alice',
    });

    const removed = store.remove(session.id);
    assert.ok(removed, 'remove should return the removed session');
    assert.equal(store.get(session.id), undefined, 'session should be gone');
  });

  // ── Test 4: listByUser filters by userId ───────────────────────────
  it('listByUser returns only sessions belonging to that user', () => {
    store.create({ worktreeId: 'wt-1', paneId: '%0', userId: 'alice' });
    store.create({ worktreeId: 'wt-1', paneId: '%1', userId: 'bob' });
    store.create({ worktreeId: 'wt-2', paneId: '%0', userId: 'alice' });

    const aliceSessions = store.listByUser('alice');
    assert.equal(aliceSessions.length, 2);
    assert.ok(aliceSessions.every((s) => s.userId === 'alice'));

    const bobSessions = store.listByUser('bob');
    assert.equal(bobSessions.length, 1);
    assert.equal(bobSessions[0].userId, 'bob');
  });

  // ── Test 5: markConnected transitions disconnected → connected ─────
  it('markConnected transitions back to connected', () => {
    const session = store.create({
      worktreeId: 'wt-1',
      paneId: '%0',
      userId: 'alice',
    });
    store.markDisconnected(session.id);
    assert.equal(store.get(session.id)?.status, 'disconnected');

    store.markConnected(session.id);
    assert.equal(store.get(session.id)?.status, 'connected');
  });

  // ── Test 6: hasRemainingForWorktree checks correctly ───────────────
  it('hasRemainingForWorktree returns true when other sessions exist', () => {
    store.create({ worktreeId: 'wt-1', paneId: '%0', userId: 'alice' });
    const s2 = store.create({ worktreeId: 'wt-1', paneId: '%1', userId: 'bob' });

    store.remove(s2.id);
    assert.equal(store.hasRemainingForWorktree('wt-1'), true);
  });

  it('hasRemainingForWorktree returns false when no sessions remain', () => {
    const s1 = store.create({ worktreeId: 'wt-1', paneId: '%0', userId: 'alice' });
    store.remove(s1.id);
    assert.equal(store.hasRemainingForWorktree('wt-1'), false);
  });

  // ── Test 7: listByWorktree for pane list UI ────────────────────────
  it('listByWorktree returns all sessions for a worktree', () => {
    store.create({ worktreeId: 'wt-1', paneId: '%0', userId: 'alice' });
    store.create({ worktreeId: 'wt-1', paneId: '%1', userId: 'bob' });
    store.create({ worktreeId: 'wt-2', paneId: '%0', userId: 'alice' });

    const wt1Sessions = store.listByWorktree('wt-1');
    assert.equal(wt1Sessions.length, 2);
  });

  // ── Test 8: getByIdAndUser — ownership-gated lookup (P1 fix) ──────
  it('getByIdAndUser returns session only for matching userId', () => {
    const session = store.create({ worktreeId: 'wt-1', paneId: '%0', userId: 'alice' });

    assert.ok(store.getByIdAndUser(session.id, 'alice'), 'owner should get session');
    assert.equal(store.getByIdAndUser(session.id, 'bob'), undefined, 'non-owner gets undefined');
  });

  it('getByIdAndUser returns undefined for non-existent session', () => {
    assert.equal(store.getByIdAndUser('nonexistent', 'alice'), undefined);
  });

  // ── Test 9: findReconnectable skips stale sessions (P2-1 contract) ─
  it('removeStale removes disconnected session by id', () => {
    const s1 = store.create({ worktreeId: 'wt-1', paneId: '%0', userId: 'alice' });
    store.markDisconnected(s1.id);

    store.remove(s1.id);

    const found = store.findReconnectable('wt-1', 'alice');
    assert.equal(found, undefined, 'stale session should not be reconnectable after removal');
  });
});
