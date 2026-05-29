/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { realpath } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import Fastify from 'fastify';

let setPickDirectoryImpl;
let setOpenDirectoryImpl;
let setListWindowsDriveRootsImpl;
let setListWindowsHiddenSystemEntryNamesImpl;
let setOpenInDefaultAppImpl;
let setOpenDirectoryInFileManagerImpl;
let projectsRoutes;

// Load module once
const mod = await import('../dist/routes/projects.js');
setPickDirectoryImpl = mod.setPickDirectoryImpl;
setOpenDirectoryImpl = mod.setOpenDirectoryImpl;
setListWindowsDriveRootsImpl = mod.setListWindowsDriveRootsImpl;
setListWindowsHiddenSystemEntryNamesImpl = mod.setListWindowsHiddenSystemEntryNamesImpl;
setOpenInDefaultAppImpl = mod.setOpenInDefaultAppImpl;
setOpenDirectoryInFileManagerImpl = mod.setOpenDirectoryInFileManagerImpl;
projectsRoutes = mod.projectsRoutes;

// Restore real impl after each test
const realImpl = mod.execPickDirectory;
const realOpenImpl = mod.execOpenDirectory;
const realOpenInDefaultAppImpl = mod.openInDefaultApp;
const realOpenDirectoryInFileManagerImpl = mod.openDirectoryInFileManager;
afterEach(() => {
  setPickDirectoryImpl(realImpl);
  setOpenDirectoryImpl(realOpenImpl);
  setListWindowsDriveRootsImpl(() => mod.listWindowsDriveRoots());
  setListWindowsHiddenSystemEntryNamesImpl((dirPath) => mod.listWindowsHiddenSystemEntryNames(dirPath));
  setOpenInDefaultAppImpl(realOpenInDefaultAppImpl);
  setOpenDirectoryInFileManagerImpl(realOpenDirectoryInFileManagerImpl);
});

const AUTH_HEADERS = { 'x-office-claw-user': 'test-user' };

async function buildApp() {
  const app = Fastify();
  await app.register(projectsRoutes);
  await app.ready();
  return app;
}

describe('execPickDirectory()', () => {
  it('is exported as a function', () => {
    assert.equal(typeof mod.execPickDirectory, 'function');
  });
});

describe('getPickDirectoryCommand()', () => {
  it('uses osascript on macOS', () => {
    const command = mod.getPickDirectoryCommand('darwin');
    assert.ok(command);
    assert.equal(command.command, 'osascript');
    assert.equal(command.args[0], '-e');
    assert.match(command.args[1], /choose folder/);
    assert.match(command.args[1], /with prompt "选择文件夹"/);
  });

  it('uses default location in macOS picker when initialDirectory is provided', () => {
    const command = mod.getPickDirectoryCommand('darwin', {
      initialDirectory: '/Users/alice/workspace',
    });
    assert.ok(command);
    assert.equal(command.command, 'osascript');
    assert.equal(command.args[0], '-e');
    assert.match(command.args[1], /default location POSIX file "\/Users\/alice\/workspace"/);
  });

  it('ignores selectedName in macOS picker options', () => {
    const command = mod.getPickDirectoryCommand('darwin', {
      initialDirectory: '/Users/alice/workspace',
      selectedName: '__SELECTED_NAME__',
    });
    assert.ok(command);
    assert.doesNotMatch(command.args[1], /__SELECTED_NAME__/);
  });

  it('uses PowerShell explorer-style folder picker on Windows', () => {
    const command = mod.getPickDirectoryCommand('win32');
    assert.ok(command);
    assert.equal(command.command, 'powershell.exe');
    assert.ok(command.args.includes('-STA'));
    assert.match(command.args.at(-1), /FileOpenDialog/);
    assert.match(command.args.at(-1), /FOS_PICKFOLDERS/);
  });

  it('passes picker options to Windows picker via env', () => {
    const command = mod.getPickDirectoryCommand('win32', {
      initialDirectory: 'C:\\workspace',
      selectedName: 'demo',
    });
    assert.ok(command);
    assert.equal(command.env?.OFFICE_CLAW_PICK_DIRECTORY_INITIAL_DIRECTORY, 'C:\\workspace');
    assert.equal(command.env?.OFFICE_CLAW_PICK_DIRECTORY_SELECTED_NAME, 'demo');
  });

  it('returns null on unsupported platforms', () => {
    assert.equal(mod.getPickDirectoryCommand('linux'), null);
  });
});

