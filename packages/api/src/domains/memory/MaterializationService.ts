/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// F102: IMaterializationService — approved marker → .md file → trigger reindex
// Phase A: basic skeleton; Phase B: full .md patch + git commit

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IMarkerQueue, IMaterializationService, MaterializeResult } from './interfaces.js';

export class MaterializationService implements IMaterializationService {
  constructor(
    private readonly markerQueue: IMarkerQueue,
    private readonly docsRoot: string,
  ) {}

  async canMaterialize(markerId: string): Promise<boolean> {
    const markers = await this.markerQueue.list();
    const marker = markers.find((m) => m.id === markerId);
    return marker?.status === 'approved';
  }

  async materialize(markerId: string): Promise<MaterializeResult> {
    const markers = await this.markerQueue.list();
    const marker = markers.find((m) => m.id === markerId);
    if (!marker) throw new Error(`Marker not found: ${markerId}`);
    if (marker.status !== 'approved') {
      throw new Error(`Marker ${markerId} not approved (status: ${marker.status})`);
    }

    // Determine output path based on targetKind
    const kind = marker.targetKind ?? 'lesson';
    const anchor = `${kind}-${markerId}`;
    const subDir = kind === 'lesson' ? 'lessons' : `${kind}s`;
    const outputPath = join(this.docsRoot, subDir, `${anchor}.md`);

    // Write .md file with frontmatter
    const md = [
      '---',
      `anchor: ${anchor}`,
      `doc_kind: ${kind}`,
      `materialized_from: ${markerId}`,
      `created: ${new Date().toISOString().split('T')[0]}`,
      '---',
      '',
      marker.content,
      '',
    ].join('\n');
    writeFileSync(outputPath, md);

    // Transition marker to materialized
    await this.markerQueue.transition(markerId, 'materialized');

    return { markerId, outputPath, anchor };
  }
}
