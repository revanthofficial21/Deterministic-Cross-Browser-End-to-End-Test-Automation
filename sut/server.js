// Instrumented system under test (SUT).
// Deliberately exhibits the three failure families the project targets:
//   1. asynchronous rendering with variable latency (synchronisation hazard)
//   2. per-user server-side state that parallel tests can collide on (state coupling)
//   3. a hydration window in which controls look enabled before listeners attach
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const PORT = Number(process.env.SUT_PORT || 4173);
const ACCOUNTS = Number(process.env.ACCOUNTS || 8);
const PASSWORD = process.env.SUT_PASSWORD || 'test-pass';

// Runtime control surface. The acceptance campaign sets these; nothing else should.
const cfg = {
  latencyBase: Number(process.env.LATENCY_BASE ?? 250),
  latencySpread: Number(process.env.LATENCY_SPREAD ?? 650),
  renderDelay: Number(process.env.RENDER_DELAY ?? 120),
  failRate: Number(process.env.FAIL_RATE ?? 0),
  failStatus: Number(process.env.FAIL_STATUS ?? 503),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const latency = () => cfg.latencyBase + Math.random() * cfg.latencySpread;

// ---------------------------------------------------------------- state
const users = new Map();   // username -> { id, password, orders, settings }
const sessions = new Map(); // sid -> username

let orderSeq = 1000;

function seedUser(i) {
  const username = `u${i}`;
  const orders = [
    { id: `o-${username}-1`, item: 'starter plan', amount: 10, status: 'open' },
    { id: `o-${username}-2`, item: 'team plan', amount: 25, status: 'open' },
    { id: `o-${username}-3`, item: 'support retainer', amount: 15, status: 'paid' },
  ];
  users.set(username, {
    id: username,
    password: PASSWORD,
    orders,
    settings: { theme: 'light', notifications: 'on' },
  });
}
for (let i = 1; i <= ACCOUNTS; i++) seedUser(i);

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function currentUser(req) {
  const sid = parseCookies(req.headers.cookie).sid;
  if (!sid) return null;
  const username = sessions.get(sid);
  return username ? users.get(username) : null;
}

function requireUser(req, res) {
  const u = currentUser(req);
  if (!u) {
    res.status(401).json({ error: 'unauthenticated' });
    return null;
  }
  return u;
}

// Fault injection: applied to every data route, never to /_health.
async function dataRoute(req, res, next) {
  await sleep(latency());
  if (cfg.failRate > 0 && Math.random() < cfg.failRate) {
    return res.status(cfg.failStatus).json({ error: 'injected_fault' });
  }
  next();
}

// ---------------------------------------------------------------- static
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/', (req, res) => {
  if (!currentUser(req)) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------- auth
app.post('/api/login', dataRoute, (req, res) => {
  const { username, password } = req.body || {};
  const u = users.get(username);
  if (!u || u.password !== password) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  const sid = crypto.randomBytes(16).toString('hex');
  sessions.set(sid, username);
  res.setHeader('Set-Cookie', `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`);
  res.json({ username });
});

app.post('/api/logout', (req, res) => {
  const sid = parseCookies(req.headers.cookie).sid;
  if (sid) sessions.delete(sid);
  res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', dataRoute, (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  res.json({ username: u.id, renderDelay: cfg.renderDelay });
});

// ---------------------------------------------------------------- data
app.get('/api/orders', dataRoute, (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const status = req.query.status;
  const rows = status ? u.orders.filter((o) => o.status === status) : u.orders;
  res.json({ orders: rows, serverTime: Date.now() });
});

app.post('/api/orders', dataRoute, (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const { item, amount = 5, status = 'open' } = req.body || {};
  if (!item) return res.status(400).json({ error: 'item_required' });
  const order = { id: `o-${++orderSeq}`, item, amount: Number(amount), status };
  u.orders.push(order);
  res.status(201).json({ order });
});

app.delete('/api/orders/:id', dataRoute, (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const before = u.orders.length;
  u.orders = u.orders.filter((o) => o.id !== req.params.id);
  if (u.orders.length === before) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

app.get('/api/settings', dataRoute, (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  res.json({ settings: u.settings });
});

app.put('/api/settings', dataRoute, (req, res) => {
  const u = requireUser(req, res);
  if (!u) return;
  const { theme, notifications } = req.body || {};
  if (theme) u.settings.theme = theme;
  if (notifications) u.settings.notifications = notifications;
  res.json({ settings: u.settings });
});

// ---------------------------------------------------------------- control
app.get('/_health', (req, res) => res.json({ ok: true, users: users.size, cfg }));

app.get('/_control', (req, res) => res.json(cfg));

app.post('/_control', (req, res) => {
  for (const k of ['latencyBase', 'latencySpread', 'renderDelay', 'failRate', 'failStatus']) {
    if (req.body && typeof req.body[k] === 'number') cfg[k] = req.body[k];
  }
  res.json(cfg);
});

// Reset one account's data. Used by the isolation layer between repetitions.
app.post('/_reset/:username', (req, res) => {
  const u = users.get(req.params.username);
  if (!u) return res.status(404).json({ error: 'no_such_user' });
  seedUser(Number(req.params.username.replace('u', '')));
  res.json({ ok: true, orders: users.get(req.params.username).orders.length });
});

app.listen(PORT, () => {
  console.log(`SUT listening on http://127.0.0.1:${PORT} with ${ACCOUNTS} accounts`);
});
