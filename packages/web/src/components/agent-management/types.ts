/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentData } from '@/hooks/useAgentData';
import type { ClientValue } from '../hub-agent-editor.model';
import type { ModelOption } from './components/ModelSelectDropdown';

export type PanelView = 'list' | 'detail' | 'form';

export type FormMode = 'create' | 'edit';

export interface AgentCardData {
  id: string;
  displayName: string;
  avatar?: string;
  roleDescription?: string;
  defaultModel?: string;
  source: 'runtime' | 'builtin';
  creationSource?: 'experts-plaza';
}

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export interface StepItem {
  id: string;
  label: string;
  targetRef: React.RefObject<HTMLElement | null>;
}

export type InspirationTemplate = {
  id: string;
  title: string;
  description: string;
  content: string;
};

export type TemplateBubblePosition = {
  top: number;
  left: number;
  tailLeft: number;
};

export type ModelGroupId = 'huawei-maas' | 'third-party';

export interface CreateModelOption extends ModelOption {
  accountRef: string;
  client: ClientValue;
  model: string;
  modelLabel: string;
  groupId: ModelGroupId;
}

export interface MaaSModelResponseItem {
  id?: string | number;
  name?: string;
  provider?: string;
  accountRef?: string;
  protocol?: string;
  icon?: string;
  logo?: string;
  image?: string;
  avatar?: string;
  enabled?: boolean;
  kind?: string;
  [key: string]: unknown;
}

export interface ModelMenuPosition {
  top: number;
  left: number;
  width: number;
}
