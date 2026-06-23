const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { dialog, shell } = require('electron');
const { CloneEngine, switchBranches } = require('./clone-engine.cjs');
const { GitLabClient } = require('./gitlab-client.cjs');
const { GitRunner } = require('./git-runner.cjs');
const { localRepoStatuses } = require('./local-repo.cjs');
const { branchesToWatches, normalizeBaseURL, normalizeConfig, normalizeInstance } = require('./models.cjs');
const { refreshPipelineMonitor } = require('./pipeline-monitor.cjs');

function registerGitLabIpc({ ipcMain, getMainWindow, configStore, tokenStore, refreshTrayMenu }) {
  const projectsCache = new Map();
  const jobs = new Map();
  const runner = new GitRunner();
  let monitorTimer = null;
  let monitorStatuses = [];

  const send = (channel, payload) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  const getConfig = () => configStore.get();
  const getInstance = (id) => {
    const instance = getConfig().instances.find((item) => item.id === id);
    if (!instance) throw new Error('GitLab 实例不存在');
    return instance;
  };
  const getToken = async (id) => tokenStore.get(id);

  ipcMain.handle('gitlab:config:get', async () => ({
    config: getConfig(),
    projects: Object.fromEntries(projectsCache.entries())
  }));

  ipcMain.handle('gitlab:instance:save', async (_event, payload) => {
    const instance = normalizeInstance({
      id: payload?.id || crypto.randomUUID(),
      name: payload?.name,
      baseURL: normalizeBaseURL(payload?.baseURL),
      defaultCloneRoot: payload?.defaultCloneRoot || path.join(process.env.HOME || '', 'GitlabRepos'),
      cloneProtocol: payload?.cloneProtocol
    });
    if (!instance) throw new Error('GitLab 实例配置不完整');
    await configStore.upsertInstance(instance);
    if (String(payload?.token || '').trim()) await tokenStore.set(instance.id, payload.token);
    refreshTrayMenu?.();
    return { config: getConfig(), instance };
  });

  ipcMain.handle('gitlab:instance:remove', async (_event, { id }) => {
    await configStore.removeInstance(String(id));
    await tokenStore.remove(String(id));
    projectsCache.delete(String(id));
    refreshTrayMenu?.();
    return { config: getConfig() };
  });

  ipcMain.handle('gitlab:instance:verify', async (_event, payload) => {
    const instance = normalizeInstance({
      id: payload?.id || crypto.randomUUID(),
      name: payload?.name || 'GitLab',
      baseURL: normalizeBaseURL(payload?.baseURL),
      defaultCloneRoot: payload?.defaultCloneRoot || path.join(process.env.HOME || '', 'GitlabRepos'),
      cloneProtocol: payload?.cloneProtocol
    });
    if (!instance) throw new Error('请填写有效的 GitLab Base URL');
    const token = String(payload?.token || '').trim() || await getToken(instance.id);
    if (!token) throw new Error('请填写 PAT');
    const user = await new GitLabClient(instance, token).verifyToken();
    return { username: user.username || user.name || String(user.id || '') };
  });

  ipcMain.handle('gitlab:projects:refresh', async (_event, { instanceId }) => {
    const instance = getInstance(String(instanceId));
    const token = await getToken(instance.id);
    if (!token) throw new Error('缺少 PAT，请先保存实例 token');
    const projects = await new GitLabClient(instance, token).listMyProjects();
    projectsCache.set(instance.id, projects);
    await configStore.setRecentProjects(instance.id, projects);
    return { projects };
  });

  ipcMain.handle('gitlab:projects:local-status', async (_event, { instanceId, rootDirectory } = {}) => {
    const instance = getInstance(String(instanceId));
    const projects = projectsCache.get(instance.id) || getConfig().recentProjects[instance.id] || [];
    const root = String(rootDirectory || instance.defaultCloneRoot || '');
    return {
      rootDirectory: root,
      statuses: await localRepoStatuses(root, projects)
    };
  });

  ipcMain.handle('gitlab:branches:list', async (_event, { instanceId, projectId, search }) => {
    const instance = getInstance(String(instanceId));
    const token = await getToken(instance.id);
    if (!token) throw new Error('缺少 PAT');
    return new GitLabClient(instance, token).listBranches(projectId, search);
  });

  ipcMain.handle('gitlab:clone-root:choose', async (_event, { defaultPath } = {}) => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: '选择 GitLab 同步目录',
      buttonLabel: '选择',
      defaultPath: defaultPath || path.join(process.env.HOME || '', 'GitlabRepos'),
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, filePath: result.filePaths[0] };
  });

  ipcMain.handle('gitlab:clone-root:open', async (_event, { dir }) => {
    if (!dir) throw new Error('缺少目录');
    await shell.openPath(String(dir));
    return true;
  });

  ipcMain.handle('gitlab:clone:start', async (_event, payload) => {
    const instance = getInstance(String(payload?.instanceId));
    const token = await getToken(instance.id);
    if (!token) throw new Error('缺少 PAT');
    const cached = projectsCache.get(instance.id) || getConfig().recentProjects[instance.id] || [];
    const selectedIds = new Set((payload?.projectIds || []).map(Number));
    const projects = cached.filter((project) => selectedIds.has(project.id));
    if (projects.length === 0) throw new Error('请选择要同步的项目');
    const jobId = crypto.randomUUID();
    const controller = new AbortController();
    const job = {
      id: jobId,
      type: 'clone',
      instance,
      projects,
      rootDirectory: String(payload?.rootDirectory || instance.defaultCloneRoot),
      mode: ['skip', 'pull', 'reclone'].includes(payload?.mode) ? payload.mode : getConfig().clone.defaultMode,
      checkoutBranches: payload?.checkoutBranches || {},
      progress: Object.fromEntries(projects.map((project) => [project.id, { state: 'pending' }])),
      logs: [],
      startedAt: new Date().toISOString(),
      done: false
    };
    jobs.set(jobId, { job, controller });
    send('gitlab:job-updated', publicJob(job));
    const engine = new CloneEngine({
      runner,
      token,
      maxConcurrency: payload?.maxConcurrency || getConfig().clone.maxConcurrency,
      stripTokenAfterClone: getConfig().clone.stripTokenAfterClone
    });
    engine.execute(job, {
      signal: controller.signal,
      progress: (projectId, state) => {
        job.progress[projectId] = state;
        send('gitlab:job-updated', publicJob(job));
      },
      output: (entry) => {
        job.logs.push({ ...entry, time: new Date().toISOString() });
        if (job.logs.length > 500) job.logs.shift();
        send('gitlab:job-log', { jobId, entry });
      }
    }).catch((error) => {
      job.error = error.message;
    }).finally(() => {
      job.done = true;
      job.finishedAt = new Date().toISOString();
      send('gitlab:job-updated', publicJob(job));
    });
    return publicJob(job);
  });

  ipcMain.handle('gitlab:branch-switch:start', async (_event, payload) => {
    const instance = getInstance(String(payload?.instanceId));
    const cached = projectsCache.get(instance.id) || getConfig().recentProjects[instance.id] || [];
    const selectedIds = new Set((payload?.projectIds || []).map(Number));
    const projects = cached.filter((project) => selectedIds.has(project.id));
    if (projects.length === 0) throw new Error('请选择要切换分支的项目');
    const targetBranch = String(payload?.targetBranch || '').trim();
    if (!targetBranch) throw new Error('目标分支不能为空');
    const jobId = crypto.randomUUID();
    const controller = new AbortController();
    const job = {
      id: jobId,
      type: 'branch-switch',
      instance,
      projects,
      rootDirectory: String(payload?.rootDirectory || instance.defaultCloneRoot),
      progress: Object.fromEntries(projects.map((project) => [project.id, { state: 'pending' }])),
      logs: [],
      startedAt: new Date().toISOString(),
      done: false
    };
    jobs.set(jobId, { job, controller });
    send('gitlab:job-updated', publicJob(job));
    switchBranches({
      runner,
      projects,
      rootDirectory: job.rootDirectory,
      targetBranch,
      baseBranches: payload?.baseBranches || {},
      dirtyPolicy: payload?.dirtyPolicy || 'skip',
      maxConcurrency: payload?.maxConcurrency || getConfig().clone.maxConcurrency,
      signal: controller.signal
    }, {
      progress: (projectId, state) => {
        job.progress[projectId] = state;
        send('gitlab:job-updated', publicJob(job));
      },
      output: (entry) => {
        job.logs.push({ ...entry, time: new Date().toISOString() });
        if (job.logs.length > 500) job.logs.shift();
        send('gitlab:job-log', { jobId, entry });
      }
    }).catch((error) => {
      job.error = error.message;
    }).finally(() => {
      job.done = true;
      job.finishedAt = new Date().toISOString();
      send('gitlab:job-updated', publicJob(job));
    });
    return publicJob(job);
  });

  ipcMain.handle('gitlab:job:cancel', (_event, { jobId }) => {
    const entry = jobs.get(String(jobId));
    if (!entry) return null;
    entry.controller.abort();
    runner.terminateAll();
    return publicJob(entry.job);
  });

  ipcMain.handle('gitlab:settings:update', async (_event, payload) => {
    let config = getConfig();
    if (payload?.clone) config = await configStore.updateCloneSettings(payload.clone);
    if (payload?.monitor) config = await configStore.updateMonitorSettings(payload.monitor);
    refreshTrayMenu?.();
    return { config };
  });

  ipcMain.handle('gitlab:legacy:import', async (_event, payload = {}) => {
    const legacyPath = String(payload.path || defaultLegacyConfigPath());
    const imported = await readLegacyGitLabMenuConfig(legacyPath, configStore.homeDir);
    const config = await configStore.importConfig(imported, { merge: payload.merge !== false });
    const tokenResult = await importLegacyTokens(imported.instances, tokenStore);
    for (const instance of config.instances) {
      const cachedProjects = config.recentProjects[instance.id];
      if (Array.isArray(cachedProjects)) projectsCache.set(instance.id, cachedProjects);
    }
    refreshTrayMenu?.();
    return {
      config,
      importedInstanceCount: imported.instances.length,
      importedMonitorTargetCount: imported.monitor.targets.length,
      importedTokenCount: tokenResult.imported,
      tokenErrors: tokenResult.errors,
      legacyPath
    };
  });

  ipcMain.handle('gitlab:monitor:target:save', async (_event, payload) => {
    const watches = Array.isArray(payload?.watches) && payload.watches.length > 0
      ? payload.watches
      : branchesToWatches(payload?.branches || []);
    const target = {
      instanceId: String(payload?.instanceId || ''),
      projectId: Number(payload?.projectId),
      name: String(payload?.name || payload?.pathWithNamespace || ''),
      pathWithNamespace: String(payload?.pathWithNamespace || payload?.name || ''),
      watches
    };
    const config = await configStore.upsertMonitorTarget(target);
    refreshTrayMenu?.();
    return { config };
  });

  ipcMain.handle('gitlab:monitor:refresh', async () => {
    monitorStatuses = await refreshPipelineMonitor(getConfig(), getToken);
    send('gitlab:monitor-updated', monitorStatuses);
    refreshTrayMenu?.();
    return { statuses: monitorStatuses };
  });

  ipcMain.handle('gitlab:monitor:start', async () => {
    startMonitorLoop();
    return true;
  });

  ipcMain.handle('gitlab:monitor:stop', () => {
    stopMonitorLoop();
    return true;
  });

  function startMonitorLoop() {
    stopMonitorLoop();
    const run = async () => {
      const targets = getConfig().monitor.targets || [];
      if (targets.length === 0) return;
      monitorStatuses = await refreshPipelineMonitor(getConfig(), getToken).catch((error) => [{ errorMessage: error.message }]);
      send('gitlab:monitor-updated', monitorStatuses);
      refreshTrayMenu?.();
    };
    run();
    const interval = Math.max(30, Number(getConfig().monitor.pollIntervalSeconds) || 60) * 1000;
    monitorTimer = setInterval(run, interval);
  }

  function stopMonitorLoop() {
    if (monitorTimer) clearInterval(monitorTimer);
    monitorTimer = null;
  }

  return {
    getConfig,
    getProjects: (instanceId) => projectsCache.get(instanceId) || getConfig().recentProjects[instanceId] || [],
    getMonitorStatuses: () => monitorStatuses,
    refreshMonitor: async () => {
      monitorStatuses = await refreshPipelineMonitor(getConfig(), getToken);
      send('gitlab:monitor-updated', monitorStatuses);
      refreshTrayMenu?.();
      return monitorStatuses;
    },
    startMonitorLoop,
    stopMonitorLoop
  };
}

