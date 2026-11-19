// The same eleven targets, in the same three groups, that cyberapi offers under
// 「复制为…」: the command line, then scripts, then compiled languages. Each one
// is a runnable program, not a fragment, so a paste into a scratch file works.
import { toCurl, methodOmitsBody } from './http-ui.js';

export const CODE_GROUPS = [
  ['curl', 'httpie'],
  ['fetch', 'axios', 'python', 'php'],
  ['go', 'rust', 'java', 'csharp', 'swift'],
];

export const CODE_LABELS = {
  curl: 'cURL',
  httpie: 'HTTPie',
  fetch: 'JavaScript fetch',
  axios: 'Node.js axios',
  python: 'Python requests',
  php: 'PHP Guzzle',
  go: 'Go net/http',
  rust: 'Rust reqwest',
  java: 'Java HttpClient',
  csharp: 'C# HttpClient',
  swift: 'Swift URLSession',
};

/** A double-quoted literal with the escapes every one of these languages shares. */
function dq(value) {
  return `"${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')}"`;
}

/** PHP interpolates `$` in double quotes and not in single ones. */
function phpString(value) {
  return `'${String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Go reads a raw string as written; a body with a backtick or CR cannot be one. */
function goString(value) {
  const text = String(value ?? '');
  return text.includes('`') || text.includes('\r') ? dq(text) : `\`${text}\``;
}

/** Rust's raw string keeps JSON readable; `"#` inside would end it early. */
function rustString(value) {
  const text = String(value ?? '');
  return text.includes('"#') || text.includes('\r') ? dq(text) : `r#"${text}"#`;
}

function normalize(spec) {
  const method = String(spec?.method || 'GET').toUpperCase();
  const headers = {};
  for (const [key, value] of Object.entries(spec?.headers || {})) {
    if (String(key || '').trim()) headers[String(key)] = String(value ?? '');
  }
  return {
    method,
    url: String(spec?.url || ''),
    headers,
    body: methodOmitsBody(method) ? '' : String(spec?.body || ''),
    followRedirects: spec?.followRedirects !== false,
    insecure: Boolean(spec?.insecureSkipVerify),
  };
}

function httpie(spec) {
  const words = ['http', '--verbose'];
  if (spec.followRedirects) words.push('--follow');
  if (spec.insecure) words.push('--verify=no');
  if (spec.body) words.push('--raw', dq(spec.body));
  words.push(spec.method, dq(spec.url));
  for (const [name, value] of Object.entries(spec.headers)) {
    // `Name;` sends a header with no value; `Name:` would leave it out.
    words.push(dq(value === '' ? `${name};` : `${name}:${value}`));
  }
  return words.join(' ');
}

function fetchCode(spec) {
  const lines = [];
  if (spec.insecure) {
    lines.push('// Certificates are not checked: in Node, run this with NODE_TLS_REJECT_UNAUTHORIZED=0.');
  }
  lines.push(`const response = await fetch(${dq(spec.url)}, {`);
  lines.push(`    method: ${dq(spec.method)},`);
  if (Object.keys(spec.headers).length) {
    lines.push('    headers: {');
    for (const [name, value] of Object.entries(spec.headers)) {
      if (name.toLowerCase() === 'cookie') {
        lines.push('        // A browser drops this header; there, credentials: "include" sends the browser\'s own cookies.');
      }
      lines.push(`        ${dq(name)}: ${dq(value)},`);
    }
    lines.push('    },');
  }
  if (spec.body) lines.push(`    body: ${dq(spec.body)},`);
  if (!spec.followRedirects) lines.push('    redirect: "manual",');
  lines.push('});');
  lines.push('console.log(response.status, await response.text());');
  return lines.join('\n');
}

function axiosCode(spec) {
  const lines = ['import axios from "axios";'];
  if (spec.insecure) lines.push('import https from "node:https";');
  lines.push('', 'const response = await axios.request({');
  lines.push(`    method: ${dq(spec.method.toLowerCase())},`);
  lines.push(`    url: ${dq(spec.url)},`);
  if (Object.keys(spec.headers).length) {
    lines.push('    headers: {');
    for (const [name, value] of Object.entries(spec.headers)) {
      lines.push(`        ${dq(name)}: ${dq(value)},`);
    }
    lines.push('    },');
  }
  if (spec.body) lines.push(`    data: ${dq(spec.body)},`);
  if (!spec.followRedirects) lines.push('    maxRedirects: 0,');
  if (spec.insecure) lines.push('    httpsAgent: new https.Agent({ rejectUnauthorized: false }),');
  // Every status is a response here, as it is in the app.
  lines.push('    validateStatus: () => true,');
  lines.push('});');
  lines.push('console.log(response.status, response.data);');
  return lines.join('\n');
}

