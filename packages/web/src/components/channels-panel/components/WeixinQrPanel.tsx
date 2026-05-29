/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { Button } from '../../shared/Button';
import { SpinnerIcon } from './ConnectorConfigIcons';
import { ConnectorConnectedState } from './ConnectorConnectedState';

type QrState = 'idle' | 'fetching' | 'waiting' | 'scanned' | 'confirmed' | 'error' | 'expired';

const QR_POLL_INTERVAL_MS = 2500;
const QR_EXPIRE_MS = 60_000;

interface WeixinQrPanelProps {
  configured: boolean;
  onConfigured?: () => void | Promise<void>;
  onDisconnected?: () => void | Promise<void>;
}

export function WeixinQrPanel({ configured, onConfigured, onDisconnected }: WeixinQrPanelProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [qrState, setQrState] = useState<QrState>(configured ? 'confirmed' : 'idle');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expireRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalRef = useRef(configured);
  const requestSeqRef = useRef(0);
  const confirmedNotifiedRef = useRef(configured);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    if (expireRef.current) {
      clearTimeout(expireRef.current);
      expireRef.current = null;
    }
    requestSeqRef.current += 1;
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    if (configured) {
      terminalRef.current = true;
      confirmedNotifiedRef.current = true;
      stopPolling();
      setQrState('confirmed');
      setQrUrl(null);
      setErrorMsg(null);
      return;
    }
    terminalRef.current = false;
    confirmedNotifiedRef.current = false;
    setQrState((prev) => (prev === 'confirmed' ? 'idle' : prev));
  }, [configured, stopPolling]);

  const startPolling = useCallback(
    (payload: string) => {
      stopPolling();
      terminalRef.current = false;
      confirmedNotifiedRef.current = false;

      const scheduleNextPoll = () => {
        if (terminalRef.current) return;
        pollRef.current = setTimeout(() => {
          void poll();
        }, QR_POLL_INTERVAL_MS);
      };

      const poll = async () => {
        if (terminalRef.current) return;
        const requestId = ++requestSeqRef.current;
        try {
          const res = await apiFetch(`/api/connector/weixin/qrcode-status?qrPayload=${encodeURIComponent(payload)}`);
          if (!res.ok) {
            scheduleNextPoll();
            return;
          }
          const data = await res.json();
          if (terminalRef.current || requestId !== requestSeqRef.current) return;

          if (data.status === 'scanned') {
            setQrState((prev) => (prev === 'scanned' ? prev : 'scanned'));
            scheduleNextPoll();
          } else if (data.status === 'waiting') {
            setQrState((prev) => (prev === 'waiting' ? prev : 'waiting'));
            scheduleNextPoll();
          } else if (data.status === 'confirmed') {
            terminalRef.current = true;
            stopPolling();
            setQrState('confirmed');
            setQrUrl(null);
            setErrorMsg(null);
            if (!confirmedNotifiedRef.current) {
              confirmedNotifiedRef.current = true;
              await onConfigured?.();
            }
          } else if (data.status === 'expired') {
            terminalRef.current = true;
            stopPolling();
            setQrState('expired');
            setQrUrl(null);
          } else {
            scheduleNextPoll();
          }
        } catch {
          if (terminalRef.current || requestId !== requestSeqRef.current) return;
          scheduleNextPoll();
          /* network hiccup — keep polling */
        }
      };

      void poll();

      expireRef.current = setTimeout(() => {
        terminalRef.current = true;
        stopPolling();
        setQrState('expired');
        setQrUrl(null);
      }, QR_EXPIRE_MS);
    },
    [onConfigured, stopPolling],
  );

  const handleFetchQr = async () => {
    stopPolling();
    terminalRef.current = false;
    confirmedNotifiedRef.current = false;
    setQrState('fetching');
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/connector/weixin/qrcode', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setQrState('error');
        setErrorMsg(data.error ?? '获取二维码失败');
        return;
      }
      const data = await res.json();
      setQrUrl(data.qrUrl);
      setQrState('waiting');
      startPolling(data.qrPayload);
    } catch {
      setQrState('error');
      setErrorMsg('网络错误');
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/connector/weixin/disconnect', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data.error ?? '解除绑定失败';
        setErrorMsg(message);
        addToast({
          type: 'error',
          title: '断开连接失败',
          message,
          duration: 5000,
        });
        return;
      }
      stopPolling();
      terminalRef.current = false;
      confirmedNotifiedRef.current = false;
      setQrState('idle');
      setQrUrl(null);
      await onDisconnected?.();
      addToast({
        type: 'success',
        title: '断开连接成功',
        message: '已断开连接。',
        duration: 3000,
      });
    } catch {
      setErrorMsg('网络错误');
      addToast({
        type: 'error',
        title: '断开连接失败',
        message: '网络错误',
        duration: 5000,
      });
    } finally {
      setDisconnecting(false);
    }
  };

  if (qrState === 'confirmed') {
    return (
      <div data-testid="weixin-connected">
        <ConnectorConnectedState
          label="微信已连接"
          disconnecting={disconnecting}
          onDisconnect={handleDisconnect}
          disconnectTestId="weixin-disconnect"
        >
          {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}
        </ConnectorConnectedState>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="weixin-qr-panel">
      {(qrState === 'idle' || qrState === 'expired' || qrState === 'error') && (
        <div className="space-y-2">
          {qrState === 'expired' && <p className="text-xs text-amber-600">二维码已过期，请重新生成</p>}
          {qrState === 'error' && errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}
          <Button onClick={handleFetchQr} data-testid="weixin-generate-qr">
            {qrState === 'expired' ? '重新生成二维码' : '生成二维码'}
          </Button>
        </div>
      )}

      {qrState === 'fetching' && (
        <div className="flex items-center gap-2 text-sm">
          <SpinnerIcon />
          <span>二维码生成中...</span>
        </div>
      )}

      {(qrState === 'waiting' || qrState === 'scanned') && qrUrl && (
        <div className="flex flex-col gap-3" style={{ width: 'fit-content' }}>
          <div className="p-3 border-[#f0f0f0] bg-[#fff]" style={{ boxShadow: '0 4px 16px 0 rgba(0,0,0,0.08)' }}>
            <img
              src={qrUrl}
              alt="WeChat login QR code"
              className="w-48 h-48 rounded-lg"
              data-testid="weixin-qr-image"
            />
          </div>
          {qrState === 'waiting' && (
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
              <SpinnerIcon />
              <span>用微信扫描二维码</span>
            </div>
          )}
          {qrState === 'scanned' && (
            <div className="flex items-center gap-2 text-xs font-medium text-green-600">
              <SpinnerIcon />
              <span>已扫码，请在手机上确认...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
