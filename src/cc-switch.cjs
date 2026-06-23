const path = require('node:path');
const os = require('node:os');
const { mkdir, readFile, rename, writeFile, copyFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const yaml = require('js-yaml');
const { APP_META } = require('./app-meta.cjs');

const SUPPORTED_APPS = ['claude', 'codex', 'gemini', 'opencode', 'openclaw', 'hermes'];
const DEFAULT_STORE = { providers: [], currentByApp: {}, updatedAt: '' };
const TOOLKIT_TOML_PROVIDER = 'toolkit';
const execFileAsync = promisify(execFile);

function createCcSwitchManager({ storePath, homeDir = os.homedir() }) {
  if (!storePath) throw new Error('缺少 cc-switch storePath');
  return new CcSwitchManager({ storePath, homeDir });
}

class CcSwitchManager {
  constructor({ storePath, homeDir }) {
    this.storePath = storePath;
    this.homeDir = homeDir;
  }

  async list() {
    const store = await this.readStore();
    const providersById = new Map(store.providers.map((provider) => [provider.id, provider]));
    return {
      ...store,
      providers: store.providers.map((provider) => ({
        ...provider,
        snippets: buildProviderConfigSnippets(provider)
      })),
      apps: SUPPORTED_APPS.map((id) => {
        const currentProviderId = store.currentByApp?.[id] || '';
        return {
          id,
          label: appLabel(id),
          path: this.configPathForApp(id),
          configured: this.isAppConfigured(id),
          currentProviderId,
          currentProviderName: providersById.get(currentProviderId)?.app === id ? providersById.get(currentProviderId)?.name || '' : ''
        };
      })
    };
  }

  async importExistingCcSwitch(input = {}) {
    const sourcePath = findCcSwitchSourcePath(this.homeDir, input);
    if (!sourcePath) {
      throw new Error('未找到 cc-switch 数据。默认会查找 ~/.cc-switch/cc-switch.db 和 macOS Application Support 目录。');
    }
    const rows = sourcePath.endsWith('.json')
      ? await readCcSwitchExportJson(sourcePath)
      : await readCcSwitchSqliteProviders(sourcePath);
    const candidates = rows.map(extractCcSwitchProvider).filter(Boolean);
    const store = await this.readStore();
    const existingIds = new Set(store.providers.map((provider) => provider.id));
    const existingKeys = new Set(store.providers.map(providerDedupKey));
    const importedProviders = [];
    let updated = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const provider = normalizeProvider(candidate);
      const dedupKey = providerDedupKey(provider);
      const existingIndex = store.providers.findIndex((item) => item.id === provider.id || providerDedupKey(item) === dedupKey);
      if (existingIndex >= 0) {
        const existing = store.providers[existingIndex];
        const changed = ['app', 'slug', 'baseUrl', 'apiKey', 'model', 'websiteUrl', 'notes']
          .some((key) => !existing[key] && provider[key] || key === 'app' && existing[key] !== provider[key]);
        const nextProvider = {
          ...existing,
          app: provider.app,
          slug: existing.slug || provider.slug,
          baseUrl: existing.baseUrl || provider.baseUrl,
          apiKey: existing.apiKey || provider.apiKey,
          model: existing.model || provider.model,
          websiteUrl: existing.websiteUrl || provider.websiteUrl,
          notes: existing.notes || provider.notes,
          updatedAt: new Date().toISOString()
        };
        if (changed) {
          store.providers[existingIndex] = nextProvider;
          updated += 1;
        } else {
          skipped += 1;
        }
        existingIds.add(nextProvider.id);
        existingKeys.add(providerDedupKey(nextProvider));
        continue;
      }
      if (existingIds.has(provider.id) || existingKeys.has(dedupKey)) {
        skipped += 1;
        continue;
      }
      const now = new Date().toISOString();
      provider.createdAt = provider.createdAt || now;
      provider.updatedAt = now;
      store.providers.push(provider);
      existingIds.add(provider.id);
      existingKeys.add(dedupKey);
      importedProviders.push(provider);
    }

    if (importedProviders.length > 0) {
      store.updatedAt = new Date().toISOString();
      await this.writeStore(store);
    }

    return {
      ...(await this.list()),
      importResult: {
        sourcePath,
        imported: importedProviders.length,
        updated,
        skipped,
        total: rows.length
      }
    };
  }

  async saveProvider(input) {
    const provider = normalizeProvider(input);
    const store = await this.readStore();
    const existingIndex = store.providers.findIndex((item) => item.id === provider.id);
    const now = new Date().toISOString();
    const nextProvider = {
      ...provider,
      createdAt: existingIndex >= 0 ? store.providers[existingIndex].createdAt : now,
      updatedAt: now
    };
    if (existingIndex >= 0 && store.providers[existingIndex].app !== nextProvider.app) {
      for (const [app, currentId] of Object.entries(store.currentByApp || {})) {
        if (currentId === nextProvider.id && app !== nextProvider.app) delete store.currentByApp[app];
      }
    }
    if (existingIndex >= 0) store.providers[existingIndex] = nextProvider;
    else store.providers.push(nextProvider);
    store.updatedAt = now;
    await this.writeStore(store);
    return this.list();
  }

  async deleteProvider(id) {
    const store = await this.readStore();
    const providerId = String(id || '').trim();
    store.providers = store.providers.filter((provider) => provider.id !== providerId);
    for (const [app, currentId] of Object.entries(store.currentByApp || {})) {
      if (currentId === providerId) delete store.currentByApp[app];
    }
    store.updatedAt = new Date().toISOString();
    await this.writeStore(store);
    return this.list();
  }

  async applyProvider({ providerId, app }) {
    const targetApp = normalizeApp(app);
    const store = await this.readStore();
    const provider = store.providers.find((item) => item.id === providerId);
    if (!provider) throw new Error('供应商不存在');
    if (provider.app !== targetApp) {
      throw new Error(`供应商「${provider.name}」属于 ${appLabel(provider.app)}，不能切换到 ${appLabel(targetApp)}`);
    }
    const result = await this.writeAppConfig(targetApp, provider);
    store.currentByApp[targetApp] = provider.id;
    store.updatedAt = new Date().toISOString();
    await this.writeStore(store);
    return {
      ...(await this.list()),
      applied: {
        app: targetApp,
        providerId: provider.id,
        providerName: provider.name,
        ...result
      }
    };
  }

  async readAppConfig(app) {
    const targetApp = normalizeApp(app);
    const filePath = this.configPathForApp(targetApp);
    return {
      app: targetApp,
      label: appLabel(targetApp),
      configPath: filePath,
      exists: existsSync(filePath),
      content: await readTextIfExists(filePath, '')
    };
  }

  async writeAppConfigRaw({ app, content }) {
    const targetApp = normalizeApp(app);
    const filePath = this.configPathForApp(targetApp);
    validateRawConfig(targetApp, String(content ?? ''));
    const backupPath = await backupIfExists(filePath);
    await atomicWriteText(filePath, String(content ?? ''));
    return { ...(await this.readAppConfig(targetApp)), backupPath };
  }

  async readStore() {
    if (!existsSync(this.storePath)) return { ...DEFAULT_STORE };
    const content = await readFile(this.storePath, 'utf8');
    const parsed = JSON.parse(content);
    const normalized = normalizeStoreProviders(Array.isArray(parsed.providers) ? parsed.providers : [], parsed.currentByApp);
    return {
      providers: normalized.providers,
      currentByApp: normalized.currentByApp,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : ''
    };
  }

  async writeStore(store) {
    await atomicWriteJson(this.storePath, store);
  }

  async writeAppConfig(app, provider) {
    if (app === 'claude') return this.writeClaudeConfig(provider);
    if (app === 'codex') return this.writeCodexConfig(provider);
    if (app === 'gemini') return this.writeGeminiConfig(provider);
    if (app === 'opencode') return this.writeOpenCodeConfig(provider);
    if (app === 'openclaw') return this.writeOpenClawConfig(provider);
    if (app === 'hermes') return this.writeHermesConfig(provider);
    throw new Error(`暂不支持的应用：${app}`);
  }

  async writeClaudeConfig(provider) {
    const filePath = this.configPathForApp('claude');
    const config = await readJsonIfExists(filePath, {});
    const env = { ...(isPlainObject(config.env) ? config.env : {}) };
    const claude = normalizeClaudeOptions(provider.claude);
    const mappings = claude.modelMappings;
    if (provider.baseUrl) env.ANTHROPIC_BASE_URL = provider.baseUrl;
    if (provider.apiKey) env[claude.authField] = provider.apiKey;
    if (provider.apiKey && claude.authField !== 'ANTHROPIC_AUTH_TOKEN') delete env.ANTHROPIC_AUTH_TOKEN;
    if (provider.apiKey && claude.authField !== 'ANTHROPIC_API_KEY') delete env.ANTHROPIC_API_KEY;

    const defaultModel = claude.fallbackModel || provider.model || mappings.sonnet.requestModel || mappings.opus.requestModel || mappings.haiku.requestModel;
    if (defaultModel) {
      config.model = defaultModel;
      env.ANTHROPIC_MODEL = defaultModel;
    }
    if (mappings.sonnet.requestModel) env.ANTHROPIC_DEFAULT_SONNET_MODEL = mappings.sonnet.requestModel;
    if (mappings.opus.requestModel) env.ANTHROPIC_DEFAULT_OPUS_MODEL = mappings.opus.requestModel;
    if (mappings.haiku.requestModel) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = mappings.haiku.requestModel;
    config.env = env;
    const backupPath = await backupIfExists(filePath);
    await atomicWriteJson(filePath, config);
    return { configPath: filePath, backupPath };
  }

  async writeCodexConfig(provider) {
    const filePath = this.configPathForApp('codex');
    const previous = await readTextIfExists(filePath, '');
    const next = buildCodexToml(previous, provider);
    const authPath = path.join(path.dirname(filePath), 'auth.json');
    const backupPath = await backupIfExists(filePath);
    const authBackupPath = await backupIfExists(authPath);
    await atomicWriteText(filePath, next);
    if (provider.apiKey) await atomicWriteJson(authPath, { OPENAI_API_KEY: provider.apiKey });
    return {
      configPath: filePath,
      backupPath,
      extraPaths: [{ configPath: authPath, backupPath: authBackupPath }]
    };
  }

  async writeGeminiConfig(provider) {
    const envPath = this.configPathForApp('gemini');
    const env = parseEnv(await readTextIfExists(envPath, ''));
    if (provider.baseUrl) env.GOOGLE_GEMINI_BASE_URL = provider.baseUrl;
    if (provider.apiKey) env.GEMINI_API_KEY = provider.apiKey;
    if (provider.model) env.GEMINI_MODEL = provider.model;
    const envBackupPath = await backupIfExists(envPath);
    await atomicWriteText(envPath, serializeEnv(env));

    const settingsPath = path.join(path.dirname(envPath), 'settings.json');
    const settings = await readJsonIfExists(settingsPath, {});
    settings.security = isPlainObject(settings.security) ? settings.security : {};
    settings.security.auth = isPlainObject(settings.security.auth) ? settings.security.auth : {};
    settings.security.auth.selectedType = provider.apiKey ? 'gemini-api-key' : 'oauth-personal';
    const settingsBackupPath = await backupIfExists(settingsPath);
    await atomicWriteJson(settingsPath, settings);

    return { configPath: envPath, backupPath: envBackupPath, extraPaths: [{ configPath: settingsPath, backupPath: settingsBackupPath }] };
  }

  async writeOpenCodeConfig(provider) {
    const filePath = this.configPathForApp('opencode');
    const config = await readJsonIfExists(filePath, { $schema: 'https://opencode.ai/config.json' });
    config.provider = isPlainObject(config.provider) ? config.provider : {};
    config.provider[provider.slug] = {
      npm: '@ai-sdk/openai-compatible',
      name: provider.name,
      options: {
        baseURL: provider.baseUrl,
        apiKey: provider.apiKey
      },
      models: provider.model ? { [provider.model]: {} } : {}
    };
    config.model = provider.model ? `${provider.slug}/${provider.model}` : config.model;
    const backupPath = await backupIfExists(filePath);
    await atomicWriteJson(filePath, config);
    return { configPath: filePath, backupPath };
  }

  async writeOpenClawConfig(provider) {
    const filePath = this.configPathForApp('openclaw');
    const config = await readJsonIfExists(filePath, { models: { mode: 'merge', providers: {} } });
    config.models = isPlainObject(config.models) ? config.models : { mode: 'merge', providers: {} };
    config.models.mode = config.models.mode || 'merge';
    config.models.providers = isPlainObject(config.models.providers) ? config.models.providers : {};
    config.models.providers[provider.slug] = {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      api: 'openai',
      models: provider.model ? [{ id: provider.model, name: provider.model }] : []
    };
    config.agents = isPlainObject(config.agents) ? config.agents : {};
    config.agents.defaults = isPlainObject(config.agents.defaults) ? config.agents.defaults : {};
    if (provider.model) config.agents.defaults.model = { primary: `${provider.slug}/${provider.model}`, fallbacks: [] };
    const backupPath = await backupIfExists(filePath);
    await atomicWriteJson(filePath, config);
    return { configPath: filePath, backupPath };
  }

  async writeHermesConfig(provider) {
    const filePath = this.configPathForApp('hermes');
    const current = await readYamlIfExists(filePath, {});
    const config = isPlainObject(current) ? current : {};
    config.model = isPlainObject(config.model) ? config.model : {};
    config.model.provider = provider.slug;
    if (provider.model) config.model.default = provider.model;
    if (provider.baseUrl) config.model.base_url = provider.baseUrl;
    config.custom_providers = Array.isArray(config.custom_providers) ? config.custom_providers : [];
    const nextProvider = {
      name: provider.slug,
      base_url: provider.baseUrl,
      api_key: provider.apiKey,
      model: provider.model || undefined
    };
    const index = config.custom_providers.findIndex((item) => item && item.name === provider.slug);
    if (index >= 0) config.custom_providers[index] = nextProvider;
    else config.custom_providers.push(nextProvider);
    const backupPath = await backupIfExists(filePath);
    await atomicWriteText(filePath, yaml.dump(config, { noRefs: true, lineWidth: 120 }));
    return { configPath: filePath, backupPath };
  }

  configPathForApp(app) {
    const targetApp = normalizeApp(app);
    if (targetApp === 'claude') return path.join(this.homeDir, '.claude', 'settings.json');
    if (targetApp === 'codex') return path.join(this.homeDir, '.codex', 'config.toml');
    if (targetApp === 'gemini') return path.join(this.homeDir, '.gemini', '.env');
    if (targetApp === 'opencode') return path.join(this.homeDir, '.config', 'opencode', 'opencode.json');
    if (targetApp === 'openclaw') return path.join(this.homeDir, '.openclaw', 'openclaw.json');
    if (targetApp === 'hermes') return path.join(this.homeDir, '.hermes', 'config.yaml');
    throw new Error(`暂不支持的应用：${app}`);
  }

  isAppConfigured(app) {
    const targetApp = normalizeApp(app);
    if (existsSync(this.configPathForApp(targetApp))) return true;
    if (targetApp === 'claude') return Boolean(process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_BASE_URL);
    if (targetApp === 'codex') return Boolean(process.env.OPENAI_API_KEY || process.env.CODEX_HOME);
    if (targetApp === 'gemini') return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_BASE_URL);
    if (targetApp === 'opencode') return Boolean(process.env.OPENCODE_DB || process.env.XDG_CONFIG_HOME);
    return false;
  }
}

