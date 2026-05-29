/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { FORM_STEPS } from '../constants';
import type { FormStepId } from '../constants';
import { MaskIcon } from '@/components/shared/MaskIcon';

interface FormStepNavProps {
  activeStep: FormStepId;
  onStepClick: (stepId: FormStepId) => void;
}

export function FormStepNav({ activeStep, onStepClick }: FormStepNavProps) {
  return (
    <nav className="flex flex-col items-start gap-0 px-2" aria-label="表单步骤">
      {FORM_STEPS.map((step) => (
        <button
          key={step.id}
          type="button"
          onClick={() => onStepClick(step.id)}
          className={`group flex w-full items-start text-left text-[12px] font-medium transition-colors ${
            activeStep === step.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'
          }`}
        >
          <span className="flex w-5 shrink-0 flex-col items-center">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-transparent">
              <MaskIcon
                src={
                  activeStep === step.id
                    ? '/images/agent-management-icons/anchor-current.svg'
                    : '/images/agent-management-icons/anchor-other.svg'
                }
                className="mt-[7px] h-2 w-2"
              />
            </span>
            {step.id !== FORM_STEPS[FORM_STEPS.length - 1].id ? (
              <span className="mt-1 h-5 w-px bg-[var(--border-default)]" aria-hidden="true" />
            ) : null}
          </span>
          <span className="ml-3 pt-[1px] leading-5">{step.label}</span>
        </button>
      ))}
    </nav>
  );
}
