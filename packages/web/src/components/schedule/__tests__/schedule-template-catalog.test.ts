/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import {
  loadScheduleTemplateCatalog,
  createScheduleTaskDraft,
  createEmptyCustomScheduleTaskDraft,
} from '../schedule-template-catalog';

// =============================================================================
// loadScheduleTemplateCatalog Tests
// =============================================================================

describe('loadScheduleTemplateCatalog', () => {
  it('返回非空模板数组', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    expect(catalog).toBeDefined();
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBeGreaterThan(0);
  });

  it('每个模板包含必要字段', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    for (const template of catalog) {
      expect(template.id).toBeDefined();
      expect(typeof template.id).toBe('string');
      expect(template.title).toBeDefined();
      expect(typeof template.title).toBe('string');
      expect(template.description).toBeDefined();
      expect(typeof template.description).toBe('string');
      expect(template.draft).toBeDefined();
    }
  });

  it('模板的 draft 包含正确的频率类型字段', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    const dailyTemplate = catalog.find((t) => t.draft.frequency.type === 'daily');
    expect(dailyTemplate).toBeDefined();

    const weekdayTemplate = catalog.find((t) => t.draft.frequency.type === 'weekday');
    expect(weekdayTemplate).toBeDefined();

    const onceTemplate = catalog.find((t) => t.draft.frequency.type === 'once');
    expect(onceTemplate).toBeDefined();
  });

  it('daily 类型模板包含 time 字段', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    const dailyTemplates = catalog.filter((t) => t.draft.frequency.type === 'daily');
    expect(dailyTemplates.length).toBeGreaterThan(0);
    for (const t of dailyTemplates) {
      expect(t.draft.frequency.time).toBeDefined();
    }
  });

  it('weekday 类型模板包含 time 和 weekdays 字段', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    const weekdayTemplates = catalog.filter((t) => t.draft.frequency.type === 'weekday');
    expect(weekdayTemplates.length).toBeGreaterThan(0);
    for (const t of weekdayTemplates) {
      expect(t.draft.frequency.time).toBeDefined();
      expect(t.draft.frequency.weekdays).toBeDefined();
      expect(Array.isArray(t.draft.frequency.weekdays)).toBe(true);
    }
  });

  it('once 类型模板包含 executeTime 字段', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    const onceTemplates = catalog.filter((t) => t.draft.frequency.type === 'once');
    expect(onceTemplates.length).toBeGreaterThan(0);
    for (const t of onceTemplates) {
      expect(t.draft.frequency.executeTime).toBeDefined();
    }
  });

  it('所有模板的 taskName 和 prompt 不为空', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    for (const t of catalog) {
      expect(t.draft.taskName.length).toBeGreaterThan(0);
      expect(t.draft.prompt.length).toBeGreaterThan(0);
    }
  });

  it('所有模板的 enabled 字段为 true', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    for (const t of catalog) {
      expect(t.draft.enabled).toBe(true);
    }
  });

  // 边界值测试
  it('连续调用返回相同引用（静态数据）', async () => {
    const catalog1 = await loadScheduleTemplateCatalog();
    const catalog2 = await loadScheduleTemplateCatalog();
    expect(catalog1).toBe(catalog2); // 同一引用
  });
});

// =============================================================================
// createScheduleTaskDraft Tests
// =============================================================================

describe('createScheduleTaskDraft', () => {
  it('基于模板创建 draft，source 设为 template', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    const template = catalog[0]!;
    const draft = createScheduleTaskDraft(template);

    expect(draft.source).toBe('template');
    expect(draft.templateId).toBe(template.id);
  });

  it('复制模板的 taskName 和 prompt', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    const template = catalog[0]!;
    const draft = createScheduleTaskDraft(template);

    expect(draft.taskName).toBe(template.draft.taskName);
    expect(draft.prompt).toBe(template.draft.prompt);
  });

  it('复制模板的 frequency', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    const template = catalog[0]!;
    const draft = createScheduleTaskDraft(template);

    expect(draft.frequency).toEqual(template.draft.frequency);
  });

  it('复制模板的 enabled', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    const template = catalog[0]!;
    const draft = createScheduleTaskDraft(template);

    expect(draft.enabled).toBe(template.draft.enabled);
  });

  it('sessionId 设为 null', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    const template = catalog[0]!;
    const draft = createScheduleTaskDraft(template);

    expect(draft.sessionId).toBeNull();
  });

  // 边界值测试
  it('传入不同模板生成不同 draft', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    const template1 = catalog.find((t) => t.draft.frequency.type === 'daily')!;
    const template2 = catalog.find((t) => t.draft.frequency.type === 'weekday')!;

    const draft1 = createScheduleTaskDraft(template1);
    const draft2 = createScheduleTaskDraft(template2);

    expect(draft1.templateId).not.toBe(draft2.templateId);
    expect(draft1.taskName).not.toBe(draft2.taskName);
  });

  it('不对原始模板进行修改（不可变性）', async () => {
    const catalog = await loadScheduleTemplateCatalog();
    const template = { ...catalog[0]!, draft: { ...catalog[0]!.draft } };
    const originalTaskName = template.draft.taskName;

    createScheduleTaskDraft(template);

    expect(template.draft.taskName).toBe(originalTaskName);
  });
});

// =============================================================================
// createEmptyCustomScheduleTaskDraft Tests
// =============================================================================

describe('createEmptyCustomScheduleTaskDraft', () => {
  it('source 设为 custom', () => {
    const draft = createEmptyCustomScheduleTaskDraft();
    expect(draft.source).toBe('custom');
  });

  it('taskName 和 prompt 设为空字符串', () => {
    const draft = createEmptyCustomScheduleTaskDraft();
    expect(draft.taskName).toBe('');
    expect(draft.prompt).toBe('');
  });

  it('frequency 设为默认值（daily 空时间）', () => {
    const draft = createEmptyCustomScheduleTaskDraft();
    expect(draft.frequency.type).toBe('daily');
    expect(draft.frequency.time).toBe('');
  });

  it('enabled 设为 true', () => {
    const draft = createEmptyCustomScheduleTaskDraft();
    expect(draft.enabled).toBe(true);
  });

  it('sessionId 设为 null', () => {
    const draft = createEmptyCustomScheduleTaskDraft();
    expect(draft.sessionId).toBeNull();
  });

  it('templateId 为 undefined', () => {
    const draft = createEmptyCustomScheduleTaskDraft();
    expect(draft.templateId).toBeUndefined();
  });

  // 边界值测试
  it('多次调用返回独立对象（不相等）', () => {
    const draft1 = createEmptyCustomScheduleTaskDraft();
    const draft2 = createEmptyCustomScheduleTaskDraft();
    expect(draft1).not.toBe(draft2);
  });

  it('创建的 draft 可直接修改而不影响其他实例', () => {
    const draft1 = createEmptyCustomScheduleTaskDraft();
    const draft2 = createEmptyCustomScheduleTaskDraft();

    draft1.taskName = 'Modified';

    expect(draft2.taskName).toBe('');
  });
});
