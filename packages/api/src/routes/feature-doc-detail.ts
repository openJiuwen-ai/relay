/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FeatureDocDetail } from '@openjiuwen/relay-shared';
import type { FastifyPluginAsync } from 'fastify';
import {
  parseFeatureDocDependencies,
  parseFeatureDocOwner,
  parseFeatureDocPhases,
  parseFeatureDocRisks,
  parseFeatureDocStatus,
} from './backlog-doc-import.js';
import { gitListFeatureDocs, readFeatureDocContent } from './git-doc-reader.js';

export const featureDocDetailRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { featureId: string } }>(
    '/api/backlog/feature-doc-detail',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['featureId'],
          properties: { featureId: { type: 'string', pattern: '^F\\d{3}$' } },
        },
      },
    },
    async (request, reply) => {
      const { featureId } = request.query;
      const normalizedId = featureId.toUpperCase();

      const docs = await gitListFeatureDocs();
      const docFile = docs.find((f) => f.toUpperCase().startsWith(normalizedId));
      if (!docFile) {
        reply.status(404);
        return { error: `Feature doc not found for ${featureId}` };
      }

      const content = await readFeatureDocContent(docFile);
      if (!content) {
        reply.status(404);
        return { error: `Could not read feature doc ${docFile}` };
      }

      const detail: FeatureDocDetail = {
        featureId: normalizedId,
        status: parseFeatureDocStatus(content),
        owner: parseFeatureDocOwner(content),
        phases: parseFeatureDocPhases(content),
        risks: parseFeatureDocRisks(content),
        dependencies: parseFeatureDocDependencies(content),
      };

      return detail;
    },
  );
};
