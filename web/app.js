const $ = (id) => document.getElementById(id);

const MODES = {
  starting: 'Starting',
  connecting: 'Connecting',
  qr: 'Scan QR',
  connected: 'Connected',
  demo: 'Demo',
  offline: 'Offline',
  error: 'Error',
  disconnected: 'Unlinked'
};

const TICKS = {
  single:
    '<svg viewBox="0 0 18 12" aria-hidden="true"><path d="m2 6.6 3.2 3.1L11.6 2.8"></path></svg>',
  double:
    '<svg viewBox="0 0 21 12" aria-hidden="true"><path d="m1 6.6 3.2 3.1L10.4 2.8"></path><path d="m7.4 6.6 3.2 3.1L17.2 2.8"></path></svg>',
  clock:
    '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="6.4"></circle><path d="M9 5.5v4l2.6 1.4"></path></svg>'
};

const ICONS = {
  document:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h7l5 5v12H6z"></path><path d="M13 3.5v5h5"></path><path d="M9 13h6M9 16h4"></path></svg>',
  media:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2"></rect><circle cx="9" cy="10" r="1.4"></circle><path d="m5 17 4.3-4.3 3.2 3.2 2.5-2.5 4 3.6"></path></svg>',
  location:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"></path><circle cx="12" cy="10" r="2.4"></circle></svg>',
  contact:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="3.3"></circle><path d="M5.5 20c.8-3.5 3.2-5.4 6.5-5.4s5.7 1.9 6.5 5.4"></path></svg>',
  chat:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h14v9H9l-4 3v-12Z"></path></svg>',
  arrow:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 7l5 5-5 5"></path></svg>',
  group:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="2.8"></circle><path d="M3.8 19c.5-3 2.4-4.7 5.2-4.7s4.7 1.7 5.2 4.7"></path><circle cx="16.5" cy="8" r="2.2"></circle><path d="M16 13c2.4 0 4 1.5 4.3 4"></path></svg>'
};

const EMOJIS = [
  '😀', '😄', '😊', '😂', '🥰', '😍', '🙌', '👍',
  '👏', '🎉', '❤️', '☕', '🚀', '🌿', '✨', '🔥',
  '💡', '✅', '👀', '🤝', '😅', '🙏', '😎', '🥳'
];

const DEFAULT_AUTO_REPLY = {
  enabled: false,
  text: "Hi! Thanks for your message. I'll get back to you soon.",
  cooldownMinutes: 10
};

const state = {
  demo: false,
  bootstrapped: false,
  refreshing: false,
  refreshPromise: null,
  status: { state: 'starting', qr: null, me: null, error: null },
  me: null,
  chats: [],
  contacts: [],
  settings: { autoReply: { ...DEFAULT_AUTO_REPLY } },
  autoReplySaving: false,
  autoReplyDraftEnabled: false,
  autoReplyDirty: false,
  stats: { chats: 0, contacts: 0, messages: 0 },
  activeJid: null,
  tab: 'chats',
  search: '',
  messageCache: new Map(),
  pending: new Map(),
  sending: false,
  socket: null,
  socketAttempts: 0,
  socketRetry: null,
  socketOpenedAt: 0,
  typing: new Map(),
  typingTimers: new Map(),
  typingLastSent: 0,
  typingStopTimer: null,
  modal: null,
  sessionDismissed: false,
  lastStatusError: null,
  connectedRefresh: false,
  lastRefreshAt: 0,
  initialized: false
};

const dom = {};

function cacheDom() {
  for (const id of [
    'app', 'statusChip', 'statusText', 'accountCard', 'meAvatar', 'meName', 'mePhone', 'accountAction',
    'searchInput', 'newChatBtn', 'chatsCount', 'contactsCount', 'chatList', 'contactsList', 'listEmpty',
    'listEmptyTitle', 'listEmptyText', 'welcome', 'welcomePrimary', 'welcomeNew', 'welcomeRecent',
    'recentChips', 'chatView', 'backBtn', 'chatAvatar', 'chatName', 'chatMeta', 'infoBtn',
    'connectionBanner', 'bannerText', 'bannerAction', 'messageScroller', 'messageList',
    'composerOffline', 'composerReconnect', 'composerForm', 'composerInput', 'sendBtn', 'emojiBtn',
    'emojiPanel', 'sessionModal', 'sessionDisconnected', 'sessionConnected', 'sessionDemo',
    'qrImage', 'qrLoading', 'qrLoadingText', 'sessionError', 'refreshQrBtn', 'closeSessionBtn',
    'linkedAvatar', 'linkedName', 'linkedPhone', 'unlinkBtn', 'newChatModal', 'newChatForm',
    'newChatPhone', 'newChatName', 'newChatError', 'newChatSubmit', 'infoModal', 'infoAvatar',
    'infoTitle', 'infoSub', 'infoRows', 'infoActions', 'autoReplyCard', 'autoReplyStatus',
    'autoReplyToggle', 'autoReplySettingsBtn', 'autoReplyModal', 'autoReplyModalStatus',
    'autoReplyModalToggle', 'autoReplyText', 'autoReplyCooldown', 'autoReplyError',
    'autoReplySave', 'toastHost'
  ]) {
    dom[id] = $(id);
  }
}

/* ------------------------------------------------------------------ helpers */

function isConnected() {
  return state.status?.state === 'connected' || state.status?.state === 'demo';
}

function isSocketOpen() {
  return state.socket && state.socket.readyState === WebSocket.OPEN;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const shortDateFormatter = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit' });
const mediumDateFormatter = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const longDateFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const longDateWithYearFormatter = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
});

function formatTime(timestamp) {
  if (!timestamp) return '';
  return timeFormatter.format(new Date(timestamp));
}

function formatListTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  if (sameDay(date, now)) return timeFormatter.format(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Yesterday';
  const diff = now.getTime() - date.getTime();
  if (diff < 6 * 24 * 60 * 60 * 1000) return weekdayFormatter.format(date);
  if (date.getFullYear() === now.getFullYear()) return shortDateFormatter.format(date);
  return `${shortDateFormatter.format(date)}/${date.getFullYear()}`;
}

function formatDayHeading(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  if (sameDay(date, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Yesterday';
  if (date.getFullYear() === now.getFullYear()) return longDateFormatter.format(date);
  return longDateWithYearFormatter.format(date);
}

function formatFullDate(timestamp) {
  if (!timestamp) return 'No messages yet';
  return fullDateFormatter.format(new Date(timestamp));
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function initialsFor(name) {
  const cleaned = cleanName(name).replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
  if (!cleaned) return '?';
  if (/^\+?\d[\d\s-]*$/.test(cleaned)) {
    const digits = cleaned.replace(/\D/g, '');
    return digits.slice(-2) || '?';
  }
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join('').toUpperCase();
  return (Array.from(words[0])[0] + Array.from(words[words.length - 1])[0]).toUpperCase();
}

function avatarTone(seed) {
  let hash = 0;
  const text = String(seed || '');
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash % 6;
}

function createAvatar(name, seed, className = '') {
  const avatar = document.createElement('span');
  avatar.className = `avatar ${className}`.trim();
  avatar.textContent = initialsFor(name);
  avatar.dataset.tone = String(avatarTone(seed || name));
  avatar.setAttribute('aria-hidden', 'true');
  return avatar;
}

function createButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  if (onClick) button.addEventListener('click', onClick);
  return button;
}

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function getActiveChat() {
  return state.chats.find((chat) => chat.jid === state.activeJid) || null;
}

function getCache(jid) {
  let entry = state.messageCache.get(jid);
  if (!entry) {
    entry = { items: [], hasMore: false, loaded: false, loading: false, total: 0, error: null, token: 0 };
    state.messageCache.set(jid, entry);
  }
  return entry;
}

function sortChats() {
  state.chats.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.timestamp || 0) - (a.timestamp || 0);
  });
}

function sortMessages(items) {
  items.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

function updateTitle() {
  const unread = state.chats.reduce((total, chat) => total + (chat.unread || 0), 0);
  document.title = unread ? `(${unread}) WhatsApp Desk` : 'WhatsApp Desk';
}

function isNearBottom() {
  const scroller = dom.messageScroller;
  if (!scroller) return true;
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 130;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    dom.messageScroller.scrollTop = dom.messageScroller.scrollHeight;
  });
}

