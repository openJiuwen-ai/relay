/*
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { ModelCard } from './ModelCard';
import type { ModelCardData, ModelCardGroup } from '../types/models-panel';

export interface ModelGroupSectionProps {
  group: ModelCardGroup;
  deletingModelId: string | null;
  editModelBusy: boolean;
  onEdit: (card: ModelCardData) => void;
  onDelete: (cardId: string, cardName: string) => void;
}

export function ModelGroupSection({ group, deletingModelId, editModelBusy, onEdit, onDelete }: ModelGroupSectionProps) {
  return (
    <section className="space-y-3">
      <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">
        {group.label} ({group.items.length})
      </h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {group.items.map((card) => (
          <ModelCard
            key={card.id}
            card={card}
            groupKey={group.key}
            deletingModelId={deletingModelId}
            editModelBusy={editModelBusy}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}