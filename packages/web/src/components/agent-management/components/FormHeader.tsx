/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

interface FormHeaderProps {
  displayName: string;
  formMode: 'create' | 'edit';
  onBackToDetail: () => void;
  onBackToList: () => void;
}

export function FormHeader({ displayName, formMode, onBackToDetail, onBackToList }: FormHeaderProps) {
  if (formMode === 'create') {
    return (
      <>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToList}
            className="text-[12px] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            智能体管理
          </button>
          <span className="text-[12px] text-[var(--text-muted)]">/</span>
          <span className="text-[12px] font-bold text-[var(--text-primary)]">创建智能体</span>
        </div>
        <h2 className="text-[18px] font-bold text-[var(--text-primary)] mt-2">创建智能体</h2>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBackToList}
          className="text-[12px] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        >
          智能体管理
        </button>
        <span className="text-[12px] text-[var(--text-muted)]">/</span>
        <button
          type="button"
          onClick={onBackToDetail}
          className="text-[12px] text-[var(--text-primary)] transition hover:text-[var(--accent-primary)]"
        >
          {displayName}
        </button>
        <span className="text-[12px] text-[var(--text-muted)]">/</span>
        <span className="text-[12px] font-bold text-[var(--text-primary)]">编辑智能体</span>
      </div>
      <h2 className="text-[18px] font-bold text-[var(--text-primary)] mt-2">编辑智能体</h2>
    </>
  );
}
