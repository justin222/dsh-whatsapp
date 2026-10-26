import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { Store } from './store.js';
import { DemoManager } from './demo.js';
import { AutoReplyService } from './auto-reply.js';
import { isChatJidAllowed } from './jid.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'web');
const args = new Set(process.argv.slice(2));
const demoMode = args.has('--demo');
const portArgument = process.argv.find((argument) => argument.startsWith('--port='));
const parsedPort = Number(portArgument ? portArgument.split('=')[1] : process.env.PORT || 3000);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : 3000;
const HOST = process.env.HOST || '127.0.0.1';
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, '.data'));
const mediaDir = path.join(dataDir, 'media');
const storeFile = path.join(dataDir, demoMode ? 'demo-store.json' : 'store.json');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.mkdirSync(mediaDir, { recursive: true });

function timestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

const logger = {
  info: (...values) => console.log(`[${timestamp()}]`, ...values),
  warn: (...values) => console.warn(`[${timestamp()}]`, ...values),
  error: (...values) => console.error(`[${timestamp()}]`, ...values),
  debug: (...values) => {
    if (process.env.DEBUG) console.debug(`[${timestamp()}]`, ...values);
  }
};

const store = new Store(storeFile);
// Demo mode intentionally avoids importing the WhatsApp stack, which keeps the
// sample workspace fast and usable on machines without the native crypto setup.
const WhatsAppManager = demoMode ? null : (await import('./whatsapp.js')).WhatsAppManager;
const manager = demoMode
  ? new DemoManager({ store, logger })
  : new WhatsAppManager({ store, dataDir, logger });
const autoReply = demoMode
  ? null
  : new AutoReplyService({
      store,
      manager,
      isChatActive: (jid) => activeChatJids().has(jid),
      logger
    });

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; font-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self' http://127.0.0.1:* http://localhost:* dsh-app:"
  );
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '64kb' }));

function isLocalOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol === 'dsh-app:') return true;
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (req.path === '/api/health') {
    // Public, non-sensitive liveness signal for the DSH side-card tab.
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (origin && !isLocalOrigin(origin)) {
    return res.status(403).json({ error: 'Cross-origin request blocked.' });
  }
  next();
});

function statusForError(error) {
  switch (error.code) {
    case 'BAD_CHAT':
    case 'BAD_PHONE':
    case 'BAD_TEXT':
    case 'BAD_COOLDOWN':
    case 'EMPTY':
    case 'TOO_LONG':
      return 400;
    case 'NOT_ON_WHATSAPP':
      return 404;
    case 'OFFLINE':
      return 409;
    case 'NO_MEDIA':
      return 404;
    case 'MEDIA_EXPIRED':
      return 410;
    case 'DEMO':
      return 400;
    default:
      return 500;
  }
}

function sendError(res, error) {
  const status = statusForError(error);
  if (status >= 500) {
    logger.error(error.stack || error.message);
    return res.status(status).json({ error: 'Unexpected server error.' });
  }
  res.status(status).json({ error: error.message || 'Something went wrong.' });
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function bootstrap() {
  return {
    demo: demoMode,
    app: { name: 'WhatsApp Desk', version: pkg.version },
    status: manager.getStatus(),
    me: store.getMe(),
    chats: store.getChatSummaries(),
    contacts: store.getContacts(),
    settings: store.getSettings(),
    stats: store.getStats(),
    serverTime: Date.now()
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mode: demoMode ? 'demo' : 'live', state: manager.getStatus().state, uptime: process.uptime() });
});

app.get('/api/bootstrap', (req, res) => {
  res.json(bootstrap());
});

app.get('/api/chats', (req, res) => {
  res.json({ chats: store.getChatSummaries() });
});

app.get('/api/contacts', (req, res) => {
  res.json({ contacts: store.getContacts() });
});

app.get('/api/settings', (req, res) => {
  res.json(store.getSettings());
});

app.patch('/api/settings/auto-reply', (req, res) => {
  const body = req.body || {};
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be true or false.' });
  }
  try {
    const patch = {};
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    if (body.text !== undefined) patch.text = body.text;
    if (body.cooldownMinutes !== undefined) patch.cooldownMinutes = body.cooldownMinutes;
    if (Object.keys(patch).length) store.updateAutoReply(patch);
    const settings = store.getSettings();
    broadcast({ type: 'settings', payload: settings });
    res.json(settings);
  } catch (error) {
    if (error.code === 'BAD_TEXT' || error.code === 'BAD_COOLDOWN') {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }
});

