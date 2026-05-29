/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F076: External Project types
 * 跨项目作战面板 — 外部项目实体
 */

export interface ExternalProject {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly description: string;
  readonly sourcePath: string;
  readonly backlogPath: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreateExternalProjectInput {
  readonly name: string;
  readonly description: string;
  readonly sourcePath: string;
  readonly backlogPath?: string;
}
