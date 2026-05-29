/*
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { NameInitialIcon } from '@/components/NameInitialIcon';
import { OverflowTooltip } from '@/components/shared/OverflowTooltip';
import { formatCustomModelUpdatedAt, resolveUploadedIconUrl, VENDOR_ICON, HUAWEI_MAAS_PROTOCOL, HUAWEI_MAAS_GROUP_KEY } from '../utils';
import type { ModelCardData } from '../types/models-panel';

function ClockIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12L15 13.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export interface ModelCardProps {
  card: ModelCardData;
  groupKey: string;
  deletingModelId: string | null;
  editModelBusy: boolean;
  onEdit: (card: ModelCardData) => void;
  onDelete: (cardId: string, cardName: string) => void;
}

export function ModelCard({ card, groupKey, deletingModelId, editModelBusy, onEdit, onDelete }: ModelCardProps) {
  const cardIconSrc = resolveUploadedIconUrl(card.icon);
  const customModelUpdatedAt = card.protocol !== HUAWEI_MAAS_PROTOCOL ? formatCustomModelUpdatedAt(card.updatedAt) : null;

  return (
    <article
      className={[
        'ui-card',
        groupKey === HUAWEI_MAAS_GROUP_KEY ? null : 'ui-card-hover',
        'group flex min-h-[194px] flex-col gap-4',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div>
        <div className="flex items-start gap-3">
          {cardIconSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cardIconSrc}
              alt={`${card.name} icon`}
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 rounded-[var(radius-xs)] object-cover"
              data-testid={`model-card-icon-${card.id}`}
            />
          ) : (
            <div className="h-12 w-12 shrink-0 rounded-[var(radius-xs)]">
              <NameInitialIcon
                name={card.name}
                dataTestId={`model-card-icon-${card.id}`}
                className="h-full w-full rounded-[var(--radius-md)] border-0 shadow-none"
              />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <OverflowTooltip
                content={card.name}
                className="min-w-0 flex-1"
                as="h4"
                textClassName="block truncate text-[var(--font-size-xl)] font-semibold text-[var(--text-primary)]"
              />
            </div>
            {card.labels.length > 0 ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {card.labels.map((label, index) => (
                  <span key={`${card.id}-label-${label}-${index}`} className="ui-badge-muted">
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <OverflowTooltip content={card.description} className="w-full">
        <p className="text-[14px] min-h-[44px] leading-[22px] text-[var(--text-secondary)] line-clamp-2 break-all overflow-hidden">
          {card.description || card.name}
        </p>
      </OverflowTooltip>

      <div className="flex items-end justify-between gap-3">
        <div className="min-h-5 text-xs leading-[24px]">
          {card.protocol !== HUAWEI_MAAS_PROTOCOL ? (
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)] transition-opacity duration-200 group-hover:opacity-0">
                {customModelUpdatedAt ? (
                  <>
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center"
                      data-testid={`model-card-updated-at-icon-${card.id}`}
                    >
                      <ClockIcon />
                    </span>
                    <span data-testid={`model-card-updated-at-${card.id}`}>
                      {customModelUpdatedAt}
                    </span>
                  </>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={VENDOR_ICON}
                      alt={`${card.developer} icon`}
                      width={16}
                      height={16}
                      className="h-4 w-4 rounded-sm object-cover"
                    />
                    <span>{card.developer}</span>
                  </>
                )}
              </span>
              <div className="absolute left-0 top-0 flex items-center whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <button
                  type="button"
                  data-testid={`model-card-edit-${card.id}`}
                  disabled={editModelBusy}
                  onClick={() => onEdit(card)}
                  className="whitespace-nowrap text-[14px] font-bold leading-[24px] text-[var(--text-accent)] hover:underline hover:underline-offset-2 disabled:opacity-50"
                  style={{ textUnderlineOffset: '4px' }}
                >
                  编辑
                </button>
                <button
                  type="button"
                  disabled={deletingModelId === card.id}
                  onClick={() => onDelete(card.id, card.name)}
                  data-testid={`model-card-delete-${card.id}`}
                  className="ml-[24px] whitespace-nowrap text-[14px] font-bold leading-[24px] text-[var(--text-accent)] hover:underline hover:underline-offset-2 disabled:opacity-50"
                  style={{ textUnderlineOffset: '4px' }}
                >
                  {deletingModelId === card.id ? '删除中...' : '删除'}
                </button>
              </div>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={VENDOR_ICON}
                alt={`${card.developer} icon`}
                width={16}
                height={16}
                className="h-4 w-4 rounded-sm object-cover"
              />
              <span>{card.developer}</span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}