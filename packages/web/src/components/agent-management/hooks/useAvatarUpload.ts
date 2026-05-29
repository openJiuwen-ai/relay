/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useState } from 'react';
import { uploadAvatarAsset } from '@/components/hub-agent-editor.client';

interface UseAvatarUploadOptions {
  onSuccess?: (url: string) => void;
  maxSizeBytes?: number;
}

interface UseAvatarUploadResult {
  uploading: boolean;
  error: string | null;
  handleUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}

const DEFAULT_MAX_SIZE = 200 * 1024; // 200KB

export function useAvatarUpload({
  onSuccess,
  maxSizeBytes = DEFAULT_MAX_SIZE,
}: UseAvatarUploadOptions = {}): UseAvatarUploadResult {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (file.size > maxSizeBytes) {
        setError('图片大小不能超过 200KB');
        return;
      }

      setUploading(true);
      setError(null);

      try {
        const url = await uploadAvatarAsset(file);
        onSuccess?.(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : '上传失败');
      } finally {
        setUploading(false);
      }
    },
    [maxSizeBytes, onSuccess],
  );

  return { uploading, error, handleUpload };
}