function normalizeProvider(input) {
  const source = input && typeof input === 'object' ? input : {};
  const name = String(source.name || '').trim();
  if (!name) throw new Error('供应商名称不能为空');
  const baseUrl = trimTrailingSlash(String(source.baseUrl || source.baseURL || '').trim());
  const apiKey = String(source.apiKey || source.api_key || '').trim();
  const model = String(source.model || source.defaultModel || source.default_model || '').trim();
  const slug = sanitizeSlug(source.slug || name);
  const app = normalizeProviderApp(source.app || source.appType || source.app_type || source.targetApp || source.tool, source);
  return {
    id: String(source.id || slug || cryptoRandomId()).trim(),
    slug,
    name,
    app,
    baseUrl,
    apiKey,
    model,
    claude: normalizeClaudeOptions(source.claude || source.claudeOptions),
    codex: normalizeCodexOptions(source.codex || source.codexOptions),
    websiteUrl: String(source.websiteUrl || source.websiteURL || source.website_url || '').trim(),
    notes: String(source.notes || '').trim(),
    createdAt: source.createdAt || '',
    updatedAt: source.updatedAt || ''
  };
}

function buildCodexToml(previous, provider) {
  const codex = normalizeCodexOptions(provider.codex);
  const lines = String(previous || '').split(/\r?\n/);
  const filtered = [];
  let inToolkitProvider = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[model_providers\.toolkit\]$/i.test(trimmed)) {
      inToolkitProvider = true;
      continue;
    }
    if (inToolkitProvider && /^\[/.test(trimmed)) inToolkitProvider = false;
    if (inToolkitProvider) continue;
    if (/^(model|model_provider)\s*=/.test(trimmed)) continue;
    filtered.push(line);
  }
  while (filtered.length && !filtered[filtered.length - 1].trim()) filtered.pop();
  const block = [
    '',
    `# ${APP_META.displayName} CC Switch`,
    provider.model ? `model = ${tomlString(provider.model)}` : '',
    `model_provider = ${tomlString(TOOLKIT_TOML_PROVIDER)}`,
    '',
    `[model_providers.${TOOLKIT_TOML_PROVIDER}]`,
    `name = ${tomlString(provider.name)}`,
    provider.baseUrl ? `base_url = ${tomlString(provider.baseUrl)}` : '',
    `wire_api = ${tomlString(codex.wireApi)}`,
    provider.apiKey ? `experimental_bearer_token = ${tomlString(provider.apiKey)}` : ''
  ].filter(Boolean);
  return `${filtered.join('\n')}${block.join('\n')}\n`;
}

