/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F102 Phase B: rebuild-index CLI
 * Scans docs/, parses frontmatter, rebuilds evidence.sqlite FTS index.
 *
 * Usage: pnpm --filter @openjiuwen/relay-api-server rebuild-index [--force]
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModuleLogger } from '../infrastructure/logger.js';

const log = createModuleLogger('rebuild-index');

interface RebuildIndexArgs {
  force: boolean;
  docsRoot: string;
  dbPath: string;
}

function parseArgs(argv: string[]): RebuildIndexArgs {
  const force = argv.includes('--force');
  const docsRoot = join(process.cwd(), 'docs');
  const dbPath = join(process.cwd(), 'data', 'evidence.sqlite');
  return { force, docsRoot, dbPath };
}

export async function runRebuildIndexCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  log.info({ docs: args.docsRoot, db: args.dbPath, force: args.force }, 'Rebuild index starting');

  const moduleSpecifier = process.env.OFFICE_CLAW_EVIDENCE_PROVIDER_MODULES?.split(',')[0]?.trim();
  if (!moduleSpecifier) {
    throw new Error('rebuild-index requires OFFICE_CLAW_EVIDENCE_PROVIDER_MODULES=@openjiuwen/relay-storage-sqlite/evidence');
  }
  const namespace = await import(moduleSpecifier);
  const provider = (namespace.default ?? namespace.evidenceProvider) as
    | {
        createEvidenceServices: (input: { sqlitePath: string; docsRoot: string }) => Promise<{
          index?: {
            rebuild(options?: { force?: boolean }): Promise<{ docsIndexed: number; docsSkipped: number; durationMs: number }>;
            checkConsistency(): Promise<{ ok: boolean; docCount: number; ftsCount: number }>;
          };
          close?: () => void | Promise<void>;
        }>;
      }
    | undefined;
  if (!provider) {
    throw new Error(`Evidence provider module '${moduleSpecifier}' did not export an evidence provider`);
  }

  const services = await provider.createEvidenceServices({ sqlitePath: args.dbPath, docsRoot: args.docsRoot });
  const builder = services.index;
  if (!builder) throw new Error(`Evidence provider '${moduleSpecifier}' does not expose an index builder`);

  const result = await builder.rebuild({ force: args.force });

  log.info(
    { docsIndexed: result.docsIndexed, docsSkipped: result.docsSkipped, durationMs: result.durationMs },
    'Index rebuilt',
  );

  const consistency = await builder.checkConsistency();
  if (!consistency.ok) {
    log.error({ docCount: consistency.docCount, ftsCount: consistency.ftsCount }, 'CONSISTENCY ERROR');
    process.exitCode = 1;
  } else {
    log.info({ docCount: consistency.docCount }, 'Consistency check passed');
  }

  await services.close?.();
}

// Direct invocation
const entryPath = process.argv[1];
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  runRebuildIndexCli().catch((err) => {
    log.error({ error: err }, 'Fatal error');
    process.exitCode = 1;
  });
}
