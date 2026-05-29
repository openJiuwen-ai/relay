/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { AgentId } from '@openjiuwen/relay-shared';
import { createAgentId } from '@openjiuwen/relay-shared';
import { buildACPSubprocessEnv as buildFilteredACPSubprocessEnv } from '../../../../../config/acp-env.js';
import type { RuntimeAcpModelProfile } from '../../../../../config/acp-model-profiles.js';
import type { RuntimeProviderProfile } from '../../../../../config/provider-profiles.js';
import { createModuleLogger } from '../../../../../infrastructure/logger.js';
import { resolveOfficeClawHostRoot } from '../../../../../utils/office-claw-root.js';
import type { AgentMessage, AgentService, AgentServiceOptions } from '../../types.js';
import { ACPMcpBridge, buildAcpMcpServers, resolveACPMcpTransportFromInitializeResult } from './acp-mcp-bridge.js';
import { buildACPModelProfileOverridePayload } from './acp-model-profile-override.js';
import { buildACPMetadata, collectTrailingUpdates, transformIncomingUpdateMessage } from './acp-session-helpers.js';
import { ACPStdioClient } from './acp-transport.js';

const acpLog = createModuleLogger('acp');
const ACP_RECOVERABLE_PAUSE_REASON = 'recoverable_pause';
const ACP_RECOVERABLE_PAUSE_ERROR = 'Session has a recoverable paused run; use session/resume or session/cancel';

export interface ACPAgentServiceOptions {
  agentId?: AgentId;
}

type ACPPermissionOption = {
  optionId: string;
  kind?: string;
};

function normalizeACPCommandName(command: string | undefined): string {
  if (!command) return '';
  const normalized = basename(command.replaceAll('\\', '/')).toLowerCase();
  return normalized.endsWith('.exe') ? normalized.slice(0, -4) : normalized;
}

function isOpenCodeACPProvider(providerProfile: RuntimeProviderProfile): boolean {
  return (
    providerProfile.id?.trim().toLowerCase() === 'opencode-acp' ||
    normalizeACPCommandName(providerProfile.command) === 'opencode'
  );
}

function extractPermissionOptions(value: unknown): ACPPermissionOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const optionId =
      typeof (entry as { optionId?: unknown }).optionId === 'string' ? (entry as { optionId: string }).optionId : '';
    if (!optionId) return [];
    const kind = typeof (entry as { kind?: unknown }).kind === 'string' ? (entry as { kind: string }).kind : undefined;
    return [{ optionId, kind }];
  });
}

function selectPermissionOptionId(
  providerProfile: RuntimeProviderProfile,
  params: Record<string, unknown>,
): string | null {
  const options = extractPermissionOptions(params.options);
  if (options.length === 0) return null;
  const toolCall =
    params.toolCall && typeof params.toolCall === 'object' ? (params.toolCall as Record<string, unknown>) : null;
  const permissionTitle = typeof toolCall?.title === 'string' ? toolCall.title.trim() : '';

  if (isOpenCodeACPProvider(providerProfile) && permissionTitle === 'external_directory') {
    const allowOnce = options.find((option) => option.kind === 'allow_once');
    if (allowOnce) return allowOnce.optionId;
  }

  const reject = options.find((option) => option.kind === 'reject');
  return reject?.optionId ?? null;
}

async function handleACPControlMessage(
  client: ACPStdioClient,
  incoming: Record<string, unknown> | null,
  sessionId: string | undefined,
  providerProfile: RuntimeProviderProfile,
): Promise<boolean> {
  if (!incoming || incoming.method !== 'session/request_permission') return false;
  const requestId = incoming.id;
  if (typeof requestId !== 'number' && typeof requestId !== 'string') return true;

  const params =
    incoming.params && typeof incoming.params === 'object' ? (incoming.params as Record<string, unknown>) : {};
  const messageSessionId = typeof params.sessionId === 'string' ? params.sessionId.trim() : '';
  if (sessionId && messageSessionId && messageSessionId !== sessionId) {
    await client.sendError(requestId, { code: -32000, message: 'ACP permission request session mismatch' });
    return true;
  }

  const optionId = selectPermissionOptionId(providerProfile, params);
  if (!optionId) {
    await client.sendError(requestId, { code: -32000, message: 'ACP permission request has no supported option' });
    return true;
  }

  await client.sendResult(requestId, {
    outcome: {
      outcome: 'selected',
      optionId,
    },
  });
  return true;
}

function doneMessage(agentId: AgentId, sessionId: string | undefined, metadataModel = 'acp'): AgentMessage {
  return {
    type: 'done',
    agentId,
    metadata: sessionId ? buildACPMetadata(sessionId, metadataModel) : undefined,
    timestamp: Date.now(),
  };
}

