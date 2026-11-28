// The section is hand-written React.createElement code that only ever runs in a
// browser, so nothing in the suite exercised it. This renders it with a hook
// runtime that mirrors React's contract on the paths the section uses (state
// cells keyed by hook order, effects re-run only when their dependencies
// change), against the snapshot shape the Host documents in CONTRACT.md. It
// proves the page mounts with a snapshot, refuses to grow its own scroll area,
// and keeps the diagnostics folded — not that it looks right.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NS, applyPlugin, flush } from './helpers/client-harness.mjs';

const snapshot = {
  ok: true,
  plugin: { name: '@ds-hu/dsh-tailcat-remote', version: '0.2.0' },
  now: '2026-11-24T16:22:50.998Z',
  web: { protocol: 'http:', port: 3080 },
  surface: { profile: 'web' },
  config: { binaryPath: 'tailcat', port: 13080, listen: 'socket', addressMode: 'stable' },
  door: {
    phase: 'listening',
    listening: true,
    mode: 'socket',
    socketPath: '/home/you/.dsh/tailcat-remote.sock',
    port: null,
    target: { host: '127.0.0.1', port: 3080 },
    lastError: null,
  },
  tailcat: {
    phase: 'online',
    desired: true,
    address: 'tc0123456789abcdef',
    keyMode: 'saved',
    keyName: 'dsh-tailcat',
    addressMode: 'stable',
    port: 13080,
    listen: 'socket',
    endpoint: { mode: 'socket', socketPath: '/home/you/.dsh/tailcat-remote.sock' },
    region: { id: 304, name: 'Tokyo' },
    binary: { requested: 'tailcat', resolved: '/usr/local/bin/tailcat', source: 'path', version: 'v0.8.0', error: null },
    restarts: 0,
    lastError: null,
    lastExit: null,
    warnings: [],
    stderrTail: [],
    recent: [
      {
        kind: 'connection',
        peer: 'nodekey:12815ee7aabbccdd0d48',
        protocol: 'tcp',
        port: 13080,
        service: 'forward',
        via: 'direct:192.168.1.3:51352',
        durationMs: 8104,
        at: '2026-11-24T16:27:43.000Z',
      },
    ],
    refusals: 0,
    startedAt: '2026-11-24T16:22:00.000Z',
    onlineAt: '2026-11-24T16:22:02.000Z',
    nextRestartAt: null,
  },
  installer: {
    supported: true,
    method: 'archive',
    platform: 'linux',
    arch: 'x64',
    version: '0.8.0',
    installed: false,
    installedVersion: null,
    installedAt: null,
    source: null,
    binaryPath: '/home/you/.dsh/tailcat-remote/bin/tailcat',
    asset: 'tailcat_0.8.0_linux_amd64.tar.gz',
    command: null,
    manualUrl: 'https://github.com/tailscale/tailcat#install',
    busy: false,
    phase: 'idle',
    progress: null,
    error: null,
    system: { status: 'found', path: '/usr/local/bin/tailcat', version: 'v0.8.0', compatible: true, checkedAt: '2026-11-24T16:22:01.000Z' },
  },
  devices: { allow: [], enforced: false, count: 0, file: '/home/you/.dsh/tailcat-remote/devices.json', updatedAt: null, warnings: [] },
  preferences: { sidebarEntry: true, file: '/home/you/.dsh/tailcat-remote/preferences.json', updatedAt: null, warnings: [] },
  pairing: {
    address: 'tc0123456789abcdef',
    port: 13080,
    localPort: 18080,
    command: 'tailcat forward tc0123456789abcdef 18080:13080',
    qr: { version: 1, size: 2, rows: ['10', '01'] },
  },
  safety: { allowListEnforced: false, rotateRevokesBrowserSessions: false },
};

