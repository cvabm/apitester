export const HOST_VAR_KEY = 'BASE_URL';

const LEGACY_HOST_VAR_KEYS = new Set(['base_url', 'baseurl', 'host', 'url']);

export function emptyRow() {
  return { key: '', value: '', enabled: true };
}

export function isHostVarKey(key) {
  return LEGACY_HOST_VAR_KEYS.has(String(key || '').trim().toLowerCase());
}

export function ensureHostVarRows(rows, fallbackURL = '') {
  const list = cloneRows(rows);
  const found = list.find((r) => isHostVarKey(r.key));
  const others = list.filter((r) => !isHostVarKey(r.key));
  const host = {
    key: HOST_VAR_KEY,
    value: found ? found.value : String(fallbackURL || '').trim(),
    enabled: true,
  };
  const out = [host, ...others];
  if (!out.length || String(out[out.length - 1].key || '').trim()) out.push(emptyRow());
  return out;
}

export function cloneRows(rows) {
  return (rows || []).map((r) => {
    const out = {
      key: r.key || '',
      value: r.value || '',
      enabled: r.enabled !== false,
    };
    if (typeof r.raw === 'string' && r.raw !== '') out.raw = r.raw;
    return out;
  });
}

function forgetQueryRaw(row) {
  if (row && 'raw' in row) delete row.raw;
}

export function rowsFromMap(map) {
  const rows = Object.entries(map || {}).map(([key, value]) => ({
    key,
    value: String(value ?? ''),
    enabled: true,
  }));
  if (!rows.length) rows.push(emptyRow());
  return rows;
}

export function enabledMap(rows) {
  const out = {};
  for (const r of rows || []) {
    if (!r.enabled || !String(r.key || '').trim()) continue;
    out[r.key] = r.value ?? '';
  }
  return out;
}

function queryStringOf(url) {
  const text = String(url || '');
  const q = text.indexOf('?');
  if (q < 0) return '';
  const hash = text.indexOf('#', q);
  return hash < 0 ? text.slice(q + 1) : text.slice(q + 1, hash);
}

function splitURLBaseAndHash(url) {
  const text = String(url || '');
  const hashIdx = text.indexOf('#');
  const hash = hashIdx >= 0 ? text.slice(hashIdx) : '';
  const noHash = hashIdx >= 0 ? text.slice(0, hashIdx) : text;
  const qIdx = noHash.indexOf('?');
  return {
    base: qIdx >= 0 ? noHash.slice(0, qIdx) : noHash,
    hash,
  };
}

function decodeQueryPart(part) {
  try {
    return decodeURIComponent(String(part || '').replace(/\+/g, ' '));
  } catch {
    return String(part || '');
  }
}

export function parseQuery(url) {
  const qs = queryStringOf(url);
  if (!qs) return [emptyRow()];
  const rows = [];
  for (const raw of qs.split('&')) {
    if (raw === '') continue;
    const eq = raw.indexOf('=');
    const keyPart = eq < 0 ? raw : raw.slice(0, eq);
    const valuePart = eq < 0 ? null : raw.slice(eq + 1);
    rows.push({
      key: decodeQueryPart(keyPart),
      value: valuePart == null ? '' : decodeQueryPart(valuePart),
      enabled: true,
      raw,
    });
  }
  if (!rows.length) rows.push(emptyRow());
  return rows;
}

export function applyQuery(url, rows) {
  const text = String(url || '').trim();
  if (!text) return url;
  const { base, hash } = splitURLBaseAndHash(text);
  const parts = [];
  for (const r of rows || []) {
    if (!r.enabled || !String(r.key || '').trim()) continue;
    if (typeof r.raw === 'string' && r.raw !== '') {
      parts.push(r.raw);
      continue;
    }
    parts.push(`${encodeURIComponent(r.key)}=${encodeURIComponent(r.value ?? '')}`);
  }
  return `${base}${parts.length ? `?${parts.join('&')}` : ''}${hash}`;
}

