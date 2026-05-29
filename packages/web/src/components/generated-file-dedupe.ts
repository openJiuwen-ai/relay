/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { ChatMessage as ChatMessageData } from '@/stores/chatStore';
import { extractDisplayedLocalGeneratedFiles } from './cli-output/cli-output-block';
import { toCliEvents } from './cli-output/toCliEvents';

export function computeSuppressedGeneratedFileNamesByMessage(messages: ChatMessageData[]): Map<string, string[]> {
  const suppressedByMessage = new Map<string, string[]>();
  let seenFileNames = new Set<string>();

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;

    if (message.type === 'user' || message.type === 'connector') {
      seenFileNames = new Set<string>();
      continue;
    }

    if (message.type !== 'assistant') continue;

    const cliEvents = toCliEvents(message.toolEvents, message.origin === 'stream' ? message.content : undefined, {
      padUnmatchedToolResults: !message.isStreaming && message.variant !== 'error',
    });
    if (cliEvents.length === 0) continue;

    const generatedFiles = extractDisplayedLocalGeneratedFiles(cliEvents);
    if (generatedFiles.length === 0) continue;

    const suppressedNames = generatedFiles
      .map((file) => file.name.toLowerCase())
      .filter((fileName, fileIndex, fileNames) => seenFileNames.has(fileName) && fileNames.indexOf(fileName) === fileIndex);

    if (suppressedNames.length > 0) {
      suppressedByMessage.set(message.id, suppressedNames);
    }

    for (const file of generatedFiles) {
      seenFileNames.add(file.name.toLowerCase());
    }
  }

  return suppressedByMessage;
}
