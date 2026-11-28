// tailcat prints `via` only on the `[conn] open` line, so every closed
// connection's path has to be recovered by pairing its close with an open.
// These tests drive the supervisor's line handler directly: no process, no
// sockets, just the pairing rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TailcatSupervisor } from '../src/tailcat.js';
import { resolveConfig } from '../src/config.js';

const PEER = `nodekey:${'a'.repeat(64)}`;
const OTHER_PEER = `nodekey:${'b'.repeat(64)}`;

/** A supervisor with no tailcat behind it; `onStderr` is the only surface used. */
function supervisor() {
  const sup = new TailcatSupervisor({}, resolveConfig({ listen: 'tcp' }), {
    devices: {},
    logger: { info() {}, warn() {}, error() {} },
  });
  sup.generation = 1;
  return sup;
}

const openLine = (via, { peer = PEER, port = 13_080, proto = 'tcp' } = {}) =>
  `2026/11/28 02:00:00 [conn] open peer=${peer} proto=${proto} port=${port} service=forward via=${via}`;

const closeLine = ({ peer = PEER, port = 13_080, proto = 'tcp', duration = '8.104s' } = {}) =>
  `2026/11/28 02:00:01 [conn] close peer=${peer} proto=${proto} port=${port} service=forward duration=${duration}`;

test('concurrent connections on one key each keep their own path', () => {
  const sup = supervisor();
  const paths = [
    'derp:sfo',
    'derp:tok',
    'direct:10.0.0.1:4001',
    'direct:10.0.0.2:4002',
    'derp:sin',
    'direct:10.0.0.3:4003',
  ];

  for (const path of paths) sup.onStderr(1, openLine(path));
  for (let index = 0; index < paths.length; index += 1) sup.onStderr(1, closeLine());

  const recent = sup.snapshot().recent;
  assert.equal(recent.length, 6);
  // `recent` is newest first, so the closes read back in reverse order.
  assert.deepEqual(
    recent.map((entry) => entry.via),
    [...paths].reverse(),
  );
  assert.equal(sup.pendingConnections, 0, 'every open was consumed');
});

test('a close with no paired open reports null, not "unknown"', () => {
  const sup = supervisor();
  sup.onStderr(1, closeLine());

  const [entry] = sup.snapshot().recent;
  assert.equal(entry.via, null);
  assert.equal(entry.durationMs, 8_104, 'the close line still carries the duration');
});

test('pairing keys on peer, protocol and port', () => {
  const sup = supervisor();

  sup.onStderr(1, openLine('derp:sfo', { peer: OTHER_PEER, port: 22, proto: 'udp' }));
  sup.onStderr(1, closeLine({ port: 22, proto: 'udp' }));
  assert.equal(sup.snapshot().recent[0].via, null, 'another peer is another connection');

  sup.onStderr(1, openLine('derp:sfo', { port: 22, proto: 'udp' }));
  sup.onStderr(1, closeLine({ port: 22, proto: 'tcp' }));
  assert.equal(sup.snapshot().recent[0].via, null, 'another protocol is another connection');

  sup.onStderr(1, openLine('derp:sfo', { port: 22 }));
  sup.onStderr(1, closeLine({ port: 13_080 }));
  assert.equal(sup.snapshot().recent[0].via, null, 'another port is another connection');
});

test('a burst beyond the per-key queue keeps the oldest opens and drops the newest', () => {
  const sup = supervisor();
  const burst = 9; // one more than MAX_PENDING_PER_KEY

  for (let index = 0; index < burst; index += 1) {
    sup.onStderr(1, openLine(`direct:10.0.0.${index + 1}:40${index}`));
  }
  for (let index = 0; index < burst; index += 1) sup.onStderr(1, closeLine({ duration: '1s' }));

  const vias = sup.snapshot().recent.map((entry) => entry.via);
  assert.equal(vias.filter((via) => via === null).length, 1, 'exactly one close is left over');
  // Closes are oldest-last in `recent`; the queue keeps a prefix of the opens,
  // so the first close still reads the first open, and the newest close is the
  // one without a remembered open.
  assert.equal(vias.at(-1), 'direct:10.0.0.1:400', 'the oldest close keeps its own path');
  assert.equal(vias[0], null, 'the newest close has no remembered open');
});

test('the global pending ceiling drops every pairing instead of leaking memory', () => {
  const sup = supervisor();
  for (let index = 0; index <= 200; index += 1) {
    sup.onStderr(1, openLine('derp:sfo', { port: 2_000 + index }));
  }
  assert.equal(sup.pendingConnections, 0, 'the ceiling clears the whole map');

  sup.onStderr(1, closeLine({ port: 2_000 }));
  assert.equal(sup.snapshot().recent[0].via, null);
});

test('a restart forgets the opens its connections were waiting on', () => {
  const sup = supervisor();
  sup.onStderr(1, openLine('derp:sfo'));
  assert.equal(sup.pendingConnections, 1);

  sup.clearPairings(); // what startInternal does before the new tailcat spawns
  sup.onStderr(1, closeLine());

  assert.equal(sup.snapshot().recent[0].via, null);
});

test('a path tailcat itself could not determine never reaches the panel', () => {
  const sup = supervisor();
  // connlog.go prints `peer=unknown via=unknown` when PeerKey or the peer's
  // path is unresolvable; neither is a value to show.
  sup.onStderr(1, openLine('unknown', { peer: 'unknown' }));
  sup.onStderr(1, closeLine({ peer: 'unknown' }));

  const [entry] = sup.snapshot().recent;
  assert.equal(entry.via, null);
  assert.equal(entry.peer, null);
});

test('a close that names its own path is used when no open was paired', () => {
  const sup = supervisor();
  sup.onStderr(
    1,
    `2026/11/28 02:00:01 [conn] close peer=${PEER} proto=tcp port=13080 service=forward duration=1s via=direct:10.0.0.9:4099`,
  );

  assert.equal(sup.snapshot().recent[0].via, 'direct:10.0.0.9:4099');
});