describe('normalizePickedDirectoryPath()', () => {
  it('preserves Windows drive roots', () => {
    assert.equal(mod.normalizePickedDirectoryPath('C:\\'), 'C:\\');
    assert.equal(mod.normalizePickedDirectoryPath('D:/'), 'D:\\');
  });

  it('trims trailing separators from non-root directories', () => {
    assert.equal(mod.normalizePickedDirectoryPath('C:\\workspace\\office-claw\\'), 'C:\\workspace\\office-claw');
    assert.equal(mod.normalizePickedDirectoryPath('/tmp/demo/'), '/tmp/demo');
  });
});

describe('getOpenDirectoryCommand()', () => {
  it('uses platform file manager commands with argument arrays', () => {
    assert.deepEqual(mod.getOpenDirectoryCommand('win32', 'C:\\workspace'), {
      command: 'explorer.exe',
      args: ['C:\\workspace'],
    });
    assert.deepEqual(mod.getOpenDirectoryCommand('darwin', '/Users/alice/workspace'), {
      command: 'open',
      args: ['/Users/alice/workspace'],
    });
    assert.deepEqual(mod.getOpenDirectoryCommand('linux', '/home/alice/workspace'), {
      command: 'xdg-open',
      args: ['/home/alice/workspace'],
    });
  });
});

describe('resolveNativePickerOptions()', () => {
  it('navigates to parent and selects basename when selected path is provided', () => {
    const options = mod.resolveNativePickerOptions('C:\\workspace\\demo', undefined, 'win32');
    assert.deepEqual(options, {
      initialDirectory: 'C:\\workspace',
      selectedName: 'demo',
    });
  });

  it('only sets initial directory for default fallback path', () => {
    const options = mod.resolveNativePickerOptions(undefined, 'C:\\workspace', 'win32');
    assert.deepEqual(options, {
      initialDirectory: 'C:\\workspace',
    });
  });
});

describe('splitProjectCompletePrefix()', () => {
  it('treats a trailing backslash as a directory prefix on Windows', () => {
    const result = mod.splitProjectCompletePrefix('C:\\Users\\alice\\repo\\', 'C:\\Users\\alice', 'win32');
    assert.equal(result.parentDir, 'C:\\Users\\alice\\repo');
    assert.equal(result.fragment, '');
  });
});

describe('getProjectBrowseParent()', () => {
  it('returns the parent path for Windows browse results', () => {
    assert.equal(mod.getProjectBrowseParent('C:\\Users\\alice\\repo', 'win32'), 'C:\\Users\\alice');
    assert.equal(mod.getProjectBrowseParent('C:\\', 'win32'), null);
  });
});

describe('shouldHideProjectBrowseEntry()', () => {
  it('hides Windows hidden/system directories by attribute', () => {
    assert.equal(mod.shouldHideProjectBrowseEntry('ProgramData', 'win32', { isHidden: true }), true);
    assert.equal(mod.shouldHideProjectBrowseEntry('Recovery', 'win32', { isSystem: true }), true);
  });

  it('still allows normal Windows directories', () => {
    assert.equal(mod.shouldHideProjectBrowseEntry('workspace', 'win32'), false);
  });
});

describe('parseWindowsDirectoryAttributesPayload()', () => {
  it('normalizes a single PowerShell JSON object into records', () => {
    assert.deepEqual(mod.parseWindowsDirectoryAttributesPayload('{"name":"ProgramData","attributes":["Hidden"]}'), [
      { name: 'ProgramData', attributes: ['Hidden'] },
    ]);
  });
});

