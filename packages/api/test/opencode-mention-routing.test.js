/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { after, before, describe, it, mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import { officeClawRegistry } from '@openjiuwen/relay-shared';
import { OpenCodeAgentService } from '../dist/domains/agents/services/agents/providers/OpenCodeAgentService.js';
import { parseA2AMentions } from '../dist/domains/agents/services/agents/routing/a2a-mentions.js';
import {
  buildInvocationContext,
  buildStaticIdentity,
  buildSystemPrompt,
} from '../dist/domains/agents/services/context/SystemPromptBuilder.js';
import { parseMentions } from '../dist/infrastructure/connectors/mention-parser.js';
import { ensureFakeCliOnPath } from './helpers/fake-cli-path.js';

ensureFakeCliOnPath('opencode');

// ── Shared fixtures ──────────────────────────────────────────────

/** Full pattern map including opencode — mirrors production officeClawRegistry */
const allPatterns = new Map([
  ['opus', ['@opus', '@claude', '@office', '@宪宪']],
  ['codex', ['@codex', '@assistant', '@codex-review', '@砚砚']],
  ['gemini', ['@gemini', '@design', '@gemini-design', '@烁烁']],
  ['opencode', ['@opencode', '@opencode-agent', '@opencode', '@opencode-agent']],
]);

/** Display names for realistic system prompt output */
const catDisplayNames = {
  opus: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  opencode: 'OpenCode',
};

/** Minimal OfficeClawConfigEntry stub for officeClawRegistry tests */
function stubCatConfig(agentId, mentionPatterns) {
  return {
    id: agentId,
    name: agentId,
    displayName: catDisplayNames[agentId] || agentId,
    avatar: `/avatars/${agentId}.png`,
    color: { primary: '#000', secondary: '#fff' },
    mentionPatterns,
    provider: agentId === 'opencode' ? 'opencode' : 'anthropic',
    defaultModel: 'test-model',
    mcpSupport: false,
    roleDescription: 'test role',
    personality: 'test personality',
  };
}

// ── Task 1: @mention parsing recognizes opencode patterns ────────

describe('parseMentions — opencode patterns', () => {
  it('resolves @opencode to opencode', () => {
    const result = parseMentions('@opencode hello', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opencode');
  });

  it('resolves @opencode-agent to opencode', () => {
    const result = parseMentions('@opencode-agent 帮我看看', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opencode');
  });

  it('resolves @opencode to opencode', () => {
    const result = parseMentions('@opencode check this', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opencode');
  });

  it('resolves @opencode-agent to opencode', () => {
    const result = parseMentions('@opencode-agent review', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opencode');
  });

  it('does not match @opencodexyz (partial word)', () => {
    const result = parseMentions('@opencodexyz hello', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opus'); // default
  });

  it('matches @opencode mid-text', () => {
    const result = parseMentions('hey @opencode check this', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opencode');
  });

  it('returns first-in-text when multiple cats mentioned', () => {
    const result = parseMentions('@opencode @codex hello', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opencode');
  });

  it('returns first-in-text: codex before opencode', () => {
    const result = parseMentions('@codex @opencode hello', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'codex');
  });

  it('is case-insensitive for @OPENCODE', () => {
    const result = parseMentions('@OPENCODE hello', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opencode');
  });

  it('matches @opencode-agent followed by CJK full-width comma', () => {
    const result = parseMentions('@opencode-agent，帮忙看下', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opencode');
  });

  it('does not match @opencode inside email', () => {
    const result = parseMentions('send to foo@opencode.dev', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opus'); // default
  });

  it('matches @opencode-agent over @opencode (longest match)', () => {
    // Both patterns start with @opencode, longest wins
    const result = parseMentions('@opencode-agent 来帮忙', allPatterns, 'opus');
    assert.equal(result.targetAgentId, 'opencode');
  });
});

// ── Task 2: A2A mention chain detection ──────────────────────────

describe('parseA2AMentions — opencode A2A chain', () => {
  before(() => {
    // Register all cats including opencode in officeClawRegistry
    officeClawRegistry.reset();
    for (const [agentId, patterns] of allPatterns) {
      officeClawRegistry.register(agentId, stubCatConfig(agentId, patterns));
    }
  });

  after(() => {
    officeClawRegistry.reset();
  });

  it('detects @opencode at line start from opus response', () => {
    const text = '分析完了，交给 OpenCode\n@opencode 请继续分析';
    const result = parseA2AMentions(text, 'opus');
    assert.deepEqual(result, ['opencode']);
  });

  it('detects @opus at line start from opencode response', () => {
    const text = 'Done with analysis.\n@opus 结果在这里';
    const result = parseA2AMentions(text, 'opencode');
    assert.deepEqual(result, ['opus']);
  });

  it('filters self-mention: opencode mentioning @opencode', () => {
    const text = 'I will handle this\n@opencode 继续';
    const result = parseA2AMentions(text, 'opencode');
    assert.deepEqual(result, []); // self-mention filtered
  });

  it('detects @opencode-agent at line start (CJK A2A)', () => {
    const text = '请 OpenCode 接手\n@opencode-agent 帮忙看看这段代码';
    const result = parseA2AMentions(text, 'opus');
    assert.deepEqual(result, ['opencode']);
  });

  it('detects multi-target: @opencode and @codex', () => {
    const text = '请两位协助\n@opencode 看架构\n@codex 看安全';
    const result = parseA2AMentions(text, 'opus');
    assert.deepEqual(result, ['opencode', 'codex']);
  });

  it('ignores @opencode inside fenced code block', () => {
    const text = '示例：\n```\n@opencode run test\n```\n普通文本';
    const result = parseA2AMentions(text, 'opus');
    assert.deepEqual(result, []);
  });

  it('ignores non-line-start mentions', () => {
    const text = '请联系 @opencode 来帮忙';
    const result = parseA2AMentions(text, 'opus');
    assert.deepEqual(result, []); // not at line start
  });
});

// ── Task 3: System prompt context injection ──────────────────────

describe('System prompt — opencode context injection', () => {
  before(() => {
    officeClawRegistry.reset();
    for (const [agentId, patterns] of allPatterns) {
      officeClawRegistry.register(agentId, stubCatConfig(agentId, patterns));
    }
  });

  after(() => {
    officeClawRegistry.reset();
  });

  it('buildStaticIdentity produces identity for opencode', () => {
    const identity = buildStaticIdentity('opencode');
    assert.ok(identity.includes('OpenCode'), 'should include displayName');
    assert.ok(identity.length > 10, 'should be non-trivial');
  });

  it('buildInvocationContext includes "Direct message from" for opus→opencode', () => {
    const ctx = buildInvocationContext({
      agentId: 'opencode',
      mode: 'serial',
      teammates: ['opus'],
      mcpAvailable: false,
      directMessageFrom: 'opus',
    });
    assert.ok(ctx.includes('Direct message from'), 'should include direct message context');
    assert.ok(ctx.includes('Claude'), 'should include sender displayName');
  });

  it('buildInvocationContext includes opencode identity line', () => {
    const ctx = buildInvocationContext({
      agentId: 'opencode',
      mode: 'independent',
      teammates: [],
      mcpAvailable: false,
    });
    assert.ok(ctx.includes('OpenCode'), 'should include opencode displayName');
    assert.ok(ctx.includes('opencode'), 'should include agentId');
  });

  it('buildInvocationContext for reverse direction: opencode→opus', () => {
    const ctx = buildInvocationContext({
      agentId: 'opus',
      mode: 'serial',
      teammates: ['opencode'],
      mcpAvailable: false,
      directMessageFrom: 'opencode',
    });
    assert.ok(ctx.includes('Direct message from'), 'should include DM context');
    assert.ok(ctx.includes('OpenCode'), 'should include opencode displayName');
  });
});

// ── Task 4+5: Routed prompt delivery + E2E integration ──────────

/** Mock child_process for OpenCodeAgentService */
function createMockProcess(exitCode = 0) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const emitter = new EventEmitter();
  const proc = {
    stdout,
    stderr,
    pid: 99999,
    kill: mock.fn(() => {
      process.nextTick(() => {
        if (!stdout.destroyed) stdout.end();
        emitter.emit('exit', exitCode, null);
      });
      return true;
    }),
    on: (event, listener) => {
      emitter.on(event, listener);
      return proc;
    },
    once: (event, listener) => {
      emitter.once(event, listener);
      return proc;
    },
    _emitter: emitter,
  };
  return proc;
}

function emitMinimalResponse(proc, text = 'OK') {
  const events = [
    {
      type: 'step_start',
      timestamp: Date.now(),
      sessionID: 'ses_e2e',
      part: { type: 'step_start', stepID: 's1', metadata: { title: 'Assistant' } },
    },
    {
      type: 'text',
      timestamp: Date.now(),
      sessionID: 'ses_e2e',
      part: { type: 'text', text, time: { start: Date.now(), end: Date.now() } },
    },
    {
      type: 'step_finish',
      timestamp: Date.now(),
      sessionID: 'ses_e2e',
      part: { type: 'step_finish', stepID: 's1', metadata: {} },
    },
  ];
  for (const event of events) {
    proc.stdout.write(`${JSON.stringify(event)}\n`);
  }
  proc.stdout.end();
  process.nextTick(() => proc._emitter.emit('exit', 0, null));
}

async function collect(iterable) {
  const messages = [];
  for await (const msg of iterable) messages.push(msg);
  return messages;
}

describe('OpenCodeAgentService — routed prompt with system context', () => {
  before(() => {
    officeClawRegistry.reset();
    for (const [agentId, patterns] of allPatterns) {
      officeClawRegistry.register(agentId, stubCatConfig(agentId, patterns));
    }
  });

  after(() => {
    officeClawRegistry.reset();
  });

  // ── P1 fix: mirror the real route-serial assembly path ────────
  // Production flow (route-serial.ts):
  //   1. staticIdentity = buildStaticIdentity(agentId, { mcpAvailable })     → line 154
  //   2. invocationContext = buildInvocationContext({ agentId, ... })         → line 171
  //   3. prompt = [invocationContext, ...parts, userMessage].join('---')    → line 265-268
  //   4. invokeSingleCat({ systemPrompt: staticIdentity, prompt })         → line 303
  //   5. effectivePrompt = systemPrompt + '---' + prompt                   → invoke-single-cat.ts:443
  //
  // Key difference from buildSystemPrompt(): staticIdentity and
  // invocationContext are assembled SEPARATELY and injected at
  // different positions in the final prompt.

  it('route-serial assembly: staticIdentity as systemPrompt, invocationContext in prompt body', () => {
    // Step 1: buildStaticIdentity (route-serial.ts:154)
    const staticIdentity = buildStaticIdentity('opencode', { mcpAvailable: false });

    // Step 2: buildInvocationContext (route-serial.ts:171)
    const invocationContext = buildInvocationContext({
      agentId: 'opencode',
      mode: 'serial',
      teammates: ['opus'],
      mcpAvailable: false,
      directMessageFrom: 'opus',
    });

    // Step 3: assemble prompt body (route-serial.ts:265-268)
    const userMessage = '@opencode 请分析这段代码的架构';
    const parts = [invocationContext].filter(Boolean);
    const prompt = `${parts.join('\n\n---\n\n')}\n\n---\n\n${userMessage}`;

    // Step 4+5: invokeSingleCat prepends systemPrompt (invoke-single-cat.ts:443)
    const effectivePrompt = `${staticIdentity}\n\n---\n\n${prompt}`;

    // Verify structure matches production assembly
    assert.ok(staticIdentity.includes('OpenCode'), 'staticIdentity includes opencode displayName');
    assert.ok(invocationContext.includes('Direct message from'), 'invocationContext includes DM context');
    assert.ok(invocationContext.includes('Claude'), 'invocationContext includes sender displayName');

    // Verify ordering: staticIdentity → invocationContext → userMessage
    const idxIdentity = effectivePrompt.indexOf('OpenCode');
    const idxDM = effectivePrompt.indexOf('Direct message from');
    const idxUser = effectivePrompt.indexOf(userMessage);
    assert.ok(idxIdentity < idxDM, 'staticIdentity precedes invocationContext');
    assert.ok(idxDM < idxUser, 'invocationContext precedes user message');
  });

  it('staticIdentity ≠ buildSystemPrompt — production uses separate assembly', () => {
    // This test guards against the false assumption that buildSystemPrompt()
    // is what route-serial uses. It doesn't — it uses buildStaticIdentity + buildInvocationContext separately.
    const staticIdentity = buildStaticIdentity('opencode', { mcpAvailable: false });
    const systemPrompt = buildSystemPrompt({
      agentId: 'opencode',
      mode: 'serial',
      teammates: ['opus'],
      mcpAvailable: false,
      directMessageFrom: 'opus',
    });

    // buildSystemPrompt combines both, so it should be longer
    assert.ok(
      systemPrompt.length > staticIdentity.length,
      'buildSystemPrompt is longer because it includes invocationContext',
    );
    // staticIdentity should NOT contain "Direct message from" — that's in invocationContext
    assert.ok(
      !staticIdentity.includes('Direct message from'),
      'staticIdentity does not contain DM context (that goes in invocationContext)',
    );
  });

  it('spawnFn receives route-serial-assembled prompt as CLI arg', async () => {
    const proc = createMockProcess();
    const spawnFn = mock.fn(() => proc);
    const service = new OpenCodeAgentService({
      agentId: 'opencode',
      spawnFn,
      model: 'claude-sonnet-4-6',
    });

    // Mirror real route-serial assembly (NOT buildSystemPrompt)
    const staticIdentity = buildStaticIdentity('opencode', { mcpAvailable: false });
    const invocationContext = buildInvocationContext({
      agentId: 'opencode',
      mode: 'serial',
      teammates: ['opus'],
      mcpAvailable: false,
      directMessageFrom: 'opus',
    });
    const userMessage = '请帮忙 review 这个 PR';
    const prompt = `${invocationContext}\n\n---\n\n${userMessage}`;
    const effectivePrompt = `${staticIdentity}\n\n---\n\n${prompt}`;

    const promise = collect(service.invoke(effectivePrompt));
    emitMinimalResponse(proc);
    await promise;

    // Verify spawnFn received the correctly assembled prompt
    assert.equal(spawnFn.mock.calls.length, 1, 'spawnFn called once');
    const args = spawnFn.mock.calls[0].arguments[1];
    const lastArg = args[args.length - 1];
    assert.ok(lastArg.includes('OpenCode'), 'CLI arg includes opencode identity');
    assert.ok(lastArg.includes('Direct message from'), 'CLI arg includes DM context');
    assert.ok(lastArg.includes(userMessage), 'CLI arg includes user message');
  });

  it('E2E: mention → route-serial assembly → service invoke (full chain)', async () => {
    // Step 1: Parse mention
    const userText = '@opencode 帮我看看这段代码';
    const mentionResult = parseMentions(userText, allPatterns, 'opus');
    assert.equal(mentionResult.targetAgentId, 'opencode', 'mention resolved to opencode');

    // Step 2: Mirror route-serial assembly (NOT buildSystemPrompt)
    const staticIdentity = buildStaticIdentity(mentionResult.targetAgentId, { mcpAvailable: false });
    const invocationContext = buildInvocationContext({
      agentId: mentionResult.targetAgentId,
      mode: 'serial',
      teammates: ['opus'],
      mcpAvailable: false,
      directMessageFrom: 'opus',
    });

    // Step 3: Assemble prompt body (route-serial.ts:265-268)
    const parts = [invocationContext].filter(Boolean);
    const prompt = `${parts.join('\n\n---\n\n')}\n\n---\n\n${userText}`;

    // Step 4: invokeSingleCat prepends staticIdentity (invoke-single-cat.ts:443)
    const effectivePrompt = `${staticIdentity}\n\n---\n\n${prompt}`;

    // Step 5: OpenCodeAgentService receives the assembled prompt
    const proc = createMockProcess();
    const spawnFn = mock.fn(() => proc);
    const service = new OpenCodeAgentService({
      agentId: 'opencode',
      spawnFn,
      model: 'claude-sonnet-4-6',
    });

    const promise = collect(service.invoke(effectivePrompt));
    emitMinimalResponse(proc, '好的，我来看看代码');
    const messages = await promise;

    // Verify response
    const textMsg = messages.find((m) => m.type === 'text');
    assert.ok(textMsg, 'got text response');
    assert.equal(textMsg.content, '好的，我来看看代码');

    // Verify prompt was delivered matching route-serial assembly
    const cliArgs = spawnFn.mock.calls[0].arguments[1];
    const deliveredPrompt = cliArgs[cliArgs.length - 1];
    assert.ok(deliveredPrompt.includes('OpenCode'), 'opencode identity injected');
    assert.ok(deliveredPrompt.includes('Direct message from'), 'DM context injected');
    assert.ok(deliveredPrompt.includes(userText), 'original user message preserved');

    // Verify structure: identity → DM → user message (matching production order)
    // Use the full userText to avoid matching @opencode in Identity line
    const idxId = deliveredPrompt.indexOf('OpenCode');
    const idxDm = deliveredPrompt.indexOf('Direct message from');
    const idxUsr = deliveredPrompt.indexOf(userText);
    assert.ok(idxId < idxDm && idxDm < idxUsr, 'production ordering: identity → invocationContext → user message');
  });
});

// ── P2 fix: Guard test binding fixture to office-claw-template.json truth source ──

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, '..', '..', '..', 'office-claw-template.json');

describe('Fixture guard — allPatterns matches office-claw-template.json truth source', () => {
  let catConfig;

  before(() => {
    const raw = readFileSync(configPath, 'utf-8');
    catConfig = JSON.parse(raw);
  });

  it('opencode mentionPatterns in fixture match office-claw-template.json', () => {
    const breed = catConfig.breeds.find((b) => b.id === 'golden-chinchilla');
    assert.ok(breed, 'golden-chinchilla breed exists in office-claw-template.json');
    const fixturePatterns = allPatterns.get('opencode');
    assert.ok(fixturePatterns, 'opencode exists in test fixture');
    assert.deepEqual(
      [...fixturePatterns].sort(),
      [...breed.mentionPatterns].sort(),
      'fixture mentionPatterns must match office-claw-template.json truth source',
    );
  });

  it('all fixture cats patterns are a subset of office-claw-template.json (no phantom patterns)', () => {
    // Guard: fixture patterns must exist in the truth source — prevents phantom patterns
    // that would make tests pass for patterns that were removed from production config.
    // Note: fixture may be a subset (e.g., opus fixture omits @claude for simplicity)
    const agentIdToBreed = { opus: 'ragdoll', codex: 'maine-coon', gemini: 'siamese', opencode: 'golden-chinchilla' };
    for (const [agentId, fixturePatterns] of allPatterns) {
      const breedId = agentIdToBreed[agentId];
      const breed = catConfig.breeds.find((b) => b.id === breedId);
      assert.ok(breed, `breed ${breedId} exists in office-claw-template.json`);
      const configSet = new Set(breed.mentionPatterns.map((p) => p.toLowerCase()));
      for (const pattern of fixturePatterns) {
        assert.ok(
          configSet.has(pattern.toLowerCase()),
          `fixture pattern "${pattern}" for ${agentId} must exist in office-claw-template.json`,
        );
      }
    }
  });
});
