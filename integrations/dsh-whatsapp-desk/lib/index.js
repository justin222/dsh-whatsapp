/**
 * Host half of the DSH WhatsApp Desk side-card plugin.
 *
 * The actual dashboard is the independent local app in this workspace. This
 * plugin starts that app on demand (or reuses an instance that is already up)
 * so the sidebar tab has something to frame. It never embeds WhatsApp logic or
 * credentials in DSH itself.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const name = 'dsh-whatsapp-desk';
export const inject = [];

// A sensible default for the common local layout. Set WHATSAPP_DESK_DIR (or
// the plugin's appDir config) if the dashboard lives somewhere else.
const DEFAULT_APP_DIR = path.join(os.homedir(), 'Desktop', 'DSH', 'Whatapps');
const DEFAULT_PORT = 3000;
const RETRY_MS = 20_000;

function log(...args) {
  console.log('[whatsapp-desk]', ...args);
}

function existingFile(candidate) {
  try {
    return candidate && fs.existsSync(candidate) ? candidate : '';
  } catch {
    return '';
  }
}

function nodeExecutable() {
  const candidates = [
    process.env.DSH_DESKTOP_NODE_EXECUTABLE,
    process.env.DSH_NODE,
    'C:\\Program Files\\nodejs\\node.exe'
  ];
  for (const candidate of candidates) {
    if (existingFile(candidate)) return candidate;
  }
  return 'node';
}

export function apply(ctx, config = {}) {
  if (config.autoStart === false) {
    log('autoStart is disabled');
    return;
  }

  const appDir = path.resolve(config.appDir || process.env.WHATSAPP_DESK_DIR || DEFAULT_APP_DIR);
  const port = DEFAULT_PORT;
  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  const serverEntry = path.join(appDir, 'server', 'index.js');
  let starting = false;
  let stopped = false;
  let missingWarned = false;

  async function isUp() {
    try {
      const response = await fetch(healthUrl, {
        cache: 'no-store',
        signal: AbortSignal.timeout(1500)
      });
      if (!response.ok) return false;
      const data = await response.json().catch(() => null);
      return data?.ok === true;
    } catch {
      return false;
    }
  }

  async function ensureStarted() {
    if (stopped || starting) return;
    if (await isUp()) return;
    if (stopped) return;

    if (!existingFile(serverEntry)) {
      if (!missingWarned) {
        missingWarned = true;
        log(`app not found at ${serverEntry}`);
      }
      return;
    }

    starting = true;
    try {
      const executable = nodeExecutable();
      const child = spawn(executable, [serverEntry], {
        cwd: appDir,
        env: {
          ...process.env,
          PORT: String(port),
          ELECTRON_RUN_AS_NODE: '1'
        },
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.on('error', (error) => {
        log(`could not start the app: ${error.message}`);
      });
      child.unref();
      log(`starting WhatsApp Desk on 127.0.0.1:${port}`);
    } catch (error) {
      log(`could not start the app: ${error.message}`);
    } finally {
      starting = false;
    }
  }

  const timer = setInterval(ensureStarted, RETRY_MS);
  if (typeof timer.unref === 'function') timer.unref();

  if (typeof ctx.effect === 'function') {
    ctx.effect(
      () => () => {
        stopped = true;
        clearInterval(timer);
      },
      'dsh-whatsapp-desk: local app lifecycle'
    );
  }

  ensureStarted();
}
