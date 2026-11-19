import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyQuery,
  parseQuery,
  sentHeaderSources,
  COMMON_HEADERS,
  CONTENT_TYPE_OPTIONS,
  addHeaderPreset,
  contentTypeForBodyType,
  guessBodyType,
  headersFromText,
  headersToText,
  methodOmitsBody,
  requestDefinitionURL,
  requestURLForEnvironment,
  syncHeaderContentType,
  toCurl,
  pinnedOf,
  arrangePinned,
  PIN_MODULE,
  MODULE_SEP,
  moduleSegments,
  moduleJoin,
  moduleParentPath,
  moduleBaseName,
  moduleIsInside,
  renameModulePath,
  modulePaths,
  moduleTree,
  arrangeCatalogTree,
  reorderModules,
  moveModuleInto,
  moduleRunScope,
  moveDestinations,
  filterDestinations,
} from './http-ui.js';

test('curl verifies HTTPS unless explicitly configured otherwise', () => {
  const spec = { method: 'GET', url: 'https://example.test', headers: {} };
  assert.doesNotMatch(toCurl(spec), /(?:^|\s)-k(?:\s|$)/);
  assert.match(toCurl({ ...spec, insecureSkipVerify: true }), /(?:^|\s)-k(?:\s|$)/);
  assert.doesNotMatch(toCurl({ ...spec, url: 'http://example.test', insecureSkipVerify: true }), /(?:^|\s)-k(?:\s|$)/);
});

test('request definition removes its source environment prefix', () => {
  assert.equal(
    requestDefinitionURL(
      'http://old.example/gateway/users?id=1#row',
      'http://old.example/gateway',
    ),
    '/users?id=1#row',
  );
});

test('request definition is combined with the selected environment prefix', () => {
  assert.equal(
    requestURLForEnvironment('/users?id=1#row', 'http://new.example/api'),
    'http://new.example/api/users?id=1#row',
  );
});

test('relative definitions remain environment independent', () => {
  assert.equal(requestDefinitionURL('/health?full=1'), '/health?full=1');
  assert.equal(
    requestURLForEnvironment('/health?full=1', 'https://example.com/gateway/'),
    'https://example.com/gateway/health?full=1',
  );
});

test('DELETE and OPTIONS support request bodies', () => {
  assert.equal(methodOmitsBody('DELETE'), false);
  assert.equal(methodOmitsBody('OPTIONS'), false);
  assert.equal(guessBodyType({}, '', 'DELETE'), 'json');
  assert.match(toCurl({
    method: 'DELETE',
    url: 'http://example.test/item',
    headers: {},
    body: '{"id":1}',
    followRedirects: false,
  }), /--data-raw/);
});

test('GET and HEAD omit request bodies', () => {
  assert.equal(methodOmitsBody('GET'), true);
  assert.equal(methodOmitsBody('HEAD'), true);
  assert.equal(guessBodyType({}, '', 'GET'), 'none');
  assert.doesNotMatch(toCurl({
    method: 'GET',
    url: 'http://example.test/items',
    headers: {},
    body: '{"ignored":true}',
    followRedirects: false,
  }), /--data-raw/);
});

test('content type presets follow Cyber ContentType values', () => {
  assert.deepEqual(CONTENT_TYPE_OPTIONS, [
    'application/json',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'application/xml',
    'text/plain',
    'application/graphql',
  ]);
  assert.equal(contentTypeForBodyType('json'), 'application/json');
  assert.equal(contentTypeForBodyType('form'), 'application/x-www-form-urlencoded');
  assert.equal(contentTypeForBodyType('text'), 'text/plain');
  assert.equal(contentTypeForBodyType('none'), '');

  // Default: do not insert Content-Type into the header list.
  const blank = syncHeaderContentType([{ key: '', value: '', enabled: true }], 'json');
  assert.equal(blank.length, 1);
  assert.equal(blank[0].key, '');

  const kept = syncHeaderContentType([
    { key: 'Content-Type', value: 'application/vnd.api+json', enabled: true },
    { key: '', value: '', enabled: true },
  ], 'form');
  assert.equal(kept[0].value, 'application/vnd.api+json');

  const updated = syncHeaderContentType([
    { key: 'Content-Type', value: 'application/json', enabled: true },
    { key: '', value: '', enabled: true },
  ], 'form');
  assert.equal(updated[0].value, 'application/x-www-form-urlencoded');

  const dropped = syncHeaderContentType([
    { key: 'Content-Type', value: 'application/json', enabled: true },
    { key: 'Accept', value: 'application/json', enabled: true },
    { key: '', value: '', enabled: true },
  ], 'none');
  assert.equal(dropped[0].key, 'Accept');
});

