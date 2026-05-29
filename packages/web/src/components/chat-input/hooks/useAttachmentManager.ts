/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useCallback, useEffect, useRef, useState } from 'react';
import { FILE_SIZE_EXCEEDED_MESSAGE, MAX_ATTACHMENT_FILES, MAX_FILE_SIZE, UNSUPPORTED_FILE_TYPE_MESSAGE } from '../utils/constants';
import { isSupportedAttachmentFile, mergeFilesByName } from '../utils/helpers';

export type AddToast = (toast: { type: 'error' | 'success' | 'info'; title: string; message: string; duration?: number }) => void;

export function useAttachmentManager(addToast: AddToast, dropScope?: HTMLElement | null) {
  const [images, setImages] = useState<File[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const imagesRef = useRef<File[]>([]);
  const dragDepthRef = useRef(0);
  const dragHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const onFilesAccepted = useCallback(
    (files: File[]) => {
      const supportedFiles: File[] = [];
      let hasUnsupported = false;
      let hasOversized = false;

      for (const file of files) {
        if (!isSupportedAttachmentFile(file)) {
          hasUnsupported = true;
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          hasOversized = true;
          continue;
        }
        supportedFiles.push(file);
      }

      if (hasUnsupported) {
        addToast({ type: 'error', title: '上传失败', message: UNSUPPORTED_FILE_TYPE_MESSAGE, duration: 2600 });
      }
      if (hasOversized) {
        addToast({ type: 'error', title: '上传失败', message: FILE_SIZE_EXCEEDED_MESSAGE, duration: 2600 });
      }

      if (supportedFiles.length > 0) {
        const result = mergeFilesByName(imagesRef.current, supportedFiles, MAX_ATTACHMENT_FILES);
        setImages(result.files);
        if (result.dropped > 0) {
          addToast({
            type: 'error',
            title: '附件数量已达上限',
            message: `最多支持选择 ${MAX_ATTACHMENT_FILES} 个附件`,
            duration: 2600,
          });
        }
      }

      return supportedFiles.length > 0;
    },
    [addToast],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      onFilesAccepted(Array.from(files));
      e.target.value = '';
    },
    [onFilesAccepted],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const hasText = Array.from(items).some(
        (item) => item.kind === 'string' && (item.type === 'text/plain' || item.type === 'text/html'),
      );
      if (hasText) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind !== 'file') continue;
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
      if (pastedFiles.length === 0) return;

      const accepted = onFilesAccepted(pastedFiles);
      if (accepted) {
        e.preventDefault();
      }
    },
    [onFilesAccepted],
  );

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev: File[]) => prev.filter((_: File, i: number) => i !== index));
  }, []);

  const hasDraggedFiles = useCallback((dataTransfer: DataTransfer | null | undefined) => {
    if (!dataTransfer) return false;
    if ((dataTransfer.files?.length ?? 0) > 0) return true;
    const types = Array.from(dataTransfer.types ?? []);
    return types.includes('Files') || types.includes('application/x-moz-file') || types.includes('public.file-url');
  }, []);

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingFiles(true);
    },
    [hasDraggedFiles],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setIsDraggingFiles(true);
    },
    [hasDraggedFiles],
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDraggingFiles(false);
      }
    },
    [hasDraggedFiles],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
      const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
      if (droppedFiles.length === 0) return;
      onFilesAccepted(droppedFiles);
    },
    [hasDraggedFiles, onFilesAccepted],
  );

  useEffect(() => {
    const scope = dropScope;
    if (!scope) return;

    const clearHideTimer = () => {
      if (!dragHideTimerRef.current) return;
      clearTimeout(dragHideTimerRef.current);
      dragHideTimerRef.current = null;
    };

    const clearDragging = () => {
      clearHideTimer();
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
    };

    const scheduleHideDragging = () => {
      clearHideTimer();
      dragHideTimerRef.current = setTimeout(() => {
        dragDepthRef.current = 0;
        setIsDraggingFiles(false);
        dragHideTimerRef.current = null;
      }, 80);
    };

    const isInDropScope = (event: DragEvent) => {
      const target = event.target;
      return target instanceof Node && scope.contains(target);
    };

    const shouldHandleNativeEvent = (event: DragEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return false;
      if (!scope.contains(target)) return false;
      if (target instanceof Element && target.closest('[data-chat-input-dropzone="true"]')) {
        return false;
      }
      return true;
    };

    const onNativeDragEnter = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      if (!isInDropScope(event)) return;
      event.preventDefault();
      clearHideTimer();
      dragDepthRef.current += 1;
      setIsDraggingFiles(true);
    };

    const onNativeDragOver = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      if (!isInDropScope(event)) {
        scheduleHideDragging();
        return;
      }
      event.preventDefault();
      clearHideTimer();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      setIsDraggingFiles(true);
    };

    const onNativeDragLeave = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      if (!isInDropScope(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        scheduleHideDragging();
      }
    };

    const onNativeDrop = (event: DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      if (!shouldHandleNativeEvent(event)) {
        clearDragging();
        return;
      }
      event.preventDefault();
      clearDragging();
      const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
      if (droppedFiles.length === 0) return;
      onFilesAccepted(droppedFiles);
    };

    // Use capture phase on document to reliably receive native drag events
    // across deeply nested children inside the chat session area.
    document.addEventListener('dragenter', onNativeDragEnter, true);
    document.addEventListener('dragover', onNativeDragOver, true);
    document.addEventListener('dragleave', onNativeDragLeave, true);
    document.addEventListener('drop', onNativeDrop, true);

    return () => {
      document.removeEventListener('dragenter', onNativeDragEnter, true);
      document.removeEventListener('dragover', onNativeDragOver, true);
      document.removeEventListener('dragleave', onNativeDragLeave, true);
      document.removeEventListener('drop', onNativeDrop, true);
      clearDragging();
    };
  }, [dropScope, hasDraggedFiles, onFilesAccepted]);

  return {
    images,
    setImages,
    imagesRef,
    isDraggingFiles,
    handleFileSelect,
    handlePaste,
    handleRemoveImage,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}