async function readLegacyGitLabMenuConfig(filePath, homeDir) {
  const text = await readFile(filePath, 'utf8');
  return normalizeConfig(JSON.parse(text), homeDir);
}

function defaultLegacyConfigPath(homeDir = process.env.HOME || '') {
  return path.join(homeDir, 'Library', 'Application Support', 'GitLabMenu', 'config.json');
}

async function importLegacyTokens(instances, tokenStore) {
  const result = { imported: 0, errors: [] };
  for (const instance of instances || []) {
    try {
      const token = await readKeychainPassword('GitLabMenu', instance.id);
      if (!token) continue;
      await tokenStore.set(instance.id, token);
      result.imported += 1;
    } catch (error) {
      result.errors.push({ instanceId: instance.id, message: error.message });
    }
  }
  return result;
}

function readKeychainPassword(service, account) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/security', ['find-generic-password', '-s', service, '-a', account, '-w'], {
      shell: false,
      env: process.env
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString('utf8'); });
    child.stderr.on('data', (data) => { stderr += data.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else resolve('');
    });
  });
}

function publicJob(job) {
  const progressValues = Object.values(job.progress || {});
  return {
    id: job.id,
    type: job.type,
    instanceId: job.instance?.id,
    projectCount: job.projects?.length || 0,
    rootDirectory: job.rootDirectory,
    mode: job.mode,
    progress: job.progress,
    summary: {
      pending: progressValues.filter((item) => item.state === 'pending').length,
      running: progressValues.filter((item) => item.state === 'running').length,
      succeeded: progressValues.filter((item) => item.state === 'succeeded').length,
      failed: progressValues.filter((item) => item.state === 'failed').length,
      skipped: progressValues.filter((item) => item.state === 'skipped').length
    },
    logs: job.logs?.slice(-120) || [],
    error: job.error || '',
    done: Boolean(job.done),
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || ''
  };
}

module.exports = {
  defaultLegacyConfigPath,
  readLegacyGitLabMenuConfig,
  registerGitLabIpc
};
