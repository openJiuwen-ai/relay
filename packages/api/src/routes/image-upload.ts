/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Image Upload Utilities
 * Handles multipart file saving and validation for image uploads.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type { FileContent, ImageContent } from '@openjiuwen/relay-shared';

const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const ALLOWED_ATTACHMENT_MIMES = new Set([
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.ms-excel', // .xls
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroenabled.12', // .xlsm
  'application/vnd.ms-excel.sheet.binary.macroenabled.12', // .xlsb
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/markdown',
  'text/x-markdown',
  'text/plain',
  'text/csv',
]);
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_FILES = 5;
const MAX_ATTACHMENT_BASE_LENGTH = 120;
const MAX_UNIQUE_NAME_ATTEMPTS = 1000;
const WINDOWS_RESERVED_BASENAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export interface SavedImage {
  absPath: string;
  urlPath: string;
  content: ImageContent;
}

export interface SavedAttachment {
  absPath: string;
  urlPath: string;
  content: FileContent;
}

export interface UploadImageFile {
  filename?: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
}

const DATA_URL_IMAGE_MIME_RE = /^image\/(?:png|jpeg|webp)$/;

/**
 * Validate and save uploaded image files.
 * Returns saved image metadata for contentBlocks and CLI passthrough.
 */
export async function saveUploadedImages(files: UploadImageFile[], uploadDir: string): Promise<SavedImage[]> {
  if (files.length > MAX_FILES) {
    throw new ImageUploadError(`Too many files (max ${MAX_FILES})`);
  }

  await mkdir(uploadDir, { recursive: true });

  const saved: SavedImage[] = [];
  for (const file of files) {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      throw new ImageUploadError(`Unsupported file type: ${file.mimetype}`);
    }

    const buffer = await file.toBuffer();
    if (buffer.byteLength > MAX_FILE_SIZE) {
      throw new ImageUploadError(`File too large: ${buffer.byteLength} bytes (max ${MAX_FILE_SIZE})`);
    }

    // SECURITY: derive extension from validated MIME only, never trust filename
    const ext = mimeToExt(file.mimetype);
    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    const absPath = resolve(join(uploadDir, filename));

    await writeFile(absPath, buffer);

    saved.push({
      absPath,
      urlPath: `/uploads/${filename}`,
      content: { type: 'image', url: `/uploads/${filename}` },
    });
  }

  return saved;
}

export async function saveDataUrlImage(dataUrl: string, uploadDir: string): Promise<SavedImage> {
  if (typeof dataUrl !== 'string') {
    throw new ImageUploadError('Invalid image data URL');
  }

  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new ImageUploadError('Invalid image data URL');
  }

  const mimetype = match[1]?.toLowerCase() ?? '';
  if (!DATA_URL_IMAGE_MIME_RE.test(mimetype)) {
    throw new ImageUploadError(`Unsupported file type: ${mimetype || 'unknown'}`);
  }

  const buffer = Buffer.from(match[2] ?? '', 'base64');
  const [saved] = await saveUploadedImages(
    [
      {
        filename: `upload${mimeToExt(mimetype)}`,
        mimetype,
        toBuffer: async () => buffer,
      },
    ],
    uploadDir,
  );

  if (!saved) {
    throw new ImageUploadError('Failed to save image');
  }

  return saved;
}

/**
 * Validate and save uploaded attachment files.
 * Returns saved metadata for contentBlocks.
 */
export async function saveUploadedAttachments(
  files: UploadImageFile[],
  uploadDir: string,
): Promise<SavedAttachment[]> {
  if (files.length > MAX_FILES) {
    throw new ImageUploadError(`Too many files (max ${MAX_FILES})`);
  }

  await mkdir(uploadDir, { recursive: true });

  const saved: SavedAttachment[] = [];
  for (const file of files) {
    const attachmentMime = normalizeAttachmentMime(file);
    if (!ALLOWED_ATTACHMENT_MIMES.has(attachmentMime)) {
      throw new ImageUploadError(`Unsupported file type: ${file.mimetype}`);
    }

    const buffer = await file.toBuffer();
    if (buffer.byteLength > MAX_FILE_SIZE) {
      throw new ImageUploadError(`File too large: ${buffer.byteLength} bytes (max ${MAX_FILE_SIZE})`);
    }

    const originalFileName = sanitizeAttachmentName(file.filename, attachmentMime);
    const { filename, absPath } = await writeUniqueUploadFile(uploadDir, originalFileName, buffer);
    const urlPath = buildUploadUrlPath(filename);

    saved.push({
      absPath,
      urlPath,
      content: {
        type: 'file',
        url: urlPath,
        fileName: originalFileName,
        mimeType: attachmentMime,
        fileSize: buffer.byteLength,
      },
    });
  }

  return saved;
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    default:
      return '.bin';
  }
}