function setUrl(jid) {
  try {
    const url = new URL(window.location.href);
    if (jid) {
      url.searchParams.set('chat', jid);
      url.hash = '';
    } else {
      url.searchParams.delete('chat');
      url.hash = '';
    }
    window.history.replaceState({}, '', url);
  } catch {
    // Ignore unsupported history operations.
  }
}

function readDeepLink() {
  try {
    const url = new URL(window.location.href);
    const query = url.searchParams.get('chat');
    if (query) return query;
    if (url.hash.startsWith('#chat=')) return decodeURIComponent(url.hash.slice(6));
  } catch {
    // Ignore.
  }
  return '';
}

/* ---------------------------------------------------------------------- api */

async function api(path, options = {}) {
  const { method = 'GET', body } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      const error = new Error(data?.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('The local server took too long to respond.');
    }
    if (error instanceof TypeError) {
      throw new Error('Cannot reach the local server. Is it still running?');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------- status */

function handleStatus(payload) {
  if (!payload) return;
  const previous = state.status?.state;
  state.status = { ...state.status, ...payload };
  state.me = payload.me || null;

  if (payload.error && payload.error !== state.lastStatusError) {
    toast(payload.error, 'error');
  }
  state.lastStatusError = payload.error || null;

  if (payload.state === 'disconnected' || payload.state === 'error') {
    state.sessionDismissed = false;
  }

  renderStatus();

  if (payload.state === 'connected' && previous !== 'connected') {
    state.sessionDismissed = true;
    if (state.modal === 'sessionModal') closeModal('sessionModal');
    toast('WhatsApp is connected.');
    refreshAfterConnect();
  }

  if (payload.state === 'qr' && previous !== 'qr') {
    state.sessionDismissed = false;
  }

  if (!state.modal && !state.sessionDismissed && !state.demo) {
    if (payload.state === 'qr' || (payload.state === 'disconnected' && state.chats.length === 0)) {
      openSessionModal();
    }
  }
}

async function refreshAfterConnect() {
  if (state.connectedRefresh) return;
  state.connectedRefresh = true;
  try {
    await refreshBootstrap();
    if (state.activeJid) {
      const entry = getCache(state.activeJid);
      entry.loaded = false;
      await loadMessages(state.activeJid, { force: true, stickToBottom: false });
    }
  } catch {
    // A failed refresh should not interrupt the connection flow.
  } finally {
    state.connectedRefresh = false;
  }
}

function getAutoReply() {
  return state.settings?.autoReply || DEFAULT_AUTO_REPLY;
}

function renderAutoReply() {
  const autoReply = getAutoReply();
  const demo = state.demo;
  dom.autoReplyStatus.textContent = demo
    ? 'Demo mode'
    : autoReply.enabled
      ? `On · ${autoReply.cooldownMinutes} min cooldown`
      : 'Off';
  dom.autoReplyStatus.classList.toggle('is-on', !demo && autoReply.enabled);
  dom.autoReplyToggle.classList.toggle('is-on', !demo && autoReply.enabled);
  dom.autoReplyToggle.setAttribute('aria-checked', String(!demo && autoReply.enabled));
  dom.autoReplyToggle.disabled = demo || state.autoReplySaving;
  dom.autoReplyToggle.title = demo
    ? 'Auto-reply is available after linking a real account'
    : autoReply.enabled
      ? 'Disable auto-reply'
      : 'Enable auto-reply';
  dom.autoReplyCard.title = demo ? 'Auto-reply is unavailable in demo mode' : 'Auto-reply settings';

  if (state.modal === 'autoReplyModal' && !state.autoReplyDirty) {
    state.autoReplyDraftEnabled = autoReply.enabled;
    dom.autoReplyText.value = autoReply.text;
    dom.autoReplyCooldown.value = String(autoReply.cooldownMinutes);
    renderAutoReplyDraft();
  }
}

function renderAutoReplyDraft() {
  const enabled = state.autoReplyDraftEnabled;
  dom.autoReplyModalStatus.textContent = enabled ? 'On' : 'Off';
  dom.autoReplyModalStatus.classList.toggle('is-on', enabled);
  dom.autoReplyModalToggle.classList.toggle('is-on', enabled);
  dom.autoReplyModalToggle.setAttribute('aria-checked', String(enabled));
}

function renderStatus() {
  const status = state.status;
  const statusClass = status.state === 'disconnected' ? 'offline' : status.state;
  dom.statusChip.className = `status-chip is-${statusClass}`;
  dom.statusText.textContent = MODES[status.state] || 'Starting';
  dom.statusChip.title = status.error || (status.state === 'demo' ? 'Demo workspace' : 'Connection status');

  const me = state.me || status.me;
  if (state.demo) {
    dom.meName.textContent = me?.name || 'Demo workspace';
    dom.mePhone.textContent = me?.phone ? formatPhone(me.phone) : 'Sample conversations';
    dom.accountAction.textContent = 'Demo';
  } else if (me) {
    dom.meName.textContent = me.name || 'My WhatsApp';
    dom.mePhone.textContent = me.phone ? formatPhone(me.phone) : 'Linked device';
    dom.accountAction.textContent = 'Manage';
  } else {
    dom.meName.textContent = 'WhatsApp not linked';
    dom.mePhone.textContent = 'Scan a code to connect';
    dom.accountAction.textContent = 'Link';
  }
  dom.meAvatar.textContent = initialsFor(me?.name || 'WhatsApp');
  dom.meAvatar.dataset.tone = String(avatarTone(me?.id || me?.phone || 'me'));

  renderSessionModal();
  renderConnectionBanner();
  renderComposerState();
}

/* ------------------------------------------------------------------- render */

function renderAll() {
  renderStatus();
  renderAutoReply();
  renderTabs();
  renderList();
  renderWelcome();
  renderChatView();
  if (state.activeJid && !getCache(state.activeJid).loaded) {
    renderMessages({ skeleton: true });
  }
  updateTitle();
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    const isActive = tab.dataset.tab === state.tab;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
  dom.chatsCount.textContent = String(state.chats.length);
  dom.contactsCount.textContent = String(state.contacts.length);
}

function renderList() {
  const query = normalizeSearch(state.search);
  const isChats = state.tab === 'chats';
  dom.chatList.hidden = !isChats;
  dom.contactsList.hidden = isChats;

  if (isChats) {
    const chats = state.chats.filter((chat) => {
      if (!query) return true;
      return `${chat.name} ${chat.phone || ''} ${chat.snippet || ''}`.toLowerCase().includes(query);
    });
    dom.chatList.replaceChildren(...chats.map(createChatItem));
    renderListEmpty(chats.length, query);
  } else {
    const contacts = state.contacts.filter((contact) => {
      if (!query) return true;
      return `${contact.name} ${contact.phone || ''}`.toLowerCase().includes(query);
    });
    dom.contactsList.replaceChildren(...createContactNodes(contacts));
    renderListEmpty(contacts.length, query);
  }
  updateTitle();
}

function renderListEmpty(count, query) {
  if (count > 0) {
    dom.listEmpty.hidden = true;
    return;
  }
  dom.listEmpty.hidden = false;
  if (query) {
    dom.listEmptyTitle.textContent = 'No matches';
    dom.listEmptyText.textContent = `Nothing matched “${state.search.trim()}”.`;
    return;
  }
  if (state.tab === 'contacts') {
    dom.listEmptyTitle.textContent = 'No contacts yet';
    dom.listEmptyText.textContent = 'Contacts will appear here after WhatsApp syncs.';
  } else {
    dom.listEmptyTitle.textContent = 'No conversations yet';
    dom.listEmptyText.textContent = isConnected()
      ? 'Start a new conversation to see it here.'
      : 'Link WhatsApp or start a new conversation.';
  }
}

function createChatItem(chat) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'chat-item';
  item.dataset.jid = chat.jid;
  if (chat.jid === state.activeJid) item.classList.add('is-active');
  if (chat.unread > 0) item.classList.add('is-unread');
  item.title = chat.phone ? `${chat.name} · ${formatPhone(chat.phone)}` : chat.name;

  const avatar = createAvatar(chat.name, chat.jid);
  if (chat.isGroup) addGroupBadge(avatar);
  item.append(avatar);

  const copy = document.createElement('span');
  copy.className = 'chat-copy';
  const top = document.createElement('span');
  top.className = 'chat-top';
  const name = document.createElement('span');
  name.className = 'chat-name';
  name.textContent = chat.name;
  const time = document.createElement('span');
  time.className = 'chat-time';
  time.textContent = formatListTime(chat.timestamp || chat.lastMessage?.timestamp);
  top.append(name, time);

  const snippet = document.createElement('span');
  snippet.className = 'chat-snippet';
  const typing = state.typing.get(chat.jid);
  if (typing) {
    snippet.classList.add('is-typing');
    snippet.textContent = typing.name && chat.isGroup ? `${typing.name} is typing…` : 'typing…';
  } else {
    snippet.textContent = chat.snippet || 'No messages yet';
  }
  copy.append(top, snippet);
  item.append(copy);

  const side = document.createElement('span');
  side.className = 'chat-side';
  if (chat.pinned) {
    const pin = document.createElement('span');
    pin.className = 'pin-mark';
    pin.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5-3 1-4 4-1 4-1-1-4-4-1-1 4-1 4-4 1-3Z"></path><path d="m5 19 5-5"></path></svg>';
    side.append(pin);
  }
  if (chat.unread > 0) {
    const badge = document.createElement('span');
    badge.className = 'unread-badge';
    badge.textContent = chat.unread > 99 ? '99+' : String(chat.unread);
    side.append(badge);
  }
  item.append(side);
  return item;
}

function createContactNodes(contacts) {
  const nodes = [];
  let currentLetter = '';
  const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  for (const contact of sorted) {
    const first = cleanName(contact.name).charAt(0).toUpperCase();
    const letter = /^[A-Z]$/.test(first) ? first : '#';
    if (letter !== currentLetter) {
      currentLetter = letter;
      const heading = document.createElement('div');
      heading.className = 'contact-section';
      heading.textContent = letter;
      nodes.push(heading);
    }
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'contact-item';
    item.dataset.contactJid = contact.jid;
    const avatar = createAvatar(contact.name, contact.jid);
    const copy = document.createElement('span');
    copy.className = 'contact-copy';
    const name = document.createElement('span');
    name.className = 'contact-name';
    name.textContent = contact.name;
    const phone = document.createElement('span');
    phone.className = 'contact-phone';
    phone.textContent = contact.phone ? formatPhone(contact.phone) : 'On WhatsApp';
    copy.append(name, phone);
    const tail = document.createElement('span');
    tail.className = 'contact-tail';
    tail.innerHTML = contact.hasChat ? ICONS.chat : ICONS.arrow;
    item.append(avatar, copy, tail);
    nodes.push(item);
  }
  return nodes;
}

function addGroupBadge(avatar) {
  const badge = document.createElement('span');
  badge.className = 'avatar-group-badge';
  badge.innerHTML = ICONS.group;
  avatar.append(badge);
}

function renderWelcome() {
  const connected = isConnected();
  dom.welcomePrimary.textContent = connected ? 'New conversation' : 'Link WhatsApp';
  dom.welcomePrimary.dataset.action = connected ? 'new' : 'link';
  dom.welcomeNew.textContent = connected ? 'Browse contacts' : 'New conversation';
  dom.welcomeNew.dataset.action = connected ? 'contacts' : 'new';

  const recent = state.chats.filter((chat) => chat.lastMessage).slice(0, 3);
  dom.welcomeRecent.hidden = recent.length === 0;
  dom.recentChips.replaceChildren(
    ...recent.map((chat) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recent-chip';
      button.dataset.jid = chat.jid;
      const avatar = createAvatar(chat.name, chat.jid);
      if (chat.isGroup) addGroupBadge(avatar);
      const label = document.createElement('span');
      label.textContent = chat.name;
      button.append(avatar, label);
      button.addEventListener('click', () => openChat(chat.jid));
      return button;
    })
  );
}

