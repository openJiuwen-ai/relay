/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import Fastify from 'fastify';

const H = { 'x-office-claw-user': 'user1' };

/** Helper: create a project and return its id */
async function createProject(app, headers = H) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/external-projects',
    headers,
    payload: { name: 'test-proj', description: '', sourcePath: '/tmp/test' },
  });
  return res.json().project.id;
}

/** Helper: create an intent card and return its id */
async function createCard(app, projectId, overrides = {}) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/external-projects/${projectId}/intent-cards`,
    headers: H,
    payload: { actor: 'Admin', goal: 'Approve orders', originalText: 'T', ...overrides },
  });
  return res.json().card.id;
}

describe('F076 Phase 2: Intent Card + Risk Detection Routes', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app;
  let projectId;

  beforeEach(async () => {
    const { ExternalProjectStore } = await import('../dist/domains/projects/external-project-store.js');
    const { IntentCardStore } = await import('../dist/domains/projects/intent-card-store.js');
    const { NeedAuditFrameStore } = await import('../dist/domains/projects/need-audit-frame-store.js');
    const { BacklogStore } = await import('../dist/domains/agents/services/stores/ports/BacklogStore.js');
    const { externalProjectRoutes } = await import('../dist/routes/external-projects.js');
    const { intentCardRoutes } = await import('../dist/routes/intent-card-routes.js');

    const externalProjectStore = new ExternalProjectStore();
    app = Fastify();
    await app.register(externalProjectRoutes, {
      externalProjectStore,
      needAuditFrameStore: new NeedAuditFrameStore(),
      backlogStore: new BacklogStore(),
    });
    await app.register(intentCardRoutes, {
      externalProjectStore,
      intentCardStore: new IntentCardStore(),
    });
    projectId = await createProject(app);
  });

  test('POST detect-risks returns risk signals for risky card', async () => {
    const cardId = await createCard(app, projectId, {
      actor: 'System',
      goal: 'Optimize performance',
      successSignal: '',
      objectState: '',
      sourceTag: 'A',
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/intent-cards/${cardId}/detect-risks`,
      headers: H,
    });
    assert.equal(res.statusCode, 200);
    const { risks } = res.json();
    assert.ok(risks.length >= 2);
    const signals = risks.map((/** @type {{ signal: string }} */ r) => r.signal);
    assert.ok(signals.includes('missing_success_signal'));
  });

  test('POST detect-risks updates card riskSignals', async () => {
    const cardId = await createCard(app, projectId, {
      actor: 'System',
      goal: 'Improve things',
      successSignal: '',
      sourceTag: 'Q',
    });
    await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/intent-cards/${cardId}/detect-risks`,
      headers: H,
    });
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/intent-cards/${cardId}`,
      headers: H,
    });
    const card = getRes.json().card;
    assert.ok(card.riskSignals.length > 0);
  });

  test('POST detect-risks returns 404 for unknown card', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/intent-cards/ic-nonexistent/detect-risks`,
      headers: H,
    });
    assert.equal(res.statusCode, 404);
  });

  test('GET risk-summary aggregates across all cards', async () => {
    await createCard(app, projectId, { actor: 'System', goal: 'Improve DB', successSignal: '', sourceTag: 'A' });
    await createCard(app, projectId, { actor: 'Admin', goal: 'View report', successSignal: 'Report visible' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/risk-summary`,
      headers: H,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.totalCards, 2);
    assert.ok(body.cardsWithRisks >= 1);
    assert.ok(typeof body.signals === 'object');
  });

  test('POST detect-risks returns 401 without userId', async () => {
    const cardId = await createCard(app, projectId);
    const res = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/intent-cards/${cardId}/detect-risks`,
    });
    assert.equal(res.statusCode, 401);
  });

  test('GET risk-summary returns 404 for other user project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/risk-summary`,
      headers: { 'x-office-claw-user': 'other' },
    });
    assert.equal(res.statusCode, 404);
  });
});