function pythonCode(spec) {
  const lines = ['import requests', '', 'response = requests.request('];
  lines.push(`    ${dq(spec.method)},`);
  lines.push(`    ${dq(spec.url)},`);
  if (Object.keys(spec.headers).length) {
    lines.push('    headers={');
    for (const [name, value] of Object.entries(spec.headers)) {
      lines.push(`        ${dq(name)}: ${dq(value)},`);
    }
    lines.push('    },');
  }
  if (spec.body) lines.push(`    data=${dq(spec.body)}.encode(),`);
  lines.push(`    allow_redirects=${spec.followRedirects ? 'True' : 'False'},`);
  if (spec.insecure) lines.push('    verify=False,');
  lines.push(')');
  lines.push('print(response.status_code)');
  lines.push('print(response.text)');
  return lines.join('\n');
}

function phpCode(spec) {
  const options = [
    `    'allow_redirects' => ${spec.followRedirects ? 'true' : 'false'},`,
  ];
  if (spec.insecure) options.push("    'verify' => false,");
  const call = ["    'headers' => ["];
  for (const [name, value] of Object.entries(spec.headers)) {
    call.push(`        ${phpString(name)} => ${phpString(value)},`);
  }
  call.push('    ],');
  if (spec.body) call.push(`    'body' => ${phpString(spec.body)},`);
  const lines = [
    '<?php',
    "require 'vendor/autoload.php';",
    '',
    '$client = new \\GuzzleHttp\\Client([',
    ...options,
    ']);',
    '',
    `$response = $client->request(${phpString(spec.method)}, ${phpString(spec.url)}, [`,
    ...call,
    ']);',
    '',
    'echo $response->getStatusCode(), "\\n", $response->getBody();',
  ];
  return lines.join('\n');
}

function goCode(spec) {
  const imports = ['"fmt"', '"io"', '"net/http"'];
  if (spec.body) imports.push('"strings"');
  if (spec.insecure) imports.push('"crypto/tls"');
  imports.sort();
  const check = ['\tif err != nil {', '\t\tpanic(err)', '\t}'];
  const lines = ['package main', '', 'import ('];
  for (const name of imports) lines.push(`\t${name}`);
  lines.push(')', '', 'func main() {', '\tvar client *http.Client');
  if (spec.insecure) {
    lines.push('\t// This request skips certificate verification; keep it to lab hosts.');
    lines.push('\ttransport := &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}');
    lines.push('\tclient = &http.Client{Transport: transport}');
  } else if (!spec.followRedirects) {
    lines.push('\tclient = &http.Client{');
    lines.push('\t\tCheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },');
    lines.push('\t}');
  } else {
    lines.push('\tclient = &http.Client{}');
  }
  const body = spec.body ? `strings.NewReader(${goString(spec.body)})` : 'nil';
  lines.push(`\treq, err := http.NewRequest(${dq(spec.method)}, ${dq(spec.url)}, ${body})`);
  lines.push(...check);
  for (const [name, value] of Object.entries(spec.headers)) {
    lines.push(`\treq.Header.Set(${dq(name)}, ${dq(value)})`);
  }
  lines.push('\tres, err := client.Do(req)');
  lines.push(...check);
  lines.push('\tdefer res.Body.Close()');
  lines.push('\tfmt.Println(res.Status)');
  lines.push('\tbody, err := io.ReadAll(res.Body)');
  lines.push(...check);
  lines.push('\tfmt.Println(string(body))');
  lines.push('}');
  return lines.join('\n');
}