function buildProviderConfigSnippets(provider) {
  const slug = sanitizeSlug(provider.slug || provider.name);
  const model = provider.model || 'your-model-name';
  const baseUrl = provider.baseUrl || 'https://api.example.com/v1';
  const apiKey = provider.apiKey || 'sk-your-api-key';
  return [
    {
      app: 'claude',
      label: 'Claude Code settings.json',
      path: '~/.claude/settings.json',
      language: 'json',
      content: JSON.stringify(
        {
          env: {
            ANTHROPIC_BASE_URL: baseUrl,
            ANTHROPIC_AUTH_TOKEN: apiKey,
            ANTHROPIC_MODEL: model,
            ANTHROPIC_DEFAULT_SONNET_MODEL: model
          }
        },
        null,
        2
      )
    },
    {
      app: 'codex',
      label: 'Codex config.toml',
      path: '~/.codex/config.toml',
      language: 'toml',
      content: buildCodexToml('', { ...provider, baseUrl, apiKey, model }).trim()
    },
    {
      app: 'codex-auth',
      label: 'Codex auth.json',
      path: '~/.codex/auth.json',
      language: 'json',
      content: JSON.stringify({ OPENAI_API_KEY: apiKey }, null, 2)
    },
    {
      app: 'gemini',
      label: 'Gemini .env',
      path: '~/.gemini/.env',
      language: 'env',
      content: serializeEnv({
        GEMINI_API_KEY: apiKey,
        GEMINI_MODEL: model,
        GOOGLE_GEMINI_BASE_URL: baseUrl
      }).trim()
    },
    {
      app: 'opencode',
      label: 'OpenCode opencode.json',
      path: '~/.config/opencode/opencode.json',
      language: 'json',
      content: JSON.stringify(
        {
          provider: {
            [slug]: {
              npm: '@ai-sdk/openai-compatible',
              name: provider.name || slug,
              options: {
                baseURL: baseUrl,
                apiKey
              },
              models: {
                [model]: {}
              }
            }
          },
          model: `${slug}/${model}`
        },
        null,
        2
      )
    },
    {
      app: 'openclaw',
      label: 'OpenClaw openclaw.json',
      path: '~/.openclaw/openclaw.json',
      language: 'json',
      content: JSON.stringify(
        {
          models: {
            mode: 'merge',
            providers: {
              [slug]: {
                baseUrl,
                apiKey,
                api: 'openai',
                models: [{ id: model, name: model }]
              }
            }
          },
          agents: {
            defaults: {
              model: {
                primary: `${slug}/${model}`,
                fallbacks: []
              }
            }
          }
        },
        null,
        2
      )
    },
    {
      app: 'hermes',
      label: 'Hermes config.yaml',
      path: '~/.hermes/config.yaml',
      language: 'yaml',
      content: yaml.dump(
        {
          model: {
            provider: slug,
            default: model,
            base_url: baseUrl
          },
          custom_providers: [
            {
              name: slug,
              base_url: baseUrl,
              api_key: apiKey,
              model
            }
          ]
        },
        { noRefs: true, lineWidth: 120 }
      ).trim()
    }
  ];
}

