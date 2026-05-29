/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { ISttProvider } from '@openjiuwen/relay-shared';

export class SttRegistry {
  private readonly providers = new Map<string, ISttProvider>();

  register(provider: ISttProvider): void {
    if (this.providers.has(provider.id)) throw new Error(`STT provider '${provider.id}' already registered`);
    this.providers.set(provider.id, provider);
  }

  get(id: string): ISttProvider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`STT provider '${id}' not found`);
    return p;
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  getDefault(): ISttProvider {
    const first = this.providers.values().next();
    if (first.done) throw new Error('No STT providers registered');
    return first.value;
  }

  listIds(): string[] {
    return [...this.providers.keys()];
  }
}