test('common headers and bulk text match Cyber header list style', () => {
  assert.equal(COMMON_HEADERS[0][0], 'Content-Type');
  assert.equal(COMMON_HEADERS.length, 7);
  const withAccept = addHeaderPreset([{ key: '', value: '', enabled: true }], 'Accept', 'application/json');
  assert.equal(withAccept[0].key, 'Accept');
  assert.equal(withAccept[0].value, 'application/json');
  const text = headersToText(withAccept);
  assert.match(text, /^Accept: application\/json$/m);
  const back = headersFromText('Accept: application/json\nX-Requested-With: XMLHttpRequest');
  assert.equal(back[0].key, 'Accept');
  assert.equal(back[1].key, 'X-Requested-With');
});

test('sent header sources label auth, body, cookie, and defaults', () => {
  const from = sentHeaderSources({
    Authorization: 'Bearer t',
    'Content-Type': 'application/json',
    'User-Agent': 'ApiTester',
    Accept: 'application/json, text/plain, */*',
    Cookie: 'sid=1',
    'X-Trace': 'abc',
  }, {
    headerRows: [{ key: 'X-Trace', value: 'abc', enabled: true }],
    auth: { type: 'bearer', token: 't' },
    bodyType: 'json',
    hasBody: true,
  });
  assert.equal(from.Authorization, '鉴权');
  assert.equal(from['Content-Type'], '请求体');
  assert.equal(from['User-Agent'], '默认');
  assert.equal(from.Accept, '默认');
  assert.equal(from.Cookie, 'Cookie');
  assert.equal(from['X-Trace'], '请求头');
});

test('user written content type and user agent stay request headers', () => {
  const from = sentHeaderSources({
    'Content-Type': 'application/xml',
    'User-Agent': 'Mine',
  }, {
    headerRows: [
      { key: 'Content-Type', value: 'application/xml', enabled: true },
      { key: 'User-Agent', value: 'Mine', enabled: true },
    ],
    auth: { type: 'none' },
    bodyType: 'json',
    hasBody: true,
  });
  assert.equal(from['Content-Type'], '请求头');
  assert.equal(from['User-Agent'], '请求头');
});

test('root-relative paths are not parsed as hosts when editing query params', () => {
  assert.deepEqual(parseQuery('/echo?q=demo'), [{ key: 'q', value: 'demo', enabled: true, raw: 'q=demo' }]);
  assert.deepEqual(parseQuery('//echo?q=demo'), [{ key: 'q', value: 'demo', enabled: true, raw: 'q=demo' }]);
  assert.equal(
    applyQuery('/echo?q=demo', [{ key: 'q', value: 'other', enabled: true }]),
    '/echo?q=other',
  );
  assert.equal(applyQuery('/echo', [{ key: 'q', value: 'demo', enabled: true }]), '/echo?q=demo');
  assert.equal(applyQuery('//echo?q=demo', [{ key: 'q', value: 'other', enabled: true }]), '//echo?q=other');
  assert.equal(applyQuery('/echo?q=demo', []), '/echo');
  assert.equal(applyQuery('/echo?q=demo#row', [{ key: 'q', value: 'other', enabled: true }]), '/echo?q=other#row');
});

test('absolute URLs keep their host when query params change', () => {
  assert.equal(
    applyQuery('http://127.0.0.1:18080/echo?q=demo', [{ key: 'q', value: 'other', enabled: true }]),
    'http://127.0.0.1:18080/echo?q=other',
  );
});

test('unchanged query rows keep the original encoding for signed URLs', () => {
  const url = 'https://s3.example/o?X-Amz-Signature=ab%20cd&x=%zz&flag#frag';
  const rows = parseQuery(url);
  assert.equal(applyQuery(url, rows), url);
  assert.equal(rows[0].value, 'ab cd');
  assert.equal(rows[1].value, '%zz');
  assert.equal(rows[2].raw, 'flag');

  delete rows[0].raw;
  rows[0].value = 'new sig';
  assert.equal(
    applyQuery(url, rows),
    'https://s3.example/o?X-Amz-Signature=new%20sig&x=%zz&flag#frag',
  );
});

