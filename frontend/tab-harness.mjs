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
}];

window.__calls = [];
window.go = { main: { App: {
  GetProfiles: async () => profiles,
  GetProfileLoadError: async () => '',
  SaveProfile: async () => {}, DeleteProfile: async () => {}, DeleteRequest: async () => {},
  GetStatus: async () => ({ state: 'idle', kind: 'http', profile: 'http://127.0.0.1:9001' }),
  GetMessages: async () => [], ClearMessages: async () => {},
  GetPaths: async () => ({ base: 'E:/tmp', requests: 'E:/tmp/api-requests', servers: 'E:/tmp/servers' }),
  FormatJSON: async (t) => t, SelectProfile: async () => {}, ClearCookies: async () => {},
  NeedsDataDirectory: async () => false, Connect: async () => {}, Disconnect: async () => {},
  Send: async () => {},
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
window.runtime = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'EventsOn' || prop === 'EventsOnMultiple' || prop === 'OnFileDrop') return () => () => {};
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

// --- 9. the request row goes away and comes back with the mode -------------
// Doc mode has no request pane, so the address bar has to return to the window
// bar, and the state badge has to stay visible there instead of being carried
// along inside the row that just got hidden.
const stateBeforeDoc = ($('#state')?.textContent || '');
click('#btnModeDoc');
await sleep(300);
ok('doc: the address bar went back to the window bar',
  Boolean($('#url')?.closest('.bar')), $('#url')?.parentElement?.className);
ok('doc: the request row is hidden', Boolean($('#reqBar')?.classList.contains('hidden')), $('#reqBar')?.className);
ok('doc: it is not visible either', !$('#reqBar') || $('#reqBar').offsetParent === null, $('#reqBar')?.className);
// A badge inside a hidden row would vanish from doc mode; this is the check
// that catches the badge being left behind when the row is put away.
// Doc mode hides the connection badge on purpose (no live connection to show),
// so this checks structure only: the badge is back where the doc styles expect
// it, not stranded inside the row that was just hidden. Leaving it there is the
// bug — it would never come back on the next debug switch.
ok('doc: the state badge is in the window bar', Boolean($('#state')?.closest('.bar')), $('#state')?.parentElement?.className);
ok('doc: the badge is hidden there by design', $('#state')?.offsetParent === null || getComputedStyle($('#state')).display === 'none',
  $('#state') ? getComputedStyle($('#state')).display : 'missing');
ok('doc: the badge still says what it said', ($('#state')?.textContent || '') === stateBeforeDoc,
  { now: $('#state')?.textContent, was: stateBeforeDoc });

click('#btnModeDebug');
await sleep(400);
ok('debug: the address bar is back in the request row',
  Boolean($('#url')?.closest('.req-bar')), $('#url')?.parentElement?.className);
ok('debug: the request row is visible again', Boolean($('#reqBar') && $('#reqBar').offsetParent !== null), $('#reqBar')?.className);
ok('debug: the state badge came back with it', Boolean($('#state')?.closest('.req-bar')), $('#state')?.parentElement?.className);
ok('debug: the tab survived the round trip', tabEls().length > 0, labels());

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
