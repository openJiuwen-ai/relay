/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  DEFAULT_REQUIRED_WHEEL_ENTRIES,
  inspectJiuwenClawWheelEntries,
  listZipEntries,
  parseArgs,
} from '../../../scripts/build-jiuwenclaw-wheel.mjs';
import {
  materializeJiuwenClawWheelSource,
  parseMaterializeArgs,
} from '../../../scripts/materialize-jiuwenclaw-wheel-source.mjs';

function writeUInt16LE(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function writeUInt32LE(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function makeCentralDirectoryEntry(name) {
  const nameBuffer = Buffer.from(name, 'utf8');
  return Buffer.concat([
    writeUInt32LE(0x02014b50),
    writeUInt16LE(20),
    writeUInt16LE(20),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt32LE(0),
    writeUInt32LE(0),
    writeUInt32LE(0),
    writeUInt16LE(nameBuffer.length),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt32LE(0),
    writeUInt32LE(0),
    nameBuffer,
  ]);
}

function makeZipWithCentralDirectory(entries) {
  const centralDirectory = Buffer.concat(entries.map(makeCentralDirectoryEntry));
  return Buffer.concat([
    centralDirectory,
    writeUInt32LE(0x06054b50),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(entries.length),
    writeUInt16LE(entries.length),
    writeUInt32LE(centralDirectory.length),
    writeUInt32LE(0),
    writeUInt16LE(0),
  ]);
}

function makeLocalFileHeader(name, data) {
  const nameBuffer = Buffer.from(name, 'utf8');
  return Buffer.concat([
    writeUInt32LE(0x04034b50),
    writeUInt16LE(20),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt32LE(0),
    writeUInt32LE(data.length),
    writeUInt32LE(data.length),
    writeUInt16LE(nameBuffer.length),
    writeUInt16LE(0),
    nameBuffer,
    data,
  ]);
}

function makeCentralDirectoryFileHeader(name, data, localHeaderOffset) {
  const nameBuffer = Buffer.from(name, 'utf8');
  return Buffer.concat([
    writeUInt32LE(0x02014b50),
    writeUInt16LE(20),
    writeUInt16LE(20),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt32LE(0),
    writeUInt32LE(data.length),
    writeUInt32LE(data.length),
    writeUInt16LE(nameBuffer.length),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt32LE(0),
    writeUInt32LE(localHeaderOffset),
    nameBuffer,
  ]);
}

function makeStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8');
    const local = makeLocalFileHeader(name, data);
    localParts.push(local);
    centralParts.push(makeCentralDirectoryFileHeader(name, data, offset));
    offset += local.length;
  }

  const localContent = Buffer.concat(localParts);
  const centralDirectory = Buffer.concat(centralParts);
  return Buffer.concat([
    localContent,
    centralDirectory,
    writeUInt32LE(0x06054b50),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(centralParts.length),
    writeUInt16LE(centralParts.length),
    writeUInt32LE(centralDirectory.length),
    writeUInt32LE(localContent.length),
    writeUInt16LE(0),
  ]);
}

test('JiuwenClaw wheel script exposes standalone and sync package commands', () => {
  const packageManifest = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));

  assert.equal(packageManifest.scripts['jiuwenclaw:wheel'], 'node ./scripts/build-jiuwenclaw-wheel.mjs');
  assert.equal(
    packageManifest.scripts['jiuwenclaw:wheel:sync'],
    'pnpm vendor:sync:jiuwenclaw && node ./scripts/build-jiuwenclaw-wheel.mjs',
  );
  assert.equal(
    packageManifest.scripts['jiuwenclaw:wheel:source'],
    'node ./scripts/materialize-jiuwenclaw-wheel-source.mjs',
  );
  assert.equal(
    packageManifest.scripts['package:windows:bundle:jiuwen-wheel'],
    'pnpm jiuwenclaw:wheel:sync && node ./scripts/build-windows-installer.mjs --bundle-only --jiuwenclaw-vendor-source wheel',
  );
  assert.equal(packageManifest.scripts['package:windows'].startsWith('pnpm vendor:sync:jiuwenclaw && '), true);
});

test('JiuwenClaw wheel args default to vendor source and dist output', () => {
  const options = parseArgs([]);

  assert.match(options.sourceDir, /vendor[\\/]jiuwenclaw$/);
  assert.match(options.outputDir, /dist[\\/]jiuwenclaw-wheel$/);
  assert.equal(options.npm, 'npm');
  assert.equal(options.clean, true);
  assert.equal(options.skipWebBuild, false);
});

test('JiuwenClaw wheel inspection accepts runtime-complete wheel entries', () => {
  const entries = [
    ...DEFAULT_REQUIRED_WHEEL_ENTRIES,
    'jiuwenclaw-0.1.10.dist-info/METADATA',
    'jiuwenclaw-0.1.10.dist-info/RECORD',
  ];

  const inspection = inspectJiuwenClawWheelEntries(entries);

  assert.equal(inspection.ok, true);
  assert.deepEqual(inspection.missing, []);
  assert.deepEqual(inspection.metadataMissing, []);
  assert.equal(inspection.hasNodeModules, false);
});

