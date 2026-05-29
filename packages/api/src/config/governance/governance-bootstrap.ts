/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import type { BootstrapAction, BootstrapReport } from '@openjiuwen/relay-shared';
import { computePackChecksum, GOVERNANCE_PACK_VERSION } from './governance-pack.js';
import { GovernanceRegistry } from './governance-registry.js';
import { getMethodologyTemplates } from './methodology-templates.js';

export interface BootstrapOptions {
  dryRun: boolean;
}

export class GovernanceBootstrapService {
  private readonly registry: GovernanceRegistry;

  constructor(officeClawRoot: string) {
    this.registry = new GovernanceRegistry(officeClawRoot);
  }

  getRegistry(): GovernanceRegistry {
    return this.registry;
  }

  async bootstrap(targetProject: string, opts: BootstrapOptions): Promise<BootstrapReport> {
    const actions: BootstrapAction[] = [];
    const packVersion = GOVERNANCE_PACK_VERSION;
    const checksum = computePackChecksum();

    const templates = getMethodologyTemplates();
    for (const template of templates) {
      const action = await this.writeTemplate(targetProject, template.relativePath, template.content, opts.dryRun);
      actions.push(action);
    }

    const report: BootstrapReport = {
      projectPath: targetProject,
      timestamp: Date.now(),
      packVersion,
      actions,
      dryRun: opts.dryRun,
    };

    if (!opts.dryRun) {
      await this.saveReport(targetProject, report);
      await this.registry.register(targetProject, {
        packVersion,
        checksum,
        syncedAt: Date.now(),
        confirmedByUser: true,
      });
    }

    return report;
  }

  private async writeTemplate(
    targetProject: string,
    relativePath: string,
    content: string,
    dryRun: boolean,
  ): Promise<BootstrapAction> {
    const filePath = resolve(targetProject, relativePath);

    const rel = relative(targetProject, filePath);
    if (rel.startsWith(`..${sep}`) || rel === '..') {
      return { file: relativePath, action: 'skipped', reason: 'path escapes project root' };
    }

    try {
      await lstat(filePath);
      return { file: relativePath, action: 'skipped', reason: 'file already exists' };
    } catch {
      // Doesn't exist — create
    }

    if (!dryRun) {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf-8');
    }

    return { file: relativePath, action: 'created', reason: 'template generated' };
  }

  private async saveReport(targetProject: string, report: BootstrapReport): Promise<void> {
    const dir = resolve(targetProject, '.office-claw');
    await mkdir(dir, { recursive: true });
    const filePath = resolve(dir, 'governance-bootstrap-report.json');
    await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  }
}
