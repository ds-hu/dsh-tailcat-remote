# Host ↔ 面板契约

面板只依赖一个 JSON 路由。它是 owner-only 的 DSH Fetch 路由；非 owner 在到达这里之前就被 DSH 的 Connection 层拒绝，所以插件不重复做身份判断。

- 路径：`/api/tailcat-remote`（精确匹配）
- 方法：`GET`、`POST`
- 请求体：`POST` 为 JSON，最大 64 KiB
- 响应：`application/json; charset=utf-8`，`cache-control: no-store`
- 失败：HTTP 4xx/5xx + `{ "ok": false, "error": { "code", "message" } }`

## GET

读取一份完整快照，不改状态。

```json
{
  "ok": true,
  "plugin": { "name": "@ds-hu/dsh-tailcat-remote", "version": "0.1.2" },
  "now": "2026-11-24T16:22:50.998Z",
  "web": { "protocol": "http:", "port": 3080 },
  "config": {
    "binaryPath": "tailcat",
    "port": 13080,
    "listen": "socket",
    "keyName": "dsh-tailcat",
    "addressMode": "stable",
    "autoStart": true,
    "logAccess": true,
    "restartEnabled": true,
    "maxRestartAttempts": 10,
    "restartBaseDelayMs": 500,
    "restartMaxDelayMs": 30000,
    "customDerpMap": false
  },
  "door": {
    "phase": "listening",
    "listening": true,
    "mode": "socket",
    "socketPath": "/home/you/.dsh/tailcat-remote.sock",
    "port": null,
    "target": { "host": "127.0.0.1", "port": 3080 },
    "lastError": null
  },
  "tailcat": {
    "phase": "online",
    "desired": true,
    "address": "tc…",
    "keyMode": "saved",
    "keyName": "dsh-tailcat",
    "addressMode": "stable",
    "port": 13080,
    "listen": "socket",
    "endpoint": { "mode": "socket", "socketPath": "/home/you/.dsh/tailcat-remote.sock" },
    "region": { "id": 304, "name": "Tokyo" },
    "binary": { "requested": "tailcat", "resolved": "/usr/local/bin/tailcat", "source": "path", "version": "v0.8.0", "error": null },
    "restarts": 0,
    "lastError": null,
    "lastExit": null,
    "warnings": [],
    "stderrTail": ["# Selected bootstrap relay region 304, Tokyo"],
    "recent": [
      {
        "kind": "connection",
        "peer": "nodekey:12815ee7…0d48",
        "protocol": "tcp",
        "port": 13080,
        "service": "forward",
        "via": "direct:192.168.1.3:51352",
        "durationMs": 8104,
        "at": "2026-11-24T16:27:43.000Z"
      }
    ],
    "refusals": 0,
    "startedAt": "2026-11-24T16:22:00.000Z",
    "onlineAt": "2026-11-24T16:22:02.000Z",
    "nextRestartAt": null
  },
  "installer": {
    "supported": true,
    "method": "archive",
    "platform": "linux",
    "arch": "x64",
    "version": "0.8.0",
    "installed": false,
    "installedVersion": null,
    "installedAt": null,
    "source": null,
    "binaryPath": "/home/you/.dsh/tailcat-remote/bin/tailcat",
    "asset": "tailcat_0.8.0_linux_amd64.tar.gz",
    "command": null,
    "manualUrl": "https://github.com/tailscale/tailcat#install",
    "busy": false,
    "phase": "idle",
    "progress": null,
    "error": null,
    "system": {
      "status": "found",
      "path": "/usr/local/bin/tailcat",
      "version": "v0.8.0",
      "compatible": true,
      "checkedAt": "2026-11-24T16:22:01.000Z"
    }
  },
  "devices": {
    "allow": [],
    "enforced": false,
    "count": 0,
    "file": "/home/you/.dsh/tailcat-remote/devices.json",
    "updatedAt": null,
    "warnings": []
  },
  "pairing": {
    "address": "tc…",
    "port": 13080,
    "localPort": 18080,
    "command": "tailcat forward tc… 18080:13080",
    "qr": { "version": 8, "size": 49, "rows": ["111111100…"] }
  },
  "safety": { "allowListEnforced": false, "rotateRevokesBrowserSessions": false }
}
```

`pairing` 在地址尚未产生时为 `null`。`tailcat.address` 与 `pairing.address` 相同；后者附带命令与二维码矩阵。面板默认把地址、以及客户端命令中的地址显示为 `****`，点“显示地址”才展开；快照和复制仍携带完整值。`stderrTail` 已脱敏并截断，仅用于诊断。

