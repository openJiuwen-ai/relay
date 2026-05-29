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

type QrState = 'idle' | 'fetching' | 'waiting' | 'confirmed' | 'error' | 'expired' | 'denied';

interface FeishuQrPanelProps {
  configured: boolean;
  onConfirmed?: () => void;
  onDisconnected?: () => void;
}

function statusMessage(status: QrState, errorMsg: string | null) {
  if (status === 'expired') return '二维码已过期，请重新生成';
  if (status === 'denied') return '授权已被拒绝，请重试并在飞书上确认';
  if (status === 'error') return errorMsg ?? '获取二维码失败';
  return null;
}

export function FeishuQrPanel({ configured, onConfirmed, onDisconnected }: FeishuQrPanelProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [qrState, setQrState] = useState<QrState>(configured ? 'confirmed' : 'idle');
  const [disconnecting, setDisconnecting] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalRef = useRef(false);
  const requestSeqRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    terminalRef.current = configured;
    setQrState(configured ? 'confirmed' : 'idle');
    if (configured) {
      stopPolling();
      setQrUrl(null);
      setErrorMsg(null);
    }
  }, [configured, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const schedulePoll = useCallback(
    (payload: string, intervalMs: number) => {
      stopPolling();
      terminalRef.current = false;

      const poll = async () => {
        if (terminalRef.current) return;

        const requestId = ++requestSeqRef.current;
        try {
          const res = await apiFetch(`/api/connector/feishu/qrcode-status?qrPayload=${encodeURIComponent(payload)}`);
          if (!res.ok) {
            pollRef.current = setTimeout(poll, intervalMs);
            return;
          }
          const data = await res.json();
          if (terminalRef.current || requestId !== requestSeqRef.current) return;

          if (data.status === 'waiting') {
            pollRef.current = setTimeout(poll, intervalMs);
            return;
          }

          stopPolling();
          terminalRef.current = true;

          if (data.status === 'confirmed' || data.status === 'expired' || data.status === 'denied') {
            setQrState(data.status);
            setQrUrl(null);
            if (data.status === 'confirmed') {
              setErrorMsg(null);
              onConfirmed?.();
            }
            return;
          }

          setQrState('error');
          setErrorMsg('二维码状态异常');
          setQrUrl(null);
        } catch {
          if (terminalRef.current || requestId !== requestSeqRef.current) return;
          pollRef.current = setTimeout(poll, intervalMs);
        }
      };

      poll();
    },
    [onConfirmed, stopPolling],
  );

  const handleFetchQr = async () => {
    stopPolling();
    terminalRef.current = false;
    setQrState('fetching');
    setErrorMsg(null);

    try {
      const res = await apiFetch('/api/connector/feishu/qrcode', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setQrState('error');
        setErrorMsg(data.error ?? '获取二维码失败');
        return;
      }

      const data = await res.json();
      setQrUrl(data.qrUrl);
      setQrState('waiting');
      schedulePoll(data.qrPayload, data.intervalMs ?? 2500);
    } catch {
      setQrState('error');
      setErrorMsg('网络错误');
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await apiFetch('/api/connector/feishu/disconnect', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast({
          type: 'error',
          title: '断开连接失败',
          message: data.error ?? '断开失败',
          duration: 5000,
        });
        return;
      }
      setQrState('idle');
      addToast({
        type: 'success',
        title: '断开连接成功',
        message: '已断开连接。',
        duration: 3000,
      });
      onDisconnected?.();
    } catch {
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
      <div data-testid="feishu-connected">
        <ConnectorConnectedState
          label="飞书 已连接"
          disconnecting={disconnecting}
          onDisconnect={handleDisconnect}
          disconnectTestId="feishu-disconnect"
        />
      </div>
    );
  }

  const message = statusMessage(qrState, errorMsg);

  return (
    <div className="space-y-3" data-testid="feishu-qr-panel">
      {(qrState === 'idle' || qrState === 'expired' || qrState === 'error' || qrState === 'denied') && (
        <div className="space-y-2">
          {message && <p className="text-xs text-red-600">{message}</p>}
          <Button variant="major" onClick={handleFetchQr} data-testid="feishu-generate-qr">
            {qrState === 'idle' ? '生成二维码' : '重新生成二维码'}
          </Button>
        </div>
      )}

      {qrState === 'fetching' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <SpinnerIcon />
          <span>二维码生成中...</span>
        </div>
      )}

      {qrState === 'waiting' && qrUrl && (
        <div className="flex flex-col gap-3" style={{ width: 'fit-content' }} data-testid="feishu-qr-waiting-shell">
          <div
            className="p-3 border-[#f0f0f0] bg-[#fff]"
            style={{ boxShadow: '0 4px 16px 0 rgba(0,0,0,0.08)' }}
            data-testid="feishu-qr-card"
          >
            <img src={qrUrl} alt="飞书二维码" className="w-48 h-48 rounded-lg" data-testid="feishu-qr-image" />
          </div>
          <div
            className="flex items-center justify-center gap-2 text-gray-500 text-xs"
            data-testid="feishu-qr-waiting-text"
          >
            <SpinnerIcon />
            <span>用飞书扫描二维码</span>
          </div>
        </div>
      )}
    </div>
  );
}
