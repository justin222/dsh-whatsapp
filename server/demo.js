import { EventEmitter } from 'node:events';
import { fallbackName, formatPhone, normalizePhone } from './jid.js';

const people = [
  { name: 'Maya Chen', phone: '14155550147', about: 'Product designer · she/her' },
  { name: 'Daniel Okafor', phone: '447700900132', about: 'Finance & operations' },
  { name: 'Priya Raman', phone: '919876543210', about: 'Photographer and travel addict' },
  { name: 'Luca Bianchi', phone: '393205550198', about: 'Studio manager, Milan' },
  { name: 'Sofia Alvarez', phone: '34612555014', about: 'Bookings & events' },
  { name: 'Noah Williams', phone: '12125550188', about: 'Weekend hiker' },
  { name: 'Mum', phone: '447700900456', about: '' },
  { name: 'Aunt Rosa', phone: '351912345678', about: 'In the garden 🌱' },
  { name: 'Sam Patel', phone: '6591234567', about: 'New number' },
  { name: 'Nadia Kim', phone: '821055501234', about: 'Illustrator' }
];

const personByPhone = new Map(people.map((person) => [person.phone, person]));

function jidFor(phone) {
  return `${phone}@s.whatsapp.net`;
}

function minutesAgo(minutes) {
  return Date.now() - minutes * 60_000;
}

function makeMessage({ id, jid, fromMe = false, participant = '', senderName = '', text, ts, status = null, quoted = null, type = 'text' }) {
  return {
    id,
    chatJid: jid,
    fromMe,
    participant,
    senderName,
    timestamp: ts,
    type,
    text,
    status,
    quoted
  };
}

