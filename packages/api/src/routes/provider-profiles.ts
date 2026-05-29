/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyPluginAsync } from 'fastify';
import { acpModelProfilesRoutes } from './acp-model-profiles.js';
import { providerProfileManagementRoutes } from './provider-profile-management-routes.js';
import type { ProviderProfilesRoutesOptions } from './provider-profiles.shared.js';

export type { ProviderProfilesRoutesOptions } from './provider-profiles.shared.js';

export const providerProfilesRoutes: FastifyPluginAsync<ProviderProfilesRoutesOptions> = async (app, opts) => {
  await app.register(acpModelProfilesRoutes);
  await app.register(providerProfileManagementRoutes, opts);
};
