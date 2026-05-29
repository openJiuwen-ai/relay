/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RootChrome } from '@/components/RootChrome';
import { MainChrome } from '@/components/MainChrome';

const AgentsPage = lazy(() => import('@/pages/AgentsPage'));
const ChannelsPage = lazy(() => import('@/pages/ChannelsPage'));
const HomePage = lazy(() => import('@/pages/HomePage'));
const ModelsPage = lazy(() => import('@/pages/ModelsPage'));
const SchedulePage = lazy(() => import('@/pages/SchedulePage'));
const SkillsPage = lazy(() => import('@/pages/SkillsPage'));
const ThreadPage = lazy(() => import('@/pages/ThreadPage'));
const InspirationPage = lazy(() => import('@/pages/InspirationPage'));

function RouteLoadingFallback() {
  return (
    <div className="h-full min-h-[180px] w-full flex items-center justify-center bg-transparent">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
        <p className="text-sm text-gray-400">加载中...</p>
      </div>
    </div>
  );
}

function withRouteFallback(node: React.ReactNode) {
  return <Suspense fallback={<RouteLoadingFallback />}>{node}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<RootChrome />}>
        <Route element={<MainChrome />}>
          <Route path="/" element={withRouteFallback(<HomePage />)} />
          <Route path="/thread/:threadId" element={withRouteFallback(<ThreadPage />)} />
          <Route path="/channels" element={withRouteFallback(<ChannelsPage />)} />
          <Route path="/agents" element={withRouteFallback(<AgentsPage />)} />
          <Route path="/models" element={withRouteFallback(<ModelsPage />)} />
          <Route path="/skills" element={withRouteFallback(<SkillsPage />)} />
          <Route path="/schedule" element={withRouteFallback(<SchedulePage />)} />
          <Route path="/inspiration" element={withRouteFallback(<InspirationPage />)} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}