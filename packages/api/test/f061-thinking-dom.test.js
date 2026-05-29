/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F061: POLL_RESPONSE_JS thinking DOM regression tests
 *
 * Root cause: Antigravity uses "Thought for Xs" button + max-h-0/opacity-0
 * collapsed container for thinking — NOT <details> or [class*="thinking"].
 * Old POLL_RESPONSE_JS didn't recognize this pattern, so hidden thought text
 * was collected as responseText, causing premature stable count + repeated content.
 *
 * Tests use JSDOM to construct real DOM fixtures and evaluate the script,
 * verifying actual behavioral output (responseText / thinkingText).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

import { POLL_RESPONSE_JS } from '../dist/domains/agents/services/agents/providers/antigravity/cdp-dom-scripts.js';

/**
 * Build a minimal Antigravity-like DOM and run POLL_RESPONSE_JS against it.
 * Returns the parsed result object.
 *
 * Structure: .group wraps the user message so the fallback sibling-walk path
 * discovers subsequent assistant blocks as siblings of .group.
 */
function runPollInDom(assistantHtml, userMsg = 'User question') {
  const html = `
		<div class="group">
			<div class="whitespace-pre-wrap">${userMsg}</div>
		</div>
		${assistantHtml}
	`;
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
    url: 'http://localhost',
    runScripts: 'dangerously',
  });
  const raw = dom.window.eval(POLL_RESPONSE_JS);
  dom.window.close();
  return JSON.parse(raw);
}

// ── Behavioral DOM fixture tests (P2 fix) ─────────────────────────────

describe('F061: POLL_RESPONSE_JS behavioral DOM fixtures', () => {
  it('Antigravity thinking: responseText clean, thinkingText has no CSS garbage', () => {
    const result = runPollInDom(`
			<div>
				<button>Thought for 16s</button>
				<div class="max-h-0 opacity-0">
					<style>/* Copied from remark-github-blockquote-alert/alert.css */</style>
					<p>Let me think about this carefully...</p>
					<p>The user is asking about X.</p>
				</div>
				<div class="visible-answer">
					<p>Here is my response to your question.</p>
					<p>This is the second paragraph.</p>
				</div>
			</div>
		`);
    // responseText must be clean
    assert.ok(
      !result.responseText.includes('think about this carefully'),
      'responseText must not contain thinking text',
    );
    assert.ok(!result.responseText.includes('alert.css'), 'responseText must not contain CSS garbage');
    assert.ok(!result.responseText.includes('Thought for 16s'), 'responseText must not contain button text');
    assert.ok(result.responseText.includes('Here is my response'), 'responseText must contain visible answer');
    assert.ok(result.responseText.includes('second paragraph'), 'responseText must contain all visible paragraphs');
    // thinkingText must contain thought content but NOT CSS garbage
    assert.ok(
      result.thinkingText.includes('think about this carefully'),
      'thinkingText should contain thought content',
    );
    assert.ok(!result.thinkingText.includes('alert.css'), 'thinkingText must not contain CSS garbage');
    assert.ok(!result.thinkingText.includes('Thought for 16s'), 'thinkingText must not contain button text');
    assert.ok(result.thinkingText.length > 0, 'thinkingText should be non-empty when thinking is present');
  });

  it('backward compat: <details> thinking still works', () => {
    const result = runPollInDom(`
			<div>
				<details class="thinking">
					<summary>Thinking...</summary>
					<p>Internal reasoning here.</p>
				</details>
				<p>The actual answer.</p>
			</div>
		`);
    assert.ok(!result.responseText.includes('Internal reasoning'), 'responseText must not contain details thinking');
    assert.ok(result.responseText.includes('actual answer'), 'responseText must contain the answer');
    assert.ok(result.thinkingText.includes('Internal reasoning'), 'thinkingText should contain details content');
  });

  it('no thinking: plain response extracted correctly', () => {
    const result = runPollInDom(`
			<div>
				<p>Hello! How can I help you today?</p>
			</div>
		`);
    assert.ok(result.responseText.includes('How can I help you'), 'responseText should contain the response');
    assert.equal(result.thinkingText, '', 'thinkingText should be empty');
    assert.equal(result.thinkingText.length, 0, 'no thinking content when no thinking elements');
  });

  it('hidden class elements are stripped from text extraction', () => {
    const result = runPollInDom(`
			<div>
				<div class="hidden">This should not appear</div>
				<div aria-hidden="true">Also hidden</div>
				<p>Visible response text.</p>
			</div>
		`);
    assert.ok(!result.responseText.includes('should not appear'), 'hidden class elements must be stripped');
    assert.ok(!result.responseText.includes('Also hidden'), 'aria-hidden elements must be stripped');
    assert.ok(result.responseText.includes('Visible response'), 'visible text must remain');
  });

  it('thought button with CSS-heavy sibling: CSS stripped from thinkingText', () => {
    const result = runPollInDom(`
			<div>
				<button>Thought for 8s</button>
				<div class="max-h-0 opacity-0">
					<style>.foo { color: red; }</style>
					<script>console.log('should be stripped')</script>
					<p>Actual thinking content here.</p>
				</div>
				<p>Final answer.</p>
			</div>
		`);
    assert.ok(result.responseText.includes('Final answer'), 'responseText has answer');
    assert.ok(!result.responseText.includes('Actual thinking'), 'responseText has no thinking');
    assert.ok(result.thinkingText.includes('Actual thinking content'), 'thinkingText has thought content');
    assert.ok(!result.thinkingText.includes('color: red'), 'thinkingText has no CSS');
    assert.ok(!result.thinkingText.includes('should be stripped'), 'thinkingText has no script content');
  });
});

// ── Smoke tests (script structure validation) ──────────────────────────

describe('F061: POLL_RESPONSE_JS structure smoke tests', () => {
  it('contains Antigravity thought button detection pattern', () => {
    assert.ok(POLL_RESPONSE_JS.includes('Thought\\s+for\\s'), 'script should match "Thought for Xs" via regex');
  });

  it('contains hidden element filtering patterns', () => {
    assert.ok(POLL_RESPONSE_JS.includes('max-h-0'), 'detects max-h-0');
    assert.ok(POLL_RESPONSE_JS.includes('opacity-0'), 'detects opacity-0');
    assert.ok(POLL_RESPONSE_JS.includes('\\bhidden\\b'), 'detects hidden class');
  });

  it('preserves backward compat selectors', () => {
    assert.ok(POLL_RESPONSE_JS.includes('details'), 'still detects <details>');
    assert.ok(POLL_RESPONSE_JS.includes('[class*="thinking"]'), 'still detects thinking class');
    assert.ok(POLL_RESPONSE_JS.includes('[class*="thought"]'), 'still detects thought class');
  });

  it('strips buttons in extractBlockText', () => {
    assert.ok(POLL_RESPONSE_JS.includes("clone.querySelectorAll('button')"), 'buttons stripped from clone');
  });
});
