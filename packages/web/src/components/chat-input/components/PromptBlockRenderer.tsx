/*
 * *
 *  Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import type { RichTextareaPromptBlocksProps } from './RichTextareaPromptBlocks';
import { RichTextareaPromptBlocks } from './RichTextareaPromptBlocks';

export function PromptBlockRenderer(props: RichTextareaPromptBlocksProps) {
  return <RichTextareaPromptBlocks {...props} />;
}
