// End-to-end check for the debug tabs.
//
// Runs the built bundle in headless Chrome with the Go bindings replaced by
// fakes, then drives the real page: clicks the real buttons, types into the real
// fields, and reads the real DOM. No devtools protocol and no extra packages —
// Chrome is started with --dump-dom and the page writes its findings into an
// element the harness parses afterwards.
//
// This exists because the tab code is almost entirely wiring: a listener on the
// wrong node, a bar that never redraws, a response painted into the wrong tab,
// or fields that do not come back are all invisible to a pure-function test.
//
// Usage:  node tab-harness.mjs [dist-dir] [chrome-path]
// Exit code is 0 only when every check passes.

import { createServer } from 'node:http';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// Defaults are relative to this file so a checkout runs without editing it.
const DIST = process.argv[2] || join(HERE, 'dist');
const CHROME = process.argv[3] || chromePath();
const PORT = 8732;

// Where Chrome lives differs by platform, and a missing binary should say so
// rather than look like a page that failed to boot.
function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || candidates[1];
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    const file = join(DIST, rel || 'index.html');
    if (!file.startsWith(normalize(DIST))) return res.writeHead(403).end('forbidden');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// A page that loads the app the way index.html does, then drives it. It lives
// beside the bundle so the module paths resolve unchanged.
const HARNESS = `<!doctype html>
<html lang="zh" data-theme="light">
<head><meta charset="utf-8"><title>tab harness</title></head>
<body>
<pre id="result">pending</pre>
<script type="module">
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const ok = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail });

// --- fakes ------------------------------------------------------------------
// Everything the app calls on boot, answered the way the Go side would.
// A real profile always carries the BASE_URL environment: saved requests store
// a path, and the host comes from the environment. Without it a saved request
// has no scheme, and the tree cannot tell an HTTP request from a WS message.
const profiles = [{
  name: 'http://127.0.0.1:9001',
  url: 'http://127.0.0.1:9001',
  protocol: '', method: 'GET', headers: {}, headerList: [], variables: [],
  environments: [{ name: 'local', variables: [{ key: 'BASE_URL', value: 'http://127.0.0.1:9001', enabled: true }] }],
  activeEnv: 'local',
  modules: ['用户'],
  requests: [
    { id: 'r1', kind: 'http', name: 'GET /login', title: '登录', description: '', module: '用户',
      url: '/login', method: 'GET', headers: {}, headerList: [], authType: 'none',
      bodyType: 'none', body: '', example: '', formList: [] },
    { id: 'r2', kind: 'http', name: 'POST /orders', title: '下单', description: '', module: '用户',
      url: '/orders', method: 'POST', headers: {}, headerList: [], authType: 'bearer',
      authToken: 'tok-1', bodyType: 'json', body: '{"a":1}', example: '', formList: [] },
  ],
}, {
  // A second project on a WS host. The transport comes from the environment, so
  // this is what puts the window into its WS layout.
  name: 'ws://127.0.0.1:9002',
  url: 'ws://127.0.0.1:9002',
  protocol: '', method: 'GET', headers: {}, headerList: [], variables: [],
  environments: [{ name: 'local', variables: [{ key: 'BASE_URL', value: 'ws://127.0.0.1:9002', enabled: true }] }],
  activeEnv: 'local',
  modules: ['信令'],
  requests: [
    { id: 'w1', kind: 'ws', name: '{"cmd":"ping"}', title: '心跳', description: '', module: '信令',
      url: '', protocol: '', body: '{"cmd":"ping"}', example: '{"ok":true}' },
  ],
}];

window.__calls = [];
window.__wsOpen = false;
window.__activeProfile = '';
// Delivers an event the way the Go side does. The app subscribes through
// window.runtime, so a check can raise a message or status event on demand.
function __emit(name, payload) {
  for (const cb of window.__events[name] || []) {
    try { cb(payload); } catch (_) {}
  }
}
window.__emit = __emit;
window.go = { main: { App: {
  GetProfiles: async () => profiles,
  GetProfileLoadError: async () => '',
  SaveProfile: async () => {}, DeleteProfile: async () => {}, DeleteRequest: async () => {},
  GetStatus: async () => ({ state: window.__wsOpen ? 'open' : 'idle', kind: window.__wsOpen ? 'ws' : 'http', profile: window.__activeProfile || 'http://127.0.0.1:9001' }),
  GetMessages: async () => [], ClearMessages: async () => {},
  GetPaths: async () => ({ base: 'E:/tmp', requests: 'E:/tmp/api-requests', servers: 'E:/tmp/servers' }),
  FormatJSON: async (t) => t, ClearCookies: async () => {},
  // The window follows the profile it was told to select; events carry it back so
  // the app can tell whose frame arrived.
  SelectProfile: async (name) => { window.__activeProfile = String(name || ''); },
  NeedsDataDirectory: async () => false,
  Connect: async (opts) => {
    window.__wsOpen = true;
    window.__connectedTo = opts && opts.url;
    // The Go side keys a session by scheme://host, and the events it emits carry
    // that key back. The fake does the same, so an event raised here is accepted
    // by the window instead of looking like a stranger's.
    try {
      const u = new URL(opts && opts.url);
      window.__activeProfile = u.protocol.replace(':', '') + '://' + u.host;
    } catch (_) {}
    __emit('status', { state: 'open', kind: 'ws', profile: window.__activeProfile, url: opts && opts.url });
  },
  Disconnect: async () => {
    window.__wsOpen = false;
    __emit('status', { state: 'closed', kind: 'ws', profile: window.__activeProfile });
  },
  // A WS send returns as soon as the frame is written; the answer arrives later
  // as an ordinary incoming message. That is the whole reason the reply has to be
  // paired with the send rather than returned by it, so the fake behaves the same
  // way instead of handing one back.
  Send: async (text) => {
    window.__calls.push({ url: window.__connectedTo, ws: text });
    setTimeout(() => {
      __emit('message', {
        id: Date.now(), dir: 'in', time: '12:34:56', text: '{"ok":true,"echo":"' + text + '"}',
        pretty: '{"ok":true,"echo":"' + text + '"}', bytes: 40, profile: window.__activeProfile,
      });
    }, 120);
  },
  ExportCatalog: async () => '', ExportAllCatalogs: async () => '',
  ImportCatalog: async () => '', ImportCatalogFromURL: async () => '', ImportCurl: async () => '',
  ListSessions: async () => [], SearchSessions: async () => [],
  LoadSession: async () => null, LoadSessionMessage: async () => null,
  PickAndLoadSession: async () => null, OpenLogDir: async () => {}, OpenDataDir: async () => {},
  PickDataDirectory: async () => '',
  // Slow enough that a test can switch tabs while a request is still out, which
  // is the case the per-tab in-flight flag exists for.
  RequestHTTP: async (opts) => {
    const n = window.__calls.length + 1;
    window.__calls.push({ url: opts.url, method: opts.method });
    await sleep(350);
    return { method: opts.method || 'GET', url: opts.url || '', statusCode: 200, status: '200 OK',
      reqHeaders: {}, resHeaders: {}, reqBody: '', resBody: '{"call":' + n + '}', timeMs: 350 };
  },
} } };

// Every runtime method is a no-op returning something plausible: the real list
// is long and grows with Wails, and a missing one aborts init().
//
// EventsOn is the exception. The message and status events are how the Go side
// tells the window what happened, so a fake that swallowed them could not
// exercise anything that answers an event: a WS reply arrives that way and
// nothing else, and a harness that never delivers one cannot tell whether it is
// shown or dropped. The callbacks are kept by name so a check can deliver an
// event itself.
window.__events = {};
window.runtime = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'EventsOn' || prop === 'EventsOnMultiple') {
      return (name, cb) => {
        (window.__events[name] = window.__events[name] || []).push(cb);
        return () => {
          window.__events[name] = (window.__events[name] || []).filter((f) => f !== cb);
        };
      };
    }
    if (prop === 'EventsOff') {
      return (name) => { delete window.__events[name]; };
    }
    if (prop === 'OnFileDrop') return () => () => {};
    if (prop === 'ClipboardGetText') return async () => '';
    if (prop === 'ClipboardSetText') return async () => true;
    if (prop === 'ScreenGetAll') return async () => [];
    if (prop === 'Environment') return async () => ({ buildType: 'dev' });
    if (prop === 'WindowGetSize' || prop === 'WindowGetPosition') return async () => ({ w: 0, h: 0, x: 0, y: 0 });
    return () => {};
  },
});

// --- load the real app ------------------------------------------------------
// index.html's body is moved in, so the app boots exactly as it does in the
// window; the bundle is imported from the path index.html names.
let fatal = '';
try {
  const html = await (await fetch('./index.html')).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.body.innerHTML = doc.body.innerHTML;
  // The body is replaced wholesale, so the reporting element goes back in.
  const sink = document.createElement('pre');
  sink.id = 'result';
  sink.textContent = 'pending';
  document.body.appendChild(sink);
  // The window gets its styles from index.html; without them nothing here is
  // laid out the way it is on screen, and a drag has no coordinates to use.
  const css = html.match(/href="([^"]*assets\\/index-[A-Za-z0-9_-]+\\.css)"/);
  if (css) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = css[1].startsWith('/') ? '.' + css[1] : css[1];
    document.head.appendChild(link);
    await new Promise((r) => { link.onload = r; link.onerror = r; });
  }
  const m = html.match(/src="([^"]*assets\\/index-[A-Za-z0-9_-]+\\.js)"/);
  let bundle = m ? m[1] : '';
  if (bundle.startsWith('/')) bundle = '.' + bundle;
  if (bundle) await import(bundle);
  else fatal = 'no bundle script found in index.html';
} catch (e) {
  fatal = 'boot failed: ' + e;
}

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const tabEls = () => $$('#tabList .tab');
const labels = () => tabEls().map((n) => n.querySelector('.tab-label')?.textContent || '');
const activeLabel = () => $('#tabList .tab.on .tab-label')?.textContent || '';
const activeId = () => $('#tabList .tab.on')?.dataset.tabId || '';
const click = (s) => $(s)?.click();
const clickEl = (n) => n?.click();
const type = (s, v) => {
  const n = $(s);
  if (!n) return false;
  n.value = v;
  n.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
};
const tabById = (id) => tabEls().find((n) => n.dataset.tabId === id);

// init() builds the first tab at the very end, so wait for it instead of
// sampling too early.
for (let i = 0; i < 60 && tabEls().length === 0; i++) await sleep(100);

// --- 1. boot ---------------------------------------------------------------
ok('boot: the bar has one tab', tabEls().length === 1, labels());
ok('boot: nothing failed', !fatal && !$('#detail')?.textContent.startsWith('init failed'), fatal || $('#detail')?.textContent?.slice(0, 90));
ok('boot: the one tab is active', tabEls()[0]?.classList.contains('on'), activeId());

const urlBeforeDebug = $('#url')?.value || '';
const titleBeforeDebug = $('#reqTitle')?.value || '';
// Tabs live in the debug pane, which the mode switch opens.
click('#btnModeDebug');
await sleep(300);
ok('boot: the bar is visible in debug mode', Boolean($('#tabBar') && $('#tabBar').offsetParent !== null));

// The address bar, the method and the send button belong to the request pane,
// directly under the tab bar — not to the window bar at the top of the screen.
ok('layout: the address is inside the request pane',
  Boolean($('#url')?.closest('#reqPane')), $('#url')?.parentElement?.className);
ok('layout: the method is in the same row as the address',
  $('#method')?.parentElement === $('#url')?.closest('.req-bar')?.parentElement ||
  Boolean($('#method')?.closest('.req-bar')), $('#method')?.parentElement?.className);
ok('layout: the send button is in that row too',
  Boolean($('#btnSendTop')?.closest('.req-bar')), $('#btnSendTop')?.parentElement?.className);
ok('layout: the address row sits under the tab bar',
  ($('#tabBar')?.getBoundingClientRect().bottom ?? 0) <= ($('#reqBar')?.getBoundingClientRect().top ?? 1),
  { tabBottom: $('#tabBar')?.getBoundingClientRect().bottom, barTop: $('#reqBar')?.getBoundingClientRect().top });

// --- 2. a new tab starts empty, keeping only the host ----------------------
// The app boots with no profile applied, so the fields start empty; type a URL
// into the first tab the way a user would before opening a second one.
type('#url', 'http://127.0.0.1:9001/first');
await sleep(200);
const firstId = activeId();
const firstLabel = activeLabel();
click('#btnTabNew');
await sleep(250);
ok('new tab: the bar grew', tabEls().length === 2, labels());
ok('new tab: it is the active one', activeId() !== firstId && tabEls()[1]?.classList.contains('on'), activeId());
// The host is inherited so the tab can send without retyping it; the path is
// empty, so the label is just the origin.
ok('new tab: it keeps the host', ($('#url')?.value || '') === 'http://127.0.0.1:9001', $('#url')?.value);
ok('new tab: it is labelled by the host', activeLabel() === 'http://127.0.0.1:9001', activeLabel());
ok('new tab: the method is GET', $('#method')?.value === 'GET', $('#method')?.value);
ok('new tab: no saved request is carried over', !$('#reqTitle')?.value, $('#reqTitle')?.value);

type('#url', 'http://127.0.0.1:9001/second');
await sleep(250);
ok('new tab: the label follows the URL', activeLabel().includes('/second'), activeLabel());

// --- 3. switching brings a tab back as it was -----------------------------
clickEl(tabById(firstId));
await sleep(350);
ok('switch: the first tab is active again', activeId() === firstId, activeId());
ok('switch: its label is unchanged', activeLabel() === firstLabel, { now: activeLabel(), was: firstLabel, all: labels() });
ok('switch: its URL is the one it had', ($('#url')?.value || '') === 'http://127.0.0.1:9001/first', $('#url')?.value);

const secondId = tabEls()[1]?.dataset.tabId;
clickEl(tabById(secondId));
await sleep(350);
ok('switch: the second tab keeps its URL', ($('#url')?.value || '').includes('/second'), $('#url')?.value);

// --- 3b. the whole request is per tab, not just the URL -------------------
// The snapshot is the one place that has to know every field; this checks the
// fields a request is actually built from.
const setMethod = (v) => {
  const n = $('#method');
  n.value = v;
  n.dispatchEvent(new Event('change', { bubbles: true }));
};
setMethod('POST');
type('#payload', '{"from":"second"}');
await sleep(200);
// A header row, typed into the empty row the table starts with.
const headerKeys = $$('#headerRows .kv-key');
if (headerKeys.length) {
  headerKeys[0].value = 'X-From';
  headerKeys[0].dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(150);
  const headerVals = $$('#headerRows .kv-val');
  if (headerVals.length) {
    headerVals[0].value = 'second';
    headerVals[0].dispatchEvent(new Event('input', { bubbles: true }));
  }
}
await sleep(250);

clickEl(tabById(firstId));
await sleep(350);
ok('fields: the first tab is still GET', $('#method')?.value === 'GET', $('#method')?.value);
ok('fields: the first tab has its own body', ($('#payload')?.value || '') !== '{"from":"second"}', $('#payload')?.value);
ok('fields: the first tab has no header from the second',
  !$$('#headerRows .kv-key').some((n) => n.value === 'X-From'),
  $$('#headerRows .kv-key').map((n) => n.value));

clickEl(tabById(secondId));
await sleep(350);
ok('fields: the second tab kept POST', $('#method')?.value === 'POST', $('#method')?.value);
ok('fields: the second tab kept its body', ($('#payload')?.value || '') === '{"from":"second"}', $('#payload')?.value);
ok('fields: the second tab kept its header',
  $$('#headerRows .kv-key').some((n) => n.value === 'X-From'),
  $$('#headerRows .kv-key').map((n) => n.value));

// --- 4. a response belongs to the tab that asked for it -------------------
type('#url', 'http://127.0.0.1:9001/third');
await sleep(150);
click('#btnSendTop');
await sleep(120);
ok('send: a dot marks the sending tab', $$('#tabList .tab .tab-dot').length === 1, $$('#tabList .tab .tab-dot').length);
ok('send: the request went out', window.__calls.length === 1, window.__calls);
// The send button belongs to the tab on screen: while this one is out, its own
// button is disabled. Switching to another tab must hand the button back.
ok('send: the sending tab has its own button disabled', $('#btnSendTop')?.hasAttribute('disabled'), $('#btnSendTop')?.outerHTML?.slice(0, 80));

// Switch away while it is still out.
clickEl(tabById(firstId));
await sleep(500);
ok('send: switching away moves the bar', activeId() === firstId, activeId());
ok('send: the sending tab is no longer busy', $$('#tabList .tab .tab-dot').length === 0);
// Switching handed the button back: the tab on screen is not sending, so its
// button is usable even though another tab's request is still in the air.
ok('send: the other tab can still send', !$('#btnSendTop')?.hasAttribute('disabled'), $('#btnSendTop')?.outerHTML?.slice(0, 80));
ok('send: the tab on screen did not take the answer',
  !($('#detail')?.textContent || '').includes('200 OK'), ($('#detail')?.textContent || '').slice(0, 40));

// Back to the tab that asked: its answer must be waiting.
clickEl(tabById(secondId));
await sleep(500);
const detail = $('#detail')?.textContent || '';
ok('send: the answer is in the tab that asked', detail.includes('200 OK'), detail.slice(0, 60));
ok('send: the badge follows it too', ($('#state')?.textContent || '') === '200 OK', $('#state')?.textContent);

// --- 5. closing ------------------------------------------------------------
// A tab that is not on screen can be closed without moving the active one.
const before = labels();
clickEl(tabById(secondId)?.querySelector('.tab-close'));
await sleep(300);
ok('close: closing a neighbour leaves the active tab alone', activeId() === firstId, activeId());
ok('close: the bar lost exactly one tab', tabEls().length === 1, labels());
ok('close: the survivor is the one that was on screen', activeLabel() === before[0], labels());

// The last tab cannot be closed: the window always shows something.
ok('close: the last tab has no close button', !$('#tabList .tab .tab-close') ||
  $('#tabList .tab .tab-close').classList.contains('hidden'), $('#tabList .tab .tab-close')?.className);
click('#tabList .tab .tab-close');
await sleep(250);
ok('close: the last tab survives', tabEls().length === 1, labels());

// --- 6. the tab menu -------------------------------------------------------
click('#btnTabNew');
await sleep(200);
click('#btnTabNew');
await sleep(200);
ok('menu: three tabs to work with', tabEls().length === 3, labels());
const midId = tabEls()[1].dataset.tabId;
tabById(midId).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 120 }));
await sleep(200);
ok('menu: the context menu opened', Boolean($('#tabMenu')), $('#tabMenu')?.id);

// Every command the menu offers has to be there, including the one that closes
// the whole bar — a menu that cannot empty the bar makes the user close tabs
// one at a time.
const acts = $$('#tabMenu [data-act]').map((n) => n.dataset.act);
for (const want of ['close', 'close-others', 'close-right', 'close-all']) {
  ok('menu: it offers "' + want + '"', acts.includes(want), acts);
}
ok('menu: the commands are separated from each other',
  $$('#tabMenu .group-menu-sep').length >= 1, $$('#tabMenu .group-menu-sep').length);
// The rows are built from the same helpers as the catalog menus, so they get
// the panel, the hover and the compact row instead of being raw buttons.
const rowEl = $('#tabMenu [data-act="close"]');
ok('menu: the rows use the menu row, not a bare button',
  rowEl?.tagName === 'DIV' && rowEl.classList.contains('group-menu-item') &&
  !rowEl.classList.contains('disabled'), { tag: rowEl?.tagName, cls: rowEl?.className });
const rowStyle = rowEl ? getComputedStyle(rowEl) : null;
ok('menu: the row has menu padding, not button chrome',
  Boolean(rowStyle) && rowStyle.padding.includes('px') && rowStyle.cursor === 'pointer',
  { padding: rowStyle?.padding, cursor: rowStyle?.cursor });
const titleEl = rowEl?.querySelector('.saved-item-title');
ok('menu: the label is menu-sized, not list-sized',
  titleEl ? getComputedStyle(titleEl).fontWeight === '500' : false,
  { weight: titleEl ? getComputedStyle(titleEl).fontWeight : null });
ok('menu: "关闭全部" is marked destructive',
  $('#tabMenu [data-act="close-all"]')?.classList.contains('danger'),
  $('#tabMenu [data-act="close-all"]')?.className);

$('#tabMenu')?.querySelector('[data-act="close-others"]')?.click();
await sleep(400);
ok('menu: close-others leaves one tab', tabEls().length === 1, labels());
ok('menu: it leaves the tab it was opened on', activeId() === midId, activeId());

// --- 6b. close-all --------------------------------------------------------
click('#btnTabNew');
await sleep(200);
click('#btnTabNew');
await sleep(200);
ok('all: three tabs before closing everything', tabEls().length === 3, labels());
const hostBeforeAll = $('#url')?.value || '';
tabEls()[2].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 120 }));
await sleep(200);
$('#tabMenu')?.querySelector('[data-act="close-all"]')?.click();
await sleep(500);
// The window always shows a tab, so closing everything closes down to one
// fresh one rather than to an empty bar.
ok('all: one tab is left', tabEls().length === 1, labels());
ok('all: the menu closed', !$('#tabMenu'), $('#tabMenu')?.id);
ok('all: the left tab is active', tabEls()[0]?.classList.contains('on'), activeId());
// Closing tabs is not a reason to forget the host: the new tab keeps it, so the
// next request does not need the address retyped.
ok('all: the host survived', ($('#url')?.value || '') === hostBeforeAll || !hostBeforeAll,
  { now: $('#url')?.value, was: hostBeforeAll });
ok('all: nothing is left marked as sending', $$('#tabList .tab .tab-dot').length === 0);

// --- 6c. dismissing the menu ----------------------------------------------
tabEls()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 120 }));
await sleep(200);
ok('dismiss: the menu opened again', Boolean($('#tabMenu')), $('#tabMenu')?.id);
// Escape closes a menu before anything underneath sees the key, the same as the
// catalog menus do.
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
await sleep(200);
ok('dismiss: Escape closes it', !$('#tabMenu'), $('#tabMenu')?.id);
// A press anywhere outside it does too.
tabEls()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 120 }));
await sleep(200);
const outside = $('#reqBuilder') || document.body;
outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
await sleep(200);
ok('dismiss: a press outside closes it', !$('#tabMenu'), $('#tabMenu')?.id);
// Right-clicking the empty part of the bar acts on the tab on screen.
const barRect = $('#tabBar')?.getBoundingClientRect();
$('#tabBar')?.dispatchEvent(new MouseEvent('contextmenu', {
  bubbles: true, cancelable: true, clientX: (barRect?.right ?? 100) - 4, clientY: (barRect?.top ?? 0) + 10,
}));
await sleep(200);
ok('dismiss: the empty part of the bar opens it too', Boolean($('#tabMenu')), $('#tabMenu')?.id);
closeTabMenuForHarness();

function closeTabMenuForHarness() {
  document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
}

// --- 7. picking a catalog request opens a tab of its own ------------------
const tabsBeforePick = tabEls().length;
// Folders start folded, so the requests are not in the DOM until a group head
// is clicked. The real tree behaves the same way.
for (let i = 0; i < 3 && !$$('.catalog-item').length; i++) {
  const group = $$('.catalog-group').find((n) => n.dataset.module === '用户');
  group?.click();
  await sleep(350);
}
const pickable = $$('.catalog-item').filter((n) => n.dataset.id);
ok('catalog: the tree rendered folders', $$('.catalog-group').length > 0, {
  groups: $$('.catalog-group').map(n => n.dataset.module),
  items: pickable.map(n => n.dataset.id),
  listHtml: ($('#catalogList')?.innerHTML || '').slice(0, 400),
});
if (pickable.length >= 2) {
  // The tree is rebuilt after a pick and its folders fold back, so the items
  // have to be looked up again — and the group reopened — before every click.
  const ensureItems = async () => {
    for (let i = 0; i < 4; i++) {
      if ($$('.catalog-item').length >= 2) return;
      $$('.catalog-group').find((n) => n.dataset.module === '用户')?.click();
      await sleep(300);
    }
  };
  const item = (i) => $$('.catalog-item').filter((n) => n.dataset.id)[i];
  await ensureItems();
  clickEl(item(0));
  await sleep(500);
  const afterFirst = tabEls().length;
  const firstUrl = $('#url')?.value || '';
  const firstTabId = activeId();
  // The tab that was on screen keeps what it had; the pick gets a tab of its
  // own. Replacing the current tab would lose the request the user was on.
  await ensureItems();
  clickEl(item(1));
  await sleep(500);
  ok('catalog: each pick opens a tab of its own', tabEls().length > afterFirst, {
    before: tabsBeforePick, afterFirst, after: tabEls().length, labels: labels(),
  });
  ok('catalog: the second pick is the one on screen', activeId() !== firstTabId, {
    first: firstTabId, now: activeId(), url: $('#url')?.value,
  });
  // Going back to the first pick finds it in its own tab, still pointing where
  // it did — not overwritten by the second one.
  clickEl(tabById(firstTabId));
  await sleep(400);
  ok('catalog: the first pick kept its own address', ($('#url')?.value || '') === firstUrl, {
    now: $('#url')?.value, was: firstUrl,
  });
  ok('catalog: the first tab is still its own tab', activeId() === firstTabId, activeId());
  // Picking the same request again is not a new tab: it is already open, so it
  // switches to the tab that holds it.
  const countBeforeRepeat = tabEls().length;
  clickEl(item(0));
  await sleep(500);
  ok('catalog: re-picking an open request does not duplicate it',
    tabEls().length === countBeforeRepeat, { before: countBeforeRepeat, after: tabEls().length });
  ok('catalog: re-picking goes to the tab that holds it', activeId() === firstTabId, {
    expected: firstTabId, now: activeId(),
  });
} else {
  ok('catalog: two requests were available to pick', false, pickable.map(n => n.dataset.id));
}

// --- 8. keyboard -----------------------------------------------------------
const key = (k, opts = {}) => document.dispatchEvent(new KeyboardEvent('keydown', {
  key: k, ctrlKey: true, bubbles: true, cancelable: true, ...opts,
}));
const tabsBeforeKeys = tabEls().length;
key('t');
await sleep(250);
ok('keys: Ctrl+T opens a tab', tabEls().length === tabsBeforeKeys + 1, labels());
key('w');
await sleep(250);
ok('keys: Ctrl+W closes it', tabEls().length === tabsBeforeKeys, labels());

// Ctrl+Tab needs somewhere to go, so make a second tab first.
click('#btnTabNew');
await sleep(250);
const ids = tabEls().map((n) => n.dataset.tabId);
if (ids.length > 1) {
  const beforeCycle = activeId();
  key('Tab');
  await sleep(300);
  ok('keys: Ctrl+Tab moves the selection', activeId() !== beforeCycle, { ids, beforeCycle, after: activeId() });
} else {
  ok('keys: a second tab existed for Ctrl+Tab', false, labels());
}

// --- 8. dragging reorders without selecting ------------------------------
// Two tabs with distinct URLs, so the order is visible in the bar.
click('#btnTabNew');
await sleep(250);
type('#url', 'http://127.0.0.1:9001/drag-a');
await sleep(200);
click('#btnTabNew');
await sleep(250);
type('#url', 'http://127.0.0.1:9001/drag-b');
await sleep(250);
const dragIds = tabEls().map((n) => n.dataset.tabId);
if (dragIds.length >= 2) {
  const src = tabEls()[0];
  const dst = tabEls()[1];
  // The bar can sit below the fold; measure it where it is on screen.
  src.scrollIntoView({ block: 'center' });
  await sleep(150);
  const srcRect = src.getBoundingClientRect();
  const dstRect = dst.getBoundingClientRect();
  const activeBeforeDrag = activeId();
  const firstBefore = dragIds[0];
  const fire = (node, type, x, y) => node.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y, pointerId: 1,
  }));
  fire(src, 'pointerdown', srcRect.left + 10, srcRect.top + 10);
  // Past the 4px threshold, then onto the second tab's slot.
  fire(src, 'pointermove', srcRect.left + 30, srcRect.top + 10);
  fire(src, 'pointermove', dstRect.left + 10, dstRect.top + 10);
  // The bar is rebuilt during the drag, so the pointer is over a node that was
  // replaced. A real browser sends the release to whatever is under it now.
  const under = document.elementFromPoint(dstRect.left + 10, dstRect.top + 10) || document.body;
  fire(under, 'pointerup', dstRect.left + 10, dstRect.top + 10);
  // A browser follows the drag with a click on the tab under the pointer.
  const draggedNow = tabById(firstBefore);
  draggedNow?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(300);
  const idsAfter = tabEls().map((n) => n.dataset.tabId);
  ok('drag: the order changed', idsAfter[1] === firstBefore, { before: dragIds, after: idsAfter });
  ok('drag: every tab is still there', idsAfter.length === dragIds.length &&
    dragIds.every((id) => idsAfter.includes(id)), { before: dragIds, after: idsAfter });
  ok('drag: the drag did not switch tabs', activeId() === activeBeforeDrag, { activeBeforeDrag, after: activeId() });
} else {
  ok('drag: two tabs existed to drag', false, dragIds);
}

// --- 10. the request pane sits above what it produced ----------------------
// Both transports use one layout: catalog on the left, the request being worked
// on across the top, and the message list beside its detail underneath. The
// point is that a tab, its address and its send button are one row no matter
// which kind of request the tab holds, so this checks the WS side against the
// HTTP side rather than checking each separately.
{
  const rows = (sel) => {
    const n = $(sel);
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width) };
  };

  // HTTP first: this is the arrangement the WS side is being matched to.
  click('#btnModeDebug');
  await sleep(400);
  const httpTab = rows('#tabBar');
  const httpBar = rows('#reqBar');
  const httpList = rows('.list-pane');
  const httpDetail = rows('.detail-pane');
  ok('layout: the tab bar is above the request line', httpTab && httpBar && httpBar.top > httpTab.top,
    { tabBar: httpTab, reqBar: httpBar });
  ok('layout: the request line is above the list', httpBar && httpList && httpList.top > httpBar.top,
    { reqBar: httpBar, list: httpList });
  ok('layout: the list sits beside the detail, not above it',
    httpList && httpDetail && Math.abs(httpList.top - httpDetail.top) <= 2,
    { list: httpList, detail: httpDetail });
  ok('layout: the request line starts where the list starts',
    httpBar && httpList && Math.abs(httpBar.left - httpList.left) <= 2,
    { reqBar: httpBar, list: httpList });

  // Now the WS project: same three blocks, same places.
  const project = $('#project');
  const wsOption = [...(project?.options || [])].find((o) => (o.value || '').includes('9002'));
  ok('layout: there is a WS project to switch to', Boolean(wsOption), [...(project?.options || [])].map((o) => o.value));
  if (wsOption) {
    project.value = wsOption.value;
    project.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(900);
    ok('layout: the window is in its WS transport', Boolean($('#app')?.classList.contains('http')) === false,
      $('#app')?.className);
    ok('layout: the request pane is shown for WS too',
      Boolean($('#reqPane') && !$('#reqPane').classList.contains('hidden')),
      $('#reqPane')?.className);
    ok('layout: the old bottom composer is not used',
      Boolean($('.composer')?.classList.contains('hidden')), $('.composer')?.className);

    const wsTab = rows('#tabBar');
    const wsBar = rows('#reqBar');
    const wsList = rows('.list-pane');
    const wsDetail = rows('.detail-pane');
    ok('layout: WS has the tab bar above the request line', wsTab && wsBar && wsBar.top > wsTab.top,
      { tabBar: wsTab, reqBar: wsBar });
    ok('layout: WS has the request line above the list', wsBar && wsList && wsList.top > wsBar.top,
      { reqBar: wsBar, list: wsList });
    ok('layout: WS puts the list beside the detail',
      wsList && wsDetail && Math.abs(wsList.top - wsDetail.top) <= 2,
      { list: wsList, detail: wsDetail });
    ok('layout: WS lines up with the HTTP columns',
      wsBar && httpBar && Math.abs(wsBar.left - httpBar.left) <= 2,
      { http: httpBar, ws: wsBar });

    // What a WS request line carries: where it goes, its subprotocol, whether it
    // reconnects, the connect button and the connection state. It has no method
    // and no one-shot send button, because a WS send is not a request/response.
    ok('ws: the address is in the request line', Boolean($('#url')?.closest('#reqBar')),
      $('#url')?.parentElement?.className);
    ok('ws: the subprotocol is in the request line', Boolean($('#protocol')?.closest('#reqBar')),
      $('#protocol')?.parentElement?.className);
    ok('ws: the reconnect switch is in the request line', Boolean($('#reconnectWrap')?.closest('#reqBar')),
      $('#reconnectWrap')?.parentElement?.className);
    ok('ws: the connect button is in the request line', Boolean($('#btnToggle')?.closest('#reqBar')),
      $('#btnToggle')?.parentElement?.className);
    ok('ws: the connection state is in the request line', Boolean($('#state')?.closest('#reqBar')),
      $('#state')?.parentElement?.className);
    ok('ws: there is no method selector', !$('#method') || $('#method').closest('#reqBar') === null,
      $('#method')?.parentElement?.className);

    // The body and the recorded reply are tabs of the request config, the same
    // two places HTTP keeps its body and its example.
    ok('ws: the frame editor is in the body tab', Boolean($('#payload')?.closest('#tabBody')),
      $('#payload')?.parentElement?.className);
    ok('ws: the recorded reply is in the example tab', Boolean($('#payloadIn')?.closest('#tabExample')),
      $('#payloadIn')?.parentElement?.className);
    ok('ws: the send tab is offered', (() => {
      const btn = [...$$('#reqTabs .req-tab')].find((b) => b.dataset.tab === 'body');
      return Boolean(btn && !btn.classList.contains('hidden') && btn.textContent.includes('发送'));
    })(), [...$$('#reqTabs .req-tab')].map((b) => b.dataset.tab + ':' + b.textContent + ':' + b.classList.contains('hidden')));
    ok('ws: the HTTP-only tabs are put away', ['params', 'headers', 'auth'].every((t) => {
      const btn = [...$$('#reqTabs .req-tab')].find((b) => b.dataset.tab === t);
      return !btn || btn.classList.contains('hidden');
    }), [...$$('#reqTabs .req-tab')].map((b) => b.dataset.tab + ':' + b.classList.contains('hidden')));
    ok('ws: saving and resending are offered, cookie and cURL are not',
      Boolean($('#btnSaveWS') && !$('#btnSaveWS').classList.contains('hidden')) &&
      Boolean($('#btnClearCookies')?.classList.contains('hidden')) &&
      Boolean($('#btnCurl')?.classList.contains('hidden')),
      { save: $('#btnSaveWS')?.className, cookies: $('#btnClearCookies')?.className, curl: $('#btnCurl')?.className });

    // Switching back must restore the HTTP arrangement, not leave WS controls in
    // the HTTP line: the row is shared, so a leftover would show the wrong thing.
    const httpOption = [...(project?.options || [])].find((o) => (o.value || '').includes('9001'));
    if (httpOption) {
      project.value = httpOption.value;
      project.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(900);
      ok('layout: switching back restores the HTTP request line',
        Boolean($('#method')?.closest('#reqBar')) && Boolean($('#btnSendTop')?.closest('#reqBar')),
        { method: $('#method')?.parentElement?.className, send: $('#btnSendTop')?.parentElement?.className });
      // A tab belongs to the project it was opened for. Coming back to HTTP with
      // the WS project's tabs still in the bar would offer tabs that name messages
      // the HTTP project does not have.
      ok('layout: switching project starts the bar over', tabEls().length === 1,
        { tabs: tabEls().length, labels: labels() });
            ok('layout: the WS-only controls leave the request line',
        !$('#protocol')?.closest('#reqBar') && !$('#btnToggle')?.closest('#reqBar'),
        { protocol: $('#protocol')?.parentElement?.className, toggle: $('#btnToggle')?.parentElement?.className });
      ok('layout: the HTTP tabs come back', ['params', 'headers', 'auth'].every((t) => {
        const btn = [...$$('#reqTabs .req-tab')].find((b) => b.dataset.tab === t);
        return btn && !btn.classList.contains('hidden');
      }), [...$$('#reqTabs .req-tab')].map((b) => b.dataset.tab + ':' + b.classList.contains('hidden')));
    }
  }
}

// --- 9. a tab bar for WS too, and the answer under the request -------------
// WS used to hide the whole request pane and keep its frame and reply in the
// bottom composer, which left the window bar as the only place to name what was
// being worked on. The bar has to be there for WS the same way it is for HTTP:
// one tab per message, above the request it belongs to.
{
  const project = $('#project');
  const wsOption = [...(project?.options || [])].find((o) => (o.value || '').includes('9002'));
  if (wsOption) {
    project.value = wsOption.value;
    project.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(900);

    ok('ws: the tab bar is visible', Boolean($('#tabBar') && $('#tabBar').offsetParent !== null),
      $('#tabBar')?.className);
    ok('ws: the tab bar has a tab to work in', tabEls().length >= 1, labels());
    ok('ws: the send button is in the request line', Boolean($('#btnSend')?.closest('#reqBar')),
      $('#btnSend')?.parentElement?.className);
    ok('ws: the send button is usable', Boolean($('#btnSend') && $('#btnSend').offsetParent !== null),
      $('#btnSend')?.className);

    // A frame goes out from the tab that holds it. The tab already named 心跳
    // holds {"cmd":"ping"}; editing it here would change what that message is,
    // so the send is done from a fresh tab instead.
    const items = () => $$('.catalog-item').filter((n) => n.dataset.id);
    for (let i = 0; i < 4 && items().length < 1; i++) {
      $$('.catalog-group').find((n) => n.dataset.module === '信令')?.click();
      await sleep(300);
    }
    ok('ws: the catalog lists the message', items().length >= 1, items().map((n) => n.dataset.id));

    const before = tabEls().length;
    const firstLabel = labels()[0];
    click('#btnTabNew');
    await sleep(400);
    ok('ws: a new tab starts empty',
      tabEls().length === before + 1 && ($('#payload')?.value || '') === '',
      { before, after: tabEls().length, payload: $('#payload')?.value });
    ok('ws: the tab that held a frame still holds it', labels().includes(firstLabel),
      { labels: labels(), firstLabel });

    type('#payload', '{"cmd":"hello"}');
    await sleep(200);
    const callsBefore = window.__calls.length;
    click('#btnSend');
    await sleep(700);
    ok('ws: sending went out', window.__calls.length >= callsBefore,
      { before: callsBefore, after: window.__calls.length });

    // The reply arrives as an event, not as the return value of the send, so the
    // detail pane is the only place it can show up. It has to be there without
    // clicking anything: the whole point of pairing the send with the frame that
    // came back is that the answer is on screen when it lands.
    const detailText = () => ($('#detail')?.textContent || '');
    ok('ws: the reply lands in the detail pane', detailText().includes('ok'),
      { detail: detailText().slice(0, 120), cls: $('#detail')?.className });
    ok('ws: the pane shows what was sent', detailText().includes('cmd'),
      detailText().slice(0, 120));
    ok('ws: it no longer says it is waiting', !detailText().includes('等待返回'),
      detailText().slice(0, 120));
    ok('ws: the badge reports the frame came back',
      !['发送中', '等返回', '待发送'].includes($('#state')?.textContent || ''),
      $('#state')?.textContent);
    ok('ws: the detail pane is titled for the reply', ($('#detailTitle')?.textContent || '') === '返回',
      $('#detailTitle')?.textContent);
    ok('ws: the reply can be copied', Boolean($('#btnCopyDetail') && !$('#btnCopyDetail').classList.contains('hidden')),
      $('#btnCopyDetail')?.className);
    // 写入示例 targets the request being edited, and this tab holds a frame that
    // was never saved — so there is nothing to write it to and the button is not
    // offered. It is not a missing feature, it is the same rule the HTTP side
    // follows.
    ok('ws: nothing to write the example to on an unsaved tab',
      Boolean($('#btnSaveExample')?.classList.contains('hidden')), $('#btnSaveExample')?.className);

    // The pair belongs to the tab that sent it. A tab opened afterwards must not
    // inherit it, and going back must show it again.
    const senderId = activeId();
    const withPair = labels();
    click('#btnTabNew');
    await sleep(400);
    ok('ws: a new tab starts with no reply of its own',
      !($('#detail')?.textContent || '').includes('"ok":true'), ($('#detail')?.textContent || '').slice(0, 80));
    ok('ws: the tab that sent it is still in the bar', tabEls().length === withPair.length + 1,
      { was: withPair, now: labels() });
    tabEls().find((n) => n.dataset.tabId === senderId)?.click();
    await sleep(500);
    ok('ws: going back shows that tab’s reply again',
      ($('#detail')?.textContent || '').includes('"ok":true'),
      { id: senderId, active: activeId(), detail: ($('#detail')?.textContent || '').slice(0, 80) });

    // A reply that comes back while another tab is on screen belongs to the tab
    // that sent the frame, not to the one the user is looking at. This is the
    // case a single-tab check cannot see: it needs a send and a tab switch in the
    // window between the frame going out and the answer arriving.
    click('#btnTabNew');
    await sleep(400);
    type('#payload', '{"cmd":"slow"}');
    await sleep(200);
    const slowId = activeId();
    click('#btnSend');
    // Move away before the fake answers, which it does after 120 ms.
    await sleep(30);
    click('#btnTabNew');
    await sleep(700);
    ok('ws: the tab on screen did not take another tab’s reply',
      activeId() !== slowId && !($('#detail')?.textContent || '').includes('slow'),
      { slowId, active: activeId(), detail: ($('#detail')?.textContent || '').slice(0, 100) });
    tabEls().find((n) => n.dataset.tabId === slowId)?.click();
    await sleep(600);
    ok('ws: the reply went to the tab that sent the frame',
      ($('#detail')?.textContent || '').includes('slow'),
      { slowId, active: activeId(), detail: ($('#detail')?.textContent || '').slice(0, 120) });

    // A saved message does have somewhere to put the reply, so the button shows
    // there. 心跳 is the saved one; sending its own frame again changes nothing
    // about it, which keeps this check from editing a fixture by accident.
    tabEls()[0]?.click();
    await sleep(500);
    ok('ws: the saved message is the one on screen', ($('#payload')?.value || '').includes('ping'),
      $('#payload')?.value);
    click('#btnSend');
    await sleep(700);
    ok('ws: a saved message offers 写入示例 for its reply',
      Boolean($('#btnSaveExample') && !$('#btnSaveExample').classList.contains('hidden')),
      { cls: $('#btnSaveExample')?.className, title: $('#reqTitle')?.value });
    if (!$('#btnSaveExample')?.classList.contains('hidden')) {
      const exBefore = $('#payloadIn')?.value || '';
      click('#btnSaveExample');
      await sleep(500);
      ok('ws: 写入示例 fills the 返回 tab, not the request body',
        ($('#payload')?.value || '') !== ($('#payloadIn')?.value || '') &&
        ($('#payloadIn')?.value || '') !== exBefore,
        { body: $('#payload')?.value, example: $('#payloadIn')?.value, was: exBefore });
    }

    // Picking the saved message must go to the tab that holds it rather than
    // opening a second one for the same frame. It is checked from a different
    // tab, because picking the one already on screen proves nothing.
    click('#btnTabNew');
    await sleep(400);
    const openBefore = tabEls().length;
    const heldBefore = $('#payload')?.value || '';
    clickEl(items()[0]);
    await sleep(600);
    ok('ws: picking an open message goes to its tab instead of duplicating it',
      tabEls().length === openBefore, { before: openBefore, after: tabEls().length, labels: labels() });
    ok('ws: the tab it went to holds that message, not the one just typed',
      ($('#payload')?.value || '') !== heldBefore && ($('#payload')?.value || '').includes('ping'),
      { held: heldBefore, now: $('#payload')?.value, labels: labels() });

  } else {
    ok('ws: there is a WS project', false, [...(project?.options || [])].map((o) => o.value));
  }

  // Back to HTTP: the arrangement the WS side was matched against.
  const httpOption = [...(project?.options || [])].find((o) => (o.value || '').includes('9001'));
  if (httpOption) {
    project.value = httpOption.value;
    project.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(900);
    ok('back: the HTTP request line is intact',
      Boolean($('#method')?.closest('#reqBar')) && Boolean($('#btnSendTop')?.closest('#reqBar')),
      { method: $('#method')?.parentElement?.className, send: $('#btnSendTop')?.parentElement?.className });
    ok('back: the tab bar is still there', Boolean($('#tabBar') && $('#tabBar').offsetParent !== null),
      $('#tabBar')?.className);
  }
}

// --- report ----------------------------------------------------------------
document.getElementById('result').textContent = 'RESULT:' + JSON.stringify({ fatal, checks });
</script>
</body></html>
`;

const harnessPath = join(DIST, '__harness.html');
await writeFile(harnessPath, HARNESS, 'utf8');

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--no-first-run',
  // Long enough for the bundle to import, boot, and run every timed step.
  '--virtual-time-budget=30000',
  '--dump-dom',
  `http://127.0.0.1:${PORT}/__harness.html`,
], { stdio: ['ignore', 'pipe', 'ignore'] });

let dom = '';
chrome.stdout.on('data', (d) => { dom += d.toString(); });
await new Promise((r) => chrome.on('exit', r));

server.close();
await unlink(harnessPath).catch(() => {});

const m = dom.match(/RESULT:(\{[\s\S]*?\})<\/pre>/);
if (!m) {
  console.log('harness did not report. dom length=' + dom.length);
  console.log(dom.slice(0, 800));
  process.exit(1);
}

const { fatal, checks } = JSON.parse(m[1]);
let failed = 0;
for (const c of checks) {
  if (!c.pass) failed += 1;
  const mark = c.pass ? 'ok  ' : 'FAIL';
  const detail = c.pass ? '' : '  <- ' + JSON.stringify(c.detail);
  console.log(`${mark} ${c.name}${detail}`);
}
if (fatal) console.log('fatal: ' + fatal);
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