app.get(
  '/api/chats/:jid/messages',
  asyncRoute(async (req, res) => {
    const jid = req.params.jid;
    if (!isChatJidAllowed(jid)) return res.status(400).json({ error: 'Invalid chat.' });
    const chat = store.getChat(jid);
    if (!chat) return res.status(404).json({ error: 'Chat not found.' });
    const result = store.getMessages(jid, { limit: req.query.limit, before: req.query.before });
    res.json({ chat, ...result });
  })
);

app.post(
  '/api/chats/:jid/messages',
  asyncRoute(async (req, res) => {
    const jid = req.params.jid;
    if (!isChatJidAllowed(jid)) return res.status(400).json({ error: 'Invalid chat.' });
    const result = await manager.sendText(jid, req.body?.text);
    res.json(result);
  })
);

app.post(
  '/api/chats',
  asyncRoute(async (req, res) => {
    const chat = await manager.openChat(req.body?.phone, req.body?.name || '');
    res.status(201).json({ chat });
  })
);

app.post(
  '/api/chats/:jid/read',
  asyncRoute(async (req, res) => {
    const jid = req.params.jid;
    if (!isChatJidAllowed(jid)) return res.status(400).json({ error: 'Invalid chat.' });
    const chat = store.getChat(jid);
    if (!chat) return res.status(404).json({ error: 'Chat not found.' });
    const changed = store.markRead(jid);
    const updated = store.getChat(jid);
    if (changed) broadcast({ type: 'chat', payload: updated });
    res.json({ chat: updated });
  })
);

app.post(
  '/api/session/restart',
  asyncRoute(async (req, res) => {
    const status = await manager.restart();
    res.json({ status });
  })
);

app.post(
  '/api/session/logout',
  asyncRoute(async (req, res) => {
    const status = await manager.logout();
    res.json({ status });
  })
);

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/3gpp': '.3gp',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'application/pdf': '.pdf'
};

const INLINE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/3gpp',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'application/pdf'
]);

function extensionFor(media) {
  const fromName = path.extname(media?.fileName || '').toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  return MIME_EXT[media?.mimetype] || '.bin';
}

function headerFilename(name) {
  const base = path.basename(String(name || 'attachment')).replace(/[\r\n"\\]/g, '_').slice(0, 160);
  const ascii = base.replace(/[^\x20-\x7E]/g, '_') || 'attachment';
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`;
}

app.get(
  '/api/media',
  asyncRoute(async (req, res) => {
    const jid = String(req.query.chat || '');
    const id = String(req.query.id || '');
    if (!isChatJidAllowed(jid) || !id) return res.status(400).json({ error: 'Invalid media request.' });
    const message = store.getMessage(jid, id);
    if (!message?.media) return res.status(404).json({ error: 'Media not found.' });
    if (message.media.kind === 'location' || message.media.kind === 'contact') {
      return res.status(400).json({ error: 'This message does not contain a file.' });
    }

    const hash = crypto.createHash('sha1').update(`${jid}|${id}`).digest('hex');
    const file = path.join(mediaDir, `${hash}${extensionFor(message.media)}`);
    let buffer;
    let media = message.media;
    try {
      buffer = await fs.promises.readFile(file);
    } catch {
      try {
        const downloaded = await manager.downloadMedia(jid, id);
        buffer = downloaded.buffer;
        media = { ...media, ...downloaded.media };
        await fs.promises.writeFile(file, buffer);
      } catch (error) {
        return sendError(res, error);
      }
    }

    let mime = String(media.mimetype || 'application/octet-stream').toLowerCase();
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime)) mime = 'application/octet-stream';
    const inline = INLINE_TYPES.has(mime);
    if (!inline) mime = 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; ${headerFilename(media.fileName || `media${extensionFor(media)}`)}`);
    res.setHeader('Cache-Control', 'private, max-age=604800');
    res.setHeader('Accept-Ranges', 'bytes');

    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const total = buffer.length;
        let start = match[1] ? Number(match[1]) : 0;
        let end = match[2] ? Number(match[2]) : total - 1;
        if (!match[1] && match[2]) {
          start = Math.max(0, total - Number(match[2]));
          end = total - 1;
        }
        if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < total) {
          end = Math.min(end, total - 1);
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
          res.setHeader('Content-Length', end - start + 1);
          return res.end(buffer.subarray(start, end + 1));
        }
        res.status(416);
        res.setHeader('Content-Range', `bytes */${total}`);
        return res.end();
      }
    }

    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  })
);

