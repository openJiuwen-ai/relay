/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Prompt Digest
 * 生成 prompt 的摘要信息，用于审计日志。
 *
 * 设计原则：
 * - 不存储完整 prompt（隐私 + 体积）
 * - 默认只记录 length + hash（Codex review P2-1）
 * - 可选开关 AUDIT_LOG_INCLUDE_PROMPT_SNIPPETS=true 启用首尾片段
 * - hash 可用于比对是否同一 prompt
 */

import { createHash } from 'node:crypto';

export interface PromptDigest {
  /** 原始 prompt 长度 */
  length: number;
  /** 首 100 字符 (仅当 AUDIT_LOG_INCLUDE_PROMPT_SNIPPETS=true) */
  head?: string;
  /** 末 100 字符 (仅当启用 snippets 且长度 > 200) */
  tail?: string;
  /** SHA256 hash 前 16 位 (可用于比对) */
  hash: string;
}

/** Check if prompt snippets should be included in audit logs */
function includeSnippets(): boolean {
  return process.env.AUDIT_LOG_INCLUDE_PROMPT_SNIPPETS === 'true';
}

/**
 * Create a digest of the prompt for audit logging.
 * By default only includes length + hash for privacy.
 * Set AUDIT_LOG_INCLUDE_PROMPT_SNIPPETS=true to include head/tail snippets.
 */
export function createPromptDigest(prompt: string): PromptDigest {
  const hash = createHash('sha256').update(prompt).digest('hex').slice(0, 16);

  // 默认不落 snippets，避免敏感信息泄露 (Codex review P2-1)
  if (!includeSnippets()) {
    return { length: prompt.length, hash };
  }

  const head = prompt.slice(0, 100);
  const tail = prompt.length > 200 ? prompt.slice(-100) : undefined;

  return {
    length: prompt.length,
    head,
    ...(tail ? { tail } : {}),
    hash,
  };
}