test('JiuwenClaw wheel inspection rejects missing frontend and node_modules', () => {
  const entries = [
    ...DEFAULT_REQUIRED_WHEEL_ENTRIES.filter((entry) => entry !== 'jiuwenclaw/web/dist/index.html'),
    'jiuwenclaw/web/node_modules/react/index.js',
    'jiuwenclaw-0.1.10.dist-info/METADATA',
    'jiuwenclaw-0.1.10.dist-info/RECORD',
  ];

  const inspection = inspectJiuwenClawWheelEntries(entries);

  assert.equal(inspection.ok, false);
  assert.deepEqual(inspection.missing, ['jiuwenclaw/web/dist/index.html']);
  assert.deepEqual(inspection.metadataMissing, []);
  assert.equal(inspection.hasNodeModules, true);
});

test('JiuwenClaw wheel zip reader lists central directory entries', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'jiuwenclaw-wheel-test-'));
  const zipPath = join(tempDir, 'jiuwenclaw-0.1.10-py3-none-any.whl');
  const expectedEntries = [
    'jiuwenclaw/app.py',
    'jiuwenclaw/web/dist/index.html',
    'jiuwenclaw-0.1.10.dist-info/METADATA',
  ];
  writeFileSync(zipPath, makeZipWithCentralDirectory(expectedEntries));

  assert.deepEqual(listZipEntries(zipPath), expectedEntries);
});

test('JiuwenClaw wheel source args default to latest wheel staging locations', () => {
  const options = parseMaterializeArgs([]);

  assert.equal(options.wheelPath, null);
  assert.match(options.outputDir, /dist[\\/]jiuwenclaw-wheel-source$/);
  assert.equal(options.clean, true);
});

test('JiuwenClaw wheel materialization writes runtime tree, metadata, and manifest', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'jiuwenclaw-materialize-test-'));
  const wheelPath = join(tempDir, 'jiuwenclaw-0.1.10-py3-none-any.whl');
  const outputDir = join(tempDir, 'staging');
  const files = {
    'jiuwenclaw/app.py': 'def main(): pass\n',
    'jiuwenclaw/app_web.py': 'def main(): pass\n',
    'jiuwenclaw/desktop_app.py': 'def main(): pass\n',
    'jiuwenclaw/resources/config.yaml': 'version: 1\n',
    'jiuwenclaw/resources/.env.template': 'KEY=value\n',
    'jiuwenclaw/web/dist/index.html': '<div>ok</div>\n',
    'jiuwenclaw-0.1.10.dist-info/METADATA': 'Name: jiuwenclaw\n',
    'jiuwenclaw-0.1.10.dist-info/RECORD': 'jiuwenclaw/app.py,,\n',
  };
  writeFileSync(wheelPath, makeStoredZip(files));

  const result = materializeJiuwenClawWheelSource({
    wheelPath,
    outputDir,
    manifestPath: null,
    clean: true,
  });

  assert.equal(result.outputDir, outputDir);
  assert.equal(existsSync(join(outputDir, 'jiuwenclaw', 'app.py')), true);
  assert.equal(existsSync(join(outputDir, 'jiuwenclaw', 'web', 'dist', 'index.html')), true);
  assert.equal(existsSync(join(outputDir, 'metadata', 'jiuwenclaw-0.1.10.dist-info', 'METADATA')), true);
  assert.equal(existsSync(join(outputDir, 'jiuwenclaw-wheel-source-manifest.json')), true);
  assert.match(readFileSync(join(outputDir, 'jiuwenclaw-wheel-source-manifest.json'), 'utf8'), /"extractedCount": 8/);
});

test('JiuwenClaw wheel materialization rejects unsafe wheel entry paths', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'jiuwenclaw-materialize-unsafe-test-'));
  const wheelPath = join(tempDir, 'jiuwenclaw-0.1.10-py3-none-any.whl');
  const outputDir = join(tempDir, 'staging');
  const files = {
    'jiuwenclaw/app.py': 'def main(): pass\n',
    'jiuwenclaw/app_web.py': 'def main(): pass\n',
    'jiuwenclaw/desktop_app.py': 'def main(): pass\n',
    'jiuwenclaw/resources/config.yaml': 'version: 1\n',
    'jiuwenclaw/resources/.env.template': 'KEY=value\n',
    'jiuwenclaw/web/dist/index.html': '<div>ok</div>\n',
    'jiuwenclaw/../unsafe.py': 'bad\n',
    'jiuwenclaw-0.1.10.dist-info/METADATA': 'Name: jiuwenclaw\n',
    'jiuwenclaw-0.1.10.dist-info/RECORD': 'jiuwenclaw/app.py,,\n',
  };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(wheelPath, makeStoredZip(files));

  assert.throws(
    () =>
      materializeJiuwenClawWheelSource({
        wheelPath,
        outputDir,
        manifestPath: null,
        clean: true,
      }),
    /Unsafe wheel entry path/,
  );
});