export function seedDemo(store) {
  if (store.getChatSummaries().length > 0) return false;

  store.setMe({ id: jidFor('14155550132'), name: 'Alex Morgan' });
  for (const person of people) {
    store.upsertContact({
      jid: jidFor(person.phone),
      name: person.name,
      phone: person.phone,
      about: person.about
    });
  }

  const maya = jidFor('14155550147');
  store.ensureChat(maya);
  const mayaMessages = [
    makeMessage({ id: 'demo-maya-1', jid: maya, participant: maya, senderName: 'Maya Chen', text: 'Hey! Are we still on for the design review tomorrow?', ts: minutesAgo(1585) }),
    makeMessage({ id: 'demo-maya-2', jid: maya, fromMe: true, text: "Yes — 10:30 works for me. I'll bring the latest screens.", ts: minutesAgo(1575), status: 4 }),
    makeMessage({ id: 'demo-maya-3', jid: maya, participant: maya, senderName: 'Maya Chen', text: 'Perfect. I left a few notes in the doc, mostly around onboarding.', ts: minutesAgo(1568) }),
    makeMessage({ id: 'demo-maya-4', jid: maya, fromMe: true, text: 'Saw them. The empty-state idea is great — let’s try it.', ts: minutesAgo(1553), status: 4 }),
    makeMessage({ id: 'demo-maya-5', jid: maya, participant: maya, senderName: 'Maya Chen', text: 'Deal. Also, coffee before? The place on 4th is open again ☕', ts: minutesAgo(1550) }),
    makeMessage({ id: 'demo-maya-6', jid: maya, fromMe: true, text: 'Obviously. 10:00?', ts: minutesAgo(1548), status: 4 }),
    makeMessage({ id: 'demo-maya-7', jid: maya, participant: maya, senderName: 'Maya Chen', text: '10:00 it is 🙌', ts: minutesAgo(1547) }),
    makeMessage({ id: 'demo-maya-8', jid: maya, participant: maya, senderName: 'Maya Chen', text: 'Morning! I added the empty-state notes to the doc.', ts: minutesAgo(192) }),
    makeMessage({ id: 'demo-maya-9', jid: maya, fromMe: true, text: "You're a machine. Reviewing now.", ts: minutesAgo(184), status: 4 }),
    makeMessage({ id: 'demo-maya-10', jid: maya, participant: maya, senderName: 'Maya Chen', text: 'Coffee still on? ☕', ts: minutesAgo(36) })
  ];
  for (const message of mayaMessages) store.addMessage(message);
  store.updateMessage(maya, 'demo-maya-10', { reaction: { emoji: '❤️', fromMe: true } });
  store.ensureChat(maya, { unread: 1 });

  const daniel = jidFor('447700900132');
  store.ensureChat(daniel);
  const danielMessages = [
    makeMessage({ id: 'demo-daniel-1', jid: daniel, fromMe: true, text: 'Invoice ready to send?', ts: minutesAgo(1322), status: 4 }),
    makeMessage({ id: 'demo-daniel-2', jid: daniel, participant: daniel, senderName: 'Daniel Okafor', text: 'Yep — sending it this afternoon.', ts: minutesAgo(1318) }),
    makeMessage({ id: 'demo-daniel-3', jid: daniel, participant: daniel, senderName: 'Daniel Okafor', text: 'Just sent it. Let me know if the format needs tweaking.', ts: minutesAgo(242) }),
    makeMessage({
      id: 'demo-daniel-4',
      jid: daniel,
      participant: daniel,
      senderName: 'Daniel Okafor',
      text: 'Also — the client asked for a short summary by Friday.',
      ts: minutesAgo(238),
      quoted: { text: 'Just sent it. Let me know if the format needs tweaking.', participant: daniel, type: 'text' }
    })
  ];
  for (const message of danielMessages) store.addMessage(message);
  store.ensureChat(daniel, { unread: 2 });

  const priya = jidFor('919876543210');
  store.ensureChat(priya);
  store.addMessage(makeMessage({ id: 'demo-priya-1', jid: priya, participant: priya, senderName: 'Priya Raman', text: 'The photos from the trip are uploaded! Link in the group.', ts: minutesAgo(295) }));
  store.addMessage(makeMessage({ id: 'demo-priya-2', jid: priya, fromMe: true, text: 'They look incredible. The one from the ridge is my favourite.', ts: minutesAgo(286), status: 4 }));
  store.addMessage(makeMessage({ id: 'demo-priya-3', jid: priya, participant: priya, senderName: 'Priya Raman', text: 'I’ll send you the full-res version tonight 📷', ts: minutesAgo(280) }));
  store.ensureChat(priya, { unread: 1 });

  const hikers = '120363041234567890@g.us';
  store.ensureChat(hikers, { name: 'Weekend Hikers' });
  const hikerMessages = [
    makeMessage({ id: 'demo-hike-1', jid: hikers, participant: jidFor('34612555014'), senderName: 'Sofia Alvarez', text: 'Trail conditions look good for Saturday.', ts: minutesAgo(310) }),
    makeMessage({ id: 'demo-hike-2', jid: hikers, participant: jidFor('12125550188'), senderName: 'Noah Williams', text: 'Count me in. What time at the trailhead?', ts: minutesAgo(302) }),
    makeMessage({ id: 'demo-hike-3', jid: hikers, fromMe: true, text: '8am? Earlier means fewer people.', ts: minutesAgo(294), status: 4 }),
    makeMessage({ id: 'demo-hike-4', jid: hikers, participant: jidFor('393205550198'), senderName: 'Luca Bianchi', text: '8am works. I’ll bring the good thermos.', ts: minutesAgo(288) })
  ];
  for (const message of hikerMessages) store.addMessage(message);
  store.ensureChat(hikers, { unread: 2 });

  const studio = '120363049876543210@g.us';
  store.ensureChat(studio, { name: 'Studio Team' });
  const studioMessages = [
    makeMessage({ id: 'demo-studio-1', jid: studio, participant: priya, senderName: 'Priya Raman', text: 'New moodboard is up — warm greens and a lot of paper texture.', ts: minutesAgo(1480) }),
    makeMessage({ id: 'demo-studio-2', jid: studio, participant: maya, senderName: 'Maya Chen', text: 'Love it. Can we review at standup?', ts: minutesAgo(1468) }),
    makeMessage({ id: 'demo-studio-3', jid: studio, fromMe: true, text: 'Yes, let’s spend ten minutes on it.', ts: minutesAgo(1460), status: 4 })
  ];
  for (const message of studioMessages) store.addMessage(message);

  const mum = jidFor('447700900456');
  store.ensureChat(mum);
  store.addMessage(makeMessage({ id: 'demo-mum-1', jid: mum, participant: mum, senderName: 'Mum', text: 'Did you get the parcel?', ts: minutesAgo(4320) }));
  store.addMessage(makeMessage({ id: 'demo-mum-2', jid: mum, fromMe: true, text: 'Yes! Thank you. The biscuits didn’t last the evening.', ts: minutesAgo(4300), status: 4 }));
  store.addMessage(makeMessage({ id: 'demo-mum-3', jid: mum, fromMe: true, text: 'Call you Sunday ❤️', ts: minutesAgo(2860), status: 3 }));

  const luca = jidFor('393205550198');
  store.ensureChat(luca);
  store.addMessage(makeMessage({ id: 'demo-luca-1', jid: luca, participant: luca, senderName: 'Luca Bianchi', text: 'The studio is free after 6 if you want to record.', ts: minutesAgo(7200) }));
  store.addMessage(makeMessage({ id: 'demo-luca-2', jid: luca, fromMe: true, text: 'Grazie! See you at the studio.', ts: minutesAgo(7150), status: 4 }));

  const sofia = jidFor('34612555014');
  store.ensureChat(sofia);
  store.addMessage(makeMessage({ id: 'demo-sofia-1', jid: sofia, participant: sofia, senderName: 'Sofia Alvarez', text: 'Sending the booking confirmation now.', ts: minutesAgo(8600) }));

  const noah = jidFor('12125550188');
  store.ensureChat(noah);
  store.addMessage(makeMessage({ id: 'demo-noah-1', jid: noah, participant: noah, senderName: 'Noah Williams', text: 'That podcast episode was excellent.', ts: minutesAgo(11500) }));

  const rosa = jidFor('351912345678');
  store.ensureChat(rosa);
  store.addMessage(makeMessage({ id: 'demo-rosa-1', jid: rosa, participant: rosa, senderName: 'Aunt Rosa', text: 'The lemon tree is flowering again 🍋', ts: minutesAgo(2870) }));
  store.ensureChat(rosa, { unread: 1 });

  return true;
}

