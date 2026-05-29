/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * GitHub Review mail body classification
 * - Distinguish reviewed vs commented vs environment/setup noise
 * - Extract reviewer label from body when subject lacks action keywords
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('GitHub review mail body classifier', () => {
  test('infers reviewType=reviewed from email body and extracts reviewer', async () => {
    const { inferReviewActionFromEmailSource } = await import('../dist/infrastructure/email/GithubReviewMailParser.js');

    const source = [
      'From: GitHub <notifications@github.com>',
      'Subject: Re: [zts212653/office-claw] fix(F045): hardDelete clears thinking (PR #97)',
      '',
      'chatgpt-codex-connector[bot] reviewed (zts212653/office-claw#97)',
      "Codex Review: Didn't find any major issues.",
    ].join('\n');

    const result = inferReviewActionFromEmailSource(source);
    assert.equal(result.reviewType, 'reviewed');
    assert.equal(result.reviewer, 'chatgpt-codex-connector[bot]');
  });

  test('infers reviewType=commented from email body', async () => {
    const { inferReviewActionFromEmailSource } = await import('../dist/infrastructure/email/GithubReviewMailParser.js');

    const source = [
      'From: GitHub <notifications@github.com>',
      'Subject: Re: [zts212653/office-claw] fix(F039): queue contentBlocks (PR #96)',
      '',
      'chatgpt-codex-connector[bot] left a comment (zts212653/office-claw#96)',
    ].join('\n');

    const result = inferReviewActionFromEmailSource(source);
    assert.equal(result.reviewType, 'commented');
    assert.equal(result.reviewer, 'chatgpt-codex-connector[bot]');
  });

  test('infers reviewType=approved from email body', async () => {
    const { inferReviewActionFromEmailSource } = await import('../dist/infrastructure/email/GithubReviewMailParser.js');

    const source = [
      'From: GitHub <notifications@github.com>',
      'Subject: Re: [zts212653/office-claw] docs(F048): ghost branch audit (PR #108)',
      '',
      'octocat approved (zts212653/office-claw#108)',
    ].join('\n');

    const result = inferReviewActionFromEmailSource(source);
    assert.equal(result.reviewType, 'approved');
    assert.equal(result.reviewer, 'octocat');
  });

  test('infers reviewType=changes_requested from email body', async () => {
    const { inferReviewActionFromEmailSource } = await import('../dist/infrastructure/email/GithubReviewMailParser.js');

    const source = [
      'From: GitHub <notifications@github.com>',
      'Subject: Re: [zts212653/office-claw] fix(F039): queue contentBlocks (PR #96)',
      '',
      'octocat requested changes (zts212653/office-claw#96)',
    ].join('\n');

    const result = inferReviewActionFromEmailSource(source);
    assert.equal(result.reviewType, 'changes_requested');
    assert.equal(result.reviewer, 'octocat');
  });

  test('does not mark email ignorable when setup sentence is quoted in a normal comment', async () => {
    const { inferReviewActionFromEmailSource } = await import('../dist/infrastructure/email/GithubReviewMailParser.js');

    const source = [
      'From: GitHub <notifications@github.com>',
      'Subject: Re: [zts212653/office-claw] fix(F039): queue contentBlocks (PR #96)',
      '',
      'octocat left a comment (zts212653/office-claw#96)',
      '',
      'Quoting a previous bot message for context:',
      'To use Codex here, create an environment for this repo.',
    ].join('\n');

    const result = inferReviewActionFromEmailSource(source);
    assert.equal(result.ignorable, false);
    assert.equal(result.reviewType, 'commented');
    assert.equal(result.reviewer, 'octocat');
  });

  test('still marks setup-only email ignorable even when subject contains "Codex Review:"', async () => {
    const { inferReviewActionFromEmailSource } = await import('../dist/infrastructure/email/GithubReviewMailParser.js');

    const source = [
      'From: GitHub <notifications@github.com>',
      'Subject: Re: [owner/repo] Codex Review: cleanup parser (PR #1)',
      '',
      'To use Codex here, create an environment for this repo.',
    ].join('\n');

    const result = inferReviewActionFromEmailSource(source);
    assert.equal(result.ignorable, true);
  });

  test('detects Codex environment/setup guidance email as ignorable', async () => {
    const { inferReviewActionFromEmailSource } = await import('../dist/infrastructure/email/GithubReviewMailParser.js');

    const source = [
      'From: GitHub <notifications@github.com>',
      'Subject: Re: [zts212653/office-claw] fix(F039): queue contentBlocks (PR #96)',
      '',
      'To use Codex here, create an environment for this repo.',
    ].join('\n');

    const result = inferReviewActionFromEmailSource(source);
    assert.equal(result.ignorable, true);
  });

  test('detects Codex setup guidance (markdown link variant) as ignorable', async () => {
    const { inferReviewActionFromEmailSource } = await import('../dist/infrastructure/email/GithubReviewMailParser.js');

    const source = [
      'From: GitHub <notifications@github.com>',
      'Subject: Re: [zts212653/office-claw] fix(email): classify Codex template (PR #117)',
      '',
      'chatgpt-codex-connector[bot] left a comment (zts212653/office-claw#117)',
      '',
      'To use Codex here, [create an environment for this repo](https://chatgpt.com/codex/settings/environments).',
    ].join('\n');

    const result = inferReviewActionFromEmailSource(source);
    assert.equal(result.ignorable, true);
  });

  test('treats Codex PR review template (with setup sentence) as real review, not ignorable', async () => {
    const { inferReviewActionFromEmailSource } = await import('../dist/infrastructure/email/GithubReviewMailParser.js');

    const source = [
      'From: GitHub <notifications@github.com>',
      'Subject: Re: [zts212653/office-claw] fix(F039): withdraw clears stale QueuePanel entry (PR #116)',
      '',
      'chatgpt-codex-connector[bot] reviewed (zts212653/office-claw#116)',
      '',
      '### 💡 Codex Review',
      '',
      'Here are some automated review suggestions for this pull request.',
      '',
      '**Reviewed commit:** `deadbeef`',
      '',
      'To use Codex here, create an environment for this repo.',
      '',
      'About Codex in GitHub',
    ].join('\n');

    const result = inferReviewActionFromEmailSource(source);
    assert.equal(result.ignorable, false);
    assert.equal(result.reviewType, 'reviewed');
    assert.equal(result.reviewer, 'chatgpt-codex-connector[bot]');
  });

  test('treats Codex PR review template without action markers as reviewType=reviewed', async () => {
    const { inferReviewActionFromEmailSource } = await import('../dist/infrastructure/email/GithubReviewMailParser.js');

    const source = [
      'From: GitHub <notifications@github.com>',
      'Subject: Re: [zts212653/office-claw] fix(email): classify Codex template (PR #117)',
      '',
      '### 💡 Codex Review',
      '',
      '**Reviewed commit:** `deadbeef`',
      '',
      'To use Codex here, create an environment for this repo.',
    ].join('\n');

    const result = inferReviewActionFromEmailSource(source);
    assert.equal(result.ignorable, false);
    assert.equal(result.reviewType, 'reviewed');
  });

  test('does not treat "@codex review" trigger text as a Codex template review', async () => {
    const { inferReviewActionFromEmailSource } = await import('../dist/infrastructure/email/GithubReviewMailParser.js');

    const source = [
      'From: GitHub <notifications@github.com>',
      'Subject: Re: [zts212653/office-claw] chore: trigger review (PR #1)',
      '',
      '@codex review',
      '',
      'Reviewed commit: `deadbeef`',
    ].join('\n');

    const result = inferReviewActionFromEmailSource(source);
    assert.equal(result.ignorable, false);
    assert.equal(result.reviewType, 'unknown');
  });

  test('marks @codex review trigger comment as ignorable noise', async () => {
    const { inferReviewActionFromEmailSource } = await import('../dist/infrastructure/email/GithubReviewMailParser.js');

    const source = [
      'From: GitHub <notifications@github.com>',
      'Subject: Re: [zts212653/office-claw] fix(F039): withdraw clears stale QueuePanel entry (PR #116)',
      '',
      'zts212653 left a comment (zts212653/office-claw#116)',
      '',
      '@codex review',
      '',
      '规则：任何 P1/P2 必须给可执行复现：优先 failing test，否则给确定性复现步骤。没有证据的一律降级为 P3。',
    ].join('\n');

    const result = inferReviewActionFromEmailSource(source);
    assert.equal(result.ignorable, true);
  });
});
