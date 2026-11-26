window.__ModuleLoader__.load({
  id: '@ds-hu/dsh-tailcat-remote',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useState } = React;

    const NS = 'tailcat-remote';
    const API = '/api/tailcat-remote';

    const zh = {
      nav: '远程访问',
      title: '远程访问',
      subtitle: '通过 tailcat 从任意地点访问本 Harness，无需开放公网端口，也无需调整入站防火墙。',
      surfaceDesktop: '桌面版',
      surfaceHint: '桌面版：关闭窗口不会中断远程访问（应用继续在系统托盘运行）；退出桌面应用会断开隧道。',
      refresh: '刷新',
      loading: '正在读取远程访问状态…',
      statusLabel: '隧道',
      statusOnline: '运行中',
      statusStarting: '启动中',
      statusRestarting: '等待重启',
      statusStopping: '停止中',
      statusStopped: '已停止',
      statusError: '异常',
      statusUnknown: '未知',
      start: '启动',
      stop: '停止',
      restart: '重启',
      rotating: '正在更换…',
      rotate: '更换地址',
      rotateArm: '确认更换地址？',
      rotateConfirm: '确认，立即更换',
      cancel: '取消',
      rotateHint: '旧的 tailcat 密钥会被覆盖，隧道重新启动，旧地址立即失效。',
      rotateCaveat: '更换 tailcat 地址不会让已持有 DSH 浏览器会话凭据的浏览器退出登录；这些凭据到期或从浏览器会话记录中移除后才失效。',
      rotateDisconnect: '如果你正通过 tailcat 打开本页，更换、停止或保存设备列表都会断开当前页面；请在本机页面操作，或用新地址重新连接。',
      qrUnavailable: '二维码生成失败，请直接复制上方地址。',
      copy: '复制',
      copied: '已复制',
      copyFailed: '复制失败，请手动选择文本。',
      addressHiddenHint: '地址默认遮罩为 ****；点“显示地址”查看，复制按钮始终复制完整值。',
      showAddress: '显示地址',
      hideAddress: '隐藏地址',
      showQr: '显示二维码',
      hideQr: '隐藏二维码',
      pairingTitle: '配对这台 Harness',
      pairingHint: '把地址带到客户端设备，在那里运行 tailcat forward，然后用该设备的浏览器打开本地地址。',
      addressLabel: 'tailcat 地址',
      openLocal: '打开本地地址',
      localUrlHint: '隧道建立后，这个地址会走一次正常的 DSH 登录流程，之后沿用浏览器会话 Cookie。',
      qrHint: '扫描二维码把地址带到客户端设备。',
      installHint: '插件可以自动安装 tailcat；如果自动安装不可用，也可以从 GitHub Release 手动安装并设置 binaryPath。',
      securityTitle: '安全',
      allowOffTitle: '地址就是唯一的钥匙',
      allowOffBody: '任何拿到 tailcat 地址的人都能访问本 Harness。在下方添加至少一个客户端公钥后，访问才会限制在已配对设备。',
      allowOnTitle: '已限制 {count} 台设备',
      allowOnBody: '不在列表中的客户端会被 tailcat 拒绝。地址仍然需要，但不再足够。',
      devicesLabel: '允许的客户端公钥',
      devicesHint: '每行一个 nodekey。在客户端运行 tailcat genkey --client --key=client-default 创建密钥并打印公钥。',
      devicesPlaceholder: 'nodekey:…',
      devicesSave: '保存并应用',
      devicesReset: '撤销修改',
      devicesSaved: '设备列表已保存，tailcat 已重启生效。',
      devicesEmpty: '还没有设备密钥，当前仅凭地址访问。',
      deviceCount: '{count} 台已授权',
      devicesGenerate: '在客户端设备生成密钥：',
      diagnosticsTitle: '状态与诊断',
      diagPhase: '状态',
      diagSurface: '运行环境',
      diagAddressMode: '密钥模式',
      diagKeyName: '密钥名',
      diagVersion: 'tailcat 版本',
      diagBinary: '可执行文件',
      diagRegion: '中继区域',
      diagRestarts: '自动重启',
      diagDoor: '门',
      diagTarget: '转发目标',
      diagLastError: '最近错误',
      diagWarnings: '警告',
      recentTitle: '最近连接',
      recentEmpty: '暂无连接记录。',
      recentPeer: '设备',
      recentPort: '端口',
      recentVia: '路径',
      recentDuration: '时长',
      recentTime: '时间',
      errorTitle: '远程访问需要处理',
      retry: '重试',
      unavailableTitle: '远程访问不可用',
      unavailableBody: '插件无法读取控制接口。请刷新页面或查看 Host 日志。',
      sessionExpired: '浏览器会话已过期，请重新打开这次会话的入口地址。',
      setupTitle: '安装 tailcat',
      setupBody: '插件找不到 tailcat 可执行文件。可以一键安装，也可以使用系统已有的 tailcat。',
      setupRetry: '重新检测',
      installMethodDownload: '安装方式：下载官方 {asset}，校验 SHA-256 后解压。',
      installMethodBrew: '安装方式：Homebrew（{command}）。',
      installButton: '一键安装 tailcat',
      installReinstall: '重新安装受管版本',
      installBusy: '正在安装 tailcat…',
      installPhaseChecksums: '正在获取官方 SHA-256 校验值…',
      installPhaseDownload: '正在下载 tailcat…',
      installPhaseVerify: '正在校验下载文件…',
      installPhaseExtract: '正在解压…',
      installPhaseInstall: '正在安装…',
      installPhaseHomebrew: '正在通过 Homebrew 安装 tailcat，这可能需要几分钟…',
      installProgress: '{percent}%（{received} / {total}）',
      installProgressUnknown: '已下载 {received}',
      installFailed: '安装失败',
      installDetected: '已检测到系统 tailcat',
      installDetectedBody: '版本 {version}。插件会直接使用它，不需要重复安装；路径见下方诊断。',
      installChecking: '正在检查系统是否已安装 tailcat…',
      installSystemOutdated: '检测到的 tailcat {version} 缺少本插件需要的能力（需要 0.8.0 或更新）。可以一键安装受管版本，或先升级系统 tailcat。',
      installSystemOutdatedBrew: '检测到的 tailcat {version} 缺少本插件需要的能力（需要 0.8.0 或更新）。点击按钮会通过 Homebrew 升级系统 tailcat，并复制一份到受管目录；也可以先手动升级。',
      installUnsupported: '当前平台 {platform}/{arch} 暂无自动安装。',
      installConfigOverride: 'binaryPath 当前为 {path}。一键安装只会写入受管目录，不会覆盖该配置；请改回 tailcat 或手动安装到该路径。',
      installManual: '手动安装说明',
      installManagedNote: '受管版本位于 {path}，不会修改系统 PATH。',
      diagBinarySource: '可执行文件来源',
      diagInstallSource: 'tailcat 安装',
      sourceManaged: '受管安装',
      sourcePath: '系统 PATH',
      sourceConfig: '配置指定',
      sourceUnavailable: '未检测到',
      noticeInstalled: 'tailcat 已安装。',
      firstRun: '首次启动：tailcat 正在生成保存密钥并向 DERP 中继探测路由，可能需要一分钟。',
      modeStable: '保存密钥（稳定）',
      modeEphemeral: '临时密钥（重启后变化）',
      modeSocket: 'Unix socket',
      modeTcp: '127.0.0.1 TCP',
      busyStart: '正在启动 tailcat…',
      busyStop: '正在停止 tailcat…',
      busyRestart: '正在重启 tailcat…',
      busyRotate: '正在更换地址…',
      busySave: '正在保存设备密钥…',
      noticeStarted: 'tailcat 正在启动。',
      noticeStopped: 'tailcat 已停止。',
      noticeRestarted: 'tailcat 已重启。',
      noticeRotated: '地址已更换，新地址显示在下方。',
      qrAlt: '包含 tailcat 地址的二维码',
      footerNote: 'tailcat 地址即凭据，请只分享给你控制的设备。',
      never: '从未',
      unknown: '未知',
    };

    const en = {
      nav: 'Remote Access',
      title: 'Remote Access',
      subtitle: 'Reach this Harness from anywhere through tailcat — no public port and no inbound firewall change.',
      surfaceDesktop: 'Desktop',
      surfaceHint: 'Desktop: closing the window keeps remote access alive (the app stays in the system tray); quitting the desktop app ends the tunnel.',
      refresh: 'Refresh',
      loading: 'Reading remote-access state…',
      statusLabel: 'Tunnel',
      statusOnline: 'Online',
      statusStarting: 'Starting',
      statusRestarting: 'Restarting',
      statusStopping: 'Stopping',
      statusStopped: 'Stopped',
      statusError: 'Error',
      statusUnknown: 'Unknown',
      start: 'Start',
      stop: 'Stop',
      restart: 'Restart',
      rotating: 'Rotating…',
      rotate: 'Rotate address',
      rotateArm: 'Rotate address?',
      rotateConfirm: 'Yes, rotate now',
      cancel: 'Cancel',
      rotateHint: 'The saved tailcat key is replaced, the tunnel restarts, and the old address stops working immediately.',
      rotateCaveat: 'Rotating the tailcat address does not sign out browsers that already hold a DSH session cookie. Those credentials end when they expire or are removed from the browser-session record.',
      rotateDisconnect: 'If this page is open through tailcat, rotating, stopping, or saving the device list drops the current connection. Use the page on the Host, then reconnect with the new address.',
      qrUnavailable: 'The QR code could not be generated; copy the address above instead.',
      copy: 'Copy',
      copied: 'Copied',
      copyFailed: 'Could not copy; select the text manually.',
      addressHiddenHint: 'The address is masked as **** by default. Choose Show address to reveal it; Copy always copies the full value.',
      showAddress: 'Show address',
      hideAddress: 'Hide address',
      showQr: 'Show QR code',
      hideQr: 'Hide QR code',
      pairingTitle: 'Pair this Harness',
      pairingHint: 'Move the address to the client device, run tailcat forward there, then open the local URL in that device’s browser.',
      addressLabel: 'tailcat address',
      openLocal: 'Open local URL',
      localUrlHint: 'Once the tunnel is up, this URL offers the normal DSH login flow once, then keeps the session cookie.',
      qrHint: 'Scan the QR code to move the address to the client device.',
      installHint: 'The plugin can install tailcat automatically. If that is unavailable, install it from the GitHub release and set binaryPath.',
      securityTitle: 'Security',
      allowOffTitle: 'The address is the only key',
      allowOffBody: 'Anyone who obtains the tailcat address can reach this Harness. Add at least one client public key below to restrict access to paired devices.',
      allowOnTitle: 'Restricted to {count} device(s)',
      allowOnBody: 'tailcat refuses every client whose key is not in this list. The address remains necessary, but it is not sufficient.',
      devicesLabel: 'Allowed client public keys',
      devicesHint: 'One nodekey per line. On the client, run tailcat genkey --client --key=client-default to create a key and print its public key.',
      devicesPlaceholder: 'nodekey:…',
      devicesSave: 'Save and apply',
      devicesReset: 'Reset changes',
      devicesSaved: 'Device list saved; tailcat restarted to apply it.',
      devicesEmpty: 'No device keys yet — address-only mode.',
      deviceCount: '{count} allowed',
      devicesGenerate: 'Generate a client key on the client device:',
      diagnosticsTitle: 'Status & diagnostics',
      diagPhase: 'Phase',
      diagSurface: 'Runtime',
      diagAddressMode: 'Key mode',
      diagKeyName: 'Key name',
      diagVersion: 'tailcat version',
      diagBinary: 'Executable',
      diagRegion: 'Relay region',
      diagRestarts: 'Auto-restarts',
      diagDoor: 'Door',
      diagTarget: 'Forward target',
      diagLastError: 'Last error',
      diagWarnings: 'Warnings',
      recentTitle: 'Recent connections',
      recentEmpty: 'No connections recorded yet.',
      recentPeer: 'Device',
      recentPort: 'Port',
      recentVia: 'Path',
      recentDuration: 'Duration',
      recentTime: 'Time',
      errorTitle: 'Remote access needs attention',
      retry: 'Retry',
      unavailableTitle: 'Remote access is unavailable',
      unavailableBody: 'The plugin could not read its control API. Reload the page or check the Host log.',
      sessionExpired: 'The browser session expired; reopen this session’s entry URL.',
      setupTitle: 'Install tailcat',
      setupBody: 'The plugin could not find the tailcat executable. Install it here or use an existing system copy.',
      setupRetry: 'Check again',
      installMethodDownload: 'Method: download the official {asset} and verify its SHA-256 before extraction.',
      installMethodBrew: 'Method: Homebrew ({command}).',
      installButton: 'Install tailcat',
      installReinstall: 'Reinstall managed copy',
      installBusy: 'Installing tailcat…',
      installPhaseChecksums: 'Fetching the official SHA-256 manifest…',
      installPhaseDownload: 'Downloading tailcat…',
      installPhaseVerify: 'Verifying the download…',
      installPhaseExtract: 'Extracting…',
      installPhaseInstall: 'Installing…',
      installPhaseHomebrew: 'Installing tailcat through Homebrew; this can take a few minutes…',
      installProgress: '{percent}% ({received} / {total})',
      installProgressUnknown: '{received} downloaded',
      installFailed: 'Installation failed',
      installDetected: 'Existing tailcat detected',
      installDetectedBody: 'Version {version}. The plugin uses it directly; no duplicate install is needed. The path is in diagnostics below.',
      installChecking: 'Checking whether tailcat is already installed…',
      installSystemOutdated: 'The detected tailcat {version} lacks the features this plugin needs (0.8.0 or newer is required). Install the managed copy or upgrade the system tailcat first.',
      installSystemOutdatedBrew: 'The detected tailcat {version} lacks the features this plugin needs (0.8.0 or newer is required). The button upgrades it through Homebrew and copies the result into the managed directory; you can also upgrade manually first.',
      installUnsupported: 'Automatic installation is unavailable on {platform}/{arch}.',
      installConfigOverride: 'binaryPath is set to {path}. A managed install only writes the plugin directory and will not override that setting; set it back to tailcat or install manually at that path.',
      installManual: 'Manual install instructions',
      installManagedNote: 'The managed copy lives at {path}; the system PATH is not modified.',
      diagBinarySource: 'Executable source',
      diagInstallSource: 'tailcat install',
      sourceManaged: 'Managed',
      sourcePath: 'System PATH',
      sourceConfig: 'Configured path',
      sourceUnavailable: 'Not detected',
      noticeInstalled: 'tailcat is installed.',
      firstRun: 'First run: tailcat is creating a saved key and asking a DERP relay for a route. This can take a minute.',
      modeStable: 'Saved (stable)',
      modeEphemeral: 'Ephemeral (changes on restart)',
      modeSocket: 'Unix socket',
      modeTcp: '127.0.0.1 TCP',
      busyStart: 'Starting tailcat…',
      busyStop: 'Stopping tailcat…',
      busyRestart: 'Restarting tailcat…',
      busyRotate: 'Rotating the address…',
      busySave: 'Saving device keys…',
      noticeStarted: 'tailcat is starting.',
      noticeStopped: 'tailcat is stopped.',
      noticeRestarted: 'tailcat restarted.',
      noticeRotated: 'The address was rotated; the new one is below.',
      qrAlt: 'QR code containing the tailcat address',
      footerNote: 'The tailcat address is a credential. Share it only with devices you control.',
      never: 'never',
      unknown: 'unknown',
    };

    const PHASE_KEY = {
      online: 'statusOnline',
      starting: 'statusStarting',
      restarting: 'statusRestarting',
      stopping: 'statusStopping',
      stopped: 'statusStopped',
      error: 'statusError',
    };

    /**
     * Dark/light-theme-aware page shell. All colors come from Harness theme
     * tokens except the QR code itself, which must stay black on white.
     */
    const STYLE = `
      .tcr-page { height: 100%; overflow-y: auto; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-family: inherit; }
      .tcr-shell { max-width: 980px; margin: 0 auto; padding: 28px 24px 56px; display: flex; flex-direction: column; gap: 16px; }
      .tcr-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
      .tcr-heading { display: flex; align-items: flex-start; gap: 14px; min-width: 0; }
      .tcr-mark { flex: 0 0 auto; width: 42px; height: 42px; border-radius: 12px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l3); display: grid; place-items: center; color: var(--dsw-alias-brand-primary); }
      .tcr-title { margin: 0; font-size: 22px; line-height: 1.25; font-weight: 600; letter-spacing: -0.01em; }
      .tcr-title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .tcr-subtitle { margin: 5px 0 0; font-size: 13px; line-height: 1.55; color: var(--dsw-alias-label-secondary); max-width: 620px; }
      .tcr-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .tcr-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; padding: 18px 20px; }
      .tcr-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      .tcr-card-title { margin: 0; font-size: 15px; line-height: 1.4; font-weight: 600; }
      .tcr-card-sub { margin: 4px 0 0; font-size: 12.5px; line-height: 1.55; color: var(--dsw-alias-label-secondary); }
      .tcr-btn { appearance: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; transition: background .15s ease, border-color .15s ease, opacity .15s ease; }
      .tcr-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
      .tcr-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .tcr-btn:disabled { opacity: .45; cursor: not-allowed; }
      .tcr-btn-primary { background: var(--dsw-alias-button-primary-fill); border-color: transparent; color: var(--dsw-alias-label-primary-foreground); }
      .tcr-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
      .tcr-qr-toggle { height: 34px; padding: 0 15px; font-weight: 600; }
      .tcr-btn-danger { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-border-l3); background: transparent; }
      .tcr-btn-danger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-danger); }
      .tcr-btn-ghost { background: transparent; border-color: transparent; color: var(--dsw-alias-label-secondary); }
      .tcr-btn-ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
      .tcr-pill { display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 10px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l3); font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
      .tcr-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-label-tertiary); }
      .tcr-phase-online .tcr-dot { background: var(--dsw-alias-state-success-primary); }
      .tcr-phase-starting .tcr-dot, .tcr-phase-restarting .tcr-dot { background: var(--dsw-alias-state-warn-primary); }
      .tcr-phase-error .tcr-dot { background: var(--dsw-alias-state-error-primary); }
      .tcr-phase-stopping .tcr-dot { background: var(--dsw-alias-state-warn-primary); }
      .tcr-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 20px; }
      .tcr-row { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; padding: 8px 0; border-bottom: 1px dashed var(--dsw-alias-border-l3); font-size: 13px; min-width: 0; }
      .tcr-row:last-child { border-bottom: 0; }
      .tcr-row-label { color: var(--dsw-alias-label-secondary); flex: 0 0 auto; }
      .tcr-row-value { text-align: right; color: var(--dsw-alias-label-primary); min-width: 0; overflow-wrap: anywhere; }
      .tcr-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 12.5px; }
      .tcr-code { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l3); border-radius: 10px; padding: 10px 12px; margin-top: 8px; min-width: 0; }
      .tcr-code-text { min-width: 0; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 12.5px; line-height: 1.55; user-select: all; }
      .tcr-address { font-size: 13px; line-height: 1.65; }
      .tcr-label { display: block; font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-secondary); margin: 0 0 6px; }
      .tcr-textarea { width: 100%; box-sizing: border-box; min-height: 92px; resize: vertical; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); padding: 10px 12px; font: inherit; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.6; }
      .tcr-textarea:focus { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .tcr-alert { border-radius: 10px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-layer-2); font-size: 13px; line-height: 1.6; }
      .tcr-alert-danger { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, var(--dsw-alias-border-l3)); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, var(--dsw-alias-bg-layer-1)); }
      .tcr-alert-warn { border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 35%, var(--dsw-alias-border-l3)); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, var(--dsw-alias-bg-layer-1)); }
      .tcr-alert-title { font-weight: 600; margin: 0 0 4px; }
      .tcr-alert-body { margin: 0; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
      .tcr-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      .tcr-hint { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-tertiary); margin-top: 8px; }
      .tcr-qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 14px; }
      .tcr-qr { width: min(240px, 62vw); padding: 12px; background: #fff; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l3); box-sizing: content-box; }
      .tcr-qr svg { display: block; width: 100%; height: auto; }
      .tcr-badge { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-secondary); font-size: 11.5px; white-space: nowrap; }
      .tcr-recent { display: flex; flex-direction: column; gap: 0; margin-top: 4px; }
      .tcr-recent-row { display: grid; grid-template-columns: 1.5fr .5fr .9fr .6fr .7fr; gap: 10px; align-items: baseline; padding: 8px 0; border-bottom: 1px dashed var(--dsw-alias-border-l3); font-size: 12.5px; }
      .tcr-recent-row:last-child { border-bottom: 0; }
      .tcr-recent-head { color: var(--dsw-alias-label-tertiary); font-size: 11.5px; }
      .tcr-notice { border-radius: 10px; padding: 10px 14px; font-size: 13px; border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-layer-2); }
      .tcr-notice-ok { border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 35%, var(--dsw-alias-border-l3)); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 9%, var(--dsw-alias-bg-layer-1)); }
      .tcr-notice-error { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, var(--dsw-alias-border-l3)); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-label-primary); }
      .tcr-footer { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; color: var(--dsw-alias-label-tertiary); font-size: 11.5px; line-height: 1.6; padding-top: 6px; }
      .tcr-progress { height: 6px; overflow: hidden; border-radius: 999px; background: var(--dsw-alias-bg-layer-3); margin-top: 8px; }
      .tcr-progress-bar { height: 100%; border-radius: inherit; background: var(--dsw-alias-brand-primary); transition: width .25s ease; }
      .tcr-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--dsw-alias-border-l2); border-top-color: var(--dsw-alias-brand-primary); animation: tcr-spin .8s linear infinite; }
      @keyframes tcr-spin { to { transform: rotate(360deg); } }
      .tcr-empty { color: var(--dsw-alias-label-tertiary); font-size: 13px; }
      .tcr-warning-list { margin: 8px 0 0; padding-left: 18px; color: var(--dsw-alias-state-warn-label); font-size: 12px; line-height: 1.6; }
      @media (max-width: 720px) {
        .tcr-shell { padding: 16px 14px 40px; }
        .tcr-header { flex-direction: column; }
        .tcr-header-actions { justify-content: flex-start; }
        .tcr-grid { grid-template-columns: 1fr; }
        .tcr-recent-row { grid-template-columns: 1.4fr .6fr .9fr; }
        .tcr-recent-row > :nth-child(4), .tcr-recent-row > :nth-child(5) { display: none; }
      }
    `;

    /**
     * Sidebar glyph. Inherits the row color so the active state is the shell's.
     * @param {{ size?: number }} props - slot-injected icon props.
     */
    function PanelIcon({ size = 20 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': 'true',
          style: { display: 'block' },
        },
        h('path', {
          d: 'M7.2 8.6 6 4.8l4.2 2.5',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M16.8 8.6 18 4.8l-4.2 2.5',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M5.6 11.4c0-3.1 2.8-5.6 6.4-5.6s6.4 2.5 6.4 5.6v1.7c0 3.1-2.8 5.6-6.4 5.6s-6.4-2.5-6.4-5.6z',
          stroke: 'currentColor',
          strokeWidth: 1.6,
        }),
        h('circle', { cx: 12, cy: 12.3, r: 1.9, fill: 'currentColor' }),
        h('path', { d: 'M12 14.2v2.2', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' }),
      );
    }

    /**
     * @param {object} props - tone, title, children.
     */
    function Alert({ tone = 'info', title, children }) {
      return h(
        'div',
        { className: `tcr-alert ${tone === 'danger' ? 'tcr-alert-danger' : tone === 'warn' ? 'tcr-alert-warn' : ''}` },
        title ? h('p', { className: 'tcr-alert-title' }, title) : null,
        h('div', { className: 'tcr-alert-body' }, children),
      );
    }

    /**
     * @param {object} props - card framing.
     */
    function Card({ title, subtitle, actions, children }) {
      return h(
        'section',
        { className: 'tcr-card' },
        title
          ? h(
              'div',
              { className: 'tcr-card-head' },
              h('div', null, h('h2', { className: 'tcr-card-title' }, title), subtitle ? h('p', { className: 'tcr-card-sub' }, subtitle) : null),
              actions ? h('div', { className: 'tcr-actions', style: { marginTop: 0 } }, actions) : null,
            )
          : null,
        children,
      );
    }

    /**
     * @param {object} props - button props.
     */
    function Button({ variant = 'secondary', disabled = false, onClick, children, title, className }) {
      return h(
        'button',
        { type: 'button', className: `tcr-btn tcr-btn-${variant}${className ? ` ${className}` : ''}`, disabled, onClick, title },
        children,
      );
    }

    /**
     * @param {object} props - copy payload and label.
     */
    function CopyButton({ text, label, t, onResult }) {
      return h(
        Button,
        {
          variant: 'ghost',
          onClick: async () => {
            const ok = await copyText(text);
            onResult?.(ok ? t('copied') : t('copyFailed'), ok);
          },
          title: label ?? t('copy'),
        },
        label ?? t('copy'),
      );
    }

    /**
     * @param {object} props - address matrix.
     */
    function QrCode({ matrix, t }) {
      const geometry = useMemo(() => (matrix ? qrGeometry(matrix) : null), [matrix]);
      if (!geometry) return null;
      return h(
        'div',
        { className: 'tcr-qr' },
        h(
          'svg',
          {
            viewBox: geometry.viewBox,
            role: 'img',
            'aria-label': t('qrAlt'),
            shapeRendering: 'crispEdges',
            xmlns: 'http://www.w3.org/2000/svg',
          },
          h('rect', { width: '100%', height: '100%', fill: '#fff' }),
          h('path', { d: geometry.path, fill: '#000' }),
        ),
      );
    }

    /**
     * @param {{ phase?: string, t: Function }} props - phase from the Host.
     */
    function StatusPill({ phase, t }) {
      const key = PHASE_KEY[phase] ?? 'statusUnknown';
      return h(
        'span',
        { className: `tcr-pill tcr-phase-${phase ?? 'unknown'}`, role: 'status', 'aria-live': 'polite' },
        h('span', { className: 'tcr-dot' }),
        `${t('statusLabel')} · ${t(key)}`,
      );
    }

    /**
     * @param {object} props - label and value.
     */
    function Row({ label, children }) {
      return h(
        'div',
        { className: 'tcr-row' },
        h('span', { className: 'tcr-row-label' }, label),
        h('span', { className: 'tcr-row-value' }, children),
      );
    }

    /** @returns {object} polling state and action helpers. */
    function useRemoteState() {
      const [snapshot, setSnapshot] = useState(null);
      const [error, setError] = useState(null);
      const [busy, setBusy] = useState(null);
      const [notice, setNotice] = useState(null);

      const reload = useCallback(async () => {
        try {
          const response = await fetch(API, {
            method: 'GET',
            headers: { accept: 'application/json' },
            cache: 'no-store',
            credentials: 'same-origin',
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data?.ok) {
            throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
          }
          setSnapshot(data);
          setError(null);
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        }
      }, []);

      useEffect(() => {
        void reload();
        const timer = setInterval(() => {
          if (!document.hidden) void reload();
        }, 2_500);
        const onVisibility = () => {
          if (!document.hidden) void reload();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
          clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisibility);
        };
      }, [reload]);

      const act = useCallback(
        async (action, extra, noticeKey) => {
          setBusy(action);
          setNotice(null);
          try {
            const response = await fetch(API, {
              method: 'POST',
              headers: { accept: 'application/json', 'content-type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({ action, ...extra }),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.ok) {
              throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
            }
            setSnapshot(data);
            if (noticeKey) setNotice({ kind: 'ok', key: noticeKey });
            return true;
          } catch (failure) {
            setNotice({ kind: 'error', text: failure instanceof Error ? failure.message : String(failure) });
            return false;
          } finally {
            setBusy(null);
            void reload();
          }
        },
        [reload],
      );

      return { snapshot, error, busy, notice, setNotice, act, reload };
    }

    /** The page registered at the `main` key `tailcat-remote`. */
    function RemotePage({ t }) {
      const { snapshot, error, busy, notice, setNotice, act, reload } = useRemoteState();
      const [showQr, setShowQr] = useState(false);
      const [showAddress, setShowAddress] = useState(false);
      const [rotateArmed, setRotateArmed] = useState(false);
      const [draft, setDraft] = useState('');
      const [devicesDirty, setDevicesDirty] = useState(false);
      const [localNotice, setLocalNotice] = useState(null);

      const displayedNotice = localNotice ?? notice;
      useEffect(() => {
        if (!displayedNotice) return undefined;
        const timer = setTimeout(() => {
          setLocalNotice(null);
          setNotice(null);
        }, 6_000);
        return () => clearTimeout(timer);
      }, [displayedNotice, setNotice]);

      useEffect(() => {
        if (rotateArmed) {
          const timer = setTimeout(() => setRotateArmed(false), 8_000);
          return () => clearTimeout(timer);
        }
        return undefined;
      }, [rotateArmed]);

      useEffect(() => {
        if (!snapshot || devicesDirty) return;
        setDraft((snapshot.devices.allow ?? []).join('\n'));
      }, [snapshot, devicesDirty]);

      const tailcat = snapshot?.tailcat;
      const phase = tailcat?.phase ?? 'stopped';
      const desktop = snapshot?.surface?.profile === 'desktop';
      const surfaceLabel =
        snapshot?.surface?.profile === 'desktop'
          ? t('surfaceDesktop')
          : snapshot?.surface?.profile === 'web'
            ? 'Web'
            : snapshot?.surface?.profile ?? t('unknown');
      const pairing = snapshot?.pairing ?? null;
      const busyKey =
        busy === 'start'
          ? 'busyStart'
          : busy === 'stop'
            ? 'busyStop'
            : busy === 'restart'
              ? 'busyRestart'
              : busy === 'rotate'
                ? 'busyRotate'
                : busy === 'devices'
                  ? 'busySave'
                  : busy === 'install'
                    ? 'installBusy'
                    : null;

      const reportCopy = (text, ok) => setLocalNotice({ kind: ok ? 'ok' : 'error', text });

      if (!snapshot) {
        return h(
          'div',
          { className: 'tcr-page' },
          h('style', null, STYLE),
          h(
            'div',
            { className: 'tcr-shell' },
            h('div', { className: 'tcr-header' }, h('div', { className: 'tcr-heading' },
              h('div', { className: 'tcr-mark' }, h(PanelIcon, { size: 22 })),
              h('div', null, h('h1', { className: 'tcr-title' }, t('title')), h('p', { className: 'tcr-subtitle' }, t('subtitle'))),
            )),
            error
              ? h(
                  Alert,
                  { tone: 'danger', title: t('unavailableTitle') },
                  h('p', null, t('unavailableBody')),
                  h('p', { className: 'tcr-mono' }, error),
                  h('div', { className: 'tcr-actions' }, h(Button, { onClick: () => void reload() }, t('retry'))),
                )
              : h('div', { className: 'tcr-empty' }, h('span', { className: 'tcr-spinner', style: { display: 'inline-block', verticalAlign: 'middle', marginRight: 8 } }), t('loading')),
          ),
        );
      }

      const binaryMissing = tailcat.binary?.resolved === null && phase === 'error';
      const installer = snapshot.installer;
      const system = installer?.system;
      const systemFound = system?.status === 'found';
      const systemCompatible = system?.compatible !== false;
      const configOverride = snapshot.config.binaryPath !== 'tailcat';
      const installerBusy = busy === 'install' || Boolean(installer?.busy);
      const anyBusy = Boolean(busy) || Boolean(installer?.busy);
      const progress = installer?.progress;
      const percent = progress && Number.isFinite(progress.percent) ? progress.percent : null;
      const phaseText = progress
        ? progress.phase === 'checksums'
          ? t('installPhaseChecksums')
          : progress.phase === 'verifying'
            ? t('installPhaseVerify')
            : progress.phase === 'extracting'
              ? t('installPhaseExtract')
              : progress.phase === 'installing'
                ? t('installPhaseInstall')
                : progress.phase === 'homebrew'
                  ? t('installPhaseHomebrew')
                  : t('installPhaseDownload')
        : null;
      const installProgress = progress
        ? h(
            'div',
            { className: 'tcr-install-progress' },
            h(
              'p',
              { className: 'tcr-hint', style: { marginTop: 0 } },
              percent === null
                ? h('span', { className: 'tcr-spinner', style: { display: 'inline-block', verticalAlign: 'middle', marginRight: 8 } })
                : null,
              phaseText,
              progress.phase === 'downloading' && progress.total > 0
                ? ` ${t('installProgress', { percent, received: formatBytes(progress.received), total: formatBytes(progress.total) })}`
                : progress.phase === 'downloading' && progress.received > 0
                  ? ` ${t('installProgressUnknown', { received: formatBytes(progress.received) })}`
                  : null,
            ),
            percent !== null ? h('div', { className: 'tcr-progress' }, h('div', { className: 'tcr-progress-bar', style: { width: `${percent}%` } })) : null,
          )
        : null;
      const sourceLabel =
        tailcat.binary?.source === 'managed'
          ? t('sourceManaged')
          : tailcat.binary?.source === 'config'
            ? t('sourceConfig')
            : tailcat.binary?.source === 'path'
              ? t('sourcePath')
              : t('sourceUnavailable');
      const install = snapshot.plugin?.name ?? '@ds-hu/dsh-tailcat-remote';
      const localUrl = pairing ? `http://127.0.0.1:${pairing.localPort}/` : '';
      const saveBusy = busy === 'devices';

      const saveDevices = async () => {
        const allow = draft
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.startsWith('#'));
        const ok = await act('devices', { allow }, 'devicesSaved');
        if (ok) setDevicesDirty(false);
      };

      const rotate = async () => {
        setRotateArmed(false);
        await act('rotate', {}, 'noticeRotated');
      };

      return h(
        'div',
        { className: 'tcr-page' },
        h('style', null, STYLE),
        h(
          'div',
          { className: 'tcr-shell' },
          h(
            'div',
            { className: 'tcr-header' },
            h(
              'div',
              { className: 'tcr-heading' },
              h('div', { className: 'tcr-mark' }, h(PanelIcon, { size: 22 })),
              h(
                'div',
                null,
                h(
                  'div',
                  { className: 'tcr-title-row' },
                  h('h1', { className: 'tcr-title' }, t('title')),
                  desktop ? h('span', { className: 'tcr-badge tcr-surface-badge' }, t('surfaceDesktop')) : null,
                ),
                h('p', { className: 'tcr-subtitle' }, t('subtitle')),
              ),
            ),
            h(
              'div',
              { className: 'tcr-header-actions' },
              h(StatusPill, { phase, t }),
              phase === 'stopped' || phase === 'error'
                ? h(
                    Button,
                    {
                      variant: 'primary',
                      disabled: anyBusy,
                      onClick: () => void act('start', {}, 'noticeStarted'),
                    },
                    t('start'),
                  )
                : h(
                    Button,
                    {
                      disabled: anyBusy,
                      onClick: () => void act('stop', {}, 'noticeStopped'),
                    },
                    t('stop'),
                  ),
              h(
                Button,
                { disabled: anyBusy, onClick: () => void act('restart', {}, 'noticeRestarted') },
                t('restart'),
              ),
              h(Button, { variant: 'ghost', disabled: anyBusy, onClick: () => void reload() }, t('refresh')),
            ),
          ),

          desktop ? h('p', { className: 'tcr-hint tcr-desktop-hint', style: { marginTop: 0 } }, t('surfaceHint')) : null,

          displayedNotice
            ? h(
                'div',
                { className: `tcr-notice ${displayedNotice.kind === 'ok' ? 'tcr-notice-ok' : 'tcr-notice-error'}`, role: 'status' },
                displayedNotice.key ? t(displayedNotice.key) : displayedNotice.text,
              )
            : null,
          busyKey ? h('div', { className: 'tcr-hint' }, h('span', { className: 'tcr-spinner', style: { display: 'inline-block', verticalAlign: 'middle', marginRight: 8 } }), t(busyKey)) : null,

          error ? h(Alert, { tone: 'danger', title: t('unavailableTitle') }, h('p', null, t('unavailableBody')), h('p', { className: 'tcr-mono' }, error)) : null,
          snapshot.door?.phase === 'error'
            ? h(Alert, { tone: 'danger', title: t('diagDoor') }, snapshot.door.lastError ?? t('unknown'))
            : null,
          tailcat.lastError && phase === 'error' && !binaryMissing
            ? h(Alert, { tone: 'danger', title: t('diagLastError') }, h('p', { className: 'tcr-mono' }, tailcat.lastError))
            : null,

          !binaryMissing && systemFound && systemCompatible && !installer?.installed
            ? h(
                Alert,
                { tone: 'info', title: t('installDetected') },
                h('p', null, t('installDetectedBody', { version: system.version ?? t('unknown'), path: system.path })),
              )
            : null,

          binaryMissing
            ? h(
                Card,
                {
                  title: systemFound && systemCompatible ? t('installDetected') : t('setupTitle'),
                  subtitle: systemFound
                    ? systemCompatible
                      ? t('installDetectedBody', { version: system.version ?? t('unknown'), path: system.path })
                      : t(installer?.method === 'brew' ? 'installSystemOutdatedBrew' : 'installSystemOutdated', { version: system.version ?? t('unknown') })
                    : system?.status === 'checking' || !system
                      ? t('installChecking')
                      : t('setupBody'),
                },
                !systemFound
                  ? h('p', { className: 'tcr-hint' }, t('installHint'))
                  : null,
                configOverride
                  ? h(Alert, { tone: 'warn', title: t('setupTitle') }, t('installConfigOverride', { path: snapshot.config.binaryPath }))
                  : null,
                (!systemFound || !systemCompatible) && installer?.supported && !configOverride
                  ? h(
                      'p',
                      { className: 'tcr-hint' },
                      installer.method === 'brew'
                        ? t('installMethodBrew', { command: installer.command })
                        : t('installMethodDownload', { asset: installer.asset ?? 'tailcat' }),
                    )
                  : null,
                !installer?.supported
                  ? h(Alert, { tone: 'warn' }, t('installUnsupported', { platform: installer?.platform ?? 'unknown', arch: installer?.arch ?? 'unknown' }))
                  : null,
                installer?.error
                  ? h(Alert, { tone: 'danger', title: t('installFailed') }, h('p', { className: 'tcr-mono' }, installer.error))
                  : null,
                installerBusy ? installProgress : null,
                h(
                  'div',
                  { className: 'tcr-actions' },
                  (!systemFound || !systemCompatible) && installer?.supported && !configOverride
                    ? h(
                        Button,
                        {
                          variant: 'primary',
                          disabled: installerBusy,
                          onClick: () => void act('install', {}, 'noticeInstalled'),
                        },
                        installerBusy ? t('installBusy') : installer?.installed ? t('installReinstall') : t('installButton'),
                      )
                    : null,
                  h(
                    Button,
                    { variant: 'ghost', disabled: installerBusy, onClick: () => void act('restart', {}, 'noticeRestarted') },
                    t('setupRetry'),
                  ),
                  installer?.manualUrl
                    ? h(
                        'a',
                        {
                          className: 'tcr-btn tcr-btn-ghost',
                          href: installer.manualUrl,
                          target: '_blank',
                          rel: 'noopener noreferrer',
                          style: { textDecoration: 'none' },
                        },
                        t('installManual'),
                      )
                    : null,
                ),
                installer?.installed && installer.binaryPath
                  ? h('p', { className: 'tcr-hint' }, t('installManagedNote', { path: installer.binaryPath }))
                  : null,
              )
            : null,

          !pairing && !binaryMissing
            ? h(
                Card,
                { title: t('statusLabel') },
                h(
                  'div',
                  { className: 'tcr-grid' },
                  h(Row, { label: t('diagPhase') }, t(PHASE_KEY[phase] ?? 'statusUnknown')),
                  h(Row, { label: t('diagBinary') }, h('span', { className: 'tcr-mono' }, tailcat.binary?.resolved ?? snapshot.config.binaryPath)),
                ),
                phase === 'starting' || phase === 'restarting'
                  ? h(Alert, { tone: 'warn' }, h('div', { className: 'tcr-hint', style: { marginTop: 0 } }, h('span', { className: 'tcr-spinner', style: { display: 'inline-block', verticalAlign: 'middle', marginRight: 8 } }), t('firstRun')))
                  : h('p', { className: 'tcr-hint' }, h(Button, { variant: 'primary', disabled: Boolean(busy), onClick: () => void act('start', {}, 'noticeStarted') }, t('start'))),
              )
            : null,

          pairing
            ? h(
                Card,
                {
                  title: t('pairingTitle'),
                  subtitle: t('pairingHint'),
                  actions: h('span', { className: 'tcr-badge' }, tailcat.keyMode === 'ephemeral' ? t('modeEphemeral') : t('modeStable')),
                },
                h('label', { className: 'tcr-label' }, t('addressLabel')),
                h(
                  'div',
                  { className: 'tcr-code' },
                  h('span', { className: 'tcr-code-text tcr-address' }, showAddress ? pairing.address : '****'),
                  h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' } },
                    h(CopyButton, { text: pairing.address, t, onResult: reportCopy }),
                    h(Button, { variant: 'ghost', onClick: () => setShowAddress((value) => !value), 'aria-pressed': showAddress }, showAddress ? t('hideAddress') : t('showAddress')),
                    h(
                      Button,
                      {
                        variant: showQr ? 'ghost' : 'primary',
                        className: 'tcr-qr-toggle',
                        onClick: () => setShowQr((value) => !value),
                        'aria-pressed': showQr,
                      },
                      showQr ? t('hideQr') : t('showQr'),
                    ),
                  ),
                ),
                !showAddress ? h('p', { className: 'tcr-hint' }, t('addressHiddenHint')) : null,
                showQr
                  ? h('div', { className: 'tcr-qr-wrap' },
                      pairing.qr
                        ? h(QrCode, { matrix: pairing.qr, t })
                        : h('p', { className: 'tcr-hint', style: { marginTop: 0 } }, t('qrUnavailable')),
                      h('div', { className: 'tcr-hint', style: { marginTop: 0 } }, t('qrHint')),
                    )
                  : null,
                h('label', { className: 'tcr-label', style: { marginTop: 16 } }, t('openLocal')),
                h(
                  'div',
                  { className: 'tcr-code' },
                  h('span', { className: 'tcr-code-text' }, localUrl),
                  h(CopyButton, { text: localUrl, t, onResult: reportCopy }),
                  h(
                    'a',
                    { className: 'tcr-btn tcr-btn-ghost', href: localUrl, target: '_blank', rel: 'noopener noreferrer', style: { textDecoration: 'none' } },
                    t('openLocal'),
                  ),
                ),
                h('p', { className: 'tcr-hint' }, t('localUrlHint')),
              )
            : null,

          h(
            Card,
            { title: t('securityTitle') },
            snapshot.devices.enforced
              ? h(Alert, { tone: 'info', title: t('allowOnTitle', { count: snapshot.devices.count }) }, t('allowOnBody'))
              : h(Alert, { tone: 'danger', title: t('allowOffTitle') }, t('allowOffBody')),
            h('label', { className: 'tcr-label', style: { marginTop: 16 } }, t('devicesLabel')),
            h('textarea', {
              className: 'tcr-textarea',
              value: draft,
              placeholder: t('devicesPlaceholder'),
              spellCheck: false,
              onChange: (event) => {
                setDraft(event.target.value);
                setDevicesDirty(true);
              },
            }),
            h('p', { className: 'tcr-hint' }, t('devicesHint')),
            h('p', { className: 'tcr-hint' }, t('devicesGenerate'), h('code', { className: 'tcr-mono' }, ' tailcat genkey --client --key=client-default')),
            h(
              'div',
              { className: 'tcr-actions' },
              h(Button, { variant: 'primary', disabled: saveBusy || !devicesDirty, onClick: () => void saveDevices() }, saveBusy ? t('busySave') : t('devicesSave')),
              h(Button, { variant: 'ghost', disabled: saveBusy || !devicesDirty, onClick: () => { setDevicesDirty(false); setDraft((snapshot.devices.allow ?? []).join('\n')); } }, t('devicesReset')),
            ),
            snapshot.devices.warnings?.length
              ? h('ul', { className: 'tcr-warning-list' }, snapshot.devices.warnings.map((warning, index) => h('li', { key: index }, warning)))
              : null,
            h('div', { style: { marginTop: 20, paddingTop: 16, borderTop: '1px dashed var(--dsw-alias-border-l3)' } },
              h('p', { className: 'tcr-card-title', style: { fontSize: 14 } }, t('rotate')),
              h('p', { className: 'tcr-hint' }, t('rotateHint')),
              h(
                'div',
                { className: 'tcr-actions' },
                rotateArmed
                  ? h(Button, { variant: 'danger', disabled: Boolean(busy), onClick: () => void rotate() }, t('rotateConfirm'))
                  : h(Button, { variant: 'danger', disabled: Boolean(busy), onClick: () => setRotateArmed(true) }, t('rotate')),
                rotateArmed
                  ? h(Button, { variant: 'ghost', disabled: Boolean(busy), onClick: () => setRotateArmed(false) }, t('cancel'))
                  : null,
              ),
              h('p', { className: 'tcr-hint' }, t('rotateCaveat')),
              h('p', { className: 'tcr-hint' }, t('rotateDisconnect')),
            ),
          ),

          h(
            Card,
            { title: t('diagnosticsTitle') },
            h(
              'div',
              { className: 'tcr-grid' },
              h(Row, { label: t('diagSurface') }, surfaceLabel),
              h(Row, { label: t('diagPhase') }, t(PHASE_KEY[phase] ?? 'statusUnknown')),
              h(Row, { label: t('diagAddressMode') }, tailcat.addressMode === 'ephemeral' ? t('modeEphemeral') : t('modeStable')),
              h(Row, { label: t('diagKeyName') }, h('span', { className: 'tcr-mono' }, tailcat.keyName)),
              h(Row, { label: t('diagVersion') }, tailcat.binary?.version ?? t('unknown')),
              h(Row, { label: t('diagBinary') }, h('span', { className: 'tcr-mono' }, tailcat.binary?.resolved ?? snapshot.config.binaryPath)),
              h(Row, { label: t('diagBinarySource') }, sourceLabel),
              h(Row, { label: t('diagInstallSource') }, installer?.installed ? `${t('sourceManaged')} · ${installer.installedVersion ?? t('unknown')}` : systemFound ? `${t('sourcePath')} · ${system.version ?? t('unknown')}` : t('sourceUnavailable')),
              h(Row, { label: t('diagRegion') }, tailcat.region ? `${tailcat.region.name} (${tailcat.region.id})` : t('unknown')),
              h(Row, { label: t('diagRestarts') }, String(tailcat.restarts ?? 0)),
              h(Row, { label: t('diagDoor') }, snapshot.door.mode === 'socket' ? `${t('modeSocket')} · ${snapshot.door.socketPath}` : `${t('modeTcp')} · 127.0.0.1:${snapshot.door.port}`),
              h(Row, { label: t('diagTarget') }, snapshot.door.target ? `${snapshot.door.target.host}:${snapshot.door.target.port}` : t('unknown')),
              h(Row, { label: t('diagLastError') }, tailcat.lastError ?? t('never')),
            ),
            tailcat.warnings?.length
              ? h('ul', { className: 'tcr-warning-list' }, tailcat.warnings.map((warning, index) => h('li', { key: index }, warning)))
              : null,
          ),

          h(
            Card,
            { title: t('recentTitle') },
            tailcat.recent?.length
              ? h(
                  'div',
                  { className: 'tcr-recent' },
                  h(
                    'div',
                    { className: 'tcr-recent-row tcr-recent-head' },
                    h('span', null, t('recentPeer')),
                    h('span', null, t('recentPort')),
                    h('span', null, t('recentVia')),
                    h('span', null, t('recentDuration')),
                    h('span', null, t('recentTime')),
                  ),
                  ...tailcat.recent.slice(0, 8).map((entry, index) =>
                    h(
                      'div',
                      { className: 'tcr-recent-row', key: `${entry.at}-${index}` },
                      h('span', { className: 'tcr-mono', title: entry.peer ?? entry.reason ?? '' }, entry.peer ?? t('unknown')),
                      h('span', null, entry.port ?? '—'),
                      h('span', null, entry.via ?? entry.reason ?? '—'),
                      h('span', null, formatDuration(entry.durationMs)),
                      h('span', { title: entry.at }, formatTime(entry.at)),
                    ),
                  ),
                )
              : h('div', { className: 'tcr-empty' }, t('recentEmpty')),
          ),

          h(
            'div',
            { className: 'tcr-footer' },
            h('span', null, `${install} · v${snapshot.plugin.version}`),
            h('span', null, t('footerNote')),
          ),
        ),
      );
    }

    /**
     * @param {string} key - translation key.
     * @param {object} [params] - named placeholders.
     * @returns {string} translated copy.
     */
    function translate(t, key, params) {
      return params ? t(key, params) : t(key);
    }

    /**
     * Copy text through the async clipboard API, with a legacy fallback for
     * browsers that only allow copy from a user-gesture-owned textarea.
     * @param {string} text - payload.
     * @returns {Promise<boolean>} whether the copy succeeded.
     */
    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        try {
          const area = document.createElement('textarea');
          area.value = text;
          area.style.position = 'fixed';
          area.style.top = '-1000px';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          const ok = document.execCommand('copy');
          area.remove();
          return ok;
        } catch {
          return false;
        }
      }
    }

    /**
     * Turn a server QR matrix into one crisp SVG path plus quiet zone.
     * @param {{ size: number, rows: string[] }} matrix - matrix from the Host.
     * @param {number} [quietZone] - white border in modules.
     * @returns {{ viewBox: string, path: string }} geometry.
     */
    function qrGeometry(matrix, quietZone = 2) {
      const total = matrix.size + quietZone * 2;
      let path = '';
      for (let row = 0; row < matrix.rows.length; row += 1) {
        const bits = matrix.rows[row];
        let column = 0;
        while (column < bits.length) {
          if (bits[column] !== '1') {
            column += 1;
            continue;
          }
          const start = column;
          while (column < bits.length && bits[column] === '1') column += 1;
          path += `M${start + quietZone} ${row + quietZone}h${column - start}v1h-${column - start}z`;
        }
      }
      return { viewBox: `0 0 ${total} ${total}`, path };
    }

    /**
     * @param {number | null | undefined} ms - duration.
     * @returns {string} compact duration.
     */
    function formatDuration(ms) {
      if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
      if (ms < 1_000) return `${Math.round(ms)} ms`;
      if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`;
      return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`;
    }

    /**
     * @param {number | null | undefined} bytes - byte count.
     * @returns {string} compact size for installer progress.
     */
    function formatBytes(bytes) {
      if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
      if (bytes < 1_024) return `${bytes} B`;
      if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
      return `${(bytes / 1_048_576).toFixed(1)} MB`;
    }

    /**
     * @param {string | null | undefined} iso - timestamp.
     * @returns {string} local clock time.
     */
    function formatTime(iso) {
      if (!iso) return '—';
      try {
        return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
      } catch {
        return String(iso);
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'tailcat-remote: dictionaries');
        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.panellist', () =>
              ctx.slots.register(
                {
                  name: 'sidebar.panellist',
                  id: 'tailcat-remote',
                  order: 30,
                  label: () => translate(t, 'nav'),
                },
                PanelIcon,
              ),
            ),
          'tailcat-remote: sidebar entry',
        );
        ctx.effect(
          () =>
            ctx.slots.inject('main', () =>
              ctx.slots.register(
                {
                  name: 'main',
                  key: 'tailcat-remote',
                  locale: NS,
                },
                RemotePage,
              ),
            ),
          'tailcat-remote: page',
        );
      },
    };
  },
});