function errorMessage(agentId: AgentId, error: string, sessionId?: string, metadataModel = 'acp'): AgentMessage {
  return {
    type: 'error',
    agentId,
    error,
    metadata: sessionId ? buildACPMetadata(sessionId, metadataModel) : undefined,
    timestamp: Date.now(),
  };
}

function recoverablePauseMessage(
  agentId: AgentId,
  sessionId: string | undefined,
  metadataModel = 'acp',
  message = 'Previous ACP run is paused; resume or cancel the current session.',
): AgentMessage {
  return {
    type: 'system_info',
    agentId,
    content: JSON.stringify({
      type: 'recoverable_pause',
      agentId,
      sessionId,
      interruptReason: ACP_RECOVERABLE_PAUSE_REASON,
      message,
    }),
    metadata: sessionId ? buildACPMetadata(sessionId, metadataModel) : undefined,
    timestamp: Date.now(),
  };
}

function isRecoverablePauseResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const runStatus =
    typeof (result as { runStatus?: unknown }).runStatus === 'string'
      ? (result as { runStatus: string }).runStatus
      : '';
  return runStatus === 'paused' && (result as { recoverable?: unknown }).recoverable === true;
}

function isRecoverablePauseErrorMessage(message: string): boolean {
  return message.trim() === ACP_RECOVERABLE_PAUSE_ERROR;
}

export function supportsACPStdioMcpFromInitializeResult(result: Record<string, unknown> | undefined): boolean {
  return resolveACPMcpTransportFromInitializeResult(result) === 'stdio';
}

function buildACPExecutionCall(
  sessionId: string,
  prompt: string,
  options?: AgentServiceOptions,
): {
  method: 'session/prompt' | 'session/resume';
  params: Record<string, unknown>;
} {
  if (options?.resumeSession) {
    return { method: 'session/resume', params: { sessionId } };
  }
  return {
    method: 'session/prompt',
    params: {
      sessionId,
      prompt: [{ type: 'text', text: prompt }],
    },
  };
}

function buildACPSubprocessEnv(providerProfile: RuntimeProviderProfile): NodeJS.ProcessEnv {
  const env = buildFilteredACPSubprocessEnv(providerProfile);
  // Windows: prepend bundled Python to PATH so ACP agents (e.g. agent-teams) find the right interpreter
  if (process.platform === 'win32') {
    const bundledPythonDir = join(resolveOfficeClawHostRoot(process.cwd()), 'tools', 'python');
    if (existsSync(join(bundledPythonDir, 'python.exe'))) {
      const scriptsDir = join(bundledPythonDir, 'Scripts');
      env.PATH = `${bundledPythonDir};${scriptsDir};${process.env.PATH ?? ''}`;
    }
  }
  return env;
}
function buildSessionParams(
  providerProfile: RuntimeProviderProfile,
  workingDirectory: string | undefined,
  acpModelProfile: RuntimeAcpModelProfile | undefined,
  initializeResult: Record<string, unknown> | undefined,
  options?: AgentServiceOptions,
): Record<string, unknown> {
  const resolvedWorkingDirectory = workingDirectory ?? providerProfile.cwd;
  const mcpServers = buildAcpMcpServers(initializeResult, { ...options, workingDirectory: resolvedWorkingDirectory });
  return {
    ...(resolvedWorkingDirectory ? { cwd: resolvedWorkingDirectory } : {}),
    mcpServers,
    ...(providerProfile.modelAccessMode === 'clowder_default_profile' && acpModelProfile
      ? { modelProfileOverride: buildACPModelProfileOverridePayload(acpModelProfile) }
      : {}),
  };
}

export function summarizeACPSessionParamsForLog(
  sessionParams: Record<string, unknown>,
  initializeResult: Record<string, unknown> | undefined,
): {
  cwd?: string;
  mcpServersCount: number;
  hasModelProfileOverride: boolean;
  mcpTransport: ReturnType<typeof resolveACPMcpTransportFromInitializeResult>;
} {
  return {
    ...(typeof sessionParams.cwd === 'string' ? { cwd: sessionParams.cwd } : {}),
    mcpServersCount: Array.isArray(sessionParams.mcpServers) ? sessionParams.mcpServers.length : 0,
    hasModelProfileOverride:
      sessionParams.modelProfileOverride !== undefined && sessionParams.modelProfileOverride !== null,
    mcpTransport: resolveACPMcpTransportFromInitializeResult(initializeResult),
  };
}