function rustCode(spec) {
  const builder = [];
  if (!spec.followRedirects) builder.push('        .redirect(reqwest::redirect::Policy::none())');
  if (spec.insecure) builder.push('        .danger_accept_invalid_certs(true)');
  const lines = [
    'use reqwest::Client;',
    '',
    '#[tokio::main]',
    'async fn main() -> Result<(), Box<dyn std::error::Error>> {',
  ];
  if (builder.length) {
    lines.push('    let client = Client::builder()');
    lines.push(...builder);
    lines.push('        .build()?;');
  } else {
    lines.push('    let client = Client::new();');
  }
  lines.push('    let response = client');
  lines.push(`        .request(reqwest::Method::from_bytes(b${dq(spec.method)})?, ${rustString(spec.url)})`);
  for (const [name, value] of Object.entries(spec.headers)) {
    lines.push(`        .header(${dq(name)}, ${rustString(value)})`);
  }
  if (spec.body) lines.push(`        .body(${rustString(spec.body)})`);
  lines.push('        .send()');
  lines.push('        .await?;');
  lines.push('    println!("{}", response.status());');
  lines.push('    println!("{}", response.text().await?);');
  lines.push('    Ok(())');
  lines.push('}');
  return lines.join('\n');
}

// Java 11's own HttpClient: nothing to install, so the snippet compiles with the
// JDK the reader already has. The headers it writes itself and refuses are left
// to it rather than passed to a setter that would throw.
const JAVA_RESTRICTED = ['host', 'connection', 'content-length', 'expect', 'upgrade'];

function javaCode(spec) {
  const imports = [
    'java.net.URI',
    'java.net.http.HttpClient',
    'java.net.http.HttpRequest',
    'java.net.http.HttpResponse',
  ];
  if (spec.body) imports.push('java.nio.charset.StandardCharsets');
  if (spec.insecure) {
    imports.push(
      'java.security.cert.X509Certificate',
      'javax.net.ssl.SSLContext',
      'javax.net.ssl.TrustManager',
      'javax.net.ssl.X509TrustManager',
    );
  }
  imports.sort();
  const lines = imports.map((name) => `import ${name};`);
  lines.push('', 'public class Main {', '    public static void main(String[] args) throws Exception {');
  if (spec.insecure) {
    lines.push(
      '        SSLContext trustAll = SSLContext.getInstance("TLS");',
      '        trustAll.init(null, new TrustManager[] {new X509TrustManager() {',
      '            public void checkClientTrusted(X509Certificate[] chain, String type) {}',
      '            public void checkServerTrusted(X509Certificate[] chain, String type) {}',
      '            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }',
      '        }}, null);',
      '        // Host names are still checked: -Djdk.internal.httpclient.disableHostnameVerification=true stops that.',
    );
  }
  lines.push('        HttpClient client = HttpClient.newBuilder()');
  if (spec.followRedirects) lines.push('            .followRedirects(HttpClient.Redirect.NORMAL)');
  if (spec.insecure) lines.push('            .sslContext(trustAll)');
  lines.push('            .build();');
  const body = spec.body
    ? 'HttpRequest.BodyPublishers.ofString(' + dq(spec.body) + ')'
    : 'HttpRequest.BodyPublishers.noBody()';
  lines.push(`        HttpRequest request = HttpRequest.newBuilder(URI.create(${dq(spec.url)}))`);
  lines.push(`            .method(${dq(spec.method)}, ${body})`);
  for (const [name, value] of Object.entries(spec.headers)) {
    if (JAVA_RESTRICTED.includes(name.toLowerCase())) {
      lines.push(`            // ${name}: HttpClient sends its own.`);
    } else {
      lines.push(`            .header(${dq(name)}, ${dq(value)})`);
    }
  }
  lines.push(
    '            .build();',
    '        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());',
    '        System.out.println(response.statusCode());',
    '        System.out.println(response.body());',
    '    }',
    '}',
  );
  return lines.join('\n');
}

// .NET keeps these with the content, and `request.Headers` silently drops them.
function aboutContent(name) {
  const lower = String(name).toLowerCase();
  return lower.startsWith('content-') || ['allow', 'expires', 'last-modified'].includes(lower);
}