function findCcSwitchSourcePath(homeDir, input = {}) {
  const explicitPath = String(input.dbPath || input.jsonPath || input.sourcePath || '').trim();
  if (explicitPath && existsSync(expandHome(explicitPath, homeDir))) return expandHome(explicitPath, homeDir);
  const candidates = [
    path.join(homeDir, '.cc-switch', 'cc-switch.db'),
    path.join(homeDir, '.cc-switch', 'database.db'),
    path.join(homeDir, 'Library', 'Application Support', 'cc-switch', 'cc-switch.db'),
    path.join(homeDir, 'Library', 'Application Support', 'cc-switch', 'database.db'),
    path.join(homeDir, 'Library', 'Application Support', 'com.cc-switch.app', 'cc-switch.db'),
    path.join(homeDir, 'Library', 'Application Support', 'com.ccswitch.desktop', 'cc-switch.db'),
    path.join(homeDir, 'Library', 'Application Support', 'com.ccswitch.desktop', 'database.db'),
    path.join(homeDir, 'Library', 'Application Support', 'com.ccswitch.desktop', 'providers.db'),
    path.join(homeDir, 'Library', 'Application Support', 'com.farion.cc-switch', 'cc-switch.db')
  ];
  return candidates.find((candidate) => existsSync(candidate)) || '';
}

