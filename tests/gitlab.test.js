import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { branchSelectorRegex, branchSelectorSearchPrefix, matchesBranchSelector, resolveBranch } = require('../src/gitlab/branch-selector.cjs');
const { cloneURL, sanitizeGitMessage, stripCredentials } = require('../src/gitlab/clone-url.cjs');
const { mergeConfigs } = require('../src/gitlab/config-store.cjs');
const { GitLabClient } = require('../src/gitlab/gitlab-client.cjs');
const { localRepoStatus } = require('../src/gitlab/local-repo.cjs');
const { normalizeCloneRoot, normalizeConfig, normalizePipeline, normalizeProject } = require('../src/gitlab/models.cjs');

test('normalizes GitLab config with safe defaults', () => {
  const config = normalizeConfig({
    instances: [{
      id: 'inst-1',
      name: 'Corp',
      baseURL: 'https://gitlab.example.com/',
      defaultCloneRoot: '/tmp/repos',
      cloneProtocol: 'ssh'
    }],
    clone: { defaultMode: 'bad', maxConcurrency: 99, stripTokenAfterClone: false },
    monitor: { pollIntervalSeconds: 5 }
  });
  assert.equal(config.instances[0].baseURL, 'https://gitlab.example.com');
  assert.equal(config.instances[0].cloneProtocol, 'ssh');
  assert.equal(config.clone.defaultMode, 'pull');
  assert.equal(config.clone.maxConcurrency, 16);
  assert.equal(config.clone.stripTokenAfterClone, false);
  assert.equal(config.monitor.pollIntervalSeconds, 30);
});

test('normalizes legacy file URL clone roots', () => {
  assert.equal(
    normalizeCloneRoot('file:///Volumes/ORICO/Projects/shulex-project-01/'),
    '/Volumes/ORICO/Projects/shulex-project-01/'
  );
});

test('merges legacy GitLabMenu config into current config', () => {
  const current = normalizeConfig({
    instances: [{ id: 'new', name: 'New', baseURL: 'https://new.example.com', defaultCloneRoot: '/tmp/new' }],
    monitor: { targets: [{ instanceId: 'new', projectId: 1, name: 'A', pathWithNamespace: 'g/a', branches: ['main'] }] }
  });
  const imported = normalizeConfig({
    instances: [{ id: 'old', name: 'Old', baseURL: 'https://old.example.com', defaultCloneRoot: 'file:///tmp/old/' }],
    clone: { defaultMode: 'reclone', maxConcurrency: 2 },
    monitor: { targets: [{ instanceId: 'old', projectId: 2, name: 'B', pathWithNamespace: 'g/b', branches: ['master'] }] }
  });
  const merged = mergeConfigs(current, imported);
  assert.deepEqual(merged.instances.map((item) => item.id), ['new', 'old']);
  assert.equal(merged.instances[1].defaultCloneRoot, '/tmp/old/');
  assert.equal(merged.clone.defaultMode, 'reclone');
  assert.equal(merged.monitor.targets.length, 2);
});

test('matches dynamic branch selectors', () => {
  const selector = { type: 'rule', prefix: 'release', separator: '/', format: 'yyyymmddDashed' };
  assert.equal(branchSelectorRegex(selector), '^release/\\d{4}-\\d{2}-\\d{2}$');
  assert.equal(branchSelectorSearchPrefix(selector), 'release/');
  assert.equal(matchesBranchSelector('release/2026-06-16', selector), true);
  assert.equal(matchesBranchSelector('release/20260616', selector), false);
});

test('resolves latest matching dynamic branch selector', async () => {
  const selector = { type: 'rule', prefix: 'publish', separator: '-', format: 'yyyymmdd' };
  const seen = [];
  const branch = await resolveBranch(selector, async (search) => {
    seen.push(search);
    return [
      { name: 'publish-20260628' },
      { name: 'publish-20260629' },
      { name: 'test-20260629' }
    ];
  });
  assert.deepEqual(seen, ['publish-']);
  assert.equal(branch, 'publish-20260629');
});

