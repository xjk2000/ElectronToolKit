const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  clipboard,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  safeStorage,
  shell
} = require('electron');
const path = require('node:path');
const crypto = require('node:crypto');
const punycode = require('punycode/');
const { access, cp, mkdir, readdir, readFile, writeFile } = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const yaml = require('js-yaml');
const { XMLBuilder, XMLParser } = require('fast-xml-parser');
const { CronExpressionParser } = require('cron-parser');
const CryptoJS = require('crypto-js');
const { sm2, sm3, sm4 } = require('sm-crypto');
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');
const sharp = require('sharp');
const { createCcSwitchManager } = require('./cc-switch.cjs');
const { convertImageBuffer } = require('./image-converter.cjs');
const { markdownToDocxBuffer, sanitizeDocxFileName } = require('./markdown-docx.cjs');
const { FILE_HASH_ALGORITHMS, calculateFileHashes } = require('./file-hash.cjs');
const {
  exportJsonLinesFieldsCsvFile,
  extractTopLevelKeyJsonFile,
  formatJsonFile,
  inspectJsonFile,
  inspectJsonLinesFile,
  minifyJsonFile
} = require('./json-stream-inspector.cjs');
const { accountFromInput, accountWithCode, normalizeTOTPAccount } = require('./totp.cjs');
const { GitLabConfigStore } = require('./gitlab/config-store.cjs');
const { GitLabTokenStore } = require('./gitlab/token-store.cjs');
const { registerGitLabIpc } = require('./gitlab/ipc.cjs');
const { APP_META } = require('./app-meta.cjs');
const { DEFAULT_PLANTUML_SERVER, buildPlantUmlUrl, normalizePlantUmlSource } = require('./plantuml.cjs');
const { createPasswordVault } = require('./password-vault.cjs');

app.setName(APP_META.displayName);
app.setAppUserModelId(APP_META.bundleId);

const NOTE_SHAPES = new Set(['rounded', 'circle', 'triangle', 'star', 'heart', 'hexagon']);
const NOTE_MIN_SIZE = 180;
const NOTE_MAX_SIZE = 640;
const NOTE_DEFAULT_SIZE = 300;
const MAX_TIMER_DELAY = 2_147_483_647;

let mainWindow;
let tray;
let notes = [];
let totpAccounts = [];
const noteWindows = new Map();
const reminderTimers = new Map();
let notesFilePath = '';
let totpAccountsFilePath = '';
let totpSettingsFilePath = '';
let totpStorageWarning = '';
let gitlabBridge = null;
let ccSwitchManager = null;
let ccSwitchTrayState = { providers: [], apps: [], currentByApp: {} };
let passwordVault = null;

