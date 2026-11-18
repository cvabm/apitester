import './style.css';
import {
  Connect,
  Disconnect,
  Send,
  RequestHTTP,
  GetProfiles,
  GetProfileLoadError,
  GetStatus,
  GetMessages,
  ClearMessages,
  GetPaths,
  FormatJSON,
  SaveProfile,
  SelectProfile,
  DeleteProfile,
  DeleteRequest,
  ExportCatalog,
  ExportAllCatalogs,
  ImportCatalog,
  ListSessions,
  SearchSessions,
  LoadSession,
  LoadSessionMessage,
  PickAndLoadSession,
  OpenLogDir,
  OpenDataDir,
  NeedsDataDirectory,
  PickDataDirectory,
  ClearCookies,
} from '../wailsjs/go/main/App';
import { EventsOn, ClipboardSetText } from '../wailsjs/runtime/runtime';
import { escapeHtml, highlightJson, renderDetailHtml, renderHTTPExchange, renderHTTPResponse, renderWSRecord, toggleJsonNode } from './highlight.js';
import {
  emptyRow,
  cloneRows,
  ensureHostVarRows,
  rowsFromMap,
  parseQuery,
  applyQuery,
  requestDefinitionURL,
  requestURLForEnvironment,
  formEncode,
  parseForm,
  mergeRequestHeaders,
  sentHeaderSources,
  parseAuthorization,
  guessBodyType,
  methodOmitsBody,
  editorHeadersFromRequest,
  parseHTTPOutPreview,
  syncHeaderContentType,
  COMMON_HEADERS,
  addHeaderPreset,
  headersToText,
  headersFromText,
  renderKV,
  varsFromRows,
  expandVars,
  expandMap,
  keepTemplate,
  keepTemplatesInRows,
  toCurl,
  httpExchangeFailed,
} from './http-ui.js';

const $ = (id) => document.getElementById(id);
// Stable storage keys preserve preferences across the repository rename.
const THEME_KEY = 'ws-desk-theme';
const CATALOG_KEY = 'ws-desk-catalog';
const SEL_KEY = 'ws-desk-sel';
const MODE_KEY = 'ws-desk-work-mode';
const HOVER_KEY = 'ws-desk-catalog-hover';
const DOC_EDIT_KEY = 'ws-desk-doc-edit';
const COLS_KEY = 'ws-desk-cols';
const COL_LEFT_MIN = 160;
const COL_LEFT_MAX = 420;
const COL_MID_MIN = 240;
const COL_RIGHT_MIN = 240;
const COL_SPLIT = 5;

const HTTP_SCHEMES = new Set(['http', 'https']);
const ALL_SCHEMES = new Set(['ws', 'wss', 'http', 'https']);

const el = {
  app: $('app'),
  project: $('project'),
  btnProjectNew: $('btnProjectNew'),
  btnProjectRename: $('btnProjectRename'),
  btnProjectDelete: $('btnProjectDelete'),
  barEnv: $('barEnv'),
  btnAddProfile: $('btnAddProfile'),
  btnDelProfile: $('btnDelProfile'),
  urlBox: $('urlBox'),
  urlWrap: $('urlWrap'),
  urlPrefix: $('urlPrefix'),
  url: $('url'),

  urlModal: $('urlModal'),
  urlModalTitle: $('urlModalTitle'),
  urlModalInput: $('urlModalInput'),
  urlModalErr: $('urlModalErr'),
  btnUrlModalClose: $('btnUrlModalClose'),
  btnUrlModalCancel: $('btnUrlModalCancel'),
  btnUrlModalOk: $('btnUrlModalOk'),
  confirmModal: $('confirmModal'),
  confirmTitle: $('confirmTitle'),
  confirmMsg: $('confirmMsg'),
  btnConfirmCancel: $('btnConfirmCancel'),
  btnConfirmOk: $('btnConfirmOk'),
  dataDirModal: $('dataDirModal'),
  dataDirMsg: $('dataDirMsg'),
  dataDirErr: $('dataDirErr'),
  btnDataDirPick: $('btnDataDirPick'),
  protocol: $('protocol'),
  method: $('method'),
  reconnect: $('reconnect'),
  reconnectWrap: $('reconnectWrap'),
  followRedirects: $('followRedirects'),
  insecureSkipVerify: $('insecureSkipVerify'),
  tlsWrap: $('tlsWrap'),
  redirectWrap: $('redirectWrap'),
  btnCurl: $('btnCurl'),
  btnCurlDetail: $('btnCurlDetail'),
  btnClearCookies: $('btnClearCookies'),
  btnToggle: $('btnToggle'),
  btnSendTop: $('btnSendTop'),
  btnRecord: $('btnRecord'),
  barMenuWrap: $('barMenuWrap'),
  btnBarMenu: $('btnBarMenu'),
  barMenu: $('barMenu'),
  barMenuMode: $('barMenuMode'),
  barMenuProject: $('barMenuProject'),
  barMenuEnv: $('barMenuEnv'),
  barMenuOptions: $('barMenuOptions'),
  barMenuActions: $('barMenuActions'),
  modeSwitch: $('modeSwitch'),
  btnModeDoc: $('btnModeDoc'),
  btnModeDebug: $('btnModeDebug'),
  btnDocEdit: $('btnDocEdit'),
  docPane: $('docPane'),
  docEmpty: $('docEmpty'),
  docBody: $('docBody'),
  docMeta: $('docMeta'),
  docExtra: $('docExtra'),
  docConfig: $('docConfig'),
  docReqCol: $('docReqCol'),
  docReqView: $('docReqView'),
  docResView: $('docResView'),
  docReq: $('docReq'),
  docRes: $('docRes'),
  btnCopyDocReq: $('btnCopyDocReq'),
  btnCopyDocRes: $('btnCopyDocRes'),
  state: $('state'),
  reqBuilder: $('reqBuilder'),
  reqMeta: $('reqMeta'),
  reqTitle: $('reqTitle'),
  reqModule: $('reqModule'),
  reqDesc: $('reqDesc'),
  envWrap: $('envWrap'),
  btnEnvMore: $('btnEnvMore'),
  envEdit: $('envEdit'),
  envEditName: $('envEditName'),
  moduleWrap: $('moduleWrap'),
  moduleMenu: $('moduleMenu'),
  catalogPane: $('catalogPane'),
  catalogTitle: $('catalogTitle'),
  catalogList: $('catalogList'),
  catalogFilter: $('catalogFilter'),
  groupMenu: $('groupMenu'),
  catalogTip: $('catalogTip'),
  splitLeft: $('splitLeft'),
  splitRight: $('splitRight'),
  main: document.querySelector('.main'),
  btnCatalogToggle: $('btnCatalogToggle'),
  btnCatalogAdd: $('btnCatalogAdd'),
  btnCatalogExport: $('btnCatalogExport'),
  btnCatalogImport: $('btnCatalogImport'),
  btnSaveReq: $('btnSaveReq'),
  btnSaveWS: $('btnSaveWS'),
  promptModal: $('promptModal'),
  promptTitle: $('promptTitle'),
  promptHint: $('promptHint'),
  promptInput: $('promptInput'),
  promptErr: $('promptErr'),
  btnPromptCancel: $('btnPromptCancel'),
  btnPromptOk: $('btnPromptOk'),
  reqTabs: $('reqTabs'),
  tabParams: $('tabParams'),
  tabHeaders: $('tabHeaders'),
  tabAuth: $('tabAuth'),
  tabBody: $('tabBody'),
  paramRows: $('paramRows'),
  headerRows: $('headerRows'),
  headerTools: $('headerTools'),
  headerBulk: $('headerBulk'),
  btnHeaderPresets: $('btnHeaderPresets'),
  headerPresetMenu: $('headerPresetMenu'),
  btnHeaderBulk: $('btnHeaderBulk'),
  varRows: $('varRows'),
  formRows: $('formRows'),
  authType: $('authType'),
  authToken: $('authToken'),
  authUser: $('authUser'),
  authPass: $('authPass'),
  list: $('list'),
  listTitle: $('listTitle'),
  detail: $('detail'),
  btnFill: $('btnFill'),
  btnSaveExample: $('btnSaveExample'),
  btnCopyDetail: $('btnCopyDetail'),
  payloadWrap: $('payloadWrap'),
  payloadOutCol: $('payloadOutCol'),
  payload: $('payload'),
  payloadIn: $('payloadIn'),

  btnSend: $('btnSend'),
  btnFormat: $('btnFormat'),
  btnFormatHttp: $('btnFormatHttp'),
  reqPane: $('reqPane'),
  detailTitle: $('detailTitle'),
  composer: document.querySelector('.composer'),
  btnResend: $('btnResend'),
  btnClear: $('btnClear'),
  footer: $('footer'),
  btnTheme: $('btnTheme'),
  btnSettings: $('btnSettings'),
  settingsModal: $('settingsModal'),
  settingsNav: $('settingsNav'),
  settingsMain: $('settingsMain'),
  btnSettingsClose: $('btnSettingsClose'),
  dataPathBase: $('dataPathBase'),
  dataPathMsg: $('dataPathMsg'),
  btnChangeDataDir: $('btnChangeDataDir'),
  btnOpenDataDir: $('btnOpenDataDir'),
  btnHistory: $('btnHistory'),
  histBanner: $('histBanner'),
  histLabel: $('histLabel'),
  btnLive: $('btnLive'),
  histModal: $('histModal'),
  histList: $('histList'),
  histEmpty: $('histEmpty'),
  histSearch: $('histSearch'),
  msgFilter: $('msgFilter'),
  btnHistClose: $('btnHistClose'),
  btnHistRefresh: $('btnHistRefresh'),
  btnPickSession: $('btnPickSession'),
  btnOpenLogDir: $('btnOpenLogDir'),
  recordModal: $('recordModal'),
  recordTitle: $('recordTitle'),
  recordHint: $('recordHint'),
  recordMeta: $('recordMeta'),
  recordWS: $('recordWS'),
  recordHTTP: $('recordHTTP'),
  recordErr: $('recordErr'),
  recOut: $('recOut'),
  recIn: $('recIn'),
  recReqBody: $('recReqBody'),
  recResBody: $('recResBody'),
  btnRecordClose: $('btnRecordClose'),
  btnRecordCancel: $('btnRecordCancel'),
  btnRecordSave: $('btnRecordSave'),
  btnFmtRecOut: $('btnFmtRecOut'),
  btnFmtRecIn: $('btnFmtRecIn'),
  btnFmtRecReq: $('btnFmtRecReq'),
  btnFmtRecRes: $('btnFmtRecRes'),
};

const LIVE_LIST_CAP = 2000;

/** @type {Map<number, any>} */
const store = new Map();
/** @type {any[]} */
let allHistoryMsgs = [];
/** @type {any[]} */
let allLiveMsgs = [];
let selectedId = 0;
let lastSent = '';
let historyMode = false;
let workMode = 'doc';
let activeHistKeyword = '';
let historySessionURL = '';
let historySessionProtocol = '';
let fillFlashTimer = 0;
let lastHTTPExchange = null;
let httpDebugOn = false;
let httpBadgeState = { kind: 'pending', text: '待发送' };
/** @type {any[]} */
let profiles = [];
let histSearchTimer = 0;
let histSearchSeq = 0;
/** @type {{key:string,value:string,enabled:boolean}[]} */
let paramRows = [emptyRow()];
/** @type {{key:string,value:string,enabled:boolean}[]} */
let headerRows = [emptyRow()];
/** @type {{key:string,value:string,enabled:boolean}[]} */
let varRows = ensureHostVarRows([]);
/** @type {{name:string,variables:{key:string,value:string,enabled:boolean}[]}[]} */
let environments = [];
let activeEnv = '';
/** @type {{key:string,value:string,enabled:boolean}[]} */
let formRows = [emptyRow()];
const recordDraft = {
  in: '',
  resBody: '',
};
let authState = { type: 'none', token: '', user: '', pass: '' };
let bodyType = 'json';
let reqTab = 'body';
let syncingQuery = false;
let sending = false;
let moduleRun = null;
let persistTimer = 0;
let profileSaveQueue = Promise.resolve();
let suppressSessionReset = false;
let activeProfileName = '';
let urlPrefix = '';
let lastHostVarURL = '';

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistProfile(), 400);
}

function scheduleDefinitionPersist() {
  if (isDocMode()) schedulePersist();
}

function persistDefinitionNow() {
  if (isDocMode()) return persistProfile();
}

function queueProfileSave(profile) {
  const snapshot = JSON.parse(JSON.stringify(profile));
  const operation = profileSaveQueue.then(() => SaveProfile(snapshot));
  profileSaveQueue = operation.catch(() => {});
  return operation;
}

function dirLabel(dir) {
  if (dir === 'out') return '→';
  if (dir === 'in') return '←';
  return '·';
}

function preview(text) {
  if (!text) return '';
  const s = String(text);
  const head = s.length > 400 ? s.slice(0, 400) : s;
  return head.replace(/\s+/g, ' ').slice(0, 160);
}

function timeOnly(t) {
  if (!t) return '';
  const m = t.match(/(\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : t;
}

function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function msgMatches(m, kw) {
  if (!kw) return true;
  const q = kw.toLowerCase();
  const bag = `${m.text || ''} ${m.pretty || ''} ${m.dir || ''} ${m.time || ''}`.toLowerCase();
  return bag.includes(q);
}

/* —— theme —— */
function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(THEME_KEY, t);
  el.btnTheme.textContent = t === 'dark' ? '浅色' : '深色';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'dark' ? 'dark' : 'light');
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

function catalogHoverMode() {
  return localStorage.getItem(HOVER_KEY) === 'detail' ? 'detail' : 'title';
}

function setCatalogHoverMode(mode) {
  const next = mode === 'title' ? 'title' : 'detail';
  localStorage.setItem(HOVER_KEY, next);
  syncCatalogHoverRadios();
  hideCatalogTip();
}

function syncCatalogHoverRadios() {
  const mode = catalogHoverMode();
  for (const input of document.querySelectorAll('input[name="catalogHover"]')) {
    input.checked = input.value === mode;
  }
}

function settingsOpen() {
  return Boolean(el.settingsModal && !el.settingsModal.classList.contains('hidden'));
}

function showSettingsSection(name) {
  const id = name || 'catalog';
  for (const btn of el.settingsNav?.querySelectorAll('.settings-nav-item') || []) {
    btn.classList.toggle('on', btn.dataset.section === id);
  }
  for (const sec of el.settingsMain?.querySelectorAll('.settings-section') || []) {
    sec.classList.toggle('hidden', sec.dataset.section !== id);
  }
}

function closeSettings() {
  el.settingsModal?.classList.add('hidden');
  el.settingsModal?.setAttribute('aria-hidden', 'true');
}

function openSettings() {
  closeEnvEdit();
  closeGroupMenu();
  syncCatalogHoverRadios();
  refreshDataPaths();
  showSettingsSection(el.settingsNav?.querySelector('.settings-nav-item.on')?.dataset.section || 'catalog');
  el.settingsModal?.classList.remove('hidden');
  el.settingsModal?.setAttribute('aria-hidden', 'false');
}

let dataPathMsgTimer = 0;

function flashDataPathMsg(text) {
  if (!el.dataPathMsg) return;
  clearTimeout(dataPathMsgTimer);
  el.dataPathMsg.textContent = text || '';
  dataPathMsgTimer = setTimeout(() => {
    if (el.dataPathMsg) el.dataPathMsg.textContent = '';
  }, 2600);
}

function setDataPathDisplay(path) {
  if (!el.dataPathBase) return;
  const text = path || '';
  el.dataPathBase.textContent = text || '—';
  el.dataPathBase.dataset.path = text;
  el.dataPathBase.title = text ? '点击复制' : '';
}

async function refreshDataPaths() {
  try {
    const paths = await GetPaths();
    setDataPathDisplay(paths?.base || '');
  } catch (_) {
    setDataPathDisplay('');
  }
}

async function reloadAfterDataDirectoryChange(path) {
  if (el.footer && path) {
    el.footer.textContent = `数据: ${path}`;
    el.footer.title = path;
  }
  suppressSessionReset = true;
  try {
    await loadProfiles();
  } finally {
    suppressSessionReset = false;
  }
  try {
    const paths = await GetPaths();
    setDataPathDisplay(paths?.base || path || '');
    if (el.footer && paths?.base) {
      el.footer.textContent = `requests: ${paths.requests}   ·   servers: ${paths.servers}`;
      el.footer.title = `根目录: ${paths.base}`;
    }
  } catch (_) {}
}

/* —— messages —— */
function detailPlaceholder() {
  return httpDebugOn ? '发送后在这里看响应' : '选择一条消息';
}

function clearListUI() {
  store.clear();
  el.list.innerHTML = '';
  selectedId = 0;
  setDetailEmpty(detailPlaceholder());
  setFillButton(false);
}

function setState(status) {
  const s = (status?.state || 'idle').toLowerCase();
  const kind = (status?.kind || '').toLowerCase();
  let label = s;
  if (s === 'open' && kind === 'http') {
    const sch = urlScheme(status?.url);
    label = sch === 'https' ? 'https' : 'http';
  }
  if (!httpDebugOn) {
    el.state.textContent = label;
    el.state.className = 'state ' + s;
    const http = kind === 'http' || HTTP_SCHEMES.has(urlScheme(status?.url)) || isHTTPMode();
    el.state.classList.toggle('hidden', http);
  }
  el.btnToggle.textContent = s === 'open' || s === 'connecting' || s === 'reconnecting' ? '断开' : '连接';
  el.btnToggle.classList.toggle('on', s === 'open' || s === 'connecting' || s === 'reconnecting');
}

function httpDebugLayout() {
  if (historyMode || isDocMode()) return false;
  return Boolean(el.app?.classList.contains('http'));
}

function httpBadge(kind, text) {
  httpBadgeState = { kind, text };
  if (!el.state) return;
  el.state.textContent = text;
  el.state.className = `state ${kind}`;
  el.state.classList.toggle('hidden', !httpDebugLayout());
}

function resetHTTPResponse() {
  lastHTTPExchange = null;
  el.detail?.classList.remove('http-response');
  httpBadge('pending', '待发送');
  setDetailEmpty('发送后在这里看响应');
}

function markHTTPSending() {
  httpBadge('pending', '发送中');
  el.detail?.classList.remove('http-response');
  setDetailEmpty('发送中…');
}

function paintHTTPResult(ex) {
  lastHTTPExchange = ex || null;
  if (!ex) {
    resetHTTPResponse();
    return;
  }
  const code = ex.statusCode || 0;
  let kind = 'ok';
  if (ex.error && !code) kind = 'err';
  else if (code >= 400) kind = 'err';
  else if (code >= 300) kind = 'warn';
  else if (!code) kind = 'pending';
  const label = ex.status || (ex.error && !code ? '失败' : String(code || '—'));
  httpBadge(kind, label);
  setDetailHtml(renderHTTPResponse(ex));
  el.detail?.classList.add('http-response');
  setFillButton(false);
  setSaveExampleButton(false);
  setCopyDetailButton(true);
}

function isHTTPStatusNote(m) {
  if (!m || m.dir !== 'sys') return false;
  const t = String(m.text || m.pretty || '').trim();
  if (/^recorded\s+http\b/i.test(t)) return true;
  return /^http\s+\d{3}\b/i.test(t) && /\d+\s*ms/i.test(t);
}

function currentFilterKw() {
  return (el.msgFilter?.value || '').trim();
}

function currentMsgPool() {
  return historyMode ? allHistoryMsgs : allLiveMsgs;
}

function liveListTitleBase() {
  return isHTTPMode() ? '记录' : '消息';
}

function setLiveListTitle(shown, total, kw) {
  if (historyMode || !el.listTitle) return;
  const base = liveListTitleBase();
  el.listTitle.textContent = kw ? `${base} · ${shown}/${total}` : base;
}

function refreshFilterTitle() {
  if (historyMode) return;
  const pool = allLiveMsgs;
  const kw = currentFilterKw();
  setLiveListTitle(kw ? el.list.children.length : pool.length, pool.length, kw);
}

function removeListRow(id) {
  if (!id) return;
  store.delete(id);
  const row = el.list.querySelector(`[data-id="${id}"]`);
  row?.remove();
  if (selectedId === id) {
    selectedId = 0;
    setDetailEmpty(detailPlaceholder());
    setFillButton(false);
  }
}

function rememberLiveMsg(m) {
  if (!m || isHTTPStatusNote(m)) return false;
  if (allLiveMsgs.some((x) => x.id === m.id)) return false;
  allLiveMsgs.push(m);
  while (allLiveMsgs.length > LIVE_LIST_CAP) {
    const old = allLiveMsgs.shift();
    if (old) removeListRow(old.id);
  }
  return true;
}

function appendMsg(m, scroll = true) {
  if (!m || store.has(m.id) || isHTTPStatusNote(m)) return;
  store.set(m.id, m);

  const kw = currentFilterKw();
  if (kw && !msgMatches(m, kw)) {
    refreshFilterTitle();
    return;
  }

  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.id = String(m.id);
  row.innerHTML = `
    <span class="t">${timeOnly(m.time)}</span>
    <span class="d ${m.dir}">${dirLabel(m.dir)}</span>
    <span class="p"></span>
    <span class="b">${m.bytes || 0}b</span>
  `;
  row.querySelector('.p').textContent = imagePreviewLabel(m) || preview(m.pretty || m.text);
  row.title = '点击查看详情';
  row.addEventListener('click', () => selectMsg(m.id));
  el.list.appendChild(row);

  while (el.list.children.length > LIVE_LIST_CAP) {
    const first = el.list.firstElementChild;
    const id = Number(first?.dataset.id);
    if (id) store.delete(id);
    first?.remove();
  }

  refreshFilterTitle();
  if (scroll && !kw) {
    const nearBottom = el.list.scrollHeight - el.list.scrollTop - el.list.clientHeight < 80;
    if (nearBottom) el.list.scrollTop = el.list.scrollHeight;
  }
}

function renderMessageList(messages, { scrollTop = 0, selectFirst = false } = {}) {
  clearListUI();
  for (const m of messages || []) appendMsg(m, false);
  el.list.scrollTop = scrollTop;
  if (selectFirst && messages?.length) {
    selectMsg(messages[0].id);
  }
}

function setDetailEmpty(text) {
  el.detail.classList.add('empty');
  el.detail.classList.remove('http-response');
  el.detail.textContent = text;
  setFillButton(false);
  setSaveExampleButton(false);
  setCopyDetailButton(false);
}

function setDetailHtml(html) {
  el.detail.classList.remove('empty');
  el.detail.classList.remove('http-response');
  el.detail.innerHTML = html;
}

function headerValueCI(headers, name) {
  const want = String(name || '').toLowerCase();
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase() === want) return v;
  }
  return '';
}

function imagePreviewLabel(m) {
  const ct = String(headerValueCI(m?.exchange?.resHeaders, 'content-type') || '').toLowerCase();
  return ct.startsWith('image/') ? ct : '';
}

// Old image records lost their bytes in JSON; reuse a newer image for the same path,
// then fall back to the saved example image.
function legacyImageExchange(ex) {
  if (!ex || ex.resImage) return ex;
  const body = String(ex.resBody || '');
  if (body && !body.includes('\uFFFD')) return ex;
  if (!String(headerValueCI(ex.resHeaders, 'content-type')).toLowerCase().startsWith('image/')) return ex;
  const path = urlPathname(ex.url || '');
  if (!path) return ex;
  const sibling = allHistoryMsgs.find(
    (m) => m?.exchange?.resImage && urlPathname(m.exchange.url || '') === path,
  );
  if (sibling) return { ...ex, resImage: sibling.exchange.resImage };
  const hit = currentProfileRequests().find(
    (r) => isHTTPSaved(r) && isImageDataURL(r.example) && urlPathname(runtimeURLForSavedRequest(r.url)) === path,
  );
  return hit ? { ...ex, resImage: hit.example } : ex;
}

function paintMsgDetail(m) {
  if (!m) {
    setDetailEmpty(detailPlaceholder());
    return;
  }
  if (m.exchange) {
    if (httpDebugLayout()) {
      paintHTTPResult(m.exchange);
    } else {
      setDetailHtml(renderHTTPExchange(legacyImageExchange(m.exchange)));
      setFillButton(canFillFromMessage(m));
      setSaveExampleButton(false);
      setCopyDetailButton(true);
    }
    return;
  }
  if (m.ws) {
    setDetailHtml(renderWSRecord(m.ws));
  } else {
    setDetailHtml(renderDetailHtml(m.dir, m.time, m.pretty || m.text));
  }
  setFillButton(canFillFromMessage(m));
  setSaveExampleButton(canSaveExample(m));
  setCopyDetailButton(true);
}

let selectSeq = 0;

async function selectMsg(id) {
  selectedId = id;
  const seq = ++selectSeq;
  for (const node of el.list.children) {
    node.classList.toggle('active', Number(node.dataset.id) === id);
  }
  let m = store.get(id);
  if (!m) {
    setDetailEmpty(detailPlaceholder());
    setFillButton(false);
    return;
  }
  if (historyMode && m.slim) {
    setDetailEmpty('加载详情…');
    try {
      const full = await LoadSessionMessage(id);
      if (seq !== selectSeq || selectedId !== id) return;
      if (full) {
        store.set(id, full);
        m = full;
        const i = allHistoryMsgs.findIndex((x) => x.id === id);
        if (i >= 0) allHistoryMsgs[i] = full;
      }
    } catch (e) {
      if (seq !== selectSeq) return;
      setDetailEmpty('加载失败: ' + e);
      setFillButton(false);
      return;
    }
  }
  paintMsgDetail(m);
}

function setHistoryMode(on, label = '') {
  historyMode = on;
  el.app?.classList.toggle('history', on);
  el.histBanner.classList.toggle('hidden', !on);
  applyWorkMode();
  if (on) {
    el.listTitle.textContent = '历史消息';
    el.histLabel.textContent = label || '历史模式';
  } else {
    el.msgFilter.value = '';
    allHistoryMsgs = [];
    activeHistKeyword = '';
    setLiveListTitle(allLiveMsgs.length, allLiveMsgs.length, '');
  }
}

async function loadLiveMessages() {
  const arrived = [];
  allLiveMsgs = arrived;
  clearListUI();
  try {
    const msgs = await GetMessages(0, 500);
    const seen = new Set();
    const next = [];
    for (const m of msgs || []) {
      if (!m || isHTTPStatusNote(m) || seen.has(m.id)) continue;
      seen.add(m.id);
      next.push(m);
    }
    for (const m of arrived) {
      if (!m || seen.has(m.id)) continue;
      seen.add(m.id);
      next.push(m);
    }
    allLiveMsgs = next;
    applyMsgFilter({ selectFirst: false });
    if (!currentFilterKw()) el.list.scrollTop = el.list.scrollHeight;
  } catch (_) {
    allLiveMsgs = arrived.slice();
    applyMsgFilter({ selectFirst: false });
  }
}

async function exitHistoryMode() {
  historySessionURL = '';
  historySessionProtocol = '';
  setHistoryMode(false);
  await loadLiveMessages();
}

