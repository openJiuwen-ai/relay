/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { notifySkillOptionsChanged } from '@/utils/skill-options-cache';
import { Button } from '../../shared/Button';
import { IconButton } from '../../shared/IconButton';
import { MaskIcon } from '@/components/shared/MaskIcon';
import { Alert } from '../../shared/Alert';
import { OverflowTooltip } from '../../shared/OverflowTooltip';

interface UploadFile {
  path: string;
  content: string; // base64
  size: number;
}

interface UploadSkillModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedSkillMetadata {
  name: string;
  description: string;
}

interface UploadStateOptions {
  inlineError?: string | null;
  parsedSkill?: ParsedSkillMetadata;
}

type UploadValidationIssueKind = 'empty' | 'fileTooLarge' | 'tooManyFiles' | 'totalTooLarge' | 'missingSkill';

interface UploadValidationIssue {
  kind: UploadValidationIssueKind;
  message: string;
}

export const SKILL_UPLOAD_LIMITS = {
  maxFiles: 100,
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 4 * 1024 * 1024,
} as const;

const SKILL_NAME_ALLOWED_RE = /^[A-Za-z0-9-]+$/;
const SKILL_NAME_MAX_LENGTH = 100;
const ZIP_SINGLE_UPLOAD_ERROR = 'ZIP 文件只能单个上传';
const ROOT_SKILL_REQUIRED_ERROR = '上传内容根目录必须包含名为 SKILL.md 的文件';
const ZIP_ROOT_SKILL_ERROR = 'ZIP 压缩包根目录必须包含名为 SKILL.md 的文件';
const SKILL_NAME_REQUIRED_ERROR = '技能文件不合法：SKILL.md 头部缺少 name 字段';
const COLLAPSED_FILE_COUNT = 3;
const PARSED_NAME_MAX_WIDTH_CLASS = 'max-w-[280px]';
const SKILL_NAME_ERROR_BORDER_COLOR = 'rgb(242,48,48)';
const SKILL_NAME_ERROR_BG_COLOR = 'rgb(252,227,225)';
const DEFAULT_FILE_ICON_SRC = '/icons/file-html.svg';
const FILE_ICON_BY_EXTENSION: Record<string, string> = {
  zip: '/icons/file-zip.svg',
  csv: '/icons/files-csv.svg',
  doc: '/icons/file-docx.svg',
  docx: '/icons/file-docx.svg',
  htm: '/icons/file-html.svg',
  html: '/icons/file-html.svg',
  ini: '/icons/file-ini.svg',
  json: '/icons/file-json.svg',
  md: '/icons/file-md.svg',
  pdf: '/icons/files-pdf.svg',
  ppt: '/icons/files-ppt.svg',
  pptx: '/icons/files-ppt.svg',
  py: '/icons/file-py.svg',
  sh: '/icons/file-sh.svg',
  txt: '/icons/file-txt.svg',
  xls: '/icons/files-xlsx.svg',
  xlsx: '/icons/files-xlsx.svg',
  xlsm: '/icons/files-xlsx.svg',
  xlsb: '/icons/files-xlsx.svg',
};

function isZipFile(file: File): boolean {
  return /\.zip$/i.test(file.name);
}

function resolveUploadFileIcon(filePath: string): string {
  const normalizedPath = filePath.trim().toLowerCase();
  const fileName = normalizedPath.split('/').pop() ?? normalizedPath;
  if (fileName === '.gitignore') {
    return '/icons/file-gitignore.svg';
  }
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return FILE_ICON_BY_EXTENSION[extension] ?? DEFAULT_FILE_ICON_SRC;
}

function normalizeUploadPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+/g, '/').replace(/\/$/, '');
}

function isIgnoredZipEntryPath(path: string): boolean {
  return path.startsWith('__MACOSX/');
}

function CloseIcon() {
  return <MaskIcon name="close" className="h-4 w-4" />;
}

function EditIcon() {
  return <MaskIcon name="edit" className="h-4 w-4" />;
}

