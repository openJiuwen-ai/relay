/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServerDescriptor } from '@openjiuwen/relay-shared';
import type { StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { JSONRPCMessage, JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';
import {
  isJSONRPCErrorResponse,
  isJSONRPCNotification,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  JSONRPC_VERSION,
} from '@modelcontextprotocol/sdk/types.js';
import type { AgentServiceOptions } from '../../types.js';
import { ACPRequestError, ACPStdioClient } from './acp-transport.js';
import { buildOfficeClawMcpRequestConfig } from './relayclaw-office-claw-mcp.js';

export type ACPMcpTransport = 'acp' | 'stdio';

export function resolveACPMcpTransportFromInitializeResult(
  result: Record<string, unknown> | undefined,
): ACPMcpTransport | null {
  const agentCapabilities =
    result && typeof result === 'object' && result.agentCapabilities && typeof result.agentCapabilities === 'object'
      ? (result.agentCapabilities as { mcpCapabilities?: unknown })
      : null;
  if (!agentCapabilities || agentCapabilities.mcpCapabilities === undefined) return 'stdio';
  const capabilities =
    agentCapabilities.mcpCapabilities && typeof agentCapabilities.mcpCapabilities === 'object'
      ? (agentCapabilities.mcpCapabilities as Record<string, unknown>)
      : null;
  if (!capabilities) return 'stdio';
  if (capabilities.acp === true) return 'acp';
  if (capabilities.stdio === true) return 'stdio';
  return null;
}

export function buildAcpMcpServers(
  initializeResult: Record<string, unknown> | undefined,
  options?: AgentServiceOptions,
): Array<Record<string, unknown>> {
  const transport = resolveACPMcpTransportFromInitializeResult(initializeResult);
  if (!transport) return [];
  if (transport === 'acp') {
    return [
      {
        id: 'office-claw',
        name: 'office-claw',
        transport: 'acp',
        acpId: 'office-claw',
      },
    ];
  }
  const servers = readProjectMcpServers(options?.workingDirectory);
  const officeClawMcp = buildOfficeClawMcpRequestConfig(options);
  if (officeClawMcp) {
    servers.unshift({
      id: 'office-claw',
      name: 'office-claw',
      transport: 'stdio',
      ...officeClawMcp,
    });
  }
  return servers;
}

function readProjectMcpServers(workingDirectory?: string): Array<Record<string, unknown>> {
  if (!workingDirectory) return [];
  const filePath = join(workingDirectory, '.mcp.json');
  if (!existsSync(filePath)) return [];

  try {
    // Keep the ACP relay aligned with the project's Claude MCP config.
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const servers =
      data && typeof data === 'object' && !Array.isArray(data) && data.mcpServers && typeof data.mcpServers === 'object'
        ? data.mcpServers
        : null;
    if (!servers) return [];
    return Object.entries(servers as Record<string, Record<string, unknown>>)
      .map(([name, cfg]) => toLocalAcpMcpServer(name, cfg))
      .filter((server): server is Record<string, unknown> => server !== null);
  } catch {
    return [];
  }
}

function toLocalAcpMcpServer(name: string, cfg: Record<string, unknown>): Record<string, unknown> | null {
  const descriptor = toClaudeDescriptor(name, cfg);
  if (descriptor.transport === 'streamableHttp') return null;
  if (!descriptor.command.trim()) return null;
  if (descriptor.name === 'office-claw') return null;
  return {
    id: descriptor.name,
    name: descriptor.name,
    transport: 'stdio',
    command: descriptor.command,
    args: descriptor.args,
    ...(descriptor.workingDir ? { cwd: descriptor.workingDir } : {}),
    ...(descriptor.env ? { env: descriptor.env } : {}),
  };
}

function toClaudeDescriptor(name: string, cfg: Record<string, unknown>): McpServerDescriptor {
  const isHttp = cfg.type === 'streamableHttp' || cfg.type === 'http';
  const descriptor: McpServerDescriptor = {
    name,
    command: typeof cfg.command === 'string' ? cfg.command : '',
    args: Array.isArray(cfg.args) ? cfg.args.filter((value): value is string => typeof value === 'string') : [],
    enabled: true,
    source: 'external',
  };
  if (isHttp) descriptor.transport = 'streamableHttp';
  if (typeof cfg.cwd === 'string' && cfg.cwd) descriptor.workingDir = cfg.cwd;
  if (cfg.env && typeof cfg.env === 'object' && !Array.isArray(cfg.env)) {
    descriptor.env = Object.fromEntries(
      Object.entries(cfg.env as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
    );
  }
  return descriptor;
}

type JsonRpcId = number | string;

interface ACPInboundMessage {
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

interface MCPConnectionRecord {
  client: RawMcpStdioClient;
  serverId: string;
  sessionId: string;
}

interface RawMcpPendingRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readSessionId(params: Record<string, unknown> | null): string | undefined {
  return typeof params?.sessionId === 'string' && params.sessionId.trim() ? params.sessionId.trim() : undefined;
}

function buildJsonRpcError(code: number, message: string): Record<string, unknown> {
  return { code, message };
}

function sanitizeMcpEnv(env: Record<string, string> | undefined): Record<string, string> {
  const safeEnv: Record<string, string> = { ...getDefaultEnvironment() };
  if (!env) return safeEnv;
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') safeEnv[key] = value;
  }
  return safeEnv;
}

class RawMcpStdioClient {
  private readonly transport: StdioClientTransport;
  private readonly pending = new Map<JsonRpcId, RawMcpPendingRequest>();
  private readonly stderrChunks: string[] = [];
  private nextId = 0;
  private closed = false;

  constructor(options: {
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
  }) {
    const serverParams: StdioServerParameters = {
      command: options.command,
      args: options.args,
      cwd: options.cwd,
      env: sanitizeMcpEnv(options.env),
      stderr: 'pipe',
    };
    this.transport = new StdioClientTransport(serverParams);
    this.transport.onmessage = (message) => {
      void this.handleMessage(message);
    };
    this.transport.onclose = () => {
      this.closed = true;
      this.rejectPending(new Error(this.stderrText.trim() || 'Local MCP subprocess closed'));
    };
    this.transport.onerror = (error) => {
      this.rejectPending(error instanceof Error ? error : new Error(String(error)));
    };
    this.transport.stderr?.on('data', (chunk: Buffer | string) => {
      this.stderrChunks.push(chunk.toString());
    });
  }

  get stderrText(): string {
    return this.stderrChunks.join('');
  }

  async start(): Promise<void> {
    await this.transport.start();
  }

  async call(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = ++this.nextId;
    const response = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    try {
      await this.transport.send({ jsonrpc: JSONRPC_VERSION, id, method, params });
    } catch (error) {
      this.pending.delete(id);
      throw error;
    }
    return await response;
  }

  async notify(method: string, params: Record<string, unknown>): Promise<void> {
    await this.transport.send({ jsonrpc: JSONRPC_VERSION, method, params });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.transport.close().catch(() => {});
    this.rejectPending(new Error(this.stderrText.trim() || 'Local MCP subprocess closed'));
  }

  private async handleMessage(message: JSONRPCMessage): Promise<void> {
    if (isJSONRPCResultResponse(message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      const result = message.result && typeof message.result === 'object' ? message.result : {};
      pending.resolve(result as Record<string, unknown>);
      return;
    }

    if (isJSONRPCErrorResponse(message)) {
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      pending.reject(new ACPRequestError(message.error.code, message.error.message));
      return;
    }

    if (isJSONRPCNotification(message)) return;
    if (isJSONRPCRequest(message)) {
      await this.respondToServerRequest(message);
    }
  }

  private async respondToServerRequest(message: JSONRPCRequest): Promise<void> {
    if (message.method === 'ping') {
      await this.transport.send({
        jsonrpc: JSONRPC_VERSION,
        id: message.id,
        result: {},
      });
      return;
    }

    await this.transport.send({
      jsonrpc: JSONRPC_VERSION,
      id: message.id,
      error: {
        code: -32601,
        message: `Unsupported MCP server request: ${message.method}`,
      },
    });
  }

  private rejectPending(error: Error): void {
    if (this.pending.size === 0) return;
    const pendingRequests = [...this.pending.values()];
    this.pending.clear();
    for (const pending of pendingRequests) {
      pending.reject(error);
    }
  }
}

export class ACPMcpBridge {
  private readonly connections = new Map<string, MCPConnectionRecord>();
  private readonly sessionServers = new Map<string, Map<string, string>>();

  constructor(private readonly options?: AgentServiceOptions) {}

  async closeAll(): Promise<void> {
    const closing = [...this.connections.values()].map((connection) => connection.client.close().catch(() => {}));
    this.connections.clear();
    this.sessionServers.clear();
    await Promise.all(closing);
  }

  async connectSessionServers(
    agentClient: ACPStdioClient,
    sessionId: string,
    sessionServers: Array<Record<string, unknown>>,
  ): Promise<void> {
    for (const server of sessionServers) {
      if (server.transport !== 'acp') continue;
      const serverId =
        typeof server.id === 'string' && server.id.trim()
          ? server.id.trim()
          : typeof server.name === 'string' && server.name.trim()
            ? server.name.trim()
            : '';
      if (!serverId) continue;
      const result = await agentClient.call('mcp/connect', { sessionId, acpId: serverId });
      const connectionId =
        typeof result.connectionId === 'string' && result.connectionId.trim() ? result.connectionId.trim() : '';
      if (!connectionId)
        throw new ACPRequestError(-32000, `ACP MCP connect for ${serverId} did not return connectionId`);
      await this.createLocalConnection(sessionId, serverId, connectionId);
    }
  }

  async disconnectSessionServers(agentClient: ACPStdioClient): Promise<void> {
    const activeConnections = [...this.connections.entries()];
    for (const [connectionId, connection] of activeConnections) {
      await agentClient.call('mcp/disconnect', { sessionId: connection.sessionId, connectionId }).catch(() => {});
      await this.closeConnection({ sessionId: connection.sessionId, connectionId });
    }
  }

  async handleInboundMessage(
    client: ACPStdioClient,
    incoming: Record<string, unknown> | null,
    expectedSessionId: string | undefined,
  ): Promise<boolean> {
    const message = incoming as ACPInboundMessage | null;
    const method = typeof message?.method === 'string' ? message.method : undefined;
    if (method !== 'mcp/connect' && method !== 'mcp/message' && method !== 'mcp/disconnect') return false;

    const params = asObject(message?.params);
    const responseId =
      typeof message?.id === 'number' || typeof message?.id === 'string' ? (message.id as JsonRpcId) : undefined;

    try {
      const sessionId = readSessionId(params);
      if (!sessionId) throw new ACPRequestError(-32602, 'ACP MCP request is missing sessionId');
      if (expectedSessionId && sessionId !== expectedSessionId) {
        throw new ACPRequestError(-32602, `Unexpected ACP MCP sessionId: ${sessionId}`);
      }

      if (method === 'mcp/connect') {
        const result = await this.openConnection(sessionId, params);
        if (responseId !== undefined) await client.sendResult(responseId, result);
        return true;
      }
      if (method === 'mcp/message') {
        const result = await this.relayMessage(params, responseId === undefined);
        if (responseId !== undefined) await client.sendResult(responseId, result);
        return true;
      }
      const result = await this.closeConnection(params);
      if (responseId !== undefined) await client.sendResult(responseId, result);
      return true;
    } catch (error) {
      if (responseId !== undefined) {
        const requestError =
          error instanceof ACPRequestError
            ? error
            : new ACPRequestError(-32000, error instanceof Error ? error.message : String(error));
        await client.sendError(responseId, buildJsonRpcError(requestError.code, requestError.message));
        return true;
      }
      throw error;
    }
  }

  private async openConnection(
    sessionId: string,
    params: Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    const serverId =
      typeof params?.acpId === 'string' && params.acpId.trim()
        ? params.acpId.trim()
        : typeof params?.serverId === 'string' && params.serverId.trim()
          ? params.serverId.trim()
          : '';
    if (!serverId) throw new ACPRequestError(-32602, 'ACP MCP connect requires acpId or serverId');
    if (serverId !== 'office-claw') throw new ACPRequestError(-32602, `Unknown ACP MCP serverId: ${serverId}`);

    const connectionId = randomUUID();
    await this.createLocalConnection(sessionId, serverId, connectionId);
    return {
      connectionId,
      serverId,
      status: 'open',
    };
  }

  private async relayMessage(
    params: Record<string, unknown> | null,
    isNotification: boolean,
  ): Promise<Record<string, unknown>> {
    const connection = this.getConnection(params);
    const method = typeof params?.method === 'string' && params.method.trim() ? params.method.trim() : '';
    if (!method) throw new ACPRequestError(-32602, 'ACP MCP message requires method');
    const messageParams = asObject(params?.params) ?? {};
    if (isNotification) {
      await connection.client.notify(method, messageParams);
      return {};
    }
    return await connection.client.call(method, messageParams);
  }

  private async closeConnection(params: Record<string, unknown> | null): Promise<Record<string, unknown>> {
    const connectionId =
      typeof params?.connectionId === 'string' && params.connectionId.trim() ? params.connectionId.trim() : '';
    if (!connectionId) throw new ACPRequestError(-32602, 'ACP MCP disconnect requires connectionId');
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return {
        status: 'closed',
        connectionId,
      };
    }

    this.connections.delete(connectionId);
    const activeServers = this.sessionServers.get(connection.sessionId);
    if (activeServers?.get(connection.serverId) === connectionId) {
      activeServers.delete(connection.serverId);
      if (activeServers.size === 0) this.sessionServers.delete(connection.sessionId);
    }
    await connection.client.close().catch(() => {});
    return {
      status: 'closed',
      connectionId,
    };
  }

  private getConnection(params: Record<string, unknown> | null): MCPConnectionRecord {
    const connectionId =
      typeof params?.connectionId === 'string' && params.connectionId.trim() ? params.connectionId.trim() : '';
    if (!connectionId) throw new ACPRequestError(-32602, 'ACP MCP message requires connectionId');
    const connection = this.connections.get(connectionId);
    if (!connection) throw new ACPRequestError(-32602, `Unknown ACP MCP connectionId: ${connectionId}`);
    return connection;
  }

  private async createLocalConnection(sessionId: string, serverId: string, connectionId: string): Promise<void> {
    const resolved = buildOfficeClawMcpRequestConfig(this.options);
    if (!resolved) throw new ACPRequestError(-32602, 'OfficeClaw MCP server is unavailable');

    const existingConnectionId = this.sessionServers.get(sessionId)?.get(serverId);
    if (existingConnectionId) {
      await this.closeConnection({ sessionId, connectionId: existingConnectionId });
    }

    const mcpClient = new RawMcpStdioClient({
      command: String(resolved.command),
      args: Array.isArray(resolved.args) ? resolved.args.map((value) => String(value)) : [],
      cwd: typeof resolved.cwd === 'string' ? resolved.cwd : undefined,
      env:
        resolved.env && typeof resolved.env === 'object'
          ? Object.fromEntries(
              Object.entries(resolved.env as Record<string, unknown>).filter((entry): entry is [string, string] => {
                return typeof entry[1] === 'string';
              }),
            )
          : undefined,
    });

    try {
      await mcpClient.start();
    } catch (error) {
      await mcpClient.close().catch(() => {});
      throw error;
    }

    this.connections.set(connectionId, { client: mcpClient, serverId, sessionId });
    const activeServers = this.sessionServers.get(sessionId) ?? new Map<string, string>();
    activeServers.set(serverId, connectionId);
    this.sessionServers.set(sessionId, activeServers);
  }
}
