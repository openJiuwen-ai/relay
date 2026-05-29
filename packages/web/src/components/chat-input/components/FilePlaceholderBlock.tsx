/*
 * *
 *  Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { useCallback, useState } from 'react';
import { usePlaceholderStore } from '@/stores/placeholderStore';
import { usePlaceholderFileUpload } from '@/hooks/usePlaceholderFileUpload';
import type { FilePlaceholder } from '@/utils/promptParser';
import { getFileTypeIcon } from '@/hooks/usePromptBlocks';

interface FilePlaceholderBlockProps {
  placeholder: FilePlaceholder;
  isActive: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onDelete: () => void;
  onTabNext: () => void;
}

export function FilePlaceholderBlock({
  placeholder,
  isActive,
  onFocus,
  onBlur,
  onDelete,
  onTabNext,
}: FilePlaceholderBlockProps) {
  const fileValue = usePlaceholderStore((s) => s.fileValues[placeholder.id] ?? null);
  const { uploadFile, deleteFile } = usePlaceholderFileUpload();
  const [isHovered, setIsHovered] = useState(false);

  const hasFile = fileValue !== null;

  const handleIconClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (hasFile) {
        deleteFile(placeholder.id);
      }
    },
    [hasFile, placeholder.id, deleteFile]
  );

  const handleClick = useCallback(() => {
    if (hasFile) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = placeholder.formats.length > 0 ? `.${placeholder.formats.join(',.')}` : '*/*';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      await uploadFile(placeholder.id, file);
    };

    input.click();
  }, [hasFile, placeholder.id, placeholder.formats, uploadFile]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        onTabNext();
        return;
      }
    },
    [onTabNext]
  );

  const handleFocus = useCallback(() => {
    onFocus();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    onBlur();
  }, [onBlur]);

  return (
    <span
      className="inline-flex items-center gap-[2px] rounded-[6px] px-[4px] py-[1px] cursor-pointer whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
      style={{
        backgroundColor: 'rgba(20, 118, 255, 0.08)',
        color: hasFile ? 'rgba(20, 118, 255, 1)' : 'rgba(20, 118, 255, 0.4)',
      }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      tabIndex={0}
      data-placeholder-id={placeholder.id}
      data-placeholder-control="true"
      data-placeholder-type="file"
      role="button"
      aria-label={hasFile ? `已上传: ${fileValue.name}` : placeholder.defaultText}
    >
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center w-[16px] h-[16px] flex-shrink-0"
        onClick={handleIconClick}
      >
        {hasFile && isHovered ? (
          <img src="/icons/common-delete.svg" alt="" className="w-[16px] h-[16px]" />
        ) : hasFile ? (
          <img src={getFileTypeIcon(fileValue.name)} alt="" className="w-[16px] h-[16px]" />
        ) : (
          <img src="/icons/icon-drag-file.svg" alt="" className="w-[16px] h-[16px]" />
        )}
      </span>
      <span
        className="inline-block"
        style={{
          wordBreak: 'break-word',
        }}
      >
        {hasFile ? fileValue.name : placeholder.defaultText}
      </span>
    </span>
  );
}