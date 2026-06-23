const { mkdir, rm, stat } = require('node:fs/promises');
const path = require('node:path');
const { cloneURL, sanitizeGitMessage, stripCredentials } = require('./clone-url.cjs');
const { APP_META } = require('../app-meta.cjs');

class CloneEngine {
  constructor(options) {
    this.runner = options.runner;
    this.token = String(options.token || '');
    this.maxConcurrency = Math.max(1, Number(options.maxConcurrency) || 1);
    this.stripTokenAfterClone = options.stripTokenAfterClone !== false;
  }

  async execute(job, callbacks = {}) {
    await mkdir(job.rootDirectory, { recursive: true });
    await runLimited(job.projects, this.maxConcurrency, async (project) => {
      callbacks.progress?.(project.id, { state: 'running' });
      const state = await this.processOne(project, job, callbacks);
      callbacks.progress?.(project.id, state);
    });
  }

  async processOne(project, job, callbacks) {
    const target = path.join(job.rootDirectory, project.pathWithNamespace);
    const exists = await existsPath(path.join(target, '.git'));
    try {
      let state;
      let clonedProtocol = '';
      if (job.mode === 'skip' && exists) {
        state = { state: 'skipped' };
      } else if (!exists || job.mode === 'skip') {
        state = await this.cloneProject(project, target, job.instance.cloneProtocol, callbacks);
        clonedProtocol = job.instance.cloneProtocol;
      } else if (job.mode === 'pull') {
        state = await this.pullProject(project, target, callbacks);
      } else if (job.mode === 'reclone') {
        await rm(target, { recursive: true, force: true });
        state = await this.cloneProject(project, target, job.instance.cloneProtocol, callbacks);
        clonedProtocol = job.instance.cloneProtocol;
      } else {
        state = { state: 'failed', message: `未知同步模式：${job.mode}` };
      }

      const finalState = await this.checkoutConfiguredBranchIfNeeded(state, project, target, job.checkoutBranches?.[project.id], callbacks);
      if (clonedProtocol) await this.stripCredentialsAfterCloneIfNeeded(project, target, clonedProtocol);
      return finalState;
    } catch (error) {
      if (callbacks.signal?.aborted) return { state: 'failed', message: '已取消' };
      return { state: 'failed', message: error.message };
    }
  }

  async cloneProject(project, target, protocolKind, callbacks) {
    await mkdir(path.dirname(target), { recursive: true });
    const result = await this.runGit(project.id, ['clone', '--progress', cloneURL(project, protocolKind, this.token), target], null, callbacks);
    return result.succeeded ? { state: 'succeeded' } : { state: 'failed', message: sanitizeGitMessage(result.stderr, this.token).trim() || 'Git clone 失败' };
  }

  async pullProject(project, target, callbacks) {
    const fetch = await this.runGit(project.id, ['fetch', '--all', '--prune', '--progress'], target, callbacks);
    if (!fetch.succeeded) return { state: 'failed', message: sanitizeGitMessage(fetch.stderr, this.token).trim() || 'Git fetch 失败' };
    const pull = await this.runGit(project.id, ['pull', '--ff-only', '--progress'], target, callbacks);
    return pull.succeeded ? { state: 'succeeded' } : { state: 'failed', message: sanitizeGitMessage(pull.stderr, this.token).trim() || 'Git pull 失败' };
  }

  async checkoutConfiguredBranchIfNeeded(state, project, target, branch, callbacks) {
    if (state.state !== 'succeeded') return state;
    const targetBranch = String(branch || '').trim();
    if (!targetBranch) return state;
    const sourceRef = `origin/${targetBranch}`;
    const fetch = await this.runGit(project.id, ['fetch', 'origin', '--prune', '--progress', `refs/heads/${targetBranch}:refs/remotes/${sourceRef}`], target, callbacks);
    if (!fetch.succeeded) return { state: 'failed', message: `找不到远程分支 ${sourceRef}: ${sanitizeGitMessage(fetch.stderr, this.token).trim()}` };
    if (await this.localBranchExists(project.id, target, targetBranch, callbacks)) {
      const switched = await this.runGit(project.id, ['switch', targetBranch], target, callbacks);
      if (!switched.succeeded) return { state: 'failed', message: sanitizeGitMessage(switched.stderr, this.token).trim() || '切换分支失败' };
      const upstream = await this.runGit(project.id, [`branch`, `--set-upstream-to=${sourceRef}`, targetBranch], target, callbacks);
      if (!upstream.succeeded) return { state: 'failed', message: sanitizeGitMessage(upstream.stderr, this.token).trim() || '设置 upstream 失败' };
      return this.pullProject(project, target, callbacks);
    }
    const created = await this.runGit(project.id, ['checkout', '-b', targetBranch, sourceRef], target, callbacks);
    if (!created.succeeded) return { state: 'failed', message: sanitizeGitMessage(created.stderr, this.token).trim() || '创建分支失败' };
    const upstream = await this.runGit(project.id, ['branch', `--set-upstream-to=${sourceRef}`, targetBranch], target, callbacks);
    return upstream.succeeded ? { state: 'succeeded' } : { state: 'failed', message: sanitizeGitMessage(upstream.stderr, this.token).trim() || '设置 upstream 失败' };
  }

