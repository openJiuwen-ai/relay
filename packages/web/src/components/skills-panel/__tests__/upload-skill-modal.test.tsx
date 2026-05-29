/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { notifySkillOptionsChanged } from '@/utils/skill-options-cache';
import {
  SKILL_UPLOAD_LIMITS,
  UploadSkillModal,
  parseSkillMetadata,
  validateSkillName,
  validateSkillUpload,
  validateSkillUploadFiles,
} from '@/components/skills-panel/components/UploadSkillModal';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));
vi.mock('@/utils/skill-options-cache', () => ({
  notifySkillOptionsChanged: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);
const mockNotifySkillOptionsChanged = vi.mocked(notifySkillOptionsChanged);

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  mockApiFetch.mockReset();
  mockNotifySkillOptionsChanged.mockReset();
  useToastStore.setState({ toasts: [] });
});

function renderModal(props: Partial<React.ComponentProps<typeof UploadSkillModal>> = {}) {
  const defaults: React.ComponentProps<typeof UploadSkillModal> = {
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  act(() => {
    root.render(React.createElement(UploadSkillModal, merged));
  });
  return merged;
}

async function flushEffects() {
  for (let index = 0; index < 4; index += 1) {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function selectUploadFiles(
  input: HTMLInputElement,
  files: File[],
  value = 'C:\\fakepath\\upload',
) {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files,
  });
  Object.defineProperty(input, 'value', {
    configurable: true,
    writable: true,
    value,
  });

  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flushEffects();
}

async function createZipFile(
  entries: Record<string, string | Uint8Array>,
  fileName = 'skill.zip',
): Promise<File> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content);
  }

  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([bytes.buffer as ArrayBuffer], fileName, { type: 'application/zip' });
}