function DeleteFileIcon() {
  return (
    <span
      aria-hidden="true"
      className="block h-4 w-4 bg-current"
      data-testid="upload-skill-file-delete-icon"
      style={{
        maskImage: "url('/icons/common-delete.svg')",
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskImage: "url('/icons/common-delete.svg')",
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        WebkitMaskSize: 'contain',
      }}
    />
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
  }
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function stripYamlQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseFrontmatterValue(frontmatter: string, key: string): string {
  const lines = frontmatter.split('\n');
  const keyPattern = new RegExp(`^${key}:\\s*(.*)$`);

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(keyPattern);
    if (!match) continue;

    const rawValue = match[1]?.trim() ?? '';
    if (!rawValue) return '';
    if (rawValue.startsWith('>') || rawValue.startsWith('|')) {
      const blockLines: string[] = [];
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const line = lines[cursor] ?? '';
        if (line.trim() && !line.startsWith(' ') && !line.startsWith('\t')) break;
        blockLines.push(line.trim());
      }
      const nonEmptyLines = blockLines.filter(Boolean);
      return rawValue.startsWith('|') ? nonEmptyLines.join('\n').trim() : nonEmptyLines.join(' ').trim();
    }

    return stripYamlQuotes(rawValue);
  }

  return '';
}

export function parseSkillMetadata(markdown: string): ParsedSkillMetadata {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  let frontmatter = '';

  if (normalized.startsWith('---\n')) {
    const endIndex = normalized.indexOf('\n---', 4);
    if (endIndex !== -1) {
      frontmatter = normalized.slice(4, endIndex);
    }
  }

  return {
    name: frontmatter ? parseFrontmatterValue(frontmatter, 'name') : '',
    description: frontmatter ? parseFrontmatterValue(frontmatter, 'description') : '',
  };
}

function extractSkillMetadataFromManifest(files: UploadFile[], manifestPath: string | null): ParsedSkillMetadata {
  if (!manifestPath) {
    return { name: '', description: '' };
  }

  const skillMdFile = files.find((file) => normalizeUploadPath(file.path) === manifestPath);
  if (!skillMdFile) {
    return { name: '', description: '' };
  }

  try {
    return parseSkillMetadata(decodeBase64Utf8(skillMdFile.content));
  } catch {
    return { name: '', description: '' };
  }
}

function findRootSkillMarkdownPath(paths: string[]): string | null {
  const normalizedPaths = paths.map(normalizeUploadPath).filter((path) => path.length > 0 && !isIgnoredZipEntryPath(path));

  if (normalizedPaths.includes('SKILL.md')) {
    return 'SKILL.md';
  }

  const rootSkillFiles = normalizedPaths.filter((path) => path.endsWith('/SKILL.md') && path.split('/').length === 2);
  if (rootSkillFiles.length !== 1) {
    return null;
  }

  const rootSkillPath = rootSkillFiles[0] ?? null;
  if (!rootSkillPath) {
    return null;
  }

  const rootDir = rootSkillPath.split('/')[0];
  const hasLooseRootFiles = normalizedPaths.some((path) => !path.includes('/'));
  if (hasLooseRootFiles) {
    return null;
  }

  const hasDifferentTopLevelDir = normalizedPaths.some((path) => path.split('/')[0] !== rootDir);
  return hasDifferentTopLevelDir ? null : rootSkillPath;
}

function extractSkillMetadata(files: UploadFile[]): ParsedSkillMetadata {
  return extractSkillMetadataFromManifest(files, findRootSkillMarkdownPath(files.map((file) => file.path)));
}

function getSkillMetadataValidationError(parsedSkill: ParsedSkillMetadata): string | null {
  return parsedSkill.name.trim() ? null : SKILL_NAME_REQUIRED_ERROR;
}

