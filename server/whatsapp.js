import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  getContentType,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import P from 'pino';
import QRCode from 'qrcode';
import {
  fallbackName,
  isChatJidAllowed,
  isGroupJid,
  normalizePhone
} from './jid.js';

const MAX_RAW_MEDIA = 2500;

function secondsToMs(value) {
  if (value === null || value === undefined) return Date.now();
  let number = value;
  if (typeof value === 'object' && typeof value.toNumber === 'function') number = value.toNumber();
  number = Number(number);
  if (!Number.isFinite(number) || number <= 0) return Date.now();
  return number < 1e12 ? Math.round(number * 1000) : Math.round(number);
}

function truncate(value, max) {
  return String(value ?? '').slice(0, max);
}

function mediaLabel(kind) {
  switch (kind) {
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Voice message';
    case 'sticker':
      return 'Sticker';
    case 'document':
      return 'Document';
    case 'location':
      return 'Location';
    case 'contact':
      return 'Contact card';
    default:
      return 'Message';
  }
}

function extractContent(message) {
  if (!message) return null;
  const type = getContentType(message);
  if (!type) return null;
  const content = message[type];
  if (!content) return null;

  switch (type) {
    case 'conversation':
      return { type: 'text', text: content };
    case 'extendedTextMessage':
      return { type: 'text', text: content.text || content.matchedText || '' };
    case 'imageMessage':
      return {
        type: 'image',
        text: content.caption || '',
        media: {
          kind: 'image',
          mimetype: content.mimetype || 'image/jpeg',
          fileLength: Number(content.fileLength) || 0,
          width: content.width || 0,
          height: content.height || 0
        }
      };
    case 'videoMessage':
    case 'ptvMessage':
      return {
        type: 'video',
        text: content.caption || '',
        media: {
          kind: 'video',
          mimetype: content.mimetype || 'video/mp4',
          fileLength: Number(content.fileLength) || 0,
          width: content.width || 0,
          height: content.height || 0,
          seconds: content.seconds || 0,
          round: type === 'ptvMessage' || Boolean(content.ptv)
        }
      };
    case 'audioMessage':
      return {
        type: 'audio',
        text: '',
        media: {
          kind: 'audio',
          mimetype: content.mimetype || 'audio/ogg',
          fileLength: Number(content.fileLength) || 0,
          seconds: content.seconds || 0,
          ptt: Boolean(content.ptt)
        }
      };
    case 'documentMessage':
    case 'documentWithCaptionMessage': {
      const doc = content.documentMessage || content.message?.documentMessage || content;
      return {
        type: 'document',
        text: doc.caption || '',
        media: {
          kind: 'document',
          mimetype: doc.mimetype || 'application/octet-stream',
          fileName: truncate(doc.fileName || 'Document', 180),
          fileLength: Number(doc.fileLength) || 0,
          pageCount: doc.pageCount || 0
        }
      };
    }
    case 'stickerMessage':
      return {
        type: 'sticker',
        text: '',
        media: {
          kind: 'sticker',
          mimetype: content.mimetype || 'image/webp',
          fileLength: Number(content.fileLength) || 0,
          width: content.width || 0,
          height: content.height || 0
        }
      };
    case 'locationMessage':
    case 'liveLocationMessage':
      return {
        type: 'location',
        text: content.name || content.address || (type === 'liveLocationMessage' ? 'Live location' : 'Location'),
        media: {
          kind: 'location',
          lat: content.degreesLatitude || 0,
          lng: content.degreesLongitude || 0,
          live: type === 'liveLocationMessage'
        }
      };
    case 'contactMessage':
      return {
        type: 'contact',
        text: content.displayName || 'Contact card',
        media: { kind: 'contact' }
      };
    case 'contactsArrayMessage': {
      const count = content.contacts?.length || 1;
      return {
        type: 'contact',
        text: content.displayName || `${count} contact${count === 1 ? '' : 's'}`,
        media: { kind: 'contact', count }
      };
    }
    case 'pollCreationMessage':
    case 'pollCreationMessageV2':
    case 'pollCreationMessageV3':
      return { type: 'poll', text: `Poll: ${content.name || 'Untitled poll'}` };
    case 'eventMessage':
      return { type: 'event', text: content.name || 'Event' };
    case 'buttonsMessage':
      return { type: 'text', text: content.contentText || content.text || 'Buttons' };
    case 'templateMessage': {
      const template = content.hydratedTemplate || content.fourRowTemplate || content;
      return {
        type: 'text',
        text: template.hydratedContentText || template.hydratedTitleText || 'Template message'
      };
    }
    case 'listMessage':
      return { type: 'text', text: content.description || content.title || 'List message' };
    case 'buttonsResponseMessage':
      return { type: 'text', text: content.selectedDisplayText || content.selectedButtonId || '' };
    case 'listResponseMessage':
      return { type: 'text', text: content.title || content.singleSelectReply?.selectedRowId || '' };
    case 'templateButtonReplyMessage':
      return { type: 'text', text: content.selectedDisplayText || content.selectedId || '' };
    case 'interactiveMessage':
      return { type: 'text', text: content.body?.text || content.header?.title || 'Interactive message' };
    case 'interactiveResponseMessage':
      return { type: 'text', text: content.body?.text || 'Interactive response' };
    case 'groupInviteMessage':
      return { type: 'text', text: `Group invite: ${content.groupName || 'WhatsApp group'}` };
    case 'albumMessage':
      return { type: 'text', text: 'Album' };
    case 'editedMessage':
      return extractContent(normalizeMessageContent(content.message));
    case 'ephemeralMessage':
    case 'viewOnceMessage':
    case 'viewOnceMessageV2':
    case 'viewOnceMessageV2Extension':
      return extractContent(normalizeMessageContent(content.message));
    default:
      if (
        type.endsWith('Message') &&
        ![
          'protocolMessage',
          'senderKeyDistributionMessage',
          'reactionMessage',
          'encReactionMessage',
          'pollUpdateMessage',
          'pinInChatMessage',
          'keepInChatMessage'
        ].includes(type)
      ) {
        return { type: 'text', text: '' };
      }
      return null;
  }
}

