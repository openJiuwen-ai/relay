/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

// Vitest `renderToStaticMarkup` uses legacy JSX runtime; React must stay in scope.
// biome-ignore lint/correctness/noUnusedImports: required for SSR tests
import React, { useState } from 'react';
import { MarkdownContent } from '@/components/MarkdownContent';
import type { MessageContent } from '@/stores/chatStore';
import { API_URL } from '@/utils/api-client';
import { downloadProtectedResource, isProtectedResourceUrl } from '@/utils/protected-resource';
import { Lightbox } from '../../Lightbox';

const LEGACY_WORKSPACE_DOWNLOAD_PREFIX = '/api/workspace/download?';
const LEGACY_WORKSPACE_RAW_PREFIX = '/api/workspace/file/raw?';

function resolveMediaUrl(url: string): string {
  return url.startsWith('/uploads/') || url.startsWith('/api/') ? `${API_URL}${url}` : url;
}

function getLegacyWorkspacePath(url: string): string | null {
  if (!url.startsWith(LEGACY_WORKSPACE_DOWNLOAD_PREFIX) && !url.startsWith(LEGACY_WORKSPACE_RAW_PREFIX)) return null;
  const query = url.split('?')[1];
  if (!query) return null;

  const params = new URLSearchParams(query);
  const path = params.get('path');
  return path;
}

export function ContentBlocks({
  blocks,
  enableSkillAndQuickActionTokens = false,
  showFileAction = true,
}: {
  blocks: MessageContent[];
  enableSkillAndQuickActionTokens?: boolean;
  showFileAction?: boolean;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [downloadingFileUrl, setDownloadingFileUrl] = useState<string | null>(null);

  const resolveIcon = (fileName: string, mimeType?: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'pdf') return '/icons/files-pdf.svg';
    if (ext === 'doc' || ext === 'docx') return '/icons/files-docx.svg';
    if (ext === 'xls' || ext === 'xlsx' || ext === 'xlsm' || ext === 'xlsb') return '/icons/files-xlsx.svg';
    if (ext === 'ppt' || ext === 'pptx') return '/icons/files-ppt.svg';
    if (ext === 'md') return '/icons/file-md.svg';
    if (ext === 'csv') return '/icons/files-csv.svg';
    if (ext === 'txt') return '/icons/files-txt.svg';
    return '/icons/file-html.svg';
  };
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'text') {
          return (
            <MarkdownContent
              key={i}
              content={block.text}
              enableSkillAndQuickActionTokens={enableSkillAndQuickActionTokens}
            />
          );
        }
        if (block.type === 'image') {
          const legacyWorkspacePath = getLegacyWorkspacePath(block.url);
          if (legacyWorkspacePath) {
            return (
              <div
                key={i}
                className="mt-2 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-2 text-sm text-[var(--text-label-secondary)]"
              >
                历史 workspace 图片，能力已下线
                <div className="mt-1 break-all text-xs">{legacyWorkspacePath}</div>
              </div>
            );
          }
          const src = resolveMediaUrl(block.url);
          return (
            // biome-ignore lint/performance/noImgElement: uploaded images cannot use next/image
            <img
              key={i}
              src={src}
              alt="attached image"
              className="mt-2 max-w-full cursor-pointer rounded-lg border border-[var(--border-default)] transition-opacity hover:opacity-90 sm:max-w-sm"
              onClick={() => setLightboxSrc(src)}
            />
          );
        }
        if (block.type === 'file') {
          const href = resolveMediaUrl(block.url);
          const legacyWorkspacePath = getLegacyWorkspacePath(block.url);
          const shouldDownloadInApp = showFileAction && !legacyWorkspacePath && isProtectedResourceUrl(href);
          return (
            <div
              key={i}
              className="mt-2 flex max-w-full items-center gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-2"
            >
              <img
                src={resolveIcon(block.fileName, block.mimeType)}
                alt=""
                aria-hidden="true"
                className="h-8 w-8 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-[var(--text-primary)]">{block.fileName}</div>
                <div className="text-xs text-[var(--text-label-secondary)]">
                  {legacyWorkspacePath ? '历史 workspace 文件，能力已下线' : block.mimeType || 'file'}
                </div>
                {legacyWorkspacePath ? (
                  <div className="mt-1 break-all text-[11px] text-[var(--text-label-secondary)]">
                    {legacyWorkspacePath}
                  </div>
                ) : null}
              </div>
              {shouldDownloadInApp ? (
                <button
                  type="button"
                  className="shrink-0 rounded-full border border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)]"
                  onClick={() => {
                    setDownloadingFileUrl(block.url);
                    void downloadProtectedResource(href, block.fileName)
                      .catch((error) => {
                        console.error('下载失败:', error);
                        alert(`下载失败：${error instanceof Error ? error.message : '未知错误'}`);
                      })
                      .finally(() => setDownloadingFileUrl((current) => (current === block.url ? null : current)));
                  }}
                >
                  {downloadingFileUrl === block.url ? '下载中...' : '下载'}
                </button>
              ) : !legacyWorkspacePath && showFileAction ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-full border border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)]"
                >
                  下载
                </a>
              ) : null}
            </div>
          );
        }
        return null;
      })}
      {lightboxSrc && <Lightbox url={lightboxSrc} alt="attached image" onClose={() => setLightboxSrc(null)} />}
    </>
  );
}