export async function runACPProviderProbe(input: {
  providerProfile: RuntimeProviderProfile;
  workingDirectory?: string;
  acpModelProfile?: RuntimeAcpModelProfile;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const providerProfile = input.providerProfile;
  if (providerProfile.kind !== 'acp' || !providerProfile.command) {
    return { ok: false, error: 'ACP provider profile is incomplete' };
  }

  const probeEnv = buildACPSubprocessEnv(providerProfile);
  const probeWorkingDir = input.workingDirectory || providerProfile.cwd;
  const client = new ACPStdioClient({
    command: providerProfile.command,
    args: providerProfile.args,
    cwd: probeWorkingDir,
    env: probeEnv,
  });
  const mcpBridge = new ACPMcpBridge();
  try {
    await client.start();
    const initializeResult = await client.call('initialize', { protocolVersion: 1 });
    const sessionParams = buildSessionParams(
      providerProfile,
      input.workingDirectory,
      input.acpModelProfile,
      initializeResult,
    );
    const created = await client.call('session/new', sessionParams);
    const sessionId = typeof created.sessionId === 'string' ? created.sessionId : undefined;
    if (!sessionId) {
      return { ok: false, error: 'ACP probe did not return sessionId' };
    }
    if (resolveACPMcpTransportFromInitializeResult(initializeResult) === 'acp') {
      await mcpBridge.connectSessionServers(
        client,
        sessionId,
        Array.isArray(sessionParams.mcpServers) ? (sessionParams.mcpServers as Array<Record<string, unknown>>) : [],
      );
    }
    client.drainMessages();
    if (providerProfile.modelAccessMode === 'clowder_default_profile') {
      const promptResult = client.call('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'ping' }],
      });
      while (true) {
        const outcome = await Promise.race([
          promptResult.then(() => ({ kind: 'result' as const })),
          client.nextMessage().then((message) => ({ kind: 'message' as const, message })),
        ]);
        if (outcome.kind === 'result') break;
        if (!outcome.message) continue;
        await mcpBridge.handleInboundMessage(client, outcome.message, sessionId);
      }
    }
    return { ok: true };
  } catch (error) {
    const stderr = client.stderrText.trim();
    return { ok: false, error: stderr || (error instanceof Error ? error.message : String(error)) };
  } finally {
    await mcpBridge.disconnectSessionServers(client).catch(() => {});
    await mcpBridge.closeAll();
    await client.close();
  }
}

export class ACPAgentService implements AgentService {
  private readonly agentId: AgentId;

  constructor(options?: ACPAgentServiceOptions) {
    this.agentId = options?.agentId ?? createAgentId('acp-agent');
  }