function getUploadValidationIssue(files: UploadFile[]): UploadValidationIssue | null {
  if (files.length === 0) {
    return { kind: 'empty', message: '请选择文件' };
  }

  const oversizedFile = files.find((file) => file.size > SKILL_UPLOAD_LIMITS.maxFileBytes);
  if (oversizedFile) {
    return {
      kind: 'fileTooLarge',
      message: `文件 ${oversizedFile.path} 单个文件大小不能超过1MB`,
    };
  }

  if (files.length > SKILL_UPLOAD_LIMITS.maxFiles) {
    return {
      kind: 'tooManyFiles',
      message: `文件数量不能超过 ${SKILL_UPLOAD_LIMITS.maxFiles} 个`,
    };
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > SKILL_UPLOAD_LIMITS.maxTotalBytes) {
    return {
      kind: 'totalTooLarge',
      message: `文件总大小不能超过 ${formatBytes(SKILL_UPLOAD_LIMITS.maxTotalBytes)}`,
    };
  }

  if (!findRootSkillMarkdownPath(files.map((file) => file.path))) {
    return {
      kind: 'missingSkill',
      message: ROOT_SKILL_REQUIRED_ERROR,
    };
  }

  return null;
}

function getInlineValidationError(files: UploadFile[]): string | null {
  const issue = getUploadValidationIssue(files);
  return issue?.kind === 'missingSkill' ? issue.message : null;
}

export function validateSkillName(name: string): string | null {
  const trimmedName = name.trim();

  if (!trimmedName) return '请输入技能名称';
  if (trimmedName.length > SKILL_NAME_MAX_LENGTH) {
    return `技能名称不能超过 ${SKILL_NAME_MAX_LENGTH} 个字符`;
  }
  if (!SKILL_NAME_ALLOWED_RE.test(trimmedName)) {
    return '技能名称仅支持英文、数字和中划线';
  }

  return null;
}

export function validateSkillUpload(name: string, files: UploadFile[]): string | null {
  return validateSkillUploadFiles(files) ?? validateSkillName(name);
}

export function validateSkillUploadFiles(files: UploadFile[]): string | null {
  return getUploadValidationIssue(files)?.message ?? null;
}

