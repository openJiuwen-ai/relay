/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type PptStudioStatus = 'generating' | 'editable' | 'exporting' | 'error';

export interface PptStudioSlide {
  slideId: string;
  pageNumber: number;
  htmlPath: string;
  title: string | null;
  blockCount: number | null;
  updatedAt: number | null;
  url?: string | null;
  sha256?: string | null;
}

export interface PptStudioSlideInput {
  slideId: string;
  pageNumber: number;
  htmlPath: string;
  title?: string | null;
  blockCount?: number | null;
  updatedAt?: number | null;
  url?: string | null;
  sha256?: string | null;
}

export interface PptMessageContext {
  projectRoot?: string;
  pagesDir: string;
  deckTitle?: string;
}

export interface PptStudioSession {
  threadId: string;
  /** Thread project path — required for PPT API path resolution after workspace sunset (F143). */
  projectRoot: string | null;
  pagesDir: string;
  deckTitle: string;
  expectedSlideCount?: number;
  status: PptStudioStatus;
  slides: PptStudioSlide[];
  activeSlideId: string | null;
}

export interface PptStudioSlidesUpdate {
  projectRoot?: string | null;
  pagesDir: string;
  deckTitle?: string;
  expectedSlideCount?: number;
  status?: PptStudioStatus;
  slides: PptStudioSlideInput[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getPagesDirFromHtmlPath(htmlPath: string): string | undefined {
  const lastSlash = htmlPath.lastIndexOf('/');
  if (lastSlash <= 0) return undefined;
  return htmlPath.slice(0, lastSlash);
}

function inferPageNumberFromHtmlPath(htmlPath: string): number | undefined {
  const match = htmlPath.match(/page-(\d+)\.pptx\.html$/i);
  if (!match) return undefined;
  return Number(match[1]);
}

function coercePptStudioSlide(value: unknown): PptStudioSlideInput | null {
  if (!isRecord(value)) return null;

  const htmlPath = typeof value.htmlPath === 'string' ? value.htmlPath : undefined;
  const pageNumber = getNumber(value.pageNumber) ?? (htmlPath ? inferPageNumberFromHtmlPath(htmlPath) : undefined);
  const slideId =
    typeof value.slideId === 'string'
      ? value.slideId
      : pageNumber !== undefined
        ? `slide-${pageNumber}`
        : undefined;

  if (!htmlPath || pageNumber === undefined || !slideId) return null;

  return {
    slideId,
    pageNumber,
    htmlPath,
    ...(getNullableString(value.title) !== undefined ? { title: getNullableString(value.title) } : {}),
    ...(value.blockCount === null || getNumber(value.blockCount) !== undefined
      ? { blockCount: getNumber(value.blockCount) ?? null }
      : {}),
    ...(value.updatedAt === null || getNumber(value.updatedAt) !== undefined
      ? { updatedAt: getNumber(value.updatedAt) ?? null }
      : {}),
    ...(getNullableString(value.url) !== undefined ? { url: getNullableString(value.url) } : {}),
    ...(getNullableString(value.sha256) !== undefined ? { sha256: getNullableString(value.sha256) } : {}),
  };
}

export function coercePptStudioStatus(value: unknown): PptStudioStatus | null {
  return value === 'generating' || value === 'editable' || value === 'exporting' || value === 'error' ? value : null;
}

export function coercePptStudioSlidesUpdate(raw: Record<string, unknown>): PptStudioSlidesUpdate | null {
  const source = isRecord(raw.session) ? raw.session : raw;

  const slides =
    Array.isArray(source.slides) && source.slides.length > 0
      ? source.slides.map(coercePptStudioSlide).filter((slide): slide is PptStudioSlideInput => slide !== null)
      : [];

  if (slides.length === 0) {
    const singleSlide = coercePptStudioSlide(source);
    if (singleSlide) slides.push(singleSlide);
  }

  const pagesDir =
    (typeof source.pagesDir === 'string' ? source.pagesDir : undefined) ??
    (slides[0] ? getPagesDirFromHtmlPath(slides[0].htmlPath) : null);

  if (!pagesDir) return null;

  const status = coercePptStudioStatus(source.status);

  return {
    pagesDir,
    ...(typeof source.deckTitle === 'string' ? { deckTitle: source.deckTitle } : {}),
    ...(getNumber(source.expectedSlideCount) !== undefined ? { expectedSlideCount: getNumber(source.expectedSlideCount) } : {}),
    ...(status ? { status } : {}),
    slides,
  };
}