function assetPath(fileName) {
  return path.join(__dirname, '..', 'build', fileName);
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function directoryHasFiles(targetPath) {
  try {
    const entries = await readdir(targetPath);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function migrateLegacyUserData() {
  const userDataPath = app.getPath('userData');
  const legacyUserDataPath = path.join(path.dirname(userDataPath), APP_META.legacyDisplayName);
  if (path.resolve(userDataPath) === path.resolve(legacyUserDataPath)) return;
  if (!(await pathExists(legacyUserDataPath))) return;
  if (await directoryHasFiles(userDataPath)) return;

  await mkdir(path.dirname(userDataPath), { recursive: true });
  await cp(legacyUserDataPath, userDataPath, {
    recursive: true,
    errorOnExist: false,
    force: false
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 820,
    minHeight: 560,
    show: false,
    title: APP_META.displayName,
    icon: assetPath('icon.png'),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101116' : '#f4f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
    return;
  }

  mainWindow.show();
  mainWindow.focus();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  const trayImage = nativeImage.createFromPath(assetPath('trayTemplate.png'));
  trayImage.setTemplateImage(true);
  tray = new Tray(trayImage);
  tray.setToolTip(APP_META.displayName);
  refreshTrayMenu();
  tray.on('click', showTrayMenu);
  tray.on('right-click', showTrayMenu);
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? `隐藏 ${APP_META.displayName}` : `打开 ${APP_META.displayName}`,
      click: toggleWindow
    },
    {
      label: '2FA 验证码',
      submenu: buildTOTPTrayMenu()
    },
    {
      label: '密码库',
      submenu: [
        { label: '打开密码库', click: () => openToolInMainWindow('passwords') }
      ]
    },
    {
      label: '任务便笺',
      submenu: [
        { label: '新建便笺', click: createQuickNote },
        { label: '显示所有便笺', click: showAllNotes }
      ]
    },
    {
      label: 'GitLab 助手',
      submenu: buildGitLabTrayMenu()
    },
    {
      label: '切换模型',
      submenu: buildCcSwitchTrayMenu()
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
}

function buildCcSwitchTrayMenu() {
  const providers = ccSwitchTrayState.providers ?? [];
  const apps = (ccSwitchTrayState.apps ?? []).filter((appInfo) => appInfo.configured || ccSwitchTrayState.currentByApp?.[appInfo.id]);
  if (providers.length === 0) {
    return [
      { label: '暂无供应商', enabled: false },
      { type: 'separator' },
      { label: '打开模型切换配置', click: () => openToolInMainWindow('cc-switch') }
    ];
  }
  if (apps.length === 0) {
    return [
      { label: '未检测到已配置的 AI CLI', enabled: false },
      { label: '打开模型切换配置', click: () => openToolInMainWindow('cc-switch') }
    ];
  }
  return [
    ...apps.map((appInfo) => ({
      label: appInfo.currentProviderName ? `${appInfo.label} · ${appInfo.currentProviderName}` : appInfo.label,
      submenu: [
        ...providers
          .filter((provider) => provider.app === appInfo.id)
          .map((provider) => ({
          label: `${appInfo.currentProviderId === provider.id ? '✓ ' : ''}${provider.name}`,
          click: () => applyCcSwitchFromTray(appInfo.id, provider.id)
        })),
        ...(providers.some((provider) => provider.app === appInfo.id) ? [] : [{ label: '暂无该应用供应商', enabled: false }]),
        { type: 'separator' },
        { label: `打开 ${appInfo.label} 配置`, click: () => openToolInMainWindow('cc-switch') }
      ]
    })),
    { type: 'separator' },
    { label: '打开模型切换配置', click: () => openToolInMainWindow('cc-switch') }
  ];
}

async function refreshCcSwitchTrayState() {
  if (!ccSwitchManager) return;
  try {
    ccSwitchTrayState = await ccSwitchManager.list();
  } catch (error) {
    console.error('Failed to refresh CC Switch tray state:', error);
  }
}

async function applyCcSwitchFromTray(appId, providerId) {
  try {
    const result = await ccSwitchManager.applyProvider({ app: appId, providerId });
    ccSwitchTrayState = result;
    refreshTrayMenu();
    if (Notification.isSupported()) {
      new Notification({
        title: '模型已切换',
        body: `${result.applied?.app || appId} · ${result.applied?.providerName || ''}`
      }).show();
    }
  } catch (error) {
    if (Notification.isSupported()) {
      new Notification({
        title: '模型切换失败',
        body: error instanceof Error ? error.message : String(error)
      }).show();
    }
  }
}

function buildGitLabTrayMenu() {
  const config = gitlabBridge?.getConfig?.();
  const instances = config?.instances ?? [];
  return [
    instances.length > 0
      ? { label: `${instances.length} 个 GitLab 实例`, enabled: false }
      : { label: '尚未配置 GitLab', enabled: false },
    ...instances.slice(0, 6).map((instance) => ({
      label: instance.name,
      submenu: buildGitLabInstanceTrayMenu(instance, config)
    })),
    { type: 'separator' },
    {
      label: '打开 GitLab 助手',
      click: () => openToolInMainWindow('gitlab')
    },
    {
      label: '刷新 Pipeline 监控',
      enabled: instances.length > 0,
      click: refreshGitLabMonitorFromTray
    }
  ];
}

async function showTrayMenu() {
  await refreshGitLabMonitorQuietly();
  await refreshCcSwitchTrayState();
  tray?.popUpContextMenu(buildTrayMenu());
}

function buildGitLabInstanceTrayMenu(instance, config) {
  const projects = gitlabBridge?.getProjects?.(instance.id) ?? [];
  const targets = (config?.monitor?.targets ?? []).filter((target) => target.instanceId === instance.id);
  const statuses = gitlabBridge?.getMonitorStatuses?.() ?? [];
  const statusById = new Map(statuses.map((status) => [status.statusId, status]));
  const monitorItems = targets.flatMap((target) =>
    (target.watches ?? [])
      .filter((watch) => watch.monitorEnabled !== false)
      .map((watch) => {
        const statusId = `${target.instanceId}:${target.projectId}:${watch.id}`;
        const status = statusById.get(statusId) ?? {
          target,
          watch,
          status: 'unknown',
          statusLabel: '未知',
          resolvedBranch: '',
          webURL: '',
          triggerer: null,
          errorMessage: ''
        };
        return {
          status,
          menuItem: {
            label: formatGitLabMonitorMenuLabel(status),
            enabled: Boolean(status.webURL),
            click: () => {
              if (status.webURL) shell.openExternal(status.webURL);
            }
          }
        };
      })
  );
  monitorItems.sort((left, right) => {
    const weight = gitLabMenuStatusWeight(left.status.status) - gitLabMenuStatusWeight(right.status.status);
    if (weight !== 0) return weight;
    return `${left.status.target?.pathWithNamespace || ''}:${left.status.branch || ''}`
      .localeCompare(`${right.status.target?.pathWithNamespace || ''}:${right.status.branch || ''}`);
  });
  return [
    { label: projects.length ? `${projects.length} 个项目` : '尚未拉取项目列表', enabled: false },
    { type: 'separator' },
    { label: `运行情况${monitorItems.length ? `（${monitorItems.length}）` : ''}`, enabled: false },
    ...(monitorItems.length > 0 ? monitorItems.slice(0, 12).map((item) => item.menuItem) : [{ label: '暂无观测项目', enabled: false }]),
    ...(monitorItems.length > 12 ? [{ label: `还有 ${monitorItems.length - 12} 项，打开 GitLab 助手查看`, click: () => openToolInMainWindow('gitlab') }] : []),
    { type: 'separator' },
    {
      label: '打开 GitLab 助手',
      click: () => openToolInMainWindow('gitlab')
    },
    {
      label: '刷新 Pipeline 监控',
      click: refreshGitLabMonitorFromTray
    }
  ];
}

function formatGitLabMonitorMenuLabel(status) {
  const state = gitLabMenuStatusText(status.status, status.statusLabel);
  const branch = status.resolvedBranch || gitLabWatchLabel(status.watch);
  const project = truncateMiddle(status.target?.pathWithNamespace || '', 34);
  const triggerer = gitLabTriggererText(status.triggerer);
  const parts = [
    branch ? truncateMiddle(branch, 18) : '',
    triggerer ? `触发 ${truncateMiddle(triggerer, 18)}` : ''
  ].filter(Boolean);
  const suffix = parts.length ? ` · ${parts.join(' · ')}` : '';
  if (status.errorMessage) return `× ${project}${suffix}`;
  return `${gitLabStatusSymbol(status.status)} ${state}  ${project}${suffix}`;
}

function gitLabTriggererText(triggerer) {
  if (!triggerer) return '';
  const username = String(triggerer.username || '').trim();
  if (username) return username.startsWith('@') ? username : `@${username}`;
  return String(triggerer.displayName || triggerer.name || '').trim();
}

function gitLabStatusSymbol(status) {
  if (status === 'success') return '●';
  if (status === 'failed') return '×';
  if (status === 'running' || status === 'pending' || status === 'created' || status === 'preparing') return '…';
  return '○';
}

function gitLabMenuStatusText(status, fallback = '未知') {
  return {
    success: '成功',
    failed: '失败',
    running: '运行中',
    pending: '等待中',
    created: '已创建',
    preparing: '准备中',
    canceled: '已取消',
    skipped: '已跳过',
    unknown: '未知'
  }[status] || fallback || '未知';
}

function gitLabMenuStatusWeight(status) {
  if (status === 'running' || status === 'pending' || status === 'created' || status === 'preparing') return 0;
  if (status === 'failed') return 1;
  if (status === 'success') return 2;
  return 3;
}

async function refreshGitLabMonitorQuietly() {
  const config = gitlabBridge?.getConfig?.();
  const hasTargets = (config?.monitor?.targets ?? []).some((target) =>
    (target.watches ?? []).some((watch) => watch.monitorEnabled !== false)
  );
  if (!hasTargets) return;
  await Promise.race([
    gitlabBridge?.refreshMonitor?.(),
    new Promise((resolve) => setTimeout(resolve, 3500))
  ]).catch(() => {});
}

async function refreshGitLabMonitorFromTray() {
  try {
    const statuses = await gitlabBridge?.refreshMonitor?.();
    const failed = (statuses ?? []).filter((item) => item.status === 'failed').length;
    if (Notification.isSupported()) {
      new Notification({
        title: 'GitLab Pipeline 已刷新',
        body: failed ? `${failed} 个观测项失败` : '暂无失败观测项'
      }).show();
    }
  } catch (error) {
    if (Notification.isSupported()) {
      new Notification({
        title: 'GitLab Pipeline 刷新失败',
        body: error instanceof Error ? error.message : String(error)
      }).show();
    }
  }
}

function gitLabWatchLabel(watch) {
  const selector = watch?.ciSelector || watch?.selector;
  if (!selector) return '';
  if (selector.type === 'fixed' || selector.type === 'regex') return selector.value || '';
  if (selector.type === 'rule') return `${selector.prefix || ''}${selector.separator || '-'}...`;
  return '';
}

function truncateMiddle(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  const head = Math.max(6, Math.floor((maxLength - 1) / 2));
  const tail = Math.max(5, maxLength - head - 1);
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

function buildTOTPTrayMenu() {
  const accountItems = sortTOTPAccounts(totpAccounts).map((account) => {
    const payload = accountWithCode(account);
    return {
      label: `${payload.code}  ${payload.remaining}s  ${payload.displayName}`,
      click: () => {
        clipboard.writeText(payload.code);
        if (Notification.isSupported()) {
          new Notification({
            title: '2FA 验证码已复制',
            body: payload.displayName
          }).show();
        }
      }
    };
  });

  return [
    accountItems.length > 0
      ? { label: '点击账号复制验证码', enabled: false }
      : { label: '暂无 2FA 账号', enabled: false },
    ...accountItems,
    { type: 'separator' },
    {
      label: '打开 2FA 管理',
      click: () => openToolInMainWindow('totp')
    }
  ];
}

function openToolInMainWindow(toolId) {
  showMainWindow();
  const send = () => mainWindow?.webContents.send('tool:select', toolId);
  if (mainWindow?.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

async function calculateFileHashesResponse(filePath, algorithms) {
  const inputPath = String(filePath || '');
  if (!inputPath) throw new Error('缺少文件路径');
  try {
    return {
      canceled: false,
      result: await calculateFileHashes(inputPath, algorithms)
    };
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function inspectJsonFileResponse(filePath) {
  const inputPath = String(filePath || '');
  if (!inputPath) throw new Error('缺少 JSON 文件路径');
  try {
    const isJsonLines = path.extname(inputPath).toLowerCase() === '.jsonl';
    return {
      canceled: false,
      result: isJsonLines ? await inspectJsonLinesFile(inputPath) : await inspectJsonFile(inputPath)
    };
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function createQuickNote() {
  const note = normalizeNote({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: '新便笺',
    text: '',
    shape: 'rounded',
    color: '#fff2a8',
    size: NOTE_DEFAULT_SIZE,
    fontSize: 15,
    remindAt: '',
    remindedAt: ''
  });
  notes.push(note);
  await saveNotes();
  await showNoteWindow(note.id);
}

function showAllNotes() {
  notes.forEach((note) => {
    showNoteWindow(note.id).catch((error) => console.error('Failed to show note:', error));
  });
}

async function renderMermaidToPng(source) {
  const mermaidScript = pathToFileURL(require.resolve('mermaid/dist/mermaid.min.js')).href;
  const window = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  try {
    const html = `<!doctype html>
      <html>
        <head><meta charset="utf-8"><script src="${mermaidScript}"></script></head>
        <body><div id="diagram"></div></body>
      </html>`;
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const svg = await window.webContents.executeJavaScript(
      `(async () => {
        if (!window.mermaid) throw new Error('Mermaid 加载失败');
        window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' });
        const result = await window.mermaid.render('electrontoolkit_mermaid_' + Date.now(), ${JSON.stringify(String(source || ''))});
        return typeof result === 'string' ? result : result.svg;
      })()`,
      true
    );
    if (!svg || typeof svg !== 'string') throw new Error('Mermaid 未返回 SVG');
    return sharp(Buffer.from(svg, 'utf8')).png().toBuffer();
  } finally {
    if (!window.isDestroyed()) window.close();
  }
}

app.whenReady().then(async () => {
  await migrateLegacyUserData();
  notesFilePath = path.join(app.getPath('userData'), 'task-notes.json');
  totpSettingsFilePath = path.join(app.getPath('userData'), 'totp-settings.json');
  ccSwitchManager = createCcSwitchManager({
    storePath: path.join(app.getPath('userData'), 'cc-switch-providers.json'),
    homeDir: app.getPath('home')
  });
  passwordVault = createPasswordVault({
    filePath: path.join(app.getPath('userData'), 'password-vault.json'),
    safeStorage
  });
  const gitlabDir = path.join(app.getPath('userData'), 'gitlab');
  const gitlabConfigStore = new GitLabConfigStore(path.join(gitlabDir, 'config.json'), { homeDir: app.getPath('home') });
  const gitlabTokenStore = new GitLabTokenStore(path.join(gitlabDir, 'tokens.json'), safeStorage);
  await gitlabConfigStore.load();
  await gitlabTokenStore.load();
  await loadTOTPSettings();
  await loadNotes();
  await loadTOTPAccounts();
  await passwordVault.load();

  gitlabBridge = registerGitLabIpc({
    ipcMain,
    getMainWindow: () => mainWindow,
    configStore: gitlabConfigStore,
    tokenStore: gitlabTokenStore,
    refreshTrayMenu
  });
  gitlabBridge.startMonitorLoop();

  ipcMain.handle('app:metadata', () => ({
    name: APP_META.displayName,
    version: app.getVersion()
  }));
  ipcMain.handle('app:version', () => app.getVersion());

  ipcMain.handle('hash:calculate', (_event, { algorithm, value }) => {
    const allowed = new Set(['md5', 'sha1', 'sha256', 'sha512']);
    if (!allowed.has(algorithm)) {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
    return crypto.createHash(algorithm).update(String(value ?? ''), 'utf8').digest('hex');
  });
  ipcMain.handle('hash:hmac', (_event, { algorithm, key, value }) => {
    const allowed = new Set(['md5', 'sha1', 'sha256', 'sha512']);
    if (!allowed.has(algorithm)) {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
    return crypto.createHmac(algorithm, String(key ?? '')).update(String(value ?? ''), 'utf8').digest('hex');
  });

  ipcMain.handle('hash:file', async (_event, { algorithms = FILE_HASH_ALGORITHMS } = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择要校验的文件',
      buttonLabel: '计算哈希',
      properties: ['openFile'],
      filters: [{ name: 'All Files', extensions: ['*'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return calculateFileHashesResponse(result.filePaths[0], algorithms);
  });

  ipcMain.handle('hash:file-path', async (_event, { filePath, algorithms = FILE_HASH_ALGORITHMS } = {}) => {
    return calculateFileHashesResponse(filePath, algorithms);
  });

  ipcMain.handle('uuid:v4', () => crypto.randomUUID());

  ipcMain.handle('text:punycode', (_event, { action, value }) => {
    const input = String(value ?? '').trim();
    if (action === 'decode') return punycode.toUnicode(input);
    return punycode.toASCII(input);
  });

  ipcMain.handle('convert:structured', (_event, { action, value }) => {
    const input = String(value ?? '');
    if (action === 'json-yaml') return yaml.dump(JSON.parse(input), { noRefs: true });
    if (action === 'yaml-json') return JSON.stringify(yaml.load(input), null, 2);
    if (action === 'json-xml') {
      const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
      return builder.build({ root: JSON.parse(input) });
    }
    if (action === 'xml-json') {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
      return JSON.stringify(parser.parse(input), null, 2);
    }
    throw new Error(`Unsupported convert action: ${action}`);
  });

  ipcMain.handle('cron:next', (_event, { expression }) => {
    const interval = CronExpressionParser.parse(String(expression ?? '').trim());
    return Array.from({ length: 5 }, () => interval.next().toString()).join('\n');
  });

  ipcMain.handle('crypto:symmetric', (_event, payload) => {
    return runSymmetricCrypto(payload);
  });

  ipcMain.handle('rsa:generate', (_event, { bits = 2048, format = 'pkcs8' }) => {
    const privateType = format === 'pkcs1' ? 'pkcs1' : 'pkcs8';
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: Number(bits),
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: privateType, format: 'pem' }
    });
    return `${publicKey}\n${privateKey}`;
  });

  ipcMain.handle('sm:run', (_event, { action, value }) => {
    const input = String(value ?? '');
    if (action === 'sm3') return sm3(input);
    if (action === 'sm2-keypair') return JSON.stringify(sm2.generateKeyPairHex(), null, 2);
    if (action === 'sm4-encrypt') return sm4.encrypt(input, '0123456789abcdeffedcba9876543210');
    if (action === 'sm4-decrypt') return sm4.decrypt(input, '0123456789abcdeffedcba9876543210');
    throw new Error(`Unsupported SM action: ${action}`);
  });

  ipcMain.handle('qr:generate', async (_event, { value, options = {} }) => {
    const width = clamp(Number(options.width) || 240, 160, 420);
    const margin = clamp(Number(options.margin) || 2, 0, 8);
    const correction = ['L', 'M', 'Q', 'H'].includes(options.errorCorrectionLevel) ? options.errorCorrectionLevel : 'M';
    return QRCode.toString(String(value ?? ''), {
      type: 'svg',
      errorCorrectionLevel: correction,
      margin,
      width
    });
  });

  ipcMain.handle('qr:decode', (_event, { dataUrl }) => {
    return decodePngQRCodeDataUrl(dataUrl);
  });

  ipcMain.handle('image:convert', async (_event, { dataUrl, targetFormat, fileName }) => {
    const input = bufferFromDataUrl(dataUrl);
    const converted = await convertImageBuffer(input, targetFormat);
    const baseName = path.basename(String(fileName || 'image'), path.extname(String(fileName || 'image')));
    return {
      base64: converted.buffer.toString('base64'),
      mimeType: converted.mimeType,
      fileName: `${sanitizeFileName(baseName)}.${converted.extension}`,
      extension: converted.extension,
      size: converted.buffer.length,
      width: converted.width,
      height: converted.height
    };
  });

  ipcMain.handle('markdown:docx', async (_event, { markdown, fileName, baseDir } = {}) => {
    const input = String(markdown ?? '');
    if (!input.trim()) throw new Error('请输入 Markdown 内容');
    const safeName = sanitizeDocxFileName(fileName || 'markdown-document');
    const converted = await markdownToDocxBuffer(input, {
      title: path.basename(safeName, '.docx'),
      baseDir: String(baseDir || '').trim(),
      renderMermaid: async (source) => ({ buffer: await renderMermaidToPng(source) })
    });
    return {
      base64: converted.buffer.toString('base64'),
      fileName: safeName,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: converted.buffer.length,
      warnings: converted.warnings
    };
  });

  ipcMain.handle('plantuml:render', async (_event, { source, serverUrl, format } = {}) => {
    const normalizedSource = normalizePlantUmlSource(source);
    const outputFormat = String(format || 'svg').toLowerCase();
    const url = buildPlantUmlUrl({
      source: normalizedSource,
      serverUrl: serverUrl || DEFAULT_PLANTUML_SERVER,
      format: outputFormat
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let response;
    try {
      response = await fetch(url, {
        headers: { Accept: outputFormat === 'svg' ? 'image/svg+xml,text/plain;q=0.9,*/*;q=0.8' : 'image/png,*/*;q=0.8' },
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('PlantUML 渲染超时，请检查 Server 地址或稍后重试');
      throw new Error(`PlantUML 渲染失败：${error.message || error}`);
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`PlantUML Server 返回 ${response.status}${detail ? `：${detail.slice(0, 240)}` : ''}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const baseName = `plantuml-${Date.now()}`;
    const result = {
      base64: buffer.toString('base64'),
      fileName: `${baseName}.${outputFormat}`,
      mimeType: outputFormat === 'svg' ? 'image/svg+xml' : 'image/png',
      size: buffer.length,
      format: outputFormat,
      source: normalizedSource,
      url
    };
    if (outputFormat === 'svg') result.svg = buffer.toString('utf8');
    return result;
  });

  ipcMain.handle('file:save-converted', async (_event, { base64, fileName }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: fileName || 'converted-image',
      buttonLabel: '保存'
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await writeFile(result.filePath, Buffer.from(String(base64 ?? ''), 'base64'));
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('cc-switch:list', async () => ccSwitchManager.list());
  ipcMain.handle('cc-switch:save-provider', async (_event, payload) => {
    const result = await ccSwitchManager.saveProvider(payload);
    ccSwitchTrayState = result;
    refreshTrayMenu();
    return result;
  });
  ipcMain.handle('cc-switch:delete-provider', async (_event, { id }) => {
    const result = await ccSwitchManager.deleteProvider(id);
    ccSwitchTrayState = result;
    refreshTrayMenu();
    return result;
  });
  ipcMain.handle('cc-switch:apply-provider', async (_event, payload) => {
    const result = await ccSwitchManager.applyProvider(payload);
    ccSwitchTrayState = result;
    refreshTrayMenu();
    return result;
  });
  ipcMain.handle('cc-switch:import-existing', async (_event, payload) => {
    const result = await ccSwitchManager.importExistingCcSwitch(payload);
    ccSwitchTrayState = result;
    refreshTrayMenu();
    return result;
  });
  ipcMain.handle('cc-switch:read-config', async (_event, { app }) => ccSwitchManager.readAppConfig(app));
  ipcMain.handle('cc-switch:write-config', async (_event, payload) => ccSwitchManager.writeAppConfigRaw(payload));

  ipcMain.handle('json:file-inspect', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 JSON 文件',
      buttonLabel: '检查 JSON',
      properties: ['openFile'],
      filters: [
        { name: 'JSON Files', extensions: ['json', 'jsonl', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return inspectJsonFileResponse(result.filePaths[0]);
  });

  ipcMain.handle('json:file-inspect-path', async (_event, { filePath }) => {
    return inspectJsonFileResponse(filePath);
  });

  ipcMain.handle('json:file-minify', async (_event, { filePath }) => {
    const inputPath = String(filePath || '');
    if (!inputPath) throw new Error('缺少 JSON 文件路径');
    const parsedPath = path.parse(inputPath);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出压缩 JSON',
      defaultPath: path.join(parsedPath.dir, `${parsedPath.name}.min${parsedPath.ext || '.json'}`),
      buttonLabel: '导出',
      filters: [
        { name: 'JSON Files', extensions: ['json', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      return {
        canceled: false,
        result: await minifyJsonFile(inputPath, result.filePath)
      };
    } catch (error) {
      return {
        canceled: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('json:file-format', async (_event, { filePath }) => {
    const inputPath = String(filePath || '');
    if (!inputPath) throw new Error('缺少 JSON 文件路径');
    const parsedPath = path.parse(inputPath);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出格式化 JSON',
      defaultPath: path.join(parsedPath.dir, `${parsedPath.name}.pretty${parsedPath.ext || '.json'}`),
      buttonLabel: '导出',
      filters: [
        { name: 'JSON Files', extensions: ['json', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      return {
        canceled: false,
        result: await formatJsonFile(inputPath, result.filePath, { indent: 2 })
      };
    } catch (error) {
      return {
        canceled: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('json:file-extract-key', async (_event, { filePath, key }) => {
    const inputPath = String(filePath || '');
    const targetKey = String(key || '').trim();
    if (!inputPath) throw new Error('缺少 JSON 文件路径');
    if (!targetKey) throw new Error('请输入要提取的顶层 key');
    const parsedPath = path.parse(inputPath);
    const safeKey = sanitizeFileName(targetKey).slice(0, 48) || 'key';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出顶层 key',
      defaultPath: path.join(parsedPath.dir, `${parsedPath.name}.${safeKey}${parsedPath.ext || '.json'}`),
      buttonLabel: '导出',
      filters: [
        { name: 'JSON Files', extensions: ['json', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      return {
        canceled: false,
        result: await extractTopLevelKeyJsonFile(inputPath, result.filePath, targetKey)
      };
    } catch (error) {
      return {
        canceled: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('jsonl:file-export-csv', async (_event, { filePath, fields }) => {
    const inputPath = String(filePath || '');
    if (!inputPath) throw new Error('缺少 JSONL 文件路径');
    const parsedPath = path.parse(inputPath);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出 JSONL 字段 CSV',
      defaultPath: path.join(parsedPath.dir, `${parsedPath.name}.fields.csv`),
      buttonLabel: '导出 CSV',
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      return {
        canceled: false,
        result: await exportJsonLinesFieldsCsvFile(inputPath, result.filePath, fields)
      };
    } catch (error) {
      return {
        canceled: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('notes:list', () => sortNotes(notes));
  ipcMain.handle('notes:create', async (_event, payload) => {
    const note = normalizeNote({
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: payload?.title || '新便笺',
      text: payload?.text || '',
      shape: payload?.shape || 'rounded',
      color: payload?.color || '#fff2a8',
      size: payload?.size,
      fontSize: payload?.fontSize,
      remindAt: payload?.remindAt || '',
      remindedAt: ''
    });
    notes.push(note);
    await saveNotes();
    scheduleReminder(note);
    await showNoteWindow(note.id);
    return note;
  });
  ipcMain.handle('notes:update', async (_event, { id, patch }) => {
    const note = notes.find((item) => item.id === id);
    if (!note) throw new Error('便笺不存在');
    const previousRemindAt = note.remindAt;
    Object.assign(note, sanitizeNotePatch(patch), { updatedAt: Date.now() });
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'remindAt') && note.remindAt !== previousRemindAt) {
      note.remindedAt = '';
    }
    await saveNotes();
    scheduleReminder(note);
    applyNoteWindowLayout(note, patch);
    sendNoteData(note);
    return note;
  });
  ipcMain.handle('notes:delete', async (_event, { id }) => {
    notes = notes.filter((note) => note.id !== id);
    clearReminder(id);
    const noteWindow = noteWindows.get(id);
    if (noteWindow && !noteWindow.isDestroyed()) noteWindow.close();
    await saveNotes();
    return sortNotes(notes);
  });
  ipcMain.handle('notes:show', async (_event, { id }) => showNoteWindow(id));
  ipcMain.handle('notes:hide', (_event, { id }) => {
    const noteWindow = noteWindows.get(id);
    if (noteWindow && !noteWindow.isDestroyed()) noteWindow.close();
  });
  ipcMain.handle('notes:move-by', (event, { dx, dy }) => {
    const noteWindow = BrowserWindow.fromWebContents(event.sender);
    if (!noteWindow || noteWindow.isDestroyed()) return null;
    const [x, y] = noteWindow.getPosition();
    noteWindow.setPosition(Math.round(x + Number(dx || 0)), Math.round(y + Number(dy || 0)), false);
    return noteWindow.getBounds();
  });
  ipcMain.handle('notes:resize-by', async (event, { dx, dy, edge = 'se' }) => {
    const noteWindow = BrowserWindow.fromWebContents(event.sender);
    if (!noteWindow || noteWindow.isDestroyed()) return null;
    const note = findNoteByWindow(noteWindow);
    const bounds = noteWindow.getBounds();
    const nextBounds = calculateResizedNoteBounds(bounds, {
      dx: Number(dx || 0),
      dy: Number(dy || 0),
      edge: normalizeResizeEdge(edge),
      keepSquare: Boolean(note && note.shape !== 'rounded')
    });
    noteWindow.setBounds(nextBounds, false);
    if (note) {
      note.bounds = normalizeBounds(noteWindow.getBounds());
      note.size = Math.round(Math.max(note.bounds.width, note.bounds.height));
      note.updatedAt = Date.now();
    }
    return noteWindow.getBounds();
  });
  ipcMain.handle('notes:ready', (event, { id }) => {
    const note = notes.find((item) => item.id === id);
    if (note) event.sender.send('notes:data', note);
  });

  ipcMain.handle('totp:list', () => buildTOTPListResponse());
  ipcMain.handle('totp:choose-storage', async () => {
    const action = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: '选择 2FA 存储文件',
      message: '请选择已有的 JSON 文件，或新建一个 JSON 文件。',
      detail: '如果目标 accounts.json 已经存在，直接选择该文件即可，程序不会先覆盖再读取。',
      buttons: ['选择已有 JSON 文件', '新建 JSON 文件', '取消'],
      defaultId: 0,
      cancelId: 2
    });
    if (action.response === 2) return { canceled: true, ...buildTOTPListResponse() };

    const nextPath =
      action.response === 0 ? await chooseExistingTOTPStorageFile() : await chooseNewTOTPStorageFile();
    if (!nextPath) return { canceled: true, ...buildTOTPListResponse() };

    const copyCurrentAccounts = action.response === 1;
    await useTOTPStorageFile(nextPath, { copyCurrentAccounts });
    return { canceled: false, ...buildTOTPListResponse() };
  });
  ipcMain.handle('totp:save', async (_event, payload) => {
    const account = accountFromInput(payload);
    return upsertTOTPAccount(account);
  });
  ipcMain.handle('totp:delete', async (_event, { id }) => {
    totpAccounts = totpAccounts.filter((account) => account.id !== id);
    await saveTOTPAccounts();
    refreshTrayMenu();
    return buildTOTPListResponse();
  });
  ipcMain.handle('totp:generate-temp', (_event, payload) => {
    const account = accountFromInput(payload);
    return accountWithCode(account);
  });
  ipcMain.handle('totp:import-screen-qr', async () => {
    const decoded = await captureScreenRegionQRCode();
    if (!decoded) return { canceled: true, ...buildTOTPListResponse() };
    const response = await saveTOTPAccountFromQRCode(decoded);
    return { decoded, ...response };
  });

  ipcMain.handle('passwords:list', async () => buildPasswordVaultResponse());
  ipcMain.handle('passwords:save', async (_event, payload) => {
    await passwordVault.saveCredential(payload);
    refreshTrayMenu();
    return buildPasswordVaultResponse();
  });
  ipcMain.handle('passwords:delete', async (_event, { id }) => {
    await passwordVault.deleteCredential(id);
    refreshTrayMenu();
    return buildPasswordVaultResponse();
  });
  ipcMain.handle('passwords:reveal', (_event, { id }) => ({ password: passwordVault.revealPassword(id) }));
  ipcMain.handle('passwords:copy-password', (_event, { id }) => {
    clipboard.writeText(passwordVault.revealPassword(id));
    return { ok: true };
  });
  ipcMain.handle('passwords:copy-account', (_event, { id }) => {
    const item = passwordVault.findItem(id);
    const password = passwordVault.revealPassword(id);
    clipboard.writeText(`用户名：${item.username}\n密码：${password}`);
    return { ok: true };
  });
  ipcMain.handle('passwords:import-csv', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入浏览器或 Apple Passwords 导出的 CSV',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true, ...buildPasswordVaultResponse() };
    const summary = { imported: 0, updated: 0, skipped: 0 };
    for (const filePath of result.filePaths) {
      const imported = await passwordVault.importCsvFile(filePath);
      summary.imported += imported.imported;
      summary.updated += imported.updated;
      summary.skipped += imported.skipped;
    }
    refreshTrayMenu();
    return { canceled: false, importResult: summary, ...buildPasswordVaultResponse() };
  });

  createWindow();
  createTray();
  await refreshCcSwitchTrayState();
  refreshTrayMenu();
  globalShortcut.register('CommandOrControl+Shift+Space', toggleWindow);
  scheduleAllReminders();

  app.on('activate', () => {
    showMainWindow();
  });
});

async function loadNotes() {
  try {
    const raw = await readFile(notesFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    notes = Array.isArray(parsed) ? parsed.map(normalizeNote) : [];
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    notes = [];
  }
}

async function saveNotes() {
  await mkdir(path.dirname(notesFilePath), { recursive: true });
  await writeFile(notesFilePath, JSON.stringify(sortNotes(notes), null, 2), 'utf8');
}

function defaultTOTPAccountsFilePath() {
  return path.join(app.getPath('userData'), 'totp-accounts.json');
}

async function chooseExistingTOTPStorageFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择已有 2FA 存储文件',
    buttonLabel: '使用这个文件',
    defaultPath: totpAccountsFilePath || defaultTOTPAccountsFilePath(),
    filters: [{ name: 'JSON 文件', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return '';
  return result.filePaths[0];
}

async function chooseNewTOTPStorageFile() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '新建 2FA 存储文件',
    buttonLabel: '使用这个位置',
    defaultPath: totpAccountsFilePath || defaultTOTPAccountsFilePath(),
    filters: [{ name: 'JSON 文件', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return '';
  return result.filePath;
}

async function useTOTPStorageFile(nextPath, { copyCurrentAccounts = false } = {}) {
  const nextStorage = await readTOTPAccountsFileSafely(nextPath);
  if (nextStorage.exists) {
    totpAccountsFilePath = nextPath;
    totpAccounts = nextStorage.accounts;
    totpStorageWarning = nextStorage.warning;
    await saveTOTPSettings();
    refreshTrayMenu();
    return;
  }

  if (path.resolve(nextPath) !== path.resolve(totpAccountsFilePath)) {
    totpAccountsFilePath = nextPath;
    totpStorageWarning = '';
    await saveTOTPSettings();
    if (copyCurrentAccounts) await saveTOTPAccounts();
    refreshTrayMenu();
  }
}

async function loadTOTPSettings() {
  totpAccountsFilePath = defaultTOTPAccountsFilePath();
  try {
    const raw = await readFile(totpSettingsFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed?.storagePath === 'string' && parsed.storagePath.trim()) {
      totpAccountsFilePath = parsed.storagePath;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error('Failed to load TOTP settings:', error);
  }
}

async function saveTOTPSettings() {
  await mkdir(path.dirname(totpSettingsFilePath), { recursive: true });
  await writeFile(totpSettingsFilePath, JSON.stringify({ storagePath: totpAccountsFilePath }, null, 2), 'utf8');
}

async function loadTOTPAccounts() {
  const storage = await readTOTPAccountsFileSafely(totpAccountsFilePath);
  if (storage.exists) {
    totpAccounts = storage.accounts;
    totpStorageWarning = storage.warning;
    return;
  }

  totpStorageWarning = '';
  totpAccounts = await loadLegacyTOTPAccounts();
  if (totpAccounts.length > 0) await saveTOTPAccounts();
}

async function loadLegacyTOTPAccounts() {
  const legacyPath = path.join(app.getPath('appData'), 'TwoFATool', 'accounts.json');
  try {
    const raw = await readFile(legacyPath, 'utf8');
    return normalizeTOTPAccounts(JSON.parse(raw));
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error('Failed to migrate TwoFATool accounts:', error);
    return [];
  }
}

function normalizeTOTPAccounts(parsed) {
  return normalizeTOTPAccountsWithDiagnostics(parsed).accounts;
}

function normalizeTOTPAccountsWithDiagnostics(parsed) {
  if (!Array.isArray(parsed)) {
    return { accounts: [], invalidCount: 0, invalidContainer: true, totalCount: 0 };
  }

  let invalidCount = 0;
  const accounts = parsed.flatMap((item) => {
    try {
      return normalizeTOTPAccount(item);
    } catch (error) {
      invalidCount += 1;
      console.error('Skipped invalid TOTP account:', error);
      return [];
    }
  });

  return { accounts, invalidCount, invalidContainer: false, totalCount: parsed.length };
}

async function readTOTPAccountsFileSafely(filePath) {
  let raw = '';
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, accounts: [], warning: '' };
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error('Failed to parse TOTP accounts JSON:', error);
    return { exists: true, accounts: [], warning: 'JSON 文件解析失败，已按空 2FA 账号处理。' };
  }

  const normalized = normalizeTOTPAccountsWithDiagnostics(parsed);
  if (normalized.invalidContainer) {
    return { exists: true, accounts: [], warning: 'JSON 文件不符合 2FA 账号格式，已按空 2FA 账号处理。' };
  }

  if (normalized.invalidCount > 0) {
    const warning =
      normalized.accounts.length > 0
        ? `JSON 文件中有 ${normalized.invalidCount} 条 2FA 账号格式不符合要求，已跳过。`
        : 'JSON 文件不符合 2FA 账号格式，已按空 2FA 账号处理。';
    return { exists: true, accounts: normalized.accounts, warning };
  }

  return { exists: true, accounts: normalized.accounts, warning: '' };
}

async function saveTOTPAccounts() {
  await mkdir(path.dirname(totpAccountsFilePath), { recursive: true });
  await writeFile(totpAccountsFilePath, JSON.stringify(sortTOTPAccounts(totpAccounts), null, 2), 'utf8');
  totpStorageWarning = '';
}

function buildTOTPListResponse() {
  return {
    storagePath: totpAccountsFilePath,
    warning: totpStorageWarning,
    accounts: sortTOTPAccounts(totpAccounts).map((account) => accountWithCode(account))
  };
}

async function buildPasswordVaultResponse() {
  return {
    encryption: passwordVault?.encryptionMode?.() || 'unknown',
    warning: passwordVault?.warning || '',
    accounts: await passwordVault.list()
  };
}

async function upsertTOTPAccount(account) {
  const existingIndex = totpAccounts.findIndex((item) => item.id === account.id);
  const now = Date.now();
  if (existingIndex >= 0) {
    totpAccounts[existingIndex] = {
      ...account,
      createdAt: totpAccounts[existingIndex].createdAt || now,
      updatedAt: now
    };
  } else {
    totpAccounts.push({ ...account, createdAt: now, updatedAt: now });
  }
  await saveTOTPAccounts();
  refreshTrayMenu();
  return buildTOTPListResponse();
}

async function saveTOTPAccountFromQRCode(decoded) {
  return upsertTOTPAccount(accountFromInput({ secretOrURL: decoded }));
}

function decodePngQRCodeDataUrl(dataUrl) {
  const match = String(dataUrl ?? '').match(/^data:image\/png;base64,(.+)$/);
  if (!match) throw new Error('当前二维码解码仅支持 PNG 图片');
  const png = PNG.sync.read(Buffer.from(match[1], 'base64'));
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (!code) throw new Error('未识别到二维码内容');
  return code.data;
}

function displayForMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    return screen.getDisplayNearestPoint({
      x: Math.round(bounds.x + bounds.width / 2),
      y: Math.round(bounds.y + bounds.height / 2)
    });
  }
  return screen.getPrimaryDisplay();
}

async function selectScreenRegion() {
  const display = displayForMainWindow();
  const token = crypto.randomUUID();
  let settled = false;
  let pickerWindow;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      ipcMain.removeAllListeners(`screenshot-region:selected:${token}`);
      ipcMain.removeAllListeners(`screenshot-region:canceled:${token}`);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (pickerWindow && !pickerWindow.isDestroyed()) pickerWindow.close();
      resolve(value);
    };

    ipcMain.once(`screenshot-region:selected:${token}`, (_event, rect) => {
      finish({ rect, display });
    });
    ipcMain.once(`screenshot-region:canceled:${token}`, () => {
      finish(null);
    });

    pickerWindow = new BrowserWindow({
      ...display.bounds,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'screenshot-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    pickerWindow.setAlwaysOnTop(true, 'screen-saver');
    pickerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    pickerWindow.once('ready-to-show', () => pickerWindow.show());
    pickerWindow.once('closed', () => finish(null));
    pickerWindow.loadFile(path.join(__dirname, 'renderer', 'screenshot-picker.html'), {
      query: { token }
    }).catch((error) => {
      cleanup();
      reject(error);
    });
  });
}

async function captureScreenRegionQRCode() {
  const selection = await selectScreenRegion();
  if (!selection) return null;

  const { rect, display } = selection;
  const captureWidth = Math.round(display.bounds.width * display.scaleFactor);
  const captureHeight = Math.round(display.bounds.height * display.scaleFactor);
  let sources;
  try {
    sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: captureWidth, height: captureHeight }
    });
  } catch {
    throw new Error(`无法截取屏幕，请在系统设置中允许 ${APP_META.displayName} 进行屏幕录制`);
  }
  const source = sources.find((item) => String(item.display_id) === String(display.id)) ?? sources[0];
  if (!source || source.thumbnail.isEmpty()) throw new Error(`无法截取屏幕，请在系统设置中允许 ${APP_META.displayName} 进行屏幕录制`);

  const screenPng = source.thumbnail.toPNG();
  const png = PNG.sync.read(screenPng);
  const ratioX = png.width / display.bounds.width;
  const ratioY = png.height / display.bounds.height;
  const left = clamp(Math.round(rect.x * ratioX), 0, Math.max(0, png.width - 1));
  const top = clamp(Math.round(rect.y * ratioY), 0, Math.max(0, png.height - 1));
  const width = clamp(Math.round(rect.width * ratioX), 1, png.width - left);
  const height = clamp(Math.round(rect.height * ratioY), 1, png.height - top);
  const cropped = await sharp(screenPng)
    .extract({ left, top, width, height })
    .png()
    .toBuffer();
  return decodePngQRCodeDataUrl(`data:image/png;base64,${cropped.toString('base64')}`);
}

function sortTOTPAccounts(items) {
  return [...items].sort((a, b) => {
    const issuerCompare = String(a.issuer || '').localeCompare(String(b.issuer || ''), 'zh-CN');
    if (issuerCompare !== 0) return issuerCompare;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
  });
}

function normalizeNote(note) {
  const now = Date.now();
  return {
    id: String(note.id || crypto.randomUUID()),
    title: String(note.title || '任务便笺').slice(0, 80),
    text: String(note.text || '').slice(0, 4000),
    shape: NOTE_SHAPES.has(note.shape) ? note.shape : 'rounded',
    color: /^#[0-9a-f]{6}$/i.test(String(note.color || '')) ? String(note.color) : '#fff2a8',
    size: normalizeNoteSize(note.size ?? note.bounds?.width),
    fontSize: normalizeNoteFontSize(note.fontSize),
    remindAt: normalizeReminder(note.remindAt),
    remindedAt: note.remindedAt ? String(note.remindedAt) : '',
    bounds: normalizeBounds(note.bounds),
    createdAt: Number(note.createdAt) || now,
    updatedAt: Number(note.updatedAt) || now
  };
}

function sanitizeNotePatch(patch = {}) {
  const sanitized = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) sanitized.title = String(patch.title || '任务便笺').slice(0, 80);
  if (Object.prototype.hasOwnProperty.call(patch, 'text')) sanitized.text = String(patch.text || '').slice(0, 4000);
  if (Object.prototype.hasOwnProperty.call(patch, 'shape')) sanitized.shape = NOTE_SHAPES.has(patch.shape) ? patch.shape : 'rounded';
  if (Object.prototype.hasOwnProperty.call(patch, 'color')) sanitized.color = /^#[0-9a-f]{6}$/i.test(String(patch.color || '')) ? String(patch.color) : '#fff2a8';
  if (Object.prototype.hasOwnProperty.call(patch, 'size')) sanitized.size = normalizeNoteSize(patch.size);
  if (Object.prototype.hasOwnProperty.call(patch, 'fontSize')) sanitized.fontSize = normalizeNoteFontSize(patch.fontSize);
  if (Object.prototype.hasOwnProperty.call(patch, 'remindAt')) sanitized.remindAt = normalizeReminder(patch.remindAt);
  if (Object.prototype.hasOwnProperty.call(patch, 'bounds')) sanitized.bounds = normalizeBounds(patch.bounds);
  return sanitized;
}

function normalizeNoteSize(value) {
  const size = Math.round(Number(value));
  return Number.isFinite(size) ? clamp(size, NOTE_MIN_SIZE, NOTE_MAX_SIZE) : NOTE_DEFAULT_SIZE;
}

function normalizeNoteFontSize(value) {
  const fontSize = Math.round(Number(value));
  return Number.isFinite(fontSize) ? clamp(fontSize, 11, 28) : 15;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeReminder(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') return null;
  const x = Math.round(Number(bounds.x));
  const y = Math.round(Number(bounds.y));
  const width = Math.round(Number(bounds.width));
  const height = Math.round(Number(bounds.height));
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return {
    x,
    y,
    width: clamp(width, NOTE_MIN_SIZE, NOTE_MAX_SIZE),
    height: clamp(height, NOTE_MIN_SIZE, NOTE_MAX_SIZE)
  };
}

function normalizeResizeEdge(edge) {
  const value = String(edge || 'se').toLowerCase();
  return /^(n|s|e|w|ne|nw|se|sw)$/.test(value) ? value : 'se';
}

function calculateResizedNoteBounds(bounds, { dx, dy, edge, keepSquare }) {
  let { x, y, width, height } = bounds;
  const movesWest = edge.includes('w');
  const movesEast = edge.includes('e');
  const movesNorth = edge.includes('n');
  const movesSouth = edge.includes('s');

  if (keepSquare) {
    const horizontalDelta = movesEast ? dx : movesWest ? -dx : 0;
    const verticalDelta = movesSouth ? dy : movesNorth ? -dy : 0;
    const delta = Math.abs(horizontalDelta) >= Math.abs(verticalDelta) ? horizontalDelta : verticalDelta;
    const currentSize = Math.max(width, height);
    const nextSize = clamp(currentSize + delta, NOTE_MIN_SIZE, NOTE_MAX_SIZE);
    if (movesWest) x += width - nextSize;
    if (movesNorth) y += height - nextSize;
    return { x: Math.round(x), y: Math.round(y), width: nextSize, height: nextSize };
  }

  let nextWidth = width;
  let nextHeight = height;
  if (movesEast) nextWidth = clamp(width + dx, NOTE_MIN_SIZE, NOTE_MAX_SIZE);
  if (movesWest) nextWidth = clamp(width - dx, NOTE_MIN_SIZE, NOTE_MAX_SIZE);
  if (movesSouth) nextHeight = clamp(height + dy, NOTE_MIN_SIZE, NOTE_MAX_SIZE);
  if (movesNorth) nextHeight = clamp(height - dy, NOTE_MIN_SIZE, NOTE_MAX_SIZE);

  if (movesWest) x += width - nextWidth;
  if (movesNorth) y += height - nextHeight;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(nextWidth),
    height: Math.round(nextHeight)
  };
}

function sortNotes(items) {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt);
}

async function showNoteWindow(id, { reminder = false } = {}) {
  const note = notes.find((item) => item.id === id);
  if (!note) throw new Error('便笺不存在');
  let noteWindow = noteWindows.get(id);
  let created = false;
  if (!noteWindow || noteWindow.isDestroyed()) {
    noteWindow = createNoteWindow(note);
    noteWindows.set(id, noteWindow);
    created = true;
  }
  if (created) await waitForReadyToShow(noteWindow);
  if (noteWindow.isMinimized()) noteWindow.restore();
  noteWindow.setAlwaysOnTop(true, reminder ? 'screen-saver' : 'floating');
  noteWindow.show();
  noteWindow.moveTop();
  if (reminder) {
    noteWindow.focus();
    noteWindow.flashFrame(true);
    noteWindow.webContents.send('notes:reminder');
  }
  sendNoteData(note);
  return note;
}

function waitForReadyToShow(window) {
  if (!window || window.isDestroyed()) return Promise.resolve();
  if (!window.webContents.isLoading()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    window.once('ready-to-show', done);
    window.once('closed', done);
    setTimeout(done, 1500);
  });
}

function createNoteWindow(note) {
  let boundsSaveTimer = null;
  const defaultSize = normalizeNoteSize(note.size);
  const initialWidth = note.bounds?.width || defaultSize;
  const initialHeight = note.bounds?.height || (note.shape === 'rounded' ? Math.round(defaultSize * 0.78) : defaultSize);
  const noteWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: note.bounds?.x,
    y: note.bounds?.y,
    minWidth: NOTE_MIN_SIZE,
    minHeight: NOTE_MIN_SIZE,
    maxWidth: NOTE_MAX_SIZE,
    maxHeight: NOTE_MAX_SIZE,
    frame: false,
    transparent: true,
    resizable: true,
    show: false,
    alwaysOnTop: true,
    title: note.title,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  noteWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  noteWindow.loadFile(path.join(__dirname, 'renderer', 'note.html'), { query: { id: note.id } });
  const saveCurrentBounds = () => {
    const current = notes.find((item) => item.id === note.id);
    if (!current || noteWindow.isDestroyed()) return;
    current.bounds = normalizeBounds(noteWindow.getBounds());
    current.size = Math.round(Math.max(current.bounds.width, current.bounds.height));
    current.updatedAt = Date.now();
    saveNotes().catch((error) => console.error('Failed to save note bounds:', error));
  };
  const scheduleBoundsSave = () => {
    if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
    boundsSaveTimer = setTimeout(saveCurrentBounds, 260);
  };
  noteWindow.on('moved', scheduleBoundsSave);
  noteWindow.on('resized', scheduleBoundsSave);
  noteWindow.on('close', () => {
    if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
    const current = notes.find((item) => item.id === note.id);
    if (current) {
      current.bounds = normalizeBounds(noteWindow.getBounds());
      current.size = Math.round(Math.max(current.bounds.width, current.bounds.height));
      current.updatedAt = Date.now();
      saveNotes().catch((error) => console.error('Failed to save note bounds:', error));
    }
    noteWindows.delete(note.id);
  });
  return noteWindow;
}

function sendNoteData(note) {
  const noteWindow = noteWindows.get(note.id);
  if (noteWindow && !noteWindow.isDestroyed()) noteWindow.webContents.send('notes:data', note);
}

function applyNoteWindowLayout(note, patch = {}) {
  const noteWindow = noteWindows.get(note.id);
  if (!noteWindow || noteWindow.isDestroyed()) return;
  const shouldResize =
    Object.prototype.hasOwnProperty.call(patch, 'size') ||
    Object.prototype.hasOwnProperty.call(patch, 'shape');
  if (!shouldResize) return;

  const bounds = noteWindow.getBounds();
  const nextSize = normalizeNoteSize(note.size);
  const nextBounds =
    note.shape === 'rounded'
      ? { ...bounds, width: nextSize, height: Math.round(nextSize * 0.78) }
      : { ...bounds, width: nextSize, height: nextSize };
  noteWindow.setBounds(nextBounds, false);
  note.bounds = normalizeBounds(noteWindow.getBounds());
  note.size = Math.round(Math.max(note.bounds.width, note.bounds.height));
  saveNotes().catch((error) => console.error('Failed to save note layout:', error));
}

function findNoteByWindow(targetWindow) {
  for (const [id, noteWindow] of noteWindows.entries()) {
    if (noteWindow === targetWindow) return notes.find((note) => note.id === id) ?? null;
  }
  return null;
}

function scheduleAllReminders() {
  notes.forEach(scheduleReminder);
}

function scheduleReminder(note) {
  clearReminder(note.id);
  if (!note.remindAt || note.remindedAt) return;
  const delay = new Date(note.remindAt).getTime() - Date.now();
  if (!Number.isFinite(delay)) return;
  if (delay <= 0) {
    triggerReminder(note.id);
    return;
  }
  reminderTimers.set(note.id, setTimeout(() => {
    if (delay > MAX_TIMER_DELAY) {
      scheduleReminder(note);
    } else {
      triggerReminder(note.id);
    }
  }, Math.min(delay, MAX_TIMER_DELAY)));
}

function clearReminder(id) {
  const timer = reminderTimers.get(id);
  if (timer) clearTimeout(timer);
  reminderTimers.delete(id);
}

async function triggerReminder(id) {
  clearReminder(id);
  const note = notes.find((item) => item.id === id);
  if (!note || note.remindedAt) return;
  note.remindedAt = new Date().toISOString();
  await saveNotes();
  await showNoteWindow(id, { reminder: true });
  if (Notification.isSupported()) {
    new Notification({
      title: `便笺提醒：${note.title}`,
      body: note.text.trim().slice(0, 120) || '到时间了'
    }).show();
  }
}

function runSymmetricCrypto({ action, algorithm, mode, padding, key, iv, value }) {
  const input = String(value ?? '');
  const selectedAlgorithm = String(algorithm || 'AES').toUpperCase();
  const selectedMode = CryptoJS.mode[String(mode || 'CBC').toUpperCase()] ?? CryptoJS.mode.CBC;
  const selectedPadding = padding === 'NoPadding' ? CryptoJS.pad.NoPadding : CryptoJS.pad.Pkcs7;

  if (selectedAlgorithm === 'RC4') {
    if (action === 'decrypt') {
      return CryptoJS.RC4.decrypt(input, String(key ?? '')).toString(CryptoJS.enc.Utf8);
    }
    return CryptoJS.RC4.encrypt(input, String(key ?? '')).toString();
  }

  const cipher = selectedAlgorithm === 'DES' ? CryptoJS.DES : CryptoJS.AES;
  const keyWords = CryptoJS.enc.Utf8.parse(String(key ?? ''));
  const options = {
    mode: selectedMode,
    padding: selectedPadding
  };
  if (String(mode).toUpperCase() !== 'ECB') {
    options.iv = CryptoJS.enc.Utf8.parse(String(iv ?? ''));
  }

  if (action === 'decrypt') {
    return cipher.decrypt(input, keyWords, options).toString(CryptoJS.enc.Utf8);
  }
  return cipher.encrypt(input, keyWords, options).toString();
}

function bufferFromDataUrl(dataUrl) {
  const match = String(dataUrl ?? '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('请选择有效的图片文件');
  return Buffer.from(match[2], 'base64');
}

function sanitizeFileName(value) {
  return String(value || 'image')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'image';
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
