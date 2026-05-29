/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
  type InspirationTemplateDetail,
  type InspirationTemplateListItem,
  type SkillRef,
  type AgentRef,
  type ProductRef,
} from '../types';

describe('inspiration-plaza types', () => {
  describe('TemplateCategory', () => {
    it('contains expected categories', () => {
      const expectedCategories: TemplateCategory[] = [
        '全部',
        '精选',
        '定时任务',
        '专家团思辨',
        '文档处理',
        '深度研究',
        '幻灯片',
        '数据分析',
        '数据可视化',
        '金融服务',
      ];

      expect(TEMPLATE_CATEGORIES).toEqual(expectedCategories);
    });

    it('TEMPLATE_CATEGORIES has correct length', () => {
      expect(TEMPLATE_CATEGORIES).toHaveLength(10);
    });
  });

  describe('InspirationTemplateListItem', () => {
    it('has the list contract used by template cards', () => {
      const template: InspirationTemplateListItem = {
        id: 'tpl-001',
        name: '测试模板',
        imagePath: '/images/test.png',
        description: '测试描述',
        skills: [{ id: 'skill-1', name: '技能1', icon: '/icons/skill.png' }],
        agents: [{ id: 'agent-1', name: '智能体1', catId: 'office', icon: '/icons/agent.png' }],
        tags: ['定时任务', '健康管理'],
      };

      expect(template.id).toBe('tpl-001');
      expect(template.name).toBe('测试模板');
      expect(template.imagePath).toBe('/images/test.png');
      expect(template.description).toBe('测试描述');
      expect(template.skills).toHaveLength(1);
      expect(template.agents).toHaveLength(1);
      expect(template.tags).toEqual(['定时任务', '健康管理']);
    });
  });

  describe('InspirationTemplateDetail', () => {
    it('extends the list contract with prompt and product path', () => {
      const template: InspirationTemplateDetail = {
        id: 'tpl-001',
        name: '测试模板',
        imagePath: '/images/test.png',
        description: '测试描述',
        skills: [{ id: 'skill-1', name: '技能1' }],
        agents: [{ id: 'agent-1', name: '智能体1', catId: 'office' }],
        tags: ['定时任务'],
        prompt: '测试提示词',
        productPath: '/files/result.html',
        product: { id: 'prod-1', name: '产品1', type: 'html', path: '/files/result.html' },
      };

      expect(template.productPath).toBe('/files/result.html');
      expect(template.product?.path).toBe('/files/result.html');
      expect(template.prompt).toBe('测试提示词');
    });
  });

  describe('SkillRef', () => {
    it('has correct structure', () => {
      const skill: SkillRef = {
        id: 'skill-001',
        name: '技能名称',
        icon: '/icons/skill.png',
      };

      expect(skill.id).toBe('skill-001');
      expect(skill.name).toBe('技能名称');
      expect(skill.icon).toBe('/icons/skill.png');
    });

    it('icon is optional', () => {
      const skill: SkillRef = {
        id: 'skill-001',
        name: '技能名称',
      };

      expect(skill.icon).toBeUndefined();
    });
  });

  describe('AgentRef', () => {
    it('has correct structure', () => {
      const agent: AgentRef = {
        id: 'agent-001',
        name: '智能体名称',
        catId: 'office',
        icon: '/icons/agent.png',
      };

      expect(agent.id).toBe('agent-001');
      expect(agent.name).toBe('智能体名称');
      expect(agent.catId).toBe('office');
      expect(agent.icon).toBe('/icons/agent.png');
    });

    it('icon is optional', () => {
      const agent: AgentRef = {
        id: 'agent-001',
        name: '智能体名称',
        catId: 'dare',
      };

      expect(agent.icon).toBeUndefined();
    });
  });

  describe('ProductRef', () => {
    it('has correct structure for html type', () => {
      const product: ProductRef = {
        id: 'prod-001',
        name: 'HTML产品',
        type: 'html',
        path: 'http://example.com/product.html',
        previewContent: '<html><body>Content</body></html>',
      };

      expect(product.type).toBe('html');
      expect(product.previewContent).toBe('<html><body>Content</body></html>');
    });

    it('supports all product types', () => {
      const types: ProductRef['type'][] = ['html', 'word', 'excel', 'markdown', 'image'];

      types.forEach((type) => {
        const product: ProductRef = {
          id: `prod-${type}`,
          name: `${type}产品`,
          type,
          path: 'http://example.com/product',
        };

        expect(product.type).toBe(type);
      });
    });

    it('previewContent is optional', () => {
      const product: ProductRef = {
        id: 'prod-001',
        name: '产品',
        type: 'image',
        path: 'http://example.com/image.png',
      };

      expect(product.previewContent).toBeUndefined();
    });
  });
});
