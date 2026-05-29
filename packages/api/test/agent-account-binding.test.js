/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

async function seedTemplate(projectRoot, mutateTemplate) {
  const templatePath = join(process.cwd(), '..', '..', 'office-claw-template.json');
  const template = JSON.parse(await readFile(templatePath, 'utf-8'));
  if (mutateTemplate) mutateTemplate(template);
  await writeFile(join(projectRoot, 'office-claw-template.json'), `${JSON.stringify(template, null, 2)}\n`, 'utf-8');
}

describe('cat account binding', () => {
  it('treats bootstrapped seed cats as inheriting the active bootstrap binding', async () => {
    const { bootstrapCatCatalog, resolveCatCatalogPath } = await import('../dist/config/office-claw-catalog-store.js');
    const { loadCatConfig, toAllCatConfigs } = await import('../dist/config/office-claw-config-loader.js');
    const { resolveBoundAccountRefForCat } = await import('../dist/config/office-claw-account-binding.js');
    const projectRoot = await mkdtemp(join(tmpdir(), 'cat-account-binding-inherited-'));
    const previousGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;

    try {
      await seedTemplate(projectRoot);
      bootstrapCatCatalog(projectRoot, join(projectRoot, 'office-claw-template.json'));
      const catConfig = toAllCatConfigs(loadCatConfig(resolveCatCatalogPath(projectRoot))).codex;
      assert.ok(catConfig, 'codex should be present in bootstrapped runtime catalog');
      assert.equal(resolveBoundAccountRefForCat(projectRoot, 'codex', catConfig), undefined);
    } finally {
      if (previousGlobalRoot === undefined) delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
      else process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = previousGlobalRoot;
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('returns explicit seed providerProfileId markers after bootstrap', async () => {
    const { bootstrapCatCatalog, resolveCatCatalogPath } = await import('../dist/config/office-claw-catalog-store.js');
    const { loadCatConfig, toAllCatConfigs } = await import('../dist/config/office-claw-config-loader.js');
    const { resolveBoundAccountRefForCat } = await import('../dist/config/office-claw-account-binding.js');
    const projectRoot = await mkdtemp(join(tmpdir(), 'cat-account-binding-explicit-'));
    const previousGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;

    try {
      await seedTemplate(projectRoot, (template) => {
        const codexBreed = template.breeds.find((breed) => breed.agentId === 'codex');
        if (!codexBreed) throw new Error('codex breed missing from template');
        codexBreed.variants[0].providerProfileId = 'codex-pinned';
      });
      bootstrapCatCatalog(projectRoot, join(projectRoot, 'office-claw-template.json'));
      const catConfig = toAllCatConfigs(loadCatConfig(resolveCatCatalogPath(projectRoot))).codex;
      assert.ok(catConfig, 'codex should be present in bootstrapped runtime catalog');
      assert.equal(resolveBoundAccountRefForCat(projectRoot, 'codex', catConfig), 'codex-pinned');
    } finally {
      if (previousGlobalRoot === undefined) delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
      else process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = previousGlobalRoot;
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('backfills legacy accountRef-only seed bindings before suppressing inherited bootstrap refs', async () => {
    const { bootstrapCatCatalog, readCatCatalog, resolveCatCatalogPath } = await import(
      '../dist/config/office-claw-catalog-store.js'
    );
    const { toAllCatConfigs } = await import('../dist/config/office-claw-config-loader.js');
    const { resolveBoundAccountRefForCat } = await import('../dist/config/office-claw-account-binding.js');
    const projectRoot = await mkdtemp(join(tmpdir(), 'cat-account-binding-legacy-seed-'));
    const previousTemplatePath = process.env.CAT_TEMPLATE_PATH;
    const previousGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;

    try {
      await seedTemplate(projectRoot);
      process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');
      process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;
      bootstrapCatCatalog(projectRoot, process.env.CAT_TEMPLATE_PATH);

      const catalogPath = resolveCatCatalogPath(projectRoot);
      const runtimeCatalog = JSON.parse(await readFile(catalogPath, 'utf-8'));
      const codexBreed = runtimeCatalog.breeds.find((breed) => breed.agentId === 'codex');
      const sparkVariant = codexBreed?.variants.find((variant) => variant.agentId === 'spark');
      if (!codexBreed || !codexBreed.variants[0] || !sparkVariant) {
        throw new Error('codex seed variants missing from bootstrapped runtime catalog');
      }

      codexBreed.variants[0].accountRef = 'codex-sponsor';
      delete codexBreed.variants[0].providerProfileId;
      sparkVariant.accountRef = 'codex';
      delete sparkVariant.providerProfileId;
      await mkdir(join(projectRoot, '.office-claw'), { recursive: true });
      await writeFile(catalogPath, `${JSON.stringify(runtimeCatalog, null, 2)}\n`, 'utf-8');

      const migratedCatalog = readCatCatalog(projectRoot);
      const catConfig = toAllCatConfigs(migratedCatalog).codex;
      assert.ok(catConfig, 'codex should still be present after migration');
      assert.equal(resolveBoundAccountRefForCat(projectRoot, 'codex', catConfig), 'codex-sponsor');

      const migratedRaw = JSON.parse(await readFile(catalogPath, 'utf-8'));
      const migratedCodexBreed = migratedRaw.breeds.find((breed) => breed.agentId === 'codex');
      const migratedSparkVariant = migratedCodexBreed?.variants.find((variant) => variant.agentId === 'spark');
      assert.equal(migratedCodexBreed?.variants[0]?.providerProfileId, 'codex-sponsor');
      assert.equal(migratedSparkVariant?.providerProfileId, undefined);
    } finally {
      if (previousTemplatePath === undefined) delete process.env.CAT_TEMPLATE_PATH;
      else process.env.CAT_TEMPLATE_PATH = previousTemplatePath;
      if (previousGlobalRoot === undefined) delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
      else process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = previousGlobalRoot;
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('keeps untouched seed siblings inherited after bootstrap switches to a new account', async () => {
    const { bootstrapCatCatalog, readCatCatalog, resolveCatCatalogPath } = await import(
      '../dist/config/office-claw-catalog-store.js'
    );
    const { toAllCatConfigs } = await import('../dist/config/office-claw-config-loader.js');
    const { resolveBoundAccountRefForCat } = await import('../dist/config/office-claw-account-binding.js');
    const { activateProviderProfile, createProviderProfile } = await import('../dist/config/provider-profiles.js');
    const projectRoot = await mkdtemp(join(tmpdir(), 'cat-account-binding-sibling-inherited-'));
    const previousTemplatePath = process.env.CAT_TEMPLATE_PATH;
    const previousGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;

    try {
      await seedTemplate(projectRoot);
      process.env.CAT_TEMPLATE_PATH = join(projectRoot, 'office-claw-template.json');
      bootstrapCatCatalog(projectRoot, process.env.CAT_TEMPLATE_PATH);

      const catalogPath = resolveCatCatalogPath(projectRoot);
      const runtimeCatalog = JSON.parse(await readFile(catalogPath, 'utf-8'));
      const codexBreed = runtimeCatalog.breeds.find((breed) => breed.agentId === 'codex');
      const sparkVariant = codexBreed?.variants.find((variant) => variant.agentId === 'spark');
      if (!codexBreed || !codexBreed.variants[0] || !sparkVariant) {
        throw new Error('codex seed variants missing from bootstrapped runtime catalog');
      }

      codexBreed.variants[0].accountRef = 'codex-sponsor';
      delete codexBreed.variants[0].providerProfileId;
      sparkVariant.accountRef = 'codex';
      delete sparkVariant.providerProfileId;
      await writeFile(catalogPath, `${JSON.stringify(runtimeCatalog, null, 2)}\n`, 'utf-8');

      const activatedProfile = await createProviderProfile(projectRoot, {
        provider: 'openai',
        name: 'activated-openai',
        mode: 'api_key',
        authType: 'api_key',
        protocol: 'openai',
        baseUrl: 'https://api.activated.example',
        apiKey: 'sk-activated-openai',
        setActive: false,
      });
      await activateProviderProfile(projectRoot, 'openai', activatedProfile.id);

      const migratedCatalog = readCatCatalog(projectRoot);
      const allCats = toAllCatConfigs(migratedCatalog);
      assert.equal(resolveBoundAccountRefForCat(projectRoot, 'codex', allCats.codex), 'codex-sponsor');
      assert.equal(resolveBoundAccountRefForCat(projectRoot, 'spark', allCats.spark), undefined);
    } finally {
      if (previousGlobalRoot === undefined) delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
      else process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = previousGlobalRoot;
      if (previousTemplatePath === undefined) delete process.env.CAT_TEMPLATE_PATH;
      else process.env.CAT_TEMPLATE_PATH = previousTemplatePath;
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
