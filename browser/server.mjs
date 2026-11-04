// Argus Lens — one real Chromium, one tab per agent, streamed live.
//
//   :7901  control API (daemon only, X-Argus-Auth required)
//          POST /act   { agent, action, url?, id?, text?, submit?, key?, direction? }
//          GET  /health
//   :7900  read-only screencast for the frontend (published on 127.0.0.1)
//          WS   /stream  → frames, tabs, actions   ← { type:'focus', agent } | { type:'follow', on }
//
// Security posture (mirrors tools.rs egress policy, enforced again here):
//   * every request any page makes — navigation, XHR, fetch, images — is routed
//     through `guard()`, which blocks non-http(s) schemes, loopback, RFC1918,
//     link-local/metadata, and every internal service hostname
//   * Chromium's resolver maps the internal hostnames to NOTFOUND as well
//   * no downloads, no file:// , no persistent profile
// Residual risk (documented in README): DNS rebinding to a private IP is not
// detected — the hostname check runs before resolution.

import http from 'node:http';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';

const TOKEN = process.env.BROWSER_TOKEN ?? '';
const CONTROL_PORT = Number(process.env.CONTROL_PORT ?? 7901);
const STREAM_PORT = Number(process.env.STREAM_PORT ?? 7900);
const VIEW = { width: 1280, height: 800 };
const MAX_TEXT = 6000;
const MAX_ELEMENTS = 60;
const BG_FRAME_MS = 1000; // non-focused tabs stream at ≤1 fps (thumbnails)

const INTERNAL_HOSTS = [
  'argus-daemon', 'argus-workspace', 'argus-frontend', 'argus-browser',
  'litellm', 'argus-litellm', 'ollama', 'argus-ollama',
  'host.docker.internal', 'gateway.docker.internal', 'metadata.google.internal',
  'localhost',
];

export function guard(raw) {
  let u;
  try { u = new URL(raw); } catch { return 'invalid url'; }
  if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') return null;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return `scheme ${u.protocol} blocked`;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (INTERNAL_HOSTS.includes(h) || h.endsWith('.internal') || h.endsWith('.local')) return `internal host ${h} blocked`;
  if (h === '::1' || h === '::' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return `private ipv6 ${h} blocked`;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)) {
      return `private address ${h} blocked`;
    }
  }
  return null;
}

// ── Browser + sessions ────────────────────────────────────────────────────

const browser = await chromium.launch({
  args: [
    `--host-resolver-rules=${INTERNAL_HOSTS.map((h) => `MAP ${h} ~NOTFOUND`).join(', ')}`,
    '--disable-dev-shm-usage',
  ],
});

/** @type {Map<string, {page: import('playwright').Page, cdp: any, lastBg: number, cursor: {x:number,y:number}}>} */
const sessions = new Map();
/** last frame per agent — replayed to new viewers (static pages emit no new frames) */
const lastFrames = new Map();
let focused = null;
let follow = true;
const viewers = new Set();

function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const ws of viewers) if (ws.readyState === 1) ws.send(s);
}

async function tabsSnapshot() {
  const tabs = [];
  for (const [agent, s] of sessions) {
    let title = '';
    try { title = await s.page.title(); } catch { /* navigating */ }
    tabs.push({ agent, url: s.page.url(), title, focused: agent === focused });
  }
  return tabs;
}
async function pushTabs() { broadcast({ type: 'tabs', tabs: await tabsSnapshot(), follow }); }

function setFocus(agent) {
  if (!sessions.has(agent) || focused === agent) return;
  focused = agent;
  broadcast({ type: 'focus', agent });
  pushTabs();
}

async function session(agent) {
  if (sessions.has(agent)) return sessions.get(agent);
  const context = await browser.newContext({
    viewport: VIEW,
    acceptDownloads: false,
    serviceWorkers: 'block',
    userAgent: undefined,
  });
  await context.route('**/*', (route) => {
    const why = guard(route.request().url());
    return why ? route.abort('blockedbyclient') : route.continue();
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const s = { page, cdp, lastBg: 0, cursor: { x: VIEW.width / 2, y: VIEW.height / 2 } };
  sessions.set(agent, s);

  cdp.on('Page.screencastFrame', async (f) => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    lastFrames.set(agent, { data: f.data, w: f.metadata.deviceWidth, h: f.metadata.deviceHeight });
    if (viewers.size === 0) return;
    const now = Date.now();
    if (agent !== focused) {
      if (now - s.lastBg < BG_FRAME_MS) return;
      s.lastBg = now;
    }
    broadcast({ type: 'frame', agent, data: f.data, w: f.metadata.deviceWidth, h: f.metadata.deviceHeight, focused: agent === focused });
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 62, maxWidth: VIEW.width, maxHeight: VIEW.height, everyNthFrame: 1 });
  page.on('framenavigated', (fr) => { if (fr === page.mainFrame()) pushTabs(); });
  page.on('close', () => { sessions.delete(agent); lastFrames.delete(agent); pushTabs(); });

  if (!focused) focused = agent;
  await pushTabs();
  return s;
}

// ── Page reading: text + numbered interactive elements ───────────────────

async function readPage(page) {
  const data = await page.evaluate(({ maxEl }) => {
    document.querySelectorAll('[data-argus-id]').forEach((el) => el.removeAttribute('data-argus-id'));
    const sel = 'a[href], button, input:not([type=hidden]), textarea, select, [role=button], [role=link], [role=tab], [contenteditable=true], summary';
    const out = [];
    let n = 1;
    for (const el of document.querySelectorAll(sel)) {
      if (out.length >= maxEl) break;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || st.visibility === 'hidden' || st.display === 'none') continue;
      if (r.bottom < 0 || r.top > innerHeight * 2) continue;
      el.setAttribute('data-argus-id', String(n));
      const tag = el.tagName.toLowerCase();
      const kind = tag === 'input' ? `input[${el.type || 'text'}]` : (el.getAttribute('role') || tag);
      const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || el.name || '')
        .replace(/\s+/g, ' ').trim().slice(0, 80);
      out.push(`[${n}] ${kind} "${label}"`);
      n++;
    }
    const text = (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n');
    return { text, elements: out };
  }, { maxEl: MAX_ELEMENTS });
  return {
    url: page.url(),
    title: await page.title(),
    text: data.text.length > MAX_TEXT ? data.text.slice(0, MAX_TEXT) + `\n…[truncated, ${data.text.length} chars]` : data.text,
    elements: data.elements,
  };
}

