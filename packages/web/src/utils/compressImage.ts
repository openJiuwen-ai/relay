/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

/**
 * Compress an image file using Canvas API.
 * GIF (animated) and files under maxBytes are returned as-is.
 * Falls back to original file if compression fails.
 */
export async function compressImage(file: File, maxWidth = 1920, maxBytes = 2 * 1024 * 1024): Promise<File> {
  if (file.type === 'image/gif') return file;
  if (file.size <= maxBytes) return file;

  // Wrap entire compression in try/catch — fallback to original on any failure
  try {
    return await _compressImageInner(file, maxWidth, maxBytes);
  } catch {
    return file;
  }
}

async function _compressImageInner(file: File, maxWidth: number, maxBytes: number): Promise<File> {
  const img = new Image();
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }

  const scale = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);

  // Quality sweep: 0.8 → 0.3
  for (let q = 0.8; q >= 0.3; q -= 0.1) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= maxBytes) {
      return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
        type: 'image/jpeg',
      });
    }
  }

  // Last resort: lowest quality
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.3));
  if (blob) {
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
      type: 'image/jpeg',
    });
  }
  return file;
}
