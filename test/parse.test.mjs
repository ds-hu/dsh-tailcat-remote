import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildForwardCommand,
  buildGenkeyArgs,
  buildServeArgs,
  headerEnd,
  isBootstrapRequest,
  parseAccessLine,
  parseAddressLine,
  parseDurationMs,
  parseRegionLine,
  parseRequestHead,
  sanitizeLine,
  sanitizePeer,
} from '../src/parse.js';

const KEY = `nodekey:${'a'.repeat(64)}`;

test('parseAddressLine reads both saved and ephemeral startup lines', () => {
  assert.deepEqual(parseAddressLine('# 🐈 Server listening with saved key "dsh-tailcat": tcABC'), {
    mode: 'saved',
    keyName: 'dsh-tailcat',
    address: 'tcABC',
  });
  assert.deepEqual(parseAddressLine('# 🐈 Server listening with new address: tcXYZ'), {
    mode: 'ephemeral',
    address: 'tcXYZ',
  });
  assert.equal(parseAddressLine('2026/11/24 # Proxying port 13080 to unix:/tmp/x.sock'), null);
  assert.equal(parseAddressLine('listening on tcABC'), null);
});

test('parseRegionLine extracts a numeric region and its name', () => {
  assert.deepEqual(parseRegionLine('2026/11/24 16:25:17 # Selected bootstrap relay region 304, Tokyo'), {
    id: 304,
    name: 'Tokyo',
  });
  assert.equal(parseRegionLine('no region here'), null);
});

test('parseAccessLine structures open and close records', () => {
  const open = parseAccessLine(
    '2026/11/24 16:25:20 [conn] open peer=nodekey:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa proto=tcp port=13080 service=forward via=direct:172.18.0.1:44806',
  );
  assert.equal(open.kind, 'connection');
  assert.equal(open.event, 'open');
  assert.equal(open.peer, 'nodekey:aaaaaaaa…aaaa');
  assert.equal(open.protocol, 'tcp');
  assert.equal(open.port, 13_080);
  assert.equal(open.service, 'forward');
  assert.equal(open.via, 'direct:172.18.0.1:44806');
  assert.equal(open.durationMs, null);

  const close = parseAccessLine(
    '2026/11/24 16:25:26 [conn] close peer=nodekey:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa proto=tcp port=13080 service=forward duration=8.104s',
  );
  assert.equal(close.event, 'close');
  assert.equal(close.durationMs, 8_104);

  assert.equal(parseAccessLine('not a tailcat access record'), null);
});

test('parseAccessLine records a refusal as a peer decision', () => {
  const refused = parseAccessLine(
    '2026/11/24 16:29:07 [peer] refused key=nodekey:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb reason=not-in-allow',
  );
  assert.deepEqual(refused, {
    kind: 'peer',
    decision: 'refused',
    peer: 'nodekey:bbbbbbbb…bbbb',
    reason: 'not-in-allow',
  });
});

test('sanitizePeer shortens long keys and leaves short values alone', () => {
  assert.equal(sanitizePeer(KEY), 'nodekey:aaaaaaaa…aaaa');
  assert.equal(sanitizePeer('nodekey:abc'), 'nodekey:abc');
  assert.equal(sanitizePeer('not-a-key'), 'not-a-key');
});

test('parseDurationMs handles Go duration spellings', () => {
  assert.equal(parseDurationMs('8.104s'), 8_104);
  assert.equal(parseDurationMs('532ms'), 532);
  assert.equal(parseDurationMs('1m3.2s'), 63_200);
  assert.equal(parseDurationMs('1.5h'), 5_400_000);
  assert.equal(parseDurationMs('forever'), null);
});

test('buildServeArgs puts root flags before the subcommand and allow-list before the target', () => {
  assert.deepEqual(
    buildServeArgs({
      binaryPath: '/opt/tailcat',
      port: 13_080,
      listen: 'socket',
      socketPath: '/tmp/door.sock',
      keyName: 'dsh-tailcat',
      addressMode: 'stable',
      allow: [KEY],
      logAccess: true,
    }),
    ['/opt/tailcat', '--json', '--key=dsh-tailcat', 'serve', '--log', `--allow=${KEY}`, '13080:/tmp/door.sock'],
  );

  assert.deepEqual(
    buildServeArgs({
      binaryPath: 'tailcat',
      port: 14_000,
      listen: 'tcp',
      socketPath: '',
      keyName: 'key',
      addressMode: 'ephemeral',
      allow: [],
      logAccess: false,
      derpMapUrl: 'https://derp.example/map.json',
    }),
    ['tailcat', '--json', '--derpmap-url=https://derp.example/map.json', '--key=new', 'serve', '14000:127.0.0.1:14000'],
  );
});