  async stripCredentialsAfterCloneIfNeeded(project, target, protocolKind) {
    if (protocolKind !== 'https' || !this.stripTokenAfterClone) return;
    const stripped = stripCredentials(cloneURL(project, protocolKind, this.token));
    await this.runner.run(['remote', 'set-url', 'origin', stripped], { cwd: target }).catch(() => {});
  }

  async localBranchExists(projectId, repo, branch, callbacks) {
    const result = await this.runGit(projectId, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], repo, callbacks);
    return result.succeeded;
  }

  runGit(projectId, args, cwd, callbacks) {
    return this.runner.run(args, {
      cwd,
      signal: callbacks.signal,
      onOutput: (entry) => callbacks.output?.({
        projectId,
        stream: entry.stream,
        message: sanitizeGitMessage(entry.message, this.token)
      })
    });
  }
}

async function switchBranches({ runner, projects, rootDirectory, targetBranch, baseBranches = {}, dirtyPolicy = 'skip', maxConcurrency = 4, signal }, callbacks = {}) {
  await runLimited(projects, Math.max(1, Number(maxConcurrency) || 1), async (project) => {
    callbacks.progress?.(project.id, { state: 'running' });
    const state = await switchOneBranch({ runner, project, rootDirectory, targetBranch, baseBranch: baseBranches[project.id] || project.defaultBranch || 'main', dirtyPolicy, signal }, callbacks);
    callbacks.progress?.(project.id, state);
  });
}

async function switchOneBranch({ runner, project, rootDirectory, targetBranch, baseBranch, dirtyPolicy, signal }, callbacks) {
  const repo = path.join(rootDirectory, project.pathWithNamespace);
  if (!(await existsPath(path.join(repo, '.git')))) return { state: 'skipped', message: '本地仓库不存在，请先同步/克隆' };
  const target = String(targetBranch || '').trim();
  const base = String(baseBranch || '').trim();
  if (!target) return { state: 'failed', message: '目标分支不能为空' };
  if (!base) return { state: 'failed', message: '基准分支不能为空' };
  const run = (args) => runner.run(args, {
    cwd: repo,
    signal,
    onOutput: (entry) => callbacks.output?.({ projectId: project.id, stream: entry.stream, message: entry.message })
  });
  try {
    const status = await run(['status', '--porcelain']);
    if (!status.succeeded) return { state: 'failed', message: status.stderr.trim() || '检查工作区状态失败' };
    if (status.stdout.trim()) {
      if (dirtyPolicy === 'skip') return { state: 'skipped', message: '存在未提交改动，已按策略跳过' };
      if (dirtyPolicy === 'stash') {
        const stash = await run(['stash', 'push', '-u', '-m', `${APP_META.displayName} before switch to ${target} ${new Date().toISOString()}`]);
        if (!stash.succeeded) return { state: 'failed', message: stash.stderr.trim() || 'stash 失败' };
      } else if (dirtyPolicy === 'discard') {
        const reset = await run(['reset', '--hard']);
        if (!reset.succeeded) return { state: 'failed', message: reset.stderr.trim() || 'reset 失败' };
        const clean = await run(['clean', '-fd']);
        if (!clean.succeeded) return { state: 'failed', message: clean.stderr.trim() || 'clean 失败' };
      }
    }
    const local = await run(['show-ref', '--verify', '--quiet', `refs/heads/${target}`]);
    if (local.succeeded) {
      const switched = await run(['switch', target]);
      return switched.succeeded ? { state: 'succeeded' } : { state: 'failed', message: switched.stderr.trim() || '切换分支失败' };
    }
    const fetch = await run(['fetch', 'origin', '--prune', '--progress', `refs/heads/${base}:refs/remotes/origin/${base}`]);
    if (!fetch.succeeded) return { state: 'failed', message: `找不到远程基准分支 origin/${base}: ${fetch.stderr.trim()}` };
    const created = await run(['checkout', '-b', target, `origin/${base}`]);
    if (!created.succeeded) return { state: 'failed', message: created.stderr.trim() || '创建分支失败' };
    const upstream = await run(['branch', `--set-upstream-to=origin/${base}`, target]);
    return upstream.succeeded ? { state: 'succeeded' } : { state: 'failed', message: upstream.stderr.trim() || '设置 upstream 失败' };
  } catch (error) {
    return { state: signal?.aborted ? 'failed' : 'failed', message: signal?.aborted ? '已取消' : error.message };
  }
}

async function runLimited(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(workers);
}

async function existsPath(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = { CloneEngine, switchBranches };