function applyMsgFilter({ selectFirst = false } = {}) {
  const pool = currentMsgPool();
  const kw = currentFilterKw();
  const filtered = kw ? pool.filter((m) => msgMatches(m, kw)) : pool;
  if (historyMode) {
    const namePart = el.histLabel.textContent || '历史';
    const base = namePart.replace(/\s*·\s*显示\s+\d+.*/, '');
    el.histLabel.textContent = kw
      ? `${base} · 显示 ${filtered.length}/${pool.length}`
      : base.includes('条')
        ? base
        : `${base} · ${pool.length} 条`;
    if (el.listTitle) el.listTitle.textContent = '历史消息';
  } else {
    setLiveListTitle(filtered.length, pool.length, kw);
  }
  const keepId = selectedId;
  renderMessageList(filtered, {
    scrollTop: kw || historyMode ? 0 : el.list.scrollHeight,
    selectFirst: selectFirst && filtered.length > 0,
  });
  if (!selectFirst && keepId && store.has(keepId)) {
    selectMsg(keepId);
  } else if (!selectFirst && !kw && !historyMode) {
    el.list.scrollTop = el.list.scrollHeight;
  }
}

function showSession(detail, keyword = '') {
  if (!detail) return;
  allHistoryMsgs = detail.messages || [];
  const url = detail.url || detail.info?.url || '';
  const name = historyItemTitle({ ...detail.info, url }) || 'log';
  historySessionURL = url;
  historySessionProtocol = detail.protocol || '';
  const n = allHistoryMsgs.length;
  const kw = (keyword || '').trim();
  activeHistKeyword = kw;
  setHistoryMode(true, `历史 · ${name}${url ? ' · ' + url : ''} · ${n} 条`);
  if (kw) {
    el.msgFilter.value = kw;
  } else {
    el.msgFilter.value = '';
  }
  applyMsgFilter({ selectFirst: false });
  closeHistoryModal();
}

/* —— scheme / http —— */
function urlScheme(url) {
  const m = String(url || '').trim().match(/^([a-z][a-z0-9+.-]*):\/\//i);
  return m ? m[1].toLowerCase() : '';
}

function currentScheme() {
  const s = urlScheme(currentURL());
  return ALL_SCHEMES.has(s) ? s : '';
}

function isHTTPMode() {
  return HTTP_SCHEMES.has(currentScheme());
}

function activeEnvironmentScheme() {
  const scheme = urlScheme(activeEnvironmentURL());
  return ALL_SCHEMES.has(scheme) ? scheme : '';
}

function isDefinitionHTTPMode() {
  if (!isDocMode()) return isHTTPMode();
  // The selected environment decides the transport. A previously selected
  // HTTP item must not keep HTTP controls visible after switching to WS/WSS.
  const environmentScheme = activeEnvironmentScheme();
  if (environmentScheme) return HTTP_SCHEMES.has(environmentScheme);
  const selected = currentSavedRequest();
  if (selected) return isHTTPSaved(selected);
  const scheme = currentScheme();
  return scheme ? HTTP_SCHEMES.has(scheme) : true;
}

function eventProfileName(v) {
  return String(v || '').trim();
}

function connectionProfileName() {
  return profileNameFromURL(currentURL()) || '';
}

function isCurrentProfileEvent(name) {
  const cur = connectionProfileName() || activeProfileName;
  const got = eventProfileName(name);
  if (!got) return true;
  if (!cur) return false;
  return got === cur;
}

async function activateCurrent() {
  const name = connectionProfileName();
  if (!name) return '';
  await SelectProfile(name);
  return name;
}

async function reloadLiveSession() {
  if (historyMode) {
    historySessionURL = '';
    historySessionProtocol = '';
    setHistoryMode(false);
  }
  try {
    setState(await GetStatus());
  } catch (_) {}
  await loadLiveMessages();
}

function withoutSessionReset(fn) {
  suppressSessionReset = true;
  try {
    return fn();
  } finally {
    suppressSessionReset = false;
  }
}

function applyTransportFromURL() {
  let scheme = activeEnvironmentScheme() || currentScheme();
  if (isDocMode()) {
    const selected = currentSavedRequest();
    if (!activeEnvironmentScheme()) {
      scheme = selected ? (isHTTPSaved(selected) ? 'http' : 'ws') : (scheme || 'http');
    }
  }
  if (ALL_SCHEMES.has(scheme)) applyTransportUI(scheme);
  else applyWorkMode();
}

function placePayload(http) {
  if (!el.payload) return;
  if (http && el.tabBody && el.payload.parentElement !== el.tabBody) {
    el.tabBody.appendChild(el.payload);
  } else if (!http && el.payloadOutCol && el.payload.parentElement !== el.payloadOutCol) {
    el.payloadOutCol.appendChild(el.payload);
  } else if (!http && !el.payloadOutCol && el.payloadWrap && el.payload.parentElement !== el.payloadWrap) {
    el.payloadWrap.appendChild(el.payload);
  }
}

function placeReqMeta(http) {
  if (!el.reqMeta) return;
  if (isDocMode() && el.docMeta && el.reqMeta.parentElement !== el.docMeta) {
    el.docMeta.appendChild(el.reqMeta);
  } else if (!isDocMode() && http && el.reqBuilder && el.reqMeta.parentElement !== el.reqBuilder) {
    el.reqBuilder.insertBefore(el.reqMeta, el.reqBuilder.firstChild);
  } else if (!isDocMode() && !http && el.composer && el.reqMeta.parentElement !== el.composer) {
    el.composer.insertBefore(el.reqMeta, el.composer.firstChild);
  }
  placeVarRows();
}

function shouldShowDocReqCol(req = currentSavedRequest()) {
  if (!isDocMode()) return true;
  const http = req ? isHTTPSaved(req) : isDefinitionHTTPMode();
  // HTTP 编辑时请求体在上方配置区，左列隐藏。
  if (docEditing() && http) return false;
  if (!req || !http) return true;
  if (String(docRequestText(req) || '').trim()) return true;
  // GET/HEAD 或 bodyType=none：无请求体，不占一列。
  return !(methodOmitsBody(req.method) || String(req.bodyType || '') === 'none');
}

function placeDocRequestEditor(http) {
  const editing = isDocMode() && docEditing();
  const config = el.docConfig;
  if (!config) return;

  config.classList.toggle('hidden', !editing);
  config.classList.toggle('http-config', editing && http);
  config.classList.toggle('ws-config', editing && !http);
  el.docReqCol?.classList.toggle('hidden', !shouldShowDocReqCol(currentSavedRequest()));
  el.urlWrap?.classList.remove('hidden');

  if (editing) {
    if (el.urlWrap) config.appendChild(el.urlWrap);
    if (el.protocol) config.appendChild(el.protocol);
    if (el.method) config.appendChild(el.method);
    if (el.redirectWrap) config.appendChild(el.redirectWrap);
    if (http) {
      if (el.reqBuilder) config.appendChild(el.reqBuilder);
      placePayload(true);
    } else {
      // HTTP's params/headers/auth/body builder is moved into docConfig while
      // editing. Move it and its payload back out when the environment becomes
      // WS/WSS, otherwise both the stale HTTP builder and WS request body show.
      if (el.reqBuilder && el.reqPane && el.reqBuilder.parentElement !== el.reqPane) {
        el.reqPane.appendChild(el.reqBuilder);
      }
      placePayload(false);
    }
    return;
  }

  const bar = el.app?.querySelector('.bar');
  if (bar) {
    if (el.urlWrap) bar.insertBefore(el.urlWrap, el.reconnectWrap);
    if (el.protocol) bar.insertBefore(el.protocol, el.reconnectWrap);
    if (el.method) bar.insertBefore(el.method, el.reconnectWrap);
    if (el.redirectWrap) bar.insertBefore(el.redirectWrap, el.btnToggle);
  }
  if (el.reqBuilder && el.reqPane && el.reqBuilder.parentElement !== el.reqPane) {
    el.reqPane.appendChild(el.reqBuilder);
  }
}

function placeVarRows() {
  if (!el.varRows || !el.envEdit) return;
  if (el.varRows.parentElement !== el.envEdit) el.envEdit.appendChild(el.varRows);
}

function isDocMode() {
  return workMode === 'doc' && !historyMode;
}

function docEditing() {
  return localStorage.getItem(DOC_EDIT_KEY) === 'on';
}

function setDocEditing(on) {
  const next = Boolean(on);
  if (!next) {
    flushDocEditors();
    flushReqMeta();
    // 先把参数 / 请求头 / 鉴权等写回当前接口，再切回只读展示。
    if (activeSavedId) persistProfile();
  }
  localStorage.setItem(DOC_EDIT_KEY, next ? 'on' : 'off');
  applyDocEditing();
  if (isDocMode()) renderDocPane({ reloadEditors: !next });
  if (next && isDocMode()) el.reqTitle?.focus();
}

function applyDocEditing() {
  const editing = isDocMode() && docEditing();
  // 文档模式只读；调试模式的请求面板是可编辑的临时副本。
  const locked = isDocMode() && !editing;
  el.app?.classList.toggle('doc-editing', editing);
  if (el.btnDocEdit) {
    el.btnDocEdit.setAttribute('aria-checked', editing ? 'true' : 'false');
    el.btnDocEdit.title = editing ? '关闭后名称、描述、请求和返回示例不可改' : '打开后可改名称、描述、请求和返回示例';
  }
  const fields = [el.reqTitle, el.reqModule, el.reqDesc, el.docReq, el.docRes];
  for (const node of fields) {
    if (node) node.readOnly = locked;
  }
  // 文档只读状态锁定接口定义；调试模式编辑的是不会落盘的临时副本。
  for (const node of [el.method, el.protocol]) {
    if (node) node.disabled = isDocMode() && !editing;
  }
  if (el.reqTitle) el.reqTitle.placeholder = locked ? '' : '标题，例如 登录';
  if (el.reqModule) el.reqModule.placeholder = locked ? '' : '模块';
  if (el.reqDesc) el.reqDesc.placeholder = locked ? '' : '描述（可选）';
  if (el.docReq) el.docReq.placeholder = locked ? '' : '请求体，可直接改';
  if (el.docRes) el.docRes.placeholder = locked ? '' : '返回示例，可直接改';
  el.docReqView?.classList.toggle('hidden', editing);
  el.docResView?.classList.toggle('hidden', editing);
  el.docReq?.classList.toggle('hidden', !editing);
  el.docRes?.classList.toggle('hidden', !editing);
  syncDocMetaEmpty();
  if (locked) {
    closeModuleMenu();
    paintDocViews(currentSavedRequest());
  }
  placeDocRequestEditor(isDefinitionHTTPMode());
}

function syncDocMetaEmpty() {
  const hideEmpty = isDocMode() && !docEditing();
  if (el.moduleWrap) {
    el.moduleWrap.classList.toggle('is-empty', hideEmpty && !currentReqModule());
  }
  if (el.reqDesc) {
    el.reqDesc.classList.toggle('is-empty', hideEmpty && !currentReqDesc());
  }
}

function readWorkMode() {
  // 每次启动先回到接口管理视图；本次会话中仍可自行切到调试。
  return 'doc';
}

async function setWorkMode(mode) {
  const next = mode === 'debug' ? 'debug' : 'doc';
  const previous = workMode;
  if (next === previous) return;
  if (next === 'debug' && previous === 'doc' && activeSavedId) {
    flushDocEditors();
    flushReqMeta();
    syncActiveRequestSnapshot();
    // 离开文档模式前保存文档草稿；进入调试后不再同步接口定义。
    await persistProfile('', { syncRequest: false });
  }
  workMode = next;
  localStorage.setItem(MODE_KEY, workMode);
  if (next === 'doc' && previous === 'debug') {
    const req = currentSavedRequest();
    if (req) {
      if (isHTTPSaved(req)) applySavedRequest(req);
      else applySavedWSMessage(req);
    }
  }
  if (historyMode) {
    await exitHistoryMode();
    applyWorkMode();
    return;
  }
  applyWorkMode();
}

function mountBarMenu() {
  const bar = el.app?.querySelector('.bar');
  if (el.method && bar && el.method.parentElement !== bar) {
    bar.insertBefore(el.method, el.btnSendTop ?? null);
  }
  if (el.urlWrap && bar && el.urlWrap.parentElement !== bar) {
    bar.insertBefore(el.urlWrap, el.btnSendTop ?? null);
  }
  el.barMenuWrap?.classList.remove('hidden');
  if (el.project && el.barMenuWrap) el.project.after(el.barMenuWrap);
}

function unmountBarMenu() {
  closeBarMenu();
  if (catalogMenuKey === 'project') closeGroupMenu();
  el.barMenuWrap?.classList.add('hidden');
}

function barMenuOpen() {
  return Boolean(el.barMenu && !el.barMenu.classList.contains('hidden'));
}

function openBarMenu() {
  if (!el.barMenu) return;
  closeEnvEdit();
  closeGroupMenu();
  el.barMenu.classList.remove('hidden');
  el.barMenu.setAttribute('aria-hidden', 'false');
  el.btnBarMenu?.setAttribute('aria-expanded', 'true');
}

function closeBarMenu() {
  if (!el.barMenu || el.barMenu.classList.contains('hidden')) return;
  el.barMenu.classList.add('hidden');
  el.barMenu.setAttribute('aria-hidden', 'true');
  el.btnBarMenu?.setAttribute('aria-expanded', 'false');
}

function toggleBarMenu() {
  if (barMenuOpen()) closeBarMenu();
  else openBarMenu();
}

function applyWorkMode() {
  const doc = isDocMode();
  const http = isDefinitionHTTPMode();
  const httpDebug = !doc && !historyMode && Boolean(el.app?.classList.contains('http'));
  const entered = httpDebug && !httpDebugOn;
  const left = !httpDebug && httpDebugOn;
  httpDebugOn = httpDebug;
  el.app?.classList.toggle('doc-mode', doc);
  el.app?.classList.toggle('http-debug', httpDebug);
  el.btnModeDoc?.classList.toggle('on', workMode === 'doc');
  el.btnModeDebug?.classList.toggle('on', workMode === 'debug');
  el.btnModeDoc?.setAttribute('aria-selected', workMode === 'doc' ? 'true' : 'false');
  el.btnModeDebug?.setAttribute('aria-selected', workMode === 'debug' ? 'true' : 'false');
  unmountBarMenu();
  if (doc && !historyMode) mountBarMenu();
  if (historyMode) {
    el.docPane?.classList.add('hidden');
    el.reqPane?.classList.add('hidden');
    el.composer?.classList.add('hidden');
    applyColumnLayout();
    return;
  }
  if (doc) {
    closeEnvEdit();
    el.docPane?.classList.remove('hidden');
    el.reqPane?.classList.add('hidden');
    el.composer?.classList.add('hidden');
    placeReqMeta(http);
    applyDocEditing();
    renderDocPane({ reloadEditors: true });
    applyColumnLayout();
    return;
  }
  el.app?.classList.remove('doc-editing');
  applyDocEditing();
  el.docPane?.classList.add('hidden');
  // HTTP 调试使用当前接口的临时副本；切回文档或切换接口时重新加载已保存定义。
  el.reqPane?.classList.toggle('hidden', !http);
  el.composer?.classList.toggle('hidden', httpDebug);
  placePayload(http);
  placeReqMeta(http);
  if (entered) resetHTTPResponse();
  else if (left) lastHTTPExchange = null;
  else if (httpDebug) httpBadge(httpBadgeState.kind, httpBadgeState.text);
  applyColumnLayout();
  activateCurrent().then(() => reloadLiveSession()).catch(() => {});
}

function prettyDocText(text) {
  const raw = String(text || '');
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return raw;
  }
}

function renderDocCode(text) {
  const shown = prettyDocText(text);
  if (!shown) return '<div class="doc-muted">无</div>';
  return `<pre class="doc-code">${highlightJson(shown)}</pre>`;
}

function docTableRows(rows) {
  return (rows || []).filter((r) => String(r?.key || '').trim()).map((r) => {
    const off = r.enabled === false ? ' class="off"' : '';
    return `<tr${off}><th scope="row">${escapeHtml(r.key)}</th><td>${escapeHtml(r.value || '')}</td></tr>`;
  }).join('');
}

function docTableBox(rows) {
  const body = docTableRows(rows);
  if (!body) return '';
  return (
    `<div class="doc-table-wrap">` +
      `<table class="doc-table">` +
        `<thead><tr><th>键</th><th>值</th></tr></thead>` +
        `<tbody>${body}</tbody>` +
      `</table>` +
    `</div>`
  );
}

function docTable(label, rows) {
  const box = docTableBox(rows);
  if (!box) return '';
  const head = label ? `<div class="doc-sec-head">${escapeHtml(label)}</div>` : '';
  return `<div class="doc-sec">${head}${box}</div>`;
}

function renderDocTable(label, rows) {
  return docTable(label, rows);
}

function renderDocAuthRows(req) {
  const t = String(req?.authType || 'none');
  if (!t || t === 'none') return [];
  let value = t;
  if (t === 'bearer' && req.authToken) value = `bearer · ${req.authToken}`;
  else if (t === 'basic' && req.authUser) value = `basic · ${req.authUser}`;
  return [{ key: 'Auth', value, enabled: true }];
}

function docResolvedURL(req) {
  const raw = runtimeURLForSavedRequest(req?.url || currentURL() || '');
  try {
    return expandVars(raw, currentVarMap()) || raw;
  } catch (_) {
    return raw;
  }
}

function docKV(rows, { keyless = false } = {}) {
  const list = (rows || []).filter((r) => String(keyless ? (r?.value ?? '') : (r?.key ?? '')).trim());
  if (!list.length) return '';
  return list.map((r) => {
    const off = r.enabled === false ? ' off' : '';
    if (keyless) {
      return `<div class="doc-kv one${off}"><span class="v">${escapeHtml(r.value ?? '')}</span></div>`;
    }
    return `<div class="doc-kv${off}"><span class="k">${escapeHtml(r.key ?? '')}</span><span class="v">${escapeHtml(r.value ?? '')}</span></div>`;
  }).join('');
}

function docHTTPSection(label, body) {
  if (!String(body || '').trim()) return '';
  return `<div class="doc-http-sec"><div class="doc-http-label">${escapeHtml(label)}</div><div class="doc-http-body">${body}</div></div>`;
}

function renderDocHTTPInfo(req) {
  const method = String(req?.method || 'GET').toUpperCase();
  const url = docResolvedURL(req);
  const query = parseQuery(url).filter((q) => String(q?.key || '').trim());
  return (
    `<div class="doc-http-head">` +
      `<span class="saved-item-method ${method.toLowerCase()}">${escapeHtml(method)}</span>` +
      `<span class="doc-http-url">${escapeHtml(url || '—')}</span>` +
    `</div>` +
    docHTTPSection('参数', docKV(query)) +
    docHTTPSection('请求头', docKV(req?.headerList)) +
    docHTTPSection('鉴权', docKV(renderDocAuthRows(req), { keyless: true }))
  );
}

function renderDocAuth(req) {
  const rows = renderDocAuthRows(req);
  if (!rows.length) return '';
  return renderDocTable('鉴权', rows);
}

function renderDocPane({ reloadEditors = false } = {}) {
  if (!el.docBody || !el.docEmpty) return;
  if (!activeEnvironmentURL()) {
    el.docEmpty.textContent = '请先新增环境，再新建接口。';
    el.docEmpty.classList.remove('hidden');
    el.docBody.classList.add('hidden');
    fillDocEditors(null);
    return;
  }
  const req = currentSavedRequest();
  if (!req) {
    el.docEmpty.textContent = '从左侧选择一个接口，查看说明、请求和返回示例。';
    el.docEmpty.classList.remove('hidden');
    el.docBody.classList.add('hidden');
    fillDocEditors(null);
    return;
  }
  el.docEmpty.classList.add('hidden');
  el.docBody.classList.remove('hidden');
  syncDocMetaEmpty();
  const http = isHTTPSaved(req);
  const reqHead = el.docReqCol?.querySelector?.('.doc-col-head span');
  if (reqHead) reqHead.textContent = http ? '请求体' : '请求';
  el.docReqCol?.classList.toggle('hidden', !shouldShowDocReqCol(req));
  if (el.docExtra) {
    el.docExtra.innerHTML = http ? renderDocHTTPInfo(req) : '';
  }
  if (reloadEditors || req.id !== docEditorReqId) fillDocEditors(req);
}

let docEditorReqId = '';

function docRequestText(req) {
  if (!req) return '';
  if (isHTTPSaved(req)) {
    if (req.bodyType === 'none') return '';
    if (req.bodyType === 'form') return formEncode(req.formList || []);
    return req.body || '';
  }
  return req.body || '';
}

function fillDocEditors(req) {
  const sameRequest = Boolean(req?.id) && req.id === docEditorReqId;
  const keepDraft = sameRequest && isDocMode() && docEditing();
  if (!keepDraft && el.docReq) el.docReq.value = req ? prettyDocText(docRequestText(req)) : '';
  if (!keepDraft && el.docRes) el.docRes.value = req ? prettyDocText(req.example || '') : '';
  paintDocViews(req);
  docEditorReqId = req?.id || '';
}

function isImageDataURL(text) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(text || '').trim());
}

function paintDocViews(req) {
  if (el.docReqView) {
    const text = req ? prettyDocText(docRequestText(req)) : '';
    el.docReqView.innerHTML = text ? renderDocCode(text) : '<div class="doc-muted">无</div>';
  }
  if (el.docResView) {
    const raw = req ? String(req.example || '') : '';
    if (isImageDataURL(raw)) {
      el.docResView.innerHTML = `<img class="doc-example-image" alt="返回示例图片" src="${escapeHtml(raw.trim())}">`;
    } else {
      const text = req ? prettyDocText(raw) : '';
      el.docResView.innerHTML = text ? renderDocCode(text) : '<div class="doc-muted">无</div>';
    }
  }
}

// Image responses become the request example so doc mode can show the real image.
function captureImageExample(id, dataURL) {
  if (!id || !isImageDataURL(dataURL)) return;
  const req = currentProfileRequests().find((r) => r.id === id);
  if (!req || requestKeyFrom(req) !== currentRequestKey()) return;
  req.example = dataURL;
  req.updatedAt = Date.now();
  if (activeSavedId === id) {
    recordDraft.resBody = dataURL;
    if (el.payloadIn) el.payloadIn.value = dataURL;
    if (el.docRes) el.docRes.value = dataURL;
    if (isDocMode()) paintDocViews(req);
  }
}

function applyDocRequestText(req, text) {
  const raw = String(text || '');
  if (!isHTTPSaved(req)) {
    req.body = raw;
    if (el.payload) el.payload.value = raw;
    return;
  }
  if (req.bodyType === 'form') {
    formRows = parseForm(raw);
    req.formList = cloneRows(formRows);
    req.body = formEncode(formRows);
    if (el.formRows) renderKV(el.formRows, formRows, schedulePersist);
    return;
  }
  if (req.bodyType === 'none' && raw.trim()) {
    setBodyType('json');
    req.bodyType = 'json';
  }
  req.body = raw;
  if (el.payload) el.payload.value = raw;
}

function applyDocExampleText(req, text) {
  const raw = String(text || '');
  req.example = raw;
  recordDraft.in = raw;
  if (isHTTPSaved(req)) recordDraft.resBody = raw;
  if (el.payloadIn) el.payloadIn.value = raw;
}

function flushDocEditors() {
  if (!isDocMode()) return;
  const req = currentSavedRequest();
  if (!req) return;
  // HTTP 文档编辑时，请求体使用请求配置中的编辑器；docReq 此时是隐藏的
  // 展示框，不能在自动保存时拿它的旧值覆盖真正的请求体。
  if (!isHTTPSaved(req) && el.docReq) applyDocRequestText(req, el.docReq.value);
  if (el.docRes) applyDocExampleText(req, el.docRes.value);
}

function onDocReqInput() {
  if (isDocMode() && !docEditing()) return;
  const req = currentSavedRequest();
  if (!req) return;
  applyDocRequestText(req, el.docReq.value);
  schedulePersist();
}

function onDocResInput() {
  if (isDocMode() && !docEditing()) return;
  const req = currentSavedRequest();
  if (!req) return;
  applyDocExampleText(req, el.docRes.value);
  schedulePersist();
}

function applyTransportUI(scheme) {
  if (!ALL_SCHEMES.has(scheme)) return;
  const http = HTTP_SCHEMES.has(scheme);
  const modeChanged = Boolean(el.app?.classList.contains('http')) !== http;
  el.app?.classList.toggle('http', http);
  syncURLPresentation(http);
  el.protocol.classList.toggle('hidden', http);
  el.method.classList.toggle('hidden', !http);
  el.reconnectWrap?.classList.toggle('hidden', http);
  el.redirectWrap?.classList.toggle('hidden', !http);
  el.tlsWrap?.classList.toggle('hidden', scheme !== 'https' && scheme !== 'wss');
  el.btnCurlDetail?.classList.toggle('hidden', !http);
  el.btnToggle?.classList.toggle('hidden', http);
  el.btnSendTop?.classList.toggle('hidden', !http);
  el.btnRecord?.classList.add('hidden');
  if (el.btnRecord) {
    el.btnRecord.title = http
      ? '保存到左侧接口：用当前请求配一条响应，不发送'
      : '保存到左侧接口：一对发送/返回，不发送';
  }
  applyWorkMode();
  if (!httpDebugOn) el.state?.classList.toggle('hidden', http);
  if (el.detailTitle) el.detailTitle.textContent = http ? '响应' : '详情';
  if (!historyMode) refreshFilterTitle();
  if (http && modeChanged) {
    syncParamsFromURL();
    renderRequestEditor();
    applyBodyTypeUI();
    setReqTab(reqTab || 'body');
  }
  if (modeChanged) renderCatalog();
  if (el.payload) {
    el.payload.placeholder = http
      ? '请求体  ·  Ctrl+Enter 发送'
      : '{"cmd":"ping"}  ·  Ctrl+Enter 发送';
  }
}

function originFromURL(url) {
  const raw = String(url || '').trim();
  if (!raw || isRootRelativePath(raw)) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `ws://${raw.replace(/^\/\//, '')}`;
    const u = new URL(withScheme);
    const scheme = (u.protocol || '').replace(/:$/, '').toLowerCase();
    if (!ALL_SCHEMES.has(scheme) || !u.host) return '';
    return `${scheme}://${u.host}`;
  } catch {
    return '';
  }
}

function splitLockedURL(url, lockName) {
  const raw = String(url || '').trim();
  const lockedURL = String(lockName || '').trim();
  let lockedPrefix = '';
  if (connectionURLReady(lockedURL)) {
    try {
      const locked = new URL(lockedURL);
      const path = String(locked.pathname || '').replace(/\/+$/, '');
      lockedPrefix = `${locked.protocol}//${locked.host}${path && path !== '/' ? path : ''}`;
    } catch (_) {}
  }
  if (!raw) {
    const name = lockedPrefix || lockedURL;
    return { prefix: name, rest: '' };
  }
  let prefix = lockedPrefix || originFromURL(raw);
  if (!prefix) {
    const name = String(lockName || currentProfile()?.name || profileNameFromURL(raw) || '').trim();
    if (name && raw.slice(0, name.length).toLowerCase() === name.toLowerCase()) prefix = name;
  }
  if (!prefix) return { prefix: '', rest: raw };
  let rest = raw;
  const prefixMatch = rest.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase();
  const boundary = rest.length === prefix.length || ['/','?','#'].includes(rest[prefix.length]);
  if (prefixMatch && boundary) {
    rest = rest.slice(prefix.length);
  } else if (lockedPrefix && !urlScheme(rest)) {
    rest = rest.startsWith('/') || rest.startsWith('?') || rest.startsWith('#')
      ? rest
      : `/${rest}`;
  } else {
    try {
      const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `ws://${raw.replace(/^\/\//, '')}`;
      const u = new URL(withScheme);
      rest = `${u.pathname || ''}${u.search || ''}${u.hash || ''}`;
    } catch {
      rest = '';
    }
  }
  if (rest === '/') rest = '';
  return { prefix, rest };
}

