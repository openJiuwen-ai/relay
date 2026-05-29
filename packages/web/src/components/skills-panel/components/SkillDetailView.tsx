/*
 *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/utils/api-client";
import { skillSourceToLabel } from "@/utils/skill-source-label";
import { CenteredLoadingState } from "../../shared/CenteredLoadingState";
import { OverflowTooltip } from "../../shared/OverflowTooltip";
import { SkillAvatar } from "./SkillAvatar";

interface SkillDetailFileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: SkillDetailFileTreeNode[];
}

interface SkillDetailResponse {
  id: string;
  name: string;
  description?: string;
  triggers?: string[];
  category?: string;
  source: "builtin" | "external";
  enabled: boolean;
  installedAt?: string;
  mounts?: Record<string, boolean>;
  fileTree?: SkillDetailFileTreeNode[];
  agents: Record<string, boolean>;
}

interface SkillFilePreviewResponse {
  path: string;
  content: string;
  size: number;
  mime: string;
  truncated: boolean;
}

const SPECIAL_FILE_ICON_MAP: Record<string, string> = {
  ".gitignore": "/icons/file-gitignore.svg",
};

const FILE_EXTENSION_ICON_MAP: Record<string, string> = {
  ".docx": "/icons/file-docx.svg",
  ".html": "/icons/file-html.svg",
  ".ini": "/icons/file-ini.svg",
  ".json": "/icons/file-json.svg",
  ".md": "/icons/file-md.svg",
  ".py": "/icons/file-py.svg",
  ".sh": "/icons/file-sh.svg",
  ".txt": "/icons/file-txt.svg",
};

const DIRECTORY_ICON_SRC = "/icons/file-folder.svg";
const DEFAULT_FILE_ICON_SRC = "/icons/file-html.svg";
const DISCLAIMER_TITLE = "免责声明";
const THIRD_PARTY_DISCLAIMER_TEXT =
  "请注意：该外部技能来源于第三方，使用外部技能时，您承诺将严格遵守第三方的相关条款。华为云不对第三方产品的合规性和安全性保证，请您在使用前慎重考虑并评估风险。";
const IMAGE_FILE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".avif",
]);

function sourceLabel(source: SkillDetailResponse["source"]): string {
  return skillSourceToLabel(source);
}

function statusLabel(value: boolean): string {
  return value ? "已启用" : "已停用";
}

function formatInstalledAt(value?: string): string {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function findFirstFile(nodes: SkillDetailFileTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.type === "file") return node.path;
    if (node.children?.length) {
      const nestedPath = findFirstFile(node.children);
      if (nestedPath) return nestedPath;
    }
  }
  return null;
}

function findNodeByPath(
  nodes: SkillDetailFileTreeNode[],
  targetPath: string,
): SkillDetailFileTreeNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (node.children?.length) {
      const nestedNode = findNodeByPath(node.children, targetPath);
      if (nestedNode) return nestedNode;
    }
  }
  return null;
}

function getFileTreeIconSrc(node: SkillDetailFileTreeNode): string {
  if (node.type === "directory") return DIRECTORY_ICON_SRC;

  const segments = node.path.split("/").filter(Boolean);
  const fileName = segments.at(-1) ?? node.name;
  const normalizedFileName = fileName.toLowerCase();

  if (SPECIAL_FILE_ICON_MAP[normalizedFileName]) {
    return SPECIAL_FILE_ICON_MAP[normalizedFileName];
  }

  const extensionIndex = normalizedFileName.lastIndexOf(".");
  if (extensionIndex > 0) {
    const extension = normalizedFileName.slice(extensionIndex);
    if (FILE_EXTENSION_ICON_MAP[extension]) {
      return FILE_EXTENSION_ICON_MAP[extension];
    }
  }

  return DEFAULT_FILE_ICON_SRC;
}

function isImageFilePath(filePath: string | null): boolean {
  if (!filePath) return false;

  const normalizedPath = filePath.toLowerCase();
  const extensionIndex = normalizedPath.lastIndexOf(".");
  if (extensionIndex < 0) return false;

  return IMAGE_FILE_EXTENSIONS.has(normalizedPath.slice(extensionIndex));
}

function BasicInfoField({
  label,
  value,
  className = "",
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`.trim()}>
      <p className="text-xs font-medium tracking-[0.02em] text-[var(--text-label-secondary)]">
        {label}
      </p>
      {typeof value === "string" ? (
        <p className="text-xs leading-6 text-[var(--text-primary)]">{value}</p>
      ) : (
        value
      )}
    </div>
  );
}

function FileTreeBranch({
  nodes,
  selectedPath,
  onSelect,
  depth = 0,
}: {
  nodes: SkillDetailFileTreeNode[];
  selectedPath: string | null;
  onSelect: (node: SkillDetailFileTreeNode) => void;
  depth?: number;
}) {
  return (
    <ul className="space-y-1.5">
      {nodes.map((node) => (
        <li key={node.path}>
          <button
            type="button"
            onClick={() => onSelect(node)}
            className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-[7px] text-left text-sm transition ${
              selectedPath === node.path ? "bg-[var(--surface-card-muted)]" : ""
            }`}
            style={{ paddingLeft: `${depth * 18 + 12}px` }}
          >
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center overflow-hidden rounded-[6px] ${
                selectedPath === node.path ? "opacity-100" : "opacity-90"
              }`}
            >
              <img
                src={getFileTreeIconSrc(node)}
                alt=""
                aria-hidden="true"
                data-testid="skill-detail-file-tree-icon"
                data-path={node.path}
                className="h-4 w-4 shrink-0 object-contain"
              />
            </span>
            <span className="min-w-0 flex-1 text-xs">{node.name}</span>
          </button>
          {node.children?.length ? (
            <FileTreeBranch
              nodes={node.children}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function SkillDetailView({
  skillName,
  avatarUrl,
  onBack,
}: {
  skillName: string;
  avatarUrl?: string | null;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<SkillDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filePreview, setFilePreview] =
    useState<SkillFilePreviewResponse | null>(null);
  const [filePreviewLoading, setFilePreviewLoading] = useState(false);
  const [filePreviewError, setFilePreviewError] = useState<string | null>(null);
  const [previewCache, setPreviewCache] = useState<
    Record<string, SkillFilePreviewResponse>
  >({});

  useEffect(() => {
    const controller = new AbortController();

    const loadDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(
          `/api/skills/detail?name=${encodeURIComponent(skillName)}`,
          {
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(payload.error ?? `加载失败 (${res.status})`);
          setDetail(null);
          return;
        }
        const data = (await res.json()) as SkillDetailResponse;
        setDetail(data);
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        )
          return;
        setError("网络错误");
        setDetail(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadDetail();

    return () => controller.abort();
  }, [skillName]);

  const triggerLabel = useMemo(
    () => detail?.triggers?.join(", ") || "--",
    [detail?.triggers],
  );
  const categoryLabel = detail?.category?.trim() || "其他";
  const resolvedTitle = detail?.name ?? skillName;
  const resolvedDescription = detail?.description?.trim() || "--";
  const hasDisclaimer = detail?.source === "external";
  const selectedFileLabel = useMemo(() => {
    if (!selectedPath)
      return detail?.fileTree?.length ? "请选择文件" : "暂无文件";
    return selectedPath.split("/").filter(Boolean).at(-1) ?? selectedPath;
  }, [detail?.fileTree, selectedPath]);
  const selectedFileNode = useMemo(() => {
    if (!detail?.fileTree?.length || !selectedPath) return null;
    return findNodeByPath(detail.fileTree, selectedPath);
  }, [detail?.fileTree, selectedPath]);
  const selectedPathIsImage = useMemo(() => isImageFilePath(selectedPath), [selectedPath]);

  useEffect(() => {
    const fileTree = detail?.fileTree;
    if (!fileTree?.length) {
      setSelectedPath(null);
      return;
    }
    setSelectedPath(
      (current) =>
        current ?? findFirstFile(fileTree) ?? fileTree[0]?.path ?? null,
    );
  }, [detail]);

  useEffect(() => {
    setFilePreview(null);
    setFilePreviewError(null);
    setPreviewCache({});
  }, [skillName]);

  useEffect(() => {
    if (!selectedPath) {
      setFilePreview(null);
      setFilePreviewError(null);
      return;
    }

    if (selectedPathIsImage) {
      setFilePreview({
        path: selectedPath,
        content: "暂不支持图片预览",
        size: selectedFileNode?.size ?? 0,
        mime: "image/*",
        truncated: false,
      });
      setFilePreviewError(null);
      setFilePreviewLoading(false);
      return;
    }

    const cachedPreview = previewCache[selectedPath];
    if (cachedPreview) {
      setFilePreview(cachedPreview);
      setFilePreviewError(null);
      setFilePreviewLoading(false);
      return;
    }

    const controller = new AbortController();

    const loadFilePreview = async () => {
      setFilePreviewLoading(true);
      setFilePreviewError(null);
      try {
        const res = await apiFetch(
          `/api/skills/file?name=${encodeURIComponent(skillName)}&path=${encodeURIComponent(selectedPath)}`,
          {
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setFilePreview(null);
          setFilePreviewError(payload.error ?? `加载文件失败 (${res.status})`);
          return;
        }
        const data = (await res.json()) as SkillFilePreviewResponse;
        setFilePreview(data);
        setPreviewCache((current) => ({ ...current, [selectedPath]: data }));
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        )
          return;
        setFilePreview(null);
        setFilePreviewError("文件预览加载失败");
      } finally {
        if (!controller.signal.aborted) {
          setFilePreviewLoading(false);
        }
      }
    };

    void loadFilePreview();

    return () => controller.abort();
  }, [previewCache, selectedFileNode?.size, selectedPath, selectedPathIsImage, skillName]);

  const handleSelectNode = (node: SkillDetailFileTreeNode) => {
    if (node.type !== "file") return;
    setSelectedPath(node.path);
  };

  if (loading) return <CenteredLoadingState />;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="skill-detail-panel"
    >
      <div className="shrink-0 pb-6">
        <div className="flex min-w-0 items-center gap-2 text-sm text-[var(--text-muted)]">
          <button
            type="button"
            onClick={onBack}
            data-testid="skill-detail-breadcrumb-back"
            className="transition hover:underline shrink-0"
          >
            我的技能
          </button>
          <span>/</span>
          <OverflowTooltip content={resolvedTitle} className="min-w-0">
            <span
              className="block truncate font-medium text-[var(--text-primary)]"
              data-testid="skill-detail-breadcrumb-title"
            >
              {resolvedTitle}
            </span>
          </OverflowTooltip>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p className="ui-status-error mb-4 rounded-[var(--radius-md)] px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        {detail ? (
          <div className="flex min-h-0 flex-col gap-8 pb-2">
            <section className="shrink-0 space-y-5">
              <div className="flex items-start gap-4">
                <SkillAvatar
                  avatarName={skillName}
                  avatarUrl={avatarUrl}
                  dataTestId="skill-detail-avatar"
                  className="h-[56px] w-[56px] rounded-[14px]"
                />
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <OverflowTooltip content={resolvedTitle} className="w-full">
                    <h2
                      className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[20px] font-semibold leading-[30px] text-[var(--text-primary)]"
                      data-testid="skill-detail-title"
                    >
                      {resolvedTitle}
                    </h2>
                  </OverflowTooltip>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span
                      className="ui-badge-muted"
                      data-testid="skill-detail-category-badge"
                    >
                      {categoryLabel}
                    </span>
                    <span
                      className="ui-badge-muted"
                      data-testid="skill-detail-source-badge"
                    >
                      {sourceLabel(detail.source)}
                    </span>
                    <span
                      className="ui-badge-muted"
                      data-testid="skill-detail-status-badge"
                    >
                      {statusLabel(detail.enabled)}
                    </span>
                  </div>
                </div>
              </div>
            </section>
            <section
              className="shrink-0 space-y-5"
              data-testid="skill-detail-basic-info"
            >
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                基础信息
              </h3>
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-3">
                <BasicInfoField label="名称" value={resolvedTitle} />
                <BasicInfoField
                  label="触发词"
                  value={
                    <OverflowTooltip content={triggerLabel} className="w-full">
                      <p className="line-clamp-2 min-h-[44px] text-xs leading-6">
                        {triggerLabel}
                      </p>
                    </OverflowTooltip>
                  }
                />
                <BasicInfoField
                  label="描述"
                  value={
                    <OverflowTooltip
                      content={resolvedDescription}
                      className="w-full"
                    >
                      <p className="line-clamp-2 min-h-[44px] text-xs leading-6">
                        {resolvedDescription}
                      </p>
                    </OverflowTooltip>
                  }
                />
              </div>
            </section>
            <section
              className="shrink-0 space-y-3"
              data-testid="skill-detail-file-workspace"
            >
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                文件目录
              </h3>
              <div
                className={`flex h-[440px] overflow-hidden rounded-[20px] border border-[var(--border-default)] bg-[var(--surface-card)]`}
              >
                <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                  <aside className="flex w-full shrink-0 flex-col border-b border-[var(--border-default)] bg-[var(--surface-panel)] md:w-[280px] md:border-b-0 md:border-r">
                    <div className="border-b border-[var(--border-default)] px-4 py-3 flex items-center gap-2">
                      <img src="/icons/file.svg" className="h-4 w-4 shrink-0 object-contain" />
                      <div className="text-xs">File</div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                      {detail.fileTree?.length ? (
                        <FileTreeBranch
                          nodes={detail.fileTree}
                          selectedPath={selectedPath}
                          onSelect={handleSelectNode}
                        />
                      ) : (
                        <p className="px-2 py-4 text-sm text-[var(--text-muted)]">
                          暂无文件结构数据。
                        </p>
                      )}
                    </div>
                  </aside>
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface-card)]">
                    <div className="border-b border-[var(--border-default)] px-5 py-3 text-xs">
                      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_fit-content(200px)] items-center gap-3">
                        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                          <img
                            src={
                              selectedFileNode
                                ? getFileTreeIconSrc(selectedFileNode)
                                : DEFAULT_FILE_ICON_SRC
                            }
                            alt=""
                            aria-hidden="true"
                            data-testid="skill-detail-preview-header-icon"
                            className="h-4 w-4 shrink-0 object-contain"
                          />
                          <OverflowTooltip content={selectedFileLabel} className="min-w-0 overflow-hidden">
                            <div className="w-full min-w-0 truncate">{selectedFileLabel}</div>
                          </OverflowTooltip>
                        </div>
                        {filePreview ? (
                          <OverflowTooltip
                            content={`${filePreview.mime} · ${filePreview.size} B`}
                            className="min-w-0 overflow-hidden"
                          >
                            <div className="w-full min-w-0 truncate text-right text-xs text-[var(--text-muted)]">
                              {`${filePreview.mime} · ${filePreview.size} B`}
                            </div>
                          </OverflowTooltip>
                        ) : null}
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                      {filePreviewLoading ? (
                        <div
                          className="flex h-full min-h-0 items-center justify-center"
                          data-testid="skill-detail-preview-loading-shell"
                        >
                          <CenteredLoadingState />
                        </div>
                      ) : null}
                      {!filePreviewLoading && filePreviewError ? (
                        <p className="ui-status-error rounded-[var(--radius-md)] px-3 py-2 text-sm">
                          {filePreviewError}
                        </p>
                      ) : null}
                      {!filePreviewLoading &&
                      !filePreviewError &&
                      filePreview ? (
                        <div
                          className="space-y-3"
                          data-testid="skill-detail-file-preview"
                        >
                          {filePreview.truncated ? (
                            <p className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-2 text-xs text-[var(--text-muted)]">
                              文件内容过长，当前仅展示前 1MB。
                            </p>
                          ) : null}
                          <pre
                            className="overflow-x-auto whitespace-pre-wrap break-words font-sans text-sm leading-6"
                            style={{ overflowWrap: "anywhere" }}
                          >
                            {filePreview.content}
                          </pre>
                        </div>
                      ) : null}
                      {!filePreviewLoading &&
                      !filePreviewError &&
                      !filePreview ? (
                        <p className="text-sm text-[var(--text-muted)]">
                          请选择要预览的文件。
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </section>
            {hasDisclaimer ? (
              <section
                className="shrink-0 space-y-3"
                data-testid="skill-detail-disclaimer"
              >
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {DISCLAIMER_TITLE}
                </h3>
                <div className="rounded-[16px] border border-[var(--border-default)] bg-[var(--surface-panel)] p-6">
                  <p className="text-xs leading-6 text-[var(--text-secondary)]">
                    {THIRD_PARTY_DISCLAIMER_TEXT}
                  </p>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
