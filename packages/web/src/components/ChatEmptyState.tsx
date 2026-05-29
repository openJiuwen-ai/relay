/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

interface ChatEmptyStateProps {
  onAgentsClick?: () => void;
  onChannelsClick?: () => void;
  fillAvailableHeight?: boolean;
}

interface EmptyStateCard {
  id: 'agents' | 'channels';
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
}

const heroCards: EmptyStateCard[] = [
  {
    id: 'agents',
    title: '智能体配置',
    description: '设置智能体人设，让 OfficeClaw 更了解你。',
    imageSrc: '/images/chat-empty-agent.svg',
    imageAlt: '智能体配置',
  },
  {
    id: 'channels',
    title: '一键接入渠道',
    description: '一键接入飞书、微信、钉钉、小艺渠道，无缝推进办公流程。',
    imageSrc: '/images/chat-empty-im.svg',
    imageAlt: '一键接入渠道',
  },
];

export function ChatEmptyState({ onAgentsClick, onChannelsClick, fillAvailableHeight = false }: ChatEmptyStateProps) {
  const sectionClassName = fillAvailableHeight ? 'chat-layout-rail' : 'chat-layout-rail min-h-full py-10';
  const contentClassName = fillAvailableHeight
    ? 'mx-auto flex w-full items-center justify-center'
    : 'mx-auto flex min-h-[calc(100vh-21rem)] w-full items-center justify-center';

  const handleCardClick = (cardId: EmptyStateCard['id']) => {
    if (cardId === 'agents') {
      onAgentsClick?.();
      return;
    }

    onChannelsClick?.();
  };

  return (
    <section className={sectionClassName} data-testid="chat-empty-state">
      <div className={contentClassName}>
        <div className="w-full text-center">
          <div className="mx-auto max-w-2xl">
            <h2 className="mx-auto flex w-fit flex-wrap items-center justify-center gap-2 text-[34px] font-semibold leading-tight tracking-[-0.03em] text-[var(--text-primary)] sm:text-[36px]">
              <img
                data-testid="chat-empty-officeclaw-logo"
                src="/images/OfficeClaw.svg"
                alt="OfficeClaw"
                className="h-[60px] w-auto shrink-0"
              />
            </h2>
            <p className="mx-auto mt-[8px] max-w-xl text-[16px] font-normal leading-[30px] text-[var(--text-secondary)]">
              AI深度赋能全场景办公，专家团协作决策，安全高效更懂你
            </p>
          </div>

          <div
            className="mx-auto mt-10 grid w-full grid-cols-1 gap-6 min-[1280px]:grid-cols-2"
            data-testid="chat-empty-card-grid"
          >
            {heroCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => handleCardClick(card.id)}
                className="rounded-[16px] border border-[var(--card-border)] bg-[var(--card-bg)] px-6 py-6 text-left transition-[transform,border-color,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[var(--card-hover-border)] hover:bg-[var(--card-hover-bg)] hover:shadow-[var(--card-hover-shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-panel)]"
                data-testid={`chat-empty-card-${card.id}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-panel)]">
                    <img src={card.imageSrc} alt={card.imageAlt} className="h-14 w-14 object-contain" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">{card.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-label-secondary)]">{card.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
