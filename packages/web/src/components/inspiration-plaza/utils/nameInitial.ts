/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

const COMMON_CHINESE_INITIALS: Record<string, string> = {
  技: 'J',
  智: 'Z',
  写: 'X',
};

const PINYIN_BOUNDARIES: Array<{ initial: string; char: string }> = [
  { initial: 'A', char: '阿' },
  { initial: 'B', char: '八' },
  { initial: 'C', char: '擦' },
  { initial: 'D', char: '搭' },
  { initial: 'E', char: '蛾' },
  { initial: 'F', char: '发' },
  { initial: 'G', char: '噶' },
  { initial: 'H', char: '哈' },
  { initial: 'J', char: '击' },
  { initial: 'K', char: '喀' },
  { initial: 'L', char: '垃' },
  { initial: 'M', char: '妈' },
  { initial: 'N', char: '拿' },
  { initial: 'O', char: '哦' },
  { initial: 'P', char: '啪' },
  { initial: 'Q', char: '七' },
  { initial: 'R', char: '然' },
  { initial: 'S', char: '撒' },
  { initial: 'T', char: '他' },
  { initial: 'W', char: '挖' },
  { initial: 'X', char: '西' },
  { initial: 'Y', char: '压' },
  { initial: 'Z', char: '匝' },
];

const pinyinCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', {
  usage: 'sort',
  sensitivity: 'base',
});

function isChineseChar(char: string): boolean {
  return /[\u3400-\u9FFF]/.test(char);
}

function getChinesePinyinInitial(char: string): string {
  const common = COMMON_CHINESE_INITIALS[char];
  if (common) return common;

  let initial = 'A';
  for (const boundary of PINYIN_BOUNDARIES) {
    if (pinyinCollator.compare(char, boundary.char) >= 0) {
      initial = boundary.initial;
      continue;
    }
    break;
  }
  return initial;
}

export function getDisplayInitial(name: string): string {
  const first = name.trim().slice(0, 1);
  if (!first) return '?';
  if (/[a-zA-Z]/.test(first)) return first.toUpperCase();
  if (isChineseChar(first)) return getChinesePinyinInitial(first);
  return first.toUpperCase();
}
