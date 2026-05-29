/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { notifySkillOptionsChanged } from '@/utils/skill-options-cache';
import { Button } from '../shared/Button';
import { AppModal } from '../AppModal';
import { CapabilityTab, type SelectedSkillSummary } from './components/CapabilityTab';
import { SkillsTab } from './components/SkillsTab';
import { SkillDetailView } from './components/SkillDetailView';
import { UploadSkillModal } from './components/UploadSkillModal';

const INSTALLED = '我的技能';
const SKILL_PLAZA = '技能广场';
const UPLOAD_SUCCESS_LABEL = '技能上传成功';
const SKILL_PLAZA_RISK_ACK_KEY = 'office-claw:skills-plaza-risk-ack:v1';
const LEGACY_SKILL_PLAZA_RISK_ACK_KEY = 'cat-cafe:skills-plaza-risk-ack:v1';
const RISK_TITLE = '风险提示';
const RISK_MESSAGE =
  '请注意，部分技能来源于第三方，当您使用第三方外部技能时，您承诺将严格遵守第三方的相关条款（包括但不限于license协议）。华为云不对第三方产品的合规性和安全性保证，请您使用前慎重考虑并评估风险。';
const UPDATE_SUCCESS_TITLE = '更新成功';
const UPDATE_FAILURE_TITLE = '更新失败';

function hasSkillPlazaRiskAgreed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = window.localStorage.getItem(SKILL_PLAZA_RISK_ACK_KEY);
    if (v === '1') return true;
    return window.localStorage.getItem(LEGACY_SKILL_PLAZA_RISK_ACK_KEY) === '1';
  } catch {
    return false;
  }
}

function markSkillPlazaRiskAgreed(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SKILL_PLAZA_RISK_ACK_KEY, '1');
    try {
      window.localStorage.removeItem(LEGACY_SKILL_PLAZA_RISK_ACK_KEY);
    } catch {
      /* ignore */
    }
  } catch {
    // ignore storage failure
  }
}

export function SkillsPanel() {
  const addToast = useToastStore((s) => s.addToast);
  const [activeTab, setActiveTab] = useState<'installed' | 'plaza'>('installed');
  const [showUpload, setShowUpload] = useState(false);
  const [capabilityRefreshSignal, setCapabilityRefreshSignal] = useState(0);
  const [selectedSkill, setSelectedSkill] = useState<SelectedSkillSummary | null>(null);
  const [showSkillPlazaRiskModal, setShowSkillPlazaRiskModal] = useState(false);
  const [pendingUpdateNames, setPendingUpdateNames] = useState<Set<string>>(new Set());
  const [updatingSkillId, setUpdatingSkillId] = useState<string | null>(null);
  const updateCheckStartedRef = useRef(false);

  useEscapeKey({
    enabled: showSkillPlazaRiskModal,
    onEscape: () => setShowSkillPlazaRiskModal(false),
  });

  const handleOpenSkillPlaza = () => {
    setSelectedSkill(null);
    if (hasSkillPlazaRiskAgreed()) {
      setActiveTab('plaza');
      return;
    }
    setShowSkillPlazaRiskModal(true);
  };

  const handleAgreeSkillPlazaRisk = () => {
    markSkillPlazaRiskAgreed();
    setShowSkillPlazaRiskModal(false);
    setActiveTab('plaza');
  };

  useEffect(() => {
    if (activeTab !== 'installed' || updateCheckStartedRef.current) return;
    updateCheckStartedRef.current = true;

    void (async () => {
      try {
        const res = await apiFetch('/api/skills/check-updates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: false }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { updates?: { name: string }[] };
        const updates = data.updates ?? [];
        setPendingUpdateNames(new Set(updates.map((skill) => skill.name).filter(Boolean)));
      } catch {
        // Update checks are best-effort and must not block the installed skills page.
      }
    })();
  }, [activeTab]);

  const handleUpdateSkill = useCallback(async (skillName: string) => {
    if (updatingSkillId || !pendingUpdateNames.has(skillName)) return;
    setUpdatingSkillId(skillName);
    try {
      const res = await apiFetch('/api/skills/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: skillName }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        addToast({
          type: 'error',
          title: UPDATE_FAILURE_TITLE,
          message: payload.error ?? `HTTP ${res.status}`,
          duration: 5000,
        });
        return;
      }
      setPendingUpdateNames((current) => {
        const next = new Set(current);
        next.delete(skillName);
        return next;
      });
      notifySkillOptionsChanged();
      setCapabilityRefreshSignal((value) => value + 1);
      addToast({
        type: 'success',
        title: UPDATE_SUCCESS_TITLE,
        message: `"${skillName}" 已更新`,
        duration: 4000,
      });
    } catch {
      addToast({
        type: 'error',
        title: UPDATE_FAILURE_TITLE,
        message: '网络错误，请重试',
        duration: 5000,
      });
    } finally {
      setUpdatingSkillId(null);
    }
  }, [addToast, pendingUpdateNames, updatingSkillId]);

  const skillUpdates = useMemo(() => pendingUpdateNames, [pendingUpdateNames]);

  if (selectedSkill) {
    return (
      <div className="ui-page-shell gap-2 overflow-hidden">
        <SkillDetailView
          skillName={selectedSkill.skillName}
          avatarUrl={selectedSkill.avatarUrl}
          onBack={() => setSelectedSkill(null)}
        />
      </div>
    );
  }

  return (
    <div className="ui-page-shell gap-2 overflow-hidden">
      <UploadSkillModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSuccess={() => {
          setActiveTab('installed');
          setSelectedSkill(null);
          setCapabilityRefreshSignal((value) => value + 1);
          addToast({
            type: 'success',
            title: '上传成功',
            message: UPLOAD_SUCCESS_LABEL,
            duration: 4000,
          });
        }}
      />
      <AppModal
        open={showSkillPlazaRiskModal}
        onClose={() => setShowSkillPlazaRiskModal(false)}
        title={RISK_TITLE}
        panelClassName="w-[550px]"
        disableBackdropClose
        showCloseButton={true}
      >
        <div className="space-y-4 pt-[18px]">
          <p className="text-[12px] leading-[18px] text-[var(--text-secondary)]">{RISK_MESSAGE}</p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="default" onClick={() => setShowSkillPlazaRiskModal(false)}>
              取消
            </Button>
            <Button variant="major" onClick={handleAgreeSkillPlazaRisk}>
              我已同意
            </Button>
          </div>
        </div>
      </AppModal>

      <div className="ui-page-header-inline items-start border-b">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveTab('installed')}
              className={`ui-tab-trigger ${activeTab === 'installed' ? 'ui-tab-trigger-active' : ''}`}
            >
              {INSTALLED}
            </button>
            <button
              type="button"
              onClick={() => {
                handleOpenSkillPlaza();
              }}
              className={`ui-tab-trigger ${activeTab === 'plaza' ? 'ui-tab-trigger-active' : ''}`}
            >
              {SKILL_PLAZA}
            </button>
          </div>
          <div
            className="ui-tab-indicator w-[56px]"
            style={{ transform: activeTab === 'plaza' ? 'translateX(78px)' : 'translateX(0)' }}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'plaza' ? (
          <SkillsTab />
        ) : (
          <CapabilityTab
            onImport={() => setShowUpload(true)}
            onSelectSkill={setSelectedSkill}
            onUpdateSkill={handleUpdateSkill}
            skillUpdates={skillUpdates}
            updatingSkillId={updatingSkillId}
            refreshSignal={capabilityRefreshSignal}
          />
        )}
      </div>
    </div>
  );
}
