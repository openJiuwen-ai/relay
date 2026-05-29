/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Metrics Provider Plugin API — contract for metrics reporter config resolution.
 *
 * The provider resolves cloud-platform credentials into a reporter config
 * (endpoint + token + projectId). The platform core owns the reporter lifecycle
 * (creation, concurrency guard, periodic flush, shutdown).
 */

export interface MetricsReporterConfig {
  endpoint: string;
  token: string;
  projectId: string;
}

export interface MetricsProviderInput {
  providerState: unknown;
  baseUrl: string;
  instanceId?: string;
  log?: {
    info(msg: string): void;
    info(obj: unknown, msg: string): void;
    warn(msg: string): void;
    warn(obj: unknown, msg: string): void;
    error(msg: string): void;
    error(obj: unknown, msg: string): void;
  };
}

export interface MetricsProvider {
  readonly id: string;
  readonly displayName?: string;

  bootstrap?(): Promise<void>;
  shutdown?(): Promise<void>;

  resolveReporterConfig(input: MetricsProviderInput): Promise<MetricsReporterConfig | null>;
}
