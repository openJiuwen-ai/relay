#!/usr/bin/env node

/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readPyprojectDependencies } from './python-project-deps.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function printHelp() {
  process.stdout.write(`Usage: node scripts/prepare-python-wheelhouse.mjs --config <file> [options]\n\n`);
  process.stdout.write(`Build an offline Python wheelhouse plus install manifest for Windows runtime packaging.\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --config <file>        Wheelhouse config JSON\n`);
  process.stdout.write(`  --output-dir <dir>     Output root (default: dist/windows-python-wheelhouse)\n`);
  process.stdout.write(`  --manifest <file>      Override manifest output path\n`);
  process.stdout.write(`  --python <command>     Python executable/launcher to use for pip download/wheel\n`);
  process.stdout.write(`  --group <id>           Build only one group (repeatable)\n`);
  process.stdout.write(`  --no-clean             Keep existing output root and overwrite group dirs only\n`);
  process.stdout.write(`  --help                 Show this help\n`);
}

function parseArgs(argv) {
  const options = {
    configPath: null,
    outputDir: resolve(repoRoot, 'dist', 'windows-python-wheelhouse'),
    manifestPath: null,
    python: null,
    groups: [],
    clean: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--config':
        options.configPath = argv[++index] ? resolve(process.cwd(), argv[index]) : null;
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
      case '--group':
        if (argv[index + 1]) {
          options.groups.push(argv[++index]);
        } else {
          throw new Error('--group requires a value');
        }
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

  return options;
}

function ensureDir(targetDir) {
  mkdirSync(targetDir, { recursive: true });
}

function resetDir(targetDir) {
  rmSync(targetDir, { recursive: true, force: true });
  ensureDir(targetDir);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function normalizeStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  const normalized = value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
  if (normalized.length !== value.length) {
    throw new Error(`${fieldName} contains an empty value`);
  }
  return normalized;
}

function uniquePackages(packages) {
  return [...new Set(packages.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Wheelhouse config must be a JSON object');
  }
  if (!Array.isArray(config.groups) || config.groups.length === 0) {
    throw new Error('Wheelhouse config requires a non-empty groups array');
  }
  const ids = new Set();
  for (const group of config.groups) {
    const id = String(group?.id ?? '').trim();
    if (!id) {
      throw new Error('Each wheelhouse group requires a non-empty id');
    }
    if (ids.has(id)) {
      throw new Error(`Duplicate wheelhouse group id: ${id}`);
    }
    ids.add(id);
    if (group.packages != null) {
      normalizeStringArray(group.packages, `groups.${id}.packages`);
    }
    if (group.downloadArgs != null) {
      normalizeStringArray(group.downloadArgs, `groups.${id}.downloadArgs`);
    }
    if (group.localProjects != null) {
      if (!Array.isArray(group.localProjects)) {
        throw new Error(`groups.${id}.localProjects must be an array`);
      }
      for (const project of group.localProjects) {
        const projectPath = String(project?.path ?? '').trim();
        if (!projectPath) {
          throw new Error(`groups.${id}.localProjects entries require a path`);
        }
        if (
          project.dependenciesFromPyproject != null &&
          typeof project.dependenciesFromPyproject !== 'boolean'
        ) {
          throw new Error(
            `groups.${id}.localProjects.${projectPath}.dependenciesFromPyproject must be a boolean`,
          );
        }
        if (project.wheelArgs != null) {
          normalizeStringArray(project.wheelArgs, `groups.${id}.localProjects.${projectPath}.wheelArgs`);
        }
      }
    }
  }
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

function run(command, args, options = {}) {
  const pretty = [command, ...args].join(' ');
  process.stdout.write(`[wheelhouse] ${pretty}\n`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${pretty}`);
  }
}

function listWheelFiles(targetDir) {
  if (!existsSync(targetDir)) {
    return [];
  }
  return readdirSync(targetDir)
    .filter((entry) => entry.toLowerCase().endsWith('.whl'))
    .sort((left, right) => left.localeCompare(right));
}

function resolvePythonTarget(config) {
  const target = config.pythonTarget ?? {};
  const platform = String(target.platform ?? 'win_amd64').trim();
  const pythonVersion = String(target.pythonVersion ?? '3.13').trim();
  const implementation = String(target.implementation ?? 'cp').trim();
  const abi = String(target.abi ?? `cp${pythonVersion.replace('.', '')}`).trim();

  if (!platform || !pythonVersion || !implementation || !abi) {
    throw new Error('pythonTarget requires platform, pythonVersion, implementation, and abi');
  }

  return { platform, pythonVersion, implementation, abi };
}

function toPosixRelative(fromDir, targetPath) {
  return relative(fromDir, targetPath).split('\\').join('/');
}

function sanitizeGroupSelection(configGroups, selectedIds) {
  if (selectedIds.length === 0) {
    return configGroups;
  }
  const wanted = new Set(selectedIds);
  const groups = configGroups.filter((group) => wanted.has(group.id));
  if (groups.length !== wanted.size) {
    const found = new Set(groups.map((group) => group.id));
    const missing = [...wanted].filter((id) => !found.has(id));
    throw new Error(`Unknown wheelhouse group(s): ${missing.join(', ')}`);
  }
  return groups;
}

function buildDownloadArgs(target, destinationDir, packages, extraArgs = []) {
  return [
    '-m',
    'pip',
    'download',
    '--dest',
    destinationDir,
    '--only-binary=:all:',
    '--platform',
    target.platform,
    '--python-version',
    target.pythonVersion,
    '--implementation',
    target.implementation,
    '--abi',
    target.abi,
    ...extraArgs,
    ...packages,
  ];
}

function buildWheelArgs(destinationDir, projectPath, extraArgs = []) {
  return ['-m', 'pip', 'wheel', '--wheel-dir', destinationDir, ...extraArgs, projectPath];
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.configPath) {
    throw new Error('--config is required');
  }

  const config = readJson(options.configPath);
  validateConfig(config);

  const outputDir = options.outputDir;
  const manifestPath = options.manifestPath ?? join(outputDir, 'python-wheelhouse-manifest.json');
  const manifestDir = dirname(manifestPath);
  const wheelhouseRoot = join(outputDir, 'wheelhouse');
  const configDir = dirname(options.configPath);
  const python = resolvePythonInvocation(options.python);
  const pythonTarget = resolvePythonTarget(config);
  const selectedGroups = sanitizeGroupSelection(config.groups, options.groups);

  if (options.clean) {
    resetDir(outputDir);
  } else {
    ensureDir(outputDir);
  }
  ensureDir(manifestDir);
  ensureDir(wheelhouseRoot);

  const manifestGroups = [];
  for (const group of selectedGroups) {
    const groupDir = join(wheelhouseRoot, group.id);
    resetDir(groupDir);

    const packages = group.packages ? normalizeStringArray(group.packages, `groups.${group.id}.packages`) : [];
    const downloadArgs = group.downloadArgs
      ? normalizeStringArray(group.downloadArgs, `groups.${group.id}.downloadArgs`)
      : [];
    const derivedPackages = [];
    const localProjects = [];
    for (const project of group.localProjects ?? []) {
      const projectPath = resolve(configDir, project.path);
      if (!existsSync(projectPath)) {
        throw new Error(`Local project not found for group ${group.id}: ${project.path}`);
      }
      const wheelArgs = project.wheelArgs
        ? normalizeStringArray(project.wheelArgs, `groups.${group.id}.localProjects.${project.path}.wheelArgs`)
        : [];
      if (project.dependenciesFromPyproject) {
        const pyprojectPath = join(projectPath, 'pyproject.toml');
        if (!existsSync(pyprojectPath)) {
          throw new Error(`pyproject.toml not found for group ${group.id}: ${project.path}`);
        }
        derivedPackages.push(...readPyprojectDependencies(pyprojectPath));
      }
      localProjects.push({
        path: project.path,
        projectPath,
        wheelArgs,
        dependenciesFromPyproject: Boolean(project.dependenciesFromPyproject),
      });
    }

    const allPackages = uniquePackages([...packages, ...derivedPackages]);
    if (allPackages.length > 0) {
      run(python.command, [...python.args, ...buildDownloadArgs(pythonTarget, groupDir, allPackages, downloadArgs)]);
    }

    const manifestLocalProjects = [];
    for (const project of localProjects) {
      run(python.command, [...python.args, ...buildWheelArgs(groupDir, project.projectPath, project.wheelArgs)]);
      manifestLocalProjects.push({
        path: toPosixRelative(repoRoot, project.projectPath),
        dependenciesFromPyproject: project.dependenciesFromPyproject,
        wheelArgs: project.wheelArgs,
      });
    }

    const wheelFiles = listWheelFiles(groupDir);
    if (wheelFiles.length === 0) {
      throw new Error(`Wheelhouse group ${group.id} produced no wheel files`);
    }

    manifestGroups.push({
      id: group.id,
      description: String(group.description ?? '').trim(),
      wheelSubdir: toPosixRelative(manifestDir, groupDir),
      wheelFiles,
      packages: allPackages,
      localProjects: manifestLocalProjects,
    });

    process.stdout.write(`[wheelhouse] group ${group.id}: ${wheelFiles.length} wheel(s) ready\n`);
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceConfig: toPosixRelative(repoRoot, options.configPath),
    pythonTarget,
    builderPython: python.label,
    groups: manifestGroups,
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`[wheelhouse] manifest written to ${manifestPath}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`[wheelhouse] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
