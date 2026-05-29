/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F34: TTS Provider Registry
 *
 * Manages registered TTS providers. Mirrors the pattern of AgentRegistry
 * but for text-to-speech providers.
 */

import type { ITtsProvider } from '@openjiuwen/relay-shared';

export class TtsRegistry {
  private readonly providers = new Map<string, ITtsProvider>();

  /** Register a TTS provider */
  register(provider: ITtsProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`TTS provider '${provider.id}' already registered`);
    }
    this.providers.set(provider.id, provider);
  }

  /** Get a provider by ID */
  get(id: string): ITtsProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`TTS provider '${id}' not found. Registered: [${[...this.providers.keys()].join(', ')}]`);
    }
    return provider;
  }

  /** Check if a provider is registered */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /** Get the default (first registered) provider */
  getDefault(): ITtsProvider {
    const first = this.providers.values().next();
    if (first.done) {
      throw new Error('No TTS providers registered');
    }
    return first.value;
  }

  /** List all registered provider IDs */
  listIds(): string[] {
    return [...this.providers.keys()];
  }
}