/** Builds the module table's `react` plus a driver for one render tree. */
function createReact() {
  const hooks = { order: 0, cells: [], effects: [], dirty: false };
  const sameDeps = (left, right) =>
    left.length === right.length && left.every((dep, index) => Object.is(dep, right[index]));
  const cell = (at, make) => {
    if (!hooks.cells[at]) hooks.cells[at] = make();
    return hooks.cells[at];
  };

  const react = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children };
    },
    useState(initial) {
      const at = hooks.order++;
      const box = cell(at, () => ({ value: typeof initial === 'function' ? initial() : initial }));
      const set = (next) => {
        const value = typeof next === 'function' ? next(box.value) : next;
        if (Object.is(value, box.value)) return;
        box.value = value;
        hooks.dirty = true;
      };
      return [box.value, set];
    },
    useCallback(callback, deps) {
      const box = cell(hooks.order++, () => ({ callback, deps: null }));
      if (box.deps === null || !sameDeps(box.deps, deps ?? [])) {
        box.callback = callback;
        box.deps = deps ?? [];
      }
      return box.callback;
    },
    useMemo(factory, deps) {
      const box = cell(hooks.order++, () => ({ value: undefined, deps: null }));
      if (box.deps === null || !sameDeps(box.deps, deps ?? [])) {
        box.value = factory();
        box.deps = deps ?? [];
      }
      return box.value;
    },
    useEffect(callback, deps) {
      const box = cell(hooks.order++, () => ({ deps: null }));
      if (box.deps !== null && sameDeps(box.deps, deps ?? [])) return;
      box.deps = deps ?? [];
      hooks.effects.push(callback);
    },
  };

  return { react, hooks };
}

/**
 * Renders a component until its state settles, running pending effects between
 * passes. Throws rather than looping forever on a component that keeps setting
 * state.
 */
async function render(component, props, hooks) {
  let tree;
  for (let pass = 0; pass < 12; pass += 1) {
    hooks.order = 0;
    hooks.effects = [];
    hooks.dirty = false;
    tree = component(props);
    for (const effect of hooks.effects) effect();
    await new Promise((resolve) => setImmediate(resolve));
    if (!hooks.dirty) return tree;
  }
  throw new Error('the section did not settle after 12 render passes');
}

/** Flattens one render tree into the text, tags, class names and open blocks. */
function inspect(tree) {
  const text = [];
  const tags = [];
  const classNames = [];
  const opened = [];
  const visit = (node) => {
    if (node === null || node === undefined || node === false) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === 'string' || typeof node === 'number') {
      text.push(String(node));
      return;
    }
    if (typeof node.type === 'function') {
      // The driver only renders the section itself; its inner components have
      // no hooks of their own, so evaluating them here completes the tree.
      const children = node.children.length === 0 ? undefined : node.children.length === 1 ? node.children[0] : node.children;
      visit(node.type({ ...node.props, children }));
      return;
    }
    tags.push(node.type);
    classNames.push(node.props?.className ?? '');
    if (node.type === 'details') opened.push(node.props?.open === true);
    (node.children ?? []).forEach(visit);
  };
  visit(tree);
  return { text: text.join('\n'), tags, classNames, opened };
}

/** Applies the plugin, then renders the registered section against `respond`. */
async function renderSection(respond) {
  const { react, hooks } = createReact();
  const face = applyPlugin({ react, fetch: respond });
  const section = face.registrations.find(({ options }) => options.name === 'settings.section');
  const t = face.translator(NS);

  const previous = {
    fetch: globalThis.fetch,
    document: globalThis.document,
    setInterval: globalThis.setInterval,
  };
  globalThis.fetch = respond;
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  globalThis.setInterval = () => 1;
  try {
    const tree = await render(section.component, { t }, hooks);
    return inspect(tree);
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    globalThis.setInterval = previous.setInterval;
  }
}

const okResponse = (body) => async () => ({ ok: true, status: 200, json: async () => body });

/** Renders the page that the sidebar row selects, which wraps the section. */
async function renderPage(respond) {
  const { react, hooks } = createReact();
  const face = applyPlugin({ react, fetch: respond });
  await flush();
  const page = face.registrations.find(({ options }) => options.name === 'main');
  assert.ok(page, 'the page is registered whether or not the shortcut row is on');
  const t = face.translator(NS);

  const previous = {
    fetch: globalThis.fetch,
    document: globalThis.document,
    setInterval: globalThis.setInterval,
  };
  globalThis.fetch = respond;
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  globalThis.setInterval = () => 1;
  try {
    const tree = await render(page.component, { t }, hooks);
    return inspect(tree);
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    globalThis.setInterval = previous.setInterval;
  }
}

