#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  inspectJiuwenClawWheelEntries,
  listZipEntries,
} from './build-jiuwenclaw-wheel.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const JIUWEN_PREFIX = 'jiuwenclaw/';
const DIST_INFO_PATTERN = /^jiuwenclaw-.+\.dist-info\//i;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

function printHelp() {
  process.stdout.write(`Usage: node scripts/materialize-jiuwenclaw-wheel-source.mjs [options]\n\n`);
  process.stdout.write(`Materialize a JiuwenClaw wheel into a runtime source tree.\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --wheel <file>         JiuwenClaw wheel file (default: latest in dist/jiuwenclaw-wheel)\n`);
  process.stdout.write(`  --output-dir <dir>     Output dir (default: dist/jiuwenclaw-wheel-source)\n`);
  process.stdout.write(`  --manifest <file>      Manifest path (default: <output-dir>/jiuwenclaw-wheel-source-manifest.json)\n`);
  process.stdout.write(`  --no-clean             Keep existing output dir before materializing\n`);
  process.stdout.write(`  --help                 Show this help\n`);
}

export function parseMaterializeArgs(argv) {
  const options = {
    wheelPath: null,
    outputDir: resolve(repoRoot, 'dist', 'jiuwenclaw-wheel-source'),
    manifestPath: null,
    clean: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--wheel':
        options.wheelPath = argv[++index] ? resolve(process.cwd(), argv[index]) : null;
        break;
      case '--output-dir':
        options.outputDir = argv[++index] ? resolve(process.cwd(), argv[index]) : null;
        break;
      case '--manifest':
        options.manifestPath = argv[++index] ? resolve(process.cwd(), argv[index]) : null;
        break;
      case '--no-clean':
        options.clean = false;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.outputDir) {
    throw new Error('--output-dir requires a value');
  }
  return options;
}

function ensureDir(targetDir) {
  mkdirSync(targetDir, { recursive: true });
}

function resetDir(targetDir) {
  rmSync(targetDir, { recursive: true, force: true });
  ensureDir(targetDir);
}

function toPosixRelative(fromDir, targetPath) {
  return relative(fromDir, targetPath).split('\\').join('/');
}

function findEndOfCentralDirectory(buffer) {
  const minimumSize = 22;
  const maxCommentLength = 0xffff;
  const start = Math.max(0, buffer.length - minimumSize - maxCommentLength);
  for (let offset = buffer.length - minimumSize; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw new Error('Invalid wheel zip: end of central directory not found');
}

function listCentralDirectoryEntries(zipPath) {
  const buffer = readFileSync(zipPath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];

  let offset = centralDirectoryOffset;
  const endOffset = centralDirectoryOffset + centralDirectorySize;
  while (offset < endOffset) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`Invalid wheel zip: central directory header not found at ${offset}`);
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    entries.push({
      name: buffer.subarray(nameStart, nameEnd).toString('utf8'),
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = nameEnd + extraLength + commentLength;
  }

  return { buffer, entries };
}

function isExtractableWheelEntry(name) {
  if (!name || name.endsWith('/')) {
    return false;
  }
  return name.startsWith(JIUWEN_PREFIX) || DIST_INFO_PATTERN.test(name);
}

function assertSafeWheelEntryName(name) {
  const segments = name.split('/');
  if (
    name.includes('\\') ||
    name.startsWith('/') ||
    /^[A-Za-z]:/.test(name) ||
    segments.some((segment) => segment === '..' || segment === '')
  ) {
    throw new Error(`Unsafe wheel entry path: ${name}`);
  }
}

function destinationForWheelEntry(outputDir, entryName) {
  assertSafeWheelEntryName(entryName);
  if (entryName.startsWith(JIUWEN_PREFIX)) {
    return join(outputDir, ...entryName.split('/'));
  }
  if (DIST_INFO_PATTERN.test(entryName)) {
    return join(outputDir, 'metadata', ...entryName.split('/'));
  }
  throw new Error(`Wheel entry is not materializable: ${entryName}`);
}

function assertInside(parentDir, targetPath) {
  const relativePath = relative(parentDir, targetPath);
  if (relativePath.startsWith('..') || relativePath === '..' || relativePath.includes('..\\') || relativePath.includes('../')) {
    throw new Error(`Refusing to write outside staging dir: ${targetPath}`);
  }
}

function readEntryData(buffer, entry) {
  const localOffset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`Invalid wheel zip: local file header not found for ${entry.name}`);
  }

  const localNameLength = buffer.readUInt16LE(localOffset + 26);
  const localExtraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + localNameLength + localExtraLength;
  const compressedData = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressedData;
  }
  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressedData);
  }
  throw new Error(`Unsupported wheel zip compression method ${entry.compressionMethod} for ${entry.name}`);
}