async function readCcSwitchSqliteProviders(dbPath) {
  const queries = [
    'select id, app_type, name, settings_config, website_url, notes, created_at, updated_at from providers',
    'select * from providers',
    'select * from universal_providers'
  ];
  let lastError = null;
  for (const query of queries) {
    try {
      const { stdout } = await execFileAsync('sqlite3', ['-json', dbPath, query], { maxBuffer: 8 * 1024 * 1024 });
      const parsed = JSON.parse(stdout || '[]');
      if (Array.isArray(parsed)) return parsed;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`读取 cc-switch 数据库失败：${lastError?.message || 'providers 表不存在'}`);
}

async function readCcSwitchExportJson(jsonPath) {
  const content = await readFile(jsonPath, 'utf8');
  const parsed = JSON.parse(content);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.providers)) return parsed.providers;
  if (Array.isArray(parsed.data?.providers)) return parsed.data.providers;
  if (Array.isArray(parsed.universalProviders)) return parsed.universalProviders;
  throw new Error('无法识别 cc-switch 导出 JSON，未找到 providers 列表。');
}

function extractCcSwitchProvider(row) {
  const config = parseMaybeJson(row.settings_config ?? row.settingsConfig ?? row.config ?? row.provider_config ?? row.providerConfig);
  const nested = isPlainObject(config) ? config : {};
  const name = stringFromAliases(row, nested, ['name', 'provider_name', 'providerName', 'title']) || 'CC Switch Provider';
  const baseUrl = trimTrailingSlash(stringFromAliases(row, nested, [
    'base_url',
    'baseUrl',
    'api_base_url',
    'apiBaseUrl',
    'api_url',
    'apiUrl',
    'endpoint',
    'url',
    'openai_base_url',
    'anthropic_base_url'
  ]));
  const apiKey = stringFromAliases(row, nested, [
    'api_key',
    'apiKey',
    'key',
    'token',
    'auth_token',
    'authToken',
    'bearer_token',
    'openai_api_key',
    'anthropic_auth_token'
  ]);
  const model = stringFromAliases(row, nested, ['model', 'model_name', 'modelName', 'default_model', 'defaultModel', 'selected_model', 'selectedModel'])
    || firstModelName(nested);
  return {
    id: `ccswitch-${sanitizeSlug(row.id || name)}`,
    name,
    slug: sanitizeSlug(name),
    app: normalizeProviderApp(stringFromAliases(row, nested, ['app_type', 'appType', 'app', 'target_app', 'targetApp', 'tool'])),
    baseUrl,
    apiKey,
    model,
    websiteUrl: stringFromAliases(row, nested, ['website_url', 'websiteUrl', 'website', 'homepage', 'home_url']),
    notes: stringFromAliases(row, nested, ['notes', 'description', 'remark', 'memo']),
    createdAt: row.created_at || row.createdAt || '',
    updatedAt: row.updated_at || row.updatedAt || ''
  };
}

