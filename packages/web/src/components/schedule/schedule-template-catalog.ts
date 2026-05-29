/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { ScheduleTaskDraft, ScheduleTemplateDefinition } from './schedule-template-types';

const STATIC_SCHEDULE_TEMPLATE_CATALOG: ScheduleTemplateDefinition[] = [
  {
    id: 'daily-ai-news',
    title: '每日 AI 新闻推送',
    description: '关注当天 AI 领域的重要动态、模型发布与产品更新，整理重点信息后定时推送。',
    draft: {
      taskName: '每日 AI 新闻推送',
      prompt: '每天汇总 AI 领域的重要新闻、产品更新和模型发布，输出 3 到 5 条重点内容与简短点评。',
      frequency: { type: 'daily', time: '09:00:00' },
      enabled: true,
    },
  },
  {
    id: 'daily-english-words',
    title: '每日 5 个英语单词',
    description: '每天推荐 5 个高频实用英语单词，帮助积累词汇并保持稳定输入。',
    draft: {
      taskName: '每日 5 个英语单词',
      prompt: '每天推荐 5 个高频实用英文单词，包含音标、词义、例句和简短记忆提示。',
      frequency: { type: 'daily', time: '08:00:00' },
      enabled: true,
    },
  },
  {
    id: 'bedtime-story',
    title: '每日儿童睡前故事',
    description: '生成 3 到 5 分钟可读的温和睡前故事，适合在夜间固定时间播放或阅读。',
    draft: {
      taskName: '每日儿童睡前故事',
      prompt: '每天生成一篇适合儿童睡前阅读的温和短故事，语气轻松，结尾积极。',
      frequency: { type: 'daily', time: '20:30:00' },
      enabled: true,
    },
  },
  {
    id: 'weekly-work-report',
    title: '每周工作周报',
    description: '每周五汇总本周工作进展、PR 与 Issue 处理情况，并整理成简明周报。',
    draft: {
      taskName: '每周工作周报',
      prompt: '每周汇总本周工作进展、完成事项、风险问题和下周计划，输出结构化周报。',
      frequency: { type: 'weekday', time: '18:00:00', weekdays: ['5'] },
      enabled: true,
    },
  },
  {
    id: 'classic-movie',
    title: '经典电影推荐',
    description: '推荐一部高分经典电影，提供简要介绍、推荐理由和观看建议。',
    draft: {
      taskName: '经典电影推荐',
      prompt: '定期推荐一部经典电影，包含剧情简介、推荐理由和适合观看的人群。',
      frequency: { type: 'weekday', time: '20:00:00', weekdays: ['6'] },
      enabled: true,
    },
  },
  {
    id: 'today-in-history',
    title: '历史上的今天',
    description: '从科技、电影、音乐等领域挑选当天对应的历史事件，生成轻量内容推送。',
    draft: {
      taskName: '历史上的今天',
      prompt: '每天推送历史上的今天发生的重要事件，覆盖科技、电影、音乐等领域。',
      frequency: { type: 'daily', time: '10:00:00' },
      enabled: true,
    },
  },
  {
    id: 'family-reminder',
    title: '父母联系提醒',
    description: '每周固定提醒联系家人，避免忙碌时忘记主动问候。',
    draft: {
      taskName: '父母联系提醒',
      prompt: '提醒我主动联系父母，语气自然简短。',
      frequency: { type: 'weekday', time: '10:00:00', weekdays: ['7'] },
      enabled: true,
    },
  },
  {
    id: 'medical-checkup-reminder',
    title: '体检预约提醒',
    description: '在预约日期前提醒关注体检安排、准备事项与时间节点。',
    draft: {
      taskName: '体检预约提醒',
      prompt: '提醒我关注体检预约时间和准备事项。',
      frequency: { type: 'once', executeTime: '2026-04-20 09:00:00' },
      enabled: true,
    },
  },
  {
    id: 'interview-preparation',
    title: '面试准备提醒',
    description: '工作日提醒复习面试题、项目经历和表达材料，保持准备节奏。',
    draft: {
      taskName: '面试准备提醒',
      prompt: '在工作日定时提醒我复习面试题、项目经历和自我介绍。',
      frequency: { type: 'weekday', time: '20:00:00', weekdays: ['1', '2', '3', '4', '5'] },
      enabled: true,
    },
  },
  {
    id: 'meeting-prep',
    title: '会议前准备',
    description: '在固定工作日时间提醒整理会议议题、材料和待确认事项。',
    draft: {
      taskName: '会议前准备',
      prompt: '在会议开始前提醒我整理议题、材料和待确认问题。',
      frequency: { type: 'weekday', time: '09:30:00', weekdays: ['1', '2', '3', '4', '5'] },
      enabled: true,
    },
  },
  {
    id: 'pet-wallpaper',
    title: '可爱萌宠手机壁纸',
    description: '随机从不同风格中挑选一张可爱萌宠壁纸，定期更新手机背景灵感。',
    draft: {
      taskName: '可爱萌宠手机壁纸',
      prompt: '定期推荐一张可爱萌宠风格的手机壁纸，风格清新，适合移动端。',
      frequency: { type: 'weekday', time: '08:30:00', weekdays: ['1'] },
      enabled: true,
    },
  },
  {
    id: 'scheduled-data-fetch',
    title: '定时数据抓取',
    description: '定期抓取指定数据源并输出摘要，适合监控日常数据变化与异常波动。',
    draft: {
      taskName: '定时数据抓取',
      prompt: '定时抓取指定数据源并输出简要结果摘要，标记异常变化。',
      frequency: { type: 'daily', time: '09:00:00' },
      enabled: true,
    },
  },
];

export async function loadScheduleTemplateCatalog(): Promise<ScheduleTemplateDefinition[]> {
  return STATIC_SCHEDULE_TEMPLATE_CATALOG;
}

export function createScheduleTaskDraft(template: ScheduleTemplateDefinition): ScheduleTaskDraft {
  return {
    source: 'template',
    templateId: template.id,
    ...template.draft,
    sessionId: null,
  };
}

export function createEmptyCustomScheduleTaskDraft(): ScheduleTaskDraft {
  return {
    source: 'custom',
    taskName: '',
    prompt: '',
    frequency: { type: 'daily', time: '' },
    enabled: true,
    sessionId: null,
  };
}
