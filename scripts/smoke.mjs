import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'whatsapp-desk-smoke-'));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(base, child, output, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`demo server exited early (${child.exitCode})\n${output()}`);
    }
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) return;
    } catch {
      // Keep polling while the server starts.
    }
    await sleep(250);
  }
  throw new Error(`demo server did not become healthy\n${output()}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  for (let index = 0; index < 30; index += 1) {
    if (child.exitCode !== null) return;
    await sleep(100);
  }
  child.kill('SIGKILL');
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
let stdout = '';
let stderr = '';
const child = spawn(process.execPath, ['server/index.js', '--demo', `--port=${port}`], {
  cwd: root,
  env: { ...process.env, DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  stdout += chunk;
});
child.stderr.on('data', (chunk) => {
  stderr += chunk;
});

try {
  await waitForHealth(base, child, () => `${stdout}\n${stderr}`);
  const bootstrap = await (await fetch(`${base}/api/bootstrap`)).json();
  assert.equal(bootstrap.demo, true, 'expected demo mode');
  assert.ok(bootstrap.chats.length >= 1, 'expected seeded demo chats');

  const chat = bootstrap.chats[0];
  const text = `smoke-${Date.now()}`;
  const sendResponse = await fetch(`${base}/api/chats/${encodeURIComponent(chat.jid)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text })
  });
  assert.equal(sendResponse.status, 200, 'send endpoint should succeed');

  const messages = await (
    await fetch(`${base}/api/chats/${encodeURIComponent(chat.jid)}/messages?limit=20`)
  ).json();
  assert.ok(
    messages.messages.some((message) => message.text === text),
    'sent message should appear in the chat'
  );

  const settings = await (await fetch(`${base}/api/settings`)).json();
  assert.equal(settings.autoReply.enabled, false, 'auto-reply should start disabled');

  console.log(`Smoke test passed: ${bootstrap.chats.length} demo chats, ${chat.name} read/write OK.`);
} catch (error) {
  console.error(error.message);
  console.error(`\n--- server stdout ---\n${stdout}\n--- server stderr ---\n${stderr}`);
  process.exitCode = 1;
} finally {
  await stopChild(child);
  await rm(dataDir, { recursive: true, force: true });
}
