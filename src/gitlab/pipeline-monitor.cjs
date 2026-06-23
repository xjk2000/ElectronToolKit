const { branchSelectorHint, resolveBranch } = require('./branch-selector.cjs');
const { GitLabClient } = require('./gitlab-client.cjs');

async function refreshPipelineMonitor(config, tokenProvider) {
  const instances = new Map(config.instances.map((item) => [item.id, item]));
  const statuses = [];
  const targets = config.monitor?.targets || [];
  await Promise.all(targets.flatMap((target) =>
    (target.watches || []).filter((watch) => watch.monitorEnabled !== false).map(async (watch) => {
      const statusId = `${target.instanceId}:${target.projectId}:${watch.id}`;
      const instance = instances.get(target.instanceId);
      if (!instance) {
        statuses.push(buildStatus(statusId, target, watch, { errorMessage: '缺少 GitLab 实例' }));
        return;
      }
      const token = await tokenProvider(target.instanceId);
      if (!token) {
        statuses.push(buildStatus(statusId, target, watch, { errorMessage: '缺少 PAT' }));
        return;
      }
      const client = new GitLabClient(instance, token);
      try {
        const selector = watch.ciSelector || watch.selector;
        const branch = selector?.type === 'fixed'
          ? branchSelectorHint(selector)
          : await resolveBranch(selector, (search) => client.listBranches(target.projectId, search));
        if (!branch) {
          statuses.push(buildStatus(statusId, target, watch, { errorMessage: '未匹配到分支' }));
          return;
        }
        const result = await client.currentOrLatestPipeline(target.projectId, selector);
        const pipelineBranch = result.ref || branch;
        let baselineDuration = null;
        if (result.status === 'running' || result.status === 'pending') {
          const durations = await client.recentSuccessDurations(target.projectId, pipelineBranch).catch(() => []);
          if (durations.length > 0) baselineDuration = durations.reduce((total, item) => total + item, 0) / durations.length;
        }
        statuses.push(buildStatus(statusId, target, watch, {
          resolvedBranch: pipelineBranch,
          status: result.status,
          statusLabel: result.statusLabel,
          webURL: result.webURL,
          updatedAt: result.updatedAt,
          startedAt: result.startedAt,
          baselineDuration
        }));
      } catch (error) {
        statuses.push(buildStatus(statusId, target, watch, { errorMessage: error.message }));
      }
    })
  ));
  return statuses.sort((a, b) => `${a.target.pathWithNamespace}:${a.watch.role}`.localeCompare(`${b.target.pathWithNamespace}:${b.watch.role}`));
}

function buildStatus(statusId, target, watch, patch = {}) {
  return {
    statusId,
    target,
    watch,
    resolvedBranch: '',
    status: 'unknown',
    statusLabel: '未知',
    webURL: '',
    updatedAt: '',
    startedAt: '',
    baselineDuration: null,
    errorMessage: '',
    ...patch
  };
}

module.exports = { refreshPipelineMonitor };
