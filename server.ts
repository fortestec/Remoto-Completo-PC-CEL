import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { handleLocalRpc } from './src/server/localHostBridge.ts';
import { buildPcAgentScript } from './src/server/pcAgentScript.ts';
import type { RpcRequest } from './src/types/remote.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

interface PairedHost {
  code: string;
  hostname: string;
  platform: string;
  connectedAt: string;
  socket: WebSocket | null;
  clients: Set<WebSocket>;
  pendingRpc: Map<string, { resolve: (val: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>;
}

const sessions = new Map<string, PairedHost>();

function generatePairingCode(): string {
  let code = '';
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (sessions.has(code));
  return code;
}

function getOrCreateSession(code: string): PairedHost {
  let session = sessions.get(code);
  if (!session) {
    session = {
      code,
      hostname: '',
      platform: '',
      connectedAt: '',
      socket: null,
      clients: new Set(),
      pendingRpc: new Map(),
    };
    sessions.set(code, session);
  }
  return session;
}

function notifyClients(session: PairedHost) {
  const payload = JSON.stringify({
    type: 'pair_status',
    code: session.code,
    connected: Boolean(session.socket && session.socket.readyState === WebSocket.OPEN),
    hostname: session.hostname,
    platform: session.platform,
    connectedAt: session.connectedAt,
  });
  for (const client of session.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function forwardRpcToAgent(session: PairedHost, method: string, params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!session.socket || session.socket.readyState !== WebSocket.OPEN) {
      reject(new Error('Computador desconectado. Verifique se o agente está em execução no PC.'));
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      session.pendingRpc.delete(id);
      reject(new Error('Tempo limite excedido ao aguardar resposta do PC.'));
    }, 18000);

    session.pendingRpc.set(id, { resolve, reject, timer });
    session.socket.send(JSON.stringify({ type: 'rpc', id, method, params }));
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'mobihost' });
  });

  app.post('/api/pair/create', (_req, res) => {
    const code = generatePairingCode();
    getOrCreateSession(code);
    res.json({ code });
  });

  app.get('/api/pair/status/:code', (req, res) => {
    const code = String(req.params.code || '').replace(/\D/g, '');
    const session = sessions.get(code);
    const connected = Boolean(session?.socket && session.socket.readyState === WebSocket.OPEN);
    res.json({
      code,
      connected,
      hostname: session?.hostname || '',
      platform: session?.platform || '',
      connectedAt: session?.connectedAt || '',
    });
  });

  app.get('/api/agent/download', (req, res) => {
    const code = String(req.query.code || '000000').replace(/\D/g, '') || '000000';
    getOrCreateSession(code);
    const proto = req.headers['x-forwarded-proto'] === 'https' || req.secure ? 'wss' : 'ws';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const wsUrl = `${proto}://${host}`;
    const script = buildPcAgentScript(wsUrl, code);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mobihost-agent-${code}.mjs"`);
    res.send(script);
  });

  app.post('/api/rpc', async (req, res) => {
    try {
      const body = req.body as RpcRequest;
      const { hostMode = 'local', pairingCode = '', method, params = {} } = body;
      if (!method) {
        res.status(400).json({ ok: false, error: 'Método RPC obrigatório.' });
        return;
      }

      if (hostMode === 'paired') {
        const code = String(pairingCode).replace(/\D/g, '');
        const session = sessions.get(code);
        if (!session) {
          res.status(404).json({ ok: false, error: 'Sessão de pareamento não encontrada.' });
          return;
        }
        const result = await forwardRpcToAgent(session, method, params);
        res.json({ ok: true, result });
        return;
      }

      const result = await handleLocalRpc(method, params);
      res.json({ ok: true, result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro interno ao processar comando.';
      res.status(500).json({ ok: false, error: message });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/ws/agent' || url.pathname === '/ws/client') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, url);
      });
    }
  });

  wss.on('connection', (ws: WebSocket, _req: http.IncomingMessage, url: URL) => {
    const code = (url.searchParams.get('code') || '').replace(/\D/g, '');
    if (!code) {
      ws.close();
      return;
    }

    const session = getOrCreateSession(code);

    if (url.pathname === '/ws/agent') {
      session.socket = ws;
      session.hostname = url.searchParams.get('host') || 'Computador Remoto';
      session.platform = url.searchParams.get('platform') || 'desktop';
      session.connectedAt = new Date().toISOString();
      notifyClients(session);

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type: string; id?: string; ok?: boolean; result?: unknown; error?: string };
          if (msg.type === 'rpc_result' && msg.id) {
            const pending = session.pendingRpc.get(msg.id);
            if (pending) {
              clearTimeout(pending.timer);
              session.pendingRpc.delete(msg.id);
              if (msg.ok) pending.resolve(msg.result);
              else pending.reject(new Error(msg.error || 'Falha no agente remoto'));
            }
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        if (session.socket === ws) {
          session.socket = null;
          for (const [, p] of session.pendingRpc) {
            clearTimeout(p.timer);
            p.reject(new Error('Agente desconectado.'));
          }
          session.pendingRpc.clear();
          notifyClients(session);
        }
      });
    } else if (url.pathname === '/ws/client') {
      session.clients.add(ws);
      notifyClients(session);
      ws.on('close', () => {
        session.clients.delete(ws);
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MobiHost server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
