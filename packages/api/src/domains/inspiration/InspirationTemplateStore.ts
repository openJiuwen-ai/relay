/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { readFile, stat } from 'node:fs/promises';
import { basename, extname, relative, resolve, win32 } from 'node:path';
import type {
  AgentRef,
  InspirationTemplateDetail,
  InspirationTemplateListItem,
  ProductRef,
  ProductType,
  SkillRef,
  TemplateCategory,
} from './types.js';

interface ProductSource {
  id: string;
  name: string;
  type: ProductType;
  relativePath: string;
}

interface InspirationTemplateSource {
  id: string;
  name: string;
  title: string;
  thumbnailUrl: string;
  thumbnailRelativePath?: string;
  category: TemplateCategory;
  description: string;
  prompt: string;
  skills: SkillRef[];
  agents: AgentRef[];
  products: ProductSource[];
  createdAt: string;
  updatedAt: string;
}

interface InspirationPresetDocument {
  templates: InspirationTemplateSource[];
}

export interface InspirationTemplateStoreOptions {
  presetPath: string;
  productRoot: string;
  thumbnailRoot?: string;
  productUrlPrefix?: string;
  thumbnailUrlPrefix?: string;
}

export interface InspirationProductFile {
  filePath: string;
  contentType: string;
}

const PRODUCT_TYPE_TAG_LABELS: Record<ProductType, string> = {
  html: 'HTML',
  word: '文档',
  excel: '表格',
  markdown: 'Markdown',
  image: '图片',
};

const PRODUCT_CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function isPathWithinRoot(absPath: string, root: string): boolean {
  const rel = relative(root, absPath);
  if (rel === '') return true;
  if (process.platform === 'win32' && win32.isAbsolute(rel)) return false;
  return !rel.startsWith('..') && !rel.startsWith('/') && !rel.startsWith('\\');
}

function normalizeProductRelativePath(input: string): string {
  const normalized = input.trim().replaceAll('\\', '/');
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error('Invalid inspiration product path');
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid inspiration product path');
  }
  return parts.join('/');
}

function toProductUrl(prefix: string, relativePath: string): string {
  return `${prefix}/${normalizeProductRelativePath(relativePath).split('/').map(encodeURIComponent).join('/')}`;
}

function resolveDefaultThumbnailRoot(productRoot: string): string {
  const siblingName = basename(productRoot) === 'products' ? 'thumbnails' : 'inspiration-thumbnails';
  return resolve(productRoot, '..', siblingName);
}

function getTemplateTags(template: InspirationTemplateSource): string[] {
  const tags: string[] = [template.category];
  const productType = template.products[0]?.type;
  if (productType) tags.push(PRODUCT_TYPE_TAG_LABELS[productType]);
  return Array.from(new Set(tags));
}

export class InspirationTemplateStore {
  readonly presetPath: string;
  readonly productRoot: string;
  readonly thumbnailRoot: string;
  readonly productUrlPrefix: string;
  readonly thumbnailUrlPrefix: string;

  constructor(options: InspirationTemplateStoreOptions) {
    this.presetPath = resolve(options.presetPath);
    this.productRoot = resolve(options.productRoot);
    this.thumbnailRoot = resolve(options.thumbnailRoot ?? resolveDefaultThumbnailRoot(this.productRoot));
    this.productUrlPrefix = options.productUrlPrefix ?? '/api/inspiration/products';
    this.thumbnailUrlPrefix = options.thumbnailUrlPrefix ?? '/api/inspiration/thumbnails';
  }

  async searchTemplates(
    keyword: string,
    category?: TemplateCategory | '全部',
    productType?: ProductType | '全部',
  ): Promise<InspirationTemplateListItem[]> {
    let templates = await this.loadTemplates();
    if (category && category !== '全部') {
      templates = templates.filter((template) => template.category === category);
    }
    if (productType && productType !== '全部') {
      templates = templates.filter((template) => template.products.some((product) => product.type === productType));
    }
    if (keyword) {
      const lower = keyword.toLowerCase();
      templates = templates.filter(
        (template) =>
          template.name.toLowerCase().includes(lower) ||
          template.title.toLowerCase().includes(lower) ||
          template.description.toLowerCase().includes(lower) ||
          getTemplateTags(template).some((tag) => tag.toLowerCase().includes(lower)),
      );
    }
    return templates.map((template) => this.toListItem(template));
  }

