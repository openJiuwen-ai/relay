/*
 * *
 *  Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { create } from 'zustand';

export interface FileValue {
  path: string;
  name: string;
  file?: File;
}

interface PlaceholderState {
  // placeholderId -> 用户输入的文本内容
  textValues: Record<string, string>;
  // placeholderId -> 已上传的文件信息
  fileValues: Record<string, FileValue>;

  setTextValue: (id: string, value: string) => void;
  getTextValue: (id: string) => string;
  setFileValue: (id: string, file: FileValue) => void;
  getFileValue: (id: string) => FileValue | null;
  removeFileValue: (id: string) => void;
  clearPlaceholder: (id: string) => void;
  clearAll: () => void;
}

export const usePlaceholderStore = create<PlaceholderState>((set, get) => ({
  textValues: {},
  fileValues: {},

  setTextValue: (id, value) => {
    set((state) => ({
      textValues: {
        ...state.textValues,
        [id]: value,
      },
    }));
  },

  getTextValue: (id) => {
    return get().textValues[id] ?? '';
  },

  setFileValue: (id, file) => {
    set((state) => ({
      fileValues: {
        ...state.fileValues,
        [id]: file,
      },
    }));
  },

  getFileValue: (id) => {
    return get().fileValues[id] ?? null;
  },

  removeFileValue: (id) => {
    set((state) => {
      const newFileValues = { ...state.fileValues };
      delete newFileValues[id];
      return { fileValues: newFileValues };
    });
  },

  clearPlaceholder: (id) => {
    set((state) => {
      const newTextValues = { ...state.textValues };
      const newFileValues = { ...state.fileValues };
      delete newTextValues[id];
      delete newFileValues[id];
      return { textValues: newTextValues, fileValues: newFileValues };
    });
  },

  clearAll: () => {
    set({ textValues: {}, fileValues: {} });
  },
}));