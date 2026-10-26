const SUPPORTED_SERVERS = new Set(['s.whatsapp.net', 'c.us', 'g.us', 'lid']);

export function isSupportedJid(jid) {
  if (typeof jid !== 'string' || !jid.includes('@')) return false;
  const server = jid.slice(jid.lastIndexOf('@') + 1);
  return SUPPORTED_SERVERS.has(server);
}

export function isGroupJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

export function isDirectJid(jid) {
  return isSupportedJid(jid) && !isGroupJid(jid);
}

export function jidUser(jid) {
  if (typeof jid !== 'string') return '';
  const at = jid.indexOf('@');
  return (at === -1 ? jid : jid.slice(0, at)).split(':')[0];
}

export function phoneFromJid(jid) {
  if (!jid || !jid.includes('@')) return '';
  const server = jid.slice(jid.lastIndexOf('@') + 1);
  if (server !== 's.whatsapp.net' && server !== 'c.us') return '';
  const number = jidUser(jid).replace(/\D/g, '');
  return number || '';
}

export function normalizePhone(input) {
  if (typeof input !== 'string') return '';
  let value = input.trim();
  const waLink = value.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\+?\d+)/i);
  if (waLink) value = waLink[1];
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? digits : '';
}

export function formatPhone(value) {
  const number = String(value || '').replace(/\D/g, '');
  if (!number) return '';
  return `+${number}`;
}

export function displayPhone(jid, contact = null) {
  const phone = contact?.phone || phoneFromJid(jid);
  return phone ? `+${phone}` : '';
}

export function fallbackName(jid) {
  if (isGroupJid(jid)) return 'Group chat';
  const phone = phoneFromJid(jid);
  if (phone) return `+${phone}`;
  if (jid?.endsWith('@lid')) return 'WhatsApp contact';
  return 'Unknown contact';
}

export function contactName(contact, jid) {
  const name = contact?.name || contact?.verifiedName || contact?.notify;
  return String(name || '').trim() || fallbackName(jid);
}

export function initialsFor(name) {
  const cleaned = String(name || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
  if (!cleaned) return '#';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return Array.from(words[0]).slice(0, 2).join('').toUpperCase();
  }
  return (Array.from(words[0])[0] + Array.from(words[words.length - 1])[0]).toUpperCase();
}

export function avatarTone(seed) {
  let hash = 0;
  const text = String(seed || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % 6;
}

export function isChatJidAllowed(jid) {
  if (!isSupportedJid(jid)) return false;
  if (jid === 'status@broadcast') return false;
  if (jid.endsWith('@newsletter')) return false;
  if (jid.endsWith('@broadcast')) return false;
  return true;
}