describe('UploadSkillModal', () => {
  it('hides parsed result section before selecting any files', () => {
    renderModal();

    expect(container.textContent).not.toContain('暂未选择文件');
    expect(container.textContent).not.toContain('解析结果');
  });

  it('validates upload file count before submit', () => {
    const files = Array.from({ length: SKILL_UPLOAD_LIMITS.maxFiles + 1 }, (_, index) => ({
      path: `${index}.txt`,
      content: 'Zg==',
      size: 1,
    }));

    expect(validateSkillUploadFiles(files)).toContain(String(SKILL_UPLOAD_LIMITS.maxFiles));
  });

  it('validates upload total size before submit', () => {
    const chunk = 900 * 1024;
    const files = [
      { path: 'a.txt', content: 'Zg==', size: chunk },
      { path: 'b.txt', content: 'Zg==', size: chunk },
      { path: 'c.txt', content: 'Zg==', size: chunk },
      { path: 'd.txt', content: 'Zg==', size: chunk },
      { path: 'e.txt', content: 'Zg==', size: chunk },
    ];

    expect(validateSkillUploadFiles(files)).toContain('总大小');
  });

  it('prioritizes single file size before file count', () => {
    const files = Array.from({ length: SKILL_UPLOAD_LIMITS.maxFiles + 1 }, (_, index) => ({
      path: index === 0 ? 'too-large.txt' : `file-${index}.txt`,
      content: 'Zg==',
      size: index === 0 ? SKILL_UPLOAD_LIMITS.maxFileBytes + 1 : 1,
    }));

    expect(validateSkillUploadFiles(files)).toBe('文件 too-large.txt 单个文件大小不能超过1MB');
  });

  it('prioritizes total size before missing skill manifest', () => {
    const files = [
      { path: 'a.txt', content: 'Zg==', size: 1024 * 1024 },
      { path: 'b.txt', content: 'Zg==', size: 1024 * 1024 },
      { path: 'c.txt', content: 'Zg==', size: 1024 * 1024 },
      { path: 'd.txt', content: 'Zg==', size: 1024 * 1024 },
      { path: 'e.txt', content: 'Zg==', size: 1 },
    ];

    expect(validateSkillUploadFiles(files)).toContain('总大小');
  });

  it('requires SKILL.md after other upload rules pass', () => {
    const files = [{ path: 'README.md', content: 'Zg==', size: 1 }];

    expect(validateSkillUploadFiles(files)).toBe('上传内容根目录必须包含名为 SKILL.md 的文件');
  });

  it('requires SKILL.md to be placed at the upload root', () => {
    const files = [{ path: 'demo/docs/SKILL.md', content: 'Zg==', size: 1 }];

    expect(validateSkillUploadFiles(files)).toBe('上传内容根目录必须包含名为 SKILL.md 的文件');
  });

  it('keeps submit validation for missing name', () => {
    const files = [{ path: 'SKILL.md', content: 'Zg==', size: 1 }];

    expect(validateSkillUpload('', files)).toBe('请输入技能名称');
  });

  it('allows English names with hyphen and rejects unsupported characters', () => {
    expect(validateSkillName('Alpha-Beta')).toBeNull();
    expect(validateSkillName('Alpha-2026')).toBeNull();
    expect(validateSkillName(`skill-${'a'.repeat(95)}`)).toBe('技能名称不能超过 100 个字符');
    expect(validateSkillName('中文-Alpha')).toBe('技能名称仅支持英文、数字和中划线');
    expect(validateSkillName('Alpha_beta')).toBe('技能名称仅支持英文、数字和中划线');
  });

  it('parses skill metadata only from frontmatter fields', () => {
    expect(
      parseSkillMetadata(`---
name: demo-skill
description: >
  first line
  second line
---

# Demo Skill

Fallback description`),
    ).toEqual({
      name: 'demo-skill',
      description: 'first line second line',
    });

    expect(parseSkillMetadata('# Demo Skill\n\nThis is the description.')).toEqual({
      name: '',
      description: '',
    });
  });

  it('renders as a modal dialog', () => {
    renderModal();
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
  });

  it('caps the editable skill name input at 100 characters', async () => {
    const file = new File(['---\nname: demo-skill\n---\n'], 'SKILL.md', { type: 'text/markdown' });
    renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [file],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
      await flushEffects();
    });

    const editButton = container.querySelector('button[aria-label="edit-skill-name"]') as HTMLButtonElement | null;
    expect(editButton).toBeTruthy();

    act(() => {
      editButton?.click();
    });

    const nameInput = container.querySelector('input[placeholder="请输入技能名称"]') as HTMLInputElement | null;
    expect(nameInput).toBeTruthy();
    expect(nameInput?.maxLength).toBe(100);
  });

  it('does not close when clicking overlay', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    const overlay = container.querySelector('[data-testid="upload-skill-overlay"]') as HTMLDivElement | null;
    expect(overlay).toBeTruthy();

    act(() => {
      overlay?.click();
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('still closes from cancel action', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    const cancelButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('取消'),
    ) as HTMLButtonElement | undefined;
    expect(cancelButton).toBeTruthy();

    act(() => {
      cancelButton?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses shared footer button classes', () => {
    renderModal();

    const buttons = Array.from(container.querySelectorAll('button'));
    const cancelButton = buttons.find((button) => button.textContent?.includes('取消')) as HTMLButtonElement | undefined;
    const confirmButton = buttons.find((button) => button.textContent?.includes('导入')) as HTMLButtonElement | undefined;

    expect(cancelButton?.className).toContain('uiButtonDefault');
    expect(cancelButton?.className).not.toContain('uiButtonSecondary');
    expect(confirmButton?.className).toContain('uiButtonMajor');
  });

  it('shows a disabled hint before any files are selected', () => {
    renderModal();

    const confirmButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('导入'),
    ) as HTMLButtonElement | undefined;
    const submitTrigger = container.querySelector('[data-testid="upload-skill-submit-trigger"]') as HTMLSpanElement | null;

    expect(confirmButton?.disabled).toBe(true);
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();

    act(() => {
      submitTrigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain('请选择文件或文件夹后再导入');
  });

  it('routes upload API errors through the global toast store', async () => {
    mockApiFetch.mockResolvedValue({
      status: 409,
      json: async () => ({ success: false, error: '技能已存在' }),
    } as Response);

    renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const skillFile = new File(
      [
        `---
name: demo-skill
---

# Demo Skill`,
      ],
      'SKILL.md',
      { type: 'text/markdown' },
    );
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [skillFile],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    const buttons = Array.from(container.querySelectorAll('button'));
    const confirmButton = buttons.find((button) => button.textContent?.includes('导入')) as HTMLButtonElement | undefined;
    expect(confirmButton?.disabled).toBe(false);

    await act(async () => {
      confirmButton?.click();
    });
    await flushEffects();

    const latestToast = useToastStore.getState().toasts.at(-1);
    expect(latestToast?.type).toBe('error');
    expect(latestToast?.title).toBe('上传失败');
    expect(latestToast?.message).toBe('技能已存在');
    expect(container.textContent).not.toContain('技能已存在');
  });

  it('notifies skill option listeners after upload succeeds', async () => {
    mockApiFetch.mockResolvedValue({
      status: 200,
      json: async () => ({ success: true }),
    } as Response);

    const onClose = vi.fn();
    const onSuccess = vi.fn();
    renderModal({ onClose, onSuccess });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const skillFile = new File(
      [
        `---
name: uploaded-skill
---

# Uploaded Skill`,
      ],
      'SKILL.md',
      { type: 'text/markdown' },
    );
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [skillFile],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    const confirmButton = container.querySelector('button.ui-button-primary') as HTMLButtonElement | null;
    expect(confirmButton?.disabled).toBe(false);

    await act(async () => {
      confirmButton?.click();
    });
    await flushEffects();

    expect(mockNotifySkillOptionsChanged).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from header close icon', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    const closeButton = container.querySelector('button[aria-label="close"]') as HTMLButtonElement | null;
    expect(closeButton).toBeTruthy();

    act(() => {
      closeButton?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows parsed skill fields and allows entering name edit mode', async () => {
    renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const skillFile = new File(
      [
        `---
name: uploaded-skill
description: A parsed skill description.
---

# Uploaded Skill`,
      ],
      'SKILL.md',
      { type: 'text/markdown' },
    );

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [skillFile],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    expect(container.textContent).toContain('解析结果');
    expect(container.textContent).not.toContain('文件列表');
    expect(container.textContent).toContain('uploaded-skill');
    expect(container.textContent).toContain('A parsed skill description.');

    const parsedName = container.querySelector('[data-testid="parsed-skill-name-text"]') as HTMLSpanElement | null;
    expect(parsedName?.className).toContain('truncate');
    expect(parsedName?.className).toContain('whitespace-nowrap');
    expect(parsedName?.className).toContain('max-w-[280px]');

    const parsedDescription = container.querySelector('[data-testid="parsed-skill-description-text"]') as HTMLSpanElement | null;
    expect(parsedDescription?.className).toContain('break-words');

    const editButton = container.querySelector('button[aria-label="edit-skill-name"]') as HTMLButtonElement | null;
    expect(editButton).toBeTruthy();

    await act(async () => {
      editButton?.click();
    });
    await flushEffects();

    const nameInput = container.querySelector('input[placeholder="请输入技能名称"]') as HTMLInputElement | null;
    expect(nameInput?.value).toBe('uploaded-skill');
  });

  it('allows re-selecting the same SKILL.md file after removing it', async () => {
    renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const skillFile = new File(
      [
        `---
name: uploaded-skill
---

# Uploaded Skill`,
      ],
      'SKILL.md',
      { type: 'text/markdown' },
    );

    await selectUploadFiles(fileInput as HTMLInputElement, [skillFile], 'C:\\fakepath\\SKILL.md');
    expect(container.textContent).toContain('SKILL.md');
    expect(fileInput?.value).toBe('');

    const removeButton = container.querySelector('[data-testid="upload-skill-file-delete-button"]') as HTMLButtonElement | null;
    expect(removeButton).toBeTruthy();

    await act(async () => {
      removeButton?.click();
    });
    await flushEffects();

    expect(container.textContent).not.toContain('暂未选择文件');

    await selectUploadFiles(fileInput as HTMLInputElement, [skillFile], 'C:\\fakepath\\SKILL.md');
    expect(container.textContent).toContain('SKILL.md');
  });

  it('allows re-selecting the same folder after removing its uploaded files', async () => {
    renderModal();

    const fileInputs = Array.from(container.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
    const folderInput = fileInputs[1] ?? null;
    expect(folderInput).toBeTruthy();

    const skillFile = new File(['---\nname: folder-skill\n---\n'], 'SKILL.md', { type: 'text/markdown' });
    Object.defineProperty(skillFile, 'webkitRelativePath', {
      configurable: true,
      value: 'folder-skill/SKILL.md',
    });

    await selectUploadFiles(folderInput as HTMLInputElement, [skillFile], 'C:\\fakepath\\folder-skill');
    expect(container.textContent).toContain('folder-skill/SKILL.md');
    expect(folderInput?.value).toBe('');

    const removeButton = container.querySelector('[data-testid="upload-skill-file-delete-button"]') as HTMLButtonElement | null;
    expect(removeButton).toBeTruthy();

    await act(async () => {
      removeButton?.click();
    });
    await flushEffects();

    expect(container.textContent).not.toContain('暂未选择文件');

    await selectUploadFiles(folderInput as HTMLInputElement, [skillFile], 'C:\\fakepath\\folder-skill');
    expect(container.textContent).toContain('folder-skill/SKILL.md');
  });

  it('shows missing SKILL.md at the bottom and hides the edit action', async () => {
    renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const readmeFile = new File(['# README'], 'README.md', { type: 'text/markdown' });
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [readmeFile],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    expect(container.textContent).toContain('上传内容根目录必须包含名为 SKILL.md 的文件');
    expect(container.querySelector('[data-testid="parsed-skill-error"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="parsed-skill-name-text"]')).toBeNull();
    expect(container.querySelector('[data-testid="parsed-skill-description-text"]')).toBeNull();
    expect(container.querySelector('button[aria-label="edit-skill-name"]')).toBeNull();
    const confirmButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('导入'),
    ) as HTMLButtonElement | undefined;
    const submitTrigger = container.querySelector('[data-testid="upload-skill-submit-trigger"]') as HTMLSpanElement | null;
    expect(confirmButton?.disabled).toBe(true);
    act(() => {
      submitTrigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain('上传内容根目录必须包含名为 SKILL.md 的文件');
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('shows a global toast when SKILL.md frontmatter misses the name field', async () => {
    renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const skillFile = new File(
      [
        `---
description: Missing skill name.
---

# Uploaded Skill`,
      ],
      'SKILL.md',
      { type: 'text/markdown' },
    );

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [skillFile],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    const latestToast = useToastStore.getState().toasts.at(-1);
    const confirmButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('导入'),
    ) as HTMLButtonElement | undefined;
    const submitTrigger = container.querySelector('[data-testid="upload-skill-submit-trigger"]') as HTMLSpanElement | null;

    expect(latestToast?.type).toBe('error');
    expect(latestToast?.title).toBe('上传失败');
    expect(latestToast?.message).toBe('技能文件不合法：SKILL.md 头部缺少 name 字段');
    expect(confirmButton?.disabled).toBe(true);
    expect(container.querySelector('[data-testid="parsed-skill-error"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="parsed-skill-name-text"]')).toBeNull();
    expect(container.querySelector('[data-testid="parsed-skill-description-text"]')).toBeNull();
    expect(container.querySelector('button[aria-label="edit-skill-name"]')).toBeNull();

    act(() => {
      submitTrigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain('技能文件不合法：SKILL.md 头部缺少 name 字段');
  });

  it('collapses and expands the file list without using a fixed height scroller', async () => {
    renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const files = [
      new File(['one'], 'one.txt'),
      new File(['two'], 'two.txt'),
      new File(['three'], 'three.txt'),
      new File(['four'], 'four.txt'),
    ];

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: files,
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    expect(container.textContent).toContain('one.txt');
    expect(container.textContent).toContain('two.txt');
    expect(container.textContent).toContain('three.txt');
    expect(container.textContent).not.toContain('four.txt');

    const toggle = container.querySelector('[data-testid="file-list-toggle"]') as HTMLButtonElement | null;
    expect(toggle?.textContent).toContain('展开全部');

    await act(async () => {
      toggle?.click();
    });
    await flushEffects();

    expect(container.textContent).toContain('four.txt');

    const expandedToggle = container.querySelector('[data-testid="file-list-toggle"]') as HTMLButtonElement | null;
    expect(expandedToggle?.textContent).toBe('收起');
  });

  it('shows a toast when zip files are not uploaded alone', async () => {
    renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const zipFile = await createZipFile({ 'demo-skill/SKILL.md': '# Demo Skill' });
    const textFile = new File(['demo'], 'README.md', { type: 'text/markdown' });

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [zipFile, textFile],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    const latestToast = useToastStore.getState().toasts.at(-1);
    expect(latestToast?.type).toBe('error');
    expect(latestToast?.message).toBe('ZIP 文件只能单个上传');
  });

  it('extracts a single zip upload and parses the root SKILL.md', async () => {
    renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const zipFile = await createZipFile({
      'demo-skill/SKILL.md': `---
name: zipped-skill
description: From zip package.
---

# Zipped Skill`,
      'demo-skill/docs/guide.md': '# Guide',
    });

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [zipFile],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    expect(container.textContent).toContain('zipped-skill');
    expect(container.textContent).toContain('From zip package.');
    expect(container.textContent).toContain('demo-skill/SKILL.md');

    const fileName = Array.from(container.querySelectorAll('span')).find((element) =>
      element.textContent?.includes('demo-skill/SKILL.md'),
    ) as HTMLSpanElement | undefined;
    expect(fileName?.parentElement?.className).toContain('gap-1');
  });

  it('renders file icons with zip-specific and fallback document variants', async () => {
    renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const zipFile = await createZipFile({
      'demo-skill/SKILL.md': '# Demo Skill',
      'demo-skill/docs/bundle.zip': 'zip payload',
      'demo-skill/src/index.ts': 'export {}',
    });

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [zipFile],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    const icons = Array.from(container.querySelectorAll('[data-testid="upload-skill-file-icon"]')) as HTMLImageElement[];
    expect(icons).toHaveLength(3);
    const iconSources = icons.map((icon) => icon.getAttribute('src'));
    expect(iconSources).toContain('/icons/file-zip.svg');
    expect(iconSources).toContain('/icons/file-html.svg');

    const firstFileRow = icons[0]?.parentElement as HTMLDivElement | null;
    expect(firstFileRow?.className).toContain('gap-1');
    expect(icons[0]?.className).toContain('h-4');
    expect(icons[0]?.className).toContain('w-4');
  });

  it('shows file row hover background and common delete icon styles', async () => {
    renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const zipFile = await createZipFile({
      'demo-skill/SKILL.md': '# Demo Skill',
      'demo-skill/docs/readme.md': '# Readme',
    });

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [zipFile],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    const fileRows = Array.from(container.querySelectorAll('[data-testid="upload-skill-file-row"]')) as HTMLDivElement[];
    expect(fileRows.length).toBeGreaterThan(0);
    expect(fileRows[0]?.className).toContain('hover:bg-[var(--modal-muted-surface-hover)]');

    const deleteButtons = Array.from(
      container.querySelectorAll('[data-testid="upload-skill-file-delete-button"]'),
    ) as HTMLButtonElement[];
    expect(deleteButtons.length).toBeGreaterThan(0);
    expect(deleteButtons[0]?.className).toContain('hover:text-[var(--modal-accent-text)]');

    const deleteIcons = Array.from(
      container.querySelectorAll('[data-testid="upload-skill-file-delete-icon"]'),
    ) as HTMLSpanElement[];
    expect(deleteIcons).toHaveLength(deleteButtons.length);
  });

  it('shows inline error when zip root directory misses SKILL.md', async () => {
    renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const zipFile = await createZipFile({
      'demo-skill/docs/SKILL.md': '# Nested Skill',
      'demo-skill/docs/guide.md': '# Guide',
    });

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [zipFile],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    expect(container.textContent).toContain('ZIP 压缩包根目录必须包含名为 SKILL.md 的文件');
    expect(container.querySelector('[data-testid="parsed-skill-error"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="parsed-skill-name-text"]')).toBeNull();
    expect(container.querySelector('[data-testid="parsed-skill-description-text"]')).toBeNull();
    expect(container.querySelector('button[aria-label="edit-skill-name"]')).toBeNull();
  });

  it('routes file size validation through the global toast store', async () => {
    renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const oversizedFile = new File([new Uint8Array(SKILL_UPLOAD_LIMITS.maxFileBytes + 1)], 'oversized.txt');
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [oversizedFile],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    const latestToast = useToastStore.getState().toasts.at(-1);
    const confirmButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('导入'),
    ) as HTMLButtonElement | undefined;
    const submitTrigger = container.querySelector('[data-testid="upload-skill-submit-trigger"]') as HTMLSpanElement | null;
    expect(latestToast?.type).toBe('error');
    expect(latestToast?.title).toBe('上传失败');
    expect(latestToast?.message).toBe('文件 oversized.txt 单个文件大小不能超过1MB');
    expect(container.querySelector('[data-testid="parsed-skill-error"]')).toBeTruthy();
    expect(confirmButton?.disabled).toBe(true);
    act(() => {
      submitTrigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain('文件 oversized.txt 单个文件大小不能超过1MB');
  });

  it('disables submit and shows a hint for invalid edited skill names', async () => {
    renderModal();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const skillFile = new File(
      [
        `---
name: uploaded-skill
description: editable skill.
---

# Uploaded Skill`,
      ],
      'SKILL.md',
      { type: 'text/markdown' },
    );

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [skillFile],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushEffects();

    const editButton = container.querySelector('button[aria-label="edit-skill-name"]') as HTMLButtonElement | null;
    expect(editButton).toBeTruthy();

    await act(async () => {
      editButton?.click();
    });
    await flushEffects();

    const nameInput = container.querySelector('input[placeholder="请输入技能名称"]') as HTMLInputElement | null;
    expect(nameInput).toBeTruthy();

    await act(async () => {
      if (nameInput) {
        setInputValue(nameInput, 'Uploaded Skill');
      }
    });
    await flushEffects();

    const nameError = container.querySelector('[data-testid="upload-skill-name-error"]') as HTMLParagraphElement | null;
    const confirmButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('导入'),
    ) as HTMLButtonElement | undefined;
    const submitTrigger = container.querySelector('[data-testid="upload-skill-submit-trigger"]') as HTMLSpanElement | null;

    expect(nameInput?.getAttribute('aria-invalid')).toBe('true');
    expect(nameInput?.style.borderColor).toBe('rgb(242, 48, 48)');
    expect(nameInput?.style.backgroundColor).toBe('rgb(252, 227, 225)');
    expect(nameError?.textContent).toBe('技能名称仅支持英文、数字和中划线');
    expect(confirmButton).toBeDefined();
    expect(confirmButton?.disabled).toBe(true);

    await act(async () => {
      nameInput?.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    });
    await flushEffects();

    expect(container.querySelector('input[placeholder="请输入技能名称"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="upload-skill-name-error"]')?.textContent).toBe('技能名称仅支持英文、数字和中划线');

    act(() => {
      submitTrigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain('技能名称仅支持英文、数字和中划线');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
