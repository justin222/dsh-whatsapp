import fs from 'node:fs';
import path from 'node:path';
import {
  contactName,
  fallbackName,
  formatPhone,
  isChatJidAllowed,
  isDirectJid,
  isGroupJid,
  phoneFromJid
} from './jid.js';

const MAX_MESSAGES_PER_CHAT = 600;
const MAX_TOTAL_MESSAGES = 40_000;
const MAX_CHATS = 800;
const MAX_CONTACTS = 6000;
const SAVE_DEBOUNCE_MS = 450;

const DEFAULT_AUTO_REPLY = {
  enabled: false,
  text: "Hi! Thanks for your message. I'll get back to you soon.",
  cooldownMinutes: 10
};

function blankData() {
  return {
    version: 1,
    me: null,
    contacts: {},
    chats: {},
    messages: {},
    settings: {
      autoReply: { ...DEFAULT_AUTO_REPLY }
    },
    savedAt: null
  };
}

function asTimestamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number < 1e12 ? Math.round(number * 1000) : Math.round(number);
}

function cleanText(value, max = 8000) {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .slice(0, max);
}

function typeLabel(message) {
  if (!message) return 'Message';
  if (message.deleted) return 'This message was deleted';
  switch (message.media?.kind || message.type) {
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    case 'audio':
      return 'Voice message';
    case 'sticker':
      return 'Sticker';
    case 'document':
      return message.media?.fileName || 'Document';
    case 'location':
      return 'Location';
    case 'contact':
      return 'Contact card';
    case 'poll':
      return 'Poll';
    default:
      return 'Message';
  }
}

function previewText(message) {
  if (!message) return '';
  const text = cleanText(message.text, 800);
  return text || typeLabel(message);
}

function messagePreview(message) {
  if (!message) return null;
  return {
    id: message.id,
    type: message.type,
    text: previewText(message).slice(0, 500),
    fromMe: Boolean(message.fromMe),
    senderName: message.senderName || '',
    timestamp: message.timestamp,
    status: message.status ?? null,
    mediaKind: message.media?.kind || null
  };
}

export class Store {
  constructor(file) {
    this.file = file;
    this.data = blankData();
    this.saveTimer = null;
    this.dirty = false;
    this.writeChain = Promise.resolve();
    this.load();
    this.totalMessages = this.countMessages();
  }

