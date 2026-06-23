const { readFile, stat } = require('node:fs/promises');
const path = require('node:path');

async function localRepoStatus(rootDirectory, project) {
  const pathWithNamespace = String(project?.pathWithNamespace || '').trim();
  const repoPath = path.join(String(rootDirectory || ''), pathWithNamespace);
  const gitDirectory = await resolveGitDirectory(repoPath);
  if (!gitDirectory) {
    return { cloned: false, branch: '', path: repoPath };
  }
  return {
    cloned: true,
    branch: await readCurrentBranch(gitDirectory),
    path: repoPath
  };
}

async function localRepoStatuses(rootDirectory, projects) {
  const entries = await Promise.all((Array.isArray(projects) ? projects : []).map(async (project) => {
    const status = await localRepoStatus(rootDirectory, project);
    return [String(project.id), status];
  }));
  return Object.fromEntries(entries);
}

async function resolveGitDirectory(repoPath) {
  const dotGit = path.join(repoPath, '.git');
  const dotGitStat = await stat(dotGit).catch(() => null);
  if (!dotGitStat) return null;
  if (dotGitStat.isDirectory()) return dotGit;
  if (!dotGitStat.isFile()) return null;

  const content = await readFile(dotGit, 'utf8').catch(() => '');
  const match = content.trim().match(/^gitdir:\s*(.+)$/i);
  if (!match) return null;
  const rawGitDir = match[1].trim();
  const gitDir = path.isAbsolute(rawGitDir) ? rawGitDir : path.resolve(repoPath, rawGitDir);
  const gitDirStat = await stat(gitDir).catch(() => null);
  return gitDirStat?.isDirectory() ? gitDir : null;
}

async function readCurrentBranch(gitDirectory) {
  const rawHead = (await readFile(path.join(gitDirectory, 'HEAD'), 'utf8').catch(() => '')).trim();
  if (!rawHead) return '';
  const refPrefix = 'ref: refs/heads/';
  if (rawHead.startsWith(refPrefix)) return rawHead.slice(refPrefix.length);
  return `detached ${rawHead.slice(0, 7)}`;
}

module.exports = {
  localRepoStatus,
  localRepoStatuses,
  readCurrentBranch,
  resolveGitDirectory
};
