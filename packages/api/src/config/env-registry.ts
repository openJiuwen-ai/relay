/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Environment variable registry — single source of truth for all user-configurable env vars.
 * Used by GET /api/config/env-summary to report current values to the frontend.
 *
 * ⚠️  ALL CATS: 新增 process.env.XXX → 必须在下方 ENV_VARS 数组注册！
 *    不注册 = 前端「环境 & 文件」页面看不到 = 用户不知道 = 不存在。
 *    SOP.md「环境变量注册」章节有说明。
 *
 * To add a new env var:
 * 1. Add an EnvDefinition to ENV_VARS below
 * 2. Use process.env[name] in your code as usual
 * The "环境 & 文件" tab picks it up automatically.
 */

import { DEFAULT_CLI_TIMEOUT_LABEL } from '../utils/cli-timeout.js';
import { isHubEnvPatchAllowed } from './env-patch-whitelist.js';
import { buildConnectorEnvRefVarName, isConnectorSecretBackedEnvVarName } from './local-secret-store.js';

export type EnvCategory =
  | 'server'
  | 'storage'
  | 'budget'
  | 'cli'
  | 'proxy'
  | 'connector'
  | 'codex'
  | 'dare'
  | 'gemini'
  | 'tts'
  | 'stt'
  | 'frontend'
  | 'push'
  | 'signal'
  | 'github_review'
  | 'evidence'
  | 'search';

export interface EnvDefinition {
  /** The env var name, e.g. 'REDIS_URL' */
  name: string;
  /** Default value description (for display, not logic) */
  defaultValue: string;
  /** Human-readable description (Chinese) */
  description: string;
  /** Grouping category */
  category: EnvCategory;
  /** If true, current value is masked as '***' in API response */
  sensitive: boolean;
  /** If 'url', credentials in URL are masked but host/port/db preserved */
  maskMode?: 'url';
  /** If false, keep internal-only and do not surface in Hub env editor */
  hubVisible?: boolean;
  /** If false, value is bootstrap-only and cannot be edited at runtime from Hub */
  runtimeEditable?: boolean;
}

export const ENV_CATEGORIES: Record<EnvCategory, string> = {
  server: '服务器',
  storage: '存储',
  budget: '预算',
  cli: 'CLI',
  proxy: 'Anthropic 代理网关',
  connector: '平台接入',
  codex: 'Codex',
  dare: 'DARE',
  gemini: 'Gemini',
  tts: '语音合成 (TTS)',
  stt: '语音识别 (STT)',
  frontend: '前端',
  push: '推送通知',
  signal: 'Signal 信号源',
  github_review: 'GitHub Review 监控',
  evidence: 'F102 记忆系统',
  search: '搜索引擎',
};

const PAID_SEARCH_EDITABLE_ENV_VARS = new Set([
  'PERPLEXITY_API_KEY',
  'SERPER_API_KEY',
  'JINA_API_KEY',
  'BOCHA_API_KEY',
]);

