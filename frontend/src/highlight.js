/** Escape text for safe HTML embedding. */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Lightweight JSON (and JSON-like) syntax highlighter for non-tree plain text.
 */
const HIGHLIGHT_CAP = 48000;
const TREE_ENTRY_CAP = 80;
const TREE_STR_CAP = 4000;

/** @type {Map<string, any>} */
const treeStore = new Map();
/** @type {Map<string, string>} */
const textStore = new Map();
let treeSeq = 0;

function resetTreeStore() {
  treeStore.clear();
  textStore.clear();
}

function rememberText(s) {
  const id = `s${++treeSeq}`;
  textStore.set(id, s);
  return id;
}

function rememberTree(value) {
  const id = `t${++treeSeq}`;
  treeStore.set(id, value);
  return id;
}

function valueAtPath(root, path) {
  if (root == null) return undefined;
  if (!path) return root;
  let cur = root;
  for (const part of path.split('/')) {
    if (part === '') continue;
    if (cur == null) return undefined;
    const key = decodeURIComponent(part);
    cur = Array.isArray(cur) ? cur[Number(key)] : cur[key];
  }
  return cur;
}

function childPath(path, key) {
  return `${path}/${encodeURIComponent(String(key))}`;
}

export function highlightJson(text) {
  const raw = String(text ?? '');
  if (!raw) return '';
  const clipped = raw.length > HIGHLIGHT_CAP;
  const s = clipped ? raw.slice(0, HIGHLIGHT_CAP) : raw;

  if (!/[{[\]":\d]|true|false|null/.test(s)) {
    if (!clipped) return escapeHtml(s);
    const id = rememberText(raw);
    return (
      escapeHtml(s) +
      `<span class="jt-str" data-text="${id}">` +
        `<span class="tok-meta">… 已截断显示（共 ${raw.length} 字）</span>` +
        `<button type="button" class="jt-str-more">展开全部</button>` +
      `</span>`
    );
  }

  let i = 0;
  let out = '';
  const len = s.length;

  const push = (cls, raw) => {
    const esc = escapeHtml(raw);
    out += cls ? `<span class="tok-${cls}">${esc}</span>` : esc;
  };

  while (i < len) {
    const c = s[i];

    if (c === '"') {
      let j = i + 1;
      while (j < len) {
        if (s[j] === '\\') {
          j += j + 1 < len ? 2 : 1;
          continue;
        }
        if (s[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      const str = s.slice(i, j);
      let k = j;
      while (k < len && (s[k] === ' ' || s[k] === '\t' || s[k] === '\n' || s[k] === '\r')) k++;
      push(s[k] === ':' ? 'key' : 'str', str);
      i = j;
      continue;
    }

    if (c === '-' || (c >= '0' && c <= '9')) {
      let j = i;
      if (s[j] === '-') j++;
      while (j < len && s[j] >= '0' && s[j] <= '9') j++;
      if (j < len && s[j] === '.') {
        j++;
        while (j < len && s[j] >= '0' && s[j] <= '9') j++;
      }
      if (j < len && (s[j] === 'e' || s[j] === 'E')) {
        j++;
        if (j < len && (s[j] === '+' || s[j] === '-')) j++;
        while (j < len && s[j] >= '0' && s[j] <= '9') j++;
      }
      if (j > i && !(j === i + 1 && s[i] === '-')) {
        push('num', s.slice(i, j));
        i = j;
        continue;
      }
    }

    if (s.startsWith('true', i) && isWordEnd(s, i + 4)) {
      push('bool', 'true');
      i += 4;
      continue;
    }
    if (s.startsWith('false', i) && isWordEnd(s, i + 5)) {
      push('bool', 'false');
      i += 5;
      continue;
    }
    if (s.startsWith('null', i) && isWordEnd(s, i + 4)) {
      push('null', 'null');
      i += 4;
      continue;
    }

    if (c === '{' || c === '}' || c === '[' || c === ']' || c === ',' || c === ':') {
      push('punc', c);
      i++;
      continue;
    }

    push('', c);
    i++;
  }

  if (clipped) {
    const id = rememberText(raw);
    out +=
      `<span class="jt-str" data-text="${id}">` +
        `<span class="tok-meta">… 已截断显示（共 ${raw.length} 字）</span>` +
        `<button type="button" class="jt-str-more">展开全部</button>` +
      `</span>`;
  }
  return out;
}

function isWordEnd(s, idx) {
  if (idx >= s.length) return true;
  const c = s[idx];
  return !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$');
}

function tryParseJson(text) {
  const s = String(text ?? '').trim();
  if (!s) return { ok: false };
  const c = s[0];
  if (c !== '{' && c !== '[') return { ok: false };
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
}

function keyHtml(key) {
  if (key === null || key === undefined) return '';
  if (typeof key === 'number') {
    return `<span class="tok-num">${key}</span><span class="tok-punc">: </span>`;
  }
  return `<span class="tok-key">"${escapeHtml(String(key))}"</span><span class="tok-punc">: </span>`;
}

function primitiveHtml(value, treeId, path) {
  if (value === null) return `<span class="tok-null">null</span>`;
  if (typeof value === 'boolean') return `<span class="tok-bool">${value}</span>`;
  if (typeof value === 'number') return `<span class="tok-num">${escapeHtml(String(value))}</span>`;
  if (typeof value === 'string') {
    if (value.length > TREE_STR_CAP && treeId) {
      return (
        `<span class="jt-str" data-tree="${escapeHtml(treeId)}" data-path="${escapeHtml(path || '')}">` +
          `<span class="tok-str">"${escapeHtml(value.slice(0, TREE_STR_CAP))}…"</span>` +
          `<span class="tok-meta"> (${value.length} 字)</span>` +
          `<button type="button" class="jt-str-more">展开全部</button>` +
        `</span>`
      );
    }
    return `<span class="tok-str">"${escapeHtml(value)}"</span>`;
  }
  return `<span class="tok-str">${escapeHtml(String(value))}</span>`;
}

function previewLabel(value) {
  if (Array.isArray(value)) {
    const n = value.length;
    return n === 0 ? '[]' : `Array(${n})`;
  }
  if (value && typeof value === 'object') {
    const n = Object.keys(value).length;
    return n === 0 ? '{}' : `Object{${n}}`;
  }
  return '';
}

function takeEntries(value, cap) {
  if (Array.isArray(value)) {
    const n = Math.min(value.length, cap);
    const entries = new Array(n);
    for (let i = 0; i < n; i++) entries[i] = [i, value[i]];
    return { entries, total: value.length };
  }
  const keys = Object.keys(value);
  const n = Math.min(keys.length, cap);
  const entries = new Array(n);
  for (let i = 0; i < n; i++) entries[i] = [keys[i], value[keys[i]]];
  return { entries, total: keys.length };
}

function renderEntries(value, depth, treeId, path) {
  const isArr = Array.isArray(value);
  const close = isArr ? ']' : '}';
  const { entries, total } = takeEntries(value, TREE_ENTRY_CAP);
  const more = total - entries.length;
  let kids = '';
  for (let i = 0; i < entries.length; i++) {
    const [k, v] = entries[i];
    kids += renderTree(v, k, depth + 1, i < entries.length - 1 || more > 0, treeId, childPath(path, k));
  }
  if (more > 0) {
    kids += `<div class="jt-line"><span class="tok-meta">… 还有 ${more} 项</span></div>`;
  }
  kids += `<div class="jt-line"><span class="tok-punc">${close}</span></div>`;
  return kids;
}

/**
 * Render a JSON value as a collapsible tree.
 * depth>=2 nodes start collapsed and children are built on expand.
 */
function renderTree(value, key, depth, trailingComma, treeId, path) {
  const comma = trailingComma ? `<span class="tok-punc">,</span>` : '';
  const isObj = value !== null && typeof value === 'object';

  if (!isObj) {
    return `<div class="jt-line">${keyHtml(key)}${primitiveHtml(value, treeId, path)}${comma}</div>`;
  }

  const isArr = Array.isArray(value);
  const total = isArr ? value.length : Object.keys(value).length;
  const open = isArr ? '[' : '{';
  const close = isArr ? ']' : '}';

  if (total === 0) {
    return `<div class="jt-line">${keyHtml(key)}<span class="tok-punc">${open}${close}</span>${comma}</div>`;
  }

  const collapsed = depth >= 2;
  const kids = collapsed ? '' : renderEntries(value, depth, treeId, path);

  return (
    `<div class="jt-node${collapsed ? ' collapsed' : ''}" data-tree="${escapeHtml(treeId)}" data-path="${escapeHtml(path || '')}">` +
      `<div class="jt-line jt-toggle-line" role="button" tabindex="0" title="点击展开/收起">` +
        `<span class="jt-toggle" aria-hidden="true">${collapsed ? '▶' : '▼'}</span>` +
        `${keyHtml(key)}` +
        `<span class="tok-punc">${open}</span>` +
        `<span class="jt-preview">${escapeHtml(previewLabel(value))}</span>` +
        `<span class="jt-ellipsis">…</span>` +
        `<span class="tok-punc jt-close-inline">${close}</span>${comma}` +
      `</div>` +
      `<div class="jt-children"${collapsed ? '' : ' data-ready="1"'}>` +
        kids +
      `</div>` +
    `</div>`
  );
}

function statusClass(code) {
  if (code >= 200 && code < 300) return 'ok';
  if (code >= 400) return 'err';
  if (code >= 300) return 'warn';
  return '';
}

function headerTable(headers, sources) {
  const entries = Object.entries(headers || {});
  if (!entries.length) return `<div class="resp-empty">无</div>`;
  return `<div class="hdr-table">${entries
    .map(([k, v]) => {
      const src = sources?.[k] || '';
      return (
        `<div class="hdr-row${src ? ' has-src' : ''}">` +
          `<span class="hdr-k">${escapeHtml(k)}</span>` +
          (src ? `<span class="hdr-src">${escapeHtml(src)}</span>` : '') +
          `<span class="hdr-v">${escapeHtml(v)}</span>` +
        `</div>`
      );
    })
    .join('')}</div>`;
}

function bodyBlock(raw, image) {
  if (image) {
    return `<img class="resp-image" alt="响应图片" src="${escapeHtml(image)}">`;
  }
  const parsed = tryParseJson(raw);
  if (!parsed.ok) {
    return `<div class="jt-plain">${raw ? highlightJson(raw) : '<span class="resp-empty">(empty)</span>'}</div>`;
  }
  const id = rememberTree(parsed.value);
  return `<div class="jt-root" data-tree="${id}">${renderTree(parsed.value, null, 0, false, id, '')}</div>`;
}

/** Render a Postman-like HTTP request/response snapshot. */
export function renderHTTPExchange(ex) {
  resetTreeStore();
  if (!ex) return '';
  const code = ex.statusCode || 0;
  const size = ex.bytes || 0;
  const sizeLabel = size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
  const statusLabel = ex.status || (ex.error && !code ? 'Error' : String(code));
  const statusCls = statusClass(code) || (ex.error ? 'err' : '');
  return (
    `<div class="resp-head">` +
      `<span class="resp-code ${statusCls}">${escapeHtml(statusLabel)}</span>` +
      (ex.manual ? `<span class="resp-badge">手动</span>` : `<span class="resp-stat">${ex.timeMs ?? 0} ms</span>`) +
      `<span class="resp-stat">${escapeHtml(sizeLabel)}</span>` +
      `<span class="resp-stat">${escapeHtml(ex.method || '')} ${escapeHtml(ex.url || '')}</span>` +
    `</div>` +
    (ex.error ? `<div class="resp-error">${escapeHtml(ex.error)}</div>` : '') +
    `<div class="resp-sec">请求头</div>${headerTable(ex.reqHeaders, ex.headerFrom)}` +
    `<div class="resp-sec">请求体</div>${bodyBlock(ex.reqBody)}` +
    `<div class="resp-sec">响应头</div>${headerTable(ex.resHeaders)}` +
    `<div class="resp-sec">响应体</div>${bodyBlock(ex.resBody, ex.resImage)}`
  );
}

/** Live HTTP response panel: metrics bar + body/headers in one scroll column. */
export function renderHTTPResponse(ex) {
  resetTreeStore();
  if (!ex) return '';
  const code = ex.statusCode || 0;
  const size = ex.bytes || 0;
  const sizeLabel = size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
  const statusLabel = ex.status || (ex.error && !code ? 'Error' : String(code || '—'));
  const statusCls = statusClass(code) || (ex.error ? 'err' : '');
  return (
    `<div class="resp-fixed">` +
      `<div class="resp-head">` +
        `<span class="resp-code ${statusCls}">${escapeHtml(statusLabel)}</span>` +
        `<span class="resp-stat">${ex.manual ? '手动' : `${ex.timeMs ?? 0} ms`}</span>` +
        `<span class="resp-stat">${escapeHtml(sizeLabel)}</span>` +
      `</div>` +
    `</div>` +
    (ex.error ? `<div class="resp-error">${escapeHtml(ex.error)}</div>` : '') +
    `<div class="resp-stack">` +
      `<div class="resp-sec">实际请求</div>` +
      `<div class="resp-url">${escapeHtml(`${ex.method || ''} ${ex.url || ''}`.trim())}</div>` +
      `<div class="resp-sec">请求头</div>${headerTable(ex.reqHeaders, ex.headerFrom)}` +
      (String(ex.reqBody || '').trim() ? `<div class="resp-sec">请求体</div>${bodyBlock(ex.reqBody)}` : '') +
      `<div class="resp-sec">响应体</div>${bodyBlock(ex.resBody, ex.resImage)}` +
      `<div class="resp-sec">响应头</div>${headerTable(ex.resHeaders)}` +
    `</div>`
  );
}

/** Render a manually saved WebSocket send/receive pair. */
export function renderWSRecord(rec) {
  resetTreeStore();
  if (!rec) return '';
  const size = (rec.out || '').length + (rec.in || '').length;
  const sizeLabel = size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
  return (
    `<div class="resp-head">` +
      `<span class="resp-code">WS</span>` +
      (rec.manual ? `<span class="resp-badge">手动</span>` : '') +
      `<span class="resp-stat">${escapeHtml(sizeLabel)}</span>` +
      `<span class="resp-stat">${escapeHtml(rec.url || '')}</span>` +
      (rec.protocol ? `<span class="resp-stat">${escapeHtml(rec.protocol)}</span>` : '') +
    `</div>` +
    `<div class="resp-sec">发送</div>${bodyBlock(rec.out)}` +
    `<div class="resp-sec">返回</div>${bodyBlock(rec.in)}`
  );
}

/** Render detail header + collapsible JSON tree (or flat highlighted text). */
export function renderDetailHtml(dir, time, body) {
  resetTreeStore();
  const meta = `<div class="detail-meta">[${escapeHtml(dir)}] ${escapeHtml(time)}</div>`;
  const raw = body ?? '';
  const parsed = tryParseJson(raw);
  if (!parsed.ok) {
    return `${meta}<div class="jt-plain">${highlightJson(raw)}</div>`;
  }
  const id = rememberTree(parsed.value);
  return `${meta}<div class="jt-root" data-tree="${id}">${renderTree(parsed.value, null, 0, false, id, '')}</div>`;
}

function toggleLongString(btn) {
  const wrap = btn.closest('.jt-str');
  if (!wrap) return false;
  const open = wrap.classList.toggle('open');
  if (wrap.dataset.text) {
    const host = wrap.closest('.jt-plain') || wrap.parentElement;
    if (!host) return true;
    let rest = host.querySelector(':scope > .jt-str-rest');
    if (open) {
      if (!rest) {
        const raw = textStore.get(wrap.dataset.text);
        if (raw == null) return true;
        rest = document.createElement('span');
        rest.className = 'jt-str-rest';
        rest.textContent = raw.slice(HIGHLIGHT_CAP);
        host.appendChild(rest);
      }
      rest.hidden = false;
      const meta = wrap.querySelector('.tok-meta');
      if (meta) meta.hidden = true;
      btn.textContent = '收起';
    } else {
      if (rest) rest.hidden = true;
      const meta = wrap.querySelector('.tok-meta');
      if (meta) meta.hidden = false;
      btn.textContent = '展开全部';
    }
    return true;
  }
  const val = valueAtPath(treeStore.get(wrap.dataset.tree), wrap.dataset.path || '');
  if (typeof val !== 'string') return true;
  const strEl = wrap.querySelector('.tok-str');
  if (strEl) {
    strEl.textContent = open ? `"${val}"` : `"${val.slice(0, TREE_STR_CAP)}…"`;
  }
  const meta = wrap.querySelector('.tok-meta');
  if (meta) meta.hidden = open;
  btn.textContent = open ? '收起' : '展开全部';
  return true;
}

/** Toggle a .jt-node open/collapsed, or expand a clipped long string. */
export function toggleJsonNode(target) {
  const more = target?.closest?.('.jt-str-more');
  if (more) return toggleLongString(more);
  const line = target?.closest?.('.jt-toggle-line');
  if (!line) return false;
  const node = line.closest('.jt-node');
  if (!node) return false;
  node.classList.toggle('collapsed');
  const collapsed = node.classList.contains('collapsed');
  const mark = line.querySelector('.jt-toggle');
  if (mark) mark.textContent = collapsed ? '▶' : '▼';
  if (!collapsed) {
    const kids = node.querySelector(':scope > .jt-children');
    if (kids && kids.dataset.ready !== '1') {
      const treeId = node.dataset.tree || node.closest('.jt-root')?.dataset.tree;
      const path = node.dataset.path || '';
      const val = valueAtPath(treeStore.get(treeId), path);
      if (val && typeof val === 'object') {
        kids.innerHTML = renderEntries(val, 2, treeId, path);
        kids.dataset.ready = '1';
      }
    }
  }
  return true;
}
