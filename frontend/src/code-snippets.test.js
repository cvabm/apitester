import test from 'node:test';
import assert from 'node:assert/strict';

import { CODE_GROUPS, CODE_LABELS, toCode } from './code-snippets.js';

const JSON_POST = {
  method: 'POST',
  url: 'https://api.example.test/login',
  headers: { 'Content-Type': 'application/json', 'X-Trace': 'abc' },
  body: '{"user":"ann","pass":"s3cret"}',
  followRedirects: true,
  insecureSkipVerify: false,
};

const GET = {
  method: 'GET',
  url: 'http://127.0.0.1:8080/a?q=1',
  headers: {},
  body: '',
  followRedirects: true,
};

test('the menu lists eleven targets in three groups', () => {
  assert.equal(CODE_GROUPS.flat().length, 11);
  assert.deepEqual(CODE_GROUPS.flat(), Object.keys(CODE_LABELS));
  for (const group of CODE_GROUPS) assert.ok(group.length > 0);
});

test('every target produces a non-empty program for a JSON POST', () => {
  for (const target of CODE_GROUPS.flat()) {
    const code = toCode(target, JSON_POST);
    assert.ok(code.length > 0, `${target} produced nothing`);
    assert.match(code, /api\.example\.test/, `${target} lost the URL`);
  }
});

test('every target keeps the method and the body', () => {
  for (const target of CODE_GROUPS.flat()) {
    const code = toCode(target, JSON_POST);
    assert.match(code, /POST|post/i, `${target} lost the method`);
    assert.match(code, /ann/, `${target} lost the body`);
  }
});

test('a GET carries no body anywhere', () => {
  for (const target of CODE_GROUPS.flat()) {
    const code = toCode(target, { ...GET, body: '{"a":1}' });
    assert.doesNotMatch(code, /\{"a":1\}/, `${target} sent a GET body`);
  }
});

test('only the targets that can skip verification mention it', () => {
  const insecure = { ...JSON_POST, url: 'https://api.example.test/x', insecureSkipVerify: true };
  assert.match(toCode('curl', insecure), /-k/);
  assert.match(toCode('httpie', insecure), /--verify=no/);
  assert.match(toCode('python', insecure), /verify=False/);
  assert.match(toCode('go', insecure), /InsecureSkipVerify: true/);
  assert.match(toCode('rust', insecure), /danger_accept_invalid_certs\(true\)/);
  assert.match(toCode('axios', insecure), /rejectUnauthorized: false/);
  assert.match(toCode('php', insecure), /'verify' => false/);
  assert.match(toCode('csharp', insecure), /ServerCertificateCustomValidationCallback/);
  assert.match(toCode('curl', JSON_POST), /^(?!.*-k)/);
});

test('redirects are suppressed where the language lets you', () => {
  const manual = { ...GET, followRedirects: false };
  assert.match(toCode('fetch', manual), /redirect: "manual"/);
  assert.match(toCode('axios', manual), /maxRedirects: 0/);
  assert.match(toCode('python', manual), /allow_redirects=False/);
  assert.match(toCode('go', manual), /ErrUseLastResponse/);
  assert.match(toCode('rust', manual), /Policy::none\(\)/);
  assert.match(toCode('php', manual), /'allow_redirects' => false/);
  assert.match(toCode('csharp', manual), /AllowAutoRedirect = false/);
  assert.match(toCode('httpie', manual), /^(?!.*--follow)/);
});