function quotedPreview(contextInfo) {
  if (!contextInfo?.quotedMessage) return null;
  const message = normalizeMessageContent(contextInfo.quotedMessage);
  const content = extractContent(message);
  const participant = contextInfo.participant || '';
  return {
    text: truncate(content?.text || mediaLabel(content?.media?.kind), 280),
    participant,
    type: content?.type || 'text'
  };
}

function messageText(message) {
  return truncate(message?.text || '', 8000);
}

export class WhatsAppManager extends EventEmitter {
  constructor({ store, dataDir, logger = console }) {
    super();
    this.store = store;
    this.dataDir = dataDir;
    this.authDir = path.join(dataDir, 'auth');
    this.logger = logger;
    this.baileysLogger = P({ level: process.env.BAILEYS_LOG || 'silent' });
    this.sock = null;
    this.qr = null;
    this.qrSequence = 0;
    this.state = 'starting';
    this.error = null;
    this.connectedAt = null;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.starting = false;
    this.manualLogout = false;
    this.rawMedia = new Map();
    this.startedAt = Date.now();
    this.version = null;
  }

  getStatus() {
    return {
      state: this.state,
      qr: this.state === 'qr' ? this.qr : null,
      me: this.store.getMe(),
      error: this.error,
      demo: false,
      connectedAt: this.connectedAt,
      updatedAt: Date.now()
    };
  }

  emitStatus() {
    this.emit('status', this.getStatus());
  }

  setState(state, error = null) {
    const changed = this.state !== state;
    this.state = state;
    this.error = error;
    if (state === 'connected') this.connectedAt = Date.now();
    if (changed) this.emitStatus();
    else this.emitStatus();
  }