test('curl omits max-redirs when redirects are disabled', () => {
  assert.doesNotMatch(toCurl({
    method: 'GET',
    url: 'http://example.test/',
    headers: {},
    followRedirects: false,
  }), /max-redirs/);
  assert.match(toCurl({
    method: 'GET',
    url: 'http://example.test/',
    headers: {},
    followRedirects: true,
  }), /(?:^|\s)-L(?:\s|$)/);
});

test('protocol-relative definitions use the environment scheme but keep their own host', () => {
  assert.equal(requestURLForEnvironment('//echo?q=demo', 'http://127.0.0.1:18080'), 'http://echo/?q=demo');
  assert.equal(requestURLForEnvironment('//echo:9000/a?q=1', 'https://base.test'), 'https://echo:9000/a?q=1');
  assert.equal(requestURLForEnvironment('//echo?q=demo', 'wss://base.test/gw'), 'wss://echo/?q=demo');
});

test('a pin pointing at a deleted request or folder is not drawn', () => {
  const live = pinnedOf(
    { requests: ['gone', 'a', 'a', 'b'], modules: ['old', 'users', 'users', '', 'users'] },
    [{ id: 'a' }, { id: 'b' }],
    ['users'],
  );
  assert.deepEqual(live.requests, ['a', 'b']);
  assert.deepEqual(live.modules, ['users']);
});

test('unpinning everything leaves both lists empty rather than malformed', () => {
  const live = pinnedOf({}, [], []);
  assert.deepEqual(live, { requests: [], modules: [] });
  assert.deepEqual(pinnedOf(null, [{ id: 'a' }], ['users']), { requests: [], modules: [] });
});

test('a pinned request leaves its folder and sits at the very top, in pin order', () => {
  const groups = [
    { module: 'users', items: [{ id: 'u1' }, { id: 'u2' }] },
    { module: '', items: [{ id: 'loose' }] },
  ];
  const out = arrangePinned(groups, { requests: ['u2', 'loose'], modules: [] });
  assert.deepEqual(out.map((g) => g.module), [PIN_MODULE, 'users', '']);
  assert.deepEqual(out[0].items.map((r) => r.id), ['u2', 'loose']);
  assert.deepEqual(out[1].items.map((r) => r.id), ['u1']);
  assert.equal(out[1].module, 'users');
});

test('a pinned folder rises above the others, and the original order holds below', () => {
  const groups = [
    { module: 'a', items: [] },
    { module: 'b', items: [] },
    { module: 'c', items: [] },
  ];
  const out = arrangePinned(groups, { requests: [], modules: ['c', 'a'] });
  assert.deepEqual(out.map((g) => g.module), ['c', 'a', 'b']);
});

test('with nothing pinned the list is exactly what the folder order said', () => {
  const groups = [
    { module: 'a', items: [{ id: '1' }] },
    { module: '', items: [{ id: '2' }] },
  ];
  const out = arrangePinned(groups, { requests: [], modules: [] });
  assert.deepEqual(out, groups);
});

test('pinning does not copy a request: its own folder keeps the id', () => {
  const groups = [{ module: 'users', items: [{ id: 'u1', module: 'users' }] }];
  const out = arrangePinned(groups, { requests: ['u1'], modules: [] });
  assert.equal(out[0].items[0].module, 'users');
  // Unpinning puts it back where its module says it belongs.
  const back = arrangePinned(groups, { requests: [], modules: [] });
  assert.deepEqual(back[0].items.map((r) => r.id), ['u1']);
});

// —— 目录即路径：子目录由路径表达，而不是另存一棵树 ——

test('a folder path splits into segments and rejoins the same way the importers write it', () => {
  assert.deepEqual(moduleSegments('用户 / 登录 / 刷新'), ['用户', '登录', '刷新']);
  assert.deepEqual(moduleSegments('  用户/登录  '), ['用户', '登录']);
  assert.deepEqual(moduleSegments(''), []);
  assert.equal(moduleJoin(['用户', '登录']), '用户 / 登录');
  // The separator the Postman and ApiZza importers already emit.
  assert.equal(moduleJoin(['用户', '登录']), ['用户', '登录'].join(MODULE_SEP));
});

test('a folder knows its parent and its own name from the path alone', () => {
  assert.equal(moduleParentPath('用户 / 登录'), '用户');
  assert.equal(moduleParentPath('用户'), '');
  assert.equal(moduleBaseName('用户 / 登录'), '登录');
  assert.equal(moduleBaseName('用户'), '用户');
});

