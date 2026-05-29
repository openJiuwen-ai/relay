/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownContent } from '@/components/MarkdownContent';

Object.assign(globalThis as Record<string, unknown>, { React });

function render(content: string): string {
  return renderToStaticMarkup(React.createElement(MarkdownContent, { content }));
}

describe('MarkdownContent code block copy button', () => {
  it('renders copy button outside <pre> so textContent is clean', () => {
    const html = render('```js\nconsole.log("hello")\n```');
    // Button should be in a wrapper div, not inside <pre>
    // Structure: <div class="relative group ..."><button>复制</button><pre>...</pre></div>
    expect(html).toContain('<button');
    expect(html).toContain('复制');
    // The <pre> should NOT contain the button text
    const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
    expect(preMatch).toBeTruthy();
    expect(preMatch?.[1]).not.toContain('复制');
  });
});

describe('MarkdownContent file path linking', () => {
  it('converts absolute paths to vscode:// links', () => {
    // Bare path (not in backticks) — linkified by withMentionsAndLinks in <p>
    const html = render('See /packages/api/src/routes/messages.ts:42 for details');
    expect(html).toContain('vscode://file/packages/api/src/routes/messages.ts:42');
    expect(html).toContain('text-blue-400');
  });

  it('renders inspiration upload paths next to Chinese text as file tokens', () => {
    const html = render(
      '每天 何时提醒我喝水，从何时开始并持续生效，请参考/files/inspiration-upload/1779101758350_memory.md，任务创建后设置为立即执行。',
    );

    expect(html).toContain('data-inspiration-file-token="true"');
    expect(html).toContain('/icons/file-md.svg');
    expect(html).toContain('memory.md');
    expect(html).not.toContain('/files/inspiration-upload/1779101758350_memory.md');
    expect(html).not.toContain('background-color');
    expect(html).not.toContain('px-[4px]');
    expect(html).not.toContain('py-[1px]');
    expect(html).toContain('leading-none');
    expect(html).toContain('translate-y-[-1px]');
    expect(html).toContain('w-[1em] h-[1em]');
    expect(html).not.toContain('w-[16px] h-[16px]');
  });

  it('renders relative paths as styled span when PROJECT_ROOT is not set', () => {
    // Bare path (not in backticks) for linkifyFilePaths to detect
    const html = render('Check packages/web/src/app/page.tsx:10 for the fix');
    // Without PROJECT_ROOT, relative paths become styled <span>, not <a> links
    expect(html).toContain('packages/web/src/app/page.tsx:10');
    expect(html).not.toContain('vscode://file');
    expect(html).toContain('text-blue-400');
  });
});
