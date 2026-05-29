/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type TemplateCategory =
  | '精选'
  | '定时任务'
  | '专家团思辨'
  | '文档处理'
  | '深度研究'
  | '幻灯片'
  | '数据分析'
  | '数据可视化'
  | '金融服务';

export interface SkillRef {
  id: string;
  name: string;
  icon?: string;
}

export interface AgentRef {
  id: string;
  name: string;
  catId: string;
  icon?: string;
}

export type ProductType = 'html' | 'word' | 'excel' | 'markdown' | 'image';

export interface ProductRef {
  id: string;
  name: string;
  type: ProductType;
  path: string;
  previewContent?: string;
}

export interface InspirationTemplateListItem {
  id: string;
  name: string;
  imagePath: string;
  description: string;
  skills: SkillRef[];
  agents: AgentRef[];
  tags: string[];
}

export interface InspirationTemplateDetail extends InspirationTemplateListItem {
  prompt: string;
  productPath: string | null;
  product: ProductRef | null;
}
