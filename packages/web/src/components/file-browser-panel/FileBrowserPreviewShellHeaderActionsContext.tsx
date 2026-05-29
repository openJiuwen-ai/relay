/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { createContext, type Dispatch, type ReactNode, type SetStateAction, useContext } from 'react';

const FileBrowserPreviewShellHeaderActionsContext = createContext<Dispatch<SetStateAction<ReactNode>> | null>(null);

export function FileBrowserPreviewShellHeaderActionsProvider({
  children,
  setPreviewHeaderActions,
}: {
  children: ReactNode;
  setPreviewHeaderActions: Dispatch<SetStateAction<ReactNode>>;
}) {
  return (
    <FileBrowserPreviewShellHeaderActionsContext.Provider value={setPreviewHeaderActions}>
      {children}
    </FileBrowserPreviewShellHeaderActionsContext.Provider>
  );
}

export function usePreviewShellExtraHeaderSetter(): Dispatch<SetStateAction<ReactNode>> | null {
  return useContext(FileBrowserPreviewShellHeaderActionsContext);
}
