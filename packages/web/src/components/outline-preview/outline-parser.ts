/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Outline parser - extract page title lines from outline.md markdown content.
 * Used by OutlinePreviewCard to display structured P-lines instead of raw first 5 lines.
 */

export interface OutlinePageItem {
  /** Page number (1, 2, 3...) */
  pageNumber: number;
  /** Display text with page prefix, e.g. "P1: 华为：构建万物互联的智能世界" */
  displayText: string;
  /** Original full line content (may include ### prefix) */
  fullLine: string;
  /** Line index in original text (0-based) */
  lineIndex: number;
}

/**
 * Extract page title lines from outline.md content.
 *
 * Strategy:
 * 1. First extract from "页面大纲" table (| 1 | intro | ... | format)
 * 2. If no table found, extract from "详细要点" section's ### P\d: ... headings
 *
 * @param text - Full outline.md markdown content
 * @returns Array of OutlinePageItem sorted by pageNumber
 */
export function extractOutlinePages(text: string): OutlinePageItem[] {
  const lines = text.split('\n');

  // Strategy 1: Extract from table
  const tablePages = extractFromTable(lines);
  if (tablePages.length > 0) return tablePages;

  // Strategy 2: Extract from "详细要点" section ### P\d: ... headings
  return extractFromDetailSection(lines);
}

/**
 * Extract from "页面大纲" markdown table.
 * Table row format: | 页码 | 类型 | 标题 | 研究需求 |
 * Example: | 1 | intro | 华为：构建万物互联的智能世界 | ❌ |
 */
function extractFromTable(lines: string[]): OutlinePageItem[] {
  const pages: OutlinePageItem[] = [];
  // Match table row: | 1 | intro | 华为：构建... | ✅ |
  const tablePattern = /^\|\s*(\d+)\s*\|\s*\w+\s*\|\s*([^|]+)\s*\|/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(tablePattern);
    if (match) {
      const pageNumber = parseInt(match[1], 10);
      const title = match[2].trim();
      pages.push({
        pageNumber,
        displayText: `P${pageNumber}: ${title}`,
        fullLine: lines[i], // Return the actual table row line (not a fake ### heading)
        lineIndex: i,
      });
    }
  }
  return pages.sort((a, b) => a.pageNumber - b.pageNumber);
}

/**
 * Extract from "详细要点" section's ### P\d: ... sub-headings.
 * Heading format: ### P1: 华为：构建万物互联的智能世界
 */
function extractFromDetailSection(lines: string[]): OutlinePageItem[] {
  const pages: OutlinePageItem[] = [];
  let inDetailSection = false;

  // Match ### P1: ... or P1: ...
  const headingPattern = /^(?:###\s*)?(P(\d+):\s*.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect entering "详细要点" section
    if (line.match(/^##\s*详细要点/)) {
      inDetailSection = true;
      continue;
    }

    // Detect leaving the section (encountering new ## heading)
    if (inDetailSection && line.match(/^##\s/) && !line.match(/^##\s*详细要点/)) {
      inDetailSection = false;
    }

    if (inDetailSection) {
      const match = line.match(headingPattern);
      if (match) {
        const pageNumber = parseInt(match[2], 10);
        const displayText = match[1].trim(); // Keep "P1: xxx" format
        pages.push({
          pageNumber,
          displayText,
          fullLine: line,
          lineIndex: i,
        });
      }
    }
  }
  return pages.sort((a, b) => a.pageNumber - b.pageNumber);
}

/**
 * Replace a page line in the original text with new content.
 *
 * @param text - Original full text
 * @param page - OutlinePageItem to replace
 * @param newDisplayText - New display text (e.g. "P1: 新标题")
 * @returns Modified full text
 */
export function replaceOutlinePageLine(
  text: string,
  page: OutlinePageItem,
  newDisplayText: string,
): string {
  const lines = text.split('\n');
  const originalLine = lines[page.lineIndex];

  // Detect if the original line is a table row format
  // Table pattern: | 页码 | 类型 | 标题 | 研究需求 |
  const tablePattern = /^\|\s*\d+\s*\|\s*\w+\s*\|\s*([^|]+)\s*\|/;
  const tableMatch = originalLine.match(tablePattern);

  if (tableMatch) {
    // Table format: replace the third column (title column)
    // Extract title from newDisplayText "P1: 新标题"
    const titleMatch = newDisplayText.match(/^P\d+:\s*(.+)$/);
    const newTitle = titleMatch ? titleMatch[1] : newDisplayText;

    // Split by | and replace the third column (index 3 after split)
    const parts = originalLine.split('|');
    if (parts.length >= 4) {
      parts[3] = ` ${newTitle} `;
      lines[page.lineIndex] = parts.join('|');
    }
    return lines.join('\n');
  }

  // Heading format: check for ### prefix in the actual current line
  const hasH3Prefix = originalLine.startsWith('###');
  const newFullLine = hasH3Prefix ? `### ${newDisplayText}` : newDisplayText;
  lines[page.lineIndex] = newFullLine;
  return lines.join('\n');
}