test('the section renders the pairing flow with diagnostics folded', async () => {
  const view = await renderSection(okResponse(snapshot));

  assert.ok(view.text.includes('远程访问'), 'the section carries its own heading');
  assert.ok(view.text.includes('配对这台 Harness'), 'pairing is above the fold');
  assert.ok(view.text.includes('本机 Harness'), 'the wire names this end of the tunnel');
  assert.ok(view.text.includes('客户端设备'), 'the wire names the paired end');
  assert.ok(view.text.includes('运行中'), 'the wire carries the live phase');
  assert.ok(view.classNames.includes('tcr-hero'), 'the status reads as a hero plate');
  assert.ok(view.classNames.includes('tcr-wire'), 'the wire between the two ends renders');
  assert.equal(view.classNames.includes('tcr-chip'), true, 'the wire chips name the relay and the door');
  assert.ok(view.text.includes('中继区域 Tokyo (304)'), 'the relay region is visible without opening diagnostics');
  assert.ok(view.text.includes('Unix socket'), 'the door mode is visible without opening diagnostics');
  assert.ok(view.text.includes('界面'), 'the interface card owns the page-level switches');
  assert.ok(view.text.includes('在侧边栏显示入口'), 'the sidebar shortcut is switchable from the page');
  assert.ok(view.classNames.some((name) => name.includes('tcr-switch')), 'the preference renders as a real switch');
  assert.ok(view.classNames.some((name) => name.includes('tcr-switch-on')), 'the stored on state shows as on');
  assert.ok(view.text.includes('安全'), 'the allow-list card renders');
  assert.ok(view.text.includes('状态与诊断'), 'diagnostics render as a summary');
  assert.ok(view.text.includes('最近连接'), 'connection history renders as a summary');
  assert.ok(view.text.includes('运行环境'), 'diagnostics name the running profile');
  assert.ok(view.text.includes('Web'), 'the web profile reads as Web, not as a raw id');
  assert.equal(view.tags.filter((tag) => tag === 'details').length, 2, 'both detail blocks start folded');
  assert.deepEqual(view.opened, [false, false], 'neither detail block opens on its own');
  assert.equal(
    view.classNames.some((name) => name.includes('tcr-qr-wrap')),
    false,
    'the QR code stays opt-in',
  );
  assert.equal(view.classNames.includes('tcr-page'), false, 'the section itself still owns no page frame');
  assert.equal(view.classNames.some((name) => name.includes('tcr-surface-badge')), false, 'no desktop badge on web');
});

test('the desktop profile keeps its badge and tray note', async () => {
  const view = await renderSection(okResponse({ ...snapshot, surface: { profile: 'desktop' } }));

  assert.ok(view.text.includes('桌面版'), 'the heading badges the desktop profile');
  assert.ok(view.text.includes('系统托盘'), 'the tray lifetime stays explained under the heading');
});

test('the section owns no page frame: the dialog owns height and scrolling', async () => {
  const view = await renderSection(okResponse(snapshot));

  assert.equal(view.tags[0], 'section', 'the root is the section itself, not a page');
  assert.equal(view.classNames[0], 'tcr-section');
  assert.equal(view.tags[1], 'style', 'the section stylesheet rides inside it');
  assert.equal(
    view.classNames.some((name) => name.includes('tcr-page')),
    false,
    'a page-level scroll container would nest a second scrollbar inside the dialog',
  );
});

test('the interface switch follows the stored preference', async () => {
  const view = await renderSection(
    okResponse({ ...snapshot, preferences: { ...snapshot.preferences, sidebarEntry: false } }),
  );

  assert.ok(view.classNames.some((name) => name.includes('tcr-switch')), 'the switch is always rendered');
  assert.equal(view.classNames.some((name) => name.includes('tcr-switch-on')), false, 'an off preference renders an off switch');
  assert.ok(view.text.includes('在侧边栏显示入口'));
});

test('the page behind the sidebar row owns the scroll the section refuses', async () => {
  const view = await renderPage(okResponse(snapshot));

  assert.equal(view.tags[0], 'div', 'the page is a plain container, not a second section');
  assert.equal(view.classNames[0], 'tcr-page', 'the page-level scroll lives here');
  assert.ok(view.classNames.includes('tcr-page-inner'), 'the page centres its content column');
  assert.ok(view.classNames.includes('tcr-section'), 'the page wraps the same section the dialog shows');
  assert.ok(view.text.includes('远程访问'), 'the page and the section share a heading');
});

test('a failing read renders the unavailable alert instead of a blank section', async () => {
  const view = await renderSection(async () => {
    throw new Error('sidecar unreachable');
  });

  assert.ok(view.text.includes('远程访问不可用'));
  assert.ok(view.text.includes('sidecar unreachable'), 'the underlying error stays visible');
  assert.ok(view.text.includes('重试'));
});

test('the first paint shows the reading state before any snapshot arrives', async () => {
  const view = await renderSection(() => new Promise(() => {}));

  assert.ok(view.text.includes('正在读取远程访问状态…'));
  assert.equal(view.text.includes('配对这台 Harness'), false);
});