function buildUploadUrlPath(filename: string): string {
  return `/uploads/${encodeURIComponent(filename)}`;
}

function splitFileName(filename: string): { base: string; ext: string } {
  const ext = extname(filename);
  return ext ? { base: filename.slice(0, -ext.length), ext } : { base: filename, ext: '' };
}

function buildDuplicateName(filename: string, index: number): string {
  const { base, ext } = splitFileName(filename);
  return `${base} (${index})${ext}`;
}

async function writeUniqueUploadFile(
  uploadDir: string,
  preferredName: string,
  buffer: Buffer,
): Promise<{ filename: string; absPath: string }> {
  for (let index = 0; index < MAX_UNIQUE_NAME_ATTEMPTS; index += 1) {
    const filename = index === 0 ? preferredName : buildDuplicateName(preferredName, index);
    const absPath = resolve(join(uploadDir, filename));
    try {
      await writeFile(absPath, buffer, { flag: 'wx' });
      return { filename, absPath };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
  }

  throw new ImageUploadError('Unable to allocate a unique attachment filename');
}

function attachmentMimeToExt(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return '.pdf';
    case 'application/msword':
      return '.doc';
    case 'application/vnd.ms-excel':
      return '.xls';
    case 'application/vnd.ms-powerpoint':
      return '.ppt';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return '.docx';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return '.xlsx';
    case 'application/vnd.ms-excel.sheet.macroenabled.12':
      return '.xlsm';
    case 'application/vnd.ms-excel.sheet.binary.macroenabled.12':
      return '.xlsb';
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return '.pptx';
    case 'text/markdown':
    case 'text/x-markdown':
      return '.md';
    case 'text/plain':
      return '.txt';
    case 'text/csv':
      return '.csv';
    default:
      return '.bin';
  }
}

function sanitizeAttachmentName(filename: string | undefined, mime: string): string {
  const raw = basename(filename ?? '').trim();
  const fallback = `attachment${attachmentMimeToExt(mime)}`;
  if (!raw) return fallback;

  const cleaned = raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  if (!cleaned) return fallback;

  const base = extname(cleaned) ? cleaned.slice(0, -extname(cleaned).length) : cleaned;
  const normalizedBase = base.replace(/[. ]+$/g, '').trim();
  let safeBase = normalizedBase || 'attachment';
  if (safeBase.length > MAX_ATTACHMENT_BASE_LENGTH) {
    safeBase = safeBase.slice(0, MAX_ATTACHMENT_BASE_LENGTH).trim();
  }
  if (!safeBase) safeBase = 'attachment';
  if (WINDOWS_RESERVED_BASENAME_RE.test(safeBase)) {
    safeBase = `_${safeBase}`;
  }
  return `${safeBase}${attachmentMimeToExt(mime)}`;
}

function normalizeAttachmentMime(file: UploadImageFile): string {
  const mime = file.mimetype.toLowerCase();
  const extension = extname(file.filename ?? '').toLowerCase();
  // Fallback for browsers that send generic MIME types
  if (mime === '' || mime === 'application/octet-stream' || mime === 'text/plain') {
    switch (extension) {
      case '.md':
        return 'text/markdown';
      case '.xls':
        return 'application/vnd.ms-excel';
      case '.xlsb':
        return 'application/vnd.ms-excel.sheet.binary.macroenabled.12';
      case '.xlsm':
        return 'application/vnd.ms-excel.sheet.macroenabled.12';
      case '.doc':
        return 'application/msword';
      case '.ppt':
        return 'application/vnd.ms-powerpoint';
    }
  }
  return mime;
}

export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageUploadError';
  }
}