`tailcat.phase` 的取值：`stopped`、`starting`、`online`、`stopping`、`restarting`、`error`。

`tailcat.binary.source` 的取值：`managed`（受管安装）、`path`（PATH 或常见安装位置）、`config`（显式 `binaryPath`）。

`installer` 是安装器的只读状态：

- `system.status`：`checking`、`found`、`missing`。`found` 表示用户已经装了 tailcat，插件会直接使用；
- `system.compatible`：`true`/`false`/`null`。`false` 表示检测到的版本低于 0.8.0（缺少 Unix-socket serve / `--log` 等本插件依赖的能力），面板会改为提供受管安装；
- `supported` / `method`：当前平台是否能自动安装，`archive` 或 `brew`；
- `phase`：`idle`、`starting`、`checksums`、`downloading`、`verifying`、`extracting`、`installing`、`homebrew`、`done`、`error`；
- `progress`：下载时的 `{ phase, received, total, percent }`，其余阶段为 `null`；
- `installed` 表示受管目录里已有可执行文件，不代表系统检测结果。

## POST

请求体必须包含 `action`。动作串行执行；`start` 会先确保 door 可用。

| action | 额外字段 | 行为 | 成功后的额外状态 |
| --- | --- | --- | --- |
| `start` | — | 启动 tailcat；已停止时重建进程 | `tailcat.desired: true` |
| `stop` | — | 停止 tailcat，保留 door | `tailcat.phase: "stopped"`，地址清空 |
| `restart` | — | 停掉再用当前配置启动；地址通常不变 | 新进程、`restarts` 递增 |
| `rotate` | — | 覆盖保存密钥、重启、等新地址上线 | `tailcat.address` 改变，旧地址失效 |
| `devices` | `allow: string[]` | 规范化并持久化白名单；运行中的 tailcat 会重启以应用 | `devices.enforced` / `count` 更新 |
| `install` | `force?: boolean` | 安装受管 tailcat。默认会跳过已有受管副本；`force` 强制重新安装。隧道若在运行会短暂停止，成功后按原状态恢复 | `installer.*` 与 `tailcat.binary.source` 更新 |

示例：

```json
{ "action": "devices", "allow": ["nodekey:…64 hex…"] }
{ "action": "install", "force": true }
```

`allow: []` 表示仅凭地址访问；非空数组会变成 `tailcat serve --allow=…`。

成功响应是 `{ "ok": true, ...snapshot }`，与 GET 同形，面板直接用它替换本地状态。

### 错误码

| HTTP | code | 场景 |
| --- | --- | --- |
| 400 | `invalid-json` | 请求体不是 JSON |
| 400 | `unknown-action` | 未知 action |
| 400 | `invalid-device-key` / `invalid-device-list` | 公钥格式不对或 `allow` 不是数组 |
| 409 | `door-in-use` / `door-path-occupied` | door socket 被另一个活进程占用，或路径不是 socket |
| 409 | `door-tls-unsupported` | Web listener 是 HTTPS |
| 413 | `body-too-large` | 请求体超过 64 KiB |
| 500 | `internal` | 未预期错误 |
| 400 | `tailcat-platform-unsupported` | 当前 OS/架构没有自动安装目标 |
| 409 | `tailcat-binary-overridden` | `binaryPath` 是显式路径，受管安装不会生效 |
| 502 | `tailcat-download-failed` / `tailcat-checksum-*` / `tailcat-archive-invalid` | 下载、校验或解压失败 |
| 503 | `tailcat-not-found` / `tailcat-spawn-failed` | tailcat 找不到或无法启动 |
| 503 | `tailcat-brew-missing` / `tailcat-extract-unavailable` | macOS 没有 Homebrew，或系统没有解压能力 |
| 503 | `tailcat-version-too-old` | 检测到/安装到的 tailcat 低于 0.8.0，缺少本插件依赖的能力 |
| 503 | `door-listen-failed` / `door-socket-missing` | door 未监听或 socket 丢失 |
| 503 | `disposed` | 插件正在卸载 |

`tailcat-not-found` 的 message 会包含 `binaryPath` 与底层解析错误；面板用 `tailcat.binary.resolved === null && tailcat.phase === "error"` 识别安装提示。面板只在 `installer.supported` 为真、没有显式 `binaryPath` 覆盖、且（没有检测到系统 tailcat 或检测到的版本低于 0.8.0）时显示安装按钮；检测到可用的系统 tailcat 时不会再诱导用户下载。

## 兼容性

这是插件内部契约，不承诺跨大版本稳定。客户端与 Host 在同一个包里发布，版本一致；升级时一起升级。白名单文件格式是持久化契约（`version: 1`），需要向后兼容。