function renderChatView() {
  const chat = getActiveChat();
  if (!chat) {
    dom.welcome.hidden = false;
    dom.chatView.hidden = true;
    dom.app.classList.remove('chat-open');
    if (state.activeJid) {
      state.activeJid = null;
      setUrl('');
    }
    return;
  }
  dom.welcome.hidden = true;
  dom.chatView.hidden = false;
  dom.app.classList.add('chat-open');
  renderChatHeader();
  renderConnectionBanner();
  renderComposerState();
  renderMessages({ stickToBottom: false });
}

function renderChatHeader() {
  const chat = getActiveChat();
  if (!chat) return;
  dom.chatName.textContent = chat.name;
  dom.chatAvatar.textContent = initialsFor(chat.name);
  dom.chatAvatar.dataset.tone = String(avatarTone(chat.jid));
  dom.chatAvatar.className = 'avatar chat-avatar';
  if (chat.isGroup) addGroupBadge(dom.chatAvatar);

  const typing = state.typing.get(chat.jid);
  if (typing) {
    dom.chatMeta.textContent = chat.isGroup && typing.name ? `${typing.name} is typing…` : 'typing…';
    dom.chatMeta.classList.add('is-typing');
  } else {
    dom.chatMeta.classList.remove('is-typing');
    dom.chatMeta.textContent = chat.isGroup
      ? 'Group chat'
      : chat.phone
        ? formatPhone(chat.phone)
        : 'WhatsApp contact';
  }
  dom.composerInput.placeholder = isConnected() ? `Message ${chat.name}` : 'Reconnect to send messages…';
}

function renderConnectionBanner() {
  const chat = getActiveChat();
  if (!chat || isConnected()) {
    dom.connectionBanner.hidden = true;
    return;
  }
  dom.connectionBanner.hidden = false;
  const statusState = state.status.state;
  dom.connectionBanner.classList.toggle('is-error', statusState === 'error');
  if (statusState === 'qr' || statusState === 'disconnected') {
    dom.bannerText.textContent = 'This computer is not linked. Link your WhatsApp to send and receive messages.';
    dom.bannerAction.textContent = 'Link device';
  } else if (statusState === 'error') {
    dom.bannerText.textContent = state.status.error || 'Could not connect to WhatsApp.';
    dom.bannerAction.textContent = 'Retry';
  } else {
    dom.bannerText.textContent = 'Connecting to WhatsApp… You can still read cached messages.';
    dom.bannerAction.textContent = 'Retry';
  }
}

function renderComposerState() {
  const chat = getActiveChat();
  if (!chat) return;
  const connected = isConnected();
  dom.composerOffline.hidden = connected;
  if (!connected) {
    if (state.status.state === 'qr' || state.status.state === 'disconnected') {
      dom.composerOffline.querySelector('span').textContent = 'Link this computer to WhatsApp before sending.';
    } else if (state.status.state === 'error') {
      dom.composerOffline.querySelector('span').textContent = 'WhatsApp is unavailable. Reconnect to send messages.';
    } else {
      dom.composerOffline.querySelector('span').textContent = 'Reconnecting… Your draft will stay here.';
    }
  }
  updateSendState();
}

function updateSendState() {
  const text = dom.composerInput.value.trim();
  dom.sendBtn.disabled = !state.activeJid || !isConnected() || !text || state.sending;
  if (state.activeJid && isConnected()) {
    const chat = getActiveChat();
    dom.composerInput.placeholder = chat ? `Message ${chat.name}` : 'Write a message…';
  }
}

/* ----------------------------------------------------------------- messages */

function renderMessages({ stickToBottom = false, preserveScroll = false, skeleton = false } = {}) {
  const chat = getActiveChat();
  if (!chat) return;
  const entry = getCache(chat.jid);
  const scroller = dom.messageScroller;
  const wasNearBottom = isNearBottom();
  const previousHeight = scroller.scrollHeight;
  const previousTop = scroller.scrollTop;
  const shouldStick = stickToBottom || wasNearBottom;

  dom.messageList.replaceChildren();

  if (skeleton || (entry.loading && entry.items.length === 0)) {
    const wrap = document.createElement('div');
    wrap.className = 'message-skeleton';
    for (let index = 0; index < 5; index += 1) {
      const row = document.createElement('div');
      row.className = 'skeleton-row';
      const bubble = document.createElement('div');
      bubble.className = 'skeleton-bubble';
      row.append(bubble);
      wrap.append(row);
    }
    dom.messageList.append(wrap);
    return;
  }

  if (entry.error && entry.items.length === 0) {
    dom.messageList.append(
      buildThreadEmpty(chat, 'Could not load messages', entry.error, true)
    );
    return;
  }

  if (entry.hasMore) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'load-earlier';
    button.textContent = entry.loading ? 'Loading earlier messages…' : 'Load earlier messages';
    button.disabled = entry.loading;
    button.addEventListener('click', () => loadEarlier(chat.jid));
    dom.messageList.append(button);
  }

  if (entry.items.length === 0) {
    const empty = buildThreadEmpty(
      chat,
      `Say hello to ${chat.name}`,
      isConnected()
        ? 'This conversation is quiet. Send the first message below.'
        : 'Messages will appear here when WhatsApp is connected.'
    );
    dom.messageList.append(empty);
  } else {
    let lastDay = '';
    for (const message of entry.items) {
      const day = new Date(message.timestamp).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        const separator = document.createElement('div');
        separator.className = 'day-separator';
        const label = document.createElement('span');
        label.textContent = formatDayHeading(message.timestamp);
        separator.append(label);
        dom.messageList.append(separator);
      }
      dom.messageList.append(createMessageRow(message, chat));
    }
  }

  if (state.typing.has(chat.jid)) {
    const row = document.createElement('div');
    row.className = 'typing-row';
    const bubble = document.createElement('div');
    bubble.className = 'typing-bubble';
    bubble.setAttribute('aria-label', 'Typing');
    bubble.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
    row.append(bubble);
    dom.messageList.append(row);
  }

  if (preserveScroll) {
    requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight - previousHeight + previousTop;
    });
  } else if (shouldStick) {
    scrollToBottom();
  }
}

