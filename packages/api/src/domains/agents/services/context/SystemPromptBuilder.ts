/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * System Prompt Builder
 * 为每次 CLI 调用构建身份注入 prompt（~150-200 tokens）
 *
 * 纯函数，无副作用。读取 OFFICE_CLAW_CONFIGS 生成身份上下文。
 */

import type { OfficeClawConfigEntry, AgentId } from '@openjiuwen/relay-shared';
import { OFFICE_CLAW_CONFIGS, officeClawRegistry } from '@openjiuwen/relay-shared';
import {
  agentHasRole,
  getCoCreatorConfig,
  getReviewPolicy,
  getRoster,
  isAgentAvailable,
  isAgentLead,
} from '../../../../config/office-claw-config-loader.js';
import { getAgentModel } from '../../../../config/office-claw-models.js';
import type {
  BootcampStateV1,
  ThreadMentionRoutingFeedback,
  ThreadParticipantActivity,
  ThreadRoutingPolicyV1,
} from '../stores/ports/ThreadStore.js';
import { RICH_BLOCK_SHORT } from './rich-block-rules.js';

/**
 * Context for a single agent invocation
 */
export interface InvocationContext {
  /** Which agent is being invoked */
  agentId: AgentId;
  /** independent = sole responder, serial = part of a chain, parallel = concurrent ideation */
  mode: 'independent' | 'serial' | 'parallel';
  /** 1-based position in chain (only for serial mode) */
  chainIndex?: number;
  /** Total cats in chain (only for serial mode) */
  chainTotal?: number;
  /** Other cats in this invocation (for teammate awareness) */
  teammates: readonly AgentId[];
  /** Whether MCP tools are available for this agent */
  mcpAvailable: boolean;
  /** Prompt-level tags like 'critique' (from IntentParser) */
  promptTags?: readonly string[];
  /** Whether A2A collaboration prompt should be injected (only in serial/execute mode) */
  a2aEnabled?: boolean;
  /**
   * F042: Direct-message sender (A2A).
   * When present, the invoked agent MUST reply to this agent (not the user).
   */
  directMessageFrom?: AgentId;
  /**
   * F046 D3: One-shot feedback injected when previous @mention was not routed.
   * Consumed from threadStore before invocation and cleared after injection.
   */
  mentionRoutingFeedback?: ThreadMentionRoutingFeedback;
  /** F042 Wave 3: Thread-level participant activity for @ disambiguation.
   *  Sorted by lastMessageAt desc. Injected per-invocation to survive compression. */
  activeParticipants?: readonly ThreadParticipantActivity[];
  /** F042: Thread-scoped routing policy summary (intent/scope). Injected per-invocation. */
  routingPolicy?: ThreadRoutingPolicyV1;
  /**
   * F073 P4: SOP stage hint from Mission Hub workflow-sop.
   * Injected per-invocation so all cats (Claude/Codex/Gemini) see current stage.
   * 告示牌哲学：agent 看了自己决定行动，不被系统推着走。
   */
  sopStageHint?: {
    readonly stage: string;
    readonly suggestedSkill: string | null;
    readonly featureId: string;
  };
  /**
   * F091: Active Signal articles in discussion context.
   * Injected when user links a Signal article in the thread.
   */
  activeSignals?: readonly {
    readonly id: string;
    readonly title: string;
    readonly source: string;
    readonly tier: number;
    readonly contentSnippet: string;
    readonly note?: string | undefined;
    readonly relatedDiscussions?:
      | readonly {
          readonly sessionId: string;
          readonly snippet: string;
          readonly score: number;
        }[]
      | undefined;
  }[];
  /**
   * F092: Voice companion mode.
   * When true, cats should prioritize audio rich blocks for spoken output.
   */
  voiceMode?: boolean;
  /**
   * Thread ID — injected for tools that need it (e.g. bootcamp state updates).
   */
  threadId?: string;
  /**
   * Server-authoritative wall clock for this invocation.
   * Passed by routing code to keep this builder pure/deterministic for tests.
   */
  runtimeClock?: {
    readonly nowMs: number;
    readonly timezone?: string;
  };
  /**
   * F087: Bootcamp state for CVO onboarding threads.
   * When present, cats inject bootcamp-guide behavior per phase.
   */
  bootcampState?: BootcampStateV1;
}

