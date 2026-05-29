/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { SearchInput } from '@/components/shared/SearchInput';
import { Select } from '@/components/shared/Select';
import { Tab } from '@/components/shared/Tab';
import { InspirationCardGrid } from './components/InspirationCardGrid';
import { InspirationDetail } from './components/InspirationDetail';
import { useInspirationDetail } from './hooks/useInspirationDetail';
import { useInspirationTemplates } from './hooks/useInspirationTemplates';
import type { InspirationTemplateListItem, ProductType, TemplateCategory } from './types';
import { TEMPLATE_CATEGORIES } from './types';

const TAB_ITEMS = TEMPLATE_CATEGORIES.map((cat) => ({ value: cat, label: cat }));
type ProductTypeFilter = ProductType | '全部';
const PLAZA_PAGE_CLASS = 'mx-auto h-full w-full max-w-[1920px]';

const PRODUCT_TYPE_OPTIONS: Array<{ value: ProductTypeFilter; label: string }> = [
  { value: '全部', label: '全部类型' },
  { value: 'html', label: 'HTML' },
  { value: 'word', label: '文档' },
  { value: 'excel', label: '表格' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'image', label: '图片' },
];

export function InspirationPlaza() {
  const [activeTab, setActiveTab] = useState<TemplateCategory>('全部');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [productType, setProductType] = useState<ProductTypeFilter>('全部');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const { templates, total, isLoading, refetch } = useInspirationTemplates({
    category: activeTab,
    keyword: searchKeyword,
    productType,
  });
  const {
    template: selectedTemplate,
    isLoading: isDetailLoading,
    error: detailError,
  } = useInspirationDetail(selectedTemplateId);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab as TemplateCategory);
    setSearchKeyword('');
    setSelectedTemplateId(null);
  };

  const handleCardClick = (template: InspirationTemplateListItem) => {
    setSelectedTemplateId(template.id);
  };

  const handleBack = () => {
    setSelectedTemplateId(null);
  };

  // Detail view
  if (selectedTemplateId) {
    return (
      <div className={PLAZA_PAGE_CLASS}>
        {isDetailLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
            加载灵感详情中...
          </div>
        ) : selectedTemplate ? (
          <InspirationDetail template={selectedTemplate} onBack={handleBack} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
            {detailError ?? '灵感详情不可用'}
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className={`${PLAZA_PAGE_CLASS} flex flex-col px-8 py-8`}>
      {/* Tabs */}
      <div data-testid="inspiration-tabs-section">
        <Tab items={TAB_ITEMS} value={activeTab} onChange={handleTabChange} />
      </div>

      <div data-testid="inspiration-total-heading" className="mt-6 text-xl font-semibold text-[var(--text-primary)]">
        全部（{total}）
      </div>

      {/* Search area */}
      <div data-testid="inspiration-search-section" className="mt-6 flex items-center gap-3">
        <Select
          aria-label="类型筛选"
          value={productType}
          options={PRODUCT_TYPE_OPTIONS}
          onChange={setProductType}
          className="w-[160px] shrink-0"
        />
        <SearchInput
          value={searchKeyword}
          onChange={setSearchKeyword}
          onClear={() => setSearchKeyword('')}
          placeholder="搜索灵感..."
          wrapperClassName="min-w-0 flex-1"
          inputClassName="h-8"
        />
        <Button
          variant="default"
          size="lg"
          onlyIcon
          hasBorder
          aria-label="刷新灵感列表"
          data-testid="inspiration-refresh-button"
          className="shrink-0"
          iconLeft={<img src="/icons/icon-refresh.svg" alt="" className="h-4 w-4" />}
          onClick={refetch}
        />
      </div>

      {/* Content */}
      <div data-testid="inspiration-card-section" className="mt-6 flex-1 overflow-y-auto">
        <InspirationCardGrid templates={templates} isLoading={isLoading} onCardClick={handleCardClick} />
      </div>
    </div>
  );
}
