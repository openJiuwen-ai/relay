/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { AuditEventTypes, EventAuditLog } from '../dist/domains/agents/services/orchestration/EventAuditLog.js';

const TEST_AUDIT_DIR = './test-audit-logs';

describe('EventAuditLog', () => {
  let auditLog;

  beforeEach(async () => {
    // Clean up test directory
    if (existsSync(TEST_AUDIT_DIR)) {
      await rm(TEST_AUDIT_DIR, { recursive: true });
    }
    auditLog = new EventAuditLog({ auditDir: TEST_AUDIT_DIR });
  });

  afterEach(async () => {
    // Clean up test directory
    if (existsSync(TEST_AUDIT_DIR)) {
      await rm(TEST_AUDIT_DIR, { recursive: true });
    }
  });

  test('creates audit directory if not exists', async () => {
    assert.ok(!existsSync(TEST_AUDIT_DIR));
    await auditLog.append({ type: 'test', data: {} });
    assert.ok(existsSync(TEST_AUDIT_DIR));
  });

  test('appends event with generated id and timestamp', async () => {
    const event = await auditLog.append({
      type: AuditEventTypes.DEBATE_WINNER,
      threadId: 'thread-123',
      data: { winner: 'codex', judge: 'gemini' },
    });

    assert.ok(event.id);
    assert.ok(event.timestamp);
    assert.equal(event.type, AuditEventTypes.DEBATE_WINNER);
    assert.equal(event.threadId, 'thread-123');
    assert.deepEqual(event.data, { winner: 'codex', judge: 'gemini' });
  });

  test('persists events to file', async () => {
    await auditLog.append({
      type: AuditEventTypes.PHASE_COMPLETED,
      data: { phase: '4.0', description: '协作地基' },
    });

    // Read back
    const events = await auditLog.readByDate(new Date());
    assert.equal(events.length, 1);
    assert.equal(events[0].type, AuditEventTypes.PHASE_COMPLETED);
    assert.equal(events[0].data.phase, '4.0');
  });

  test('appends multiple events to same day file', async () => {
    await auditLog.append({ type: 'event1', data: { n: 1 } });
    await auditLog.append({ type: 'event2', data: { n: 2 } });
    await auditLog.append({ type: 'event3', data: { n: 3 } });

    const events = await auditLog.readByDate(new Date());
    assert.equal(events.length, 3);
    assert.equal(events[0].type, 'event1');
    assert.equal(events[1].type, 'event2');
    assert.equal(events[2].type, 'event3');
  });

  test('readByType filters events', async () => {
    await auditLog.append({ type: 'winner', data: { cat: 'codex' } });
    await auditLog.append({ type: 'other', data: {} });
    await auditLog.append({ type: 'winner', data: { cat: 'opus' } });

    const winners = await auditLog.readByType('winner', { days: 1 });
    assert.equal(winners.length, 2);
    assert.ok(winners.every((e) => e.type === 'winner'));
  });

  test('readByThread filters events', async () => {
    await auditLog.append({ type: 'msg', threadId: 't1', data: {} });
    await auditLog.append({ type: 'msg', threadId: 't2', data: {} });
    await auditLog.append({ type: 'msg', threadId: 't1', data: {} });

    const t1Events = await auditLog.readByThread('t1', { days: 1 });
    assert.equal(t1Events.length, 2);
    assert.ok(t1Events.every((e) => e.threadId === 't1'));
  });

  test('readByDate returns empty array for nonexistent date', async () => {
    const events = await auditLog.readByDate('1999-01-01');
    assert.deepEqual(events, []);
  });

  test('listFiles returns audit log files', async () => {
    await auditLog.append({ type: 'test', data: {} });

    const files = await auditLog.listFiles();
    assert.equal(files.length, 1);
    assert.ok(files[0].startsWith('audit-'));
    assert.ok(files[0].endsWith('.ndjson'));
  });

  test('events survive across instances (persistence)', async () => {
    // Write with one instance
    await auditLog.append({
      type: AuditEventTypes.REVIEW_APPROVED,
      data: { reviewer: 'codex', commit: 'abc123' },
    });

    // Read with new instance
    const newInstance = new EventAuditLog({ auditDir: TEST_AUDIT_DIR });
    const events = await newInstance.readByDate(new Date());

    assert.equal(events.length, 1);
    assert.equal(events[0].type, AuditEventTypes.REVIEW_APPROVED);
    assert.equal(events[0].data.reviewer, 'codex');
  });

  test('includes CLI tool lifecycle event types for F13 audits', () => {
    assert.equal(AuditEventTypes.CLI_TOOL_STARTED, 'cli_tool_started');
    assert.equal(AuditEventTypes.CLI_TOOL_COMPLETED, 'cli_tool_completed');
  });
});