export function UploadSkillModal({ open, onClose, onSuccess }: UploadSkillModalProps) {
  const addToast = useToastStore((state) => state.addToast);
  const [name, setName] = useState('');
  const [parsedName, setParsedName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isFileListExpanded, setIsFileListExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const canEditName = parsedName.trim().length > 0;
  const fileValidationIssue = getUploadValidationIssue(files);
  const metadataValidationError = !fileValidationIssue && files.length > 0
    ? getSkillMetadataValidationError({ name: parsedName, description })
    : null;
  const parseResultError = error
    ?? (fileValidationIssue && fileValidationIssue.kind !== 'empty' ? fileValidationIssue.message : null)
    ?? metadataValidationError;
  const nameValidationError = validateSkillName(name);
  const editingNameValidationError = isEditingName ? nameValidationError : null;
  const uploadDisabledReason = (() => {
    if (uploading) return '正在导入技能，请稍候';
    if (files.length === 0) return '请选择文件或文件夹后再导入';
    if (error) return error;
    if (fileValidationIssue) return fileValidationIssue.message;
    if (metadataValidationError) return metadataValidationError;
    if (nameValidationError) return nameValidationError;
    return null;
  })();
  const isSubmitDisabled = uploadDisabledReason != null;
  const visibleFileEntries = (isFileListExpanded ? fileNames : fileNames.slice(0, COLLAPSED_FILE_COUNT)).map((fileName, index) => ({
    fileName,
    index,
  }));
  const hasExpandableFileList = fileNames.length > COLLAPSED_FILE_COUNT;

  const resetUploadPickers = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  }, []);

  const reset = useCallback(() => {
    setName('');
    setParsedName('');
    setDescription('');
    setFiles([]);
    setFileNames([]);
    setError(null);
    setIsEditingName(false);
    setIsFileListExpanded(false);
    resetUploadPickers();
  }, [resetUploadPickers]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleClose]);

  useEffect(() => {
    if (!isEditingName) return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [isEditingName]);

  const showToast = useCallback(
    (type: 'success' | 'error' | 'info', title: string, message: string) => {
      addToast({
        type,
        title,
        message,
        duration: 4000,
      });
    },
    [addToast],
  );

  const syncUploadState = useCallback(
    (nextFiles: UploadFile[], options: UploadStateOptions = {}) => {
      const nextParsedSkill = options.parsedSkill ?? extractSkillMetadata(nextFiles);
      const nextValidationIssue = getUploadValidationIssue(nextFiles);
      const nextMetadataValidationError = nextValidationIssue ? null : getSkillMetadataValidationError(nextParsedSkill);

      setFiles(nextFiles);
      setFileNames(nextFiles.map((file) => file.path));
      setParsedName(nextParsedSkill.name);
      setDescription(nextParsedSkill.description);
      setName((currentName) => {
        const trimmedCurrentName = currentName.trim();
        if (!trimmedCurrentName || trimmedCurrentName === parsedName) {
          return nextParsedSkill.name;
        }
        return currentName;
      });
      setIsEditingName(false);
      setError(options.inlineError ?? getInlineValidationError(nextFiles));

      if (nextValidationIssue && nextValidationIssue.kind !== 'empty' && nextValidationIssue.kind !== 'missingSkill') {
        showToast('error', '上传失败', nextValidationIssue.message);
      }
      if (nextMetadataValidationError) {
        showToast('error', '上传失败', nextMetadataValidationError);
      }
    },
    [parsedName, showToast],
  );

  const readFiles = useCallback(async (fileList: FileList) => {
    const selectedFiles = Array.from(fileList);
    resetUploadPickers();
    const zipFiles = selectedFiles.filter(isZipFile);

    if (zipFiles.length > 0 && selectedFiles.length !== 1) {
      setError(null);
      showToast('error', '上传失败', ZIP_SINGLE_UPLOAD_ERROR);
      return;
    }

    if (zipFiles.length === 1) {
      try {
        const { default: JSZip } = await import('jszip');
        const zip = await JSZip.loadAsync(await fileToArrayBuffer(zipFiles[0]));
        const zipEntries: UploadFile[] = [];

        for (const entry of Object.values(zip.files)) {
          if (entry.dir) continue;

          const normalizedPath = normalizeUploadPath(entry.name);
          if (!normalizedPath || isIgnoredZipEntryPath(normalizedPath)) continue;

          const bytes = await entry.async('uint8array');
          zipEntries.push({
            path: normalizedPath,
            content: uint8ArrayToBase64(bytes),
            size: bytes.byteLength,
          });
        }

        zipEntries.sort((left, right) => left.path.localeCompare(right.path));
        setIsFileListExpanded(false);

        const rootSkillMarkdownPath = findRootSkillMarkdownPath(zipEntries.map((entry) => entry.path));
        const uploadIssue = getUploadValidationIssue(zipEntries);
        if (uploadIssue) {
          showToast('error', '上传失败', uploadIssue.kind === 'missingSkill' ? ZIP_ROOT_SKILL_ERROR : uploadIssue.message);
          return;
        }

        syncUploadState(zipEntries, {
          inlineError: null,
          parsedSkill: extractSkillMetadataFromManifest(zipEntries, rootSkillMarkdownPath),
        });
      } catch {
        setError(null);
        showToast('error', '上传失败', 'ZIP 文件解析失败');
      }

      return;
    }

    const newEntries: UploadFile[] = [];

    for (const file of selectedFiles) {
      const relPath = ('webkitRelativePath' in file ? (file.webkitRelativePath as string) : '') || file.name;
      const base64 = await fileToBase64(file);
      newEntries.push({ path: relPath, content: base64, size: file.size });
    }

    setIsFileListExpanded(false);
    const uploadIssue = getUploadValidationIssue(newEntries);
    if (uploadIssue) {
      showToast('error', '上传失败', uploadIssue.message);
      return;
    }

    syncUploadState(newEntries);
  }, [resetUploadPickers, showToast, syncUploadState]);

  const removeFile = useCallback((index: number) => {
    const nextFiles = files.filter((_, currentIndex) => currentIndex !== index);
    syncUploadState(nextFiles);
  }, [files, syncUploadState]);

  const handleNameChange = useCallback((nextName: string) => {
    setName(nextName);
  }, []);

  const handleNameEditComplete = useCallback((action: 'submit' | 'blur' | 'cancel' = 'blur') => {
    if (action === 'cancel') {
      setName(parsedName);
      setIsEditingName(false);
      return;
    }

    if (validateSkillName(name)) {
      return;
    }

    setIsEditingName(false);
  }, [name, parsedName]);

  const handleSubmit = useCallback(async () => {
    const fileValidationIssue = getUploadValidationIssue(files);
    if (fileValidationIssue) {
      setError(fileValidationIssue.kind === 'missingSkill' ? fileValidationIssue.message : null);
      if (fileValidationIssue.kind !== 'missingSkill') {
        showToast('error', '上传失败', fileValidationIssue.message);
      }
      return;
    }

    if (metadataValidationError) {
      showToast('error', '上传失败', metadataValidationError);
      return;
    }

    const nameValidationError = validateSkillName(name);
    if (nameValidationError) {
      showToast('error', '上传失败', nameValidationError);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/skills/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          files: files.map(({ path, content }) => ({ path, content })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (data.success) {
        notifySkillOptionsChanged();
        handleClose();
        onSuccess();
      } else {
        showToast('error', '上传失败', data.error ?? (res.status === 413 ? '上传内容过大，请减少文件数量或体积' : '上传失败'));
      }
    } catch {
      showToast('error', '上传失败', '网络错误，请确认本地 API 服务已启动，或减少上传文件数量后重试');
    } finally {
      setUploading(false);
    }
  }, [files, handleClose, metadataValidationError, name, onSuccess, showToast]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-strong)] p-4" data-testid="upload-skill-overlay">
      <div
        role="dialog"
        aria-modal="true"
        className="flex w-[550px] max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl border border-[var(--modal-border)] bg-[var(--modal-surface)] p-6 shadow-[var(--modal-shadow)]"
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-sm font-bold">导入技能</h3>
          <IconButton
            label="close"
            size="sm"
            onClick={handleClose}
            icon={<CloseIcon />}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <Alert mode="prompt" closable={false} className="mb-4">
            1.支持上传文件或文件夹：单个文件 ≤ 1MB，文件总数 ≤ 100 个，总大小 ≤ 4MB；
            <br />
            2.上传内容的根目录必须包含 SKILL.md 文件。
          </Alert>

          <div className="mb-4 flex gap-2">
            <Button variant="default" onClick={() => fileInputRef.current?.click()}>
              选择文件
            </Button>
            <Button variant="default" onClick={() => folderInputRef.current?.click()}>
              选择文件夹
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => e.target.files && void readFiles(e.target.files)}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            {...({ webkitdirectory: '' } as Record<string, string>)}
            multiple
            onChange={(e) => e.target.files && void readFiles(e.target.files)}
            className="hidden"
          />

          <div className="mb-4">
            {fileNames.length > 0 ? (
              <div className="space-y-1 pr-1 text-xs text-[var(--modal-text-muted)]">
                {visibleFileEntries.map(({ fileName, index }) => (
                  <div
                    key={`${fileName}-${index}`}
                    className="group flex items-center gap-2 rounded-[6px] px-2 py-1 transition-colors hover:bg-[var(--modal-muted-surface-hover)]"
                    data-testid="upload-skill-file-row"
                  >
                    <div className="min-w-0 flex flex-1 items-center gap-1">
                      <img
                        src={resolveUploadFileIcon(fileName)}
                        alt=""
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0"
                        data-testid="upload-skill-file-icon"
                      />
                      <span className="min-w-0 flex-1 truncate">{fileName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      aria-label={`remove-file-${index}`}
                      className="shrink-0 text-[var(--modal-text-subtle)] opacity-0 transition-[opacity,color] group-hover:opacity-100 hover:text-[var(--modal-accent-text)]"
                      data-testid="upload-skill-file-delete-button"
                    >
                      <DeleteFileIcon />
                    </button>
                  </div>
                ))}
                {hasExpandableFileList ? (
                  <button
                    type="button"
                    data-testid="file-list-toggle"
                    onClick={() => setIsFileListExpanded((currentValue) => !currentValue)}
                    className="pt-1 text-xs text-[var(--modal-text-muted)] transition-colors hover:text-[var(--modal-text)]"
                  >
                    {isFileListExpanded ? '收起' : `展开全部 (${fileNames.length})`}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {files.length > 0 ? (
            <div>
            <div className="mb-3 text-xs font-medium text-[var(--modal-text-muted)]">解析结果</div>

            {parseResultError ? (
              <p data-testid="parsed-skill-error" className="text-xs text-[#f23030]">
                {parseResultError}
              </p>
            ) : (
              <div className="space-y-3">
              <div className="flex items-start gap-3 text-xs">
                <div className="w-[72px] shrink-0 pt-2 text-[var(--modal-text-muted)]">Skill名称</div>
                <div className="min-w-0 flex-1">
                  {isEditingName ? (
                    <div className="space-y-1">
                      <input
                        ref={nameInputRef}
                        type="text"
                        value={name}
                        maxLength={SKILL_NAME_MAX_LENGTH}
                        aria-invalid={editingNameValidationError ? 'true' : 'false'}
                        onChange={(e) => handleNameChange(e.target.value)}
                        onBlur={() => handleNameEditComplete('blur')}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleNameEditComplete('submit');
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            handleNameEditComplete('cancel');
                          }
                        }}
                        placeholder="请输入技能名称"
                        className="ui-input w-full rounded px-3 py-2 text-xs"
                        style={editingNameValidationError
                          ? {
                              borderColor: SKILL_NAME_ERROR_BORDER_COLOR,
                              backgroundColor: SKILL_NAME_ERROR_BG_COLOR,
                            }
                          : undefined}
                      />
                      {editingNameValidationError ? (
                        <p data-testid="upload-skill-name-error" className="text-xs text-[var(--state-error-text)]">
                          {editingNameValidationError}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="inline-flex min-h-8 max-w-full items-center gap-1">
                      {name ? (
                        <OverflowTooltip content={name} className={PARSED_NAME_MAX_WIDTH_CLASS}>
                          <span
                            data-testid="parsed-skill-name-text"
                            className={`block truncate whitespace-nowrap text-[var(--modal-text)] ${PARSED_NAME_MAX_WIDTH_CLASS}`}
                          >
                            {name}
                          </span>
                        </OverflowTooltip>
                      ) : (
                        <span className="text-[var(--modal-text)]">--</span>
                      )}
                      {canEditName ? (
                        <button
                          type="button"
                          aria-label="edit-skill-name"
                          onClick={() => setIsEditingName(true)}
                          className="shrink-0 text-[var(--modal-text-subtle)] transition-colors hover:text-[var(--modal-text)]"
                        >
                          <EditIcon />
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs">
                <div className="w-[72px] shrink-0 text-[var(--modal-text-muted)]">Skill描述</div>
                <div className="min-w-0 flex-1 leading-5 text-[var(--modal-text)]">
                  <span data-testid="parsed-skill-description-text" className="whitespace-pre-wrap break-words">
                    {description || '--'}
                  </span>
                </div>
              </div>
              </div>
            )}
            </div>
          ) : null}

        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="default" onClick={handleClose}>
            取消
          </Button>
          {uploadDisabledReason ? (
            <OverflowTooltip content={uploadDisabledReason} forceShow className="inline-flex shrink-0">
              <span data-testid="upload-skill-submit-trigger" className="inline-flex shrink-0">
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitDisabled}
                >
                  {uploading ? '导入中...' : '导入'}
                </Button>
              </span>
            </OverflowTooltip>
          ) : (
            <span data-testid="upload-skill-submit-trigger" className="inline-flex shrink-0">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitDisabled}
              >
                {uploading ? '导入中...' : '导入'}
              </Button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
