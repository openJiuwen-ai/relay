/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F080-P2: Path completion — unit tests for path detection logic.
 * Hook integration is tested via ChatInput integration tests.
 */
import { describe, expect, it } from 'vitest';

/** Regex to detect path-like suffixes at end of input (mirrors hook) */
const PATH_PATTERN = /(?:^|\s)([.~/][\w/._-]*|packages\/[\w/._-]*)$/;

function detectPath(text: string): string | null {
  const match = text.match(PATH_PATTERN);
  return match ? match[1] : null;
}

describe('path detection regex', () => {
  it('detects relative paths with ./', () => {
    expect(detectPath('./src/foo')).toBe('./src/foo');
  });

  it('detects parent paths with ../', () => {
    expect(detectPath('hello ../foo')).toBe('../foo');
  });

  it('detects home paths with ~/', () => {
    expect(detectPath('look at ~/projects')).toBe('~/projects');
  });

  it('detects absolute paths', () => {
    expect(detectPath('/etc/passwd')).toBe('/etc/passwd');
  });

  it('detects packages/ prefix', () => {
    expect(detectPath('check packages/web/src')).toBe('packages/web/src');
  });

  it('detects path at start of string', () => {
    expect(detectPath('./foo')).toBe('./foo');
  });

  it('detects path after space', () => {
    expect(detectPath('open ./bar')).toBe('./bar');
  });

  it('returns null for non-path input', () => {
    expect(detectPath('hello world')).toBeNull();
    expect(detectPath('')).toBeNull();
    expect(detectPath('just a sentence')).toBeNull();
  });

  it('handles trailing slash', () => {
    expect(detectPath('./src/')).toBe('./src/');
  });

  it('handles dots and underscores in filenames', () => {
    expect(detectPath('./src/my_file.test.ts')).toBe('./src/my_file.test.ts');
  });

  it('handles hyphens in path', () => {
    expect(detectPath('packages/web/src/chat-input-options')).toBe('packages/web/src/chat-input-options');
  });
});