function parseMaybeJson(value) {
  if (isPlainObject(value)) return value;
  const text = String(value || '').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function stringFromAliases(row, nested, aliases) {
  for (const alias of aliases) {
    const direct = valueByKey(row, alias);
    if (direct) return direct;
    const nestedValue = findNestedString(nested, alias);
    if (nestedValue) return nestedValue;
  }
  return '';
}

function valueByKey(source, key) {
  if (!source || typeof source !== 'object') return '';
  const value = source[key];
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function findNestedString(source, key) {
  if (!source || typeof source !== 'object') return '';
  const normalizedKey = key.toLowerCase().replace(/[_-]/g, '');
  for (const [entryKey, entryValue] of Object.entries(source)) {
    const normalizedEntryKey = entryKey.toLowerCase().replace(/[_-]/g, '');
    if (normalizedEntryKey === normalizedKey && (typeof entryValue === 'string' || typeof entryValue === 'number')) {
      return String(entryValue).trim();
    }
    if (entryValue && typeof entryValue === 'object') {
      const nested = findNestedString(entryValue, key);
      if (nested) return nested;
    }
  }
  return '';
}

function firstModelName(source) {
  if (!source || typeof source !== 'object') return '';
  if (Array.isArray(source.models)) {
    for (const item of source.models) {
      if (typeof item === 'string' && item.trim()) return item.trim();
      if (item && typeof item === 'object') {
        const value = item.id || item.name || item.model;
        if (value) return String(value).trim();
      }
    }
  }
  for (const value of Object.values(source)) {
    if (value && typeof value === 'object') {
      const nested = firstModelName(value);
      if (nested) return nested;
    }
  }
  return '';
}

function providerDedupKey(provider) {
  return `${String(provider.app || '').toLowerCase()}|${String(provider.name || '').toLowerCase()}|${String(provider.baseUrl || '').toLowerCase()}`;
}

function normalizeStoreProviders(rawProviders, currentByApp = {}) {
  const providers = [];
  const idMap = new Map();
  const indexByIdentity = new Map();

  for (const raw of rawProviders) {
    const provider = normalizeProvider(raw);
    const identities = providerIdentityKeys(provider);
    const existingIndex = identities
      .map((key) => indexByIdentity.get(key))
      .find((index) => index !== undefined);
    if (existingIndex === undefined) {
      const index = providers.length;
      providers.push(provider);
      idMap.set(provider.id, provider.id);
      identities.forEach((key) => indexByIdentity.set(key, index));
      continue;
    }

    const existing = providers[existingIndex];
    const merged = mergeProviders(existing, provider);
    providers[existingIndex] = merged;
    idMap.set(provider.id, merged.id);
    idMap.set(existing.id, merged.id);
    providerIdentityKeys(merged).forEach((key) => indexByIdentity.set(key, existingIndex));
  }

  const nextCurrentByApp = {};
  if (currentByApp && typeof currentByApp === 'object') {
    for (const [app, id] of Object.entries(currentByApp)) {
      const mappedId = idMap.get(id) || id;
      const provider = providers.find((item) => item.id === mappedId);
      if (provider?.app === app) nextCurrentByApp[app] = mappedId;
    }
  }

  return { providers, currentByApp: nextCurrentByApp };
}

function providerIdentityKeys(provider) {
  const app = provider.app || '';
  const slug = provider.slug || sanitizeSlug(provider.name);
  const keys = [];
  if (provider.apiKey) keys.push(`${app}|key|${provider.apiKey}`);
  if (slug && provider.apiKey) keys.push(`${app}|slug-key|${slug}|${provider.apiKey}`);
  const endpoint = canonicalProviderEndpoint(provider);
  if (slug && endpoint) keys.push(`${app}|slug-endpoint|${slug}|${endpoint}`);
  if (provider.name && endpoint) keys.push(`${app}|name-endpoint|${provider.name.toLowerCase()}|${endpoint}`);
  return keys;
}

function canonicalProviderEndpoint(provider) {
  const value = provider.baseUrl || provider.websiteUrl || '';
  if (!value) return '';
  try {
    const url = new URL(value);
    const host = url.host.toLowerCase();
    let pathname = url.pathname.toLowerCase().replace(/\/+$/g, '');
    pathname = pathname.replace(/\/api\/v\d+$/g, '/api').replace(/\/v\d+$/g, '');
    return `${host}${pathname}`;
  } catch {
    return value.toLowerCase().replace(/\/+$/g, '').replace(/\/api\/v\d+$/g, '/api').replace(/\/v\d+$/g, '');
  }
}

function mergeProviders(left, right) {
  const preferred = providerCompletenessScore(right) >= providerCompletenessScore(left) ? right : left;
  const fallback = preferred === right ? left : right;
  return normalizeProvider({
    ...fallback,
    ...preferred,
    id: preferred.id || fallback.id,
    slug: preferred.slug || fallback.slug,
    name: preferred.name || fallback.name,
    app: preferred.app || fallback.app,
    baseUrl: preferred.baseUrl || fallback.baseUrl,
    apiKey: preferred.apiKey || fallback.apiKey,
    model: preferred.model || fallback.model,
    claude: mergePlainObjects(fallback.claude, preferred.claude),
    codex: mergePlainObjects(fallback.codex, preferred.codex),
    websiteUrl: preferred.websiteUrl || fallback.websiteUrl,
    notes: preferred.notes || fallback.notes,
    createdAt: fallback.createdAt || preferred.createdAt,
    updatedAt: preferred.updatedAt || fallback.updatedAt
  });
}

function providerCompletenessScore(provider) {
  return [
    provider.baseUrl,
    provider.apiKey,
    provider.model,
    provider.websiteUrl,
    provider.notes,
    provider.claude?.fallbackModel,
    provider.codex?.wireApi
  ].filter(Boolean).length;
}

function mergePlainObjects(left, right) {
  return {
    ...(isPlainObject(left) ? left : {}),
    ...(isPlainObject(right) ? right : {})
  };
}

function normalizeClaudeOptions(input) {
  const source = isPlainObject(input) ? input : {};
  const authField = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'].includes(source.authField) ? source.authField : 'ANTHROPIC_AUTH_TOKEN';
  const apiFormat = ['anthropic', 'openai'].includes(source.apiFormat) ? source.apiFormat : 'anthropic';
  return {
    apiFormat,
    authField,
    fallbackModel: String(source.fallbackModel || '').trim(),
    modelMappings: normalizeClaudeModelMappings(source.modelMappings)
  };
}

function normalizeClaudeModelMappings(input) {
  const source = isPlainObject(input) ? input : {};
  return Object.fromEntries(['sonnet', 'opus', 'haiku'].map((role) => {
    const item = isPlainObject(source[role]) ? source[role] : {};
    return [role, {
      displayName: String(item.displayName || '').trim(),
      requestModel: String(item.requestModel || '').trim(),
      context1m: Boolean(item.context1m)
    }];
  }));
}

function normalizeCodexOptions(input) {
  const source = isPlainObject(input) ? input : {};
  const wireApi = ['responses', 'chat'].includes(source.wireApi) ? source.wireApi : 'responses';
  return { wireApi };
}

function expandHome(value, homeDir) {
  if (value === '~') return homeDir;
  if (value.startsWith('~/')) return path.join(homeDir, value.slice(2));
  return value;
}

function normalizeApp(app) {
  const value = String(app || '').trim();
  if (!SUPPORTED_APPS.includes(value)) throw new Error(`暂不支持的应用：${value}`);
  return value;
}

function normalizeProviderApp(value, source = {}) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s._]+/g, '-');
  const aliases = {
    anthropic: 'claude',
    claude: 'claude',
    'claude-code': 'claude',
    claudecode: 'claude',
    codex: 'codex',
    'openai-codex': 'codex',
    gemini: 'gemini',
    'gemini-cli': 'gemini',
    opencode: 'opencode',
    'open-code': 'opencode',
    openclaw: 'openclaw',
    'open-claw': 'openclaw',
    hermes: 'hermes'
  };
  const app = aliases[normalized] || normalized;
  if (SUPPORTED_APPS.includes(app)) return app;
  return inferLegacyProviderApp(source);
}

