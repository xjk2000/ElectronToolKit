const { contextBridge, ipcRenderer, clipboard, webUtils } = require('electron');

contextBridge.exposeInMainWorld('toolkit', {
  appMetadata: () => ipcRenderer.invoke('app:metadata'),
  appVersion: () => ipcRenderer.invoke('app:version'),
  hash: (algorithm, value) => ipcRenderer.invoke('hash:calculate', { algorithm, value }),
  hmac: (algorithm, key, value) => ipcRenderer.invoke('hash:hmac', { algorithm, key, value }),
  fileHash: (algorithms) => ipcRenderer.invoke('hash:file', { algorithms }),
  fileHashPath: (filePath, algorithms) => ipcRenderer.invoke('hash:file-path', { filePath, algorithms }),
  getFilePath: (file) => webUtils.getPathForFile(file),
  uuid: () => ipcRenderer.invoke('uuid:v4'),
  punycode: (action, value) => ipcRenderer.invoke('text:punycode', { action, value }),
  convertStructured: (action, value) => ipcRenderer.invoke('convert:structured', { action, value }),
  cronNext: (expression) => ipcRenderer.invoke('cron:next', { expression }),
  symmetricCrypto: (payload) => ipcRenderer.invoke('crypto:symmetric', payload),
  rsaGenerate: (options) => ipcRenderer.invoke('rsa:generate', options),
  smRun: (action, value) => ipcRenderer.invoke('sm:run', { action, value }),
  qrGenerate: (value, options) => ipcRenderer.invoke('qr:generate', { value, options }),
  qrDecode: (dataUrl) => ipcRenderer.invoke('qr:decode', { dataUrl }),
  convertImage: (payload) => ipcRenderer.invoke('image:convert', payload),
  convertMarkdownToDocx: (payload) => ipcRenderer.invoke('markdown:docx', payload),
  renderPlantUml: (payload) => ipcRenderer.invoke('plantuml:render', payload),
  saveConvertedFile: (payload) => ipcRenderer.invoke('file:save-converted', payload),
  ccSwitchList: () => ipcRenderer.invoke('cc-switch:list'),
  ccSwitchSaveProvider: (payload) => ipcRenderer.invoke('cc-switch:save-provider', payload),
  ccSwitchDeleteProvider: (id) => ipcRenderer.invoke('cc-switch:delete-provider', { id }),
  ccSwitchApplyProvider: (payload) => ipcRenderer.invoke('cc-switch:apply-provider', payload),
  ccSwitchImportExisting: (payload) => ipcRenderer.invoke('cc-switch:import-existing', payload),
  ccSwitchReadConfig: (app) => ipcRenderer.invoke('cc-switch:read-config', { app }),
  ccSwitchWriteConfig: (payload) => ipcRenderer.invoke('cc-switch:write-config', payload),
  inspectJsonFile: () => ipcRenderer.invoke('json:file-inspect'),
  inspectJsonFilePath: (filePath) => ipcRenderer.invoke('json:file-inspect-path', { filePath }),
  minifyJsonFile: (filePath) => ipcRenderer.invoke('json:file-minify', { filePath }),
  formatJsonFile: (filePath) => ipcRenderer.invoke('json:file-format', { filePath }),
  extractJsonTopLevelKey: (filePath, key) => ipcRenderer.invoke('json:file-extract-key', { filePath, key }),
  exportJsonLinesCsv: (filePath, fields) => ipcRenderer.invoke('jsonl:file-export-csv', { filePath, fields }),
  notesList: () => ipcRenderer.invoke('notes:list'),
  notesCreate: (payload) => ipcRenderer.invoke('notes:create', payload),
  notesUpdate: (id, patch) => ipcRenderer.invoke('notes:update', { id, patch }),
  notesDelete: (id) => ipcRenderer.invoke('notes:delete', { id }),
  notesShow: (id) => ipcRenderer.invoke('notes:show', { id }),
  notesHide: (id) => ipcRenderer.invoke('notes:hide', { id }),
  notesMoveBy: (dx, dy) => ipcRenderer.invoke('notes:move-by', { dx, dy }),
  notesResizeBy: (dx, dy, edge = 'se') => ipcRenderer.invoke('notes:resize-by', { dx, dy, edge }),
  notesReady: (id) => ipcRenderer.invoke('notes:ready', { id }),
  totpList: () => ipcRenderer.invoke('totp:list'),
  totpChooseStorage: () => ipcRenderer.invoke('totp:choose-storage'),
  totpSave: (payload) => ipcRenderer.invoke('totp:save', payload),
  totpDelete: (id) => ipcRenderer.invoke('totp:delete', { id }),
  totpGenerateTemp: (payload) => ipcRenderer.invoke('totp:generate-temp', payload),
  totpImportScreenQR: () => ipcRenderer.invoke('totp:import-screen-qr'),
  passwordsList: () => ipcRenderer.invoke('passwords:list'),
  passwordsSave: (payload) => ipcRenderer.invoke('passwords:save', payload),
  passwordsDelete: (id) => ipcRenderer.invoke('passwords:delete', { id }),
  passwordsReveal: (id) => ipcRenderer.invoke('passwords:reveal', { id }),
  passwordsCopyPassword: (id) => ipcRenderer.invoke('passwords:copy-password', { id }),
  passwordsCopyAccount: (id) => ipcRenderer.invoke('passwords:copy-account', { id }),
  passwordsImportCsv: () => ipcRenderer.invoke('passwords:import-csv'),
  gitlabGetConfig: () => ipcRenderer.invoke('gitlab:config:get'),
  gitlabSaveInstance: (payload) => ipcRenderer.invoke('gitlab:instance:save', payload),
  gitlabRemoveInstance: (id) => ipcRenderer.invoke('gitlab:instance:remove', { id }),
  gitlabVerifyInstance: (payload) => ipcRenderer.invoke('gitlab:instance:verify', payload),
  gitlabRefreshProjects: (instanceId) => ipcRenderer.invoke('gitlab:projects:refresh', { instanceId }),
  gitlabLocalProjectStatus: (instanceId, rootDirectory) => ipcRenderer.invoke('gitlab:projects:local-status', { instanceId, rootDirectory }),
  gitlabListBranches: (instanceId, projectId, search) => ipcRenderer.invoke('gitlab:branches:list', { instanceId, projectId, search }),
  gitlabChooseCloneRoot: (defaultPath) => ipcRenderer.invoke('gitlab:clone-root:choose', { defaultPath }),
  gitlabOpenCloneRoot: (dir) => ipcRenderer.invoke('gitlab:clone-root:open', { dir }),
  gitlabStartClone: (payload) => ipcRenderer.invoke('gitlab:clone:start', payload),
  gitlabStartBranchSwitch: (payload) => ipcRenderer.invoke('gitlab:branch-switch:start', payload),
  gitlabCancelJob: (jobId) => ipcRenderer.invoke('gitlab:job:cancel', { jobId }),
  gitlabUpdateSettings: (payload) => ipcRenderer.invoke('gitlab:settings:update', payload),
  gitlabImportLegacyConfig: (payload) => ipcRenderer.invoke('gitlab:legacy:import', payload),
  gitlabSaveMonitorTarget: (payload) => ipcRenderer.invoke('gitlab:monitor:target:save', payload),
  gitlabRefreshMonitor: () => ipcRenderer.invoke('gitlab:monitor:refresh'),
  gitlabStartMonitor: () => ipcRenderer.invoke('gitlab:monitor:start'),
  gitlabStopMonitor: () => ipcRenderer.invoke('gitlab:monitor:stop'),
  onNoteData: (callback) => {
    const listener = (_event, note) => callback(note);
    ipcRenderer.on('notes:data', listener);
    return () => ipcRenderer.removeListener('notes:data', listener);
  },
  onNoteReminder: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('notes:reminder', listener);
    return () => ipcRenderer.removeListener('notes:reminder', listener);
  },
  onSelectTool: (callback) => {
    const listener = (_event, toolId) => callback(toolId);
    ipcRenderer.on('tool:select', listener);
    return () => ipcRenderer.removeListener('tool:select', listener);
  },
  onGitLabJobUpdated: (callback) => {
    const listener = (_event, job) => callback(job);
    ipcRenderer.on('gitlab:job-updated', listener);
    return () => ipcRenderer.removeListener('gitlab:job-updated', listener);
  },
  onGitLabJobLog: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('gitlab:job-log', listener);
    return () => ipcRenderer.removeListener('gitlab:job-log', listener);
  },
  onGitLabMonitorUpdated: (callback) => {
    const listener = (_event, statuses) => callback(statuses);
    ipcRenderer.on('gitlab:monitor-updated', listener);
    return () => ipcRenderer.removeListener('gitlab:monitor-updated', listener);
  },
  readClipboard: () => clipboard.readText(),
  writeClipboard: (value) => clipboard.writeText(String(value ?? ''))
});