test('buildServeArgs requires a socket path in socket mode', () => {
  assert.throws(
    () =>
      buildServeArgs({
        binaryPath: 'tailcat',
        port: 13_080,
        listen: 'socket',
        socketPath: '',
        keyName: 'key',
        addressMode: 'stable',
        allow: [],
        logAccess: true,
      }),
    /socketPath is required/,
  );
});

test('buildServeArgs ignores empty or non-string allow entries', () => {
  const argv = buildServeArgs({
    binaryPath: 'tailcat',
    port: 13_080,
    listen: 'socket',
    socketPath: '/tmp/door.sock',
    keyName: 'key',
    addressMode: 'stable',
    allow: ['', null, KEY, 7],
    logAccess: true,
  });
  assert.deepEqual(argv, ['tailcat', '--json', '--key=key', 'serve', '--log', `--allow=${KEY}`, '13080:/tmp/door.sock']);
});

test('buildGenkeyArgs and buildForwardCommand produce the commands the panel shows', () => {
  assert.deepEqual(buildGenkeyArgs({ binaryPath: 'tailcat', keyName: 'dsh-tailcat', force: true }), [
    'tailcat',
    'genkey',
    '--force',
    '--key=dsh-tailcat',
    '--fixed-region',
  ]);
  assert.equal(buildForwardCommand('tcABC', 13_080), 'tailcat forward tcABC 18080:13080');
  assert.equal(buildForwardCommand('tcABC', 13_080, 18_081), 'tailcat forward tcABC 18081:13080');
});

test('headerEnd finds CRLF and LF header terminators', () => {
  const crlf = Buffer.from('GET / HTTP/1.1\r\nHost: x\r\n\r\nbody');
  assert.equal(headerEnd(crlf), crlf.indexOf('\r\n\r\n') + 4);

  const lf = Buffer.from('GET / HTTP/1.1\nHost: x\n\nbody');
  assert.equal(headerEnd(lf), lf.indexOf('\n\n') + 2);

  assert.equal(headerEnd(Buffer.from('GET / HTTP/1.1\r\nHost: x')), -1);
});

test('parseRequestHead reads the request line, path, token and headers', () => {
  const head = parseRequestHead(
    Buffer.from(
      'GET /?token=once HTTP/1.1\r\nHost: 127.0.0.1:18080\r\nCookie: a=1\r\nCookie: b=2\r\nSec-Fetch-Site: same-origin\r\n\r\n',
    ),
  );

  assert.ok(head);
  assert.equal(head.method, 'GET');
  assert.equal(head.target, '/?token=once');
  assert.equal(head.path, '/');
  assert.equal(head.tokenPresent, true);
  assert.equal(head.headers.host, '127.0.0.1:18080');
  assert.equal(head.headers.cookie, 'a=1; b=2');
  assert.equal(head.headers['sec-fetch-site'], 'same-origin');
});

test('parseRequestHead rejects incomplete or malformed heads', () => {
  assert.equal(parseRequestHead(Buffer.from('GET / HTTP/1.1\r\nHost: x')), null);
  assert.equal(parseRequestHead(Buffer.from('nonsense\r\n\r\n')), null);
});

test('isBootstrapRequest is exactly a token-free GET of /', () => {
  const get = (target) =>
    parseRequestHead(Buffer.from(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:18080\r\n\r\n`));

  assert.equal(isBootstrapRequest(get('/')), true);
  assert.equal(isBootstrapRequest(get('/?token=once')), false);
  assert.equal(isBootstrapRequest(get('/index.html')), false);

  const post = parseRequestHead(Buffer.from('POST / HTTP/1.1\r\nHost: x\r\n\r\n'));
  assert.equal(isBootstrapRequest(post), false);
  assert.equal(isBootstrapRequest(null), false);
});

test('sanitizeLine removes tailcat addresses and full node keys', () => {
  const address = `tc${'A'.repeat(40)}`;
  const line = `${address} ${KEY} ${'x'.repeat(600)}`;
  const scrubbed = sanitizeLine(line);

  assert.equal(scrubbed.includes('tcAAAA'), false);
  assert.equal(scrubbed.includes(KEY), false);
  assert.match(scrubbed, /tc…/);
  assert.match(scrubbed, /nodekey:aaaaaaaa…aaaa/);
  assert.equal(scrubbed.length, 500);
});

test('sanitizeLine keeps ordinary lines readable', () => {
  assert.equal(sanitizeLine('  # Selected bootstrap relay region 304, Tokyo  '), '# Selected bootstrap relay region 304, Tokyo');
});