function setURL(url, lockName) {
  const raw = String(url || '').trim();
  const lock = String(lockName || activeEnvironmentURL() || '').trim();
  // Keep env origin for definition/storage helpers, but the top bar always edits the full URL.
  if (connectionURLReady(lock)) {
    urlPrefix = splitLockedURL(raw || lock, lock).prefix;
  } else if (connectionURLReady(raw)) {
    urlPrefix = splitLockedURL(raw, raw).prefix;
  } else {
    urlPrefix = '';
  }
  if (el.urlPrefix) {
    el.urlPrefix.textContent = '';
    el.urlPrefix.title = '';
    el.urlPrefix.classList.add('hidden');
    el.urlPrefix.setAttribute('aria-hidden', 'true');
  }
  if (el.url) {
    el.url.value = raw;
    el.url.readOnly = false;
    el.url.placeholder = 'http(s)://host/path 或 ws(s)://host/path';
  }
  syncURLPresentation(HTTP_SCHEMES.has(urlScheme(raw || urlPrefix)));
}

function syncURLPresentation(http = isHTTPMode()) {
  el.urlBox?.classList.remove('full-url');
  if (el.url) el.url.setAttribute('aria-hidden', 'false');
}

function currentURL() {
  return (el.url?.value || '').trim();
}

function normalizeURLPathInput() {
  // Full URL is edited as-is; environment prefix is no longer stripped into a locked chip.
}

function isHTTPURL(url) {
  return HTTP_SCHEMES.has(urlScheme(url));
}

function currentBodyType() {
  const picked = document.querySelector('input[name="bodyType"]:checked');
  return picked?.value || bodyType || 'json';
}

function applyBodyTypeUI() {
  bodyType = currentBodyType();
  el.app?.classList.toggle('body-none', bodyType === 'none');
  el.app?.classList.toggle('body-form', bodyType === 'form');
  el.formRows?.classList.toggle('hidden', bodyType !== 'form');
}

function syncAuthFields() {
  const t = el.authType?.value || 'none';
  authState.type = t;
  el.authToken?.classList.toggle('hidden', t !== 'bearer');
  el.authUser?.classList.toggle('hidden', t !== 'basic');
  el.authPass?.classList.toggle('hidden', t !== 'basic');
}

function setReqTab(tab) {
  const bodyOmitted = isDefinitionHTTPMode() && methodOmitsBody(el.method?.value);
  let next = tab === 'response' || tab === 'vars' ? 'body' : (tab || 'body');
  if (bodyOmitted && next === 'body') next = 'params';
  reqTab = next;
  for (const btn of el.reqTabs?.querySelectorAll('.req-tab') || []) {
    if (btn.dataset.tab === 'body') btn.classList.toggle('hidden', bodyOmitted);
    btn.classList.toggle('on', btn.dataset.tab === reqTab);
  }
  el.tabParams?.classList.toggle('hidden', reqTab !== 'params');
  el.tabHeaders?.classList.toggle('hidden', reqTab !== 'headers');
  el.tabAuth?.classList.toggle('hidden', reqTab !== 'auth');
  el.tabBody?.classList.toggle('hidden', bodyOmitted || reqTab !== 'body');
}

function syncParamsFromURL() {
  if (syncingQuery) return;
  paramRows = parseQuery(currentURL());
  if (el.paramRows) renderKV(el.paramRows, paramRows, onParamsChange);
}

function onParamsChange() {
  const url = currentURL();
  // Relative paths have no scheme but still carry a query worth editing.
  if (!urlScheme(url) && !isRootRelativePath(url)) return;
  syncingQuery = true;
  const next = applyQuery(url, paramRows);
  if (next) setURL(next, activeEnvironmentURL() || urlPrefix);
  syncingQuery = false;
  scheduleDefinitionPersist();
}

function headerBulkOn() {
  return Boolean(el.btnHeaderBulk?.getAttribute('aria-pressed') === 'true');
}

function closeHeaderPresetMenu() {
  el.headerPresetMenu?.classList.add('hidden');
  el.headerPresetMenu?.setAttribute('aria-hidden', 'true');
  el.btnHeaderPresets?.setAttribute('aria-expanded', 'false');
}

function placeHeaderPresetMenu() {
  const btn = el.btnHeaderPresets;
  const menu = el.headerPresetMenu;
  if (!btn || !menu || menu.classList.contains('hidden')) return;
  const host = el.app || document.body;
  if (menu.parentElement !== host) host.appendChild(menu);
  const r = btn.getBoundingClientRect();
  const width = Math.max(260, menu.offsetWidth || 260);
  let left = r.right - width;
  left = Math.min(left, window.innerWidth - width - 8);
  left = Math.max(8, left);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.right = 'auto';
  menu.style.top = `${Math.round(r.bottom + 4)}px`;
  menu.style.bottom = 'auto';
  menu.style.minWidth = `${width}px`;
  const h = menu.offsetHeight || 0;
  if (r.bottom + 4 + h > window.innerHeight - 8) {
    menu.style.top = `${Math.max(8, Math.round(r.top - h - 4))}px`;
  }
}

