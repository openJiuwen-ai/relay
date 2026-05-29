/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { ReactNode } from 'react';

const FEATURE_CARDS = [
  {
    icon: '/images/login1.svg',
    title: '专业办公级AI PPT生产力',
    description: '专业办公级AI PPT生成能力，一键完成高质量PPT创作与美化',
  },
  {
    icon: '/images/login2.svg',
    title: '专家团思辨模式',
    description: '多智能体对等协同思辨，通过投票推选核心Leader智能体，统领指挥、协同执行复杂任务',
  },
  {
    icon: '/images/login3.svg',
    title: '预置办公场景精品Skill',
    description: '预置PPT、Word、Excel等办公场景Skill，轻松解锁高效工作流',
  },
  {
    icon: '/images/login4.svg',
    title: '全渠道接入，支持微信直连',
    description: '支持飞书、微信、钉钉、小艺等多平台接入，微信直连更便捷，实现全场景办公覆盖',
  },
] as const;

export function AuthHeroShowcase({ layout = 'split' }: { layout?: 'split' | 'standalone' }) {
  const isStandalone = layout === 'standalone';
  const containerClassName = isStandalone ? 'max-w-[760px] lg:max-w-[1120px] xl:max-w-[1280px]' : 'max-w-[760px]';
  const descriptionClassName = isStandalone ? 'max-w-xl lg:max-w-[860px]' : 'max-w-xl';

  return (
    <div className={`flex w-full flex-col items-center ${containerClassName}`}>
      <div>
        <img
          data-testid="login-hero-officeclaw-logo"
          src="/images/OfficeClaw.svg"
          alt="OfficeClaw"
          width={248}
          height={56}
          className="h-14 w-auto"
          decoding="async"
        />
      </div>

      <p className={`mt-2 mb-10 text-center text-[18px] font-normal leading-[30px] text-[#191919] ${descriptionClassName}`}>
        AI深度赋能全场景办公，专家团协作决策，安全高效更懂你
      </p>

      <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {FEATURE_CARDS.map((feature) => (
          <div
            key={feature.title}
            className="w-full min-w-0 rounded-2xl border border-white/70 bg-white/70 p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.3)] backdrop-blur-sm"
          >
            <div className="mb-3">
              <img src={feature.icon} alt={feature.title} width={32} height={32} />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-gray-900">{feature.title}</h3>
            <p className="text-sm leading-relaxed text-gray-600">{feature.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(250,222,197,0.28),_transparent_38%),linear-gradient(135deg,_#FFF8F2_0%,_#FFFFFF_56%,_#FFF4EA_100%)] px-4 py-8 sm:px-6 md:px-8 lg:px-12 lg:py-10 xl:px-16">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1280px] flex-col gap-10 lg:min-h-[calc(100vh-5rem)] lg:flex-row lg:items-center lg:gap-14">
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
          <AuthHeroShowcase />
        </div>

        <div className="w-full max-w-[450px] flex-shrink-0 lg:w-[clamp(320px,36vw,450px)]">
          <div className="mx-auto w-full rounded-[28px] border border-[#F5D7BE] bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.38)] backdrop-blur sm:p-8">
            <div className="mb-8 text-center">
              {eyebrow ? (
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.32em] text-[#D9864B]">{eyebrow}</p>
              ) : null}
              <h2 className="mb-2 text-2xl font-bold text-gray-900">{title}</h2>
              {description ? <p className="text-sm leading-6 text-gray-600">{description}</p> : null}
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
