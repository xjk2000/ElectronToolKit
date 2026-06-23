const { mkdir, readFile, writeFile, chmod } = require('node:fs/promises');
const path = require('node:path');

class GitLabTokenStore {
  constructor(filePath, safeStorage = null) {
    if (!filePath) throw new Error('缺少 GitLab token 存储路径');
    this.filePath = filePath;
    this.safeStorage = safeStorage;
    this.tokens = {};
  }

  async load() {
    try {
      this.tokens = JSON.parse(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      this.tokens = {};
    }
  }

  async get(id) {
    const entry = this.tokens[String(id)];
    if (!entry) return '';
    if (entry.encoding === 'safeStorage') {
      if (!this.safeStorage?.decryptString) throw new Error('当前环境无法解密 GitLab PAT');
      return this.safeStorage.decryptString(Buffer.from(String(entry.value || ''), 'base64'));
    }
    if (entry.encoding === 'plain') return String(entry.value || '');
    return '';
  }

  async set(id, token) {
    const value = String(token || '');
    if (!value) return this.remove(id);
    if (this.safeStorage?.isEncryptionAvailable?.() && this.safeStorage?.encryptString) {
      this.tokens[String(id)] = {
        encoding: 'safeStorage',
        value: this.safeStorage.encryptString(value).toString('base64')
      };
    } else {
      this.tokens[String(id)] = { encoding: 'plain', value };
    }
    await this.save();
  }

  async remove(id) {
    delete this.tokens[String(id)];
    await this.save();
  }

  async save() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(this.tokens, null, 2)}\n`, 'utf8');
    await chmod(this.filePath, 0o600).catch(() => {});
  }
}

module.exports = { GitLabTokenStore };
