/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import Database from 'better-sqlite3';
import type {
  SchedulerPersistence,
  SchedulerProvider,
  SchedulerProviderInput,
} from '@openjiuwen/relay-api-server-contracts/scheduler';
import { applyMigrations } from '../evidence/schema.js';
import { DynamicTaskStore } from './DynamicTaskStore.js';
import { EmissionStore } from './EmissionStore.js';
import { GlobalControlStore } from './GlobalControlStore.js';
import { PackTemplateStore } from './PackTemplateStore.js';
import { RunLedger } from './RunLedger.js';

export const schedulerProvider: SchedulerProvider = {
  id: 'sqlite',
  displayName: 'SQLite Scheduler Persistence',
  createSchedulerPersistence(input: SchedulerProviderInput): SchedulerPersistence {
    const db = new Database(input.sqlitePath ?? 'evidence.sqlite');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    applyMigrations(db);

    return {
      ledger: new RunLedger(db),
      globalControlStore: new GlobalControlStore(db),
      emissionStore: new EmissionStore(db),
      packTemplateStore: new PackTemplateStore(db),
      dynamicTaskStore: new DynamicTaskStore(db),
      close: () => {
        db.close();
      },
    };
  },
};

export default schedulerProvider;
