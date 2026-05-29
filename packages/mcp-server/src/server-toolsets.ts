/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  callbackMemoryTools,
  callbackTools,
  evidenceTools,
  limbTools,
  reflectTools,
  richBlockRulesTools,
  scheduleTools,
  sessionChainTools,
} from './tools/index.js';

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: never) => Promise<unknown>;
};

const collabTools: readonly ToolDef[] = [...callbackTools, ...richBlockRulesTools, ...scheduleTools];

const memoryTools: readonly ToolDef[] = [
  ...callbackMemoryTools,
  ...evidenceTools,
  ...reflectTools,
  ...sessionChainTools,
];

function resolveExcludedToolNames(): Set<string> {
  return new Set(
    (process.env.OFFICE_CLAW_MCP_EXCLUDED_TOOLS ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  );
}

function registerTools(server: McpServer, tools: readonly ToolDef[]): void {
  const excludedToolNames = resolveExcludedToolNames();
  for (const tool of tools) {
    if (excludedToolNames.has(tool.name)) continue;
    server.tool(tool.name, tool.description, tool.inputSchema, async (args) => {
      const result = await tool.handler(args as never);
      return {
        ...(result as Record<string, unknown>),
      } as { content: Array<{ type: 'text'; text: string }>; isError?: boolean; [key: string]: unknown };
    });
  }
}

export function registerCollabToolset(server: McpServer): void {
  registerTools(server, collabTools);
}

export function registerMemoryToolset(server: McpServer): void {
  registerTools(server, memoryTools);
}

export function registerSignalToolset(_server: McpServer): void {}

const limbNodeTools: readonly ToolDef[] = [...limbTools];

export function registerLimbToolset(server: McpServer): void {
  registerTools(server, limbNodeTools);
}

export function registerFullToolset(server: McpServer): void {
  registerCollabToolset(server);
  registerMemoryToolset(server);
  registerLimbToolset(server);
}

/**
 * Compact descriptions for narrow-context models (e.g. GLM-5 196K).
 * OpenAI ChatCompletions serializes tool definitions into prompt_length,
 * so verbose descriptions (GOTCHA/TIP/WORKFLOW) waste ~100K+ tokens.
 * Compact mode keeps only the first sentence of each description.
 */
const COMPACT_DESCRIPTIONS: Record<string, string> = {
  // Collab
  office_claw_post_message: 'Post an async message to OfficeClaw chat mid-task.',
  office_claw_get_pending_mentions: 'Get recent @-mentions for you. Call ack_mentions after processing.',
  office_claw_ack_mentions: 'Acknowledge processed mentions up to a message ID.',
  office_claw_get_thread_context: 'Get recent messages from a thread. Pass threadId for cross-thread.',
  office_claw_list_threads: 'List thread summaries. Filter by keyword or activeSince.',
  office_claw_feat_index: 'Lookup feature entries by featId or query.',
  office_claw_cross_post_message: 'Post a message to a different thread by threadId.',
  office_claw_list_tasks: 'List tasks with optional threadId/agentId/status filters.',
  office_claw_list_skills:
    'List OfficeClaw shared skills available at runtime. Use before search/grep for workflow tasks; retry with exact skill name if intent search is empty.',
  office_claw_load_skill: 'Load one OfficeClaw shared skill by exact name.',
  office_claw_update_task: 'Update status of a task you own (doing/blocked/done).',
  office_claw_create_rich_block:
    'Create a rich block (card/diff/checklist/media_gallery/audio/interactive). Must have kind, v:1, unique id.',
  office_claw_request_permission: 'Request user permission before a sensitive action.',
  office_claw_check_permission_status: 'Check status of a permission request by requestId.',
  office_claw_register_pr_tracking: 'Register a PR for review notification routing.',
  office_claw_update_workflow: 'Update SOP workflow stage for a Feature.',
  office_claw_multi_mention: 'Invoke up to 3 agents in parallel. Requires searchEvidenceRefs or overrideReason.',
  office_claw_get_rich_block_rules: 'Get full rich block schema rules. Call once per session before creating blocks.',
  office_claw_list_scheduled_tasks: 'List all registered scheduled tasks (builtin + dynamic) with status.',
  office_claw_list_schedule_templates: 'List available schedule task templates (reminder, web-digest, repo-activity).',
  office_claw_preview_scheduled_task: 'Preview a scheduled task draft before creating it.',
  office_claw_register_scheduled_task: 'Create a new scheduled task from a template. Preview first.',
  office_claw_update_scheduled_task: 'Update a dynamic scheduled task by ID.',
  office_claw_set_scheduled_task_enabled:
    'Cancel/stop/pause a dynamic scheduled task with enabled=false, or resume it with enabled=true, without deleting it.',
  office_claw_remove_scheduled_task:
    'Permanently delete a dynamic scheduled task record only when the user explicitly asks to delete/remove it.',
  // Memory
  office_claw_retain_memory_callback: 'Retain a durable memory item with optional tags.',
  office_claw_search_evidence: 'Search project knowledge base. Modes: lexical/semantic/hybrid.',
  office_claw_reflect: 'Ask a reflective question synthesizing project knowledge.',
  office_claw_list_session_chain: 'List session chain for a thread by agentId.',
  office_claw_read_session_events: 'Read events from a sealed session (raw/chat/handoff views).',
  office_claw_read_session_digest: 'Read extractive digest of a sealed session.',
  office_claw_read_invocation_detail: 'Read all events for a specific invocation.',
  // Limbs
  limb_list_available: 'List online limb nodes and capabilities.',
  limb_invoke: 'Invoke a capability on a limb node.',
  limb_pair_list: 'List pending limb pairing requests.',
  limb_pair_approve: 'Approve a limb pairing request.',
  // File tools (MCP-provided)
  read_file: 'Read file content by path.',
  write_file: 'Write content to a file.',
  list_files: 'List files in a directory.',
};

function compactTools(tools: readonly ToolDef[]): readonly ToolDef[] {
  return tools.map((t) => {
    const compact = COMPACT_DESCRIPTIONS[t.name];
    if (!compact) {
      console.error(`[compact-mcp] Missing compact description for tool: ${t.name}, using verbose fallback`);
    }
    return compact ? { ...t, description: compact } : t;
  });
}

/**
 * Register all tools with compact (one-line) descriptions.
 * Keeps full functionality — only descriptions are shortened.
 * Use for models where tool definitions count toward prompt_length.
 */
export function registerCompactToolset(server: McpServer): void {
  registerTools(server, compactTools(collabTools));
  registerTools(server, compactTools(memoryTools));
  registerTools(server, compactTools(limbNodeTools));
}