function csharpCode(spec) {
  const entries = Object.entries(spec.headers);
  const content = entries.filter(([name]) => aboutContent(name));
  const plain = entries.filter(([name]) => !aboutContent(name));

  const options = [`            AllowAutoRedirect = ${spec.followRedirects ? 'true' : 'false'},`];
  if (spec.insecure) {
    options.push(
      '            // This request skips certificate verification; keep it to lab hosts.',
      '            ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,',
    );
  }
  const lines = [
    'using System;',
    'using System.Net.Http;',
    'using System.Text;',
    'using System.Threading.Tasks;',
    '',
    'class Program',
    '{',
    '    static async Task Main()',
    '    {',
  ];
  lines.push('        var handler = new HttpClientHandler', '        {', ...options, '        };');
  lines.push('        using var client = new HttpClient(handler);');
  lines.push(`        using var request = new HttpRequestMessage(new HttpMethod(${dq(spec.method)}), ${dq(spec.url)});`);
  for (const [name, value] of plain) {
    lines.push(`        request.Headers.TryAddWithoutValidation(${dq(name)}, ${dq(value)});`);
  }
  if (spec.body) {
    // ByteArrayContent takes no media type of its own, so a Content-Type the
    // request carries stays where the request put it instead of being doubled
    // or replaced by a default the request never asked for.
    lines.push(`        request.Content = new ByteArrayContent(Encoding.UTF8.GetBytes(${dq(spec.body)}));`);
  } else if (content.length) {
    // A content header with no body still needs something to hang on.
    lines.push('        request.Content = new ByteArrayContent(Array.Empty<byte>());');
  }
  for (const [name, value] of content) {
    lines.push(`        request.Content.Headers.TryAddWithoutValidation(${dq(name)}, ${dq(value)});`);
  }
  lines.push(
    '        using var response = await client.SendAsync(request);',
    '        Console.WriteLine((int)response.StatusCode);',
    '        Console.WriteLine(await response.Content.ReadAsStringAsync());',
    '    }',
    '}',
  );
  return lines.join('\n');
}

// URLSession needs a delegate for the three things a plain request cannot say:
// stop redirects, take any certificate, answer a Digest challenge. Top-level
// `await` keeps the whole thing a script rather than a main.swift dance.
function swiftCode(spec) {
  const delegated = !spec.followRedirects || spec.insecure;
  const lines = ['import Foundation', ''];
  if (delegated) {
    lines.push('final class Delegate: NSObject, URLSessionTaskDelegate {');
    if (!spec.followRedirects) {
      lines.push(
        '    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest) async -> URLRequest? {',
        '        nil',
        '    }',
      );
    }
    if (spec.insecure) {
      lines.push(
        '    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {',
        '        guard let trust = challenge.protectionSpace.serverTrust else { return (.performDefaultHandling, nil) }',
        '        return (.useCredential, URLCredential(trust: trust))',
        '    }',
      );
    }
    lines.push('}', '');
  }
  lines.push(`var request = URLRequest(url: URL(string: ${dq(spec.url)})!)`);
  lines.push(`request.httpMethod = ${dq(spec.method)}`);
  for (const [name, value] of Object.entries(spec.headers)) {
    lines.push(`request.setValue(${dq(value)}, forHTTPHeaderField: ${dq(name)})`);
  }
  if (spec.body) {
    lines.push(`request.httpBody = Data(${dq(spec.body)}.utf8)`);
  }
  lines.push('');
  lines.push(
    delegated
      ? 'let session = URLSession(configuration: .default, delegate: Delegate(), delegateQueue: nil)'
      : 'let session = URLSession.shared',
  );
  lines.push(
    'let (data, response) = try await session.data(for: request)',
    'print((response as! HTTPURLResponse).statusCode)',
    'print(String(decoding: data, as: UTF8.self))',
  );
  return lines.join('\n');
}

const GENERATORS = {
  curl: (spec) => toCurl({
    method: spec.method,
    url: spec.url,
    headers: spec.headers,
    body: spec.body,
    followRedirects: spec.followRedirects,
    insecureSkipVerify: spec.insecure,
  }),
  httpie,
  fetch: fetchCode,
  axios: axiosCode,
  python: pythonCode,
  php: phpCode,
  go: goCode,
  rust: rustCode,
  java: javaCode,
  csharp: csharpCode,
  swift: swiftCode,
};

/** The request as code in the target's language; '' for an unknown target. */
export function toCode(target, spec) {
  const generate = GENERATORS[String(target || '').toLowerCase()];
  if (!generate) return '';
  return generate(normalize(spec));
}

/**
 * Whether pasted text is a cURL command, so 「粘贴 cURL」 can import it without
 * asking. `curl` on its own carries no request, so it goes to the prompt
 * instead of failing in the parser.
 */
export function looksLikeCurlCommand(text) {
  return /(^|[\s;&|])(curl|curl\.exe)\s+\S/i.test(String(text || '').trim());
}
