import { DAEMON_PORT, DAEMON_HOST, isDaemonRunning } from './DaemonServer.js';

const BASE_URL = `http://${DAEMON_HOST}:${DAEMON_PORT}`;
const TIMEOUT = 5_000;

async function fetchDaemon(path: string, opts: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...opts, signal: controller.signal });
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function daemonHealth(cwd: string): Promise<{ ok: boolean; uptime?: number; pid?: number }> {
  if (!isDaemonRunning(cwd)) return { ok: false };
  try {
    const data = await fetchDaemon('/health') as { ok: boolean; uptime: number; pid: number };
    return data;
  } catch {
    return { ok: false };
  }
}

export async function daemonIndex(cwd: string, mode: 'full' | 'lazy' = 'lazy'): Promise<boolean> {
  if (!isDaemonRunning(cwd)) return false;
  try {
    const data = await fetchDaemon('/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd, mode }),
    }) as { ok: boolean };
    return data.ok;
  } catch {
    return false;
  }
}

export async function daemonContext(cwd: string, query: string, topK = 5): Promise<string | null> {
  if (!isDaemonRunning(cwd)) return null;
  try {
    const data = await fetchDaemon('/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd, query, topK }),
    }) as { ok: boolean; context: string };
    return data.ok ? data.context : null;
  } catch {
    return null;
  }
}
