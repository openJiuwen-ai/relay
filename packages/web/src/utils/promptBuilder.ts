/*
 * *
 *  Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import type { ParsedPrompt, PromptBlock, TextPlaceholder, FilePlaceholder } from './promptParser';
import { usePlaceholderStore } from '../stores/placeholderStore';

export interface FinalPromptResult {
  text: string;
  files: File[];
}

/**
 * 根据 parsed prompt 和 store 状态构建最终发送内容
 */
export function buildFinalPrompt(parsed: ParsedPrompt): FinalPromptResult {
  const textValues = usePlaceholderStore.getState().textValues;
  const fileValues = usePlaceholderStore.getState().fileValues;

  let resultText = '';
  const files: File[] = [];

  for (const block of parsed.blocks) {
    if (block.type === 'fixed') {
      resultText += block.content;
    } else if (block.type === 'placeholder') {
      const placeholder = block.placeholder;

      if (placeholder.type === 'text') {
        const textValue = textValues[placeholder.id];
        if (textValue && textValue.length > 0) {
          resultText += textValue;
        } else {
          resultText += placeholder.defaultText;
        }
      } else if (placeholder.type === 'file') {
        const fileValue = fileValues[placeholder.id];
        if (fileValue) {
          resultText += fileValue.path;
        } else {
          resultText += placeholder.defaultText;
        }
      }
    }
  }

  return { text: resultText, files };
}

/**
 * 获取模板中所有占位符的默认提示语（用于发送时未填写的情况）
 */
export function getPlaceholderDefaultText(placeholder: TextPlaceholder | FilePlaceholder): string {
  return placeholder.defaultText;
}