function absoluteURL(raw) {
  const text = String(raw || '').trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return null;
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

// Saved API definitions are environment-independent paths. Older absolute
// URLs are reduced relative to the BASE_URL that originally owned them.
export function requestDefinitionURL(requestURL, environmentURL = '') {
  let raw = String(requestURL || '').trim();
  if (!raw) return '/';
  raw = raw.replace(/^\{\{\s*BASE_URL\s*\}\}/i, '') || '/';
  const request = absoluteURL(raw);
  if (!request) {
    if (raw.startsWith('/') || raw.startsWith('?') || raw.startsWith('#')) return raw;
    return `/${raw.replace(/^\/+/, '')}`;
  }
  const environment = absoluteURL(environmentURL);
  let path = request.pathname || '/';
  if (environment && request.origin === environment.origin) {
    const base = String(environment.pathname || '').replace(/\/+$/, '');
    if (base && base !== '/' && (path === base || path.startsWith(`${base}/`))) {
      path = path.slice(base.length) || '/';
    }
  }
  return `${path.startsWith('/') ? path : `/${path}`}${request.search}${request.hash}`;
}

export function requestURLForEnvironment(definitionURL, environmentURL) {
  const environment = absoluteURL(environmentURL);
  if (!environment) return String(definitionURL || '').trim();
  const definition = requestDefinitionURL(definitionURL);
  // `//host/path` names its own host: keep the environment scheme, replace the authority.
  if (definition.startsWith('//')) {
    try {
      return new URL(definition, environment).toString();
    } catch {
      return `${environment.protocol}${definition}`;
    }
  }
  const match = definition.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  const path = match?.[1] || '/';
  const base = String(environment.pathname || '').replace(/\/+$/, '');
  environment.pathname = `${base === '/' ? '' : base}${path.startsWith('/') ? path : `/${path}`}` || '/';
  environment.search = match?.[2] || '';
  environment.hash = match?.[3] || '';
  return environment.toString();
}

// A root-relative request ("/login", "?page=2", "#row") names no host of its
// own: it runs against whichever environment is active. Anything absolute, and
// anything that is neither a path nor a query, is left alone.
export function isRootRelativeRequest(raw) {
  const text = String(raw || '').trim();
  return Boolean(text) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && /^(\/(?!\/)|[?#])/.test(text);
}

// The URL a request will actually reach, which is the one whose host the
// window should be watching. For a root-relative path that is the resolved form
// against the active environment; for everything else it is the URL itself.
// An empty environment leaves the path unresolved rather than inventing a host.
export function activationURL(requestURL, environmentURL) {
  const raw = String(requestURL || '').trim();
  if (!raw || !isRootRelativeRequest(raw)) return raw;
  const environment = String(environmentURL || '').trim();
  return environment ? requestURLForEnvironment(raw, environment) : raw;
}

export function formEncode(rows) {
  const p = new URLSearchParams();
  for (const r of rows || []) {
    if (!r.enabled || !String(r.key || '').trim()) continue;
    p.append(r.key, r.value ?? '');
  }
  return p.toString();
}

export function parseForm(body) {
  const rows = [];
  const raw = String(body || '').trim();
  if (raw) {
    const p = new URLSearchParams(raw);
    for (const [key, value] of p) rows.push({ key, value, enabled: true });
  }
  if (!rows.length) rows.push(emptyRow());
  return rows;
}

export function basicToken(user, pass) {
  const s = `${user || ''}:${pass || ''}`;
  try {
    return btoa(unescape(encodeURIComponent(s)));
  } catch {
    return btoa(s);
  }
}

/** Cyber ContentType::ALL → as_str() order. */
export const CONTENT_TYPE_OPTIONS = [
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'application/xml',
  'text/plain',
  'application/graphql',
];

/** Cyber COMMON_HEADERS: name + usual value start. */
export const COMMON_HEADERS = [
  ['Content-Type', 'application/json'],
  ['Accept', 'application/json'],
  ['Authorization', 'Bearer '],
  ['Cache-Control', 'no-cache'],
  ['Cookie', ''],
  ['User-Agent', ''],
  ['X-Requested-With', 'XMLHttpRequest'],
];

const CONTENT_TYPE_CUSTOM = '__custom__';

const MANAGED_CONTENT_TYPES = new Set([
  ...CONTENT_TYPE_OPTIONS,
  'text/plain; charset=utf-8',
]);

export function isContentTypeKey(key) {
  return String(key || '').trim().toLowerCase() === 'content-type';
}

export function contentTypeForBodyType(bodyType) {
  switch (String(bodyType || '')) {
    case 'json':
      return 'application/json';
    case 'form':
      return 'application/x-www-form-urlencoded';
    case 'text':
      return 'text/plain';
    case 'xml':
      return 'application/xml';
    case 'multipart':
      return 'multipart/form-data';
    case 'graphql':
      return 'application/graphql';
    default:
      return '';
  }
}

/**
 * Cyber-style: Content-Type is driven by body type at send time, not stored
 * in the header list by default. Only refresh an existing managed row.
 */
export function syncHeaderContentType(rows, bodyType) {
  const want = contentTypeForBodyType(bodyType);
  const list = cloneRows(rows);
  const idx = list.findIndex((r) => isContentTypeKey(r.key));
  if (idx < 0) return list;
  const cur = String(list[idx].value || '').trim();
  if (!want) {
    // Body has no type → drop auto-managed Content-Type rows.
    if (!cur || MANAGED_CONTENT_TYPES.has(cur)) {
      list.splice(idx, 1);
      if (!list.length) list.push(emptyRow());
    }
    return list;
  }
  if (!cur || MANAGED_CONTENT_TYPES.has(cur)) {
    list[idx].key = 'Content-Type';
    list[idx].value = want;
    list[idx].enabled = list[idx].enabled !== false;
  }
  return list;
}

/** Insert a Cyber-style preset header before the trailing blank row. */
export function addHeaderPreset(rows, key, value) {
  const list = cloneRows(rows);
  const name = String(key || '').trim();
  if (!name) return list;
  const insertAt = list.length && !String(list[list.length - 1].key || '').trim()
    ? list.length - 1
    : list.length;
  list.splice(insertAt, 0, { key: name, value: String(value ?? ''), enabled: true });
  if (!list.length || String(list[list.length - 1].key || '').trim()) list.push(emptyRow());
  return list;
}

export function headersToText(rows) {
  return (rows || [])
    .filter((r) => String(r?.key || '').trim())
    .map((r) => `${r.key}: ${r.value ?? ''}`)
    .join('\n');
}

export function headersFromText(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) continue;
    const i = raw.indexOf(':');
    if (i < 0) {
      rows.push({ key: raw, value: '', enabled: true });
      continue;
    }
    rows.push({
      key: raw.slice(0, i).trim(),
      value: raw.slice(i + 1).trim(),
      enabled: true,
    });
  }
  if (!rows.length) rows.push(emptyRow());
  else if (String(rows[rows.length - 1].key || '').trim()) rows.push(emptyRow());
  return rows;
}

/**
 * Where each header on the wire came from. User rows win over auth and body type.
 * Go fills User-Agent, Accept, and the cookie jar when the editor did not.
 */
export function sentHeaderSources(sentHeaders, { headerRows = [], auth, bodyType, hasBody } = {}) {
  const user = new Set();
  for (const row of headerRows) {
    if (row?.enabled === false) continue;
    const key = String(row?.key || '').trim().toLowerCase();
    if (key) user.add(key);
  }
  const authOn = auth?.type === 'bearer' || auth?.type === 'basic';
  const managedCT = contentTypeForBodyType(bodyType);
  const from = {};
  for (const [name, value] of Object.entries(sentHeaders || {})) {
    const lk = name.toLowerCase();
    const text = String(value ?? '').trim();
    if (user.has(lk)) from[name] = '请求头';
    else if (lk === 'authorization' && authOn) from[name] = '鉴权';
    else if (lk === 'content-type' && hasBody && managedCT && text.toLowerCase().startsWith(managedCT)) from[name] = '请求体';
    else if (lk === 'cookie') from[name] = 'Cookie';
    else from[name] = '默认';
  }
  return from;
}

export function mergeRequestHeaders(headerRows, auth, bodyType, hasBody) {
  const headers = enabledMap(headerRows);
  if (auth?.type === 'bearer' && auth.token) {
    headers.Authorization = `Bearer ${auth.token}`;
  } else if (auth?.type === 'basic' && (auth.user || auth.pass)) {
    headers.Authorization = `Basic ${basicToken(auth.user, auth.pass)}`;
  }
  const hasCT = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
  if (!hasCT && hasBody) {
    const ct = contentTypeForBodyType(bodyType);
    if (ct) headers['Content-Type'] = ct;
  }
  return headers;
}

const AUTO_UA = 'ApiTester';
const AUTO_ACCEPT = 'application/json, text/plain, */*';

export function headerValue(headers, name) {
  if (!headers) return '';
  const want = String(name || '').toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return String(v ?? '');
  }
  return '';
}