export interface InvocationContextOptions {
  /** Keep only per-turn routing essentials for agents with their own rich system prompt. */
  compactRelayContext?: boolean;
}

export type ConfigView = Record<string, OfficeClawConfigEntry>;

interface SystemPromptBuilderApi {
  buildStaticIdentity(agentId: AgentId, options?: StaticIdentityOptions): string;
  buildInvocationContext(context: InvocationContext, options?: InvocationContextOptions): string;
  buildSystemPrompt(context: InvocationContext): string;
  buildReviewerSection(agentId: AgentId): string | null;
}

interface CallableAgentEntry {
  readonly id: string;
  readonly config: OfficeClawConfigEntry;
}

interface CallableMentionsResult {
  readonly mentions: string[];
  readonly hasDuplicateDisplayNames: boolean;
  readonly uniqueHandleExample: string | null;
}

function pickVariantMention(id: string, config: OfficeClawConfigEntry): string {
  const expected = `@${id}`.toLowerCase();
  const byId = config.mentionPatterns.find((p) => p.toLowerCase() === expected);
  if (byId) return byId;
  if (config.mentionPatterns.length > 0) {
    return [...config.mentionPatterns].sort((a, b) => a.length - b.length)[0]!;
  }
  return `@${id}`;
}

function formatHandleFreeLabel(agentId: string, config: OfficeClawConfigEntry | undefined): string {
  if (!config) return agentId;
  return `${config.displayName}(${agentId})`;
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  relayclaw: 'OfficeClaw',
};

const MCP_RICH_BLOCK_SECTION = `
${RICH_BLOCK_SHORT}
When the user asks to say/show/present something richly, consider rich blocks (audio/card/gallery/checklist/diff); call get_rich_block_rules before first use in a session.
富消息块规范详见 refs/rich-blocks.md。`;

/**
 * Skills-as-source-of-truth: MCP tools section is minimal.
 * Full specs live in refs/ (rich-blocks.md, mcp-callbacks.md).
 */
const MCP_TOOLS_SECTION = `
MCP 工具用于异步汇报等场景（token 有效期有限）：

**记忆工具（先搜后问）：**
- office_claw_search_evidence: 首选入口，搜项目知识库
- office_claw_reflect: 从项目知识中合成洞察

**记忆 drill-down 工具（search_evidence 命中后深入）：**
- office_claw_list_session_chain / office_claw_read_session_digest / office_claw_read_session_events / office_claw_read_invocation_detail：session drill-down

**协作工具：**
- office_claw_post_message / office_claw_cross_post_message / office_claw_register_pr_tracking / office_claw_get_pending_mentions / office_claw_get_thread_context / office_claw_list_threads / office_claw_update_task：异步协作
- office_claw_multi_mention：并行拉 1-3 个 agent（先搜后问，需 searchEvidenceRefs 或 overrideReason）

**共享 Skills：**office_claw_list_skills/office_claw_load_skill。先 list+load，再 search/grep/read；对比→collaborative-thinking；空结果试短词或skill名
`;

const MCP_RICH_BLOCK_TOOL_LINE = '- office_claw_create_rich_block / office_claw_get_rich_block_rules：富消息';

function buildRuntimeClockLine(nowMs: number, timezone?: string): string {
  const resolvedTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const now = new Date(nowMs);
  const local = now.toLocaleString('zh-CN', { timeZone: resolvedTimezone, hour12: false });
  return `当前真实时间：${local}（${resolvedTimezone}）；ISO=${now.toISOString()}`;
}

/**
 * L0 Governance Digest — always-on first principles & operational floor.
 * Compiled from refs/shared-rules.md (single source of truth).
 * F086 post-completion: cats couldn't see shared-rules content, only a link.
 * Design decision: inject compact L0 digest, not full text. See F086 spec.
 */