describe('F076 Phase 2: Resolution Routes', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app;
  let projectId;

  beforeEach(async () => {
    const { ExternalProjectStore } = await import('../dist/domains/projects/external-project-store.js');
    const { NeedAuditFrameStore } = await import('../dist/domains/projects/need-audit-frame-store.js');
    const { BacklogStore } = await import('../dist/domains/agents/services/stores/ports/BacklogStore.js');
    const { ResolutionStore } = await import('../dist/domains/projects/resolution-store.js');
    const { externalProjectRoutes } = await import('../dist/routes/external-projects.js');
    const { resolutionRoutes } = await import('../dist/routes/resolution-routes.js');

    const externalProjectStore = new ExternalProjectStore();
    app = Fastify();
    await app.register(externalProjectRoutes, {
      externalProjectStore,
      needAuditFrameStore: new NeedAuditFrameStore(),
      backlogStore: new BacklogStore(),
    });
    await app.register(resolutionRoutes, {
      externalProjectStore,
      resolutionStore: new ResolutionStore(),
    });
    projectId = await createProject(app);
  });

  test('POST creates resolution', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/resolutions`,
      headers: H,
      payload: { cardId: 'ic-1', path: 'confirmation', question: 'Is this right?' },
    });
    assert.equal(res.statusCode, 201);
    assert.ok(res.json().resolution.id.startsWith('res-'));
    assert.equal(res.json().resolution.status, 'open');
  });

  test('GET lists resolutions', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/resolutions`,
      headers: H,
      payload: { cardId: 'ic-1', path: 'confirmation', question: 'Q1' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/resolutions`,
      headers: H,
      payload: { cardId: 'ic-2', path: 'evidence', question: 'Q2' },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/resolutions`,
      headers: H,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().resolutions.length, 2);
  });

  test('GET with ?status=open filters', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/resolutions`,
      headers: H,
      payload: { cardId: 'ic-1', path: 'confirmation', question: 'Q1' },
    });
    const id = createRes.json().resolution.id;

    // Answer one resolution
    await app.inject({
      method: 'PATCH',
      url: `/api/external-projects/${projectId}/resolutions/${id}/answer`,
      headers: H,
      payload: { answer: 'Yes' },
    });

    // Create another that stays open
    await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/resolutions`,
      headers: H,
      payload: { cardId: 'ic-2', path: 'evidence', question: 'Q2' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/resolutions?status=open`,
      headers: H,
    });
    assert.equal(res.json().resolutions.length, 1);
  });

  test('GET single resolution', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/resolutions`,
      headers: H,
      payload: { cardId: 'ic-1', path: 'confirmation', question: 'Q?' },
    });
    const id = createRes.json().resolution.id;

    const res = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/resolutions/${id}`,
      headers: H,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().resolution.question, 'Q?');
  });

  test('PATCH answer updates status', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/resolutions`,
      headers: H,
      payload: { cardId: 'ic-1', path: 'confirmation', question: 'Q?' },
    });
    const id = createRes.json().resolution.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/external-projects/${projectId}/resolutions/${id}/answer`,
      headers: H,
      payload: { answer: 'Confirmed by stakeholder' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().resolution.status, 'answered');
    assert.equal(res.json().resolution.answer, 'Confirmed by stakeholder');
    assert.ok(res.json().resolution.answeredAt);
  });

  test('PATCH escalate updates status', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/resolutions`,
      headers: H,
      payload: { cardId: 'ic-1', path: 'escalation', question: 'Too complex?' },
    });
    const id = createRes.json().resolution.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/external-projects/${projectId}/resolutions/${id}/escalate`,
      headers: H,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().resolution.status, 'escalated');
  });

  test('DELETE removes resolution', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/resolutions`,
      headers: H,
      payload: { cardId: 'ic-1', path: 'confirmation', question: 'Q?' },
    });
    const id = createRes.json().resolution.id;

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/external-projects/${projectId}/resolutions/${id}`,
      headers: H,
    });
    assert.equal(delRes.statusCode, 204);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/resolutions/${id}`,
      headers: H,
    });
    assert.equal(getRes.statusCode, 404);
  });

  test('POST resolution returns 401 without userId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/resolutions`,
      payload: { cardId: 'ic-1', path: 'confirmation', question: 'Q?' },
    });
    assert.equal(res.statusCode, 401);
  });

  test('GET resolutions returns 404 for other user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/resolutions`,
      headers: { 'x-office-claw-user': 'other' },
    });
    assert.equal(res.statusCode, 404);
  });
});

