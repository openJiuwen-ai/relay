/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { FeedbackHelpCircleIcon } from '@/components/icons/SettingsFeedbackIcons';
import { AppModal } from './AppModal';
import { Button } from './shared/Button';
import { OverflowTooltip } from './shared/OverflowTooltip';

const MAX_DESC = 1000;
const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const ACCEPT_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/jpg',
  'image/pjpeg',
  'image/x-png',
]);

const OFFICE_CLAW_FAQ_DOC_URL =
  'https://support.huaweicloud.com/officeclaw-agentarts-pc/officeclaw-agentarts-pc-0040.html';

export interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

type FeedbackType = 'bug' | 'suggestion';

type AttachedFile = { id: string; file: File };

function extensionLooksLikeAllowedImage(name: string): boolean {
  return /\.(jpe?g|png|gif)$/i.test(name);
}

function isAllowedImage(file: File): boolean {
  const rawType = (file.type ?? '').trim().toLowerCase();
  if (ACCEPT_MIME.has(rawType)) return true;
  if (rawType.startsWith('image/')) return extensionLooksLikeAllowedImage(file.name);
  if (!rawType || rawType === 'application/octet-stream') return extensionLooksLikeAllowedImage(file.name);
  return extensionLooksLikeAllowedImage(file.name);
}

function dataTransferMightContainFiles(dt: DataTransfer | null): boolean {
  if (!dt?.types) return false;
  const types = dt.types;
  const len = types.length;
  for (let i = 0; i < len; i++) {
    const t = types[i];
    if (t === 'Files') return true;
    if (typeof t === 'string' && t.startsWith('image/')) return true;
  }
  return false;
}

function formatTotalMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function FeedbackScreenshotZoneHints() {
  return (
    <>
      <p className="text-[12px] leading-[18px] tracking-[1px] text-[var(--text-label-secondary)]">
        点击后进行添加，或拖拽/粘贴到此区域，支持添加多个图片
      </p>
      <p className="mt-1 text-[12px] leading-[18px] text-[var(--text-label-secondary)]">
        格式为 jpg、png、gif，数量不超过10个，总大小 ≤ 5MB
      </p>
    </>
  );
}

function FeedbackFieldTip({ text }: { text: string }) {
  return (
    <OverflowTooltip content={text} forceShow placement="top" className="inline-flex shrink-0">
      <button
        type="button"
        className="inline-flex h-[18px] w-[18px] cursor-pointer items-center justify-center  bg-transparent text-[var(--text-label-secondary)] transition-colors  hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)]"
        aria-label={`说明：${text}`}
      >
        <FeedbackHelpCircleIcon className="h-4 w-4 shrink-0 text-[var(--text-primary)]" />
      </button>
    </OverflowTooltip>
  );
}