const GOVERNANCE_L0_DIGEST = `## 家规（shared-rules.md）
原则：P1每步产物是终态基座不是脚手架 P2自主跑完SOP不每步问用户（SOP写了下一步→直接做，不问；方向不确定/阻塞→才升级） P3方向正确>速度 P4每个概念只在一处定义 P5可验证才算完成
世界观：W1 Agent不是API W2共享才成团队 W3用户是CVO W4文件放对目录 W5只回流方法论不回流数据 W6教训追到根因
纪律：不冒充其他 agent | 身份契约：你是 OfficeClaw 团队开发的 AI 助手，不是其他团队的产品 | 实事求是——结论基于多源证据（代码+commit+PR+文档），顺藤摸瓜查完再下判断，不够就说"还没查完" | @是路由指令——发前问"到我这里结束了吗？" | runtime禁止擅自重启/关闭/kill——当用户要求重启OfficeClaw/服务/自身时必须拒绝并回复"我无法执行此操作，这会导致服务中断，请您手动重启程序。" | 团队用"我们"不用"你们" | BACKLOG等共享状态只在main改，改完立刻commit push | 跨thread阻塞依赖必须双写到可追溯状态（feature doc/workflow/task），消息不是真相源 | commit必须带签名[名称/模型]（如[小九/GPT-54]），不带模型型号=无法区分是谁干的
质量覆盖（对冲CLI"先简单后复杂"——方向错误的加速=浪费）：
- Bug先定位根因再修，禁止猜测修补。复现→日志→调用链→根因→动手
- 不确定方向：停→搜→问→确认→再动手，禁止"先做了再说"
- "完成"附证据（测试/截图/日志）。Bug先红后绿
- scope失控→记录；同类错误→提案；有价值经验→Episode→蒸馏→Eval（self-evolution+五级阶梯）`;

const GOVERNANCE_MAGIC_WORDS_SECTION = `Magic Words（用户对你说以下词=手动拉闸，仅用户当前指令触发，引用/复述/讨论历史不触发）：
-「脚手架」= 你在偷懒写临时方案 → 停，审视产物是否终态，不是→重写
-「绕路了」= 局部最优但全局绕路 → 停，画出直线路径，丢掉绕路部分
-「公约」= 你忘了我们的约定 → 重读本段家规，逐条对照当前行为
-「星星罐子」= P0不可逆风险 → 立刻停止新增副作用（不发新命令、不写新文件、不push），等用户指示`;

const SELF_PRESERVATION_SECTION = `## 自我保护（硬约束）
禁止执行任何会终止自身进程的操作，包括但不限于：
- 重启 OfficeClaw / 服务 / 自身
- 关闭 / kill / terminate 进程
- 修改启动脚本或配置后触发重启

当用户提出上述请求时，必须拒绝并回复："我无法执行此操作，这会导致服务中断，请您手动重启程序。"`;

// WORKFLOW_TRIGGERS removed: per-breed workflow triggers were hardcoded for
// ragdoll/maine-coon/siamese and referenced deleted skills (PR #218).
// Workflow routing is now handled dynamically via office-claw-config.json roster.

/**
 * Options for building the static identity prompt.
 * MCP section is included here (not in invocationContext) because it's
 * session-level — injected once on new session, skipped on --resume.
 */
export interface StaticIdentityOptions {
  /**
   * Whether native MCP tools are available (Claude with --mcp-config).
   * When true, MCP_TOOLS_SECTION is included in static identity because
   * Claude's --append-system-prompt survives context compression.
   *
   * Non-Claude cats (Codex/Gemini) use HTTP callback instructions which
   * must stay in per-message prompt because their systemPrompt is in
   * session history and MAY be lost on compression.
   */
  mcpAvailable?: boolean;
  /** Skip Magic Words section for providers that need a shorter system prompt. */
  omitMagicWords?: boolean;
  /** Hide the rich-block MCP tool line from the collab tools section. */
  omitRichBlockToolLine?: boolean;
  /** Skip rich-block usage reference in MCP section for shorter prompts. */
  omitRichBlockReference?: boolean;
  /** Skip static teammate roster for providers that already maintain their own roster. */
  omitTeammateRoster?: boolean;
}