function buildThreadEmpty(chat, title, description, isError = false) {
  const wrap = document.createElement('div');
  wrap.className = 'thread-empty';
  const avatar = createAvatar(chat.name, chat.jid);
  if (chat.isGroup) addGroupBadge(avatar);
  const heading = document.createElement('strong');
  heading.textContent = title;
  const text = document.createElement('span');
  text.textContent = description;
  wrap.append(avatar, heading, text);
  if (isError) {
    const retry = createButton('Try again', 'load-earlier', () => loadMessages(chat.jid, { force: true, stickToBottom: true }));
    retry.style.marginTop = '6px';
    wrap.append(retry);
  }
  return wrap;
}

function createMessageRow(message, chat) {
  const row = document.createElement('div');
  row.className = `msg-row ${message.fromMe ? 'is-out' : 'is-in'}`;
  row.dataset.id = message.id;
  if (message.reaction) row.classList.add('has-reaction');

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (chat.isGroup && !message.fromMe && message.senderName) {
    const sender = document.createElement('div');
    sender.className = 'msg-sender';
    sender.textContent = message.senderName;
    bubble.append(sender);
  }

  if (message.quoted?.text) {
    const quote = document.createElement('div');
    quote.className = 'msg-quote';
    const who = quoteSenderName(message.quoted.participant);
    if (who) {
      const strong = document.createElement('strong');
      strong.textContent = who;
      quote.append(strong);
    }
    quote.append(document.createTextNode(message.quoted.text));
    bubble.append(quote);
  }

  if (message.media) appendMedia(bubble, message);

  if (message.text && message.type !== 'location' && message.type !== 'contact') {
    const text = document.createElement('div');
    text.className = 'msg-text';
    if (message.deleted) text.classList.add('is-deleted');
    appendLinkedText(text, message.text);
    bubble.append(text);
  } else if (!message.media) {
    const text = document.createElement('div');
    text.className = 'msg-text is-deleted';
    text.textContent = 'Message unavailable';
    bubble.append(text);
  }

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const time = document.createElement('span');
  time.className = 'msg-time';
  time.textContent = formatTime(message.timestamp);
  meta.append(time);
  if (message.fromMe) {
    if (message.failed || message.status === 0) {
      const failed = document.createElement('span');
      failed.className = 'failed-mark';
      failed.textContent = 'Not sent';
      meta.append(failed);
    } else {
      meta.append(createTicks(message));
    }
  }
  bubble.append(meta);

  if (message.reaction?.emoji) {
    const pill = document.createElement('span');
    pill.className = 'reaction-pill';
    if (message.reaction.fromMe) pill.classList.add('is-mine');
    pill.textContent = message.reaction.emoji;
    pill.title = message.reaction.fromMe ? 'Your reaction' : 'Reaction';
    bubble.append(pill);
  }

  row.append(bubble);
  return row;
}

function createTicks(message) {
  const ticks = document.createElement('span');
  ticks.className = 'ticks';
  if (message.pending || message.status === 1) {
    ticks.innerHTML = TICKS.clock;
    return ticks;
  }
  if (message.status >= 4) ticks.classList.add('is-read');
  ticks.innerHTML = message.status >= 3 ? TICKS.double : TICKS.single;
  return ticks;
}

function quoteSenderName(participant) {
  if (!participant) return '';
  const contact = state.contacts.find((item) => item.jid === participant);
  if (contact) return contact.name;
  const digits = participant.split('@')[0].split(':')[0];
  return /^\d+$/.test(digits) ? `+${digits}` : '';
}

function appendLinkedText(container, text) {
  const value = String(text || '');
  const pattern = /(https?:\/\/[^\s]+)/gi;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      container.append(document.createTextNode(value.slice(lastIndex, match.index)));
    }
    const anchor = document.createElement('a');
    anchor.href = match[0];
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = match[0];
    container.append(anchor);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) {
    container.append(document.createTextNode(value.slice(lastIndex)));
  }
}

function mediaUrl(message) {
  return `/api/media?chat=${encodeURIComponent(message.chatJid)}&id=${encodeURIComponent(message.id)}`;
}

