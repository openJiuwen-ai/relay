/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

type ParsedSystemInfo = Record<string, unknown>;

function stripWrappedValue(value: string): string {
  const trimmed = value.trim().replace(/^[{]\s*/, '').replace(/\s*[}]$/, '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('`') && trimmed.endsWith('`'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function extractPseudoField(raw: string, key: string): string | undefined {
  const re = new RegExp(String.raw`(?:^|[,{]\s*)${key}\s*:\s*("[^"]*"|'[^']*'|` + '`[^`]*`' + String.raw`|[^,}]+)`, 'i');
  const match = raw.match(re);
  return match?.[1] ? stripWrappedValue(match[1]) : undefined;
}

function extractPseudoTrailingField(raw: string, key: string): string | undefined {
  const re = new RegExp(String.raw`\b${key}\s*:\s*(.+)$`, 'is');
  const match = raw.match(re);
  return match?.[1] ? stripWrappedValue(match[1]) : undefined;
}

export function parseSystemInfoContent(raw: string): ParsedSystemInfo | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as ParsedSystemInfo;
  } catch {
    // Fall through to tolerate pseudo-object diagnostics from provider streams.
  }

  const type = extractPseudoField(raw, 'type');
  if (!type) return null;

  if (type === 'thinking') {
    const text = extractPseudoTrailingField(raw, 'text');
    if (!text) return null;
    const agentId = extractPseudoField(raw, 'agentId');
    const mergeStrategy = extractPseudoField(raw, 'mergeStrategy');
    return {
      type,
      ...(agentId ? { agentId } : {}),
      ...(mergeStrategy ? { mergeStrategy } : {}),
      text,
    };
  }

  if (type === 'processing_status') {
    const status = extractPseudoField(raw, 'status');
    if (!status) return null;
    return { type, status };
  }

  return null;
}