export const ENV_VARS: EnvDefinition[] = [
  // --- server ---
  {
    name: 'API_SERVER_PORT',
    defaultValue: '3004',
    description: 'API 服务端口',
    category: 'server',
    sensitive: false,
    runtimeEditable: false,
  },
  {
    name: 'API_SERVER_HOST',
    defaultValue: '127.0.0.1',
    description: 'API 监听地址',
    category: 'server',
    sensitive: false,
  },
  { name: 'UPLOAD_DIR', defaultValue: 'data/uploads', description: '文件上传目录（默认相对 monorepo root）', category: 'server', sensitive: false },
  {
    name: 'PROJECT_ALLOWED_ROOTS',
    defaultValue: '(未设置 — 使用 denylist 模式，仅拦截系统目录)',
    description:
      'Legacy allowlist 模式：设置后切换为 allowlist，仅允许列出的根目录（按系统路径分隔符分隔；配合 PROJECT_ALLOWED_ROOTS_APPEND=true 可追加默认 roots）。未设置时使用 denylist 模式（见 PROJECT_DENIED_ROOTS）。',
    category: 'server',
    sensitive: false,
  },
  {
    name: 'PROJECT_ALLOWED_ROOTS_APPEND',
    defaultValue: 'false',
    description: '设为 true 则将 PROJECT_ALLOWED_ROOTS 追加到默认根目录（home, /tmp, /workspace 等）而非覆盖',
    category: 'server',
    sensitive: false,
  },
  {
    name: 'PROJECT_DENIED_ROOTS',
    defaultValue: '(平台默认系统目录)',
    description:
      'Denylist 模式下额外拦截的目录（按系统路径分隔符分隔，会合并到平台默认拦截列表）。仅在未设置 PROJECT_ALLOWED_ROOTS 时生效。',
    category: 'server',
    sensitive: false,
  },
  {
    name: 'OFFICE_CLAW_ENV_PATCH_WHITELIST',
    defaultValue: '(未设置 → /api/config/env 全部拒绝)',
    description: 'Hub 环境变量写回白名单；使用分号分隔，例如 DINGTALK_APP_KEY;DINGTALK_APP_SECRET',
    category: 'server',
    sensitive: false,
    hubVisible: false,
    runtimeEditable: false,
  },
  {
    name: 'FRONTEND_URL',
    defaultValue: '(自动检测)',
    description: '前端 URL（导出长图用）',
    category: 'server',
    sensitive: false,
  },
  {
    name: 'FRONTEND_PORT',
    defaultValue: '3003',
    description: '前端端口（导出长图用）',
    category: 'server',
    sensitive: false,
  },
  {
    name: 'DEFAULT_OWNER_USER_ID',
    defaultValue: '(未设置)',
    description: '默认所有者用户 ID',
    category: 'server',
    sensitive: false,
  },
  {
    name: 'OFFICE_CLAW_USER_ID',
    defaultValue: 'default-user',
    description: '当前用户 ID',
    category: 'server',
    sensitive: false,
  },
  {
    name: 'OFFICE_CLAW_HOOK_TOKEN',
    defaultValue: '(空)',
    description: 'Hook 回调鉴权 token',
    category: 'server',
    sensitive: true,
  },
  {
    name: 'RUNTIME_REPO_PATH',
    defaultValue: '(未设置)',
    description: 'Runtime 仓库路径（自动更新用）',
    category: 'server',
    sensitive: false,
  },
  {
    name: 'WORKSPACE_LINKED_ROOTS',
    defaultValue: '(未设置)',
    description: '工作区关联的项目根（冒号分隔）',
    category: 'server',
    sensitive: false,
  },
  {
    name: 'HYPERFOCUS_THRESHOLD_MS',
    defaultValue: '5400000 (90分钟)',
    description: 'Hyperfocus 健康提醒阈值',
    category: 'server',
    sensitive: false,
  },
  {
    name: 'SOCKET_IO_PING_INTERVAL_MS',
    defaultValue: '25000 (Socket.IO 默认)',
    description: 'Socket.IO ping 发送间隔；调试 WebSocket 客户端时可调大，重启 API 后生效',
    category: 'server',
    sensitive: false,
    runtimeEditable: false,
  },
  {
    name: 'SOCKET_IO_PING_TIMEOUT_MS',
    defaultValue: '20000 (Socket.IO 默认)',
    description: 'Socket.IO 等待 pong 的失效时间；Postman 手动调试时可调大，重启 API 后生效',
    category: 'server',
    sensitive: false,
    runtimeEditable: false,
  },

  // --- storage ---
  {
    name: 'REDIS_URL',
    defaultValue: '(未设置 → 内存模式)',
    description: 'Redis 连接地址',
    category: 'storage',
    sensitive: false,
    maskMode: 'url',
    runtimeEditable: false,
  },
  {
    name: 'REDIS_KEY_PREFIX',
    defaultValue: 'office-claw:',
    description: 'Redis key 命名空间前缀，用于多实例隔离',
    category: 'storage',
    sensitive: false,
    runtimeEditable: false,
  },
  {
    name: 'MEMORY_STORE',
    defaultValue: '(未设置)',
    description: '设为 1 显式允许内存模式',
    category: 'storage',
    sensitive: false,
  },
  {
    name: 'MESSAGE_TTL_SECONDS',
    defaultValue: '7776000 (3个月)',
    description: '消息过期时间',
    category: 'storage',
    sensitive: false,
  },
  {
    name: 'THREAD_TTL_SECONDS',
    defaultValue: '7776000 (3个月)',
    description: '对话过期时间',
    category: 'storage',
    sensitive: false,
  },
  {
    name: 'TASK_TTL_SECONDS',
    defaultValue: '604800 (7天)',
    description: '任务过期时间',
    category: 'storage',
    sensitive: false,
  },
  {
    name: 'BACKLOG_TTL_SECONDS',
    defaultValue: '(无过期)',
    description: 'Backlog 过期时间',
    category: 'storage',
    sensitive: false,
  },
  {
    name: 'DRAFT_TTL_SECONDS',
    defaultValue: '(无过期)',
    description: '草稿过期时间',
    category: 'storage',
    sensitive: false,
  },
  {
    name: 'TRANSCRIPT_DATA_DIR',
    defaultValue: './data/transcripts',
    description: 'Session transcript 存储目录',
    category: 'storage',
    sensitive: false,
  },

  // --- budget ---
  {
    name: 'MAX_PROMPT_CHARS',
    defaultValue: '(per-agent 默认)',
    description: '全局 prompt 字符上限',
    category: 'budget',
    sensitive: false,
    hubVisible: false,
  },
  {
    name: 'CAT_OPUS_MAX_PROMPT_CHARS',
    defaultValue: '150000',
    description: 'Claude prompt 上限',
    category: 'budget',
    sensitive: false,
    hubVisible: false,
  },
  {
    name: 'CAT_CODEX_MAX_PROMPT_CHARS',
    defaultValue: '80000',
    description: 'Codex prompt 上限',
    category: 'budget',
    sensitive: false,
    hubVisible: false,
  },
  {
    name: 'CAT_GEMINI_MAX_PROMPT_CHARS',
    defaultValue: '150000',
    description: 'Gemini prompt 上限',
    category: 'budget',
    sensitive: false,
    hubVisible: false,
  },
  {
    name: 'MAX_CONTEXT_MSG_CHARS',
    defaultValue: '1500',
    description: '单条消息上下文截断',
    category: 'budget',
    sensitive: false,
    hubVisible: false,
  },
  {
    name: 'MAX_A2A_DEPTH',
    defaultValue: '15',
    description: 'A2A 智能体互调最大深度',
    category: 'budget',
    sensitive: false,
  },
  {
    name: 'MAX_PROMPT_TOKENS',
    defaultValue: '(未设置)',
    description: '全局 prompt token 上限',
    category: 'budget',
    sensitive: false,
    hubVisible: false,
  },
  {
    name: 'WEB_PUSH_TIMEOUT_MS',
    defaultValue: '(未设置)',
    description: 'Web Push 超时时间',
    category: 'budget',
    sensitive: false,
  },

  // --- cli ---
  {
    name: 'CLI_TIMEOUT_MS',
    defaultValue: DEFAULT_CLI_TIMEOUT_LABEL,
    description: 'CLI 调用超时',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'CAT_TEMPLATE_PATH',
    defaultValue: '(repo 根 office-claw-template.json)',
    description: '智能体模板文件路径',
    category: 'cli',
    sensitive: false,
    runtimeEditable: false,
  },
  {
    name: 'OFFICE_CLAW_MCP_SERVER_PATH',
    defaultValue: '(自动检测)',
    description: 'MCP Server 路径',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'AUDIT_LOG_DIR',
    defaultValue: './data/audit-logs',
    description: '审计日志目录',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'CLI_RAW_ARCHIVE_DIR',
    defaultValue: './data/cli-raw-archive',
    description: 'CLI 原始日志归档目录',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'AUDIT_LOG_INCLUDE_PROMPT_SNIPPETS',
    defaultValue: 'false',
    description: '审计日志包含 prompt 片段',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'CAT_BRANCH_ROLLBACK_RETRY_DELAYS_MS',
    defaultValue: '1000,2000,4000',
    description: 'Branch 回滚重试间隔',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'MODE_SWITCH_REQUIRES_APPROVAL',
    defaultValue: 'true',
    description: '模式切换需要确认',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'OFFICE_CLAW_TMUX_AGENT',
    defaultValue: '(未设置)',
    description: '设为 1 启用 tmux agent 模式',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'OFFICE_CLAW_TMUX_PATH',
    defaultValue: '(未设置)',
    description: 'Tmux 可执行文件路径',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'OFFICE_CLAW_DATA_DIR',
    defaultValue: '(未设置)',
    description: '数据目录根路径',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'JIUWENCLAW_DATA_DIR',
    defaultValue: '(未设置)',
    description:
      'jiuwenclaw 用户数据根目录的绝对路径；未设置时 sidecar 使用 OFFICE_CLAW_DATA_DIR/.jiuwenclaw',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'OFFICE_CLAW_CALLBACK_TOKEN',
    defaultValue: '(未设置)',
    description: 'Callback 鉴权 token',
    category: 'cli',
    sensitive: true,
  },
  {
    name: 'OFFICE_CLAW_CALLBACK_OUTBOX_ENABLED',
    defaultValue: 'true',
    description: 'Callback outbox 是否启用',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'OFFICE_CLAW_CALLBACK_OUTBOX_DIR',
    defaultValue: '(自动)',
    description: 'Callback outbox 目录',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'OFFICE_CLAW_CALLBACK_OUTBOX_MAX_ATTEMPTS',
    defaultValue: '(默认)',
    description: 'Outbox 最大重试次数',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'OFFICE_CLAW_CALLBACK_OUTBOX_MAX_FLUSH_BATCH',
    defaultValue: '(默认)',
    description: 'Outbox 单次 flush 批量',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'OFFICE_CLAW_CALLBACK_RETRY_DELAYS_MS',
    defaultValue: '(默认)',
    description: 'Callback 重试间隔（逗号分隔）',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'CDP_DEBUG',
    defaultValue: '(未设置)',
    description: 'CDP Bridge 调试模式',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'CODEX_HOME',
    defaultValue: '~/.codex',
    description: 'Codex CLI home 目录',
    category: 'cli',
    sensitive: false,
  },
  {
    name: 'OFFICE_CLAW_API_URL',
    defaultValue: 'http://localhost:3002',
    description: 'API 服务地址（由 API 进程注入 MCP Server 子进程 env）',
    category: 'cli',
    sensitive: false,
    hubVisible: false,
  },
  {
    name: 'OFFICE_CLAW_INVOCATION_ID',
    defaultValue: '(运行时注入)',
    description: '当前 invocation ID（由 API 进程注入 MCP Server 子进程 env）',
    category: 'cli',
    sensitive: false,
    hubVisible: false,
  },
  {
    name: 'OFFICE_CLAW_AGENT_ID',
    defaultValue: '(运行时注入)',
    description: '当前智能体 ID（由 API 进程注入 MCP Server 子进程 env）',
    category: 'cli',
    sensitive: false,
    hubVisible: false,
  },
  {
    name: 'OFFICE_CLAW_DISABLE_SHARED_STATE_PREFLIGHT',
    defaultValue: '(未设置)',
    description: '设为 1 跳过 shared state preflight 检查（CI / 调试用）',
    category: 'cli',
    sensitive: false,
    hubVisible: false,
  },
  {
    name: 'OFFICE_CLAW_PREFLIGHT_TIMEOUT_MS',
    defaultValue: '30000',
    description: 'Pre-flight 操作（Redis/store 读取）的超时毫秒数，超时后降级到无 session 模式',
    category: 'cli',
    sensitive: false,
    hubVisible: false,
  },

  // --- proxy ---
  {
    name: 'ANTHROPIC_PROXY_ENABLED',
    defaultValue: '1',
    description: 'Anthropic 代理网关开关（0 关闭）',
    category: 'proxy',
    sensitive: false,
  },
  {
    name: 'ANTHROPIC_PROXY_PORT',
    defaultValue: '9877',
    description: '代理网关监听端口',
    category: 'proxy',
    sensitive: false,
  },
  {
    name: 'ANTHROPIC_PROXY_DEBUG',
    defaultValue: '(未设置)',
    description: '设为 1 启用代理调试日志',
    category: 'proxy',
    sensitive: false,
  },
  {
    name: 'ANTHROPIC_PROXY_UPSTREAMS_PATH',
    defaultValue: '.office-claw/proxy-upstreams.json',
    description: 'upstream 配置文件路径（解决 runtime 与源码分离问题）',
    category: 'proxy',
    sensitive: false,
  },

  // --- connector ---
  {
    name: 'FEISHU_APP_ID',
    defaultValue: '(未设置 → 不启用)',
    description: '飞书应用 App ID',
    category: 'connector',
    sensitive: false,
  },
  {
    name: 'FEISHU_APP_SECRET',
    defaultValue: '(未设置)',
    description: '飞书应用 App Secret',
    category: 'connector',
    sensitive: true,
  },
  {
    name: 'FEISHU_VERIFICATION_TOKEN',
    defaultValue: '(未设置)',
    description: '飞书 webhook 验证 token（仅 webhook 模式需要）',
    category: 'connector',
    sensitive: true,
  },
  {
    name: 'FEISHU_CONNECTION_MODE',
    defaultValue: 'webhook',
    description: '飞书连接模式：webhook（需公网 URL）或 websocket（长连接，无需公网）',
    category: 'connector',
    sensitive: false,
  },
  {
    name: 'DINGTALK_APP_KEY',
    defaultValue: '(未设置 → 不启用)',
    description: '钉钉应用 AppKey',
    category: 'connector',
    sensitive: false,
  },
  {
    name: 'DINGTALK_APP_SECRET',
    defaultValue: '(未设置)',
    description: '钉钉应用 AppSecret',
    category: 'connector',
    sensitive: true,
  },
  {
    name: 'XIAOYI_AGENT_ID',
    defaultValue: '(未设置 → 不启用)',
    description: '小艺智能体 Agent ID',
    category: 'connector',
    sensitive: false,
  },
  {
    name: 'XIAOYI_AK',
    defaultValue: '(未设置)',
    description: '小艺 Access Key',
    category: 'connector',
    sensitive: true,
  },
  {
    name: 'XIAOYI_SK',
    defaultValue: '(未设置)',
    description: '小艺 Secret Key',
    category: 'connector',
    sensitive: true,
  },
  {
    name: 'WECOM_BOT_ID',
    defaultValue: '(未设置 → 不启用智能机器人模式)',
    description: '企业微信智能机器人 Bot ID（WebSocket 长连接模式）',
    category: 'connector',
    sensitive: false,
  },
  {
    name: 'WECOM_BOT_SECRET',
    defaultValue: '(未设置)',
    description: '企业微信智能机器人 Bot Secret',
    category: 'connector',
    sensitive: true,
  },
  {
    name: 'WECOM_CORP_ID',
    defaultValue: '(未设置 → 不启用自建应用模式)',
    description: '企业微信企业 ID（自建应用 HTTP 回调模式）',
    category: 'connector',
    sensitive: false,
  },
  {
    name: 'WECOM_AGENT_ID',
    defaultValue: '(未设置)',
    description: '企业微信自建应用 AgentId',
    category: 'connector',
    sensitive: false,
  },
  {
    name: 'WECOM_AGENT_SECRET',
    defaultValue: '(未设置)',
    description: '企业微信自建应用 Secret',
    category: 'connector',
    sensitive: true,
  },
  {
    name: 'WECOM_TOKEN',
    defaultValue: '(未设置)',
    description: '企业微信回调 Token（HTTP 模式验签）',
    category: 'connector',
    sensitive: true,
  },
  {
    name: 'WECOM_ENCODING_AES_KEY',
    defaultValue: '(未设置)',
    description: '企业微信回调 EncodingAESKey（43字符，HTTP 模式解密用）',
    category: 'connector',
    sensitive: true,
  },

  // --- codex ---
  {
    name: 'CAT_CODEX_SANDBOX_MODE',
    defaultValue: 'danger-full-access',
    description: 'Codex 沙箱模式',
    category: 'codex',
    sensitive: false,
  },
  {
    name: 'CAT_CODEX_APPROVAL_POLICY',
    defaultValue: 'on-request',
    description: 'Codex 审批策略',
    category: 'codex',
    sensitive: false,
  },
  {
    name: 'CODEX_AUTH_MODE',
    defaultValue: 'oauth',
    description: 'Codex 认证方式 (oauth/api_key)',
    category: 'codex',
    sensitive: false,
  },
  {
    name: 'OPENAI_API_KEY',
    defaultValue: '(未设置)',
    description: 'OpenAI API Key (api_key 模式用)',
    category: 'codex',
    sensitive: true,
  },

  // --- dare ---
  { name: 'DARE_ADAPTER', defaultValue: 'openrouter', description: 'DARE 适配器', category: 'dare', sensitive: false },
  { name: 'DARE_PATH', defaultValue: '(未设置)', description: 'Dare CLI 路径', category: 'dare', sensitive: false },

  // --- gemini ---
  {
    name: 'GEMINI_ADAPTER',
    defaultValue: 'gemini-cli',
    description: 'Gemini 适配器 (gemini-cli/antigravity)',
    category: 'gemini',
    sensitive: false,
  },

  // --- tts ---
  {
    name: 'TTS_URL',
    defaultValue: 'http://localhost:9879',
    description: 'TTS 服务地址 (Qwen3-TTS)',
    category: 'tts',
    sensitive: false,
  },
  {
    name: 'TTS_CACHE_DIR',
    defaultValue: './data/tts-cache',
    description: 'TTS 音频缓存目录',
    category: 'tts',
    sensitive: false,
  },
  {
    name: 'GENSHIN_VOICE_DIR',
    defaultValue: '~/projects/.../genshin',
    description: 'GPT-SoVITS 角色模型目录',
    category: 'tts',
    sensitive: false,
  },

  // --- stt ---
  {
    name: 'WHISPER_URL',
    defaultValue: 'http://localhost:9876',
    description: 'Whisper STT 服务地址（服务端）',
    category: 'stt',
    sensitive: false,
  },

  // --- connector media ---
  {
    name: 'CONNECTOR_MEDIA_DIR',
    defaultValue: './data/connector-media',
    description: '连接器媒体下载目录',
    category: 'connector',
    sensitive: false,
  },

  // --- frontend ---
  {
    name: 'NEXT_PUBLIC_API_URL',
    defaultValue: 'http://localhost:3004',
    description: '前端连接的 API 地址',
    category: 'frontend',
    sensitive: false,
    runtimeEditable: false,
  },
  {
    name: 'NEXT_PUBLIC_WHISPER_URL',
    defaultValue: 'http://localhost:9876',
    description: 'Whisper ASR 服务地址',
    category: 'frontend',
    sensitive: false,
    runtimeEditable: false,
  },
  {
    name: 'NEXT_PUBLIC_LLM_POSTPROCESS_URL',
    defaultValue: 'http://localhost:9878',
    description: 'LLM 后处理服务地址',
    category: 'frontend',
    sensitive: false,
    runtimeEditable: false,
  },
  {
    name: 'NEXT_PUBLIC_PROJECT_ROOT',
    defaultValue: '(空)',
    description: '前端项目根路径',
    category: 'frontend',
    sensitive: false,
    runtimeEditable: false,
  },
  {
    name: 'NEXT_PUBLIC_DEBUG_SKIP_FILE_CHANGE_UI',
    defaultValue: '(未设置)',
    description: '设为 1 跳过文件变更 UI',
    category: 'frontend',
    sensitive: false,
    runtimeEditable: false,
  },

  {
    name: 'CAN_CREATE_MODEL',
    defaultValue: '0',
    description: 'Set to 1 or true to show the create model button',
    category: 'frontend',
    sensitive: false,
    runtimeEditable: false,
  },

  // --- push ---
  {
    name: 'VAPID_PUBLIC_KEY',
    defaultValue: '(未设置 → 推送不可用)',
    description: 'VAPID 公钥 (Web Push)',
    category: 'push',
    sensitive: false,
  },
  {
    name: 'VAPID_PRIVATE_KEY',
    defaultValue: '(未设置)',
    description: 'VAPID 私钥 (Web Push)',
    category: 'push',
    sensitive: true,
  },
  {
    name: 'VAPID_SUBJECT',
    defaultValue: 'mailto:office-claw@localhost',
    description: 'VAPID 联系方式 (mailto: 或 URL)',
    category: 'push',
    sensitive: false,
  },

  // --- signal ---
  {
    name: 'SIGNALS_ROOT_DIR',
    defaultValue: '(未设置)',
    description: 'Signal 信号源数据目录',
    category: 'signal',
    sensitive: false,
  },
  {
    name: 'OFFICE_CLAW_SIGNAL_USER',
    defaultValue: 'codex',
    description: 'Signal 默认执行猫',
    category: 'signal',
    sensitive: false,
  },

  // --- github_review ---
  {
    name: 'GITHUB_REVIEW_IMAP_USER',
    defaultValue: '(未设置 → 监控不启用)',
    description: 'QQ 邮箱地址',
    category: 'github_review',
    sensitive: false,
  },
  {
    name: 'GITHUB_REVIEW_IMAP_PASS',
    defaultValue: '(未设置)',
    description: 'QQ 邮箱授权码 (非登录密码)',
    category: 'github_review',
    sensitive: true,
  },
  {
    name: 'GITHUB_REVIEW_IMAP_HOST',
    defaultValue: 'imap.qq.com',
    description: 'IMAP 服务器地址',
    category: 'github_review',
    sensitive: false,
  },
  {
    name: 'GITHUB_REVIEW_IMAP_PORT',
    defaultValue: '993',
    description: 'IMAP 端口 (SSL)',
    category: 'github_review',
    sensitive: false,
  },
  {
    name: 'GITHUB_REVIEW_POLL_INTERVAL_MS',
    defaultValue: '120000',
    description: '邮件轮询间隔 (毫秒)',
    category: 'github_review',
    sensitive: false,
  },
  {
    name: 'GITHUB_MCP_PAT',
    defaultValue: '(未设置)',
    description: 'GitHub Personal Access Token (MCP 用)',
    category: 'github_review',
    sensitive: true,
  },

  // --- evidence (F102 记忆系统) ---
  {
    name: 'EMBED_MODE',
    defaultValue: 'off',
    description: '向量检索模式 (off/shadow/on)，on = 开启 Qwen3 embedding rerank',
    category: 'evidence',
    sensitive: false,
  },
  {
    name: 'F102_ABSTRACTIVE',
    defaultValue: 'off',
    description: 'Phase G 摘要调度器 (off/on)，on = 定时调用 Opus API 做 thread 摘要',
    category: 'evidence',
    sensitive: false,
  },
  {
    name: 'EMBED_URL',
    defaultValue: 'http://127.0.0.1:9880',
    description: 'Embedding 服务地址（独立 Python GPU 进程 scripts/embed-api.py）',
    category: 'evidence',
    sensitive: false,
  },
  {
    name: 'EVIDENCE_DB',
    defaultValue: '{monorepoRoot}/data/evidence.sqlite',
    description: 'F102 SQLite 数据库路径',
    category: 'evidence',
    sensitive: false,
  },
  {
    name: 'F102_API_BASE',
    defaultValue: '(未设置 → 摘要调度器不启用)',
    description: 'Phase G 摘要调度用的反代 API 地址（不是智能体自己的 provider profile）',
    category: 'evidence',
    sensitive: false,
  },
  {
    name: 'F102_API_KEY',
    defaultValue: '(未设置)',
    description: 'Phase G 摘要调度用的反代 API Key',
    category: 'evidence',
    sensitive: true,
  },

  // --- search ---
  {
    name: 'PERPLEXITY_API_KEY',
    defaultValue: '(未设置)',
    description: 'AI驱动的对话式答案引擎，实时联网搜索并直接给出带权威引用的精准回答，重塑知识探索方式',
    category: 'search',
    sensitive: true,
  },
  {
    name: 'SERPER_API_KEY',
    defaultValue: '(未设置)',
    description: '通过SerperAPI，将Google搜索功能集成到启用MCP的应用程序中，提供丰富的搜索结果,可配置的参数和高效的响应处理',
    category: 'search',
    sensitive: true,
  },
  {
    name: 'JINA_API_KEY',
    defaultValue: '(未设置)',
    description: '面向企业与开发者的神经搜索基础设施，提供多语言、多模态向量搜索与重排序能力，助力构建高性能RAG与企业搜索',
    category: 'search',
    sensitive: true,
  },
  {
    name: 'BOCHA_API_KEY',
    defaultValue: '(未设置)',
    description: '基于多模态混合检索和语义排序技术的新一代搜索引擎',
    category: 'search',
    sensitive: true,
  },
];

