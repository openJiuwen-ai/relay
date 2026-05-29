/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// Shared catalog-building logic used by both install-auth-config.mjs (Windows installer)
// and the API bootstrap path (dev mode). Ensures both paths produce identical catalogs.

/**
 * Map provider to CLI config.
 */
export function defaultCliForProvider(provider) {
  switch (provider) {
    case 'opencode':
      return { command: 'opencode', outputFormat: 'json', defaultArgs: ['run', '--format', 'json'] };
    case 'dare':
      return { command: 'dare', outputFormat: 'json' };
    case 'relayclaw':
      return { command: 'jiuwenclaw-app', outputFormat: 'json' };
    default:
      return { command: provider, outputFormat: 'json' };
  }
}

/**
 * Build a single breed entry by merging preset options over a template breed.
 * Pure function — no file I/O.
 */
export function buildModelartsBreed(template, breedId, options) {
  const breed = template.breeds.find((entry) => entry.id === breedId);
  if (!breed) throw new Error(`ModelArts preset template breed "${breedId}" not found`);
  const baseVariant = breed.variants.find((variant) => variant.id === breed.defaultVariantId) ?? breed.variants[0];
  const variantId = `${options.agentId}-default`;
  return {
    id: breed.id,
    agentId: options.agentId,
    name: options.displayName ?? breed.name,
    displayName: options.displayName ?? breed.displayName,
    nickname: options.nickname,
    avatar: options.avatar ?? breed.avatar,
    color: options.color ?? breed.color,
    mentionPatterns: options.mentionPatterns,
    roleDescription: options.roleDescription ?? breed.roleDescription,
    ...((options.teamStrengths ?? breed.teamStrengths)
      ? { teamStrengths: options.teamStrengths ?? breed.teamStrengths }
      : {}),
    ...(breed.caution !== undefined ? { caution: breed.caution } : {}),
    ...(breed.features ? { features: breed.features } : {}),
    defaultVariantId: variantId,
    variants: [
      {
        personality: options.personality ?? baseVariant?.personality,
        ...((options.strengths ?? baseVariant?.strengths)
          ? { strengths: options.strengths ?? baseVariant.strengths }
          : {}),
        ...(baseVariant?.contextBudget ? { contextBudget: baseVariant.contextBudget } : {}),
        ...(baseVariant?.voiceConfig ? { voiceConfig: baseVariant.voiceConfig } : {}),
        id: variantId,
        agentId: options.agentId,
        provider: options.provider,
        defaultModel: options.defaultModel ?? options._sharedDefaultModel ?? 'glm-5',
        mcpSupport: true,
        cli: defaultCliForProvider(options.provider),
        accountRef: 'huawei-maas',
        providerProfileId: 'huawei-maas',
      },
    ],
  };
}

/**
 * Build the full catalog object (roster + breeds) from a template and a preset.
 * Pure function — no file I/O. Callers handle reading/writing files.
 *
 * @param {object} template - parsed office-claw-template.json
 * @param {object} preset - parsed modelarts-preset.json
 * @returns {{ catalog: object, roster: object }}
 */
export function buildCatalogFromPreset(template, preset) {
  const account = preset.sharedAccount;
  const roster = {};
  for (const member of preset.members) {
    const base = template.roster[member.agentId];
    if (!base) {
      throw new Error(
        `ModelArts preset roster template for "${member.agentId}" not found in office-claw-template.json`,
      );
    }
    roster[member.agentId] = { ...base, available: true };
  }

  const catalog = {
    version: 2,
    preset: true,
    defaultAgentId: preset.members[0]?.agentId,
    coCreator: template.coCreator,
    reviewPolicy: template.reviewPolicy,
    roster,
    breeds: preset.members.map((member) =>
      buildModelartsBreed(template, member.breedId, {
        ...member,
        _sharedDefaultModel: account.models[0],
      }),
    ),
  };

  return { catalog, roster };
}