describe('POST /api/projects/pick-directory', () => {
  it('returns 401 when only a spoofed userId query param is provided', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/projects/pick-directory?userId=spoofed' });
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Identity required'));
  });

  it('returns 204 when user cancels', async () => {
    setPickDirectoryImpl(async () => ({ status: 'cancelled' }));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/projects/pick-directory', headers: AUTH_HEADERS });
    assert.equal(res.statusCode, 204);
  });

  it('passes validated initialPath to picker implementation when provided', async () => {
    const home = homedir();
    let receivedOptions;
    setPickDirectoryImpl(async (options) => {
      receivedOptions = options;
      return { status: 'cancelled' };
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/pick-directory',
      headers: AUTH_HEADERS,
      payload: { initialPath: home },
    });
    assert.equal(res.statusCode, 204);
    assert.equal(receivedOptions.selectedName, home.split(/[\\/]/).filter(Boolean).at(-1));
    assert.ok(typeof receivedOptions.initialDirectory === 'string' && receivedOptions.initialDirectory.length > 0);
    assert.notEqual(receivedOptions.initialDirectory, home);
    assert.ok(receivedOptions.signal instanceof AbortSignal);
  });

  it('passes validated initialDirectory to picker implementation when provided', async () => {
    const home = homedir();
    let receivedOptions;
    setPickDirectoryImpl(async (options) => {
      receivedOptions = options;
      return { status: 'cancelled' };
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/pick-directory',
      headers: AUTH_HEADERS,
      payload: { initialDirectory: home },
    });
    assert.equal(res.statusCode, 204);
    assert.equal(receivedOptions.initialDirectory, home);
    assert.equal(receivedOptions.selectedName, undefined);
    assert.ok(receivedOptions.signal instanceof AbortSignal);
  });

  it('ignores invalid initialPath and still opens picker', async () => {
    let receivedOptions = { sentinel: true };
    setPickDirectoryImpl(async (options) => {
      receivedOptions = options;
      return { status: 'cancelled' };
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/pick-directory',
      headers: AUTH_HEADERS,
      payload: { initialPath: '/nonexistent/evil/path' },
    });
    assert.equal(res.statusCode, 204);
    assert.equal(receivedOptions.selectedName, undefined);
    assert.equal(receivedOptions.initialDirectory, undefined);
    assert.ok(receivedOptions.signal instanceof AbortSignal);
  });

  it('returns 500 on system error', async () => {
    setPickDirectoryImpl(async () => ({ status: 'error', message: 'osascript not found' }));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/projects/pick-directory', headers: AUTH_HEADERS });
    assert.equal(res.statusCode, 500);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'osascript not found');
  });

  it('returns path and name when user picks valid directory', async () => {
    const home = homedir();
    setPickDirectoryImpl(async () => ({ status: 'picked', path: home }));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/projects/pick-directory', headers: AUTH_HEADERS });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.path, home);
    assert.equal(typeof body.name, 'string');
  });

  it('returns 403 for path outside allowed roots', async () => {
    setPickDirectoryImpl(async () => ({ status: 'picked', path: '/nonexistent/evil/path' }));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/projects/pick-directory', headers: AUTH_HEADERS });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.ok(body.error);
  });

  it('GET returns 404 (only POST registered)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/projects/pick-directory' });
    assert.equal(res.statusCode, 404);
  });
});

