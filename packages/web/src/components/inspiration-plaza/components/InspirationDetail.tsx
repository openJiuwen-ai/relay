/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useMemo, useState } from 'react';
import { useRightContentHeaderOverride } from '@/components/RightContentHeaderOverrideContext';
import type { InspirationTemplateDetail } from '../types';
import { InspirationInfo } from './InspirationInfo';
import { InspirationProductPreview } from './InspirationProductPreview';

interface InspirationDetailProps {
  template: InspirationTemplateDetail;
  onBack: () => void;
}

function InspirationDetailHeaderTitle({ name, onBack }: { name: string; onBack: () => void }) {
  return (
    <div data-testid="inspiration-detail-header" className="flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="返回灵感广场"
        className="shrink-0 rounded-lg p-2 transition-colors hover:bg-[var(--surface-hover)]"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h2 className="min-w-0 flex-1 truncate pr-4 text-lg font-semibold text-[var(--text-primary)]">{name}</h2>
    </div>
  );
}

export function InspirationDetail({ template, onBack }: InspirationDetailProps) {
  const [infoPanelVisible, setInfoPanelVisible] = useState(true);
  const hasProduct = Boolean(template.productPath);

  const isScheduledWithImage = template.tags.includes('定时任务') && template.product?.type === 'image';
  const headerOverride = useMemo(
    () => ({
      leftContent: <InspirationDetailHeaderTitle name={template.name} onBack={onBack} />,
      panelToggle: {
        isOpen: infoPanelVisible,
        onToggle: () => setInfoPanelVisible((visible) => !visible),
        openLabel: '展开信息面板',
        closeLabel: '收起信息面板',
      },
    }),
    [infoPanelVisible, onBack, template.name],
  );

  useRightContentHeaderOverride(headerOverride);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <div
          data-testid="inspiration-preview-pane"
          className={['min-w-0 flex-1 overflow-hidden p-4', infoPanelVisible ? 'border-r border-[#f0f0f0]' : ''].join(
            ' ',
          )}
        >
          <div
            data-testid="inspiration-preview-surface"
            className={[
              'flex h-full flex-col',
              isScheduledWithImage ? 'bg-[url(/images/inspiration-bg.png)] bg-cover bg-center' : '',
            ].join(' ')}
          >
            <div className="flex min-h-0 flex-1 items-center justify-center">
              {hasProduct ? (
                <InspirationProductPreview product={template.product} />
              ) : (
                <div className="text-sm text-[var(--text-secondary)]">暂无产物</div>
              )}
            </div>
          </div>
        </div>
        {infoPanelVisible && (
          <div data-testid="inspiration-info-panel" className="w-[392px] min-w-[320px] shrink-0 overflow-hidden">
            <InspirationInfo template={template} />
          </div>
        )}
      </div>
    </div>
  );
}
