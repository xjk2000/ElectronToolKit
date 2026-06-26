const crypto = require('node:crypto');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');

const HEADER_ALIASES = {
  title: ['title', 'name', '名称', '标题'],
  url: ['url', 'website', 'site', 'origin_url', 'origin url', 'login_uri', '网址', '网站'],
  username: ['username', 'user name', 'login', 'email', 'account', '账号', '用户名'],
  password: ['password', 'pass', '密码'],
  notes: ['note', 'notes', '备注', '说明']
};

function createPasswordVault(options) {
  return new PasswordVault(options);
}

class PasswordVault {
  constructor({ filePath, safeStorage }) {
    this.filePath = filePath;
    this.safeStorage = safeStorage;
    this.items = [];
    this.warning = '';
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      this.items = Array.isArray(parsed?.items) ? parsed.items.map((item) => normalizeStoredCredential(item)).filter(Boolean) : [];
      this.warning = '';
    } catch (error) {
      if (error?.code !== 'ENOENT') this.warning = `密码库读取失败：${error.message}`;
      this.items = [];
    }
  }

  async list() {
    return this.items.map((item) => publicCredential(item));
  }

  async saveCredential(payload) {
    const normalized = normalizeCredentialInput(payload);
    const now = Date.now();
    const existingIndex = normalized.id
      ? this.items.findIndex((item) => item.id === normalized.id)
      : this.items.findIndex((item) => credentialKey(item) === credentialKey(normalized));
    const previous = existingIndex >= 0 ? this.items[existingIndex] : null;
    const item = {
      id: previous?.id || normalized.id || randomId(),
      title: normalized.title,
      url: normalized.url,
      username: normalized.username,
      encryptedPassword: this.encryptPassword(normalized.password),
      notes: normalized.notes,
      source: normalized.source || previous?.source || 'manual',
      createdAt: previous?.createdAt || now,
      updatedAt: now
    };
    if (existingIndex >= 0) this.items[existingIndex] = item;
    else this.items.push(item);
    await this.save();
    return publicCredential(item);
  }

  async deleteCredential(id) {
    this.items = this.items.filter((item) => item.id !== id);
    await this.save();
  }

  revealPassword(id) {
    const item = this.findItem(id);
    return this.decryptPassword(item.encryptedPassword);
  }

  async importCsvFile(filePath) {
    const text = await readFile(filePath, 'utf8');
    return this.importCsvText(text, path.basename(filePath));
  }

  async importCsvText(text, source = 'csv') {
    const rows = parseCsv(text);
    if (rows.length === 0) return { imported: 0, updated: 0, skipped: 0 };
    const headers = rows[0].map(normalizeHeader);
    const indexes = buildHeaderIndexes(headers);
    if (indexes.url < 0 || indexes.username < 0 || indexes.password < 0) {
      throw new Error('CSV 需要包含 URL、用户名、密码列');
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of rows.slice(1)) {
      const payload = {
        title: readCell(row, indexes.title),
        url: readCell(row, indexes.url),
        username: readCell(row, indexes.username),
        password: readCell(row, indexes.password),
        notes: readCell(row, indexes.notes),
        source
      };
      if (!payload.url || !payload.username || !payload.password) {
        skipped += 1;
        continue;
      }
      const key = credentialKey(payload);
      const existed = this.items.some((item) => credentialKey(item) === key);
      await this.saveCredential(payload);
      if (existed) updated += 1;
      else imported += 1;
    }
    return { imported, updated, skipped };
  }

  findItem(id) {
    const item = this.items.find((credential) => credential.id === id);
    if (!item) throw new Error('未找到密码记录');
    return item;
  }

  async save() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify({
      version: 1,
      encryption: this.encryptionMode(),
      items: sortCredentials(this.items)
    }, null, 2), 'utf8');
  }

  encryptPassword(password) {
    const text = String(password ?? '');
    if (this.safeStorage?.isEncryptionAvailable?.()) {
      return {
        mode: 'safeStorage',
        value: this.safeStorage.encryptString(text).toString('base64')
      };
    }
    return { mode: 'plain', value: text };
  }

  decryptPassword(encrypted) {
    if (!encrypted) return '';
    if (typeof encrypted === 'string') return encrypted;
    if (encrypted.mode === 'safeStorage') {
      if (!this.safeStorage?.isEncryptionAvailable?.()) throw new Error('当前系统加密能力不可用，无法解密密码');
      return this.safeStorage.decryptString(Buffer.from(String(encrypted.value || ''), 'base64'));
    }
    return String(encrypted.value || '');
  }

  encryptionMode() {
    return this.safeStorage?.isEncryptionAvailable?.() ? 'safeStorage' : 'plain';
  }
}

function normalizeStoredCredential(item) {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id || '').trim();
  const url = String(item.url || '').trim();
  const username = String(item.username || '').trim();
  if (!id || !url || !username) return null;
  return {
    id,
    title: String(item.title || '').trim(),
    url,
    username,
    encryptedPassword: item.encryptedPassword ?? item.password ?? { mode: 'plain', value: '' },
    notes: String(item.notes || '').trim(),
    source: String(item.source || 'manual').trim(),
    createdAt: Number(item.createdAt) || Date.now(),
    updatedAt: Number(item.updatedAt) || Date.now()
  };
}

function normalizeCredentialInput(payload) {
  const url = String(payload?.url || '').trim();
  const username = String(payload?.username || '').trim();
  const password = String(payload?.password || '');
  if (!url) throw new Error('请输入 URL');
  if (!username) throw new Error('请输入用户名');
  if (!password) throw new Error('请输入密码');
  return {
    id: String(payload?.id || '').trim(),
    title: String(payload?.title || '').trim(),
    url,
    username,
    password,
    notes: String(payload?.notes || '').trim(),
    source: String(payload?.source || '').trim()
  };
}

function publicCredential(item) {
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    username: item.username,
    notes: item.notes,
    source: item.source,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function sortCredentials(items) {
  return [...items].sort((left, right) =>
    `${left.title || left.url}:${left.username}`.localeCompare(`${right.title || right.url}:${right.username}`)
  );
}

function credentialKey(item) {
  return `${String(item.url || '').trim().toLowerCase()}\n${String(item.username || '').trim().toLowerCase()}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim()) || rows.length === 0) rows.push(row);
  return rows.filter((item) => item.some((value) => String(value || '').trim()));
}

function buildHeaderIndexes(headers) {
  const indexFor = (key) => headers.findIndex((header) => HEADER_ALIASES[key].includes(header));
  return {
    title: indexFor('title'),
    url: indexFor('url'),
    username: indexFor('username'),
    password: indexFor('password'),
    notes: indexFor('notes')
  };
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function readCell(row, index) {
  return index >= 0 ? String(row[index] || '').trim() : '';
}

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

module.exports = {
  PasswordVault,
  createPasswordVault,
  parseCsv
};
