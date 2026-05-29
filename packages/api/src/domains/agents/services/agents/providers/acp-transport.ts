/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { basename } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createModuleLogger } from '../../../../../infrastructure/logger.js';

const log = createModuleLogger('acp-transport');

type ACPMessage = Record<string, unknown>;
type ACPStdioFrameMode = 'content-length' | 'ndjson';
type JsonRpcId = number | string;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface ACPQueueItem {
  value: ACPMessage | null;
}

class ACPAsyncQueue {
  private readonly items: ACPQueueItem[] = [];
  private readonly waiters: Array<(value: ACPMessage | null) => void> = [];

  push(value: ACPMessage): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(value);
      return;
    }
    this.items.push({ value });
  }

  close(): void {
    while (this.waiters.length > 0) {
      this.waiters.shift()?.(null);
    }
    this.items.push({ value: null });
  }

  async next(): Promise<ACPMessage | null> {
    const item = this.items.shift();
    if (item !== undefined) return item.value;
    return new Promise<ACPMessage | null>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  drain(): ACPMessage[] {
    const drained: ACPMessage[] = [];
    while (this.items.length > 0) {
      const next = this.items.shift();
      if (!next?.value) continue;
      drained.push(next.value);
    }
    return drained;
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeCommandName(command: string): string {
  const normalized = basename(command.replaceAll('\\', '/')).toLowerCase();
  return normalized.endsWith('.exe') ? normalized.slice(0, -4) : normalized;
}

export function resolveACPStdioFrameMode(command: string): ACPStdioFrameMode {
  return normalizeCommandName(command) === 'opencode' ? 'ndjson' : 'content-length';
}

export function frameACPMessage(message: ACPMessage, mode: ACPStdioFrameMode): Buffer {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  if (mode === 'ndjson') {
    return Buffer.concat([payload, Buffer.from('\n', 'utf8')]);
  }
  return Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, 'ascii'), payload]);
}

export class ACPRequestError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export interface ACPStdioClientOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export class ACPStdioClient {
  private readonly options: ACPStdioClientOptions;
  private readonly frameMode: ACPStdioFrameMode;
  private readonly notifications = new ACPAsyncQueue();
  private readonly pending = new Map<number, PendingRequest>();
  private readonly stderrChunks: string[] = [];
  private stdoutBuffer = Buffer.alloc(0);
  private nextId = 0;
  private child: ReturnType<typeof nodeSpawn> | null = null;
  private exitPromise: Promise<void> | null = null;
  private closed = false;

  constructor(options: ACPStdioClientOptions) {
    this.options = options;
    this.frameMode = resolveACPStdioFrameMode(options.command);
  }

  get stderrText(): string {
    return this.stderrChunks.join('');
  }