function openHeaderPresetMenu() {
  if (!el.headerPresetMenu || !el.btnHeaderPresets) return;
  el.headerPresetMenu.innerHTML = COMMON_HEADERS.map(([key, value]) => {
    const label = value ? `${key}: ${value}` : `${key}:`;
    return `<button type="button" class="saved-item" role="menuitem" data-key="${escapeHtml(key)}" data-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
  }).join('');
  el.headerPresetMenu.classList.remove('hidden');
  el.headerPresetMenu.setAttribute('aria-hidden', 'false');
  el.btnHeaderPresets.setAttribute('aria-expanded', 'true');
  placeHeaderPresetMenu();
}

function toggleHeaderPresetMenu() {
  if (el.headerPresetMenu && !el.headerPresetMenu.classList.contains('hidden')) closeHeaderPresetMenu();
  else openHeaderPresetMenu();
}

function headerKVOpts() {
  return {
    keyLabel: '键',
    valueLabel: '值',
    tools: el.headerTools || undefined,
  };
}

function placeHeaderToolsBar() {
  if (!el.headerTools || !el.tabHeaders) return;
  el.headerTools.classList.add('is-bar');
  el.tabHeaders.insertBefore(el.headerTools, el.headerRows || el.headerBulk || null);
}

function applyHeaderPreset(key, value) {
  headerRows = addHeaderPreset(headerRows, key, value);
  if (headerBulkOn()) {
    if (el.headerBulk) el.headerBulk.value = headersToText(headerRows);
  } else if (el.headerRows) {
    renderKV(el.headerRows, headerRows, scheduleDefinitionPersist, headerKVOpts());
  }
  closeHeaderPresetMenu();
  scheduleDefinitionPersist();
}

function setHeaderBulkMode(on) {
  const next = Boolean(on);
  el.btnHeaderBulk?.setAttribute('aria-pressed', next ? 'true' : 'false');
  el.btnHeaderBulk?.classList.toggle('on', next);
  el.tabHeaders?.classList.toggle('header-bulk-on', next);
  if (next) {
    if (el.headerBulk) el.headerBulk.value = headersToText(headerRows);
    el.headerRows?.classList.add('hidden');
    el.headerBulk?.classList.remove('hidden');
    placeHeaderToolsBar();
    el.headerBulk?.focus();
  } else {
    if (el.headerBulk) headerRows = headersFromText(el.headerBulk.value);
    el.headerBulk?.classList.add('hidden');
    el.headerRows?.classList.remove('hidden');
    if (el.headerRows) renderKV(el.headerRows, headerRows, scheduleDefinitionPersist, headerKVOpts());
    scheduleDefinitionPersist();
  }
}

function renderRequestEditor() {
  if (el.paramRows) renderKV(el.paramRows, paramRows, onParamsChange);
  if (headerBulkOn()) {
    if (el.headerBulk) el.headerBulk.value = headersToText(headerRows);
    el.headerRows?.classList.add('hidden');
    el.headerBulk?.classList.remove('hidden');
    placeHeaderToolsBar();
  } else {
    el.headerBulk?.classList.add('hidden');
    el.headerRows?.classList.remove('hidden');
    if (el.headerRows) renderKV(el.headerRows, headerRows, scheduleDefinitionPersist, headerKVOpts());
  }
  if (el.varRows) renderKV(el.varRows, varRows, onVarRowsChange, { lockHost: true });
  if (el.formRows) renderKV(el.formRows, formRows, scheduleDefinitionPersist);
}

function onVarRowsChange() {
  flushActiveEnv();
  const hostURL = envConnectionURL({ variables: varRows });
  if (hostURL) applyConnectionURL(hostURL);
  else if (lastHostVarURL) clearConnectionURL();
  schedulePersist();
}

function currentVarMap() {
  return varsFromRows(varRows);
}

function resolvedOpts() {
  const vars = currentVarMap();
  const opts = currentOpts();
  opts.url = expandVars(opts.url, vars);
  // A root-relative path is a request definition: resolve it against the active environment.
  if (isRootRelativePath(opts.url)) {
    const env = activeEnvironmentURL();
    if (env) opts.url = requestURLForEnvironment(opts.url, env);
  }
  opts.protocol = expandVars(opts.protocol, vars);
  opts.headers = expandMap(opts.headers, vars);
  return opts;
}

function resolvedBody() {
  return expandVars(currentBody(), currentVarMap());
}

function currentBody() {
  const t = currentBodyType();
  if (t === 'none') return '';
  if (t === 'form') return formEncode(formRows);
  return el.payload.value;
}

function loadAuthFromProfile(p) {
  authState = {
    type: p?.authType || 'none',
    token: p?.authToken || '',
    user: p?.authUser || '',
    pass: p?.authPass || '',
  };
  if (el.authType) el.authType.value = authState.type;
  if (el.authToken) el.authToken.value = authState.token;
  if (el.authUser) el.authUser.value = authState.user;
  if (el.authPass) el.authPass.value = authState.pass;
  syncAuthFields();
}

function loadHeadersFromProfile(p) {
  if (Array.isArray(p?.headerList) && p.headerList.length) {
    headerRows = cloneRows(p.headerList);
  } else {
    headerRows = rowsFromMap(p?.headers);
  }
}

function clipEnvName(name) {
  return clipText(name, 80);
}

function envNames() {
  return environments.map((e) => e.name);
}

function findEnv(name) {
  return environments.find((e) => e.name === name) || null;
}

function envRowsOf(env, fallbackURL) {
  return ensureHostVarRows(env?.variables, fallbackURL ?? currentURL());
}

function normalizedEnvironmentRows(rows, fallbackURL) {
  const next = ensureHostVarRows(rows, fallbackURL);
  const base = next.find((row) => ['base_url', 'baseurl', 'host', 'url'].includes(String(row?.key || '').trim().toLowerCase()));
  if (base && !connectionURLReady(base.value) && connectionURLReady(fallbackURL)) {
    base.value = String(fallbackURL).trim();
  }
  return next;
}

function envsFromProfile(p) {
	const stored = Array.isArray(p?.environments);
	const raw = stored ? p.environments : [];
  const out = [];
  const seen = new Set();
  for (const e of raw) {
    const name = clipEnvName(e?.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, variables: normalizedEnvironmentRows(e.variables, p?.url) });
  }
  let active = clipEnvName(p?.activeEnv);
  if (!out.some((e) => e.name === active)) active = out[0]?.name || '';
  return { envs: out, active };
}

function flushActiveEnv() {
	if (!environments.length) {
		activeEnv = '';
		return;
	}
  const name = clipEnvName(activeEnv) || environments[0]?.name || '';
  if (!name) return;
  activeEnv = name;
  let env = findEnv(name);
  if (!env) {
    env = { name, variables: [] };
    environments.push(env);
  }
  env.variables = ensureHostVarRows(varRows, currentURL());
}

function snapshotEnvironments() {
  flushActiveEnv();
  return environments.map((e) => ({
    name: e.name,
    variables: cloneRows(e.variables),
  }));
}

function renderEnvSelect() {
  const names = environments.map((e) => e.name).filter(Boolean);
  if (names.length && !names.includes(activeEnv)) activeEnv = names[0];
  renderBarEnvSelect();
  if (el.envEditName) el.envEditName.textContent = activeEnv || '';
}

function applyEnv(name) {
  // Save only the environment that was actually active. When the project had
  // no environment, flushActiveEnv() would select the newly appended one and
  // overwrite its fresh BASE_URL with the previous empty editor state.
  const previousEnv = findEnv(activeEnv);
  if (previousEnv) {
    previousEnv.variables = ensureHostVarRows(varRows, currentURL());
  }
  const env = findEnv(name);
  if (!env) return;
  const previousHostURL = lastHostVarURL;
  activeEnv = env.name;
  varRows = envRowsOf(env);
  renderEnvSelect();
  renderRequestEditor();
  const hostURL = envConnectionURL(env);
  applyConnectionURL(hostURL, previousHostURL);
  alignActiveRequestToEnvironment();
}

function uniqueEnvName(base) {
  const used = new Set(envNames());
  const stem = clipEnvName(base) || '环境';
  if (!used.has(stem)) return stem;
  const short = clipText(stem, 76) || '环境';
  for (let n = 2; n < 200; n++) {
    const cand = clipText(`${short} ${n}`, 80);
    if (cand && !used.has(cand)) return cand;
  }
  return clipText(`${short} ${Date.now()}`, 80);
}

function envNameFromURL(url) {
  const host = hostFromURL(url) || profileNameFromURL(url) || String(url || '').trim();
  return uniqueEnvName(host || '环境');
}

function findEnvByHostURL(url) {
  const want = normalizedEnvironmentURL(url);
  if (!want) return null;
  return environments.find((e) => normalizedEnvironmentURL(envConnectionURL(e)) === want) || null;
}

function normalizedEnvironmentURL(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (!ALL_SCHEMES.has(parsed.protocol.replace(':', '').toLowerCase()) || !parsed.hostname) return '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch {
    return '';
  }
}

function addEnvFromURL(url) {
  const hit = findEnvByHostURL(url);
  if (hit) {
    applyEnv(hit.name);
    return hit.name;
  }
  flushActiveEnv();
  const name = envNameFromURL(url);
  environments.push({ name, variables: ensureHostVarRows([], url) });
  applyEnv(name);
  return name;
}

async function addEnvironment() {
  if (!requireURL()) return;
  const raw = await askPrompt({
    title: '新建环境',
    placeholder: '例如 测试',
    hint: '同一套变量名，换一套值。发送时用当前环境替换 {{Token}}。',
    okText: '创建',
    validate: (s) => {
      const name = clipEnvName(s);
      if (!name) return '请输入环境名';
      if (envNames().includes(name)) return '已有同名环境';
      return '';
    },
  });
  if (raw == null) return;
  const name = clipEnvName(raw);
  if (!name) return;
  flushActiveEnv();
  environments.push({ name, variables: ensureHostVarRows([], currentURL()) });
  applyEnv(name);
  await persistProfile();
  openEnvEdit();
}

async function duplicateEnvironment() {
  if (!requireURL()) return;
  flushActiveEnv();
  const src = findEnv(activeEnv);
  if (!src) {
    setDetailEmpty('没有可复制的环境');
    return;
  }
  const name = uniqueEnvName(`${src.name} 副本`);
  environments.push({ name, variables: ensureHostVarRows(src?.variables, currentURL()) });
  applyEnv(name);
  await persistProfile();
  openEnvEdit();
}

async function renameEnvironment() {
  const from = activeEnv;
  const raw = await askPrompt({
    title: '重命名环境',
    value: from,
    placeholder: '环境名',
    okText: '保存',
    validate: (s) => {
      const name = clipEnvName(s);
      if (!name) return '请输入环境名';
      if (name !== from && envNames().includes(name)) return '已有同名环境';
      return '';
    },
  });
  if (raw == null) return;
  const to = clipEnvName(raw);
  if (!to || to === from) return;
  const env = findEnv(from);
  if (env) env.name = to;
  if (activeEnv === from) activeEnv = to;
  renderEnvSelect();
  await persistProfile();
}

async function deleteEnvironment() {
  const name = activeEnv;
  if (!name) return;
  const ok = await askConfirm({
    title: '删除环境',
    message: `确定删除环境「${name}」？其中的变量会一起删掉。`,
    okText: '删除',
  });
  if (!ok) return;
  const previousHostURL = envConnectionURL(findEnv(name));
  if (!isHTTPMode()) await Disconnect();
  environments = environments.filter((e) => e.name !== name);
  const next = environments[0] || null;
  activeEnv = next?.name || '';
  varRows = next ? envRowsOf(next) : [];
  renderEnvSelect();
  renderRequestEditor();
  if (next) {
    const nextHostURL = envConnectionURL(next);
    if (!applyConnectionURL(nextHostURL, previousHostURL)) clearConnectionURL();
  } else {
    clearConnectionURL();
    const profile = currentProfile();
    if (profile) profile.url = '';
  }
  // 删除环境只改变运行地址和环境集合，不能把旧地址写回当前接口。
  await persistProfile('', { syncRequest: false });
  if (next) {
    await activateCurrent();
    await reloadLiveSession();
  } else {
    setState({ state: 'idle', kind: '', url: '', protocol: '', method: '', session: '', msgCount: 0 });
  }
}

function envEditOpen() {
  return Boolean(el.envEdit && !el.envEdit.classList.contains('hidden'));
}

function closeEnvEdit() {
  el.envEdit?.classList.add('hidden');
}

function openEnvEdit() {
  if (!el.envEdit) return;
  if (el.envEditName) el.envEditName.textContent = activeEnv || '';
  el.envEdit.classList.remove('hidden');
  renderRequestEditor();
}

function openEnvMenu() {
  if (!el.btnEnvMore) return;
  closeEnvEdit();
  openCatalogMenu(el.btnEnvMore, 'env', [
    { act: 'vars', label: '编辑变量' },
    { act: 'add', label: '新建环境' },
    { act: 'duplicate', label: '复制环境' },
    { act: 'rename', label: '重命名' },
    { act: 'delete', label: '删除环境', danger: true },
  ]);
  el.btnEnvMore.setAttribute('aria-expanded', groupMenuOpen() ? 'true' : 'false');
}

function openProjectMenu() {
  if (!el.btnBarMenu) return;
  closeBarMenu();
  openCatalogMenu(el.btnBarMenu, 'project', [
    { act: 'new', label: '新建项目' },
    { act: 'rename', label: '重命名项目' },
    { act: 'delete', label: '删除项目', danger: true },
  ]);
  el.btnBarMenu.setAttribute('aria-expanded', groupMenuOpen() ? 'true' : 'false');
}

function loadVariablesFromProfile(p) {
  const { envs, active } = envsFromProfile(p);
  environments = envs;
  activeEnv = active;
  varRows = envRowsOf(findEnv(active));
  renderEnvSelect();
}

function loadBodyTypeFromProfile(p) {
  bodyType = p?.bodyType || 'json';
  const radio = document.querySelector(`input[name="bodyType"][value="${bodyType}"]`);
  if (radio) radio.checked = true;
  applyBodyTypeUI();
}

function loadBodyFromProfile(p) {
  const savedBody = p?.body || '';
  if (Array.isArray(p?.formList) && p.formList.length) {
    formRows = cloneRows(p.formList);
  } else if (p?.bodyType === 'form' && savedBody) {
    formRows = parseForm(savedBody);
  } else {
    formRows = [emptyRow()];
  }
  if (bodyType === 'form') {
    if (el.payload) el.payload.value = '';
  } else {
    if (el.payload) el.payload.value = savedBody;
  }
  lastSent = currentBody();
}

// A root-relative path has no host. Prefixing it with a scheme
// (`ws:///echo`) makes the URL parser treat `echo` as the host.
// `//echo` is protocol-relative and does name a host, so it stays out.
function isRootRelativePath(raw) {
  const text = String(raw || '').trim();
  return Boolean(text) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && /^(\/(?!\/)|[?#])/.test(text);
}

function hostFromURL(url) {
  const raw = String(url || '').trim();
  if (!raw || isRootRelativePath(raw)) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `ws://${raw.replace(/^\/\//, '')}`;
    return new URL(withScheme).hostname || '';
  } catch {
    return '';
  }
}

function defaultPort(scheme) {
  if (scheme === 'http' || scheme === 'ws') return '80';
  if (scheme === 'https' || scheme === 'wss') return '443';
  return '';
}

function hostPortFromURL(url) {
  const raw = String(url || '').trim();
  if (!raw || isRootRelativePath(raw)) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `ws://${raw.replace(/^\/\//, '')}`;
    const u = new URL(withScheme);
    const host = u.hostname || '';
    if (!host) return '';
    const port = u.port || '';
    const scheme = (u.protocol || '').replace(/:$/, '').toLowerCase();
    if (!port || port === defaultPort(scheme)) return host;
    return u.host || `${host}:${port}`;
  } catch {
    return '';
  }
}

function profileNameFromURL(url) {
  const host = hostPortFromURL(url);
  if (!host) return '';
  const s = urlScheme(url);
  return `${ALL_SCHEMES.has(s) ? s : 'ws'}://${host}`;
}

function setSaveExampleButton(on) {
  if (!el.btnSaveExample) return;
  el.btnSaveExample.classList.toggle('hidden', !on);
  if (!on) el.btnSaveExample.textContent = '写入示例';
}

let headerStamp = null;

function headerStampContext(opts, body) {
  const resolved = opts || resolvedOpts();
  const type = currentBodyType();
  const method = resolved.method || el.method?.value || 'GET';
  const sent = body !== undefined ? body : (isDefinitionHTTPMode() ? resolvedBody() : '');
  return {
    method,
    url: resolved.url || '',
    headerRows: cloneRows(headerRows),
    auth: {
      type: el.authType?.value || authState.type,
      token: el.authToken?.value || authState.token,
      user: el.authUser?.value || authState.user,
      pass: el.authPass?.value || authState.pass,
    },
    bodyType: type,
    hasBody: Boolean(String(sent || '').trim()) && type !== 'none' && !methodOmitsBody(method),
  };
}

function applyHeaderSources(ex, stamp) {
  if (!ex || ex.headerFrom || !stamp) return ex;
  ex.headerFrom = sentHeaderSources(ex.reqHeaders, stamp);
  return ex;
}

function exchangeMatchesStamp(ex, stamp) {
  if (!ex || !stamp) return false;
  if (stamp.method && ex.method && String(stamp.method).toUpperCase() !== String(ex.method).toUpperCase()) return false;
  if (stamp.url && ex.url && stamp.url !== ex.url) return false;
  return true;
}

function setFillButton(on) {
  if (!el.btnFill) return;
  el.btnFill.classList.toggle('hidden', !on);
  if (!on) {
    el.btnFill.textContent = '填回';
    clearTimeout(fillFlashTimer);
  }
}

function setCopyDetailButton(on) {
  if (!el.btnCopyDetail) return;
  el.btnCopyDetail.classList.toggle('hidden', !on);
  if (!on) el.btnCopyDetail.textContent = '复制';
}

function detailCopyText(m) {
  if (!m) return '';
  let raw = '';
  if (m.dir === 'out') {
    raw = m.exchange?.reqBody || m.ws?.out || m.text || m.pretty || '';
  } else if (m.dir === 'in') {
    raw = m.exchange?.resBody || m.ws?.in || m.pretty || m.text || '';
  } else {
    raw = m.pretty || m.text || '';
  }
  return prettyDocText(raw) || raw;
}

async function copySelectedDetail() {
  let text = '';
  if (httpDebugLayout() && lastHTTPExchange) {
    text = lastHTTPExchange.resBody || lastHTTPExchange.error || '';
  } else {
    text = detailCopyText(store.get(selectedId));
  }
  const ok = await copyText(text);
  flashButton(el.btnCopyDetail, ok ? '已复制' : '复制失败');
}

function flashFilled() {
  if (!el.btnFill || el.btnFill.classList.contains('hidden')) return;
  el.btnFill.textContent = '已填回';
  clearTimeout(fillFlashTimer);
  fillFlashTimer = setTimeout(() => {
    if (el.btnFill) el.btnFill.textContent = '填回';
  }, 900);
}

function siblingFillSource(m) {
  if (!m) return null;
  const ids = [...el.list.children].map((n) => Number(n.dataset.id));
  const idx = ids.indexOf(m.id);
  if (idx < 0) return null;
  const at = (i) => store.get(ids[i]);
  const tagged = (n) => (n?.exchange || n?.ws ? n : null);
  if (m.dir === 'out') {
    for (let i = idx + 1; i < ids.length && i <= idx + 4; i++) {
      const n = at(i);
      if (!n || n.dir === 'sys') continue;
      return tagged(n);
    }
  } else if (m.dir === 'in') {
    for (let i = idx - 1; i >= 0 && i >= idx - 4; i--) {
      const n = at(i);
      if (!n || n.dir === 'sys') continue;
      return tagged(n);
    }
  } else {
    for (let i = idx - 1; i >= 0 && i >= idx - 4; i--) {
      const n = at(i);
      if (tagged(n)) return n;
      if (n && n.dir !== 'sys') break;
    }
    for (let i = idx + 1; i < ids.length && i <= idx + 4; i++) {
      const n = at(i);
      if (tagged(n)) return n;
      if (n && n.dir !== 'sys') break;
    }
  }
  return null;
}

function applyAuthState(auth) {
  authState = {
    type: auth?.type || 'none',
    token: auth?.token || '',
    user: auth?.user || '',
    pass: auth?.pass || '',
  };
  if (el.authType) el.authType.value = authState.type;
  if (el.authToken) el.authToken.value = authState.token;
  if (el.authUser) el.authUser.value = authState.user;
  if (el.authPass) el.authPass.value = authState.pass;
  syncAuthFields();
}

function setBodyType(type, { syncContentType = false } = {}) {
  bodyType = type || 'json';
  const radio = document.querySelector(`input[name="bodyType"][value="${bodyType}"]`);
  if (radio) radio.checked = true;
  applyBodyTypeUI();
  if (syncContentType && bodyType !== 'none') {
    headerRows = syncHeaderContentType(headerRows, bodyType);
    renderRequestEditor();
  }
}

function fillRecordResponse(ex) {
  recordDraft.resBody = ex?.resBody || '';
  if (recordModalOpen()) {
    applyRecordDraftToForm();
  }
}

function selectProfileHost(url) {
  renderProjectSelect();
}

function applyHTTPExchange(ex) {
  if (!ex?.url) return false;
  const vars = currentVarMap();
  setURL(keepTemplate(currentURL(), ex.url, vars));
  const method = (ex.method || 'GET').toUpperCase();
  if (el.method && [...el.method.options].some((o) => o.value === method)) {
    el.method.value = method;
  } else if (el.method) {
    el.method.value = 'GET';
  }
  setReqTab(reqTab);
  const auth = parseAuthorization(ex.reqHeaders);
  const curAuth = {
    type: el.authType?.value || authState.type,
    token: el.authToken?.value || authState.token,
    user: el.authUser?.value || authState.user,
    pass: el.authPass?.value || authState.pass,
  };
  if (curAuth.type === auth.type || auth.type === 'none') {
    auth.token = keepTemplate(curAuth.token, auth.token, vars);
    auth.user = keepTemplate(curAuth.user, auth.user, vars);
    auth.pass = keepTemplate(curAuth.pass, auth.pass, vars);
    if (auth.type === 'none' && (looksLikeVarRef(curAuth.token) || looksLikeVarRef(curAuth.user))) {
      auth.type = curAuth.type;
      auth.token = curAuth.token;
      auth.user = curAuth.user;
      auth.pass = curAuth.pass;
    }
  }
  applyAuthState(auth);
  const bodyTypeGuess = guessBodyType(ex.reqHeaders, ex.reqBody, ex.method);
  setBodyType(bodyTypeGuess);
  const incomingHeaders = editorHeadersFromRequest(ex.reqHeaders, {
    stripAuth: auth.type !== 'none',
    stripContentType: bodyTypeGuess !== 'none',
  });
  headerRows = keepTemplatesInRows(incomingHeaders, headerRows, vars);
  if (bodyTypeGuess === 'form') {
    formRows = keepTemplatesInRows(parseForm(ex.reqBody), formRows, vars);
    if (el.payload) el.payload.value = '';
  } else {
    formRows = [emptyRow()];
    if (el.payload) {
      el.payload.value = bodyTypeGuess === 'none'
        ? ''
        : keepTemplate(el.payload.value, ex.reqBody || '', vars);
    }
  }
  fillRecordResponse(ex);
  lastSent = currentBody();
  withoutSessionReset(() => applyTransportFromURL());
  syncParamsFromURL();
  renderRequestEditor();
  selectProfileHost(currentURL());
  setReqTab(String(ex.reqBody || '').trim() ? 'body' : 'params');
  return true;
}

function looksLikeVarRef(s) {
  return String(s || '').includes('{{');
}

function applyWSRecord(rec) {
  if (!rec) return false;
  const vars = currentVarMap();
  if (rec.url) setURL(keepTemplate(currentURL(), rec.url, vars));
  if (el.protocol) el.protocol.value = keepTemplate(el.protocol.value, rec.protocol || '', vars);
  if (el.payload) el.payload.value = keepTemplate(el.payload.value, rec.out || '', vars);
  recordDraft.in = keepTemplate(recordDraft.in, rec.in || '', vars);
  lastSent = rec.out || lastSent;
  if (recordModalOpen()) applyRecordDraftToForm();
  withoutSessionReset(() => applyTransportFromURL());
  selectProfileHost(rec.url);
  return Boolean(rec.url || rec.out || rec.in);
}

function fillPlainMessage(m) {
  if (!m || (m.dir !== 'out' && m.dir !== 'in')) return false;
  const hint = parseHTTPOutPreview(m.text);
  const url = historySessionURL || currentURL();
  const sch = urlScheme(hint?.url || url || currentURL());
  if (hint) {
    return applyHTTPExchange({
      method: hint.method,
      url: hint.url,
      reqHeaders: {},
      reqBody: '',
      resHeaders: {},
      resBody: '',
    });
  }
  if (HTTP_SCHEMES.has(sch) || isHTTPMode()) {
    if (historySessionURL) {
      setURL(historySessionURL);
      withoutSessionReset(() => applyTransportFromURL());
    }
    if (m.dir === 'out') {
      if (el.payload) el.payload.value = m.text || '';
      setBodyType(guessBodyType({}, m.text, el.method?.value));
      lastSent = currentBody();
      setReqTab('body');
    } else {
      recordDraft.resBody = m.text || '';
      if (recordModalOpen() && el.recResBody) el.recResBody.value = recordDraft.resBody;
    }
    return true;
  }
  if (historySessionURL) {
    setURL(historySessionURL);
    const proto = historySessionProtocol;
    if (el.protocol && proto && proto !== 'ws' && proto !== 'wss' && !HTTP_SCHEMES.has(proto.toLowerCase())) {
      el.protocol.value = proto;
    }
    withoutSessionReset(() => applyTransportFromURL());
  }
  if (m.dir === 'out' && el.payload) {
    el.payload.value = m.text || '';
    lastSent = el.payload.value;
  }
  if (m.dir === 'in') {
    recordDraft.in = m.text || '';
    if (recordModalOpen() && el.recIn) el.recIn.value = recordDraft.in;
  }
  return true;
}

function canFillFromMessage(m) {
  if (!m || m.dir !== 'out') return false;
  if (m.exchange || m.ws) return true;
  const near = siblingFillSource(m);
  if (near?.exchange || near?.ws) return true;
  return true;
}

function fillFromMessage(m) {
  if (!m) return false;
  if (m.exchange) return applyHTTPExchange(m.exchange);
  if (m.ws) return applyWSRecord(m.ws);
  const near = siblingFillSource(m);
  if (near?.exchange) return applyHTTPExchange(near.exchange);
  if (near?.ws) return applyWSRecord(near.ws);
  return fillPlainMessage(m);
}

/* —— profiles / project + env —— */
function readSel() {
  try {
    return JSON.parse(localStorage.getItem(SEL_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function rememberSelection() {
  try {
    const prev = readSel();
    const project = projectNameOf(currentProfile());
    const envs = { ...(prev.envs || {}) };
    if (project && activeEnv) envs[project] = activeEnv;
    localStorage.setItem(SEL_KEY, JSON.stringify({
      project,
      env: activeEnv,
      host: currentProfile()?.name || '',
      envs,
    }));
  } catch {
    /* ignore */
  }
}

function lastEnvForProject(project) {
  const sel = readSel();
  const named = sel.envs?.[project];
  if (named) return named;
  if (sel.project === project && sel.env) return sel.env;
  return firstEnvOfProject(project);
}

function projectNameOf(p) {
  const named = String(p?.project || '').trim();
  if (named) return named;
  return String(p?.name || profileNameFromURL(p?.url) || '').trim();
}

function currentProjectName() {
  return projectNameOf(currentProfile()) || String(el.project?.value || '').trim();
}

function isExplicitProject(name) {
  const n = String(name || '').trim();
  return Boolean(n) && !n.includes('://');
}

function profilesInProject(project) {
  const name = String(project || '').trim();
  if (!name) return [];
  return (profiles || []).filter((p) => projectNameOf(p) === name);
}

function projectCatalogProfile(project) {
  const members = profilesInProject(project);
  if (!members.length) return null;
  if (!isExplicitProject(project) || members.length === 1) return members[0];
  let best = members[0];
  for (const p of members) {
    if ((p.requests || []).length > (best.requests || []).length) best = p;
  }
  return best;
}

function uniqueProjectNames() {
  const out = [];
  const seen = new Set();
  for (const p of profiles || []) {
    const name = projectNameOf(p);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function projectNameExists(name, except = '') {
  const want = String(name || '').trim().toLocaleLowerCase();
  const skip = String(except || '').trim().toLocaleLowerCase();
  if (!want) return false;
  return uniqueProjectNames().some((item) => {
    const value = String(item || '').trim().toLocaleLowerCase();
    return value === want && value !== skip;
  });
}

function normalizeProjectName(value) {
  return clipText(value, 80);
}

async function createProject() {
  const rawName = await askPrompt({
    title: '新建项目',
    placeholder: '例如：设备管控',
    hint: '项目用于归类地址、环境和接口目录。',
    okText: '下一步',
    validate: (value) => {
      const name = normalizeProjectName(value);
      if (!name) return '请输入项目名称';
      if (projectNameExists(name)) return '已有同名项目';
      return '';
    },
  });
  if (rawName == null) return;
  const project = normalizeProjectName(rawName);
  if (!project) return;

  clearTimeout(persistTimer);
  clearEditor();
  const profile = {
    name: `project:${project}`,
    url: '',
    project,
    protocol: '',
    method: 'GET',
    headers: {},
    headerList: cloneRows(headerRows),
    variableList: [],
    activeEnv: '',
    environments: [],
    authType: 'none',
    authToken: '',
    authUser: '',
    authPass: '',
    bodyType: 'json',
    body: '',
    formList: cloneRows(formRows),
    reconnect: true,
    pingSec: 20,
    noFollowRedirects: false,
    requests: [],
    modules: [],
  };
  try {
    await queueProfileSave(profile);
    profiles = (await GetProfiles()) || [];
    const saved = profiles.find((p) => String(p.project || '').trim() === project) || profile;
    await applyProfile(saved);
  } catch (e) {
    setDetailEmpty('创建项目失败: ' + e);
  }
}

async function renameCurrentProject() {
  if (!isDocMode()) return;
  const current = currentProjectName();
  if (!current) return;
  const rawName = await askPrompt({
    title: '重命名项目',
    value: current,
    placeholder: '项目名称',
    hint: '项目下的所有地址、环境和接口目录会保留。',
    okText: '保存',
    validate: (value) => {
      const name = normalizeProjectName(value);
      if (!name) return '请输入项目名称';
      if (projectNameExists(name, current)) return '已有同名项目';
      return '';
    },
  });
  if (rawName == null) return;
  const nextName = normalizeProjectName(rawName);
  if (!nextName || nextName === current) return;

  await persistProfile();
  const members = profilesInProject(current);
  if (!members.length) return;
  try {
    for (const profile of members) {
      await queueProfileSave({ ...profile, project: nextName });
    }
    profiles = (await GetProfiles()) || [];
    const selected = profiles.find((p) => p.name === activeProfileName)
      || profilesInProject(nextName)[0];
    if (selected) await applyProfile(selected);
  } catch (e) {
    setDetailEmpty('重命名项目失败: ' + e);
  }
}

async function deleteCurrentProject() {
  if (!isDocMode()) return;
  const project = currentProjectName();
  const members = profilesInProject(project);
  if (!project || !members.length) return;
  const ok = await askConfirm({
    title: '删除项目',
    message: `确定删除项目“${project}”吗？这会删除其全部接口和 ${members.reduce((n, p) => n + (p.environments || []).length, 0)} 个环境，且不可恢复。`,
    okText: '删除项目',
  });
  if (!ok) return;

  clearTimeout(persistTimer);
  try {
    for (const profile of members) {
      await DeleteProfile(profile.name);
    }
    profiles = (await GetProfiles()) || [];
    if (profiles.length) {
      await applyProfile(profiles[0]);
    } else {
      clearEditor();
      renderProjectSelect();
      if (el.docEmpty) {
        el.docEmpty.textContent = '还没有项目。点右上角「新建项目」开始。';
        el.docEmpty.classList.remove('hidden');
      }
      el.docBody?.classList.add('hidden');
    }
  } catch (e) {
    setDetailEmpty('删除项目失败: ' + e);
  }
}

function envConnectionURL(env) {
  const rows = Array.isArray(env?.variables) ? env.variables : [];
  const row = rows.find((r) => {
    const key = String(r?.key || '').trim().toLowerCase();
    return ['base_url', 'baseurl', 'host', 'url'].includes(key)
      && r?.enabled !== false && String(r?.value || '').trim();
  });
  return row ? String(row.value).trim() : '';
}

function connectionURLReady(url) {
  const raw = String(url || '').trim();
  if (!raw || !ALL_SCHEMES.has(urlScheme(raw))) return false;
  try {
    return Boolean(new URL(raw).hostname);
  } catch {
    return false;
  }
}

function environmentURLWithRequestPath(environmentURL, requestURL, previousEnvironmentURL) {
  const raw = String(environmentURL || '').trim();
  const current = String(requestURL || '').trim();
  if (!raw || !current) return raw;
  try {
    const target = new URL(raw);
    const request = new URL(current);
    const previous = previousEnvironmentURL ? new URL(previousEnvironmentURL) : null;
    const trimBasePath = (path) => {
      const value = String(path || '').replace(/\/+$/, '');
      return value === '/' ? '' : value;
    };
    const previousBase = trimBasePath(previous?.pathname);
    let requestPath = request.pathname || '/';
    if (previousBase && (requestPath === previousBase || requestPath.startsWith(`${previousBase}/`))) {
      requestPath = requestPath.slice(previousBase.length) || '/';
    }
    const targetBase = trimBasePath(target.pathname);
    target.pathname = `${targetBase}${requestPath.startsWith('/') ? requestPath : `/${requestPath}`}` || '/';
    target.search = request.search;
    target.hash = request.hash;
    return target.toString();
  } catch {
    return raw;
  }
}

function environmentURLForStoredRequest(requestURL) {
  const raw = String(requestURL || '').trim();
  let request;
  try {
    request = new URL(raw);
  } catch {
    return '';
  }
  let best = '';
  let bestPathLength = -1;
  for (const env of environments) {
    const candidate = envConnectionURL(env);
    try {
      const base = new URL(candidate);
      const basePath = String(base.pathname || '').replace(/\/+$/, '');
      const requestPath = request.pathname || '/';
      if (request.origin !== base.origin) continue;
      if (basePath && basePath !== '/' && requestPath !== basePath && !requestPath.startsWith(`${basePath}/`)) continue;
      if (basePath.length > bestPathLength) {
        best = candidate;
        bestPathLength = basePath.length;
      }
    } catch {
      /* ignore invalid legacy environment URL */
    }
  }
  return best;
}

function storedRequestDefinitionURL(requestURL) {
  return requestDefinitionURL(requestURL, environmentURLForStoredRequest(requestURL));
}

function activeEnvironmentURL() {
  return envConnectionURL(findEnv(activeEnv));
}

function runtimeURLForSavedRequest(requestURL) {
  const definition = storedRequestDefinitionURL(requestURL);
  const environmentURL = activeEnvironmentURL();
  return environmentURL ? requestURLForEnvironment(definition, environmentURL) : String(requestURL || '').trim();
}

function applyConnectionURL(url, previousEnvironmentURL = lastHostVarURL) {
  const raw = String(url || '').trim();
  if (!connectionURLReady(raw)) return false;
  const nextHost = profileNameFromURL(raw);
  const nextURL = isDefinitionHTTPMode()
    ? environmentURLWithRequestPath(raw, currentURL(), previousEnvironmentURL)
    : raw;
  lastHostVarURL = raw;
  if (currentURL() === nextURL && (profileNameFromURL(currentURL()) || activeProfileName) === nextHost) return false;
  setURL(nextURL, raw);
  applyTransportFromURL();
  syncParamsFromURL();
  return true;
}

function clearConnectionURL() {
  lastHostVarURL = '';
  if (!currentURL()) return false;
  setURL('');
  applyTransportFromURL();
  syncParamsFromURL();
  return true;
}

function findProjectEnvDef(project, envName) {
  const want = String(envName || '').trim();
  if (!want) return null;
  let fallback = null;
  for (const p of profilesInProject(project)) {
    const hit = (p.environments || []).find((e) => String(e?.name || '').trim() === want);
    if (!hit) continue;
    if (connectionURLReady(envConnectionURL(hit))) return hit;
    if (!fallback) fallback = hit;
  }
  return fallback || environments.find((e) => e.name === want) || null;
}

function projectEnvNames(project) {
  const names = [];
  const seen = new Set();
  const add = (raw) => {
    const n = String(raw || '').trim();
    if (!n || seen.has(n)) return;
    seen.add(n);
    names.push(n);
  };
  for (const p of profilesInProject(project)) {
    for (const e of p.environments || []) add(e?.name);
  }
  for (const e of environments) add(e?.name);
  return names;
}

function profileForProjectEnv(project, envName) {
  if (isExplicitProject(project)) {
    const owner = projectCatalogProfile(project);
    if (owner) return owner;
  }
  const members = profilesInProject(project);
  if (!members.length) return null;
  const envDef = findProjectEnvDef(project, envName);
  const hostURL = envConnectionURL(envDef);
  const hostName = profileNameFromURL(hostURL);
  if (hostName) {
    const hit = members.find((p) => p.name === hostName || profileNameFromURL(p.url) === hostName);
    if (hit) return hit;
  }
  const usable = members.filter((p) => {
    const e = (p.environments || []).find((x) => String(x?.name || '').trim() === envName);
    return connectionURLReady(envConnectionURL(e)) || connectionURLReady(p.url);
  });
  if (envName) {
    const byActive = usable.find((p) => String(p.activeEnv || '').trim() === envName);
    if (byActive) return byActive;
    if (usable.length) return usable[0];
  }
  return members[0];
}

function firstEnvOfProject(project) {
  const names = projectEnvNames(project);
  return names[0] || '';
}

function fillSelect(node, items, selected) {
  if (!node) return;
  node.innerHTML = '';
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item;
    opt.textContent = item;
    node.appendChild(opt);
  }
  if (selected && items.includes(selected)) node.value = selected;
  else if (items.length) node.value = items[0];
}

function renderBarEnvSelect() {
  if (!el.barEnv) return;
  const project = currentProjectName();
  const names = projectEnvNames(project);
  const cur = names.includes(activeEnv) ? activeEnv : (names[0] || '');
  fillSelect(el.barEnv, names, cur);
  el.barEnv.disabled = names.length === 0;
}

function renderProjectSelect() {
  const projects = uniqueProjectNames();
  const curProject = currentProjectName() || projects[0] || '';
  fillSelect(el.project, projects, curProject);
  if (el.project) el.project.disabled = projects.length === 0;
  renderBarEnvSelect();
  if (el.btnDelProfile) el.btnDelProfile.disabled = environments.length === 0;
}

async function selectProject(name) {
  closeEnvEdit();
  const project = String(name || '').trim();
  if (!project || project === currentProjectName()) {
    renderProjectSelect();
    return;
  }
  const hint = currentRequestHint();
  const env = lastEnvForProject(project);
  const target = profileForProjectEnv(project, env);
  if (!target) {
    renderProjectSelect();
    return;
  }
  clearTimeout(persistTimer);
  await persistProfile();
  await applyProfile(target, hint);
  if (env && activeEnv !== env) applyEnv(env);
  if (hint) restoreRequestFromHint(hint);
  rememberSelection();
}

async function selectEnvironment(name) {
  const envName = String(name || '').trim();
  if (!envName) return;
  const project = currentProjectName();
  const env = findEnv(envName) || findProjectEnvDef(project, envName);
  if (envName !== activeEnv) applyEnv(envName);
  else if (env) applyConnectionURL(envConnectionURL(env));
  // 环境只决定执行地址；不能在切换时重存当前接口定义。
  await persistProfile('', { syncRequest: false });
  await activateCurrent();
  await reloadLiveSession();
  rememberSelection();
  renderProjectSelect();
}

async function applyProfile(p, keepHint) {
  if (!p) return;
  const previousSavedId = activeSavedId;
  if (!Array.isArray(p.modules)) p.modules = [];
  if (!Array.isArray(p.requests)) p.requests = [];
  if (!Array.isArray(p.environments)) p.environments = [];
  activeProfileName = p.name || profileNameFromURL(p.url || p.name) || '';
  setURL(p.url || '', p.url ? p.name : '');
  el.protocol.value = p.protocol || '';
  const method = (p.method || 'GET').toUpperCase();
  if (el.method && [...el.method.options].some((o) => o.value === method)) {
    el.method.value = method;
  } else if (el.method) {
    el.method.value = 'GET';
  }
  el.reconnect.checked = p.reconnect !== false;
  if (el.followRedirects) el.followRedirects.checked = !p.noFollowRedirects;
  if (el.insecureSkipVerify) el.insecureSkipVerify.checked = Boolean(p.insecureSkipVerify);
  loadHeadersFromProfile(p);
  loadVariablesFromProfile(p);
  loadAuthFromProfile(p);
  loadBodyTypeFromProfile(p);
  loadBodyFromProfile(p);
  lastHostVarURL = envConnectionURL(findEnv(activeEnv));
  applyConnectionURL(lastHostVarURL);
  applyTransportFromURL();
  syncParamsFromURL();
  renderRequestEditor();
  renderProjectSelect();
  rememberSelection();
  if (keepHint) restoreRequestFromHint(keepHint);
  else {
    activeSavedId = '';
    let nextId = p.requests.some((r) => r.id === previousSavedId) ? previousSavedId : '';
    if (!nextId) nextId = isHTTPMode() ? matchSavedId() : matchSavedWSId();
    if (!nextId) {
      const sameTransport = p.requests.find((r) => isHTTPMode() ? isHTTPSaved(r) : isWSSaved(r));
      nextId = sameTransport?.id || p.requests[0]?.id || '';
    }
    setActiveSavedId(nextId);
    const selected = currentSavedRequest();
    if (selected) {
      if (isHTTPSaved(selected)) applySavedRequest(selected);
      else applySavedWSMessage(selected);
    }
    loadReqMeta(currentSavedRequest());
  }
  renderCatalog();
  await activateCurrent();
}

function clearEditor() {
  lastHostVarURL = '';
  setURL('');
  if (el.protocol) el.protocol.value = '';
  if (el.method) el.method.value = 'GET';
  el.reconnect.checked = true;
  if (el.insecureSkipVerify) el.insecureSkipVerify.checked = false;
  if (el.payload) el.payload.value = '';
  if (el.payloadIn) el.payloadIn.value = '';
  paramRows = [emptyRow()];
  headerRows = [emptyRow()];
  varRows = ensureHostVarRows([]);
  environments = [];
  activeEnv = '';
  formRows = [emptyRow()];
  lastSent = '';
  resetRecordDraft();
  activeProfileName = '';
  if (el.followRedirects) el.followRedirects.checked = true;
  loadAuthFromProfile(null);
  loadBodyTypeFromProfile(null);
  applyTransportFromURL();
  applyWorkMode();
  renderEnvSelect();
  renderRequestEditor();
  setActiveSavedId('');
  loadReqMeta(null);
  renderCatalog();
}

let confirmResolver = null;
let promptResolver = null;
let promptValidate = null;
let activeSavedId = '';
let pendingCatalogAdd = null;
const catalogOpenGroups = new Set();

function dataDirModalOpen() {
  return Boolean(el.dataDirModal && !el.dataDirModal.classList.contains('hidden'));
}

function setDataDirError(text) {
  if (el.dataDirErr) el.dataDirErr.textContent = text || '';
}

function openDataDirModal() {
  setDataDirError('');
  el.dataDirModal?.classList.remove('hidden');
  el.dataDirModal?.setAttribute('aria-hidden', 'false');
  setTimeout(() => el.btnDataDirPick?.focus(), 30);
}

function closeDataDirModal() {
  if (!dataDirModalOpen()) return;
  el.dataDirModal?.classList.add('hidden');
  el.dataDirModal?.setAttribute('aria-hidden', 'true');
  setDataDirError('');
}

async function ensureDataDirectoryReady() {
  let need = false;
  try {
    need = await NeedsDataDirectory();
  } catch (_) {
    need = false;
  }
  if (!need) return true;
  openDataDirModal();
  return false;
}

async function pickDataDirectoryFromModal() {
  setDataDirError('');
  try {
    const path = await PickDataDirectory();
    closeDataDirModal();
    await reloadAfterDataDirectoryChange(path);
  } catch (e) {
    const msg = String(e || '');
    if (/取消|cancel/i.test(msg)) {
      setDataDirError('还没有选择数据目录。');
      return;
    }
    setDataDirError(msg || '选择失败');
  }
}

async function changeDataDirectoryFromSettings() {
  flashDataPathMsg('');
  try {
    const path = await PickDataDirectory();
    await reloadAfterDataDirectoryChange(path);
    flashDataPathMsg(`已切换到：${path}`);
  } catch (e) {
    const msg = String(e || '');
    if (/取消|cancel/i.test(msg)) {
      flashDataPathMsg('已取消');
      return;
    }
    flashDataPathMsg(msg || '选择失败');
  }
}

async function openCurrentDataDirectory() {
  try {
    await OpenDataDir();
    flashDataPathMsg('已在文件管理器中打开');
  } catch (e) {
    flashDataPathMsg(String(e || '打开失败'));
  }
}

async function copyDataPath() {
  const text = el.dataPathBase?.dataset?.path || '';
  if (!text) return;
  const ok = await copyText(text);
  flashDataPathMsg(ok ? `已复制：${text}` : '复制失败');
}

function confirmModalOpen() {
  return Boolean(el.confirmModal && !el.confirmModal.classList.contains('hidden'));
}

function closeConfirmModal(ok) {
  if (!confirmModalOpen()) return;
  el.confirmModal.classList.add('hidden');
  el.confirmModal.setAttribute('aria-hidden', 'true');
  const resolve = confirmResolver;
  confirmResolver = null;
  if (resolve) resolve(Boolean(ok));
}

function promptModalOpen() {
  return Boolean(el.promptModal && !el.promptModal.classList.contains('hidden'));
}

function setPromptError(text) {
  if (el.promptErr) el.promptErr.textContent = text || '';
}

function closePromptModal(value) {
  if (!promptModalOpen()) return;
  el.promptModal.classList.add('hidden');
  el.promptModal.setAttribute('aria-hidden', 'true');
  setPromptError('');
  const resolve = promptResolver;
  promptResolver = null;
  promptValidate = null;
  if (resolve) resolve(value);
}

function submitPromptModal() {
  const raw = el.promptInput?.value || '';
  const err = promptValidate ? promptValidate(raw) : '';
  if (err) {
    setPromptError(err);
    el.promptInput?.focus();
    return;
  }
  closePromptModal(raw);
}

function askPrompt({ title, value, placeholder, hint, okText, validate }) {
  closePromptModal(null);
  if (el.promptTitle) el.promptTitle.textContent = title || '输入';
  if (el.promptHint) {
    el.promptHint.textContent = hint || '';
    el.promptHint.classList.toggle('hidden', !hint);
  }
  if (el.promptInput) {
    el.promptInput.value = value || '';
    el.promptInput.placeholder = placeholder || '';
  }
  if (el.btnPromptOk) el.btnPromptOk.textContent = okText || '确定';
  setPromptError('');
  promptValidate = validate || null;
  el.promptModal?.classList.remove('hidden');
  el.promptModal?.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    el.promptInput?.focus();
    el.promptInput?.select();
  }, 30);
  return new Promise((resolve) => {
    promptResolver = resolve;
  });
}

function askConfirm({ title, message, okText }) {
  closeConfirmModal(false);
  if (el.confirmTitle) el.confirmTitle.textContent = title || '确认';
  if (el.confirmMsg) el.confirmMsg.textContent = message || '';
  if (el.btnConfirmOk) el.btnConfirmOk.textContent = okText || '确定';
  el.confirmModal?.classList.remove('hidden');
  el.confirmModal?.setAttribute('aria-hidden', 'false');
  setTimeout(() => el.btnConfirmCancel?.focus(), 30);
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

async function loadProfiles() {
  profiles = (await GetProfiles()) || [];
  const loadWarning = await GetProfileLoadError();
  if (profiles.length) {
    const sel = readSel();
    let cur = null;
    if (sel.project) cur = profileForProjectEnv(sel.project, lastEnvForProject(sel.project));
    if (!cur && sel.host) {
      cur = profiles.find((p) => p.name === sel.host)
        || profiles.find((p) => (p.environments || []).some((e) => profileNameFromURL(envConnectionURL(e)) === sel.host))
        || null;
    }
    await applyProfile(cur || profiles[0]);
    const env = lastEnvForProject(currentProjectName());
    if (env && activeEnv !== env) applyEnv(env);
    if (loadWarning) setDetailEmpty(`部分项目数据未能读取：\n${loadWarning}`);
  } else {
    renderProjectSelect();
    clearEditor();
    if (loadWarning) setDetailEmpty(`项目数据读取失败，原文件未被修改：\n${loadWarning}`);
    else if (el.docEmpty) {
      el.docEmpty.textContent = '还没有项目。点右上角「新建项目」开始。';
      el.docEmpty.classList.remove('hidden');
      el.docBody?.classList.add('hidden');
    }
  }
}

function urlModalOpen() {
  return Boolean(el.urlModal && !el.urlModal.classList.contains('hidden'));
}

function setUrlModalError(text) {
  if (el.urlModalErr) el.urlModalErr.textContent = text || '';
}

function normalizeDialURL(raw) {
  return String(raw || '').trim();
}

function validateNewURL(raw) {
  const t = String(raw || '').trim();
  if (!t) return '请输入 URL';
  const scheme = urlScheme(t);
  if (!scheme) return '请输入完整 URL（需包含 http://、https://、ws:// 或 wss://）';
  if (!ALL_SCHEMES.has(scheme)) return '仅支持 ws、wss、http、https';
  const url = normalizeDialURL(t);
  if (!connectionURLReady(url)) return '请输入有效的完整 URL';
  return '';
}

function openUrlModal({ createRequest = false, moduleName = '' } = {}) {
  pendingCatalogAdd = createRequest ? { moduleName: clipText(moduleName, 80) } : null;
  if (el.urlModalTitle) el.urlModalTitle.textContent = '新增环境';
  if (el.urlModalInput) el.urlModalInput.value = '';
  setUrlModalError('');
  el.urlModal?.classList.remove('hidden');
  el.urlModal?.setAttribute('aria-hidden', 'false');
  setTimeout(() => el.urlModalInput?.focus(), 30);
}

function closeUrlModal() {
  if (!urlModalOpen()) return;
  el.urlModal.classList.add('hidden');
  el.urlModal.setAttribute('aria-hidden', 'true');
  setUrlModalError('');
  pendingCatalogAdd = null;
}

function urlModalHasDraft() {
  return Boolean(String(el.urlModalInput?.value || '').trim());
}

async function submitUrlModal() {
  const raw = el.urlModalInput?.value || '';
  const err = validateNewURL(raw);
  if (err) {
    setUrlModalError(err);
    el.urlModalInput?.focus();
    return;
  }
  const url = normalizeDialURL(raw);
  const name = profileNameFromURL(url);
  const inheritProject = isExplicitProject(currentProjectName()) ? currentProjectName() : '';
  const pendingAdd = pendingCatalogAdd;
  closeUrlModal();
  if (inheritProject) {
    const owner = projectCatalogProfile(inheritProject) || currentProfile();
    if (owner) {
      if (currentProfile()?.name !== owner.name) {
        await persistProfile();
        await applyProfile(owner);
      }
      addEnvFromURL(url);
      // 新环境只替换执行时的地址前缀，不能把该地址写回接口定义，
      // 也无需重新加载项目而清掉当前接口选中状态。
      await persistProfile('', { syncRequest: false });
      if (pendingAdd) await addCatalogRequest(pendingAdd.moduleName);
      return;
    }
  }
  const prevName = profileNameFromURL(currentURL());
  if (prevName && prevName !== name) {
    await persistProfile();
  }
  clearTimeout(persistTimer);
  clearEditor();
  setURL(url, name);
  ensureCurrentProfile();
  applyTransportFromURL();
  syncParamsFromURL();
  renderRequestEditor();
  await persistProfile();
  await activateCurrent();
  if (pendingAdd) await addCatalogRequest(pendingAdd.moduleName);
}

function currentHeaders() {
  const body = currentBody();
  const t = currentBodyType();
  return mergeRequestHeaders(headerRows, {
    type: el.authType?.value || authState.type,
    token: el.authToken?.value || authState.token,
    user: el.authUser?.value || authState.user,
    pass: el.authPass?.value || authState.pass,
  }, t, Boolean(body) && t !== 'none');
}

function currentOpts() {
  return {
    url: currentURL(),
    protocol: el.protocol.value.trim(),
    method: el.method?.value || 'GET',
    headers: currentHeaders(),
    reconnect: el.reconnect.checked,
    pingSec: 20,
    noFollowRedirects: el.followRedirects ? !el.followRedirects.checked : false,
    insecureSkipVerify: Boolean(el.insecureSkipVerify?.checked),
  };
}

function curlFollowRedirects() {
  return el.followRedirects ? el.followRedirects.checked : true;
}

function currentCurlSpec() {
  const opts = resolvedOpts();
  return {
    method: opts.method,
    url: opts.url,
    headers: opts.headers,
    body: isDefinitionHTTPMode() ? resolvedBody() : '',
    followRedirects: curlFollowRedirects(),
    insecureSkipVerify: opts.insecureSkipVerify,
  };
}

function exchangeCurlSpec(ex) {
  return {
    method: ex.method,
    url: ex.url,
    headers: ex.reqHeaders || {},
    body: ex.reqBody || '',
    followRedirects: curlFollowRedirects(),
    insecureSkipVerify: Boolean(ex.insecureSkipVerify),
  };
}

async function copyText(text) {
  const s = String(text || '');
  if (!s) return false;
  try {
    if (await ClipboardSetText(s)) return true;
  } catch (_) {}
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch (_) {}
  return false;
}

function flashButton(btn, label, ms = 900) {
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = label;
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => {
    btn.textContent = prev;
  }, ms);
}

function catalogTitleText() {
  if (moduleRun) return `跑 ${moduleRun.index}/${moduleRun.total}`;
  const kw = catalogFilterKeyword();
  const n = kw ? catalogSearchHits(kw).length : catalogRequests().length;
  return n ? `接口 ${n}` : '接口';
}

function refreshCatalogTitle() {
  if (el.catalogTitle) el.catalogTitle.textContent = catalogTitleText();
}

function flashCatalogTitle(text, ms = 1200) {
  if (!el.catalogTitle) return;
  el.catalogTitle.textContent = text;
  clearTimeout(el.catalogTitle._flashTimer);
  el.catalogTitle._flashTimer = setTimeout(() => {
    if (!moduleRun) refreshCatalogTitle();
  }, ms);
}

async function copyCurl(fromDetail) {
  const m = fromDetail ? store.get(selectedId) : null;
  const spec = m?.exchange ? exchangeCurlSpec(m.exchange) : currentCurlSpec();
  if (!spec.url) {
    setDetailEmpty('请先填写 URL');
    return;
  }
  const ok = await copyText(toCurl(spec));
  const btn = fromDetail ? el.btnCurlDetail : el.btnCurl;
  flashButton(btn, ok ? '已复制' : '复制失败');
}

function currentProfile() {
  const name = activeProfileName || profileNameFromURL(currentURL()) || '';
  if (!name) return null;
  return profiles.find((p) => p.name === name) || null;
}

function currentProfileRequests() {
  const p = currentProfile();
  return Array.isArray(p?.requests) ? p.requests : [];
}

function isHTTPSaved(r) {
  if (!r) return false;
  if (r.kind === 'ws') return false;
  if (r.kind === 'http') return true;
  return HTTP_SCHEMES.has(urlScheme(r.url));
}

function isWSSaved(r) {
  if (!r) return false;
  if (r.kind === 'http') return false;
  if (r.kind === 'ws') return true;
  return !HTTP_SCHEMES.has(urlScheme(r.url));
}

function currentHTTPRequests() {
  return currentProfileRequests().filter(isHTTPSaved);
}

function currentWSMessages() {
  return currentProfileRequests().filter(isWSSaved);
}

function alignActiveRequestToEnvironment() {
  const selected = currentSavedRequest();
  const http = isDefinitionHTTPMode();
  if (selected && isHTTPSaved(selected) === http) return;

  const next = (http ? currentHTTPRequests() : currentWSMessages())[0] || null;
  activeSavedId = next?.id || '';
  if (next) {
    if (http) applySavedRequest(next);
    else applySavedWSMessage(next);
  }
  setActiveSavedId(activeSavedId);
  loadReqMeta(next);
  renderCatalog();
}

function scalarMessageName(v) {
  if (v == null) return '';
  const t = typeof v;
  if (t === 'string') return v.trim();
  if (t === 'number' && Number.isFinite(v)) return String(v);
  if (t === 'boolean') return String(v);
  return '';
}

function firstNamedField(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  for (const k of keys) {
    const name = scalarMessageName(obj[k]);
    if (name) return name;
  }
  return '';
}

function wsCommandKey(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const top = firstNamedField(v, ['cmd', 'type', 'action', 'op', 'event', 'venus', 'janus', 'request']);
      const nested = firstNamedField(v.body, ['request', 'cmd', 'type', 'action', 'op', 'event']);
      if (top && nested && top !== nested) return `${top}/${nested}`;
      if (nested) return nested;
      if (top) return top;
    }
  } catch (_) {}
  return '';
}

function matchingWSCatalog(text) {
  const key = wsCommandKey(text);
  if (!key) return null;
  return currentWSMessages().find((r) => wsCommandKey(r.body) === key) || null;
}

function canSaveExample(m) {
  if (httpDebugLayout() || !m || m.dir !== 'in' || m.exchange) return false;
  return Boolean(matchingWSCatalog(m.pretty || m.text || m.ws?.in || ''));
}

async function saveExampleFromMessage(m) {
  const text = m?.pretty || m?.text || m?.ws?.in || '';
  const hit = matchingWSCatalog(text);
  if (!hit) return false;
  const pretty = prettyDocText(text) || text;
  hit.example = pretty;
  hit.updatedAt = Date.now();
  if (activeSavedId === hit.id) {
    if (el.payloadIn) el.payloadIn.value = pretty;
    recordDraft.in = pretty;
  }
  await persistProfile();
  renderCatalog();
  return true;
}

function wsMessageKey(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const top = firstNamedField(v, ['cmd', 'type', 'action', 'op', 'event', 'venus', 'janus', 'request']);
      const nested = firstNamedField(v.body, ['request', 'cmd', 'type', 'action', 'op', 'event']);
      if (top && nested && top !== nested) return `${top}/${nested}`;
      if (nested) return nested;
      if (top) return top;
    }
  } catch (_) {}
  return raw.replace(/\s+/g, '');
}

function wsShortName(name) {
  const n = String(name || '').trim();
  if (!n || n.length > 40) return false;
  if (/^[{[\/]/.test(n)) return false;
  if (/\s/.test(n)) return false;
  return true;
}

function oneLinePreview(text, max = 80) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function wsMessageStoreName(key, text) {
  if (wsShortName(key)) return key.slice(0, 80);
  const preview = oneLinePreview(text, 80);
  return preview.replace(/…$/, '') || key.slice(0, 80);
}

function wsCmdLabel(r) {
  const key = wsMessageKey(r?.body || '');
  return wsShortName(key) ? key : '';
}

function looksLikeHTTPKey(name) {
  return /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+\S/i.test(String(name || ''));
}

function requestDisplayTitle(r) {
  const t = String(r?.title || '').trim();
  if (t) return t;
  const n = String(r?.name || '').trim();
  if (!n) return '';
  if (isHTTPSaved(r) && looksLikeHTTPKey(n)) return '';
  if (isWSSaved(r)) {
    if (!wsShortName(n)) return '';
    if (n === wsMessageKey(r.body || '')) return '';
  }
  return n;
}

function requestDescription(r) {
  return String(r?.description || '').trim();
}

function currentReqTitle() {
  return String(el.reqTitle?.value || '').trim();
}

function currentReqDesc() {
  return String(el.reqDesc?.value || '').trim();
}

function currentReqModule() {
  return String(el.reqModule?.value || '').trim();
}

function loadReqMeta(req) {
  if (el.reqTitle) el.reqTitle.value = req?.title || '';
  if (el.reqModule) el.reqModule.value = req?.module || '';
  if (el.reqDesc) el.reqDesc.value = req?.description || '';
}

function flushReqMeta() {
  const req = currentSavedRequest();
  if (!req) return;
  req.title = currentReqTitle();
  req.module = currentReqModule();
  req.description = currentReqDesc();
}

function rematchSavedFromEditor() {
  if (activeSavedId && currentSavedRequest()) return;
  const id = isDefinitionHTTPMode() ? matchSavedId() : matchSavedWSId();
  if (id === activeSavedId) return;
  flushReqMeta();
  activeSavedId = id || '';
  loadReqMeta(currentSavedRequest());
  renderCatalog();
}

function onReqMetaInput() {
  const doc = isDocMode();
  if (doc && !docEditing()) return;
  if (!doc && !httpDebugLayout()) return;
  const req = currentSavedRequest();
  if (req) {
    req.title = currentReqTitle();
    req.module = currentReqModule();
    req.description = currentReqDesc();
    renderCatalog();
    if (doc) renderDocPane();
  }
  if (doc) schedulePersist();
}

function catalogOpen() {
  return localStorage.getItem(CATALOG_KEY) !== 'off';
}

function setCatalogOpen(on) {
  localStorage.setItem(CATALOG_KEY, on ? 'on' : 'off');
  el.app?.classList.toggle('catalog-off', !on);
  if (el.btnCatalogToggle) {
    el.btnCatalogToggle.title = on ? '收起接口目录' : '展开接口目录';
    el.btnCatalogToggle.setAttribute('aria-label', el.btnCatalogToggle.title);
  }
  applyColumnLayout();
}

function readColumnPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(COLS_KEY) || '{}');
    return {
      left: Number(raw.left) || 220,
      mid: Number(raw.mid) || 0,
    };
  } catch {
    return { left: 220, mid: 0 };
  }
}

let columnPrefs = readColumnPrefs();

function saveColumnPrefs() {
  localStorage.setItem(COLS_KEY, JSON.stringify({
    left: Math.round(columnPrefs.left),
    mid: Math.round(columnPrefs.mid || 0),
  }));
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function applyColumnLayout() {
  const main = el.main;
  if (!main) return;
  const catalogOn = catalogOpen();
  const left = catalogOn ? clamp(columnPrefs.left, COL_LEFT_MIN, COL_LEFT_MAX) : 36;
  main.style.setProperty('--col-left', `${left}px`);
  if (httpDebugOn || (!isDocMode() && !historyMode)) {
    const total = main.clientWidth || 0;
    const leftUsed = catalogOn ? left : 36;
    const maxMid = Math.max(COL_MID_MIN, total - leftUsed - COL_SPLIT * 2 - COL_RIGHT_MIN);
    let mid = columnPrefs.mid;
    if (!mid) mid = Math.round(Math.min(maxMid, Math.max(COL_MID_MIN, total * 0.36)));
    mid = clamp(mid, COL_MID_MIN, maxMid);
    columnPrefs.mid = mid;
    main.style.setProperty('--col-mid', `${mid}px`);
    if (httpDebugOn) {
      main.style.gridTemplateColumns = catalogOn
        ? `${left}px ${COL_SPLIT}px ${mid}px ${COL_SPLIT}px minmax(${COL_RIGHT_MIN}px, 1fr)`
        : `36px ${COL_SPLIT}px ${mid}px ${COL_SPLIT}px minmax(${COL_RIGHT_MIN}px, 1fr)`;
    } else if (!isDocMode() && !historyMode) {
      main.style.gridTemplateColumns = catalogOn
        ? `${left}px ${COL_SPLIT}px ${mid}px ${COL_SPLIT}px minmax(${COL_RIGHT_MIN}px, 1fr)`
        : `36px ${COL_SPLIT}px ${mid}px ${COL_SPLIT}px minmax(${COL_RIGHT_MIN}px, 1fr)`;
    }
  } else if (isDocMode() && !historyMode) {
    main.style.removeProperty('--col-mid');
    main.style.gridTemplateColumns = catalogOn
      ? `${left}px ${COL_SPLIT}px minmax(0, 1fr)`
      : `36px ${COL_SPLIT}px minmax(0, 1fr)`;
  } else if (historyMode) {
    main.style.removeProperty('--col-left');
    const total = main.clientWidth || 0;
    const maxMid = Math.max(COL_MID_MIN, total - COL_SPLIT - COL_RIGHT_MIN);
    let mid = columnPrefs.mid || Math.round(total * 0.5);
    mid = clamp(mid, COL_MID_MIN, maxMid);
    columnPrefs.mid = mid;
    main.style.gridTemplateColumns = `${mid}px ${COL_SPLIT}px minmax(${COL_RIGHT_MIN}px, 1fr)`;
  }
  if (el.splitLeft) {
    el.splitLeft.classList.toggle('disabled', !catalogOpen() || historyMode);
    el.splitLeft.style.pointerEvents = (!catalogOpen() || historyMode) ? 'none' : '';
  }
  if (el.splitRight) {
    el.splitRight.classList.toggle('disabled', isDocMode() && !historyMode);
    el.splitRight.style.pointerEvents = (isDocMode() && !historyMode) ? 'none' : '';
  }
}

function bindPaneSplitters() {
  if (!el.splitLeft && !el.splitRight) return;
  let drag = null;

  const onMove = (e) => {
    if (!drag || !el.main) return;
    const rect = el.main.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (drag.which === 'left') {
      columnPrefs.left = clamp(x, COL_LEFT_MIN, COL_LEFT_MAX);
    } else {
      const leftUsed = historyMode ? 0 : (catalogOpen() ? clamp(columnPrefs.left, COL_LEFT_MIN, COL_LEFT_MAX) : 36);
      const splits = historyMode ? COL_SPLIT : COL_SPLIT * 2;
      const maxMid = Math.max(COL_MID_MIN, rect.width - leftUsed - splits - COL_RIGHT_MIN);
      const mid = historyMode ? x : (x - leftUsed - COL_SPLIT);
      columnPrefs.mid = clamp(mid, COL_MID_MIN, maxMid);
    }
    applyColumnLayout();
  };

  const onUp = () => {
    if (!drag) return;
    drag = null;
    el.app?.classList.remove('splitting');
    el.splitLeft?.classList.remove('active');
    el.splitRight?.classList.remove('active');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    saveColumnPrefs();
  };

  const start = (which, e) => {
    if (which === 'left' && (!catalogOpen() || historyMode)) return;
    if (which === 'right' && isDocMode() && !historyMode) return;
    e.preventDefault();
    drag = { which };
    el.app?.classList.add('splitting');
    (which === 'left' ? el.splitLeft : el.splitRight)?.classList.add('active');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  el.splitLeft?.addEventListener('pointerdown', (e) => start('left', e));
  el.splitRight?.addEventListener('pointerdown', (e) => start('right', e));
  window.addEventListener('resize', () => applyColumnLayout());
}

function catalogRequests() {
  return isDefinitionHTTPMode() ? currentHTTPRequests() : currentWSMessages();
}

function requestModuleName(r) {
  return String(r?.module || '').trim();
}

function clipText(s, max) {
  const t = String(s || '').trim();
  const chars = Array.from(t);
  if (max > 0 && chars.length > max) return chars.slice(0, max).join('');
  return t;
}

function profileModules() {
  const p = currentProfile();
  return Array.isArray(p?.modules) ? p.modules.map((m) => String(m || '').trim()).filter(Boolean) : [];
}

function currentModules() {
  const names = [];
  const seen = new Set();
  for (const raw of profileModules()) {
    if (seen.has(raw)) continue;
    seen.add(raw);
    names.push(raw);
  }
  for (const r of currentProfileRequests()) {
    const m = requestModuleName(r);
    if (!m || seen.has(m)) continue;
    seen.add(m);
    names.push(m);
  }
  return names;
}

function ensureCurrentProfile() {
  let p = currentProfile();
  if (p) {
    if (!Array.isArray(p.requests)) p.requests = [];
    if (!Array.isArray(p.modules)) p.modules = [];
    return p;
  }
  const host = profileNameFromURL(currentURL());
  if (!host) return null;
  p = { name: host, url: currentURL(), project: '', requests: [], modules: [], environments: [], activeEnv: '' };
  profiles.push(p);
  profiles.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (!Array.isArray(p.requests)) p.requests = [];
  if (!Array.isArray(p.modules)) p.modules = [];
  return p;
}

function rememberModule(name) {
  name = clipText(name, 80);
  const p = ensureCurrentProfile();
  if (!p || !name) return '';
  if (!p.modules.includes(name)) p.modules = [...p.modules, name];
  return name;
}

function renameModule(from, to) {
  from = clipText(from, 80);
  to = clipText(to, 80);
  if (!from || !to || from === to) return false;
  const p = ensureCurrentProfile();
  if (!p) return false;
  for (const r of p.requests) {
    if (requestModuleName(r) === from) r.module = to;
  }
  const next = [];
  const seen = new Set();
  for (const raw of [...p.modules, to]) {
    const name = raw === from ? to : raw;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    next.push(name);
  }
  p.modules = next;
  if (el.reqModule && currentReqModule() === from) el.reqModule.value = to;
  const req = currentSavedRequest();
  if (req && requestModuleName(req) === from) req.module = to;
  return true;
}

function clearModule(name) {
  name = clipText(name, 80);
  const p = currentProfile();
  if (!p || !name) return;
  for (const r of p.requests || []) {
    if (requestModuleName(r) === name) r.module = '';
  }
  p.modules = (p.modules || []).filter((m) => m !== name);
  if (el.reqModule && currentReqModule() === name) el.reqModule.value = '';
  const req = currentSavedRequest();
  if (req && requestModuleName(req) === name) req.module = '';
}

let moduleFilterArmed = false;

function moduleMenuOpen() {
  return Boolean(el.moduleMenu && !el.moduleMenu.classList.contains('hidden'));
}

function closeModuleMenu() {
  el.moduleMenu?.classList.add('hidden');
  el.moduleMenu?.setAttribute('aria-hidden', 'true');
  el.reqModule?.setAttribute('aria-expanded', 'false');
  el.moduleWrap?.classList.remove('open');
}

function renderModuleMenu() {
  if (!el.moduleMenu) return;
  const all = currentModules();
  const cur = currentReqModule();
  const kw = moduleFilterArmed ? cur.toLowerCase() : '';
  const shown = kw ? all.filter((name) => name.toLowerCase().includes(kw)) : all;
  el.moduleMenu.innerHTML = '';
  const items = [{ name: '', label: '未分组' }, ...shown.map((name) => ({ name, label: name }))];
  if (kw && cur && !all.some((name) => name.toLowerCase() === kw)) {
    items.push({ name: cur, label: `新建「${cur}」` });
  }
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'saved-item' + (item.name === cur ? ' on' : '');
    row.dataset.module = item.name;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', item.name === cur ? 'true' : 'false');
    const main = document.createElement('div');
    main.className = 'saved-item-main';
    const line = document.createElement('div');
    line.className = 'saved-item-line';
    const head = document.createElement('span');
    head.className = item.name ? 'saved-item-title' : 'saved-item-sub';
    head.textContent = item.label;
    line.appendChild(head);
    main.appendChild(line);
    row.appendChild(main);
    el.moduleMenu.appendChild(row);
  }
}

function openModuleMenu() {
  if (!el.moduleMenu || historyMode) return;
  if (!isDocMode() || !docEditing()) return;
  if (confirmModalOpen() || urlModalOpen() || recordModalOpen() || promptModalOpen()) return;
  renderModuleMenu();
  el.moduleMenu.classList.remove('hidden');
  el.moduleMenu.setAttribute('aria-hidden', 'false');
  el.reqModule?.setAttribute('aria-expanded', 'true');
  el.moduleWrap?.classList.add('open');
}

function pickModule(name) {
  if (el.reqModule) el.reqModule.value = name || '';
  onReqMetaInput();
  closeModuleMenu();
}

function onModuleMenuClick(e) {
  const item = e.target?.closest?.('.saved-item');
  if (!item || !el.moduleMenu?.contains(item)) return;
  pickModule(item.dataset.module || '');
}

function fillModuleList() {
  if (moduleMenuOpen()) renderModuleMenu();
}

function catalogFilterKeyword() {
  return String(el.catalogFilter?.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function catalogMatches(r, kw, host) {
  if (!kw) return true;
  return requestSearchHaystack(r, host).includes(kw);
}

function requestSearchHaystack(r, host) {
  const base = isHTTPSaved(r) ? savedRequestHaystack(r) : savedWSHaystack(r);
  return `${base} ${host || ''}`.replace(/\s+/g, ' ').trim();
}

function catalogHostName(p) {
  return String(p?.name || profileNameFromURL(p?.url) || '').trim();
}

function currentCatalogHost() {
  return profileNameFromURL(currentURL()) || activeProfileName || currentProfile()?.name || '';
}

function catalogSearchHits(kw) {
  const hits = [];
  for (const p of profiles || []) {
    const host = catalogHostName(p);
    if (!host) continue;
    for (const r of p.requests || []) {
      if (!r?.id) continue;
      if (kw && !catalogMatches(r, kw, host)) continue;
      hits.push({ host, req: r });
    }
  }
  return hits;
}

function groupCatalogHits(hits) {
  const map = new Map();
  for (const hit of hits) {
    if (!map.has(hit.host)) map.set(hit.host, []);
    map.get(hit.host).push(hit.req);
  }
  return [...map.entries()].map(([host, items]) => ({ host, items }));
}

function catalogItemLabel(r) {
  const title = requestDisplayTitle(r);
  if (title) return title;
  if (isHTTPSaved(r)) return requestItemPath(r) || r?.name || '未命名接口';
  return wsCmdLabel(r) || '未命名接口';
}

function groupCatalogRequests(reqs) {
  const map = new Map();
  for (const name of currentModules()) map.set(name, []);
  map.set('', []);
  for (const r of reqs) {
    const key = requestModuleName(r);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return [...map.keys()].map((module) => ({ module, items: map.get(module) }));
}

function appendCatalogAddModule() {
  if (!isDocMode()) return;
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'catalog-add-module';
  add.textContent = '+ 新建模块';
  el.catalogList.appendChild(add);
}

function catalogIcon(cls, svgInner) {
  const span = document.createElement('span');
  span.className = cls;
  span.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${svgInner}</svg>`;
  return span;
}

const ICO_FOLDER = '<path d="M2.4 4.5c0-.6.5-1.1 1.1-1.1h2.15l1.2 1.35h5.65c.6 0 1.1.5 1.1 1.1v6.15c0 .6-.5 1.1-1.1 1.1H3.5c-.6 0-1.1-.5-1.1-1.1V4.5z" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/>';
const ICO_HOST = '<path d="M3 4.2h10v6.3H3zM5.6 12.4h4.8M8 10.5v1.9" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>';
const ICO_API = '<path d="M4.4 2.6h5L11.6 5v8.4H4.4zM9.4 2.6V5h2.2" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>';

function makeCatalogGroupHead(group, kw) {
  const head = document.createElement('div');
  head.className = 'catalog-group';
  head.dataset.module = group.module;
  head.dataset.closeKey = group.module || '';
  if (isDocMode() && !kw && group.module) head.draggable = true;
  const closed = !kw && !catalogOpenGroups.has(group.module || '');
  const caret = document.createElement('span');
  caret.className = 'catalog-caret';
  caret.textContent = closed ? '▸' : '▾';
  const name = document.createElement('span');
  name.className = 'catalog-group-name';
  name.textContent = group.module || '未分组';
  const count = document.createElement('span');
  count.className = 'catalog-group-count';
  count.textContent = String(group.items.length);
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'catalog-more catalog-group-more';
  more.title = '模块菜单';
  more.setAttribute('aria-label', group.module ? `「${group.module}」菜单` : '未分组菜单');
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-expanded', 'false');
  more.draggable = false;
  more.textContent = '⋯';
  head.appendChild(caret);
  head.appendChild(catalogIcon('catalog-kind catalog-kind-folder', ICO_FOLDER));
  head.appendChild(name);
  head.appendChild(count);
  head.appendChild(more);
  return { head, closed };
}

function makeCatalogHostHead(group, currentHost) {
  const head = document.createElement('div');
  head.className = 'catalog-group host' + (group.host === currentHost ? ' current' : '');
  head.dataset.host = group.host;
  head.dataset.closeKey = `host:${group.host}`;
  const closed = false;
  const caret = document.createElement('span');
  caret.className = 'catalog-caret';
  caret.textContent = closed ? '▸' : '▾';
  const name = document.createElement('span');
  name.className = 'catalog-group-name';
  name.textContent = group.host;
  name.title = group.host;
  const count = document.createElement('span');
  count.className = 'catalog-group-count';
  count.textContent = String(group.items.length);
  head.appendChild(caret);
  head.appendChild(catalogIcon('catalog-kind catalog-kind-host', ICO_HOST));
  head.appendChild(name);
  head.appendChild(count);
  return { head, closed };
}

let catalogMenuKey = '';
let catalogDrag = null;
let catalogDidDrag = false;

function groupMenuOpen() {
  return Boolean(el.groupMenu && !el.groupMenu.classList.contains('hidden'));
}

function closeGroupMenu() {
  el.groupMenu?.classList.add('hidden');
  el.groupMenu?.setAttribute('aria-hidden', 'true');
  catalogMenuKey = '';
  for (const btn of el.catalogList?.querySelectorAll('.catalog-more[aria-expanded="true"]') || []) {
    btn.setAttribute('aria-expanded', 'false');
  }
  el.btnEnvMore?.setAttribute('aria-expanded', 'false');
  el.btnBarMenu?.setAttribute('aria-expanded', 'false');
}

function appendGroupMenuItem(act, label, danger) {
  const row = document.createElement('div');
  row.className = 'saved-item group-menu-item' + (danger ? ' danger' : '');
  row.dataset.act = act;
  row.setAttribute('role', 'menuitem');
  const main = document.createElement('div');
  main.className = 'saved-item-main';
  const line = document.createElement('div');
  line.className = 'saved-item-line';
  const head = document.createElement('span');
  head.className = 'saved-item-title';
  head.textContent = label;
  line.appendChild(head);
  main.appendChild(line);
  row.appendChild(main);
  el.groupMenu.appendChild(row);
}

function placeGroupMenu(anchor) {
  const menu = el.groupMenu;
  if (!menu || !anchor) return;
  const pad = 8;
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth || 140;
  const mh = menu.offsetHeight || 88;
  let top = r.bottom + 4;
  let left = r.right - mw;
  if (left < pad) left = pad;
  if (left + mw > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - pad - mw);
  if (top + mh > window.innerHeight - pad) top = Math.max(pad, r.top - 4 - mh);
  menu.style.top = `${Math.round(top)}px`;
  menu.style.left = `${Math.round(left)}px`;
}

function openCatalogMenu(anchor, key, items) {
  hideCatalogTip();
  if (!el.groupMenu || !anchor) return;
  if (groupMenuOpen() && catalogMenuKey === key) {
    closeGroupMenu();
    return;
  }
  catalogMenuKey = key;
  el.groupMenu.innerHTML = '';
  for (const item of items) appendGroupMenuItem(item.act, item.label, item.danger);
  el.groupMenu.classList.remove('hidden');
  el.groupMenu.setAttribute('aria-hidden', 'false');
  for (const btn of el.catalogList?.querySelectorAll('.catalog-more') || []) {
    btn.setAttribute('aria-expanded', btn === anchor ? 'true' : 'false');
  }
  placeGroupMenu(anchor);
}

function openGroupMenu(anchor, module) {
  if (!isDocMode()) {
    if (isDefinitionHTTPMode()) openCatalogMenu(anchor, `group\t${module}`, [{ act: 'run', label: '跑一遍' }]);
    return;
  }
  const items = [{ act: 'add', label: '新建接口' }];
  if (isDefinitionHTTPMode()) items.push({ act: 'run', label: '跑一遍' });
  if (module) {
    items.push({ act: 'rename', label: '重命名' });
    items.push({ act: 'delete', label: '删除模块', danger: true });
  }
  openCatalogMenu(anchor, `group\t${module}`, items);
}

function openItemMenu(anchor, id) {
  if (!isDocMode()) return;
  if (!id) return;
  openCatalogMenu(anchor, `item\t${id}`, [
    { act: 'duplicate', label: '复制' },
    { act: 'delete-item', label: '删除', danger: true },
  ]);
}

function onGroupMenuClick(e) {
  const item = e.target?.closest?.('[data-act]');
  if (!item || !el.groupMenu?.contains(item)) return;
  const act = item.dataset.act;
  const key = catalogMenuKey;
  closeGroupMenu();
  if (key === 'env') {
    if (act === 'vars') openEnvEdit();
    else if (act === 'add') addEnvironment();
    else if (act === 'duplicate') duplicateEnvironment();
    else if (act === 'rename') renameEnvironment();
    else if (act === 'delete') deleteEnvironment();
    return;
  }
  if (key === 'project') {
    if (act === 'new') createProject();
    else if (act === 'rename') renameCurrentProject();
    else if (act === 'delete') deleteCurrentProject();
    return;
  }
  if (key === 'export') {
    if (act === 'export-one') exportCatalog();
    else if (act === 'export-all') exportAllCatalogs();
    return;
  }
  if (key.startsWith('item\t')) {
    const id = key.slice(5);
    if (act === 'duplicate') duplicateCatalogRequest(id);
    else if (act === 'delete-item') deleteNamedRequest(id);
    return;
  }
  const module = key.startsWith('group\t') ? key.slice(6) : '';
  if (act === 'add') addCatalogRequest(module);
  else if (act === 'run') runCatalogModule(module);
  else if (act === 'rename' && module) renameCatalogModule(module);
  else if (act === 'delete' && module) deleteCatalogModule(module);
}

function renderCatalog() {
  hideCatalogTip();
  closeGroupMenu();
  fillModuleList();
  if (!el.catalogList) return;
  const kw = catalogFilterKeyword();
  if (kw) {
    renderCatalogSearch(kw);
    return;
  }
  const all = catalogRequests();
  refreshCatalogTitle();
  el.catalogList.innerHTML = '';
  if (!currentProfile() && !profileNameFromURL(currentURL())) {
    const empty = document.createElement('div');
    empty.className = 'catalog-empty';
    empty.textContent = '先新增环境，再点 + 新建接口。';
    el.catalogList.appendChild(empty);
    return;
  }
  const groups = groupCatalogRequests(all);
  if (!all.length && !groups.length) {
    const empty = document.createElement('div');
    empty.className = 'catalog-empty';
    empty.textContent = isDefinitionHTTPMode()
      ? '点 + 新建接口，或发送后自动收录。可按模块分组。'
      : '点 + 新建发送，或发送后按 cmd 收录。可按模块分组。';
    el.catalogList.appendChild(empty);
    appendCatalogAddModule();
    return;
  }
  for (const group of groups) {
    const wrap = document.createElement('div');
    wrap.className = 'catalog-group-wrap';
    wrap.dataset.module = group.module;
    const { head, closed } = makeCatalogGroupHead(group, '');
    wrap.appendChild(head);
    const box = document.createElement('div');
    box.className = 'catalog-items' + (closed ? ' hidden' : '');
    for (const r of group.items) {
      box.appendChild(makeCatalogItem(r, '', currentCatalogHost()));
    }
    wrap.appendChild(box);
    el.catalogList.appendChild(wrap);
  }
  appendCatalogAddModule();
}

function renderCatalogSearch(kw) {
  const hits = catalogSearchHits(kw);
  refreshCatalogTitle();
  el.catalogList.innerHTML = '';
  if (!hits.length) {
    const empty = document.createElement('div');
    empty.className = 'catalog-empty';
    empty.textContent = `没有匹配 “${el.catalogFilter?.value?.trim() || kw}”`;
    el.catalogList.appendChild(empty);
    return;
  }
  const current = currentCatalogHost();
  for (const group of groupCatalogHits(hits)) {
    const wrap = document.createElement('div');
    wrap.className = 'catalog-group-wrap';
    wrap.dataset.host = group.host;
    const { head, closed } = makeCatalogHostHead(group, current);
    wrap.appendChild(head);
    const box = document.createElement('div');
    box.className = 'catalog-items' + (closed ? ' hidden' : '');
    for (const r of group.items) {
      box.appendChild(makeCatalogItem(r, kw, group.host));
    }
    wrap.appendChild(box);
    el.catalogList.appendChild(wrap);
  }
}

function makeCatalogItem(r, kw, host) {
  const item = document.createElement('div');
  const here = !host || host === currentCatalogHost();
  item.className = 'catalog-item'
    + (here && r.id === activeSavedId ? ' on' : '')
    + (moduleRun?.id === r.id ? ' running' : '');
  item.dataset.id = r.id;
  if (host) item.dataset.host = host;
  if (!kw && !historyMode && !moduleRun && r.id) item.draggable = true;
  item.appendChild(catalogIcon('catalog-kind catalog-kind-api', ICO_API));
  const main = document.createElement('div');
  main.className = 'catalog-item-main';
  const line = document.createElement('div');
  line.className = 'catalog-item-line';
  const head = document.createElement('span');
  head.className = 'catalog-item-title';
  fillHighlighted(head, catalogItemLabel(r), kw);
  line.appendChild(head);
  main.appendChild(line);
  item.appendChild(main);
  catalogTipStore.set(item, { title: catalogItemLabel(r), html: catalogTipHTML(r, host) });
  if (!kw) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'catalog-more catalog-item-more';
    more.title = '接口菜单';
    more.setAttribute('aria-label', `${catalogItemLabel(r)} 菜单`);
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    more.draggable = false;
    more.textContent = '⋯';
    item.appendChild(more);
  }
  return item;
}

const catalogTipStore = new WeakMap();
let catalogTipItem = null;
let catalogTipHideTimer = 0;

function scheduleHideCatalogTip() {
  clearTimeout(catalogTipHideTimer);
  catalogTipHideTimer = setTimeout(() => {
    const tip = el.catalogTip || document.getElementById('catalogTip');
    if (tip && !tip.hidden && tip.matches(':hover')) return;
    hideCatalogTip();
  }, 160);
}

function catalogRequestBody(r) {
  if (!r) return '';
  if (isHTTPSaved(r)) {
    if (r.bodyType === 'none') return '';
    if (r.bodyType === 'form') return formEncode(r.formList || []);
    return r.body || '';
  }
  return r.body || '';
}

function queryRowsFromRequestURL(url) {
  const raw = String(url || '');
  const q = raw.indexOf('?');
  if (q < 0) return [];
  let query = raw.slice(q + 1);
  const hash = query.indexOf('#');
  if (hash >= 0) query = query.slice(0, hash);
  const rows = [];
  for (const part of query.split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    let key = i < 0 ? part : part.slice(0, i);
    let value = i < 0 ? '' : part.slice(i + 1);
    try {
      key = decodeURIComponent(key.replace(/\+/g, ' '));
      value = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch (_) {}
    if (String(key).trim()) rows.push({ key, value, enabled: true });
  }
  return rows;
}

function catalogTipKV(rows, { keyless = false } = {}) {
  const list = (rows || []).filter((r) => String(keyless ? (r?.value ?? '') : (r?.key ?? '')).trim());
  if (!list.length) return '';
  return list.map((r) => {
    const off = r.enabled === false ? ' off' : '';
    if (keyless) {
      return `<div class="catalog-tip-kv one${off}"><span class="v">${escapeHtml(r.value ?? '')}</span></div>`;
    }
    return `<div class="catalog-tip-kv${off}"><span class="k">${escapeHtml(r.key ?? '')}</span><span class="v">${escapeHtml(r.value ?? '')}</span></div>`;
  }).join('');
}

function catalogTipSection(label, body) {
  if (!String(body || '').trim()) return '';
  return `<div class="catalog-tip-sec"><div class="catalog-tip-label">${escapeHtml(label)}</div><div class="catalog-tip-body">${body}</div></div>`;
}

function catalogTipHTML(r, host) {
  const http = isHTTPSaved(r);
  const method = http ? String(r.method || 'GET').toUpperCase() : 'WS';
  const stored = String(r.url || '').trim();
  const sameHost = !String(host || '').trim() || String(host).trim() === currentCatalogHost();
  const address = http && sameHost ? (docResolvedURL(r) || stored) : stored;
  const name = requestDisplayTitle(r);
  const desc = requestDescription(r);
  const moduleName = String(r.module || '').trim();
  const protocol = String(r.protocol || '').trim();
  const parts = [
    `<div class="catalog-tip-head">` +
      `<span class="saved-item-method ${http ? method.toLowerCase() : 'ws'}">${escapeHtml(method)}</span>` +
      `<span class="catalog-tip-path">${escapeHtml(http ? (address || '/') : (address || wsCmdLabel(r) || '未命名'))}</span>` +
    `</div>`,
  ];
  const meta = [];
  if (name) meta.push(`<span class="catalog-tip-name">${escapeHtml(name)}</span>`);
  const hid = String(host || '').trim();
  if (hid && hid !== currentCatalogHost()) meta.push(`<span class="catalog-tip-tag">${escapeHtml(hid)}</span>`);
  if (moduleName) meta.push(`<span class="catalog-tip-tag">${escapeHtml(moduleName)}</span>`);
  if (protocol) meta.push(`<span class="catalog-tip-tag">${escapeHtml(protocol)}</span>`);
  if (meta.length) parts.push(`<div class="catalog-tip-meta-line">${meta.join('')}</div>`);
  if (desc) parts.push(`<div class="catalog-tip-desc">${escapeHtml(desc)}</div>`);
  if (!http) {
    const body = String(r.body || '');
    if (body.trim()) parts.push(catalogTipSection('请求', renderDocCode(body)));
    return parts.join('');
  }
  parts.push(catalogTipSection('参数', catalogTipKV(queryRowsFromRequestURL(address || stored))));
  parts.push(catalogTipSection('请求头', catalogTipKV(r.headerList)));
  parts.push(catalogTipSection('鉴权', catalogTipKV(renderDocAuthRows(r), { keyless: true })));
  const bodyType = String(r.bodyType || 'none');
  if (bodyType === 'form') {
    parts.push(catalogTipSection('请求体', catalogTipKV(r.formList)));
  } else if (bodyType !== 'none') {
    const body = catalogRequestBody(r);
    if (String(body).trim()) parts.push(catalogTipSection('请求体', renderDocCode(body)));
  }
  return parts.join('');
}

function bindCatalogTip(tip) {
  if (!tip || tip.dataset.bound) return tip;
  tip.dataset.bound = '1';
  tip.addEventListener('mouseenter', () => clearTimeout(catalogTipHideTimer));
  tip.addEventListener('mouseleave', hideCatalogTip);
  return tip;
}

function ensureCatalogTip() {
  if (el.catalogTip && el.catalogTip.isConnected) return bindCatalogTip(el.catalogTip);
  let tip = document.getElementById('catalogTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'catalogTip';
    tip.className = 'catalog-tip';
    tip.hidden = true;
    (el.app || document.body).appendChild(tip);
  }
  el.catalogTip = tip;
  return bindCatalogTip(tip);
}

function hideCatalogTip() {
  clearTimeout(catalogTipHideTimer);
  catalogTipItem = null;
  const tip = el.catalogTip || document.getElementById('catalogTip');
  if (!tip) return;
  tip.hidden = true;
  tip.classList.remove('is-on', 'title-only');
  tip.innerHTML = '';
}

function catalogTitleOverflow(item) {
  const title = item?.querySelector?.('.catalog-item-title');
  if (!title) return false;
  return title.scrollWidth - title.clientWidth > 1;
}

function placeCatalogTip(item) {
  const tip = ensureCatalogTip();
  if (tip.classList.contains('title-only') && item) {
    const r = item.getBoundingClientRect();
    const pane = el.catalogPane?.getBoundingClientRect();
    const left = Math.round((pane?.right || r.right) + 6);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.round(r.top)}px`;
    tip.style.width = 'auto';
    tip.style.maxWidth = `${Math.max(120, Math.min(420, window.innerWidth - left - 12))}px`;
    tip.style.maxHeight = 'none';
    const th = tip.offsetHeight || 0;
    if (r.top + th > window.innerHeight - 8) {
      tip.style.top = `${Math.max(8, window.innerHeight - th - 8)}px`;
    }
    return;
  }
  const pane = el.catalogPane?.getBoundingClientRect();
  const bar = document.querySelector('.bar')?.getBoundingClientRect();
  const left = Math.round((pane?.right || 220) + 8);
  const top = Math.round((bar?.bottom || 48) + 8);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.width = `${Math.max(280, Math.min(480, window.innerWidth - left - 16))}px`;
  tip.style.maxHeight = `${Math.max(160, window.innerHeight - top - 16)}px`;
}

function fillCatalogTip(item) {
  if (!item || catalogDrag) return;
  const rec = catalogTipStore.get(item);
  const title = rec?.title || item.querySelector('.catalog-item-title')?.textContent || '';
  const html = typeof rec === 'string' ? rec : rec?.html;
  const tip = ensureCatalogTip();
  if (catalogHoverMode() === 'title') {
    if (!catalogTitleOverflow(item) || !title) {
      hideCatalogTip();
      return;
    }
    catalogTipItem = item;
    tip.innerHTML = `<div class="catalog-tip-title">${escapeHtml(title)}</div>`;
    tip.classList.add('is-on', 'title-only');
    tip.hidden = false;
    placeCatalogTip(item);
    return;
  }
  if (!html) return;
  catalogTipItem = item;
  tip.innerHTML = html;
  tip.classList.remove('title-only');
  tip.classList.add('is-on');
  tip.hidden = false;
  placeCatalogTip(item);
}

function onCatalogHover(e) {
  const item = e.target?.closest?.('.catalog-item');
  if (!item || !el.catalogList?.contains(item) || e.target.closest('.catalog-more')) {
    if (!e.target?.closest?.('.catalog-item')) hideCatalogTip();
    return;
  }
  if (item !== catalogTipItem) fillCatalogTip(item);
}

function clearCatalogDropMarks() {
  for (const node of el.catalogList?.querySelectorAll('.drop-before, .drop-after, .drop-end, .drop-into') || []) {
    node.classList.remove('drop-before', 'drop-after', 'drop-end', 'drop-into');
  }
}

function clearCatalogDragState() {
  clearCatalogDropMarks();
  for (const node of el.catalogList?.querySelectorAll('.dragging') || []) {
    node.classList.remove('dragging');
  }
}

function catalogDropTarget() {
  const into = el.catalogList?.querySelector('.drop-into');
  if (into) return { node: into, where: 'into' };
  const before = el.catalogList?.querySelector('.drop-before');
  if (before) return { node: before, where: 'before' };
  const after = el.catalogList?.querySelector('.drop-after');
  if (after) return { node: after, where: 'after' };
  const end = el.catalogList?.querySelector('.drop-end');
  if (end) return { node: end, where: 'end' };
  return null;
}

function moveModule(from, to, before) {
  if (!from || !to || from === to) return false;
  const p = ensureCurrentProfile();
  if (!p) return false;
  const list = currentModules().slice();
  const fi = list.indexOf(from);
  if (fi < 0 || list.indexOf(to) < 0) return false;
  list.splice(fi, 1);
  let ti = list.indexOf(to);
  if (ti < 0) return false;
  if (!before) ti += 1;
  list.splice(ti, 0, from);
  p.modules = list;
  return true;
}

function moveRequestInModule(id, targetId, before) {
  const p = ensureCurrentProfile();
  if (!p || !id) return false;
  const src = p.requests.find((r) => r.id === id);
  if (!src) return false;
  const module = requestModuleName(src);
  const group = p.requests.filter((r) => requestModuleName(r) === module);
  const ids = group.map((r) => r.id).filter((x) => x !== id);
  let at = targetId ? ids.indexOf(targetId) : ids.length;
  if (targetId && at < 0) return false;
  if (targetId && !before) at += 1;
  if (at < 0) at = ids.length;
  ids.splice(at, 0, id);
  if (ids.join('\0') === group.map((r) => r.id).join('\0')) return false;
  const byId = new Map(group.map((r) => [r.id, r]));
  const nextGroup = ids.map((x) => byId.get(x)).filter(Boolean);
  let i = 0;
  p.requests = p.requests.map((r) => (requestModuleName(r) === module ? nextGroup[i++] : r));
  return true;
}

function moveRequestToModule(id, destModule, targetId, before) {
  const p = ensureCurrentProfile();
  if (!p || !id) return false;
  destModule = clipText(destModule || '', 80);
  const src = p.requests.find((r) => r.id === id);
  if (!src) return false;
  if (requestModuleName(src) === destModule) {
    return moveRequestInModule(id, targetId, before);
  }
  src.module = destModule;
  if (id === activeSavedId && el.reqModule) el.reqModule.value = destModule;
  const others = p.requests.filter((r) => r.id !== id);
  const destIds = others.filter((r) => requestModuleName(r) === destModule).map((r) => r.id);
  let at = targetId ? destIds.indexOf(targetId) : destIds.length;
  if (targetId && at < 0) at = destIds.length;
  if (targetId && !before) at += 1;
  if (at < 0 || at > destIds.length) at = destIds.length;
  destIds.splice(at, 0, id);
  const byId = new Map(p.requests.map((r) => [r.id, r]));
  let emitted = false;
  const next = [];
  for (const r of others) {
    if (requestModuleName(r) === destModule) {
      if (!emitted) {
        for (const did of destIds) {
          const row = byId.get(did);
          if (row) next.push(row);
        }
        emitted = true;
      }
      continue;
    }
    next.push(r);
  }
  if (!emitted) {
    const row = byId.get(id);
    if (row) next.push(row);
  }
  p.requests = next;
  return true;
}

function revealCatalogGroup(wrap) {
  if (!wrap) return;
  const box = wrap.querySelector('.catalog-items');
  if (!box?.classList.contains('hidden')) return;
  box.classList.remove('hidden');
  const caret = wrap.querySelector('.catalog-caret');
  if (caret) caret.textContent = '▾';
  catalogOpenGroups.add(wrap.dataset.module || '');
}

function onCatalogDragStart(e) {
  hideCatalogTip();
  if (historyMode || moduleRun || catalogFilterKeyword() || e.target?.closest?.('.catalog-more, .catalog-add-module')) {
    e.preventDefault();
    return;
  }
  const item = e.target?.closest?.('.catalog-item');
  const group = e.target?.closest?.('.catalog-group');
  if (item?.dataset?.id && item.draggable) {
    catalogDrag = {
      type: 'item',
      id: item.dataset.id,
      module: item.closest('.catalog-group-wrap')?.dataset?.module || '',
    };
    item.classList.add('dragging');
  } else if (group?.draggable && group.dataset.module) {
    catalogDrag = { type: 'group', module: group.dataset.module };
    group.classList.add('dragging');
    group.closest('.catalog-group-wrap')?.classList.add('dragging');
  } else {
    e.preventDefault();
    return;
  }
  catalogDidDrag = true;
  closeGroupMenu();
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', catalogDrag.type);
}

function scrollCatalogWhileDragging(e) {
  const list = el.catalogList;
  if (!list) return;
  const rect = list.getBoundingClientRect();
  const edge = 28;
  if (e.clientY < rect.top + edge) list.scrollTop -= 14;
  else if (e.clientY > rect.bottom - edge) list.scrollTop += 14;
}

function onCatalogDragOver(e) {
  if (historyMode || !catalogDrag || catalogFilterKeyword()) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  scrollCatalogWhileDragging(e);
  clearCatalogDropMarks();
  const wrap = e.target?.closest?.('.catalog-group-wrap');
  if (catalogDrag.type === 'group') {
    const to = wrap?.dataset?.module || '';
    if (!to || to === catalogDrag.module) return;
    const rect = wrap.getBoundingClientRect();
    wrap.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-before' : 'drop-after');
    return;
  }
  if (!wrap) return;
  const item = e.target?.closest?.('.catalog-item');
  if (item?.dataset?.id === catalogDrag.id) return;
  if (item?.dataset?.id) {
    const rect = item.getBoundingClientRect();
    item.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-before' : 'drop-after');
    return;
  }
  revealCatalogGroup(wrap);
  const destModule = wrap.dataset.module || '';
  if (destModule !== catalogDrag.module || e.target?.closest?.('.catalog-group')) {
    wrap.classList.add('drop-into');
    wrap.querySelector('.catalog-group')?.classList.add('drop-into');
    return;
  }
  wrap.querySelector('.catalog-items')?.classList.add('drop-end');
}

function onCatalogDrop(e) {
  if (historyMode || !catalogDrag || catalogFilterKeyword()) return;
  e.preventDefault();
  const dest = catalogDropTarget();
  let changed = false;
  if (catalogDrag.type === 'group') {
    const wrap = dest?.node?.closest?.('.catalog-group-wrap');
    const to = wrap?.dataset?.module || '';
    if (to) changed = moveModule(catalogDrag.module, to, dest.where === 'before');
  } else {
    const wrap = dest?.node?.closest?.('.catalog-group-wrap');
    const destModule = wrap ? wrap.dataset.module || '' : '';
    if (dest?.where === 'into' || dest?.where === 'end') {
      changed = moveRequestToModule(catalogDrag.id, destModule, '', true);
    } else {
      const item = dest?.node?.closest?.('.catalog-item');
      const targetId = item?.dataset?.id || '';
      if (targetId) changed = moveRequestToModule(catalogDrag.id, destModule, targetId, dest.where === 'before');
    }
    if (changed) catalogOpenGroups.add(destModule);
  }
  clearCatalogDragState();
  catalogDrag = null;
  if (!changed) return;
  renderCatalog();
  persistProfile();
}

function onCatalogDragEnd() {
  clearCatalogDragState();
  catalogDrag = null;
  setTimeout(() => { catalogDidDrag = false; }, 0);
}

function onCatalogClick(e) {
  if (catalogDidDrag) {
    e.preventDefault();
    catalogDidDrag = false;
    return;
  }
  if (moduleRun && e.target?.closest?.('.catalog-item, .catalog-more, .catalog-add-module')) {
    return;
  }
  const addMod = e.target?.closest?.('.catalog-add-module');
  if (addMod) {
    e.preventDefault();
    addCatalogModule();
    return;
  }
  const itemMore = e.target?.closest?.('.catalog-item-more');
  if (itemMore) {
    e.preventDefault();
    e.stopPropagation();
    const id = itemMore.closest('.catalog-item')?.dataset?.id || '';
    openItemMenu(itemMore, id);
    return;
  }
  const more = e.target?.closest?.('.catalog-group-more');
  if (more) {
    e.preventDefault();
    e.stopPropagation();
    const module = more.closest('.catalog-group')?.dataset?.module || '';
    openGroupMenu(more, module);
    return;
  }
  const group = e.target?.closest?.('.catalog-group');
  if (group && el.catalogList?.contains(group)) {
    const key = group.dataset.closeKey || group.dataset.module || '';
    if (catalogOpenGroups.has(key)) catalogOpenGroups.delete(key);
    else catalogOpenGroups.add(key);
    renderCatalog();
    return;
  }
  const item = e.target?.closest?.('.catalog-item');
  if (item?.dataset?.id) pickCatalogRequest(item.dataset.id, item.dataset.host || '');
}

async function pickCatalogRequest(id, host) {
  if (moduleRun) return;
  const target = String(host || currentCatalogHost() || '').trim();
  const current = currentCatalogHost();
  if (target && target !== current) {
    await persistProfile();
    const p = profiles.find((x) => x.name === target);
    if (!p) return;
    await applyProfile(p);
  }
  const req = (currentProfileRequests() || []).find((r) => r.id === id);
  if (!req) return;
  if (isHTTPSaved(req)) await pickSavedRequest(id);
  else await pickSavedWSMessage(id);
  renderCatalog();
}

function blankHTTPRequest(id, moduleName) {
  return {
    id,
    name: 'GET /',
    title: '',
    description: '',
    module: clipText(moduleName, 80),
    updatedAt: Date.now(),
    kind: 'http',
    url: '/',
    method: 'GET',
    protocol: '',
    headerList: [emptyRow()],
    authType: 'none',
    authToken: '',
    authUser: '',
    authPass: '',
    bodyType: 'json',
    body: '',
    formList: [emptyRow()],
  };
}

function blankWSRequest(id, moduleName) {
  return {
    id,
    name: '新消息',
    title: '',
    description: '',
    module: clipText(moduleName, 80),
    updatedAt: Date.now(),
    kind: 'ws',
    url: '',
    protocol: el.protocol?.value?.trim() || '',
    body: '',
  };
}

function wsNameFromEditor(prev) {
  const text = el.payload?.value || '';
  const key = wsMessageKey(text);
  if (key) return wsMessageStoreName(key, text);
  return prev?.name || '新消息';
}

function syncActiveRequestSnapshot() {
  const req = currentSavedRequest();
  if (!req) return;
  const next = isDefinitionHTTPMode()
    ? snapshotCurrentRequest(currentRequestKey() || req.name || 'GET /', req.id)
    : snapshotWSMessage(wsNameFromEditor(req), req.id);
  Object.assign(req, next);
}

async function addCatalogRequest(moduleName) {
  if (!activeEnvironmentURL()) {
    openUrlModal({ createRequest: true, moduleName });
    return;
  }
  const selected = currentSavedRequest();
  if (selected && isHTTPSaved(selected) === isDefinitionHTTPMode()) {
    syncActiveRequestSnapshot();
  } else {
    activeSavedId = '';
  }
  const p = ensureCurrentProfile();
  if (!p) return;
  const module = clipText(moduleName, 80);
  if (module) rememberModule(module);
  const id = newRequestId();
  const req = isDefinitionHTTPMode() ? blankHTTPRequest(id, module) : blankWSRequest(id, module);
  p.requests = (p.requests || []).concat(req);
  if (isDefinitionHTTPMode()) applySavedRequest(req);
  else applySavedWSMessage(req);
  setActiveSavedId(id);
  renderCatalog();
  await persistProfile();
  if (isDocMode() && !docEditing()) setDocEditing(true);
  else el.reqTitle?.focus();
}

function cloneSavedRequest(src) {
  const copy = JSON.parse(JSON.stringify(src || {}));
  copy.id = newRequestId();
  copy.updatedAt = Date.now();
  const base = String(src?.title || requestDisplayTitle(src) || src?.name || (isDefinitionHTTPMode() ? '接口' : '消息')).trim();
  copy.title = clipText(`${base} 副本`, 80);
  return copy;
}

async function duplicateCatalogRequest(id) {
  if (activeSavedId) syncActiveRequestSnapshot();
  const p = ensureCurrentProfile();
  if (!p) return;
  const i = (p.requests || []).findIndex((r) => r.id === id);
  if (i < 0) return;
  const copy = cloneSavedRequest(p.requests[i]);
  p.requests.splice(i + 1, 0, copy);
  if (isHTTPSaved(copy)) applySavedRequest(copy);
  else applySavedWSMessage(copy);
  setActiveSavedId(copy.id);
  renderCatalog();
  await persistProfile();
  if (isDocMode() && !docEditing()) setDocEditing(true);
  else el.reqTitle?.focus();
}

async function addCatalogModule() {
  const raw = await askPrompt({
    title: '新建模块',
    placeholder: '例如 登录',
    hint: '模块相当于文件夹，可把接口归到一组。',
    okText: '创建',
    validate: (s) => {
      if (!String(s || '').trim()) return '请输入模块名';
      if (Array.from(String(s || '').trim()).length > 80) return '最多 80 字';
      return '';
    },
  });
  if (raw == null) return;
  const name = rememberModule(raw);
  if (!name) return;
  catalogOpenGroups.add(name);
  renderCatalog();
  await persistProfile();
}

async function renameCatalogModule(from) {
  const raw = await askPrompt({
    title: '重命名模块',
    value: from,
    placeholder: '模块名',
    okText: '保存',
    validate: (s) => {
      if (!String(s || '').trim()) return '请输入模块名';
      if (Array.from(String(s || '').trim()).length > 80) return '最多 80 字';
      return '';
    },
  });
  if (raw == null) return;
  const to = clipText(raw, 80);
  if (!to || to === from) return;
  if (!renameModule(from, to)) return;
  if (catalogOpenGroups.has(from)) {
    catalogOpenGroups.delete(from);
    catalogOpenGroups.add(to);
  }
  renderCatalog();
  await persistProfile();
}

async function deleteCatalogModule(name) {
  const n = currentProfileRequests().filter((r) => requestModuleName(r) === name).length;
  const ok = await askConfirm({
    title: '删除模块',
    message: n
      ? `删除「${name}」后，其中 ${n} 个接口会移到「未分组」。`
      : `确定删除空模块「${name}」？`,
    okText: '删除',
  });
  if (!ok) return;
  clearModule(name);
  catalogOpenGroups.delete(name);
  renderCatalog();
  await persistProfile();
}

async function saveCurrentRequest() {
  if (!isDocMode()) return;
  flushDocEditors();
  const p = ensureCurrentProfile();
  if (!p) return;
  if (activeSavedId && currentSavedRequest()) {
    syncActiveRequestSnapshot();
  } else {
    const id = upsertCurrentSavedRequest();
    if (id) activeSavedId = id;
  }
  const module = currentReqModule();
  if (module) rememberModule(module);
  await persistProfile();
  if (!isDocMode()) flashButton(isDefinitionHTTPMode() ? el.btnSaveReq : el.btnSaveWS, '已保存');
  setActiveSavedId(activeSavedId);
  loadReqMeta(currentSavedRequest());
  renderCatalog();
}

function currentSavedRequest() {
  if (!activeSavedId) return null;
  return currentProfileRequests().find((r) => r.id === activeSavedId) || null;
}

function currentRequestHint() {
  return requestHintFrom(currentSavedRequest());
}

function requestHintFrom(r) {
  if (!r) return null;
  const http = isHTTPSaved(r);
  return {
    id: String(r.id || ''),
    title: String(r.title || '').trim(),
    label: catalogItemLabel(r),
    module: requestModuleName(r),
    http,
    method: http ? String(r.method || 'GET').toUpperCase() : '',
    path: http ? (requestItemPath(r) || '') : '',
    cmd: http ? '' : wsMessageKey(r.body || ''),
  };
}

function findEquivalentRequest(hint) {
  if (!hint) return null;
  const reqs = currentProfileRequests();
  if (!reqs.length) return null;
  if (hint.id) {
    const byId = reqs.find((r) => r.id === hint.id);
    if (byId) return byId;
  }
  const pool = reqs.filter((r) => isHTTPSaved(r) === Boolean(hint.http));
  const list = pool.length ? pool : reqs;
  const titled = hint.title
    ? list.filter((r) => String(r.title || '').trim() === hint.title)
    : [];
  if (titled.length) {
    if (hint.module) {
      const inMod = titled.find((r) => requestModuleName(r) === hint.module);
      if (inMod) return inMod;
    }
    if (titled.length === 1) return titled[0];
    if (hint.path) {
      const byPath = titled.find((r) => requestItemPath(r) === hint.path);
      if (byPath) return byPath;
    }
    if (hint.cmd) {
      const byCmd = titled.find((r) => wsMessageKey(r.body || '') === hint.cmd);
      if (byCmd) return byCmd;
    }
    return titled[0];
  }
  if (hint.http && hint.path) {
    const key = `${hint.method || 'GET'} ${hint.path}`;
    const byKey = list.find((r) => requestKeyFrom(r) === key);
    if (byKey) return byKey;
    const byPath = list.find((r) => requestItemPath(r) === hint.path);
    if (byPath) return byPath;
  }
  if (!hint.http && hint.cmd) {
    const byCmd = list.find((r) => wsMessageKey(r.body || '') === hint.cmd);
    if (byCmd) return byCmd;
  }
  if (hint.label) {
    const labeled = list.filter((r) => catalogItemLabel(r) === hint.label);
    if (hint.module) {
      const inMod = labeled.find((r) => requestModuleName(r) === hint.module);
      if (inMod) return inMod;
    }
    if (labeled.length === 1) return labeled[0];
  }
  return null;
}

function restoreRequestFromHint(hint) {
  const req = findEquivalentRequest(hint);
  if (!req) {
    setActiveSavedId('');
    loadReqMeta(null);
    if (isDocMode()) renderDocPane();
    return false;
  }
  if (isHTTPSaved(req)) applySavedRequest(req);
  else applySavedWSMessage(req);
  const mod = requestModuleName(req);
  catalogOpenGroups.add(mod);
  setActiveSavedId(req.id);
  loadReqMeta(req);
  if (isDocMode()) renderDocPane();
  renderCatalog();
  return true;
}

function setActiveSavedId(id) {
  if (id !== undefined) activeSavedId = id || '';
  const reqs = isDefinitionHTTPMode() ? currentHTTPRequests() : currentWSMessages();
  if (activeSavedId && !reqs.some((r) => r.id === activeSavedId)) activeSavedId = '';
  if (isDocMode()) renderDocPane();
  return activeSavedId;
}

function urlPathname(url) {
  let path = splitLockedURL(url).rest || '';
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);
  const h = path.indexOf('#');
  if (h >= 0) path = path.slice(0, h);
  path = path.trim();
  if (!path || path === '/') return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function requestKeyFrom(req) {
  const url = req?.url || '';
  const path = urlPathname(url);
  if (isHTTPSaved(req)) {
    return `${String(req?.method || 'GET').toUpperCase()} ${path}`;
  }
  return path;
}

function currentRequestKey() {
  const path = urlPathname(requestDefinitionURL(currentURL(), activeEnvironmentURL()));
  if (isDefinitionHTTPMode()) return `${(el.method?.value || 'GET').toUpperCase()} ${path}`;
  return path;
}

function matchSavedId() {
  const key = currentRequestKey();
  return currentHTTPRequests().find((r) => requestKeyFrom(r) === key)?.id || '';
}

function matchSavedWSId() {
  const key = wsMessageKey(el.payload?.value || '');
  if (!key) return '';
  return currentWSMessages().find((r) => wsMessageKey(r.body || '') === key)?.id || '';
}

function newRequestId() {
  try {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

function snapshotCurrentRequest(name, id, extra) {
  const prev = id ? currentProfileRequests().find((r) => r.id === id) : null;
  return {
    id: id || '',
    name,
    title: currentReqTitle() || prev?.title || '',
    description: currentReqDesc() || prev?.description || '',
    module: currentReqModule() || prev?.module || '',
    updatedAt: Date.now(),
    kind: 'http',
    url: requestDefinitionURL(currentURL(), activeEnvironmentURL()),
    method: el.method?.value || 'GET',
    protocol: el.protocol?.value?.trim() || '',
    headerList: cloneRows(headerRows),
    authType: el.authType?.value || authState.type || 'none',
    authToken: el.authToken?.value || authState.token || '',
    authUser: el.authUser?.value || authState.user || '',
    authPass: el.authPass?.value || authState.pass || '',
    bodyType: currentBodyType(),
    body: extra?.body !== undefined ? extra.body : currentBody(),
    formList: cloneRows(formRows),
    example: extra?.example !== undefined ? extra.example : (prev?.example || ''),
  };
}

function snapshotWSMessage(name, id, extra) {
  const prev = id ? currentProfileRequests().find((r) => r.id === id) : null;
  return {
    id: id || '',
    name,
    title: currentReqTitle() || prev?.title || '',
    description: currentReqDesc() || prev?.description || '',
    module: currentReqModule() || prev?.module || '',
    updatedAt: Date.now(),
    kind: 'ws',
    url: '',
    protocol: el.protocol?.value?.trim() || '',
    body: extra?.body !== undefined ? extra.body : (el.payload?.value || ''),
    example: extra?.example !== undefined ? extra.example : currentExample(prev),
  };
}

function currentExample(prev) {
  if (el.payloadIn) return el.payloadIn.value || '';
  return prev?.example || recordDraft.in || '';
}

function applySavedRequest(req) {
  if (!req) return false;
  recordDraft.resBody = req.example || '';
  const raw = runtimeURLForSavedRequest(req.url);
  const lock = activeEnvironmentURL() || profileNameFromURL(raw) || activeProfileName || '';
  if (raw) setURL(raw, lock);
  if (el.protocol) el.protocol.value = req.protocol || '';
  const method = (req.method || 'GET').toUpperCase();
  if (el.method && [...el.method.options].some((o) => o.value === method)) {
    el.method.value = method;
  } else if (el.method) {
    el.method.value = 'GET';
  }
  setReqTab(reqTab);
  loadHeadersFromProfile(req);
  loadAuthFromProfile(req);
  loadBodyTypeFromProfile(req);
  loadBodyFromProfile(req);
  withoutSessionReset(() => applyTransportFromURL());
  syncParamsFromURL();
  renderRequestEditor();
  loadReqMeta(req);
  if (httpDebugLayout()) resetHTTPResponse();
  return true;
}

function applySavedWSMessage(req) {
  if (!req || !el.payload) return false;
  const environmentURL = activeEnvironmentURL();
  const raw = environmentURL || (['ws', 'wss'].includes(urlScheme(req.url)) ? req.url : '');
  const lock = activeEnvironmentURL() || profileNameFromURL(raw) || activeProfileName || '';
  if (raw) setURL(raw, lock);
  else setURL('');
  if (el.protocol) el.protocol.value = req.protocol || '';
  el.payload.value = req.body || '';
  lastSent = el.payload.value;
  recordDraft.in = req.example || '';
  if (el.payloadIn) el.payloadIn.value = req.example || '';
  loadReqMeta(req);
  withoutSessionReset(() => applyTransportFromURL());
  return true;
}

function requestItemPath(r) {
  const rest = splitLockedURL(r?.url || '').rest;
  return rest || urlPathname(r?.url) || '/';
}

function savedRequestHaystack(r) {
  const http = HTTP_SCHEMES.has(urlScheme(r?.url));
  const method = http ? String(r?.method || 'GET').toUpperCase() : '';
  const path = requestItemPath(r);
  return `${method} ${path} ${r?.name || ''} ${r?.title || ''} ${r?.description || ''} ${r?.module || ''} ${r?.url || ''} ${r?.example || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
}

function fillHighlighted(node, text, kw) {
  node.textContent = '';
  const raw = String(text || '');
  const needle = String(kw || '').trim();
  if (!needle) {
    node.textContent = raw;
    return;
  }
  const lower = raw.toLowerCase();
  const q = needle.toLowerCase();
  let from = 0;
  let i = lower.indexOf(q, from);
  if (i < 0) {
    node.textContent = raw;
    return;
  }
  while (i >= 0) {
    if (i > from) node.appendChild(document.createTextNode(raw.slice(from, i)));
    const mark = document.createElement('span');
    mark.className = 'saved-hit';
    mark.textContent = raw.slice(i, i + q.length);
    node.appendChild(mark);
    from = i + q.length;
    i = lower.indexOf(q, from);
  }
  if (from < raw.length) node.appendChild(document.createTextNode(raw.slice(from)));
}

function savedWSHaystack(r) {
  return `${r?.name || ''} ${r?.title || ''} ${r?.description || ''} ${r?.module || ''} ${r?.body || ''} ${r?.example || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
}

function upsertCurrentSavedRequest() {
  const p = ensureCurrentProfile();
  if (!p) return '';
  const list = Array.isArray(p.requests) ? p.requests.slice() : [];
  if (activeSavedId) {
    const i = list.findIndex((r) => r.id === activeSavedId);
    if (i >= 0) {
      const req = isDefinitionHTTPMode()
        ? snapshotCurrentRequest(currentRequestKey() || list[i].name || 'GET /', list[i].id)
        : snapshotWSMessage(wsNameFromEditor(list[i]), list[i].id);
      list[i] = req;
      p.requests = list;
      return req.id;
    }
  }
  if (isDefinitionHTTPMode()) {
    const key = currentRequestKey();
    let i = list.findIndex((r) => isHTTPSaved(r) && requestKeyFrom(r) === key);
    if (i < 0) i = list.findIndex((r) => isHTTPSaved(r) && r.name === key);
    const req = snapshotCurrentRequest(key, i >= 0 ? list[i].id : newRequestId());
    if (i >= 0) list[i] = req;
    else list.push(req);
    p.requests = list;
    return req.id;
  }
  const text = el.payload?.value || '';
  const key = wsMessageKey(text);
  if (!key) return '';
  let i = list.findIndex((r) => isWSSaved(r) && wsMessageKey(r.body || '') === key);
  const req = snapshotWSMessage(wsMessageStoreName(key, text), i >= 0 ? list[i].id : newRequestId());
  if (i >= 0) list[i] = req;
  else list.push(req);
  p.requests = list;
  return req.id;
}

async function deleteNamedRequest(id) {
  const req = currentProfileRequests().find((r) => r.id === id);
  if (!req?.id) return;
  const ws = isWSSaved(req);
  const label = requestDisplayTitle(req) || req.name;
  const ok = await askConfirm({
    title: ws ? '删除发送' : '删除请求',
    message: `确定删除「${label}」？此操作不可恢复。`,
    okText: '删除',
  });
  if (!ok) return;
  const name = activeProfileName || currentProfile()?.name || profileNameFromURL(currentURL());
  if (!name) return;
  try {
    await DeleteRequest(name, req.id);
  } catch (e) {
    setDetailEmpty('删除失败: ' + e);
    return;
  }
  const p = currentProfile();
  if (p) p.requests = currentProfileRequests().filter((r) => r.id !== req.id);
  if (activeSavedId === req.id) {
    setActiveSavedId('');
    loadReqMeta(null);
  }
  renderCatalog();
}

async function pickSavedRequest(id) {
  const req = currentHTTPRequests().find((r) => r.id === id);
  if (!req) return;
  applySavedRequest(req);
  setActiveSavedId(req.id);
  renderCatalog();
  await persistProfile();
}

async function pickSavedWSMessage(id) {
  const req = currentWSMessages().find((r) => r.id === id);
  if (!req) return;
  applySavedWSMessage(req);
  setActiveSavedId(req.id);
  renderCatalog();
  await persistProfile();
}

function flushHeaderBulk() {
  if (headerBulkOn() && el.headerBulk) {
    headerRows = headersFromText(el.headerBulk.value);
  }
}

async function persistProfile(selectName, { syncRequest = true } = {}) {
  if (typeof selectName !== 'string') selectName = '';
  flushHeaderBulk();
  if (isDocMode()) {
    flushReqMeta();
    flushDocEditors();
  }
  if (syncRequest && isDocMode() && activeSavedId) syncActiveRequestSnapshot();
  const current = currentProfile();
  const emptyProject = Boolean(current?.project) && !profileNameFromURL(current?.url || '');
  const name = current?.name || activeProfileName || profileNameFromURL(currentURL());
  if (!name) return;
  const prev = profiles.find((x) => x.name === name);
  const url = emptyProject ? '' : (prev?.url || currentURL() || '');
  const module = currentReqModule();
  if (isDocMode() && module && activeSavedId) rememberModule(module);
  authState = {
    type: el.authType?.value || 'none',
    token: el.authToken?.value || '',
    user: el.authUser?.value || '',
    pass: el.authPass?.value || '',
  };
  const cur = profiles.find((x) => x.name === name) || currentProfile();
  const src = cur || prev;
  const keepSavedEditor = !isDocMode() && src;
  const p = {
    name,
    url,
    project: src?.project || (isExplicitProject(el.project?.value) ? String(el.project.value).trim() : ''),
    protocol: keepSavedEditor ? (src.protocol || '') : el.protocol.value.trim(),
    method: keepSavedEditor ? (src.method || 'GET') : (el.method?.value || 'GET'),
    headers: keepSavedEditor ? { ...(src.headers || {}) } : currentHeaders(),
    headerList: keepSavedEditor
      ? (Array.isArray(src.headerList) ? cloneRows(src.headerList) : rowsFromMap(src.headers))
      : cloneRows(headerRows),
    variableList: cloneRows(varRows),
    activeEnv,
    environments: snapshotEnvironments(),
    authType: keepSavedEditor ? (src.authType || 'none') : authState.type,
    authToken: keepSavedEditor ? (src.authToken || '') : authState.token,
    authUser: keepSavedEditor ? (src.authUser || '') : authState.user,
    authPass: keepSavedEditor ? (src.authPass || '') : authState.pass,
    bodyType: keepSavedEditor ? (src.bodyType || 'json') : currentBodyType(),
    body: keepSavedEditor ? (src.body || '') : currentBody(),
    formList: keepSavedEditor ? cloneRows(src.formList || []) : cloneRows(formRows),
    reconnect: el.reconnect.checked,
    pingSec: 20,
    noFollowRedirects: el.followRedirects ? !el.followRedirects.checked : false,
    insecureSkipVerify: Boolean(el.insecureSkipVerify?.checked),
    requests: Array.isArray(src?.requests) ? src.requests : [],
    modules: [...(src?.modules || [])],
  };
  const idx = profiles.findIndex((x) => x.name === name);
  if (idx >= 0) profiles[idx] = p;
  else {
    profiles.push(p);
    profiles.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  try {
    await queueProfileSave(p);
    renderProjectSelect();
    rememberSelection();
    renderCatalog();
    return true;
  } catch (e) {
    setDetailEmpty('保存失败: ' + e);
    return false;
  }
}

async function applyImportedCatalog(merged) {
  const name = merged?.name || '';
  profiles = (await GetProfiles()) || [];
  if (name && !profiles.some((p) => p.name === name)) {
    profiles.push(merged);
    profiles.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
  const p = (name && profiles.find((x) => x.name === name)) || merged;
  if (!p) return;
  await applyProfile(p);
}

function openExportMenu(anchor) {
  openCatalogMenu(anchor || el.btnCatalogExport, 'export', [
    { act: 'export-one', label: '导出当前项目' },
    { act: 'export-all', label: '导出全部' },
  ]);
}

async function exportCatalog() {
  await persistProfile();
  const p = currentProfile();
  if (!p) return;
  try {
    const ok = await ExportCatalog(p);
    if (ok) flashCatalogTitle('已导出');
  } catch (e) {
    setDetailEmpty('导出失败: ' + e);
  }
}

async function exportAllCatalogs() {
  if (currentProfile()) await persistProfile();
  try {
    const ok = await ExportAllCatalogs();
    if (ok) flashCatalogTitle('已导出全部');
  } catch (e) {
    setDetailEmpty('导出失败: ' + e);
  }
}

async function importCatalog() {
  const ok = await askConfirm({
    title: '导入接口',
    message: '按文件里的主机写入，没有就会新建；多个主机会拆开。当前打开的地址不会被改，除非文件就是它。本机目录或全部导出包按 id 覆盖，Postman Collection / ApiZza 项目全部作为新接口追加。',
    okText: '选择文件',
  });
  if (!ok) return;
  await persistProfile();
  try {
    const merged = await ImportCatalog();
    if (!merged) return;
    await applyImportedCatalog(merged);
    flashCatalogTitle(merged.name ? `已导入 ${merged.name}` : '已导入');
  } catch (e) {
    setDetailEmpty('导入失败: ' + e);
  }
}

function requireURL() {
  const url = currentURL();
  if (url && profileNameFromURL(url)) return true;
  // A root-relative path is valid when an environment supplies the host.
  if (url && isRootRelativePath(url) && activeEnvironmentURL()) return true;
  openUrlModal();
  return false;
}

async function toggleConn() {
  if (isHTTPMode()) return;
  if (!requireURL()) return;
  await activateCurrent();
  const st = await GetStatus();
  if (st.state === 'open' || st.state === 'connecting' || st.state === 'reconnecting') {
    await Disconnect();
    return;
  }
  try {
    if (historyMode) await exitHistoryMode();
    await persistProfile();
    await Connect(resolvedOpts());
  } catch (e) {
    setDetailEmpty(String(e));
  }
}

async function ensureWSConnected() {
  if (!currentURL()) {
    throw new Error('请先填写 URL');
  }
  const st = await GetStatus();
  const s = (st?.state || '').toLowerCase();
  if (s === 'open') return;
  if (s !== 'connecting' && s !== 'reconnecting') {
    await Connect(resolvedOpts());
  }
}

function moduleHTTPRequests(module) {
  const key = clipText(module || '', 80);
  return currentHTTPRequests().filter((r) => requestModuleName(r) === key);
}

async function runCatalogModule(module) {
  if (moduleRun || sending) return;
  if (!isHTTPMode()) {
    flashCatalogTitle('WebSocket 不能跑');
    return;
  }
  if (!requireURL()) return;
  const list = moduleHTTPRequests(module);
  if (!list.length) {
    flashCatalogTitle('没有可跑的接口');
    return;
  }
  await persistProfile();
  if (historyMode) await exitHistoryMode();
  moduleRun = { module, index: 0, total: list.length, id: '' };
  setBusy(true);
  refreshCatalogTitle();
  let stopped = false;
  try {
    for (let i = 0; i < list.length; i++) {
      const req = currentHTTPRequests().find((r) => r.id === list[i].id) || list[i];
      moduleRun.index = i + 1;
      moduleRun.id = req.id || '';
      applySavedRequest(req);
      setActiveSavedId(req.id);
      renderCatalog();
      await activateCurrent();
      const body = resolvedBody();
      const opts = resolvedOpts();
      const stamp = headerStampContext(opts, body);
      headerStamp = stamp;
      const ex = await RequestHTTP(opts, body);
      applyHeaderSources(ex, stamp);
      if (ex?.resImage) captureImageExample(req.id, ex.resImage);
      if (httpDebugLayout()) paintHTTPResult(ex);
      else if (ex) setDetailHtml(renderHTTPExchange(ex));
      if (httpExchangeFailed(ex)) {
        stopped = true;
        break;
      }
    }
    const n = moduleRun.index;
    const total = moduleRun.total;
    await persistProfile();
    moduleRun = null;
    renderCatalog();
    flashCatalogTitle(stopped ? `停在 ${n}/${total}` : `跑完 ${total}/${total}`, 2200);
  } catch (e) {
    moduleRun = null;
    renderCatalog();
    setDetailEmpty(String(e));
    flashCatalogTitle('跑失败', 2200);
  } finally {
    moduleRun = null;
    setBusy(false);
    if (!el.catalogTitle?._flashTimer) refreshCatalogTitle();
  }
}

async function sendMsg() {
  if (sending || moduleRun) return;
  if (!requireURL()) return;
  await activateCurrent();
  const rawURL = currentURL();
  const opts = resolvedOpts();
  // Judge the transport from the resolved URL: a root-relative path takes its
  // scheme from the active environment, not from the bare path text.
  const http = HTTP_SCHEMES.has(urlScheme(opts.url)) ||
    (isRootRelativePath(rawURL) && HTTP_SCHEMES.has(activeEnvironmentScheme()));
  const text = http ? resolvedBody() : expandVars(el.payload.value.trim(), currentVarMap());
  if (!http && !text) return;
  setBusy(true);
  if (http && httpDebugLayout()) markHTTPSending();
  try {
    if (historyMode) await exitHistoryMode();
    const savedId = isDocMode() ? upsertCurrentSavedRequest() : activeSavedId;
    await persistProfile('', { syncRequest: isDocMode() });
    setActiveSavedId(savedId);
    if (savedId) loadReqMeta(currentSavedRequest());
    if (http) {
      const stamp = headerStampContext(opts, text);
      headerStamp = stamp;
      const ex = await RequestHTTP(opts, text);
      applyHeaderSources(ex, stamp);
      if (ex?.resImage) captureImageExample(savedId, ex.resImage);
      if (httpDebugLayout()) paintHTTPResult(ex);
      else if (ex) setDetailHtml(renderHTTPExchange(ex));
    } else {
      await ensureWSConnected();
      await Send(text);
    }
    lastSent = text;
    await persistProfile('', { syncRequest: isDocMode() });
  } catch (e) {
    if (httpDebugLayout()) httpBadge('err', '失败');
    setDetailEmpty(String(e));
  } finally {
    setBusy(false);
  }
}

async function formatPayload() {
  const text = el.payload?.value || '';
  if (text.trim()) el.payload.value = await FormatJSON(text);
  const ret = el.payloadIn?.value || '';
  if (ret.trim()) el.payloadIn.value = await FormatJSON(ret);
  if (text.trim() || ret.trim()) scheduleDefinitionPersist();
}

async function formatRecordField(target) {
  const text = target?.value || '';
  if (!text.trim()) return;
  target.value = await FormatJSON(text);
}

function setBusy(on) {
  sending = on;
  const method = on ? 'setAttribute' : 'removeAttribute';
  el.btnSend?.[method]('disabled', 'true');
  el.btnSendTop?.[method]('disabled', 'true');
  el.btnRecordSave?.[method]('disabled', 'true');
}

function recordModalOpen() {
  return Boolean(el.recordModal && !el.recordModal.classList.contains('hidden'));
}

function resetRecordDraft() {
  recordDraft.in = '';
  recordDraft.resBody = '';
}

function setRecordError(text) {
  if (el.recordErr) el.recordErr.textContent = text || '';
}

function readRecordForm() {
  recordDraft.in = el.recIn?.value || '';
  recordDraft.resBody = el.recResBody?.value || '';
}

function applyRecordDraftToForm() {
  if (el.recIn) el.recIn.value = recordDraft.in;
  if (el.recResBody) el.recResBody.value = recordDraft.resBody || '';
}

function openRecordModal() {
  const http = isHTTPMode();
  if (el.recordTitle) el.recordTitle.textContent = http ? '保存到接口 · HTTP' : '保存到接口 · WebSocket';
  if (el.recordHint) {
    el.recordHint.textContent = http
      ? '不会发送。方法、地址、请求头用当前编辑器；这里补请求体和响应体，保存到左侧接口。'
      : '不会发送。发送内容作为接口，返回记在这条接口上，保存到左侧。';
  }
  if (el.recordMeta) {
    const method = (el.method?.value || 'GET').toUpperCase();
    const url = currentURL();
    el.recordMeta.textContent = http
      ? `${method} ${url || '(未填写 URL)'}`
      : (url || '(未填写 URL)');
  }
  el.recordHTTP?.classList.toggle('hidden', !http);
  el.recordWS?.classList.toggle('hidden', http);
  setRecordError('');
  if (http) {
    if (el.recReqBody) el.recReqBody.value = currentBody();
    applyRecordDraftToForm();
  } else if (el.recOut) {
    el.recOut.value = el.payload?.value || '';
    recordDraft.in = el.payloadIn?.value || recordDraft.in || '';
    applyRecordDraftToForm();
  }
  el.recordModal?.classList.remove('hidden');
  el.recordModal?.setAttribute('aria-hidden', 'false');
  const focusEl = http
    ? (el.recResBody || el.recReqBody)
    : (recordDraft.in ? el.recIn : el.recOut);
  setTimeout(() => focusEl?.focus(), 30);
}

function closeRecordModal() {
  if (!recordModalOpen()) return;
  readRecordForm();
  el.recordModal.classList.add('hidden');
  el.recordModal.setAttribute('aria-hidden', 'true');
  setRecordError('');
}

async function saveRecord() {
  if (sending) return;
  if (isHTTPMode()) {
    return recordHTTP();
  }
  return recordWS();
}

function putSavedRequest(req, match) {
  const p = ensureCurrentProfile();
  if (!p || !req) return '';
  const list = Array.isArray(p.requests) ? p.requests.slice() : [];
  let i = -1;
  if (typeof match === 'function') i = list.findIndex(match);
  if (i < 0 && req.id) i = list.findIndex((r) => r.id === req.id);
  if (i >= 0) {
    req.id = list[i].id;
    list[i] = req;
  } else {
    if (!req.id) req.id = newRequestId();
    list.push(req);
  }
  p.requests = list;
  return req.id;
}

async function saveRecordToCatalog(req, match) {
  const id = putSavedRequest(req, match);
  if (!id) {
    setRecordError('请先填写地址');
    return false;
  }
  setActiveSavedId(id);
  loadReqMeta(req);
  catalogOpenGroups.add(requestModuleName(req) || '');
  await persistProfile();
  renderCatalog();
  flashCatalogTitle('已保存到接口');
  return true;
}

async function recordHTTP() {
  if (sending) return;
  if (!isHTTPMode()) return;
  if (!currentURL() || !profileNameFromURL(currentURL())) {
    setRecordError('请先填写 URL');
    return;
  }
  const reqBody = el.recReqBody?.value || '';
  const resBody = el.recResBody?.value || '';
  if (el.payload) el.payload.value = reqBody;
  lastSent = reqBody;
  const key = currentRequestKey();
  const req = snapshotCurrentRequest(key || 'GET /', '', { body: reqBody, example: resBody });
  readRecordForm();
  const ok = await saveRecordToCatalog(req, (r) => isHTTPSaved(r) && requestKeyFrom(r) === key);
  if (ok) closeRecordModal();
}

async function recordWS() {
  if (sending) return;
  if (!currentURL() || !profileNameFromURL(currentURL())) {
    setRecordError('请先填写地址');
    return;
  }
  const outText = el.recOut?.value || '';
  const inText = el.recIn?.value || '';
  if (!outText.trim()) {
    setRecordError('请填写发送内容');
    return;
  }
  if (el.payload) el.payload.value = outText;
  if (el.payloadIn) el.payloadIn.value = inText;
  lastSent = outText;
  const key = wsMessageKey(outText);
  const name = wsMessageStoreName(key, outText) || '新消息';
  const req = snapshotWSMessage(name, '', { body: outText, example: inText });
  readRecordForm();
  const ok = await saveRecordToCatalog(req, (r) => isWSSaved(r) && key && wsMessageKey(r.body || '') === key);
  if (ok) closeRecordModal();
}

/* —— history modal —— */
function openHistoryModal() {
  el.histModal.classList.remove('hidden');
  el.histModal.setAttribute('aria-hidden', 'false');
  refreshHistoryList();
  setTimeout(() => el.histSearch?.focus(), 30);
}

function closeHistoryModal() {
  el.histModal.classList.add('hidden');
  el.histModal.setAttribute('aria-hidden', 'true');
}

function historyItemTitle(s) {
  const named = profileNameFromURL(s?.url);
  if (named) return [s?.day, named].filter(Boolean).join('  ·  ');
  const scheme = urlScheme(s?.url);
  const host = s?.host || hostFromURL(s?.url);
  const hostPart = host ? (scheme ? `${scheme}://${host}` : host) : '';
  return [s?.day, hostPart].filter(Boolean).join('  ·  ') || s?.name || '';
}

function renderHistoryItems(list, keyword) {
  el.histList.innerHTML = '';
  const kw = (keyword || '').trim();
  el.histEmpty.classList.toggle('hidden', list.length > 0);
  el.histEmpty.textContent = kw
    ? `没有匹配 “${kw}” 的日志`
    : '暂无日志，发送或连接后会按日期和 IP/域名分开保存';

  for (const s of list) {
    const item = document.createElement('div');
    item.className = 'hist-item';
    item.innerHTML = `
      <div class="name"></div>
      <div class="size"></div>
      <div class="meta"></div>
      <div class="hint hidden"></div>
    `;
    item.querySelector('.name').textContent = historyItemTitle(s);
    const right = item.querySelector('.size');
    if (kw && (s.matchCount > 0 || s.matchHint)) {
      right.className = 'hits';
      right.textContent = s.matchCount > 0 ? `${s.matchCount} 命中` : '匹配';
    } else {
      right.textContent = formatSize(s.size || 0);
    }
    const metaBits = [];
    if (s.host) metaBits.push(s.host);
    if (s.name) metaBits.push(s.name);
    if (s.modTime) metaBits.push(s.modTime);
    if (s.url) metaBits.push(s.url);
    item.querySelector('.meta').textContent = metaBits.join('  ·  ');
    if (s.matchHint) {
      const hint = item.querySelector('.hint');
      hint.classList.remove('hidden');
      hint.textContent = s.matchHint;
    }
    item.addEventListener('click', async () => {
      try {
        const detail = await LoadSession(s.name);
        showSession(detail, kw);
      } catch (e) {
        setDetailEmpty('加载失败: ' + e);
      }
    });
    el.histList.appendChild(item);
  }
}

async function refreshHistoryList() {
  const kw = (el.histSearch?.value || '').trim();
  const seq = ++histSearchSeq;
  el.histList.innerHTML = '';
  let list = [];
  try {
    list = kw ? ((await SearchSessions(kw)) || []) : ((await ListSessions()) || []);
  } catch (e) {
    if (seq !== histSearchSeq) return;
    el.histEmpty.classList.remove('hidden');
    el.histEmpty.textContent = '读取失败: ' + e;
    return;
  }
  if (seq !== histSearchSeq) return;
  renderHistoryItems(list, kw);
}

function scheduleHistorySearch() {
  clearTimeout(histSearchTimer);
  histSearchTimer = setTimeout(() => refreshHistoryList(), 220);
}

async function pickSession() {
  try {
    const detail = await PickAndLoadSession();
    if (detail) showSession(detail, (el.histSearch?.value || '').trim());
  } catch (e) {
    setDetailEmpty('打开失败: ' + e);
  }
}

async function init() {
  initTheme();
  syncCatalogHoverRadios();
  setCatalogOpen(catalogOpen());
  workMode = readWorkMode();
  applyWorkMode();
  bindPaneSplitters();
  applyColumnLayout();
  ensureCatalogTip();
  el.btnProjectNew?.addEventListener('click', createProject);
  el.btnProjectRename?.addEventListener('click', renameCurrentProject);
  el.btnProjectDelete?.addEventListener('click', deleteCurrentProject);
  el.btnAddProfile?.addEventListener('click', () => {
    if (!profiles.length) createProject();
    else openUrlModal();
  });
  el.btnUrlModalClose?.addEventListener('click', closeUrlModal);
  el.btnUrlModalCancel?.addEventListener('click', closeUrlModal);
  el.btnUrlModalOk?.addEventListener('click', submitUrlModal);
  el.urlModalInput?.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      submitUrlModal();
    }
  });
  el.btnConfirmCancel?.addEventListener('click', () => closeConfirmModal(false));
  el.btnConfirmOk?.addEventListener('click', () => closeConfirmModal(true));
  el.btnPromptCancel?.addEventListener('click', () => closePromptModal(null));
  el.btnPromptOk?.addEventListener('click', submitPromptModal);
  el.btnDataDirPick?.addEventListener('click', pickDataDirectoryFromModal);
  el.promptInput?.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      submitPromptModal();
    }
  });
  suppressSessionReset = true;
  try {
    applyTransportFromURL();
    const ready = await ensureDataDirectoryReady();
    if (ready) await loadProfiles();
    else {
      renderProjectSelect();
      clearEditor();
      if (el.docEmpty) {
        el.docEmpty.textContent = '请先选择数据目录。';
        el.docEmpty.classList.remove('hidden');
      }
      el.docBody?.classList.add('hidden');
    }
  } finally {
    suppressSessionReset = false;
  }

  el.project?.addEventListener('change', async () => {
    await selectProject(el.project.value);
  });
  el.barEnv?.addEventListener('change', async () => {
    await selectEnvironment(el.barEnv.value);
  });
  // The top-bar trash button acts on the selected environment. Deleting a
  // connection profile is intentionally kept out of this frequently used path.
  el.btnDelProfile?.addEventListener('click', deleteEnvironment);
  document.addEventListener('mousedown', (e) => {
    if (moduleMenuOpen() && !el.moduleWrap?.contains(e.target)) {
      closeModuleMenu();
    }
    if (groupMenuOpen() && !el.groupMenu?.contains(e.target) && !e.target?.closest?.('.catalog-more, .env-more, #btnCatalogExport, #btnBarMenu')) {
      closeGroupMenu();
    }
    if (envEditOpen() && !el.envWrap?.contains(e.target)) {
      closeEnvEdit();
    }
    if (barMenuOpen() && !el.barMenuWrap?.contains(e.target)) {
      closeBarMenu();
    }
  });

  el.btnBarMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    openProjectMenu();
  });
  el.modeSwitch?.addEventListener('click', async (e) => {
    const mode = e.target?.closest?.('.mode-btn')?.dataset?.mode;
    if (mode) {
      closeBarMenu();
      await setWorkMode(mode);
    }
  });
  el.btnToggle.addEventListener('click', toggleConn);
  el.btnSend.addEventListener('click', sendMsg);
  el.btnSendTop?.addEventListener('click', sendMsg);
  el.btnRecord?.addEventListener('click', openRecordModal);
  el.btnSaveExample?.addEventListener('click', async () => {
    const m = store.get(selectedId);
    if (await saveExampleFromMessage(m)) flashButton(el.btnSaveExample, '已写入');
  });
  el.btnFill?.addEventListener('click', () => {
    const m = store.get(selectedId);
    if (fillFromMessage(m)) {
      setFillButton(true);
      flashFilled();
      scheduleDefinitionPersist();
    }
  });
  el.btnCopyDetail?.addEventListener('click', () => copySelectedDetail());
  el.btnCopyDocReq?.addEventListener('click', async () => {
    const ok = await copyText(el.docReq?.value || '');
    flashButton(el.btnCopyDocReq, ok ? '已复制' : '复制失败');
  });
  el.btnCopyDocRes?.addEventListener('click', async () => {
    const ok = await copyText(el.docRes?.value || '');
    flashButton(el.btnCopyDocRes, ok ? '已复制' : '复制失败');
  });
  el.docReq?.addEventListener('input', onDocReqInput);
  el.docRes?.addEventListener('input', onDocResInput);
  el.btnDocEdit?.addEventListener('click', () => setDocEditing(!docEditing()));
  el.btnCurl?.addEventListener('click', () => copyCurl(false));
  el.btnCurlDetail?.addEventListener('click', () => copyCurl(true));
  el.btnClearCookies?.addEventListener('click', async () => {
    try {
      await ClearCookies();
      flashButton(el.btnClearCookies, '已清除');
    } catch (e) {
      setDetailEmpty(String(e));
    }
  });
  el.followRedirects?.addEventListener('change', persistProfile);
  el.reqTabs?.addEventListener('click', (e) => {
    const tab = e.target?.closest?.('.req-tab')?.dataset?.tab;
    if (tab) setReqTab(tab);
  });
  el.authType?.addEventListener('change', () => {
    syncAuthFields();
    persistDefinitionNow();
  });
  el.authToken?.addEventListener('change', persistDefinitionNow);
  el.authUser?.addEventListener('change', persistDefinitionNow);
  el.authPass?.addEventListener('change', persistDefinitionNow);
  for (const radio of document.querySelectorAll('input[name="bodyType"]')) {
    radio.addEventListener('change', () => {
      applyBodyTypeUI();
      // Content-Type 默认不进请求头；仅同步已有的托管行，发送时再按体类型自动带。
      headerRows = syncHeaderContentType(headerRows, currentBodyType());
      renderRequestEditor();
      persistDefinitionNow();
    });
  }
  el.btnHeaderPresets?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleHeaderPresetMenu();
  });
  el.headerPresetMenu?.addEventListener('click', (e) => {
    const item = e.target?.closest?.('[data-key]');
    if (!item) return;
    applyHeaderPreset(item.dataset.key || '', item.dataset.value || '');
  });
  el.btnHeaderBulk?.addEventListener('click', () => {
    closeHeaderPresetMenu();
    setHeaderBulkMode(!headerBulkOn());
  });
  el.headerBulk?.addEventListener('input', () => {
    headerRows = headersFromText(el.headerBulk.value);
    scheduleDefinitionPersist();
  });
  document.addEventListener('click', (e) => {
    if (
      e.target?.closest?.('.kv-toolbar-presets')
      || e.target?.closest?.('#headerPresetMenu')
      || e.target?.closest?.('#headerTools')
    ) return;
    closeHeaderPresetMenu();
  });
  window.addEventListener('scroll', () => closeHeaderPresetMenu(), true);
  setReqTab('body');
  renderRequestEditor();
  el.btnFormat.addEventListener('click', formatPayload);
  el.btnFormatHttp?.addEventListener('click', formatPayload);
  el.btnResend.addEventListener('click', () => {
    if (lastSent) {
      el.payload.value = lastSent;
      sendMsg();
    }
  });
  el.btnClear.addEventListener('click', async () => {
    if (historyMode) {
      clearListUI();
      return;
    }
    await ClearMessages();
    allLiveMsgs = [];
    clearListUI();
    refreshFilterTitle();
  });
  el.btnTheme.addEventListener('click', toggleTheme);
  el.btnSettings?.addEventListener('click', openSettings);
  el.btnSettingsClose?.addEventListener('click', closeSettings);
  el.btnChangeDataDir?.addEventListener('click', changeDataDirectoryFromSettings);
  el.btnOpenDataDir?.addEventListener('click', openCurrentDataDirectory);
  el.dataPathBase?.addEventListener('click', copyDataPath);
  el.settingsNav?.addEventListener('click', (e) => {
    const item = e.target?.closest?.('.settings-nav-item');
    if (item?.dataset?.section) showSettingsSection(item.dataset.section);
  });
  el.settingsMain?.addEventListener('change', (e) => {
    const input = e.target?.closest?.('input[name="catalogHover"]');
    if (input) setCatalogHoverMode(input.value);
  });
  // JSON tree node expand/collapse
  el.detail?.addEventListener('click', (e) => {
    if (toggleJsonNode(e.target)) {
      e.preventDefault();
    }
  });
  el.detail?.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && toggleJsonNode(e.target)) {
      e.preventDefault();
    }
  });
  el.btnHistory.addEventListener('click', openHistoryModal);
  el.btnLive.addEventListener('click', exitHistoryMode);
  el.btnHistClose.addEventListener('click', closeHistoryModal);
  el.btnHistRefresh.addEventListener('click', refreshHistoryList);
  el.btnPickSession.addEventListener('click', pickSession);
  el.btnOpenLogDir.addEventListener('click', async () => {
    try {
      await OpenLogDir();
    } catch (e) {
      setDetailEmpty(String(e));
    }
  });
  el.histSearch.addEventListener('input', scheduleHistorySearch);
  el.histSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(histSearchTimer);
      refreshHistoryList();
    }
  });
  el.msgFilter.addEventListener('input', () => applyMsgFilter());
  el.btnRecordClose?.addEventListener('click', closeRecordModal);
  el.btnRecordCancel?.addEventListener('click', closeRecordModal);
  el.btnRecordSave?.addEventListener('click', saveRecord);
  el.btnFmtRecOut?.addEventListener('click', () => formatRecordField(el.recOut));
  el.btnFmtRecIn?.addEventListener('click', () => formatRecordField(el.recIn));
  el.btnFmtRecReq?.addEventListener('click', () => formatRecordField(el.recReqBody));
  el.btnFmtRecRes?.addEventListener('click', () => formatRecordField(el.recResBody));

  el.payload.addEventListener('input', () => {
    scheduleDefinitionPersist();
  });
  el.payloadIn?.addEventListener('input', () => {
    recordDraft.in = el.payloadIn.value || '';
    scheduleDefinitionPersist();
  });
  el.payload.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMsg();
    }
  });
  for (const node of [el.recOut, el.recIn, el.recReqBody, el.recResBody]) {
    node?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveRecord();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 's') {
      e.preventDefault();
      if (confirmModalOpen() || urlModalOpen() || recordModalOpen() || promptModalOpen() || settingsOpen()) return;
      if (el.histModal && !el.histModal.classList.contains('hidden')) return;
      saveCurrentRequest();
      return;
    }
    if (e.key !== 'Escape') return;
    if (dataDirModalOpen()) {
      return;
    }
    if (settingsOpen()) {
      closeSettings();
      return;
    }
    if (barMenuOpen()) {
      closeBarMenu();
      return;
    }
    if (groupMenuOpen()) {
      closeGroupMenu();
      return;
    }
    if (moduleMenuOpen()) {
      closeModuleMenu();
      return;
    }
    if (promptModalOpen()) {
      closePromptModal(null);
      return;
    }
    if (confirmModalOpen()) {
      closeConfirmModal(false);
      return;
    }
    if (recordModalOpen()) {
      closeRecordModal();
      return;
    }
    if (urlModalOpen()) {
      if (e.isComposing || e.keyCode === 229 || urlModalHasDraft()) return;
      closeUrlModal();
      return;
    }
    if (el.histModal && !el.histModal.classList.contains('hidden')) {
      closeHistoryModal();
    }
  });

  el.url.addEventListener('click', () => {
    if (!currentURL() && !activeEnvironmentURL()) {
      if (!profiles.length) createProject();
      else openUrlModal();
    }
  });
  el.url.addEventListener('change', async () => {
    normalizeURLPathInput();
    const env = activeEnvironmentURL();
    if (env && currentURL()) {
      urlPrefix = splitLockedURL(currentURL(), env).prefix || urlPrefix;
    } else if (connectionURLReady(currentURL())) {
      urlPrefix = splitLockedURL(currentURL(), currentURL()).prefix;
    }
    applyTransportFromURL();
    syncParamsFromURL();
    rematchSavedFromEditor();
    await activateCurrent();
    await persistProfile();
  });
  el.url.addEventListener('input', () => {
    if (syncingQuery) return;
    if (isDefinitionHTTPMode()) syncParamsFromURL();
  });
  el.protocol.addEventListener('change', persistDefinitionNow);
  el.method.addEventListener('change', () => {
    setReqTab(reqTab);
    rematchSavedFromEditor();
    persistDefinitionNow();
  });
  el.reconnect.addEventListener('change', persistProfile);
  el.insecureSkipVerify?.addEventListener('change', persistProfile);
  el.reqTitle?.addEventListener('input', onReqMetaInput);
  el.reqModule?.addEventListener('focus', () => {
    moduleFilterArmed = false;
    openModuleMenu();
  });
  el.reqModule?.addEventListener('input', () => {
    moduleFilterArmed = true;
    onReqMetaInput();
    if (moduleMenuOpen()) renderModuleMenu();
    else openModuleMenu();
  });
  el.moduleMenu?.addEventListener('mousedown', (e) => e.preventDefault());
  el.moduleMenu?.addEventListener('click', onModuleMenuClick);
  el.reqDesc?.addEventListener('input', onReqMetaInput);
  el.btnEnvMore?.addEventListener('mousedown', (e) => e.preventDefault());
  el.btnEnvMore?.addEventListener('click', openEnvMenu);
  el.btnCatalogToggle?.addEventListener('click', () => setCatalogOpen(!catalogOpen()));
  el.btnCatalogAdd?.addEventListener('click', () => addCatalogRequest(''));
  el.btnCatalogExport?.addEventListener('click', (e) => {
    e.preventDefault();
    openExportMenu(el.btnCatalogExport);
  });
  el.btnCatalogImport?.addEventListener('click', importCatalog);
  el.btnSaveReq?.addEventListener('click', saveCurrentRequest);
  el.btnSaveWS?.addEventListener('click', saveCurrentRequest);
  el.catalogFilter?.addEventListener('input', () => renderCatalog());
  el.catalogList?.addEventListener('mousedown', (e) => {
    if (e.target?.closest?.('.catalog-more, .catalog-add-module')) {
      e.preventDefault();
    }
  });
  el.catalogList?.addEventListener('click', onCatalogClick);
  el.catalogList?.addEventListener('mouseover', onCatalogHover);
  el.catalogList?.addEventListener('mouseleave', scheduleHideCatalogTip);
  el.catalogList?.addEventListener('dragstart', onCatalogDragStart);
  el.catalogList?.addEventListener('dragover', onCatalogDragOver);
  el.catalogList?.addEventListener('drop', onCatalogDrop);
  el.catalogList?.addEventListener('dragend', onCatalogDragEnd);
  el.catalogList?.addEventListener('scroll', () => {
    hideCatalogTip();
    closeGroupMenu();
  });
  el.groupMenu?.addEventListener('mousedown', (e) => e.preventDefault());
  el.groupMenu?.addEventListener('click', onGroupMenuClick);
  window.addEventListener('resize', () => {
    hideCatalogTip();
    closeGroupMenu();
    closeHeaderPresetMenu();
  });

  EventsOn('message', (m) => {
    if (historyMode) return;
    if (!isCurrentProfileEvent(m?.profile)) return;
    if (m?.exchange && headerStamp && exchangeMatchesStamp(m.exchange, headerStamp)) {
      applyHeaderSources(m.exchange, headerStamp);
    }
    rememberLiveMsg(m);
    appendMsg(m, true);
  });
  EventsOn('status', (s) => {
    if (!isCurrentProfileEvent(s?.profile)) return;
    setState(s);
  });

  if (!profiles.length) {
    try {
      setState(await GetStatus());
    } catch (_) {}
  }

  const paths = await GetPaths();
  el.footer.textContent = `requests: ${paths.requests}   ·   servers: ${paths.servers}`;
}

init().catch((e) => {
  setDetailEmpty('init failed: ' + e);
});