app.use(
  express.static(webDir, {
    index: 'index.html',
    etag: true,
    maxAge: 0,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      if (filePath.endsWith('.css') || filePath.endsWith('.js')) res.setHeader('Cache-Control', 'no-cache');
    }
  })
);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  res.status(404).type('text').send('Not found');
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
  const status = statusForError(error);
  if (status >= 500) {
    logger.error(error.stack || error.message);
    return res.status(500).json({ error: 'Unexpected server error.' });
  }
  res.status(status).json({ error: error.message || 'Something went wrong.' });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const clients = new Set();

server.on('upgrade', (req, socket, head) => {
  let pathname = '';
  try {
    pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  } catch {
    socket.destroy();
    return;
  }
  if (pathname !== '/ws') {
    socket.destroy();
    return;
  }
  if (req.headers.origin && !isLocalOrigin(req.headers.origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

function send(ws, message) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > 4 * 1024 * 1024) return;
  ws.send(JSON.stringify(message));
}

function broadcast(message) {
  for (const client of clients) send(client.ws, message);
}

function activeChatJids() {
  const jids = new Set();
  for (const client of clients) {
    if (client.viewing) jids.add(client.viewing);
  }
  return jids;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  const client = { ws, viewing: null };
  clients.add(client);
  send(ws, { type: 'hello', payload: bootstrap() });

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (message.type === 'ping') {
      send(ws, { type: 'pong', payload: { at: Date.now() } });
      return;
    }
    if (message.type === 'viewing') {
      const jid = String(message.jid || '');
      if (jid && isChatJidAllowed(jid) && store.getChat(jid)) {
        client.viewing = jid;
        if (store.markRead(jid)) broadcast({ type: 'chat', payload: store.getChat(jid) });
      } else if (!jid) {
        client.viewing = null;
      }
      return;
    }
    if (message.type === 'typing' && typeof manager.sendTyping === 'function') {
      const jid = String(message.jid || '');
      if (jid && isChatJidAllowed(jid)) {
        manager.sendTyping(jid, Boolean(message.isTyping)).catch(() => {});
      }
    }
  });

  ws.on('close', () => {
    clients.delete(client);
  });
  ws.on('error', () => {
    clients.delete(client);
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      ws.terminate();
    }
  }
}, 30_000);
heartbeat.unref();

manager.on('status', (status) => broadcast({ type: 'status', payload: status }));
manager.on('chats', (chats) => broadcast({ type: 'chats', payload: chats }));
manager.on('contacts', (contacts) => broadcast({ type: 'contacts', payload: contacts }));
manager.on('chat', (chat) => {
  if (!chat) return;
  let summary = chat;
  if (activeChatJids().has(chat.jid) && chat.unread) {
    store.markRead(chat.jid);
    summary = store.getChat(chat.jid);
  }
  broadcast({ type: 'chat', payload: summary });
});
manager.on('typing', (payload) => broadcast({ type: 'typing', payload }));
manager.on('me', (me) => broadcast({ type: 'me', payload: me }));
manager.on('message-update', (payload) => broadcast({ type: 'message-update', payload }));
manager.on('message', ({ chat, message }) => {
  let summary = chat;
  if (!message.fromMe && activeChatJids().has(message.chatJid)) {
    if (store.markRead(message.chatJid)) summary = store.getChat(message.chatJid);
  }
  broadcast({ type: 'message', payload: { chat: summary, message } });
  broadcast({ type: 'chat', payload: summary });
});
manager.on('incoming', (payload) => {
  autoReply?.handle(payload);
});
manager.on('error', (error) => logger.error(error));

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use. Start with --port=3001 or set PORT.`);
  } else {
    logger.error(error.stack || error.message);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  logger.info(`${demoMode ? 'Demo' : 'WhatsApp Desk'} running at http://${HOST}:${PORT}`);
  logger.info(`Local data: ${dataDir}`);
  manager.start().catch((error) => logger.error(error.stack || error.message));
});

function shutdown(signal) {
  logger.info(`${signal} received. Shutting down…`);
  clearInterval(heartbeat);
  for (const ws of wss.clients) {
    try {
      ws.close(1001, 'Server shutting down');
    } catch {
      // Ignore.
    }
  }
  server.close();
  autoReply?.destroy();
  Promise.resolve(manager.destroy?.())
    .catch(() => {})
    .finally(() => {
      store.flushSync();
      process.exit(0);
    });
  setTimeout(() => {
    store.flushSync();
    process.exit(0);
  }, 4_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => logger.error('Unhandled rejection:', error));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  store.flushSync();
  process.exit(1);
});
