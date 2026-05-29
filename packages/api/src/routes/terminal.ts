/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyPluginAsync } from 'fastify';
import type { AgentPaneRegistry } from '../domains/terminal/agent-pane-registry.js';
import { TerminalSessionStore } from '../domains/terminal/session-store.js';
import type { TmuxGateway } from '../domains/terminal/tmux-gateway.js';
import { resolveTrustedUserId, resolveUserId } from '../utils/request-identity.js';

// node-pty is optional — terminal features degrade gracefully when missing
// (e.g. Windows exe packaging where native compilation is impractical)
let pty: typeof import('node-pty') | null = null;
try {
  pty = await import('node-pty');
} catch {
  // node-pty not available — terminal routes will return 503
}

interface TerminalRouteOpts {
  tmuxGateway?: TmuxGateway;
  agentPaneRegistry?: AgentPaneRegistry;
}
interface PtyBinding {
  pty: {
    onData: (cb: (data: string) => void) => { dispose: () => void };
    onExit: (cb: () => void) => void;
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    kill: () => void;
  };
}

export const terminalRoutes: FastifyPluginAsync<TerminalRouteOpts> = async (app, opts) => {
  const { tmuxGateway, agentPaneRegistry } = opts;
  const store = new TerminalSessionStore();
  const ptys = new Map<string, PtyBinding>();

  if (!pty) {
    app.get('/api/terminal/status', async () => ({ available: false, reason: 'node-pty not installed' }));
    return;
  }
  const ptyMod = pty;
  const disabledReply = { error: 'Terminal session creation is disabled after workspace sunset', code: 'WORKSPACE_SUNSET' };

  function requireTrustedUserId(req: Parameters<typeof resolveTrustedUserId>[0], reply: { status: (code: number) => void; send: (body: unknown) => unknown }): string | null {
    const userId = resolveTrustedUserId(req);
    if (userId) return userId;
    reply.status(401);
    reply.send({ error: 'Identity required (X-Office-Claw-User header)' });
    return null;
  }

  // GET /api/terminal/status — availability check for frontend
  app.get('/api/terminal/status', async (req, reply) => {
    if (!requireTrustedUserId(req, reply)) return reply;
    return { available: !!tmuxGateway };
  });

  // POST /api/terminal/sessions — create or reconnect
  app.post<{
    Body: { worktreeId: string; cols?: number; rows?: number };
  }>('/api/terminal/sessions', async (req, reply) => {
    const userId = requireTrustedUserId(req, reply);
    if (!userId) return reply;
    return reply.status(410).send(disabledReply);
  });

  // GET /api/terminal/sessions/:sessionId/ws — WebSocket attach
  app.get<{
    Params: { sessionId: string };
  }>('/api/terminal/sessions/:sessionId/ws', { websocket: true }, (socket, req) => {
    const { sessionId } = req.params;
    // Native browser WebSocket cannot set custom headers, so terminal attach
    // keeps the existing query-param identity until we ship an ephemeral WS token.
    const userId = resolveUserId(req);
    if (!userId) {
      socket.close(4001, 'Identity required (X-Office-Claw-User header or userId query)');
      return;
    }
    const session = store.getByIdAndUser(sessionId, userId);
    const binding = ptys.get(sessionId);

    if (!session) {
      socket.close(4004, 'Session not found or not yours');
      return;
    }
    if (!binding) {
      socket.close(4004, 'Session not attached');
      return;
    }

    const { pty: ptyProcess } = binding;

    // PTY output → WebSocket
    const dataHandler = ptyProcess.onData((data) => {
      if (socket.readyState === 1) {
        socket.send(data);
      }
    });

    // WebSocket input → PTY (resize only)
    socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      const msg = Buffer.isBuffer(raw) ? raw.toString() : String(raw);
      try {
        const parsed = JSON.parse(msg) as {
          type: string;
          cols?: number;
          rows?: number;
        };
        if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
          ptyProcess.resize(parsed.cols, parsed.rows);
        }
      } catch {
        /* ignore non-JSON */
      }
    });

    // WS disconnect → mark disconnected but keep pane alive
    socket.on('close', () => {
      dataHandler.dispose();
      ptyProcess.kill(); // Kill PTY bridge, not tmux pane
      ptys.delete(sessionId);
      store.markDisconnected(sessionId);
    });

    // PTY exit (tmux pane died) → mark disconnected
    ptyProcess.onExit(() => {
      socket.close(1000, 'PTY exited');
      ptys.delete(sessionId);
      store.markDisconnected(sessionId);
    });
  });

  // DELETE /api/terminal/sessions/:sessionId
  app.delete<{
    Params: { sessionId: string };
  }>('/api/terminal/sessions/:sessionId', async (req, reply) => {
    const userId = requireTrustedUserId(req, reply);
    if (!userId) return reply;
    const { sessionId } = req.params;
    const session = store.get(sessionId);

    if (!tmuxGateway) return reply.code(503).send({ error: 'Terminal not available' });
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    if (session.userId !== userId) return reply.code(403).send({ error: 'Not your session' });

    // Kill PTY if still running, then kill tmux pane
    const binding = ptys.get(sessionId);
    if (binding) {
      binding.pty.kill();
      ptys.delete(sessionId);
    }

    // Kill the tmux pane
    await tmuxGateway.killPane(session.worktreeId, session.paneId);
    store.remove(sessionId);

    // If no more sessions for this worktree, destroy the tmux server
    if (!store.hasRemainingForWorktree(session.worktreeId)) {
      await tmuxGateway.destroyServer(session.worktreeId);
    }

    return { ok: true };
  });

  // GET /api/terminal/sessions — filtered by userId
  app.get<{
    Querystring: { worktreeId?: string };
  }>('/api/terminal/sessions', async (req, reply) => {
    const userId = requireTrustedUserId(req, reply);
    if (!userId) return reply;
    return [];
  });

  // GET /api/terminal/agent-panes — list agent panes by worktree + user
  app.get<{
    Querystring: { worktreeId: string };
  }>('/api/terminal/agent-panes', async (req, reply) => {
    const userId = requireTrustedUserId(req, reply);
    if (!userId) return reply;
    return [];
  });

  // GET /api/terminal/agent-panes/:paneId/ws — read-only attach to agent pane
  app.get<{
    Params: { paneId: string };
    Querystring: { worktreeId: string };
  }>('/api/terminal/agent-panes/:paneId/ws', { websocket: true }, (socket, req) => {
    const { paneId } = req.params;
    const { worktreeId } = req.query;
    // Same constraint as session attach: browser-native WebSocket has no header API.
    const userId = resolveUserId(req);
    if (!userId) {
      socket.close(4001, 'Identity required (X-Office-Claw-User header or userId query)');
      return;
    }

    if (!worktreeId || !agentPaneRegistry || !tmuxGateway) {
      socket.close(4004, 'Agent pane tracking not enabled or missing worktreeId');
      return;
    }

    const panes = agentPaneRegistry.listByWorktreeAndUser(worktreeId, userId);
    const paneInfo = panes.find((p) => p.paneId === paneId);
    if (!paneInfo) {
      socket.close(4004, 'Agent pane not found or not yours');
      return;
    }

    const sock = tmuxGateway.socketName(worktreeId);
    const ptyProcess = ptyMod.spawn(tmuxGateway.tmuxBin, ['-L', sock, 'attach', '-r', '-t', paneId], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
    });

    const dataHandler = ptyProcess.onData((data) => {
      if (socket.readyState === 1) socket.send(data);
    });

    socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      const msg = Buffer.isBuffer(raw) ? raw.toString() : String(raw);
      try {
        const parsed = JSON.parse(msg) as { type: string; cols?: number; rows?: number };
        if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
          ptyProcess.resize(parsed.cols, parsed.rows);
        }
      } catch {
        /* ignore non-JSON */
      }
    });

    socket.on('close', () => {
      dataHandler.dispose();
      ptyProcess.kill();
    });

    ptyProcess.onExit(() => {
      socket.close(1000, 'Agent pane exited');
    });
  });
};
