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