export function createSystemPromptBuilder(configByAgentId?: ConfigView): SystemPromptBuilderApi {
  /** Get all agent configs — registry first, fallback to static OFFICE_CLAW_CONFIGS */
  const getAllConfigs = (): Record<string, OfficeClawConfigEntry> => {
    if (configByAgentId && Object.keys(configByAgentId).length > 0) return configByAgentId;
    const registryConfigs = officeClawRegistry.getAllConfigs();
    return Object.keys(registryConfigs).length > 0 ? registryConfigs : OFFICE_CLAW_CONFIGS;
  };

  /** Get a single agent config by ID */
  const getConfig = (agentId: string): OfficeClawConfigEntry | undefined => {
    if (configByAgentId?.[agentId]) return configByAgentId[agentId];
    const entry = officeClawRegistry.tryGet(agentId);
    if (entry) return entry.config;
    return OFFICE_CLAW_CONFIGS[agentId];
  };

  const buildCallableMentions = (currentAgentId: AgentId): CallableMentionsResult => {
    const entries: CallableAgentEntry[] = Object.entries(getAllConfigs())
      .filter(([id]) => id !== currentAgentId)
      .map(([id, config]) => ({ id, config }));

    if (entries.length === 0) {
      return { mentions: [], hasDuplicateDisplayNames: false, uniqueHandleExample: null };
    }

    const byDisplayName = new Map<string, CallableAgentEntry[]>();
    for (const entry of entries) {
      const group = byDisplayName.get(entry.config.displayName);
      if (group) {
        group.push(entry);
      } else {
        byDisplayName.set(entry.config.displayName, [entry]);
      }
    }

    const hasDuplicateDisplayNames = Array.from(byDisplayName.values()).some((group) => group.length > 1);
    const mentions: string[] = [];
    const seen = new Set<string>();
    let uniqueHandleExample: string | null = null;

    for (const entry of entries) {
      const group = byDisplayName.get(entry.config.displayName) ?? [];
      const mention =
        group.length <= 1 || entry.config.isDefaultVariant
          ? `@${entry.config.displayName}`
          : pickVariantMention(entry.id, entry.config);
      if (group.length > 1 && !entry.config.isDefaultVariant && uniqueHandleExample == null) {
        uniqueHandleExample = mention;
      }
      if (!seen.has(mention)) {
        seen.add(mention);
        mentions.push(mention);
      }
    }

    return { mentions, hasDuplicateDisplayNames, uniqueHandleExample };
  };

  /**
   * F-Ground-3: Build teammate roster table.
   * Lists all other cats with @mention, strengths, and caution.
   * Excludes the current agent. Returns null if no teammates.
   */
  const buildTeammateRoster = (currentAgentId: AgentId): string | null => {
    const allConfigs = getAllConfigs();
    const entries = Object.entries(allConfigs).filter(([id]) => id !== currentAgentId);
    if (entries.length === 0) return null;

    const rows: string[] = [];
    for (const [id, config] of entries) {
      const label = config.variantLabel
        ? `${config.displayName} ${config.variantLabel}`
        : config.nickname
          ? `${config.displayName}/${config.nickname}`
          : config.displayName;
      const mention = pickVariantMention(id, config);
      const strengths = config.teamStrengths ?? config.roleDescription;
      const caution = config.caution ?? '—';
      rows.push(`| ${label} | ${id} | ${mention} | ${strengths} | ${caution} |`);
    }

    return [
      '## 队友名册',
      '| Agent | agentId | @mention | 擅长 | 注意 |',
      '|------|------|---------|------|------|',
      ...rows,
    ].join('\n');
  };

  const buildReviewerSection = (agentId: AgentId): string | null => {
    const roster = getRoster();
    const policy = getReviewPolicy();

    if (Object.keys(roster).length === 0) return null;

    const currentEntry = roster[agentId];
    if (!currentEntry) return null;

    const crossFamily: string[] = [];
    const sameFamily: string[] = [];
    const unavailable: string[] = [];

    for (const [id, entry] of Object.entries(roster)) {
      if (id === agentId) continue;
      if (!agentHasRole(id, 'peer-reviewer')) continue;

      const config = getConfig(id);
      const displayName = config?.displayName ?? id;
      const isLead = isAgentLead(id);
      const isDifferentFamily = entry.family !== currentEntry.family;

      const tags: string[] = [];
      if (isDifferentFamily) tags.push(entry.family);
      if (isLead) tags.push('lead');
      const desc = tags.length > 0 ? ` (${tags.join(', ')})` : '';
      const mention = `@${id}`;
      const line = `- ${mention}${desc}`;

      const isEffectivelyAvailable = !policy.excludeUnavailable || isAgentAvailable(id);

      if (isEffectivelyAvailable) {
        if (isDifferentFamily) {
          crossFamily.push(line);
        } else {
          sameFamily.push(line);
        }
      } else {
        unavailable.push(`- ${mention} (${displayName}, 不可用)`);
      }
    }

    let available: string[];
    let fallbackNote: string | null = null;

    if (policy.requireDifferentFamily) {
      if (crossFamily.length > 0) {
        available = crossFamily;
      } else if (sameFamily.length > 0) {
        available = sameFamily;
        fallbackNote = '[注意] 没有跨家族 reviewer 可用，以下同家族 agent 可作为 fallback：';
      } else {
        available = [];
      }
    } else {
      available = [...crossFamily, ...sameFamily];
    }

    if (available.length === 0 && unavailable.length === 0) return null;

    const lines: string[] = ['## 你当前的 Reviewers', ''];
    if (available.length > 0) {
      if (fallbackNote) {
        lines.push(fallbackNote);
      } else {
        lines.push('根据 roster 配置，你当前可以找以下 agent review：');
      }
      lines.push(...available);
      lines.push('');
    }
    if (unavailable.length > 0) {
      lines.push('[注意] 以下 agent 当前不可用：');
      lines.push(...unavailable);
      lines.push('');
    }

    return lines.join('\n');
  };

  const buildStaticIdentity = (agentId: AgentId, options?: StaticIdentityOptions): string => {
    const config = getConfig(agentId as string);
    if (!config) return '';

    const providerLabel = PROVIDER_LABELS[config.provider] ?? config.provider;
    const lines: string[] = [];

    const nameLabel = config.nickname
      ? `${config.displayName}/${config.nickname}（${config.name}）`
      : `${config.displayName}（${config.name}）`;
    lines.push(
      `你是 ${nameLabel}，由 ${providerLabel} 提供的 AI assistant。`,
      `角色：${config.roleDescription}`,
      `性格：${config.personality}`,
      '',
    );
    lines.push(
      '渠道口径：当用户询问“支持哪些渠道/平台”时，统一口径为“只支持侧边栏可点击的渠道”。',
      '当前开放渠道仅有：飞书、微信、钉钉、小艺；不要提及其它渠道（含未开放/开发中/历史方案）。',
      '',
    );

    const { mentions: callableMentions, hasDuplicateDisplayNames, uniqueHandleExample } = buildCallableMentions(agentId);
    if (callableMentions.length > 0) {
      const exampleTarget = callableMentions[0]!;
      lines.push('## 协作');
      lines.push(`你可以 @队友: ${callableMentions.join(' / ')}`);
      if (hasDuplicateDisplayNames) {
        const example = uniqueHandleExample ?? '@opus';
        lines.push(`同族多分身时：默认 \`@显示名\`，其它用**唯一句柄**（例如 \`${example}\`）。`);
        lines.push(`同名队友并存时，请优先使用唯一句柄（例如 \`${example}\`）避免歧义。`);
      }
      lines.push('格式：另起一行行首写 @名称（行中无效，多名称各占一行），上文或下文写请求均可。');
      lines.push(`[正确] ${exampleTarget}\\n请帮忙  [正确] 内容...\\n${exampleTarget}  [错误] 行中 ${exampleTarget}`);
      lines.push('');
    }

    const rosterLines = options?.omitTeammateRoster ? null : buildTeammateRoster(agentId);
    if (rosterLines) {
      lines.push(rosterLines, '');
    }

    const coCreator = getCoCreatorConfig();
    const ccName = coCreator.name;
    const ccHandles = coCreator.mentionPatterns.map((p) => `\`${p}\``).join(' / ');
    lines.push(`${ccName}（用户/CVO）。重要决策由${ccName}拍板。需要关注时行首写 ${ccHandles}。`, '');

    lines.push('', GOVERNANCE_L0_DIGEST);
    if (!options?.omitMagicWords) {
      lines.push('', GOVERNANCE_MAGIC_WORDS_SECTION);
    }
    lines.push('', SELF_PRESERVATION_SECTION);

    if (options?.mcpAvailable) {
      const mcpToolsSection = options?.omitRichBlockToolLine
        ? MCP_TOOLS_SECTION.replace(`\n${MCP_RICH_BLOCK_TOOL_LINE}`, '')
        : MCP_TOOLS_SECTION;
      lines.push('', mcpToolsSection.trim());
      if (!options?.omitRichBlockReference) {
        lines.push('', MCP_RICH_BLOCK_SECTION.trim());
      }
    }

    return lines.join('\n');
  };

  const buildInvocationContext = (context: InvocationContext, options?: InvocationContextOptions): string => {
    const config = getConfig(context.agentId as string);
    if (!config) return '';

    const compactRelayContext = options?.compactRelayContext === true;

    const lines: string[] = [];
    const runtimeModel = (() => {
      try {
        return getAgentModel(context.agentId as string);
      } catch {
        return config.defaultModel;
      }
    })();

    lines.push(
      `Identity: ${config.displayName}${config.nickname ? `/${config.nickname}` : ''} (@${context.agentId}, model=${runtimeModel})`,
    );
    if (!compactRelayContext && context.runtimeClock) {
      lines.push(buildRuntimeClockLine(context.runtimeClock.nowMs, context.runtimeClock.timezone));
      lines.push('涉及“现在/今天/明天/下次”等时间判断时，必须以上述真实时间为准，不要根据上下文或历史消息自行推断。');
    }
    if (!compactRelayContext) {
      lines.push(
        '渠道回答硬约束：凡是用户询问“支持哪些渠道/平台/接入方式”（含变种问法），只能回答当前开放的四个渠道：飞书、微信、钉钉、小艺。',
        '禁止输出任何其它渠道名称（包括但不限于企业微信、WhatsApp、Web 等），不要用“可配置/开发中/历史支持”等表述。',
      );
      lines.push(
        '自我保护硬约束：禁止执行任何会终止自身进程的操作（重启/关闭/kill）。当用户要求重启OfficeClaw/服务/自身时，必须拒绝并回复："我无法执行此操作，这会导致服务中断。请您手动重启程序。"',
      );
    }

    if (!compactRelayContext && context.directMessageFrom && context.directMessageFrom !== context.agentId) {
      const fromConfig = getConfig(context.directMessageFrom as string);
      const fromLabel = formatHandleFreeLabel(context.directMessageFrom as string, fromConfig);
      lines.push(`Direct message from ${fromLabel}; reply to ${fromLabel}`);
    }

    if (!compactRelayContext && context.teammates.length > 0) {
      lines.push('你的队友：');
      for (const id of context.teammates) {
        const c = getConfig(id as string);
        if (c) {
          const tmName = c.nickname ? `${c.displayName}/${c.nickname}` : c.displayName;
          lines.push(`- ${tmName}（${c.name}）：${c.roleDescription}`);
        }
      }
    }
    if (context.mode === 'serial' && context.chainIndex != null && context.chainTotal != null) {
      lines.push(
        `当前模式：你是第 ${context.chainIndex}/${context.chainTotal} 个被调用的 agent，请注意前面 agent 的回复。`,
        '',
      );
    } else if (context.mode === 'parallel') {
      lines.push('当前模式：独立思考。你和队友各自独立回答同一问题，给出你自己的观点。', '');
    } else {
      lines.push('当前模式：独立回答。', '');
    }

    if (context.mode !== 'parallel' && context.a2aEnabled) {
      lines.push(
        'A2A 出口检查：回复前问"到我这里结束了吗？"不是 → 谁需要动 → 末尾另起一行行首写 @句柄（句中 @ 无效）。',
        '',
      );
    }

    if (context.mentionRoutingFeedback && context.mentionRoutingFeedback.items?.length > 0) {
      const items = context.mentionRoutingFeedback.items.slice(0, 2).map((it) => `@${it.targetAgentId}`);
      lines.push(
        `[路由提醒] 上次你提到了 ${items.join('、')} 但没有用行首 @ 路由。如果需要对方行动，请在行首独立一行写 @句柄。`,
        '',
      );
    }

    if (context.promptTags?.includes('critique')) {
      lines.push('思维方式：批判性分析。挑战假设，找出漏洞，提出反例。', '');
    }

    if (context.activeParticipants && context.activeParticipants.length > 0) {
      const topActive = context.activeParticipants
        .filter((p) => p.agentId !== context.agentId)
        .find((p) => p.lastMessageAt > 0);
      if (topActive) {
        const topConfig = getConfig(topActive.agentId as string);
        if (topConfig) {
          lines.push(`最近活跃：${formatHandleFreeLabel(topActive.agentId as string, topConfig)}`);
        }
      }
    }

    if (context.routingPolicy?.v === 1 && context.routingPolicy.scopes) {
      const toMention = (id: string): string => {
        const c = getConfig(id);
        return c ? pickVariantMention(id, c) : `@${id}`;
      };

      const parts: string[] = [];
      const scopes = context.routingPolicy.scopes;
      const order = ['review', 'architecture'] as const;
      for (const scope of order) {
        const rule = scopes[scope];
        if (!rule) continue;
        if (typeof rule.expiresAt === 'number' && rule.expiresAt > 0 && rule.expiresAt < Date.now()) continue;

        const segs: string[] = [];
        const avoidList = Array.isArray(rule.avoidCats) ? rule.avoidCats : [];
        const preferList = Array.isArray(rule.preferCats) ? rule.preferCats : [];
        const avoid = avoidList.slice(0, 3).map((id) => toMention(String(id)));
        const prefer = preferList.slice(0, 3).map((id) => toMention(String(id)));
        if (avoid.length > 0) segs.push(`avoid ${avoid.join(', ')}`);
        if (prefer.length > 0) segs.push(`prefer ${prefer.join(', ')}`);
        const sanitizedReason = typeof rule.reason === 'string' ? rule.reason.replace(/[\r\n]+/g, ' ').trim() : '';
        if (sanitizedReason) segs.push(`(${sanitizedReason})`);

        if (segs.length > 0) parts.push(`${scope} ${segs.join(' ')}`);
      }

      if (parts.length > 0) {
        lines.push(`Routing: ${parts.join('; ')}`);
      }
    }

    if (context.sopStageHint) {
      const { stage, suggestedSkill, featureId } = context.sopStageHint;
      const skillPart = suggestedSkill ? ` → load skill: ${suggestedSkill}` : '';
      lines.push(`SOP: ${featureId} stage=${stage}${skillPart}`);
    }

    if (context.voiceMode) {
      lines.push(
        'Voice Mode ON: 用户正在语音陪伴模式（AirPods，双手不空）。',
        '- 每条回复用 audio rich block 发语音（call get_rich_block_rules if unsure）',
        '- 文字是给日志看的，语音才是给用户耳朵的输出',
        '- 代码/表格/长内容仍用文字，但加一段语音摘要',
        '',
      );
    } else if (!compactRelayContext) {
      lines.push('Voice Mode OFF: 不要发 audio rich block。用文字回复即可。', '');
    }

    if (context.bootcampState) {
      const { phase, leadCat, selectedTaskId } = context.bootcampState;
      const threadPart = context.threadId ? ` thread=${context.threadId}` : '';
      lines.push(
        `Bootcamp Mode:${threadPart} phase=${phase}${leadCat ? ` leadCat=${leadCat}` : ''}${selectedTaskId ? ` task=${selectedTaskId}` : ''}`,
        '→ Act per current bootcamp phase.',
        '',
      );
    }

    if (context.activeSignals && context.activeSignals.length > 0) {
      lines.push('Signal articles linked to this thread:');
      for (const s of context.activeSignals) {
        lines.push(`### [${s.id}] ${s.title} (${s.source}/T${s.tier})`);
        if (s.note) lines.push(`Note: ${s.note}`);
        lines.push(s.contentSnippet);
        if (s.relatedDiscussions && s.relatedDiscussions.length > 0) {
          lines.push('Related past discussions:');
          for (const d of s.relatedDiscussions) {
            lines.push(`- [session:${d.sessionId}] ${d.snippet}`);
          }
        }
      }
    }

    return lines.join('\n');
  };

  const buildSystemPrompt = (context: InvocationContext): string => {
    const staticPart = buildStaticIdentity(context.agentId, {
      mcpAvailable: context.mcpAvailable,
    });
    if (!staticPart) return '';

    const parts: string[] = [staticPart];
    const reviewerSection = buildReviewerSection(context.agentId);
    if (reviewerSection) parts.push(reviewerSection);

    const dynamicPart = buildInvocationContext(context);
    if (dynamicPart) parts.push(dynamicPart);

    return parts.join('\n\n');
  };

  return {
    buildStaticIdentity,
    buildInvocationContext,
    buildSystemPrompt,
    buildReviewerSection,
  };
}

