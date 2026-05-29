/*
 * *
 *  Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

export interface TextPlaceholder {
  id: string;
  type: 'text';
  defaultText: string;
}

export interface FilePlaceholder {
  id: string;
  type: 'file';
  defaultText: string;
  fileType: string;
  formats: string[];
}

export interface FixedBlock {
  type: 'fixed';
  content: string;
}

export interface PlaceholderBlock {
  type: 'placeholder';
  placeholder: TextPlaceholder | FilePlaceholder;
}

export type PromptBlock = FixedBlock | PlaceholderBlock;

export interface ParsedPrompt {
  blocks: PromptBlock[];
  placeholderIds: string[];
}

const PLACEHOLDER_REGEX = /\{\{(file):([^:}]+)(?::([^:}]+))?(?::\[([^\]]+)\])?\}\}|\{\{([^:}]+)\}\}/g;

let placeholderCounter = 0;

function generatePlaceholderId(): string {
  return `ph_${placeholderCounter++}`;
}

/**
 * 解析模板字符串，识别占位符
 * 支持格式：
 * - {{text:提示文字}} - 文本占位符
 * - {{提示文字}} - 文本占位符（简写）
 * - {{file:提示文字}} - 文件占位符
 * - {{file:提示文字:类型}} - 文件占位符带类型
 * - {{file:提示文字:[png,jpg]}} - 文件占位符带格式
 */
export function parsePromptTemplate(template: string): ParsedPrompt {
  placeholderCounter = 0;
  const blocks: PromptBlock[] = [];
  const placeholderIds: string[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  PLACEHOLDER_REGEX.lastIndex = 0;

  while ((match = PLACEHOLDER_REGEX.exec(template)) !== null) {
    const matchStart = match.index;

    // 添加固定文本块
    if (matchStart > lastIndex) {
      blocks.push({
        type: 'fixed',
        content: template.slice(lastIndex, matchStart),
      });
    }

    // 判断匹配到的格式
    if (match[1] === 'file') {
      // {{file:提示文字}} 或 {{file:提示文字:类型}} 或 {{file:提示文字:[png,jpg]}}
      const [, , defaultText, fileType, formatsStr] = match;
      const id = generatePlaceholderId();
      placeholderIds.push(id);

      const formats = formatsStr ? formatsStr.split(',').map((f) => f.trim()) : [];

      blocks.push({
        type: 'placeholder',
        placeholder: {
          id,
          type: 'file',
          defaultText,
          fileType: fileType || 'document',
          formats,
        },
      });
    } else if (match[5]) {
      // {{提示文字}} - 简写文本占位符
      const defaultText = match[5];
      const id = generatePlaceholderId();
      placeholderIds.push(id);

      blocks.push({
        type: 'placeholder',
        placeholder: {
          id,
          type: 'text',
          defaultText,
        },
      });
    }

    lastIndex = matchStart + match[0].length;
  }

  // 添加最后的固定文本
  if (lastIndex < template.length) {
    blocks.push({
      type: 'fixed',
      content: template.slice(lastIndex),
    });
  }

  return { blocks, placeholderIds };
}

/**
 * 重置占位符计数器（用于测试）
 */
export function resetPlaceholderCounter(): void {
  placeholderCounter = 0;
}