  async getTemplateById(id: string): Promise<InspirationTemplateDetail | undefined> {
    const templates = await this.loadTemplates();
    const template = templates.find((entry) => entry.id === id);
    return template ? this.toDetail(template) : undefined;
  }

  async getProductFile(requestedPath: string): Promise<InspirationProductFile | null> {
    let relativePath: string;
    try {
      relativePath = normalizeProductRelativePath(requestedPath);
    } catch {
      return null;
    }

    const templates = await this.loadTemplates();
    const declaredPaths = new Set(
      templates.flatMap((template) =>
        template.products.map((product) => {
          try {
            return normalizeProductRelativePath(product.relativePath);
          } catch {
            return null;
          }
        }),
      ),
    );
    if (!declaredPaths.has(relativePath)) return null;

    const extension = extname(basename(relativePath)).toLowerCase();
    const contentType = PRODUCT_CONTENT_TYPES[extension];
    if (!contentType) return null;

    const filePath = resolve(this.productRoot, ...relativePath.split('/'));
    if (!isPathWithinRoot(filePath, this.productRoot)) return null;
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat?.isFile()) return null;
    return { filePath, contentType };
  }

  async getThumbnailFile(requestedPath: string): Promise<InspirationProductFile | null> {
    let relativePath: string;
    try {
      relativePath = normalizeProductRelativePath(requestedPath);
    } catch {
      return null;
    }

    const templates = await this.loadTemplates();
    const declaredPaths = new Set(
      templates
        .map((template) => template.thumbnailRelativePath)
        .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
        .map((path) => {
          try {
            return normalizeProductRelativePath(path);
          } catch {
            return null;
          }
        }),
    );
    if (!declaredPaths.has(relativePath)) return null;

    const extension = extname(basename(relativePath)).toLowerCase();
    const contentType = PRODUCT_CONTENT_TYPES[extension];
    if (!contentType?.startsWith('image/')) return null;

    const filePath = resolve(this.thumbnailRoot, ...relativePath.split('/'));
    if (!isPathWithinRoot(filePath, this.thumbnailRoot)) return null;
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat?.isFile()) return null;
    return { filePath, contentType };
  }

  private async loadTemplates(): Promise<InspirationTemplateSource[]> {
    const text = await readFile(this.presetPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return '{"templates":[]}';
      throw error;
    });
    const document = JSON.parse(text) as InspirationPresetDocument;
    if (!Array.isArray(document.templates)) {
      throw new Error('Invalid inspiration preset: templates must be an array');
    }
    return document.templates.map((template) => this.normalizeTemplate(template));
  }

  private normalizeTemplate(template: InspirationTemplateSource): InspirationTemplateSource {
    return {
      ...template,
      ...(template.thumbnailRelativePath
        ? { thumbnailRelativePath: normalizeProductRelativePath(template.thumbnailRelativePath) }
        : {}),
      products: Array.isArray(template.products)
        ? template.products.map((product) => this.normalizeProduct(product))
        : [],
      skills: Array.isArray(template.skills) ? template.skills : [],
      agents: Array.isArray(template.agents) ? template.agents : [],
    };
  }

  private normalizeProduct(product: ProductSource): ProductSource {
    return {
      ...product,
      relativePath: normalizeProductRelativePath(product.relativePath),
    };
  }

  private toProductRef(product: ProductSource): ProductRef {
    return {
      id: product.id,
      name: product.name,
      type: product.type,
      path: toProductUrl(this.productUrlPrefix, product.relativePath),
    };
  }

  private toListItem(template: InspirationTemplateSource): InspirationTemplateListItem {
    return {
      id: template.id,
      name: template.name,
      imagePath: template.thumbnailRelativePath
        ? toProductUrl(this.thumbnailUrlPrefix, template.thumbnailRelativePath)
        : template.thumbnailUrl,
      description: template.description,
      skills: template.skills,
      agents: template.agents,
      tags: getTemplateTags(template),
    };
  }

  private toDetail(template: InspirationTemplateSource): InspirationTemplateDetail {
    const product = template.products[0] ? this.toProductRef(template.products[0]) : null;
    return {
      ...this.toListItem(template),
      prompt: template.prompt,
      productPath: product?.path ?? null,
      product,
    };
  }
}