describe('POST /api/projects/open-directory', () => {
  it('returns 401 when only a spoofed userId query param is provided', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/projects/open-directory?userId=spoofed' });
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Identity required'));
  });

  it('returns 400 when path is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/open-directory',
      headers: AUTH_HEADERS,
      payload: {},
    });
    assert.equal(res.statusCode, 400);
  });

  it('returns 403 for invalid paths', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/open-directory',
      headers: AUTH_HEADERS,
      payload: { path: '/nonexistent/evil/path' },
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error, '目录不存在');
  });

  it('returns a restricted-path reason when the target resolves under denied roots', async () => {
    if (process.platform === 'win32') return;
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/open-directory',
      headers: AUTH_HEADERS,
      payload: { path: '/dev' },
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.equal(body.error, '目录位于受限系统路径下');
  });

  it('opens a valid directory through the swappable implementation', async () => {
    const home = homedir();
    let receivedPath;
    setOpenDirectoryImpl(async (path) => {
      receivedPath = path;
      return { status: 'opened' };
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/open-directory',
      headers: AUTH_HEADERS,
      payload: { path: home },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { success: true });
    assert.equal(receivedPath, await realpath(home));
  });

  it('returns 500 when the system open implementation fails', async () => {
    setOpenDirectoryImpl(async () => ({ status: 'error', message: 'xdg-open missing' }));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/open-directory',
      headers: AUTH_HEADERS,
      payload: { path: homedir() },
    });

    assert.equal(res.statusCode, 500);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'xdg-open missing');
  });
});

describe('GET /api/projects/browse (F113 cross-platform)', () => {
  it('returns 401 when only a spoofed userId query param is provided', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/projects/browse?userId=spoofed' });
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Identity required'));
  });

  it('returns home directory listing by default', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/projects/browse', headers: AUTH_HEADERS });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.current, homedir());
    assert.equal(typeof body.name, 'string');
    assert.ok(Array.isArray(body.entries));
    // Home directory should have subdirectories
    assert.ok(body.entries.length > 0);
    // All entries should be directories
    for (const entry of body.entries) {
      assert.equal(entry.isDirectory, true);
      assert.equal(typeof entry.name, 'string');
      assert.equal(typeof entry.path, 'string');
    }
  });

  it('returns parent path for navigation', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/browse?path=${encodeURIComponent(homedir())}`,
      headers: AUTH_HEADERS,
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    // Home should have a parent (e.g., /Users on macOS, /home on Linux)
    // parent can be null if at root of allowed roots, which is also valid
    assert.ok(body.parent === null || typeof body.parent === 'string');
  });

  it('returns 403 for path outside allowed roots', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects/browse?path=/nonexistent/evil',
      headers: AUTH_HEADERS,
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.ok(body.error);
  });

  it('filters out hidden directories and node_modules', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/browse?path=${encodeURIComponent(homedir())}`,
      headers: AUTH_HEADERS,
    });
    const body = JSON.parse(res.body);
    for (const entry of body.entries) {
      assert.ok(!entry.name.startsWith('.'), `should hide: ${entry.name}`);
      assert.notEqual(entry.name, 'node_modules');
    }
  });

  it('filters Windows hidden/system directories returned by attribute scan', async () => {
    setListWindowsHiddenSystemEntryNamesImpl(async () => new Set(['$RECYCLE.BIN', 'ProgramData']));
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/browse?path=${encodeURIComponent(homedir())}`,
      headers: AUTH_HEADERS,
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    for (const entry of body.entries) {
      assert.notEqual(entry.name, '$RECYCLE.BIN');
      assert.notEqual(entry.name, 'ProgramData');
    }
  });

  it('includes Windows drive roots when the drive provider returns them', async () => {
    setListWindowsDriveRootsImpl(async () => [
      { name: 'C:', path: 'C:\\', isDirectory: true },
      { name: 'D:', path: 'D:\\', isDirectory: true },
    ]);

    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/browse?path=${encodeURIComponent(homedir())}`,
      headers: AUTH_HEADERS,
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.drives, [
      { name: 'C:', path: 'C:\\', isDirectory: true },
      { name: 'D:', path: 'D:\\', isDirectory: true },
    ]);
  });
});

