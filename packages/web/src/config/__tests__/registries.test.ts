/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F12: Registry tests — command-registry + shortcut-registry
 */
import { describe, expect, it } from 'vitest';
import { COMMAND_CATEGORIES, COMMANDS, type CommandCategory } from '../command-registry';
import { SHORTCUTS } from '../shortcut-registry';

describe('command-registry', () => {
  it('exports connector slash commands', () => {
    expect(COMMANDS.length).toBeGreaterThanOrEqual(4);
  });

  it('has no duplicate command names', () => {
    const names = COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every command has a valid category', () => {
    const validCategories = Object.keys(COMMAND_CATEGORIES) as CommandCategory[];
    for (const cmd of COMMANDS) {
      expect(validCategories).toContain(cmd.category);
    }
  });

  it('every command has non-empty usage and description', () => {
    for (const cmd of COMMANDS) {
      expect(cmd.usage.length).toBeGreaterThan(0);
      expect(cmd.description.length).toBeGreaterThan(0);
    }
  });

  it('includes core connector commands', () => {
    const names = COMMANDS.map((c) => c.name);
    expect(names).toContain('/where');
    expect(names).toContain('/new');
    expect(names).toContain('/threads');
    expect(names).toContain('/use');
  });
});

describe('shortcut-registry', () => {
  it('exports at least 2 shortcuts', () => {
    expect(SHORTCUTS.length).toBeGreaterThanOrEqual(2);
  });

  it('every shortcut has keys, description, and context', () => {
    for (const s of SHORTCUTS) {
      expect(s.keys.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.context.length).toBeGreaterThan(0);
    }
  });
});
