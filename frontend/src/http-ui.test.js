import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