function appendMedia(bubble, message) {
  const media = message.media;
  const url = mediaUrl(message);
  switch (media.kind) {
    case 'image': {
      const wrap = document.createElement('div');
      wrap.className = 'msg-media';
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const image = document.createElement('img');
      image.className = 'msg-image';
      image.loading = 'lazy';
      image.alt = message.text || 'Photo';
      image.addEventListener('error', () => {
        link.replaceWith(mediaFallback('Media unavailable. Reconnect and try again.'));
      }, { once: true });
      image.src = url;
      link.append(image);
      wrap.append(link);
      bubble.append(wrap);
      break;
    }
    case 'sticker': {
      const image = document.createElement('img');
      image.className = 'msg-sticker';
      image.loading = 'lazy';
      image.alt = 'Sticker';
      image.addEventListener('error', () => {
        image.replaceWith(mediaFallback('Sticker unavailable.'));
      }, { once: true });
      image.src = url;
      bubble.append(image);
      break;
    }
    case 'video': {
      const video = document.createElement('video');
      video.className = 'msg-video';
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = url;
      video.addEventListener('error', () => {
        video.replaceWith(mediaFallback('Video unavailable. Reconnect and try again.'));
      }, { once: true });
      bubble.append(video);
      break;
    }
    case 'audio': {
      const audio = document.createElement('audio');
      audio.className = 'msg-audio';
      audio.controls = true;
      audio.preload = 'metadata';
      audio.src = url;
      audio.addEventListener('error', () => {
        audio.replaceWith(mediaFallback('Audio unavailable. Reconnect and try again.'));
      }, { once: true });
      bubble.append(audio);
      break;
    }
    case 'document': {
      const link = document.createElement('a');
      link.className = 'doc-card';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const icon = document.createElement('span');
      icon.className = 'doc-icon';
      icon.innerHTML = ICONS.document;
      const copy = document.createElement('span');
      copy.className = 'doc-copy';
      const name = document.createElement('span');
      name.className = 'doc-name';
      name.textContent = media.fileName || 'Document';
      const size = document.createElement('span');
      size.className = 'doc-size';
      size.textContent = formatBytes(media.fileLength) || 'Open file';
      copy.append(name, size);
      link.append(icon, copy);
      bubble.append(link);
      break;
    }
    case 'location': {
      const link = document.createElement('a');
      link.className = 'location-card';
      link.href = `https://www.google.com/maps?q=${encodeURIComponent(`${media.lat || 0},${media.lng || 0}`)}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const icon = document.createElement('span');
      icon.innerHTML = ICONS.location;
      const copy = document.createElement('span');
      copy.className = 'location-copy';
      const strong = document.createElement('strong');
      strong.textContent = message.text || (media.live ? 'Live location' : 'Location');
      const coords = document.createElement('span');
      coords.textContent = `${Number(media.lat || 0).toFixed(4)}, ${Number(media.lng || 0).toFixed(4)}`;
      copy.append(strong, coords);
      link.append(icon, copy);
      bubble.append(link);
      break;
    }
    case 'contact': {
      const card = document.createElement('div');
      card.className = 'media-fallback';
      card.innerHTML = ICONS.contact;
      const text = document.createElement('span');
      text.textContent = message.text || 'Contact card';
      card.append(text);
      bubble.append(card);
      break;
    }
    default:
      bubble.append(mediaFallback('Attachment unavailable.'));
  }
}

function mediaFallback(message) {
  const fallback = document.createElement('div');
  fallback.className = 'media-fallback';
  fallback.innerHTML = ICONS.media;
  const text = document.createElement('span');
  text.textContent = message;
  fallback.append(text);
  return fallback;
}

/* ------------------------------------------------------------------- loading */

async function loadMessages(jid, { force = false, before = 0, stickToBottom = false } = {}) {
  const entry = getCache(jid);
  if (entry.loading) return;
  if (!before && entry.loaded && !force) {
    if (state.activeJid === jid) renderMessages({ stickToBottom });
    return;
  }
  entry.loading = true;
  entry.error = null;
  const token = entry.token + 1;
  entry.token = token;
  if (state.activeJid === jid && !entry.items.length) {
    renderMessages({ skeleton: true });
  } else if (state.activeJid === jid) {
    renderMessages({ stickToBottom: false });
  }

  try {
    const query = new URLSearchParams({ limit: '80' });
    if (before) query.set('before', String(before));
    const data = await api(`/api/chats/${encodeURIComponent(jid)}/messages?${query.toString()}`);
    if (token !== entry.token) return;
    if (before) {
      const known = new Set(entry.items.map((message) => message.id));
      const older = (data.messages || []).filter((message) => !known.has(message.id));
      entry.items = [...older, ...entry.items];
      sortMessages(entry.items);
    } else {
      const localOnly = entry.items.filter((message) => message.pending || message.failed);
      const loadedIds = new Set((data.messages || []).map((message) => message.id));
      entry.items = [...(data.messages || []), ...localOnly.filter((message) => !loadedIds.has(message.id))];
      sortMessages(entry.items);
      entry.loaded = true;
    }
    entry.hasMore = Boolean(data.hasMore);
    entry.total = data.total || 0;
    if (state.activeJid === jid) {
      renderMessages({
        preserveScroll: Boolean(before),
        stickToBottom: !before && stickToBottom
      });
      if (!before) markChatRead(jid);
    }
  } catch (error) {
    if (token !== entry.token) return;
    entry.error = error.message;
    if (state.activeJid === jid) {
      renderMessages();
      toast(error.message, 'error');
    }
  } finally {
    if (token === entry.token) entry.loading = false;
  }
}

async function loadEarlier(jid) {
  const entry = getCache(jid);
  if (entry.loading || !entry.items.length) return;
  const earliest = entry.items[0].timestamp;
  await loadMessages(jid, { before: earliest || 0 });
}

/* --------------------------------------------------------------- chat opening */

async function openChat(jid, { force = false, updateUrl = true, stickToBottom = true } = {}) {
  const chat = state.chats.find((item) => item.jid === jid);
  if (!chat) {
    toast('That conversation could not be found.', 'error');
    return;
  }
  const changed = state.activeJid !== jid;
  state.activeJid = jid;
  state.tab = 'chats';
  if (updateUrl) setUrl(jid);
  renderTabs();
  renderList();
  renderWelcome();
  renderChatView();
  const entry = getCache(jid);
  if (changed || !entry.loaded) {
    await loadMessages(jid, { force, stickToBottom });
  } else {
    renderMessages({ stickToBottom });
  }
  if (state.activeJid !== jid) return;
  markChatRead(jid);
  sendViewing(jid);
  if (changed) dom.messageScroller.scrollTop = dom.messageScroller.scrollHeight;
}

function closeChat() {
  state.activeJid = null;
  state.sending = false;
  dom.app.classList.remove('chat-open');
  dom.chatView.hidden = true;
  dom.welcome.hidden = false;
  setUrl('');
  sendViewing('');
  renderWelcome();
  renderList();
  renderTabs();
}

function markChatRead(jid) {
  const chat = state.chats.find((item) => item.jid === jid);
  if (!chat) return;
  if (chat.unread) {
    chat.unread = 0;
    renderList();
    updateTitle();
  }
  sendViewing(jid);
  if (!isSocketOpen()) {
    api(`/api/chats/${encodeURIComponent(jid)}/read`, { method: 'POST' }).catch(() => {});
  }
}

function sendViewing(jid) {
  if (!isSocketOpen()) return;
  try {
    state.socket.send(JSON.stringify({ type: 'viewing', jid: jid || '' }));
  } catch {
    // The socket may have closed between the check and the send.
  }
}

/* ------------------------------------------------------------------ mutations */

function upsertChat(chat, { render = true } = {}) {
  if (!chat?.jid) return;
  if (chat.jid === state.activeJid) chat.unread = 0;
  const index = state.chats.findIndex((item) => item.jid === chat.jid);
  if (index >= 0) state.chats[index] = chat;
  else state.chats.push(chat);
  sortChats();
  if (render) {
    renderList();
    renderTabs();
    renderWelcome();
    if (state.activeJid === chat.jid) renderChatHeader();
  }
  updateTitle();
}

function addMessageToCache(jid, message) {
  const entry = getCache(jid);
  const index = entry.items.findIndex((item) => item.id === message.id);
  if (index >= 0) entry.items[index] = { ...entry.items[index], ...message };
  else entry.items.push(message);
  sortMessages(entry.items);
}

function removePending(tempId) {
  const pending = state.pending.get(tempId);
  if (!pending) return;
  state.pending.delete(tempId);
  const entry = state.messageCache.get(pending.jid);
  if (entry) entry.items = entry.items.filter((message) => message.id !== tempId);
}

function matchPending(jid, message) {
  if (!message.fromMe) return false;
  for (const [tempId, pending] of state.pending) {
    if (pending.jid === jid && pending.text === message.text) {
      removePending(tempId);
      return true;
    }
  }
  return false;
}

function touchLocalChat(jid, text, tempId) {
  const chat = state.chats.find((item) => item.jid === jid);
  if (!chat) return;
  const timestamp = Date.now();
  chat.timestamp = timestamp;
  chat.unread = 0;
  chat.lastMessage = {
    id: tempId,
    type: 'text',
    text,
    fromMe: true,
    senderName: state.me?.name || 'You',
    timestamp,
    status: 1,
    mediaKind: null
  };
  chat.snippet = `You: ${text}`;
  sortChats();
  renderList();
  updateTitle();
}

/* --------------------------------------------------------------- send message */

async function sendMessage() {
  if (state.sending) return;
  const jid = state.activeJid;
  const text = dom.composerInput.value.trim();
  if (!jid || !text || !isConnected()) return;
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const temp = {
    id: tempId,
    chatJid: jid,
    fromMe: true,
    participant: '',
    senderName: state.me?.name || 'You',
    timestamp: Date.now(),
    type: 'text',
    text,
    status: 1,
    quoted: null,
    media: null,
    reaction: null,
    deleted: false,
    pending: true,
    failed: false
  };
  const entry = getCache(jid);
  entry.items.push(temp);
  sortMessages(entry.items);
  state.pending.set(tempId, { jid, text, createdAt: Date.now() });
  touchLocalChat(jid, text, tempId);
  renderMessages({ stickToBottom: true });
  dom.composerInput.value = '';
  autoResizeComposer();
  state.sending = true;
  updateSendState();
  stopTypingSignal();

  try {
    const result = await api(`/api/chats/${encodeURIComponent(jid)}/messages`, {
      method: 'POST',
      body: { text }
    });
    removePending(tempId);
    if (result?.message) addMessageToCache(jid, result.message);
    if (result?.chat) upsertChat(result.chat);
    if (state.activeJid === jid) renderMessages({ stickToBottom: true });
    renderList();
  } catch (error) {
    state.pending.delete(tempId);
    const failed = entry.items.find((message) => message.id === tempId);
    if (failed) {
      failed.pending = false;
      failed.failed = true;
    }
    if (state.activeJid === jid && !dom.composerInput.value.trim()) {
      dom.composerInput.value = text;
      autoResizeComposer();
    }
    if (state.activeJid === jid) renderMessages({ stickToBottom: true });
    toast(error.message, 'error');
    refreshBootstrap().catch(() => {});
  } finally {
    state.sending = false;
    updateSendState();
  }
}

function autoResizeComposer() {
  const input = dom.composerInput;
  input.style.height = 'auto';
  input.style.height = `${Math.min(148, Math.max(38, input.scrollHeight))}px`;
  updateSendState();
}

function sendTypingSignal(isTyping) {
  if (!isSocketOpen() || !state.activeJid || state.demo) return;
  try {
    state.socket.send(JSON.stringify({ type: 'typing', jid: state.activeJid, isTyping }));
  } catch {
    // Ignore transient socket errors.
  }
}

function queueTypingSignal() {
  if (!isConnected()) return;
  const now = Date.now();
  if (now - state.typingLastSent > 2_500) {
    sendTypingSignal(true);
    state.typingLastSent = now;
  }
  if (state.typingStopTimer) clearTimeout(state.typingStopTimer);
  state.typingStopTimer = setTimeout(() => {
    state.typingLastSent = 0;
    sendTypingSignal(false);
  }, 1_800);
}

function stopTypingSignal() {
  if (state.typingStopTimer) clearTimeout(state.typingStopTimer);
  state.typingStopTimer = null;
  state.typingLastSent = 0;
  sendTypingSignal(false);
}

/* -------------------------------------------------------------------- typing */

function setTyping(jid, isTyping, senderName = '') {
  const existing = state.typing.get(jid);
  if (isTyping) {
    state.typing.set(jid, { name: senderName || existing?.name || '', expires: Date.now() + 5_000 });
    if (state.typingTimers.has(jid)) clearTimeout(state.typingTimers.get(jid));
    state.typingTimers.set(
      jid,
      setTimeout(() => {
        state.typing.delete(jid);
        state.typingTimers.delete(jid);
        if (state.activeJid === jid) {
          renderChatHeader();
          renderMessages({ stickToBottom: true });
        }
        renderList();
      }, 5_000)
    );
  } else {
    state.typing.delete(jid);
    if (state.typingTimers.has(jid)) {
      clearTimeout(state.typingTimers.get(jid));
      state.typingTimers.delete(jid);
    }
  }
  if (state.activeJid === jid) {
    renderChatHeader();
    renderMessages({ stickToBottom: true });
  }
  renderList();
}

/* --------------------------------------------------------------------- data */

async function refreshBootstrap() {
  if (state.refreshing) return state.refreshPromise;
  state.refreshing = true;
  state.refreshPromise = api('/api/bootstrap')
    .then((data) => {
      applyBootstrap(data);
      return data;
    })
    .finally(() => {
      state.refreshing = false;
      state.refreshPromise = null;
      state.lastRefreshAt = Date.now();
    });
  return state.refreshPromise;
}

function applyBootstrap(data) {
  if (!data) return;
  state.demo = Boolean(data.demo);
  state.status = data.status || state.status;
  state.me = data.me || null;
  state.chats = Array.isArray(data.chats) ? data.chats : [];
  if (state.activeJid) {
    const active = state.chats.find((chat) => chat.jid === state.activeJid);
    if (active) active.unread = 0;
  }
  state.contacts = Array.isArray(data.contacts) ? data.contacts : [];
  state.settings = data.settings || state.settings;
  state.stats = data.stats || state.stats;
  state.bootstrapped = true;
  sortChats();
  if (state.activeJid && !state.chats.some((chat) => chat.jid === state.activeJid)) {
    state.activeJid = null;
    setUrl('');
  }
  renderAll();
}

/* --------------------------------------------------------------------- socket */

function connectSocket() {
  if (isSocketOpen() || state.socket?.readyState === WebSocket.CONNECTING) return;
  if (state.socketRetry) {
    clearTimeout(state.socketRetry);
    state.socketRetry = null;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let socket;
  try {
    socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
  } catch {
    scheduleSocketReconnect();
    return;
  }
  state.socket = socket;

  socket.addEventListener('open', () => {
    state.socketAttempts = 0;
    state.socketOpenedAt = Date.now();
    sendViewing(state.activeJid || '');
    if (state.bootstrapped) {
      refreshBootstrap().catch(() => {});
    }
  });

  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    handleSocketMessage(message);
  });

  socket.addEventListener('close', () => {
    state.socket = null;
    scheduleSocketReconnect();
  });

  socket.addEventListener('error', () => {
    // The close event schedules the retry.
  });
}

function scheduleSocketReconnect() {
  if (state.socketRetry) return;
  const delay = Math.min(15_000, 700 * 2 ** state.socketAttempts);
  state.socketAttempts += 1;
  state.socketRetry = setTimeout(() => {
    state.socketRetry = null;
    connectSocket();
  }, delay);
}

function handleSocketMessage(message) {
  const payload = message.payload;
  switch (message.type) {
    case 'hello':
      if (payload) {
        applyBootstrap(payload);
        if (!state.initialized) initializeAfterBootstrap();
      }
      break;
    case 'status':
      handleStatus(payload);
      break;
    case 'chats':
      state.chats = Array.isArray(payload) ? payload : [];
      if (state.activeJid) {
        const active = state.chats.find((chat) => chat.jid === state.activeJid);
        if (active) active.unread = 0;
      }
      sortChats();
      if (state.activeJid && !state.chats.some((chat) => chat.jid === state.activeJid)) {
        state.activeJid = null;
        setUrl('');
        sendViewing('');
        renderChatView();
      }
      renderList();
      renderTabs();
      renderWelcome();
      if (state.activeJid) renderChatHeader();
      updateTitle();
      break;
    case 'contacts':
      state.contacts = Array.isArray(payload) ? payload : [];
      renderList();
      renderTabs();
      if (state.modal === 'infoModal') {
        const chat = getActiveChat();
        if (chat) populateInfo(chat);
      }
      break;
    case 'settings':
      if (payload) {
        state.settings = payload;
        renderAutoReply();
      }
      break;
    case 'chat':
      if (payload) upsertChat(payload);
      break;
    case 'me':
      state.me = payload;
      renderStatus();
      break;
    case 'message':
      handleIncomingMessage(payload);
      break;
    case 'message-update':
      handleMessageUpdate(payload);
      break;
    case 'typing':
      if (payload?.chatJid) setTyping(payload.chatJid, Boolean(payload.isTyping), payload.senderName || '');
      break;
    case 'pong':
      break;
    default:
      break;
  }
}

function handleIncomingMessage(payload) {
  const chat = payload?.chat;
  const message = payload?.message;
  if (!chat || !message) return;
  const wasActive = message.chatJid === state.activeJid;
  const entry = state.messageCache.get(message.chatJid);
  upsertChat(chat);
  if (message.fromMe) matchPending(message.chatJid, message);
  if (entry?.loaded) {
    addMessageToCache(message.chatJid, message);
    if (wasActive) {
      renderMessages({ stickToBottom: isNearBottom() });
      markChatRead(message.chatJid);
    }
  } else if (wasActive) {
    loadMessages(message.chatJid, { force: true, stickToBottom: true }).catch(() => {});
  }
  if (message.fromMe) {
    state.typing.delete(message.chatJid);
    if (state.activeJid === message.chatJid) renderChatHeader();
  }
  renderList();
  updateTitle();
}

function handleMessageUpdate(payload) {
  if (!payload?.chatJid || !payload.id) return;
  const entry = state.messageCache.get(payload.chatJid);
  if (!entry?.loaded) return;
  const message = entry.items.find((item) => item.id === payload.id);
  if (!message) return;
  Object.assign(message, payload.patch || {});
  if (payload.patch?.status === 0) message.failed = true;
  if (payload.patch?.deleted) {
    message.text = payload.patch.text || 'This message was deleted';
    message.media = null;
  }
  if (state.activeJid === payload.chatJid) {
    renderMessages({ stickToBottom: isNearBottom() });
  }
}

/* -------------------------------------------------------------------- modals */

function showModal(id) {
  for (const modal of document.querySelectorAll('.modal')) {
    if (modal.id !== id) modal.hidden = true;
  }
  const modal = $(id);
  if (!modal) return;
  modal.hidden = false;
  state.modal = id;
  if (id === 'sessionModal') renderSessionModal();
}

function closeModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal.hidden = true;
  if (state.modal === id) state.modal = null;
  if (id === 'autoReplyModal') {
    state.autoReplyDirty = false;
    dom.autoReplyError.textContent = '';
  }
  if (id === 'sessionModal' && !isConnected()) state.sessionDismissed = true;
}

function closeAllModals() {
  for (const modal of document.querySelectorAll('.modal')) modal.hidden = true;
  state.modal = null;
}

function openSessionModal() {
  if (state.demo) {
    showModal('sessionModal');
    renderSessionModal();
    return;
  }
  if (state.modal && state.modal !== 'sessionModal') closeAllModals();
  showModal('sessionModal');
  renderSessionModal();
}

function renderSessionModal() {
  if (!dom.sessionModal) return;
  const connected = state.status.state === 'connected';
  dom.sessionDisconnected.hidden = state.demo || connected;
  dom.sessionConnected.hidden = state.demo || !connected;
  dom.sessionDemo.hidden = !state.demo;

  if (state.demo) {
    return;
  }

  if (connected) {
    const me = state.me || state.status.me;
    dom.linkedAvatar.textContent = initialsFor(me?.name || 'WhatsApp');
    dom.linkedAvatar.dataset.tone = String(avatarTone(me?.id || 'me'));
    dom.linkedName.textContent = me?.name || 'My WhatsApp';
    dom.linkedPhone.textContent = me?.phone ? formatPhone(me.phone) : 'Linked device';
    return;
  }

  const qr = state.status.qr;
  if (qr) {
    if (dom.qrImage.getAttribute('src') !== qr) dom.qrImage.src = qr;
    dom.qrImage.hidden = false;
    dom.qrLoading.hidden = true;
  } else {
    dom.qrImage.hidden = true;
    dom.qrLoading.hidden = false;
    const stateName = state.status.state;
    if (stateName === 'offline') dom.qrLoadingText.textContent = 'Reconnecting to WhatsApp…';
    else if (stateName === 'error') dom.qrLoadingText.textContent = 'Waiting to try again…';
    else if (stateName === 'disconnected') dom.qrLoadingText.textContent = 'Generating a new code…';
    else dom.qrLoadingText.textContent = 'Preparing a secure connection…';
  }
  dom.sessionError.textContent = state.status.error || '';
  dom.refreshQrBtn.disabled = !['qr', 'offline', 'error', 'disconnected'].includes(state.status.state);
  dom.closeSessionBtn.textContent = state.chats.length ? 'Not now' : 'Close';
}

async function requestNewQr() {
  dom.refreshQrBtn.disabled = true;
  const original = dom.refreshQrBtn.textContent;
  dom.refreshQrBtn.textContent = 'Requesting…';
  try {
    const result = await api('/api/session/restart', { method: 'POST' });
    if (result?.status) handleStatus(result.status);
    toast('Requesting a fresh linking code…');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    dom.refreshQrBtn.textContent = original;
    renderSessionModal();
  }
}

async function unlinkDevice() {
  const confirmed = window.confirm(
    'Unlink this WhatsApp account from the app? Your cached messages stay on this computer, but you will need to scan a new code to reconnect.'
  );
  if (!confirmed) return;
  dom.unlinkBtn.disabled = true;
  try {
    const result = await api('/api/session/logout', { method: 'POST' });
    if (result?.status) handleStatus(result.status);
    state.sessionDismissed = false;
    toast('WhatsApp device unlinked.');
    setTimeout(() => openSessionModal(), 500);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    dom.unlinkBtn.disabled = false;
  }
}

function openAutoReplyModal() {
  if (state.demo) {
    toast('Auto-reply is available after linking a real WhatsApp account.');
    return;
  }
  const autoReply = getAutoReply();
  state.autoReplyDraftEnabled = autoReply.enabled;
  state.autoReplyDirty = false;
  dom.autoReplyText.value = autoReply.text;
  dom.autoReplyCooldown.value = String(autoReply.cooldownMinutes);
  dom.autoReplyError.textContent = '';
  dom.autoReplySave.disabled = false;
  dom.autoReplySave.textContent = 'Save';
  renderAutoReplyDraft();
  showModal('autoReplyModal');
  setTimeout(() => dom.autoReplyText.focus(), 60);
}

async function updateAutoReplySettings(patch, { closeAfter = false } = {}) {
  if (state.demo) return false;
  state.autoReplySaving = true;
  renderAutoReply();
  try {
    const settings = await api('/api/settings/auto-reply', {
      method: 'PATCH',
      body: patch
    });
    state.settings = settings;
    if (closeAfter) {
      state.autoReplyDirty = false;
      closeModal('autoReplyModal');
    }
    renderAutoReply();
    return true;
  } catch (error) {
    if (state.modal === 'autoReplyModal') dom.autoReplyError.textContent = error.message;
    else toast(error.message, 'error');
    return false;
  } finally {
    state.autoReplySaving = false;
    renderAutoReply();
  }
}

async function toggleAutoReply() {
  if (state.demo || state.autoReplySaving) return;
  const autoReply = getAutoReply();
  const enabled = !autoReply.enabled;
  const ok = await updateAutoReplySettings({ enabled });
  if (ok) {
    toast(enabled ? 'Auto-reply enabled.' : 'Auto-reply disabled.');
  }
}

async function saveAutoReplyModal() {
  const text = dom.autoReplyText.value.trim();
  const cooldownMinutes = Number(dom.autoReplyCooldown.value);
  if (!text) {
    dom.autoReplyError.textContent = 'Write a reply message first.';
    dom.autoReplyText.focus();
    return;
  }
  dom.autoReplySave.disabled = true;
  dom.autoReplySave.textContent = 'Saving…';
  const ok = await updateAutoReplySettings(
    {
      enabled: state.autoReplyDraftEnabled,
      text,
      cooldownMinutes
    },
    { closeAfter: true }
  );
  dom.autoReplySave.disabled = false;
  dom.autoReplySave.textContent = 'Save';
  if (ok) toast(state.autoReplyDraftEnabled ? 'Auto-reply saved and enabled.' : 'Auto-reply saved.');
}

function openNewChat() {
  dom.newChatForm.reset();
  dom.newChatError.textContent = '';
  dom.newChatSubmit.disabled = false;
  dom.newChatSubmit.textContent = 'Open chat';
  showModal('newChatModal');
  setTimeout(() => dom.newChatPhone.focus(), 60);
}

async function submitNewChat(event) {
  event.preventDefault();
  const phone = dom.newChatPhone.value.trim();
  const name = dom.newChatName.value.trim();
  if (!phone) {
    dom.newChatError.textContent = 'Enter a phone number.';
    dom.newChatPhone.focus();
    return;
  }
  dom.newChatSubmit.disabled = true;
  dom.newChatSubmit.textContent = 'Checking…';
  dom.newChatError.textContent = '';
  try {
    const result = await api('/api/chats', { method: 'POST', body: { phone, name } });
    if (!result?.chat) throw new Error('The conversation could not be created.');
    upsertChat(result.chat);
    closeModal('newChatModal');
    state.tab = 'chats';
    renderTabs();
    await openChat(result.chat.jid);
    dom.composerInput.focus();
  } catch (error) {
    dom.newChatError.textContent = error.message;
  } finally {
    dom.newChatSubmit.disabled = false;
    dom.newChatSubmit.textContent = 'Open chat';
  }
}

function openInfo() {
  const chat = getActiveChat();
  if (!chat) return;
  populateInfo(chat);
  showModal('infoModal');
}

function populateInfo(chat) {
  dom.infoAvatar.textContent = initialsFor(chat.name);
  dom.infoAvatar.dataset.tone = String(avatarTone(chat.jid));
  dom.infoAvatar.className = 'avatar avatar-xl';
  if (chat.isGroup) addGroupBadge(dom.infoAvatar);
  dom.infoTitle.textContent = chat.name;
  dom.infoSub.textContent = chat.isGroup ? 'WhatsApp group' : chat.phone ? formatPhone(chat.phone) : 'WhatsApp contact';
  dom.infoRows.replaceChildren();

  const addRow = (label, value) => {
    if (!value) return;
    const row = document.createElement('div');
    row.className = 'info-row';
    const key = document.createElement('span');
    key.className = 'info-label';
    key.textContent = label;
    const val = document.createElement('span');
    val.className = 'info-value';
    val.textContent = value;
    row.append(key, val);
    dom.infoRows.append(row);
  };

  addRow('Type', chat.isGroup ? 'Group conversation' : 'Direct message');
  if (chat.phone) addRow('Phone', formatPhone(chat.phone));
  addRow('Last activity', chat.timestamp ? formatFullDate(chat.timestamp) : 'No messages yet');
  addRow('Cached messages', String(getCache(chat.jid).total || getCache(chat.jid).items.length || 0));

  dom.infoActions.replaceChildren();
  if (chat.phone) {
    dom.infoActions.append(
      createButton('Copy number', 'btn btn-ghost', async () => {
        await copyText(formatPhone(chat.phone));
      })
    );
    const link = document.createElement('a');
    link.className = 'btn btn-primary';
    link.href = `https://wa.me/${chat.phone.replace(/\D/g, '')}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open in WhatsApp';
    dom.infoActions.append(link);
  } else {
    dom.infoActions.append(createButton('Close', 'btn btn-primary', () => closeModal('infoModal')));
  }
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast('Copied to clipboard.');
  } catch {
    const input = document.createElement('textarea');
    input.value = value;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    try {
      document.execCommand('copy');
      toast('Copied to clipboard.');
    } catch {
      toast('Could not copy automatically.', 'error');
    }
    input.remove();
  }
}