  countMessages() {
    return Object.values(this.data.messages).reduce((total, list) => total + list.length, 0);
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = {
        ...blankData(),
        ...parsed,
        contacts: parsed.contacts && typeof parsed.contacts === 'object' ? parsed.contacts : {},
        chats: parsed.chats && typeof parsed.chats === 'object' ? parsed.chats : {},
        messages: parsed.messages && typeof parsed.messages === 'object' ? parsed.messages : {},
        settings: {
          ...blankData().settings,
          ...(parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {}),
          autoReply: {
            ...DEFAULT_AUTO_REPLY,
            ...(parsed.settings?.autoReply && typeof parsed.settings.autoReply === 'object'
              ? parsed.settings.autoReply
              : {})
          }
        }
      };
      this.sanitize();
    } catch (error) {
      if (error.code !== 'ENOENT') {
        const backup = `${this.file}.corrupt-${Date.now()}`;
        try {
          fs.mkdirSync(path.dirname(this.file), { recursive: true });
          fs.renameSync(this.file, backup);
          console.warn(`[store] Could not read data file. Moved it to ${backup}`);
        } catch {
          console.warn('[store] Could not read or back up the local data file.');
        }
      }
    }
  }

  sanitize() {
    for (const jid of Object.keys(this.data.chats)) {
      if (!isChatJidAllowed(jid)) {
        delete this.data.chats[jid];
        delete this.data.messages[jid];
        continue;
      }
      const chat = this.data.chats[jid];
      if (!chat || typeof chat !== 'object') {
        delete this.data.chats[jid];
        continue;
      }
      chat.jid = jid;
      chat.isGroup = isGroupJid(jid);
      chat.timestamp = asTimestamp(chat.timestamp);
      chat.unread = Math.max(0, Math.min(999, Number(chat.unread) || 0));
      chat.name = cleanText(chat.name || '', 200);
      chat.lastMessage = chat.lastMessage || null;
      if (!Array.isArray(this.data.messages[jid])) this.data.messages[jid] = [];
    }
    for (const jid of Object.keys(this.data.contacts)) {
      if (!isChatJidAllowed(jid)) delete this.data.contacts[jid];
    }
    for (const jid of Object.keys(this.data.messages)) {
      if (!this.data.chats[jid]) delete this.data.messages[jid];
    }
    const autoReply = this.data.settings.autoReply;
    autoReply.enabled = Boolean(autoReply.enabled);
    autoReply.text = cleanText(autoReply.text || DEFAULT_AUTO_REPLY.text, 1000).trim() || DEFAULT_AUTO_REPLY.text;
    autoReply.cooldownMinutes = Math.max(1, Math.min(1440, Math.round(Number(autoReply.cooldownMinutes) || 10)));
  }

  scheduleSave() {
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush().catch((error) => console.error('[store] Save failed:', error.message));
    }, SAVE_DEBOUNCE_MS);
  }

  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    const snapshot = JSON.stringify({ ...this.data, savedAt: new Date().toISOString() });
    this.writeChain = this.writeChain.then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      await fs.promises.writeFile(temp, snapshot, 'utf8');
      await fs.promises.rename(temp, this.file);
    });
    await this.writeChain;
    if (this.dirty) this.scheduleSave();
  }

  flushSync() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      fs.writeFileSync(temp, JSON.stringify({ ...this.data, savedAt: new Date().toISOString() }), 'utf8');
      fs.renameSync(temp, this.file);
      this.dirty = false;
    } catch (error) {
      console.error('[store] Final save failed:', error.message);
    }
  }

  getMe() {
    return this.data.me;
  }

  setMe(user) {
    const jid = user?.id || user?.jid || '';
    if (!jid) return;
    const phone = phoneFromJid(jid);
    const previous = this.data.me || {};
    const next = {
      id: jid,
      name: cleanText(user.name || user.notify || user.verifiedName || previous.name || '', 120),
      phone: phone || previous.phone || ''
    };
    if (!next.name) next.name = next.phone ? formatPhone(next.phone) : 'My WhatsApp';
    this.data.me = next;
    this.scheduleSave();
  }

  clearMe() {
    if (!this.data.me) return;
    this.data.me = null;
    this.scheduleSave();
  }

  getSettings() {
    return {
      autoReply: { ...this.data.settings.autoReply }
    };
  }

  updateAutoReply(patch = {}) {
    const next = { ...this.data.settings.autoReply };
    if (patch.enabled !== undefined) next.enabled = Boolean(patch.enabled);
    if (patch.text !== undefined) {
      const text = cleanText(patch.text, 1000).trim();
      if (!text) {
        const error = new Error('Auto-reply text cannot be empty.');
        error.code = 'BAD_TEXT';
        throw error;
      }
      next.text = text;
    }
    if (patch.cooldownMinutes !== undefined) {
      const minutes = Number(patch.cooldownMinutes);
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
        const error = new Error('Cooldown must be between 1 and 1440 minutes.');
        error.code = 'BAD_COOLDOWN';
        throw error;
      }
      next.cooldownMinutes = Math.round(minutes);
    }
    this.data.settings.autoReply = next;
    this.scheduleSave();
    return this.getSettings();
  }

  getContact(jid) {
    return this.data.contacts[jid] || null;
  }

  upsertContact(input) {
    if (!input) return null;
    const jid = input.jid || input.id;
    if (!isChatJidAllowed(jid) || isGroupJid(jid)) return null;
    const previous = this.data.contacts[jid] || {};
    const next = {
      ...previous,
      jid,
      name: cleanText(input.name || previous.name || '', 200),
      verifiedName: cleanText(input.verifiedName || previous.verifiedName || '', 200),
      notify: cleanText(input.notify || previous.notify || '', 200),
      phone:
        phoneFromJid(input.phone) ||
        (String(input.phone || '').includes('@') ? '' : String(input.phone || '').replace(/\D/g, '')) ||
        previous.phone ||
        phoneFromJid(jid) ||
        '',
      about: cleanText(input.about || previous.about || '', 500),
      updatedAt: Date.now()
    };
    this.data.contacts[jid] = next;
    if (Object.keys(this.data.contacts).length > MAX_CONTACTS) {
      const oldest = Object.values(this.data.contacts)
        .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
        .slice(0, Object.keys(this.data.contacts).length - MAX_CONTACTS);
      for (const contact of oldest) delete this.data.contacts[contact.jid];
    }
    this.scheduleSave();
    return next;
  }

  ensureChat(jid, fields = {}) {
    if (!isChatJidAllowed(jid)) return null;
    let chat = this.data.chats[jid];
    if (!chat) {
      chat = {
        jid,
        name: '',
        isGroup: isGroupJid(jid),
        unread: 0,
        timestamp: 0,
        lastMessage: null,
        pinned: false,
        archived: false,
        createdAt: Date.now()
      };
      this.data.chats[jid] = chat;
      if (!Array.isArray(this.data.messages[jid])) this.data.messages[jid] = [];
      this.pruneChats();
    }
    if (fields.name) chat.name = cleanText(fields.name, 200);
    if (fields.unread !== undefined) {
      chat.unread = Math.max(0, Math.min(999, Number(fields.unread) || 0));
    }
    if (fields.timestamp !== undefined) {
      const timestamp = asTimestamp(fields.timestamp);
      if (timestamp > chat.timestamp) chat.timestamp = timestamp;
    }
    if (fields.pinned !== undefined) chat.pinned = Boolean(fields.pinned);
    if (fields.archived !== undefined) chat.archived = Boolean(fields.archived);
    this.scheduleSave();
    return chat;
  }

  pruneChats() {
    const jids = Object.keys(this.data.chats);
    if (jids.length <= MAX_CHATS) return;
    const remove = jids
      .map((jid) => this.data.chats[jid])
      .filter((chat) => !chat.pinned && !chat.unread)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(0, jids.length - MAX_CHATS);
    for (const chat of remove) {
      this.totalMessages -= (this.data.messages[chat.jid] || []).length;
      delete this.data.chats[chat.jid];
      delete this.data.messages[chat.jid];
    }
    this.totalMessages = Math.max(0, this.totalMessages);
  }

  pruneTotalMessages() {
    if (this.totalMessages <= MAX_TOTAL_MESSAGES) return;
    let excess = this.totalMessages - MAX_TOTAL_MESSAGES + 250;
    const chats = Object.entries(this.data.messages)
      .filter(([, list]) => list.length)
      .sort((a, b) => (a[1][0]?.timestamp || 0) - (b[1][0]?.timestamp || 0));
    for (const [jid, list] of chats) {
      if (excess <= 0) break;
      const removeCount = Math.min(list.length, excess);
      list.splice(0, removeCount);
      excess -= removeCount;
      this.totalMessages -= removeCount;
      const chat = this.data.chats[jid];
      if (chat) {
        if (list.length) chat.lastMessage = messagePreview(list[list.length - 1]);
        else chat.lastMessage = null;
      }
    }
  }

  addMessage(message, { incrementUnread = false, preserveUnread = false } = {}) {
    const jid = message?.chatJid;
    if (!jid || !message.id || !isChatJidAllowed(jid)) return false;
    const chat = this.ensureChat(jid);
    if (!chat) return false;
    const list = this.data.messages[jid] || (this.data.messages[jid] = []);
    if (list.some((existing) => existing.id === message.id)) return false;

    const clean = {
      id: String(message.id),
      chatJid: jid,
      fromMe: Boolean(message.fromMe),
      participant: message.participant || '',
      senderName: cleanText(message.senderName || '', 160),
      timestamp: asTimestamp(message.timestamp) || Date.now(),
      type: cleanText(message.type || 'text', 40),
      text: cleanText(message.text || '', 8000),
      status: message.status ?? null,
      quoted: message.quoted || null,
      media: message.media || null,
      reaction: null,
      deleted: Boolean(message.deleted),
      pending: false
    };

    let index = list.length;
    while (index > 0 && (list[index - 1].timestamp || 0) > clean.timestamp) index -= 1;
    list.splice(index, 0, clean);
    let removed = 0;
    if (list.length > MAX_MESSAGES_PER_CHAT) {
      removed = list.length - MAX_MESSAGES_PER_CHAT;
      list.splice(0, removed);
    }
    this.totalMessages = (this.totalMessages || 0) + 1 - removed;

    if (!chat.lastMessage || clean.timestamp >= (chat.lastMessage.timestamp || 0)) {
      chat.lastMessage = messagePreview(clean);
      chat.timestamp = Math.max(chat.timestamp, clean.timestamp);
    }
    if (clean.fromMe) {
      if (!preserveUnread) chat.unread = 0;
    } else if (incrementUnread) {
      chat.unread = Math.min(999, (chat.unread || 0) + 1);
    }
    this.pruneTotalMessages();
    this.scheduleSave();
    return true;
  }

  getMessage(jid, id) {
    return (this.data.messages[jid] || []).find((message) => message.id === id) || null;
  }

  getMessages(jid, { limit = 80, before = 0 } = {}) {
    const all = this.data.messages[jid] || [];
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 80));
    const cutoff = asTimestamp(before);
    const filtered = cutoff ? all.filter((message) => message.timestamp < cutoff) : all;
    const start = Math.max(0, filtered.length - safeLimit);
    return {
      messages: filtered.slice(start),
      hasMore: start > 0,
      total: all.length
    };
  }

  updateMessage(jid, id, patch) {
    const list = this.data.messages[jid] || [];
    const message = list.find((item) => item.id === id);
    if (!message) return null;
    if (patch.status !== undefined) message.status = patch.status;
    if (patch.reaction !== undefined) message.reaction = patch.reaction;
    if (patch.deleted !== undefined) {
      message.deleted = Boolean(patch.deleted);
      if (message.deleted) {
        message.text = 'This message was deleted';
        message.media = null;
      }
    }
    if (patch.text !== undefined) message.text = cleanText(patch.text, 8000);
    const chat = this.data.chats[jid];
    if (chat?.lastMessage?.id === id) {
      chat.lastMessage = messagePreview(message);
    }
    this.scheduleSave();
    return message;
  }

  markRead(jid) {
    const chat = this.data.chats[jid];
    if (!chat || !chat.unread) return false;
    chat.unread = 0;
    this.scheduleSave();
    return true;
  }

  getChat(jid) {
    return this.summarizeChat(jid);
  }

  summarizeChat(jid) {
    const chat = this.data.chats[jid];
    if (!chat) return null;
    const contact = this.data.contacts[jid] || null;
    const name = isGroupJid(jid)
      ? chat.name || 'Group chat'
      : (contact ? contactName(contact, jid) : '') || chat.name || fallbackName(jid);
    const last = chat.lastMessage;
    let snippet = '';
    if (last) {
      let prefix = '';
      if (last.fromMe) prefix = 'You: ';
      else if (chat.isGroup && last.senderName) prefix = `${last.senderName}: `;
      snippet = `${prefix}${last.text || typeLabel(last)}`.trim();
    }
    return {
      jid,
      name,
      phone: contact?.phone || phoneFromJid(jid) || '',
      isGroup: Boolean(chat.isGroup),
      unread: chat.unread || 0,
      timestamp: chat.timestamp || 0,
      pinned: Boolean(chat.pinned),
      archived: Boolean(chat.archived),
      lastMessage: last ? { ...last } : null,
      snippet
    };
  }

  getChatSummaries() {
    return Object.keys(this.data.chats)
      .map((jid) => this.summarizeChat(jid))
      .filter(Boolean)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
  }

  getContacts() {
    const map = new Map();
    for (const contact of Object.values(this.data.contacts)) {
      if (!isDirectJid(contact.jid)) continue;
      map.set(contact.jid, {
        jid: contact.jid,
        name: contactName(contact, contact.jid),
        phone: contact.phone || phoneFromJid(contact.jid),
        about: contact.about || '',
        hasChat: false,
        lastTimestamp: 0
      });
    }
    for (const chat of Object.values(this.data.chats)) {
      if (!isDirectJid(chat.jid) || !isChatJidAllowed(chat.jid)) continue;
      const contact = this.data.contacts[chat.jid];
      const existing = map.get(chat.jid) || {
        jid: chat.jid,
        name: contact ? contactName(contact, chat.jid) : chat.name || fallbackName(chat.jid),
        phone: contact?.phone || phoneFromJid(chat.jid) || '',
        about: contact?.about || '',
        hasChat: true,
        lastTimestamp: 0
      };
      existing.hasChat = true;
      existing.lastTimestamp = Math.max(existing.lastTimestamp, chat.timestamp || 0);
      if (!existing.name || existing.name === fallbackName(chat.jid)) {
        existing.name = contact ? contactName(contact, chat.jid) : chat.name || existing.name;
      }
      map.set(chat.jid, existing);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  getStats() {
    return {
      chats: Object.keys(this.data.chats).length,
      contacts: Object.keys(this.data.contacts).length,
      messages: this.totalMessages
    };
  }
}
