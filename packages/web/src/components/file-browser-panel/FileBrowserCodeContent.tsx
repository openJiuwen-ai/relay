/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { PreviewCopyButton } from '@/components/document-preview/PreviewToolbarShared';
import { useEmbeddedTextPreviewSource } from '@/components/document-preview/useEmbeddedTextPreviewSource';
import { useSendFilePreviewReloadRevision } from '@/components/document-preview/useSendFilePreviewReloadRevision';
import { usePreviewShellExtraHeaderSetter } from './FileBrowserPreviewShellHeaderActionsContext';

type LanguageExtension = ReturnType<typeof javascript>;

/** Light theme that matches the panel's white background and existing UI typography. */
const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: '#1f2937',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', 'Monaco', 'Consolas', monospace",
  },
  '.cm-content': { padding: '12px 0' },
  '.cm-gutters': { backgroundColor: '#f9fafb', borderRight: '1px solid #e5e7eb', color: '#9ca3af' },
  '.cm-activeLineGutter': { backgroundColor: '#eff6ff' },
  '.cm-activeLine': { backgroundColor: '#eff6ff' },
  '.cm-cursor': { borderLeftColor: '#3b82f6' },
  '.cm-selectionBackground, ::selection': { backgroundColor: '#bfdbfe' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: '#bfdbfe' },
  '.cm-line': { padding: '0 12px 0 4px' },
});

function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

function getLanguageExtension(filename: string): LanguageExtension | null {
  const ext = getFileExtension(filename);
  switch (ext) {
    case 'ts':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ typescript: true, jsx: true });
    case 'js':
    case 'mjs':
    case 'cjs':
      return javascript();
    case 'jsx':
      return javascript({ jsx: true });
    case 'json':
    case 'jsonc':
    case 'json5':
      return json();
    case 'css':
    case 'scss':
    case 'less':
    case 'sass':
      return css();
    case 'html':
    case 'htm':
    case 'vue':
    case 'svelte':
    case 'astro':
      return html();
    case 'py':
    case 'pyw':
      return python();
    case 'sql':
      return sql();
    case 'xml':
    case 'svg':
      return xml();
    default:
      return null;
  }
}

interface FileBrowserCodeContentProps {
  path: string;
  displayName: string;
  threadId: string;
  projectPath?: string;
}

/**
 * Readonly CodeMirror-based code/text viewer.
 * Used for .ts, .py, .txt, .json, .css, etc. inside the file browser panel.
 */
export function FileBrowserCodeContent({ path, displayName, threadId, projectPath }: FileBrowserCodeContentProps) {
  const setShellHeaderActions = usePreviewShellExtraHeaderSetter();
  const reloadRevision = useSendFilePreviewReloadRevision(threadId, path);
  const load = useEmbeddedTextPreviewSource(path, projectPath, reloadRevision);
  const containerRef = useRef<HTMLDivElement>(null);

  const content = load.status === 'ok' ? load.content : null;
  const copyTextSig = load.status === 'ok' ? load.content : '';

  useLayoutEffect(() => {
    if (!setShellHeaderActions) return;
    if (load.status !== 'ok') {
      setShellHeaderActions(null);
      return;
    }
    setShellHeaderActions(<PreviewCopyButton text={copyTextSig} copyKindLabel="代码" />);
    return () => setShellHeaderActions(null);
  }, [setShellHeaderActions, load.status, copyTextSig]);

  useEffect(() => {
    if (content === null || !containerRef.current) return;

    const langExt = getLanguageExtension(displayName || path);
    const view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          lightTheme,
          EditorState.readOnly.of(true),
          EditorView.lineWrapping,
          ...(langExt ? [langExt] : []),
        ],
      }),
      parent: containerRef.current,
    });

    return () => view.destroy();
  }, [content, displayName, path]);

  if (load.status === 'loading' || load.status === 'idle') {
    return <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">加载中…</div>;
  }

  if (load.status === 'error') {
    return <div className="flex flex-1 items-center justify-center p-6 text-sm text-red-600">{load.message}</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-auto text-[13px] [&_.cm-editor]:h-full [&_.cm-editor]:min-h-0 [&_.cm-scroller]:overflow-auto"
      />
    </div>
  );
}