  async start(): Promise<void> {
    if (this.child) return;

    const child = nodeSpawn(this.options.command, this.options.args ?? [], {
      cwd: this.options.cwd,
      env: this.options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    this.exitPromise = new Promise<void>((resolve) => {
      child.once('exit', (code, signal) => {
        this.closed = true;
        const errorText = this.stderrText.trim();
        for (const pending of this.pending.values()) {
          pending.reject(
            new Error(
              errorText || `ACP subprocess exited before reply (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
            ),
          );
        }
        this.pending.clear();
        this.notifications.close();
        resolve();
      });
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      this.processStdoutChunk(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderrChunks.push(chunk.toString('utf8'));
    });

    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => resolve());
      child.once('error', (error) => reject(error));
    });
  }

  async call(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = ++this.nextId;
    const resultPromise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    await this.send({ jsonrpc: '2.0', id, method, params });
    const result = await resultPromise;
    if (!result || typeof result !== 'object') return {};
    return result as Record<string, unknown>;
  }

  async notify(method: string, params: Record<string, unknown>): Promise<void> {
    await this.send({ jsonrpc: '2.0', method, params });
  }

  async sendResult(id: JsonRpcId, result: Record<string, unknown>): Promise<void> {
    await this.send({ jsonrpc: '2.0', id, result });
  }

  async sendError(id: JsonRpcId, error: Record<string, unknown>): Promise<void> {
    await this.send({ jsonrpc: '2.0', id, error });
  }

  async nextMessage(): Promise<ACPMessage | null> {
    return this.notifications.next();
  }

  drainMessages(): ACPMessage[] {
    return this.notifications.drain();
  }

  async close(graceMs = 1_500): Promise<void> {
    if (!this.child) return;
    if (!this.closed) {
      try {
        this.child.stdin?.end();
      } catch {
        // ignore close race
      }
      this.child.kill('SIGTERM');
      if (this.exitPromise) {
        await Promise.race([this.exitPromise, delay(graceMs)]);
      }
      if (!this.closed) {
        this.child.kill('SIGKILL');
      }
    }
    if (this.exitPromise) {
      await this.exitPromise.catch(() => {});
    }
    this.child = null;
  }

  private async send(message: ACPMessage): Promise<void> {
    if (!this.child?.stdin) {
      throw new Error('ACP subprocess is not running');
    }
    const framedPayload = frameACPMessage(message, this.frameMode);
    await new Promise<void>((resolve, reject) => {
      this.child?.stdin?.write(framedPayload, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private processStdoutChunk(chunk: Buffer): void {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
    while (this.stdoutBuffer.length > 0) {
      const consumed = this.tryConsumeOneMessage();
      if (!consumed) break;
    }
  }

  private tryConsumeOneMessage(): boolean {
    while (
      this.stdoutBuffer.length > 0 &&
      (this.stdoutBuffer[0] === 0x0a || this.stdoutBuffer[0] === 0x0d || this.stdoutBuffer[0] === 0x20)
    ) {
      this.stdoutBuffer = this.stdoutBuffer.slice(1);
    }
    if (this.stdoutBuffer.length === 0) return false;

    const headerEnd = this.findHeaderEnd(this.stdoutBuffer);
    const prefix = this.stdoutBuffer.toString('utf8', 0, Math.min(this.stdoutBuffer.length, 32)).toLowerCase();
    if (prefix.startsWith('content-length:')) {
      if (!headerEnd) return false;
      const { index, delimiterLength } = headerEnd;
      const headerText = this.stdoutBuffer.toString('utf8', 0, index);
      const lengthMatch = headerText.match(/content-length:\s*(\d+)/i);
      if (!lengthMatch) {
        this.stdoutBuffer = this.stdoutBuffer.slice(index + delimiterLength);
        return true;
      }
      const payloadLength = Number.parseInt(lengthMatch[1]!, 10);
      const payloadStart = index + delimiterLength;
      if (this.stdoutBuffer.length < payloadStart + payloadLength) return false;
      const payload = this.stdoutBuffer.slice(payloadStart, payloadStart + payloadLength);
      this.stdoutBuffer = this.stdoutBuffer.slice(payloadStart + payloadLength);
      this.dispatchRawMessage(payload);
      return true;
    }

    const newlineIndex = this.stdoutBuffer.indexOf(0x0a);
    if (newlineIndex === -1) return false;
    const line = this.stdoutBuffer.slice(0, newlineIndex).toString('utf8').trim();
    this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
    if (!line) return true;
    this.dispatchRawMessage(Buffer.from(line, 'utf8'));
    return true;
  }

  private findHeaderEnd(buffer: Buffer): { index: number; delimiterLength: number } | null {
    const rn = buffer.indexOf('\r\n\r\n');
    if (rn !== -1) return { index: rn, delimiterLength: 4 };
    const nn = buffer.indexOf('\n\n');
    if (nn !== -1) return { index: nn, delimiterLength: 2 };
    return null;
  }

  private dispatchRawMessage(raw: Buffer): void {
    try {
      const message = JSON.parse(raw.toString('utf8')) as ACPMessage;
      this.dispatchMessage(message);
    } catch (error) {
      log.warn({ error: toErrorMessage(error), raw: raw.toString('utf8') }, 'Failed to parse ACP message');
    }
  }

  private dispatchMessage(message: ACPMessage): void {
    const maybeId = message.id;
    if (typeof maybeId === 'number' && Object.hasOwn(message, 'result')) {
      const pending = this.pending.get(maybeId);
      if (pending) {
        this.pending.delete(maybeId);
        pending.resolve(message.result);
        return;
      }
    }
    if (typeof maybeId === 'number' && Object.hasOwn(message, 'error')) {
      const pending = this.pending.get(maybeId);
      if (pending) {
        this.pending.delete(maybeId);
        const errorPayload = message.error;
        const code =
          errorPayload && typeof errorPayload === 'object' && typeof (errorPayload as { code?: unknown }).code === 'number'
            ? ((errorPayload as { code: number }).code ?? -32000)
            : -32000;
        const errorMessage =
          errorPayload && typeof errorPayload === 'object' && typeof (errorPayload as { message?: unknown }).message === 'string'
            ? ((errorPayload as { message: string }).message ?? 'ACP request failed')
            : 'ACP request failed';
        pending.reject(new ACPRequestError(code, errorMessage));
        return;
      }
    }
    this.notifications.push(message);
  }
}
