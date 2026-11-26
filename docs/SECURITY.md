# 安全说明

远程访问把一个本来只对本机开放的 Web GUI 交给 tailcat 隧道。它没有改变 DSH 的登录模型，但确实扩大了可达范围。这份文档说明信任边界、已知限制和推荐配置。

## 信任边界

```
不可信网络
   │  只知道 tailcat 地址，或地址 + 未授权设备密钥
   ▼
tailcat DERP / 直连（加密）
   │
   ▼
tailcat serve（本机进程）
   │  13080 → Unix socket 0600（Windows 默认回环 TCP）
   ▼
Door ──► DSH Connection（cookie、Host、Origin、owner）
   │
   ▼
DSH Web / API / WebSocket
```

- **Door 不是公网监听。** 默认只创建 `$DSH_HOME/tailcat-remote.sock`（0600），本机其他用户不能连接；同用户的本地进程可以连接，这是本机进程信任模型的自然结果。
- **tailcat 是唯一的隧道入口。** Linux/macOS 上插件不打开 TCP 端口；Windows 上 tailcat 不支持 Unix socket 目标，door 绑定 `127.0.0.1` 的 TCP 端口，仍不对局域网开放。只有 `tailcat serve` 能把虚拟端口 13080 映射到 door。
- **鉴权仍由 DSH 负责。** Door 不做自己的账号体系，也不把 remote 标成 owner；它让 DSH 对远程请求执行同一套 `requestRejection` / cookie 判断。
- **地址是一份凭据。** tailcat 地址本身足以建立隧道；没有设备白名单时，拿到地址就能到达 DSH 登录入口，再由 DSH 的 cookie 机制决定会话。地址应当按密码对待。

## 首次访问如何变成登录

远程浏览器第一次打开 `http://127.0.0.1:18080/` 时没有 DSH cookie。Door 只在这个精确时刻调用 DSH 的 `authorizeIndex`，后者用 Host 进程持有的一次性 token 签发一个绑定 `127.0.0.1:18080` 的 HttpOnly cookie，并回 303 到 `./`。token 不出现在远程 URL 里。

副作用是：**能在 tailcat 上到达 door 的客户端，会自动获得一个 DSH 浏览器会话**。这正是“有地址就能访问、不用输入 token”的设计目标，也意味着地址泄露等于会话泄露。设备白名单是限制这一点的机制。

## 设备白名单

默认关闭，面板会显示红色警告。添加至少一个客户端公钥后，tailcat 以 `--allow=…` 启动，不在列表中的客户端在握手阶段被拒绝，door 根本收不到请求。

在客户端生成身份：

```sh
tailcat genkey --client --key=client-default
```

命令会打印一行 `nodekey:…` 公钥；把它粘进面板的“允许的客户端公钥”，保存并应用。私钥留在客户端，不要发到 Host。

白名单保存在 `$DSH_HOME/tailcat-remote/devices.json`，0600，原子替换。损坏时插件回退到“仅地址”模式并在面板给出警告；这是一次可用性优先的降级，发现警告后应立即修复。

## 地址轮换

“更换地址”会覆盖保存的 tailcat 服务器密钥、重启隧道，使旧地址立即失效。它**不会**撤销已经签发的 DSH 浏览器 cookie：DSH 没有对外的“撤销这个 cookie”接口，插件也不伪造一个。旧浏览器会一直持有会话，直到 cookie 到期或对应的浏览器会话记录被清除。

如果地址已经泄露，正确顺序是：

1. 在面板更换地址；
2. 在 DSH 的会话/凭据管理里撤销旧会话（如果当前版本提供该入口）；
3. 检查白名单，必要时先加白名单再分享新地址。

只做第 1 步不足以让已拿到 cookie 的攻击者下线。

## 受管安装的信任边界

“一键安装”不是静默更新，也不是把第三方二进制塞进 npm 包。它的信任链如下：

