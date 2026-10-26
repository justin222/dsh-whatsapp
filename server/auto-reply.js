import { isDirectJid } from './jid.js';

const REPLY_DELAY_MS = 3_500;
const MAX_MESSAGE_AGE_MS = 2 * 60 * 1000;

/**
 * A deliberately conservative auto-reply controller.
 *
 * It only replies to live one-to-one incoming messages, never to groups,
 * history-sync messages, or messages sent by this account. It waits a moment,
 * skips if the user is already viewing the chat or has replied manually, and
 * rate-limits each contact to one automatic reply per cooldown window.
 */
export class AutoReplyService {
  constructor({ store, manager, isChatActive = () => false, logger = console }) {
    this.store = store;
    this.manager = manager;
    this.isChatActive = isChatActive;
    this.logger = logger;
    this.pending = new Map();
    this.lastReplyAt = new Map();
    this.destroyed = false;
  }

  handle({ chat, message }) {
    if (this.destroyed || !chat || !message) return;
    if (chat.isGroup || message.fromMe || !isDirectJid(chat.jid)) return;
    if (this.isChatActive(chat.jid)) return;

    const settings = this.store.getSettings().autoReply;
    if (!settings.enabled) return;

    const age = Date.now() - Number(message.timestamp || 0);
    if (!Number.isFinite(age) || age > MAX_MESSAGE_AGE_MS) return;

    const cooldownMs = settings.cooldownMinutes * 60_000;
    const last = this.lastReplyAt.get(chat.jid) || 0;
    if (Date.now() - last < cooldownMs) return;
    if (this.pending.has(chat.jid)) return;

    const timer = setTimeout(() => {
      this.pending.delete(chat.jid);
      this.send(chat, message).catch((error) => {
        this.logger.warn(`[auto-reply] ${error.message}`);
      });
    }, REPLY_DELAY_MS);

    this.pending.set(chat.jid, { timer, messageId: message.id, at: Date.now() });
  }

  async send(chat, incoming) {
    if (this.destroyed) return;
    const settings = this.store.getSettings().autoReply;
    if (!settings.enabled) return;
    if (this.isChatActive(chat.jid)) return;

    const current = this.store.getChat(chat.jid);
    if (!current) return;

    const cooldownMs = settings.cooldownMinutes * 60_000;
    const last = this.lastReplyAt.get(chat.jid) || 0;
    if (Date.now() - last < cooldownMs) return;

    // If a manual reply (or another automatic one) already went out after the
    // incoming message, do not pile on a second response.
    const recent = this.store.getMessages(chat.jid, { limit: 30 }).messages;
    const alreadyReplied = recent.some(
      (message) => message.fromMe && message.timestamp > incoming.timestamp
    );
    if (alreadyReplied) return;

    try {
      await this.manager.sendText(chat.jid, settings.text, { preserveUnread: true });
      this.lastReplyAt.set(chat.jid, Date.now());
      this.logger.info(`[auto-reply] replied to ${current.name || chat.jid}`);
    } catch (error) {
      this.logger.warn(`[auto-reply] could not reply to ${current.name || chat.jid}: ${error.message}`);
    }
  }

  destroy() {
    this.destroyed = true;
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
  }
}
