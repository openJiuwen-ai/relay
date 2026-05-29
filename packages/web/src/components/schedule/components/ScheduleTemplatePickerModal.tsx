/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { AppModal } from '../../AppModal';
import type { ScheduleTemplateDefinition } from '../schedule-template-types';
import { Button } from '../../shared/Button';

interface ScheduleTemplatePickerModalProps {
  open: boolean;
  templates: ScheduleTemplateDefinition[];
  selectedTemplateId: string | null;
  loading?: boolean;
  onClose: () => void;
  onSelect: (templateId: string) => void;
  onConfirm: () => void;
}

function isTemplateSelected(selectedTemplateId: string | null, templateId: string) {
  return selectedTemplateId === templateId;
}

export function ScheduleTemplatePickerModal({
  open,
  templates,
  selectedTemplateId,
  loading = false,
  onClose,
  onSelect,
  onConfirm,
}: ScheduleTemplatePickerModalProps) {
  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="选择模板"
      panelClassName="w-[680px] max-w-[92vw]"
      bodyClassName="p-0"
      panelTestId="schedule-template-modal"
      bodyTestId="schedule-template-modal-body"
    >
      {loading ? (
        <div
          className="flex h-[420px] items-center justify-center text-[13px] text-[var(--text-secondary)]"
          data-testid="schedule-template-loading"
        >
          正在加载模板...
        </div>
      ) : (
        <>
          <div
            className="grid max-h-[420px] grid-cols-2 justify-center gap-4 overflow-y-auto pr-1"
            data-testid="schedule-template-grid"
          >
            {templates.map((template) => {
              const selected = isTemplateSelected(selectedTemplateId, template.id);
              return (
                <button
                  key={template.id}
                  type="button"
                  className={[
                    'flex h-[74px] w-[300px] items-center gap-3 rounded-[8px] border bg-[rgba(250,250,250,1)] px-4 text-left transition',
                    selected
                      ? 'border-[1.5px] border-[rgba(20,118,255,1)] bg-[rgba(240,247,255,1)]'
                      : 'border-[1px] border-[rgba(194,194,194,1)] hover:border-[rgba(20,118,255,1)]',
                  ].join(' ')}
                  onClick={() => onSelect(template.id)}
                  aria-pressed={selected}
                  data-testid={`schedule-template-option-${template.id}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#F5F7FA]">
                    <img src="/icons/schedule.svg" alt="" aria-hidden="true" className="h-4 w-4 shrink-0" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] leading-6 text-[rgba(25,25,25,1)]">{template.title}</span>
                    <span className="block truncate whitespace-nowrap text-ellipsis text-[14px] leading-5 text-[rgba(25,25,25,0.6)]">
                      {template.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="default" onClick={onClose} data-testid="schedule-template-cancel">
              取消
            </Button>
            <Button variant="major" onClick={onConfirm} disabled={!selectedTemplateId} data-testid="schedule-template-confirm">
              确定
            </Button>
          </div>
        </>
      )}
    </AppModal>
  );
}