/* -------------------------------------------------------------------- toasts */

function toast(message, kind = 'info') {
  if (!message) return;
  const node = document.createElement('div');
  node.className = `toast${kind === 'error' ? ' is-error' : ''}`;
  const icon = document.createElement('span');
  icon.innerHTML = kind === 'error'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 8v5M12 16.5v.2"></path></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4 4L19 7"></path></svg>';
  const text = document.createElement('span');
  text.textContent = message;
  node.append(icon, text);
  dom.toastHost.append(node);
  while (dom.toastHost.children.length > 4) dom.toastHost.firstElementChild.remove();
  setTimeout(() => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 220);
  }, 3_600);
}

/* --------------------------------------------------------------------- emoji */

function buildEmojiPanel() {
  dom.emojiPanel.replaceChildren(
    ...EMOJIS.map((emoji) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = emoji;
      button.setAttribute('aria-label', emoji);
      button.addEventListener('click', () => insertEmoji(emoji));
      return button;
    })
  );
}

function toggleEmojiPanel() {
  const willShow = dom.emojiPanel.hidden;
  dom.emojiPanel.hidden = !willShow;
  dom.emojiBtn.setAttribute('aria-expanded', String(willShow));
}

function insertEmoji(emoji) {
  const input = dom.composerInput;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.setRangeText(emoji, start, end, 'end');
  input.focus();
  autoResizeComposer();
  dom.emojiPanel.hidden = true;
  dom.emojiBtn.setAttribute('aria-expanded', 'false');
}