/** Mask credentials in a URL while preserving host/port/db for debugging. */
export function maskUrlCredentials(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.username || url.password) {
      url.username = url.username ? '***' : '';
      url.password = '';
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    // Not a valid URL — mask entirely to be safe
    return '***';
  }
}

function maskValue(def: EnvDefinition, raw: string): string {
  if (def.sensitive) return '***';
  if (def.maskMode === 'url') return maskUrlCredentials(raw);
  return raw;
}

function isHubVisibleEnvVar(def: EnvDefinition): boolean {
  return def.hubVisible !== false;
}

/**
 * Build env summary by reading current process.env values.
 * Sensitive values are masked. URL values have credentials masked.
 */
export function buildEnvSummary(): Array<EnvDefinition & { currentValue: string | null }> {
  return ENV_VARS.filter(isHubVisibleEnvVar).map((def) => {
    const raw = process.env[def.name];
    const ref = isConnectorSecretBackedEnvVarName(def.name)
      ? (process.env[buildConnectorEnvRefVarName(def.name)] ?? null)
      : null;
    const currentValue =
      raw != null && raw !== '' ? maskValue(def, raw) : ref != null && ref !== '' ? maskValue(def, ref) : null;
    const runtimeEditable = isHubEnvPatchAllowed(def.name) ? def.runtimeEditable : false;
    return { ...def, runtimeEditable, currentValue };
  });
}

