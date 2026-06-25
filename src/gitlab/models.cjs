const path = require('node:path');

const PIPELINE_STATUS_LABELS = {
  created: '已创建',
  waiting_for_resource: '等待资源',
  preparing: '准备中',
  pending: '等待中',
  running: '运行中',
  success: '成功',
  failed: '失败',
  canceled: '已取消',
  skipped: '已跳过',
  manual: '手动',
  scheduled: '定时',
  unknown: '未知'
};

const ACTIVE_PIPELINE_STATUSES = new Set(['created', 'waiting_for_resource', 'preparing', 'pending', 'running']);

function createDefaultConfig(homeDir = process.env.HOME || '') {
  return {
    instances: [],
    clone: {
      defaultMode: 'pull',
      maxConcurrency: 6,
      stripTokenAfterClone: true
    },
    monitor: {
      pollIntervalSeconds: 60,
      targets: []
    },
    recentProjects: {}
  };
}

function normalizeConfig(value, homeDir = process.env.HOME || '') {
  const defaults = createDefaultConfig(homeDir);
  const config = value && typeof value === 'object' ? value : {};
  return {
    instances: Array.isArray(config.instances) ? config.instances.map((item) => normalizeInstance(item, homeDir)).filter(Boolean) : [],
    clone: normalizeCloneSettings(config.clone),
    monitor: normalizeMonitorSettings(config.monitor),
    recentProjects: config.recentProjects && typeof config.recentProjects === 'object' ? config.recentProjects : defaults.recentProjects
  };
}

function normalizeInstance(item, homeDir = process.env.HOME || '') {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || '').trim();
  const name = String(item.name || 'GitLab').trim().slice(0, 80) || 'GitLab';
  const baseURL = normalizeBaseURL(item.baseURL || item.baseUrl);
  if (!id || !baseURL) return null;
  const cloneRoot = normalizeCloneRoot(item.defaultCloneRoot, homeDir);
  const cloneProtocol = item.cloneProtocol === 'ssh' ? 'ssh' : 'https';
  return { id, name, baseURL, defaultCloneRoot: cloneRoot, cloneProtocol };
}

function normalizeCloneRoot(value, homeDir = process.env.HOME || '') {
  const raw = String(value || '').trim();
  if (!raw) return path.join(homeDir, 'GitlabRepos');
  if (raw.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(raw).pathname);
    } catch {
      return raw.replace(/^file:\/\//, '');
    }
  }
  return raw;
}

function normalizeCloneSettings(value) {
  const settings = value && typeof value === 'object' ? value : {};
  const mode = ['skip', 'pull', 'reclone'].includes(settings.defaultMode) ? settings.defaultMode : 'pull';
  const maxConcurrency = clampInt(settings.maxConcurrency, 1, 16, 6);
  return {
    defaultMode: mode,
    maxConcurrency,
    stripTokenAfterClone: settings.stripTokenAfterClone !== false
  };
}

function normalizeMonitorSettings(value) {
  const settings = value && typeof value === 'object' ? value : {};
  return {
    pollIntervalSeconds: clampInt(settings.pollIntervalSeconds, 30, 3600, 60),
    targets: Array.isArray(settings.targets) ? settings.targets.map(normalizeMonitorTarget).filter(Boolean) : []
  };
}

function normalizeMonitorTarget(item) {
  if (!item || typeof item !== 'object') return null;
  const instanceId = String(item.instanceId || '').trim();
  const projectId = Number(item.projectId);
  if (!instanceId || !Number.isInteger(projectId)) return null;
  const watches = Array.isArray(item.watches) ? item.watches.map(normalizeMonitorWatch).filter(Boolean) : [];
  const legacyBranches = Array.isArray(item.branches) ? item.branches : [item.branch].filter(Boolean);
  return {
    instanceId,
    projectId,
    name: String(item.name || item.pathWithNamespace || projectId).slice(0, 120),
    pathWithNamespace: String(item.pathWithNamespace || item.name || projectId).slice(0, 240),
    watches: watches.length > 0 ? watches : branchesToWatches(legacyBranches.length > 0 ? legacyBranches : ['main'])
  };
}

