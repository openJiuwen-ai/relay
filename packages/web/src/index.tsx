/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { BrowserRouter } from 'react-router-dom';
import App from './App';
import MainShell from './components/MainShell';
import PageContent from './pages/HomePage';
import './globals.css';

export { App };
export * from './public-api/components';
export * from './public-api/config';
export * from './public-api/constants';
export * from './public-api/hooks';
export * from './public-api/lib';
export * from './public-api/pages';
export * from './public-api/services';
export * from './public-api/shared';
export * from './public-api/stores';
export * from './public-api/utils';

export function OfficeClawWebApp() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

export function HomePage() {
  return (
    <MainShell>
      <PageContent />
    </MainShell>
  );
}