test('quotes and dollars survive each language\'s own escaping', () => {
  const tricky = {
    method: 'POST',
    url: 'https://api.example.test/x',
    headers: { 'Content-Type': 'text/plain' },
    body: 'say "hi" $HOME \\ end',
    followRedirects: true,
  };
  // PHP single quotes leave `"` and `$HOME` alone and only double the backslash;
  // double quotes would interpolate the variable.
  const php = toCode('php', tricky);
  assert.match(php, /'say "hi" \$HOME \\\\ end'/);
  assert.doesNotMatch(php, /"say \\"hi\\"/);
  assert.match(toCode('rust', tricky), /r#"say "hi" \$HOME \\ end"#/);
  // Go's raw string needs no escapes at all.
  assert.match(toCode('go', tricky), /`say "hi" \$HOME \\ end`/);
  for (const target of CODE_GROUPS.flat()) {
    const code = toCode(target, tricky);
    assert.doesNotMatch(code, /\n\s*$/, `${target} left a dangling newline`);
  }
});

test('a backtick in the body moves Go off its raw string', () => {
  const code = toCode('go', { ...JSON_POST, body: 'a`b' });
  assert.doesNotMatch(code, /`a`b`/);
  assert.match(code, /a`b/);
});

test('java uses the JDK client, so nothing has to be installed', () => {
  const code = toCode('java', JSON_POST);
  assert.match(code, /import java\.net\.http\.HttpClient;/);
  assert.match(code, /public class Main \{/);
  // A third-party client would need a build file before it compiled.
  assert.doesNotMatch(code, /okhttp3/);
  assert.doesNotMatch(code, /import org\.apache/);
});

test('java leaves the headers its own client refuses', () => {
  const code = toCode('java', { ...JSON_POST, headers: { ...JSON_POST.headers, Host: 'evil.test' } });
  assert.match(code, /\/\/ Host: HttpClient sends its own\./);
  assert.doesNotMatch(code, /\.header\("Host"/);
});

test('java only asks for redirects when the request follows them', () => {
  assert.match(toCode('java', JSON_POST), /followRedirects\(HttpClient\.Redirect\.NORMAL\)/);
  // HttpClient follows none by default, so the opt-out is the absence of that line.
  assert.doesNotMatch(toCode('java', { ...GET, followRedirects: false }), /followRedirects/);
});

test('java writes out the trust-all context only when certificates are skipped', () => {
  assert.doesNotMatch(toCode('java', JSON_POST), /SSLContext/);
  const insecure = toCode('java', { ...JSON_POST, insecureSkipVerify: true });
  assert.match(insecure, /import javax\.net\.ssl\.SSLContext;/);
  assert.match(insecure, /\.sslContext\(trustAll\)/);
});

test('csharp hangs content headers on the content, where .NET keeps them', () => {
  const spec = {
    ...JSON_POST,
    headers: { 'Content-Type': 'application/json', 'Content-Language': 'en', 'X-Trace': 'abc' },
  };
  const code = toCode('csharp', spec);
  // `request.Headers` silently drops these, so they must not be put there.
  assert.doesNotMatch(code, /request\.Headers\.TryAddWithoutValidation\("Content-/);
  assert.match(code, /request\.Content\.Headers\.TryAddWithoutValidation\("Content-Type", "application\/json"\)/);
  assert.match(code, /request\.Content\.Headers\.TryAddWithoutValidation\("Content-Language", "en"\)/);
  assert.match(code, /request\.Headers\.TryAddWithoutValidation\("X-Trace", "abc"\)/);
  // ByteArrayContent adds no media type, so Content-Type is not silently doubled.
  assert.doesNotMatch(code, /StringContent/);
});

test('csharp gives a content header something to hang on without a body', () => {
  const code = toCode('csharp', {
    method: 'GET',
    url: 'http://127.0.0.1:8080/',
    headers: { 'Content-Type': 'application/json' },
    body: '',
  });
  assert.match(code, /request\.Content = new ByteArrayContent\(Array\.Empty<byte>\(\)\);/);
  assert.match(code, /request\.Content\.Headers\.TryAddWithoutValidation\("Content-Type", "application\/json"\)/);
});

test('csharp invents no media type and no pragma of its own', () => {
  const code = toCode('csharp', {
    method: 'POST',
    url: 'http://127.0.0.1:8080/',
    headers: { 'X-Trace': 'abc' },
    body: 'a=1',
    followRedirects: true,
    insecureSkipVerify: true,
  });
  // StringContent would have attached `text/plain` the request never carried.
  assert.match(code, /new ByteArrayContent\(Encoding\.UTF8\.GetBytes\("a=1"\)\)/);
  assert.doesNotMatch(code, /text\/plain/);
  // A made-up warning number makes the compiler answer CS1691 instead.
  assert.doesNotMatch(code, /#pragma/);
});

test('swift delegates only what a plain request cannot say', () => {
  const plain = toCode('swift', JSON_POST);
  assert.match(plain, /let session = URLSession\.shared/);
  assert.doesNotMatch(plain, /final class Delegate/);

  const noRedirect = toCode('swift', { ...JSON_POST, followRedirects: false });
  assert.match(noRedirect, /final class Delegate: NSObject, URLSessionTaskDelegate/);
  assert.match(noRedirect, /willPerformHTTPRedirection/);
  assert.match(noRedirect, /delegate: Delegate\(\)/);
  // A plain certificate check is not overridden.
  assert.doesNotMatch(noRedirect, /serverTrust/);

  const insecure = toCode('swift', { ...JSON_POST, insecureSkipVerify: true });
  assert.match(insecure, /URLCredential\(trust: trust\)/);
  // Redirects still follow, so that method stays out.
  assert.doesNotMatch(insecure, /willPerformHTTPRedirection/);
});

test('an unknown target yields nothing rather than a guess', () => {
  assert.equal(toCode('cobol', JSON_POST), '');
  assert.equal(toCode('', JSON_POST), '');
});

test('curl matches the clipboard format the app already used', () => {
  const spec = {
    method: 'POST',
    url: 'https://api.example.test/x',
    headers: { 'Content-Type': 'application/json' },
    body: '{"a":1}',
    followRedirects: true,
  };
  const code = toCode('curl', spec);
  assert.match(code, /^curl\.exe/);
  assert.match(code, /-L/);
  assert.match(code, /-X POST/);
  assert.match(code, /--data-raw/);
});