export function isEditableEnvVar(def: EnvDefinition): boolean {
  return def.runtimeEditable !== false && !def.sensitive;
}

/** Connector-category sensitive fields: editable via UI but require restart. */
export function isConnectorSensitiveEditable(def: EnvDefinition): boolean {
  return def.category === 'connector' && def.sensitive && def.runtimeEditable !== false;
}

function isPaidSearchSensitiveEditable(def: EnvDefinition): boolean {
  return def.category === 'search' && def.sensitive && def.runtimeEditable !== false && PAID_SEARCH_EDITABLE_ENV_VARS.has(def.name);
}

export function isConnectorEnvVarName(name: string): boolean {
  return ENV_VARS.some((def) => def.name === name && def.category === 'connector');
}

export function isEditableEnvVarName(name: string): boolean {
  const def = ENV_VARS.find((item) => item.name === name);
  if (!def || !isHubVisibleEnvVar(def)) return false;
  if (isPaidSearchSensitiveEditable(def)) return true;
  if (!isHubEnvPatchAllowed(name)) return false;
  return isEditableEnvVar(def) || isConnectorSensitiveEditable(def);
}

/** Returns true when the env var requires a service restart to take effect. */
export function requiresRestartEnvVar(name: string): boolean {
  return ENV_VARS.some((def) => def.name === name && isConnectorSensitiveEditable(def));
}

/** Returns true when the env var is bootstrap-only and should not be hot-overridden during startup hydration. */
export function isBootstrapOnlyEnvVar(name: string): boolean {
  return ENV_VARS.some((def) => def.name === name && def.runtimeEditable === false);
}