describe('F076 Phase 2: Slice Routes', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app;
  let projectId;

  beforeEach(async () => {
    const { ExternalProjectStore } = await import('../dist/domains/projects/external-project-store.js');
    const { NeedAuditFrameStore } = await import('../dist/domains/projects/need-audit-frame-store.js');
    const { BacklogStore } = await import('../dist/domains/agents/services/stores/ports/BacklogStore.js');
    const { SliceStore } = await import('../dist/domains/projects/slice-store.js');
    const { externalProjectRoutes } = await import('../dist/routes/external-projects.js');
    const { sliceRoutes } = await import('../dist/routes/slice-routes.js');

    const externalProjectStore = new ExternalProjectStore();
    app = Fastify();
    await app.register(externalProjectRoutes, {
      externalProjectStore,
      needAuditFrameStore: new NeedAuditFrameStore(),
      backlogStore: new BacklogStore(),
    });
    await app.register(sliceRoutes, {
      externalProjectStore,
      sliceStore: new SliceStore(),
    });
    projectId = await createProject(app);
  });

  test('POST creates slice', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/slices`,
      headers: H,
      payload: {
        name: 'Slice 1',
        sliceType: 'learning',
        description: 'Prototype login',
        actor: 'Admin',
        workflow: 'Login flow',
        verifiableOutcome: 'Admin can log in',
      },
    });
    assert.equal(res.statusCode, 201);
    assert.ok(res.json().slice.id.startsWith('sl-'));
    assert.equal(res.json().slice.sliceType, 'learning');
    assert.equal(res.json().slice.status, 'planned');
    assert.equal(res.json().slice.order, 0);
  });

  test('GET lists slices in order', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/slices`,
      headers: H,
      payload: { name: 'A', sliceType: 'learning', description: '', actor: '', workflow: '', verifiableOutcome: '' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/slices`,
      headers: H,
      payload: { name: 'B', sliceType: 'value', description: '', actor: '', workflow: '', verifiableOutcome: '' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/slices`,
      headers: H,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().slices.length, 2);
    assert.equal(res.json().slices[0].name, 'A');
    assert.equal(res.json().slices[1].name, 'B');
  });

  test('GET with ?type=learning filters', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/slices`,
      headers: H,
      payload: {
        name: 'Learn',
        sliceType: 'learning',
        description: '',
        actor: '',
        workflow: '',
        verifiableOutcome: '',
      },
    });
    await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/slices`,
      headers: H,
      payload: { name: 'Value', sliceType: 'value', description: '', actor: '', workflow: '', verifiableOutcome: '' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/slices?type=learning`,
      headers: H,
    });
    assert.equal(res.json().slices.length, 1);
    assert.equal(res.json().slices[0].name, 'Learn');
  });

  test('GET single slice', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/slices`,
      headers: H,
      payload: { name: 'S1', sliceType: 'value', description: 'D', actor: 'A', workflow: 'W', verifiableOutcome: 'V' },
    });
    const id = createRes.json().slice.id;

    const res = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/slices/${id}`,
      headers: H,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().slice.name, 'S1');
  });

  test('PATCH updates slice fields', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/slices`,
      headers: H,
      payload: { name: 'Old', sliceType: 'value', description: '', actor: '', workflow: '', verifiableOutcome: '' },
    });
    const id = createRes.json().slice.id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/external-projects/${projectId}/slices/${id}`,
      headers: H,
      payload: { name: 'New', status: 'in_progress' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().slice.name, 'New');
    assert.equal(res.json().slice.status, 'in_progress');
  });

  test('PATCH reorder swaps slice order', async () => {
    const r1 = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/slices`,
      headers: H,
      payload: { name: 'First', sliceType: 'value', description: '', actor: '', workflow: '', verifiableOutcome: '' },
    });
    const r2 = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/slices`,
      headers: H,
      payload: { name: 'Second', sliceType: 'value', description: '', actor: '', workflow: '', verifiableOutcome: '' },
    });
    const id1 = r1.json().slice.id;
    const id2 = r2.json().slice.id;

    const reorderRes = await app.inject({
      method: 'PATCH',
      url: `/api/external-projects/${projectId}/slices/reorder`,
      headers: H,
      payload: { id1, id2 },
    });
    assert.equal(reorderRes.statusCode, 200);

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/slices`,
      headers: H,
    });
    // After reorder, Second should come first (order 0)
    assert.equal(listRes.json().slices[0].name, 'Second');
    assert.equal(listRes.json().slices[1].name, 'First');
  });

  test('PATCH reorder returns 400 without ids', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/external-projects/${projectId}/slices/reorder`,
      headers: H,
      payload: {},
    });
    assert.equal(res.statusCode, 400);
  });

  test('DELETE removes slice', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/slices`,
      headers: H,
      payload: { name: 'Del', sliceType: 'value', description: '', actor: '', workflow: '', verifiableOutcome: '' },
    });
    const id = createRes.json().slice.id;

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/external-projects/${projectId}/slices/${id}`,
      headers: H,
    });
    assert.equal(delRes.statusCode, 204);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/slices/${id}`,
      headers: H,
    });
    assert.equal(getRes.statusCode, 404);
  });

  test('POST slice returns 401 without userId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/slices`,
      payload: { name: 'X', sliceType: 'value', description: '', actor: '', workflow: '', verifiableOutcome: '' },
    });
    assert.equal(res.statusCode, 401);
  });

  test('GET slices returns 404 for other user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/slices`,
      headers: { 'x-office-claw-user': 'other' },
    });
    assert.equal(res.statusCode, 404);
  });

  test('PATCH reorder returns 404 when slice belongs to different project (cross-project privilege escalation)', async () => {
    // Create a second project
    const proj2Res = await app.inject({
      method: 'POST',
      url: '/api/external-projects',
      headers: H,
      payload: { name: 'project-2', description: '', sourcePath: '/tmp/test2' },
    });
    const project2Id = proj2Res.json().project.id;

    // Create slice in project1
    const s1Res = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/slices`,
      headers: H,
      payload: {
        name: 'P1-Slice',
        sliceType: 'value',
        description: '',
        actor: '',
        workflow: '',
        verifiableOutcome: '',
      },
    });
    const slice1Id = s1Res.json().slice.id;

    // Create slice in project2
    const s2Res = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${project2Id}/slices`,
      headers: H,
      payload: {
        name: 'P2-Slice',
        sliceType: 'value',
        description: '',
        actor: '',
        workflow: '',
        verifiableOutcome: '',
      },
    });
    const slice2Id = s2Res.json().slice.id;

    // Try to reorder project2's slice via project1's endpoint → should 404
    const reorderRes = await app.inject({
      method: 'PATCH',
      url: `/api/external-projects/${projectId}/slices/reorder`,
      headers: H,
      payload: { id1: slice1Id, id2: slice2Id },
    });
    assert.equal(reorderRes.statusCode, 404);

    // Verify project2's slice order is unchanged (still 0)
    const p2Slices = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${project2Id}/slices`,
      headers: H,
    });
    assert.equal(p2Slices.json().slices[0].order, 0);
  });
});

describe('F076 Phase 2: Reflux Pattern Routes', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app;
  let projectId;

  beforeEach(async () => {
    const { ExternalProjectStore } = await import('../dist/domains/projects/external-project-store.js');
    const { NeedAuditFrameStore } = await import('../dist/domains/projects/need-audit-frame-store.js');
    const { BacklogStore } = await import('../dist/domains/agents/services/stores/ports/BacklogStore.js');
    const { RefluxPatternStore } = await import('../dist/domains/projects/reflux-pattern-store.js');
    const { externalProjectRoutes } = await import('../dist/routes/external-projects.js');
    const { refluxRoutes } = await import('../dist/routes/reflux-routes.js');

    const externalProjectStore = new ExternalProjectStore();
    app = Fastify();
    await app.register(externalProjectRoutes, {
      externalProjectStore,
      needAuditFrameStore: new NeedAuditFrameStore(),
      backlogStore: new BacklogStore(),
    });
    await app.register(refluxRoutes, {
      externalProjectStore,
      refluxPatternStore: new RefluxPatternStore(),
    });
    projectId = await createProject(app);
  });

  test('POST creates reflux pattern', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/reflux-patterns`,
      headers: H,
      payload: {
        category: 'methodology',
        title: 'Start with learning slices',
        insight: 'Learning slices reduce rework by 40%',
        evidence: 'Observed in 3 projects',
      },
    });
    assert.equal(res.statusCode, 201);
    assert.ok(res.json().pattern.id.startsWith('rfx-'));
    assert.equal(res.json().pattern.category, 'methodology');
  });

  test('GET lists patterns', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/reflux-patterns`,
      headers: H,
      payload: { category: 'methodology', title: 'T1', insight: 'I1', evidence: 'E1' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/reflux-patterns`,
      headers: H,
      payload: { category: 'risk_pattern', title: 'T2', insight: 'I2', evidence: 'E2' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/reflux-patterns`,
      headers: H,
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().patterns.length, 2);
  });

  test('GET with ?category filters', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/reflux-patterns`,
      headers: H,
      payload: { category: 'methodology', title: 'T1', insight: 'I1', evidence: 'E1' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/reflux-patterns`,
      headers: H,
      payload: { category: 'risk_pattern', title: 'T2', insight: 'I2', evidence: 'E2' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/reflux-patterns?category=methodology`,
      headers: H,
    });
    assert.equal(res.json().patterns.length, 1);
    assert.equal(res.json().patterns[0].title, 'T1');
  });

  test('DELETE removes pattern', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/reflux-patterns`,
      headers: H,
      payload: { category: 'methodology', title: 'T', insight: 'I', evidence: 'E' },
    });
    const id = createRes.json().pattern.id;

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/external-projects/${projectId}/reflux-patterns/${id}`,
      headers: H,
    });
    assert.equal(delRes.statusCode, 204);

    // Verify it's gone
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/reflux-patterns`,
      headers: H,
    });
    assert.equal(listRes.json().patterns.length, 0);
  });

  test('DELETE returns 404 for unknown pattern', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/external-projects/${projectId}/reflux-patterns/rfx-nonexistent`,
      headers: H,
    });
    assert.equal(res.statusCode, 404);
  });

  test('POST reflux returns 401 without userId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/external-projects/${projectId}/reflux-patterns`,
      payload: { category: 'methodology', title: 'T', insight: 'I', evidence: 'E' },
    });
    assert.equal(res.statusCode, 401);
  });

  test('GET reflux returns 404 for other user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/external-projects/${projectId}/reflux-patterns`,
      headers: { 'x-office-claw-user': 'other' },
    });
    assert.equal(res.statusCode, 404);
  });
});