/* ---------------------------------------------------------------- navigation */

function setTab(tab) {
  if (!['chats', 'contacts'].includes(tab)) return;
  state.tab = tab;
  renderTabs();
  renderList();
}

function handleWelcomeAction(which) {
  let action;
  if (which === 'primary') action = dom.welcomePrimary.dataset.action;
  else action = dom.welcomeNew.dataset.action;
  if (action === 'link') openSessionModal();
  else if (action === 'contacts') setTab('contacts');
  else openNewChat();
}

async function openContact(contactJid) {
  const contact = state.contacts.find((item) => item.jid === contactJid);
  if (!contact) return;
  const existing = state.chats.find((chat) => chat.jid === contactJid);
  if (existing) {
    await openChat(existing.jid);
    return;
  }
  if (!contact.phone) {
    toast('No phone number is available for this contact.', 'error');
    return;
  }
  try {
    const result = await api('/api/chats', {
      method: 'POST',
      body: { phone: contact.phone, name: contact.name }
    });
    if (!result?.chat) throw new Error('The conversation could not be opened.');
    upsertChat(result.chat);
    await openChat(result.chat.jid);
  } catch (error) {
    toast(error.message, 'error');
  }
}

/* --------------------------------------------------------------------- bind */

function bindEvents() {
  dom.statusChip.addEventListener('click', openSessionModal);
  dom.accountCard.addEventListener('click', openSessionModal);
  dom.searchInput.addEventListener('input', () => {
    state.search = dom.searchInput.value;
    renderList();
  });
  dom.newChatBtn.addEventListener('click', openNewChat);
  dom.autoReplyToggle.addEventListener('click', toggleAutoReply);
  dom.autoReplySettingsBtn.addEventListener('click', openAutoReplyModal);
  dom.autoReplyModalToggle.addEventListener('click', () => {
    state.autoReplyDraftEnabled = !state.autoReplyDraftEnabled;
    state.autoReplyDirty = true;
    renderAutoReplyDraft();
  });
  dom.autoReplyText.addEventListener('input', () => {
    state.autoReplyDirty = true;
  });
  dom.autoReplyCooldown.addEventListener('change', () => {
    state.autoReplyDirty = true;
  });
  dom.autoReplySave.addEventListener('click', saveAutoReplyModal);
  dom.welcomePrimary.addEventListener('click', () => handleWelcomeAction('primary'));
  dom.welcomeNew.addEventListener('click', () => handleWelcomeAction('secondary'));
  dom.backBtn.addEventListener('click', closeChat);
  dom.infoBtn.addEventListener('click', openInfo);
  dom.bannerAction.addEventListener('click', () => {
    if (['qr', 'disconnected', 'error'].includes(state.status.state)) openSessionModal();
    else requestNewQr();
  });
  dom.composerReconnect.addEventListener('click', () => {
    if (['qr', 'disconnected', 'error'].includes(state.status.state)) openSessionModal();
    else requestNewQr();
  });
  dom.composerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage();
  });
  dom.composerInput.addEventListener('input', () => {
    autoResizeComposer();
    queueTypingSignal();
  });
  dom.composerInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  dom.emojiBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleEmojiPanel();
  });
  dom.emojiPanel.addEventListener('click', (event) => event.stopPropagation());

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => setTab(tab.dataset.tab));
  });

  dom.chatList.addEventListener('click', (event) => {
    const item = event.target.closest('.chat-item');
    if (item?.dataset.jid) openChat(item.dataset.jid);
  });

  dom.contactsList.addEventListener('click', (event) => {
    const item = event.target.closest('.contact-item');
    if (item?.dataset.contactJid) openContact(item.dataset.contactJid);
  });

  document.addEventListener('click', (event) => {
    if (!dom.emojiPanel.hidden && !event.target.closest('#emojiPanel') && !event.target.closest('#emojiBtn')) {
      dom.emojiPanel.hidden = true;
      dom.emojiBtn.setAttribute('aria-expanded', 'false');
    }
    const close = event.target.closest('[data-close-modal]');
    if (close) closeModal(close.dataset.closeModal);
  });

  dom.refreshQrBtn.addEventListener('click', requestNewQr);
  dom.closeSessionBtn.addEventListener('click', () => closeModal('sessionModal'));
  dom.unlinkBtn.addEventListener('click', unlinkDevice);
  dom.newChatForm.addEventListener('submit', submitNewChat);

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      dom.searchInput.focus();
      dom.searchInput.select();
      return;
    }
    if (event.key === 'Escape') {
      if (!dom.emojiPanel.hidden) {
        dom.emojiPanel.hidden = true;
        dom.emojiBtn.setAttribute('aria-expanded', 'false');
        return;
      }
      if (state.modal) {
        closeModal(state.modal);
        return;
      }
      if (window.matchMedia('(max-width: 900px)').matches && state.activeJid) closeChat();
    }
  });

  window.addEventListener('online', () => {
    connectSocket();
    refreshBootstrap().catch(() => {});
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!isSocketOpen()) connectSocket();
    if (Date.now() - state.lastRefreshAt > 20_000) refreshBootstrap().catch(() => {});
    sendViewing(state.activeJid || '');
  });
}

