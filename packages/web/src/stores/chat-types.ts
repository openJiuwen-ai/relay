/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { TaskRunPersistExtra } from '@openjiuwen/relay-shared';
import type { ErrorFallbackMetadata } from '@repo/shared';

/** Content block types matching backend MessageContent */
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  url: string;
}

export interface FileContent {
  type: 'file';
  url: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
}

export type MessageContent = TextContent | ImageContent | FileContent;

/** F8: Token usage data from CLI invocations.
 *  inputTokens = TOTAL input (normalised across providers).
 *  cacheReadTokens = subset of inputTokens served from cache. */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUsd?: number;
  durationMs?: number;
  durationApiMs?: number;
  numTurns?: number;
  /** F24: context window capacity (exact when provided by backend) */
  contextWindowSize?: number;
  /** F24: most recent context usage snapshot (Codex session token_count) */
  contextUsedTokens?: number;
  /** F24: reset timestamp (epoch ms) for context quota hint */
  contextResetsAtMs?: number;
}

export interface ChatMessageMetadata {
  provider: string;
  model: string;
  sessionId?: string;
  usage?: TokenUsage;
}

export interface EvidenceResultData {
  title: string;
  anchor: string;
  snippet: string;
  confidence: 'high' | 'mid' | 'low';
  sourceType: 'decision' | 'phase' | 'discussion' | 'commit';
}

export interface EvidenceData {
  results: EvidenceResultData[];
  degraded: boolean;
  degradeReason?: string;
}

export interface ToolEvent {
  id: string;
  type: 'tool_use' | 'tool_result';
  label: string;
  detail?: string;
  timestamp: number;
  /** F142: Tool call ID for precise pairing */
  toolCallId?: string;
}

/** F22: Rich block types for frontend rendering */
export type RichBlockKind =
  | 'card'
  | 'diff'
  | 'checklist'
  | 'media_gallery'
  | 'audio'
  | 'interactive'
  | 'html_widget'
  | 'file';

/** F066 Phase 4: Card action button */
export interface CardAction {
  label: string;
  action: string;
  payload?: Record<string, unknown>;
}

export interface RichCardBlock {
  id: string;
  kind: 'card';
  v: 1;
  title: string;
  bodyMarkdown?: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
  fields?: Array<{ label: string; value: string }>;
  /** F066 Phase 4: Optional action buttons */
  actions?: CardAction[];
}

export interface RichDiffBlock {
  id: string;
  kind: 'diff';
  v: 1;
  filePath: string;
  diff: string;
  languageHint?: string;
}

export interface RichChecklistBlock {
  id: string;
  kind: 'checklist';
  v: 1;
  title?: string;
  items: Array<{ id: string; text: string; checked?: boolean }>;
}

export interface RichMediaGalleryBlock {
  id: string;
  kind: 'media_gallery';
  v: 1;
  title?: string;
  items: Array<{ url: string; alt?: string; caption?: string }>;
}

/** F34: Audio block for TTS playback.
 *  F34-b: `text` = voice message (cat "spoke" it). */
export interface RichAudioBlock {
  id: string;
  kind: 'audio';
  v: 1;
  url: string;
  /** F34-b: Voice message text. Present = voice message style. */
  text?: string;
  title?: string;
  durationSec?: number;
  mimeType?: string;
}

export interface AskUserQuestionPreview {
  title?: string;
  text: string;
  format?: 'markdown';
  editable?: boolean;
  outline_ref?: string;
  meta?: Record<string, unknown>;
}

