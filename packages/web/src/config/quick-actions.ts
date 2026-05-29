
/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export interface ExpertCardConfig {
  agentId: string;
  agentName: string;
  content: string;
  mentionTargetIds?: string[];
}

export interface QuickActionConfig {
  label: string;
  icon: string;
  show: boolean;
  prompts: Array<string>;
  /** 专家团思辨专用：包含智能体信息和内容 */
  expertCards?: ExpertCardConfig[];
}

export const QUICK_ACTIONS: QuickActionConfig[] = [
  {
    label: '定时任务',
    icon: '/icons/schedule.svg',
    show: true,
    prompts: [
      '每日 10:00 提醒我喝水，从今天开始并持续生效，任务创建后设置为立即执行。',
      '设置每天为我推送当天最新的10条科技新闻，每条新闻总结要精简。',
      '设置每天生成一个3-5分钟的睡前故事，并在每日10:00推送给我。',
    ],
  },
  {
    label: '专家团思辨',
    icon: '/icons/expert-debate.svg',
    show: true,
    prompts: [],
    expertCards: [
      {
        agentId: 'office',
        agentName: '通用助手',
        content:
          '@通用助手@逻辑大师@人文顾问，你们三个站在自己的立场讨论一下普通人在AI时代如何与AI共处，然后基于各自的观点进行深入讨论。',
        mentionTargetIds: ['office', 'assistant', 'agentteams'],
      },
      {
        agentId: 'assistant',
        agentName: '逻辑大师',
        content: '你拉着你的其他小伙伴，讨论一下传统企业数字化转型战略的规划与落地路径，整合自身核心资源形成差异化竞争力',
      },
      {
        agentId: 'agentteams',
        agentName: '人文顾问',
        content: '你拉着你的其他小伙伴，讨论一下企业该如何构建自己的AI技术壁垒，形成长期可持续的竞争力',
      },
    ],
  },
  {
    label: '文档处理',
    icon: '/icons/document-processing.svg',
    show: true,
    prompts: [
      '请以部门负责人视角，写一篇逻辑扎实、内容饱满的季度工作总结，既要体现关键成果与数据支撑，也要客观说明现存问题，并给出务实可行的下一阶段工作计划，文风正式不浮夸，可直接用于正式汇报。',
      '基于一场典型的产品迭代项目推进会，帮我自动生成一篇完整规范的会议纪要，结构清晰、要素齐全，把讨论焦点、达成共识、遗留问题、责任人与时间节点全部写清楚，格式符合企业正式文件要求。',
      '请生成一份完整的企业数字化升级解决方案，内容要包含项目背景、核心目标、实施步骤、资源配置、预算框架、风险应对和预期价值，行文专业严谨，结构完整，不用我补充任何信息即可直接使用。',
    ],
  },
  {
    label: '深度研究',
    icon: '/icons/deep-research.svg',
    show: true,
    prompts: [
      '以智能家电赛道为例，输出一份完整的竞品全景分析报告，包括产品定位、功能差异、价格体系、用户口碑、优势短板和未来布局方向，最后给出差异化竞争的可行思路。',
      '请生成一份针对都市年轻职场人群的用户需求洞察报告，完整刻画用户画像、行为习惯、真实痛点、潜在需求和消费决策逻辑，结论清晰，可直接指导产品设计。',
      '围绕银发经济赛道做一份完整市场机会分析，包括市场规模、人群结构、未被满足需求、细分切入点、竞争壁垒和长期潜力，内容扎实，可直接用于决策参考。',
    ],
  },
  {
    label: '幻灯片',
    icon: '/icons/slides.svg',
    show: true,
    prompts: [
      'OpenAI ChatGPT 5.4深度技术原理分析PPT。',
      '给我做一个详细讲解下NotebookLM的原理的PPT。',
      '生成一页华为风格的ppt，内容是关于：黄仁勋2026 GTC大会上讲话的核心观点总结，要求包含图表、数据、smart化的内容。',
    ],
  },
  {
    label: '数据分析',
    icon: '/icons/data-analysis.svg',
    show: true,
    prompts: [
      '基于电商 APP 用户原始行为数据集分析：日均访客 82000 人，页面平均停留 72 秒，首页点击率 35.6%，详情页跳转率 61%，商品加购率 12.8%，下单转化率 4.35%，7 日留存 28.5%，30 日留存 16.2%。请完整分析用户路径、时段分布、行为偏好、流失节点，输出数据结论、原因剖析以及对应的产品体验优化策略。',
      '基于抖音直播间原始漏斗全量数据：总曝光 1260000、进入直播间 412000、点击小黄车 83000、商品加购 21500、最终下单 9800、用户复购 3100。逐层计算每一环转化率与流失率，定位最高流失环节，分析流失诱因，输出分环节流量承接、转化提升的量化运营方案。',
      '已知连锁餐饮 4 月总营收环比下滑 13.5%，拆解原始维度数据：门店维度社区店下滑 8%、商圈店下滑 19%；产品维度主食类下滑 9%、小食饮品类下滑 22%；渠道维度到店消费下滑 10%、外卖渠道下滑 17%。逐层钻取量化各维度影响权重，定位核心下滑原因，给出针对性整改与资源调配方案。',
    ],
  },
  {
    label: '数据可视化',
    icon: '/icons/data-visualization.svg',
    show: true,
    prompts: [
      '请设计一套逻辑清晰、美观实用的业务数据监控看板，明确核心指标、图表类型、页面布局、配色风格和筛选交互方式，结构完整可直接交给设计落地。',
      '请设计一套用户行为分析专用可视化图表，包括漏斗图、热力图、留存曲线、地域分布，直观呈现用户规律，专业清晰。',
      '请设计一套规范专业的财务数据可视化图表，包含趋势变化、结构占比、同比对比等类型，符合正式财务汇报的严谨性要求。',
    ],
  },
  {
    label: '金融服务',
    icon: '/icons/financial-services.svg',
    show: true,
    prompts: [
      '请以普通中产家庭为对象，生成一份完整可执行的理财规划方案，包含现金管理、保障配置、权益与固收配比、风险控制和长期执行步骤，实用易懂。',
      '请生成一份公募基金投资分析报告，讲清楚基金选择逻辑、配置思路、定投方法和风险控制要点，语言通俗，普通投资者能看懂能用。',
      '请以科技赛道龙头为例，生成一份完整个股价值分析报告，包括业务、财务、行业地位、估值、核心逻辑与风险，客观中立具备参考性。',
    ],
  },
  {
    label: '视频生成',
    icon: '/icons/video-generation.svg',
    show: false,
    prompts: [
      '基于这份新品发布会的PPT脚本，生成一段30秒的宣传视频。',
      '帮我制作一段员工培训视频，内容是关于新上线的办公系统操作教程，要求画面清晰、步骤讲解详细，添加字幕和操作指引标注，视频时长控制在8分钟以内。',
      '以公司年度大事记为内容，生成一段3分钟的回顾视频，采用温暖怀旧的风格，搭配舒缓的音乐，插入真实的公司活动照片和员工采访片段。',
    ],
  },
  {
    label: '内容核查',
    icon: '/icons/query_the_optical_power_border.svg',
    show: false,
    prompts: [],
  },
];