  async *invoke(prompt: string, options?: AgentServiceOptions): AsyncIterable<AgentMessage> {
    const providerProfile = options?.providerProfile;
    const acpModelProfile = options?.acpModelProfile;
    const metadataModel = providerProfile?.id?.trim() || 'acp';
    if (providerProfile?.kind !== 'acp' || providerProfile.authType !== 'none' || !providerProfile.command) {
      yield errorMessage(this.agentId, 'ACP provider profile is not configured');
      yield doneMessage(this.agentId, undefined);
      return;
    }

    const acpEnv = buildACPSubprocessEnv(providerProfile);
    const resolvedWorkingDir = options?.workingDirectory || providerProfile.cwd;
    const client = new ACPStdioClient({
      command: providerProfile.command,
      args: providerProfile.args,
      cwd: resolvedWorkingDir,
      env: acpEnv,
    });
    let sessionId = options?.sessionId;
    const loadedExistingSession = Boolean(sessionId);
    let aborted = false;
    const mcpBridge = new ACPMcpBridge(options);
    const abortSignal = options?.signal;
    const cancelCurrentRun = async (): Promise<void> => {
      aborted = true;
      if (sessionId) {
        await client.notify('session/cancel', { sessionId }).catch(() => {});
      }
    };

    try {
      await client.start();
      const initializeResult = await client.call('initialize', { protocolVersion: 1 });

      const sessionParams = buildSessionParams(
        providerProfile,
        options?.workingDirectory,
        acpModelProfile ?? undefined,
        initializeResult,
        options,
      );
      acpLog.info({ session: summarizeACPSessionParamsForLog(sessionParams, initializeResult) }, 'ACP session params');
      const sessionMcpServers = Array.isArray(sessionParams.mcpServers)
        ? (sessionParams.mcpServers as Array<Record<string, unknown>>)
        : [];
      if (sessionId) {
        const loaded = await client.call('session/load', { sessionId, ...sessionParams });
        if (typeof loaded.sessionId === 'string' && loaded.sessionId.trim()) {
          sessionId = loaded.sessionId.trim();
        }
      } else {
        const created = await client.call('session/new', sessionParams);
        if (typeof created.sessionId !== 'string' || !created.sessionId.trim()) {
          throw new Error('ACP session/new did not return sessionId');
        }
        sessionId = created.sessionId.trim();
      }

      if (sessionId && resolveACPMcpTransportFromInitializeResult(initializeResult) === 'acp') {
        await mcpBridge.connectSessionServers(client, sessionId, sessionMcpServers);
      }
      if (!sessionId) {
        throw new Error('ACP session setup did not yield a sessionId');
      }
      if (loadedExistingSession) {
        // session/load may replay historical session/update notifications after the
        // RPC result returns, including while ACP MCP reconnect is still running.
        // Drain and discard them once session setup is fully complete.
        await collectTrailingUpdates(client, sessionId, this.agentId, metadataModel, 80, 1_500);
      }

      client.drainMessages();

      yield {
        type: 'session_init',
        agentId: this.agentId,
        sessionId,
        metadata: buildACPMetadata(sessionId, metadataModel),
        timestamp: Date.now(),
      };

      if (abortSignal?.aborted) {
        await cancelCurrentRun();
        yield doneMessage(this.agentId, sessionId, metadataModel);
        return;
      }

      const executionCall = buildACPExecutionCall(sessionId, prompt, options);
      const promptPromise = client.call(executionCall.method, executionCall.params).then(
        (result) => ({ kind: 'prompt_result' as const, result }),
        (error) => ({ kind: 'prompt_error' as const, error }),
      );
      const abortPromise = abortSignal
        ? new Promise<{ kind: 'abort' }>((resolve) => {
            abortSignal.addEventListener('abort', () => resolve({ kind: 'abort' }), { once: true });
          })
        : null;

      let nextMessagePromise = client.nextMessage().then((message) => ({ kind: 'message' as const, message }));
      let done = false;
      while (!done) {
        const outcome = abortPromise
          ? await Promise.race([promptPromise, abortPromise, nextMessagePromise])
          : await Promise.race([promptPromise, nextMessagePromise]);
        if (outcome.kind === 'abort') {
          await cancelCurrentRun();
          break;
        }
        if (outcome.kind === 'prompt_error') {
          throw outcome.error;
        }
        if (outcome.kind === 'prompt_result') {
          const pendingMessage = await Promise.race([
            nextMessagePromise,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 150)),
          ]);
          if (pendingMessage && pendingMessage.kind === 'message') {
            if (!(await mcpBridge.handleInboundMessage(client, pendingMessage.message, sessionId))) {
              if (!(await handleACPControlMessage(client, pendingMessage.message, sessionId, providerProfile))) {
                for (const message of transformIncomingUpdateMessage(
                  pendingMessage.message,
                  sessionId,
                  this.agentId,
                  metadataModel,
                )) {
                  yield message;
                }
              }
            }
          }
          for (const message of await collectTrailingUpdates(client, sessionId, this.agentId, metadataModel)) {
            yield message;
          }
          if (isRecoverablePauseResult(outcome.result)) {
            yield recoverablePauseMessage(this.agentId, sessionId, metadataModel);
          }
          done = true;
          continue;
        }
        const incoming = outcome.message;
        nextMessagePromise = client.nextMessage().then((message) => ({ kind: 'message' as const, message }));
        if (await mcpBridge.handleInboundMessage(client, incoming, sessionId)) {
          continue;
        }
        if (await handleACPControlMessage(client, incoming, sessionId, providerProfile)) {
          continue;
        }
        for (const message of transformIncomingUpdateMessage(incoming, sessionId, this.agentId, metadataModel)) {
          yield message;
        }
      }

      yield doneMessage(this.agentId, sessionId, metadataModel);
    } catch (error) {
      if (!aborted) {
        const stderr = client.stderrText.trim();
        const resolvedError = stderr || (error instanceof Error ? error.message : String(error));
        if (isRecoverablePauseErrorMessage(resolvedError)) {
          yield recoverablePauseMessage(this.agentId, sessionId, metadataModel);
        } else {
          yield errorMessage(this.agentId, resolvedError, sessionId, metadataModel);
        }
        yield doneMessage(this.agentId, sessionId, metadataModel);
      } else {
        yield doneMessage(this.agentId, sessionId, metadataModel);
      }
    } finally {
      await mcpBridge.disconnectSessionServers(client).catch(() => {});
      await mcpBridge.closeAll();
      await client.close();
    }
  }
}
