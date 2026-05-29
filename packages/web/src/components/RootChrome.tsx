/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { Outlet } from 'react-router-dom';
import { DesktopResizeHandles } from '@/components/DesktopResizeHandles';
import { DevServiceWorkerReset } from '@/components/DevServiceWorkerReset';
import { ThemeRootSync } from '@/components/ThemeRootSync';
import { ToastContainer } from '@/components/ToastContainer';
import { ConfirmProvider } from '@/components/useConfirm';
import '@/globals.css';

export function RootChrome() {
  return (
    <>
      <DevServiceWorkerReset />
      <ThemeRootSync />
      <ConfirmProvider>
        <Outlet />
      </ConfirmProvider>
      <DesktopResizeHandles />
      <ToastContainer />
    </>
  );
}
