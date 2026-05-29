/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import {
  comparableLocalPathKey,
  countSendFileToUserHitsForResolvedPreviewPath,
  resolvedLocalPreviewMatchesSendFilePath,
} from '@/components/cli-output/local-generated-files';
import type { CliEvent } from '@/stores/chat-types';

function sendFileEvent(id: string, paths: string[], timestamp = 1): CliEvent {
  return {
    id,
    kind: 'tool_use',
    timestamp,
    label: 'send_file_to_user',
    detail: JSON.stringify({ abs_file_path_list: paths }),
  };
}

describe('send_file_to_user reload revision helpers', () => {
  it('normalizes comparable path keys consistently', () => {
    expect(comparableLocalPathKey(`D:\\A\\b\\c.docx`)).toBe('d:/a/b/c.docx');
    expect(comparableLocalPathKey('workspace/out/x.md')).toBe('workspace/out/x.md');
  });

  it('matches resolved preview to relative send_file workspace path suffix', () => {
    expect(
      resolvedLocalPreviewMatchesSendFilePath(`/proj/workspace/out/x.docx`, `workspace/out/x.docx`),
    ).toBe(true);
  });

  it('matches absolute send_file path to same resolved preview', () => {
    expect(
      resolvedLocalPreviewMatchesSendFilePath(`C:\\Users\\me\\out\\x.docx`, `C:/Users/me/out/x.docx`),
    ).toBe(true);
  });

  it('counts multiple send_file events for the same logical file', () => {
    const events: CliEvent[] = [
      sendFileEvent('a', ['workspace/out/x.docx'], 10),
      sendFileEvent('b', ['workspace/out/x.docx'], 20),
    ];
    expect(countSendFileToUserHitsForResolvedPreviewPath(events, `/repo/workspace/out/x.docx`)).toBe(2);
  });
});