export function methodOmitsBody(method) {
  switch (String(method || '').toUpperCase()) {
    case 'GET':
    case 'HEAD':
      return true;
    default:
      return false;
  }
}

export function httpExchangeFailed(ex) {
  if (!ex) return true;
  if (String(ex.error || '').trim()) return true;
  const code = Number(ex.statusCode) || 0;
  return code >= 400;
}

// A folder is stored as a path, not a name: the importers already write
// "用户 / 登录" and the flat `Modules` list keeps that string whole. So the same
// string both names a folder and says who its parent is, and the tree is worked
// out from it here rather than stored alongside it.
export const MODULE_SEP = ' / ';

export function moduleSegments(name) {
  if (Array.isArray(name)) return name.map((part) => String(part || '').trim()).filter(Boolean);
  return String(name || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function moduleJoin(segments) {
  return (segments || []).filter(Boolean).join(MODULE_SEP);
}

export function moduleParentPath(name) {
  const segments = moduleSegments(name);
  return segments.length > 1 ? moduleJoin(segments.slice(0, -1)) : '';
}

export function moduleBaseName(name) {
  const segments = moduleSegments(name);
  return segments.length ? segments[segments.length - 1] : '';
}

// True when `name` is `root` itself or sits anywhere beneath it, so deleting a
// folder can take its whole subtree with it.
export function moduleIsInside(name, root) {
  const key = moduleSegments(name);
  const base = moduleSegments(root);
  if (!base.length || base.length > key.length) return false;
  for (let i = 0; i < base.length; i += 1) {
    if (key[i] !== base[i]) return false;
  }
  return true;
}

// The subtree rename: every path under `from` moves to `to` with its tail kept.
export function renameModulePath(list, from, to) {
  const root = moduleSegments(from);
  const next = moduleSegments(to);
  if (!root.length || !next.length) return (list || []).slice();
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const key = moduleSegments(raw);
    const moved = moduleIsInside(key, root)
      ? moduleJoin([...next, ...key.slice(root.length)])
      : moduleJoin(key);
    if (!moved || seen.has(moved)) continue;
    seen.add(moved);
    out.push(moved);
  }
  return out;
}

// Searching and pinning ask for every folder, and a path whose parent was never
// declared still has a parent on screen, so ancestors are included.
export function modulePaths(modules) {
  const seen = new Set();
  const out = [];
  for (const name of modules || []) {
    const segments = moduleSegments(name);
    for (let i = 1; i <= segments.length; i += 1) {
      const path = moduleJoin(segments.slice(0, i));
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

// The flat catalog turned into folders that hold folders. A request may name a
// path whose parent was never created, so every ancestor is made real on the
// way down; otherwise that request would be drawn in a folder with no head.
export function moduleTree(groups) {
  const index = new Map();
  const roots = [];
  const ungrouped = [];
  const ensure = (path) => {
    const segments = moduleSegments(path);
    if (!segments.length) return null;
    const key = moduleJoin(segments);
    const seen = index.get(key);
    if (seen) return seen;
    const node = {
      module: key,
      name: segments[segments.length - 1],
      depth: segments.length,
      items: [],
      children: [],
    };
    index.set(key, node);
    const parent = segments.length > 1 ? ensure(moduleJoin(segments.slice(0, -1))) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
    return node;
  };
  for (const group of groups || []) {
    const key = moduleJoin(moduleSegments(group?.module));
    if (!key) {
      ungrouped.push(...(group?.items || []));
      continue;
    }
    ensure(key).items.push(...(group?.items || []));
  }
  return { roots, ungrouped, index };
}

// Where a request can be moved to: 未分组 first, then every folder in the order
// the tree draws it, each row carrying its depth so the list can indent and
// carrying the path it stands for so the choice is unambiguous. The folder the
// request is in now is marked, so picking it again reads as "already here".
//
// The order is rebuilt here rather than taken from the caller: a flat list of
// paths only promises parents before children, which would interleave a/x, b,
// a/y. The list is indented, so siblings have to stay together.
export function moveDestinations(modules, current) {
  const here = moduleJoin(moduleSegments(current));
  const keys = [];
  const seen = new Set();
  for (const name of modules || []) {
    const segments = moduleSegments(name);
    for (let i = 1; i <= segments.length; i += 1) {
      const path = moduleJoin(segments.slice(0, i));
      if (seen.has(path)) continue;
      seen.add(path);
      keys.push(path);
    }
  }
  const children = new Map();
  for (const key of keys) {
    const parent = moduleParentPath(key);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(key);
  }
  const rows = [{ path: '', name: '未分组', depth: 0, current: !here }];
  const walk = (parent, depth) => {
    for (const key of children.get(parent) || []) {
      rows.push({ path: key, name: moduleBaseName(key), depth, current: key === here });
      walk(key, depth + 1);
    }
  };
  walk('', 0);
  return rows;
}

// The search in the move list matches a folder by its own name or by any part
// of its path, so typing 登录 finds 用户 / 登录 without spelling out the parent.
// 未分组 has no path, so its name is matched too.
export function filterDestinations(rows, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return rows || [];
  return (rows || []).filter((row) => `${row.path || ''} ${row.name || ''}`.toLowerCase().includes(kw));
}

// Running a folder runs what is under it, which is what clicking a folder in a
// tree means: the requests in it, then the requests in each child folder, depth
// first. It walks the same tree the list draws, so the run order matches the
// order on screen instead of the order the flat catalog happens to store.
export function moduleRunScope(groups, module) {
  const root = moduleJoin(moduleSegments(module));
  if (!root) return [];
  const { index } = moduleTree(groups);
  const node = index.get(root);
  if (!node) return [];
  const out = [];
  const seen = new Set();
  const walk = (at) => {
    for (const req of at.items || []) {
      const id = req?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(req);
    }
    for (const child of at.children || []) walk(child);
  };
  walk(node);
  return out;
}

// Pinning places a request in one group above the tree and a folder above its
// own siblings. Nothing is copied: a request keeps its `module`, so unpinning
// returns it to the folder it names, and a pinned folder keeps its parent.
export function arrangeCatalogTree(groups, pins) {
  const { roots, ungrouped } = moduleTree(groups);
  const requestOrder = new Map((pins?.requests || []).map((id, at) => [id, at]));
  const moduleOrder = new Map();
  for (const name of pins?.modules || []) {
    const key = moduleJoin(moduleSegments(name));
    if (key && !moduleOrder.has(key)) moduleOrder.set(key, moduleOrder.size);
  }
  const rank = (node) => (moduleOrder.has(node.module) ? moduleOrder.get(node.module) : Number.MAX_SAFE_INTEGER);
  const lifted = [];
  const take = (items) => {
    const kept = [];
    for (const req of items || []) {
      if (requestOrder.has(req?.id)) lifted.push(req);
      else kept.push(req);
    }
    return kept;
  };
  const walk = (node) => {
    node.items = take(node.items);
    for (const child of node.children) walk(child);
    node.children.sort((a, b) => rank(a) - rank(b));
    for (const child of node.children) child.pinned = moduleOrder.has(child.module);
  };
  for (const root of roots) {
    walk(root);
    root.pinned = moduleOrder.has(root.module);
  }
  roots.sort((a, b) => rank(a) - rank(b));
  lifted.sort((a, b) => requestOrder.get(a.id) - requestOrder.get(b.id));
  // A parent shows how much lives under it, not just in it: a folder whose
  // requests all sit in its children would otherwise read "0".
  const count = (node) => {
    node.total = node.items.length + node.children.reduce((sum, child) => sum + count(child), 0);
    return node.total;
  };
  for (const root of roots) count(root);
  return { pinned: lifted, roots, ungrouped: take(ungrouped) };
}

// Dropping a folder onto another folder moves it inside, and its subtree with
// it. The name is kept, so a clash merges the two folders at that path.
export function moveModuleInto(modules, from, into) {
  const fromKey = moduleJoin(moduleSegments(from));
  const intoKey = moduleJoin(moduleSegments(into));
  if (!fromKey || !intoKey || fromKey === intoKey) return null;
  // A folder cannot be moved inside itself or its own subtree.
  if (moduleIsInside(intoKey, fromKey)) return null;
  const target = moduleJoin([...moduleSegments(intoKey), moduleBaseName(fromKey)]);
  if (!target || target === fromKey) return null;
  // renameModulePath already leaves the parent ahead of the children it carries,
  // which is the order the tree is drawn in.
  const list = renameModulePath(modules, fromKey, target);
  if (!list.includes(target)) return null;
  return { modules: list, from: fromKey, to: target };
}

// Dropping a folder beside another is either a reorder among its siblings or,
// when the target lives elsewhere, a move into the target's folder — which is
// the subtree rename above. Both come back as a plan the caller applies, so the
// order and the names can never disagree.
export function reorderModules(modules, from, to, before) {
  const fromKey = moduleJoin(moduleSegments(from));
  const toKey = moduleJoin(moduleSegments(to));
  if (!fromKey || !toKey || fromKey === toKey) return null;
  const target = moduleParentPath(fromKey) === moduleParentPath(toKey)
    ? fromKey
    : moduleJoin([...moduleSegments(moduleParentPath(toKey)), moduleBaseName(fromKey)]);
  if (!target || target === toKey) return null;
  // A folder that lands under itself would vanish. Reordering in place keeps
  // the same path, so only a real move has to be checked for it.
  if (target !== fromKey && moduleIsInside(target, fromKey)) return null;
  const list = target === fromKey
    ? (modules || []).map((m) => moduleJoin(moduleSegments(m))).filter(Boolean)
    : renameModulePath(modules, fromKey, target);
  const at = list.indexOf(target);
  if (at < 0) return null;
  const [moved] = list.splice(at, 1);
  let ti = list.indexOf(toKey);
  if (ti < 0) return null;
  if (!before) ti += 1;
  list.splice(ti, 0, moved);
  return { modules: list, from: fromKey, to: target };
}

// A pin survives its target being deleted only as a stale id, so what is drawn
// is `pins` narrowed to what still exists, in the order the pins were made.
export function pinnedOf(pins, requests, modules) {
  const has = new Set((requests || []).map((r) => r?.id).filter(Boolean));
  const names = new Set((modules || []).map((m) => String(m || '').trim()).filter(Boolean));
  const seenRequest = new Set();
  const seenModule = new Set();
  const outRequests = [];
  const outModules = [];
  for (const id of pins?.requests || []) {
    if (!has.has(id) || seenRequest.has(id)) continue;
    seenRequest.add(id);
    outRequests.push(id);
  }
  for (const name of pins?.modules || []) {
    const key = String(name || '').trim();
    if (!key || !names.has(key) || seenModule.has(key)) continue;
    seenModule.add(key);
    outModules.push(key);
  }
  return { requests: outRequests, modules: outModules };
}

// The group pinned requests are drawn in. It is not a folder, so it uses a name
// no folder can have: a profile's folder names come from typed text and never
// contain a NUL.
export const PIN_MODULE = '\u0000pin';

// Pinning lifts a request out of its folder into one group at the very top, and
// a pinned folder above the folders that are not. Nothing is copied: a request
// keeps its own `module`, so unpinning puts it back where it was.
export function arrangePinned(groups, pins) {
  const requestOrder = new Map((pins?.requests || []).map((id, at) => [id, at]));
  const lifted = [];
  const rest = [];
  for (const group of groups || []) {
    const items = [];
    for (const req of group?.items || []) {
      if (requestOrder.has(req?.id)) lifted.push(req);
      else items.push(req);
    }
    rest.push({ ...group, items });
  }
  lifted.sort((a, b) => requestOrder.get(a.id) - requestOrder.get(b.id));
  const moduleOrder = new Map((pins?.modules || []).map((name, at) => [name, at]));
  const head = [];
  const tail = [];
  for (const group of rest) {
    if (moduleOrder.has(group.module)) head.push(group);
    else tail.push(group);
  }
  head.sort((a, b) => moduleOrder.get(a.module) - moduleOrder.get(b.module));
  const out = [];
  if (lifted.length) out.push({ module: PIN_MODULE, items: lifted, pinned: true });
  return out.concat(head, tail);
}

export function parseAuthorization(headers) {
  const raw = headerValue(headers, 'Authorization');
  if (!raw) return { type: 'none', token: '', user: '', pass: '' };
  const bearer = raw.match(/^Bearer\s+(\S[\s\S]*)$/i);
  if (bearer) {
    return { type: 'bearer', token: bearer[1].trim(), user: '', pass: '' };
  }
  const basic = raw.match(/^Basic\s+(\S+)$/i);
  if (basic) {
    try {
      const decoded = decodeURIComponent(escape(atob(basic[1].trim())));
      const i = decoded.indexOf(':');
      return {
        type: 'basic',
        token: '',
        user: i >= 0 ? decoded.slice(0, i) : decoded,
        pass: i >= 0 ? decoded.slice(i + 1) : '',
      };
    } catch {
      return { type: 'basic', token: '', user: '', pass: '' };
    }
  }
  return { type: 'none', token: '', user: '', pass: '' };
}

export function guessBodyType(headers, body, method) {
  const ct = headerValue(headers, 'Content-Type').toLowerCase();
  const raw = String(body || '').trim();
  if (ct.includes('application/x-www-form-urlencoded')) return 'form';
  if (ct.includes('application/json')) return raw || !methodOmitsBody(method) ? 'json' : 'none';
  if (ct.includes('text/plain')) return raw ? 'text' : 'none';
  if (!raw) return methodOmitsBody(method) ? 'none' : 'json';
  if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
    return 'json';
  }
  if (raw.includes('=') && !raw.includes('{') && !raw.includes('[')) return 'form';
  return 'text';
}

export function editorHeadersFromRequest(headers, opts = {}) {
  const stripAuth = opts.stripAuth !== false;
  const stripContentType = Boolean(opts.stripContentType);
  const rows = [];
  for (const [k, v] of Object.entries(headers || {})) {
    const lk = k.toLowerCase();
    if (stripAuth && lk === 'authorization') continue;
    if (stripContentType && lk === 'content-type') continue;
    if (lk === 'user-agent' && String(v).trim() === AUTO_UA) continue;
    if (lk === 'accept' && String(v).trim() === AUTO_ACCEPT) continue;
    rows.push({ key: k, value: String(v ?? ''), enabled: true });
  }
  if (!rows.length) rows.push(emptyRow());
  else if (rows[rows.length - 1].key) rows.push(emptyRow());
  return rows;
}

export function normalizeVarName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const wrapped = raw.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
  return (wrapped ? wrapped[1] : raw).trim();
}

export function varsFromRows(rows) {
  const out = {};
  for (const r of rows || []) {
    if (r.enabled === false) continue;
    const k = normalizeVarName(r.key);
    if (!k) continue;
    out[k] = r.value ?? '';
  }
  return out;
}

function lookupVar(vars, name) {
  if (!vars || !name) return undefined;
  if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(vars)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

export function expandVars(text, vars, rounds = 5) {
  let s = String(text ?? '');
  if (!s || !vars || !Object.keys(vars).length) return s;
  for (let i = 0; i < rounds; i++) {
    let changed = false;
    const re = /\{\{\s*([^{}\s]+)\s*\}\}|%7B%7B\s*([^{}\s]+)\s*%7D%7D/g;
    s = s.replace(re, (m, a, b) => {
      const val = lookupVar(vars, a || b);
      if (val === undefined || val === '') return m;
      changed = true;
      return String(val);
    });
    if (!changed) break;
  }
  return s;
}

export function expandMap(map, vars) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    out[expandVars(k, vars)] = expandVars(String(v ?? ''), vars);
  }
  return out;
}

export function keepTemplate(current, incoming, vars) {
  const cur = String(current ?? '');
  const inc = String(incoming ?? '');
  if (cur === inc) return cur;
  if (cur.includes('{{') && expandVars(cur, vars) === inc) return cur;
  return inc;
}

export function wrapIfVarValue(text, vars) {
  const s = String(text ?? '');
  if (!s || s.includes('{{')) return s;
  let bestName = '';
  let bestLen = 0;
  for (const [name, val] of Object.entries(vars || {})) {
    const v = String(val ?? '');
    if (v && s === v && v.length >= bestLen) {
      bestLen = v.length;
      bestName = name;
    }
  }
  return bestName ? `{{${bestName}}}` : s;
}

export function keepTemplatesInRows(currentRows, previousRows, vars) {
  const prev = previousRows || [];
  return (currentRows || []).map((row) => {
    const match = prev.find((p) => {
      if (!p?.key) return false;
      return p.key === row.key
        || expandVars(p.key, vars) === row.key
        || expandVars(p.key, vars) === expandVars(row.key, vars);
    });
    const key = match ? keepTemplate(match.key, row.key, vars) : row.key;
    const value = wrapIfVarValue(
      match ? keepTemplate(match.value, row.value, vars) : row.value,
      vars,
    );
    return { key, value, enabled: row.enabled !== false };
  });
}

function curlQuote(s) {
  return `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function toCurl({ method, url, headers, body, followRedirects, insecureSkipVerify = false }) {
  const parts = ['curl.exe'];
  if (insecureSkipVerify && /^https:/i.test(url || '')) parts.push('-k');
  if (followRedirects) parts.push('-L');
  const m = String(method || 'GET').toUpperCase();
  if (m && m !== 'GET') parts.push('-X', m);
  parts.push(curlQuote(url || ''));
  for (const [k, v] of Object.entries(headers || {})) {
    if (!String(k || '').trim()) continue;
    parts.push('-H', curlQuote(`${k}: ${v}`));
  }
  if (body && !methodOmitsBody(m)) {
    parts.push('--data-raw', curlQuote(body));
  }
  return parts.join(' ');
}

export function parseHTTPOutPreview(text) {
  const m = String(text || '').trim().match(
    /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)$/i,
  );
  if (!m) return null;
  return { method: m[1].toUpperCase(), url: m[2] };
}

function mountKVValue(slot, rows, i, onChange) {
  const row = rows[i] || emptyRow();
  const asCT = isContentTypeKey(row.key);
  slot.innerHTML = '';
  slot.className = 'kv-val-slot' + (asCT ? ' is-ct' : '');
  if (!asCT) {
    const valInput = document.createElement('input');
    valInput.className = 'input kv-val';
    valInput.spellcheck = false;
    valInput.placeholder = 'Value';
    valInput.value = row.value || '';
    valInput.addEventListener('input', () => {
      rows[i].value = valInput.value;
      forgetQueryRaw(rows[i]);
      onChange?.();
    });
    slot.appendChild(valInput);
    return;
  }

  let cur = String(row.value || '').trim();
  if (!cur) {
    cur = 'application/json';
    rows[i].value = cur;
  }
  const known = CONTENT_TYPE_OPTIONS.includes(cur);
  const pick = document.createElement('select');
  pick.className = 'select kv-val kv-ct';
  pick.title = 'Content-Type';
  const options = known || !cur ? [...CONTENT_TYPE_OPTIONS] : [cur, ...CONTENT_TYPE_OPTIONS];
  for (const v of options) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    if (v === cur) opt.selected = true;
    pick.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = CONTENT_TYPE_CUSTOM;
  customOpt.textContent = '自定义…';
  pick.appendChild(customOpt);

  const custom = document.createElement('input');
  custom.className = 'input kv-val kv-ct-custom hidden';
  custom.spellcheck = false;
  custom.placeholder = '自定义 Content-Type';
  custom.value = known ? '' : cur;

  pick.addEventListener('change', () => {
    if (pick.value === CONTENT_TYPE_CUSTOM) {
      custom.classList.remove('hidden');
      rows[i].value = custom.value;
      custom.focus();
    } else {
      custom.classList.add('hidden');
      rows[i].value = pick.value;
    }
    rows[i].key = 'Content-Type';
    forgetQueryRaw(rows[i]);
    onChange?.();
  });
  custom.addEventListener('input', () => {
    rows[i].value = custom.value;
    forgetQueryRaw(rows[i]);
    onChange?.();
  });
  slot.appendChild(pick);
  slot.appendChild(custom);
}

function bindKVRow(tbody, rows, i, onChange, opts) {
  const row = rows[i] || emptyRow();
  const locked = Boolean(opts?.lockHost && isHostVarKey(row.key));
  const tr = document.createElement('tr');
  tr.className = 'kv-row' + (locked ? ' kv-locked' : '');
  tr.innerHTML = `
    <td class="kv-td-on"><input type="checkbox" class="kv-on" ${row.enabled || locked ? 'checked' : ''} title="${locked ? 'host 始终启用' : '启用'}" ${locked ? 'disabled' : ''}/></td>
    <td class="kv-td-key"><input class="input kv-key" spellcheck="false" placeholder="Key" ${locked ? 'readonly tabindex="-1"' : ''}/></td>
    <td class="kv-td-val"><div class="kv-val-slot"></div></td>
    <td class="kv-td-act">${locked ? '<span class="kv-del-slot" aria-hidden="true"></span>' : '<button type="button" class="btn ghost kv-del" title="删除">×</button>'}</td>
  `;
  const keyInput = tr.querySelector('.kv-key');
  const valSlot = tr.querySelector('.kv-val-slot');
  keyInput.value = locked ? HOST_VAR_KEY : row.key;
  if (locked) {
    rows[i].key = HOST_VAR_KEY;
    rows[i].enabled = true;
    keyInput.title = 'BASE_URL 固定，不能改名或删除';
    valSlot.innerHTML = '';
    const valInput = document.createElement('input');
    valInput.className = 'input kv-val';
    valInput.spellcheck = false;
    valInput.placeholder = 'ws://host:port/path';
    valInput.value = row.value || '';
    valInput.addEventListener('input', () => {
      rows[i].value = valInput.value;
      forgetQueryRaw(rows[i]);
      onChange?.();
    });
    valSlot.appendChild(valInput);
  } else {
    mountKVValue(valSlot, rows, i, onChange);
  }
  const onBox = tr.querySelector('.kv-on');
  if (onBox && !locked) {
    onBox.addEventListener('change', (e) => {
      rows[i].enabled = e.target.checked;
      onChange?.();
    });
  }
  let wasCT = isContentTypeKey(row.key);
  const onKeyEdit = (e) => {
    if (locked) {
      keyInput.value = HOST_VAR_KEY;
      return;
    }
    if (opts?.lockHost && isHostVarKey(keyInput.value)) {
      keyInput.value = '';
      rows[i].key = '';
      forgetQueryRaw(rows[i]);
      onChange?.();
      return;
    }
    rows[i].key = keyInput.value;
    forgetQueryRaw(rows[i]);
    const nowCT = isContentTypeKey(keyInput.value);
    if (nowCT !== wasCT) {
      wasCT = nowCT;
      if (nowCT && !String(rows[i].value || '').trim()) {
        rows[i].value = 'application/json';
      }
      mountKVValue(valSlot, rows, i, onChange);
    }
    if (!e.isComposing && i === rows.length - 1 && keyInput.value) {
      rows.push(emptyRow());
      bindKVRow(tbody, rows, rows.length - 1, onChange, opts);
    }
    onChange?.();
  };
  keyInput.addEventListener('input', onKeyEdit);
  keyInput.addEventListener('compositionend', () => {
    if (locked) {
      keyInput.value = HOST_VAR_KEY;
      return;
    }
    if (opts?.lockHost && isHostVarKey(keyInput.value)) {
      keyInput.value = '';
      rows[i].key = '';
      forgetQueryRaw(rows[i]);
      onChange?.();
      return;
    }
    rows[i].key = keyInput.value;
    forgetQueryRaw(rows[i]);
    const nowCT = isContentTypeKey(keyInput.value);
    if (nowCT !== wasCT) {
      wasCT = nowCT;
      if (nowCT && !String(rows[i].value || '').trim()) {
        rows[i].value = 'application/json';
      }
      mountKVValue(valSlot, rows, i, onChange);
    }
    if (i === rows.length - 1 && keyInput.value) {
      rows.push(emptyRow());
      bindKVRow(tbody, rows, rows.length - 1, onChange, opts);
    }
    onChange?.();
  });
  tr.querySelector('.kv-del')?.addEventListener('click', () => {
    if (locked || isHostVarKey(rows[i]?.key)) return;
    if (rows.length === 1) {
      rows[0] = emptyRow();
    } else {
      rows.splice(i, 1);
    }
    if (opts?.lockHost) {
      const next = ensureHostVarRows(rows);
      rows.splice(0, rows.length, ...next);
    }
    renderKV(opts?._listRoot, rows, onChange, opts);
    onChange?.();
  });
  tbody.appendChild(tr);
}

export function renderKV(root, rows, onChange, opts = {}) {
  if (!root) return;
  const tools = opts.tools;
  // Keep toolbar nodes alive across re-renders.
  tools?.remove();
  root.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'kv-table';
  const thead = document.createElement('thead');
  const head = document.createElement('tr');
  head.innerHTML = `
    <th class="kv-th-on" scope="col"></th>
    <th class="kv-th-key" scope="col">${opts.keyLabel || '键'}</th>
    <th class="kv-th-val" scope="col">${opts.valueLabel || '值'}</th>
    <th class="kv-th-act" scope="col"></th>
  `;
  const act = head.querySelector('.kv-th-act');
  if (tools && act) {
    tools.classList.remove('is-bar');
    act.appendChild(tools);
  }
  thead.appendChild(head);
  const tbody = document.createElement('tbody');
  table.append(thead, tbody);
  root.appendChild(table);
  const nextOpts = { ...opts, _listRoot: root };
  rows.forEach((_, i) => bindKVRow(tbody, rows, i, onChange, nextOpts));
}
