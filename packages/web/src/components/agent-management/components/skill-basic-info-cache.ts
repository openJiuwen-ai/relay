/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Skill Basic Info Cache
 *
 * 用于缓存已安装技能的基本信息（名称、描述），避免在详情页重复请求。
 *
 * 使用场景：
 * - SkillSelectorDrawer 加载已安装技能列表时，自动填充缓存
 * - DetailSkillsSection 显示技能卡片时，直接从缓存读取描述
 * - 技能安装/卸载时无需额外操作（SkillSelectorDrawer 重新加载时会更新缓存）
 *
 * 注意：此缓存是内存缓存，页面刷新后会重新从 SkillSelectorDrawer 加载
 */

/**
 * 技能基本信息
 */
export interface SkillBasicInfo {
  /** 技能名称 */
  name: string;
  /** 技能描述（可选） */
  description?: string;
}

// 缓存 Map：技能名称 -> 技能基本信息
let cachedSkillBasicInfos: Map<string, SkillBasicInfo> = new Map();

/**
 * 获取单个技能的基本信息
 * @param skillName 技能名称
 * @returns 技能基本信息，如果缓存不存在则返回 undefined
 */
export function getSkillBasicInfo(skillName: string): SkillBasicInfo | undefined {
  return cachedSkillBasicInfos.get(skillName);
}

/**
 * 存储单个技能的基本信息到缓存
 * @param skillName 技能名称
 * @param info 技能基本信息
 */
export function setSkillBasicInfo(skillName: string, info: SkillBasicInfo): void {
  cachedSkillBasicInfos.set(skillName, info);
}

/**
 * 批量存储技能基本信息到缓存
 * @param infos 技能基本信息数组
 */
export function setMultipleSkillBasicInfos(infos: SkillBasicInfo[]): void {
  infos.forEach((info) => {
    cachedSkillBasicInfos.set(info.name, info);
  });
}

/**
 * 从缓存中移除指定技能的信息
 * @param skillName 技能名称
 */
export function removeSkillBasicInfo(skillName: string): void {
  cachedSkillBasicInfos.delete(skillName);
}

/**
 * 获取缓存中所有技能基本信息的拷贝
 * @returns 包含所有技能信息的 Map 拷贝
 */
export function getAllSkillBasicInfos(): Map<string, SkillBasicInfo> {
  return new Map(cachedSkillBasicInfos);
}

/**
 * 清空技能基本信息缓存
 */
export function clearSkillBasicInfoCache(): void {
  cachedSkillBasicInfos.clear();
}