test('a subtree matches by whole segments, so a sibling with a similar name is not caught', () => {
  assert.equal(moduleIsInside('用户 / 登录', '用户'), true);
  assert.equal(moduleIsInside('用户 / 登录', '用户 / 登录'), true);
  assert.equal(moduleIsInside('用户', '用户 / 登录'), false);
  // 用户2 is a different folder that merely starts with the same characters.
  assert.equal(moduleIsInside('用户2 / 登录', '用户'), false);
  assert.equal(moduleIsInside('用户 / 登录', ''), false);
});

test('renaming a folder renames its whole subtree and leaves lookalikes alone', () => {
  const list = ['用户', '用户 / 登录', '用户 / 登录 / 刷新', '用户2', '订单'];
  assert.deepEqual(renameModulePath(list, '用户', '账户'), [
    '账户',
    '账户 / 登录',
    '账户 / 登录 / 刷新',
    '用户2',
    '订单',
  ]);
  // Renaming one branch carries everything under it, and leaves the parent.
  assert.deepEqual(renameModulePath(list, '用户 / 登录', '用户 / 账户'), [
    '用户',
    '用户 / 账户',
    '用户 / 账户 / 刷新',
    '用户2',
    '订单',
  ]);
});

test('every ancestor of a path counts as a folder, even if nobody declared it', () => {
  assert.deepEqual(modulePaths(['a / b / c', 'a / d', 'a']), ['a', 'a / b', 'a / b / c', 'a / d']);
  assert.deepEqual(modulePaths([]), []);
});

test('a path whose parent was never created still gets a head to hang from', () => {
  const tree = moduleTree([
    { module: 'a / b / c', items: [{ id: '1' }] },
    { module: '', items: [{ id: '2' }] },
  ]);
  assert.deepEqual(tree.roots.map((r) => r.module), ['a']);
  const b = tree.roots[0].children[0];
  const c = b.children[0];
  assert.equal(b.module, 'a / b');
  assert.equal(c.module, 'a / b / c');
  assert.deepEqual(c.items.map((r) => r.id), ['1']);
  assert.equal(c.depth, 3);
  assert.deepEqual(tree.ungrouped.map((r) => r.id), ['2']);
});

test('a folder with its own requests and child folders keeps both', () => {
  const tree = moduleTree([
    { module: 'a', items: [{ id: 'own' }] },
    { module: 'a / b', items: [{ id: 'child' }] },
  ]);
  assert.deepEqual(tree.roots.map((r) => r.module), ['a']);
  assert.deepEqual(tree.roots[0].items.map((r) => r.id), ['own']);
  assert.deepEqual(tree.roots[0].children.map((c) => c.module), ['a / b']);
});

test('a pinned request leaves its folder in the tree and sits in the pin group', () => {
  const groups = [
    { module: 'a', items: [{ id: '1' }, { id: '2' }] },
    { module: 'a / b', items: [{ id: '3' }] },
  ];
  const out = arrangeCatalogTree(groups, { requests: ['3'], modules: [] });
  assert.deepEqual(out.pinned.map((r) => r.id), ['3']);
  assert.deepEqual(out.roots[0].items.map((r) => r.id), ['1', '2']);
  assert.deepEqual(out.roots[0].children[0].items, []);
  // The request still names its own folder, so unpinning puts it back there.
  assert.equal(out.pinned[0].module, undefined);
});

test('a pinned subfolder rises above its siblings, and only there', () => {
  const groups = [
    { module: 'a', items: [] },
    { module: 'a / x', items: [] },
    { module: 'a / y', items: [] },
    { module: 'z', items: [] },
  ];
  const out = arrangeCatalogTree(groups, { requests: [], modules: ['a / y'] });
  const a = out.roots.find((r) => r.module === 'a');
  assert.deepEqual(a.children.map((c) => c.module), ['a / y', 'a / x']);
  assert.equal(a.children[0].pinned, true);
  // Pinning a child does not lift its parent out of place.
  assert.deepEqual(out.roots.map((r) => r.module), ['a', 'z']);
});

test('dragging a folder onto another moves it in, and its subtree follows', () => {
  const plan = moveModuleInto(['a', 'b', 'b / x'], 'b', 'a');
  assert.equal(plan.from, 'b');
  assert.equal(plan.to, 'a / b');
  assert.deepEqual(plan.modules, ['a', 'a / b', 'a / b / x']);
});

