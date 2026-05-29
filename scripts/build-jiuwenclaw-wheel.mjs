#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { spawnSync } from 'node:child_process';
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
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

export const DEFAULT_REQUIRED_WHEEL_ENTRIES = Object.freeze([
  'jiuwenclaw/app.py',
  'jiuwenclaw/app_web.py',
  'jiuwenclaw/desktop_app.py',
  'jiuwenclaw/resources/config.yaml',
  'jiuwenclaw/resources/.env.template',
  'jiuwenclaw/web/dist/index.html',
]);

function printHelp() {
  process.stdout.write(`Usage: node scripts/build-jiuwenclaw-wheel.mjs [options]\n\n`);
  process.stdout.write(`Build a runtime-complete JiuwenClaw wheel from vendor source.\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --source-dir <dir>     JiuwenClaw source dir (default: vendor/jiuwenclaw)\n`);
  process.stdout.write(`  --output-dir <dir>     Output dir (default: dist/jiuwenclaw-wheel)\n`);
  process.stdout.write(`  --manifest <file>      Manifest path (default: <output-dir>/jiuwenclaw-wheel-manifest.json)\n`);
  process.stdout.write(`  --python <command>     Python executable/launcher to use\n`);
  process.stdout.write(`  --npm <command>        npm executable to use for web build (default: npm)\n`);
  process.stdout.write(`  --skip-web-build       Require existing web/dist and skip npm install/run build\n`);
  process.stdout.write(`  --no-clean             Keep existing output dir before building\n`);
  process.stdout.write(`  --help                 Show this help\n`);
}