/* --------------------------------------------------------------------- init */

function initializeAfterBootstrap() {
  if (state.initialized) return;
  state.initialized = true;
  const deepLink = readDeepLink();
  if (deepLink) {
    openChat(deepLink, { updateUrl: false, force: true }).catch(() => {});
  } else if (window.matchMedia('(min-width: 901px)').matches && state.chats.length) {
    openChat(state.chats[0].jid, { updateUrl: false, stickToBottom: true }).catch(() => {});
  }
  maybePromptSession();
}

function maybePromptSession() {
  if (state.demo || state.modal || state.sessionDismissed) return;
  if (isConnected()) return;
  if (!state.chats.length || ['qr', 'disconnected', 'error'].includes(state.status.state)) {
    openSessionModal();
  }
}

async function init() {
  cacheDom();
  bindEvents();
  buildEmojiPanel();
  autoResizeComposer();
  updateSendState();
  try {
    await refreshBootstrap();
  } catch (error) {
    toast(error.message, 'error');
  }
  connectSocket();
  initializeAfterBootstrap();
  state.lastRefreshAt = Date.now();

  // A light poll keeps the dashboard correct if WebSockets are unavailable.
  setInterval(() => {
    if (!isSocketOpen() && document.visibilityState === 'visible') {
      refreshBootstrap().catch(() => {});
    }
  }, 20_000);
}

init();
