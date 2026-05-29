/*
 * *
 *  Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { useCallback } from 'react';
import { usePlaceholderStore } from '../stores/placeholderStore';

const UPLOAD_BASE_PATH = '/files/inspiration-upload';

/**
 * 复用现有附件上传机制
 * 固定存储路径格式: /files/inspiration-upload/{timestamp}_{filename}
 */
export function usePlaceholderFileUpload() {
  const setFileValue = usePlaceholderStore((s) => s.setFileValue);
  const removeFileValue = usePlaceholderStore((s) => s.removeFileValue);

  const uploadFile = useCallback(
    async (placeholderId: string, file: File): Promise<{ path: string; name: string }> => {
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storedPath = `${UPLOAD_BASE_PATH}/${timestamp}_${sanitizedFileName}`;

      setFileValue(placeholderId, {
        path: storedPath,
        name: file.name,
        file, // Store the actual File object for sending
      });

      return { path: storedPath, name: file.name };
    },
    [setFileValue]
  );

  const deleteFile = useCallback(
    (placeholderId: string) => {
      removeFileValue(placeholderId);
    },
    [removeFileValue]
  );

  return {
    uploadFile,
    deleteFile,
  };
}