function normalizeMonitorWatch(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    id: String(item.id || randomId()),
    selector: normalizeBranchSelector(item.selector) || { type: 'fixed', value: 'main' },
    ciSelector: normalizeBranchSelector(item.ciSelector),
    role: ['production', 'testing', 'custom'].includes(item.role) ? item.role : 'custom',
    monitorEnabled: item.monitorEnabled !== false
  };
}

function branchesToWatches(branches) {
  return normalizeBranches(branches, 'main').map((branch, index) => ({
    id: randomId(),
    selector: { type: 'fixed', value: branch },
    ciSelector: null,
    role: index === 0 ? 'production' : index === 1 ? 'testing' : 'custom',
    monitorEnabled: true
  }));
}

function normalizeBranches(branches, fallback = 'main') {
  const seen = new Set();
  const values = (Array.isArray(branches) ? branches : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  if (values.length > 0) return values;
  return [String(fallback || 'main').trim() || 'main'];
}

function normalizeBranchSelector(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.type === 'fixed') {
    const branch = String(value.value || '').trim();
    return branch ? { type: 'fixed', value: branch } : null;
  }
  if (value.type === 'regex') {
    const pattern = String(value.value || '').trim();
    return pattern ? { type: 'regex', value: pattern } : null;
  }
  if (value.type === 'rule') {
    const prefix = String(value.prefix || '').trim();
    const separator = String(value.separator || '-');
    const format = ['yyyymmdd', 'yyyymmddDashed', 'yyyymmddDotted', 'yyyymmddWithTail'].includes(value.format)
      ? value.format
      : 'yyyymmdd';
    return prefix ? { type: 'rule', prefix, separator, format } : null;
  }
  return null;
}

function normalizeProject(dto, instanceId) {
  return {
    id: Number(dto.id),
    instanceId,
    pathWithNamespace: String(dto.path_with_namespace || dto.pathWithNamespace || ''),
    name: String(dto.name || ''),
    httpUrlToRepo: String(dto.http_url_to_repo || dto.httpUrlToRepo || ''),
    sshUrlToRepo: String(dto.ssh_url_to_repo || dto.sshUrlToRepo || ''),
    defaultBranch: dto.default_branch || dto.defaultBranch || '',
    lastActivityAt: dto.last_activity_at || dto.lastActivityAt || '',
    webURL: String(dto.web_url || dto.webURL || '')
  };
}

function normalizePipeline(dto, fallbackRef = '') {
  const status = Object.prototype.hasOwnProperty.call(PIPELINE_STATUS_LABELS, dto?.status) ? dto.status : 'unknown';
  return {
    id: dto?.id ?? null,
    status,
    statusLabel: PIPELINE_STATUS_LABELS[status],
    webURL: dto?.web_url || dto?.webURL || '',
    updatedAt: dto?.updated_at || dto?.updatedAt || '',
    startedAt: dto?.started_at || dto?.startedAt || '',
    finishedAt: dto?.finished_at || dto?.finishedAt || '',
    duration: Number(dto?.duration) || 0,
    ref: dto?.ref || fallbackRef || '',
    triggerer: normalizeGitLabUser(dto?.user || dto?.triggerer || dto?.triggered_by)
  };
}

function normalizeGitLabUser(user) {
  if (!user || typeof user !== 'object') return null;
  const username = String(user.username || '').trim();
  const name = String(user.name || '').trim();
  const displayName = username || name || (user.id ? String(user.id) : '');
  if (!displayName) return null;
  return {
    id: user.id ?? null,
    username,
    name,
    displayName,
    avatarURL: String(user.avatar_url || user.avatarURL || ''),
    webURL: String(user.web_url || user.webURL || '')
  };
}

function normalizeBaseURL(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

module.exports = {
  ACTIVE_PIPELINE_STATUSES,
  PIPELINE_STATUS_LABELS,
  branchesToWatches,
  createDefaultConfig,
  normalizeBaseURL,
  normalizeCloneRoot,
  normalizeBranches,
  normalizeBranchSelector,
  normalizeConfig,
  normalizeGitLabUser,
  normalizeInstance,
  normalizePipeline,
  normalizeProject
};