export default function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const headingId = useId();
  const fieldIds = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const focusAreaRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);

  const [feedbackType, setFeedbackType] = useState<FeedbackType>('bug');
  const [description, setDescription] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [attachPluginInfo, setAttachPluginInfo] = useState(false);
  const [attachAppLogs, setAttachAppLogs] = useState(false);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [dropHighlight, setDropHighlight] = useState(false);

  useEscapeKey({ enabled: open, onEscape: onClose });

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => focusAreaRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (open) return;
    setFeedbackType('bug');
    setDescription('');
    setContactInfo('');
    setAttachPluginInfo(false);
    setAttachAppLogs(false);
    setFiles([]);
    setDropHighlight(false);
    dragDepthRef.current = 0;
  }, [open]);

  const totalBytes = files.reduce((sum, { file }) => sum + file.size, 0);

  const tryAddFiles = useCallback(
    (incoming: File[]) => {
      const allowed = incoming.filter(isAllowedImage);
      if (allowed.length === 0) return;

      setFiles((prev) => {
        let next = [...prev];
        let bytes = next.reduce((s, { file }) => s + file.size, 0);

        for (const file of allowed) {
          if (next.length >= MAX_FILES) break;
          const nextBytes = bytes + file.size;
          if (nextBytes > MAX_TOTAL_BYTES) break;
          next = [...next, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file }];
          bytes = nextBytes;
        }
        return next;
      });
    },
    [],
  );

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.length ? Array.from(e.target.files) : [];
    e.target.value = '';
    /* 推迟到当前调用栈结束：避免部分环境下文件对话框关闭后仍误触发遮罩逻辑干扰本轮渲染 */
    queueMicrotask(() => tryAddFiles(picked));
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dataTransferMightContainFiles(e.dataTransfer)) return;
    dragDepthRef.current += 1;
    setDropHighlight(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDropHighlight(false);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dataTransferMightContainFiles(e.dataTransfer)) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDropHighlight(false);
    const dropped = Array.from(e.dataTransfer.files ?? []);
    tryAddFiles(dropped);
  };

  const handlePaste = (e: ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const pasted: File[] = [];
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const f = item.getAsFile();
      if (f) pasted.push(f);
    }
    if (pasted.length === 0) return;
    e.preventDefault();
    tryAddFiles(pasted);
  };

  const descLen = description.length > MAX_DESC ? MAX_DESC : description.length;
  const descValue = description.slice(0, MAX_DESC);

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={
        <span
          id={headingId}
          className="text-[18px] font-bold leading-[28px] text-[var(--modal-title-text,var(--text-primary))]"
        >
          问题反馈
        </span>
      }
      panelStyle={{ width: 700, maxWidth: 'calc(100vw - 32px)' }}
      panelClassName="flex max-h-[min(640px,calc(100vh-120px))] min-h-0 flex-col overflow-hidden rounded-xl bg-[var(--modal-surface)] p-0 shadow-xl"
      headerClassName="flex shrink-0 items-center justify-between px-6 pb-4 pt-5"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      backdropClassName="p-4"
      disableBackdropClose
      backdropAriaModal
      backdropAriaLabel="问题反馈"
      panelTestId="feedback-modal"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={focusAreaRef}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4 pt-4 outline-none"
          onPaste={handlePaste}
          tabIndex={0}
          role="presentation"
        >
        {/* 反馈类型 */}
        <section className="flex flex-col gap-2">
          <span className="text-[14px] font-medium leading-[22px] text-[var(--text-primary)]">反馈类型</span>
          <div className="flex gap-4">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setFeedbackType('bug')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFeedbackType('bug');
                }
              }}
              className={`flex flex-1 cursor-pointer flex-col rounded-lg border text-left transition-colors ${
                feedbackType === 'bug'
                  ? 'border-[var(--switch-on-bg)] bg-[var(--surface-panel)]'
                  : 'border-[var(--panel-divider)] hover:border-[var(--text-label-secondary)]'
              }`}
              style={{ padding: '12px 24px' }}
              aria-pressed={feedbackType === 'bug'}
              data-testid="feedback-type-bug"
            >
              <div className="flex items-center gap-2">
                <img src="/icons/settings-feedback/feedback-bug.svg" alt="" aria-hidden className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[14px] leading-[22px] text-[var(--text-primary)]">提交BUG</span>
              </div>
              <p className="mt-2 text-[12px] leading-[18px] text-[var(--text-label-secondary)]">
                报告软件问题；如遇到 BUG 类问题，可先查询 
                <a
                  href={OFFICE_CLAW_FAQ_DOC_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer border-none text-[var(--switch-on-bg)] hover:text-[var(--switch-on-bg)]"
                  onClick={(ev) => ev.stopPropagation()}
                >
                   官方FAQ文档
                </a>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setFeedbackType('suggestion')}
              className={`flex flex-1 flex-col rounded-lg border text-left transition-colors ${
                feedbackType === 'suggestion'
                  ? 'border-[var(--switch-on-bg)] bg-[var(--surface-panel)]'
                  : 'border-[var(--panel-divider)] hover:border-[var(--text-label-secondary)]'
              }`}
              style={{ padding: '12px 24px' }}
              aria-pressed={feedbackType === 'suggestion'}
              data-testid="feedback-type-suggestion"
            >
              <div className="flex items-center gap-2">
                <img src="/icons/settings-feedback/feedback-idea.svg" alt="" aria-hidden className="h-[18px] w-[18px] shrink-0" />
                <span className="text-[14px] leading-[22px] text-[var(--text-primary)]">我有建议</span>
              </div>
              <p className="mt-2 text-[12px] leading-[18px] text-[var(--text-label-secondary)]">提交新功能或者改进措施</p>
            </button>
          </div>
        </section>

        {/* 描述 */}
        <section className="flex flex-col">
          <span className="text-[14px] font-medium leading-[22px] text-[var(--text-primary)]">描述</span>
          <p className="mt-1 text-[12px] leading-[18px] text-[var(--text-label-secondary)]">
            若涉及 AI 对话的相关反馈，请尽可能附带会话信息
          </p>
          <div className="relative mt-1 pt-2">
            <textarea
              value={descValue}
              onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
              className="box-border w-full resize-none rounded-md border border-[var(--panel-divider)] bg-[var(--modal-surface)] px-3 py-2 text-[14px] leading-[22px] text-[var(--text-label-secondary)] outline-none focus:border-[var(--text-primary)] focus:ring-0 placeholder:text-[var(--text-label-secondary)]"
              style={{ minHeight: 136, maxHeight: 136, paddingBottom: 28 }}
              placeholder="请描述您遇到的问题或建议…"
              aria-labelledby={headingId}
              data-testid="feedback-description"
            />
            <span
              className="pointer-events-none absolute bottom-[7px] right-2 rounded px-1.5 text-[12px] leading-[18px] text-[var(--text-label-secondary)] bg-[var(--modal-surface)]"
              aria-live="polite"
            >
              {descLen}/{MAX_DESC}
            </span>
          </div>
        </section>

        {/* 截图 */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-medium leading-[22px] text-[var(--text-primary)]">
              问题截图
              <span className="font-normal text-[var(--text-label-secondary)]">（可选）</span>
            </span>
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 text-[14px] font-medium leading-[22px] text-[var(--switch-on-bg)] underline-offset-2 hover:underline"
              onClick={() => fileInputRef.current?.click()}
              data-testid="feedback-upload-trigger"
            >
              上传图片
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,.jpg,.jpeg,.png,.gif"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />

          <div
            className="relative"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {files.length === 0 ? (
              <button
                type="button"
                className="flex h-[100px] w-full flex-col items-center justify-center rounded-[5px] border border-dashed px-4 text-center bg-transparent cursor-pointer"
                style={{ borderColor: 'rgba(194,194,194,1)' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <FeedbackScreenshotZoneHints />
              </button>
            ) : (
              <div className="flex min-h-[100px] flex-col gap-2 rounded-[5px] border border-dashed p-3" style={{ borderColor: 'rgba(194,194,194,1)' }}>
                {files.map(({ id, file }) => (
                  <div
                    key={id}
                    className="group flex items-center gap-1 px-2 rounded-[2px] rounded-[4px] hover:bg-[rgba(245,245,245,1)]"
                  >
                    <img src="/icons/file.svg" alt="" className="h-5 w-5 shrink-0" aria-hidden />
                    <span
                      className="min-w-0 flex-1 truncate pl-1 text-[12px] leading-[18px]"
                      style={{ color: 'rgba(89,89,89,1)' }}
                      title={file.name}
                    >
                      {file.name}
                    </span>
                    <button
                      type="button"
                      aria-label={`删除 ${file.name}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border-none bg-transparent opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => removeFile(id)}
                    >
                      <img src="/icons/common-delete.svg" alt="" className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {dropHighlight ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-[5px] bg-[rgba(245,245,245,0.92)] px-4 text-center">
                {files.length > 0 ? (
                  <FeedbackScreenshotZoneHints />
                ) : (
                  <span className="text-[14px] font-medium text-[var(--text-primary)]">松开以上传到列表</span>
                )}
              </div>
            ) : null}
          </div>

          {totalBytes > 0 ? (
            <p className="text-[12px] leading-[18px] text-[var(--text-label-secondary)]">
              已选 {files.length} 张，约 {formatTotalMB(totalBytes)} MB / 5 MB
            </p>
          ) : null}
        </section>

        {feedbackType === 'bug' ? (
          <>
            {/* 联系方式 */}
            <section className="flex flex-col">
              <span className="text-[14px] font-medium leading-[22px] text-[var(--text-primary)]">联系方式</span>
              <p className="mt-1 text-[12px] leading-[18px] text-[var(--text-label-secondary)]">
                问题排查过程中可能需要补充信息，辛苦提供您的联系方式，帮助我们更好的定位问题
              </p>
              <input
                id={`${fieldIds}-contact`}
                type="text"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="可提供电子邮件、手机号等联系方式"
                className="mt-2 box-border w-full rounded-md border border-[var(--panel-divider)] bg-[var(--modal-surface)] px-3 py-1 text-[14px] leading-[22px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-label-secondary)] focus:border-[var(--text-primary)] focus:ring-0"
                data-testid="feedback-contact"
              />
            </section>

            {/* 辅助信息 */}
            <section className="flex flex-col">
              <span className="text-[14px] font-medium leading-[22px] text-[var(--text-primary)]">辅助信息</span>
              <p className="mt-1 text-[12px] leading-[18px] text-[var(--text-label-secondary)]">
                以上信息仅用于问题排查、复现和解决
              </p>
              <div className="mt-1 flex gap-6 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    id={`${fieldIds}-plugins`}
                    type="checkbox"
                    checked={attachPluginInfo}
                    onChange={(e) => setAttachPluginInfo(e.target.checked)}
                    className="h-4 w-4 shrink-0 cursor-pointer rounded-[4px] border border-[rgba(194,194,194,1)] accent-[var(--switch-on-bg)] text-[var(--switch-on-bg)] focus:ring-0 focus:ring-offset-0"
                    data-testid="feedback-attach-plugins"
                  />
                  <label
                    htmlFor={`${fieldIds}-plugins`}
                    className="cursor-pointer select-none text-[14px] leading-[22px] text-[var(--text-primary)]"
                  >
                    插件信息
                  </label>
                  <FeedbackFieldTip text="上传已安装的插件的名称、版本及运行状态等信息" />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id={`${fieldIds}-logs`}
                    type="checkbox"
                    checked={attachAppLogs}
                    onChange={(e) => setAttachAppLogs(e.target.checked)}
                    className="h-4 w-4 shrink-0 cursor-pointer rounded-[4px] border border-[rgba(194,194,194,1)] accent-[var(--switch-on-bg)] text-[var(--switch-on-bg)] focus:ring-0 focus:ring-offset-0"
                    data-testid="feedback-attach-logs"
                  />
                  <label
                    htmlFor={`${fieldIds}-logs`}
                    className="cursor-pointer select-none text-[14px] leading-[22px] text-[var(--text-primary)]"
                  >
                    应用日志
                  </label>
                  <FeedbackFieldTip text="使用OfficeClaw时产生的日志内容" />
                </div>
              </div>
            </section>
          </>
        ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 px-6 pb-6 pt-4">
          <Button variant="default" type="button" onClick={onClose}>
            取消
          </Button>
          <Button type="button" onClick={onClose} data-testid="feedback-submit">
            确定
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