describe('local open APIs under /api/projects', () => {
  it('POST /api/projects/local-file-meta returns metadata for supported file', async () => {
    const testDir = mkdtempSync(join(tmpdir(), 'cat-cafe-local-meta-'));
    const filePath = join(testDir, 'demo.md');
    writeFileSync(filePath, '# demo');
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/local-file-meta',
        headers: AUTH_HEADERS,
        payload: { path: filePath },
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.path, await realpath(filePath));
      assert.equal(body.fileName, 'demo.md');
      assert.equal(typeof body.generatedAt, 'number');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('POST /api/projects/local-file-meta rejects unsupported extension', async () => {
    const testDir = mkdtempSync(join(tmpdir(), 'cat-cafe-local-meta-'));
    const filePath = join(testDir, 'demo.exe');
    writeFileSync(filePath, 'binary');
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/local-file-meta',
        headers: AUTH_HEADERS,
        payload: { path: filePath },
      });
      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.match(body.error, /supported/);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('POST /api/projects/open-local calls injected open impl', async () => {
    const testDir = mkdtempSync(join(tmpdir(), 'cat-cafe-open-local-'));
    const filePath = join(testDir, 'deck.pptx');
    writeFileSync(filePath, 'ppt');
    let openedPath = null;
    setOpenInDefaultAppImpl(async (targetPath) => {
      openedPath = targetPath;
    });
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/open-local',
        headers: AUTH_HEADERS,
        payload: { path: filePath },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(openedPath, await realpath(filePath));
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('POST /api/projects/open-local-folder calls injected folder open impl', async () => {
    const testDir = mkdtempSync(join(tmpdir(), 'cat-cafe-open-folder-'));
    const nestedDir = join(testDir, 'output');
    mkdirSync(nestedDir);
    let openedPath = null;
    setOpenDirectoryInFileManagerImpl(async (targetPath) => {
      openedPath = targetPath;
    });
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/open-local-folder',
        headers: AUTH_HEADERS,
        payload: { path: nestedDir },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(openedPath, await realpath(nestedDir));
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('POST /api/projects/read-local-text returns markdown body', async () => {
    const testDir = mkdtempSync(join(tmpdir(), 'cat-cafe-read-md-'));
    const filePath = join(testDir, 'note.md');
    writeFileSync(filePath, '# Hello\n');
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/read-local-text',
        headers: AUTH_HEADERS,
        payload: { path: filePath },
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.fileName, 'note.md');
      assert.equal(body.path, await realpath(filePath));
      assert.equal(body.content, '# Hello\n');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('POST /api/projects/read-local-text returns html body', async () => {
    const testDir = mkdtempSync(join(tmpdir(), 'cat-cafe-read-html-'));
    const filePath = join(testDir, 'page.html');
    writeFileSync(filePath, '<p>hi</p>\n');
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/read-local-text',
        headers: AUTH_HEADERS,
        payload: { path: filePath },
      });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.fileName, 'page.html');
      assert.equal(body.content, '<p>hi</p>\n');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('POST /api/projects/read-local-text rejects non-utf8-preview extension (e.g. docx)', async () => {
    const testDir = mkdtempSync(join(tmpdir(), 'cat-cafe-read-bin-'));
    const filePath = join(testDir, 'notes.docx');
    writeFileSync(filePath, 'PK\x03\x04fake');
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/read-local-text',
        headers: AUTH_HEADERS,
        payload: { path: filePath },
      });
      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.body);
      assert.match(body.error, /UTF-8 text|Word|Excel|open-local/i);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('POST /api/projects/read-local-text rejects oversized files', async () => {
    const testDir = mkdtempSync(join(tmpdir(), 'cat-cafe-read-big-'));
    const filePath = join(testDir, 'big.md');
    writeFileSync(filePath, Buffer.alloc(1024 * 1024 + 1, 97));
    const app = await buildApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/read-local-text',
        headers: AUTH_HEADERS,
        payload: { path: filePath },
      });
      assert.equal(res.statusCode, 413);
      const body = JSON.parse(res.body);
      assert.match(body.error, /large/i);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