test('a folder cannot be dropped into itself or its own child', () => {
  assert.equal(moveModuleInto(['a', 'a / x'], 'a', 'a / x'), null);
  assert.equal(moveModuleInto(['a', 'a / x', 'a / x / y'], 'a', 'a / x / y'), null);
  assert.equal(moveModuleInto(['a'], 'a', 'a'), null);
});

test('a folder that holds children counts what lives under it', () => {
  const tree = arrangeCatalogTree([
    { module: 'a', items: [{ id: '1' }] },
    { module: 'a / b', items: [{ id: '2' }, { id: '3' }] },
  ], { requests: [], modules: [] });
  assert.equal(tree.roots[0].total, 3);
  assert.equal(tree.roots[0].children[0].total, 2);
});

test('running a folder runs its own requests, then its children, depth first', () => {
  const groups = [
    { module: '用户 / 登录', items: [{ id: 'l1' }, { id: 'l2' }] },
    { module: '用户', items: [{ id: 'u1' }] },
    { module: '用户 / 登录 / 刷新', items: [{ id: 'r1' }] },
    { module: '订单', items: [{ id: 'o1' }] },
    { module: '', items: [{ id: 'loose' }] },
  ];
  // The parent's own requests come first, then the subtree in drawn order.
  assert.deepEqual(moduleRunScope(groups, '用户').map((r) => r.id), ['u1', 'l1', 'l2', 'r1']);
  // A child folder runs itself and what is under it, not its siblings.
  assert.deepEqual(moduleRunScope(groups, '用户 / 登录').map((r) => r.id), ['l1', 'l2', 'r1']);
  assert.deepEqual(moduleRunScope(groups, '订单').map((r) => r.id), ['o1']);
});

test('running a folder that does not exist runs nothing', () => {
  const groups = [{ module: 'a', items: [{ id: '1' }] }];
  assert.deepEqual(moduleRunScope(groups, '无此目录'), []);
  // 未分组 is not a folder, so it is not run as one.
  assert.deepEqual(moduleRunScope(groups, ''), []);
});

test('a folder that only holds subfolders still runs them', () => {
  const groups = [{ module: 'a / b', items: [{ id: '1' }] }];
  // 'a' was never declared, but the tree makes it real, so it can be run.
  assert.deepEqual(moduleRunScope(groups, 'a').map((r) => r.id), ['1']);
});

test('the move list draws the folders as a tree, 未分组 first', () => {
  const rows = moveDestinations(['用户 / 登录', '用户', '订单'], '');
  assert.deepEqual(rows.map((r) => r.path), ['', '用户', '用户 / 登录', '订单']);
  assert.deepEqual(rows.map((r) => r.depth), [0, 0, 1, 0]);
  assert.deepEqual(rows.map((r) => r.name), ['未分组', '用户', '登录', '订单']);
  // The request is ungrouped, so that is the row that reads as the current one.
  assert.deepEqual(rows.map((r) => r.current), [true, false, false, false]);
});

test('the move list keeps siblings together instead of interleaving them', () => {
  // Parents before children is not enough: drawn in that order this would read
  // a, a / x, b, a / y, which puts a / y under b.
  const rows = moveDestinations(['a / x', 'b', 'a / y'], '');
  assert.deepEqual(rows.map((r) => r.path), ['', 'a', 'a / x', 'a / y', 'b']);
});

test('the move list marks the folder the request is in now', () => {
  const rows = moveDestinations(['用户 / 登录', '订单'], '用户 / 登录');
  assert.deepEqual(rows.map((r) => [r.path, r.current]), [
    ['', false],
    ['用户', false],
    ['用户 / 登录', true],
    ['订单', false],
  ]);
});

test('a folder that was never declared still appears as an ancestor', () => {
  const rows = moveDestinations(['用户 / 登录'], '');
  assert.deepEqual(rows.map((r) => r.path), ['', '用户', '用户 / 登录']);
});

test('searching the move list matches the name or any part of the path', () => {
  const rows = moveDestinations(['用户 / 登录', '订单'], '');
  const paths = (kw) => filterDestinations(rows, kw).map((r) => r.path);
  assert.deepEqual(paths('登录'), ['用户 / 登录']);
  // The parent matches by its own name and by its children's paths.
  assert.deepEqual(paths('用户'), ['用户', '用户 / 登录']);
  assert.deepEqual(paths('单'), ['订单']);
  assert.deepEqual(paths('未分组'), ['']);
  assert.deepEqual(paths('不存在'), []);
  // An empty box shows everything, including 未分组.
  assert.equal(paths('').length, rows.length);
  assert.equal(paths('   ').length, rows.length);
});
