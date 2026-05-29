/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Lightbox } from '../../Lightbox';

interface ImagePreviewProps {
  files: File[];
  onRemove: (index: number) => void;
}

export function resolveAttachmentIconByFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return '/icons/files-pdf.svg';
  if (ext === 'doc' || ext === 'docx') return '/icons/files-docx.svg';
  if (ext === 'xls' || ext === 'xlsx' || ext === 'xlsm' || ext === 'xlsb') return '/icons/files-xlsx.svg';
  if (ext === 'ppt' || ext === 'pptx') return '/icons/files-ppt.svg';
  if (ext === 'md') return '/icons/file-md.svg';
  if (ext === 'csv') return '/icons/files-csv.svg';
  if (ext === 'txt') return '/icons/files-txt.svg';
  return '/icons/files-txt.svg';
}

export function ImagePreview({ files, onRemove }: ImagePreviewProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  const getFileExt = (name: string) => {
    const parts = name.split('.');
    if (parts.length <= 1) return 'UNKNOWN';
    return parts[parts.length - 1].toUpperCase();
  };

  const getFileBaseName = (name: string) => {
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0) return name;
    return name.slice(0, lastDot);
  };

  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  useEffect(() => {
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [urls]);

  if (files.length === 0) return null;

  return (
    <>
      <div className="mx-3 mb-0 border-b border-gray-100 pb-3 pt-2">
        <div className="w-full max-h-[160px] overflow-y-auto overflow-x-hidden px-2 pt-3">
          <div className="grid w-full min-w-0 grid-cols-3 gap-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {files.map((file, i) => (
            <div
              key={`${getFileBaseName(file.name)}-${i}`}
              className="group relative inline-flex h-[56px] gap-[10px] rounded-lg border border-gray-200 pl-2 py-2 hover:border-[rgb(240,240,240)] hover:shadow-[0_4px_16px_0_rgba(0,0,0,0.08)]"
              style={{ paddingRight: 12 }}
              title={getFileBaseName(file.name)}
            >
              {file.type.startsWith('image/') ? (
                <img
                  src={urls[i]}
                  alt={getFileBaseName(file.name)}
                  className="h-10 w-10 cursor-pointer rounded-lg object-cover transition-opacity hover:opacity-90"
                  onClick={() => setLightboxIdx(i)}
                />
              ) : (
                <img src={resolveAttachmentIconByFileName(file.name)} alt="" aria-hidden="true" className="h-10 w-10 rounded-lg" />
              )}
              <div
                className={`min-w-0 flex-1 ${file.type.startsWith('image/') ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (file.type.startsWith('image/')) setLightboxIdx(i);
                }}
              >
                <div
                  className="truncate overflow-hidden text-ellipsis"
                  style={{ color: '#191919', fontSize: 12, fontWeight: 400, lineHeight: '18px' }}
                >
                  {getFileBaseName(file.name)}
                </div>
                <div className="mt-1 text-[12px]" style={{ color: '#808080', fontWeight: 400, lineHeight: '18px' }}>
                  <span>{getFileExt(file.name)}</span>
                  <span className="ml-3">{formatFileSize(file.size)}</span>
                </div>
              </div>
              <button
                onClick={() => onRemove(i)}
                className="absolute -right-2 -top-2 z-10 hidden h-4 w-4 items-center justify-center rounded-full bg-[#c2c2c2] pb-1 text-xs text-white group-hover:flex"
                style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.8)' }}
                title={`移除 ${getFileBaseName(file.name)}`}
                aria-label={`Remove ${getFileBaseName(file.name)}`}
              >
                x
              </button>
            </div>
          ))}
          </div>
        </div>
      </div>
      {lightboxIdx !== null && urls[lightboxIdx] && files[lightboxIdx]?.type.startsWith('image/') && (
        <Lightbox
          url={urls[lightboxIdx]}
          alt={files[lightboxIdx]?.name ?? 'preview'}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}
