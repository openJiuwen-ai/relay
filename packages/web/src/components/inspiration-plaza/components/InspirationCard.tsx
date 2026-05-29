/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { type MouseEvent, useState } from 'react';
import { Button } from '@/components/shared/Button';
import { useCreateSameFlow } from '../hooks/useCreateSameFlow';
import type { InspirationTemplateListItem } from '../types';
import { CreateSessionDialog } from './CreateSessionDialog';
import { InspirationTag } from './InspirationTag';

interface InspirationCardProps {
  template: InspirationTemplateListItem;
  onClick: (template: InspirationTemplateListItem) => void;
}

export function InspirationCard({ template, onClick }: InspirationCardProps) {
  const [showDialog, setShowDialog] = useState(false);
  const createSame = useCreateSameFlow(template);

  const handleCreateSame = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setShowDialog(true);
  };

  const handleDoSameNew = (_threadId: string) => {
    void createSame({ kind: 'new' });
  };

  const handleDoSameExisting = (threadId: string) => {
    void createSame({ kind: 'existing', threadId });
  };

  return (
    <>
      <div
        data-testid="inspiration-card"
        onClick={() => onClick(template)}
        className="group w-full max-w-[490px] cursor-pointer overflow-hidden rounded-2xl border border-[#E6E6E6] bg-[var(--surface-card)] transition-shadow hover:shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
      >
        <div data-testid="inspiration-card-preview" className="h-[136px] overflow-hidden bg-[var(--surface-muted)]">
          <img
            src={template.imagePath || '/images/inspiration-products/default.svg'}
            alt={template.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.src = '/images/inspiration-products/default.svg';
            }}
          />
        </div>

        <div data-testid="inspiration-card-content" className="p-4">
          <h3
            data-testid="inspiration-card-title"
            className="mb-1 truncate text-sm font-semibold text-[var(--text-primary)]"
            title={template.name}
          >
            {template.name}
          </h3>

          <p
            data-testid="inspiration-card-description"
            className="mb-3 line-clamp-2 text-xs text-[var(--text-secondary)]"
            title={template.description}
          >
            {template.description}
          </p>

          <div className="flex min-h-[20px] flex-wrap gap-1">
            <div className="tag-row flex flex-wrap gap-1 group-hover:hidden">
              {template.tags.map((tag, index) => (
                <InspirationTag key={tag} label={tag} testId={index === 0 ? 'inspiration-card-tag' : undefined} />
              ))}
            </div>
            <div className="hidden group-hover:flex">
              <Button
                variant="ghost"
                size="sm"
                data-testid="inspiration-create-same-button"
                className="create-same-btn text-sm text-[#1476FF]"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 'auto',
                  minWidth: 0,
                  minHeight: 0,
                  padding: 0,
                  border: 0,
                  borderRadius: 0,
                  background: 'transparent',
                  color: '#1476FF',
                  fontSize: 14,
                  lineHeight: '20px',
                }}
                onClick={handleCreateSame}
              >
                创建同款
              </Button>
            </div>
          </div>
        </div>
      </div>

      <CreateSessionDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onCreateNew={handleDoSameNew}
        onSelectExisting={handleDoSameExisting}
      />
    </>
  );
}
