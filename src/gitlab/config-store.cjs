const { mkdir, readFile, writeFile, chmod } = require('node:fs/promises');
const path = require('node:path');
const { createDefaultConfig, normalizeConfig } = require('./models.cjs');

class GitLabConfigStore {
  constructor(filePath, options = {}) {
    if (!filePath) throw new Error('缺少 GitLab 配置文件路径');
    this.filePath = filePath;
    this.homeDir = options.homeDir || process.env.HOME || '';
    this.config = createDefaultConfig(this.homeDir);
  }

  async load() {
    try {
      const text = await readFile(this.filePath, 'utf8');
      this.config = normalizeConfig(JSON.parse(text), this.homeDir);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      this.config = createDefaultConfig(this.homeDir);
    }
    return this.get();
  }

  get() {
    return structuredCloneCompat(this.config);
  }

  async save(nextConfig = this.config) {
    this.config = normalizeConfig(nextConfig, this.homeDir);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(this.config, null, 2)}\n`, 'utf8');
    await chmod(this.filePath, 0o600).catch(() => {});
    return this.get();
  }

  async upsertInstance(instance) {
    const next = this.get();
    const index = next.instances.findIndex((item) => item.id === instance.id);
    if (index >= 0) next.instances[index] = instance;
    else next.instances.push(instance);
    return this.save(next);
  }

  async removeInstance(id) {
    const next = this.get();
    next.instances = next.instances.filter((item) => item.id !== id);
    next.monitor.targets = next.monitor.targets.filter((item) => item.instanceId !== id);
    delete next.recentProjects[id];
    return this.save(next);
  }

  async updateCloneSettings(settings) {
    const next = this.get();
    next.clone = { ...next.clone, ...settings };
    return this.save(next);
  }

  async updateMonitorSettings(settings) {
    const next = this.get();
    next.monitor = { ...next.monitor, ...settings };
    return this.save(next);
  }

  async upsertMonitorTarget(target) {
    const next = this.get();
    const id = `${target.instanceId}:${target.projectId}`;
    const index = next.monitor.targets.findIndex((item) => `${item.instanceId}:${item.projectId}` === id);
    if (!Array.isArray(target.watches) || target.watches.length === 0) {
      next.monitor.targets = next.monitor.targets.filter((item) => `${item.instanceId}:${item.projectId}` !== id);
    } else if (index >= 0) {
      next.monitor.targets[index] = target;
    } else {
      next.monitor.targets.push(target);
    }
    return this.save(next);
  }

  async setRecentProjects(instanceId, projects) {
    const next = this.get();
    next.recentProjects[String(instanceId)] = Array.isArray(projects) ? projects : [];
    return this.save(next);
  }

  async importConfig(rawConfig, { merge = true } = {}) {
    const imported = normalizeConfig(rawConfig, this.homeDir);
    const next = merge ? mergeConfigs(this.get(), imported) : imported;
    return this.save(next);
  }
}

function structuredCloneCompat(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeConfigs(current, imported) {
  const next = normalizeConfig(current);
  const instanceById = new Map(next.instances.map((instance) => [instance.id, instance]));
  for (const instance of imported.instances) {
    instanceById.set(instance.id, instance);
  }
  next.instances = [...instanceById.values()];
  next.clone = imported.clone;
  next.monitor = {
    ...imported.monitor,
    targets: mergeMonitorTargets(next.monitor.targets, imported.monitor.targets)
  };
  next.recentProjects = {
    ...next.recentProjects,
    ...imported.recentProjects
  };
  return next;
}

function mergeMonitorTargets(currentTargets = [], importedTargets = []) {
  const targetByKey = new Map();
  for (const target of currentTargets) {
    targetByKey.set(`${target.instanceId}:${target.projectId}`, target);
  }
  for (const target of importedTargets) {
    targetByKey.set(`${target.instanceId}:${target.projectId}`, target);
  }
  return [...targetByKey.values()];
}

module.exports = { GitLabConfigStore, mergeConfigs };
