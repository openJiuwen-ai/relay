/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { watch, type FSWatcher } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import {
  resolveOfficialSkillsRoot,
  resolveUserSkillsRoot,
} from './SkillPaths.js';

interface SkillOptionsChangeWatcherDeps {
  hostRoot: string;
  logger: FastifyBaseLogger;
  onChanged: (payload: { reason: string; changedAt: number }) => void;
}

const POLL_INTERVAL_MS = 4000;
const DEBOUNCE_MS = 500;

async function collectSkillSnapshot(skillsRoot: string): Promise<string> {
  const root = resolve(skillsRoot);
  const entries: string[] = [];
  let dirs: Array<{ name: string; isDirectory: () => boolean; isSymbolicLink: () => boolean }>;
  try {
    dirs = (await readdir(root, { withFileTypes: true })) as typeof dirs;
  } catch {
    return '';
  }

  for (const entry of dirs) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const skillMdPath = join(root, entry.name, 'SKILL.md');
    try {
      const skillStat = await stat(skillMdPath);
      entries.push(`${entry.name}:${skillStat.mtimeMs}:${skillStat.size}`);
    } catch {
      // ignore non-skill folders
    }
  }
  entries.sort((a, b) => a.localeCompare(b));
  return entries.join('|');
}

export class SkillOptionsChangeWatcher {
  private readonly roots: string[];
  private readonly logger: FastifyBaseLogger;
  private readonly onChanged: (payload: { reason: string; changedAt: number }) => void;
  private readonly watchers: FSWatcher[] = [];
  private timer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastSnapshot = '';
  private started = false;

  constructor(deps: SkillOptionsChangeWatcherDeps) {
    const hostRoot = resolve(deps.hostRoot);
    this.roots = [
      resolveOfficialSkillsRoot(hostRoot),
      resolveUserSkillsRoot(hostRoot),
    ];
    this.logger = deps.logger;
    this.onChanged = deps.onChanged;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.lastSnapshot = await this.snapshotAllRoots();
    this.startWatchers();
    this.startPollingFallback();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch {
        // no-op
      }
    }
    this.watchers.length = 0;
  }

  private startWatchers(): void {
    for (const root of this.roots) {
      try {
        const watcher = watch(
          root,
          { recursive: true },
          (_eventType, filename) => {
            const relative = typeof filename === 'string' ? filename.replaceAll('\\', '/') : '';
            if (relative && !relative.endsWith('SKILL.md')) {
              return;
            }
            this.scheduleEmit(relative ? `fs-watch:${relative}` : 'fs-watch');
          },
        );
        watcher.on('error', (err: unknown) => {
          this.logger.warn({ err, root }, '[skill-watch] filesystem watcher error');
        });
        this.watchers.push(watcher);
      } catch (err) {
        this.logger.warn({ err, root }, '[skill-watch] failed to start recursive watcher');
      }
    }
  }

  private startPollingFallback(): void {
    this.pollTimer = setInterval(() => {
      void this.checkSnapshotAndEmit('poll');
    }, POLL_INTERVAL_MS);
  }

  private scheduleEmit(reason: string): void {
    if (!this.started) return;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.checkSnapshotAndEmit(reason);
    }, DEBOUNCE_MS);
  }

  private async checkSnapshotAndEmit(reason: string): Promise<void> {
    if (!this.started) return;
    const snapshot = await this.snapshotAllRoots();
    if (snapshot === this.lastSnapshot) return;
    this.lastSnapshot = snapshot;
    this.onChanged({ reason, changedAt: Date.now() });
  }

  private async snapshotAllRoots(): Promise<string> {
    const parts = await Promise.all(this.roots.map((root) => collectSkillSnapshot(root)));
    return parts.join('||');
  }
}
