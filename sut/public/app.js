// Client application.
// The rendering pipeline is deliberately split into stages so that a test which
// reads the DOM too early observes a plausible but wrong state:
//   fetch -> deferred paint (renderDelay) -> two animation frames -> hydration
// Listeners are attached only at hydration. Before that, controls are present and
// visually enabled but do nothing. This is the hydration hazard described in the
// Playwright documentation and the reason state-based waiting is required.
const state = {
  orders: [],
  filter: 'all',
  hydrated: false,
  renderDelay: 0,
};

const $ = (sel) => document.querySelector(sel);

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  if (res.status === 401) {
    window.location = '/login.html';
    throw new Error('unauthenticated');
  }
  if (!res.ok) throw new Error(`api ${path} failed with ${res.status}`);
  return res.status === 204 ? null : res.json();
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function total(orders) {
  return orders.reduce((sum, o) => sum + Number(o.amount), 0);
}

function paint(orders) {
  const body = $('#orders-body');
  body.innerHTML = orders.length
    ? orders
        .map(
          (o) => `<tr data-order-id="${o.id}">
            <td class="item">${o.item}</td>
            <td class="status">${o.status}</td>
            <td class="num amount">${o.amount}</td>
            <td><button class="del" data-id="${o.id}">Remove</button></td>
          </tr>`
        )
        .join('')
    : '<tr class="empty"><td colspan="4">No orders</td></tr>';
  body.dataset.state = 'ready';
  body.dataset.count = String(orders.length);
  $('#orders-total').textContent = String(total(orders));
  $('#orders-total').dataset.state = 'ready';
}

// Load and paint. Nothing here is awaited by the DOM; observers must wait on state.
async function loadOrders() {
  const body = $('#orders-body');
  body.dataset.state = 'loading';
  $('#orders-total').dataset.state = 'loading';
  const query = state.filter === 'open' ? '?status=open' : '';
  const { orders } = await api(`/api/orders${query}`);
  state.orders = orders;
  // Deferred render: the response has arrived but the paint is scheduled.
  await wait(state.renderDelay);
  paint(orders);
}

function attachListeners() {
  $('#add-order').addEventListener('click', async () => {
    const input = $('#new-item');
    const item = input.value.trim();
    if (!item) return;
    await api('/api/orders', { method: 'POST', body: JSON.stringify({ item, amount: 7 }) });
    input.value = '';
    await loadOrders();
  });

  $('#orders-body').addEventListener('click', async (event) => {
    const btn = event.target.closest('button.del');
    if (!btn) return;
    await api(`/api/orders/${btn.dataset.id}`, { method: 'DELETE' });
    await loadOrders();
  });

  $('#save-settings').addEventListener('click', async () => {
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ theme: $('#theme').value, notifications: $('#notifications').value }),
    });
    $('#settings-status').textContent = 'saved';
    $('#settings-status').dataset.state = 'saved';
  });

  $('#filter-open').addEventListener('click', async () => {
    state.filter = 'open';
    $('#filter-open').classList.add('active');
    $('#filter-all').classList.remove('active');
    await loadOrders();
  });

  $('#filter-all').addEventListener('click', async () => {
    state.filter = 'all';
    $('#filter-all').classList.add('active');
    $('#filter-open').classList.remove('active');
    await loadOrders();
  });

  $('#signout').addEventListener('click', async (event) => {
    event.preventDefault();
    await api('/api/logout', { method: 'POST' });
    window.location = '/login.html';
  });

  state.hydrated = true;
  document.documentElement.dataset.hydrated = 'true';
}

async function boot() {
  const me = await api('/api/me');
  state.renderDelay = me.renderDelay;
  $('#whoami').textContent = me.username;
  $('#whoami').dataset.state = 'ready';
  const { settings } = await api('/api/settings');
  $('#theme').value = settings.theme;
  $('#notifications').value = settings.notifications;
  await loadOrders();
  // Instrumented demo knob: ?hydrateDelay=<ms> widens the window between paint and
  // interactivity so that the window can be photographed and measured. It changes
  // nothing about the application's behaviour, only how long the window lasts.
  const extra = Number(new URLSearchParams(window.location.search).get('hydrateDelay') || 0);
  if (extra > 0) await wait(extra);
  // Two animation frames: the paint is committed, but interactivity is not yet wired.
  await nextFrame();
  await nextFrame();
  attachListeners();
}

boot().catch((err) => {
  document.documentElement.dataset.error = String(err && err.message);
  console.error(err);
});
