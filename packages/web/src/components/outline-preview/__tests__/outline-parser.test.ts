/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { extractOutlinePages, replaceOutlinePageLine } from '../outline-parser';

const SAMPLE_OUTLINE_WITH_TABLE = `# 大纲：介绍华为公司

**受众**：企业高管
**总页数**：5

## 页面大纲

| 页码 | 类型 | 标题 | 研究需求 |
|------|------|------|:--------:|
| 1 | intro | 华为：构建万物互联的智能世界 | ❌ |
| 2 | data | 华为跻身全球科技企业第一梯队 | ✅ |
| 3 | data | 三大业务板块协同驱动增长 | ✅ |
| 4 | technology | 自主创新构筑核心技术护城河 | ✅ |
| 5 | data | 全球化布局彰显品牌影响力 | ✅ |

## 详细要点

### P1: 华为：构建万物互联的智能世界
封面页内容...

### P2: 华为跻身全球科技企业第一梯队
数据内容...
`;

const SAMPLE_OUTLINE_NO_TABLE = `# 大纲：介绍华为公司

## 详细要点

### P1: 华为：构建万物互联的智能世界
封面页内容...

### P2: 华为跻身全球科技企业第一梯队
数据内容...

### P3: 三大业务板块协同驱动增长
业务内容...
`;

const SAMPLE_OUTLINE_NO_P_LINES = `# 大纲：介绍华为公司

## 页面大纲

无表格，无详细要点。

## 其他章节
`;

describe('extractOutlinePages', () => {
  describe('extracting from table', () => {
    it('should extract page items from table rows', () => {
      const pages = extractOutlinePages(SAMPLE_OUTLINE_WITH_TABLE);

      expect(pages.length).toBe(5);
      expect(pages[0]).toEqual({
        pageNumber: 1,
        displayText: 'P1: 华为：构建万物互联的智能世界',
        fullLine: '| 1 | intro | 华为：构建万物互联的智能世界 | ❌ |', // Real table row
        lineIndex: 9,
      });
      expect(pages[4]).toEqual({
        pageNumber: 5,
        displayText: 'P5: 全球化布局彰显品牌影响力',
        fullLine: '| 5 | data | 全球化布局彰显品牌影响力 | ✅ |', // Real table row
        lineIndex: 13,
      });
    });

    it('should sort pages by pageNumber', () => {
      const pages = extractOutlinePages(SAMPLE_OUTLINE_WITH_TABLE);
      const pageNumbers = pages.map((p) => p.pageNumber);
      expect(pageNumbers).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('extracting from detail section', () => {
    it('should extract from ### P headings when no table exists', () => {
      const pages = extractOutlinePages(SAMPLE_OUTLINE_NO_TABLE);

      expect(pages.length).toBe(3);
      expect(pages[0]?.displayText).toBe('P1: 华为：构建万物互联的智能世界');
      expect(pages[1]?.displayText).toBe('P2: 华为跻身全球科技企业第一梯队');
      expect(pages[2]?.displayText).toBe('P3: 三大业务板块协同驱动增长');
    });

    it('should preserve ### prefix in fullLine', () => {
      const pages = extractOutlinePages(SAMPLE_OUTLINE_NO_TABLE);
      expect(pages[0]?.fullLine).toBe('### P1: 华为：构建万物互联的智能世界');
    });

    it('should return empty array when no P lines found', () => {
      const pages = extractOutlinePages(SAMPLE_OUTLINE_NO_P_LINES);
      expect(pages).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty text', () => {
      const pages = extractOutlinePages('');
      expect(pages).toEqual([]);
    });

    it('should handle text with only whitespace', () => {
      const pages = extractOutlinePages('   \n\n   ');
      expect(pages).toEqual([]);
    });

    it('should prefer table over detail section when both exist', () => {
      const pages = extractOutlinePages(SAMPLE_OUTLINE_WITH_TABLE);
      // Table has 5 pages, detail section has 5 too but table wins
      expect(pages.length).toBe(5);
      // Verify lineIndex comes from table (not from ### headings)
      expect(pages[0]?.lineIndex).toBe(9); // Table row line
    });

    it('should handle Chinese colon in title', () => {
      const pages = extractOutlinePages(SAMPLE_OUTLINE_WITH_TABLE);
      expect(pages[0]?.displayText).toContain('华为：构建万物互联的智能世界');
    });
  });
});

describe('replaceOutlinePageLine', () => {
  it('should replace line with ### prefix preserved', () => {
    const pages = extractOutlinePages(SAMPLE_OUTLINE_NO_TABLE);
    const page = pages[0];
    if (!page) {
      expect.fail('Page not found');
      return;
    }

    const newText = replaceOutlinePageLine(SAMPLE_OUTLINE_NO_TABLE, page, 'P1: 新封面标题');
    expect(newText).toContain('### P1: 新封面标题');
    expect(newText).not.toContain('华为：构建万物互联的智能世界');
  });

  it('should replace line without ### prefix', () => {
    const outlineWithoutPrefix = `## 详细要点

P1: 华为标题
内容...
`;
    const pages = extractOutlinePages(outlineWithoutPrefix);
    const page = pages[0];
    if (!page) {
      expect.fail('Page not found');
      return;
    }

    const newText = replaceOutlinePageLine(outlineWithoutPrefix, page, 'P1: 新标题');
    expect(newText).toContain('P1: 新标题');
    expect(newText).not.toContain('### P1: 新标题');
  });

  it('should replace table row correctly (preserve table format)', () => {
    const pages = extractOutlinePages(SAMPLE_OUTLINE_WITH_TABLE);
    const page = pages[0]; // P1
    if (!page) {
      expect.fail('Page not found');
      return;
    }

    const newText = replaceOutlinePageLine(SAMPLE_OUTLINE_WITH_TABLE, page, 'P1: 新封面标题');

    // Key assertion: after replacement, it's still a table row format
    expect(newText).toMatch(/^\| 1 \| intro \| 新封面标题 \|/m);
    expect(newText).not.toContain('### P1: 新封面标题');

    // Verify the table structure is preserved
    const newPages = extractOutlinePages(newText);
    expect(newPages.length).toBe(5); // All 5 pages should still be found
    expect(newPages[0]?.displayText).toBe('P1: 新封面标题');
  });

  it('should preserve other columns when replacing table row', () => {
    const pages = extractOutlinePages(SAMPLE_OUTLINE_WITH_TABLE);
    const page = pages[2]; // P3
    if (!page) {
      expect.fail('Page not found');
      return;
    }

    const newText = replaceOutlinePageLine(SAMPLE_OUTLINE_WITH_TABLE, page, 'P3: 新业务标题');

    // Verify other columns (type, 研究需求) are preserved
    expect(newText).toMatch(/^\| 3 \| data \| 新业务标题 \| ✅ \|/m);
  });

  it('should handle Chinese colon in new title for table row', () => {
    const pages = extractOutlinePages(SAMPLE_OUTLINE_WITH_TABLE);
    const page = pages[0];
    if (!page) {
      expect.fail('Page not found');
      return;
    }

    const newText = replaceOutlinePageLine(SAMPLE_OUTLINE_WITH_TABLE, page, 'P1: 华为：新标题');
    expect(newText).toMatch(/^\| 1 \| intro \| 华为：新标题 \|/m);
  });
});