const directReplies = [
  'Sounds good to me.',
  'Perfect — thanks!',
  'I’ll take a look and get back to you.',
  'On my way 🚶',
  'Can we do tomorrow instead?',
  'Got it. Talk soon!'
];

const mayaReplies = ['Coffee confirmed ☕', 'Perfect, see you then!', 'I’ll add that to the doc.'];
const danielReplies = ['Got it — thanks!', 'I’ll take care of it.', 'Makes sense to me.'];
const groupReplies = ['Count me in.', 'Works for me 👍', 'I’ll bring snacks.', 'Can’t make it this time — next round?'];

export class DemoManager extends EventEmitter {
  constructor({ store, logger = console }) {
    super();
    this.store = store;
    this.logger = logger;
    this.timers = new Set();
    this.replyIndex = 0;
    this.startedAt = Date.now();
  }

  getStatus() {
    return {
      state: 'demo',
      qr: null,
      me: this.store.getMe(),
      error: null,
      demo: true,
      connectedAt: this.startedAt,
      updatedAt: Date.now()
    };
  }

  emitStatus() {
    this.emit('status', this.getStatus());
  }

  async start() {
    const seeded = seedDemo(this.store);
    if (seeded) this.logger.info('Demo workspace seeded');
    this.emitStatus();
    this.emit('chats', this.store.getChatSummaries());
    this.emit('contacts', this.store.getContacts());
  }

  async restart() {
    this.emitStatus();
    return this.getStatus();
  }

  async logout() {
    return this.getStatus();
  }

