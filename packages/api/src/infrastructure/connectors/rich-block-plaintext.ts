/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { RichBlock } from '@openjiuwen/relay-shared';

export function renderRichBlockPlaintext(block: RichBlock): string {
  switch (block.kind) {
    case 'card': {
      const parts = [`📋 ${block.title}`];
      if (block.bodyMarkdown) parts.push(block.bodyMarkdown);
      if (block.fields?.length) {
        parts.push(block.fields.map((f) => `  ${f.label}: ${f.value}`).join('\n'));
      }
      return parts.join('\n');
    }
    case 'checklist': {
      const header = block.title ? `☑️ ${block.title}` : '☑️ Checklist';
      const items = block.items.map((i) => `${i.checked ? '✅' : '☐'} ${i.text}`).join('\n');
      return `${header}\n${items}`;
    }
    case 'diff':
      return `📝 ${block.filePath}\n\`\`\`\n${block.diff}\n\`\`\``;
    case 'audio':
      return block.text ? `🔊 ${block.text}` : `🔊 [Audio: ${block.url}]`;
    case 'media_gallery': {
      const header = block.title ? `🖼️ ${block.title}` : '🖼️ Gallery';
      const items = block.items.map((i) => i.caption || i.alt || i.url).join('\n');
      return `${header}\n${items}`;
    }
    default:
      return `[${(block as RichBlock).kind}]`;
  }
}

export function renderAllRichBlocksPlaintext(blocks: RichBlock[]): string {
  return blocks.map(renderRichBlockPlaintext).join('\n\n');
}