export function parseArgs(argv) {
  const options = {
    sourceDir: resolve(repoRoot, 'vendor', 'jiuwenclaw'),
    outputDir: resolve(repoRoot, 'dist', 'jiuwenclaw-wheel'),
    manifestPath: null,
    python: null,
    npm: 'npm',
    skipWebBuild: false,
    clean: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--source-dir':
        options.sourceDir = argv[++index] ? resolve(process.cwd(), argv[index]) : null;
        break;
      case '--output-dir':
        options.outputDir = argv[++index] ? resolve(process.cwd(), argv[index]) : null;
        break;
      case '--manifest':
        options.manifestPath = argv[++index] ? resolve(process.cwd(), argv[index]) : null;
        break;
      case '--python':
        options.python = argv[++index] ?? null;
        break;
      case '--npm':
        options.npm = argv[++index] ?? null;
        break;
      case '--skip-web-build':
        options.skipWebBuild = true;
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

  if (!options.sourceDir) {
    throw new Error('--source-dir requires a value');
  }
  if (!options.outputDir) {
    throw new Error('--output-dir requires a value');
  }
  if (!options.npm) {
    throw new Error('--npm requires a value');
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

function isExcludedCommandPath(commandPath) {
  if (!commandPath) {
    return true;
  }
  return process.platform === 'win32' && commandPath.toLowerCase().includes('\\microsoft\\windowsapps\\');
}

function hasCommand(command, args = []) {
  const resolved = spawnSync(command, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' });
  if (resolved.status !== 0) {
    return false;
  }
  const executablePath = `${resolved.stdout ?? ''}`.trim();
  if (isExcludedCommandPath(executablePath)) {
    return false;
  }
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return result.status === 0;
}

function resolvePythonInvocation(explicitCommand) {
  if (explicitCommand) {
    return { command: explicitCommand, args: [], label: explicitCommand };
  }

  const candidates = [
    { command: 'python3', args: [], label: 'python3' },
    { command: 'python', args: [], label: 'python' },
    { command: 'py', args: ['-3'], label: 'py -3' },
  ];

  for (const candidate of candidates) {
    if (hasCommand(candidate.command, [...candidate.args, '--version'])) {
      return candidate;
    }
  }

  throw new Error('No usable Python interpreter found. Pass --python explicitly.');
}

function shouldUseCommandShell(command, platform = process.platform) {
  if (platform !== 'win32') {
    return false;
  }
  return !/[\\/]/.test(command);
}

function run(command, args, options = {}) {
  const pretty = [command, ...args].join(' ');
  process.stdout.write(`[jiuwenclaw-wheel] ${pretty}\n`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: 'inherit',
    shell: options.shell ?? shouldUseCommandShell(command),
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${pretty}`);
  }
}

function readJsonIfPresent(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function assertSourceReady(sourceDir) {
  const requiredFiles = [
    'pyproject.toml',
    'jiuwenclaw/app.py',
    'jiuwenclaw/app_web.py',
    'jiuwenclaw/desktop_app.py',
    'jiuwenclaw/resources/config.yaml',
    'jiuwenclaw/resources/.env.template',
  ];
  const missing = requiredFiles.filter((entry) => !existsSync(join(sourceDir, ...entry.split('/'))));
  if (missing.length > 0) {
    throw new Error(`JiuwenClaw source is missing required file(s): ${missing.join(', ')}`);
  }
}

function assertWebDistReady(sourceDir) {
  const indexHtml = join(sourceDir, 'jiuwenclaw', 'web', 'dist', 'index.html');
  if (!existsSync(indexHtml)) {
    throw new Error(
      'JiuwenClaw web/dist is missing. Build frontend before wheel packaging, or omit --skip-web-build.',
    );
  }
}

function buildWebDist(sourceDir, npmCommand) {
  const webDir = join(sourceDir, 'jiuwenclaw', 'web');
  const packageJsonPath = join(webDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    throw new Error(`JiuwenClaw web package.json not found: ${packageJsonPath}`);
  }
  run(npmCommand, ['install'], { cwd: webDir });
  run(npmCommand, ['run', 'build'], { cwd: webDir });
  assertWebDistReady(sourceDir);
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

function findLatestWheel(targetDir, beforeBuild = []) {
  const before = new Set(beforeBuild.map((entry) => resolve(entry)));
  const candidates = listWheelFiles(targetDir).filter((entry) => !before.has(resolve(entry)));
  if (candidates.length === 0) {
    throw new Error(`No JiuwenClaw wheel produced in ${targetDir}`);
  }
  return candidates[candidates.length - 1];
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50;
  const minimumSize = 22;
  const maxCommentLength = 0xffff;
  const start = Math.max(0, buffer.length - minimumSize - maxCommentLength);
  for (let offset = buffer.length - minimumSize; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset;
    }
  }
  throw new Error('Invalid wheel zip: end of central directory not found');
}

export function listZipEntries(zipPath) {
  const buffer = readFileSync(zipPath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];

  let offset = centralDirectoryOffset;
  const endOffset = centralDirectoryOffset + centralDirectorySize;
  while (offset < endOffset) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid wheel zip: central directory header not found at ${offset}`);
    }

    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    entries.push(buffer.subarray(nameStart, nameEnd).toString('utf8'));
    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

export function inspectJiuwenClawWheelEntries(entries, requiredEntries = DEFAULT_REQUIRED_WHEEL_ENTRIES) {
  const entrySet = new Set(entries);
  const missing = requiredEntries.filter((entry) => !entrySet.has(entry));
  const hasMetadata = entries.some((entry) => /^jiuwenclaw-.+\.dist-info\/METADATA$/i.test(entry));
  const hasRecord = entries.some((entry) => /^jiuwenclaw-.+\.dist-info\/RECORD$/i.test(entry));
  const hasNodeModules = entries.some((entry) => entry.startsWith('jiuwenclaw/web/node_modules/'));

  const metadataMissing = [];
  if (!hasMetadata) {
    metadataMissing.push('*.dist-info/METADATA');
  }
  if (!hasRecord) {
    metadataMissing.push('*.dist-info/RECORD');
  }

  return {
    ok: missing.length === 0 && metadataMissing.length === 0 && !hasNodeModules,
    missing,
    metadataMissing,
    hasMetadata,
    hasRecord,
    hasNodeModules,
  };
}

function assertWheelRuntimeComplete(wheelPath) {
  const entries = listZipEntries(wheelPath);
  const inspection = inspectJiuwenClawWheelEntries(entries);
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
  return { entries, inspection };
}

function buildWheel(sourceDir, outputDir, python) {
  const beforeBuild = listWheelFiles(outputDir);
  run(python.command, [
    ...python.args,
    '-m',
    'pip',
    'wheel',
    '--no-deps',
    '--wheel-dir',
    outputDir,
    sourceDir,
  ]);
  return findLatestWheel(outputDir, beforeBuild);
}

function readSourceMetadata(sourceDir) {
  const syncMetadata = readJsonIfPresent(join(sourceDir, '.clowder-source.json'));
  if (syncMetadata) {
    return {
      type: 'clowder-source',
      repoUrl: syncMetadata.repoUrl ?? null,
      ref: syncMetadata.ref ?? null,
      resolvedCommit: syncMetadata.resolvedCommit ?? null,
      synchronizedAt: syncMetadata.synchronizedAt ?? null,
    };
  }
  return { type: 'source-dir', repoUrl: null, ref: null, resolvedCommit: null, synchronizedAt: null };
}

export function createManifest({ sourceDir, outputDir, wheelPath, python, entries, inspection }) {
  const sourceMetadata = readSourceMetadata(sourceDir);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceDir: toPosixRelative(repoRoot, sourceDir),
    outputDir: toPosixRelative(repoRoot, outputDir),
    wheelFile: toPosixRelative(outputDir, wheelPath),
    builderPython: python.label,
    source: sourceMetadata,
    requiredEntries: [...DEFAULT_REQUIRED_WHEEL_ENTRIES],
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const sourceDir = options.sourceDir;
  const outputDir = options.outputDir;
  const manifestPath = options.manifestPath ?? join(outputDir, 'jiuwenclaw-wheel-manifest.json');

  assertSourceReady(sourceDir);
  if (options.clean) {
    resetDir(outputDir);
  } else {
    ensureDir(outputDir);
  }
  ensureDir(dirname(manifestPath));

  if (options.skipWebBuild) {
    assertWebDistReady(sourceDir);
  } else {
    buildWebDist(sourceDir, options.npm);
  }

  const python = resolvePythonInvocation(options.python);
  const wheelPath = buildWheel(sourceDir, outputDir, python);
  const { entries, inspection } = assertWheelRuntimeComplete(wheelPath);
  const manifest = createManifest({ sourceDir, outputDir, wheelPath, python, entries, inspection });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  process.stdout.write(`[jiuwenclaw-wheel] wheel ready: ${wheelPath}\n`);
  process.stdout.write(`[jiuwenclaw-wheel] manifest written to ${manifestPath}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[jiuwenclaw-wheel] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
