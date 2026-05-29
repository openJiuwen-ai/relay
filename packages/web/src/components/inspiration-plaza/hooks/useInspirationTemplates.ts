/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import type {
  InspirationTemplateListResponse,
  InspirationTemplateListItem,
  ProductType,
  TemplateCategory,
} from '../types';

interface UseInspirationTemplatesOptions {
  category?: TemplateCategory;
  keyword?: string;
  productType?: ProductType | '全部';
}

interface UseInspirationTemplatesResult {
  templates: InspirationTemplateListItem[];
  total: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useInspirationTemplates(
  options: UseInspirationTemplatesOptions = {}
): UseInspirationTemplatesResult {
  const { category = '全部', keyword = '', productType = '全部' } = options;
  const [templates, setTemplates] = useState<InspirationTemplateListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (category && category !== '全部') {
      params.set('category', category);
    }
    if (keyword) {
      params.set('keyword', keyword);
    }
    if (productType && productType !== '全部') {
      params.set('productType', productType);
    }

    const queryString = params.toString();
    const url = `/api/inspiration/templates${queryString ? `?${queryString}` : ''}`;

    apiFetch(url)
      .then((res) => res.json())
      .then((data: { code: number; message: string; data: InspirationTemplateListResponse }) => {
        if (!cancelled) {
          setTemplates(data.data?.templates || []);
          setTotal(data.data?.total || 0);
          setIsLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || 'Unknown error');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [category, keyword, productType, refreshKey]);

  return { templates, total, isLoading, error, refetch };
}