export interface AskUserQuestionOption {
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

export interface AskUserQuestionItem {
  header: string;
  question: string;
  options: AskUserQuestionOption[];
  multi_select?: boolean;
  preview?: AskUserQuestionPreview;
}

export interface AskUserQuestionAnswer {
  question: string;
  selected_options: string[];
  custom_input: string | null;
}

export interface PendingAskUserQuestion {
  requestId: string;
  source?: string;
  questions: AskUserQuestionItem[];
  agentId?: string;
  createdAt: number;
  expiresAtMs?: number;
}

/** Active outline preview panel state */
export interface ActiveOutlinePreview {
  requestId: string;
  threadId: string;
  initialText: string;
  editedText: string;
  title: string;
  source?: string;
  panelMode: 'preview' | 'edit';
  isConfirmed?: boolean;
}

/** F096: Interactive block option */
export interface InteractiveOption {
  id: string;
  label: string;
  emoji?: string;
  /** SVG icon name from the café icon set — preferred over emoji */
  icon?: string;
  description?: string;
  level?: number;
  group?: string;
  /** When true, selecting this option shows a text input for custom user input */
  customInput?: boolean;
  /** Placeholder text for the custom input field */
  customInputPlaceholder?: string;
}

/** F096: Interactive rich block — user can select/confirm within the block */
export interface RichInteractiveBlock {
  id: string;
  kind: 'interactive';
  v: 1;
  interactiveType: 'select' | 'multi-select' | 'card-grid' | 'confirm';
  title?: string;
  description?: string;
  options: InteractiveOption[];
  maxSelect?: number;
  allowRandom?: boolean;
  messageTemplate?: string;
  disabled?: boolean;
  selectedIds?: string[];
  /** Phase C: blocks sharing the same groupId are submitted together */
  groupId?: string;
}

/** F088 Phase J: File attachment block */
export interface RichFileBlock {
  id: string;
  kind: 'file';
  v: 1;
  url: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  worktreeId?: string;
  workspacePath?: string;
}

/** F120 Phase C: Inline HTML/JS widget rendered in sandboxed iframe (srcdoc) */
export interface RichHtmlWidgetBlock {
  id: string;
  kind: 'html_widget';
  v: 1;
  /** Complete HTML document or fragment to render */
  html: string;
  /** Optional title displayed above the widget */
  title?: string;
  /** iframe height in px (default: 300) */
  height?: number;
}

export type RichBlock =
  | RichCardBlock
  | RichDiffBlock
  | RichChecklistBlock
  | RichMediaGalleryBlock
  | RichAudioBlock
  | RichInteractiveBlock
  | RichHtmlWidgetBlock
  | RichFileBlock;

/** F97: External connector source info (only when type='connector') */
export interface ConnectorSourceData {
  connector: string;
  label: string;
  icon: string;
  url?: string;
  /** F098-C2: Connector-specific metadata (e.g. targets for multi-mention) */
  meta?: Record<string, unknown>;
  /** F134: Group chat sender identity (message-level binding) */
  sender?: { id: string; name?: string };
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'connector';
  /** Visual variant for system messages and special UI-only placeholders */
  variant?:
    | 'error'
    | 'info'
    | 'warning'
    | 'tool'
    | 'evidence'
    | 'a2a_followup'
    | 'intent_recognition'
    | 'governance_blocked';
  agentId?: string;
  content: string;
  /** F97: External connector source. Present when type='connector' */
  source?: ConnectorSourceData;
  contentBlocks?: MessageContent[];
  toolEvents?: ToolEvent[];
  metadata?: ChatMessageMetadata;
  timestamp: number;
  /** F24 Phase B: Optional backend sequence number for stable ordering */
  serverSeq?: number;
  /** F098-D: When a queued message was actually dequeued and delivered to a cat */
  deliveredAt?: number;
  isStreaming?: boolean;
  evidence?: EvidenceData;
  /** F22+F52+F098-C1: Rich blocks + cross-thread origin + explicit targets */
  extra?: {
    rich?: { v: 1; blocks: RichBlock[] };
    crossPost?: { sourceThreadId: string; sourceInvocationId?: string };
    /** F081: Stream identity + invocation_complete 耗时（按消息固化，避免下一 invocation 覆盖全局状态后丢失） */
    stream?: { invocationId?: string; durationMs?: number; /** 用户手动停止生成 */ userStopped?: boolean };
    /** F098-C1: Explicit target cats from post_message API */
    targetAgents?: string[];
    /** F118 AC-C3: Timeout diagnostics for enhanced error display */
    timeoutDiagnostics?: TimeoutDiagnostics;
    /** F070: Governance blocked data for actionable bootstrap card */
    governanceBlocked?: {
      projectPath: string;
      reasonKind: 'needs_bootstrap' | 'needs_confirmation' | 'files_missing';
      invocationId?: string;
    };
    /** Error fallback metadata for backend-transformed error messages */
    errorFallback?: ErrorFallbackMetadata;
    /** Jiuwen / relay-claw: grouped thinking + tools + text per task_id */
    taskRuns?: TaskRunPersistExtra;
  };
  /** A2A chain group ID — messages in the same A2A chain share this ID */
  a2aGroupId?: string;
  /** F045: Extended thinking content, rendered as collapsible block inside assistant bubble */
  thinking?: string;
  /** Message origin: stream = CLI stdout (thinking), callback = MCP post_message (speech) */
  origin?: 'stream' | 'callback';
  /** F35: Message visibility. undefined/public = visible to all */
  visibility?: 'public' | 'whisper';
  /** F35: Whisper recipients (cat IDs). Only meaningful when visibility='whisper' */
  whisperTo?: string[];
  /** F35: Timestamp when whisper was revealed (made public) */
  revealedAt?: number;
  /** F057-C2: Whether this message mentions the user (@user / @用户) */
  mentionsUser?: boolean;
  /** F121: ID of the message this is replying to */
  replyTo?: string;
  /** F121: Server-hydrated reply preview (sender + truncated content) */
  replyPreview?: { senderAgentId: string | null; content: string; deleted?: true };
}

export type ChatMessagePatch = Omit<Partial<ChatMessage>, 'id' | 'type'>;

export interface Thread {
  id: string;
  projectPath: string;
  title: string | null;
  createdBy: string;
  participants: string[];
  lastActiveAt: number;
  createdAt: number;
  pinned?: boolean;
  pinnedAt?: number | null;
  favorited?: boolean;
  favoritedAt?: number | null;
  /** CLI stream visibility mode: play = 💭心里话 hidden cross-cat, debug = 💭心里话 shared cross-cat. 🧠Thinking (extended reasoning) is NEVER shared regardless of mode. */
  thinkingMode?: 'debug' | 'play';
  /** F32-b: Thread-level default cat preference */
  preferredAgentIds?: string[];
  /** F049: workflow phase for mission-control dispatch */
  phase?: 'coding' | 'research' | 'brainstorm';
  /** F049 Phase2: reverse link to source backlog item */
  backlogItemId?: string;
  /** F042: Thread-scoped routing policy (intent/scope). */
  routingPolicy?: ThreadRoutingPolicyV1;
  /** F095 Phase D: Soft-delete timestamp. Null/undefined = not deleted. */
  deletedAt?: number | null;
  /** F087: CVO Bootcamp onboarding state. */
  bootcampState?: BootcampStateV1;
  /** F088 Phase G: Connector Hub thread state — marks this thread as an IM Hub. */
  connectorHubState?: ConnectorHubStateV1;
  /** F140: Expert agents invited to this thread (expert-* prefixed ids). */
  invitedExpertIds?: string[];
}

/** F087: Bootcamp state for CVO onboarding threads */
export interface BootcampStateV1 {
  v: 1;
  phase: string;
  leadAgentId?: string;
  selectedTaskId?: string;
  envCheck?: Record<string, { ok: boolean; version?: string; note?: string }>;
  advancedFeatures?: Record<string, 'available' | 'unavailable' | 'skipped'>;
  startedAt: number;
  completedAt?: number;
}

/** F088 Phase G: Connector Hub state for IM command isolation */
export interface ConnectorHubStateV1 {
  v: 1;
  connectorId: string;
  externalChatId: string;
  createdAt: number;
  /** G+ audit: timestamp of the most recent command exchange routed through this hub. */
  lastCommandAt?: number;
}

export type ThreadRoutingScope = 'review' | 'architecture';

export interface ThreadRoutingRule {
  preferAgentIds?: string[];
  avoidAgentIds?: string[];
  reason?: string;
  expiresAt?: number;
}

export interface ThreadRoutingPolicyV1 {
  v: 1;
  scopes?: Partial<Record<ThreadRoutingScope, ThreadRoutingRule>>;
}

/** F24: Context health data from backend */
export interface ContextHealthData {
  usedTokens: number;
  windowTokens: number;
  fillRatio: number;
  source: 'exact' | 'approx';
  measuredAt: number;
}

/** F26: Individual task item in a cat's execution plan */
export interface TaskProgressItem {
  id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

/** F26: Task progress state for a cat's current invocation */
export interface TaskProgressState {
  tasks: TaskProgressItem[];
  lastUpdate: number;
  /** Persisted snapshot status (Redis-backed when available) */
  snapshotStatus?: 'running' | 'completed' | 'interrupted';
  /** Optional: last invocation id that produced this snapshot */
  lastInvocationId?: string;
  /** Optional: reason for interruption (best-effort) */
  interruptReason?: string;
  /** Codex reasoning fallback (no structured tasks) */
  reasoningHint?: string;
}

/** F045: Rate limit telemetry surfaced by providers (e.g. Claude rate_limit_event) */
export interface RateLimitTelemetry {
  /** Utilization fraction (0..1) when available */
  utilization?: number;
  /** ISO timestamp string for when limits reset (provider-specific) */
  resetsAt?: string;
}

/** F045: Context compaction boundary telemetry (e.g. Claude compact_boundary) */
export interface CompactBoundaryTelemetry {
  /** Pre-compaction token count when available */
  preTokens?: number;
}

export interface AgentInvocationInfo {
  sessionId?: string;
  invocationId?: string;
  durationMs?: number;
  startedAt?: number;
  usage?: TokenUsage;
  /** F24: Latest context health snapshot */
  contextHealth?: ContextHealthData;
  /** F045: Provider rate limit status (telemetry) */
  rateLimit?: RateLimitTelemetry;
  /** F045: Compaction boundary info (telemetry) */
  compactBoundary?: CompactBoundaryTelemetry;
  /** F24 Phase B: Session chain sequence number (0-based) */
  sessionSeq?: number;
  /** F24 Phase B: Whether the session was just sealed (triggers UI indicator) */
  sessionSealed?: boolean;
  /** F26: Real-time task progress from cat's tool usage */
  taskProgress?: TaskProgressState;
  /** F118 Phase C: Latest liveness warning snapshot */
  livenessWarning?: LivenessWarningSnapshot;
}

/** F118 Phase C: Liveness warning snapshot from ProcessLivenessProbe */
export interface LivenessWarningSnapshot {
  level: 'alive_but_silent' | 'suspected_stall';
  state: 'active' | 'busy-silent' | 'idle-silent' | 'dead';
  silenceDurationMs: number;
  cpuTimeMs?: number;
  processAlive: boolean;
  receivedAt: number;
}

/** F118 Phase C AC-C3: Timeout diagnostics data from CLI */
export interface TimeoutDiagnostics {
  silenceDurationMs: number;
  processAlive: boolean;
  lastEventType?: string;
  firstEventAt?: number;
  lastEventAt?: number;
  cliSessionId?: string;
  invocationId?: string;
  rawArchivePath?: string;
}

export type AgentStatusType = 'pending' | 'streaming' | 'done' | 'error' | 'alive_but_silent' | 'suspected_stall';

/** F39: Queue entry from backend InvocationQueue */
export interface QueueEntry {
  id: string;
  threadId: string;
  userId: string;
  content: string;
  /** Optional attachment display names from queue payload (for immediate queue UI rendering). */
  attachmentNames?: string[];
  /** Client-generated draft id for strict draft->entry binding. */
  clientDraftId?: string;
  messageId: string | null;
  mergedMessageIds: string[];
  source: 'user' | 'connector' | 'agent';
  targetAgents: string[];
  intent: string;
  status: 'queued' | 'processing';
  createdAt: number;
  /** F122B: auto-execute without waiting for steer */
  autoExecute?: boolean;
  /** F122B: which cat initiated this entry (for A2A handoff display) */
  callerAgentId?: string;
}

/** F39: Message delivery mode — undefined = smart default, 'queue' = enqueue, 'force' = cancel + execute */
export type DeliveryMode = 'queue' | 'force' | undefined;

/** F35: Whisper options for private outbound user messages */
export interface WhisperOptions {
  visibility: 'whisper';
  whisperTo: string[];
}

/** F101: Current game state in a thread */
export type GameState = {
  gameId: string;
  gameType: string;
  status: 'lobby' | 'playing' | 'finished';
  currentPhase: string;
  round: number;
};

/** Per-thread state — everything that varies by thread */
export interface ThreadState {
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingHistory: boolean;
  hasMore: boolean;
  /** Whether the thread has an active invocation (broader than isLoading — stays true during A2A chains) */
  hasActiveInvocation: boolean;
  /** F108: Per-invocation slot tracking — key=invocationId, value=slot info */
  activeInvocations: Record<string, { agentId: string; mode: string; startedAt?: number }>;
  intentMode: 'execute' | 'ideate' | null;
  targetAgents: string[];
  agentStatuses: Record<string, AgentStatusType>;
  agentInvocations: Record<string, AgentInvocationInfo>;
  /** F101: Active game in this thread */
  currentGame: GameState | null;
  unreadCount: number;
  /** F057-C2: Thread has an unread @user mention from a cat */
  hasUserMention: boolean;
  lastActivity: number;
  /** F39: Message queue entries for this thread */
  queue: QueueEntry[];
  /** F39: Whether the queue is paused (e.g. after cancel/failure) */
  queuePaused: boolean;
  /** F39: Why the queue is paused */
  queuePauseReason?: 'canceled' | 'failed';
  /** F39: Whether the queue is full (MAX_QUEUE_DEPTH reached) */
  queueFull: boolean;
  /** F39: Who triggered the full warning */
  queueFullSource?: 'user' | 'connector';
}

/** F097: CLI Output unified event stream */
export type CliEventKind = 'tool_use' | 'tool_result' | 'text' | 'error';
export type CliStatus = 'streaming' | 'done' | 'failed' | 'interrupted';

export interface CliEvent {
  id: string;
  kind: CliEventKind;
  timestamp: number;
  label?: string;
  detail?: string;
  content?: string;
  /** F142: Tool call ID for precise pairing */
  toolCallId?: string;
}

export const DEFAULT_THREAD_STATE: ThreadState = {
  messages: [],
  isLoading: false,
  isLoadingHistory: false,
  hasMore: true,
  hasActiveInvocation: false,
  intentMode: null,
  targetAgents: [],
  agentStatuses: {},
  agentInvocations: {},
  currentGame: null,
  unreadCount: 0,
  hasUserMention: false,
  lastActivity: 0,
  queue: [],
  activeInvocations: {},
  queuePaused: false,
  queueFull: false,
};

// ── Inspiration Plaza ──
export interface SkillRef {
  id: string;
  name: string;
  icon?: string;
}

export interface AgentRef {
  id: string;
  name: string;
  catId: string;
  icon?: string;
}

export interface InspirationPendingChatInsert {
  prompt: string;
  skills: SkillRef[];
  agents: AgentRef[];
  templateId: string;
}
