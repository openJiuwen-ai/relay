/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Provider Plugin Registry
 * Discovers and manages @office-claw/provider-* plugins.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BuiltinAccountClient, ProviderProfileProtocol } from '../agent/types.js';
import type { OfficeClawProviderPlugin, ProviderAccountSpec, ProviderBindingSpec } from './types.js';

export class ProviderPluginRegistry {
  private plugins = new Map<string, OfficeClawProviderPlugin>();

  /** Manually register a plugin (for explicit registration / testing) */
  register(plugin: OfficeClawProviderPlugin): void {
    for (const provider of plugin.providers) {
      if (this.plugins.has(provider)) {
        const existing = this.plugins.get(provider)!;
        throw new Error(
          `Provider "${provider}" already registered by plugin "${existing.name}". ` +
            `Cannot register again from plugin "${plugin.name}".`,
        );
      }
      this.plugins.set(provider, plugin);
    }
  }

  /** Get the plugin for a provider string */
  get(provider: string): OfficeClawProviderPlugin | undefined {
    return this.plugins.get(provider);
  }

  /** Check if a provider has a registered plugin */
  has(provider: string): boolean {
    return this.plugins.has(provider);
  }

  /** Get all registered plugins (deduplicated) */
  getAllPlugins(): OfficeClawProviderPlugin[] {
    return [...new Set(this.plugins.values())];
  }

  /** Get all provider strings registered */
  getAllProviders(): string[] {
    return [...this.plugins.keys()];
  }

  /** Get all account specs from all plugins */
  getAllAccountSpecs(): ProviderAccountSpec[] {
    return this.getAllPlugins().flatMap((p) => (p.accountSpecs ? [...p.accountSpecs] : []));
  }

  /** Resolve builtin client for a provider string (replaces resolveBuiltinClientForProvider) */
  resolveBuiltinClient(provider: string): BuiltinAccountClient | null {
    return this.plugins.get(provider)?.binding?.builtinClient ?? null;
  }

  /** Resolve expected protocol for a provider string (replaces resolveExpectedProtocolForProvider) */
  resolveExpectedProtocol(provider: string): ProviderProfileProtocol | null {
    return this.plugins.get(provider)?.binding?.expectedProtocol ?? null;
  }

  /**
   * Discover and register provider plugins from node_modules.
   * Scans for packages matching @office-claw/provider-* with the clowder.kind === 'provider' marker.
   * Also scans workspace packages/ directories (for monorepo development).
   */
  async discoverFromNodeModules(searchPaths?: string[]): Promise<DiscoveryResult> {
    const result: DiscoveryResult = { discovered: [], errors: [] };
    const paths = searchPaths ?? resolveDefaultSearchPaths();

    for (const searchPath of paths) {
      await this.scanDirectory(searchPath, result);
    }

    return result;
  }

  private async scanDirectory(searchPath: string, result: DiscoveryResult): Promise<void> {
    // Scan @office-claw/ scope in node_modules-style directories
    const scopeDir = join(searchPath, '@office-claw');
    if (existsSync(scopeDir)) {
      await this.scanScopeDir(scopeDir, result);
    }

    // Scan for provider-* packages directly (workspace packages/ directory)
    if (existsSync(searchPath)) {
      let entries: string[];
      try {
        entries = readdirSync(searchPath);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry.startsWith('provider-')) continue;
        const pkgDir = join(searchPath, entry);
        await this.tryLoadPlugin(pkgDir, result);
      }
    }
  }

  private async scanScopeDir(scopeDir: string, result: DiscoveryResult): Promise<void> {
    let entries: string[];
    try {
      entries = readdirSync(scopeDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.startsWith('provider-')) continue;
      const pkgDir = join(scopeDir, entry);
      await this.tryLoadPlugin(pkgDir, result);
    }
  }

  private async tryLoadPlugin(pkgDir: string, result: DiscoveryResult): Promise<void> {
    const pkgJsonPath = join(pkgDir, 'package.json');
    if (!existsSync(pkgJsonPath)) return;

    try {
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      const clowderMeta = pkgJson.clowder;
      if (!clowderMeta || clowderMeta.kind !== 'provider') return;

      const pkgName = pkgJson.name as string;

      // Resolve main entry: prefer dist/ for built packages, fall back to src/ for dev
      const mainField = pkgJson.main ?? 'index.js';
      const mainPath = join(pkgDir, mainField);
      if (!existsSync(mainPath)) {
        // Try src/ fallback for workspace packages that may not be built
        const srcFallback = join(pkgDir, 'src', 'index.ts');
        if (existsSync(srcFallback)) return; // Skip — not built yet
      }

      const mod = await import(mainPath);
      const plugin = (mod.default ?? mod) as OfficeClawProviderPlugin;

      if (!isValidPlugin(plugin)) {
        result.errors.push({
          package: pkgName,
          error: `Invalid plugin export: missing name, providers, or createAgentService`,
        });
        return;
      }

      // Skip providers already registered (explicit registration takes priority)
      const newProviders = plugin.providers.filter((p) => !this.has(p));
      if (newProviders.length === 0) {
        result.discovered.push({ package: pkgName, providers: [], skipped: true });
        return;
      }

      for (const provider of newProviders) {
        this.plugins.set(provider, plugin);
      }
      result.discovered.push({ package: pkgName, providers: [...newProviders] });
    } catch (err) {
      const entryName = pkgDir.split('/').pop() ?? pkgDir;
      result.errors.push({
        package: entryName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Reset all registrations (for testing / hot-reload) */
  reset(): void {
    this.plugins.clear();
  }
}

export interface DiscoveryResult {
  discovered: Array<{ package: string; providers: string[]; skipped?: boolean }>;
  errors: Array<{ package: string; error: string }>;
}

function isValidPlugin(plugin: unknown): plugin is OfficeClawProviderPlugin {
  if (!plugin || typeof plugin !== 'object') return false;
  const p = plugin as Record<string, unknown>;
  return (
    typeof p.name === 'string' &&
    Array.isArray(p.providers) &&
    p.providers.length > 0 &&
    typeof p.createAgentService === 'function'
  );
}

function resolveDefaultSearchPaths(): string[] {
  const paths: string[] = [];

  // Walk up from CWD looking for node_modules and packages/ (workspace)
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const nm = join(dir, 'node_modules');
    if (existsSync(nm)) {
      paths.push(nm);
    }
    // Also check for monorepo workspace packages/ directory
    const pkgsDir = join(dir, 'packages');
    if (existsSync(pkgsDir)) {
      paths.push(pkgsDir);
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return paths;
}
