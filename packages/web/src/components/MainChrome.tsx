/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { Outlet } from 'react-router-dom';
import MainShell from '@/components/MainShell';

export function MainChrome() {
  return (
    <MainShell>
      <Outlet />
    </MainShell>
  );
}
