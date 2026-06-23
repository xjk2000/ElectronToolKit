const { matchesBranchSelector } = require('./branch-selector.cjs');
const { nextURLFromLinkHeader } = require('./link-header.cjs');
const { ACTIVE_PIPELINE_STATUSES, normalizePipeline, normalizeProject } = require('./models.cjs');

class GitLabClient {
  constructor(instance, token, options = {}) {
    this.instance = instance;
    this.token = String(token || '');
    this.fetch = options.fetch || globalThis.fetch;
    this.retry = {
      maxAttempts: options.maxAttempts || 3,
      baseDelayMs: options.baseDelayMs || 200
    };
    if (!this.fetch) throw new Error('当前运行环境不支持 fetch');
  }

  async verifyToken() {
    return this.requestJson(this.apiURL('user'));
  }

  async listMyProjects() {
    const rows = await this.fetchAllPages(this.apiURL('projects', {
      membership: 'true',
      per_page: '100',
      order_by: 'last_activity_at',
      sort: 'desc'
    }));
    return rows.map((row) => normalizeProject(row, this.instance.id)).filter((row) => Number.isInteger(row.id));
  }

  async latestPipeline(projectId, branch) {
    const rows = await this.requestJson(this.apiURL(`projects/${encodeURIComponent(projectId)}/pipelines`, {
      ref: branch,
      per_page: '1',
      order_by: 'id',
      sort: 'desc'
    }));
    return normalizePipeline(Array.isArray(rows) ? rows[0] : null, branch);
  }

  async currentOrLatestPipeline(projectId, selector, limit = 100) {
    const perPage = String(Math.max(1, Math.min(Number(limit) || 100, 100)));
    const query = {
      per_page: perPage,
      order_by: 'id',
      sort: 'desc'
    };
    let fallbackRef = '';
    if (!selector || selector.type === 'fixed') {
      fallbackRef = String(selector?.value || '').trim();
      if (fallbackRef) query.ref = fallbackRef;
    }

    let next = this.apiURL(`projects/${encodeURIComponent(projectId)}/pipelines`, query);
    let firstMatching = null;
    while (next) {
      const { data, response } = await this.sendWithRetry(this.makeRequest(next));
      const rows = await parseJsonResponse(data);
      const matching = (Array.isArray(rows) ? rows : []).filter((row) => matchesBranchSelector(row.ref, selector, fallbackRef));
      const active = matching.find((row) => ACTIVE_PIPELINE_STATUSES.has(row.status));
      if (active) return normalizePipeline(active, fallbackRef);
      if (!firstMatching && matching[0]) firstMatching = matching[0];
      next = nextURLFromLinkHeader(response.headers.get('link'));
    }
    return normalizePipeline(firstMatching, fallbackRef);
  }

  async recentSuccessDurations(projectId, branch, limit = 5) {
    const rows = await this.requestJson(this.apiURL(`projects/${encodeURIComponent(projectId)}/pipelines`, {
      ref: branch,
      status: 'success',
      per_page: String(Math.max(1, Math.min(Number(limit) || 5, 20))),
      order_by: 'id',
      sort: 'desc'
    }));
    const ids = (Array.isArray(rows) ? rows : []).map((row) => row.id).filter(Boolean);
    const details = await Promise.all(ids.map((id) => this.pipelineDuration(projectId, id).catch(() => null)));
    return details.filter((value) => Number.isFinite(value) && value > 0);
  }

  async listBranches(projectId, search = '') {
    const query = { per_page: '100' };
    if (search) query.search = search;
    const rows = await this.fetchAllPages(this.apiURL(`projects/${encodeURIComponent(projectId)}/repository/branches`, query));
    return rows.map((row) => ({ name: String(row.name || '') })).filter((row) => row.name);
  }

  async fetchAllPages(firstURL) {
    const collected = [];
    let next = firstURL;
    while (next) {
      const { data, response } = await this.sendWithRetry(this.makeRequest(next));
      const page = await parseJsonResponse(data);
      if (!Array.isArray(page)) throw new Error('GitLab 返回了非数组分页数据');
      collected.push(...page);
      next = nextURLFromLinkHeader(response.headers.get('link'));
    }
    return collected;
  }

  async pipelineDuration(projectId, pipelineId) {
    const row = await this.requestJson(this.apiURL(`projects/${encodeURIComponent(projectId)}/pipelines/${encodeURIComponent(pipelineId)}`));
    if (Number(row.duration) > 0) return Number(row.duration);
    const started = row.started_at ? new Date(row.started_at).getTime() : NaN;
    const finished = row.finished_at ? new Date(row.finished_at).getTime() : NaN;
    const seconds = (finished - started) / 1000;
    return seconds > 0 ? seconds : null;
  }

  async requestJson(url) {
    const { data } = await this.sendWithRetry(this.makeRequest(url));
    return parseJsonResponse(data);
  }

  async sendWithRetry(request) {
    let lastError;
    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt += 1) {
      try {
        return await this.sendOnce(request);
      } catch (error) {
        if (['unauthorized', 'forbidden', 'decoding'].includes(error.code)) throw error;
        lastError = error;
        const waitMs =
          error.code === 'rate_limited' && Number(error.retryAfter) > 0
            ? Number(error.retryAfter) * 1000
            : this.retry.baseDelayMs * 2 ** (attempt - 1);
        if (attempt < this.retry.maxAttempts) await sleep(waitMs);
      }
    }
    throw lastError || new Error('GitLab 请求失败');
  }

  async sendOnce(request) {
    let response;
    try {
      response = await this.fetch(request.url, request);
    } catch (error) {
      const wrapped = new Error(`GitLab 网络请求失败：${error.message}`);
      wrapped.code = 'transport';
      throw wrapped;
    }
    const data = await response.text();
    if (response.status >= 200 && response.status <= 299) return { data, response };
    const error = new Error(gitlabStatusMessage(response.status, data));
    if (response.status === 401) error.code = 'unauthorized';
    else if (response.status === 403) error.code = 'forbidden';
    else if (response.status === 429) {
      error.code = 'rate_limited';
      error.retryAfter = Number(response.headers.get('retry-after')) || 1;
    } else {
      error.code = 'http_status';
    }
    throw error;
  }

  makeRequest(url) {
    return {
      url,
      method: 'GET',
      headers: {
        'PRIVATE-TOKEN': this.token,
        Accept: 'application/json'
      }
    };
  }

  apiURL(apiPath, query = {}) {
    const base = new URL(this.instance.baseURL);
    const prefix = base.pathname.replace(/\/$/, '');
    base.pathname = `${prefix}/api/v4/${apiPath}`.replace(/\/{2,}/g, '/');
    base.search = '';
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') base.searchParams.set(key, String(value));
    });
    return base.toString();
  }
}

async function parseJsonResponse(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    const wrapped = new Error(`GitLab 返回 JSON 解析失败：${error.message}`);
    wrapped.code = 'decoding';
    throw wrapped;
  }
}

function gitlabStatusMessage(status, body) {
  if (status === 401) return 'GitLab PAT 无效或已过期';
  if (status === 403) return 'GitLab PAT 权限不足';
  if (status === 429) return '触发 GitLab 限流';
  const preview = String(body || '').trim().slice(0, 300);
  return preview ? `GitLab HTTP ${status}: ${preview}` : `GitLab HTTP ${status}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { GitLabClient, gitlabStatusMessage };