  later(callback, delay) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    this.timers.add(timer);
  }

  async sendText(jid, text) {
    const chat = this.store.getChat(jid);
    if (!chat) {
      const error = new Error('That chat does not exist.');
      error.code = 'BAD_CHAT';
      throw error;
    }
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      const error = new Error('Write a message first.');
      error.code = 'EMPTY';
      throw error;
    }
    const id = `demo-out-${Date.now()}`;
    this.store.addMessage({
      id,
      chatJid: jid,
      fromMe: true,
      timestamp: Date.now(),
      type: 'text',
      text: trimmed,
      status: 1
    });
    let summary = this.store.getChat(jid);
    const saved = this.store.getMessage(jid, id);
    this.emit('message', { chat: summary, message: saved });
    this.emit('chat', summary);
    this.emit('contacts', this.store.getContacts());

    this.later(() => {
      const updated = this.store.updateMessage(jid, id, { status: 3 });
      if (!updated) return;
      this.emit('message-update', { chatJid: jid, id, patch: { status: 3 } });
      this.emit('chat', this.store.getChat(jid));
    }, 700);

    this.later(() => {
      const updated = this.store.updateMessage(jid, id, { status: 4 });
      if (!updated) return;
      this.emit('message-update', { chatJid: jid, id, patch: { status: 4 } });
      this.emit('chat', this.store.getChat(jid));
    }, 1500);

    this.later(() => this.sendReply(jid), 1900);
    return { message: saved, chat: summary };
  }

  sendReply(jid) {
    const chat = this.store.getChat(jid);
    if (!chat) return;
    if (chat.isGroup) {
      const participants = [
        { jid: jidFor('14155550147'), name: 'Maya Chen' },
        { jid: jidFor('447700900132'), name: 'Daniel Okafor' },
        { jid: jidFor('393205550198'), name: 'Luca Bianchi' }
      ];
      const sender = participants[this.replyIndex % participants.length];
      const text = groupReplies[this.replyIndex % groupReplies.length];
      this.replyIndex += 1;
      this.emit('typing', { chatJid: jid, isTyping: true, senderName: sender.name });
      this.later(() => {
        this.emit('typing', { chatJid: jid, isTyping: false });
        this.addReply(jid, text, sender.name, sender.jid);
      }, 1100);
      return;
    }

    const contact = this.store.getContact(jid);
    const name = contact?.name || chat.name;
    const message =
      name === 'Maya Chen'
        ? mayaReplies[this.replyIndex % mayaReplies.length]
        : name === 'Daniel Okafor'
          ? danielReplies[this.replyIndex % danielReplies.length]
          : directReplies[this.replyIndex % directReplies.length];
    this.replyIndex += 1;
    this.emit('typing', { chatJid: jid, isTyping: true, senderName: name });
    this.later(() => {
      this.emit('typing', { chatJid: jid, isTyping: false });
      this.addReply(jid, message, name, jid);
    }, 1200 + Math.floor(Math.random() * 900));
  }

  addReply(jid, text, senderName, participant) {
    const id = `demo-in-${Date.now()}`;
    const added = this.store.addMessage(
      {
        id,
        chatJid: jid,
        fromMe: false,
        participant,
        senderName,
        timestamp: Date.now(),
        type: 'text',
        text,
        status: null
      },
      { incrementUnread: true }
    );
    if (!added) return;
    const summary = this.store.getChat(jid);
    const saved = this.store.getMessage(jid, id);
    this.emit('message', { chat: summary, message: saved });
    this.emit('chat', summary);
    this.emit('contacts', this.store.getContacts());
  }

  async openChat(phone, name = '') {
    const digits = normalizePhone(phone);
    if (!digits) {
      const error = new Error('Enter a valid phone number with its country code.');
      error.code = 'BAD_PHONE';
      throw error;
    }
    const jid = `${digits}@s.whatsapp.net`;
    const existing = this.store.getContact(jid);
    const fallback = name.trim() || existing?.name || formatPhone(digits) || fallbackName(jid);
    this.store.upsertContact({ jid, phone: digits, name: fallback });
    this.store.ensureChat(jid);
    const summary = this.store.getChat(jid);
    this.emit('contacts', this.store.getContacts());
    this.emit('chat', summary);
    return summary;
  }

  async downloadMedia() {
    const error = new Error('Media download is not available in demo mode.');
    error.code = 'DEMO';
    throw error;
  }

  async sendTyping() {
    // Demo typing indicators are generated with each simulated reply.
  }

  async destroy() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}
