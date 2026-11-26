<p align="center">
  <img src="icon.svg" width="88" alt="Remote Access: a cat-eared keyhole">
</p>

<h1 align="center">Remote Access</h1>

<p align="center">
  <strong>Reach DeepSeek Harness from any network through tailcat — no public port, no inbound firewall change.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ds-hu/dsh-tailcat-remote"><img alt="npm" src="https://img.shields.io/npm/v/@ds-hu/dsh-tailcat-remote?color=0F766E"></a>
  <a href="https://github.com/ds-hu/dsh-tailcat-remote/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/ds-hu/dsh-tailcat-remote/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-0F766E"></a>
  <a href="README.md">中文</a>
</p>

---

## What it is

DeepSeek Harness listens on the local machine by default. Opening the same GUI from a laptop, phone, or another computer usually means a public port, port forwarding, or a reverse proxy.

Remote Access folds that into one plugin. The Host supervises a `tailcat` process and a tailnet-only local door. The client needs a tailcat address and one command.

<p align="center">
  <img src="docs/screenshots/01-pairing.png" alt="Remote Access page: a running tunnel, the tailcat address, QR code, client command, and three usage steps" width="820">
</p>

## What you get

- **One address across networks.** No public port. tailcat uses a DERP relay or a direct path, and the browser finally talks to the client's own `127.0.0.1`.
- **Scan or copy to pair.** The page shows the address, a QR code, and the exact `tailcat forward …` command, with the three steps beside them.
- **A key allow-list.** The address is the only credential by default. Add client public keys and unauthorized devices are refused during the tailcat handshake.
- **Rotate the address, manage the process.** Start, stop, restart, and rotate from the sidebar; inspect the relay region, recent connections, refusals, and errors.
- **Log in once.** The first remote visit runs the normal DSH login flow and then keeps an HttpOnly cookie. The token never appears in the remote URL.
- **The same page locally and remotely.** The panel works through DSH's owner API, so both views behave alike.

<p align="center">
  <img src="docs/screenshots/02-security.png" alt="Security section: the red address-is-the-key warning, client public-key allow-list, and two-step address rotation" width="820">
</p>

## Install

Add the plugin to the web profile:

```sh
dsh plugin --profile web add @ds-hu/dsh-tailcat-remote
```

List the package in the profile's `dsh.profile.bundles`, then restart `dsh web`:

```json
{
  "dsh": {
    "profile": {
      "bundles": ["…", "@ds-hu/dsh-tailcat-remote"]
    }
  }
}
```

Installing the bundle from **Plugin Manager** has the same effect.

### tailcat installation is managed

Restart `dsh web` and open **Remote Access**. If the Host has no tailcat, the page shows an install card:

- **Linux / Windows:** click **Install tailcat**. The plugin selects the official tailcat v0.8.0 asset for `process.arch`, downloads it, verifies its SHA-256 against the official `checksums.txt`, and extracts it to `$DSH_HOME/tailcat-remote/bin/`. The system `PATH` is not modified.
- **macOS:** if Homebrew is available, the same button updates Homebrew and installs/upgrades tailcat (0.8.0 or newer), then copies the executable into the managed directory. Intel Macs have no bottle, so Homebrew builds from source and can take several minutes. Without Homebrew, the page shows a clear message and a manual-install link.
- **Your own tailcat:** on startup the plugin checks `PATH` and common package locations (`/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, and so on). It uses an existing install directly and never downloads over it. The diagnostics section shows the executable's source and version.
- **Other platforms or architectures:** install tailcat manually (0.8.0 or newer) from [the upstream instructions](https://github.com/tailscale/tailcat#install), then point `binaryPath` at it. `binaryPath` takes precedence over the managed copy.

<p align="center">
  <img src="docs/screenshots/03-install.png" alt="Install card shown when tailcat is missing: detection, method, checksum note, and the one-click button" width="820">
</p>

The managed install only runs after you click the button: there is no background download and no per-platform binary payload in the npm package.

> Automatic installation covers the **Host-side** tailcat server only. The client device still needs its own tailcat to run `tailcat forward`; this plugin does not include a client program.

## Use

1. Restart Harness and open **Remote Access** in the sidebar.
2. If the page reports a missing tailcat, click **Install tailcat** first; otherwise wait for **Online** and the address. The first start creates a saved key and probes a DERP region, which can take a minute.
3. On the client device, install tailcat and run the command shown on the page, or scan the QR code for the address:

   ```sh
   tailcat forward tc… 18080:13080
   ```

4. Open `http://127.0.0.1:18080/` in the client browser. The first visit completes DSH login; later visits go straight in.
5. Before sharing the address, add at least one client public key in **Security**.

## Security

The tailcat address is a credential. In address-only mode, anyone who has it can reach the DSH login entry and receive a browser session bound to the remote authority.

- Pair the address with a key allow-list: run `tailcat genkey --client --key=client-default` on the client and add the printed public key on the page.
- Rotating the address invalidates the old one immediately. Browsers that already hold a DSH cookie are not signed out; use DSH's session management for that.
- Do not expose port 3080 directly. The plugin lets tailcat reach a single 0600 Unix-socket door and opens no public listener.
- If the Web listener uses HTTPS, the door refuses to start; this version does not replay cookies behind TLS.

The full threat model, limitations, and checklist are in [Security](docs/SECURITY.md).

## Docs

- [Technical notes](docs/TECHNICAL.md): door, supervisor, request path, lifecycle, failure modes.
- [Host ↔ panel contract](docs/CONTRACT.md): JSON API, state fields, error codes.
- [Security](docs/SECURITY.md): trust boundaries, credentials, rotation, limitations.
- [NOTICE](NOTICE): qrcode-generator and tailcat attribution.

## License

MIT — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
