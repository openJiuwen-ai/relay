/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/utils/api-client';
import { clearAuthIdentity, setCanCreateModel, setIsSkipAuth } from '@/utils/userId';
import { AuthHeroShowcase } from './auth/AuthShell';
import { LoadingPointStyle } from './LoadingPointStyle';

function hasAuthSuccessFlagInLocation(): boolean {
  if (typeof window === 'undefined') return false;
  return new URL(window.location.href).searchParams.get('authSuccess') === '1';
}

function AuthLoadingPanel({ message = '加载中...', redirecting = false }: { message?: string; redirecting?: boolean }) {
  return (
    <div
      data-testid="app-auth-loading-panel"
      className="min-h-screen w-full bg-[radial-gradient(circle_at_top_left,_rgba(250,222,197,0.28),_transparent_38%),linear-gradient(135deg,_#FFF8F2_0%,_#FFFFFF_56%,_#FFF4EA_100%)] px-4 py-8 sm:px-6 md:px-8 lg:px-12 lg:py-10 xl:px-16"
    >
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1280px] items-center justify-center lg:min-h-[calc(100vh-5rem)]">
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
          <AuthHeroShowcase layout="standalone" />
          <div className="mt-12 flex items-center gap-3 text-[16px] font-normal text-[#595959] sm:text-base">
            <LoadingPointStyle className="h-5 w-5 flex-shrink-0" />
            <span>{redirecting ? '正在跳转登录页...' : message}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppAuthBootstrap({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null);
  const navigate = useNavigate();
  const [initialPathname] = useState(() => (typeof window !== 'undefined' ? window.location.pathname : '/'));
  const [skipInitialAuthGate] = useState(() => hasAuthSuccessFlagInLocation());

  useEffect(() => {
    if (skipInitialAuthGate && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('authSuccess')) {
        url.searchParams.delete('authSuccess');
        const nextUrl = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState(window.history.state, '', nextUrl || '/');
      }
    }
  }, [skipInitialAuthGate]);

  useEffect(() => {
    let cancelled = false;
    setRedirecting(false);
    setRedirectTarget(null);
    if (initialPathname.startsWith('/login')) {
      setAuthReady(true);
      return;
    }

    (async () => {
      try {
        const response = await apiFetch('/api/islogin');
        const data = (await response.json()) as {
          islogin?: boolean;
          pendingInvitation?: boolean;
          loginUrl?: string;
          isskip?: boolean;
          canCreateModel?: boolean;
          provider?: {
            mode?: 'auto' | 'form' | 'redirect';
            redirectUrl?: string;
          };
        };
        if (cancelled) return;

        sessionStorage.removeItem('_auth_retry');
        sessionStorage.removeItem('_chat_auth_retry');

        setIsSkipAuth(Boolean(data?.isskip));
        setCanCreateModel(Boolean(data?.canCreateModel));

        if (data?.islogin) {
          setAuthReady(true);
          return;
        }

        clearAuthIdentity();

        if (data?.pendingInvitation) {
          setRedirecting(true);
          window.location.replace('/login/invitation');
          return;
        }

        const providerRedirectUrl =
          data?.provider?.mode === 'redirect' && typeof data?.provider?.redirectUrl === 'string'
            ? data.provider.redirectUrl
            : '';
        if (providerRedirectUrl) {
          setRedirectTarget(providerRedirectUrl);
          setRedirecting(true);
          window.location.replace(providerRedirectUrl);
          return;
        }

        const loginUrl = typeof data?.loginUrl === 'string' ? data.loginUrl : '';
        if (loginUrl) {
          sessionStorage.setItem('_cas_login_url', loginUrl);
          setRedirecting(true);
          window.location.replace(loginUrl);
          return;
        }

        setRedirecting(true);
        window.location.replace('/login');
      } catch (error) {
        if (cancelled) return;
        console.error('检查登录状态失败:', error);
        clearAuthIdentity();

        const retries = Number(sessionStorage.getItem('_auth_retry') || '0');
        if (retries < 2) {
          sessionStorage.setItem('_auth_retry', String(retries + 1));
          setTimeout(() => {
            if (!cancelled) window.location.reload();
          }, 3000);
        } else {
          sessionStorage.removeItem('_auth_retry');
          const casUrl = sessionStorage.getItem('_cas_login_url');
          if (casUrl) {
            window.location.replace(casUrl);
          } else {
            window.location.reload();
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!authReady) {
    return <AuthLoadingPanel redirecting={redirecting} />;
  }

  return <>{children}</>;
}