  async start({ fresh = false } = {}) {
    if (this.starting) return;
    if (this.manualLogout) return;
    this.starting = true;
    this.clearReconnect();
    try {
      await this.disposeSocket();
      if (fresh) await fs.rm(this.authDir, { recursive: true, force: true });
      this.qr = null;
      this.qrSequence += 1;
      this.setState('connecting');
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      const { version } = await fetchLatestBaileysVersion();
      this.version = version;
      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, this.baileysLogger)
        },
        logger: this.baileysLogger,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: false,
        syncFullHistory: process.env.SYNC_FULL_HISTORY !== '0',
        generateHighQualityLinkPreview: false,
        defaultQueryTimeoutMs: 60_000,
        connectTimeoutMs: 60_000,
        keepAliveIntervalMs: 25_000,
        retryRequestDelayMs: 2_000,
        shouldIgnoreJid: (jid) => jid === 'status@broadcast'
      });
      this.sock = sock;
      this.bindSocket(sock, saveCreds);
      this.logger.info(`WhatsApp client starting (${version.join('.')})`);
    } catch (error) {
      this.logger.error(`Could not start WhatsApp: ${error.message}`);
      this.setState('error', `Could not start WhatsApp: ${error.message}`);
      this.scheduleReconnect(5_000);
    } finally {
      this.starting = false;
    }
  }

  bindSocket(sock, saveCreds) {
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      if (this.sock !== sock) return;
      const { connection, lastDisconnect, qr } = update;
      if (qr) this.handleQr(qr);
      if (connection === 'connecting') {
        if (this.state !== 'qr') this.setState('connecting');
      }
      if (connection === 'open') {
        this.handleOpen(sock);
      }
      if (connection === 'close') {
        this.handleClose(lastDisconnect);
      }
    });

    sock.ev.on('contacts.upsert', (contacts) => this.handleContacts(contacts));
    sock.ev.on('contacts.update', (contacts) => this.handleContacts(contacts));
    sock.ev.on('chats.upsert', (chats) => this.handleChats(chats));
    sock.ev.on('chats.update', (chats) => this.handleChats(chats));
    sock.ev.on('groups.upsert', (groups) => this.handleGroups(groups));
    sock.ev.on('groups.update', (groups) => this.handleGroups(groups));
    sock.ev.on('messaging-history.set', (payload) => this.handleHistory(payload));
    sock.ev.on('messages.upsert', (payload) => this.handleMessages(payload));
    sock.ev.on('messages.update', (updates) => this.handleMessageUpdates(updates));
    sock.ev.on('message-receipt.update', (updates) => this.handleReceipts(updates));
    sock.ev.on('call', () => {});
  }

  async handleQr(qr) {
    this.reconnectAttempt = 0;
    this.qrSequence += 1;
    const sequence = this.qrSequence;
    this.state = 'qr';
    this.error = null;
    this.qr = null;
    this.emitStatus();
    try {
      const dataUrl = await QRCode.toDataURL(qr, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 440,
        color: { dark: '#102f28', light: '#ffffff' }
      });
      if (sequence !== this.qrSequence || this.state !== 'qr') return;
      this.qr = dataUrl;
      this.emitStatus();
    } catch (error) {
      this.logger.error(`Could not render QR code: ${error.message}`);
      this.setState('error', 'Could not draw the QR code. Try refreshing it.');
    }
  }

  handleOpen(sock) {
    this.reconnectAttempt = 0;
    this.qr = null;
    this.qrSequence += 1;
    this.setState('connected');
    if (sock.user) {
      this.store.setMe({
        id: sock.user.id,
        name: sock.user.name,
        notify: sock.user.notify,
        verifiedName: sock.user.verifiedName
      });
    }
    this.emitStatus();
    this.store.getMe() && this.emit('me', this.store.getMe());
    this.logger.info('WhatsApp connected');
    setTimeout(() => this.syncGroups(sock), 1_500);
  }

  handleClose(lastDisconnect) {
    const code = lastDisconnect?.error?.output?.statusCode;
    const message = lastDisconnect?.error?.message || 'Connection closed';
    const closedSocket = this.sock;
    this.sock = null;
    this.qr = null;
    this.qrSequence += 1;
    if (closedSocket) {
      try {
        closedSocket.ev.removeAllListeners();
        closedSocket.end(undefined);
      } catch {
        // The socket is already closing.
      }
    }

    if (this.manualLogout) return;

    if (code === DisconnectReason.loggedOut || code === 401) {
      this.logger.warn('WhatsApp session was unlinked');
      this.store.clearMe();
      this.setState('disconnected', 'This WhatsApp account was unlinked. Scan the QR code to link it again.');
      fs.rm(this.authDir, { recursive: true, force: true }).catch(() => {});
      this.scheduleReconnect(1_000, { fresh: true });
      return;
    }

    const reason =
      code === 440
        ? 'WhatsApp closed this session because it opened somewhere else. Reconnecting…'
        : `Connection lost. Reconnecting…`;
    this.setState('offline', reason);
    this.logger.warn(`WhatsApp disconnected (${code || 'unknown'}): ${message}`);
    const delay = code === DisconnectReason.restartRequired ? 600 : Math.min(30_000, 1_000 * 2 ** this.reconnectAttempt);
    this.scheduleReconnect(delay);
  }

  scheduleReconnect(delay, options = {}) {
    this.clearReconnect();
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.start(options).catch((error) => this.logger.error(error));
    }, delay);
  }

  clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  async disposeSocket() {
    const sock = this.sock;
    this.sock = null;
    if (!sock) return;
    try {
      sock.ev.removeAllListeners();
    } catch {
      // Ignore cleanup errors.
    }
    try {
      sock.end(undefined);
    } catch {
      // Socket may already be closed.
    }
  }

  async restart() {
    if (this.state === 'connected') return this.getStatus();
    this.manualLogout = false;
    await this.start();
    return this.getStatus();
  }

  async logout() {
    this.logger.info('Unlinking WhatsApp session');
    this.manualLogout = true;
    this.clearReconnect();
    const sock = this.sock;
    this.sock = null;
    this.qr = null;
    this.qrSequence += 1;
    try {
      await sock?.logout();
    } catch {
      // A stale socket cannot always complete the logout call.
    }
    await this.disposeSocket();
    await fs.rm(this.authDir, { recursive: true, force: true });
    this.store.clearMe();
    this.rawMedia.clear();
    this.state = 'disconnected';
    this.error = null;
    this.emitStatus();
    this.manualLogout = false;
    setTimeout(() => {
      this.start({ fresh: true }).catch((error) => this.logger.error(error));
    }, 450);
    return this.getStatus();
  }

  async syncGroups(sock) {
    if (this.sock !== sock || this.state !== 'connected') return;
    try {
      const groups = await sock.groupFetchAllParticipating();
      const entries = Object.values(groups || {});
      for (const group of entries) {
        if (!group?.id) continue;
        this.store.ensureChat(group.id, { name: group.subject || '' });
      }
      if (entries.length) {
        this.emit('chats', this.store.getChatSummaries());
        this.emit('contacts', this.store.getContacts());
      }
    } catch (error) {
      this.logger.warn(`Could not refresh group names: ${error.message}`);
    }
  }

  handleContacts(contacts = []) {
    let changed = false;
    for (const contact of contacts) {
      if (!contact?.id || isGroupJid(contact.id)) continue;
      const result = this.store.upsertContact({
        jid: contact.id,
        name: contact.name,
        notify: contact.notify,
        verifiedName: contact.verifiedName,
        phone: contact.phoneNumber,
        about: contact.status
      });
      if (result) changed = true;
    }
    if (changed) {
      this.emit('contacts', this.store.getContacts());
      this.emit('chats', this.store.getChatSummaries());
    }
  }

  handleChats(chats = []) {
    let changed = false;
    for (const chat of chats) {
      const jid = chat?.id || chat?.jid;
      if (!jid || !isChatJidAllowed(jid)) continue;
      this.store.ensureChat(jid, {
        name: chat.name,
        unread: chat.unreadCount,
        timestamp: chat.conversationTimestamp ? secondsToMs(chat.conversationTimestamp) : undefined,
        pinned: chat.pinned,
        archived: chat.archived
      });
      changed = true;
    }
    if (changed) this.emit('chats', this.store.getChatSummaries());
  }

  handleGroups(groups = []) {
    let changed = false;
    for (const group of groups) {
      const jid = group?.id || group?.jid;
      if (!jid || !isGroupJid(jid)) continue;
      this.store.ensureChat(jid, { name: group.subject || '' });
      changed = true;
    }
    if (changed) this.emit('chats', this.store.getChatSummaries());
  }

  handleHistory({ chats = [], contacts = [], messages = [] } = {}) {
    this.logger.info(`Syncing history: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} messages`);
    for (const contact of contacts) {
      if (!contact?.id || isGroupJid(contact.id)) continue;
      this.store.upsertContact({
        jid: contact.id,
        name: contact.name,
        notify: contact.notify,
        verifiedName: contact.verifiedName,
        phone: contact.phoneNumber,
        about: contact.status
      });
    }
    for (const chat of chats) {
      const jid = chat?.id || chat?.jid;
      if (!jid || !isChatJidAllowed(jid)) continue;
      this.store.ensureChat(jid, {
        name: chat.name,
        unread: chat.unreadCount,
        timestamp: chat.conversationTimestamp ? secondsToMs(chat.conversationTimestamp) : undefined,
        pinned: chat.pinned,
        archived: chat.archived
      });
    }
    for (const message of messages) {
      this.ingestMessage(message, { history: true, silent: true });
    }
    this.emit('chats', this.store.getChatSummaries());
    this.emit('contacts', this.store.getContacts());
  }

  handleMessages({ messages = [], type } = {}) {
    for (const raw of messages) {
      this.ingestMessage(raw, {
        history: false,
        incrementUnread: type === 'notify',
        silent: false
      });
    }
  }

  ingestMessage(raw, { history = false, incrementUnread = false, preserveUnread = history, silent = false, fallbackText = '' } = {}) {
    try {
      if (!raw?.key?.remoteJid || !raw.message) return false;
      const jid = raw.key.remoteJid;
      if (!isChatJidAllowed(jid)) return false;
      const fromMe = Boolean(raw.key.fromMe);
      const message = normalizeMessageContent(raw.message);
      if (!message) return false;

      const protocol = message.protocolMessage;
      if (protocol && Number(protocol.type) === 0 && protocol.key?.id) {
        return this.handleRevoke(jid, protocol.key.id, silent);
      }
      if (message.reactionMessage) {
        return this.handleReaction(jid, message.reactionMessage, raw, silent);
      }

      const content = extractContent(message);
      if (!content) return false;

      const participant = raw.participant || raw.key.participant || '';
      const senderJid = participant || (fromMe ? this.store.getMe()?.id || '' : jid);
      const senderContact = senderJid ? this.store.getContact(senderJid) : null;
      let senderName = fromMe
        ? this.store.getMe()?.name || 'You'
        : senderContact?.name || senderContact?.notify || raw.pushName || fallbackName(senderJid || jid);
      if (!fromMe && !isGroupJid(jid) && raw.pushName && !senderContact?.name) {
        this.store.upsertContact({ jid, notify: raw.pushName });
      }
      if (!fromMe && participant && raw.pushName && !senderContact?.name) {
        senderName = raw.pushName;
      }

      const type = content.type || 'text';
      const text = content.text || fallbackText || '';
      const stored = {
        id: raw.key.id || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        chatJid: jid,
        fromMe,
        participant,
        senderName,
        timestamp: secondsToMs(raw.messageTimestamp),
        type,
        text: messageText({ text, media: content.media }),
        status: fromMe ? Number(raw.status ?? 1) : null,
        quoted: quotedPreview(message[getContentType(message)]?.contextInfo),
        media: content.media || null
      };

      this.store.ensureChat(jid, {
        timestamp: stored.timestamp,
        isGroup: isGroupJid(jid)
      });
      const added = this.store.addMessage(stored, { incrementUnread, preserveUnread });
      if (!added) return false;

      if (stored.media && content.media?.kind !== 'location' && content.media?.kind !== 'contact') {
        this.cacheRawMedia(jid, stored.id, raw);
      }

      const summary = this.store.getChat(jid);
      const saved = this.store.getMessage(jid, stored.id);
      if (!silent) {
        this.emit('message', { chat: summary, message: saved });
        this.emit('chat', summary);
        this.emit('contacts', this.store.getContacts());
      }
      if (!history && incrementUnread && !fromMe && !isGroupJid(jid) && saved) {
        this.emit('incoming', { chat: summary, message: saved });
      }
      return true;
    } catch (error) {
      this.logger.error(`Could not process a message: ${error.stack || error.message}`);
      return false;
    }
  }

  handleRevoke(jid, targetId, silent) {
    const updated = this.store.updateMessage(jid, targetId, { deleted: true });
    if (!updated) return false;
    const summary = this.store.getChat(jid);
    if (!silent) {
      this.emit('message-update', { chatJid: jid, id: targetId, patch: { deleted: true, text: updated.text, media: null } });
      this.emit('chat', summary);
    }
    return true;
  }

  handleReaction(jid, reaction, raw, silent) {
    const targetId = reaction.key?.id;
    if (!targetId) return false;
    const emoji = String(reaction.text || '');
    const updated = this.store.updateMessage(jid, targetId, {
      reaction: emoji ? { emoji, fromMe: Boolean(raw.key.fromMe) } : null
    });
    if (!updated) return false;
    if (!silent) {
      this.emit('message-update', {
        chatJid: jid,
        id: targetId,
        patch: { reaction: updated.reaction }
      });
      this.emit('chat', this.store.getChat(jid));
    }
    return true;
  }

  handleMessageUpdates(updates = []) {
    for (const update of updates) {
      const jid = update?.key?.remoteJid;
      const id = update?.key?.id;
      if (!jid || !id) continue;
      const protocol = update.update?.message?.protocolMessage;
      if (protocol && Number(protocol.type) === 0 && protocol.key?.id) {
        this.handleRevoke(jid, protocol.key.id, false);
        continue;
      }
      if (update.update?.status !== undefined) {
        const message = this.store.updateMessage(jid, id, { status: Number(update.update.status) });
        if (message) {
          this.emit('message-update', { chatJid: jid, id, patch: { status: message.status } });
          this.emit('chat', this.store.getChat(jid));
        }
      }
    }
  }

  handleReceipts(updates = []) {
    for (const update of updates) {
      const jid = update?.key?.remoteJid;
      const id = update?.key?.id;
      if (!jid || !id) continue;
      const receipt = update.receipt || {};
      let status = null;
      if (receipt.playedTimestamp) status = 5;
      else if (receipt.readTimestamp) status = 4;
      else if (receipt.receiptTimestamp) status = 3;
      if (status === null) continue;
      const message = this.store.updateMessage(jid, id, { status });
      if (message) {
        this.emit('message-update', { chatJid: jid, id, patch: { status } });
        this.emit('chat', this.store.getChat(jid));
      }
    }
  }

  cacheRawMedia(jid, id, raw) {
    const key = `${jid}|${id}`;
    this.rawMedia.set(key, raw);
    if (this.rawMedia.size > MAX_RAW_MEDIA) {
      const oldest = this.rawMedia.keys().next().value;
      if (oldest) this.rawMedia.delete(oldest);
    }
  }

  async downloadMedia(jid, id) {
    const message = this.store.getMessage(jid, id);
    if (!message?.media) {
      const error = new Error('This message has no downloadable media.');
      error.code = 'NO_MEDIA';
      throw error;
    }
    const raw = this.rawMedia.get(`${jid}|${id}`);
    if (!raw) {
      const error = new Error('Media is no longer in the live cache. Open the message on your phone, or re-link and sync again.');
      error.code = 'MEDIA_EXPIRED';
      throw error;
    }
    const buffer = await downloadMediaMessage(
      raw,
      'buffer',
      {},
      { logger: this.baileysLogger, reuploadRequest: this.sock?.updateMediaMessage }
    );
    return { buffer, media: message.media };
  }

  async sendText(jid, text, { preserveUnread = false } = {}) {
    if (!isChatJidAllowed(jid)) {
      const error = new Error('That chat is not supported.');
      error.code = 'BAD_CHAT';
      throw error;
    }
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      const error = new Error('Write a message first.');
      error.code = 'EMPTY';
      throw error;
    }
    if (trimmed.length > 8000) {
      const error = new Error('Messages can be at most 8,000 characters.');
      error.code = 'TOO_LONG';
      throw error;
    }
    if (this.state !== 'connected' || !this.sock) {
      const error = new Error('WhatsApp is not connected. Reconnect before sending.');
      error.code = 'OFFLINE';
      throw error;
    }

    let sent;
    try {
      sent = await this.sock.sendMessage(jid, { text: trimmed });
    } catch (error) {
      const wrapped = new Error(`WhatsApp could not send that message: ${error.message}`);
      wrapped.code = 'OFFLINE';
      throw wrapped;
    }
    if (sent?.key?.id) {
      this.store.ensureChat(jid);
      const already = this.store.getMessage(jid, sent.key.id);
      if (!already) {
        this.ingestMessage(
          { ...sent, messageTimestamp: sent.messageTimestamp || Math.floor(Date.now() / 1000) },
          {
            history: false,
            incrementUnread: false,
            preserveUnread,
            silent: true,
            fallbackText: trimmed
          }
        );
      }
    }
    let saved = sent?.key?.id ? this.store.getMessage(jid, sent.key.id) : null;
    if (!saved) {
      const id = sent?.key?.id || `local-${Date.now()}`;
      this.store.addMessage(
        {
          id,
          chatJid: jid,
          fromMe: true,
          timestamp: Date.now(),
          type: 'text',
          text: trimmed,
          status: 1
        },
        { preserveUnread }
      );
      saved = this.store.getMessage(jid, id);
    }
    const summary = this.store.getChat(jid);
    this.emit('message', { chat: summary, message: saved });
    this.emit('chat', summary);
    this.emit('contacts', this.store.getContacts());
    return { message: saved, chat: summary };
  }

  async sendTyping(jid, isTyping) {
    if (this.state !== 'connected' || !this.sock) return;
    try {
      await this.sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', jid);
    } catch {
      // Presence updates are best-effort.
    }
  }

  async openChat(phone, name = '') {
    const digits = normalizePhone(phone);
    if (!digits) {
      const error = new Error('Enter a valid phone number with its country code.');
      error.code = 'BAD_PHONE';
      throw error;
    }
    let jid = `${digits}@s.whatsapp.net`;
    if (this.state === 'connected' && this.sock) {
      try {
        const results = await this.sock.onWhatsApp(jid);
        const match = Array.isArray(results) ? results.find((item) => item?.exists) : null;
        if (!match) {
          const error = new Error('That phone number is not on WhatsApp.');
          error.code = 'NOT_ON_WHATSAPP';
          throw error;
        }
        jid = match.jid || match.id || jid;
      } catch (error) {
        if (error.code === 'NOT_ON_WHATSAPP') throw error;
        this.logger.warn(`Could not verify number: ${error.message}`);
      }
    }
    this.store.upsertContact({ jid, phone: digits, name: name.trim() });
    this.store.ensureChat(jid);
    const summary = this.store.getChat(jid);
    this.emit('contacts', this.store.getContacts());
    this.emit('chat', summary);
    return summary;
  }

  async destroy() {
    this.manualLogout = true;
    this.clearReconnect();
    await this.disposeSocket();
  }
}
