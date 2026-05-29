/*
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { useCallback, useState } from 'react';
import { createEmptyHeaderRow, headersObjectToRows } from '../utils';
import type { HeaderInputRow } from '../types/models-panel';

export interface UseHeaderRowsEditorResult {
  rows: HeaderInputRow[];
  rowErrors: Map<string, { keyError?: string; valueError?: string }>;
  errorRowIndex: number | null;
  handleAddRow: () => void;
  handleRowChange: (rowId: string, field: 'key' | 'value', value: string) => void;
  handleRemoveRow: (rowId: string) => void;
  validateRows: (rows: HeaderInputRow[]) => Map<string, { keyError?: string; valueError?: string }>;
  resetRows: () => void;
  clearErrors: () => void;
  setErrorRowIndex: (index: number | null) => void;
  setRowsFromHeaders: (headers?: Record<string, string> | null) => void;
}

export function useHeaderRowsEditor(): UseHeaderRowsEditorResult {
  const [rows, setRows] = useState<HeaderInputRow[]>([]);
  const [rowErrors, setRowErrors] = useState<Map<string, { keyError?: string; valueError?: string }>>(new Map());
  const [errorRowIndex, setErrorRowIndex] = useState<number | null>(null);

  const validateRows = useCallback((targetRows: HeaderInputRow[]) => {
    const newErrors = new Map<string, { keyError?: string; valueError?: string }>();
    const keyCountMap = new Map<string, number[]>();

    targetRows.forEach((row, index) => {
      const key = row.key.trim();
      const value = row.value.trim();
      const rowErrors: { keyError?: string; valueError?: string } = {};

      if (!key && !value) {
        newErrors.set(row.id, {});
        return;
      }

      if (!key && value) {
        rowErrors.keyError = '请填写键名';
      }

      if (key && !value) {
        rowErrors.valueError = '请填写值';
      }

      if (key) {
        const existing = keyCountMap.get(key) || [];
        existing.push(index);
        keyCountMap.set(key, existing);
      }

      if (Object.keys(rowErrors).length > 0) {
        newErrors.set(row.id, rowErrors);
      }
    });

    keyCountMap.forEach((indices, key) => {
      if (indices.length > 1) {
        indices.forEach((index) => {
          const rowId = targetRows[index].id;
          const existing = newErrors.get(rowId) || {};
          newErrors.set(rowId, { ...existing, keyError: `键名"${key}"重复` });
        });
      }
    });

    setRowErrors(newErrors);
    return newErrors;
  }, []);

  const handleAddRow = useCallback(() => {
    const errors = validateRows(rows);
    const hasError = Array.from(errors.values()).some((err) => !!(err && (err.keyError || err.valueError)));
    if (hasError) {
      return;
    }

    const nextRow = createEmptyHeaderRow();
    setRows((prev) => [...prev, nextRow]);
    validateRows([...rows, nextRow]);
  }, [rows, validateRows]);

  const handleRowChange = useCallback(
    (rowId: string, field: 'key' | 'value', value: string) => {
      const updatedRows = rows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row));
      setRows(updatedRows);
      validateRows(updatedRows);
    },
    [rows, validateRows],
  );

  const handleRemoveRow = useCallback(
    (rowId: string) => {
      const updatedRows = rows.filter((row) => row.id !== rowId);
      setRows(updatedRows);
      validateRows(updatedRows);
    },
    [rows, validateRows],
  );

  const resetRows = useCallback(() => {
    setRows([]);
    setRowErrors(new Map());
    setErrorRowIndex(null);
  }, []);

  const clearErrors = useCallback(() => {
    setRowErrors(new Map());
    setErrorRowIndex(null);
  }, []);

  const setRowsFromHeaders = useCallback((headers?: Record<string, string> | null) => {
    setRows(headersObjectToRows(headers));
    setRowErrors(new Map());
    setErrorRowIndex(null);
  }, []);

  return {
    rows,
    rowErrors,
    errorRowIndex,
    handleAddRow,
    handleRowChange,
    handleRemoveRow,
    validateRows,
    resetRows,
    clearErrors,
    setErrorRowIndex,
    setRowsFromHeaders,
  };
}