- **只在用户点击时联网。** 插件没有 postinstall 脚本，不会在后台下载；安装动作必须在面板点击，或在已认证的 owner API 上显式调用 `install`。
- **Linux / Windows：** 从 `https://github.com/tailscale/tailcat/releases/tag/v0.8.0` 下载与当前 `process.platform`/`process.arch` 对应的官方资产，并从同一个 release 读取 `checksums.txt`。下载完成后先校验 SHA-256，校验不通过就删除临时文件并保留旧版本。HTTPS 保护传输，校验值保护下载完整性；如果上游 release 本身被攻破，校验值也会一起被改，插件无法提供超过上游的保证。
- **macOS：** 先执行 `brew update`，再通过 Homebrew 安装/升级 `tailcat` formula；信任 Homebrew 的 formula、bottle 或源码构建链。没有 Homebrew 时不会尝试其他来源，而是提示手动安装。
- **用户已有的 tailcat：** 检测和正常启动只读取、探测 `PATH`、Homebrew 前缀等常见位置，不移动、不覆盖、不升级。检测到 0.8.0 或更新的系统版本时，面板不再显示下载按钮；更旧的版本会被标为不兼容。只有用户点击安装后，macOS 才会通过 Homebrew 升级过旧的系统 formula（因为 macOS 没有官方静态二进制），Linux/Windows 则新建受管副本、不动系统安装。
- **写入位置：** 受管可执行文件固定在 `$DSH_HOME/tailcat-remote/bin/tailcat`（Windows 为 `tailcat.exe`），模式 0755；临时下载目录权限 0700；元数据 `tailcat.json` 权限 0600；替换采用同目录备份 + 原子 rename。系统 `PATH` 不会被修改，也不会向系统目录写入任何文件。
- **执行权限：** 受管 tailcat 与 Host 使用同一个 OS 用户运行，因此拥有该用户的权限。不要把 `binaryPath` 指向可被其他用户写入的路径。

受管安装的 tailcat 遵循上游 BSD-3-Clause 许可，归属见 [NOTICE](../NOTICE)。

## 已知限制

- **Door 只支持明文 HTTP 的 Web listener。** 如果 DSH 配置了 TLS，插件拒绝启动 door（`door-tls-unsupported`）。原因是没有可重放的 `Set-Cookie` 语义：远程客户端看到的是 `http://127.0.0.1:18080`，把 `Secure` cookie 直接搬过去会失效。要在 TLS 场景使用，应让 tailcat 映射到一个明确终止 TLS 的反向代理，并单独评估 cookie 属性；当前版本不提供这个模式。
- **`listen: tcp` 会扩大本机可达面。** 绑定 `127.0.0.1` 后，本机任何进程都能访问 door；Unix socket 0600 是 Linux/macOS 的默认值。Windows 因 tailcat 不支持 Unix socket 目标而默认 tcp；不要把该端口转发到局域网。
- **tailcat 自身的信任假设。** 插件信任 tailcat 二进制、它的 DERP map、本机代理配置和本机用户环境。请从可信来源安装 tailcat，并保持更新；Unix-socket door 和 `--log` 需要 tailcat 0.8.0 或更新。
- **访问日志是诊断数据。** `--log` 会记录 peer 公钥前缀/后缀、端口、路径和时长；插件对地址和完整 nodekey 做脱敏，但日志仍可能透露连接时间与设备数量。关闭 `logAccess` 可减少记录。
- **二维码等同地址。** 二维码只编码 tailcat 地址；截图、投屏或转发二维码与转发地址等价。面板默认遮罩地址，但这只是防肩窥展示，不是加密：复制、二维码和 DevTools 仍能得到真实值。
- **本插件没有经过独立安全审计。** 它复用 DSH 的认证路径，但没有形式化验证。

## 推荐配置

1. Linux/macOS 保持默认的 Unix socket door；Windows 使用默认的 `127.0.0.1` TCP door。不要直接暴露 3080，也不要把 door 端口转发到局域网。
2. 在分享地址前添加至少一个设备公钥；面板的红色警告消失后再继续。
3. 用 `stable` 地址模式；需要轮换时用面板按钮，不要手改密钥文件。
4. 不要把地址、二维码或带 `nodekey:` 的日志贴到公开 issue；需要贴日志时先脱敏。
5. 优先使用面板的受管安装，或只从官方发行版/可信包管理器安装 tailcat；安装后在诊断区核对来源、版本和路径。
6. 在不再需要远程访问时，在面板停止隧道，或停用插件。

## 报告问题

发现安全问题请通过 GitHub Security Advisory 私下报告：

<https://github.com/ds-hu/dsh-tailcat-remote/security/advisories/new>

不要在公开 issue 中附带真实地址、私钥或 cookie。