function extractWheelEntries(wheelPath, outputDir) {
  const names = listZipEntries(wheelPath);
  const inspection = inspectJiuwenClawWheelEntries(names);
  if (!inspection.ok) {
    const problems = [];
    if (inspection.missing.length > 0) {
      problems.push(`missing ${inspection.missing.join(', ')}`);
    }
    if (inspection.metadataMissing.length > 0) {
      problems.push(`missing ${inspection.metadataMissing.join(', ')}`);
    }
    if (inspection.hasNodeModules) {
      problems.push('contains jiuwenclaw/web/node_modules/');
    }
    throw new Error(`JiuwenClaw wheel is not runtime-complete: ${problems.join('; ')}`);
  }

  const { buffer, entries } = listCentralDirectoryEntries(wheelPath);
  let extractedCount = 0;
  for (const entry of entries) {
    if (!isExtractableWheelEntry(entry.name)) {
      continue;
    }
    const targetPath = destinationForWheelEntry(outputDir, entry.name);
    assertInside(outputDir, targetPath);
    ensureDir(dirname(targetPath));
    writeFileSync(targetPath, readEntryData(buffer, entry));
    extractedCount += 1;
  }

  return { entries: names, inspection, extractedCount };
}

function listWheelFiles(targetDir) {
  if (!existsSync(targetDir)) {
    return [];
  }
  return readdirSync(targetDir)
    .filter((entry) => /^jiuwenclaw-.+\.whl$/i.test(entry))
    .map((entry) => join(targetDir, entry))
    .sort((left, right) => {
      const leftMtime = statSync(left).mtimeMs;
      const rightMtime = statSync(right).mtimeMs;
      if (leftMtime !== rightMtime) {
        return leftMtime - rightMtime;
      }
      return left.localeCompare(right);
    });
}

function resolveWheelPath(explicitWheelPath) {
  if (explicitWheelPath) {
    if (!existsSync(explicitWheelPath)) {
      throw new Error(`JiuwenClaw wheel not found: ${explicitWheelPath}`);
    }
    return explicitWheelPath;
  }
  const defaultWheelDir = resolve(repoRoot, 'dist', 'jiuwenclaw-wheel');
  const wheels = listWheelFiles(defaultWheelDir);
  if (wheels.length === 0) {
    throw new Error(`No JiuwenClaw wheel found in ${defaultWheelDir}. Pass --wheel explicitly.`);
  }
  return wheels[wheels.length - 1];
}

function validateStaging(outputDir) {
  const requiredFiles = [
    'jiuwenclaw/app.py',
    'jiuwenclaw/app_web.py',
    'jiuwenclaw/desktop_app.py',
    'jiuwenclaw/resources/config.yaml',
    'jiuwenclaw/resources/.env.template',
    'jiuwenclaw/web/dist/index.html',
  ];
  const missing = requiredFiles.filter((entry) => !existsSync(join(outputDir, ...entry.split('/'))));
  const metadataDir = join(outputDir, 'metadata');
  const metadataFiles = existsSync(metadataDir) ? readdirSync(metadataDir, { recursive: true }) : [];
  const hasMetadata = metadataFiles.some((entry) => String(entry).replaceAll('\\', '/').endsWith('.dist-info/METADATA'));
  const hasRecord = metadataFiles.some((entry) => String(entry).replaceAll('\\', '/').endsWith('.dist-info/RECORD'));
  if (!hasMetadata) {
    missing.push('metadata/*.dist-info/METADATA');
  }
  if (!hasRecord) {
    missing.push('metadata/*.dist-info/RECORD');
  }
  if (missing.length > 0) {
    throw new Error(`JiuwenClaw wheel staging is incomplete: missing ${missing.join(', ')}`);
  }
}

function createManifest({ wheelPath, outputDir, extractedCount, entries, inspection }) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    wheelFile: toPosixRelative(repoRoot, wheelPath),
    outputDir: toPosixRelative(repoRoot, outputDir),
    extractedCount,
    inspection: {
      ok: inspection.ok,
      hasMetadata: inspection.hasMetadata,
      hasRecord: inspection.hasRecord,
      hasNodeModules: inspection.hasNodeModules,
      missing: inspection.missing,
      metadataMissing: inspection.metadataMissing,
      entryCount: entries.length,
    },
  };
}

export function materializeJiuwenClawWheelSource(options) {
  const wheelPath = resolveWheelPath(options.wheelPath);
  const outputDir = options.outputDir;
  const manifestPath = options.manifestPath ?? join(outputDir, 'jiuwenclaw-wheel-source-manifest.json');

  if (options.clean) {
    resetDir(outputDir);
  } else {
    ensureDir(outputDir);
  }
  ensureDir(dirname(manifestPath));

  const extraction = extractWheelEntries(wheelPath, outputDir);
  validateStaging(outputDir);

  const manifest = createManifest({
    wheelPath,
    outputDir,
    extractedCount: extraction.extractedCount,
    entries: extraction.entries,
    inspection: extraction.inspection,
  });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return { wheelPath, outputDir, manifestPath, extractedCount: extraction.extractedCount };
}

function main() {
  const options = parseMaterializeArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const result = materializeJiuwenClawWheelSource(options);
  process.stdout.write(`[jiuwenclaw-wheel-source] wheel: ${result.wheelPath}\n`);
  process.stdout.write(`[jiuwenclaw-wheel-source] staging ready: ${result.outputDir}\n`);
  process.stdout.write(`[jiuwenclaw-wheel-source] manifest written to ${result.manifestPath}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[jiuwenclaw-wheel-source] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
