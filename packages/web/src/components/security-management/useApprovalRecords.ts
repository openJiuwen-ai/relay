/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { APPROVAL_RECORDS_PAGE_SIZE, APPROVAL_RECORDS_REQUEST_LIMIT } from './constants';
import type { ApprovalRecord, ApprovalRecordsResponse } from './types';
import { formatPaginationPages } from './utils';

const SEARCH_DEBOUNCE_MS = 300;

function buildRecordsUrl(query: string, offset: number): string {
  const params = new URLSearchParams({
    limit: String(APPROVAL_RECORDS_REQUEST_LIMIT),
    offset: String(offset),
    includeRuleMatched: 'false',
  });
  if (query) params.set('threadQuery', query);
  return `/api/authorization/records?${params.toString()}`;
}

async function fetchApprovalRecords(query: string, offset: number): Promise<ApprovalRecordsResponse> {
  const response = await apiFetch(buildRecordsUrl(query, offset));
  const payload = (await response.json()) as ApprovalRecordsResponse;
  if (!response.ok) {
    throw new Error(payload.error || '加载审批记录失败');
  }
  return payload;
}

export function formatApprovalRecordTime(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function useApprovalRecords(open: boolean, active: boolean) {
  const addToast = useToastStore((state) => state.addToast);
  const requestIdRef = useRef(0);
  const [recordBatches, setRecordBatches] = useState<Record<number, ApprovalRecord[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasAvailableRecords, setHasAvailableRecords] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (open) return;

    requestIdRef.current += 1;
    setRecordBatches({});
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setLoadedQuery(null);
    setPage(1);
    setTotalCount(0);
    setHasAvailableRecords(false);
    setLoadingInitial(false);
    setLoadingSearch(false);
    setLoadingPage(false);
  }, [open]);

  useEffect(() => {
    if (active) return;

    requestIdRef.current += 1;
    setLoadingInitial(false);
    setLoadingSearch(false);
    setLoadingPage(false);
  }, [active]);

  useEffect(() => {
    if (!open || !active || loadedQuery === debouncedSearchQuery) return;

    const currentRequestId = ++requestIdRef.current;
    const isInitialLoad = loadedQuery === null && debouncedSearchQuery.length === 0;
    setLoadingInitial(isInitialLoad);
    setLoadingSearch(!isInitialLoad);
    setLoadingPage(false);

    async function loadRecords() {
      try {
        const payload = await fetchApprovalRecords(debouncedSearchQuery, 0);
        if (requestIdRef.current !== currentRequestId) return;

        const nextRecords = payload.records ?? [];
        setRecordBatches({ 0: nextRecords });
        setLoadedQuery(debouncedSearchQuery);
        setPage(1);
        setTotalCount(payload.totalCount ?? nextRecords.length);
        if (debouncedSearchQuery.length === 0 && nextRecords.length > 0) {
          setHasAvailableRecords(true);
        }
      } catch (error) {
        if (requestIdRef.current !== currentRequestId) return;
        addToast({
          type: 'error',
          title: '审批记录加载失败',
          message: error instanceof Error ? error.message : '加载审批记录失败',
          duration: 3000,
        });
      } finally {
        if (requestIdRef.current === currentRequestId) {
          setLoadingInitial(false);
          setLoadingSearch(false);
        }
      }
    }

    void loadRecords();
  }, [active, addToast, debouncedSearchQuery, loadedQuery, open]);

  const handlePageChange = async (targetPage: number) => {
    if (!active || loadingPage || loadedQuery == null || targetPage === page || targetPage < 1) return;

    const targetStartIndex = (targetPage - 1) * APPROVAL_RECORDS_PAGE_SIZE;
    const targetBatchOffset =
      Math.floor(targetStartIndex / APPROVAL_RECORDS_REQUEST_LIMIT) * APPROVAL_RECORDS_REQUEST_LIMIT;
    if (recordBatches[targetBatchOffset]) {
      setPage(targetPage);
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    setLoadingPage(true);

    try {
      const payload = await fetchApprovalRecords(loadedQuery, targetBatchOffset);
      if (requestIdRef.current !== currentRequestId) return;

      const nextRecords = payload.records ?? [];
      setPage(targetPage);
      setRecordBatches((currentBatches) => ({
        ...currentBatches,
        [targetBatchOffset]: nextRecords,
      }));
      setTotalCount(payload.totalCount ?? nextRecords.length);
    } catch (error) {
      if (requestIdRef.current !== currentRequestId) return;
      addToast({
        type: 'error',
        title: '审批记录加载失败',
        message: error instanceof Error ? error.message : '加载审批记录失败',
        duration: 3000,
      });
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setLoadingPage(false);
      }
    }
  };

  const normalizedSearchQuery = useMemo(() => searchQuery.trim(), [searchQuery]);
  const currentPageStartIndex = (page - 1) * APPROVAL_RECORDS_PAGE_SIZE;
  const currentBatchOffset =
    Math.floor(currentPageStartIndex / APPROVAL_RECORDS_REQUEST_LIMIT) * APPROVAL_RECORDS_REQUEST_LIMIT;
  const currentBatch = recordBatches[currentBatchOffset] ?? [];
  const currentBatchStartIndex = currentPageStartIndex - currentBatchOffset;
  const records = currentBatch.slice(currentBatchStartIndex, currentBatchStartIndex + APPROVAL_RECORDS_PAGE_SIZE);
  const showSearchInput = hasAvailableRecords || normalizedSearchQuery.length > 0;
  const searchPending = normalizedSearchQuery !== debouncedSearchQuery;
  const showSearchLoading = showSearchInput && (loadingSearch || searchPending);
  const showInitialLoading = loadingInitial && loadedQuery === null;
  const showEmptyState = !showInitialLoading && loadedQuery === '' && records.length === 0;
  const showNoSearchResults =
    !showSearchLoading && loadedQuery != null && loadedQuery.length > 0 && records.length === 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / APPROVAL_RECORDS_PAGE_SIZE));
  const showPagination = totalPages > 1;
  const paginationItems = showPagination ? formatPaginationPages(page, totalPages) : [];

  return {
    records,
    searchQuery,
    page,
    totalPages,
    paginationItems,
    showPagination,
    loadingPage,
    showSearchInput,
    showSearchLoading,
    showInitialLoading,
    showEmptyState,
    showNoSearchResults,
    setSearchQuery,
    handlePageChange,
  };
}
