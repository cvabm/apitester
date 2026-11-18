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
  assert.deepEqual(parseQuery('/echo?q=demo'), [{ key: 'q', value: 'demo', enabled: true }]);
  assert.deepEqual(parseQuery('//echo?q=demo'), [{ key: 'q', value: 'demo', enabled: true }]);
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

test('protocol-relative definitions use the environment scheme but keep their own host', () => {
  assert.equal(requestURLForEnvironment('//echo?q=demo', 'http://127.0.0.1:18080'), 'http://echo/?q=demo');
  assert.equal(requestURLForEnvironment('//echo:9000/a?q=1', 'https://base.test'), 'https://echo:9000/a?q=1');
  assert.equal(requestURLForEnvironment('//echo?q=demo', 'wss://base.test/gw'), 'wss://echo/?q=demo');
});