/**
 * Build static identity prompt — persistent across invocations.
 * Includes: identity, personality, rules, A2A format, workflow triggers,
 * user reference, and MCP tool documentation (session-level).
 * Suitable for --system-prompt / --append-system-prompt injection.
 */
export function buildStaticIdentity(agentId: AgentId, options?: StaticIdentityOptions, configByAgentId?: ConfigView): string {
  return createSystemPromptBuilder(configByAgentId).buildStaticIdentity(agentId, options);
}

/**
 * Build dynamic invocation context — changes per call.
 * Includes: teammates, mode, chain position, prompt tags.
 * (MCP tools and user reference moved to buildStaticIdentity for session-level injection.)
 */
export function buildInvocationContext(
  context: InvocationContext,
  options?: InvocationContextOptions,
  configByAgentId?: ConfigView,
): string {
  return createSystemPromptBuilder(configByAgentId).buildInvocationContext(context, options);
}

/**
 * F032 Phase D2: Build reviewer section for system prompt.
 * Shows available reviewers based on roster, filtered by family.
 *
 * Cloud Codex R5 P2 fix: When requireDifferentFamily is enabled but no cross-family
 * reviewers are available, show same-family reviewers as fallback options to match
 * the actual degradation behavior in resolveReviewer().
 *
 * Cloud Codex R6 P2 fix: Respect excludeUnavailable policy. When false, show
 * unavailable cats as available to match resolveReviewer() behavior.
 */
export function buildReviewerSection(agentId: AgentId, configByAgentId?: ConfigView): string | null {
  return createSystemPromptBuilder(configByAgentId).buildReviewerSection(agentId);
}

/**
 * Build identity system prompt for an agent invocation.
 * Backward-compatible: returns staticIdentity + invocationContext combined.
 * Pure function — same inputs always produce same output.
 */
export function buildSystemPrompt(context: InvocationContext, configByAgentId?: ConfigView): string {
  return createSystemPromptBuilder(configByAgentId).buildSystemPrompt(context);
}
