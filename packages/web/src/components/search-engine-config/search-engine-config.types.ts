/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type SearchEngineId = 'perplexity' | 'serper' | 'jina' | 'bocha';

export interface SearchEngine {
  id: SearchEngineId;
  name: string;
  description: string;
  type: 'paid';
  inputLabel: string;
  envVar: string;
}

export interface SearchEngineConfig {
  perplexityApiKey?: string;
  serperApiKey?: string;
  jinaApiKey?: string;
  bochaApiKey?: string;
}

export interface SearchEngineConfiguredState {
  perplexity: boolean;
  serper: boolean;
  jina: boolean;
  bocha: boolean;
}

export interface SearchEngineState {
  config: SearchEngineConfig;
  loading: boolean;
  saving: boolean;
  error: string | null;
  editingEngineId: SearchEngineId | null;
}

export interface SearchEngineEditPayload {
  engineId: SearchEngineId;
  value: string;
}

export const PAID_SEARCH_ENGINES: SearchEngine[] = [
  { id: 'bocha', name: 'Bocha(博查)', description: '基于多模态混合检索和语义排序技术的新一代搜索引擎', type: 'paid', inputLabel: 'bocha_api_key', envVar: 'BOCHA_API_KEY' },
  { id: 'jina', name: 'Jina(Jina AI)', description: '面向企业与开发者的神经搜索基础设施，提供多语言、多模态向量搜索与重排序能力，助力构建高性能RAG与企业搜索', type: 'paid', inputLabel: 'jina_api_key', envVar: 'JINA_API_KEY' },
  { id: 'perplexity', name: 'Perplexity', description: 'AI驱动的对话式答案引擎，实时联网搜索并直接给出带权威引用的精准回答，重塑知识探索方式', type: 'paid', inputLabel: 'perplexity_api_key', envVar: 'PERPLEXITY_API_KEY' },
  { id: 'serper', name: 'Serper', description: '通过SerperAPI，将Google搜索功能集成到启用MCP的应用程序中，提供丰富的搜索结果,可配置的参数和高效的响应处理', type: 'paid', inputLabel: 'serper_api_key', envVar: 'SERPER_API_KEY' },
];
