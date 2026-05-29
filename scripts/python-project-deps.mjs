/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { readFileSync } from 'node:fs';

function stripTomlComment(line) {
  let quote = null;
  let escaped = false;
  let result = '';

  for (const char of line) {
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (quote === '"') {
      result += char;
      if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        quote = null;
      }
      continue;
    }

    if (quote === "'") {
      result += char;
      if (char === "'") {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      result += char;
      continue;
    }

    if (char === '#') {
      break;
    }

    result += char;
  }

  return result;
}

function extractArrayAssignment(lines, sectionName, key) {
  let currentSection = null;
  let capturing = false;
  let bracketDepth = 0;
  let collected = '';

  for (const line of lines) {
    const withoutComment = stripTomlComment(line);
    const trimmed = withoutComment.trim();

    if (!capturing) {
      if (/^\[[^\]]+\]$/.test(trimmed)) {
        currentSection = trimmed.slice(1, -1).trim();
        continue;
      }

      if (currentSection !== sectionName) {
        continue;
      }

      const match = trimmed.match(new RegExp(`^${key}\\s*=\\s*(.*)$`));
      if (!match) {
        continue;
      }

      collecting: {
        const remainder = match[1].trim();
        if (!remainder.startsWith('[')) {
          throw new Error(`Expected ${sectionName}.${key} to be a TOML array`);
        }
        collected = remainder;
        bracketDepth = (remainder.match(/\[/g) ?? []).length - (remainder.match(/\]/g) ?? []).length;
        capturing = bracketDepth > 0;
      }

      if (!capturing) {
        return collected;
      }

      continue;
    }

    collected += `\n${withoutComment.trim()}`;
    bracketDepth += (withoutComment.match(/\[/g) ?? []).length - (withoutComment.match(/\]/g) ?? []).length;
    if (bracketDepth <= 0) {
      return collected;
    }
  }

  if (capturing) {
    throw new Error(`Unterminated TOML array for ${sectionName}.${key}`);
  }

  return null;
}

function parseTomlStringArray(rawArray) {
  const trimmed = rawArray.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new Error('Expected a bracketed TOML array');
  }

  const values = [];
  let index = 1;

  while (index < trimmed.length - 1) {
    while (index < trimmed.length - 1 && /[\s,]/.test(trimmed[index])) {
      index += 1;
    }

    if (index >= trimmed.length - 1) {
      break;
    }

    const quote = trimmed[index];
    if (quote !== '"' && quote !== "'") {
      throw new Error(`Expected a TOML string in dependency array near: ${trimmed.slice(index, index + 32)}`);
    }

    index += 1;
    let value = '';
    let escaped = false;

    while (index < trimmed.length - 1) {
      const char = trimmed[index];
      index += 1;

      if (quote === '"' && escaped) {
        value += `\\${char}`;
        escaped = false;
        continue;
      }

      if (quote === '"' && char === '\\') {
        escaped = true;
        continue;
      }

      if (char === quote) {
        break;
      }

      value += char;
    }

    values.push(value.trim());
  }

  return values.filter(Boolean);
}

export function readPyprojectDependencies(pyprojectPath) {
  const content = readFileSync(pyprojectPath, 'utf8');
  const rawArray = extractArrayAssignment(content.split(/\r?\n/), 'project', 'dependencies');
  if (!rawArray) {
    return [];
  }
  return parseTomlStringArray(rawArray);
}
