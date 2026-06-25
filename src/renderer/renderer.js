import {
  buildJsonLinesCsvPreview,
  collectJsonStats,
  compareJsonInputs,
  compareExpectedFileHash,
  decodeBase64Detailed,
  decodeUrlDetailed,
  encodeBase64Detailed,
  encodeUrlDetailed,
  delimitedToJson,
  formatJson,
  formatJsonWithCompactKeys,
  inspectDateTime,
  inspectTimestamp,
  jsonToDelimited,
  jsonToJsonSchema,
  jsonToTypeScript,
  JSON_INPUT_CHAR_LIMIT,
  minifyJson,
  queryJsonPath,
  sortJsonKeys,
  stringifyJsonWithCompactKeysValue,
  validateJson
} from './tool-functions.js';
import { createToolSearchIndex, nextSearchCursorIndex, searchToolsByQuery } from './tool-search.js';
import {
  buildCookieHeader,
  buildHeadersFetchObject,
  buildElasticBulkFromRows,
  buildCronExpressionFromParts,
  buildUrlFromParts,
  calculateCidr,
  calculateCidrDetails,
  calculateDate,
  calculateDateDetails,
  calculateLoan,
  calculatePersonalTax,
  colorFormats,
  convertBaseNumber,
  convertBaseNumberDetails,
  convertCase,
  convertCurlToCode,
  convertDownloadLink,
  convertHexString,
  convertHtmlEntity,
  convertMorse,
  convertUnit,
  countTextInfo,
  describeHexDigest,
  describeHmacDigest,
  describeCronExpression,
  diffLines,
  extractTextPatterns,
  formatUuidList,
  generateMock,
  lookupHttpStatus,
  numberToChineseUpper,
  parseCookieHeader,
  parseCronExpressionFields,
  parseHttpHeaders,
  parseInsertSql,
  parseJwtData,
  parseRsaKeyPairPem,
  parseUrl,
  parseSetCookieHeaders,
  parseColor
} from './extended-tools.js';

const LIVE_RUN_CHAR_LIMIT = 200_000;
const GENERAL_LIVE_RUN_CHAR_LIMIT = 100_000;
const TREE_RENDER_CHAR_LIMIT = 500_000;
const JSON_TREE_RENDER_NODE_LIMIT = 8_000;
const TEXT_RENDER_CHAR_LIMIT = 240_000;
const OUTPUT_PREVIEW_CHAR_LIMIT = 120_000;
const OUTPUT_PREVIEW_TAIL_CHAR_LIMIT = 20_000;
const OUTPUT_SEARCH_MATCH_LIMIT = 500;
const UNIT_GROUPS = {
  length: {
    label: '长度',
    defaultFrom: 'm',
    defaultTo: 'km',
    sample: '1000',
    units: [
      ['mm', '毫米'],
      ['cm', '厘米'],
      ['m', '米'],
      ['km', '千米'],
      ['inch', '英寸'],
      ['ft', '英尺']
    ]
  },
  weight: {
    label: '重量',
    defaultFrom: 'kg',
    defaultTo: 'lb',
    sample: '1',
    units: [
      ['g', '克'],
      ['kg', '千克'],
      ['lb', '磅'],
      ['oz', '盎司']
    ]
  },
  volume: {
    label: '容量',
    defaultFrom: 'l',
    defaultTo: 'ml',
    sample: '1',
    units: [
      ['ml', '毫升'],
      ['l', '升'],
      ['gal', '加仑']
    ]
  },
  temperature: {
    label: '温度',
    defaultFrom: 'c',
    defaultTo: 'f',
    sample: '25',
    units: [
      ['c', '摄氏度'],
      ['f', '华氏度'],
      ['k', '开尔文']
    ]
  }
};
const IMAGE_SUPPORTED_FORMATS = new Set([
  'png',
  'jpg',
  'jpeg',
  'jpe',
  'jfif',
  'webp',
  'avif',
  'tiff',
  'gif',
  'bmp',
  'ico',
  'cur',
  'svg',
  'pdf',
  'doc',
  'docx',
  'ppm',
  'pgm',
  'pbm',
  'pnm',
  'rgb',
  'rgba',
  'xbm',
  'xpm'
]);
const IMAGE_FORMAT_GROUPS = [
  { label: '常用图像', formats: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'jfif', 'jpe'] },
  { label: '图标/矢量', formats: ['ico', 'cur', 'svg', 'xbm', 'xpm'] },
  { label: '文档', formats: ['pdf', 'doc', 'docx', 'docm', 'epub', 'odt', 'rtf', 'xps', 'mobi', 'dot', 'dotx', 'fb2', 'pptx', 'xlsx', 'txt'] },
  { label: '原始/便携位图', formats: ['ppm', 'pgm', 'pbm', 'pnm', 'rgb', 'rgba', 'yuv'] },
  {
    label: '专业格式',
    formats: [
      'ai',
      'dxf',
      'eps',
      'dds',
      'psd',
      'hdr',
      'plt',
      'tga',
      'wmf',
      'emf',
      'jp2',
      'heic',
      'heif',
      'pcx',
      'fig',
      'exr',
      'ps',
      'djvu',
      'wbmp',
      'sk',
      'map',
      'cgm',
      'pdb',
      'sk1',
      'jbg',
      'picon',
      'pcd',
      'xcf',
      'cdr'
    ]
  }
];
const IMAGE_PREVIEW_FORMATS = new Set(['png', 'jpg', 'jpeg', 'jpe', 'jfif', 'webp', 'avif', 'gif', 'bmp', 'svg']);
const USER_PREFS_KEY = 'electrontoolkit:user-prefs:v1';
const LEGACY_USER_PREFS_KEY = 'toolkit:user-prefs:v1';
const MAX_RECENT_TOOLS = 6;
const MAX_RECENT_FILES = 5;

const tools = [
  {
    id: 'json-format',
    name: 'JSON 格式化',
    category: '开发',
    keywords: ['json', 'format', 'pretty'],
    description: '格式化、压缩或校验 JSON 文本。',
    inputMode: 'large',
    placeholder: '{"name":"ElectronToolKit","enabled":true,"data":{"count":2}}',
    sampleInput:
      '{\n  "name": "ElectronToolKit",\n  "enabled": true,\n  "data": {\n    "count": 2,\n    "items": [\n      { "id": 1, "label": "json" },\n      { "id": 2, "label": "hash" }\n    ]\n  }\n}',
    actions: [
      { id: 'format', label: '格式化' },
      { id: 'minify', label: '压缩' },
      { id: 'sort', label: '排序 key' },
      { id: 'validate', label: '校验' }
    ],
    options: [{ key: 'compactKeys', label: '压缩 key', type: 'text', value: '', placeholder: 'data,items' }],
    run: ({ input, action, options }) => {
      if (action === 'minify') return minifyJson(input);
      if (action === 'sort') return sortJsonKeys(input, 2);
      if (action === 'validate') return validateJson(input);
      if (options.compactKeys.length > 0) return formatJsonWithCompactKeys(input, options.compactKeys, 2);
      return formatJson(input, 2);
    }
  },
  {
    id: 'converter',
    name: '多格式互转',
    category: '转换',
    keywords: ['json', 'xml', 'yaml', 'csv', 'tsv', 'converter'],
    description: 'JSON、XML、YAML、CSV、TSV 配置和表格文本互转。',
    inputMode: 'large',
    placeholder: '{"name":"ElectronToolKit","enabled":true}',
    sampleInput: '[\n  { "id": 1, "name": "Alice", "active": true },\n  { "id": 2, "name": "Bob", "active": false }\n]',
    actions: [
      { id: 'json-yaml', label: 'JSON → YAML' },
      { id: 'yaml-json', label: 'YAML → JSON' },
      { id: 'json-xml', label: 'JSON → XML' },
      { id: 'xml-json', label: 'XML → JSON' },
      { id: 'json-csv', label: 'JSON → CSV' },
      { id: 'csv-json', label: 'CSV → JSON' },
      { id: 'json-tsv', label: 'JSON → TSV' },
      { id: 'tsv-json', label: 'TSV → JSON' }
    ],
    run: async ({ input, action }) => {
      const localConverters = {
        'json-csv': () => jsonToDelimited(input, ','),
        'csv-json': () => delimitedToJson(input, ','),
        'json-tsv': () => jsonToDelimited(input, '\t'),
        'tsv-json': () => delimitedToJson(input, '\t')
      };
      if (localConverters[action]) {
        return { ...localConverters[action](), view: action.endsWith('json') ? 'json-tree' : 'text' };
      }
      return {
        ok: true,
        value: await window.toolkit.convertStructured(action, input),
        view: action.endsWith('json') ? 'json-tree' : 'text'
      };
    }
  },
  {
    id: 'json-path',
    name: 'JSON Path 提取',
    category: '开发',
    keywords: ['json', 'jsonpath', 'path', 'query', 'extract', 'jq'],
    description: '按 JSON Path 从 JSON 中快速提取指定字段或数组项。',
    inputMode: 'large',
    inputLabel: 'JSON',
    placeholder: '{"data":{"items":[{"id":1,"label":"json"}]}}',
    sampleInput:
      '{\n  "data": {\n    "items": [\n      { "id": 1, "label": "json" },\n      { "id": 2, "label": "hash" }\n    ]\n  }\n}',
    actions: [{ id: 'extract', label: '提取' }],
    options: [{ key: 'jsonPath', label: 'Path', type: 'text', value: '$.data.items[0].label', placeholder: '$.data.items[*].id' }],
    run: ({ input, options }) => ({ ...queryJsonPath(input, options.jsonPath), view: 'json-tree' })
  },
  {
    id: 'json-typescript',
    name: 'JSON 转 TS 类型',
    category: '开发',
    keywords: ['json', 'typescript', 'ts', 'interface', 'type', 'schema', '类型', 'jiekou', 'leixing'],
    description: '从 JSON 样例推断 TypeScript interface/type，适合接口返回值建模。',
    inputMode: 'large',
    inputLabel: 'JSON 样例',
    placeholder: '{"id":1,"name":"Alice","tags":["admin"]}',
    sampleInput:
      '{\n  "id": 1,\n  "name": "Alice",\n  "active": true,\n  "profile": {\n    "email": "alice@example.com"\n  },\n  "roles": [\n    { "id": 1, "name": "admin" },\n    { "id": 2, "name": "editor", "scope": "team" }\n  ]\n}',
    actions: [{ id: 'generate', label: '生成类型' }],
    options: [{ key: 'typeName', label: '根类型名', type: 'text', value: 'RootObject', placeholder: 'ApiResponse' }],
    run: ({ input, options }) => jsonToTypeScript(input, options.typeName || 'RootObject')
  },
  {
    id: 'json-schema',
    name: 'JSON 转 Schema',
    category: '开发',
    keywords: ['json', 'schema', 'jsonschema', 'draft', 'validate', '契约', '校验', 'jiekou', 'qiyue'],
    description: '从 JSON 样例推断 draft-07 JSON Schema，适合接口契约和表单校验。',
    inputMode: 'large',
    inputLabel: 'JSON 样例',
    placeholder: '{"id":1,"name":"Alice","roles":[{"id":1}]}',
    sampleInput:
      '{\n  "id": 1,\n  "name": "Alice",\n  "active": true,\n  "profile": {\n    "email": "alice@example.com"\n  },\n  "roles": [\n    { "id": 1, "name": "admin" },\n    { "id": 2, "name": "editor", "scope": "team" }\n  ]\n}',
    actions: [{ id: 'generate', label: '生成 Schema' }],
    options: [{ key: 'schemaTitle', label: '标题', type: 'text', value: 'RootSchema', placeholder: 'ApiResponse' }],
    run: ({ input, options }) => ({ ...jsonToJsonSchema(input, options.schemaTitle || 'RootSchema'), view: 'json-tree' })
  },
  {
    id: 'json-file',
    name: '大 JSON 文件检查',
    category: '开发',
    keywords: ['json', 'large', 'file', 'stream', 'validate', 'huge', '大文件', '流式', 'dawenjian', 'dwjjc', 'wenjian', 'wj'],
    description: '选择本地 JSON 文件，流式校验结构、统计节点，并预览文件头尾，适合超大 JSON。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'inspect', label: '打开检查器' }],
    run: () => ({ ok: true, value: '', view: 'json-file-inspector' })
  },
  {
    id: 'json-diff',
    name: 'JSON 对比',
    category: '开发',
    keywords: ['json', 'diff', 'compare', 'duibi', 'chayi', '对比', '差异', '接口'],
    description: '结构化比较两个 JSON，按路径列出新增、删除和变更，适合接口响应对比。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'compare', label: '打开对比器' }],
    run: () => ({ ok: true, value: '', view: 'json-diff' })
  },
  {
    id: 'curl-code',
    name: 'cURL 转代码',
    category: '转换',
    keywords: ['curl', 'fetch', 'axios', 'http', 'request', '代码', '请求', 'api'],
    description: '把常见 cURL 命令转换成 fetch 或 axios 请求代码。',
    inputMode: 'large',
    inputLabel: 'cURL 命令',
    placeholder: "curl 'https://api.example.com/users' -H 'Content-Type: application/json' --data '{\"name\":\"Alice\"}'",
    sampleInput: "curl 'https://api.example.com/users' -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer token' --data '{\"name\":\"Alice\",\"active\":true}'",
    actions: [
      { id: 'fetch', label: '生成 Fetch' },
      { id: 'axios', label: '生成 Axios' }
    ],
    run: ({ input, action }) => convertCurlToCode(input, action)
  },
  {
    id: 'cookie-parser',
    name: 'Cookie 解析器',
    category: '网络',
    keywords: ['cookie', 'set-cookie', 'header', 'session', 'domain', 'path', 'httponly', 'secure', '网络', '请求头', '响应头'],
    description: '解析 Cookie 请求头和 Set-Cookie 响应头，检查安全属性、过期状态并重建 Cookie Header。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'open', label: '打开解析器' }],
    run: () => ({ ok: true, value: '', view: 'cookie-parser' })
  },
  {
    id: 'http-headers',
    name: 'HTTP Header 解析器',
    category: '网络',
    keywords: ['http', 'headers', 'header', 'request', 'response', 'cors', 'cache', 'authorization', '网络', '请求头', '响应头'],
    description: '解析整段请求/响应 Header，识别鉴权、Cookie、缓存、CORS、安全头和重复字段。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'open', label: '打开解析器' }],
    run: () => ({ ok: true, value: '', view: 'http-headers' })
  },
  {
    id: 'sql-es',
    name: 'SQL 转 ES DSL',
    category: '转换',
    keywords: ['sql', 'insert', 'elasticsearch', 'dsl', 'bulk'],
    description: '解析 INSERT 语句，预览表名、字段和行数据，并生成 JSON 或 Elasticsearch Bulk NDJSON。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'open', label: '打开转换器' }],
    run: () => ({ ok: true, value: '', view: 'sql-es' })
  },
  {
    id: 'jwt',
    name: 'JWT 解密分析',
    category: '解析',
    keywords: ['jwt', 'token', 'payload', 'header'],
    description: 'Base64 反序列化 JWT Header 和 Payload，展示算法、签名片段和过期状态。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'analyze', label: '打开分析器' }],
    run: () => ({ ok: true, value: '', view: 'jwt-analyzer' })
  },
  {
    id: 'url-parser',
    name: 'URL 参数解析',
    category: '解析',
    keywords: ['url', 'query', 'parser', 'params'],
    description: '拆解 URL 的协议、Host、Path 和 Query 参数表，编辑后反向生成新 URL。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'parse', label: '打开解析器' }],
    run: () => ({ ok: true, value: '', view: 'url-parser' })
  },
  {
    id: 'cidr',
    name: 'CIDR 子网计算',
    category: '网络',
    keywords: ['cidr', 'ip', 'subnet', '子网', '网络'],
    description: '专用 IPv4 子网面板，拆分掩码、网络地址、广播地址、可用范围和主机数。',
    inputMode: 'none',
    sampleInput: '192.168.1.10/24',
    actions: [{ id: 'open', label: '打开计算器' }],
    run: () => ({ ok: true, value: '', view: 'cidr-tool' })
  },
  {
    id: 'http-status',
    name: 'HTTP 状态码',
    category: '网络',
    keywords: ['http', 'status', 'code', '状态码'],
    description: '查询常见 HTTP 状态码含义。',
    inputMode: 'compact',
    inputLabel: '状态码',
    placeholder: '404',
    sampleInput: '404',
    actions: [{ id: 'lookup', label: '查询' }],
    run: ({ input }) => lookupHttpStatus(input)
  },
  {
    id: 'html-entity',
    name: 'HTML 实体转换',
    category: '编码',
    keywords: ['html', 'entity', 'escape', '实体'],
    description: 'HTML 特殊字符实体编码和解码。',
    inputMode: 'medium',
    inputLabel: 'HTML/文本',
    placeholder: '<div class="title">ElectronToolKit & 工具</div>',
    sampleInput: '<div class="title">ElectronToolKit & 工具</div>',
    actions: [
      { id: 'encode', label: '实体编码' },
      { id: 'decode', label: '实体解码' }
    ],
    run: ({ input, action }) => convertHtmlEntity(input, action)
  },
  {
    id: 'base-converter',
    name: '进制转换',
    category: '编码',
    keywords: ['base', 'binary', 'hex', '进制', '二进制', '十六进制'],
    description: '专用进制面板，一次输入同步展示 BIN、OCT、DEC、HEX 等常用进制。',
    inputMode: 'none',
    sampleInput: 'FF',
    actions: [{ id: 'open', label: '打开进制转换' }],
    run: () => ({ ok: true, value: '', view: 'base-converter' })
  },
  {
    id: 'hex-string',
    name: 'Hex 字符串',
    category: '编码',
    keywords: ['hex', 'string', 'ascii', 'utf8', '十六进制'],
    description: 'UTF-8 字符串和 Hex 字节序列互转。',
    inputMode: 'medium',
    inputLabel: '文本/Hex',
    placeholder: 'ElectronToolKit 工具',
    sampleInput: 'ElectronToolKit 工具',
    actions: [
      { id: 'encode', label: '字符串 → Hex' },
      { id: 'decode', label: 'Hex → 字符串' }
    ],
    run: ({ input, action }) => convertHexString(input, action)
  },
  {
    id: 'punycode',
    name: 'Punycode 转换',
    category: '编码',
    keywords: ['punycode', 'domain', 'idn', '域名'],
    description: '国际化域名和 Punycode 互转。',
    inputMode: 'compact',
    inputLabel: '域名',
    placeholder: '工具.cn',
    sampleInput: '工具.cn',
    actions: [
      { id: 'encode', label: '转 Punycode' },
      { id: 'decode', label: '转 Unicode' }
    ],
    run: async ({ input, action }) => ({ ok: true, value: await window.toolkit.punycode(action, input) })
  },
  {
    id: 'download-link',
    name: '下载链接转换',
    category: '编码',
    keywords: ['thunder', 'flashget', 'download', '下载链接', '迅雷'],
    description: '普通链接与 Thunder、FlashGet 下载链接互转。',
    inputMode: 'compact',
    inputLabel: '链接',
    placeholder: 'https://example.com/file.zip',
    sampleInput: 'https://example.com/file.zip',
    actions: [
      { id: 'thunder-encode', label: '转 Thunder' },
      { id: 'thunder-decode', label: '解 Thunder' },
      { id: 'flashget-encode', label: '转 FlashGet' },
      { id: 'flashget-decode', label: '解 FlashGet' }
    ],
    run: ({ input, action }) => convertDownloadLink(input, action)
  },
  {
    id: 'morse',
    name: '摩斯电码',
    category: '文本',
    keywords: ['morse', 'code', '摩斯', '电码'],
    description: '英文、数字和常见符号与摩斯电码互转。',
    inputMode: 'medium',
    inputLabel: '文本/电码',
    placeholder: 'SOS 123',
    sampleInput: 'SOS 123',
    actions: [
      { id: 'encode', label: '编码' },
      { id: 'decode', label: '解码' }
    ],
    run: ({ input, action }) => convertMorse(input, action)
  },
  {
    id: 'date-calc',
    name: '日期计算',
    category: '时间',
    keywords: ['date', 'day', '日期', '天数'],
    description: '专用日期面板，支持日期加减天数、日期差和快捷天数。',
    inputMode: 'none',
    sampleInput: '2026-06-11\n2026-07-01',
    actions: [{ id: 'open', label: '打开日期计算' }],
    run: () => ({ ok: true, value: '', view: 'date-calc' })
  },
  {
    id: 'unit-converter',
    name: '单位换算',
    category: '换算',
    keywords: ['unit', 'convert', 'length', 'weight', 'temperature', '单位'],
    description: '专用单位换算面板，按长度、重量、容量、温度分组选择并实时展示同类换算。',
    inputMode: 'none',
    sampleInput: '1000',
    actions: [{ id: 'open', label: '打开换算器' }],
    run: () => ({ ok: true, value: '', view: 'unit-converter' })
  },
  {
    id: 'number-uppercase',
    name: '数字转大写',
    category: '换算',
    keywords: ['number', 'rmb', 'money', '大写', '人民币'],
    description: '数字金额转中文大写金额。',
    inputMode: 'compact',
    inputLabel: '金额',
    placeholder: '1234.56',
    sampleInput: '1234.56',
    actions: [{ id: 'convert', label: '转换' }],
    run: ({ input }) => numberToChineseUpper(input)
  },
  {
    id: 'personal-tax',
    name: '个人所得税计算',
    category: '换算',
    keywords: ['tax', 'salary', 'income', '个税', '个人所得税', '工资'],
    description: '按累计预扣法估算工资薪金个人所得税。',
    inputMode: 'none',
    actions: [{ id: 'calculate', label: '计算个税' }],
    options: [
      { key: 'policyName', label: '省市/口径', type: 'text', value: '按当地最新政策参数' },
      { key: 'monthlyIncome', label: '月收入', type: 'number', value: '20000' },
      { key: 'months', label: '月份', type: 'number', value: '12', min: '1', max: '12' },
      { key: 'socialBase', label: '社保基数', type: 'number', value: '' },
      { key: 'socialMinBase', label: '社保下限', type: 'number', value: '0' },
      { key: 'socialMaxBase', label: '社保上限', type: 'number', value: '0' },
      { key: 'housingBase', label: '公积金基数', type: 'number', value: '' },
      { key: 'housingMinBase', label: '公积金下限', type: 'number', value: '0' },
      { key: 'housingMaxBase', label: '公积金上限', type: 'number', value: '0' },
      { key: 'pensionRate', label: '养老%', type: 'number', value: '8', step: '0.01' },
      { key: 'medicalRate', label: '医疗%', type: 'number', value: '2', step: '0.01' },
      { key: 'unemploymentRate', label: '失业%', type: 'number', value: '0.5', step: '0.01' },
      { key: 'housingFundRate', label: '公积金%', type: 'number', value: '7', step: '0.01' },
      { key: 'socialInsurance', label: '其他专项/月', type: 'number', value: '0' },
      { key: 'specialDeduction', label: '月附加扣除', type: 'number', value: '0' },
      { key: 'otherDeduction', label: '月其他扣除', type: 'number', value: '0' },
      { key: 'paidTax', label: '已预缴税', type: 'number', value: '0' }
    ],
    run: ({ options }) => ({ ...calculatePersonalTax(options), view: 'tax' })
  },
  {
    id: 'loan-calculator',
    name: '贷款计算',
    category: '换算',
    keywords: ['loan', 'mortgage', '贷款', '房贷', '等额本息', '等额本金'],
    description: '房贷/贷款月供计算，支持等额本息和等额本金。',
    inputMode: 'none',
    actions: [{ id: 'calculate', label: '计算贷款' }],
    options: [
      { key: 'principalWan', label: '贷款万', type: 'number', value: '100' },
      { key: 'years', label: '年限', type: 'number', value: '30' },
      { key: 'annualRate', label: '年利率%', type: 'number', value: '3.5', step: '0.01' },
      {
        key: 'method',
        label: '方式',
        type: 'select',
        value: 'equal-payment',
        options: [
          { value: 'equal-payment', label: '等额本息' },
          { value: 'equal-principal', label: '等额本金' }
        ]
      }
    ],
    run: ({ options }) => ({ ...calculateLoan(options), view: 'loan' })
  },
  {
    id: 'whiteboard',
    name: '在线白板',
    category: '创作',
    keywords: ['whiteboard', 'draw', 'canvas', '白板', '画板'],
    description: '本地白板涂画、清空和导出 PNG。',
    inputMode: 'none',
    actions: [{ id: 'draw', label: '打开白板' }],
    run: () => ({ ok: true, value: '', view: 'whiteboard' })
  },
  {
    id: 'color',
    name: '颜色选择转换',
    category: '前端',
    keywords: ['color', 'hex', 'rgb', 'rgba', 'picker'],
    description: '调色盘选择颜色，实时转换 Hex、RGB、RGBA、HEXA 和 CSS 变量。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'open', label: '打开取色器' }],
    run: () => ({ ok: true, value: '', view: 'color-picker' })
  },
  {
    id: 'image-converter',
    name: '图片格式转换',
    category: '图像',
    keywords: ['image', 'convert', 'png', 'ico', 'jpg', 'webp', '图片', '格式转换'],
    description: '选择图片文件，转换为 ICO、JPG、WEBP、SVG、PDF、DOCX 等格式。',
    inputMode: 'none',
    placeholder: '',
    sampleInput: '',
    actions: [{ id: 'convert', label: '转换' }],
    run: () => ({ ok: true, value: '', view: 'image-converter' })
  },
  {
    id: 'markdown-docx',
    name: 'Markdown 转 DOCX',
    category: '文档',
    keywords: ['markdown', 'md', 'docx', 'word', 'latex', 'mermaid', '文档', '公式'],
    description: '将 Markdown 导出为 Word 文档，保留图片，常见 LaTeX 转 Word 公式，Mermaid 转图。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'convert', label: '生成 DOCX' }],
    run: () => ({ ok: true, value: '', view: 'markdown-docx' })
  },
  {
    id: 'plantuml',
    name: 'PUML 绘图',
    category: '绘图',
    keywords: ['plantuml', 'puml', 'uml', 'sequence', 'class', 'diagram', '时序图', '类图', '流程图', '绘图'],
    description: '输入 PlantUML / PUML 文本，渲染预览并导出 SVG 或 PNG。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'render', label: '打开绘图器' }],
    run: () => ({ ok: true, value: '', view: 'plantuml' })
  },
  {
    id: 'qr',
    name: '二维码工具',
    category: '生成',
    keywords: ['qr', 'qrcode', '二维码', 'decode'],
    description: '生成二维码或上传 PNG 二维码解析明文，适合本地链接和测试文本快速传到手机。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'open', label: '打开二维码工具' }],
    run: () => ({ ok: true, value: '', view: 'qr-tool' })
  },
  {
    id: 'word-counter',
    name: '字数信息统计',
    category: '文本',
    keywords: ['word', 'counter', '字数', '统计'],
    description: '统计中文字符、英文字母、数字、空格、总行数和总字符数。',
    inputMode: 'medium',
    inputLabel: '文本',
    placeholder: '输入或粘贴一段文本',
    sampleInput: 'Hello ElectronToolKit 123\n你好，工具箱。',
    actions: [{ id: 'count', label: '统计' }],
    run: ({ input }) => ({ ...countTextInfo(input), view: 'stats' })
  },
  {
    id: 'text-diff',
    name: '文本差异对比',
    category: '文本',
    keywords: ['diff', 'compare', '对比', '差异', '文本'],
    description: '左右两段文本逐行对比，突出新增、删除和相同行。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'compare', label: '对比' }],
    run: () => ({ ok: true, value: '', view: 'text-diff' })
  },
  {
    id: 'text-extractor',
    name: '文本提取器',
    category: '文本',
    keywords: ['extract', 'email', 'url', 'phone', 'ip', 'uuid', 'idcard', '提取', '日志'],
    description: '从日志或文本里提取 URL、邮箱、手机号、IPv4、UUID、身份证等关键信息。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'open', label: '打开提取器' }],
    run: () => ({ ok: true, value: '', view: 'text-extractor' })
  },
  {
    id: 'cron',
    name: 'Cron 表达式',
    category: '时间',
    keywords: ['cron', 'schedule', '定时'],
    description: '可视化生成 5 段 Cron 表达式，解析规则并预览未来 5 次执行时间。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'open', label: '打开生成器' }],
    run: () => ({ ok: true, value: '', view: 'cron-builder' })
  },
  {
    id: 'regex',
    name: '正则测试器',
    category: '文本',
    keywords: ['regex', 'regexp', '正则'],
    description: '轻量正则匹配测试，支持邮箱、手机号、IP 常用模板。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'test', label: '打开测试器' }],
    run: () => ({ ok: true, value: '', view: 'regex-tester' })
  },
  {
    id: 'case-converter',
    name: '文本清洗变形',
    category: '文本',
    keywords: ['case', 'camel', 'snake', 'sort', 'dedupe', 'trim'],
    description: '专用文本变形工作台，同时展示大小写、驼峰、蛇形、常量名和行处理结果。',
    inputMode: 'none',
    sampleInput: 'hello world\nhello world\nuser-name value',
    actions: [{ id: 'open', label: '打开工作台' }],
    run: () => ({ ok: true, value: '', view: 'case-converter' })
  },
  {
    id: 'mock',
    name: '随机数据生成',
    category: '生成',
    keywords: ['mock', 'uuid', 'phone', 'idcard', 'email', 'random'],
    description: '生成 UUID、手机号、身份证号、姓名、邮箱和随机字符串。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'open', label: '打开生成器' }],
    run: () => ({ ok: true, value: '', view: 'mock-generator' })
  },
  {
    id: 'symmetric-crypto',
    name: '对称加密解密',
    category: '加密',
    keywords: ['aes', 'des', 'rc4', 'crypto', 'encrypt', 'decrypt'],
    description: '专用对称加密工作台，按算法、模式、Padding、Key/IV 分区处理。',
    inputMode: 'none',
    sampleInput: 'hello toolkit',
    actions: [{ id: 'open', label: '打开工作台' }],
    run: () => ({ ok: true, value: '', view: 'symmetric-crypto' })
  },
  {
    id: 'rsa',
    name: 'RSA 密钥生成',
    category: '加密',
    keywords: ['rsa', 'keypair', 'pkcs1', 'pkcs8'],
    description: '生成 1024/2048/4096 位 RSA 公钥和私钥，支持 PKCS#1/PKCS#8 私钥格式。',
    inputMode: 'none',
    placeholder: '无需输入，点击生成',
    sampleInput: '',
    actions: [{ id: 'open', label: '打开生成器' }],
    run: () => ({ ok: true, value: '', view: 'rsa-keygen' })
  },
  {
    id: 'sm',
    name: '国密算法',
    category: '加密',
    keywords: ['sm2', 'sm3', 'sm4', '国密'],
    description: 'SM2 密钥对、SM3 摘要、SM4 加解密。',
    inputMode: 'compact',
    inputLabel: '文本',
    placeholder: '输入需要处理的文本；SM2 密钥对无需输入',
    sampleInput: 'hello toolkit',
    actions: [
      { id: 'sm3', label: 'SM3 摘要' },
      { id: 'sm2-keypair', label: 'SM2 密钥对' },
      { id: 'sm4-encrypt', label: 'SM4 加密' },
      { id: 'sm4-decrypt', label: 'SM4 解密' }
    ],
    actionInputModes: { 'sm2-keypair': 'none' },
    run: async ({ input, action }) => ({ ok: true, value: await window.toolkit.smRun(action, input), view: action === 'sm2-keypair' ? 'json-tree' : 'text' })
  },
  {
    id: 'hash',
    name: 'MD5 / 哈希',
    category: '编码',
    keywords: ['md5', 'sha', 'hash', '摘要'],
    description: '专用摘要面板，一次生成 MD5、SHA1、SHA256 和 SHA512，支持逐项复制。',
    inputMode: 'none',
    sampleInput: 'ElectronToolKit',
    actions: [{ id: 'open', label: '打开摘要面板' }],
    run: () => ({ ok: true, value: '', view: 'hash-tool' })
  },
  {
    id: 'file-hash',
    name: '文件哈希校验',
    category: '编码',
    keywords: ['file', 'hash', 'md5', 'sha1', 'sha256', 'sha512', 'checksum', '文件', '校验'],
    description: '选择本地文件，流式计算 MD5、SHA1、SHA256、SHA512，适合安装包、图片和大文件校验。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'open', label: '打开校验器' }],
    run: () => ({ ok: true, value: '', view: 'file-hash' })
  },
  {
    id: 'hmac',
    name: 'HMAC 签名',
    category: '加密',
    keywords: ['hmac', 'sign', 'signature', 'sha256', '签名', '验签'],
    description: '专用签名面板，支持 HMAC-SHA256/SHA1/SHA512/MD5，展示 Hex 与 Base64。',
    inputMode: 'none',
    sampleInput: 'method=GET&path=/api/orders&timestamp=1717999200',
    actions: [{ id: 'open', label: '打开签名器' }],
    run: () => ({ ok: true, value: '', view: 'hmac-signer' })
  },
  {
    id: 'base64',
    name: 'Base64 编解码',
    category: '编码',
    keywords: ['base64', 'data uri', 'url safe', '编码', '解码', '图片预览'],
    description: '文本/Base64 双向转换，支持 URL-safe、Data URI 和图片预览。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'open', label: '打开工具' }],
    run: () => ({ ok: true, value: '', view: 'base64-tool' })
  },
  {
    id: 'url',
    name: 'URL 编解码',
    category: '编码',
    keywords: ['url', 'uri', 'encode', 'decode', 'component', 'form', '百分号编码'],
    description: 'URL 组件、整条 URI、表单参数编码解码，统计百分号转义并快速复制。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'open', label: '打开工具' }],
    run: () => ({ ok: true, value: '', view: 'url-codec' })
  },
  {
    id: 'timestamp',
    name: '时间戳转换',
    category: '时间',
    keywords: ['timestamp', 'time', 'date', 'unix', 'iso', 'utc', '时间戳'],
    description: '秒/毫秒时间戳、ISO、UTC 和本地时间互转，并提供快速复制。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'convert', label: '转换' }],
    run: () => ({ ok: true, value: '', view: 'timestamp-converter' })
  },
  {
    id: 'uuid',
    name: 'UUID 生成',
    category: '生成',
    keywords: ['uuid', 'guid', 'random', '批量', 'uppercase', 'hyphen'],
    description: '批量生成 UUID v4，支持大小写、去横杠、URN 前缀和点击复制。',
    inputMode: 'none',
    sampleInput: '',
    actions: [{ id: 'open', label: '打开生成器' }],
    run: () => ({ ok: true, value: '', view: 'uuid-tool' })
  }
];

const elements = {
  search: document.querySelector('#tool-search'),
  appName: document.querySelector('#app-name'),
  appVersion: document.querySelector('#app-version'),
  notesEntry: document.querySelector('#notes-entry'),
  totpEntry: document.querySelector('#totp-entry'),
  gitlabEntry: document.querySelector('#gitlab-entry'),
  ccSwitchEntry: document.querySelector('#cc-switch-entry'),
  list: document.querySelector('#tool-list'),
  category: document.querySelector('#tool-category'),
  title: document.querySelector('#tool-title'),
  description: document.querySelector('#tool-description'),
  controls: document.querySelector('#tool-controls'),
  options: document.querySelector('#tool-options'),
  editorGrid: document.querySelector('#editor-grid'),
  inputPanel: document.querySelector('#input-panel'),
  inputLabel: document.querySelector('#input-label'),
  outputPanel: document.querySelector('#output-panel'),
  outputLabel: document.querySelector('#output-label'),
  outputSearch: document.querySelector('#output-search'),
  outputSearchInput: document.querySelector('#output-search-input'),
  outputSearchCount: document.querySelector('#output-search-count'),
  outputSearchPrev: document.querySelector('#output-search-prev'),
  outputSearchNext: document.querySelector('#output-search-next'),
  input: document.querySelector('#input'),
  output: document.querySelector('#output'),
  status: document.querySelector('#status'),
  paste: document.querySelector('#paste-button'),
  copy: document.querySelector('#copy-button')
};

const initialUserPrefs = loadUserPrefs();

const state = {
  mode: 'tools',
  activeToolId: tools[0].id,
  activeActionByTool: Object.fromEntries(tools.map((tool) => [tool.id, tool.actions[0].id])),
  favorites: initialUserPrefs.favorites,
  recentTools: initialUserPrefs.recentTools,
  searchCursorIndex: 0,
  visibleSearchToolIds: [],
  compactKeys: '',
  optionValuesByTool: Object.fromEntries(
    tools.map((tool) => [tool.id, Object.fromEntries((tool.options ?? []).map((option) => [option.key, option.value ?? '']))])
  ),
  inputValuesByTool: Object.fromEntries(tools.map((tool) => [tool.id, tool.sampleInput ?? ''])),
  lastOutput: '',
  outputSearch: {
    query: '',
    matchIndex: 0,
    matches: [],
    truncated: false
  },
  lastJsonSignature: '',
  jsonEditorValue: null,
  jsonEditorActive: false,
  jsonEditDialog: null,
  suppressInputRun: false,
  manuallyCollapsedPaths: new Set(),
  manuallyExpandedPaths: new Set(),
  jsonFile: {
    loading: false,
    minifying: false,
    formatting: false,
    extracting: false,
    exportingCsv: false,
    extractKey: '',
    jsonlCsvFields: '',
    recentFiles: initialUserPrefs.recentJsonFiles,
    result: null,
    exportResult: null,
    error: ''
  },
  jsonDiff: {
    left: '{\n  "id": 1,\n  "name": "Alice",\n  "roles": ["admin"],\n  "profile": {\n    "active": true,\n    "team": "A"\n  }\n}',
    right: '{\n  "id": 1,\n  "name": "Alice Zhang",\n  "roles": ["admin", "editor"],\n  "profile": {\n    "active": false,\n    "level": 2\n  }\n}',
    filter: 'all',
    result: null
  },
  fileHash: {
    loading: false,
    algorithms: ['md5', 'sha1', 'sha256', 'sha512'],
    expectedHash: '',
    recentFiles: initialUserPrefs.recentHashFiles,
    result: null,
    error: ''
  },
  imageConverter: {
    fileName: '',
    dataUrl: '',
    sourceFormat: 'PNG',
    targetFormat: 'ico',
    result: null
  },
  markdownDocx: {
    markdown: '# 文档标题\n\n这是一段 Markdown，支持图片、公式 $\\frac{1}{2}$ 和 Mermaid。\n\n```mermaid\ngraph TD\n  A[开始] --> B[生成 DOCX]\n```\n',
    fileName: 'markdown-document.docx',
    baseDir: '',
    sourceName: '',
    result: null,
    loading: false,
    error: ''
  },
  plantUml: {
    source: '@startuml\nactor User\nparticipant ElectronToolKit\nUser -> ElectronToolKit: 输入 PUML\nElectronToolKit --> User: 渲染图表\n@enduml',
    serverUrl: 'https://www.plantuml.com/plantuml',
    sourceName: '',
    loading: false,
    result: null,
    error: ''
  },
  ccSwitch: {
    loading: false,
    providers: [],
    apps: [],
    currentByApp: {},
    autoImportTried: false,
    selectedProviderId: '',
    selectedApp: 'claude',
    selectedSnippetApp: 'claude',
    form: {
      id: '',
      app: 'claude',
      name: '',
      slug: '',
      baseUrl: '',
      apiKey: '',
      model: '',
      claude: defaultClaudeFormOptions(),
      codex: defaultCodexFormOptions(),
      websiteUrl: '',
      notes: ''
    },
    lastApplied: null,
    importResult: null,
    rawConfig: {
      app: 'claude',
      configPath: '',
      content: '',
      exists: false,
      loading: false,
      dirty: false,
      backupPath: ''
    },
    error: ''
  },
  sqlEs: {
    sql: "INSERT INTO users (id,name,age,active) VALUES (1,'Alice',18,true),(2,'Bob',20,false);",
    outputMode: 'json',
    indexName: ''
  },
  colorPicker: {
    hex: '#FF5733',
    alpha: 1,
    manual: '#FF5733'
  },
  qrTool: {
    mode: 'generate',
    text: 'https://localhost:3000',
    errorCorrectionLevel: 'M',
    size: 260,
    margin: 2,
    svg: '',
    decoded: '',
    fileName: ''
  },
  mockGenerator: {
    type: 'uuid',
    count: 5,
    length: 8,
    rows: []
  },
  jwtAnalyzer: {
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMDAwMSIsIm5hbWUiOiJUb29sS2l0IiwiaWF0IjoxNzE3OTk5MjAwLCJleHAiOjQxMDI0MTYwMDB9.signature'
  },
  urlParser: {
    rawUrl: 'https://example.com/search?q=toolkit&page=1&tag=json#top',
    data: null,
    error: ''
  },
  urlCodec: {
    mode: 'encode',
    scope: 'component',
    input: 'q=工具箱&sort=时间',
    result: null,
    error: ''
  },
  cookieParser: {
    mode: 'cookie',
    text: 'sid=abc123; theme=dark; locale=zh-CN; token=hello%20world',
    result: null,
    error: ''
  },
  httpHeaders: {
    mode: 'request',
    text: [
      'GET /api/users?page=1 HTTP/1.1',
      'Host: api.example.com',
      'Authorization: Bearer secret-token',
      'Accept: application/json',
      'Cookie: sid=abc123; theme=dark',
      'Cache-Control: no-cache',
      'X-Trace-Id: req-20260614'
    ].join('\n'),
    result: null,
    filter: 'all',
    error: ''
  },
  gitlabTool: {
    loaded: false,
    loading: false,
    tab: 'settings',
    config: null,
    projectsByInstance: {},
    localStatuses: {},
    localStatusLoadingKey: '',
    currentInstanceId: '',
    selectedProjectIds: new Set(),
    search: '',
    statusFilter: 'all',
    form: {
      id: '',
      name: '',
      baseURL: 'https://gitlab.example.com',
      token: '',
      defaultCloneRoot: '',
      cloneProtocol: 'https'
    },
    cloneRootOverride: '',
    cloneMode: 'pull',
    branchTarget: '',
    dirtyPolicy: 'skip',
    maxConcurrency: 6,
    stripTokenAfterClone: true,
    monitorPollInterval: 60,
    monitorBranches: {},
    monitorStatuses: [],
    branchConfig: null,
    currentJob: null,
    logs: [],
    message: '',
    error: ''
  },
  textDiff: {
    left: 'alpha\nbeta\ngamma',
    right: 'alpha\nbeta changed\ngamma\ndelta',
    ignoreWhitespace: false
  },
  textExtractor: {
    text: [
      '接口 https://api.example.com/users?id=1 返回给 user@example.com',
      '联系人 13800138000，内网 192.168.1.10',
      'trace 550e8400-e29b-41d4-a716-446655440000'
    ].join('\n'),
    types: ['url', 'email', 'phone', 'ipv4', 'uuid', 'idcard'],
    result: null
  },
  regexTester: {
    pattern: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}',
    flags: 'g',
    text: 'hello user@example.com\nsupport@toolkit.dev'
  },
  cronBuilder: {
    sequence: 0,
    mode: 'interval',
    expression: '*/5 * * * *',
    fields: {
      minute: '*/5',
      hour: '*',
      dayOfMonth: '*',
      month: '*',
      dayOfWeek: '*'
    },
    interval: 5,
    minute: 0,
    hour: 9,
    dayOfMonth: 1,
    dayOfWeek: 1
  },
  timestampTool: {
    input: '1717999200',
    result: null,
    error: ''
  },
  base64Tool: {
    mode: 'encode',
    text: '工具箱',
    encoded: '',
    urlSafe: false,
    dataUri: false,
    mimeType: 'text/plain;charset=utf-8',
    result: null,
    error: ''
  },
  uuidTool: {
    count: 5,
    uppercase: false,
    hyphenated: true,
    prefix: '',
    customPrefix: '',
    generating: false,
    rawRows: [],
    rows: []
  },
  rsaTool: {
    bits: 2048,
    format: 'pkcs8',
    generating: false,
    result: null,
    error: ''
  },
  hmacTool: {
    algorithm: 'sha256',
    secret: 'secret-key',
    payload: 'method=GET&path=/api/orders&timestamp=1717999200',
    result: null,
    error: '',
    runTimer: 0,
    sequence: 0
  },
  totpTool: {
    loaded: false,
    loading: false,
    accounts: [],
    storagePath: '',
    error: '',
    editingId: '',
    form: {
      issuer: '',
      name: '',
      secretOrURL: '',
      digits: 6,
      period: 30
    },
    tempInput: '',
    tempDigits: 6,
    tempPeriod: 30,
    tempResult: null,
    refreshTimer: 0
  },
  hashTool: {
    payload: 'ElectronToolKit',
    rows: [],
    error: '',
    runTimer: 0,
    sequence: 0
  },
  symmetricTool: {
    action: 'encrypt',
    algorithm: 'AES',
    mode: 'CBC',
    padding: 'Pkcs7',
    key: '1234567890123456',
    iv: '1234567890123456',
    value: 'hello toolkit',
    result: '',
    error: '',
    runTimer: 0,
    sequence: 0
  },
  caseTool: {
    text: 'hello world\nhello world\nuser-name value',
    activeGroup: 'case'
  },
  unitTool: {
    group: 'length',
    value: '1000',
    fromUnit: 'm',
    toUnit: 'km',
    result: null,
    error: ''
  },
  baseTool: {
    input: 'FF',
    fromBase: '16',
    result: null,
    error: ''
  },
  cidrTool: {
    input: '192.168.1.10/24',
    result: null,
    error: ''
  },
  dateTool: {
    mode: 'offset',
    direction: 'add',
    baseDate: '2026-06-11',
    targetDate: '2026-07-01',
    days: '7',
    result: null,
    error: ''
  },
  notes: [],
  inputRunTimer: 0,
  runSequence: 0
};

const toolSearchIndex = createToolSearchIndex(tools);

function activeTool() {
  return tools.find((tool) => tool.id === state.activeToolId) ?? tools[0];
}

function isJsonFileWorkflowRecommended(tool, action = state.activeActionByTool[tool?.id]) {
  if (!tool) return false;
  if (tool.id === 'json-format' || tool.id === 'json-path' || tool.id === 'json-typescript' || tool.id === 'json-schema') return true;
  return tool.id === 'converter' && String(action || '').startsWith('json-');
}

function buildOversizedInputMessage(length, { jsonWorkflow = false, source = '内容' } = {}) {
  const base = `${source}过大：约 ${formatCharCount(length)}，超过桌面 UI 安全上限 ${formatCharCount(JSON_INPUT_CHAR_LIMIT)}。`;
  return jsonWorkflow ? `${base} 请保存为文件后使用大 JSON 文件检查。` : `${base} 请缩小输入范围后再处理。`;
}

function loadUserPrefs() {
  try {
    const rawPrefs = window.localStorage.getItem(USER_PREFS_KEY) || window.localStorage.getItem(LEGACY_USER_PREFS_KEY) || '{}';
    const parsed = JSON.parse(rawPrefs);
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter((id) => tools.some((tool) => tool.id === id)) : [],
      recentTools: Array.isArray(parsed.recentTools)
        ? parsed.recentTools.filter((id) => tools.some((tool) => tool.id === id)).slice(0, MAX_RECENT_TOOLS)
        : [],
      recentJsonFiles: normalizeRecentFilePaths(parsed.recentJsonFiles),
      recentHashFiles: normalizeRecentFilePaths(parsed.recentHashFiles)
    };
  } catch {
    return { favorites: [], recentTools: [], recentJsonFiles: [], recentHashFiles: [] };
  }
}

function saveUserPrefs() {
  window.localStorage.setItem(
    USER_PREFS_KEY,
    JSON.stringify({
      favorites: state.favorites,
      recentTools: state.recentTools,
      recentJsonFiles: state.jsonFile.recentFiles,
      recentHashFiles: state.fileHash.recentFiles
    })
  );
}

function normalizeRecentFilePaths(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, MAX_RECENT_FILES);
}

function renderToolList() {
  elements.notesEntry.classList.toggle('active', state.mode === 'notes');
  elements.totpEntry.classList.toggle('active', state.mode === 'totp');
  elements.gitlabEntry.classList.toggle('active', state.mode === 'gitlab');
  elements.ccSwitchEntry.classList.toggle('active', state.mode === 'cc-switch');
  const query = elements.search.value.trim().toLowerCase();
  const filteredTools = searchTools(query);
  state.searchCursorIndex = filteredTools.length === 0 ? -1 : Math.max(0, Math.min(state.searchCursorIndex, filteredTools.length - 1));
  state.visibleSearchToolIds = filteredTools.map((tool) => tool.id);
  const keyboardSelectedToolId = query && filteredTools[state.searchCursorIndex] ? filteredTools[state.searchCursorIndex].id : '';
  const highlightTokens = getSearchHighlightTokens(query);
  const fragment = document.createDocumentFragment();

  if (!query) {
    appendToolSection(fragment, '收藏', state.favorites.map(toolById).filter(Boolean), { empty: '点星标固定常用工具' });
    appendToolSection(fragment, '最近使用', state.recentTools.map(toolById).filter(Boolean), { empty: '用过的工具会出现在这里' });
  }

  appendToolSection(fragment, query ? `搜索结果 · ${filteredTools.length}` : '全部工具', filteredTools, { keyboardSelectedToolId, highlightTokens });
  elements.list.replaceChildren(fragment);
  if (keyboardSelectedToolId) {
    elements.list.querySelector('.tool-item.keyboard-selected')?.scrollIntoView({ block: 'nearest' });
  }
}

function searchTools(query) {
  return searchToolsByQuery(toolSearchIndex, query);
}

function getSearchHighlightTokens(query) {
  return [
    ...new Set(
      String(query ?? '')
        .trim()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => /[a-z0-9\u4e00-\u9fff]/i.test(token))
    )
  ].slice(0, 4);
}

function appendHighlightedText(parent, text, tokens) {
  const value = String(text ?? '');
  const normalizedTokens = (tokens ?? [])
    .map((token) => String(token || '').toLowerCase())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (normalizedTokens.length === 0) {
    parent.textContent = value;
    return;
  }

  let cursor = 0;
  const lowerValue = value.toLowerCase();
  while (cursor < value.length) {
    let nextMatch = null;
    normalizedTokens.forEach((token) => {
      const index = lowerValue.indexOf(token, cursor);
      if (index < 0) return;
      if (!nextMatch || index < nextMatch.index || (index === nextMatch.index && token.length > nextMatch.token.length)) {
        nextMatch = { index, token };
      }
    });
    if (!nextMatch) {
      parent.append(document.createTextNode(value.slice(cursor)));
      break;
    }
    if (nextMatch.index > cursor) parent.append(document.createTextNode(value.slice(cursor, nextMatch.index)));
    const mark = document.createElement('mark');
    mark.className = 'search-hit';
    mark.textContent = value.slice(nextMatch.index, nextMatch.index + nextMatch.token.length);
    parent.append(mark);
    cursor = nextMatch.index + nextMatch.token.length;
  }
}

function appendToolSection(parent, title, sectionTools, { empty = '', keyboardSelectedToolId = '', highlightTokens = [] } = {}) {
  const section = document.createElement('section');
  section.className = 'tool-section';
  const heading = document.createElement('div');
  heading.className = 'tool-section-title';
  heading.textContent = title;
  section.append(heading);
  if (sectionTools.length === 0 && empty) {
    const emptyNode = document.createElement('div');
    emptyNode.className = 'tool-section-empty';
    emptyNode.textContent = empty;
    section.append(emptyNode);
  } else {
    sectionTools.forEach((tool) => section.append(renderToolItem(tool, { keyboardSelected: tool.id === keyboardSelectedToolId, highlightTokens })));
  }
  parent.append(section);
}

function renderToolItem(tool, { keyboardSelected = false, highlightTokens = [] } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.category = tool.category;
  button.className = [
    'tool-item',
    state.mode === 'tools' && tool.id === state.activeToolId ? 'active' : '',
    keyboardSelected ? 'keyboard-selected' : ''
  ]
    .filter(Boolean)
    .join(' ');
  if (keyboardSelected) button.setAttribute('aria-current', 'true');

  const label = document.createElement('span');
  label.className = 'tool-name';
  appendHighlightedText(label, tool.name, highlightTokens);
  const meta = document.createElement('small');
  meta.className = 'tool-meta';
  appendHighlightedText(meta, tool.category, highlightTokens);
  const favorite = document.createElement('span');
  favorite.className = `tool-favorite${state.favorites.includes(tool.id) ? ' active' : ''}`;
  favorite.role = 'button';
  favorite.tabIndex = 0;
  favorite.title = state.favorites.includes(tool.id) ? '取消收藏' : '收藏工具';
  favorite.setAttribute('aria-label', favorite.title);
  favorite.textContent = '★';
  favorite.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFavorite(tool.id);
  });
  favorite.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(tool.id);
  });

  button.append(label, meta, favorite);
  button.addEventListener('click', () => {
    state.searchCursorIndex = Math.max(0, state.visibleSearchToolIds.indexOf(tool.id));
    selectTool(tool.id);
  });
  return button;
}

function toolById(toolId) {
  return tools.find((tool) => tool.id === toolId) ?? null;
}

function toggleFavorite(toolId) {
  state.favorites = state.favorites.includes(toolId)
    ? state.favorites.filter((id) => id !== toolId)
    : [toolId, ...state.favorites];
  saveUserPrefs();
  renderToolList();
  setStatus(state.favorites.includes(toolId) ? '已收藏工具' : '已取消收藏');
}

function recordRecentTool(toolId) {
  state.recentTools = [toolId, ...state.recentTools.filter((id) => id !== toolId)].slice(0, MAX_RECENT_TOOLS);
  saveUserPrefs();
}

function rememberRecentFile(bucket, filePath) {
  const target = state[bucket];
  const normalizedPath = String(filePath || '').trim();
  if (!target || !normalizedPath) return;
  target.recentFiles = [normalizedPath, ...(target.recentFiles ?? []).filter((item) => item !== normalizedPath)].slice(0, MAX_RECENT_FILES);
  saveUserPrefs();
}

function clearRecentFiles(bucket, render) {
  const target = state[bucket];
  if (!target) return;
  target.recentFiles = [];
  saveUserPrefs();
  render();
  setStatus('最近文件已清空');
}

function fileNameFromPath(filePath) {
  return String(filePath || '').split(/[\\/]/).filter(Boolean).pop() || String(filePath || '');
}

function resetSearchCursor() {
  state.searchCursorIndex = 0;
}

function moveSearchCursor(direction) {
  const query = elements.search.value.trim().toLowerCase();
  const visibleTools = searchTools(query);
  state.searchCursorIndex = nextSearchCursorIndex(state.searchCursorIndex, direction, visibleTools.length);
  renderToolList();
  const selectedTool = visibleTools[state.searchCursorIndex];
  if (selectedTool) setStatus(`已选择：${selectedTool.name}，按 Enter 打开`);
}

function selectSearchCursorTool() {
  const query = elements.search.value.trim().toLowerCase();
  const visibleTools = searchTools(query);
  const tool = visibleTools[state.searchCursorIndex] ?? visibleTools[0];
  if (!tool) return false;
  selectTool(tool.id);
  return true;
}

function renderActiveTool() {
  const tool = activeTool();
  const action = state.activeActionByTool[tool.id];
  const inputMode = getEffectiveInputMode(tool, action);
  elements.outputSearch.hidden = false;
  elements.category.textContent = tool.category;
  elements.title.textContent = tool.name;
  elements.description.textContent = tool.description;
  elements.input.placeholder = tool.placeholder;
  elements.editorGrid.className = `editor-grid layout-${inputMode}`;
  elements.inputPanel.hidden = inputMode === 'none';
  elements.paste.hidden = inputMode === 'none';
  elements.copy.hidden = false;
  elements.inputLabel.textContent = tool.inputLabel ?? '输入';
  elements.outputLabel.textContent = inputMode === 'none' ? '结果' : '输出';
  elements.controls.replaceChildren(
    ...tool.actions.map((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = action.id === state.activeActionByTool[tool.id] ? 'primary-button' : 'secondary-button';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        saveActiveToolInputDraft();
        state.activeActionByTool[tool.id] = action.id;
        if (getEffectiveInputMode(tool, action.id) === 'none') elements.input.value = '';
        else elements.input.value = state.inputValuesByTool[tool.id] ?? tool.sampleInput ?? '';
        renderActiveTool();
        runActiveTool({ manual: true });
      });
      return button;
    })
  );
  renderToolOptions(tool);
  renderToolList();
}

function renderToolOptions(tool) {
  elements.options.replaceChildren();
  const optionDefs = tool.options ?? [];
  elements.options.hidden = optionDefs.length === 0;
  if (optionDefs.length === 0) return;

  const values = state.optionValuesByTool[tool.id] ?? {};
  optionDefs.forEach((option) => {
    const label = document.createElement('label');
    label.className = 'compact-option';
    const caption = document.createElement('span');
    caption.textContent = option.label;
    label.append(caption);

    const control =
      option.type === 'select'
        ? document.createElement('select')
        : document.createElement('input');
    if (option.type === 'select') {
      option.options.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = typeof item === 'object' ? item.value : item;
        opt.textContent = typeof item === 'object' ? item.label : item;
        control.append(opt);
      });
    } else {
      control.type = option.type || 'text';
    }
    control.value = values[option.key] ?? option.value ?? '';
    if (option.placeholder) control.placeholder = option.placeholder;
    if (option.min !== undefined) control.min = option.min;
    if (option.max !== undefined) control.max = option.max;
    if (option.step !== undefined) control.step = option.step;
    control.addEventListener('input', () => {
      state.optionValuesByTool[tool.id][option.key] = control.value;
      if (
        option.type === 'color' ||
        tool.id === 'json-format' ||
        tool.id === 'json-path' ||
        tool.id === 'json-typescript' ||
        tool.id === 'json-schema' ||
        getEffectiveInputMode(tool, state.activeActionByTool[tool.id]) === 'none'
      ) {
        runActiveTool({ manual: true });
      }
    });
    control.addEventListener('change', () => {
      state.optionValuesByTool[tool.id][option.key] = control.value;
      if (option.type === 'color' || getEffectiveInputMode(tool, state.activeActionByTool[tool.id]) === 'none') runActiveTool({ manual: true });
    });
    label.append(control);
    elements.options.append(label);
  });
}

function saveActiveToolInputDraft() {
  if (state.mode !== 'tools') return;
  const tool = activeTool();
  const inputMode = getEffectiveInputMode(tool, state.activeActionByTool[tool.id]);
  if (inputMode === 'none') return;
  state.inputValuesByTool[tool.id] = elements.input.value;
}

function restoreToolInputDraft(tool) {
  const action = state.activeActionByTool[tool.id];
  const inputMode = getEffectiveInputMode(tool, action);
  elements.input.value = inputMode === 'none' ? '' : state.inputValuesByTool[tool.id] ?? tool.sampleInput ?? '';
}

function selectTool(toolId) {
  saveActiveToolInputDraft();
  state.mode = 'tools';
  state.activeToolId = toolId;
  recordRecentTool(toolId);
  if (toolId === 'json-format') {
    state.activeActionByTool[toolId] = 'format';
  }
  restoreToolInputDraft(activeTool());
  renderOutput('');
  setStatus('已切换工具');
  renderActiveTool();
  runActiveTool({ manual: true });
  if (getEffectiveInputMode(activeTool(), state.activeActionByTool[toolId]) === 'none') {
    elements.output.focus?.();
  } else {
    elements.input.focus();
  }
}

async function runActiveTool({ manual = false } = {}) {
  const tool = activeTool();
  const action = state.activeActionByTool[tool.id];
  const inputMode = getEffectiveInputMode(tool, action);
  const inputLength = inputMode === 'none' ? 0 : elements.input.value.length;
  if (inputMode !== 'none' && inputLength > JSON_INPUT_CHAR_LIMIT) {
    const message = buildOversizedInputMessage(inputLength, { jsonWorkflow: isJsonFileWorkflowRecommended(tool, action), source: '当前输入' });
    renderOversizedInputNotice(message, { length: inputLength, jsonWorkflow: isJsonFileWorkflowRecommended(tool, action) });
    setStatus(message, true);
    return;
  }
  const liveLimit = tool.id === 'json-format' ? LIVE_RUN_CHAR_LIMIT : GENERAL_LIVE_RUN_CHAR_LIMIT;
  if (!manual && inputLength > liveLimit) {
    renderOutput('');
    setStatus(`内容较大，已停止实时解析。请按 ⌘/Ctrl + Enter 手动执行。`);
    return;
  }

  const runId = ++state.runSequence;
  if (manual || inputLength > 20_000) setStatus('正在执行...');
  try {
    const result = await tool.run({ input: inputMode === 'none' ? '' : elements.input.value, action, options: getToolOptions() });
    if (runId !== state.runSequence) return;
    if (result.ok) {
      renderOutput(result.value, { tool, action, view: result.view, data: result.data });
      setStatus('执行成功');
    } else {
      renderOutput(result.error, { isError: true });
      setStatus(result.error, true);
    }
  } catch (error) {
    if (runId !== state.runSequence) return;
    const message = error instanceof Error ? error.message : String(error);
    renderOutput(message, { isError: true });
    setStatus(message, true);
  }
}

function renderOutput(value, options = {}) {
  state.lastOutput = String(value ?? '');
  state.jsonEditorValue = null;
  state.jsonEditorActive = false;
  elements.output.classList.toggle('is-error', Boolean(options.isError));
  elements.output.classList.toggle('json-tree', false);

  try {
    if (options.view === 'url-parser') {
      renderUrlParser();
      return;
    }

    if (options.view === 'url-codec') {
      renderUrlCodecTool();
      return;
    }

    if (options.view === 'cookie-parser') {
      renderCookieParser();
      return;
    }

    if (options.view === 'http-headers') {
      renderHttpHeadersTool();
      return;
    }

    if (options.view === 'gitlab-tool') {
      renderGitLabTool();
      return;
    }

    if (options.view === 'color-picker') {
      renderColorPicker();
      return;
    }

    if (options.view === 'json-file-inspector') {
      renderJsonFileInspector();
      return;
    }

    if (options.view === 'json-diff') {
      renderJsonDiffTool();
      return;
    }

    if (options.view === 'file-hash') {
      renderFileHashTool();
      return;
    }

    if (options.view === 'image-converter') {
      renderImageConverter();
      return;
    }

    if (options.view === 'markdown-docx') {
      renderMarkdownDocxTool();
      return;
    }

    if (options.view === 'plantuml') {
      renderPlantUmlTool();
      return;
    }

    if (options.view === 'cc-switch') {
      renderCcSwitchTool();
      return;
    }

    if (options.view === 'qr-tool') {
      renderQrTool();
      return;
    }

    if (options.view === 'mock-generator') {
      renderMockGenerator();
      return;
    }

    if (options.view === 'stats') {
      renderStats(options.data);
      return;
    }

    if (options.view === 'text-diff') {
      renderTextDiff();
      return;
    }

    if (options.view === 'text-extractor') {
      renderTextExtractor();
      return;
    }

    if (options.view === 'regex-tester') {
      renderRegexTester();
      return;
    }

    if (options.view === 'cron-builder') {
      renderCronBuilder();
      return;
    }

    if (options.view === 'timestamp-converter') {
      renderTimestampConverter();
      return;
    }

    if (options.view === 'base64-tool') {
      renderBase64Tool();
      return;
    }

    if (options.view === 'uuid-tool') {
      renderUuidTool();
      return;
    }

    if (options.view === 'rsa-keygen') {
      renderRsaKeygen();
      return;
    }

    if (options.view === 'hmac-signer') {
      renderHmacSigner();
      return;
    }

    if (options.view === 'totp-tool') {
      renderTOTPTool();
      return;
    }

    if (options.view === 'hash-tool') {
      renderHashTool();
      return;
    }

    if (options.view === 'symmetric-crypto') {
      renderSymmetricCryptoTool();
      return;
    }

    if (options.view === 'case-converter') {
      renderCaseConverterTool();
      return;
    }

    if (options.view === 'unit-converter') {
      renderUnitConverterTool();
      return;
    }

    if (options.view === 'base-converter') {
      renderBaseConverterTool();
      return;
    }

    if (options.view === 'cidr-tool') {
      renderCidrTool();
      return;
    }

    if (options.view === 'date-calc') {
      renderDateCalcTool();
      return;
    }

    if (options.view === 'jwt-analyzer') {
      renderJwtAnalyzer();
      return;
    }

    if (options.view === 'sql-es') {
      renderSqlEsConverter();
      return;
    }

    if (options.view === 'tax') {
      renderTaxResult(options.data);
      return;
    }

    if (options.view === 'loan') {
      renderLoanResult(options.data);
      return;
    }

    if (options.view === 'whiteboard') {
      renderWhiteboard();
      return;
    }

    if (!state.lastOutput) {
      elements.output.replaceChildren();
      return;
    }

    if (options.view === 'json-tree' || (options.tool?.id === 'json-format' && (options.action === 'format' || options.action === 'sort'))) {
      if (state.lastOutput.length > TREE_RENDER_CHAR_LIMIT) {
        renderLargeOutputPreview();
        return;
      }

      try {
        const parsed = JSON.parse(state.lastOutput);
        const stats = collectJsonStats(parsed, JSON_TREE_RENDER_NODE_LIMIT + 1);
        if (stats.truncated || stats.totalNodes > JSON_TREE_RENDER_NODE_LIMIT) {
          renderLargeOutputPreview({
            title: 'JSON 已处理，但节点过多，已关闭树形渲染',
            detail: `当前 JSON 节点超过 ${JSON_TREE_RENDER_NODE_LIMIT.toLocaleString('zh-CN')} 个。为避免界面卡顿，已切换为文本预览；复制结果仍会复制完整文本。`,
            stats
          });
          return;
        }
        state.jsonEditorValue = parsed;
        state.jsonEditorActive = true;
        renderJsonTree(parsed, getToolOptions().compactKeys, stats);
        return;
      } catch {
        // Fall through to plain text output.
      }
    }

    if (state.lastOutput.length > TEXT_RENDER_CHAR_LIMIT) {
      renderLargeOutputPreview({
        title: '结果已生成，但输出过大，已切换为预览',
        detail: `结果约 ${formatCharCount(state.lastOutput.length)}。为避免界面卡顿，当前只展示前后片段；复制结果仍会复制完整文本。`
      });
      return;
    }

    elements.output.textContent = state.lastOutput;
  } finally {
    queueOutputSearchRefresh();
  }
}

function renderOversizedInputNotice(message, { length = 0, jsonWorkflow = false } = {}) {
  state.lastOutput = message;
  state.jsonEditorValue = null;
  state.jsonEditorActive = false;
  elements.output.classList.toggle('is-error', false);
  elements.output.classList.toggle('json-tree', false);

  const panel = document.createElement('section');
  panel.className = 'large-input-notice';
  const head = document.createElement('div');
  head.className = 'large-input-notice-head';
  head.innerHTML = `
    <span>超大输入已拦截</span>
    <strong>${escapeHtml(formatCharCount(length))}</strong>
  `;
  const body = document.createElement('p');
  body.textContent = jsonWorkflow
    ? '这类体量不适合放进文本框解析。请保存为 .json 或 .jsonl 文件后使用流式检查器，工具会边读边统计结构，不会把完整内容塞进界面。'
    : '这类体量不适合在当前工具里实时处理，请缩小输入范围后再执行。';
  const actions = document.createElement('div');
  actions.className = 'large-input-notice-actions';
  if (jsonWorkflow) {
    const openFileTool = document.createElement('button');
    openFileTool.type = 'button';
    openFileTool.className = 'primary-button';
    openFileTool.textContent = '打开大 JSON 文件检查';
    openFileTool.addEventListener('click', () => {
      selectTool('json-file');
      setStatus('已切换到流式 JSON 文件检查器');
    });
    actions.append(openFileTool);
  }
  const clearInput = document.createElement('button');
  clearInput.type = 'button';
  clearInput.className = 'secondary-button';
  clearInput.textContent = '清空输入';
  clearInput.addEventListener('click', () => {
    elements.input.value = '';
    saveActiveToolInputDraft();
    renderOutput('');
    setStatus('已清空输入');
  });
  actions.append(clearInput);
  panel.append(head, body, actions);
  elements.output.replaceChildren(panel);
}

async function openNotesManager() {
  saveActiveToolInputDraft();
  state.mode = 'notes';
  state.notes = await window.toolkit.notesList();
  elements.outputSearch.hidden = true;
  state.outputSearch.query = '';
  elements.outputSearchInput.value = '';
  refreshOutputSearchHighlights();
  elements.category.textContent = '便笺';
  elements.title.textContent = '任务便笺';
  elements.description.textContent = '创建可悬浮在屏幕上的任务便笺，并设置到时提醒。';
  elements.paste.hidden = true;
  elements.copy.hidden = true;
  elements.controls.replaceChildren();
  elements.options.replaceChildren();
  elements.options.hidden = true;
  elements.editorGrid.className = 'editor-grid layout-none notes-layout';
  elements.inputPanel.hidden = true;
  elements.outputPanel.hidden = false;
  elements.outputLabel.textContent = '便笺';
  renderToolList();
  renderNotesManager();
  setStatus('任务便笺');
}

async function openTOTPManager() {
  saveActiveToolInputDraft();
  state.mode = 'totp';
  elements.outputSearch.hidden = true;
  state.outputSearch.query = '';
  elements.outputSearchInput.value = '';
  refreshOutputSearchHighlights();
  elements.category.textContent = '安全';
  elements.title.textContent = '2FA 验证码';
  elements.description.textContent = '管理 TOTP 账号，并在菜单栏快速复制验证码。';
  elements.paste.hidden = true;
  elements.copy.hidden = true;
  elements.controls.replaceChildren();
  elements.options.replaceChildren();
  elements.options.hidden = true;
  elements.editorGrid.className = 'editor-grid layout-none totp-layout';
  elements.inputPanel.hidden = true;
  elements.outputPanel.hidden = false;
  elements.outputLabel.textContent = '2FA';
  renderToolList();
  renderTOTPTool();
  elements.output.scrollTop = 0;
  setStatus('2FA 验证码');
}

async function openGitLabManager() {
  saveActiveToolInputDraft();
  state.mode = 'gitlab';
  elements.outputSearch.hidden = true;
  state.outputSearch.query = '';
  elements.outputSearchInput.value = '';
  refreshOutputSearchHighlights();
  elements.category.textContent = '开发协作';
  elements.title.textContent = 'GitLab 助手';
  elements.description.textContent = '管理 GitLab 实例、项目同步、批量分支和 Pipeline 监控。';
  elements.paste.hidden = true;
  elements.copy.hidden = true;
  elements.controls.replaceChildren();
  elements.options.replaceChildren();
  elements.options.hidden = true;
  elements.editorGrid.className = 'editor-grid layout-none gitlab-layout';
  elements.inputPanel.hidden = true;
  elements.outputPanel.hidden = false;
  elements.outputLabel.textContent = 'GitLab';
  renderToolList();
  renderGitLabTool();
  elements.output.scrollTop = 0;
  setStatus('GitLab 助手');
}

async function openCcSwitchManager() {
  saveActiveToolInputDraft();
  state.mode = 'cc-switch';
  elements.outputSearch.hidden = true;
  state.outputSearch.query = '';
  elements.outputSearchInput.value = '';
  refreshOutputSearchHighlights();
  elements.category.textContent = 'AI 配置';
  elements.title.textContent = '模型切换';
  elements.description.textContent = '管理 Claude Code、Codex、Gemini CLI、OpenCode、OpenClaw、Hermes 的供应商与实际配置。';
  elements.paste.hidden = true;
  elements.copy.hidden = true;
  elements.controls.replaceChildren();
  elements.options.replaceChildren();
  elements.options.hidden = true;
  elements.editorGrid.className = 'editor-grid layout-none cc-switch-shell';
  elements.inputPanel.hidden = true;
  elements.outputPanel.hidden = false;
  elements.outputLabel.textContent = '模型切换';
  renderToolList();
  renderCcSwitchTool();
  elements.output.scrollTop = 0;
  if (!state.ccSwitch.loading) loadCcSwitchState();
  setStatus('模型切换');
}

function renderNotesManager() {
  state.lastOutput = '';
  const panel = document.createElement('div');
  panel.className = 'notes-manager';

  const composer = document.createElement('form');
  composer.className = 'note-composer';
  composer.innerHTML = `
    <div class="note-composer-head">
      <strong>新建便笺</strong>
      <button class="primary-button" type="submit">贴到屏幕</button>
    </div>
    <label>
      <span>标题</span>
      <input name="title" maxlength="80" value="任务提醒" />
    </label>
    <label class="wide">
      <span>内容</span>
      <textarea name="text" maxlength="4000" rows="4" placeholder="写下需要提醒自己的事情"></textarea>
    </label>
    <div class="note-field-grid">
      <label>
        <span>形状</span>
        <select name="shape">
          <option value="rounded">圆角便笺</option>
          <option value="circle">圆形</option>
          <option value="triangle">三角形</option>
          <option value="star">五角星</option>
          <option value="heart">爱心</option>
          <option value="hexagon">六边形</option>
        </select>
      </label>
      <label>
        <span>颜色</span>
        <input name="color" type="color" value="#fff2a8" />
      </label>
      <label>
        <span>尺寸</span>
        <select name="size">
          <option value="220">小号</option>
          <option value="300" selected>中号</option>
          <option value="420">大号</option>
        </select>
      </label>
      <label>
        <span>字号</span>
        <select name="fontSize">
          <option value="13">小字</option>
          <option value="15" selected>默认</option>
          <option value="18">大字</option>
          <option value="22">超大</option>
        </select>
      </label>
      <label>
        <span>提醒时间</span>
        <input name="remindAt" type="datetime-local" />
      </label>
    </div>
  `;
  composer.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(composer);
    await window.toolkit.notesCreate({
      title: form.get('title'),
      text: form.get('text'),
      shape: form.get('shape'),
      color: form.get('color'),
      size: Number(form.get('size')),
      fontSize: Number(form.get('fontSize')),
      remindAt: localDateTimeToIso(form.get('remindAt'))
    });
    composer.reset();
    composer.elements.color.value = '#fff2a8';
    composer.elements.size.value = '300';
    composer.elements.fontSize.value = '15';
    state.notes = await window.toolkit.notesList();
    renderNotesManager();
    setStatus('便笺已贴到屏幕');
  });

  const list = document.createElement('div');
  list.className = 'note-list';
  if (state.notes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'note-empty';
    empty.textContent = '还没有便笺。创建一个后，它会悬浮在屏幕上。';
    list.append(empty);
  } else {
    state.notes.forEach((note) => list.append(renderNoteListItem(note)));
  }

  panel.append(composer, list);
  elements.output.replaceChildren(panel);
}

function renderNoteListItem(note) {
  const item = document.createElement('article');
  item.className = 'note-list-item';
  item.style.setProperty('--note-preview-color', note.color);

  const preview = document.createElement('div');
  preview.className = `note-preview shape-${note.shape}`;
  preview.textContent = note.title.slice(0, 1) || '便';

  const body = document.createElement('div');
  body.className = 'note-list-body';
  const reminder = note.remindAt ? formatReminderText(note.remindAt) : '未设置提醒';
  body.innerHTML = `
    <strong>${escapeHtml(note.title)}</strong>
    <p>${escapeHtml(note.text || '空便笺')}</p>
    <small>${reminder}${note.remindedAt ? ' · 已提醒' : ''} · ${note.size || 300}px · ${note.fontSize || 15}px</small>
  `;

  const actions = document.createElement('div');
  actions.className = 'note-list-actions';
  const size = document.createElement('select');
  size.className = 'note-mini-select';
  size.title = '便笺尺寸';
  [
    ['220', '小'],
    ['300', '中'],
    ['420', '大']
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    size.append(option);
  });
  size.value = nearestNoteSize(note.size || 300);
  size.addEventListener('change', async () => {
    await window.toolkit.notesUpdate(note.id, { size: Number(size.value) });
    state.notes = await window.toolkit.notesList();
    renderNotesManager();
    setStatus('便笺尺寸已更新');
  });
  const fontSize = document.createElement('select');
  fontSize.className = 'note-mini-select';
  fontSize.title = '文字大小';
  [
    ['13', '小字'],
    ['15', '默认'],
    ['18', '大字'],
    ['22', '超大']
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    fontSize.append(option);
  });
  fontSize.value = nearestNoteFontSize(note.fontSize || 15);
  fontSize.addEventListener('change', async () => {
    await window.toolkit.notesUpdate(note.id, { fontSize: Number(fontSize.value) });
    state.notes = await window.toolkit.notesList();
    renderNotesManager();
    setStatus('便笺字号已更新');
  });
  const show = document.createElement('button');
  show.type = 'button';
  show.className = 'secondary-button';
  show.textContent = '显示';
  show.addEventListener('click', () => window.toolkit.notesShow(note.id));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'secondary-button danger-button';
  remove.textContent = '删除';
  remove.addEventListener('click', async () => {
    state.notes = await window.toolkit.notesDelete(note.id);
    renderNotesManager();
    setStatus('便笺已删除');
  });
  actions.append(size, fontSize, show, remove);
  item.append(preview, body, actions);
  return item;
}

function nearestNoteSize(size) {
  const value = Number(size) || 300;
  if (value <= 260) return '220';
  if (value <= 360) return '300';
  return '420';
}

function nearestNoteFontSize(fontSize) {
  const value = Number(fontSize) || 15;
  if (value <= 14) return '13';
  if (value <= 16) return '15';
  if (value <= 20) return '18';
  return '22';
}

function renderColorPicker() {
  const panel = document.createElement('div');
  panel.className = 'color-picker-tool';

  const controls = document.createElement('div');
  controls.className = 'color-controls-card';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = state.colorPicker.hex;
  colorInput.addEventListener('input', () => {
    state.colorPicker.hex = colorInput.value.toUpperCase();
    state.colorPicker.manual = colorFormats({ ...hexInputToRgba(state.colorPicker.hex), a: state.colorPicker.alpha }).rgba;
    updateColorPickerResult(resultWrap);
  });

  const manual = document.createElement('input');
  manual.type = 'text';
  manual.value = state.colorPicker.manual;
  manual.placeholder = '#FF5733 或 rgba(255,87,51,0.8)';
  manual.spellcheck = false;
  manual.addEventListener('input', () => {
    state.colorPicker.manual = manual.value;
    const parsed = parseColor(manual.value);
    if (!parsed.ok) {
      updateColorPickerResult(resultWrap, parsed.error);
      return;
    }
    state.colorPicker.hex = parsed.data.hex;
    state.colorPicker.alpha = parsed.data.a;
    colorInput.value = parsed.data.hex;
    alpha.value = String(parsed.data.a);
    alphaValue.textContent = `${Math.round(parsed.data.a * 100)}%`;
    updateColorPickerResult(resultWrap);
  });

  const alpha = document.createElement('input');
  alpha.type = 'range';
  alpha.min = '0';
  alpha.max = '1';
  alpha.step = '0.01';
  alpha.value = String(state.colorPicker.alpha);
  const alphaValue = document.createElement('strong');
  alphaValue.textContent = `${Math.round(state.colorPicker.alpha * 100)}%`;
  alpha.addEventListener('input', () => {
    state.colorPicker.alpha = normalizeAlpha(alpha.value);
    alphaValue.textContent = `${Math.round(state.colorPicker.alpha * 100)}%`;
    state.colorPicker.manual = colorFormats({ ...hexInputToRgba(state.colorPicker.hex), a: state.colorPicker.alpha }).rgba;
    manual.value = state.colorPicker.manual;
    updateColorPickerResult(resultWrap);
  });

  const pickerLabel = document.createElement('label');
  pickerLabel.className = 'color-control-field color-picker-field';
  pickerLabel.innerHTML = '<span>颜色</span>';
  pickerLabel.append(colorInput);

  const manualLabel = document.createElement('label');
  manualLabel.className = 'color-control-field color-manual-field';
  manualLabel.innerHTML = '<span>手动输入</span>';
  manualLabel.append(manual);

  const alphaLabel = document.createElement('label');
  alphaLabel.className = 'color-control-field color-alpha-field';
  alphaLabel.innerHTML = '<span>透明度</span>';
  alphaLabel.append(alpha, alphaValue);

  controls.append(pickerLabel, manualLabel, alphaLabel);

  const resultWrap = document.createElement('div');
  resultWrap.className = 'color-result-wrap';
  panel.append(controls, resultWrap);
  elements.output.replaceChildren(panel);
  updateColorPickerResult(resultWrap);
}

function updateColorPickerResult(container, error = '') {
  container.replaceChildren();
  if (error) {
    state.lastOutput = error;
    const warning = document.createElement('div');
    warning.className = 'color-warning';
    warning.textContent = error;
    container.append(warning);
    setStatus(error, true);
    return;
  }

  const data = colorFormats({ ...hexInputToRgba(state.colorPicker.hex), a: state.colorPicker.alpha });
  state.lastOutput = [data.hex, data.hexa, data.rgb, data.rgba, data.cssVar].join('\n');
  const panel = document.createElement('div');
  panel.className = 'color-result';
  const swatch = document.createElement('div');
  swatch.className = 'color-swatch';
  swatch.style.setProperty('--swatch-color', data.rgba);
  const rows = document.createElement('div');
  rows.className = 'format-rows';
  [
    ['HEX', data.hex],
    ['HEXA', data.hexa],
    ['RGB', data.rgb],
    ['RGBA', data.rgba],
    ['CSS Var', data.cssVar]
  ].forEach(([label, value]) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'format-row';
    row.innerHTML = `<span>${label}</span><code>${value}</code>`;
    row.addEventListener('click', async () => {
      await window.toolkit.writeClipboard(value);
      setStatus(`${label} 已复制`);
    });
    rows.append(row);
  });
  panel.append(swatch, rows);
  container.append(panel);
  setStatus('颜色已更新');
}

function setupFileDropZone(element, onDropFilePath) {
  element.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    element.classList.add('drag-over');
  });
  element.addEventListener('dragleave', () => element.classList.remove('drag-over'));
  element.addEventListener('drop', async (event) => {
    event.preventDefault();
    element.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      setStatus('没有识别到拖入的文件', true);
      return;
    }
    try {
      const filePath = await resolveDroppedFilePath(file);
      if (!filePath) {
        setStatus('无法读取拖入文件路径', true);
        return;
      }
      await onDropFilePath(filePath);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  });
}

async function resolveDroppedFilePath(file) {
  if (typeof file.path === 'string' && file.path) return file.path;
  if (window.toolkit.getFilePath) return window.toolkit.getFilePath(file);
  return '';
}

function renderRecentFilesPanel(filePaths, { onOpen, onClear }) {
  const files = normalizeRecentFilePaths(filePaths);
  if (files.length === 0) return null;
  const panel = document.createElement('section');
  panel.className = 'recent-file-panel';

  const head = document.createElement('div');
  head.className = 'recent-file-head';
  const title = document.createElement('span');
  title.textContent = '最近文件';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = '清空';
  clear.addEventListener('click', onClear);
  head.append(title, clear);

  const list = document.createElement('div');
  list.className = 'recent-file-list';
  files.forEach((filePath) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'recent-file-item';
    item.title = filePath;
    const name = document.createElement('strong');
    name.textContent = fileNameFromPath(filePath);
    const pathText = document.createElement('small');
    pathText.textContent = filePath;
    item.append(name, pathText);
    item.addEventListener('click', () => onOpen(filePath));
    list.append(item);
  });

  panel.append(head, list);
  return panel;
}

function renderJsonFileInspector() {
  const panel = document.createElement('div');
  panel.className = 'json-file-tool';

  const pickCard = document.createElement('section');
  pickCard.className = 'json-file-pick-card';
  const pickTitle = document.createElement('div');
  pickTitle.className = 'json-file-title';
  pickTitle.innerHTML = '<strong>大 JSON 文件检查</strong><span>流式读取，不把文件塞进输入框</span>';
  const pickButton = document.createElement('button');
  pickButton.type = 'button';
  pickButton.className = 'primary-button json-file-pick-button';
  pickButton.textContent = state.jsonFile.loading ? '检查中...' : '选择 JSON 文件';
  pickButton.disabled = state.jsonFile.loading;
  pickButton.addEventListener('click', inspectLargeJsonFile);
  const pickHint = document.createElement('p');
  pickHint.textContent = '可点击选择或拖入 JSON 文件，流式校验结构、统计节点并预览头尾。';
  pickCard.append(pickTitle, pickButton);
  const recentFiles = renderRecentFilesPanel(state.jsonFile.recentFiles, {
    onOpen: inspectLargeJsonFile,
    onClear: () => clearRecentFiles('jsonFile', renderJsonFileInspector)
  });
  if (recentFiles) pickCard.append(recentFiles);
  pickCard.append(pickHint);
  setupFileDropZone(pickCard, inspectLargeJsonFile);

  const resultArea = document.createElement('section');
  resultArea.className = 'json-file-result';
  if (state.jsonFile.loading) {
    const loading = document.createElement('div');
    loading.className = 'json-file-empty';
    loading.textContent = '正在流式检查文件，请稍等...';
    resultArea.append(loading);
    state.lastOutput = '正在流式检查 JSON 文件';
  } else if (state.jsonFile.error) {
    const warning = document.createElement('div');
    warning.className = 'json-file-warning';
    warning.textContent = state.jsonFile.error;
    resultArea.append(warning);
    state.lastOutput = state.jsonFile.error;
  } else if (state.jsonFile.result) {
    renderJsonFileResult(resultArea, state.jsonFile.result);
  } else {
    const empty = document.createElement('div');
    empty.className = 'json-file-empty';
    empty.textContent = '还没有选择文件。点击左侧按钮后会使用系统文件选择器打开本地 JSON。';
    resultArea.append(empty);
    state.lastOutput = '';
  }

  panel.append(pickCard, resultArea);
  elements.output.replaceChildren(panel);
}

async function inspectLargeJsonFile(filePath = '') {
  state.jsonFile.loading = true;
  state.jsonFile.error = '';
  renderJsonFileInspector();
  setStatus(filePath ? '正在检查拖入的 JSON 文件...' : '正在检查 JSON 文件...');
  try {
    const response = filePath ? await window.toolkit.inspectJsonFilePath(filePath) : await window.toolkit.inspectJsonFile();
    if (response.canceled) {
      state.jsonFile.loading = false;
      renderJsonFileInspector();
      setStatus('已取消选择文件');
      return;
    }
    state.jsonFile.loading = false;
    if (response.error) {
      state.jsonFile.error = response.error;
      state.jsonFile.result = null;
      renderJsonFileInspector();
      setStatus(response.error, true);
      return;
    }
    state.jsonFile.result = response.result;
    rememberRecentFile('jsonFile', response.result.filePath);
    state.jsonFile.exportResult = null;
    state.jsonFile.extractKey = response.result.topLevelKeys?.[0] ?? '';
    if (response.result.mode === 'jsonl') state.jsonFile.jsonlCsvFields = getDefaultJsonLineCsvFields(response.result).join(', ');
    state.jsonFile.error = '';
    renderJsonFileInspector();
    setStatus('JSON 文件检查完成');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.jsonFile.loading = false;
    state.jsonFile.error = message;
    state.jsonFile.result = null;
    renderJsonFileInspector();
    setStatus(message, true);
  }
}

function renderJsonFileResult(container, result) {
  const isJsonLines = result.mode === 'jsonl';
  state.lastOutput = [
    `文件: ${result.fileName}`,
    `路径: ${result.filePath}`,
    isJsonLines ? '格式: JSONL' : '格式: JSON',
    `大小: ${formatBytes(result.fileSize)}`,
    isJsonLines ? `总行数: ${result.lineCount}` : '',
    isJsonLines ? `有效记录: ${result.validLineCount}` : '',
    isJsonLines ? `空行: ${result.emptyLineCount}` : '',
    `字符数: ${formatCharCount(result.chars)}`,
    `节点: ${result.totalNodes}`,
    `对象: ${result.objectCount}`,
    `数组: ${result.arrayCount}`,
    `原始值: ${result.primitiveCount}`,
    `最大深度: ${result.maxDepth}`,
    result.topLevelKeys?.length ? `顶层 key: ${result.topLevelKeys.join(', ')}` : '',
    state.jsonFile.exportResult ? '' : '',
    state.jsonFile.exportResult ? `${state.jsonFile.exportResult.actionLabel}: ${state.jsonFile.exportResult.outputPath}` : '',
    state.jsonFile.exportResult?.key ? `提取 key: ${state.jsonFile.exportResult.key}` : '',
    state.jsonFile.exportResult ? `原始大小: ${formatBytes(state.jsonFile.exportResult.inputBytes)}` : '',
    state.jsonFile.exportResult ? `导出大小: ${formatBytes(state.jsonFile.exportResult.outputBytes)}` : '',
    state.jsonFile.exportResult?.savedBytes > 0 ? `节省: ${formatBytes(state.jsonFile.exportResult.savedBytes)}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  const head = document.createElement('div');
  head.className = 'json-file-head';
  const headText = document.createElement('div');
  headText.innerHTML = `<strong>${escapeHtml(result.fileName)}</strong><span>${escapeHtml(result.filePath)}</span>`;
  const exportActions = document.createElement('div');
  exportActions.className = 'json-file-export-actions';
  const formatButton = document.createElement('button');
  formatButton.type = 'button';
  formatButton.className = 'secondary-button json-file-export-button';
  formatButton.textContent = state.jsonFile.formatting ? '导出中...' : '导出格式化 JSON';
  formatButton.disabled = isJsonFileBusy();
  formatButton.addEventListener('click', () => exportLargeJsonFile('format'));
  const minifyButton = document.createElement('button');
  minifyButton.type = 'button';
  minifyButton.className = 'secondary-button json-file-export-button';
  minifyButton.textContent = state.jsonFile.minifying ? '导出中...' : '导出压缩 JSON';
  minifyButton.disabled = isJsonFileBusy();
  minifyButton.addEventListener('click', () => exportLargeJsonFile('minify'));
  if (!isJsonLines) exportActions.append(formatButton, minifyButton);
  head.append(headText, exportActions);

  const metrics = renderMetricCards(
    isJsonLines
      ? [
          ['文件格式', 'JSONL'],
          ['总行数', Number(result.lineCount || 0).toLocaleString('zh-CN')],
          ['有效记录', Number(result.validLineCount || 0).toLocaleString('zh-CN')],
          ['空行', Number(result.emptyLineCount || 0).toLocaleString('zh-CN')],
          ['节点', result.totalNodes.toLocaleString('zh-CN')],
          ['最大深度', String(result.maxDepth)]
        ]
      : [
          ['文件大小', formatBytes(result.fileSize)],
          ['字符数', formatCharCount(result.chars)],
          ['节点', result.totalNodes.toLocaleString('zh-CN')],
          ['对象', result.objectCount.toLocaleString('zh-CN')],
          ['数组', result.arrayCount.toLocaleString('zh-CN')],
          ['最大深度', String(result.maxDepth)]
        ]
  );

  const typeGrid = document.createElement('div');
  typeGrid.className = 'json-file-type-grid';
  [
    ['字符串', result.stringCount],
    ['数字', result.numberCount],
    ['布尔', result.booleanCount],
    ['Null', result.nullCount],
    ['Key', result.keyCount],
    ['原始值', result.primitiveCount]
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.innerHTML = `<span>${label}</span><strong>${Number(value || 0).toLocaleString('zh-CN')}</strong>`;
    typeGrid.append(item);
  });

  const keyPanel = document.createElement('div');
  keyPanel.className = 'json-file-keys';
  const keys = isJsonLines ? getJsonLineFieldPaths(result) : result.topLevelKeys ?? [];
  keyPanel.innerHTML = `<span>${isJsonLines ? '字段路径' : '顶层 Key'}</span>`;
  const keyList = document.createElement('div');
  keyList.className = 'json-file-key-list';
  if (keys.length === 0) {
    const empty = document.createElement('small');
    empty.textContent = isJsonLines ? '没有发现可直接导出的字段路径。' : '根节点不是对象，或没有顶层 key。';
    keyList.append(empty);
  } else {
    const selectedJsonLineFields = isJsonLines ? new Set(parseCsvFieldList(state.jsonFile.jsonlCsvFields)) : new Set();
    keys.forEach((key) => {
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'json-file-key-tag';
      if (isJsonLines && selectedJsonLineFields.has(key)) tag.classList.add('is-selected');
      const count = isJsonLines ? result.fieldPathCounts?.[key] : result.topLevelKeyCounts?.[key];
      tag.textContent = count ? `${key} · ${Number(count).toLocaleString('zh-CN')}` : key;
      tag.addEventListener('click', () => {
        if (isJsonLines) {
          toggleJsonLineCsvField(key);
          renderJsonFileInspector();
          setStatus(`已更新 CSV 字段：${key}`);
          return;
        }
        state.jsonFile.extractKey = key;
        renderJsonFileInspector();
        setStatus(`已选择顶层 key：${key}`);
      });
      keyList.append(tag);
    });
  }
  keyPanel.append(keyList);
  if (isJsonLines) keyPanel.append(renderJsonLinesCsvControls(result));
  else keyPanel.append(renderJsonFileExtractControls());

  const preview = document.createElement('div');
  preview.className = 'json-file-preview';
  preview.append(renderJsonFilePreviewBlock('文件开头', result.previewHead), renderJsonFilePreviewBlock('文件结尾', result.previewTail));

  if (state.jsonFile.exportResult) {
    container.append(head, metrics, renderJsonFileExportResult(state.jsonFile.exportResult), typeGrid, keyPanel, preview);
  } else {
    container.append(head, metrics, typeGrid, keyPanel, preview);
  }
}

async function exportLargeJsonFile(mode) {
  const result = state.jsonFile.result;
  if (!result?.filePath) return;
  const isFormat = mode === 'format';
  const isExtract = mode === 'extract';
  state.jsonFile.minifying = !isFormat;
  state.jsonFile.formatting = isFormat;
  state.jsonFile.extracting = isExtract;
  if (isExtract) {
    state.jsonFile.minifying = false;
    state.jsonFile.formatting = false;
  }
  renderJsonFileInspector();
  setStatus(isExtract ? '正在流式导出顶层 key...' : isFormat ? '正在流式导出格式化 JSON...' : '正在流式导出压缩 JSON...');
  try {
    const response = isExtract
      ? await window.toolkit.extractJsonTopLevelKey(result.filePath, state.jsonFile.extractKey)
      : isFormat
        ? await window.toolkit.formatJsonFile(result.filePath)
        : await window.toolkit.minifyJsonFile(result.filePath);
    state.jsonFile.minifying = false;
    state.jsonFile.formatting = false;
    state.jsonFile.extracting = false;
    if (response.canceled) {
      renderJsonFileInspector();
      setStatus('已取消导出');
      return;
    }
    if (response.error) {
      state.jsonFile.error = response.error;
      state.jsonFile.exportResult = null;
      renderJsonFileInspector();
      setStatus(response.error, true);
      return;
    }
    state.jsonFile.exportResult = {
      ...response.result,
      mode,
      actionLabel: isExtract ? '顶层 key 导出' : isFormat ? '格式化导出' : '压缩导出'
    };
    state.lastOutput = [
      state.lastOutput,
      '',
      `${isExtract ? '顶层 key 导出' : isFormat ? '格式化导出' : '压缩导出'}: ${response.result.outputPath}`,
      response.result.key ? `提取 key: ${response.result.key}` : '',
      `原始大小: ${formatBytes(response.result.inputBytes)}`,
      `导出大小: ${formatBytes(response.result.outputBytes)}`,
      response.result.savedBytes > 0 ? `节省: ${formatBytes(response.result.savedBytes)}` : ''
    ]
      .filter(Boolean)
      .join('\n');
    renderJsonFileInspector();
    setStatus(isExtract ? '顶层 key 已导出' : isFormat ? '格式化 JSON 已导出' : '压缩 JSON 已导出');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.jsonFile.minifying = false;
    state.jsonFile.formatting = false;
    state.jsonFile.extracting = false;
    state.jsonFile.error = message;
    state.jsonFile.exportResult = null;
    renderJsonFileInspector();
    setStatus(message, true);
  }
}

async function exportJsonLinesCsvFile() {
  const result = state.jsonFile.result;
  if (!result?.filePath || result.mode !== 'jsonl') return;
  const fields = parseCsvFieldList(state.jsonFile.jsonlCsvFields);
  if (fields.length === 0) {
    setStatus('请输入要导出的字段', true);
    return;
  }
  state.jsonFile.exportingCsv = true;
  renderJsonFileInspector();
  setStatus('正在流式导出 JSONL 字段 CSV...');
  try {
    const response = await window.toolkit.exportJsonLinesCsv(result.filePath, fields);
    state.jsonFile.exportingCsv = false;
    if (response.canceled) {
      renderJsonFileInspector();
      setStatus('已取消导出');
      return;
    }
    if (response.error) {
      state.jsonFile.error = response.error;
      state.jsonFile.exportResult = null;
      renderJsonFileInspector();
      setStatus(response.error, true);
      return;
    }
    state.jsonFile.exportResult = {
      ...response.result,
      mode: 'csv',
      actionLabel: '字段 CSV 导出'
    };
    renderJsonFileInspector();
    setStatus(`CSV 已导出：${Number(response.result.exportedRows || 0).toLocaleString('zh-CN')} 行`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.jsonFile.exportingCsv = false;
    state.jsonFile.error = message;
    state.jsonFile.exportResult = null;
    renderJsonFileInspector();
    setStatus(message, true);
  }
}

async function minifyLargeJsonFile() {
  return exportLargeJsonFile('minify');
}

function renderJsonFileExtractControls() {
  const controls = document.createElement('div');
  controls.className = 'json-file-extract-controls';
  const label = document.createElement('label');
  label.innerHTML = '<span>提取顶层 key</span>';
  const input = document.createElement('input');
  input.value = state.jsonFile.extractKey;
  input.placeholder = '例如 data';
  input.spellcheck = false;
  input.addEventListener('input', () => {
    state.jsonFile.extractKey = input.value.trim();
  });
  label.append(input);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-button json-file-export-button';
  button.textContent = state.jsonFile.extracting ? '导出中...' : '导出这个 key';
  button.disabled = isJsonFileBusy() || !state.jsonFile.extractKey;
  button.addEventListener('click', () => exportLargeJsonFile('extract'));
  controls.append(label, button);
  return controls;
}

function isJsonFileBusy() {
  return state.jsonFile.loading || state.jsonFile.minifying || state.jsonFile.formatting || state.jsonFile.extracting || state.jsonFile.exportingCsv;
}

function renderJsonLinesCsvControls(result) {
  const wrap = document.createElement('div');
  wrap.className = 'jsonl-csv-tool';
  const controls = document.createElement('div');
  controls.className = 'json-file-extract-controls';
  const label = document.createElement('label');
  label.innerHTML = '<span>导出字段 CSV</span>';
  const input = document.createElement('input');
  input.value = state.jsonFile.jsonlCsvFields || getDefaultJsonLineCsvFields(result).join(', ');
  input.placeholder = 'id,name,meta.role,user.name';
  input.spellcheck = false;
  let previewPanel;
  input.addEventListener('input', () => {
    state.jsonFile.jsonlCsvFields = input.value;
    const nextPreview = renderJsonLinesCsvPreview(result);
    previewPanel.replaceWith(nextPreview);
    previewPanel = nextPreview;
  });
  label.append(input);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-button json-file-export-button';
  button.textContent = state.jsonFile.exportingCsv ? '导出中...' : '导出 CSV';
  button.disabled = isJsonFileBusy() || parseCsvFieldList(state.jsonFile.jsonlCsvFields || input.value).length === 0;
  button.addEventListener('click', exportJsonLinesCsvFile);
  controls.append(label, button);
  previewPanel = renderJsonLinesCsvPreview(result);
  wrap.append(controls, previewPanel);
  return wrap;
}

function parseCsvFieldList(value) {
  return [...new Set(String(value ?? '').split(/[,\n]/).map((field) => field.trim()).filter(Boolean))];
}

function getJsonLineFieldPaths(result) {
  return result?.fieldPaths?.length ? result.fieldPaths : result?.topLevelKeys ?? [];
}

function getDefaultJsonLineCsvFields(result) {
  return getJsonLineFieldPaths(result).slice(0, 8);
}

function toggleJsonLineCsvField(field) {
  const current = parseCsvFieldList(state.jsonFile.jsonlCsvFields);
  state.jsonFile.jsonlCsvFields = current.includes(field)
    ? current.filter((item) => item !== field).join(', ')
    : [...current, field].join(', ');
}

function renderJsonLinesCsvPreview(result) {
  const panel = document.createElement('section');
  panel.className = 'jsonl-csv-preview';
  const preview = buildJsonLinesCsvPreview(result.previewHead, state.jsonFile.jsonlCsvFields, 5);
  const head = document.createElement('div');
  head.className = 'jsonl-csv-preview-head';
  const title = document.createElement('span');
  title.textContent = '导出预览';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = '复制预览';
  copy.disabled = !preview.ok;
  copy.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(preview.csvText);
    setStatus('CSV 预览已复制');
  });
  head.append(title, copy);
  panel.append(head);
  if (!preview.ok) {
    const empty = document.createElement('p');
    empty.className = 'jsonl-csv-preview-empty';
    empty.textContent = preview.error;
    panel.append(empty);
    return panel;
  }
  const tableWrap = document.createElement('div');
  tableWrap.className = 'jsonl-csv-table-wrap';
  const table = document.createElement('table');
  table.className = 'jsonl-csv-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>${preview.headers.map((field) => `<th>${escapeHtml(field)}</th>`).join('')}</tr>`;
  const tbody = document.createElement('tbody');
  preview.rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = row.map((value) => `<td>${escapeHtml(value)}</td>`).join('');
    tbody.append(tr);
  });
  table.append(thead, tbody);
  tableWrap.append(table);
  panel.append(tableWrap);
  return panel;
}

function renderJsonFileExportResult(result) {
  const panel = document.createElement('div');
  panel.className = 'json-file-export-result';
  const savedRatio = result.inputBytes > 0 ? `${Math.round((result.savedBytes / result.inputBytes) * 100)}%` : '0%';
  const sizeLabel = result.mode === 'csv' ? 'CSV 文件' : result.mode === 'extract' ? '提取结果' : result.mode === 'format' ? '格式化后' : '压缩后';
  const deltaBytes = Number(result.deltaBytes ?? result.savedBytes ?? 0);
  const deltaLabel = deltaBytes >= 0 ? `节省 ${formatBytes(deltaBytes)} · ${savedRatio}` : `增加 ${formatBytes(Math.abs(deltaBytes))}`;
  const changeLabel =
    result.mode === 'csv'
      ? `${Number(result.exportedRows || 0).toLocaleString('zh-CN')} 行 · ${Number(result.fields?.length || 0).toLocaleString('zh-CN')} 字段`
      : deltaLabel;
  panel.innerHTML = `
    <div>
      <span>已完成${escapeHtml(result.actionLabel || '导出')}</span>
      <strong>${escapeHtml(result.outputPath)}</strong>
    </div>
    <div>
      <span>${sizeLabel}</span>
      <strong>${formatBytes(result.outputBytes)}</strong>
    </div>
    <div>
      <span>${result.mode === 'csv' ? '导出记录' : '体积变化'}</span>
      <strong>${changeLabel}</strong>
    </div>
  `;
  return panel;
}

function renderJsonFilePreviewBlock(title, text) {
  const block = document.createElement('section');
  block.className = 'json-file-preview-block';
  const heading = document.createElement('div');
  heading.innerHTML = `<strong>${title}</strong><span>${formatCharCount(String(text ?? '').length)}</span>`;
  const pre = document.createElement('pre');
  pre.textContent = text || '';
  block.append(heading, pre);
  return block;
}

function renderFileHashTool() {
  const panel = document.createElement('div');
  panel.className = 'file-hash-tool';

  const controlCard = document.createElement('section');
  controlCard.className = 'file-hash-control-card';
  const title = document.createElement('div');
  title.className = 'file-hash-title';
  title.innerHTML = '<strong>文件哈希校验</strong><span>流式读取文件，适合大文件和安装包校验</span>';

  const algorithmGrid = document.createElement('div');
  algorithmGrid.className = 'file-hash-algorithms';
  ['md5', 'sha1', 'sha256', 'sha512'].forEach((algorithm) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.fileHash.algorithms.includes(algorithm);
    checkbox.addEventListener('change', () => {
      const current = new Set(state.fileHash.algorithms);
      if (checkbox.checked) current.add(algorithm);
      else current.delete(algorithm);
      state.fileHash.algorithms = Array.from(current);
      renderFileHashTool();
    });
    label.append(checkbox, document.createTextNode(algorithm.toUpperCase()));
    algorithmGrid.append(label);
  });

  const expectedLabel = document.createElement('label');
  expectedLabel.className = 'file-hash-expected';
  expectedLabel.innerHTML = '<span>预期哈希</span>';
  const expectedInput = document.createElement('input');
  expectedInput.value = state.fileHash.expectedHash;
  expectedInput.placeholder = '粘贴 MD5 / SHA1 / SHA256 / SHA512';
  expectedInput.spellcheck = false;
  expectedInput.addEventListener('input', () => {
    state.fileHash.expectedHash = expectedInput.value;
    const compare = document.querySelector('.file-hash-compare');
    if (compare && state.fileHash.result) updateFileHashCompare(compare, state.fileHash.result);
  });
  expectedLabel.append(expectedInput);

  const choose = document.createElement('button');
  choose.type = 'button';
  choose.className = 'primary-button file-hash-pick-button';
  choose.textContent = state.fileHash.loading ? '计算中...' : '选择文件计算';
  choose.disabled = state.fileHash.loading || state.fileHash.algorithms.length === 0;
  choose.addEventListener('click', calculateSelectedFileHash);

  const hint = document.createElement('p');
  hint.textContent = '可点击选择或拖入文件。结果行可点击复制，文件内容流式读取。';

  controlCard.append(title, algorithmGrid, expectedLabel, choose);
  const recentFiles = renderRecentFilesPanel(state.fileHash.recentFiles, {
    onOpen: calculateSelectedFileHash,
    onClear: () => clearRecentFiles('fileHash', renderFileHashTool)
  });
  if (recentFiles) controlCard.append(recentFiles);
  controlCard.append(hint);
  setupFileDropZone(controlCard, calculateSelectedFileHash);

  const resultCard = document.createElement('section');
  resultCard.className = 'file-hash-result-card';
  if (state.fileHash.loading) {
    const loading = document.createElement('div');
    loading.className = 'file-hash-empty';
    loading.textContent = '正在计算文件哈希...';
    resultCard.append(loading);
    state.lastOutput = '正在计算文件哈希';
  } else if (state.fileHash.error) {
    const warning = document.createElement('div');
    warning.className = 'file-hash-warning';
    warning.textContent = state.fileHash.error;
    resultCard.append(warning);
    state.lastOutput = state.fileHash.error;
  } else if (state.fileHash.result) {
    renderFileHashResult(resultCard, state.fileHash.result);
  } else {
    const empty = document.createElement('div');
    empty.className = 'file-hash-empty';
    empty.textContent = '选择一个文件后会在这里展示 MD5 / SHA 校验值。';
    resultCard.append(empty);
    state.lastOutput = '';
  }

  panel.append(controlCard, resultCard);
  elements.output.replaceChildren(panel);
}

async function calculateSelectedFileHash(filePath = '') {
  state.fileHash.loading = true;
  state.fileHash.error = '';
  renderFileHashTool();
  setStatus(filePath ? '正在计算拖入文件的哈希...' : '正在计算文件哈希...');
  try {
    const response = filePath
      ? await window.toolkit.fileHashPath(filePath, state.fileHash.algorithms)
      : await window.toolkit.fileHash(state.fileHash.algorithms);
    state.fileHash.loading = false;
    if (response.canceled) {
      renderFileHashTool();
      setStatus('已取消选择文件');
      return;
    }
    if (response.error) {
      state.fileHash.error = response.error;
      state.fileHash.result = null;
      renderFileHashTool();
      setStatus(response.error, true);
      return;
    }
    state.fileHash.result = response.result;
    rememberRecentFile('fileHash', response.result.filePath);
    renderFileHashTool();
    setStatus('文件哈希计算完成');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.fileHash.loading = false;
    state.fileHash.error = message;
    state.fileHash.result = null;
    renderFileHashTool();
    setStatus(message, true);
  }
}

function renderFileHashResult(container, result) {
  const compare = compareExpectedFileHash(result.hashes, state.fileHash.expectedHash);
  state.lastOutput = [
    `文件: ${result.fileName}`,
    `路径: ${result.filePath}`,
    `大小: ${formatBytes(result.fileSize)}`,
    compare.expected ? `比对: ${compare.message}` : '',
    '',
    ...Object.entries(result.hashes).map(([algorithm, value]) => `${algorithm.toUpperCase()}: ${value}`)
  ]
    .filter((line, index) => line || index === 4)
    .join('\n');

  const head = document.createElement('div');
  head.className = 'file-hash-head';
  head.innerHTML = `<strong>${escapeHtml(result.fileName)}</strong><span>${escapeHtml(result.filePath)}</span><small>${formatBytes(result.fileSize)}</small>`;

  const rows = document.createElement('div');
  rows.className = 'file-hash-rows';
  Object.entries(result.hashes).forEach(([algorithm, value]) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'file-hash-row';
    row.innerHTML = `<span>${algorithm.toUpperCase()}</span><code></code>`;
    row.querySelector('code').textContent = value;
    row.addEventListener('click', async () => {
      await window.toolkit.writeClipboard(value);
      setStatus(`${algorithm.toUpperCase()} 已复制`);
    });
    rows.append(row);
  });

  const comparePanel = document.createElement('div');
  comparePanel.className = 'file-hash-compare';
  updateFileHashCompare(comparePanel, result);

  container.append(head, comparePanel, rows);
}

function updateFileHashCompare(container, result) {
  const compare = compareExpectedFileHash(result.hashes, state.fileHash.expectedHash);
  container.className = `file-hash-compare ${compare.status}`;
  container.replaceChildren();
  const label = document.createElement('span');
  label.textContent = '预期哈希比对';
  const message = document.createElement('strong');
  message.textContent = compare.message;
  container.append(label, message);
  if (compare.expected) {
    const code = document.createElement('code');
    code.textContent = compare.expected;
    container.append(code);
  }
}

function renderImageConverter() {
  const current = state.imageConverter;
  state.lastOutput = current.result
    ? `${current.result.fileName}\n${formatBytes(current.result.size)}`
    : '';

  const panel = document.createElement('div');
  panel.className = 'image-converter-panel';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/avif',
    'image/svg+xml',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.bmp',
    '.tif',
    '.tiff',
    '.avif',
    '.svg',
    '.jfif',
    '.jpe'
  ].join(',');
  fileInput.className = 'visually-hidden';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file) await loadImageConverterFile(file);
  });

  const uploadCard = document.createElement('div');
  uploadCard.className = `image-upload-card${current.dataUrl ? ' has-file' : ''}`;
  uploadCard.tabIndex = 0;
  uploadCard.addEventListener('dragover', (event) => {
    event.preventDefault();
    uploadCard.classList.add('drag-over');
  });
  uploadCard.addEventListener('dragleave', () => uploadCard.classList.remove('drag-over'));
  uploadCard.addEventListener('drop', async (event) => {
    event.preventDefault();
    uploadCard.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (file) await loadImageConverterFile(file);
  });

  const chooseButton = document.createElement('button');
  chooseButton.type = 'button';
  chooseButton.className = 'image-upload-button';
  chooseButton.textContent = current.dataUrl ? '重新选择' : '选择文件';
  chooseButton.addEventListener('click', () => fileInput.click());

  const uploadText = document.createElement('div');
  uploadText.className = 'image-upload-text';
  uploadText.innerHTML = current.dataUrl
    ? `<strong>${escapeHtml(current.fileName)}</strong><span>${current.sourceFormat} · ${current.fileSizeText}</span>`
    : '<strong>选择图片文件</strong><span>也可以把文件拖到这里</span>';

  const preview = document.createElement('div');
  preview.className = 'image-preview';
  if (current.dataUrl) {
    const img = document.createElement('img');
    img.src = current.dataUrl;
    img.alt = current.fileName;
    preview.append(img);
  } else {
    preview.textContent = 'PNG / JPG / WEBP / GIF / SVG';
  }

  uploadCard.append(chooseButton, uploadText, preview, fileInput);

  const formatPanel = document.createElement('div');
  formatPanel.className = 'format-convert-card';

  const sourcePill = document.createElement('div');
  sourcePill.className = 'format-pill source';
  sourcePill.innerHTML = `<span>源格式</span><strong>${current.sourceFormat || 'AUTO'}</strong>`;

  const arrow = document.createElement('div');
  arrow.className = 'format-arrow';
  arrow.textContent = '到';

  const targetSelect = document.createElement('select');
  targetSelect.className = 'format-target-select';
  IMAGE_FORMAT_GROUPS.forEach((group) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    group.formats.forEach((format) => {
      const option = document.createElement('option');
      option.value = format;
      option.textContent = `${format.toUpperCase()}${IMAGE_SUPPORTED_FORMATS.has(format) ? '' : '（需专业引擎）'}`;
      option.disabled = !IMAGE_SUPPORTED_FORMATS.has(format);
      optgroup.append(option);
    });
    targetSelect.append(optgroup);
  });
  targetSelect.value = current.targetFormat;
  targetSelect.addEventListener('change', () => {
    current.targetFormat = targetSelect.value;
    current.result = null;
    renderImageConverter();
  });

  const targetWrap = document.createElement('label');
  targetWrap.className = 'format-target-wrap';
  targetWrap.innerHTML = '<span>目标格式</span>';
  targetWrap.append(targetSelect);

  const formatGrid = document.createElement('div');
  formatGrid.className = 'format-grid';
  ['ico', 'png', 'jpg', 'webp', 'svg', 'pdf', 'docx', 'bmp', 'gif', 'avif', 'tiff', 'cur'].forEach((format) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `format-chip${format === current.targetFormat ? ' active' : ''}`;
    button.textContent = format.toUpperCase();
    button.addEventListener('click', () => {
      current.targetFormat = format;
      current.result = null;
      renderImageConverter();
    });
    formatGrid.append(button);
  });

  const unsupportedDetails = document.createElement('details');
  unsupportedDetails.className = 'unsupported-formats';
  const unsupportedSummary = document.createElement('summary');
  unsupportedSummary.textContent = '更多格式';
  const unsupportedGrid = document.createElement('div');
  unsupportedGrid.className = 'unsupported-grid';
  IMAGE_FORMAT_GROUPS.flatMap((group) => group.formats)
    .filter((format, index, array) => array.indexOf(format) === index && !IMAGE_SUPPORTED_FORMATS.has(format))
    .forEach((format) => {
      const tag = document.createElement('span');
      tag.textContent = format.toUpperCase();
      unsupportedGrid.append(tag);
    });
  unsupportedDetails.append(unsupportedSummary, unsupportedGrid);

  const convertButton = document.createElement('button');
  convertButton.type = 'button';
  convertButton.className = 'primary-button image-convert-button';
  convertButton.textContent = `转换为 ${current.targetFormat.toUpperCase()}`;
  convertButton.disabled = !current.dataUrl;
  convertButton.addEventListener('click', convertImageFile);

  formatPanel.append(sourcePill, arrow, targetWrap, formatGrid, unsupportedDetails, convertButton);

  const resultPanel = document.createElement('div');
  resultPanel.className = 'image-result-card';
  if (current.result) {
    const resultTitle = document.createElement('strong');
    resultTitle.textContent = current.result.fileName;
    const resultMeta = document.createElement('span');
    resultMeta.textContent = `${current.result.extension.toUpperCase()} · ${formatBytes(current.result.size)} · ${current.result.width}×${current.result.height}`;
    const resultPreview = document.createElement('div');
    resultPreview.className = 'converted-preview';
    if (IMAGE_PREVIEW_FORMATS.has(current.result.extension)) {
      const img = document.createElement('img');
      img.src = `data:${current.result.mimeType};base64,${current.result.base64}`;
      img.alt = current.result.fileName;
      resultPreview.append(img);
    } else {
      resultPreview.textContent = current.result.extension.toUpperCase();
    }
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'primary-button';
    saveButton.textContent = '保存文件';
    saveButton.addEventListener('click', async () => {
      const saved = await window.toolkit.saveConvertedFile({
        base64: current.result.base64,
        fileName: current.result.fileName
      });
      if (!saved.canceled) setStatus(`已保存：${saved.filePath}`);
    });
    resultPanel.append(resultTitle, resultMeta, resultPreview, saveButton);
  } else {
    resultPanel.innerHTML = '<strong>等待转换</strong><span>选择文件和目标格式后开始转换</span>';
  }

  panel.append(uploadCard, formatPanel, resultPanel);
  elements.output.replaceChildren(panel);
}

async function loadImageConverterFile(file) {
  const dataUrl = await readFileAsDataUrl(file);
  state.imageConverter = {
    ...state.imageConverter,
    fileName: file.name,
    dataUrl,
    sourceFormat: inferImageFormat(file.name, file.type),
    fileSizeText: formatBytes(file.size),
    result: null
  };
  setStatus('图片已载入');
  renderImageConverter();
}

async function convertImageFile() {
  const current = state.imageConverter;
  if (!current.dataUrl) {
    setStatus('请先选择图片文件', true);
    return;
  }

  try {
    setStatus('正在转换图片...');
    const result = await window.toolkit.convertImage({
      fileName: current.fileName,
      dataUrl: current.dataUrl,
      targetFormat: current.targetFormat
    });
    current.result = result;
    state.lastOutput = `${result.fileName}\n${formatBytes(result.size)}`;
    renderImageConverter();
    setStatus('图片转换成功');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, true);
  }
}

function renderMarkdownDocxTool() {
  const current = state.markdownDocx;
  state.lastOutput = current.result
    ? `${current.result.fileName}\n${formatBytes(current.result.size)}`
    : current.error;

  const panel = document.createElement('div');
  panel.className = 'markdown-docx-panel';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.md,.markdown,.mdown,.txt,text/markdown,text/plain';
  fileInput.className = 'visually-hidden';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file) await loadMarkdownDocxFile(file);
  });

  const sourceCard = document.createElement('div');
  sourceCard.className = `image-upload-card markdown-source-card${current.sourceName ? ' has-file' : ''}`;
  sourceCard.tabIndex = 0;
  sourceCard.addEventListener('dragover', (event) => {
    event.preventDefault();
    sourceCard.classList.add('drag-over');
  });
  sourceCard.addEventListener('dragleave', () => sourceCard.classList.remove('drag-over'));
  sourceCard.addEventListener('drop', async (event) => {
    event.preventDefault();
    sourceCard.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (file) await loadMarkdownDocxFile(file);
  });

  const chooseButton = document.createElement('button');
  chooseButton.type = 'button';
  chooseButton.className = 'image-upload-button';
  chooseButton.textContent = current.sourceName ? '重新选择 Markdown' : '选择 Markdown';
  chooseButton.addEventListener('click', () => fileInput.click());

  const sourceText = document.createElement('div');
  sourceText.className = 'image-upload-text';
  sourceText.innerHTML = current.sourceName
    ? `<strong>${escapeHtml(current.sourceName)}</strong><span>相对图片目录：${escapeHtml(current.baseDir || '未设置')}</span>`
    : '<strong>粘贴或选择 Markdown</strong><span>支持 .md/.markdown/.txt，也可以拖到这里</span>';

  const sourceHint = document.createElement('div');
  sourceHint.className = 'markdown-docx-hint';
  sourceHint.textContent = '图片支持 data URI、本地相对路径/绝对路径和远程 URL；Mermaid 代码块会渲染为图。';
  sourceCard.append(chooseButton, sourceText, sourceHint, fileInput);

  const editorCard = document.createElement('div');
  editorCard.className = 'format-convert-card markdown-editor-card';

  const textareaLabel = document.createElement('label');
  textareaLabel.className = 'markdown-docx-field';
  const textareaCaption = document.createElement('span');
  textareaCaption.textContent = 'Markdown 内容';
  const textarea = document.createElement('textarea');
  textarea.className = 'markdown-docx-textarea';
  textarea.spellcheck = false;
  textarea.value = current.markdown;
  textarea.placeholder = '# 标题\n\n正文、图片、$\\frac{1}{2}$、```mermaid```';
  textarea.addEventListener('input', () => {
    current.markdown = textarea.value;
    current.result = null;
    current.error = '';
  });
  textareaLabel.append(textareaCaption, textarea);

  const fileNameLabel = document.createElement('label');
  fileNameLabel.className = 'markdown-docx-field';
  fileNameLabel.innerHTML = '<span>输出文件名</span>';
  const fileNameInput = document.createElement('input');
  fileNameInput.type = 'text';
  fileNameInput.value = current.fileName;
  fileNameInput.placeholder = 'markdown-document.docx';
  fileNameInput.addEventListener('input', () => {
    current.fileName = fileNameInput.value;
  });
  fileNameLabel.append(fileNameInput);

  const baseDirLabel = document.createElement('label');
  baseDirLabel.className = 'markdown-docx-field';
  baseDirLabel.innerHTML = '<span>图片相对路径目录</span>';
  const baseDirInput = document.createElement('input');
  baseDirInput.type = 'text';
  baseDirInput.value = current.baseDir;
  baseDirInput.placeholder = '/path/to/markdown/assets';
  baseDirInput.addEventListener('input', () => {
    current.baseDir = baseDirInput.value;
  });
  baseDirLabel.append(baseDirInput);

  const convertButton = document.createElement('button');
  convertButton.type = 'button';
  convertButton.className = 'primary-button markdown-docx-convert';
  convertButton.textContent = current.loading ? '正在生成...' : '生成 DOCX';
  convertButton.disabled = current.loading || !current.markdown.trim();
  convertButton.addEventListener('click', convertMarkdownDocx);

  editorCard.append(textareaLabel, fileNameLabel, baseDirLabel, convertButton);

  const resultCard = document.createElement('div');
  resultCard.className = 'image-result-card markdown-docx-result';
  if (current.result) {
    const title = document.createElement('strong');
    title.textContent = current.result.fileName;
    const meta = document.createElement('span');
    meta.textContent = `DOCX · ${formatBytes(current.result.size)}`;
    const preview = document.createElement('div');
    preview.className = 'converted-preview markdown-docx-preview';
    preview.textContent = 'DOCX';
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'primary-button';
    saveButton.textContent = '保存文件';
    saveButton.addEventListener('click', async () => {
      const saved = await window.toolkit.saveConvertedFile({
        base64: current.result.base64,
        fileName: current.result.fileName
      });
      if (!saved.canceled) setStatus(`已保存：${saved.filePath}`);
    });
    resultCard.append(title, meta, preview);
    if (current.result.warnings?.length) {
      const warnings = document.createElement('div');
      warnings.className = 'markdown-docx-warnings';
      warnings.innerHTML = current.result.warnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join('');
      resultCard.append(warnings);
    }
    resultCard.append(saveButton);
  } else if (current.error) {
    resultCard.innerHTML = `<strong>生成失败</strong><span>${escapeHtml(current.error)}</span>`;
  } else {
    resultCard.innerHTML = '<strong>等待生成</strong><span>生成后会在这里显示文件大小和保存按钮</span><div class="converted-preview markdown-docx-preview">MD → DOCX</div>';
  }

  panel.append(sourceCard, editorCard, resultCard);
  elements.output.replaceChildren(panel);
}

async function loadMarkdownDocxFile(file) {
  const text = await readFileAsText(file);
  const filePath = window.toolkit.getFilePath?.(file) || '';
  const baseDir = filePath ? filePath.replace(/[\\/][^\\/]*$/, '') : state.markdownDocx.baseDir;
  state.markdownDocx = {
    ...state.markdownDocx,
    markdown: text,
    sourceName: file.name,
    fileName: `${file.name.replace(/\.[^.]+$/, '') || 'markdown-document'}.docx`,
    baseDir,
    result: null,
    error: ''
  };
  setStatus('Markdown 已载入');
  renderMarkdownDocxTool();
}

async function convertMarkdownDocx() {
  const current = state.markdownDocx;
  if (!current.markdown.trim()) {
    setStatus('请输入 Markdown 内容', true);
    return;
  }
  try {
    current.loading = true;
    current.error = '';
    current.result = null;
    renderMarkdownDocxTool();
    setStatus('正在生成 DOCX...');
    const result = await window.toolkit.convertMarkdownToDocx({
      markdown: current.markdown,
      fileName: current.fileName,
      baseDir: current.baseDir
    });
    current.result = result;
    state.lastOutput = `${result.fileName}\n${formatBytes(result.size)}`;
    setStatus(result.warnings?.length ? `DOCX 已生成，包含 ${result.warnings.length} 条提示` : 'DOCX 生成成功');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    current.error = message;
    setStatus(message, true);
  } finally {
    current.loading = false;
    renderMarkdownDocxTool();
  }
}

function renderPlantUmlTool() {
  const current = state.plantUml;
  state.lastOutput = current.result?.svg || current.result?.url || current.error || '';

  const panel = document.createElement('div');
  panel.className = 'plantuml-panel';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.puml,.plantuml,.iuml,.txt,text/plain';
  fileInput.className = 'visually-hidden';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (file) await loadPlantUmlFile(file);
  });

  const editorCard = document.createElement('div');
  editorCard.className = 'format-convert-card plantuml-editor-card';

  const editorHead = document.createElement('div');
  editorHead.className = 'plantuml-editor-head';
  const editorTitle = document.createElement('strong');
  editorTitle.textContent = current.sourceName || 'PlantUML / PUML';
  const chooseButton = document.createElement('button');
  chooseButton.type = 'button';
  chooseButton.className = 'secondary-button';
  chooseButton.textContent = current.sourceName ? '重新选择' : '选择文件';
  chooseButton.addEventListener('click', () => fileInput.click());
  editorHead.append(editorTitle, chooseButton, fileInput);

  const textarea = document.createElement('textarea');
  textarea.className = 'plantuml-textarea';
  textarea.spellcheck = false;
  textarea.value = current.source;
  textarea.placeholder = '@startuml\nAlice -> Bob: Hello\n@enduml';
  textarea.addEventListener('input', () => {
    current.source = textarea.value;
    current.result = null;
    current.error = '';
  });

  editorCard.addEventListener('dragover', (event) => {
    event.preventDefault();
    editorCard.classList.add('drag-over');
  });
  editorCard.addEventListener('dragleave', () => editorCard.classList.remove('drag-over'));
  editorCard.addEventListener('drop', async (event) => {
    event.preventDefault();
    editorCard.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (file) await loadPlantUmlFile(file);
  });

  editorCard.append(editorHead, textarea);

  const controlCard = document.createElement('div');
  controlCard.className = 'format-convert-card plantuml-control-card';

  const serverLabel = document.createElement('label');
  serverLabel.className = 'markdown-docx-field';
  serverLabel.innerHTML = '<span>PlantUML Server</span>';
  const serverInput = document.createElement('input');
  serverInput.type = 'url';
  serverInput.value = current.serverUrl;
  serverInput.placeholder = 'https://www.plantuml.com/plantuml';
  serverInput.addEventListener('input', () => {
    current.serverUrl = serverInput.value;
  });
  serverLabel.append(serverInput);

  const hint = document.createElement('div');
  hint.className = 'plantuml-hint';
  hint.textContent = '默认使用公共 PlantUML Server；涉及敏感内容时请改成内网或本地 PlantUML Server。';

  const renderButton = document.createElement('button');
  renderButton.type = 'button';
  renderButton.className = 'primary-button plantuml-render-button';
  renderButton.textContent = current.loading ? '正在渲染...' : '渲染预览';
  renderButton.disabled = current.loading || !current.source.trim();
  renderButton.addEventListener('click', () => renderPlantUml('svg'));

  controlCard.append(serverLabel, hint, renderButton);

  const resultCard = document.createElement('div');
  resultCard.className = 'image-result-card plantuml-result-card';
  if (current.result) {
    const title = document.createElement('strong');
    title.textContent = current.result.fileName;
    const meta = document.createElement('span');
    meta.textContent = `${current.result.format.toUpperCase()} · ${formatBytes(current.result.size)}`;
    const preview = document.createElement('div');
    preview.className = 'converted-preview plantuml-preview';
    const img = document.createElement('img');
    img.src = `data:${current.result.mimeType};base64,${current.result.base64}`;
    img.alt = 'PlantUML preview';
    preview.append(img);

    const actions = document.createElement('div');
    actions.className = 'plantuml-actions';
    const saveSvg = document.createElement('button');
    saveSvg.type = 'button';
    saveSvg.className = 'secondary-button';
    saveSvg.textContent = '保存 SVG';
    saveSvg.addEventListener('click', () => savePlantUmlResult('svg'));
    const savePng = document.createElement('button');
    savePng.type = 'button';
    savePng.className = 'primary-button';
    savePng.textContent = '导出 PNG';
    savePng.addEventListener('click', () => savePlantUmlResult('png'));
    actions.append(saveSvg, savePng);

    resultCard.append(title, meta, preview, actions);
  } else if (current.error) {
    resultCard.innerHTML = `<strong>渲染失败</strong><span>${escapeHtml(current.error)}</span>`;
  } else {
    resultCard.innerHTML = '<strong>等待渲染</strong><span>输入 PUML 后点击渲染预览</span><div class="converted-preview plantuml-preview">PUML → SVG / PNG</div>';
  }

  panel.append(editorCard, controlCard, resultCard);
  elements.output.replaceChildren(panel);
}

async function loadPlantUmlFile(file) {
  const text = await readFileAsText(file);
  state.plantUml = {
    ...state.plantUml,
    source: text,
    sourceName: file.name,
    result: null,
    error: ''
  };
  setStatus('PUML 已载入');
  renderPlantUmlTool();
}

async function renderPlantUml(format = 'svg') {
  const current = state.plantUml;
  if (!current.source.trim()) {
    setStatus('请输入 PUML 内容', true);
    return null;
  }
  try {
    current.loading = true;
    current.error = '';
    renderPlantUmlTool();
    setStatus(format === 'png' ? '正在导出 PNG...' : '正在渲染 PUML...');
    const result = await window.toolkit.renderPlantUml({
      source: current.source,
      serverUrl: current.serverUrl,
      format
    });
    if (format === 'svg') {
      current.result = result;
      state.lastOutput = result.svg || result.url;
    }
    setStatus(format === 'png' ? 'PNG 已生成' : 'PUML 渲染成功');
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    current.error = message;
    setStatus(message, true);
    return null;
  } finally {
    current.loading = false;
    renderPlantUmlTool();
  }
}

async function savePlantUmlResult(format) {
  const current = state.plantUml;
  const result = format === 'svg' ? current.result : await renderPlantUml('png');
  if (!result) return;
  const saved = await window.toolkit.saveConvertedFile({
    base64: result.base64,
    fileName: result.fileName
  });
  if (!saved.canceled) setStatus(`已保存：${saved.filePath}`);
}

function renderCcSwitchTool() {
  const current = state.ccSwitch;
  const appProviders = ccSwitchProvidersForApp(current.selectedApp);
  const selectedProvider = getSelectedCcSwitchProvider();
  const selectedApp = current.apps.find((app) => app.id === current.selectedApp);
  const snippets = (selectedProvider?.snippets || []).filter((snippet) => {
    if (selectedProvider?.app === 'codex') return snippet.app === 'codex' || snippet.app === 'codex-auth';
    return snippet.app === selectedProvider?.app;
  });
  const snippetApp = current.selectedSnippetApp || selectedProvider?.app || current.selectedApp || 'claude';
  const selectedSnippet = snippets.find((snippet) => snippet.app === snippetApp)
    || snippets.find((snippet) => snippet.app === current.selectedApp)
    || snippets[0];
  state.lastOutput = current.lastApplied
    ? `${current.lastApplied.providerName} -> ${current.lastApplied.app}\n${current.lastApplied.configPath}`
    : current.error;

  const panel = document.createElement('div');
  panel.className = 'cc-switch-panel';

  const header = document.createElement('div');
  header.className = 'cc-switch-header';
  header.innerHTML = `
    <div class="cc-switch-title-block">
      <strong>模型切换</strong>
      <span>导入 cc-switch 供应商，复制目标工具配置，或一键写入 Claude Code / Codex / Gemini 等真实配置文件。</span>
    </div>
    <div class="cc-switch-stats">
      <span>${appProviders.length} / ${current.providers.length} 个供应商</span>
      <span>${current.apps.filter((app) => app.configured).length} 个已检测工具</span>
    </div>
  `;
  const headerActions = document.createElement('div');
  headerActions.className = 'cc-switch-header-actions';
  const importButton = document.createElement('button');
  importButton.type = 'button';
  importButton.className = 'primary-button';
  importButton.textContent = current.loading ? '处理中...' : '导入 CC Switch 数据';
  importButton.disabled = current.loading;
  importButton.addEventListener('click', importCcSwitchExisting);
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'secondary-button';
  refresh.textContent = current.loading ? '加载中...' : '刷新';
  refresh.disabled = current.loading;
  refresh.addEventListener('click', loadCcSwitchState);
  const createNew = document.createElement('button');
  createNew.type = 'button';
  createNew.className = 'secondary-button';
  createNew.textContent = '新增供应商';
  createNew.addEventListener('click', resetCcSwitchForm);
  headerActions.append(importButton, refresh, createNew);
  header.append(headerActions);

  const body = document.createElement('div');
  body.className = 'cc-switch-main-layout';

  const listCard = document.createElement('div');
  listCard.className = 'cc-switch-directory';
  const listTitle = document.createElement('div');
  listTitle.className = 'cc-switch-card-title';
  listTitle.innerHTML = `<strong>${escapeHtml(selectedApp?.label || '当前应用')} 供应商</strong><span>供应商按应用隔离，选择后在右侧编辑和写入对应配置。</span>`;
  const providerList = document.createElement('div');
  providerList.className = 'cc-switch-provider-list';
  if (current.providers.length === 0) {
    const importEmpty = document.createElement('button');
    importEmpty.type = 'button';
    importEmpty.className = 'cc-switch-provider-item cc-switch-empty-provider';
    importEmpty.innerHTML = `
      <span class="cc-switch-avatar">CC</span>
      <span class="cc-switch-provider-copy">
        <strong>导入 CC Switch 供应商</strong>
        <small>读取已配置的 API Key、请求地址和模型</small>
        <em>点击后导入为左侧供应商卡片</em>
      </span>
    `;
    importEmpty.addEventListener('click', importCcSwitchExisting);
    const manualEmpty = document.createElement('button');
    manualEmpty.type = 'button';
    manualEmpty.className = 'cc-switch-provider-item cc-switch-empty-provider';
    manualEmpty.innerHTML = `
      <span class="cc-switch-avatar">+</span>
      <span class="cc-switch-provider-copy">
        <strong>手动新增模型供应商</strong>
        <small>创建 OpenAI Compatible / 中转供应商</small>
        <em>填写右侧详情后保存</em>
      </span>
    `;
    manualEmpty.addEventListener('click', resetCcSwitchForm);
    providerList.append(importEmpty, manualEmpty);
  } else if (appProviders.length === 0) {
    const manualEmpty = document.createElement('button');
    manualEmpty.type = 'button';
    manualEmpty.className = 'cc-switch-provider-item cc-switch-empty-provider';
    manualEmpty.innerHTML = `
      <span class="cc-switch-avatar">+</span>
      <span class="cc-switch-provider-copy">
        <strong>新增 ${escapeHtml(selectedApp?.label || '当前应用')} 供应商</strong>
        <small>不同应用的供应商独立管理</small>
        <em>填写右侧详情后保存</em>
      </span>
    `;
    manualEmpty.addEventListener('click', resetCcSwitchForm);
    providerList.append(manualEmpty);
  } else {
    appProviders.forEach((provider) => {
      const item = document.createElement('div');
      item.className = `cc-switch-provider-item${provider.id === current.selectedProviderId ? ' active' : ''}`;
      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'cc-switch-provider-main';
      main.innerHTML = `
        <span class="cc-switch-avatar">${escapeHtml(providerInitials(provider.name))}</span>
        <span class="cc-switch-provider-copy">
          <strong>${escapeHtml(provider.name)}</strong>
          <small>${escapeHtml(provider.baseUrl || '未设置 API 请求地址')}</small>
          <em>${escapeHtml(selectedApp?.label || provider.app)} · ${escapeHtml(provider.model || '未设置模型')} · ${escapeHtml(maskSecret(provider.apiKey))}</em>
        </span>
      `;
      main.addEventListener('click', () => selectCcSwitchProvider(provider.id));
      const quickCopy = document.createElement('button');
      quickCopy.type = 'button';
      quickCopy.className = 'cc-switch-mini-action';
      quickCopy.textContent = '复制';
      quickCopy.addEventListener('click', () => copyProviderSnippet(provider));
      item.append(main, quickCopy);
      providerList.append(item);
    });
  }
  listCard.append(listTitle, providerList);

  const detail = document.createElement('div');
  detail.className = 'cc-switch-detail';

  const formCard = document.createElement('form');
  formCard.className = 'cc-switch-card cc-switch-form';
  formCard.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveCcSwitchProvider();
  });
  const formTitle = document.createElement('div');
  formTitle.className = 'cc-switch-card-title';
  formTitle.innerHTML = `<strong>${current.form.id ? '供应商详情' : '新增供应商'}</strong><span>字段对齐 cc-switch：名称、备注、官网、API Key、API 请求地址和默认模型。</span>`;
  formCard.append(formTitle);
  const fieldGrid = document.createElement('div');
  fieldGrid.className = 'cc-switch-form-grid';
  appendCcSwitchProviderFields(fieldGrid, current);
  formCard.append(fieldGrid);
  if ((current.form.app || current.selectedApp) === 'claude') {
    formCard.append(renderClaudeAdvancedFields(current));
  }
  const formActions = document.createElement('div');
  formActions.className = 'cc-switch-actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'primary-button';
  save.textContent = '保存供应商';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'secondary-button';
  reset.textContent = '清空表单';
  reset.addEventListener('click', resetCcSwitchForm);
  formActions.append(save, reset);
  if (current.form.id) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary-button danger-button';
    remove.textContent = '删除';
    remove.addEventListener('click', deleteCcSwitchProvider);
    formActions.append(remove);
  }
  formCard.append(formActions);

  const applyCard = document.createElement('div');
  applyCard.className = 'cc-switch-card cc-switch-apply';
  const applyTitle = document.createElement('div');
  applyTitle.className = 'cc-switch-card-title';
  applyTitle.innerHTML = '<strong>切换目标工具</strong><span>切换后会合并写入对应配置文件，并自动备份旧文件。</span>';
  const pathInfo = document.createElement('div');
  pathInfo.className = 'cc-switch-path';
  pathInfo.textContent = selectedApp ? selectedApp.path : '';
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'primary-button';
  apply.disabled = !current.selectedProviderId || current.loading;
  apply.textContent = '一键切换';
  apply.addEventListener('click', applyCcSwitchProvider);
  const currentProviderName = current.providers.find((provider) => provider.id === current.currentByApp[current.selectedApp] && provider.app === current.selectedApp)?.name;
  const currentInfo = document.createElement('div');
  currentInfo.className = 'cc-switch-current';
  currentInfo.textContent = currentProviderName ? `当前：${currentProviderName}` : '当前：未由 ElectronToolKit 管理';
  applyCard.append(applyTitle, pathInfo, currentInfo, apply);
  if (current.lastApplied) {
    const applied = document.createElement('div');
    applied.className = 'cc-switch-applied';
    applied.innerHTML = `<strong>已应用：${escapeHtml(current.lastApplied.providerName)}</strong><span>${escapeHtml(current.lastApplied.configPath)}</span>${current.lastApplied.backupPath ? `<small>备份：${escapeHtml(current.lastApplied.backupPath)}</small>` : ''}`;
    applyCard.append(applied);
  }
  if (current.error) {
    const error = document.createElement('div');
    error.className = 'cc-switch-error';
    error.textContent = current.error;
    applyCard.append(error);
  }

  const snippetCard = document.createElement('div');
  snippetCard.className = 'cc-switch-card cc-switch-snippets';
  const snippetTitle = document.createElement('div');
  snippetTitle.className = 'cc-switch-card-title';
  snippetTitle.innerHTML = '<strong>复制配置</strong><span>直接复制当前供应商对应工具的配置片段，适合手动粘贴或对照 cc-switch。</span>';
  const snippetTabs = document.createElement('div');
  snippetTabs.className = 'cc-switch-snippet-tabs';
  snippets.forEach((snippet) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `cc-switch-snippet-tab${selectedSnippet?.app === snippet.app ? ' active' : ''}`;
    tab.textContent = snippet.label.replace(/\s+(settings\.json|config\.toml|auth\.json|opencode\.json|openclaw\.json|config\.yaml|\.env)$/i, '');
    tab.addEventListener('click', () => {
      current.selectedSnippetApp = snippet.app;
      renderCcSwitchTool();
    });
    snippetTabs.append(tab);
  });
  const snippetMeta = document.createElement('div');
  snippetMeta.className = 'cc-switch-path';
  snippetMeta.textContent = selectedSnippet ? `${selectedSnippet.label} · ${selectedSnippet.path}` : '请选择供应商后复制配置';
  const snippetCode = document.createElement('pre');
  snippetCode.className = 'cc-switch-snippet-code';
  snippetCode.innerHTML = selectedSnippet ? highlightSnippet(selectedSnippet) : '';
  const snippetActions = document.createElement('div');
  snippetActions.className = 'cc-switch-actions';
  const copySnippet = document.createElement('button');
  copySnippet.type = 'button';
  copySnippet.className = 'primary-button';
  copySnippet.textContent = '复制当前配置';
  copySnippet.disabled = !selectedSnippet;
  copySnippet.addEventListener('click', () => copyProviderSnippet(selectedProvider, selectedSnippet));
  snippetActions.append(copySnippet);
  snippetCard.append(snippetTitle, snippetTabs, snippetMeta, snippetCode, snippetActions);

  const configCard = document.createElement('div');
  configCard.className = 'cc-switch-card cc-switch-config';
  const configTitle = document.createElement('div');
  configTitle.className = 'cc-switch-card-title';
  configTitle.innerHTML = '<strong>实际配置</strong><span>展示并修改当前所选工具的真实配置文件。</span>';
  const configPath = document.createElement('div');
  configPath.className = 'cc-switch-path';
  configPath.textContent = current.rawConfig.configPath || selectedApp?.path || '';
  const configEditor = document.createElement('div');
  configEditor.className = 'cc-switch-config-editor';
  const configHighlight = document.createElement('pre');
  configHighlight.className = 'cc-switch-config-highlight';
  configHighlight.innerHTML = highlightCcSwitchConfig(current.rawConfig.loading ? '正在读取配置...' : current.rawConfig.content, current.selectedApp);
  const configTextarea = document.createElement('textarea');
  configTextarea.className = 'cc-switch-config-textarea';
  configTextarea.spellcheck = false;
  configTextarea.value = current.rawConfig.loading ? '正在读取配置...' : current.rawConfig.content;
  configTextarea.placeholder = current.rawConfig.exists ? '' : '配置文件不存在，保存后会创建。';
  configTextarea.disabled = current.rawConfig.loading;
  const syncHighlightScroll = () => {
    configHighlight.scrollTop = configTextarea.scrollTop;
    configHighlight.scrollLeft = configTextarea.scrollLeft;
  };
  configTextarea.addEventListener('scroll', syncHighlightScroll);
  configTextarea.addEventListener('input', () => {
    current.rawConfig.content = configTextarea.value;
    current.rawConfig.dirty = true;
    configHighlight.innerHTML = highlightCcSwitchConfig(configTextarea.value, current.selectedApp);
    syncHighlightScroll();
  });
  configEditor.append(configHighlight, configTextarea);
  const configActions = document.createElement('div');
  configActions.className = 'cc-switch-actions';
  const reloadConfig = document.createElement('button');
  reloadConfig.type = 'button';
  reloadConfig.className = 'secondary-button';
  reloadConfig.textContent = '读取实际配置';
  reloadConfig.disabled = current.rawConfig.loading;
  reloadConfig.addEventListener('click', loadCcSwitchRawConfig);
  const saveConfig = document.createElement('button');
  saveConfig.type = 'button';
  saveConfig.className = 'primary-button';
  saveConfig.textContent = current.rawConfig.dirty ? '保存配置 *' : '保存配置';
  saveConfig.disabled = current.rawConfig.loading;
  saveConfig.addEventListener('click', saveCcSwitchRawConfig);
  configActions.append(reloadConfig, saveConfig);
  if (current.rawConfig.backupPath) {
    const backup = document.createElement('div');
    backup.className = 'cc-switch-current';
    backup.textContent = `上次备份：${current.rawConfig.backupPath}`;
    configCard.append(configTitle, configPath, configEditor, configActions, backup);
  } else {
    configCard.append(configTitle, configPath, configEditor, configActions);
  }

  if (current.importResult) {
    const importInfo = document.createElement('div');
    importInfo.className = 'cc-switch-import-info';
    importInfo.textContent = `上次导入：新增 ${current.importResult.imported} 个，跳过 ${current.importResult.skipped} 个 · ${current.importResult.sourcePath}`;
    detail.append(importInfo);
  }

  detail.append(applyCard, formCard, snippetCard, configCard);
  body.append(listCard, detail);
  panel.append(header, renderCcSwitchAppStrip(current), body);
  elements.output.replaceChildren(panel);
}

function renderCcSwitchAppStrip(current) {
  const strip = document.createElement('div');
  strip.className = 'cc-switch-top-app-strip';
  current.apps.forEach((app) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cc-switch-top-app${app.id === current.selectedApp ? ' active' : ''}${app.configured ? ' configured' : ''}`;
    button.textContent = app.label;
    button.addEventListener('click', () => selectCcSwitchApp(app.id));
    strip.append(button);
  });
  return strip;
}

function appendCcSwitchProviderFields(fieldGrid, current) {
  const formApp = current.form.app || current.selectedApp;
  fieldGrid.append(createCcSwitchSelectField('所属应用', formApp, current.apps.map((app) => [app.id, app.label]), (value) => {
    current.form.app = value;
    if (!current.form.id) {
      current.selectedApp = value;
      current.selectedSnippetApp = value;
    }
    renderCcSwitchTool();
  }));
  fieldGrid.append(createCcSwitchInputField('name', '供应商名称', '谐修ai', current, { required: true }));
  fieldGrid.append(createCcSwitchInputField('notes', '备注', '例如：公司专用账号', current));
  fieldGrid.append(createCcSwitchInputField('websiteUrl', '官网链接', 'https://example.com（可选）', current, { wide: true }));
  fieldGrid.append(createCcSwitchInputField('apiKey', 'API Key', 'sk-...', current, { type: 'password', wide: true }));
  fieldGrid.append(createCcSwitchInputField('baseUrl', formApp === 'codex' ? 'API 请求地址' : '请求地址', 'https://api.example.com/v1', current, { wide: true }));

  if (formApp === 'claude') {
    current.form.claude = normalizeClaudeFormOptions(current.form.claude);
    fieldGrid.append(createCcSwitchSelectField(
      'API 格式',
      current.form.claude.apiFormat,
      [['anthropic', 'Anthropic Messages（原生）'], ['openai', 'OpenAI Compatible']],
      (value) => { current.form.claude.apiFormat = value; }
    ));
    fieldGrid.append(createCcSwitchSelectField(
      '认证字段',
      current.form.claude.authField,
      [['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_AUTH_TOKEN（默认）'], ['ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY']],
      (value) => { current.form.claude.authField = value; }
    ));
    fieldGrid.append(createCcSwitchInputField('fallbackModel', '默认兜底模型', '通常可以留空', current, {
      source: current.form.claude,
      wide: true
    }));
    return;
  }

  if (formApp === 'codex') {
    current.form.codex = normalizeCodexFormOptions(current.form.codex);
    fieldGrid.append(createCcSwitchSelectField(
      'API 格式',
      current.form.codex.wireApi,
      [['responses', 'OpenAI Responses'], ['chat', 'OpenAI Chat Completions']],
      (value) => { current.form.codex.wireApi = value; }
    ));
    fieldGrid.append(createCcSwitchInputField('model', '模型名称', 'gpt-5.5', current, { wide: true }));
    return;
  }

  fieldGrid.append(createCcSwitchInputField('model', '模型名称', '默认模型名称', current, { wide: true }));
}

function createCcSwitchInputField(key, label, placeholder, current, options = {}) {
  const source = options.source || current.form;
  const wrap = document.createElement('label');
  wrap.className = `cc-switch-field${options.wide ? ' wide' : ''}`;
  const caption = document.createElement('span');
  caption.textContent = label;
  const input = key === 'notes' ? document.createElement('textarea') : document.createElement('input');
  input.value = source[key] || '';
  input.placeholder = placeholder || '';
  if (options.type) input.type = options.type;
  if (options.required) input.required = true;
  input.addEventListener('input', () => {
    source[key] = input.value;
    if (source === current.form && key === 'name' && !current.form.id && !current.form.slug) {
      current.form.slug = input.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    }
  });
  wrap.append(caption, input);
  return wrap;
}

function createCcSwitchSelectField(label, value, options, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'cc-switch-field';
  const caption = document.createElement('span');
  caption.textContent = label;
  const select = document.createElement('select');
  options.forEach(([optionValue, optionLabel]) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionLabel;
    select.append(option);
  });
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  wrap.append(caption, select);
  return wrap;
}

function renderClaudeAdvancedFields(current) {
  current.form.claude = normalizeClaudeFormOptions(current.form.claude);
  const section = document.createElement('div');
  section.className = 'cc-switch-advanced';
  const title = document.createElement('div');
  title.className = 'cc-switch-card-title';
  title.innerHTML = '<strong>高级选项</strong><span>模型映射与 cc-switch 保持同一语义：显示名称用于菜单，实际请求模型会写入 Claude Code 配置。</span>';
  const table = document.createElement('div');
  table.className = 'cc-switch-model-map';
  table.innerHTML = '<span>模型角色</span><span>显示名称</span><span>实际请求模型</span><span>声明支持 1M</span>';
  [
    ['sonnet', 'Sonnet'],
    ['opus', 'Opus'],
    ['haiku', 'Haiku']
  ].forEach(([role, label]) => {
    const mapping = current.form.claude.modelMappings[role];
    const roleBox = document.createElement('strong');
    roleBox.textContent = label;
    const display = document.createElement('input');
    display.placeholder = '例如 DeepSeek V4 Pro';
    display.value = mapping.displayName || '';
    display.addEventListener('input', () => { mapping.displayName = display.value; });
    const request = document.createElement('input');
    request.placeholder = '实际模型名';
    request.value = mapping.requestModel || '';
    request.addEventListener('input', () => { mapping.requestModel = request.value; });
    const checkboxLabel = document.createElement('label');
    checkboxLabel.className = 'cc-switch-inline-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(mapping.context1m);
    checkbox.addEventListener('change', () => { mapping.context1m = checkbox.checked; });
    checkboxLabel.append(checkbox, document.createTextNode('1M'));
    table.append(roleBox, display, request, checkboxLabel);
  });
  section.append(title, table);
  return section;
}

function getSelectedCcSwitchProvider() {
  const current = state.ccSwitch;
  return current.providers.find((provider) => provider.id === current.selectedProviderId && provider.app === current.selectedApp) || null;
}

function ccSwitchProvidersForApp(app = state.ccSwitch.selectedApp) {
  return state.ccSwitch.providers.filter((provider) => provider.app === app);
}

function preferredCcSwitchProviderForApp(app = state.ccSwitch.selectedApp) {
  const current = state.ccSwitch;
  const currentProviderId = current.currentByApp?.[app] || '';
  return current.providers.find((provider) => provider.id === currentProviderId && provider.app === app)
    || current.providers.find((provider) => provider.app === app)
    || null;
}

function clearCcSwitchProviderSelection(app = state.ccSwitch.selectedApp) {
  state.ccSwitch.selectedProviderId = '';
  state.ccSwitch.selectedSnippetApp = app;
  state.ccSwitch.form = {
    id: '',
    app,
    name: '',
    slug: '',
    baseUrl: '',
    apiKey: '',
    model: '',
    claude: defaultClaudeFormOptions(),
    codex: defaultCodexFormOptions(),
    websiteUrl: '',
    notes: ''
  };
}

function syncCcSwitchProviderSelection() {
  const current = state.ccSwitch;
  const selected = current.providers.find((provider) => provider.id === current.selectedProviderId);
  if (selected?.app === current.selectedApp) return;
  const preferred = preferredCcSwitchProviderForApp(current.selectedApp);
  if (preferred) selectCcSwitchProvider(preferred.id, { render: false });
  else clearCcSwitchProviderSelection(current.selectedApp);
}

function selectCcSwitchApp(app) {
  const current = state.ccSwitch;
  current.selectedApp = app;
  current.selectedSnippetApp = app;
  current.rawConfig.dirty = false;
  syncCcSwitchProviderSelection();
  renderCcSwitchTool();
  loadCcSwitchRawConfig();
}

async function importCcSwitchExisting() {
  const current = state.ccSwitch;
  try {
    current.loading = true;
    current.error = '';
    renderCcSwitchTool();
    const result = await window.toolkit.ccSwitchImportExisting();
    applyCcSwitchState(result);
    current.importResult = result.importResult || null;
    if (result.providers?.length && !current.selectedProviderId) {
      selectCcSwitchProvider(result.providers[0].id, { render: false });
    }
    const imported = current.importResult?.imported ?? 0;
    const skipped = current.importResult?.skipped ?? 0;
    setStatus(`CC Switch 导入完成：新增 ${imported} 个，跳过 ${skipped} 个`);
  } catch (error) {
    current.error = error instanceof Error ? error.message : String(error);
    setStatus(current.error, true);
  } finally {
    current.loading = false;
    renderCcSwitchTool();
  }
}

async function autoImportCcSwitchExisting() {
  const current = state.ccSwitch;
  if (current.autoImportTried || current.providers.length > 0) return false;
  current.autoImportTried = true;
  try {
    const result = await window.toolkit.ccSwitchImportExisting();
    applyCcSwitchState(result);
    current.importResult = result.importResult || null;
    const imported = current.importResult?.imported ?? 0;
    if (imported > 0) {
      setStatus(`已自动导入 ${imported} 个 CC Switch 供应商`);
      return true;
    }
  } catch {
    // 静默失败：用户仍可通过左侧导入卡片手动触发并查看错误。
  }
  return false;
}

function copyProviderSnippet(provider, snippet) {
  const targetProvider = provider || getSelectedCcSwitchProvider();
  if (!targetProvider) {
    setStatus('请先选择供应商', true);
    return;
  }
  const targetApp = targetProvider.app || state.ccSwitch.selectedApp;
  const targetSnippet = snippet
    || targetProvider.snippets?.find((item) => item.app === state.ccSwitch.selectedSnippetApp && (state.ccSwitch.selectedSnippetApp === targetApp || state.ccSwitch.selectedSnippetApp === 'codex-auth'))
    || targetProvider.snippets?.find((item) => item.app === targetApp)
    || targetProvider.snippets?.[0];
  if (!targetSnippet) {
    setStatus('没有可复制的配置片段', true);
    return;
  }
  window.toolkit.writeClipboard(targetSnippet.content);
  setStatus(`已复制 ${targetSnippet.label}`);
}

function providerInitials(name) {
  const text = String(name || '').trim();
  if (!text) return 'AI';
  const parts = text.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

function defaultClaudeFormOptions() {
  return {
    apiFormat: 'anthropic',
    authField: 'ANTHROPIC_AUTH_TOKEN',
    fallbackModel: '',
    modelMappings: {
      sonnet: { displayName: '', requestModel: '', context1m: false },
      opus: { displayName: '', requestModel: '', context1m: false },
      haiku: { displayName: '', requestModel: '', context1m: false }
    }
  };
}

function normalizeClaudeFormOptions(value) {
  const source = value && typeof value === 'object' ? value : {};
  const fallback = defaultClaudeFormOptions();
  return {
    apiFormat: ['anthropic', 'openai'].includes(source.apiFormat) ? source.apiFormat : fallback.apiFormat,
    authField: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'].includes(source.authField) ? source.authField : fallback.authField,
    fallbackModel: source.fallbackModel || '',
    modelMappings: Object.fromEntries(['sonnet', 'opus', 'haiku'].map((role) => {
      const item = source.modelMappings?.[role] || {};
      return [role, {
        displayName: item.displayName || '',
        requestModel: item.requestModel || '',
        context1m: Boolean(item.context1m)
      }];
    }))
  };
}

function defaultCodexFormOptions() {
  return { wireApi: 'responses' };
}

function normalizeCodexFormOptions(value) {
  const source = value && typeof value === 'object' ? value : {};
  return { wireApi: ['responses', 'chat'].includes(source.wireApi) ? source.wireApi : 'responses' };
}

function highlightSnippet(snippet) {
  if (!snippet) return '';
  if (snippet.language === 'toml') return highlightToml(snippet.content);
  if (snippet.language === 'yaml') return highlightYaml(snippet.content);
  if (snippet.language === 'env') return highlightEnv(snippet.content);
  return highlightJsonLike(snippet.content);
}

async function loadCcSwitchState() {
  const current = state.ccSwitch;
  try {
    current.loading = true;
    current.error = '';
    renderCcSwitchTool();
    const result = await window.toolkit.ccSwitchList();
    applyCcSwitchState(result);
    const autoImported = (result.providers || []).length === 0 ? await autoImportCcSwitchExisting() : false;
    if (current.selectedApp) await loadCcSwitchRawConfig({ render: false });
    if (!autoImported) setStatus('CC Switch 已刷新');
  } catch (error) {
    current.error = error instanceof Error ? error.message : String(error);
    setStatus(current.error, true);
  } finally {
    current.loading = false;
    renderCcSwitchTool();
  }
}

function applyCcSwitchState(result) {
  const current = state.ccSwitch;
  current.providers = result.providers || [];
  current.apps = result.apps || [];
  current.currentByApp = result.currentByApp || {};
  if (!current.selectedApp && current.apps[0]) current.selectedApp = current.apps[0].id;
  if (!current.selectedSnippetApp) current.selectedSnippetApp = current.selectedApp;
  if (current.selectedProviderId && !current.providers.some((provider) => provider.id === current.selectedProviderId && provider.app === current.selectedApp)) {
    current.selectedProviderId = '';
  }
  if (!current.selectedProviderId) {
    const preferred = preferredCcSwitchProviderForApp(current.selectedApp);
    if (preferred) selectCcSwitchProvider(preferred.id, { render: false });
    else clearCcSwitchProviderSelection(current.selectedApp);
  }
  if (result.applied) current.lastApplied = result.applied;
  if (result.importResult) current.importResult = result.importResult;
  if (!current.rawConfig.configPath || current.rawConfig.app !== current.selectedApp) {
    current.rawConfig = { app: current.selectedApp, configPath: '', content: '', exists: false, loading: false, dirty: false, backupPath: '' };
  }
}

function selectCcSwitchProvider(id, options = {}) {
  const current = state.ccSwitch;
  const provider = current.providers.find((item) => item.id === id);
  if (!provider) return;
  current.selectedProviderId = provider.id;
  current.form = {
    id: provider.id,
    app: provider.app || current.selectedApp,
    name: provider.name || '',
    slug: provider.slug || '',
    baseUrl: provider.baseUrl || '',
    apiKey: provider.apiKey || '',
    model: provider.model || '',
    claude: normalizeClaudeFormOptions(provider.claude),
    codex: normalizeCodexFormOptions(provider.codex),
    websiteUrl: provider.websiteUrl || '',
    notes: provider.notes || ''
  };
  if (options.render !== false) renderCcSwitchTool();
}

function resetCcSwitchForm() {
  clearCcSwitchProviderSelection(state.ccSwitch.selectedApp);
  renderCcSwitchTool();
}

async function saveCcSwitchProvider() {
  const current = state.ccSwitch;
  try {
    const savedName = current.form.name;
    const savedSlug = current.form.slug;
    const savedApp = current.form.app || current.selectedApp;
    current.loading = true;
    current.error = '';
    renderCcSwitchTool();
    const result = await window.toolkit.ccSwitchSaveProvider(current.form);
    applyCcSwitchState(result);
    const saved = result.providers.find((provider) => provider.name === savedName && provider.slug === savedSlug && provider.app === savedApp)
      || result.providers.find((provider) => provider.name === savedName && provider.slug === savedSlug)
      || result.providers.at(-1);
    if (saved?.app) {
      current.selectedApp = saved.app;
      current.selectedSnippetApp = saved.app;
    }
    if (saved) selectCcSwitchProvider(saved.id, { render: false });
    setStatus('供应商已保存');
  } catch (error) {
    current.error = error instanceof Error ? error.message : String(error);
    setStatus(current.error, true);
  } finally {
    current.loading = false;
    renderCcSwitchTool();
  }
}

async function deleteCcSwitchProvider() {
  const current = state.ccSwitch;
  if (!current.form.id) return;
  try {
    current.loading = true;
    current.error = '';
    renderCcSwitchTool();
    const result = await window.toolkit.ccSwitchDeleteProvider(current.form.id);
    applyCcSwitchState(result);
    resetCcSwitchForm();
    setStatus('供应商已删除');
  } catch (error) {
    current.error = error instanceof Error ? error.message : String(error);
    setStatus(current.error, true);
  } finally {
    current.loading = false;
    renderCcSwitchTool();
  }
}

async function applyCcSwitchProvider() {
  const current = state.ccSwitch;
  if (!current.selectedProviderId) {
    setStatus('请先选择供应商', true);
    return;
  }
  try {
    current.loading = true;
    current.error = '';
    renderCcSwitchTool();
    const result = await window.toolkit.ccSwitchApplyProvider({ providerId: current.selectedProviderId, app: current.selectedApp });
    applyCcSwitchState(result);
    await loadCcSwitchRawConfig({ render: false });
    setStatus(`已切换 ${current.selectedApp}`);
  } catch (error) {
    current.error = error instanceof Error ? error.message : String(error);
    setStatus(current.error, true);
  } finally {
    current.loading = false;
    renderCcSwitchTool();
  }
}

async function loadCcSwitchRawConfig(options = {}) {
  const current = state.ccSwitch;
  try {
    current.rawConfig.loading = true;
    current.rawConfig.app = current.selectedApp;
    if (options.render !== false) renderCcSwitchTool();
    const result = await window.toolkit.ccSwitchReadConfig(current.selectedApp);
    current.rawConfig = {
      app: result.app,
      configPath: result.configPath,
      content: result.content || '',
      exists: Boolean(result.exists),
      loading: false,
      dirty: false,
      backupPath: ''
    };
    setStatus('实际配置已读取');
  } catch (error) {
    current.error = error instanceof Error ? error.message : String(error);
    setStatus(current.error, true);
  } finally {
    current.rawConfig.loading = false;
    if (options.render !== false) renderCcSwitchTool();
  }
}

async function saveCcSwitchRawConfig() {
  const current = state.ccSwitch;
  try {
    current.rawConfig.loading = true;
    renderCcSwitchTool();
    const result = await window.toolkit.ccSwitchWriteConfig({
      app: current.selectedApp,
      content: current.rawConfig.content
    });
    current.rawConfig = {
      app: result.app,
      configPath: result.configPath,
      content: result.content || '',
      exists: Boolean(result.exists),
      loading: false,
      dirty: false,
      backupPath: result.backupPath || ''
    };
    setStatus('实际配置已保存');
  } catch (error) {
    current.error = error instanceof Error ? error.message : String(error);
    setStatus(current.error, true);
  } finally {
    current.rawConfig.loading = false;
    renderCcSwitchTool();
  }
}

function maskSecret(value) {
  const text = String(value || '');
  if (!text) return '未设置 Key';
  if (text.length <= 8) return '••••';
  return `${text.slice(0, 4)}••••${text.slice(-4)}`;
}

function highlightCcSwitchConfig(content, app) {
  const text = String(content || '');
  if (!text) return '';
  if (app === 'codex') return highlightToml(text);
  if (app === 'gemini') return highlightEnv(text);
  if (app === 'hermes') return highlightYaml(text);
  return highlightJsonLike(text);
}

function highlightJsonLike(text) {
  return escapeHtml(text).replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/g,
    (match, stringValue, colon, keyword, numberValue) => {
      if (stringValue) return `<span class="${colon ? 'syntax-key' : 'syntax-string'}">${stringValue}</span>${colon || ''}`;
      if (keyword) return `<span class="syntax-keyword">${keyword}</span>`;
      if (numberValue) return `<span class="syntax-number">${numberValue}</span>`;
      return match;
    }
  );
}

function highlightToml(text) {
  return text
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line);
      if (/^\s*#/.test(line)) return `<span class="syntax-comment">${escaped}</span>`;
      if (/^\s*\[.+\]\s*$/.test(line)) return `<span class="syntax-section">${escaped}</span>`;
      return escaped.replace(
        /^(\s*[A-Za-z0-9_.-]+)(\s*=\s*)(.*)$/,
        (_match, key, sep, value) => `<span class="syntax-key">${key}</span>${sep}${highlightScalar(value)}`
      );
    })
    .join('\n');
}

function highlightYaml(text) {
  return text
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line);
      if (/^\s*#/.test(line)) return `<span class="syntax-comment">${escaped}</span>`;
      return escaped.replace(
        /^(\s*[-]?\s*[A-Za-z0-9_.-]+)(:\s*)(.*)$/,
        (_match, key, sep, value) => `<span class="syntax-key">${key}</span>${sep}${highlightScalar(value)}`
      );
    })
    .join('\n');
}

function highlightEnv(text) {
  return text
    .split('\n')
    .map((line) => {
      const escaped = escapeHtml(line);
      if (/^\s*#/.test(line)) return `<span class="syntax-comment">${escaped}</span>`;
      return escaped.replace(
        /^(\s*[A-Za-z_][A-Za-z0-9_]*)(=)(.*)$/,
        (_match, key, sep, value) => `<span class="syntax-key">${key}</span>${sep}${highlightScalar(value)}`
      );
    })
    .join('\n');
}

function highlightScalar(value) {
  const escaped = escapeHtml(value);
  if (/^\s*["']/.test(value)) return `<span class="syntax-string">${escaped}</span>`;
  if (/^\s*(true|false|null)\s*$/i.test(value)) return `<span class="syntax-keyword">${escaped}</span>`;
  if (/^\s*-?\d+(\.\d+)?\s*$/.test(value)) return `<span class="syntax-number">${escaped}</span>`;
  return escaped;
}

function renderQrTool() {
  const panel = document.createElement('div');
  panel.className = 'qr-tool';

  const modes = document.createElement('div');
  modes.className = 'qr-modes';
  [
    ['generate', '生成二维码'],
    ['decode', '上传解码']
  ].forEach(([mode, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `qr-mode${state.qrTool.mode === mode ? ' active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      state.qrTool.mode = mode;
      renderQrTool();
    });
    modes.append(button);
  });

  const body = document.createElement('div');
  body.className = 'qr-tool-body';
  const resultWrap = document.createElement('div');
  resultWrap.className = 'qr-result-wrap';

  if (state.qrTool.mode === 'generate') {
    const config = document.createElement('div');
    config.className = 'qr-config-card';

    const textLabel = document.createElement('label');
    textLabel.className = 'qr-text-field';
    textLabel.innerHTML = '<span>文本 / 链接</span>';
    const textarea = document.createElement('textarea');
    textarea.value = state.qrTool.text;
    textarea.placeholder = 'https://localhost:3000';
    textarea.spellcheck = false;
    textarea.addEventListener('input', () => {
      state.qrTool.text = textarea.value;
      updateQrGenerateResult(resultWrap);
    });
    textLabel.append(textarea);

    const options = document.createElement('div');
    options.className = 'qr-options';
    const correction = document.createElement('select');
    [
      ['L', 'L · 低'],
      ['M', 'M · 默认'],
      ['Q', 'Q · 较高'],
      ['H', 'H · 最高']
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      correction.append(option);
    });
    correction.value = state.qrTool.errorCorrectionLevel;
    correction.addEventListener('change', () => {
      state.qrTool.errorCorrectionLevel = correction.value;
      updateQrGenerateResult(resultWrap);
    });

    const size = document.createElement('input');
    size.type = 'range';
    size.min = '180';
    size.max = '360';
    size.step = '10';
    size.value = String(state.qrTool.size);
    const sizeValue = document.createElement('strong');
    sizeValue.textContent = `${state.qrTool.size}px`;
    size.addEventListener('input', () => {
      state.qrTool.size = Number(size.value);
      sizeValue.textContent = `${state.qrTool.size}px`;
      updateQrGenerateResult(resultWrap);
    });

    const margin = document.createElement('input');
    margin.type = 'number';
    margin.min = '0';
    margin.max = '8';
    margin.value = String(state.qrTool.margin);
    margin.addEventListener('input', () => {
      state.qrTool.margin = Math.max(0, Math.min(8, Number(margin.value) || 0));
      updateQrGenerateResult(resultWrap);
    });

    options.append(labelWrap('纠错', correction), labelWrap('尺寸', size), sizeValue, labelWrap('边距', margin));
    config.append(textLabel, options);
    body.append(config, resultWrap);
    panel.append(modes, body);
    elements.output.replaceChildren(panel);
    updateQrGenerateResult(resultWrap);
    return;
  }

  const card = document.createElement('div');
  card.className = 'qr-upload-card';
  const title = document.createElement('strong');
  title.textContent = '上传 PNG 二维码';
  const hint = document.createElement('p');
  hint.textContent = '解析成功后会展示明文内容，复制按钮会复制解析结果。';
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/png';
  file.className = 'visually-hidden';
  const selectButton = document.createElement('button');
  selectButton.type = 'button';
  selectButton.className = 'primary-button';
  selectButton.textContent = '选择 PNG';
  selectButton.addEventListener('click', () => file.click());
  const result = document.createElement('div');
  result.className = 'qr-decode-result';
  result.textContent = state.qrTool.decoded || '等待选择二维码图片';
  if (state.qrTool.decoded) state.lastOutput = state.qrTool.decoded;
  file.addEventListener('change', async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    state.qrTool.fileName = selected.name;
    result.textContent = '正在解析...';
    try {
      const dataUrl = await readFileAsDataUrl(selected);
      const decoded = await window.toolkit.qrDecode(dataUrl);
      state.qrTool.decoded = decoded;
      state.lastOutput = decoded;
      result.textContent = decoded;
      setStatus('二维码解析成功');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.lastOutput = '';
      state.qrTool.decoded = '';
      result.textContent = message;
      setStatus(message, true);
    }
  });
  card.append(title, hint, selectButton, file);
  body.append(card, result);
  panel.append(modes, body);
  elements.output.replaceChildren(panel);
}

async function updateQrGenerateResult(container) {
  container.replaceChildren();
  const text = state.qrTool.text.trim();
  if (!text) {
    state.lastOutput = '';
    const warning = document.createElement('div');
    warning.className = 'qr-warning';
    warning.textContent = '请输入要生成二维码的文本或链接';
    container.append(warning);
    return;
  }

  if (text.length > GENERAL_LIVE_RUN_CHAR_LIMIT) {
    const message = `内容过大：${formatCharCount(text.length)}，请缩小后再生成二维码。`;
    state.lastOutput = message;
    const warning = document.createElement('div');
    warning.className = 'qr-warning';
    warning.textContent = message;
    container.append(warning);
    return;
  }

  const loading = document.createElement('div');
  loading.className = 'qr-warning';
  loading.textContent = '正在生成二维码...';
  container.append(loading);
  try {
    const svg = await window.toolkit.qrGenerate(text, {
      errorCorrectionLevel: state.qrTool.errorCorrectionLevel,
      width: state.qrTool.size,
      margin: state.qrTool.margin
    });
    state.qrTool.svg = svg;
    state.lastOutput = text;
    container.replaceChildren(renderQrPreview(svg, text));
    setStatus('二维码已生成');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.lastOutput = message;
    const warning = document.createElement('div');
    warning.className = 'qr-warning';
    warning.textContent = message;
    container.replaceChildren(warning);
    setStatus(message, true);
  }
}

function renderQrPreview(svg, text) {
  const panel = document.createElement('div');
  panel.className = 'qr-generated-card';
  const preview = document.createElement('div');
  preview.className = 'qr-preview';
  preview.innerHTML = svg;
  const meta = document.createElement('div');
  meta.className = 'qr-meta';
  meta.innerHTML = `
    <span>内容长度 ${text.length} 字符</span>
    <span>纠错 ${escapeHtml(state.qrTool.errorCorrectionLevel)} · ${state.qrTool.size}px · 边距 ${state.qrTool.margin}</span>
  `;
  const code = document.createElement('code');
  code.textContent = text;
  panel.append(preview, meta, code);
  return panel;
}

function renderMockGenerator() {
  const panel = document.createElement('div');
  panel.className = 'mock-tool';

  const config = document.createElement('div');
  config.className = 'mock-config-card';
  const types = document.createElement('div');
  types.className = 'mock-type-grid';
  [
    ['uuid', 'UUID', '标准 v4 UUID'],
    ['phone', '手机号', '中国大陆手机号'],
    ['idcard', '身份证', '符合校验码规则'],
    ['name', '姓名', '虚拟中文姓名'],
    ['email', '邮箱', 'example.com 邮箱'],
    ['string', '随机串', '字母数字组合']
  ].forEach(([type, title, desc]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mock-type${state.mockGenerator.type === type ? ' active' : ''}`;
    button.innerHTML = `<strong>${title}</strong><span>${desc}</span>`;
    button.addEventListener('click', () => {
      state.mockGenerator.type = type;
      generateMockRows();
      renderMockGenerator();
    });
    types.append(button);
  });

  const controls = document.createElement('div');
  controls.className = 'mock-controls';
  const count = document.createElement('input');
  count.type = 'number';
  count.min = '1';
  count.max = '200';
  count.value = String(state.mockGenerator.count);
  count.addEventListener('change', () => {
    state.mockGenerator.count = clampNumber(count.value, 1, 200);
    generateMockRows();
    renderMockGenerator();
  });

  const length = document.createElement('input');
  length.type = 'number';
  length.min = '1';
  length.max = '128';
  length.value = String(state.mockGenerator.length);
  length.disabled = state.mockGenerator.type !== 'string';
  length.addEventListener('change', () => {
    state.mockGenerator.length = clampNumber(length.value, 1, 128);
    generateMockRows();
    renderMockGenerator();
  });

  const regenerate = document.createElement('button');
  regenerate.type = 'button';
  regenerate.className = 'primary-button';
  regenerate.textContent = '重新生成';
  regenerate.addEventListener('click', () => {
    generateMockRows();
    renderMockGenerator();
  });

  controls.append(labelWrap('数量', count), labelWrap('随机串长度', length), regenerate);
  config.append(types, controls);

  if (state.mockGenerator.rows.length === 0) generateMockRows();
  const result = renderMockResult();
  panel.append(config, result);
  elements.output.replaceChildren(panel);
}

function generateMockRows() {
  state.mockGenerator.count = clampNumber(state.mockGenerator.count, 1, 200);
  state.mockGenerator.length = clampNumber(state.mockGenerator.length, 1, 128);
  const output = generateMock(state.mockGenerator.type, {
    count: state.mockGenerator.count,
    length: state.mockGenerator.length
  });
  state.mockGenerator.rows = output.split('\n').filter(Boolean);
  state.lastOutput = state.mockGenerator.rows.join('\n');
  setStatus('随机数据已生成');
}

function renderMockResult() {
  const panel = document.createElement('div');
  panel.className = 'mock-result-card';
  const head = document.createElement('div');
  head.className = 'mock-result-head';
  head.innerHTML = `<strong>生成结果</strong><span>${state.mockGenerator.rows.length} 条</span>`;
  const copyAll = document.createElement('button');
  copyAll.type = 'button';
  copyAll.className = 'secondary-button';
  copyAll.textContent = '复制全部';
  copyAll.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(state.mockGenerator.rows.join('\n'));
    setStatus('已复制全部随机数据');
  });
  head.append(copyAll);

  const list = document.createElement('div');
  list.className = 'mock-row-list';
  state.mockGenerator.rows.forEach((value, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'mock-row';
    row.innerHTML = `<span>#${index + 1}</span><code></code>`;
    row.querySelector('code').textContent = value;
    row.addEventListener('click', async () => {
      await window.toolkit.writeClipboard(value);
      setStatus(`已复制第 ${index + 1} 条`);
    });
    list.append(row);
  });
  panel.append(head, list);
  return panel;
}

function renderUuidTool() {
  const panel = document.createElement('div');
  panel.className = 'uuid-tool';

  const config = document.createElement('section');
  config.className = 'uuid-config-card';
  const head = document.createElement('div');
  head.className = 'uuid-head';
  head.innerHTML = '<strong>UUID v4 批量生成</strong><span>适合接口主键、幂等号、测试数据和配置占位</span>';

  const controls = document.createElement('div');
  controls.className = 'uuid-controls';
  const count = document.createElement('input');
  count.type = 'number';
  count.min = '1';
  count.max = '200';
  count.value = String(state.uuidTool.count);
  count.addEventListener('change', () => {
    state.uuidTool.count = clampNumber(count.value, 1, 200);
    void generateUuidRows({ rerender: true, showLoading: true });
  });
  controls.append(labelWrap('数量', count));

  const casing = document.createElement('div');
  casing.className = 'uuid-segment';
  [
    [false, '小写'],
    [true, '大写']
  ].forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = state.uuidTool.uppercase === value ? 'active' : '';
    button.textContent = label;
    button.addEventListener('click', () => {
      state.uuidTool.uppercase = value;
      refreshUuidFormat();
      renderUuidTool();
    });
    casing.append(button);
  });

  const hyphen = document.createElement('div');
  hyphen.className = 'uuid-segment';
  [
    [true, '带横杠'],
    [false, '无横杠']
  ].forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = state.uuidTool.hyphenated === value ? 'active' : '';
    button.textContent = label;
    button.addEventListener('click', () => {
      state.uuidTool.hyphenated = value;
      refreshUuidFormat();
      renderUuidTool();
    });
    hyphen.append(button);
  });

  controls.append(labelWrap('大小写', casing), labelWrap('格式', hyphen));

  const prefixCard = document.createElement('div');
  prefixCard.className = 'uuid-prefix-card';
  const prefixTitle = document.createElement('span');
  prefixTitle.textContent = '前缀';
  const prefixChoices = document.createElement('div');
  prefixChoices.className = 'uuid-prefix-options';
  [
    ['', '无'],
    ['urn:uuid:', 'URN'],
    [state.uuidTool.customPrefix || 'id_', '自定义']
  ].forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    const isCustom = label === '自定义';
    const active = isCustom
      ? state.uuidTool.prefix !== '' && state.uuidTool.prefix !== 'urn:uuid:'
      : state.uuidTool.prefix === value;
    button.className = active ? 'active' : '';
    button.textContent = label;
    button.addEventListener('click', () => {
      if (isCustom) {
        state.uuidTool.customPrefix = state.uuidTool.customPrefix || 'id_';
        state.uuidTool.prefix = state.uuidTool.customPrefix;
      } else {
        state.uuidTool.prefix = value;
      }
      refreshUuidFormat();
      renderUuidTool();
    });
    prefixChoices.append(button);
  });
  const customPrefix = document.createElement('input');
  customPrefix.value = state.uuidTool.customPrefix;
  customPrefix.placeholder = 'id_';
  customPrefix.addEventListener('input', () => {
    state.uuidTool.customPrefix = customPrefix.value;
    if (state.uuidTool.prefix !== '' && state.uuidTool.prefix !== 'urn:uuid:') {
      state.uuidTool.prefix = customPrefix.value;
      refreshUuidFormat();
      renderUuidResult(resultCard);
    }
  });
  prefixCard.append(prefixTitle, prefixChoices, customPrefix);

  const actions = document.createElement('div');
  actions.className = 'uuid-actions';
  const regenerate = document.createElement('button');
  regenerate.type = 'button';
  regenerate.className = 'uuid-generate-button';
  regenerate.textContent = '重新生成';
  regenerate.addEventListener('click', () => {
    void generateUuidRows({ rerender: true, showLoading: true });
  });
  const copyAll = document.createElement('button');
  copyAll.type = 'button';
  copyAll.className = 'uuid-copy-button';
  copyAll.textContent = '复制全部';
  copyAll.disabled = state.uuidTool.rows.length === 0;
  copyAll.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(state.uuidTool.rows.join('\n'));
    setStatus('已复制全部 UUID');
  });
  actions.append(regenerate, copyAll);

  config.append(head, controls, prefixCard, actions);

  const resultCard = document.createElement('section');
  resultCard.className = 'uuid-result-card';
  panel.append(config, resultCard);
  elements.output.replaceChildren(panel);

  if (state.uuidTool.rows.length === 0 && !state.uuidTool.generating) {
    void generateUuidRows({ rerender: true, showLoading: true });
  }
  renderUuidResult(resultCard);
}

async function generateUuidRows({ rerender = false, showLoading = false } = {}) {
  state.uuidTool.count = clampNumber(state.uuidTool.count, 1, 200);
  state.uuidTool.generating = true;
  if (showLoading && rerender && activeTool().id === 'uuid') renderUuidTool();
  try {
    const rawRows = await Promise.all(
      Array.from({ length: state.uuidTool.count }, () => window.toolkit.uuid())
    );
    const result = formatUuidList(rawRows, {
      uppercase: state.uuidTool.uppercase,
      hyphenated: state.uuidTool.hyphenated,
      prefix: state.uuidTool.prefix
    });
    state.uuidTool.rawRows = rawRows;
    state.uuidTool.rows = result.data.rows;
    state.lastOutput = result.value;
    setStatus(`已生成 ${state.uuidTool.rows.length} 个 UUID`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.uuidTool.rawRows = [];
    state.uuidTool.rows = [];
    state.lastOutput = message;
    setStatus(message, true);
  } finally {
    state.uuidTool.generating = false;
    if (rerender && activeTool().id === 'uuid') renderUuidTool();
  }
}

function refreshUuidFormat() {
  if (state.uuidTool.rawRows.length === 0) return;
  const result = formatUuidList(state.uuidTool.rawRows, {
    uppercase: state.uuidTool.uppercase,
    hyphenated: state.uuidTool.hyphenated,
    prefix: state.uuidTool.prefix
  });
  state.uuidTool.rows = result.data.rows;
  state.lastOutput = result.value;
  setStatus('UUID 格式已更新');
}

function renderUuidResult(panel) {
  panel.replaceChildren();
  const head = document.createElement('div');
  head.className = 'uuid-result-head';
  head.innerHTML = `<strong>生成结果</strong><span>${state.uuidTool.rows.length} 条</span>`;

  const preview = document.createElement('div');
  preview.className = 'uuid-preview-strip';
  [
    ['版本', 'v4'],
    ['数量', String(state.uuidTool.count)],
    ['格式', state.uuidTool.hyphenated ? '8-4-4-4-12' : '32 位'],
    ['前缀', state.uuidTool.prefix || '无']
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.innerHTML = `<span>${label}</span><strong></strong>`;
    item.querySelector('strong').textContent = value;
    preview.append(item);
  });

  const list = document.createElement('div');
  list.className = 'uuid-row-list';
  if (state.uuidTool.generating) {
    const loading = document.createElement('div');
    loading.className = 'uuid-empty';
    loading.textContent = '正在生成 UUID...';
    list.append(loading);
  } else if (state.uuidTool.rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'uuid-empty';
    empty.textContent = '点击重新生成后会在这里展示结果';
    list.append(empty);
  } else {
    state.uuidTool.rows.forEach((value, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'uuid-row';
      row.innerHTML = `<span>#${index + 1}</span><code></code><small>复制</small>`;
      row.querySelector('code').textContent = value;
      row.addEventListener('click', async () => {
        await window.toolkit.writeClipboard(value);
        setStatus(`已复制第 ${index + 1} 个 UUID`);
      });
      list.append(row);
    });
  }

  panel.append(head, preview, list);
}

function renderRsaKeygen() {
  const panel = document.createElement('div');
  panel.className = 'rsa-tool';

  const config = document.createElement('section');
  config.className = 'rsa-config-card';
  const head = document.createElement('div');
  head.className = 'rsa-head';
  head.innerHTML = '<strong>RSA 密钥对</strong><span>生成本地测试、接口联调和加密配置需要的 PEM 公私钥</span>';

  const bits = document.createElement('div');
  bits.className = 'rsa-choice-grid';
  [
    [1024, '1024', '兼容旧系统'],
    [2048, '2048', '常用推荐'],
    [4096, '4096', '更高强度']
  ].forEach(([value, title, desc]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = state.rsaTool.bits === value ? 'active' : '';
    button.disabled = state.rsaTool.generating;
    button.innerHTML = `<strong>${title}</strong><span>${desc}</span>`;
    button.addEventListener('click', () => {
      state.rsaTool.bits = value;
      state.rsaTool.result = null;
      void generateRsaKeyPair({ rerender: true });
    });
    bits.append(button);
  });

  const format = document.createElement('div');
  format.className = 'rsa-format';
  [
    ['pkcs8', 'PKCS#8', '现代通用私钥格式'],
    ['pkcs1', 'PKCS#1', '传统 RSA 私钥格式']
  ].forEach(([value, title, desc]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = state.rsaTool.format === value ? 'active' : '';
    button.disabled = state.rsaTool.generating;
    button.innerHTML = `<strong>${title}</strong><span>${desc}</span>`;
    button.addEventListener('click', () => {
      state.rsaTool.format = value;
      state.rsaTool.result = null;
      void generateRsaKeyPair({ rerender: true });
    });
    format.append(button);
  });

  const meta = document.createElement('div');
  meta.className = 'rsa-meta-grid';
  [
    ['位数', `${state.rsaTool.bits} bit`],
    ['私钥', state.rsaTool.format.toUpperCase()],
    ['公钥', 'SPKI PEM']
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.innerHTML = `<span>${label}</span><strong></strong>`;
    item.querySelector('strong').textContent = value;
    meta.append(item);
  });

  const actions = document.createElement('div');
  actions.className = 'rsa-actions';
  const generate = document.createElement('button');
  generate.type = 'button';
  generate.className = 'rsa-generate-button';
  generate.textContent = state.rsaTool.generating ? '生成中...' : '重新生成';
  generate.disabled = state.rsaTool.generating;
  generate.addEventListener('click', () => {
    void generateRsaKeyPair({ rerender: true });
  });
  const copyAll = document.createElement('button');
  copyAll.type = 'button';
  copyAll.className = 'rsa-copy-button';
  copyAll.textContent = '复制全部';
  copyAll.disabled = !state.rsaTool.result || state.rsaTool.generating;
  copyAll.addEventListener('click', async () => {
    if (!state.rsaTool.result) return;
    await window.toolkit.writeClipboard(state.rsaTool.result.value);
    setStatus('已复制 RSA 公私钥');
  });
  actions.append(generate, copyAll);

  config.append(head, bits, format, meta, actions);

  const result = document.createElement('section');
  result.className = 'rsa-result-card';
  panel.append(config, result);
  elements.output.replaceChildren(panel);

  if (!state.rsaTool.result && !state.rsaTool.generating && !state.rsaTool.error) {
    void generateRsaKeyPair({ rerender: true });
  }
  renderRsaResult(result);
}

async function generateRsaKeyPair({ rerender = false } = {}) {
  state.rsaTool.generating = true;
  state.rsaTool.error = '';
  setStatus('正在生成 RSA 密钥对...');
  if (rerender && activeTool().id === 'rsa') renderRsaKeygen();
  try {
    const pem = await window.toolkit.rsaGenerate({
      bits: state.rsaTool.bits,
      format: state.rsaTool.format
    });
    const parsed = parseRsaKeyPairPem(pem);
    if (!parsed.ok) throw new Error(parsed.error);
    state.rsaTool.result = parsed;
    state.lastOutput = parsed.value;
    setStatus(`RSA ${state.rsaTool.bits} 位密钥对已生成`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.rsaTool.result = null;
    state.rsaTool.error = message;
    state.lastOutput = message;
    setStatus(message, true);
  } finally {
    state.rsaTool.generating = false;
    if (rerender && activeTool().id === 'rsa') renderRsaKeygen();
  }
}

function renderRsaResult(panel) {
  panel.replaceChildren();
  const head = document.createElement('div');
  head.className = 'rsa-result-head';
  head.innerHTML = '<strong>生成结果</strong><span>仅做本地生成，请按实际安全策略保存私钥</span>';
  panel.append(head);

  if (state.rsaTool.generating) {
    const loading = document.createElement('div');
    loading.className = 'rsa-empty';
    loading.textContent = '正在生成密钥对，4096 位可能需要几秒...';
    panel.append(loading);
    return;
  }

  if (state.rsaTool.error) {
    const warning = document.createElement('div');
    warning.className = 'rsa-warning';
    warning.textContent = state.rsaTool.error;
    panel.append(warning);
    return;
  }

  const parsed = state.rsaTool.result;
  if (!parsed) {
    const empty = document.createElement('div');
    empty.className = 'rsa-empty';
    empty.textContent = '密钥生成后会在这里分开展示公钥和私钥';
    panel.append(empty);
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'rsa-summary-strip';
  [
    ['公钥行数', String(parsed.data.publicLineCount)],
    ['私钥行数', String(parsed.data.privateLineCount)],
    ['私钥格式', parsed.data.privateType.toUpperCase()]
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.innerHTML = `<span>${label}</span><strong></strong>`;
    item.querySelector('strong').textContent = value;
    summary.append(item);
  });

  const keys = document.createElement('div');
  keys.className = 'rsa-key-grid';
  keys.append(
    renderRsaKeyBlock('Public Key', parsed.data.publicKey, '已复制 RSA 公钥'),
    renderRsaKeyBlock('Private Key', parsed.data.privateKey, '已复制 RSA 私钥', true)
  );
  panel.append(summary, keys);
}

function renderRsaKeyBlock(title, value, copiedMessage, privateKey = false) {
  const block = document.createElement('div');
  block.className = `rsa-key-block${privateKey ? ' private' : ''}`;
  const head = document.createElement('div');
  head.className = 'rsa-key-head';
  const label = document.createElement('strong');
  label.textContent = title;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = '复制';
  copy.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(value);
    setStatus(copiedMessage);
  });
  head.append(label, copy);
  const code = document.createElement('code');
  code.textContent = value;
  block.append(head, code);
  return block;
}

function renderSymmetricCryptoTool() {
  const panel = document.createElement('div');
  panel.className = 'symmetric-tool';

  const config = document.createElement('section');
  config.className = 'symmetric-config-card';
  const head = document.createElement('div');
  head.className = 'symmetric-head';
  head.innerHTML = '<strong>对称加密解密</strong><span>AES / DES / RC4，本地完成加解密，适合接口联调和配置验证</span>';

  const action = document.createElement('div');
  action.className = 'symmetric-switch';
  [
    ['encrypt', '加密'],
    ['decrypt', '解密']
  ].forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = state.symmetricTool.action === value ? 'active' : '';
    button.textContent = label;
    button.addEventListener('click', () => {
      state.symmetricTool.action = value;
      state.symmetricTool.result = '';
      state.symmetricTool.error = '';
      renderSymmetricCryptoTool();
    });
    action.append(button);
  });

  const algorithms = document.createElement('div');
  algorithms.className = 'symmetric-algorithms';
  [
    ['AES', 'AES', '常用块加密'],
    ['DES', 'DES', '旧系统兼容'],
    ['RC4', 'RC4', '流加密兼容']
  ].forEach(([value, title, desc]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = state.symmetricTool.algorithm === value ? 'active' : '';
    button.innerHTML = `<strong>${title}</strong><span>${desc}</span>`;
    button.addEventListener('click', () => {
      state.symmetricTool.algorithm = value;
      state.symmetricTool.result = '';
      state.symmetricTool.error = '';
      renderSymmetricCryptoTool();
    });
    algorithms.append(button);
  });

  const modeControls = document.createElement('div');
  modeControls.className = `symmetric-mode-grid${state.symmetricTool.algorithm === 'RC4' ? ' disabled' : ''}`;
  const mode = document.createElement('div');
  mode.className = 'symmetric-segment';
  [
    ['CBC', 'CBC'],
    ['ECB', 'ECB']
  ].forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = state.symmetricTool.algorithm === 'RC4';
    button.className = state.symmetricTool.mode === value ? 'active' : '';
    button.textContent = label;
    button.addEventListener('click', () => {
      state.symmetricTool.mode = value;
      state.symmetricTool.result = '';
      state.symmetricTool.error = '';
      renderSymmetricCryptoTool();
    });
    mode.append(button);
  });

  const padding = document.createElement('div');
  padding.className = 'symmetric-segment';
  [
    ['Pkcs7', 'Pkcs7'],
    ['NoPadding', 'NoPadding']
  ].forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = state.symmetricTool.algorithm === 'RC4';
    button.className = state.symmetricTool.padding === value ? 'active' : '';
    button.textContent = label;
    button.addEventListener('click', () => {
      state.symmetricTool.padding = value;
      state.symmetricTool.result = '';
      state.symmetricTool.error = '';
      renderSymmetricCryptoTool();
    });
    padding.append(button);
  });
  modeControls.append(labelWrap('Mode', mode), labelWrap('Padding', padding));

  const keyGrid = document.createElement('div');
  keyGrid.className = 'symmetric-key-grid';
  const key = document.createElement('input');
  key.value = state.symmetricTool.key;
  key.placeholder = 'Key';
  key.spellcheck = false;
  key.addEventListener('input', () => {
    state.symmetricTool.key = key.value;
    scheduleSymmetricRun(resultCard);
  });
  const iv = document.createElement('input');
  iv.value = state.symmetricTool.iv;
  iv.placeholder = state.symmetricTool.mode === 'ECB' || state.symmetricTool.algorithm === 'RC4' ? '当前模式不使用 IV' : 'IV';
  iv.disabled = state.symmetricTool.mode === 'ECB' || state.symmetricTool.algorithm === 'RC4';
  iv.spellcheck = false;
  iv.addEventListener('input', () => {
    state.symmetricTool.iv = iv.value;
    scheduleSymmetricRun(resultCard);
  });
  keyGrid.append(labelWrap('Key', key), labelWrap('IV', iv));

  const body = document.createElement('textarea');
  body.value = state.symmetricTool.value;
  body.placeholder = state.symmetricTool.action === 'encrypt' ? '输入明文' : '输入密文';
  body.spellcheck = false;
  body.addEventListener('input', () => {
    state.symmetricTool.value = body.value;
    scheduleSymmetricRun(resultCard);
  });

  const actions = document.createElement('div');
  actions.className = 'symmetric-actions';
  const run = document.createElement('button');
  run.type = 'button';
  run.className = 'symmetric-run-button';
  run.textContent = state.symmetricTool.action === 'encrypt' ? '加密' : '解密';
  run.addEventListener('click', () => {
    void updateSymmetricResult(resultCard);
  });
  const swap = document.createElement('button');
  swap.type = 'button';
  swap.className = 'symmetric-copy-button';
  swap.textContent = '结果转输入';
  swap.addEventListener('click', () => {
    useSymmetricResultAsInput();
  });
  actions.append(run, swap);

  config.append(head, action, algorithms, modeControls, keyGrid, body, actions);

  const resultCard = document.createElement('section');
  resultCard.className = 'symmetric-result-card';
  panel.append(config, resultCard);
  elements.output.replaceChildren(panel);
  renderSymmetricResult(resultCard);
  if (!state.symmetricTool.result && !state.symmetricTool.error) scheduleSymmetricRun(resultCard, 0);
}

function scheduleSymmetricRun(container, delay = 180) {
  window.clearTimeout(state.symmetricTool.runTimer);
  state.symmetricTool.runTimer = window.setTimeout(() => {
    void updateSymmetricResult(container);
  }, delay);
}

async function updateSymmetricResult(container) {
  const sequence = ++state.symmetricTool.sequence;
  const payload = {
    action: state.symmetricTool.action,
    algorithm: state.symmetricTool.algorithm,
    mode: state.symmetricTool.mode,
    padding: state.symmetricTool.padding,
    key: state.symmetricTool.key,
    iv: state.symmetricTool.iv,
    value: state.symmetricTool.value
  };
  if (!payload.key) {
    state.symmetricTool.result = '';
    state.symmetricTool.error = '请输入 Key';
    state.lastOutput = '';
    renderSymmetricResult(container);
    setStatus('请输入 Key', true);
    return;
  }
  try {
    const output = await window.toolkit.symmetricCrypto(payload);
    if (sequence !== state.symmetricTool.sequence) return;
    state.symmetricTool.result = output;
    state.symmetricTool.error = '';
    state.lastOutput = output;
    renderSymmetricResult(container);
    setStatus(state.symmetricTool.action === 'encrypt' ? '加密完成' : '解密完成');
  } catch (error) {
    if (sequence !== state.symmetricTool.sequence) return;
    const message = error instanceof Error ? error.message : String(error);
    state.symmetricTool.result = '';
    state.symmetricTool.error = message;
    state.lastOutput = message;
    renderSymmetricResult(container);
    setStatus(message, true);
  }
}

function renderSymmetricResult(panel) {
  panel.replaceChildren();
  const head = document.createElement('div');
  head.className = 'symmetric-result-head';
  head.innerHTML = `<strong>${state.symmetricTool.action === 'encrypt' ? '密文结果' : '明文结果'}</strong><span>${escapeHtml(state.symmetricTool.algorithm)} · ${escapeHtml(state.symmetricTool.algorithm === 'RC4' ? 'Stream' : state.symmetricTool.mode)} · ${escapeHtml(state.symmetricTool.algorithm === 'RC4' ? 'RC4' : state.symmetricTool.padding)}</span>`;
  panel.append(head);

  if (state.symmetricTool.error) {
    const warning = document.createElement('div');
    warning.className = 'symmetric-warning';
    warning.textContent = state.symmetricTool.error;
    panel.append(warning);
    return;
  }

  if (!state.symmetricTool.result) {
    const empty = document.createElement('div');
    empty.className = 'symmetric-empty';
    empty.textContent = '输入内容和 Key 后会自动生成结果';
    panel.append(empty);
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'symmetric-summary-strip';
  [
    ['输入长度', `${state.symmetricTool.value.length} 字符`],
    ['输出长度', `${state.symmetricTool.result.length} 字符`],
    ['模式', state.symmetricTool.action === 'encrypt' ? '加密' : '解密']
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.innerHTML = `<span>${label}</span><strong></strong>`;
    item.querySelector('strong').textContent = value;
    summary.append(item);
  });

  const output = document.createElement('div');
  output.className = 'symmetric-output-block';
  const outputHead = document.createElement('div');
  outputHead.className = 'symmetric-output-head';
  const label = document.createElement('strong');
  label.textContent = state.symmetricTool.action === 'encrypt' ? 'Cipher Text' : 'Plain Text';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = '复制';
  copy.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(state.symmetricTool.result);
    setStatus('已复制结果');
  });
  const useAsInput = document.createElement('button');
  useAsInput.type = 'button';
  useAsInput.textContent = '转为输入';
  useAsInput.addEventListener('click', () => {
    useSymmetricResultAsInput();
  });
  outputHead.append(label, useAsInput, copy);
  const code = document.createElement('code');
  code.textContent = state.symmetricTool.result;
  output.append(outputHead, code);
  panel.append(summary, output);
}

function useSymmetricResultAsInput() {
  if (!state.symmetricTool.result) return;
  state.symmetricTool.value = state.symmetricTool.result;
  state.symmetricTool.action = state.symmetricTool.action === 'encrypt' ? 'decrypt' : 'encrypt';
  state.symmetricTool.result = '';
  state.symmetricTool.error = '';
  renderSymmetricCryptoTool();
}

function renderHmacSigner() {
  const panel = document.createElement('div');
  panel.className = 'hmac-tool';

  const config = document.createElement('section');
  config.className = 'hmac-input-card';
  const head = document.createElement('div');
  head.className = 'hmac-head';
  head.innerHTML = '<strong>HMAC 签名</strong><span>接口签名、Webhook 校验、请求串摘要快速生成</span>';

  const algorithms = document.createElement('div');
  algorithms.className = 'hmac-algorithms';
  [
    ['sha256', 'SHA256', 'API 签名常用'],
    ['sha1', 'SHA1', '兼容旧接口'],
    ['sha512', 'SHA512', '长摘要'],
    ['md5', 'MD5', '旧系统兼容']
  ].forEach(([value, title, desc]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = state.hmacTool.algorithm === value ? 'active' : '';
    button.innerHTML = `<strong>${title}</strong><span>${desc}</span>`;
    button.addEventListener('click', () => {
      state.hmacTool.algorithm = value;
      state.hmacTool.result = null;
      state.hmacTool.error = '';
      renderHmacSigner();
    });
    algorithms.append(button);
  });

  const secret = document.createElement('input');
  secret.value = state.hmacTool.secret;
  secret.placeholder = 'secret-key';
  secret.spellcheck = false;
  secret.addEventListener('input', () => {
    state.hmacTool.secret = secret.value;
    scheduleHmacRun(result);
  });

  const payload = document.createElement('textarea');
  payload.value = state.hmacTool.payload;
  payload.placeholder = 'method=GET&path=/api/orders&timestamp=1717999200';
  payload.spellcheck = false;
  payload.addEventListener('input', () => {
    state.hmacTool.payload = payload.value;
    scheduleHmacRun(result);
  });

  const fields = document.createElement('div');
  fields.className = 'hmac-fields';
  fields.append(labelWrap('密钥', secret), labelWrap('待签名内容', payload));

  const actions = document.createElement('div');
  actions.className = 'hmac-actions';
  const run = document.createElement('button');
  run.type = 'button';
  run.className = 'hmac-run-button';
  run.textContent = '生成签名';
  run.addEventListener('click', () => {
    void updateHmacResult(result);
  });
  const copyHex = document.createElement('button');
  copyHex.type = 'button';
  copyHex.className = 'hmac-copy-button';
  copyHex.textContent = '复制 Hex';
  copyHex.disabled = !state.hmacTool.result;
  copyHex.addEventListener('click', async () => {
    if (!state.hmacTool.result) return;
    await window.toolkit.writeClipboard(state.hmacTool.result.hex);
    setStatus('已复制 HMAC Hex');
  });
  actions.append(run, copyHex);

  config.append(head, algorithms, fields, actions);

  const result = document.createElement('section');
  result.className = 'hmac-result-card';
  panel.append(config, result);
  elements.output.replaceChildren(panel);
  renderHmacResult(result);
  if (!state.hmacTool.result && !state.hmacTool.error) scheduleHmacRun(result, 0);
}

function scheduleHmacRun(container, delay = 180) {
  window.clearTimeout(state.hmacTool.runTimer);
  state.hmacTool.runTimer = window.setTimeout(() => {
    void updateHmacResult(container);
  }, delay);
}

async function updateHmacResult(container) {
  const sequence = ++state.hmacTool.sequence;
  const secret = state.hmacTool.secret;
  const payload = state.hmacTool.payload;
  if (!secret) {
    state.hmacTool.result = null;
    state.hmacTool.error = '请输入密钥';
    state.lastOutput = '';
    renderHmacResult(container);
    setStatus('请输入 HMAC 密钥', true);
    return;
  }
  try {
    const hex = await window.toolkit.hmac(state.hmacTool.algorithm, secret, payload);
    if (sequence !== state.hmacTool.sequence) return;
    const described = describeHmacDigest(hex);
    if (!described.ok) throw new Error(described.error);
    state.hmacTool.result = {
      algorithm: state.hmacTool.algorithm,
      secretLength: secret.length,
      payloadLength: payload.length,
      ...described.data
    };
    state.hmacTool.error = '';
    state.lastOutput = described.value;
    renderHmacResult(container);
    setStatus('HMAC 签名已生成');
  } catch (error) {
    if (sequence !== state.hmacTool.sequence) return;
    const message = error instanceof Error ? error.message : String(error);
    state.hmacTool.result = null;
    state.hmacTool.error = message;
    state.lastOutput = message;
    renderHmacResult(container);
    setStatus(message, true);
  }
}

function renderHmacResult(panel) {
  panel.replaceChildren();
  const head = document.createElement('div');
  head.className = 'hmac-result-head';
  head.innerHTML = '<strong>签名结果</strong><span>Hex / Base64 可直接复制</span>';
  panel.append(head);

  if (state.hmacTool.error) {
    const warning = document.createElement('div');
    warning.className = 'hmac-warning';
    warning.textContent = state.hmacTool.error;
    panel.append(warning);
    return;
  }

  const result = state.hmacTool.result;
  if (!result) {
    const empty = document.createElement('div');
    empty.className = 'hmac-empty';
    empty.textContent = '输入密钥和待签名内容后会自动生成 HMAC';
    panel.append(empty);
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'hmac-summary-strip';
  [
    ['算法', `HMAC-${result.algorithm.toUpperCase()}`],
    ['摘要长度', `${result.bitLength} bit`],
    ['内容长度', `${result.payloadLength} 字符`],
    ['密钥长度', `${result.secretLength} 字符`]
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.innerHTML = `<span>${label}</span><strong></strong>`;
    item.querySelector('strong').textContent = value;
    summary.append(item);
  });

  const outputs = document.createElement('div');
  outputs.className = 'hmac-output-grid';
  outputs.append(
    renderHmacOutputBlock('Hex', result.hex, '已复制 HMAC Hex'),
    renderHmacOutputBlock('Base64', result.base64, '已复制 HMAC Base64')
  );
  panel.append(summary, outputs);
}

function renderHmacOutputBlock(title, value, copiedMessage) {
  const block = document.createElement('div');
  block.className = 'hmac-output-block';
  const head = document.createElement('div');
  head.className = 'hmac-output-head';
  const label = document.createElement('strong');
  label.textContent = title;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = '复制';
  copy.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(value);
    setStatus(copiedMessage);
  });
  head.append(label, copy);
  const code = document.createElement('code');
  code.textContent = value;
  block.append(head, code);
  return block;
}

function renderTOTPTool() {
  const data = state.totpTool;
  window.clearTimeout(data.refreshTimer);
  if (!data.loaded && !data.loading) {
    loadTOTPAccounts();
  }

  const panel = document.createElement('div');
  panel.className = 'totp-tool';

  const summary = document.createElement('div');
  summary.className = 'totp-summary-strip';
  summary.append(
    renderTOTPMetric('账号', String(data.accounts.length)),
    renderTOTPStorageMetric(data.storagePath),
    renderTOTPMetric('刷新', data.accounts.length > 0 ? `${Math.min(...data.accounts.map((account) => account.remaining))}s` : '-')
  );

  if (data.error) {
    const warning = document.createElement('div');
    warning.className = 'totp-warning';
    warning.textContent = data.error;
    panel.append(summary, warning);
  }

  const body = document.createElement('div');
  body.className = 'totp-body';
  const side = document.createElement('div');
  side.className = 'totp-side';
  side.append(renderTOTPForm(), renderTOTPTempPanel());
  body.append(renderTOTPAccountsPanel(), side);
  panel.append(summary, body);

  state.lastOutput = data.accounts.map((account) => `${account.displayName}\t${account.code}\t${account.remaining}s`).join('\n');
  elements.output.replaceChildren(panel);
  scheduleTOTPRefresh();
}

function renderTOTPMetric(labelText, value) {
  const item = document.createElement('div');
  item.className = 'totp-summary-card';
  const label = document.createElement('span');
  label.textContent = labelText;
  const strong = document.createElement('strong');
  strong.textContent = value;
  item.append(label, strong);
  return item;
}

function renderTOTPStorageMetric(storagePath) {
  const item = document.createElement('div');
  item.className = 'totp-storage-metric';
  const head = document.createElement('div');
  head.className = 'totp-storage-head';
  const label = document.createElement('span');
  label.textContent = '存储';
  const change = document.createElement('button');
  change.type = 'button';
  change.className = 'secondary-button';
  change.textContent = '更改位置';
  change.addEventListener('click', () => chooseTOTPStorage());
  head.append(label, change);
  const value = document.createElement('strong');
  value.textContent = storagePath || '-';
  value.title = storagePath || '';
  item.append(head, value);
  return item;
}

function renderTOTPTempPanel() {
  const data = state.totpTool;
  const card = document.createElement('div');
  card.className = 'totp-temp-card';

  const title = document.createElement('strong');
  title.textContent = '临时密钥取码';
  const input = document.createElement('textarea');
  input.value = data.tempInput;
  input.placeholder = '粘贴 Base32 Secret 或 otpauth://totp/... 链接，不会保存';
  input.spellcheck = false;
  input.addEventListener('input', () => {
    data.tempInput = input.value;
  });

  const digits = renderTOTPNumberInput(data.tempDigits, 6, 8, (value) => {
    data.tempDigits = value;
  });
  const period = renderTOTPNumberInput(data.tempPeriod, 1, 300, (value) => {
    data.tempPeriod = value;
  });
  const run = document.createElement('button');
  run.type = 'button';
  run.className = 'primary-button';
  run.textContent = '生成';
  run.addEventListener('click', () => generateTOTPTemp());

  const controls = document.createElement('div');
  controls.className = 'totp-form-row';
  controls.append(labelWrap('位数', digits), labelWrap('周期', period), run);

  const result = document.createElement('button');
  result.type = 'button';
  result.className = 'totp-code-card';
  if (data.tempResult) {
    result.innerHTML = `<span>${escapeHtml(data.tempResult.displayName || '临时代码')}</span><strong>${escapeHtml(data.tempResult.code)}</strong><small>${data.tempResult.remaining}s</small>`;
    result.addEventListener('click', async () => {
      await window.toolkit.writeClipboard(data.tempResult.code);
      setStatus('临时验证码已复制');
    });
  } else {
    result.innerHTML = '<span>临时代码</span><strong>------</strong><small>点击生成</small>';
  }

  card.append(title, input, controls, result);
  return card;
}

function renderTOTPForm() {
  const data = state.totpTool;
  const form = data.form;
  const card = document.createElement('div');
  card.className = 'totp-form-card';

  const titleRow = document.createElement('div');
  titleRow.className = 'totp-card-title';
  const title = document.createElement('strong');
  title.textContent = data.editingId ? '编辑账号' : '添加账号';
  const screenButton = document.createElement('button');
  screenButton.type = 'button';
  screenButton.className = 'secondary-button';
  screenButton.textContent = '框选二维码';
  screenButton.addEventListener('click', () => importTOTPScreenQRCode());
  const importButton = document.createElement('button');
  importButton.type = 'button';
  importButton.className = 'secondary-button';
  importButton.textContent = '导入二维码 PNG';
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/png';
  file.className = 'visually-hidden';
  importButton.addEventListener('click', () => file.click());
  file.addEventListener('change', () => importTOTPQRCode(file.files?.[0]));
  titleRow.append(title, screenButton, importButton, file);

  const issuer = renderTOTPTextInput(form.issuer, 'GitHub', (value) => {
    form.issuer = value;
  });
  const name = renderTOTPTextInput(form.name, 'user@example.com', (value) => {
    form.name = value;
  });
  const secret = document.createElement('textarea');
  secret.value = form.secretOrURL;
  secret.placeholder = 'Base32 Secret 或 otpauth://totp/... 链接';
  secret.spellcheck = false;
  secret.addEventListener('input', () => {
    form.secretOrURL = secret.value;
  });
  const digits = renderTOTPNumberInput(form.digits, 6, 8, (value) => {
    form.digits = value;
  });
  const period = renderTOTPNumberInput(form.period, 1, 300, (value) => {
    form.period = value;
  });

  const grid = document.createElement('div');
  grid.className = 'totp-form-grid';
  grid.append(labelWrap('发行方', issuer), labelWrap('账号名', name), labelWrap('位数', digits), labelWrap('周期', period));

  const secretLabel = document.createElement('label');
  secretLabel.className = 'totp-secret-field';
  const secretCaption = document.createElement('span');
  secretCaption.textContent = 'Secret / otpauth';
  secretLabel.append(secretCaption, secret);

  const actions = document.createElement('div');
  actions.className = 'totp-actions';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'primary-button';
  save.textContent = data.editingId ? '保存修改' : '保存账号';
  save.addEventListener('click', () => saveTOTPAccount());
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'secondary-button';
  reset.textContent = data.editingId ? '取消编辑' : '清空';
  reset.addEventListener('click', () => {
    resetTOTPForm();
    renderTOTPTool();
  });
  actions.append(save, reset);

  card.append(titleRow, grid, secretLabel, actions);
  return card;
}

function renderTOTPAccountsPanel() {
  const data = state.totpTool;
  const panel = document.createElement('div');
  panel.className = 'totp-list-card';
  const head = document.createElement('div');
  head.className = 'totp-card-title';
  const title = document.createElement('strong');
  title.textContent = '已保存账号';
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'secondary-button';
  refresh.textContent = data.loading ? '加载中' : '刷新';
  refresh.disabled = data.loading;
  refresh.addEventListener('click', () => loadTOTPAccounts({ force: true }));
  head.append(title, refresh);
  panel.append(head);

  if (data.loading && data.accounts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'totp-empty';
    empty.textContent = '正在加载账号...';
    panel.append(empty);
    return panel;
  }

  if (data.accounts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'totp-empty';
    empty.textContent = '还没有保存 2FA 账号';
    panel.append(empty);
    return panel;
  }

  const list = document.createElement('div');
  list.className = 'totp-account-list';
  data.accounts.forEach((account) => list.append(renderTOTPAccountRow(account)));
  panel.append(list);
  return panel;
}

function renderTOTPAccountRow(account) {
  const row = document.createElement('div');
  row.className = 'totp-account-row';

  const meta = document.createElement('div');
  meta.className = 'totp-account-meta';
  const name = document.createElement('strong');
  name.textContent = account.displayName;
  const detail = document.createElement('span');
  detail.textContent = `${account.digits} 位 · ${account.period}s · ${account.secret.slice(0, 4)}...${account.secret.slice(-4)}`;
  meta.append(name, detail);

  const code = document.createElement('button');
  code.type = 'button';
  code.className = 'totp-code-button';
  code.innerHTML = `<strong>${escapeHtml(account.code)}</strong><span>${account.remaining}s</span>`;
  code.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(account.code);
    setStatus(`已复制：${account.displayName}`);
  });

  const actions = document.createElement('div');
  actions.className = 'totp-row-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'secondary-button';
  edit.textContent = '编辑';
  edit.addEventListener('click', () => {
    state.totpTool.editingId = account.id;
    state.totpTool.form = {
      issuer: account.issuer,
      name: account.name,
      secretOrURL: account.secret,
      digits: account.digits,
      period: account.period
    };
    renderTOTPTool();
  });
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'secondary-button';
  remove.textContent = '删除';
  remove.addEventListener('click', () => deleteTOTPAccount(account.id));
  actions.append(edit, remove);

  row.append(meta, code, actions);
  return row;
}

function renderTOTPTextInput(value, placeholder, onInput) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function renderTOTPNumberInput(value, min, max, onInput) {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(value);
  input.addEventListener('input', () => onInput(Number(input.value) || min));
  return input;
}

async function loadTOTPAccounts({ force = false } = {}) {
  const data = state.totpTool;
  if (data.loading && !force) return;
  data.loading = true;
  data.error = '';
  try {
    const response = await window.toolkit.totpList();
    data.accounts = response.accounts ?? [];
    data.storagePath = response.storagePath ?? '';
    data.error = response.warning || '';
    data.loaded = true;
  } catch (error) {
    data.error = readableErrorMessage(error);
  } finally {
    data.loading = false;
    if (state.mode === 'totp') renderTOTPTool();
  }
}

async function chooseTOTPStorage() {
  const data = state.totpTool;
  data.error = '';
  try {
    const response = await window.toolkit.totpChooseStorage();
    data.accounts = response.accounts ?? [];
    data.storagePath = response.storagePath ?? '';
    data.error = response.warning || '';
    data.loaded = true;
    if (!response.canceled) {
      setStatus(response.warning || '2FA 存储位置已更新', Boolean(response.warning));
    }
  } catch (error) {
    data.error = readableErrorMessage(error);
    setStatus(data.error, true);
  }
  renderTOTPTool();
}

async function saveTOTPAccount() {
  const data = state.totpTool;
  data.error = '';
  try {
    const response = await window.toolkit.totpSave({
      id: data.editingId || undefined,
      ...data.form
    });
    data.accounts = response.accounts ?? [];
    data.storagePath = response.storagePath ?? '';
    data.loaded = true;
    resetTOTPForm();
    setStatus('2FA 账号已保存');
  } catch (error) {
    data.error = readableErrorMessage(error);
    setStatus(data.error, true);
  }
  renderTOTPTool();
}

async function deleteTOTPAccount(id) {
  const data = state.totpTool;
  data.error = '';
  try {
    const response = await window.toolkit.totpDelete(id);
    data.accounts = response.accounts ?? [];
    data.storagePath = response.storagePath ?? '';
    if (data.editingId === id) resetTOTPForm();
    setStatus('2FA 账号已删除');
  } catch (error) {
    data.error = readableErrorMessage(error);
    setStatus(data.error, true);
  }
  renderTOTPTool();
}

async function generateTOTPTemp() {
  const data = state.totpTool;
  data.error = '';
  try {
    data.tempResult = await window.toolkit.totpGenerateTemp({
      issuer: '临时',
      name: 'Secret',
      secretOrURL: data.tempInput,
      digits: data.tempDigits,
      period: data.tempPeriod
    });
    state.lastOutput = data.tempResult.code;
    setStatus('临时验证码已生成');
  } catch (error) {
    data.tempResult = null;
    data.error = readableErrorMessage(error);
    setStatus(data.error, true);
  }
  renderTOTPTool();
}

async function importTOTPScreenQRCode() {
  const data = state.totpTool;
  data.error = '';
  try {
    const response = await window.toolkit.totpImportScreenQR();
    if (response.canceled) {
      setStatus('已取消框选二维码');
      renderTOTPTool();
      return;
    }
    data.accounts = response.accounts ?? [];
    data.storagePath = response.storagePath ?? '';
    data.loaded = true;
    resetTOTPForm();
    setStatus('框选二维码账号已导入');
  } catch (error) {
    data.error = readableErrorMessage(error);
    setStatus(data.error, true);
  }
  renderTOTPTool();
}

async function importTOTPQRCode(file) {
  if (!file) return;
  const data = state.totpTool;
  data.error = '';
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const decoded = await window.toolkit.qrDecode(dataUrl);
    const response = await window.toolkit.totpSave({ secretOrURL: decoded });
    data.accounts = response.accounts ?? [];
    data.storagePath = response.storagePath ?? '';
    data.loaded = true;
    resetTOTPForm();
    setStatus('二维码账号已导入');
  } catch (error) {
    data.error = readableErrorMessage(error);
    setStatus(data.error, true);
  }
  renderTOTPTool();
}

function resetTOTPForm() {
  state.totpTool.editingId = '';
  state.totpTool.form = {
    issuer: '',
    name: '',
    secretOrURL: '',
    digits: 6,
    period: 30
  };
}

function scheduleTOTPRefresh() {
  const data = state.totpTool;
  window.clearTimeout(data.refreshTimer);
  if (data.accounts.length === 0 && !data.tempResult) return;
  data.refreshTimer = window.setTimeout(async () => {
    if (state.mode !== 'totp') return;
    if (isTOTPFieldFocused()) {
      scheduleTOTPRefresh();
      return;
    }
    if (data.tempResult && data.tempInput.trim()) {
      try {
        data.tempResult = await window.toolkit.totpGenerateTemp({
          issuer: '临时',
          name: 'Secret',
          secretOrURL: data.tempInput,
          digits: data.tempDigits,
          period: data.tempPeriod
        });
      } catch {
        data.tempResult = null;
      }
    }
    await loadTOTPAccounts({ force: true });
  }, 1000);
}

function isTOTPFieldFocused() {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)) return false;
  return Boolean(active.closest('.totp-tool'));
}

function renderHashTool() {
  const panel = document.createElement('div');
  panel.className = 'hash-tool';

  const inputCard = document.createElement('section');
  inputCard.className = 'hash-input-card';
  const head = document.createElement('div');
  head.className = 'hash-head';
  head.innerHTML = '<strong>文本摘要</strong><span>一次生成常用哈希，适合接口调试、短文本校验和签名排查</span>';

  const textarea = document.createElement('textarea');
  textarea.value = state.hashTool.payload;
  textarea.placeholder = '输入需要计算摘要的文本';
  textarea.spellcheck = false;
  textarea.addEventListener('input', () => {
    state.hashTool.payload = textarea.value;
    scheduleHashRun(resultCard);
  });

  const actions = document.createElement('div');
  actions.className = 'hash-actions';
  const run = document.createElement('button');
  run.type = 'button';
  run.className = 'hash-run-button';
  run.textContent = '重新计算';
  run.addEventListener('click', () => {
    void updateHashResult(resultCard);
  });
  const copyAll = document.createElement('button');
  copyAll.type = 'button';
  copyAll.className = 'hash-copy-button';
  copyAll.textContent = '复制全部';
  copyAll.disabled = state.hashTool.rows.length === 0;
  copyAll.addEventListener('click', async () => {
    if (state.hashTool.rows.length === 0) return;
    await window.toolkit.writeClipboard(formatHashRowsForClipboard());
    setStatus('已复制全部哈希摘要');
  });
  actions.append(run, copyAll);

  const quick = document.createElement('div');
  quick.className = 'hash-quick-grid';
  [
    ['空字符串', ''],
    ['ElectronToolKit', 'ElectronToolKit'],
    ['JSON 示例', '{"id":1,"name":"ElectronToolKit"}']
  ].forEach(([label, value]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      state.hashTool.payload = value;
      textarea.value = value;
      void updateHashResult(resultCard);
    });
    quick.append(button);
  });

  inputCard.append(head, textarea, quick, actions);

  const resultCard = document.createElement('section');
  resultCard.className = 'hash-result-card';
  panel.append(inputCard, resultCard);
  elements.output.replaceChildren(panel);
  renderHashResult(resultCard);
  if (state.hashTool.rows.length === 0 && !state.hashTool.error) scheduleHashRun(resultCard, 0);
}

function scheduleHashRun(container, delay = 180) {
  window.clearTimeout(state.hashTool.runTimer);
  state.hashTool.runTimer = window.setTimeout(() => {
    void updateHashResult(container);
  }, delay);
}

async function updateHashResult(container) {
  const sequence = ++state.hashTool.sequence;
  const payload = state.hashTool.payload;
  try {
    const algorithms = [
      ['md5', 'MD5'],
      ['sha1', 'SHA1'],
      ['sha256', 'SHA256'],
      ['sha512', 'SHA512']
    ];
    const rows = await Promise.all(
      algorithms.map(async ([algorithm, label]) => {
        const hex = await window.toolkit.hash(algorithm, payload);
        const described = describeHexDigest(hex);
        if (!described.ok) throw new Error(described.error);
        return { algorithm, label, ...described.data };
      })
    );
    if (sequence !== state.hashTool.sequence) return;
    state.hashTool.rows = rows;
    state.hashTool.error = '';
    state.lastOutput = formatHashRowsForClipboard();
    renderHashResult(container);
    setStatus('文本哈希已生成');
  } catch (error) {
    if (sequence !== state.hashTool.sequence) return;
    const message = error instanceof Error ? error.message : String(error);
    state.hashTool.rows = [];
    state.hashTool.error = message;
    state.lastOutput = message;
    renderHashResult(container);
    setStatus(message, true);
  }
}

function renderHashResult(panel) {
  panel.replaceChildren();
  const head = document.createElement('div');
  head.className = 'hash-result-head';
  head.innerHTML = '<strong>摘要结果</strong><span>点击任意摘要复制 Hex</span>';
  panel.append(head);

  if (state.hashTool.error) {
    const warning = document.createElement('div');
    warning.className = 'hash-warning';
    warning.textContent = state.hashTool.error;
    panel.append(warning);
    return;
  }

  if (state.hashTool.rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hash-empty';
    empty.textContent = '输入文本后会自动生成 MD5、SHA1、SHA256 和 SHA512';
    panel.append(empty);
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'hash-summary-strip';
  [
    ['文本长度', `${state.hashTool.payload.length} 字符`],
    ['算法', `${state.hashTool.rows.length} 种`],
    ['最长摘要', `${Math.max(...state.hashTool.rows.map((row) => row.bitLength))} bit`]
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.innerHTML = `<span>${label}</span><strong></strong>`;
    item.querySelector('strong').textContent = value;
    summary.append(item);
  });

  const list = document.createElement('div');
  list.className = 'hash-row-list';
  state.hashTool.rows.forEach((row) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'hash-row';
    item.innerHTML = `
      <span>${escapeHtml(row.label)}</span>
      <code></code>
      <small>${row.bitLength} bit</small>
    `;
    item.querySelector('code').textContent = row.hex;
    item.addEventListener('click', async () => {
      await window.toolkit.writeClipboard(row.hex);
      setStatus(`已复制 ${row.label}`);
    });
    list.append(item);
  });
  panel.append(summary, list);
}

function formatHashRowsForClipboard() {
  return state.hashTool.rows.map((row) => `${row.label}: ${row.hex}`).join('\n');
}

function renderCaseConverterTool() {
  const panel = document.createElement('div');
  panel.className = 'case-tool';

  const inputCard = document.createElement('section');
  inputCard.className = 'case-input-card';
  const head = document.createElement('div');
  head.className = 'case-head';
  head.innerHTML = '<strong>文本清洗变形</strong><span>命名风格、大小写、行去重和排序同时预览</span>';

  const textarea = document.createElement('textarea');
  textarea.value = state.caseTool.text;
  textarea.placeholder = 'hello world\\nfoo bar';
  textarea.spellcheck = false;
  textarea.addEventListener('input', () => {
    state.caseTool.text = textarea.value;
    renderCaseResult(resultCard);
  });

  const quick = document.createElement('div');
  quick.className = 'case-quick-grid';
  [
    ['接口字段', 'user name\nuser-name value\ncreated_at'],
    ['重复行', 'apple\nbanana\napple\n  orange  \n'],
    ['短语', 'hello world from toolkit']
  ].forEach(([label, value]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      state.caseTool.text = value;
      textarea.value = value;
      renderCaseResult(resultCard);
    });
    quick.append(button);
  });

  const actions = document.createElement('div');
  actions.className = 'case-actions';
  const copyAll = document.createElement('button');
  copyAll.type = 'button';
  copyAll.className = 'case-copy-button';
  copyAll.textContent = '复制全部结果';
  copyAll.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(formatCaseResultsForClipboard());
    setStatus('已复制全部文本变形结果');
  });
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'case-secondary-button';
  clear.textContent = '清空';
  clear.addEventListener('click', () => {
    state.caseTool.text = '';
    textarea.value = '';
    renderCaseResult(resultCard);
    setStatus('已清空文本');
  });
  actions.append(copyAll, clear);

  inputCard.append(head, textarea, quick, actions);

  const resultCard = document.createElement('section');
  resultCard.className = 'case-result-card';
  panel.append(inputCard, resultCard);
  elements.output.replaceChildren(panel);
  renderCaseResult(resultCard);
}

function renderCaseResult(panel) {
  panel.replaceChildren();
  const head = document.createElement('div');
  head.className = 'case-result-head';
  head.innerHTML = '<strong>转换结果</strong><span>点击复制，或替换回输入继续处理</span>';

  const stats = getCaseTextStats(state.caseTool.text);
  const summary = document.createElement('div');
  summary.className = 'case-summary-strip';
  [
    ['字符', String(stats.chars)],
    ['行数', String(stats.lines)],
    ['非空行', String(stats.nonEmptyLines)],
    ['唯一行', String(stats.uniqueLines)]
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.innerHTML = `<span>${label}</span><strong></strong>`;
    item.querySelector('strong').textContent = value;
    summary.append(item);
  });

  const groups = document.createElement('div');
  groups.className = 'case-group-tabs';
  [
    ['case', '命名风格'],
    ['lines', '行处理']
  ].forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = state.caseTool.activeGroup === value ? 'active' : '';
    button.textContent = label;
    button.addEventListener('click', () => {
      state.caseTool.activeGroup = value;
      renderCaseResult(panel);
    });
    groups.append(button);
  });

  const grid = document.createElement('div');
  grid.className = 'case-output-grid';
  const rows = getCaseResultRows().filter((row) => row.group === state.caseTool.activeGroup);
  rows.forEach((row) => {
    grid.append(renderCaseOutputCard(row));
  });

  panel.append(head, summary, groups, grid);
  state.lastOutput = formatCaseResultsForClipboard();
}

function renderCaseOutputCard(row) {
  const card = document.createElement('div');
  card.className = 'case-output-card';
  const head = document.createElement('div');
  head.className = 'case-output-head';
  const title = document.createElement('strong');
  title.textContent = row.label;
  const tools = document.createElement('div');
  const use = document.createElement('button');
  use.type = 'button';
  use.textContent = '替换输入';
  use.addEventListener('click', () => {
    state.caseTool.text = row.value;
    renderCaseConverterTool();
    setStatus(`已用 ${row.label} 替换输入`);
  });
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = '复制';
  copy.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(row.value);
    setStatus(`已复制 ${row.label}`);
  });
  tools.append(use, copy);
  head.append(title, tools);
  const code = document.createElement('code');
  code.textContent = row.value;
  card.append(head, code);
  return card;
}

function getCaseResultRows() {
  return [
    { action: 'lower', label: '小写', group: 'case' },
    { action: 'upper', label: '大写', group: 'case' },
    { action: 'camel', label: 'camelCase', group: 'case' },
    { action: 'snake', label: 'snake_case', group: 'case' },
    { action: 'constant', label: 'CONSTANT_CASE', group: 'case' },
    { action: 'trim', label: '去空行空格', group: 'lines' },
    { action: 'dedupe', label: '行去重', group: 'lines' },
    { action: 'sort', label: '行排序', group: 'lines' }
  ].map((row) => ({ ...row, value: convertCase(state.caseTool.text, row.action) }));
}

function getCaseTextStats(text) {
  const value = String(text ?? '');
  const lines = value.length === 0 ? [] : value.split(/\r?\n/);
  const nonEmpty = lines.filter((line) => line.trim());
  return {
    chars: value.length,
    lines: lines.length,
    nonEmptyLines: nonEmpty.length,
    uniqueLines: new Set(lines).size
  };
}

function formatCaseResultsForClipboard() {
  return getCaseResultRows().map((row) => `${row.label}:\n${row.value}`).join('\n\n');
}

function renderUnitConverterTool() {
  normalizeUnitToolState();
  const panel = document.createElement('div');
  panel.className = 'unit-tool';

  const config = document.createElement('section');
  config.className = 'unit-config-card';
  const head = document.createElement('div');
  head.className = 'unit-head';
  head.innerHTML = '<strong>单位换算</strong><span>长度、重量、容量、温度分组换算，同组结果一次展示</span>';

  const groups = document.createElement('div');
  groups.className = 'unit-group-grid';
  Object.entries(UNIT_GROUPS).forEach(([key, group]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = state.unitTool.group === key ? 'active' : '';
    button.innerHTML = `<strong>${group.label}</strong><span>${group.units.length} 个单位</span>`;
    button.addEventListener('click', () => {
      state.unitTool.group = key;
      state.unitTool.value = group.sample;
      state.unitTool.fromUnit = group.defaultFrom;
      state.unitTool.toUnit = group.defaultTo;
      renderUnitConverterTool();
    });
    groups.append(button);
  });

  const value = document.createElement('input');
  value.value = state.unitTool.value;
  value.inputMode = 'decimal';
  value.placeholder = '1000';
  value.addEventListener('input', () => {
    state.unitTool.value = value.value;
    renderUnitResult(resultCard);
  });

  const from = renderUnitSelect(state.unitTool.fromUnit, (next) => {
    state.unitTool.fromUnit = next;
    if (state.unitTool.toUnit === next) {
      state.unitTool.toUnit = getUnitGroup().units.find(([unit]) => unit !== next)?.[0] ?? next;
    }
    renderUnitConverterTool();
  });
  const to = renderUnitSelect(state.unitTool.toUnit, (next) => {
    state.unitTool.toUnit = next;
    renderUnitResult(resultCard);
  });

  const fields = document.createElement('div');
  fields.className = 'unit-fields';
  fields.append(labelWrap('数值', value), labelWrap('从', from), labelWrap('到', to));

  const actions = document.createElement('div');
  actions.className = 'unit-actions';
  const swap = document.createElement('button');
  swap.type = 'button';
  swap.className = 'unit-run-button';
  swap.textContent = '交换单位';
  swap.addEventListener('click', () => {
    [state.unitTool.fromUnit, state.unitTool.toUnit] = [state.unitTool.toUnit, state.unitTool.fromUnit];
    renderUnitConverterTool();
  });
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'unit-copy-button';
  copy.textContent = '复制结果';
  copy.addEventListener('click', async () => {
    renderUnitResult(resultCard);
    if (!state.unitTool.result?.ok) return;
    await window.toolkit.writeClipboard(state.unitTool.result.value);
    setStatus('已复制单位换算结果');
  });
  actions.append(swap, copy);

  config.append(head, groups, fields, actions);

  const resultCard = document.createElement('section');
  resultCard.className = 'unit-result-card';
  panel.append(config, resultCard);
  elements.output.replaceChildren(panel);
  renderUnitResult(resultCard);
}

function renderUnitSelect(value, onChange) {
  const select = document.createElement('select');
  getUnitGroup().units.forEach(([unit, label]) => {
    const option = document.createElement('option');
    option.value = unit;
    option.textContent = `${label} (${unit})`;
    select.append(option);
  });
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function renderUnitResult(panel) {
  panel.replaceChildren();
  const result = convertUnit(state.unitTool.value, {
    fromUnit: state.unitTool.fromUnit,
    toUnit: state.unitTool.toUnit
  });
  state.unitTool.result = result;
  state.unitTool.error = result.ok ? '' : result.error;
  state.lastOutput = result.ok ? result.value : result.error;

  const head = document.createElement('div');
  head.className = 'unit-result-head';
  head.innerHTML = '<strong>换算结果</strong><span>同类型单位同步预览</span>';
  panel.append(head);

  if (!result.ok) {
    const warning = document.createElement('div');
    warning.className = 'unit-warning';
    warning.textContent = result.error;
    panel.append(warning);
    setStatus(result.error, true);
    return;
  }

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'unit-main-result';
  main.innerHTML = '<span>主结果</span><strong></strong>';
  main.querySelector('strong').textContent = result.value;
  main.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(result.value);
    setStatus('已复制主换算结果');
  });

  const list = document.createElement('div');
  list.className = 'unit-result-list';
  getUnitGroup().units.forEach(([unit, label]) => {
    const row = convertUnit(state.unitTool.value, {
      fromUnit: state.unitTool.fromUnit,
      toUnit: unit
    });
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `unit-result-row${unit === state.unitTool.toUnit ? ' active' : ''}`;
    item.innerHTML = `<span>${escapeHtml(label)}</span><code></code><small>${escapeHtml(unit)}</small>`;
    item.querySelector('code').textContent = row.ok ? extractUnitResultValue(row.value) : row.error;
    item.addEventListener('click', async () => {
      if (!row.ok) return;
      await window.toolkit.writeClipboard(row.value);
      setStatus(`已复制 ${label} 换算结果`);
    });
    list.append(item);
  });

  panel.append(main, list);
  setStatus('单位换算完成');
}

function normalizeUnitToolState() {
  const group = getUnitGroup();
  const units = new Set(group.units.map(([unit]) => unit));
  if (!units.has(state.unitTool.fromUnit)) state.unitTool.fromUnit = group.defaultFrom;
  if (!units.has(state.unitTool.toUnit)) state.unitTool.toUnit = group.defaultTo;
}

function getUnitGroup() {
  return UNIT_GROUPS[state.unitTool.group] ?? UNIT_GROUPS['length'];
}

function extractUnitResultValue(value) {
  const parts = String(value ?? '').split('=');
  return (parts[1] ?? value).trim();
}

function renderBaseConverterTool() {
  const panel = document.createElement('div');
  panel.className = 'base-converter-tool';

  const config = document.createElement('section');
  config.className = 'base-config-card';
  const head = document.createElement('div');
  head.className = 'base-head';
  head.innerHTML = '<strong>进制转换</strong><span>输入一次，同步生成常用整数进制</span>';

  const baseChoices = document.createElement('div');
  baseChoices.className = 'base-choice-grid';
  [
    ['2', 'BIN'],
    ['8', 'OCT'],
    ['10', 'DEC'],
    ['16', 'HEX'],
    ['32', 'BASE32'],
    ['36', 'BASE36']
  ].forEach(([base, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = state.baseTool.fromBase === base ? 'active' : '';
    button.innerHTML = `<strong>${label}</strong><span>${base} 进制</span>`;
    button.addEventListener('click', () => {
      const current = convertBaseNumberDetails(state.baseTool.input, { fromBase: state.baseTool.fromBase });
      if (current.ok) {
        const nextValue = current.data.rows.find((row) => String(row.base) === base)?.value;
        if (nextValue) state.baseTool.input = nextValue;
      }
      state.baseTool.fromBase = base;
      renderBaseConverterTool();
    });
    baseChoices.append(button);
  });

  const input = document.createElement('input');
  input.value = state.baseTool.input;
  input.spellcheck = false;
  input.placeholder = getBasePlaceholder(state.baseTool.fromBase);
  input.addEventListener('input', () => {
    state.baseTool.input = input.value;
    renderBaseResult(resultCard);
  });

  const quick = document.createElement('div');
  quick.className = 'base-quick-grid';
  getBaseSamples(state.baseTool.fromBase).forEach((value) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = value;
    button.addEventListener('click', () => {
      state.baseTool.input = value;
      input.value = value;
      renderBaseResult(resultCard);
    });
    quick.append(button);
  });

  const actions = document.createElement('div');
  actions.className = 'base-actions';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'base-copy-button';
  copy.textContent = '复制全部';
  copy.addEventListener('click', async () => {
    renderBaseResult(resultCard);
    if (!state.baseTool.result?.ok) return;
    await window.toolkit.writeClipboard(formatBaseDetails(state.baseTool.result.data));
    setStatus('已复制进制转换结果');
  });
  actions.append(copy);

  config.append(head, baseChoices, labelWrap('原始数字', input), quick, actions);

  const resultCard = document.createElement('section');
  resultCard.className = 'base-result-card';
  panel.append(config, resultCard);
  elements.output.replaceChildren(panel);
  renderBaseResult(resultCard);
}

function renderBaseResult(panel) {
  panel.replaceChildren();
  const result = convertBaseNumberDetails(state.baseTool.input, { fromBase: state.baseTool.fromBase });
  state.baseTool.result = result;
  state.baseTool.error = result.ok ? '' : result.error;
  state.lastOutput = result.ok ? formatBaseDetails(result.data) : result.error;

  const head = document.createElement('div');
  head.className = 'base-result-head';
  head.innerHTML = '<strong>转换结果</strong><span>点击任意卡片复制原始值</span>';
  panel.append(head);

  if (!result.ok) {
    const warning = document.createElement('div');
    warning.className = 'base-warning';
    warning.textContent = result.error;
    panel.append(warning);
    setStatus(result.error, true);
    return;
  }

  const data = result.data;
  const summary = document.createElement('div');
  summary.className = 'base-summary-strip';
  [
    ['十进制', data.decimal],
    ['位长', `${data.bitLength} bit`],
    ['字节', `${data.byteLength} byte`]
  ].forEach(([label, value]) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.innerHTML = '<span></span><strong></strong>';
    item.querySelector('span').textContent = label;
    item.querySelector('strong').textContent = value;
    item.addEventListener('click', async () => {
      await window.toolkit.writeClipboard(value);
      setStatus(`已复制 ${label}`);
    });
    summary.append(item);
  });

  const rows = document.createElement('div');
  rows.className = 'base-result-grid';
  data.rows.forEach((row) => rows.append(renderBaseResultCard(row)));

  panel.append(summary, rows);
  setStatus('进制转换完成');
}

function renderBaseResultCard(row) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'base-result-item';
  card.innerHTML = '<span></span><code></code><small></small>';
  card.querySelector('span').textContent = row.label;
  card.querySelector('code').textContent = row.value;
  card.querySelector('small').textContent = row.prefix ? `${row.prefix} 前缀 · ${row.digits} 位` : `${row.digits} 位`;
  card.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(row.value);
    setStatus(`已复制 ${row.label}`);
  });
  return card;
}

function formatBaseDetails(data) {
  return [
    `来源: ${data.source} (${data.fromBase} 进制)`,
    `十进制: ${data.decimal}`,
    `位长: ${data.bitLength} bit`,
    `字节: ${data.byteLength} byte`,
    ...data.rows.map((row) => `${row.label}: ${row.value}`)
  ].join('\n');
}

function getBasePlaceholder(base) {
  return {
    2: '101010',
    8: '755',
    10: '255',
    16: 'FF',
    32: '7V',
    36: 'ZZ'
  }[base] ?? 'FF';
}

function getBaseSamples(base) {
  return {
    2: ['1010', '11111111', '100000000'],
    8: ['10', '755', '377'],
    10: ['42', '255', '65535'],
    16: ['FF', '7B', 'DEADBEEF'],
    32: ['7V', 'VV', '1Z141Z3'],
    36: ['ZZ', 'HELLO', 'TOOLKIT']
  }[base] ?? ['FF', '255', 'DEADBEEF'];
}

function renderCidrTool() {
  const panel = document.createElement('div');
  panel.className = 'cidr-tool';

  const config = document.createElement('section');
  config.className = 'cidr-input-card';
  const head = document.createElement('div');
  head.className = 'cidr-head';
  head.innerHTML = '<strong>IPv4 CIDR 子网</strong><span>拆解网络地址、广播地址、掩码、可用范围和主机数</span>';

  const input = document.createElement('input');
  input.value = state.cidrTool.input;
  input.placeholder = '192.168.1.10/24';
  input.spellcheck = false;
  input.addEventListener('input', () => {
    state.cidrTool.input = input.value;
    renderCidrResult(resultCard);
  });

  const quick = document.createElement('div');
  quick.className = 'cidr-quick-grid';
  ['192.168.1.10/24', '10.0.0.1/8', '172.16.5.20/20', '127.0.0.1/32'].forEach((value) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = value;
    button.addEventListener('click', () => {
      state.cidrTool.input = value;
      input.value = value;
      renderCidrResult(resultCard);
    });
    quick.append(button);
  });

  const actions = document.createElement('div');
  actions.className = 'cidr-actions';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'cidr-copy-button';
  copy.textContent = '复制全部';
  copy.addEventListener('click', async () => {
    renderCidrResult(resultCard);
    if (!state.cidrTool.result?.ok) return;
    await window.toolkit.writeClipboard(formatCidrDetails(state.cidrTool.result.data));
    setStatus('已复制 CIDR 结果');
  });
  actions.append(copy);

  config.append(head, labelWrap('CIDR', input), quick, actions);

  const resultCard = document.createElement('section');
  resultCard.className = 'cidr-result-card';
  panel.append(config, resultCard);
  elements.output.replaceChildren(panel);
  renderCidrResult(resultCard);
}

function renderCidrResult(panel) {
  panel.replaceChildren();
  const result = calculateCidrDetails(state.cidrTool.input);
  state.cidrTool.result = result;
  state.cidrTool.error = result.ok ? '' : result.error;
  state.lastOutput = result.ok ? formatCidrDetails(result.data) : result.error;

  const head = document.createElement('div');
  head.className = 'cidr-result-head';
  head.innerHTML = '<strong>子网信息</strong><span>点击任意字段复制</span>';
  panel.append(head);

  if (!result.ok) {
    const warning = document.createElement('div');
    warning.className = 'cidr-warning';
    warning.textContent = result.error;
    panel.append(warning);
    setStatus(result.error, true);
    return;
  }

  const data = result.data;
  const overview = document.createElement('div');
  overview.className = 'cidr-overview';
  [
    ['网络', data.networkCidr],
    ['可用主机', String(data.usableHosts)],
    ['地址总数', String(data.total)]
  ].forEach(([label, value]) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'cidr-overview-card';
    item.innerHTML = `<span>${label}</span><strong></strong>`;
    item.querySelector('strong').textContent = value;
    item.addEventListener('click', async () => {
      await window.toolkit.writeClipboard(value);
      setStatus(`已复制 ${label}`);
    });
    overview.append(item);
  });

  const grid = document.createElement('div');
  grid.className = 'cidr-field-grid';
  [
    ['IP', data.ip],
    ['前缀', `/${data.prefix}`],
    ['子网掩码', data.mask],
    ['反掩码', data.wildcardMask],
    ['网络地址', data.network],
    ['广播地址', data.broadcast],
    ['首个可用', data.firstHost],
    ['最后可用', data.lastHost],
    ['可用范围', data.hostRange]
  ].forEach(([label, value]) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'cidr-field-card';
    card.innerHTML = `<span>${label}</span><code></code>`;
    card.querySelector('code').textContent = value;
    card.addEventListener('click', async () => {
      await window.toolkit.writeClipboard(value);
      setStatus(`已复制 ${label}`);
    });
    grid.append(card);
  });

  panel.append(overview, grid);
  setStatus('CIDR 子网计算完成');
}

function formatCidrDetails(data) {
  return [
    `IP: ${data.ip}`,
    `前缀: /${data.prefix}`,
    `子网掩码: ${data.mask}`,
    `反掩码: ${data.wildcardMask}`,
    `网络地址: ${data.network}`,
    `广播地址: ${data.broadcast}`,
    `可用范围: ${data.hostRange}`,
    `地址总数: ${data.total}`,
    `可用主机数: ${data.usableHosts}`
  ].join('\n');
}

function renderDateCalcTool() {
  const panel = document.createElement('div');
  panel.className = 'date-tool';

  const config = document.createElement('section');
  config.className = 'date-config-card';
  const head = document.createElement('div');
  head.className = 'date-head';
  head.innerHTML = '<strong>日期计算</strong><span>加减天数、计算日期间隔，结果实时同步</span>';

  const modes = document.createElement('div');
  modes.className = 'date-mode-grid';
  [
    ['offset', '加减天数', '从某天推算前后日期'],
    ['diff', '日期差', '计算两个日期相差天数']
  ].forEach(([mode, label, desc]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = state.dateTool.mode === mode ? 'active' : '';
    button.innerHTML = `<strong>${label}</strong><span>${desc}</span>`;
    button.addEventListener('click', () => {
      state.dateTool.mode = mode;
      renderDateCalcTool();
    });
    modes.append(button);
  });

  const fields = document.createElement('div');
  fields.className = 'date-field-grid';

  const baseDate = document.createElement('input');
  baseDate.type = 'date';
  baseDate.value = state.dateTool.baseDate;
  baseDate.addEventListener('input', () => {
    state.dateTool.baseDate = baseDate.value;
    renderDateResult(resultCard);
  });
  fields.append(labelWrap(state.dateTool.mode === 'diff' ? '开始日期' : '基准日期', baseDate));

  if (state.dateTool.mode === 'diff') {
    const targetDate = document.createElement('input');
    targetDate.type = 'date';
    targetDate.value = state.dateTool.targetDate;
    targetDate.addEventListener('input', () => {
      state.dateTool.targetDate = targetDate.value;
      renderDateResult(resultCard);
    });
    fields.append(labelWrap('结束日期', targetDate));
  } else {
    const days = document.createElement('input');
    days.type = 'number';
    days.min = '0';
    days.step = '1';
    days.value = state.dateTool.days;
    days.inputMode = 'numeric';
    days.addEventListener('input', () => {
      state.dateTool.days = days.value;
      renderDateResult(resultCard);
    });
    fields.append(labelWrap('天数', days));
  }

  const direction = document.createElement('div');
  direction.className = 'date-direction';
  if (state.dateTool.mode === 'offset') {
    [
      ['add', '向后'],
      ['subtract', '向前']
    ].forEach(([value, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = state.dateTool.direction === value ? 'active' : '';
      button.textContent = label;
      button.addEventListener('click', () => {
        state.dateTool.direction = value;
        renderDateCalcTool();
      });
      direction.append(button);
    });
  }

  const quick = document.createElement('div');
  quick.className = 'date-quick-grid';
  if (state.dateTool.mode === 'offset') {
    ['1', '7', '30', '90', '365'].forEach((value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${value} 天`;
      button.addEventListener('click', () => {
        state.dateTool.days = value;
        renderDateCalcTool();
      });
      quick.append(button);
    });
  } else {
    [
      ['today-base', '开始=今天'],
      ['today-target', '结束=今天']
    ].forEach(([action, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        const today = formatDateInput(new Date());
        if (action === 'today-base') state.dateTool.baseDate = today;
        if (action === 'today-target') state.dateTool.targetDate = today;
        renderDateCalcTool();
      });
      quick.append(button);
    });
  }

  const actions = document.createElement('div');
  actions.className = 'date-actions';
  if (state.dateTool.mode === 'diff') {
    const swap = document.createElement('button');
    swap.type = 'button';
    swap.className = 'date-run-button';
    swap.textContent = '交换日期';
    swap.addEventListener('click', () => {
      [state.dateTool.baseDate, state.dateTool.targetDate] = [state.dateTool.targetDate, state.dateTool.baseDate];
      renderDateCalcTool();
    });
    actions.append(swap);
  }
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'date-copy-button';
  copy.textContent = '复制结果';
  copy.addEventListener('click', async () => {
    renderDateResult(resultCard);
    if (!state.dateTool.result?.ok) return;
    await window.toolkit.writeClipboard(formatDateDetails(state.dateTool.result.data));
    setStatus('已复制日期计算结果');
  });
  actions.append(copy);

  config.append(head, modes, fields);
  if (state.dateTool.mode === 'offset') config.append(direction);
  config.append(quick, actions);

  const resultCard = document.createElement('section');
  resultCard.className = 'date-result-card';
  panel.append(config, resultCard);
  elements.output.replaceChildren(panel);
  renderDateResult(resultCard);
}

function renderDateResult(panel) {
  panel.replaceChildren();
  const result = calculateDateDetails({
    mode: state.dateTool.mode,
    baseDate: state.dateTool.baseDate,
    targetDate: state.dateTool.targetDate,
    days: state.dateTool.days,
    direction: state.dateTool.direction
  });
  state.dateTool.result = result;
  state.dateTool.error = result.ok ? '' : result.error;
  state.lastOutput = result.ok ? formatDateDetails(result.data) : result.error;

  const head = document.createElement('div');
  head.className = 'date-result-head';
  head.innerHTML = '<strong>计算结果</strong><span>点击卡片复制关键值</span>';
  panel.append(head);

  if (!result.ok) {
    const warning = document.createElement('div');
    warning.className = 'date-warning';
    warning.textContent = result.error;
    panel.append(warning);
    setStatus(result.error, true);
    return;
  }

  const data = result.data;
  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'date-main-result';
  main.innerHTML = '<span></span><strong></strong><small></small>';
  if (data.mode === 'diff') {
    main.querySelector('span').textContent = data.reverse ? '反向相差' : '相差';
    main.querySelector('strong').textContent = `${data.absoluteDays} 天`;
    main.querySelector('small').textContent = formatDatePeriod(data.weeks, data.restDays);
  } else {
    main.querySelector('span').textContent = data.signedDays >= 0 ? '向后推算' : '向前推算';
    main.querySelector('strong').textContent = data.resultDate;
    main.querySelector('small').textContent = `${data.resultWeekday} · ${Math.abs(data.signedDays)} 天`;
  }
  main.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(data.mode === 'diff' ? `${data.absoluteDays} 天` : data.resultDate);
    setStatus('已复制日期结果');
  });

  const timeline = document.createElement('div');
  timeline.className = 'date-timeline';
  const rows =
    data.mode === 'diff'
      ? [
          ['开始', data.baseDate, data.baseWeekday],
          ['结束', data.targetDate, data.targetWeekday],
          ['方向', data.reverse ? '反向' : '正向', data.diffDays >= 0 ? `+${data.diffDays}` : String(data.diffDays)]
        ]
      : [
          ['基准', data.baseDate, data.baseWeekday],
          ['偏移', `${data.signedDays >= 0 ? '+' : ''}${data.signedDays} 天`, formatDatePeriod(data.weeks, data.restDays)],
          ['结果', data.resultDate, data.resultWeekday]
        ];
  rows.forEach(([label, value, meta]) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'date-timeline-card';
    item.innerHTML = '<span></span><strong></strong><small></small>';
    item.querySelector('span').textContent = label;
    item.querySelector('strong').textContent = value;
    item.querySelector('small').textContent = meta;
    item.addEventListener('click', async () => {
      await window.toolkit.writeClipboard(value);
      setStatus(`已复制 ${label}`);
    });
    timeline.append(item);
  });

  panel.append(main, timeline);
  setStatus('日期计算完成');
}

function formatDateDetails(data) {
  if (data.mode === 'diff') {
    return [
      `开始日期: ${data.baseDate} ${data.baseWeekday}`,
      `结束日期: ${data.targetDate} ${data.targetWeekday}`,
      `相差天数: ${data.absoluteDays}`,
      `方向: ${data.reverse ? '反向' : '正向'}`,
      `周数拆分: ${formatDatePeriod(data.weeks, data.restDays)}`
    ].join('\n');
  }
  return [
    `基准日期: ${data.baseDate} ${data.baseWeekday}`,
    `偏移天数: ${data.signedDays >= 0 ? '+' : ''}${data.signedDays}`,
    `结果日期: ${data.resultDate} ${data.resultWeekday}`,
    `周数拆分: ${formatDatePeriod(data.weeks, data.restDays)}`
  ].join('\n');
}

function formatDatePeriod(weeks, restDays) {
  if (!weeks) return `${restDays} 天`;
  if (!restDays) return `${weeks} 周`;
  return `${weeks} 周 ${restDays} 天`;
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderTextExtractor() {
  const panel = document.createElement('div');
  panel.className = 'extractor-tool';

  const inputCard = document.createElement('section');
  inputCard.className = 'extractor-input-card';
  const inputHead = document.createElement('div');
  inputHead.className = 'extractor-head';
  inputHead.innerHTML = '<strong>待提取文本</strong><span>适合日志、接口响应、工单内容、复制出来的网页文本</span>';
  const textarea = document.createElement('textarea');
  textarea.value = state.textExtractor.text;
  textarea.spellcheck = false;
  textarea.placeholder = '粘贴包含 URL、邮箱、手机号、IP、UUID、身份证等内容的文本';
  textarea.addEventListener('input', () => {
    state.textExtractor.text = textarea.value;
    updateTextExtractorResult(resultCard);
  });
  inputCard.append(inputHead, textarea);

  const resultCard = document.createElement('section');
  resultCard.className = 'extractor-result-card';

  panel.append(inputCard, resultCard);
  elements.output.replaceChildren(panel);
  updateTextExtractorResult(resultCard);
}

function updateTextExtractorResult(container) {
  container.replaceChildren();
  const controls = document.createElement('div');
  controls.className = 'extractor-controls';
  const typeList = document.createElement('div');
  typeList.className = 'extractor-type-list';
  [
    ['url', 'URL'],
    ['email', '邮箱'],
    ['phone', '手机号'],
    ['ipv4', 'IPv4'],
    ['uuid', 'UUID'],
    ['idcard', '身份证']
  ].forEach(([type, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `extractor-type${state.textExtractor.types.includes(type) ? ' active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      const current = new Set(state.textExtractor.types);
      if (current.has(type)) current.delete(type);
      else current.add(type);
      state.textExtractor.types = Array.from(current);
      updateTextExtractorResult(container);
    });
    typeList.append(button);
  });

  const copyAll = document.createElement('button');
  copyAll.type = 'button';
  copyAll.className = 'secondary-button';
  copyAll.textContent = '复制全部';
  copyAll.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(state.lastOutput);
    setStatus('已复制全部提取结果');
  });
  controls.append(typeList, copyAll);

  const result = extractTextPatterns(state.textExtractor.text, state.textExtractor.types);
  state.textExtractor.result = result.data;
  state.lastOutput = result.value;

  const summary = document.createElement('div');
  summary.className = 'extractor-summary';
  summary.append(
    renderJsonStatPill('类型', String(state.textExtractor.types.length)),
    renderJsonStatPill('命中', String(result.data.total)),
    renderJsonStatPill('文本', formatCharCount(state.textExtractor.text.length))
  );

  const groups = document.createElement('div');
  groups.className = 'extractor-groups';
  result.data.groups.forEach((group) => groups.append(renderExtractorGroup(group)));
  if (result.data.groups.length === 0 || result.data.total === 0) {
    const empty = document.createElement('div');
    empty.className = 'extractor-empty';
    empty.textContent = state.textExtractor.types.length === 0 ? '请选择至少一种提取类型' : '还没有匹配结果';
    groups.append(empty);
  }

  container.append(controls, summary, groups);
  setStatus(`文本提取完成：${result.data.total} 条`);
  queueOutputSearchRefresh();
}

function renderExtractorGroup(group) {
  const section = document.createElement('section');
  section.className = 'extractor-group';
  const head = document.createElement('div');
  head.className = 'extractor-group-head';
  head.innerHTML = `<strong>${escapeHtml(group.label)}</strong><span>${group.matches.length} 条</span>`;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'secondary-button';
  copy.textContent = '复制';
  copy.disabled = group.matches.length === 0;
  copy.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(group.matches.map((match) => match.value).join('\n'));
    setStatus(`已复制 ${group.label}`);
  });
  head.append(copy);

  const list = document.createElement('div');
  list.className = 'extractor-list';
  group.matches.forEach((match) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'extractor-row';
    row.innerHTML = `<code></code><span>L${match.line}:C${match.column}</span>`;
    row.querySelector('code').textContent = match.value;
    row.addEventListener('click', async () => {
      await window.toolkit.writeClipboard(match.value);
      setStatus(`已复制：${match.value}`);
    });
    list.append(row);
  });
  if (group.matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'extractor-row empty';
    empty.textContent = '无匹配';
    list.append(empty);
  }

  section.append(head, list);
  return section;
}

function renderStats(data) {
  state.lastOutput = JSON.stringify(data, null, 2);
  const panel = document.createElement('div');
  panel.className = 'stats-grid';
  [
    ['总字符', data.total],
    ['总行数', data.lines],
    ['中文字符', data.chinese],
    ['英文字母', data.letters],
    ['数字', data.digits],
    ['空格/Tab', data.spaces],
    ['英文词段', data.words]
  ].forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    panel.append(card);
  });
  elements.output.replaceChildren(panel);
}

function renderTextDiff() {
  const panel = document.createElement('div');
  panel.className = 'diff-tool';

  const editors = document.createElement('div');
  editors.className = 'diff-editors';
  const left = createDiffEditor('原文本', state.textDiff.left, (value) => {
    state.textDiff.left = value;
    updateDiffResult(resultWrap);
  });
  const right = createDiffEditor('新文本', state.textDiff.right, (value) => {
    state.textDiff.right = value;
    updateDiffResult(resultWrap);
  });
  editors.append(left, right);

  const toolbar = document.createElement('div');
  toolbar.className = 'diff-toolbar';
  const ignoreLabel = document.createElement('label');
  const ignore = document.createElement('input');
  ignore.type = 'checkbox';
  ignore.checked = state.textDiff.ignoreWhitespace;
  ignore.addEventListener('change', () => {
    state.textDiff.ignoreWhitespace = ignore.checked;
    updateDiffResult(resultWrap);
  });
  ignoreLabel.append(ignore, document.createTextNode('忽略空白差异'));
  const swap = document.createElement('button');
  swap.type = 'button';
  swap.className = 'secondary-button';
  swap.textContent = '交换左右';
  swap.addEventListener('click', () => {
    [state.textDiff.left, state.textDiff.right] = [state.textDiff.right, state.textDiff.left];
    renderTextDiff();
  });
  toolbar.append(ignoreLabel, swap);

  const resultWrap = document.createElement('div');
  resultWrap.className = 'diff-result';

  panel.append(editors, toolbar, resultWrap);
  elements.output.replaceChildren(panel);
  updateDiffResult(resultWrap);
}

function createDiffEditor(labelText, value, onInput) {
  const label = document.createElement('label');
  label.className = 'diff-editor';
  const title = document.createElement('span');
  title.textContent = labelText;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.spellcheck = false;
  textarea.addEventListener('input', () => onInput(textarea.value));
  label.append(title, textarea);
  return label;
}

function updateDiffResult(container) {
  const result = diffLines(state.textDiff.left, state.textDiff.right, {
    ignoreWhitespace: state.textDiff.ignoreWhitespace
  });
  container.replaceChildren();
  if (!result.ok) {
    state.lastOutput = result.error;
    const message = document.createElement('div');
    message.className = 'diff-warning';
    message.textContent = result.error;
    container.append(message);
    return;
  }

  state.lastOutput = result.value;
  const { summary, rows } = result.data;
  const summaryBar = document.createElement('div');
  summaryBar.className = 'diff-summary';
  summaryBar.innerHTML = `
    <strong>${summary.leftLines} → ${summary.rightLines} 行</strong>
    <span>新增 ${summary.added}</span>
    <span>删除 ${summary.removed}</span>
    <span>相同 ${summary.equal}</span>
  `;
  const rowsWrap = document.createElement('div');
  rowsWrap.className = 'diff-rows';
  rows.forEach((row) => {
    const line = document.createElement('div');
    line.className = `diff-row ${row.type}`;
    line.innerHTML = `<span>${row.leftLine}</span><span>${row.rightLine}</span><code></code>`;
    line.querySelector('code').textContent = row.text || ' ';
    rowsWrap.append(line);
  });
  container.append(summaryBar, rowsWrap);
}

function renderJsonDiffTool() {
  const panel = document.createElement('div');
  panel.className = 'json-diff-tool';

  const editors = document.createElement('div');
  editors.className = 'json-diff-editors';
  editors.append(
    renderJsonDiffEditor('左侧 JSON', state.jsonDiff.left, (value) => {
      state.jsonDiff.left = value;
      updateJsonDiffResult(resultWrap);
    }),
    renderJsonDiffEditor('右侧 JSON', state.jsonDiff.right, (value) => {
      state.jsonDiff.right = value;
      updateJsonDiffResult(resultWrap);
    })
  );

  const resultWrap = document.createElement('div');
  resultWrap.className = 'json-diff-result';
  panel.append(editors, resultWrap);
  elements.output.replaceChildren(panel);
  updateJsonDiffResult(resultWrap);
}

function renderJsonDiffEditor(labelText, value, onInput) {
  const label = document.createElement('label');
  label.className = 'json-diff-editor';
  const title = document.createElement('span');
  title.textContent = labelText;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.spellcheck = false;
  textarea.addEventListener('input', () => onInput(textarea.value));
  label.append(title, textarea);
  return label;
}

function updateJsonDiffResult(container) {
  container.replaceChildren();
  const result = compareJsonInputs(state.jsonDiff.left, state.jsonDiff.right);
  if (!result.ok) {
    state.lastOutput = result.error;
    const warning = document.createElement('div');
    warning.className = 'json-diff-warning';
    warning.textContent = result.error;
    container.append(warning);
    setStatus(result.error, true);
    queueOutputSearchRefresh();
    return;
  }

  state.jsonDiff.result = result.data;
  state.lastOutput = result.value;
  const toolbar = document.createElement('div');
  toolbar.className = 'json-diff-toolbar';
  const summary = document.createElement('div');
  summary.className = 'json-diff-summary';
  summary.append(
    renderJsonStatPill('新增', String(result.data.summary.added)),
    renderJsonStatPill('删除', String(result.data.summary.removed)),
    renderJsonStatPill('变更', String(result.data.summary.changed))
  );
  if (result.data.summary.truncated) summary.append(renderJsonStatPill('状态', '已截断'));

  const filters = document.createElement('div');
  filters.className = 'json-diff-filters';
  [
    ['all', '全部'],
    ['added', '新增'],
    ['removed', '删除'],
    ['changed', '变更']
  ].forEach(([type, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `json-diff-filter${state.jsonDiff.filter === type ? ' active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      state.jsonDiff.filter = type;
      updateJsonDiffResult(container);
    });
    filters.append(button);
  });
  toolbar.append(summary, filters);

  const list = document.createElement('div');
  list.className = 'json-diff-list';
  const visibleChanges =
    state.jsonDiff.filter === 'all' ? result.data.changes : result.data.changes.filter((change) => change.type === state.jsonDiff.filter);
  if (visibleChanges.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'json-diff-empty';
    empty.textContent = result.data.changes.length === 0 ? '两个 JSON 完全一致' : '当前筛选下没有差异';
    list.append(empty);
  } else {
    visibleChanges.forEach((change) => list.append(renderJsonDiffChange(change)));
  }
  container.append(toolbar, list);
  setStatus(result.data.changes.length === 0 ? 'JSON 对比一致' : `JSON 对比完成：${result.data.changes.length} 处差异`);
  queueOutputSearchRefresh();
}

function renderJsonDiffChange(change) {
  const row = document.createElement('article');
  row.className = `json-diff-change ${change.type}`;
  const head = document.createElement('div');
  head.className = 'json-diff-change-head';
  const typeLabel = change.type === 'added' ? '新增' : change.type === 'removed' ? '删除' : '变更';
  head.innerHTML = `<strong>${typeLabel}</strong><code></code>`;
  head.querySelector('code').textContent = change.path;
  const copyPath = document.createElement('button');
  copyPath.type = 'button';
  copyPath.className = 'secondary-button';
  copyPath.textContent = '复制 Path';
  copyPath.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(change.path);
    setStatus(`已复制 Path：${change.path}`);
  });
  head.append(copyPath);

  const values = document.createElement('div');
  values.className = 'json-diff-values';
  if (change.type !== 'added') values.append(renderJsonDiffValue('左', change.left));
  if (change.type !== 'removed') values.append(renderJsonDiffValue('右', change.right));
  row.append(head, values);
  return row;
}

function renderJsonDiffValue(labelText, value) {
  const block = document.createElement('div');
  block.className = 'json-diff-value';
  const label = document.createElement('span');
  label.textContent = labelText;
  const code = document.createElement('code');
  code.textContent = formatJsonDiffDisplayValue(value);
  block.append(label, code);
  return block;
}

function formatJsonDiffDisplayValue(value) {
  const text = JSON.stringify(value, null, 2);
  if (text === undefined) return String(value);
  return text.length > 600 ? `${text.slice(0, 597)}...` : text;
}

function renderSqlEsConverter() {
  const panel = document.createElement('div');
  panel.className = 'sql-tool';

  const inputCard = document.createElement('label');
  inputCard.className = 'sql-input-card';
  inputCard.innerHTML = '<span>INSERT SQL</span>';
  const sqlInput = document.createElement('textarea');
  sqlInput.value = state.sqlEs.sql;
  sqlInput.spellcheck = false;
  sqlInput.placeholder = "INSERT INTO users (id,name,age) VALUES (1,'Alice',18),(2,'Bob',20);";
  const resultWrap = document.createElement('div');
  resultWrap.className = 'sql-result';
  sqlInput.addEventListener('input', () => {
    state.sqlEs.sql = sqlInput.value;
    updateSqlEsResult(resultWrap);
  });
  inputCard.append(sqlInput);

  const toolbar = document.createElement('div');
  toolbar.className = 'sql-toolbar';
  const modes = document.createElement('div');
  modes.className = 'sql-modes';
  [
    ['json', 'JSON 数据'],
    ['bulk', 'ES Bulk']
  ].forEach(([mode, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sql-mode${state.sqlEs.outputMode === mode ? ' active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      state.sqlEs.outputMode = mode;
      renderSqlEsConverter();
    });
    modes.append(button);
  });

  const indexLabel = document.createElement('label');
  indexLabel.className = 'sql-index-field';
  indexLabel.innerHTML = '<span>ES 索引名</span>';
  const indexInput = document.createElement('input');
  indexInput.value = state.sqlEs.indexName;
  indexInput.placeholder = '默认使用 INSERT 表名';
  indexInput.disabled = state.sqlEs.outputMode !== 'bulk';
  indexInput.addEventListener('input', () => {
    state.sqlEs.indexName = indexInput.value;
    updateSqlEsResult(resultWrap);
  });
  indexLabel.append(indexInput);

  toolbar.append(modes, indexLabel);
  panel.append(inputCard, toolbar, resultWrap);
  elements.output.replaceChildren(panel);
  updateSqlEsResult(resultWrap);
}

function updateSqlEsResult(container) {
  container.replaceChildren();
  const sql = state.sqlEs.sql.trim();
  if (!sql) {
    state.lastOutput = '';
    container.append(renderSqlWarning('请输入 INSERT SQL'));
    return;
  }

  if (sql.length > GENERAL_LIVE_RUN_CHAR_LIMIT) {
    const message = `SQL 内容过大：${formatCharCount(sql.length)}，请缩小范围后再转换。`;
    state.lastOutput = message;
    container.append(renderSqlWarning(message));
    return;
  }

  const parsed = parseInsertSql(sql);
  if (!parsed.ok) {
    state.lastOutput = parsed.error;
    container.append(renderSqlWarning(parsed.error));
    return;
  }

  const outputResult =
    state.sqlEs.outputMode === 'bulk'
      ? buildElasticBulkFromRows(parsed.table, parsed.rows, state.sqlEs.indexName || parsed.table)
      : { ok: true, value: JSON.stringify(parsed.rows, null, 2) };
  if (!outputResult.ok) {
    state.lastOutput = outputResult.error;
    container.append(renderSqlWarning(outputResult.error));
    return;
  }

  state.lastOutput = outputResult.value;
  const summary = document.createElement('div');
  summary.className = 'sql-summary';
  [
    ['表名', parsed.table],
    ['字段', `${Object.keys(parsed.rows[0] ?? {}).length} 个`],
    ['行数', `${parsed.rows.length} 行`],
    ['输出', state.sqlEs.outputMode === 'bulk' ? 'ES Bulk NDJSON' : 'JSON Array']
  ].forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'sql-summary-card';
    card.innerHTML = `<span>${label}</span><strong>${escapeHtml(value)}</strong>`;
    summary.append(card);
  });

  const body = document.createElement('div');
  body.className = 'sql-body';
  body.append(renderSqlRowsPreview(parsed.rows), renderSqlOutput(outputResult.value));
  container.append(summary, body);
  setStatus('SQL 已转换');
}

function renderSqlRowsPreview(rows) {
  const panel = document.createElement('section');
  panel.className = 'sql-preview-panel';
  const title = document.createElement('div');
  title.className = 'sql-panel-title';
  title.innerHTML = `<strong>行数据预览</strong><span>最多显示前 20 行</span>`;
  const tableWrap = document.createElement('div');
  tableWrap.className = 'sql-table-wrap';
  const table = document.createElement('table');
  table.className = 'sql-data-table';
  const columns = Object.keys(rows[0] ?? {});
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>`;
  const tbody = document.createElement('tbody');
  rows.slice(0, 20).forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = columns.map((column) => `<td>${escapeHtml(formatSqlCell(row[column]))}</td>`).join('');
    tbody.append(tr);
  });
  table.append(thead, tbody);
  tableWrap.append(table);
  panel.append(title, tableWrap);
  return panel;
}

function renderSqlOutput(value) {
  const panel = document.createElement('section');
  panel.className = 'sql-output-panel';
  const title = document.createElement('div');
  title.className = 'sql-panel-title';
  title.innerHTML = '<strong>生成结果</strong><span>复制按钮会复制这里的内容</span>';
  const pre = document.createElement('pre');
  pre.className = 'sql-output-code';
  pre.textContent = value;
  panel.append(title, pre);
  return panel;
}

function renderSqlWarning(message) {
  const warning = document.createElement('div');
  warning.className = 'sql-warning';
  warning.textContent = message;
  return warning;
}

function formatSqlCell(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function renderJwtAnalyzer() {
  const panel = document.createElement('div');
  panel.className = 'jwt-tool';

  const inputCard = document.createElement('label');
  inputCard.className = 'jwt-token-card';
  inputCard.innerHTML = '<span>JWT Token</span>';
  const token = document.createElement('textarea');
  token.value = state.jwtAnalyzer.token;
  token.spellcheck = false;
  token.placeholder = '粘贴 Header.Payload.Signature';
  token.addEventListener('input', () => {
    state.jwtAnalyzer.token = token.value.trim();
    updateJwtResult(resultWrap);
  });
  inputCard.append(token);

  const resultWrap = document.createElement('div');
  resultWrap.className = 'jwt-result';

  panel.append(inputCard, resultWrap);
  elements.output.replaceChildren(panel);
  updateJwtResult(resultWrap);
}

function updateJwtResult(container) {
  container.replaceChildren();
  const token = state.jwtAnalyzer.token.trim();
  if (!token) {
    state.lastOutput = '';
    const empty = document.createElement('div');
    empty.className = 'jwt-warning';
    empty.textContent = '粘贴 JWT 后自动解析 Header 和 Payload。';
    container.append(empty);
    return;
  }

  if (token.length > GENERAL_LIVE_RUN_CHAR_LIMIT) {
    const message = `JWT 内容过大：${formatCharCount(token.length)}，请缩小范围后再分析。`;
    state.lastOutput = message;
    container.append(renderJwtWarning(message));
    return;
  }

  const result = parseJwtData(token);
  if (!result.ok) {
    state.lastOutput = result.error;
    container.append(renderJwtWarning(result.error));
    return;
  }

  const { header, payload, analysis, segments } = result.data;
  state.lastOutput = result.value;

  const overview = document.createElement('div');
  overview.className = 'jwt-overview';
  const status = jwtStatusText(analysis);
  [
    ['状态', status.label, status.kind],
    ['算法', analysis.algorithm || '未知', 'info'],
    ['类型', analysis.type || 'JWT', 'info'],
    ['签名', segments.signature ? `${segments.signature.length} 字符` : '无签名段', segments.signature ? 'info' : 'warn']
  ].forEach(([label, value, kind]) => {
    const card = document.createElement('div');
    card.className = `jwt-status-card ${kind}`;
    card.innerHTML = `<span>${label}</span><strong>${escapeHtml(value)}</strong>`;
    overview.append(card);
  });

  const timeline = document.createElement('div');
  timeline.className = 'jwt-timeline';
  [
    ['签发时间', analysis.issuedAt],
    ['生效时间', analysis.notBefore],
    ['过期时间', analysis.expiresAt]
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.innerHTML = `<span>${label}</span><strong>${escapeHtml(formatJwtDate(value))}</strong>`;
    timeline.append(item);
  });

  const grid = document.createElement('div');
  grid.className = 'jwt-grid';
  grid.append(
    renderJwtJsonPanel('Header', header),
    renderJwtJsonPanel('Payload', payload),
    renderJwtSegmentPanel(segments)
  );

  container.append(overview, timeline, grid);
}

function renderJwtJsonPanel(title, value) {
  const panel = document.createElement('section');
  panel.className = 'jwt-json-panel';
  const heading = document.createElement('div');
  heading.className = 'jwt-panel-title';
  heading.textContent = title;
  const pre = document.createElement('pre');
  pre.className = 'jwt-json-code';
  appendHighlightedJson(pre, JSON.stringify(value, null, 2));
  panel.append(heading, pre);
  return panel;
}

function renderJwtSegmentPanel(segments) {
  const panel = document.createElement('section');
  panel.className = 'jwt-segment-panel';
  const heading = document.createElement('div');
  heading.className = 'jwt-panel-title';
  heading.textContent = 'Token Segments';
  const list = document.createElement('div');
  list.className = 'jwt-segments';
  [
    ['Header', segments.header],
    ['Payload', segments.payload],
    ['Signature', segments.signature || '(empty)']
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'jwt-segment';
    item.innerHTML = `<span>${label}</span><code></code>`;
    item.querySelector('code').textContent = value;
    list.append(item);
  });
  panel.append(heading, list);
  return panel;
}

function appendHighlightedJson(parent, json) {
  const tokenPattern = /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|(\b-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}[\],:])/gi;
  let cursor = 0;
  for (const match of json.matchAll(tokenPattern)) {
    if (match.index > cursor) parent.append(document.createTextNode(json.slice(cursor, match.index)));
    const span = document.createElement('span');
    if (match[1]) span.className = 'token-key';
    else if (match[2]) span.className = 'token-string';
    else if (match[3]) span.className = 'token-number';
    else if (match[4]) span.className = 'token-boolean';
    else if (match[5]) span.className = 'token-null';
    else span.className = 'token-punctuation';
    span.textContent = match[0];
    parent.append(span);
    cursor = match.index + match[0].length;
  }
  if (cursor < json.length) parent.append(document.createTextNode(json.slice(cursor)));
}

function renderJwtWarning(message) {
  const warning = document.createElement('div');
  warning.className = 'jwt-warning';
  warning.textContent = message;
  return warning;
}

function jwtStatusText(analysis) {
  if (analysis.expired === true) return { label: '已过期', kind: 'danger' };
  if (analysis.expired === false) return { label: '有效', kind: 'success' };
  return { label: '无 exp', kind: 'warn' };
}

function formatJwtDate(value) {
  if (!value) return '未提供';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function renderCronBuilder() {
  const panel = document.createElement('div');
  panel.className = 'cron-tool';

  const expressionCard = document.createElement('div');
  expressionCard.className = 'cron-expression-card';
  const expressionLabel = document.createElement('label');
  expressionLabel.innerHTML = '<span>Cron 表达式</span>';
  const expressionInput = document.createElement('input');
  expressionInput.value = state.cronBuilder.expression;
  expressionInput.placeholder = '*/5 * * * *';
  expressionInput.spellcheck = false;
  expressionInput.addEventListener('input', () => {
    state.cronBuilder.expression = expressionInput.value;
    state.cronBuilder.mode = 'custom';
    syncCronFieldsFromExpression(expressionInput.value);
    updateCronResult(resultWrap);
  });
  expressionLabel.append(expressionInput);

  const summary = document.createElement('div');
  summary.className = 'cron-readable';
  const description = describeCronExpression(state.cronBuilder.expression);
  summary.textContent = description.ok ? description.value : description.error;
  expressionCard.append(expressionLabel, summary);

  const presetRow = document.createElement('div');
  presetRow.className = 'cron-presets';
  [
    ['每分钟', 'every-minute', '* * * * *'],
    ['每 5 分钟', 'interval', '*/5 * * * *'],
    ['每小时', 'hourly', '0 * * * *'],
    ['每天 09:00', 'daily', '0 9 * * *'],
    ['每周一 09:00', 'weekly', '0 9 * * 1'],
    ['每月 1 日', 'monthly', '0 9 1 * *']
  ].forEach(([label, mode, expression]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cron-preset';
    button.textContent = label;
    button.addEventListener('click', () => {
      state.cronBuilder.mode = mode;
      state.cronBuilder.expression = expression;
      syncCronFieldsFromExpression(expression);
      syncCronModeValuesFromFields();
      renderCronBuilder();
    });
    presetRow.append(button);
  });

  const body = document.createElement('div');
  body.className = 'cron-body';

  const config = document.createElement('div');
  config.className = 'cron-config';

  const modes = document.createElement('div');
  modes.className = 'cron-modes';
  [
    ['interval', '间隔'],
    ['hourly', '每小时'],
    ['daily', '每天'],
    ['weekly', '每周'],
    ['monthly', '每月'],
    ['custom', '自定义']
  ].forEach(([mode, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cron-mode${state.cronBuilder.mode === mode ? ' active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      state.cronBuilder.mode = mode;
      applyCronModeToExpression();
      renderCronBuilder();
    });
    modes.append(button);
  });

  const modeControls = document.createElement('div');
  modeControls.className = 'cron-mode-controls';
  renderCronModeControls(modeControls);

  const fieldGrid = document.createElement('div');
  fieldGrid.className = 'cron-fields';
  [
    ['minute', '分', '0-59, *, */5'],
    ['hour', '时', '0-23, *'],
    ['dayOfMonth', '日', '1-31, *'],
    ['month', '月', '1-12, *'],
    ['dayOfWeek', '周', '0-7, *']
  ].forEach(([key, labelText, placeholder]) => {
    const label = document.createElement('label');
    label.innerHTML = `<span>${labelText}</span>`;
    const input = document.createElement('input');
    input.value = state.cronBuilder.fields[key];
    input.placeholder = placeholder;
    input.spellcheck = false;
    input.addEventListener('change', () => {
      state.cronBuilder.mode = 'custom';
      state.cronBuilder.fields[key] = input.value;
      state.cronBuilder.expression = buildCronExpressionFromParts(state.cronBuilder.fields);
      renderCronBuilder();
    });
    label.append(input);
    fieldGrid.append(label);
  });

  config.append(modes, modeControls, fieldGrid);

  const resultWrap = document.createElement('div');
  resultWrap.className = 'cron-result';

  body.append(config, resultWrap);
  panel.append(expressionCard, presetRow, body);
  elements.output.replaceChildren(panel);
  updateCronResult(resultWrap);
}

function renderCronModeControls(container) {
  const addNumber = (key, labelText, { min, max, suffix = '' }) => {
    const label = document.createElement('label');
    label.innerHTML = `<span>${labelText}</span>`;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.value = String(state.cronBuilder[key]);
    input.addEventListener('change', () => {
      state.cronBuilder[key] = clampNumber(input.value, min, max);
      applyCronModeToExpression();
      renderCronBuilder();
    });
    label.append(input);
    if (suffix) {
      const hint = document.createElement('small');
      hint.textContent = suffix;
      label.append(hint);
    }
    container.append(label);
  };

  if (state.cronBuilder.mode === 'interval') {
    addNumber('interval', '每隔分钟数', { min: 1, max: 59, suffix: '分钟' });
  } else if (state.cronBuilder.mode === 'hourly') {
    addNumber('minute', '每小时第几分钟', { min: 0, max: 59, suffix: '分' });
  } else if (state.cronBuilder.mode === 'daily') {
    addNumber('hour', '小时', { min: 0, max: 23, suffix: '时' });
    addNumber('minute', '分钟', { min: 0, max: 59, suffix: '分' });
  } else if (state.cronBuilder.mode === 'weekly') {
    const label = document.createElement('label');
    label.innerHTML = '<span>星期</span>';
    const select = document.createElement('select');
    [
      ['1', '周一'],
      ['2', '周二'],
      ['3', '周三'],
      ['4', '周四'],
      ['5', '周五'],
      ['6', '周六'],
      ['0', '周日']
    ].forEach(([value, text]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.append(option);
    });
    select.value = String(state.cronBuilder.dayOfWeek);
    select.addEventListener('change', () => {
      state.cronBuilder.dayOfWeek = Number(select.value);
      applyCronModeToExpression();
      renderCronBuilder();
    });
    label.append(select);
    container.append(label);
    addNumber('hour', '小时', { min: 0, max: 23, suffix: '时' });
    addNumber('minute', '分钟', { min: 0, max: 59, suffix: '分' });
  } else if (state.cronBuilder.mode === 'monthly') {
    addNumber('dayOfMonth', '每月日期', { min: 1, max: 31, suffix: '日' });
    addNumber('hour', '小时', { min: 0, max: 23, suffix: '时' });
    addNumber('minute', '分钟', { min: 0, max: 59, suffix: '分' });
  } else {
    const tip = document.createElement('div');
    tip.className = 'cron-custom-tip';
    tip.textContent = '直接编辑上方表达式，或调整下方 5 个字段。';
    container.append(tip);
  }
}

async function updateCronResult(container) {
  const expression = state.cronBuilder.expression.trim();
  const runId = ++state.cronBuilder.sequence;
  container.replaceChildren();

  const parsed = parseCronExpressionFields(expression);
  if (!parsed.ok) {
    state.lastOutput = parsed.error;
    container.append(renderCronWarning(parsed.error));
    return;
  }

  const head = document.createElement('div');
  head.className = 'cron-result-head';
  const description = describeCronExpression(expression);
  head.innerHTML = `<span>解析结果</span><strong>${escapeHtml(expression)}</strong><small>${escapeHtml(description.value)}</small>`;
  container.append(head);

  const list = document.createElement('div');
  list.className = 'cron-next-list loading';
  list.textContent = '正在计算未来 5 次...';
  container.append(list);

  try {
    const next = await window.toolkit.cronNext(expression);
    if (runId !== state.cronBuilder.sequence) return;
    const lines = String(next).split(/\r?\n/).filter(Boolean);
    state.lastOutput = [`Cron: ${expression}`, description.value, '', '未来 5 次:', ...lines].join('\n');
    list.className = 'cron-next-list';
    list.replaceChildren(
      ...lines.map((line, index) => {
        const item = document.createElement('div');
        item.className = 'cron-next-item';
        item.innerHTML = `<span>#${index + 1}</span><strong>${escapeHtml(formatCronNextTime(line))}</strong><small>${escapeHtml(line)}</small>`;
        return item;
      })
    );
    setStatus('Cron 预览已更新');
  } catch (error) {
    if (runId !== state.cronBuilder.sequence) return;
    const message = error instanceof Error ? error.message : String(error);
    state.lastOutput = message;
    list.replaceWith(renderCronWarning(message));
    setStatus(message, true);
  }
}

function renderCronWarning(message) {
  const warning = document.createElement('div');
  warning.className = 'cron-warning';
  warning.textContent = message;
  return warning;
}

function applyCronModeToExpression() {
  const cron = state.cronBuilder;
  if (cron.mode === 'interval') {
    cron.fields = { minute: `*/${cron.interval}`, hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' };
  } else if (cron.mode === 'hourly') {
    cron.fields = { minute: String(cron.minute), hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' };
  } else if (cron.mode === 'daily') {
    cron.fields = { minute: String(cron.minute), hour: String(cron.hour), dayOfMonth: '*', month: '*', dayOfWeek: '*' };
  } else if (cron.mode === 'weekly') {
    cron.fields = { minute: String(cron.minute), hour: String(cron.hour), dayOfMonth: '*', month: '*', dayOfWeek: String(cron.dayOfWeek) };
  } else if (cron.mode === 'monthly') {
    cron.fields = { minute: String(cron.minute), hour: String(cron.hour), dayOfMonth: String(cron.dayOfMonth), month: '*', dayOfWeek: '*' };
  }
  cron.expression = buildCronExpressionFromParts(cron.fields);
}

function syncCronFieldsFromExpression(expression) {
  const parsed = parseCronExpressionFields(expression);
  if (!parsed.ok) return false;
  state.cronBuilder.fields = parsed.data;
  return true;
}

function syncCronModeValuesFromFields() {
  const { minute, hour, dayOfMonth, dayOfWeek } = state.cronBuilder.fields;
  const interval = minute.match(/^\*\/(\d+)$/);
  if (interval) state.cronBuilder.interval = clampNumber(interval[1], 1, 59);
  if (/^\d+$/.test(minute)) state.cronBuilder.minute = clampNumber(minute, 0, 59);
  if (/^\d+$/.test(hour)) state.cronBuilder.hour = clampNumber(hour, 0, 23);
  if (/^\d+$/.test(dayOfMonth)) state.cronBuilder.dayOfMonth = clampNumber(dayOfMonth, 1, 31);
  if (/^\d+$/.test(dayOfWeek)) state.cronBuilder.dayOfWeek = clampNumber(dayOfWeek, 0, 7);
}

function clampNumber(value, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function formatCronNextTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function renderTimestampConverter() {
  const panel = document.createElement('div');
  panel.className = 'timestamp-tool';

  const inputCard = document.createElement('section');
  inputCard.className = 'timestamp-input-card';
  const head = document.createElement('div');
  head.className = 'timestamp-head';
  head.innerHTML = '<strong>时间戳转换</strong><span>秒、毫秒、ISO、UTC、本地时间互转</span>';

  const inputRow = document.createElement('div');
  inputRow.className = 'timestamp-input-row';
  const input = document.createElement('input');
  input.value = state.timestampTool.input;
  input.placeholder = '1717999200 或 2024-06-10T02:00:00Z';
  input.spellcheck = false;
  const nowButton = document.createElement('button');
  nowButton.type = 'button';
  nowButton.className = 'primary-button';
  nowButton.textContent = '当前时间';
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'secondary-button';
  clearButton.textContent = '清空';
  inputRow.append(input, nowButton, clearButton);

  const hint = document.createElement('div');
  hint.className = 'timestamp-hint';
  hint.textContent = '留空会使用当前时间；数字小于 100000000000 按秒处理，否则按毫秒处理。';
  inputCard.append(head, inputRow, hint);

  const resultCard = document.createElement('section');
  resultCard.className = 'timestamp-result-card';

  input.addEventListener('input', () => {
    state.timestampTool.input = input.value;
    updateTimestampResult(resultCard);
  });
  nowButton.addEventListener('click', () => {
    state.timestampTool.input = String(Date.now());
    input.value = state.timestampTool.input;
    updateTimestampResult(resultCard);
  });
  clearButton.addEventListener('click', () => {
    state.timestampTool.input = '';
    input.value = '';
    updateTimestampResult(resultCard);
  });

  panel.append(inputCard, resultCard);
  elements.output.replaceChildren(panel);
  updateTimestampResult(resultCard);
}

function updateTimestampResult(container) {
  container.replaceChildren();
  const result = inspectDateTime(state.timestampTool.input);
  state.timestampTool.result = result.ok ? result.data : null;
  state.timestampTool.error = result.ok ? '' : result.error;
  state.lastOutput = result.ok ? result.value : result.error;

  if (!result.ok) {
    const warning = document.createElement('div');
    warning.className = 'timestamp-warning';
    warning.textContent = result.error;
    container.append(warning);
    setStatus(result.error, true);
    queueOutputSearchRefresh();
    return;
  }

  const data = result.data;
  const overview = document.createElement('div');
  overview.className = 'timestamp-overview';
  overview.append(
    renderTimestampBadge('输入类型', timestampInputUnitLabel(data.inputUnit), 'info'),
    renderTimestampBadge('本地时区', formatTimezoneOffset(data.timezoneOffsetMinutes), 'muted'),
    renderTimestampBadge('星期', formatTimestampWeekday(data.milliseconds), 'ok')
  );

  const grid = document.createElement('div');
  grid.className = 'timestamp-grid';
  [
    ['秒级时间戳', String(data.seconds), 'seconds'],
    ['毫秒时间戳', String(data.milliseconds), 'milliseconds'],
    ['ISO 时间', data.iso, 'iso'],
    ['UTC 时间', data.utc, 'utc'],
    ['本地时间', data.local, 'local']
  ].forEach(([label, value, tone]) => {
    grid.append(renderTimestampValueCard(label, value, tone));
  });

  container.append(overview, grid);
  setStatus('时间转换完成');
  queueOutputSearchRefresh();
}

function renderTimestampBadge(labelText, value, tone) {
  const badge = document.createElement('div');
  badge.className = `timestamp-badge ${tone}`;
  badge.innerHTML = `<span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong>`;
  return badge;
}

function renderTimestampValueCard(labelText, value, tone) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `timestamp-value-card ${tone}`;
  card.innerHTML = `<span>${escapeHtml(labelText)}</span><code></code><small>点击复制</small>`;
  card.querySelector('code').textContent = value;
  card.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(value);
    setStatus(`已复制${labelText}`);
  });
  return card;
}

function timestampInputUnitLabel(unit) {
  const labels = {
    seconds: '秒',
    milliseconds: '毫秒',
    datetime: '日期时间',
    current: '当前时间'
  };
  return labels[unit] ?? unit;
}

function formatTimezoneOffset(minutes) {
  const total = -Number(minutes || 0);
  const sign = total >= 0 ? '+' : '-';
  const absolute = Math.abs(total);
  const hour = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minute = String(absolute % 60).padStart(2, '0');
  return `UTC${sign}${hour}:${minute}`;
}

function formatTimestampWeekday(milliseconds) {
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('zh-CN', { weekday: 'long' });
}

function renderBase64Tool() {
  const panel = document.createElement('div');
  panel.className = 'base64-tool';

  const inputCard = document.createElement('section');
  inputCard.className = 'base64-input-card';

  const head = document.createElement('div');
  head.className = 'base64-head';
  head.innerHTML = '<strong>Base64 编解码</strong><span>文本、URL-safe、Data URI、图片预览</span>';

  const modes = document.createElement('div');
  modes.className = 'base64-mode-switch';
  [
    ['encode', '文本 → Base64'],
    ['decode', 'Base64 → 文本']
  ].forEach(([mode, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `base64-mode${state.base64Tool.mode === mode ? ' active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      state.base64Tool.mode = mode;
      if (mode === 'decode' && !state.base64Tool.encoded) {
        state.base64Tool.encoded = encodeBase64Detailed(state.base64Tool.text || '工具箱').value;
      }
      renderBase64Tool();
    });
    modes.append(button);
  });

  const textarea = document.createElement('textarea');
  textarea.spellcheck = false;
  textarea.value = state.base64Tool.mode === 'encode' ? state.base64Tool.text : state.base64Tool.encoded;
  textarea.placeholder = state.base64Tool.mode === 'encode' ? '输入要编码的文本' : '粘贴 Base64 或 data:image/png;base64,...';
  textarea.addEventListener('input', () => {
    if (state.base64Tool.mode === 'encode') state.base64Tool.text = textarea.value;
    else state.base64Tool.encoded = textarea.value;
    updateBase64Result(resultCard);
  });

  const options = document.createElement('div');
  options.className = 'base64-options';
  const urlSafe = renderBase64Toggle('URL-safe', state.base64Tool.urlSafe, (checked) => {
    state.base64Tool.urlSafe = checked;
    updateBase64Result(resultCard);
  });
  const dataUri = renderBase64Toggle('Data URI', state.base64Tool.dataUri, (checked) => {
    state.base64Tool.dataUri = checked;
    updateBase64Result(resultCard);
  });
  const mime = document.createElement('input');
  mime.value = state.base64Tool.mimeType;
  mime.placeholder = 'text/plain;charset=utf-8';
  mime.disabled = state.base64Tool.mode !== 'encode' || !state.base64Tool.dataUri;
  mime.addEventListener('input', () => {
    state.base64Tool.mimeType = mime.value;
    updateBase64Result(resultCard);
  });
  options.append(urlSafe, dataUri, labelWrap('MIME', mime));

  inputCard.append(head, modes, textarea, options);

  const resultCard = document.createElement('section');
  resultCard.className = 'base64-result-card';
  panel.append(inputCard, resultCard);
  elements.output.replaceChildren(panel);
  updateBase64Result(resultCard);
}

function renderBase64Toggle(labelText, checked, onChange) {
  const label = document.createElement('label');
  label.className = 'base64-toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const span = document.createElement('span');
  span.textContent = labelText;
  label.append(input, span);
  return label;
}

function updateBase64Result(container) {
  container.replaceChildren();
  const result =
    state.base64Tool.mode === 'encode'
      ? encodeBase64Detailed(state.base64Tool.text, {
          urlSafe: state.base64Tool.urlSafe,
          dataUri: state.base64Tool.dataUri,
          mimeType: state.base64Tool.mimeType
        })
      : decodeBase64Detailed(state.base64Tool.encoded);

  state.base64Tool.result = result.ok ? result.data : null;
  state.base64Tool.error = result.ok ? '' : result.error;
  state.lastOutput = result.ok ? result.value : result.error;

  if (!result.ok) {
    const warning = document.createElement('div');
    warning.className = 'base64-warning';
    warning.textContent = result.error;
    container.append(warning);
    setStatus(result.error, true);
    queueOutputSearchRefresh();
    return;
  }

  const data = result.data;
  const summary = document.createElement('div');
  summary.className = 'base64-summary';
  if (state.base64Tool.mode === 'encode') {
    summary.append(
      renderBase64Metric('字符', String(data.chars), 'text'),
      renderBase64Metric('字节', String(data.bytes), 'bytes'),
      renderBase64Metric('模式', data.urlSafe ? 'URL-safe' : '标准', 'mode'),
      renderBase64Metric('输出', data.dataUri ? 'Data URI' : 'Base64', 'kind')
    );
  } else {
    summary.append(
      renderBase64Metric('字符', String(data.chars), 'text'),
      renderBase64Metric('字节', String(data.bytes), 'bytes'),
      renderBase64Metric('来源', data.isDataUri ? 'Data URI' : data.urlSafe ? 'URL-safe' : 'Base64', 'kind'),
      renderBase64Metric('MIME', data.mimeType || '-', 'mode')
    );
  }

  const output = document.createElement('div');
  output.className = 'base64-output-card';
  output.innerHTML = `<span>${state.base64Tool.mode === 'encode' ? '编码结果' : '解码结果'}</span>`;
  const code = document.createElement('code');
  code.textContent = result.value;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'secondary-button';
  copy.textContent = '复制结果';
  copy.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(result.value);
    setStatus('Base64 结果已复制');
  });
  output.append(code, copy);

  const preview = renderBase64Preview(result);
  container.append(summary, output, preview);
  setStatus('Base64 已转换');
  queueOutputSearchRefresh();
}

function renderBase64Metric(labelText, value, tone) {
  const item = document.createElement('div');
  item.className = `base64-metric ${tone}`;
  item.innerHTML = `<span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong>`;
  return item;
}

function renderBase64Preview(result) {
  const preview = document.createElement('div');
  preview.className = 'base64-preview-card';
  preview.innerHTML = '<span>预览</span>';
  const data = result.data;
  const dataUri =
    state.base64Tool.mode === 'encode' && data.dataUri
      ? result.value
      : state.base64Tool.mode === 'decode' && data.isDataUri
        ? state.base64Tool.encoded.trim()
        : '';

  if (/^data:image\//i.test(dataUri)) {
    const img = document.createElement('img');
    img.src = dataUri;
    img.alt = 'Base64 图片预览';
    preview.append(img);
    return preview;
  }

  const text = document.createElement('p');
  text.textContent =
    state.base64Tool.mode === 'decode'
      ? '当前内容按文本解码展示；如果粘贴 data:image/... 会自动显示图片预览。'
      : state.base64Tool.dataUri
        ? '当前 MIME 不是图片类型，因此不显示图片预览。'
        : '开启 Data URI 并设置 image/* MIME 后可预览图片。';
  preview.append(text);
  return preview;
}

function renderRegexTester() {
  const panel = document.createElement('div');
  panel.className = 'regex-tool';

  const config = document.createElement('div');
  config.className = 'regex-config';

  const patternLabel = document.createElement('label');
  patternLabel.className = 'regex-pattern-field';
  patternLabel.innerHTML = '<span>Pattern</span>';
  const pattern = document.createElement('input');
  pattern.value = state.regexTester.pattern;
  pattern.placeholder = '例如 [A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+';
  pattern.spellcheck = false;
  pattern.addEventListener('input', () => {
    state.regexTester.pattern = pattern.value;
    updateRegexResult(resultWrap);
  });
  patternLabel.append(pattern);

  const flags = document.createElement('div');
  flags.className = 'regex-flags';
  ['g', 'i', 'm', 's', 'u'].forEach((flag) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.regexTester.flags.includes(flag);
    checkbox.addEventListener('change', () => {
      state.regexTester.flags = updateRegexFlags(state.regexTester.flags, flag, checkbox.checked);
      updateRegexResult(resultWrap);
    });
    label.append(checkbox, document.createTextNode(flag));
    flags.append(label);
  });

  const templates = document.createElement('div');
  templates.className = 'regex-templates';
  [
    ['邮箱', '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}', 'hello user@example.com\nsupport@toolkit.dev'],
    ['手机号', '1[3-9]\\d{9}', '13800138000\n19912345678'],
    ['IPv4', '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b', '127.0.0.1\n192.168.1.100'],
    ['URL', 'https?:\\/\\/[^\\s]+', 'https://example.com/a?q=1\nhttp://localhost:3000'],
    ['UUID', '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}', '550e8400-e29b-41d4-a716-446655440000']
  ].forEach(([label, nextPattern, nextText]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'regex-template';
    button.textContent = label;
    button.addEventListener('click', () => {
      state.regexTester.pattern = nextPattern;
      state.regexTester.flags = ensureRegexFlag(state.regexTester.flags, 'g');
      state.regexTester.text = nextText;
      renderRegexTester();
    });
    templates.append(button);
  });

  config.append(patternLabel, flags, templates);

  const textLabel = document.createElement('label');
  textLabel.className = 'regex-text-field';
  textLabel.innerHTML = '<span>测试文本</span>';
  const text = document.createElement('textarea');
  text.value = state.regexTester.text;
  text.spellcheck = false;
  text.addEventListener('input', () => {
    state.regexTester.text = text.value;
    updateRegexResult(resultWrap);
  });
  textLabel.append(text);

  const resultWrap = document.createElement('div');
  resultWrap.className = 'regex-result';

  panel.append(config, textLabel, resultWrap);
  elements.output.replaceChildren(panel);
  updateRegexResult(resultWrap);
}

function updateRegexResult(container) {
  container.replaceChildren();
  const text = state.regexTester.text;
  if (text.length > GENERAL_LIVE_RUN_CHAR_LIMIT) {
    const warning = document.createElement('div');
    warning.className = 'regex-warning';
    warning.textContent = `测试文本过大：${formatCharCount(text.length)}，请缩小范围后再测试。`;
    state.lastOutput = warning.textContent;
    container.append(warning);
    return;
  }

  const result = collectRegexMatches(state.regexTester.pattern, state.regexTester.flags, text);
  if (!result.ok) {
    const warning = document.createElement('div');
    warning.className = 'regex-warning';
    warning.textContent = result.error;
    state.lastOutput = result.error;
    container.append(warning);
    return;
  }

  state.lastOutput = [
    `/${state.regexTester.pattern}/${state.regexTester.flags}`,
    `匹配数量: ${result.matches.length}`,
    '',
    ...result.matches.map((match, index) => `#${index + 1} [${match.index}] ${match.text}`)
  ].join('\n');

  const summary = document.createElement('div');
  summary.className = 'regex-summary';
  summary.innerHTML = `<strong>${result.matches.length}</strong><span>处匹配</span><code>/${escapeHtml(state.regexTester.pattern)}/${escapeHtml(state.regexTester.flags)}</code>`;

  const body = document.createElement('div');
  body.className = 'regex-body';
  const preview = document.createElement('div');
  preview.className = 'regex-preview';
  appendRegexPreview(preview, text, result.matches);
  const list = document.createElement('div');
  list.className = 'regex-match-list';
  if (result.matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'regex-empty';
    empty.textContent = '没有匹配结果';
    list.append(empty);
  } else {
    result.matches.forEach((match, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'regex-match-item';
      item.innerHTML = `<span>#${index + 1}</span><small>${match.index}-${match.index + match.text.length}</small><code></code>`;
      item.querySelector('code').textContent = match.text || '(空匹配)';
      list.append(item);
    });
  }
  body.append(preview, list);
  container.append(summary, body);
}

function collectRegexMatches(pattern, flags, text) {
  try {
    const normalizedFlags = normalizeRegexFlags(flags);
    const regex = new RegExp(pattern, normalizedFlags);
    const matches = [];
    if (!normalizedFlags.includes('g')) {
      const match = regex.exec(text);
      if (match) matches.push({ index: match.index, text: match[0] });
      return { ok: true, matches };
    }

    let match;
    while ((match = regex.exec(text)) && matches.length < 500) {
      matches.push({ index: match.index, text: match[0] });
      if (match[0] === '') regex.lastIndex += 1;
    }
    return { ok: true, matches };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function appendRegexPreview(parent, text, matches) {
  if (matches.length === 0) {
    parent.textContent = text || ' ';
    return;
  }
  let cursor = 0;
  matches.forEach((match) => {
    if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
    const mark = document.createElement('mark');
    mark.textContent = match.text || ' ';
    parent.append(mark);
    cursor = match.index + match.text.length;
  });
  if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
}

function normalizeRegexFlags(flags) {
  return Array.from(new Set(String(flags || '').replace(/[^gimsuy]/g, '').split(''))).join('');
}

function updateRegexFlags(flags, flag, enabled) {
  const current = new Set(normalizeRegexFlags(flags));
  if (enabled) current.add(flag);
  else current.delete(flag);
  return Array.from(current).join('');
}

function ensureRegexFlag(flags, flag) {
  return updateRegexFlags(flags, flag, true);
}

function renderTaxResult(data) {
  state.lastOutput = [
    `政策口径: ${data.policyName}`,
    `累计收入: ${formatCurrency(data.income)}`,
    `月专项扣除: ${formatCurrency(data.monthlySocial)}`,
    `社保基数: ${formatCurrency(data.socialBase)}`,
    `公积金基数: ${formatCurrency(data.housingBase)}`,
    `累计应纳税所得额: ${formatCurrency(data.taxable)}`,
    `适用税率: ${formatPercent(data.rate)}`,
    `累计应纳税额: ${formatCurrency(data.cumulativeTax)}`,
    `本期应补扣税额: ${formatCurrency(data.currentTax)}`
  ].join('\n');

  const panel = document.createElement('div');
  panel.className = 'finance-result';
  const cards = [
    ['月专项扣除', formatCurrency(data.monthlySocial)],
    ['累计收入', formatCurrency(data.income)],
    ['应纳税所得额', formatCurrency(data.taxable)],
    ['适用税率', formatPercent(data.rate)],
    ['速算扣除数', formatCurrency(data.quick)],
    ['累计应纳税额', formatCurrency(data.cumulativeTax)],
    ['本期应补扣', formatCurrency(data.currentTax)]
  ];
  panel.append(renderMetricCards(cards));
  const detail = document.createElement('div');
  detail.className = 'finance-detail';
  detail.innerHTML = `
    <span>地方政策参数</span>
    <p>${escapeHtml(data.policyName)}：社保基数 ${formatCurrency(data.socialBase)}，公积金基数 ${formatCurrency(data.housingBase)}；养老 ${formatCurrency(data.contributionItems.pension)} / 医疗 ${formatCurrency(data.contributionItems.medical)} / 失业 ${formatCurrency(data.contributionItems.unemployment)} / 公积金 ${formatCurrency(data.contributionItems.housingFund)}，其他专项 ${formatCurrency(data.manualSocial)}。</p>
    <span>计算口径</span>
    <p>累计收入 - ${formatCurrency(data.basicDeduction)} 基本减除费用 - ${formatCurrency(data.social)} 专项扣除 - ${formatCurrency(data.special + data.other)} 专项附加/其他扣除。</p>
  `;
  panel.append(detail);
  elements.output.replaceChildren(panel);
}

function renderLoanResult(data) {
  state.lastOutput = [
    `还款方式: ${data.method}`,
    `贷款本金: ${formatCurrency(data.principal)}`,
    `首月还款: ${formatCurrency(data.firstPayment)}`,
    `末月还款: ${formatCurrency(data.lastPayment)}`,
    `还款总额: ${formatCurrency(data.totalPayment)}`,
    `利息总额: ${formatCurrency(data.totalInterest)}`
  ].join('\n');

  const panel = document.createElement('div');
  panel.className = 'finance-result';
  panel.append(
    renderMetricCards([
      ['还款方式', data.method],
      ['贷款期数', `${data.months} 期`],
      ['首月还款', formatCurrency(data.firstPayment)],
      ['末月还款', formatCurrency(data.lastPayment)],
      ['还款总额', formatCurrency(data.totalPayment)],
      ['利息总额', formatCurrency(data.totalInterest)]
    ])
  );

  const table = document.createElement('table');
  table.className = 'finance-table';
  table.innerHTML = '<thead><tr><th>期数</th><th>月供</th><th>本金</th><th>利息</th><th>剩余本金</th></tr></thead>';
  const tbody = document.createElement('tbody');
  data.schedule.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.month}</td><td>${formatCurrency(row.payment)}</td><td>${formatCurrency(row.principal)}</td><td>${formatCurrency(row.interest)}</td><td>${formatCurrency(row.remaining)}</td>`;
    tbody.append(tr);
  });
  table.append(tbody);
  panel.append(table);
  elements.output.replaceChildren(panel);
}

function renderMetricCards(items) {
  const grid = document.createElement('div');
  grid.className = 'metric-grid';
  items.forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    grid.append(card);
  });
  return grid;
}

function renderWhiteboard() {
  state.lastOutput = '';
  const panel = document.createElement('div');
  panel.className = 'whiteboard-panel';

  const toolbar = document.createElement('div');
  toolbar.className = 'whiteboard-toolbar';
  const color = document.createElement('input');
  color.type = 'color';
  color.value = '#2563eb';
  const size = document.createElement('input');
  size.type = 'range';
  size.min = '2';
  size.max = '32';
  size.value = '6';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'secondary-button';
  clear.textContent = '清空';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'primary-button';
  save.textContent = '导出 PNG';
  toolbar.append(labelWrap('颜色', color), labelWrap('笔宽', size), clear, save);

  const canvas = document.createElement('canvas');
  canvas.className = 'whiteboard-canvas';
  canvas.width = 1200;
  canvas.height = 720;
  const context = canvas.getContext('2d');
  const resetCanvas = () => {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#eef2f7';
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= canvas.width; x += 24) {
      context.moveTo(x, 0);
      context.lineTo(x, canvas.height);
    }
    for (let y = 0; y <= canvas.height; y += 24) {
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
    }
    context.stroke();
    context.lineCap = 'round';
    context.lineJoin = 'round';
  };
  resetCanvas();

  let drawing = false;
  let lastPoint = null;
  const pointFromEvent = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  };
  const drawTo = (point) => {
    context.strokeStyle = color.value;
    context.lineWidth = Number(size.value);
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPoint = point;
  };
  canvas.addEventListener('pointerdown', (event) => {
    drawing = true;
    lastPoint = pointFromEvent(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    drawTo(pointFromEvent(event));
  });
  canvas.addEventListener('pointerup', () => {
    drawing = false;
    lastPoint = null;
  });
  canvas.addEventListener('pointerleave', () => {
    drawing = false;
    lastPoint = null;
  });
  clear.addEventListener('click', () => {
    resetCanvas();
    setStatus('白板已清空');
  });
  save.addEventListener('click', async () => {
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    const saved = await window.toolkit.saveConvertedFile({ base64, fileName: 'whiteboard.png' });
    if (!saved.canceled) setStatus(`已保存：${saved.filePath}`);
  });

  panel.append(toolbar, canvas);
  elements.output.replaceChildren(panel);
}

function labelWrap(labelText, control) {
  const label = document.createElement('label');
  label.className = 'inline-tool-option';
  const span = document.createElement('span');
  span.textContent = labelText;
  label.append(span, control);
  return label;
}

function renderUrlParser() {
  syncUrlParserFromRaw();
  const wrapper = document.createElement('div');
  wrapper.className = 'url-builder';

  const inputCard = document.createElement('label');
  inputCard.className = 'url-input-card';
  inputCard.innerHTML = '<span>URL</span>';
  const rawInput = document.createElement('textarea');
  rawInput.value = state.urlParser.rawUrl;
  rawInput.placeholder = 'https://example.com/search?q=toolkit&page=1#top';
  rawInput.spellcheck = false;
  const resultArea = document.createElement('div');
  resultArea.className = 'url-result-area';
  rawInput.addEventListener('input', () => {
    state.urlParser.rawUrl = rawInput.value.trim();
    syncUrlParserFromRaw();
    renderUrlParserBody(resultArea);
  });
  inputCard.append(rawInput);
  wrapper.append(inputCard, resultArea);
  elements.output.replaceChildren(wrapper);
  renderUrlParserBody(resultArea);
}

function renderUrlParserBody(container) {
  container.replaceChildren();
  if (state.urlParser.error) {
    state.lastOutput = state.urlParser.error;
    const warning = document.createElement('div');
    warning.className = 'url-warning';
    warning.textContent = state.urlParser.error;
    container.append(warning);
    return;
  }

  const data = state.urlParser.data;
  const fields = [
    ['protocol', 'Protocol'],
    ['host', 'Host'],
    ['path', 'Path'],
    ['hash', 'Hash']
  ];

  const main = document.createElement('div');
  main.className = 'url-workbench';

  const fieldGrid = document.createElement('div');
  fieldGrid.className = 'url-fields';
  fields.forEach(([key, labelText]) => {
    const label = document.createElement('label');
    label.innerHTML = `<span>${labelText}</span>`;
    const input = document.createElement('input');
    input.value = data[key] ?? '';
    input.addEventListener('input', () => {
      data[key] = input.value;
      updateUrlPreview();
    });
    label.append(input);
    fieldGrid.append(label);
  });

  const paramPanel = document.createElement('div');
  paramPanel.className = 'url-param-panel';
  const paramHead = document.createElement('div');
  paramHead.className = 'url-param-head';
  paramHead.innerHTML = `<strong>Query Parameters</strong><span>${data.params.length} 个参数</span>`;

  const table = document.createElement('table');
  table.className = 'params-table';
  table.innerHTML = '<thead><tr><th>Key</th><th>Value</th><th>Decoded</th><th></th></tr></thead>';
  const tbody = document.createElement('tbody');
  table.append(tbody);

  const preview = document.createElement('textarea');
  preview.className = 'url-preview';
  preview.readOnly = true;

  const previewCard = document.createElement('div');
  previewCard.className = 'url-preview-card';
  const previewHead = document.createElement('div');
  previewHead.className = 'url-preview-head';
  previewHead.innerHTML = '<strong>生成 URL</strong><span>编辑字段或参数后自动更新</span>';
  previewCard.append(previewHead, preview);

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'secondary-button';
  addButton.textContent = '添加参数';
  addButton.addEventListener('click', () => {
    data.params.push({ key: '', value: '' });
    renderRows();
    updateUrlPreview();
  });

  paramPanel.append(paramHead, table, addButton);
  main.append(fieldGrid, paramPanel, previewCard);
  container.append(main);

  renderRows();
  updateUrlPreview();

  function renderRows() {
    paramHead.querySelector('span').textContent = `${data.params.length} 个参数`;
    tbody.replaceChildren(
      ...data.params.map((param, index) => {
        const row = document.createElement('tr');
        const keyCell = document.createElement('td');
        const valueCell = document.createElement('td');
        const decodedCell = document.createElement('td');
        const actionCell = document.createElement('td');
        const keyInput = document.createElement('input');
        const valueInput = document.createElement('input');
        keyInput.value = param.key;
        valueInput.value = param.value;
        keyInput.addEventListener('input', () => {
          param.key = keyInput.value;
          updateUrlPreview();
        });
        valueInput.addEventListener('input', () => {
          param.value = valueInput.value;
          decoded.textContent = param.value || ' ';
          updateUrlPreview();
        });
        const decoded = document.createElement('code');
        decoded.className = 'url-decoded-value';
        decoded.textContent = param.value || ' ';
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.textContent = '移除';
        deleteButton.addEventListener('click', () => {
          data.params.splice(index, 1);
          renderRows();
          updateUrlPreview();
        });
        keyCell.append(keyInput);
        valueCell.append(valueInput);
        decodedCell.append(decoded);
        actionCell.append(deleteButton);
        row.append(keyCell, valueCell, decodedCell, actionCell);
        return row;
      })
    );
  }

  function updateUrlPreview() {
    try {
      state.lastOutput = buildUrlFromParts(data);
      preview.value = state.lastOutput;
      state.urlParser.error = '';
      setStatus('URL 已生成');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.lastOutput = message;
      preview.value = message;
      setStatus(message, true);
    }
  }
}

function syncUrlParserFromRaw() {
  const raw = state.urlParser.rawUrl.trim();
  if (!raw) {
    state.urlParser.data = null;
    state.urlParser.error = '请输入 URL';
    return false;
  }

  const result = parseUrlWithFallback(raw);
  if (!result.ok) {
    state.urlParser.data = null;
    state.urlParser.error = result.error;
    return false;
  }

  state.urlParser.data = result.data;
  state.urlParser.error = '';
  state.lastOutput = result.value;
  return true;
}

function parseUrlWithFallback(raw) {
  const direct = parseUrl(raw);
  if (direct.ok) return direct;
  if (/^[a-z][a-z\d+.-]*:/i.test(raw)) return direct;
  return parseUrl(`https://${raw}`);
}

function renderUrlCodecTool() {
  const panel = document.createElement('div');
  panel.className = 'url-codec-tool';

  const inputCard = document.createElement('section');
  inputCard.className = 'url-codec-input-card';
  const head = document.createElement('div');
  head.className = 'url-codec-head';
  head.innerHTML = '<strong>URL 编解码</strong><span>组件、整条 URI、表单参数三种模式</span>';

  const modes = document.createElement('div');
  modes.className = 'url-codec-mode-switch';
  [
    ['encode', '编码'],
    ['decode', '解码']
  ].forEach(([mode, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `url-codec-mode${state.urlCodec.mode === mode ? ' active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      state.urlCodec.mode = mode;
      state.urlCodec.input = mode === 'encode' ? sampleUrlCodecInput(state.urlCodec.scope) : sampleUrlCodecEncodedInput(state.urlCodec.scope);
      renderUrlCodecTool();
    });
    modes.append(button);
  });

  const scopes = document.createElement('div');
  scopes.className = 'url-codec-scope-grid';
  [
    ['component', 'URL 组件', '参数值、路径片段，保守转义'],
    ['uri', '整条 URI', '保留 : / ? & = # 等结构字符'],
    ['form', '表单参数', '空格使用 +，适合 x-www-form-urlencoded']
  ].forEach(([scope, title, desc]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `url-codec-scope${state.urlCodec.scope === scope ? ' active' : ''}`;
    button.innerHTML = `<strong>${title}</strong><span>${desc}</span>`;
    button.addEventListener('click', () => {
      state.urlCodec.scope = scope;
      state.urlCodec.input = state.urlCodec.mode === 'encode' ? sampleUrlCodecInput(scope) : sampleUrlCodecEncodedInput(scope);
      renderUrlCodecTool();
    });
    scopes.append(button);
  });

  const textarea = document.createElement('textarea');
  textarea.value = state.urlCodec.input;
  textarea.spellcheck = false;
  textarea.placeholder = state.urlCodec.mode === 'encode' ? '输入要编码的 URL 文本' : '输入要解码的百分号编码文本';
  textarea.addEventListener('input', () => {
    state.urlCodec.input = textarea.value;
    updateUrlCodecResult(resultCard);
  });

  inputCard.append(head, modes, scopes, textarea);

  const resultCard = document.createElement('section');
  resultCard.className = 'url-codec-result-card';
  panel.append(inputCard, resultCard);
  elements.output.replaceChildren(panel);
  updateUrlCodecResult(resultCard);
}

function updateUrlCodecResult(container) {
  container.replaceChildren();
  const result =
    state.urlCodec.mode === 'encode'
      ? encodeUrlDetailed(state.urlCodec.input, { mode: state.urlCodec.scope })
      : decodeUrlDetailed(state.urlCodec.input, { mode: state.urlCodec.scope });

  state.urlCodec.result = result.ok ? result.data : null;
  state.urlCodec.error = result.ok ? '' : result.error;
  state.lastOutput = result.ok ? result.value : result.error;

  if (!result.ok) {
    const warning = document.createElement('div');
    warning.className = 'url-codec-warning';
    warning.textContent = result.error;
    container.append(warning);
    setStatus(result.error, true);
    queueOutputSearchRefresh();
    return;
  }

  const data = result.data;
  const summary = document.createElement('div');
  summary.className = 'url-codec-summary';
  summary.append(
    renderUrlCodecMetric('模式', state.urlCodec.mode === 'encode' ? '编码' : '解码', 'mode'),
    renderUrlCodecMetric('范围', urlCodecScopeLabel(data.mode), 'scope'),
    renderUrlCodecMetric('转义', String(data.percentEscapes), 'escape'),
    renderUrlCodecMetric('非 ASCII', String(data.nonAscii), 'nonascii')
  );

  const output = document.createElement('div');
  output.className = 'url-codec-output-card';
  output.innerHTML = '<span>结果</span>';
  const code = document.createElement('code');
  code.textContent = result.value;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'secondary-button';
  copy.textContent = '复制结果';
  copy.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(result.value);
    setStatus('URL 编解码结果已复制');
  });
  output.append(code, copy);

  const compare = document.createElement('div');
  compare.className = 'url-codec-compare';
  compare.append(renderUrlCodecCompareItem('输入长度', String(data.inputLength)), renderUrlCodecCompareItem('输出长度', String(data.outputLength)));

  container.append(summary, output, compare);
  setStatus('URL 编解码完成');
  queueOutputSearchRefresh();
}

function renderUrlCodecMetric(labelText, value, tone) {
  const item = document.createElement('div');
  item.className = `url-codec-metric ${tone}`;
  item.innerHTML = `<span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong>`;
  return item;
}

function renderUrlCodecCompareItem(labelText, value) {
  const item = document.createElement('div');
  item.className = 'url-codec-compare-item';
  item.innerHTML = `<span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong>`;
  return item;
}

function urlCodecScopeLabel(scope) {
  const labels = {
    component: '组件',
    uri: 'URI',
    form: '表单'
  };
  return labels[scope] ?? scope;
}

function sampleUrlCodecInput(scope) {
  if (scope === 'uri') return 'https://example.com/search?q=工具箱&sort=时间#结果';
  if (scope === 'form') return 'hello world 工具箱';
  return 'q=工具箱&sort=时间';
}

function sampleUrlCodecEncodedInput(scope) {
  if (scope === 'uri') return 'https://example.com/search?q=%E5%B7%A5%E5%85%B7%E7%AE%B1&sort=%E6%97%B6%E9%97%B4#%E7%BB%93%E6%9E%9C';
  if (scope === 'form') return 'hello+world+%E5%B7%A5%E5%85%B7%E7%AE%B1';
  return 'q%3D%E5%B7%A5%E5%85%B7%E7%AE%B1%26sort%3D%E6%97%B6%E9%97%B4';
}

function renderCookieParser() {
  const panel = document.createElement('div');
  panel.className = 'cookie-tool';

  const inputCard = document.createElement('section');
  inputCard.className = 'cookie-input-card';

  const head = document.createElement('div');
  head.className = 'cookie-head';
  head.innerHTML = '<strong>Cookie Header</strong><span>解析请求 Cookie 或响应 Set-Cookie</span>';

  const modes = document.createElement('div');
  modes.className = 'cookie-mode-switch';
  [
    ['cookie', '请求 Cookie'],
    ['set-cookie', '响应 Set-Cookie']
  ].forEach(([mode, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cookie-mode${state.cookieParser.mode === mode ? ' active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      state.cookieParser.mode = mode;
      if (mode === 'cookie') {
        state.cookieParser.text = 'sid=abc123; theme=dark; locale=zh-CN; token=hello%20world';
      } else {
        state.cookieParser.text = [
          'sid=abc123; Path=/; Domain=example.com; HttpOnly; Secure; SameSite=Lax; Expires=Wed, 21 Oct 2030 07:28:00 GMT',
          'theme=dark; Path=/; Max-Age=3600; SameSite=None; Secure'
        ].join('\n');
      }
      renderCookieParser();
    });
    modes.append(button);
  });

  const textarea = document.createElement('textarea');
  textarea.value = state.cookieParser.text;
  textarea.spellcheck = false;
  textarea.placeholder =
    state.cookieParser.mode === 'cookie'
      ? 'sid=abc123; theme=dark; token=hello%20world'
      : 'Set-Cookie: sid=abc123; Path=/; HttpOnly; Secure; SameSite=Lax';
  textarea.addEventListener('input', () => {
    state.cookieParser.text = textarea.value;
    updateCookieParserResult(resultCard);
  });

  const hint = document.createElement('div');
  hint.className = 'cookie-hint';
  hint.textContent = state.cookieParser.mode === 'cookie' ? '适合粘贴 Request Headers 里的 Cookie 字段。' : '每行一个 Set-Cookie，Expires 里的逗号会被保留。';

  inputCard.append(head, modes, textarea, hint);

  const resultCard = document.createElement('section');
  resultCard.className = 'cookie-result-card';

  panel.append(inputCard, resultCard);
  elements.output.replaceChildren(panel);
  updateCookieParserResult(resultCard);
}

function updateCookieParserResult(container) {
  container.replaceChildren();
  const result =
    state.cookieParser.mode === 'set-cookie'
      ? parseSetCookieHeaders(state.cookieParser.text)
      : parseCookieHeader(state.cookieParser.text);

  state.cookieParser.result = result.ok ? result.data : null;
  state.cookieParser.error = result.ok ? '' : result.error;
  state.lastOutput = result.ok ? result.value : result.error;

  if (!result.ok) {
    const warning = document.createElement('div');
    warning.className = 'cookie-warning';
    warning.textContent = result.error;
    container.append(warning);
    setStatus(result.error, true);
    queueOutputSearchRefresh();
    return;
  }

  const data = result.data;
  const top = document.createElement('div');
  top.className = 'cookie-result-head';
  const title = document.createElement('div');
  title.innerHTML = `<strong>${data.type === 'set-cookie' ? 'Set-Cookie 明细' : 'Cookie 明细'}</strong><span>${data.rows.length} 个 Cookie</span>`;

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'secondary-button';
  copy.textContent = '复制 Cookie Header';
  copy.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(buildCookieHeader(data.rows, { prefix: true }));
    setStatus('已复制 Cookie Header');
  });
  top.append(title, copy);

  const summary = document.createElement('div');
  summary.className = 'cookie-summary';
  summary.append(
    renderCookieMetric('总数', String(data.summary.total), 'total'),
    renderCookieMetric('Secure', String(data.summary.secure), 'secure'),
    renderCookieMetric('HttpOnly', String(data.summary.httpOnly), 'http'),
    renderCookieMetric('过期', String(data.summary.expired), data.summary.expired > 0 ? 'danger' : 'ok')
  );

  const rebuilt = document.createElement('div');
  rebuilt.className = 'cookie-rebuilt';
  rebuilt.innerHTML = '<span>重建请求头</span><code></code>';
  rebuilt.querySelector('code').textContent = `Cookie: ${data.rebuiltHeader}`;

  const list = document.createElement('div');
  list.className = 'cookie-list';
  data.rows.forEach((row) => list.append(renderCookieRow(row)));

  container.append(top, summary, rebuilt, list);
  setStatus(`Cookie 解析完成：${data.rows.length} 个`);
  queueOutputSearchRefresh();
}

function renderCookieMetric(labelText, value, tone) {
  const item = document.createElement('div');
  item.className = `cookie-metric ${tone}`;
  item.innerHTML = `<span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong>`;
  return item;
}

function renderCookieRow(row) {
  const card = document.createElement('article');
  card.className = `cookie-row${row.expired ? ' expired' : ''}`;

  const main = document.createElement('div');
  main.className = 'cookie-row-main';
  const name = document.createElement('strong');
  name.textContent = row.name;
  const value = document.createElement('code');
  value.textContent = row.value;
  main.append(name, value);

  const badges = document.createElement('div');
  badges.className = 'cookie-badges';
  const badgeItems =
    row.source === 'Cookie'
      ? [
          ['Request Header', 'info'],
          [row.decodedValue !== row.value ? '已解码' : '原始值', 'ok'],
          ['安全属性不可见', 'muted']
        ]
      : [
          row.secure ? ['Secure', 'ok'] : ['No Secure', 'muted'],
          row.httpOnly ? ['HttpOnly', 'ok'] : ['JS 可读', 'warn'],
          row.sameSite ? [`SameSite ${row.sameSite}`, 'info'] : ['SameSite 未设', 'muted'],
          row.expired ? ['已过期', 'danger'] : row.session ? ['Session', 'info'] : ['持久化', 'ok']
        ];
  badgeItems.forEach(([label, tone]) => {
    const badge = document.createElement('span');
    badge.className = `cookie-badge ${tone}`;
    badge.textContent = label;
    badges.append(badge);
  });

  const meta = document.createElement('dl');
  meta.className = 'cookie-meta';
  [
    ['Decoded', row.decodedValue || row.value],
    ['Domain', row.domain || '-'],
    ['Path', row.path || '-'],
    ['Expires', row.expiresAt ? formatCookieDate(row.expiresAt) : Number.isFinite(row.maxAge) ? `${row.maxAge}s` : '-']
  ].forEach(([label, text]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = text;
    meta.append(dt, dd);
  });

  const copyValue = document.createElement('button');
  copyValue.type = 'button';
  copyValue.className = 'cookie-copy';
  copyValue.textContent = '复制值';
  copyValue.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(row.value);
    setStatus(`已复制 ${row.name}`);
  });

  card.append(main, badges, meta, copyValue);
  return card;
}

function formatCookieDate(value) {
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return value;
  }
}

function renderHttpHeadersTool() {
  const panel = document.createElement('div');
  panel.className = 'headers-tool';

  const inputCard = document.createElement('section');
  inputCard.className = 'headers-input-card';

  const head = document.createElement('div');
  head.className = 'headers-head';
  head.innerHTML = '<strong>HTTP Headers</strong><span>粘贴请求头或响应头，自动识别关键字段</span>';

  const modes = document.createElement('div');
  modes.className = 'headers-mode-switch';
  [
    ['request', '请求头'],
    ['response', '响应头']
  ].forEach(([mode, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `headers-mode${state.httpHeaders.mode === mode ? ' active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      state.httpHeaders.mode = mode;
      state.httpHeaders.filter = 'all';
      state.httpHeaders.text = mode === 'request' ? sampleRequestHeaders() : sampleResponseHeaders();
      renderHttpHeadersTool();
    });
    modes.append(button);
  });

  const textarea = document.createElement('textarea');
  textarea.value = state.httpHeaders.text;
  textarea.spellcheck = false;
  textarea.placeholder = state.httpHeaders.mode === 'request' ? 'GET /api HTTP/1.1\nHost: example.com\nAuthorization: Bearer ...' : 'HTTP/1.1 200 OK\nContent-Type: application/json';
  textarea.addEventListener('input', () => {
    state.httpHeaders.text = textarea.value;
    updateHttpHeadersResult(resultCard);
  });

  const hint = document.createElement('div');
  hint.className = 'headers-hint';
  hint.textContent = '支持请求行/状态行、重复 Header 和缩进续行。Authorization、Cookie、Set-Cookie 默认脱敏展示。';

  inputCard.append(head, modes, textarea, hint);

  const resultCard = document.createElement('section');
  resultCard.className = 'headers-result-card';
  panel.append(inputCard, resultCard);
  elements.output.replaceChildren(panel);
  updateHttpHeadersResult(resultCard);
}

function updateHttpHeadersResult(container) {
  container.replaceChildren();
  const result = parseHttpHeaders(state.httpHeaders.text);
  state.httpHeaders.result = result.ok ? result.data : null;
  state.httpHeaders.error = result.ok ? '' : result.error;
  state.lastOutput = result.ok ? result.value : result.error;

  if (!result.ok) {
    const warning = document.createElement('div');
    warning.className = 'headers-warning';
    warning.textContent = result.error;
    container.append(warning);
    setStatus(result.error, true);
    queueOutputSearchRefresh();
    return;
  }

  const data = result.data;
  const top = document.createElement('div');
  top.className = 'headers-result-head';
  const title = document.createElement('div');
  title.innerHTML = `<strong>${data.startLine ? escapeHtml(data.startLine) : 'HTTP Headers'}</strong><span>${data.rows.length} 行 Header</span>`;
  const copyFetch = document.createElement('button');
  copyFetch.type = 'button';
  copyFetch.className = 'secondary-button';
  copyFetch.textContent = '复制 fetch headers';
  copyFetch.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(buildHeadersFetchObject(data.rows));
    setStatus('已复制 fetch headers 对象');
  });
  top.append(title, copyFetch);

  const summary = document.createElement('div');
  summary.className = 'headers-summary';
  summary.append(
    renderHeaderMetric('总数', String(data.summary.total), 'total'),
    renderHeaderMetric('敏感', String(data.summary.sensitive), data.summary.sensitive > 0 ? 'warn' : 'ok'),
    renderHeaderMetric('重复', String(data.summary.duplicate), data.summary.duplicate > 0 ? 'danger' : 'ok'),
    renderHeaderMetric('CORS', String(data.summary.cors), 'info'),
    renderHeaderMetric('安全头', String(data.summary.security), data.summary.security > 0 ? 'ok' : 'muted')
  );

  const filters = document.createElement('div');
  filters.className = 'headers-filters';
  [
    ['all', '全部'],
    ['auth', '鉴权'],
    ['cookie', 'Cookie'],
    ['cache', '缓存'],
    ['cors', 'CORS'],
    ['security', '安全'],
    ['content', '内容'],
    ['custom', '自定义']
  ].forEach(([filter, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `headers-filter${state.httpHeaders.filter === filter ? ' active' : ''}`;
    button.textContent = label;
    button.addEventListener('click', () => {
      state.httpHeaders.filter = filter;
      updateHttpHeadersResult(container);
    });
    filters.append(button);
  });

  const body = document.createElement('div');
  body.className = 'headers-body';
  const list = document.createElement('div');
  list.className = 'headers-list';
  const visibleRows =
    state.httpHeaders.filter === 'all' ? data.rows : data.rows.filter((row) => row.category === state.httpHeaders.filter);
  if (visibleRows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'headers-empty';
    empty.textContent = '当前分类没有 Header';
    list.append(empty);
  } else {
    visibleRows.forEach((row) => list.append(renderHeaderRow(row, data.duplicateNames.includes(row.normalizedName))));
  }

  const objectCard = document.createElement('div');
  objectCard.className = 'headers-object-card';
  objectCard.innerHTML = '<span>fetch headers · 敏感值脱敏展示</span>';
  const code = document.createElement('code');
  code.textContent = buildMaskedHeadersObjectText(data.rows);
  objectCard.append(code);

  body.append(list, objectCard);
  container.append(top, summary, filters, body);
  setStatus(`HTTP Header 解析完成：${data.rows.length} 行`);
  queueOutputSearchRefresh();
}

function renderHeaderMetric(labelText, value, tone) {
  const item = document.createElement('div');
  item.className = `headers-metric ${tone}`;
  item.innerHTML = `<span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong>`;
  return item;
}

function renderHeaderRow(row, duplicated = false) {
  const card = document.createElement('article');
  card.className = `headers-row ${row.category}${row.sensitive ? ' sensitive' : ''}`;

  const main = document.createElement('div');
  main.className = 'headers-row-main';
  const name = document.createElement('strong');
  name.textContent = row.name;
  const value = document.createElement('code');
  value.textContent = row.sensitive ? maskHeaderValueDisplay(row.value) : row.value;
  main.append(name, value);

  const badges = document.createElement('div');
  badges.className = 'headers-badges';
  [
    [headerCategoryLabel(row.category), headerCategoryTone(row.category)],
    row.sensitive ? ['敏感', 'warn'] : ['普通', 'muted'],
    duplicated ? ['重复', 'danger'] : ['', '']
  ]
    .filter(([label]) => label)
    .forEach(([label, tone]) => {
      const badge = document.createElement('span');
      badge.className = `headers-badge ${tone}`;
      badge.textContent = label;
      badges.append(badge);
    });

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'headers-copy';
  copy.textContent = '复制';
  copy.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(`${row.name}: ${row.value}`);
    setStatus(`已复制 ${row.name}`);
  });

  card.append(main, badges, copy);
  return card;
}

function headerCategoryLabel(category) {
  const labels = {
    auth: '鉴权',
    cookie: 'Cookie',
    cache: '缓存',
    cors: 'CORS',
    security: '安全',
    content: '内容',
    custom: '自定义'
  };
  return labels[category] ?? category;
}

function headerCategoryTone(category) {
  const tones = {
    auth: 'warn',
    cookie: 'info',
    cache: 'muted',
    cors: 'info',
    security: 'ok',
    content: 'ok',
    custom: 'muted'
  };
  return tones[category] ?? 'muted';
}

function maskHeaderValueDisplay(value) {
  const text = String(value ?? '');
  if (text.length <= 8) return text ? '••••' : '';
  return `${text.slice(0, 4)}••••${text.slice(-4)}`;
}

function buildMaskedHeadersObjectText(rows) {
  const output = {};
  rows.forEach((row) => {
    const value = row.sensitive ? maskHeaderValueDisplay(row.value) : row.value;
    if (Object.prototype.hasOwnProperty.call(output, row.name)) {
      output[row.name] = Array.isArray(output[row.name]) ? [...output[row.name], value] : [output[row.name], value];
    } else {
      output[row.name] = value;
    }
  });
  return JSON.stringify(output, null, 2);
}

function sampleRequestHeaders() {
  return [
    'GET /api/users?page=1 HTTP/1.1',
    'Host: api.example.com',
    'Authorization: Bearer secret-token',
    'Accept: application/json',
    'Cookie: sid=abc123; theme=dark',
    'Cache-Control: no-cache',
    'X-Trace-Id: req-20260614'
  ].join('\n');
}

function sampleResponseHeaders() {
  return [
    'HTTP/1.1 200 OK',
    'Content-Type: application/json; charset=utf-8',
    'Cache-Control: no-store',
    'Access-Control-Allow-Origin: https://example.com',
    'Strict-Transport-Security: max-age=31536000; includeSubDomains',
    'Set-Cookie: sid=abc123; Path=/; HttpOnly; Secure; SameSite=Lax',
    'Set-Cookie: theme=dark; Path=/'
  ].join('\n');
}

function renderLargeOutputPreview({ title: titleText = 'JSON 已处理，但结果过大，已关闭树形渲染', detail: detailText = '', stats = null } = {}) {
  const preview = buildOutputPreview(state.lastOutput);
  const notice = document.createElement('div');
  notice.className = 'large-output-notice';

  const title = document.createElement('strong');
  title.textContent = titleText;

  const detail = document.createElement('p');
  detail.textContent =
    detailText || `结果约 ${formatCharCount(state.lastOutput.length)}。当前仅展示前 ${formatCharCount(preview.length)}，复制结果会复制完整文本。`;

  const meta = document.createElement('div');
  meta.className = 'json-preview-meta';
  meta.append(
    renderJsonStatPill('大小', formatCharCount(state.lastOutput.length)),
    renderJsonStatPill('预览', formatCharCount(preview.length))
  );
  if (stats) {
    meta.append(
      renderJsonStatPill('节点', stats.truncated ? `>${JSON_TREE_RENDER_NODE_LIMIT.toLocaleString('zh-CN')}` : stats.totalNodes.toLocaleString('zh-CN')),
      renderJsonStatPill('深度', String(stats.maxDepth))
    );
  }

  const pre = document.createElement('pre');
  pre.textContent = preview;

  const actions = document.createElement('div');
  actions.className = 'large-output-actions';
  const copyFull = document.createElement('button');
  copyFull.type = 'button';
  copyFull.className = 'secondary-button';
  copyFull.textContent = '复制完整结果';
  copyFull.addEventListener('click', async () => {
    await window.toolkit.writeClipboard(state.lastOutput);
    setStatus('完整结果已复制');
  });
  actions.append(copyFull);

  notice.append(title, detail, meta, actions, pre);
  elements.output.replaceChildren(notice);
}

function buildOutputPreview(output) {
  const text = String(output ?? '');
  if (text.length <= OUTPUT_PREVIEW_CHAR_LIMIT) return text;
  const headLength = Math.max(0, OUTPUT_PREVIEW_CHAR_LIMIT - OUTPUT_PREVIEW_TAIL_CHAR_LIMIT);
  const head = text.slice(0, headLength);
  const tail = text.slice(-OUTPUT_PREVIEW_TAIL_CHAR_LIMIT);
  const omitted = text.length - head.length - tail.length;
  return `${head}\n\n... 已省略 ${formatCharCount(omitted)}，复制结果可获取完整内容 ...\n\n${tail}`;
}

function renderGitLabTool() {
  elements.copy.hidden = true;
  elements.outputSearch.hidden = true;
  const gitlab = state.gitlabTool;
  if (!gitlab.loaded && !gitlab.loading) {
    loadGitLabTool().catch((error) => {
      gitlab.error = readableErrorMessage(error);
      gitlab.loading = false;
      gitlab.loaded = true;
      renderGitLabTool();
    });
  }

  const shell = document.createElement('div');
  shell.className = 'gitlab-tool';
  if (gitlab.tab === 'clone' || gitlab.tab === 'monitor') gitlab.tab = 'projects';
  shell.append(renderGitLabTabs());

  if (gitlab.loading) {
    shell.append(renderGitLabNotice('正在加载 GitLab 配置...'));
    elements.output.replaceChildren(shell);
    return;
  }
  if (gitlab.error) shell.append(renderGitLabNotice(gitlab.error, true));
  if (gitlab.message) shell.append(renderGitLabNotice(gitlab.message));

  if (gitlab.tab === 'settings') shell.append(renderGitLabSettings());
  else if (gitlab.tab === 'projects') shell.append(renderGitLabProjects());
  else if (gitlab.tab === 'about') shell.append(renderGitLabAbout());
  else shell.append(renderGitLabSettings());
  if (gitlab.branchConfig) shell.append(renderGitLabBranchConfigDialog());
  elements.output.replaceChildren(shell);
}

async function loadGitLabTool() {
  const gitlab = state.gitlabTool;
  gitlab.loading = true;
  gitlab.error = '';
  const payload = await window.toolkit.gitlabGetConfig();
  gitlab.config = payload.config;
  gitlab.projectsByInstance = { ...(payload.config?.recentProjects || {}), ...(payload.projects || {}) };
  gitlab.currentInstanceId = gitlab.currentInstanceId || gitlab.config.instances[0]?.id || '';
  gitlab.cloneMode = gitlab.config.clone?.defaultMode || 'pull';
  gitlab.maxConcurrency = gitlab.config.clone?.maxConcurrency || 6;
  gitlab.stripTokenAfterClone = gitlab.config.clone?.stripTokenAfterClone !== false;
  gitlab.monitorPollInterval = gitlab.config.monitor?.pollIntervalSeconds || 60;
  syncGitLabFormFromInstance(gitlabCurrentInstance());
  gitlab.loaded = true;
  gitlab.loading = false;
}

function renderGitLabTabs() {
  const gitlab = state.gitlabTool;
  const tabs = document.createElement('div');
  tabs.className = 'gitlab-tabs';
  [
    ['settings', '配置 GitLab'],
    ['projects', '拉取项目并同步'],
    ['about', '关于']
  ].forEach(([id, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = gitlab.tab === id ? 'primary-button' : 'secondary-button';
    button.textContent = label;
    button.addEventListener('click', () => {
      gitlab.tab = id;
      gitlab.message = '';
      renderGitLabTool();
    });
    tabs.append(button);
  });
  return tabs;
}

function gitlabCurrentInstance() {
  const gitlab = state.gitlabTool;
  return gitlab.config?.instances?.find((item) => item.id === gitlab.currentInstanceId) ?? gitlab.config?.instances?.[0] ?? null;
}

function gitlabCurrentProjects() {
  const instance = gitlabCurrentInstance();
  if (!instance) return [];
  const projects = state.gitlabTool.projectsByInstance[instance.id] || [];
  const search = state.gitlabTool.search.trim().toLowerCase();
  const filtered = search ? projects.filter((project) => `${project.pathWithNamespace} ${project.name}`.toLowerCase().includes(search)) : projects;
  return state.gitlabTool.statusFilter === 'selected'
    ? filtered.filter((project) => state.gitlabTool.selectedProjectIds.has(project.id))
    : filtered;
}

function gitlabLocalStatusKey(instance, rootDirectory) {
  return `${instance?.id || ''}::${rootDirectory || ''}`;
}

function gitlabLocalStatuses(instance, rootDirectory) {
  return state.gitlabTool.localStatuses[gitlabLocalStatusKey(instance, rootDirectory)] || {};
}

async function refreshGitLabLocalStatus(instance, rootDirectory) {
  if (!instance) return;
  const gitlab = state.gitlabTool;
  const key = gitlabLocalStatusKey(instance, rootDirectory);
  gitlab.localStatusLoadingKey = key;
  try {
    const result = await window.toolkit.gitlabLocalProjectStatus(instance.id, rootDirectory);
    gitlab.localStatuses[key] = result.statuses || {};
  } finally {
    if (gitlab.localStatusLoadingKey === key) gitlab.localStatusLoadingKey = '';
    if (state.activeToolId === 'gitlab') renderGitLabTool();
  }
}

function syncGitLabFormFromInstance(instance) {
  const form = state.gitlabTool.form;
  if (!instance) {
    Object.assign(form, {
      id: '',
      name: '',
      baseURL: 'https://gitlab.example.com',
      token: '',
      defaultCloneRoot: '',
      cloneProtocol: 'https'
    });
    return;
  }
  Object.assign(form, {
    id: instance.id,
    name: instance.name,
    baseURL: instance.baseURL,
    token: '',
    defaultCloneRoot: instance.defaultCloneRoot,
    cloneProtocol: instance.cloneProtocol || 'https'
  });
  state.gitlabTool.cloneRootOverride = state.gitlabTool.cloneRootOverride || instance.defaultCloneRoot;
}

function renderGitLabNotice(message, isError = false) {
  const notice = document.createElement('div');
  notice.className = `gitlab-notice${isError ? ' error' : ''}`;
  notice.textContent = message;
  return notice;
}

function renderGitLabInstancePicker() {
  const gitlab = state.gitlabTool;
  const row = document.createElement('div');
  row.className = 'gitlab-toolbar';
  const select = document.createElement('select');
  const instances = gitlab.config?.instances ?? [];
  if (instances.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '未配置实例';
    select.append(option);
  } else {
    instances.forEach((instance) => {
      const option = document.createElement('option');
      option.value = instance.id;
      option.textContent = instance.name;
      select.append(option);
    });
  }
  select.value = gitlab.currentInstanceId;
  select.addEventListener('change', () => {
    gitlab.currentInstanceId = select.value;
    gitlab.selectedProjectIds = new Set();
    syncGitLabFormFromInstance(gitlabCurrentInstance());
    renderGitLabTool();
  });
  row.append(select);
  return row;
}

function renderGitLabProjects() {
  const gitlab = state.gitlabTool;
  const panel = document.createElement('section');
  panel.className = 'gitlab-panel gitlab-project-page';
  const instance = gitlabCurrentInstance();
  if (!instance) {
    panel.append(renderGitLabNotice('先到“配置”页新增 GitLab 实例和 PAT。'));
    return panel;
  }
  const rootDirectory = gitlab.cloneRootOverride || instance.defaultCloneRoot;
  const localStatusKey = gitlabLocalStatusKey(instance, rootDirectory);
  const localStatuses = gitlabLocalStatuses(instance, rootDirectory);
  if (!gitlab.localStatuses[localStatusKey] && gitlab.localStatusLoadingKey !== localStatusKey) {
    refreshGitLabLocalStatus(instance, rootDirectory).catch((error) => {
      gitlab.error = readableErrorMessage(error);
      renderGitLabTool();
    });
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'gitlab-project-topbar';
  const title = document.createElement('strong');
  title.textContent = '项目列表';
  toolbar.append(title);
  const select = document.createElement('select');
  (gitlab.config?.instances ?? []).forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    select.append(option);
  });
  select.value = instance.id;
  select.addEventListener('change', () => {
    gitlab.currentInstanceId = select.value;
    gitlab.selectedProjectIds = new Set();
    syncGitLabFormFromInstance(gitlabCurrentInstance());
    renderGitLabTool();
  });
  toolbar.append(select);
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = '搜索...';
  search.value = gitlab.search;
  search.addEventListener('input', () => {
    gitlab.search = search.value;
    renderGitLabTool();
  });
  toolbar.append(search);
  const spacer = document.createElement('span');
  spacer.className = 'gitlab-project-spacer';
  toolbar.append(spacer);
  toolbar.append(gitlabButton('刷新列表', async () => {
    gitlab.message = '正在刷新项目列表...';
    renderGitLabTool();
    const result = await window.toolkit.gitlabRefreshProjects(instance.id);
    gitlab.projectsByInstance[instance.id] = result.projects;
    gitlab.message = `已加载 ${result.projects.length} 个项目`;
    await refreshGitLabLocalStatus(instance, rootDirectory);
    renderGitLabTool();
  }, 'primary-button'));
  toolbar.append(gitlabButton(gitlab.statusFilter === 'selected' ? '显示全部' : '只看已选', () => {
    gitlab.statusFilter = gitlab.statusFilter === 'selected' ? 'all' : 'selected';
    renderGitLabTool();
  }));
  toolbar.append(gitlabButton(gitlab.localStatusLoadingKey === localStatusKey ? '检测中...' : '刷新本地状态', async () => {
    await refreshGitLabLocalStatus(instance, rootDirectory);
  }));
  panel.append(toolbar);

  const projects = gitlabCurrentProjects();
  const allSelected = projects.length > 0 && projects.every((project) => gitlab.selectedProjectIds.has(project.id));
  const list = document.createElement('div');
  list.className = 'gitlab-project-list gitlab-project-table';
  const header = document.createElement('div');
  header.className = 'gitlab-project-table-header';
  const selectAll = document.createElement('input');
  selectAll.type = 'checkbox';
  selectAll.checked = allSelected;
  selectAll.addEventListener('change', () => {
    if (allSelected) projects.forEach((project) => gitlab.selectedProjectIds.delete(project.id));
    else projects.forEach((project) => gitlab.selectedProjectIds.add(project.id));
    renderGitLabTool();
  });
  const headerText = document.createElement('span');
  headerText.textContent = `全选   已选 ${gitlab.selectedProjectIds.size} / 共 ${projects.length}`;
  header.append(selectAll, headerText);
  list.append(header);
  if (projects.length === 0) list.append(renderGitLabNotice('暂无项目，刷新列表或调整搜索条件。'));
  projects.forEach((project) => {
    const row = document.createElement('div');
    row.className = 'gitlab-project-row gitlab-project-table-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = gitlab.selectedProjectIds.has(project.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) gitlab.selectedProjectIds.add(project.id);
      else gitlab.selectedProjectIds.delete(project.id);
      renderGitLabTool();
    });
    const body = document.createElement('span');
    body.innerHTML = `<strong>${escapeHtml(project.pathWithNamespace)}</strong><small>${escapeHtml(project.webURL || project.httpUrlToRepo || '')}</small>`;
    const localStatus = localStatuses[String(project.id)];
    const status = document.createElement('span');
    status.className = `gitlab-project-local ${localStatus?.cloned ? 'cloned' : localStatus ? 'uncloned' : 'unknown'}`;
    status.textContent = localStatus
      ? localStatus.cloned
        ? `已克隆${localStatus.branch ? ` · 当前: ${localStatus.branch}` : ''}`
        : '未克隆'
      : '检测中';
    if (localStatus?.path) status.title = localStatus.path;
    const branchConfig = renderGitLabProjectBranchConfig(project);
    row.append(checkbox, body, status, branchConfig, gitlabButton(branchConfig.dataset.configured === 'true' ? '更新配置' : '配置分支', () => {
      openGitLabBranchConfig(project);
      renderGitLabTool();
    }, 'secondary-button gitlab-row-action'));
    list.append(row);
  });
  panel.append(list);
  panel.append(renderGitLabSyncControls(instance));
  return panel;
}

function renderGitLabProjectBranchConfig(project) {
  const target = (state.gitlabTool.config?.monitor?.targets || [])
    .find((item) => item.instanceId === project.instanceId && item.projectId === project.id);
  const wrap = document.createElement('span');
  wrap.className = 'gitlab-project-branches';
  wrap.dataset.configured = target ? 'true' : 'false';
  if (!target) {
    wrap.textContent = '未配置分支';
    return wrap;
  }
  const production = (target.watches || []).find((watch) => watch.role === 'production');
  const testing = (target.watches || []).find((watch) => watch.role === 'testing');
  const custom = (target.watches || []).filter((watch) => watch.role === 'custom');
  const lines = [];
  if (production) {
    lines.push(`生产分支: ${gitlabSelectorText(production.selector)}（仅标记）`);
    if (production.ciSelector) lines.push(`CI/CD: ${gitlabSelectorText(production.ciSelector)}`);
  }
  if (testing) {
    lines.push(`测试分支: ${gitlabSelectorText(testing.selector)}`);
    if (testing.ciSelector) lines.push(`CI/CD: ${gitlabSelectorText(testing.ciSelector)}`);
  }
  custom.forEach((watch, index) => {
    lines.push(`展示分支${index + 1}: ${gitlabSelectorText(watch.selector)}`);
    if (watch.ciSelector) lines.push(`CI/CD: ${gitlabSelectorText(watch.ciSelector)}`);
  });
  wrap.textContent = lines.join('\n') || '已配置观测';
  return wrap;
}

function openGitLabBranchConfig(project) {
  const target = (state.gitlabTool.config?.monitor?.targets || [])
    .find((item) => item.instanceId === project.instanceId && item.projectId === project.id);
  const production = (target?.watches || []).find((watch) => watch.role === 'production');
  const testing = (target?.watches || []).find((watch) => watch.role === 'testing');
  const custom = (target?.watches || []).filter((watch) => watch.role === 'custom');
  state.gitlabTool.branchConfig = {
    project,
    production: gitlabBranchDraftFromWatch(production, {
      enabled: Boolean(production),
      role: 'production',
      monitorEnabled: false,
      selector: { type: 'fixed', value: project.defaultBranch || 'master' }
    }),
    testing: gitlabBranchDraftFromWatch(testing, {
      enabled: Boolean(testing) || !target,
      role: 'testing',
      monitorEnabled: true,
      selector: { type: 'fixed', value: project.defaultBranch || 'staging' }
    }),
    custom: custom.map((watch, index) => gitlabBranchDraftFromWatch(watch, {
      enabled: true,
      role: 'custom',
      title: `展示分支 ${index + 1}`,
      monitorEnabled: true,
      selector: { type: 'fixed', value: project.defaultBranch || 'main' }
    }))
  };
}

function gitlabBranchDraftFromWatch(watch, fallback) {
  const selector = watch?.selector || fallback.selector;
  const ciSelector = watch?.ciSelector || null;
  const draft = {
    id: watch?.id || '',
    enabled: watch ? true : fallback.enabled,
    role: fallback.role,
    title: fallback.title || '',
    monitorEnabled: watch?.monitorEnabled !== undefined ? watch.monitorEnabled !== false : fallback.monitorEnabled,
    selectorType: selector?.type || 'fixed',
    fixed: selector?.type === 'fixed' ? selector.value || '' : '',
    regex: selector?.type === 'regex' ? selector.value || '' : '',
    prefix: selector?.type === 'rule' ? selector.prefix || '' : '',
    separator: selector?.type === 'rule' ? selector.separator || '-' : '-',
    format: selector?.type === 'rule' ? selector.format || 'yyyymmdd' : 'yyyymmdd',
    useCiSelector: Boolean(ciSelector),
    ciSelectorType: ciSelector?.type || 'fixed',
    ciFixed: ciSelector?.type === 'fixed' ? ciSelector.value || '' : '',
    ciRegex: ciSelector?.type === 'regex' ? ciSelector.value || '' : '',
    ciPrefix: ciSelector?.type === 'rule' ? ciSelector.prefix || '' : '',
    ciSeparator: ciSelector?.type === 'rule' ? ciSelector.separator || '-' : '-',
    ciFormat: ciSelector?.type === 'rule' ? ciSelector.format || 'yyyymmdd' : 'yyyymmdd',
    matchKey: '',
    matchedBranch: '',
    matchError: '',
    matching: false,
    ciMatchKey: '',
    ciMatchedBranch: '',
    ciMatchError: '',
    ciMatching: false
  };
  if (draft.selectorType === 'fixed' && !draft.fixed) draft.fixed = fallback.selector.value || '';
  if (draft.selectorType === 'rule' && !draft.prefix) draft.prefix = fallback.role === 'production' ? 'publish' : 'staging';
  if (draft.ciSelectorType === 'rule' && !draft.ciPrefix) draft.ciPrefix = draft.prefix || (fallback.role === 'production' ? 'publish' : 'staging');
  if (draft.ciSelectorType === 'fixed' && !draft.ciFixed) draft.ciFixed = draft.fixed || fallback.selector.value || '';
  return draft;
}

function renderGitLabBranchConfigDialog() {
  const draft = state.gitlabTool.branchConfig;
  const overlay = document.createElement('div');
  overlay.className = 'gitlab-modal-backdrop';
  const dialog = document.createElement('section');
  dialog.className = 'gitlab-branch-dialog';
  const title = document.createElement('h2');
  title.textContent = '配置项目分支';
  const projectCard = document.createElement('div');
  projectCard.className = 'gitlab-branch-project';
  projectCard.innerHTML = `<strong>${escapeHtml(draft.project.pathWithNamespace)}</strong><span>${escapeHtml(draft.project.webURL || draft.project.httpUrlToRepo || '')}</span>`;
  const form = document.createElement('div');
  form.className = 'gitlab-branch-form';
  form.append(
    renderGitLabBranchRoleEditor('生产分支', draft.production),
    renderGitLabBranchRoleEditor('测试分支', draft.testing)
  );
  draft.custom.forEach((item, index) => {
    form.append(renderGitLabBranchRoleEditor(`展示分支 ${index + 1}`, item, {
      removable: true,
      onRemove: () => {
        draft.custom.splice(index, 1);
        renderGitLabTool();
      }
    }));
  });
  form.append(gitlabButton('+ 添加展示分支', () => {
    draft.custom.push(gitlabBranchDraftFromWatch(null, {
      enabled: true,
      role: 'custom',
      title: `展示分支 ${draft.custom.length + 1}`,
      monitorEnabled: true,
      selector: { type: 'fixed', value: draft.project.defaultBranch || 'main' }
    }));
    renderGitLabTool();
  }, 'secondary-button gitlab-add-branch-button'));
  const actions = document.createElement('div');
  actions.className = 'gitlab-branch-actions';
  actions.append(gitlabButton('取消', () => {
    state.gitlabTool.branchConfig = null;
    renderGitLabTool();
  }));
  actions.append(gitlabButton('保存配置', async () => {
    const watches = [
      gitlabWatchFromDraft(draft.production),
      gitlabWatchFromDraft(draft.testing),
      ...draft.custom.map(gitlabWatchFromDraft)
    ].filter(Boolean);
    const result = await window.toolkit.gitlabSaveMonitorTarget({
      instanceId: draft.project.instanceId,
      projectId: draft.project.id,
      name: draft.project.name,
      pathWithNamespace: draft.project.pathWithNamespace,
      watches
    });
    state.gitlabTool.config = result.config;
    state.gitlabTool.branchConfig = null;
    state.gitlabTool.message = '项目分支配置已保存';
    window.toolkit.gitlabRefreshMonitor().then((payload) => {
      state.gitlabTool.monitorStatuses = payload.statuses || [];
      if (state.activeToolId === 'gitlab') renderGitLabTool();
    }).catch(() => {});
    renderGitLabTool();
  }, 'primary-button'));
  dialog.append(title, projectCard, form, actions);
  overlay.append(dialog);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      state.gitlabTool.branchConfig = null;
      renderGitLabTool();
    }
  });
  return overlay;
}

function renderGitLabBranchRoleEditor(title, draft, options = {}) {
  const section = document.createElement('section');
  section.className = 'gitlab-branch-role';
  const head = document.createElement('div');
  head.className = 'gitlab-branch-role-head';
  const enabled = document.createElement('label');
  enabled.className = 'gitlab-branch-check';
  const enabledInput = document.createElement('input');
  enabledInput.type = 'checkbox';
  enabledInput.checked = draft.enabled;
  enabledInput.addEventListener('change', () => {
    draft.enabled = enabledInput.checked;
    renderGitLabTool();
  });
  enabled.append(enabledInput, document.createTextNode(title));
  head.append(enabled);
  if (options.removable) {
    head.append(gitlabButton('删除', options.onRemove, 'secondary-button gitlab-remove-branch-button'));
  }
  section.append(head);
  if (!draft.enabled) return section;

  section.append(renderGitLabSelectorMode(draft));
  const row = document.createElement('div');
  row.className = 'gitlab-branch-selector-row';
  if (draft.selectorType === 'fixed') {
    row.append(gitlabBranchInput(draft.fixed, (value) => {
      draft.fixed = value;
      gitlabInvalidateBranchMatch(draft);
    }, title === '生产分支' ? 'master' : 'staging'));
  } else if (draft.selectorType === 'regex') {
    row.append(gitlabBranchInput(draft.regex, (value) => {
      draft.regex = value;
      gitlabInvalidateBranchMatch(draft);
    }, '^release-'));
  } else {
    row.append(
      gitlabBranchInput(draft.prefix, (value) => {
        draft.prefix = value;
        gitlabInvalidateBranchMatch(draft);
      }, title === '生产分支' ? 'publish' : 'staging'),
      gitlabBranchInput(draft.separator, (value) => {
        draft.separator = value || '-';
        gitlabInvalidateBranchMatch(draft);
      }, '-'),
      renderGitLabBranchFormatSelect(draft)
    );
    const hint = document.createElement('small');
    hint.textContent = `匹配示例: ${draft.prefix || 'prefix'}${draft.separator || '-'}${gitlabBranchFormatExample(draft.format)}`;
    section.append(hint);
  }
  section.append(row);
  ensureGitLabBranchMatch(draft);
  const matched = document.createElement('small');
  matched.className = draft.matchError ? 'gitlab-branch-match error' : 'gitlab-branch-match';
  matched.textContent = draft.matching
    ? '实际匹配的 git 分支: 匹配中...'
    : draft.matchError
      ? `实际匹配的 git 分支: ${draft.matchError}`
      : `实际匹配的 git 分支: ${draft.matchedBranch || '未匹配到分支'}`;
  section.append(matched);
  const monitor = document.createElement('label');
  monitor.className = 'gitlab-branch-check';
  const monitorInput = document.createElement('input');
  monitorInput.type = 'checkbox';
  monitorInput.checked = draft.monitorEnabled;
  monitorInput.addEventListener('change', () => { draft.monitorEnabled = monitorInput.checked; });
  monitor.append(monitorInput, document.createTextNode('监测运行状态'));
  section.append(monitor);

  const ciToggle = document.createElement('label');
  ciToggle.className = 'gitlab-branch-check';
  const ciToggleInput = document.createElement('input');
  ciToggleInput.type = 'checkbox';
  ciToggleInput.checked = draft.useCiSelector;
  ciToggleInput.addEventListener('change', () => {
    draft.useCiSelector = ciToggleInput.checked;
    renderGitLabTool();
  });
  ciToggle.append(ciToggleInput, document.createTextNode('CI/CD 使用其他分支或规则'));
  section.append(ciToggle);

  if (draft.useCiSelector) {
    section.append(renderGitLabCiSelectorEditor(title, draft));
  }
  return section;
}

function renderGitLabCiSelectorEditor(title, draft) {
  const wrap = document.createElement('div');
  wrap.className = 'gitlab-ci-selector';
  wrap.append(renderGitLabSelectorMode(draft, true));
  const row = document.createElement('div');
  row.className = 'gitlab-branch-selector-row';
  if (draft.ciSelectorType === 'fixed') {
    row.append(gitlabBranchInput(draft.ciFixed, (value) => {
      draft.ciFixed = value;
      gitlabInvalidateBranchMatch(draft, true);
    }, title === '生产分支' ? 'master' : 'staging'));
  } else if (draft.ciSelectorType === 'regex') {
    row.append(gitlabBranchInput(draft.ciRegex, (value) => {
      draft.ciRegex = value;
      gitlabInvalidateBranchMatch(draft, true);
    }, '^release-'));
  } else {
    row.append(
      gitlabBranchInput(draft.ciPrefix, (value) => {
        draft.ciPrefix = value;
        gitlabInvalidateBranchMatch(draft, true);
      }, title === '生产分支' ? 'publish' : 'staging'),
      gitlabBranchInput(draft.ciSeparator, (value) => {
        draft.ciSeparator = value || '-';
        gitlabInvalidateBranchMatch(draft, true);
      }, '-'),
      renderGitLabBranchFormatSelect(draft, true)
    );
    const hint = document.createElement('small');
    hint.textContent = `CI/CD 匹配示例: ${draft.ciPrefix || 'prefix'}${draft.ciSeparator || '-'}${gitlabBranchFormatExample(draft.ciFormat)}`;
    wrap.append(hint);
  }
  wrap.append(row);
  ensureGitLabBranchMatch(draft, true);
  const matched = document.createElement('small');
  matched.className = draft.ciMatchError ? 'gitlab-branch-match error' : 'gitlab-branch-match';
  matched.textContent = draft.ciMatching
    ? 'CI/CD 实际匹配分支: 匹配中...'
    : draft.ciMatchError
      ? `CI/CD 实际匹配分支: ${draft.ciMatchError}`
      : `CI/CD 实际匹配分支: ${draft.ciMatchedBranch || '未匹配到分支'}`;
  wrap.append(matched);
  return wrap;
}

function renderGitLabSelectorMode(draft, isCiSelector = false) {
  const segmented = document.createElement('div');
  segmented.className = 'gitlab-branch-segmented';
  [
    ['fixed', '固定分支'],
    ['rule', '动态匹配最新'],
    ['regex', '自定义正则']
  ].forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = (isCiSelector ? draft.ciSelectorType : draft.selectorType) === value ? 'active' : '';
    button.textContent = label;
    button.addEventListener('click', () => {
      if (isCiSelector) draft.ciSelectorType = value;
      else draft.selectorType = value;
      gitlabInvalidateBranchMatch(draft, isCiSelector);
      renderGitLabTool();
    });
    segmented.append(button);
  });
  return segmented;
}

function gitlabBranchInput(value, onInput, placeholder) {
  const input = document.createElement('input');
  input.value = value || '';
  input.placeholder = placeholder || '';
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function renderGitLabBranchFormatSelect(draft, isCiSelector = false) {
  const select = document.createElement('select');
  [
    ['yyyymmdd', 'YYYYMMDD'],
    ['yyyymmddDashed', 'YYYY-MM-DD'],
    ['yyyymmddDotted', 'YYYY.MM.DD'],
    ['yyyymmddWithTail', 'YYYYMMDD-*']
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
      option.textContent = label;
      select.append(option);
  });
  select.value = isCiSelector ? draft.ciFormat : draft.format;
  select.addEventListener('change', () => {
    if (isCiSelector) draft.ciFormat = select.value;
    else draft.format = select.value;
    gitlabInvalidateBranchMatch(draft, isCiSelector);
    renderGitLabTool();
  });
  return select;
}

function gitlabBranchFormatExample(format) {
  if (format === 'yyyymmddDashed') return '2026-06-16';
  if (format === 'yyyymmddDotted') return '2026.06.16';
  if (format === 'yyyymmddWithTail') return '20260616-01';
  return '20260616';
}

function gitlabInvalidateBranchMatch(draft, isCiSelector = false) {
  if (isCiSelector) {
    draft.ciMatchKey = '';
    draft.ciMatchedBranch = '';
    draft.ciMatchError = '';
    draft.ciMatching = false;
    return;
  }
  draft.matchKey = '';
  draft.matchedBranch = '';
  draft.matchError = '';
  draft.matching = false;
}

function ensureGitLabBranchMatch(draft, isCiSelector = false) {
  const selector = gitlabSelectorFromDraft(draft, isCiSelector);
  if (!draft.enabled || !selector) {
    gitlabInvalidateBranchMatch(draft, isCiSelector);
    return;
  }
  const config = state.gitlabTool.branchConfig;
  if (!config?.project) return;

  const nextKey = JSON.stringify({
    instanceId: config.project.instanceId,
    projectId: config.project.id,
    source: isCiSelector ? 'ci' : 'display',
    selector
  });
  if (selector.type === 'fixed') {
    if ((isCiSelector ? draft.ciMatchKey : draft.matchKey) === nextKey && (isCiSelector ? draft.ciMatchedBranch : draft.matchedBranch) === selector.value) return;
    if (isCiSelector) {
      draft.ciMatchKey = nextKey;
      draft.ciMatchedBranch = selector.value;
      draft.ciMatchError = '';
      draft.ciMatching = false;
    } else {
      draft.matchKey = nextKey;
      draft.matchedBranch = selector.value;
      draft.matchError = '';
      draft.matching = false;
    }
    return;
  }
  if ((isCiSelector ? draft.ciMatchKey : draft.matchKey) === nextKey && ((isCiSelector ? draft.ciMatching : draft.matching) || (isCiSelector ? draft.ciMatchedBranch : draft.matchedBranch) || (isCiSelector ? draft.ciMatchError : draft.matchError))) return;

  if (isCiSelector) {
    draft.ciMatchKey = nextKey;
    draft.ciMatching = true;
    draft.ciMatchError = '';
    draft.ciMatchedBranch = '';
  } else {
    draft.matchKey = nextKey;
    draft.matching = true;
    draft.matchError = '';
    draft.matchedBranch = '';
  }
  gitlabResolveBranchMatch(config.project, selector, nextKey)
    .then((matchedBranch) => {
      if (!state.gitlabTool.branchConfig || (isCiSelector ? draft.ciMatchKey : draft.matchKey) !== nextKey) return;
      if (isCiSelector) {
        draft.ciMatching = false;
        draft.ciMatchedBranch = matchedBranch || '';
        draft.ciMatchError = matchedBranch ? '' : '未匹配到分支';
      } else {
        draft.matching = false;
        draft.matchedBranch = matchedBranch || '';
        draft.matchError = matchedBranch ? '' : '未匹配到分支';
      }
      if (state.activeToolId === 'gitlab') renderGitLabTool();
    })
    .catch((error) => {
      if (!state.gitlabTool.branchConfig || (isCiSelector ? draft.ciMatchKey : draft.matchKey) !== nextKey) return;
      if (isCiSelector) {
        draft.ciMatching = false;
        draft.ciMatchError = readableErrorMessage(error);
      } else {
        draft.matching = false;
        draft.matchError = readableErrorMessage(error);
      }
      if (state.activeToolId === 'gitlab') renderGitLabTool();
    });
}

async function gitlabResolveBranchMatch(project, selector, requestKey) {
  const search = gitlabBranchSelectorSearchPrefix(selector);
  const rows = await window.toolkit.gitlabListBranches(project.instanceId, project.id, search || undefined);
  if (!state.gitlabTool.branchConfig) return '';
  const names = (Array.isArray(rows) ? rows : []).map((item) => String(item?.name || item || '')).filter(Boolean);
  const matched = names.filter((name) => gitlabMatchesBranchSelector(name, selector));
  if (state.gitlabTool.branchConfig && requestKey !== JSON.stringify({
    instanceId: project.instanceId,
    projectId: project.id,
    selector
  })) {
    return '';
  }
  return matched.sort().reverse()[0] || '';
}

function gitlabMatchesBranchSelector(branch, selector) {
  if (!selector) return false;
  if (selector.type === 'fixed') return branch === String(selector.value || '').trim();
  const pattern = gitlabBranchSelectorRegex(selector);
  return pattern ? new RegExp(pattern).test(branch) : false;
}

function gitlabBranchSelectorSearchPrefix(selector) {
  if (!selector) return '';
  if (selector.type === 'rule') return `${String(selector.prefix || '').trim()}${String(selector.separator || '-').trim() || '-'}`;
  if (selector.type === 'regex') return gitlabLeadingLiteralPrefix(String(selector.value || ''));
  return '';
}

function gitlabBranchSelectorRegex(selector) {
  if (!selector) return null;
  if (selector.type === 'regex') return String(selector.value || '').trim() || null;
  if (selector.type !== 'rule') return null;
  const prefix = gitlabEscapeRegExp(String(selector.prefix || '').trim());
  const separator = gitlabEscapeRegExp(String(selector.separator || '-').trim() || '-');
  const head = `${prefix}${separator}`;
  if (selector.format === 'yyyymmddDashed') return `^${head}\\d{4}-\\d{2}-\\d{2}$`;
  if (selector.format === 'yyyymmddDotted') return `^${head}\\d{4}\\.\\d{2}\\.\\d{2}$`;
  if (selector.format === 'yyyymmddWithTail') return `^${head}\\d{8}-.+$`;
  return `^${head}\\d{8}$`;
}

function gitlabLeadingLiteralPrefix(pattern) {
  if (!pattern || pattern[0] !== '^') return '';
  const metacharacters = new Set('.+*?()[]{}|$^');
  let prefix = '';
  for (let index = 1; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '\\') {
      const escaped = pattern[index + 1];
      if (!escaped) break;
      if (metacharacters.has(escaped) || escaped === '/' || escaped === '-') {
        prefix += escaped;
        index += 1;
        continue;
      }
      break;
    }
    if (metacharacters.has(character)) break;
    prefix += character;
  }
  return prefix;
}

function gitlabEscapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function gitlabWatchFromDraft(draft) {
  if (!draft.enabled) return null;
  const selector = gitlabSelectorFromDraft(draft);
  if (!selector) return null;
  const ciSelector = draft.useCiSelector ? gitlabSelectorFromDraft(draft, true) : null;
  return {
    id: draft.id || `${draft.role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role: draft.role,
    selector,
    ciSelector,
    monitorEnabled: draft.monitorEnabled
  };
}

function gitlabSelectorFromDraft(draft, isCiSelector = false) {
  const selectorType = isCiSelector ? draft.ciSelectorType : draft.selectorType;
  if (selectorType === 'fixed') {
    const value = String(isCiSelector ? draft.ciFixed : draft.fixed || '').trim();
    return value ? { type: 'fixed', value } : null;
  }
  if (selectorType === 'regex') {
    const value = String(isCiSelector ? draft.ciRegex : draft.regex || '').trim();
    return value ? { type: 'regex', value } : null;
  }
  const prefix = String(isCiSelector ? draft.ciPrefix : draft.prefix || '').trim();
  return prefix
    ? {
        type: 'rule',
        prefix,
        separator: isCiSelector ? draft.ciSeparator || '-' : draft.separator || '-',
        format: isCiSelector ? draft.ciFormat || 'yyyymmdd' : draft.format || 'yyyymmdd'
      }
    : null;
}

function renderGitLabSettings() {
  const gitlab = state.gitlabTool;
  const panel = document.createElement('section');
  panel.className = 'gitlab-panel';
  panel.append(renderGitLabHero());
  const grid = document.createElement('div');
  grid.className = 'gitlab-config-grid';
  grid.append(renderGitLabInstanceList(), renderGitLabInstanceEditor());
  panel.append(grid);
  return panel;
}

function renderGitLabHero(title = 'GitLabMenu', description = '配置 GitLab 基本信息，拉取项目列表，然后批量 clone / pull 到本地。') {
  const gitlab = state.gitlabTool;
  const hero = document.createElement('div');
  hero.className = 'gitlab-hero';
  const mark = document.createElement('div');
  mark.className = 'gitlab-hero-mark';
  mark.textContent = '◎';
  const copy = document.createElement('div');
  copy.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span>`;
  const current = gitlabCurrentInstance();
  const status = document.createElement('div');
  status.className = `gitlab-hero-status${current ? ' ok' : ''}`;
  status.textContent = current ? `✓ ${current.name}` : '未配置';
  hero.append(mark, copy, status);
  return hero;
}

function renderGitLabInstanceList() {
  const gitlab = state.gitlabTool;
  const card = document.createElement('aside');
  card.className = 'gitlab-instance-list';
  const list = document.createElement('div');
  list.className = 'gitlab-instance-items';
  const instances = gitlab.config?.instances || [];
  if (instances.length === 0) {
    list.append(renderGitLabNotice('暂无实例，点击“新增”开始配置。'));
  }
  instances.forEach((instance) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `gitlab-instance-item${gitlab.currentInstanceId === instance.id ? ' active' : ''}`;
    item.innerHTML = `<strong>${escapeHtml(instance.name)}</strong><span>${escapeHtml(instance.baseURL)}</span>`;
    item.addEventListener('click', () => {
      gitlab.currentInstanceId = instance.id;
      syncGitLabFormFromInstance(instance);
      renderGitLabTool();
    });
    list.append(item);
  });
  const actions = document.createElement('div');
  actions.className = 'gitlab-instance-actions';
  actions.append(gitlabButton('+ 新增', () => {
    gitlab.currentInstanceId = '';
    syncGitLabFormFromInstance(null);
    renderGitLabTool();
  }));
  actions.append(gitlabButton('− 删除', async () => {
    const instance = gitlabCurrentInstance();
    if (!instance || !confirm(`确定删除 ${instance.name} 吗？`)) return;
    const result = await window.toolkit.gitlabRemoveInstance(instance.id);
    gitlab.config = result.config;
    gitlab.currentInstanceId = gitlab.config.instances[0]?.id || '';
    syncGitLabFormFromInstance(gitlabCurrentInstance());
    gitlab.message = 'GitLab 实例已删除';
    renderGitLabTool();
  }));
  actions.append(gitlabButton('导入 GitLabMenu 配置', async () => {
    const result = await window.toolkit.gitlabImportLegacyConfig({ merge: true });
    gitlab.config = result.config;
    gitlab.projectsByInstance = { ...(result.config?.recentProjects || {}), ...gitlab.projectsByInstance };
    gitlab.currentInstanceId = gitlab.currentInstanceId || gitlab.config.instances[0]?.id || '';
    syncGitLabFormFromInstance(gitlabCurrentInstance());
    const tokenHint = result.importedTokenCount > 0
      ? `，已迁移 ${result.importedTokenCount} 个 PAT`
      : '，PAT 需在右侧重新填写并保存';
    gitlab.message = `已从旧 GitLabMenu 导入 ${result.importedInstanceCount} 个实例、${result.importedMonitorTargetCount} 个观测项目${tokenHint}`;
    renderGitLabTool();
  }));
  card.append(list, actions);
  return card;
}

function renderGitLabInstanceEditor() {
  const gitlab = state.gitlabTool;
  const card = document.createElement('section');
  card.className = 'gitlab-instance-editor';
  const form = document.createElement('div');
  form.className = 'gitlab-config-form';
  form.append(
    gitlabInlineField('名称', 'text', gitlab.form.name, (value) => { gitlab.form.name = value; }),
    gitlabInlineField('Base URL', 'url', gitlab.form.baseURL, (value) => { gitlab.form.baseURL = value; }),
    gitlabInlineField('Personal Access Token', 'password', gitlab.form.token, (value) => { gitlab.form.token = value; }, '留空表示不修改已保存 token'),
    renderGitLabProtocolField(),
    renderGitLabCloneRootField()
  );
  const divider = document.createElement('div');
  divider.className = 'gitlab-divider';
  const verify = document.createElement('div');
  verify.className = 'gitlab-editor-actions left';
  verify.append(gitlabButton('验证 PAT', async () => {
    gitlab.message = '正在验证 PAT...';
    renderGitLabTool();
    const result = await window.toolkit.gitlabVerifyInstance(gitlab.form);
    gitlab.message = `验证通过：${result.username || 'GitLab 用户'}`;
    renderGitLabTool();
  }));
  const actions = document.createElement('div');
  actions.className = 'gitlab-editor-actions';
  actions.append(gitlabButton('取消', () => {
    syncGitLabFormFromInstance(gitlabCurrentInstance());
    gitlab.message = '';
    renderGitLabTool();
  }));
  actions.append(gitlabButton('保存', async () => {
    const result = await window.toolkit.gitlabSaveInstance(gitlab.form);
    gitlab.config = result.config;
    gitlab.currentInstanceId = result.instance.id;
    syncGitLabFormFromInstance(result.instance);
    gitlab.message = 'GitLab 实例已保存';
    renderGitLabTool();
  }, 'primary-button'));
  card.append(form, divider, verify, actions);
  return card;
}

function gitlabInlineField(labelText, type, value, onInput, placeholder = '') {
  const row = document.createElement('label');
  row.className = 'gitlab-inline-field';
  const label = document.createElement('span');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.value = value ?? '';
  input.placeholder = placeholder;
  input.addEventListener('input', () => onInput(input.value));
  row.append(label, input);
  return row;
}

function renderGitLabProtocolField() {
  const gitlab = state.gitlabTool;
  const row = document.createElement('label');
  row.className = 'gitlab-inline-field';
  const label = document.createElement('span');
  label.textContent = 'Clone 协议';
  const segmented = document.createElement('div');
  segmented.className = 'gitlab-segmented';
  [
    ['https', 'HTTPS + PAT'],
    ['ssh', 'SSH']
  ].forEach(([value, text]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = gitlab.form.cloneProtocol === value ? 'active' : '';
    button.textContent = text;
    button.addEventListener('click', () => {
      gitlab.form.cloneProtocol = value;
      renderGitLabTool();
    });
    segmented.append(button);
  });
  row.append(label, segmented);
  return row;
}

function renderGitLabCloneRootField() {
  const gitlab = state.gitlabTool;
  const wrap = document.createElement('div');
  wrap.className = 'gitlab-root-field';
  wrap.append(gitlabInlineField('默认 Clone 根目录', 'text', gitlab.form.defaultCloneRoot, (value) => {
    gitlab.form.defaultCloneRoot = value;
  }));
  const choose = gitlabButton('选择目录...', async () => {
    const result = await window.toolkit.gitlabChooseCloneRoot(gitlab.form.defaultCloneRoot);
    if (!result.canceled) {
      gitlab.form.defaultCloneRoot = result.filePath;
      renderGitLabTool();
    }
  });
  wrap.append(choose);
  return wrap;
}

function renderGitLabSyncControls(instance) {
  const gitlab = state.gitlabTool;
  const toolbar = document.createElement('div');
  toolbar.className = 'gitlab-toolbar';
  const mode = document.createElement('select');
  [
    ['skip', '跳过已存在'],
    ['pull', '拉取更新'],
    ['reclone', '强制重新克隆']
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    mode.append(option);
  });
  mode.value = gitlab.cloneMode;
  mode.addEventListener('change', () => { gitlab.cloneMode = mode.value; });
  toolbar.append(mode);
  const rootInput = document.createElement('input');
  rootInput.value = gitlab.cloneRootOverride || instance.defaultCloneRoot;
  rootInput.placeholder = '同步目录';
  rootInput.addEventListener('input', () => { gitlab.cloneRootOverride = rootInput.value; });
  toolbar.append(rootInput);
  toolbar.append(gitlabButton('选择目录', async () => {
    const result = await window.toolkit.gitlabChooseCloneRoot(rootInput.value);
    if (!result.canceled) {
      gitlab.cloneRootOverride = result.filePath;
      renderGitLabTool();
    }
  }));
  toolbar.append(gitlabButton('打开目录', () => window.toolkit.gitlabOpenCloneRoot(rootInput.value)));
  const controls = document.createElement('div');
  controls.className = 'gitlab-sync-controls';
  controls.append(toolbar);

  const branchBar = document.createElement('div');
  branchBar.className = 'gitlab-toolbar';
  const branchInput = document.createElement('input');
  branchInput.value = gitlab.branchTarget;
  branchInput.placeholder = '批量切换目标分支，例如 release/2026.06';
  branchInput.addEventListener('input', () => { gitlab.branchTarget = branchInput.value; });
  branchBar.append(branchInput);
  const dirty = document.createElement('select');
  [
    ['skip', '有改动则跳过'],
    ['stash', '自动 stash'],
    ['discard', '丢弃改动']
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    dirty.append(option);
  });
  dirty.value = gitlab.dirtyPolicy;
  dirty.addEventListener('change', () => { gitlab.dirtyPolicy = dirty.value; });
  branchBar.append(dirty);
  controls.append(branchBar);

  const selectedCount = gitlab.selectedProjectIds.size;
  const actions = document.createElement('div');
  actions.className = 'gitlab-toolbar';
  actions.append(renderGitLabNotice(`已选 ${selectedCount} 个项目`));
  actions.append(gitlabButton('对选中项执行同步', async () => {
    if (gitlab.cloneMode === 'reclone' && !confirm(`将删除并重新 clone ${selectedCount} 个本地目录，确定继续吗？`)) return;
    gitlab.currentJob = await window.toolkit.gitlabStartClone({
      instanceId: instance.id,
      projectIds: [...gitlab.selectedProjectIds],
      rootDirectory: rootInput.value,
      mode: gitlab.cloneMode,
      maxConcurrency: gitlab.maxConcurrency
    });
    renderGitLabTool();
  }, 'primary-button'));
  actions.append(gitlabButton('批量切换分支', async () => {
    if (gitlab.dirtyPolicy === 'discard' && !confirm('将丢弃未提交改动，确定继续吗？')) return;
    gitlab.currentJob = await window.toolkit.gitlabStartBranchSwitch({
      instanceId: instance.id,
      projectIds: [...gitlab.selectedProjectIds],
      rootDirectory: rootInput.value,
      targetBranch: gitlab.branchTarget,
      dirtyPolicy: gitlab.dirtyPolicy,
      maxConcurrency: gitlab.maxConcurrency
    });
    renderGitLabTool();
  }));
  if (gitlab.currentJob && !gitlab.currentJob.done) {
    actions.append(gitlabButton('取消当前任务', () => window.toolkit.gitlabCancelJob(gitlab.currentJob.id)));
  }
  controls.append(actions, renderGitLabJob());
  return controls;
}

function renderGitLabCloneSettings() {
  const gitlab = state.gitlabTool;
  const panel = document.createElement('section');
  panel.className = 'gitlab-panel';
  panel.append(renderGitLabHero('克隆设置', '设置默认同步模式、并发数和 HTTPS clone 后的 token 清理策略。'));
  const form = document.createElement('div');
  form.className = 'gitlab-form compact';
  const modeLabel = document.createElement('label');
  modeLabel.textContent = '默认模式';
  const mode = document.createElement('select');
  [
    ['skip', '跳过已存在'],
    ['pull', '拉取更新'],
    ['reclone', '强制重新克隆']
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    mode.append(option);
  });
  mode.value = gitlab.cloneMode;
  mode.addEventListener('change', () => { gitlab.cloneMode = mode.value; });
  modeLabel.append(mode);
  form.append(
    modeLabel,
    gitlabField('默认并发', 'number', gitlab.maxConcurrency, (value) => { gitlab.maxConcurrency = Number(value) || 1; }),
    gitlabField('监控间隔秒', 'number', gitlab.monitorPollInterval, (value) => { gitlab.monitorPollInterval = Number(value) || 60; })
  );
  const strip = document.createElement('label');
  strip.textContent = 'HTTPS clone 后擦除 remote token';
  const stripBox = document.createElement('input');
  stripBox.type = 'checkbox';
  stripBox.checked = gitlab.stripTokenAfterClone;
  stripBox.addEventListener('change', () => { gitlab.stripTokenAfterClone = stripBox.checked; });
  strip.append(stripBox);
  form.append(strip);
  panel.append(form);
  panel.append(gitlabButton('保存克隆设置', async () => {
    const result = await window.toolkit.gitlabUpdateSettings({
      clone: { maxConcurrency: gitlab.maxConcurrency, stripTokenAfterClone: gitlab.stripTokenAfterClone, defaultMode: gitlab.cloneMode },
      monitor: { pollIntervalSeconds: gitlab.monitorPollInterval, targets: gitlab.config.monitor.targets }
    });
    gitlab.config = result.config;
    gitlab.message = '克隆设置已保存';
    renderGitLabTool();
  }, 'primary-button'));
  return panel;
}

function renderGitLabJob() {
  const job = state.gitlabTool.currentJob;
  const box = document.createElement('div');
  box.className = 'gitlab-job';
  if (!job) {
    box.append(renderGitLabNotice('暂无同步任务。'));
    return box;
  }
  const summary = job.summary || {};
  const head = document.createElement('div');
  head.className = 'gitlab-summary';
  head.textContent = `${job.done ? '已完成' : '执行中'} · 成功 ${summary.succeeded || 0} / 失败 ${summary.failed || 0} / 跳过 ${summary.skipped || 0} / 总计 ${job.projectCount}`;
  box.append(head);
  const rows = document.createElement('div');
  rows.className = 'gitlab-progress-grid';
  Object.entries(job.progress || {}).forEach(([projectId, item]) => {
    const chip = document.createElement('span');
    chip.className = `gitlab-chip ${item.state}`;
    chip.textContent = `${projectId}: ${gitlabStateLabel(item.state)}${item.message ? ` · ${item.message}` : ''}`;
    rows.append(chip);
  });
  box.append(rows);
  const logs = document.createElement('pre');
  logs.className = 'gitlab-logs';
  logs.textContent = (job.logs || state.gitlabTool.logs || []).slice(-120).map((entry) => `[${entry.stream}] ${entry.projectId || '-'} ${entry.message}`).join('\n');
  box.append(logs);
  return box;
}

function renderGitLabMonitor() {
  const gitlab = state.gitlabTool;
  const instance = gitlabCurrentInstance();
  const panel = document.createElement('section');
  panel.className = 'gitlab-panel';
  panel.append(renderGitLabInstancePicker());
  if (!instance) {
    panel.append(renderGitLabNotice('先配置 GitLab 实例。'));
    return panel;
  }
  const selectedProjects = (gitlab.projectsByInstance[instance.id] || []).filter((project) => gitlab.selectedProjectIds.has(project.id));
  const toolbar = document.createElement('div');
  toolbar.className = 'gitlab-toolbar';
  const branch = document.createElement('input');
  branch.placeholder = '观测分支，多个用逗号分隔，如 main,test,release';
  branch.value = gitlab.monitorBranches.__default || '';
  branch.addEventListener('input', () => { gitlab.monitorBranches.__default = branch.value; });
  toolbar.append(branch);
  toolbar.append(gitlabButton('把选中项目加入观测', async () => {
    for (const project of selectedProjects) {
      const branches = normalizeGitLabBranchInput(gitlab.monitorBranches.__default || project.defaultBranch || 'main');
      await window.toolkit.gitlabSaveMonitorTarget({
        instanceId: instance.id,
        projectId: project.id,
        name: project.name,
        pathWithNamespace: project.pathWithNamespace,
        branches
      });
    }
    await loadGitLabTool();
    gitlab.tab = 'monitor';
    renderGitLabTool();
  }, 'primary-button'));
  toolbar.append(gitlabButton('刷新 Pipeline', async () => {
    const result = await window.toolkit.gitlabRefreshMonitor();
    gitlab.monitorStatuses = result.statuses;
    renderGitLabTool();
  }));
  panel.append(toolbar);

  const targets = gitlab.config?.monitor?.targets || [];
  if (targets.length === 0) panel.append(renderGitLabNotice('暂无观测项目，可先在项目页选择项目后加入观测。'));
  const targetList = document.createElement('div');
  targetList.className = 'gitlab-project-list';
  targets.forEach((target) => {
    const row = document.createElement('div');
    row.className = 'gitlab-project-row';
    const status = gitlab.monitorStatuses.find((item) => item.target?.instanceId === target.instanceId && item.target?.projectId === target.projectId);
    const text = document.createElement('span');
    text.innerHTML = `<strong>${escapeHtml(target.pathWithNamespace)}</strong><small>${escapeHtml((target.watches || []).map((watch) => `${watch.role}: ${gitlabSelectorText(watch.selector)}`).join('，'))}</small>`;
    const badge = document.createElement('span');
    badge.className = `gitlab-chip ${status?.status || 'unknown'}`;
    const triggerer = gitlabTriggererText(status?.triggerer);
    badge.textContent = status?.errorMessage || [
      status?.statusLabel || '未知',
      status?.resolvedBranch || '',
      triggerer ? `触发 ${triggerer}` : ''
    ].filter(Boolean).join(' · ');
    row.append(text, badge);
    targetList.append(row);
  });
  panel.append(targetList);
  return panel;
}

function renderGitLabAbout() {
  const panel = document.createElement('section');
  panel.className = 'gitlab-panel';
  panel.append(renderGitLabHero('关于 GitLabMenu', 'GitLab 助手已集成到 ElectronToolKit，保留多实例、批量同步和 CI/CD 观测能力。'));
  const body = document.createElement('div');
  body.className = 'gitlab-about';
  [
    ['配置', '多 GitLab 实例、Base URL、PAT、默认 clone 根目录、HTTPS + PAT / SSH clone 协议。'],
    ['同步', '拉取项目列表，按 namespace 搜索和选择，批量 clone / pull / reclone 到本地。'],
    ['分支', '对选中项目批量切分支，支持跳过、stash 或丢弃未提交改动策略。'],
    ['观测', '为项目配置一个或多个分支，刷新 GitLab Pipeline 状态。']
  ].forEach(([title, text]) => {
    const row = document.createElement('div');
    row.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span>`;
    body.append(row);
  });
  panel.append(body);
  return panel;
}

function gitlabField(labelText, type, value, onInput, placeholder = '') {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.value = value ?? '';
  input.placeholder = placeholder;
  input.addEventListener('input', () => onInput(input.value));
  label.append(input);
  return label;
}

function gitlabButton(label, handler, className = 'secondary-button') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', async () => {
    try {
      state.gitlabTool.error = '';
      await handler();
    } catch (error) {
      state.gitlabTool.error = readableErrorMessage(error);
      renderGitLabTool();
    }
  });
  return button;
}

function gitlabStateLabel(value) {
  return { pending: '等待', running: '执行中', succeeded: '成功', failed: '失败', skipped: '跳过', unknown: '未知' }[value] || value;
}

function gitlabSelectorText(selector) {
  if (!selector) return '';
  if (selector.type === 'fixed' || selector.type === 'regex') return selector.value || '';
  if (selector.type === 'rule') return `${selector.prefix}${selector.separator || '-'}...`;
  return '';
}

function gitlabTriggererText(triggerer) {
  if (!triggerer) return '';
  const username = String(triggerer.username || '').trim();
  if (username) return username.startsWith('@') ? username : `@${username}`;
  return String(triggerer.displayName || triggerer.name || '').trim();
}

function normalizeGitLabBranchInput(value) {
  const branches = String(value || '')
    .split(/[,\n，]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return branches.length > 0 ? [...new Set(branches)] : ['main'];
}

function queueOutputSearchRefresh() {
  window.queueMicrotask(() => refreshOutputSearchHighlights({ keepIndex: true }));
}

function refreshOutputSearchHighlights({ keepIndex = false, scroll = false } = {}) {
  clearOutputSearchHighlights();
  const query = state.outputSearch.query.trim();
  if (!query || !elements.output.textContent) {
    state.outputSearch.matches = [];
    state.outputSearch.truncated = false;
    updateOutputSearchCount();
    return;
  }

  const matches = [];
  let truncated = false;
  const normalizedQuery = query.toLowerCase();
  const walker = document.createTreeWalker(elements.output, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.toLowerCase().includes(normalizedQuery)) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('button,input,textarea,select,option,.output-search-match')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];
  while (matches.length < OUTPUT_SEARCH_MATCH_LIMIT) {
    const node = walker.nextNode();
    if (!node) break;
    textNodes.push(node);
  }
  if (walker.nextNode()) truncated = true;

  for (const node of textNodes) {
    if (matches.length >= OUTPUT_SEARCH_MATCH_LIMIT) {
      truncated = true;
      break;
    }
    const fragment = document.createDocumentFragment();
    const source = node.nodeValue;
    const lowerSource = source.toLowerCase();
    let cursor = 0;
    let matchIndex = lowerSource.indexOf(normalizedQuery, cursor);
    while (matchIndex >= 0) {
      if (matches.length >= OUTPUT_SEARCH_MATCH_LIMIT) {
        truncated = true;
        break;
      }
      if (matchIndex > cursor) fragment.append(document.createTextNode(source.slice(cursor, matchIndex)));
      const mark = document.createElement('mark');
      mark.className = 'output-search-match';
      mark.textContent = source.slice(matchIndex, matchIndex + query.length);
      fragment.append(mark);
      matches.push(mark);
      cursor = matchIndex + query.length;
      matchIndex = lowerSource.indexOf(normalizedQuery, cursor);
    }
    if (cursor < source.length) fragment.append(document.createTextNode(source.slice(cursor)));
    node.replaceWith(fragment);
  }

  state.outputSearch.matches = matches;
  state.outputSearch.truncated = truncated;
  if (!keepIndex) state.outputSearch.matchIndex = 0;
  state.outputSearch.matchIndex = matches.length === 0 ? 0 : Math.min(state.outputSearch.matchIndex, matches.length - 1);
  activateOutputSearchMatch({ scroll });
  updateOutputSearchCount();
}

function clearOutputSearchHighlights() {
  elements.output.querySelectorAll('.output-search-match').forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    mark.replaceWith(document.createTextNode(mark.textContent));
    parent.normalize();
  });
}

function activateOutputSearchMatch({ scroll = true } = {}) {
  state.outputSearch.matches.forEach((match, index) => {
    match.classList.toggle('active', index === state.outputSearch.matchIndex);
  });
  const active = state.outputSearch.matches[state.outputSearch.matchIndex];
  if (active && scroll) active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
}

function moveOutputSearchMatch(direction) {
  const total = state.outputSearch.matches.length;
  if (total === 0) return;
  state.outputSearch.matchIndex = (state.outputSearch.matchIndex + direction + total) % total;
  activateOutputSearchMatch();
  updateOutputSearchCount();
}

function updateOutputSearchCount() {
  const total = state.outputSearch.matches.length;
  const query = state.outputSearch.query.trim();
  elements.outputSearchCount.textContent = !query ? '0' : total === 0 ? '0' : `${state.outputSearch.matchIndex + 1}/${total}${state.outputSearch.truncated ? '+' : ''}`;
  elements.outputSearchPrev.disabled = total === 0;
  elements.outputSearchNext.disabled = total === 0;
}

function renderJsonTree(value, compactKeys, stats = collectJsonStats(value, JSON_TREE_RENDER_NODE_LIMIT + 1)) {
  if (stats.truncated || stats.totalNodes > JSON_TREE_RENDER_NODE_LIMIT) {
    renderLargeOutputPreview({
      title: 'JSON 已处理，但节点过多，已关闭树形渲染',
      detail: `当前 JSON 节点超过 ${JSON_TREE_RENDER_NODE_LIMIT.toLocaleString('zh-CN')} 个。为避免界面卡顿，已切换为文本预览；复制结果仍会复制完整文本。`,
      stats
    });
    return;
  }

  const signature = `${state.lastOutput}\n__compact__${compactKeys.join(',')}`;
  if (signature !== state.lastJsonSignature) {
    state.manuallyCollapsedPaths = new Set();
    state.manuallyExpandedPaths = new Set();
    state.lastJsonSignature = signature;
  }
  const compactKeySet = new Set(compactKeys);

  let lineNumber = 1;
  const shell = document.createElement('div');
  shell.className = 'json-tree-shell';
  shell.append(renderJsonTreeToolbar(value, compactKeys, stats));

  const lines = document.createElement('div');
  lines.className = 'json-lines';

  appendValue(lines, {
    value,
    key: '',
    parentType: '',
    pathParts: [],
    path: '$',
    depth: 0,
    hasComma: false
  });

  shell.append(lines);
  elements.output.classList.add('json-tree');
  elements.output.replaceChildren(shell);

  function appendValue(parent, { value: nodeValue, key, parentType, pathParts, path, depth, hasComma }) {
    const foldable = isFoldable(nodeValue);
    const opener = Array.isArray(nodeValue) ? '[' : '{';
    const closer = Array.isArray(nodeValue) ? ']' : '}';
    const defaultCollapsed = Boolean(key && compactKeySet.has(key));
    const collapsed =
      foldable &&
      !state.manuallyExpandedPaths.has(path) &&
      (defaultCollapsed || state.manuallyCollapsedPaths.has(path));

    if (foldable && collapsed) {
      appendLine(parent, {
        lineNumber,
        depth,
        path,
        foldable: true,
        collapsed: true,
        renderContent: (code) => {
          appendKey(code, key, pathParts, parentType);
          appendPunctuation(code, opener);
          appendEllipsis(code);
          appendPunctuation(code, closer);
          appendInlineEditControl(code, 'value', pathParts);
          if (hasComma) appendPunctuation(code, ',');
        }
      });
      lineNumber += countExpandedLines(nodeValue);
      return;
    }

    if (foldable) {
      appendLine(parent, {
        lineNumber: lineNumber++,
        depth,
        path,
        foldable: true,
        collapsed: false,
        renderContent: (code) => {
          appendKey(code, key, pathParts, parentType);
          appendEditablePunctuation(code, opener, 'value', pathParts);
          appendInlineEditControl(code, 'value', pathParts);
        }
      });

      const entries = Array.isArray(nodeValue) ? nodeValue.map((item, index) => [String(index), item]) : Object.entries(nodeValue);
      entries.forEach(([childKey, childValue], index) => {
        const childPathParts = [...pathParts, Array.isArray(nodeValue) ? Number(childKey) : childKey];
        appendValue(parent, {
          value: childValue,
          key: Array.isArray(nodeValue) ? '' : childKey,
          parentType: Array.isArray(nodeValue) ? 'array' : 'object',
          pathParts: childPathParts,
          path: `${path}.${escapePathPart(childKey)}`,
          depth: depth + 1,
          hasComma: index < entries.length - 1
        });
      });

      appendLine(parent, {
        lineNumber: lineNumber++,
        depth,
        renderContent: (code) => appendPunctuation(code, closer + (hasComma ? ',' : ''))
      });
      return;
    }

    appendLine(parent, {
      lineNumber: lineNumber++,
      depth,
      renderContent: (code) => {
        appendKey(code, key, pathParts, parentType);
        appendPrimitive(code, nodeValue, pathParts);
        appendInlineEditControl(code, 'value', pathParts);
        if (hasComma) appendPunctuation(code, ',');
      }
    });
  }

  function appendLine(parent, { lineNumber: currentLineNumber, depth, path, foldable = false, collapsed = false, renderContent }) {
    const line = document.createElement('div');
    line.className = `json-line${collapsed ? ' collapsed-line' : ''}`;

    const gutter = document.createElement('span');
    gutter.className = 'json-gutter';
    gutter.textContent = String(currentLineNumber);
    line.append(gutter);

    const code = document.createElement('span');
    code.className = 'json-code';
    code.style.setProperty('--depth', String(depth));
    appendGuides(code, depth);

    if (foldable) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `fold-button${collapsed ? ' collapsed' : ''}`;
      button.setAttribute('aria-label', collapsed ? '展开 JSON 节点' : '折叠 JSON 节点');
      button.addEventListener('click', () => {
        if (collapsed) {
          state.manuallyExpandedPaths.add(path);
          state.manuallyCollapsedPaths.delete(path);
        } else {
          state.manuallyCollapsedPaths.add(path);
          state.manuallyExpandedPaths.delete(path);
        }
        renderJsonTree(value, compactKeys);
      });
      code.append(button);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'fold-spacer';
      code.append(spacer);
    }

    renderContent(code);
    line.append(code);
    parent.append(line);
  }

  function appendGuides(code, depth) {
    for (let index = 0; index < depth; index += 1) {
      const guide = document.createElement('span');
      guide.className = 'indent-guide';
      code.append(guide);
    }
  }

  function appendKey(parent, key, pathParts, parentType) {
    if (!key) return;
    const keyToken = document.createElement('span');
    keyToken.className = parentType === 'object' ? 'token-key json-editable-token' : 'token-key';
    keyToken.textContent = JSON.stringify(key);
    if (parentType === 'object') {
      keyToken.title = '双击修改 key';
      keyToken.addEventListener('dblclick', async (event) => {
        event.stopPropagation();
        await editJsonKey(pathParts, compactKeys);
      });
    }
    parent.append(keyToken);
    if (parentType === 'object') appendInlineEditControl(parent, 'key', pathParts);
    appendPunctuation(parent, ': ');
  }

  function appendPrimitive(parent, primitive, pathParts) {
    const token = document.createElement('span');
    if (typeof primitive === 'string') {
      token.className = 'token-string';
      token.textContent = JSON.stringify(primitive);
    } else if (typeof primitive === 'number') {
      token.className = 'token-number';
      token.textContent = JSON.stringify(primitive);
    } else if (typeof primitive === 'boolean') {
      token.className = 'token-boolean';
      token.textContent = String(primitive);
    } else if (primitive === null) {
      token.className = 'token-null';
      token.textContent = 'null';
    } else {
      token.textContent = JSON.stringify(primitive);
    }
    if (state.jsonEditorActive) {
      token.classList.add('json-editable-token');
      token.title = '双击修改 value';
      token.addEventListener('dblclick', async (event) => {
        event.stopPropagation();
        await editJsonValue(pathParts, compactKeys);
      });
    }
    parent.append(token);
  }

  function appendPunctuation(parent, text) {
    const punctuation = document.createElement('span');
    punctuation.className = 'token-punctuation';
    punctuation.textContent = text;
    parent.append(punctuation);
  }

  function appendEditablePunctuation(parent, text, type, pathParts) {
    const punctuation = document.createElement('span');
    punctuation.className = 'token-punctuation json-editable-token';
    punctuation.textContent = text;
    punctuation.title = type === 'key' ? '双击修改 key' : '双击修改 value';
    punctuation.addEventListener('dblclick', async (event) => {
      event.stopPropagation();
      if (type === 'key') {
        await editJsonKey(pathParts, compactKeys);
      } else {
        await editJsonValue(pathParts, compactKeys);
      }
    });
    parent.append(punctuation);
  }

  function appendEllipsis(parent) {
    const ellipsis = document.createElement('span');
    ellipsis.className = 'token-ellipsis';
    ellipsis.textContent = ' ... ';
    parent.append(ellipsis);
  }

  function appendInlineEditControl(parent, type, pathParts) {
    if (!state.jsonEditorActive) return;
    const control = document.createElement('span');
    control.className = `json-inline-edit ${type}`;
    control.role = 'button';
    control.tabIndex = 0;
    control.textContent = '✎';
    control.title = type === 'key' ? '修改这个 key' : '修改这个 value';
    control.setAttribute('aria-label', control.title);
    const triggerEdit = async (event) => {
      event.stopPropagation();
      if (type === 'key') {
        await editJsonKey(pathParts, compactKeys);
      } else {
        await editJsonValue(pathParts, compactKeys);
      }
    };
    control.addEventListener('click', triggerEdit);
    control.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      await triggerEdit(event);
    });
    parent.append(control);
  }
}

function renderJsonTreeToolbar(value, compactKeys, stats) {
  const toolbar = document.createElement('div');
  toolbar.className = 'json-tree-toolbar';

  const summary = document.createElement('div');
  summary.className = 'json-tree-summary';
  summary.append(
    renderJsonStatPill('节点', stats.totalNodes.toLocaleString('zh-CN')),
    renderJsonStatPill('对象', stats.objectCount.toLocaleString('zh-CN')),
    renderJsonStatPill('数组', stats.arrayCount.toLocaleString('zh-CN')),
    renderJsonStatPill('深度', String(stats.maxDepth))
  );

  const actions = document.createElement('div');
  actions.className = 'json-tree-actions';
  [
    ['expand', '展开全部'],
    ['collapse', '折叠全部'],
    ['copy-pretty', '复制格式化'],
    ['copy-min', '复制压缩']
  ].forEach(([action, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'json-tree-action';
    button.textContent = label;
    button.addEventListener('click', async () => {
      if (action === 'expand') {
        const paths = collectFoldableJsonPaths(value);
        state.manuallyCollapsedPaths = new Set();
        state.manuallyExpandedPaths = new Set(paths);
        renderJsonTree(value, compactKeys, stats);
        setStatus('JSON 已全部展开');
        return;
      }
      if (action === 'collapse') {
        state.manuallyCollapsedPaths = new Set(collectFoldableJsonPaths(value));
        state.manuallyExpandedPaths = new Set();
        renderJsonTree(value, compactKeys, stats);
        setStatus('JSON 已全部折叠');
        return;
      }
      if (action === 'copy-min') {
        await window.toolkit.writeClipboard(JSON.stringify(value));
        setStatus('已复制压缩 JSON');
        return;
      }
      await window.toolkit.writeClipboard(stringifyJsonWithCompactKeysValue(value, compactKeys, 2));
      setStatus('已复制格式化 JSON');
    });
    actions.append(button);
  });

  toolbar.append(summary, actions);
  return toolbar;
}

function renderJsonStatPill(label, value) {
  const pill = document.createElement('span');
  pill.className = 'json-stat-pill';
  const caption = document.createElement('span');
  caption.textContent = label;
  const text = document.createElement('strong');
  text.textContent = value;
  pill.append(caption, text);
  return pill;
}

function isFoldable(value) {
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
}

function openJsonEditDialog({ title, label, initialText, multiline = false, help = '' }) {
  if (state.jsonEditDialog) state.jsonEditDialog.close(null);

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'json-edit-overlay';

    const panel = document.createElement('form');
    panel.className = 'json-edit-dialog';
    panel.noValidate = true;

    const head = document.createElement('div');
    head.className = 'json-edit-head';
    const heading = document.createElement('strong');
    heading.textContent = title;
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'json-edit-close';
    closeButton.setAttribute('aria-label', '关闭编辑');
    closeButton.textContent = '×';
    head.append(heading, closeButton);

    const field = document.createElement('label');
    field.className = 'json-edit-field';
    const caption = document.createElement('span');
    caption.textContent = label;
    const editor = multiline ? document.createElement('textarea') : document.createElement('input');
    editor.className = 'json-edit-input';
    editor.spellcheck = false;
    editor.value = initialText ?? '';
    if (!multiline) editor.type = 'text';
    field.append(caption, editor);

    const hint = document.createElement('p');
    hint.className = 'json-edit-help';
    hint.textContent = help;

    const actions = document.createElement('div');
    actions.className = 'json-edit-actions';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'secondary-button';
    cancelButton.textContent = '取消';
    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'primary-button';
    saveButton.textContent = '保存并同步';
    actions.append(cancelButton, saveButton);

    panel.append(head, field, hint, actions);
    overlay.append(panel);
    document.body.append(overlay);

    let settled = false;
    function close(value) {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      state.jsonEditDialog = null;
      resolve(value);
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(null);
      }
      if (multiline && (event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        panel.requestSubmit();
      }
    }

    panel.addEventListener('submit', (event) => {
      event.preventDefault();
      close(editor.value);
    });
    closeButton.addEventListener('click', () => close(null));
    cancelButton.addEventListener('click', () => close(null));
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) close(null);
    });
    document.addEventListener('keydown', onKeyDown);

    state.jsonEditDialog = { close, overlay };
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.select();
    });
  });
}

async function editJsonKey(pathParts, compactKeys) {
  if (!Array.isArray(pathParts) || pathParts.length === 0) return;
  const currentKey = pathParts.at(-1);
  if (typeof currentKey !== 'string') return;
  const parentInfo = getJsonParent(pathParts);
  if (!parentInfo || !parentInfo.parent || Array.isArray(parentInfo.parent)) return;

  const nextKey = await openJsonEditDialog({
    title: '修改 JSON Key',
    label: 'Key',
    initialText: currentKey,
    help: '修改后会同步更新格式化结果和左侧 JSON 文本。'
  });
  if (nextKey === null) return;
  const trimmedKey = nextKey.trim();
  if (!trimmedKey) {
    setStatus('key 不能为空', true);
    return;
  }
  if (trimmedKey !== currentKey && Object.prototype.hasOwnProperty.call(parentInfo.parent, trimmedKey)) {
    setStatus(`已存在同名 key：${trimmedKey}`, true);
    return;
  }

  const rebuilt = {};
  Object.entries(parentInfo.parent).forEach(([key, value]) => {
    rebuilt[key === currentKey ? trimmedKey : key] = value;
  });
  Object.keys(parentInfo.parent).forEach((key) => delete parentInfo.parent[key]);
  Object.assign(parentInfo.parent, rebuilt);

  const nextPathParts = [...pathParts.slice(0, -1), trimmedKey];
  state.manuallyExpandedPaths.add(jsonPathFromParts(nextPathParts.slice(0, -1)));
  syncJsonEditor(compactKeys, `已修改 key：${currentKey} -> ${trimmedKey}`);
}

async function editJsonValue(pathParts, compactKeys) {
  if (!state.jsonEditorActive) return;
  const currentValue = getJsonValueAtPath(pathParts);
  const currentText = JSON.stringify(currentValue, null, 2);
  const isStructuredValue = currentValue !== null && typeof currentValue === 'object';
  const input = await openJsonEditDialog({
    title: pathParts.length === 0 ? '修改根 JSON' : '修改 JSON Value',
    label: isStructuredValue ? 'JSON 片段' : 'Value',
    initialText: currentText,
    multiline: isStructuredValue || currentText.length > 80,
    help: isStructuredValue
      ? '对象或数组必须输入合法 JSON。保存后会同步回左侧 JSON 文本。'
      : '可输入 JSON 字面量；无法解析时会按普通字符串保存。'
  });
  if (input === null) return;

  const parsed = parseEditedJsonValue(input, currentValue);
  if (!parsed.ok) {
    setStatus(parsed.error, true);
    await editJsonValue(pathParts, compactKeys);
    return;
  }
  const nextValue = parsed.value;
  if (pathParts.length === 0) {
    state.jsonEditorValue = nextValue;
  } else {
    const parentInfo = getJsonParent(pathParts);
    if (!parentInfo) return;
    parentInfo.parent[parentInfo.key] = nextValue;
  }
  syncJsonEditor(compactKeys, '已修改 value，并同步生成 JSON');
}

function syncJsonEditor(compactKeys, message) {
  const nextOutput = stringifyJsonWithCompactKeysValue(state.jsonEditorValue, compactKeys, 2);
  state.lastOutput = nextOutput;
  state.lastJsonSignature = '';
  if (activeTool().id === 'json-format') {
    state.suppressInputRun = true;
    elements.input.value = nextOutput;
    state.inputValuesByTool[activeTool().id] = nextOutput;
    state.suppressInputRun = false;
  }
  renderJsonTree(state.jsonEditorValue, compactKeys);
  setStatus(message);
}

function parseEditedJsonValue(input, currentValue) {
  const raw = String(input);
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    const trimmed = raw.trim();
    const structuredInput = trimmed.startsWith('{') || trimmed.startsWith('[');
    const structuredCurrent = currentValue !== null && typeof currentValue === 'object';
    if (structuredCurrent || structuredInput) {
      return { ok: false, error: 'value 不是合法 JSON，未保存' };
    }
    return { ok: true, value: raw };
  }
}

function getJsonValueAtPath(pathParts) {
  return pathParts.reduce((current, part) => current?.[part], state.jsonEditorValue);
}

function getJsonParent(pathParts) {
  if (!Array.isArray(pathParts) || pathParts.length === 0) return null;
  const parentPath = pathParts.slice(0, -1);
  const parent = getJsonValueAtPath(parentPath);
  return { parent, key: pathParts.at(-1) };
}

function jsonPathFromParts(pathParts) {
  if (!Array.isArray(pathParts) || pathParts.length === 0) return '$';
  return pathParts.reduce((path, part) => `${path}.${escapePathPart(part)}`, '$');
}

function countExpandedLines(value) {
  if (!isFoldable(value)) return 1;
  const entries = Array.isArray(value) ? value : Object.values(value);
  return 2 + entries.reduce((total, childValue) => total + countExpandedLines(childValue), 0);
}

function collectFoldableJsonPaths(value) {
  const paths = [];
  walkFoldableJsonPaths(value, '$', paths);
  return paths;
}

function walkFoldableJsonPaths(value, path, paths) {
  if (!isFoldable(value)) return;
  paths.push(path);
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item]) : Object.entries(value);
  entries.forEach(([childKey, childValue]) => {
    walkFoldableJsonPaths(childValue, `${path}.${escapePathPart(childKey)}`, paths);
  });
}

function escapePathPart(part) {
  return String(part).replaceAll('\\', '\\\\').replaceAll('.', '\\.');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function getToolOptions() {
  const tool = activeTool();
  const values = state.optionValuesByTool[tool.id] ?? {};
  const compactRaw = values.compactKeys ?? state.compactKeys ?? '';
  return {
    ...values,
    compactKeys: String(compactRaw)
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean)
  };
}

function getEffectiveInputMode(tool, action) {
  return tool.actionInputModes?.[action] ?? tool.inputMode ?? 'large';
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('error', isError);
}

function readableErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .replace(/^Error invoking remote method '[^']+': /, '');
}

async function renderAppVersion() {
  try {
    const metadata = await window.toolkit.appMetadata?.();
    if (metadata?.name) {
      document.title = metadata.name;
      elements.appName.textContent = metadata.name;
    }
    if (metadata?.version) elements.appVersion.textContent = `v${metadata.version}`;
  } catch {
    try {
      const version = await window.toolkit.appVersion?.();
      elements.appVersion.textContent = version ? `v${version}` : 'v-';
    } catch {
      elements.appVersion.textContent = 'v-';
    }
  }
}

elements.outputSearchInput.addEventListener('input', () => {
  state.outputSearch.query = elements.outputSearchInput.value;
  state.outputSearch.matchIndex = 0;
  refreshOutputSearchHighlights({ scroll: true });
});
elements.outputSearchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    moveOutputSearchMatch(event.shiftKey ? -1 : 1);
    return;
  }
  if (event.key === 'Escape') {
    elements.outputSearchInput.value = '';
    state.outputSearch.query = '';
    refreshOutputSearchHighlights();
    setStatus('已清空输出搜索');
  }
});
elements.outputSearchPrev.addEventListener('click', () => moveOutputSearchMatch(-1));
elements.outputSearchNext.addEventListener('click', () => moveOutputSearchMatch(1));

elements.search.addEventListener('input', () => {
  resetSearchCursor();
  renderToolList();
  const count = state.visibleSearchToolIds.length;
  if (elements.search.value.trim()) {
    setStatus(count > 0 ? `找到 ${count} 个工具，按 ↑/↓ 选择，Enter 打开` : '没有匹配的工具');
  }
});
elements.search.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveSearchCursor(event.key === 'ArrowUp' ? 'up' : 'down');
    return;
  }
  if (event.key === 'Enter') {
    if (selectSearchCursorTool()) {
      event.preventDefault();
    }
    return;
  }
  if (event.key === 'Escape') {
    elements.search.value = '';
    resetSearchCursor();
    renderToolList();
    setStatus('已清空搜索');
  }
});
elements.notesEntry.addEventListener('click', () => {
  openNotesManager().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, true);
  });
});
elements.totpEntry.addEventListener('click', () => {
  openTOTPManager().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, true);
  });
});
elements.gitlabEntry.addEventListener('click', () => {
  openGitLabManager().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, true);
  });
});
elements.ccSwitchEntry.addEventListener('click', () => {
  openCcSwitchManager().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, true);
  });
});
elements.input.addEventListener('input', () => {
  if (state.suppressInputRun) return;
  const tool = activeTool();
  saveActiveToolInputDraft();
  if (tool.id === 'uuid') return;
  window.clearTimeout(state.inputRunTimer);
  const liveLimit = tool.id === 'json-format' ? LIVE_RUN_CHAR_LIMIT : GENERAL_LIVE_RUN_CHAR_LIMIT;
  if (elements.input.value.length > liveLimit) {
    renderOutput('');
    setStatus(`内容较大，已停止实时解析。请按 ⌘/Ctrl + Enter 手动执行。`);
    return;
  }

  state.inputRunTimer = window.setTimeout(() => runActiveTool(), 180);
});

elements.input.addEventListener('paste', (event) => {
  const tool = activeTool();
  const action = state.activeActionByTool[tool.id];
  const pastedText = event.clipboardData?.getData('text') ?? '';
  const selectedLength = Math.max(0, elements.input.selectionEnd - elements.input.selectionStart);
  const nextLength = elements.input.value.length - selectedLength + pastedText.length;
  if (nextLength <= JSON_INPUT_CHAR_LIMIT) return;

  event.preventDefault();
  const jsonWorkflow = isJsonFileWorkflowRecommended(tool, action);
  const message = buildOversizedInputMessage(nextLength, { jsonWorkflow, source: '粘贴后内容' });
  renderOversizedInputNotice(message, { length: nextLength, jsonWorkflow });
  setStatus(message, true);
});

elements.paste.addEventListener('click', async () => {
  const clipboardText = await window.toolkit.readClipboard();
  const tool = activeTool();
  const action = state.activeActionByTool[tool.id];
  if (clipboardText.length > JSON_INPUT_CHAR_LIMIT) {
    const jsonWorkflow = isJsonFileWorkflowRecommended(tool, action);
    const message = buildOversizedInputMessage(clipboardText.length, { jsonWorkflow, source: '剪贴板内容' });
    renderOversizedInputNotice(message, { length: clipboardText.length, jsonWorkflow });
    setStatus(message, true);
    return;
  }

  elements.input.value = clipboardText;
  saveActiveToolInputDraft();
  runActiveTool({ manual: true });
});

elements.copy.addEventListener('click', async () => {
  await window.toolkit.writeClipboard(state.lastOutput);
  setStatus('结果已复制');
});

window.toolkit.onSelectTool?.((toolId) => {
  if (toolId === 'totp') {
    openTOTPManager().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message, true);
    });
    return;
  }
  if (toolId === 'gitlab') {
    openGitLabManager().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message, true);
    });
    return;
  }
  if (toolId === 'cc-switch') {
    openCcSwitchManager().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message, true);
    });
    return;
  }
  if (!tools.some((tool) => tool.id === toolId)) return;
  selectTool(toolId);
});

window.toolkit.onGitLabJobUpdated?.((job) => {
  state.gitlabTool.currentJob = job;
  if (job?.done && job.instanceId && job.rootDirectory) {
    const instance = state.gitlabTool.config?.instances?.find((item) => item.id === job.instanceId);
    if (instance) refreshGitLabLocalStatus(instance, job.rootDirectory).catch(() => {});
  }
  if (state.activeToolId === 'gitlab') renderGitLabTool();
});

window.toolkit.onGitLabJobLog?.(({ entry }) => {
  state.gitlabTool.logs.push(entry);
  if (state.gitlabTool.logs.length > 500) state.gitlabTool.logs.shift();
  if (state.activeToolId === 'gitlab') renderGitLabTool();
});

window.toolkit.onGitLabMonitorUpdated?.((statuses) => {
  state.gitlabTool.monitorStatuses = statuses;
  if (state.activeToolId === 'gitlab') renderGitLabTool();
});

window.addEventListener('keydown', (event) => {
  const command = event.metaKey || event.ctrlKey;
  if (command && event.key.toLowerCase() === 'f' && state.mode === 'tools') {
    event.preventDefault();
    elements.outputSearchInput.focus();
    elements.outputSearchInput.select();
    setStatus('搜索当前输出内容，Enter 跳到下一个匹配');
    return;
  }
  if (command && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    resetSearchCursor();
    renderToolList();
    elements.search.focus();
    elements.search.select();
    setStatus('输入关键词搜索工具，按 ↑/↓ 选择，Enter 打开');
  }
  if (command && event.shiftKey && event.key.toLowerCase() === 'f' && state.mode === 'tools') {
    event.preventDefault();
    toggleFavorite(state.activeToolId);
  }
  if (command && event.key === 'Enter') {
    event.preventDefault();
    runActiveTool({ manual: true });
  }
});

state.activeActionByTool['json-format'] = 'format';
renderAppVersion();
renderActiveTool();
restoreToolInputDraft(tools[0]);
runActiveTool({ manual: true });

function formatCharCount(length) {
  if (length >= 100_000_000) return `${(length / 100_000_000).toFixed(1)} 亿字符`;
  if (length >= 10_000) return `${(length / 10_000).toFixed(1)} 万字符`;
  return `${length} 字符`;
}

function hexInputToRgba(value) {
  const parsed = parseColor(value);
  if (!parsed.ok) return { r: 255, g: 87, b: 51, a: 1 };
  const { r, g, b, a } = parsed.data;
  return { r, g, b, a };
}

function normalizeAlpha(value) {
  const alpha = Number(value);
  if (Number.isNaN(alpha)) return 1;
  return Math.max(0, Math.min(1, alpha));
}

function inferImageFormat(fileName, mimeType) {
  const extension = String(fileName ?? '').split('.').pop()?.toUpperCase();
  if (extension && extension !== fileName.toUpperCase()) return extension;
  const mimeFormat = String(mimeType ?? '').split('/').pop();
  return mimeFormat ? mimeFormat.toUpperCase().replace('SVG+XML', 'SVG') : 'AUTO';
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function formatCurrency(value) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
  return `${Number((Number(value || 0) * 100).toFixed(4))}%`;
}

function localDateTimeToIso(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function formatReminderText(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '提醒时间无效';
  return `提醒 ${date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsText(file);
  });
}
