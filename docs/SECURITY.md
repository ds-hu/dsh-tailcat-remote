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
   │  13080 → Unix socket 0600
   ▼
Door ──► DSH Connection（cookie、Host、Origin、owner）
   │
   ▼
DSH Web / API / WebSocket
```

- **Door 不是公网监听。** 默认只创建 `$DSH_HOME/tailcat-remote.sock`（0600），本机其他用户不能连接；同用户的本地进程可以连接，这是本机进程信任模型的自然结果。
- **tailcat 是唯一的入口。** 插件不打开 TCP 端口。只有 `tailcat serve` 能把虚拟端口 13080 映射到 door。
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

## 已知限制

- **Door 只支持明文 HTTP 的 Web listener。** 如果 DSH 配置了 TLS，插件拒绝启动 door（`door-tls-unsupported`）。原因是没有可重放的 `Set-Cookie` 语义：远程客户端看到的是 `http://127.0.0.1:18080`，把 `Secure` cookie 直接搬过去会失效。要在 TLS 场景使用，应让 tailcat 映射到一个明确终止 TLS 的反向代理，并单独评估 cookie 属性；当前版本不提供这个模式。
- **`listen: tcp` 会扩大本机可达面。** 绑定 `127.0.0.1` 后，本机任何进程都能访问 door；Unix socket 0600 是默认值。除非 Unix socket 不可用，不要改成 tcp。
- **tailcat 自身的信任假设。** 插件信任 tailcat 二进制、它的 DERP map、本机代理配置和本机用户环境。请从可信来源安装 tailcat，并保持更新。
- **访问日志是诊断数据。** `--log` 会记录 peer 公钥前缀/后缀、端口、路径和时长；插件对地址和完整 nodekey 做脱敏，但日志仍可能透露连接时间与设备数量。关闭 `logAccess` 可减少记录。
- **二维码等同地址。** 二维码只编码 tailcat 地址；截图、投屏或转发二维码与转发地址等价。
- **本插件没有经过独立安全审计。** 它复用 DSH 的认证路径，但没有形式化验证。

## 推荐配置

1. 保持默认的 Unix socket door，不要直接暴露 3080。
2. 在分享地址前添加至少一个设备公钥；面板的红色警告消失后再继续。
3. 用 `stable` 地址模式；需要轮换时用面板按钮，不要手改密钥文件。
4. 不要把地址、二维码或带 `nodekey:` 的日志贴到公开 issue；需要贴日志时先脱敏。
5. 只从官方发行版或可信包管理器安装 tailcat。
6. 在不再需要远程访问时，在面板停止隧道，或停用插件。

## 报告问题

发现安全问题请通过 GitHub Security Advisory 私下报告：

<https://github.com/ds-hu/dsh-tailcat-remote/security/advisories/new>

不要在公开 issue 中附带真实地址、私钥或 cookie。
