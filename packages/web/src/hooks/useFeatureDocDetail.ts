/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FeatureDocDetail } from '@openjiuwen/relay-shared';
import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/api-client';

export function useFeatureDocDetail(featureId: string | null): {
  detail: FeatureDocDetail | null;
  loading: boolean;
  error: string | null;
} {
  const [detail, setDetail] = useState<FeatureDocDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!featureId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch(`/api/backlog/feature-doc-detail?featureId=${encodeURIComponent(featureId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: FeatureDocDetail) => {
        if (!cancelled) {
          setDetail(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [featureId]);

  return { detail, loading, error };
}