async function locate(page, id) {
  const loc = page.locator(`[data-argus-id="${Number(id)}"]`).first();
  if ((await loc.count()) === 0) throw new Error(`no element [${id}] — call read again to refresh ids`);
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  const box = await loc.boundingBox();
  return { loc, box };
}

async function glide(s, agent, x, y) {
  // Move the real mouse in steps so the ghost cursor in the UI has a path.
  await s.page.mouse.move(x, y, { steps: 12 });
  s.cursor = { x, y };
  broadcast({ type: 'cursor', agent, x: x / VIEW.width, y: y / VIEW.height });
}

async function act(body) {
  const agent = String(body.agent || 'argus').slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '_');
  const action = String(body.action || '');
  const s = await session(agent);
  const page = s.page;
  if (follow) setFocus(agent);
  const announce = (extra) => broadcast({ type: 'action', agent, action, ts: Date.now(), ...extra });

  switch (action) {
    case 'navigate': {
      const url = String(body.url || '');
      const why = guard(url);
      if (why) throw new Error(`navigation blocked: ${why}`);
      announce({ url });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
      break;
    }
    case 'read':
      announce({});
      break;
    case 'click': {
      const { loc, box } = await locate(page, body.id);
      if (box) {
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await glide(s, agent, x, y);
        announce({ x: x / VIEW.width, y: y / VIEW.height, label: (await loc.innerText().catch(() => '')).slice(0, 60) });
      }
      await loc.click({ timeout: 5000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
      break;
    }
    case 'type': {
      const text = String(body.text ?? '');
      const { loc, box } = await locate(page, body.id);
      if (box) {
        const x = box.x + Math.min(box.width / 2, 40), y = box.y + box.height / 2;
        await glide(s, agent, x, y);
        announce({ x: x / VIEW.width, y: y / VIEW.height, text: text.slice(0, 80) });
      }
      await loc.click({ timeout: 5000 });
      await loc.fill('').catch(() => {});
      await page.keyboard.type(text, { delay: 18 });
      if (body.submit) {
        await page.keyboard.press('Enter');
        await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
      }
      break;
    }
    case 'press': {
      const key = String(body.key || 'Enter');
      announce({ key });
      await page.keyboard.press(key);
      break;
    }
    case 'scroll': {
      const dir = body.direction === 'up' ? -1 : 1;
      announce({ direction: dir > 0 ? 'down' : 'up' });
      await page.mouse.wheel(0, dir * VIEW.height * 0.8);
      await page.waitForTimeout(350);
      break;
    }
    case 'back':
      announce({});
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      break;
    default:
      throw new Error(`unknown action "${action}" — use navigate|read|click|type|press|scroll|back`);
  }
  const state = await readPage(page);
  pushTabs();
  return { ok: true, ...state };
}

// ── Control API ──────────────────────────────────────────────────────────

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, tabs: sessions.size });
  if (!TOKEN || req.headers['x-argus-auth'] !== TOKEN) return json(res, 401, { ok: false, error: 'unauthorized' });
  if (req.method !== 'POST' || req.url !== '/act') return json(res, 404, { ok: false, error: 'not found' });
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
  req.on('end', async () => {
    try {
      json(res, 200, await act(JSON.parse(raw || '{}')));
    } catch (e) {
      json(res, 200, { ok: false, error: String(e?.message || e).split('\n')[0] });
    }
  });
}).listen(CONTROL_PORT, () => console.log(`[lens] control on :${CONTROL_PORT}`));

// ── Stream ───────────────────────────────────────────────────────────────

const streamServer = http.createServer((_, res) => { res.writeHead(200); res.end('argus lens'); });
const wss = new WebSocketServer({ server: streamServer, path: '/stream' });
wss.on('connection', async (ws) => {
  viewers.add(ws);
  ws.send(JSON.stringify({ type: 'hello', view: VIEW }));
  ws.send(JSON.stringify({ type: 'tabs', tabs: await tabsSnapshot(), follow }));
  // Replay the last frame of every tab so a new viewer is never black.
  for (const [agent, fr] of lastFrames) {
    ws.send(JSON.stringify({ type: 'frame', agent, data: fr.data, w: fr.w, h: fr.h, focused: agent === focused }));
  }
  ws.on('message', (m) => {
    try {
      const msg = JSON.parse(String(m));
      if (msg.type === 'focus' && typeof msg.agent === 'string') {
        follow = false;
        setFocus(msg.agent);
        const fr = lastFrames.get(msg.agent);
        if (fr) broadcast({ type: 'frame', agent: msg.agent, data: fr.data, w: fr.w, h: fr.h, focused: true });
      }
      if (msg.type === 'follow') { follow = !!msg.on; pushTabs(); }
    } catch { /* ignore */ }
  });
  ws.on('close', () => viewers.delete(ws));
});
streamServer.listen(STREAM_PORT, () => console.log(`[lens] stream on :${STREAM_PORT}/stream`));

process.on('SIGTERM', async () => { await browser.close(); process.exit(0); });
