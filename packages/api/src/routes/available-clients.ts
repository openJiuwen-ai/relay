/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Available Clients Route
 *
 * GET  /api/available-clients — returns detected CLI clients
 * POST /api/available-clients/refresh — re-detect (force refresh)
 */

import type { FastifyPluginAsync } from 'fastify';
import { getAvailableClients, refreshAvailableClients } from '../utils/client-detection.js';
import { getClientLabels, getUiHints } from '../utils/client-visibility.js';

export const availableClientsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/available-clients', async () => {
    return { clients: await getAvailableClients(), clientLabels: getClientLabels(), uiHints: getUiHints() };
  });

  app.post('/api/available-clients/refresh', async () => {
    return { clients: await refreshAvailableClients(), clientLabels: getClientLabels(), uiHints: getUiHints() };
  });
};
