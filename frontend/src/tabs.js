// Debug tabs.
//
// A debug tab is one request being worked on: the URL, method, headers, auth,
// body, the folder and title it belongs to, and the response it last got. The
// window shows one at a time; the rest are kept as plain objects.
//
// The state is split in two on purpose. Everything that is pure — the tab list,
// which one is active, the labels, the order — lives here and is unit tested.
// Reading and writing the DOM is the caller's job, because that is where the
// single set of fields lives and it cannot be faked without a browser.

/** A tab holds one request's editable state and its last response. */
export function newTab({ id, title = '', module = '', savedId = '', method = 'GET', url = '' } = {}) {
  return {
    id: String(id || ''),
    savedId: String(savedId || ''),
    title: String(title || ''),
    module: String(module || ''),
    method: String(method || 'GET').toUpperCase(),
    url: String(url || ''),
    // The rest is filled by the DOM snapshot; keeping the keys here means a tab
    // made in one place and restored in another always has the same shape.
    fields: null,
    // The response this tab received. Each tab keeps its own, so switching back
    // shows the answer that tab got rather than whatever came last.
    exchange: null,
    badge: { kind: 'pending', text: '待发送' },
    // True while this tab has a request in flight. Sending is per tab, not
    // global: one slow request must not lock the others.
    inFlight: false,
  };
}

/** What the tab bar shows for a tab: its name, or where it points if unnamed. */
export function tabLabel(tab) {
  const title = String(tab?.title || '').trim();
  if (title) return title;
  const url = String(tab?.url || '').trim();
  if (!url) return '未命名';
  // GET is the default, so naming it would be noise on every tab; anything else
  // is worth the space because it changes what the tab does.
  const method = String(tab?.method || '').trim().toUpperCase();
  return method && method !== 'GET' ? `${method} ${url}` : url;
}

/**
 * Adds a tab and makes it active. The id is supplied by the caller so tests do
 * not depend on a clock or a counter.
 */
export function addTab(tabs, tab) {
  return { tabs: [...tabs, tab], activeId: tab.id };
}

/**
 * Removes a tab. Closing the active one moves to its right neighbour, or its
 * left if it was last — the same rule browsers use, so the eye stays where it
 * was. The last tab cannot be closed: the window always shows something.
 *
 * The active id is returned even when the tab removed was not the active one,
 * so a caller that closes a background tab keeps looking at what it was.
 */
export function closeTab(tabs, id) {
  if (tabs.length <= 1) return { tabs, activeId: tabs[0]?.id || '' };
  const index = tabs.findIndex((t) => t.id === id);
  if (index < 0) return { tabs, activeId: tabs[0]?.id || '' };
  const next = tabs.filter((t) => t.id !== id);
  return { tabs: next, activeId: next[Math.min(index, next.length - 1)].id };
}

/** The tab with this id, or undefined. */
export function findTab(tabs, id) {
  return tabs.find((t) => t.id === id);
}

/** The tab already showing this saved request, if one is open. */
export function tabForSavedId(tabs, savedId) {
  const id = String(savedId || '');
  if (!id) return undefined;
  return tabs.find((t) => String(t.savedId || '') === id);
}

/**
 * Where a request picked from the tree should open.
 *
 * Picking is not browsing: the tab bar holds the requests the user is working
 * on at once. Picking a different request must therefore not replace the one on
 * screen — each one gets its own tab. The single exception is a request that is
 * already open: that one is not opened twice, the bar just goes to it.
 */
export function tabForPick(tabs, { savedId = '' } = {}) {
  const open = tabForSavedId(tabs, savedId);
  if (open) return { tab: open, reason: 'open' };
  return { tab: undefined, reason: 'new' };
}

/**
 * Moves a tab to a new index, clamped to the list. Dragging a tab past either
 * end drops it at that end rather than failing.
 */
export function moveTab(tabs, id, index) {
  const from = tabs.findIndex((t) => t.id === id);
  if (from < 0) return tabs;
  const to = Math.max(0, Math.min(tabs.length - 1, index));
  if (from === to) return tabs;
  const next = [...tabs];
  const [tab] = next.splice(from, 1);
  next.splice(to, 0, tab);
  return next;
}

/** True when more than one tab has a request in flight. */
export function anyInFlight(tabs) {
  return tabs.some((t) => t.inFlight);
}

/** A fresh tab id, unique within the list it will join. */
export function nextTabId(tabs, seed = 1) {
  let n = seed;
  const used = new Set(tabs.map((t) => t.id));
  while (used.has(`tab-${n}`)) n += 1;
  return `tab-${n}`;
}