test('builds and sanitizes HTTPS clone URLs', () => {
  const project = normalizeProject({
    id: 1,
    path_with_namespace: 'group/repo',
    http_url_to_repo: 'https://gitlab.example.com/group/repo.git',
    ssh_url_to_repo: 'git@gitlab.example.com:group/repo.git'
  }, 'inst-1');
  const url = cloneURL(project, 'https', 'secret-token');
  assert.equal(url, 'https://oauth2:secret-token@gitlab.example.com/group/repo.git');
  assert.equal(stripCredentials(url), 'https://gitlab.example.com/group/repo.git');
  assert.equal(sanitizeGitMessage(`fatal ${url}`, 'secret-token'), 'fatal https://***@gitlab.example.com/group/repo.git');
  assert.equal(cloneURL(project, 'ssh', 'secret-token'), 'git@gitlab.example.com:group/repo.git');
});

test('normalizes GitLab pipeline triggerer', () => {
  const pipeline = normalizePipeline({
    id: 99,
    status: 'success',
    ref: 'main',
    user: {
      id: 7,
      username: 'alice',
      name: 'Alice Zhang',
      avatar_url: 'https://gitlab.example.com/avatar.png',
      web_url: 'https://gitlab.example.com/alice'
    }
  });
  assert.equal(pipeline.triggerer.username, 'alice');
  assert.equal(pipeline.triggerer.displayName, 'alice');
  assert.equal(pipeline.triggerer.name, 'Alice Zhang');
  assert.equal(pipeline.triggerer.avatarURL, 'https://gitlab.example.com/avatar.png');
  assert.equal(pipeline.triggerer.webURL, 'https://gitlab.example.com/alice');
});

test('reads local repo cloned status and current branch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toolkit-gitlab-'));
  const repo = join(root, 'group', 'repo');
  await mkdir(join(repo, '.git'), { recursive: true });
  await writeFile(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
  const status = await localRepoStatus(root, { pathWithNamespace: 'group/repo' });
  assert.equal(status.cloned, true);
  assert.equal(status.branch, 'main');
});

test('reads local repo status when .git points to another directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toolkit-gitlab-worktree-'));
  const repo = join(root, 'group', 'repo');
  const gitDir = join(root, 'actual-git-dir');
  await mkdir(repo, { recursive: true });
  await mkdir(gitDir, { recursive: true });
  await writeFile(join(repo, '.git'), `gitdir: ${gitDir}\n`, 'utf8');
  await writeFile(join(gitDir, 'HEAD'), '0123456789abcdef\n', 'utf8');
  const status = await localRepoStatus(root, { pathWithNamespace: 'group/repo' });
  assert.equal(status.cloned, true);
  assert.equal(status.branch, 'detached 0123456');
});

test('GitLab client fetches paginated project list', async () => {
  const seen = [];
  const fetch = async (url, request) => {
    seen.push({ url, token: request.headers['PRIVATE-TOKEN'] });
    if (seen.length === 1) {
      return new Response(JSON.stringify([{ id: 1, name: 'A', path_with_namespace: 'g/a' }]), {
        status: 200,
        headers: { link: '<https://gitlab.example.com/api/v4/projects?page=2>; rel="next"' }
      });
    }
    return new Response(JSON.stringify([{ id: 2, name: 'B', path_with_namespace: 'g/b' }]), { status: 200 });
  };
  const client = new GitLabClient({ id: 'inst-1', baseURL: 'https://gitlab.example.com' }, 'tk', { fetch });
  const projects = await client.listMyProjects();
  assert.equal(projects.length, 2);
  assert.equal(projects[0].instanceId, 'inst-1');
  assert.equal(seen[0].token, 'tk');
  assert.match(seen[0].url, /membership=true/);
});

test('GitLab client keeps pipeline triggerer from monitor requests', async () => {
  const fetch = async () => new Response(JSON.stringify([
    {
      id: 3,
      status: 'success',
      ref: 'test-20260326',
      web_url: 'https://gitlab.example.com/group/repo/-/pipelines/3',
      user: { id: 7, username: 'alice', name: 'Alice Zhang' }
    }
  ]), { status: 200 });
  const client = new GitLabClient({ id: 'inst-1', baseURL: 'https://gitlab.example.com' }, 'tk', { fetch });
  const pipeline = await client.currentOrLatestPipeline(1, { type: 'fixed', value: 'test-20260326' });
  assert.equal(pipeline.triggerer.username, 'alice');
  assert.equal(pipeline.webURL, 'https://gitlab.example.com/group/repo/-/pipelines/3');
});