function inferLegacyProviderApp(source = {}) {
  const id = String(source.id || '').toLowerCase();
  const name = String(source.name || source.slug || '').toLowerCase();
  const slug = String(source.slug || '').toLowerCase();
  const websiteUrl = String(source.websiteUrl || source.websiteURL || source.website_url || '').toLowerCase();
  const baseUrl = String(source.baseUrl || source.baseURL || '').toLowerCase();
  const model = String(source.model || source.defaultModel || '').toLowerCase();
  const identity = `${id} ${name} ${slug} ${websiteUrl}`;
  const joined = `${id} ${name} ${slug} ${websiteUrl} ${baseUrl} ${model}`;

  if (joined.includes('gemini') || joined.includes('google-official') || websiteUrl.includes('ai.google.dev')) return 'gemini';
  if (
    joined.includes('codex')
    || joined.includes('openai-official')
    || websiteUrl.includes('chatgpt.com/codex')
    || /\bgpt[-\w.]*/.test(model)
    || [
      'flatkey',
      'jiexi6',
      'coderelay',
      '12345xyx',
      'yunqiao'
    ].some((keyword) => identity.includes(keyword))
  ) {
    return 'codex';
  }
  return 'claude';
}

function appLabel(app) {
  return {
    claude: 'Claude Code',
    codex: 'Codex',
    gemini: 'Gemini CLI',
    opencode: 'OpenCode',
    openclaw: 'OpenClaw',
    hermes: 'Hermes'
  }[app] || app;
}

function sanitizeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || cryptoRandomId();
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/g, '');
}

function cryptoRandomId() {
  return `provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readJsonIfExists(filePath, fallback) {
  if (!existsSync(filePath)) return structuredClone(fallback);
  const content = await readFile(filePath, 'utf8');
  if (!content.trim()) return structuredClone(fallback);
  return JSON.parse(content);
}

async function readYamlIfExists(filePath, fallback) {
  if (!existsSync(filePath)) return structuredClone(fallback);
  const content = await readFile(filePath, 'utf8');
  if (!content.trim()) return structuredClone(fallback);
  return yaml.load(content);
}

async function readTextIfExists(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  return readFile(filePath, 'utf8');
}

async function backupIfExists(filePath) {
  if (!existsSync(filePath)) return '';
  const backupPath = `${filePath}.toolkit-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await copyFile(filePath, backupPath);
  return backupPath;
}

async function atomicWriteJson(filePath, value) {
  await atomicWriteText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function atomicWriteText(filePath, content) {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await writeFile(tempPath, content);
  await rename(tempPath, filePath);
}

function parseEnv(content) {
  const result = {};
  String(content || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const index = trimmed.indexOf('=');
    if (index <= 0) return;
    result[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  });
  return result;
}

function validateRawConfig(app, content) {
  const text = String(content || '');
  if (!text.trim()) return;
  if (app === 'claude') {
    JSON.parse(text);
    return;
  }
  if (app === 'hermes') {
    yaml.load(text);
    return;
  }
  if (app === 'gemini') {
    parseEnv(text);
  }
}

function serializeEnv(env) {
  return `${Object.keys(env)
    .sort()
    .map((key) => `${key}=${env[key]}`)
    .join('\n')}\n`;
}

function tomlString(value) {
  return JSON.stringify(String(value || ''));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

module.exports = {
  SUPPORTED_APPS,
  buildCodexToml,
  buildProviderConfigSnippets,
  createCcSwitchManager,
  normalizeProvider,
  parseEnv,
  serializeEnv
};
