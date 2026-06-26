import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  buildJsonLinesCsvPreview,
  collectJsonStats,
  compareJsonInputs,
  compareExpectedFileHash,
  decodeBase64,
  decodeBase64Detailed,
  decodeUrl,
  decodeUrlDetailed,
  encodeBase64,
  encodeBase64Detailed,
  encodeUrl,
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
  parseStringifiedJson,
  queryJsonPath,
  sortJsonKeys,
  stringifyJsonWithCompactKeysValue,
  validateJson
} from '../src/renderer/tool-functions.js';
import { createToolSearchIndex, nextSearchCursorIndex, searchToolsByQuery } from '../src/renderer/tool-search.js';
import {
  buildElasticBulkFromRows,
  buildCookieHeader,
  buildHeadersFetchObject,
  buildHeadersObject,
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
  formatUuidValue,
  generateMock,
  insertSqlToJson,
  lookupHttpStatus,
  numberToChineseUpper,
  parseCookieHeader,
  parseCronExpressionFields,
  parseHttpHeaders,
  parseColor,
  parseInsertSql,
  parseJwtData,
  parseJwt,
  parseRsaKeyPairPem,
  parseSetCookieHeaders,
  parseUrl
} from '../src/renderer/extended-tools.js';

const require = createRequire(import.meta.url);
const { buildCodexToml, buildProviderConfigSnippets, createCcSwitchManager, normalizeProvider, parseEnv } = require('../src/cc-switch.cjs');
const { convertImageBuffer } = require('../src/image-converter.cjs');
const { markdownToDocxBuffer, sanitizeDocxFileName } = require('../src/markdown-docx.cjs');
const { calculateFileHashes, normalizeHashAlgorithms } = require('../src/file-hash.cjs');
const {
  buildPlantUmlUrl,
  decodePlantUml,
  encodePlantUml,
  normalizePlantUmlServerUrl,
  normalizePlantUmlSource
} = require('../src/plantuml.cjs');
const {
  accountFromInput,
  accountWithCode,
  decodeBase32,
  generateTOTP,
  normalizeBase32Secret,
  parseOTPAuthURL,
  remainingSeconds
} = require('../src/totp.cjs');
const {
  exportJsonLinesFieldsCsvFile,
  extractTopLevelKeyJsonFile,
  extractTopLevelKeyJsonText,
  formatJsonFile,
  formatJsonText,
  inspectJsonText,
  inspectJsonLinesFile,
  inspectJsonLinesText,
  minifyJsonFile,
  minifyJsonText
} = require('../src/json-stream-inspector.cjs');
const sharp = require('sharp');
const JSZip = require('jszip');
const execFileAsync = promisify(execFile);

test('normalizes PlantUML source wrappers', () => {
  assert.equal(
    normalizePlantUmlSource('Alice -> Bob: hello'),
    '@startuml\nAlice -> Bob: hello\n@enduml'
  );
  assert.equal(
    normalizePlantUmlSource('@startuml\nAlice -> Bob: hello\n@enduml'),
    '@startuml\nAlice -> Bob: hello\n@enduml'
  );
  assert.equal(
    normalizePlantUmlSource('@startmindmap\n* root\n@endmindmap'),
    '@startmindmap\n* root\n@endmindmap'
  );
  assert.throws(() => normalizePlantUmlSource('   '), /请输入 PUML 内容/);
});

test('encodes and decodes PlantUML payloads', () => {
  const source = '@startuml\nactor User\nUser -> ElectronToolKit: render\n@enduml';
  const encoded = encodePlantUml(source);
  assert.match(encoded, /^[0-9A-Za-z_-]+$/);
  assert.equal(decodePlantUml(encoded), source);
});

test('builds PlantUML render URLs', () => {
  const svgUrl = buildPlantUmlUrl({
    source: 'Alice -> Bob: hello',
    serverUrl: 'https://example.com/plantuml/',
    format: 'svg'
  });
  assert.match(svgUrl, /^https:\/\/example\.com\/plantuml\/svg\/[0-9A-Za-z_-]+$/);
  assert.equal(
    decodePlantUml(svgUrl.split('/').at(-1)),
    '@startuml\nAlice -> Bob: hello\n@enduml'
  );

  const pngUrl = buildPlantUmlUrl({
    source: '@startuml\nA -> B\n@enduml',
    serverUrl: 'http://localhost:8080/plantuml',
    format: 'png'
  });
  assert.match(pngUrl, /^http:\/\/localhost:8080\/plantuml\/png\//);
  assert.equal(normalizePlantUmlServerUrl('https://example.com/plantuml///'), 'https://example.com/plantuml');
  assert.throws(() => normalizePlantUmlServerUrl('file:///tmp/plantuml'), /http:\/\/ 或 https:\/\//);
  assert.throws(() => buildPlantUmlUrl({ source: 'A -> B', format: 'pdf' }), /不支持的 PlantUML 输出格式/);
});

test('normalizes and decodes Base32 TOTP secrets', () => {
  assert.equal(normalizeBase32Secret('abcd ef-gh=='), 'ABCDEFGH');
  assert.equal(decodeBase32('JBSWY3DPEHPK3PXP').toString('hex'), '48656c6c6f21deadbeef');
  assert.throws(() => decodeBase32('bad*secret'), /无效字符/);
});

test('generates RFC 6238 SHA1 TOTP values', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(generateTOTP({ secret, digits: 8, period: 30, timestampSeconds: 59 }), '94287082');
  assert.equal(generateTOTP({ secret, digits: 8, period: 30, timestampSeconds: 1111111109 }), '07081804');
  assert.equal(generateTOTP({ secret, digits: 8, period: 30, timestampSeconds: 20000000000 }), '65353130');
  assert.equal(remainingSeconds(30, 59), 1);
});

test('parses otpauth URLs into toolkit TOTP accounts', () => {
  const account = parseOTPAuthURL(
    'otpauth://totp/GitHub:user%40example.com?secret=jbswy3dpehpk3pxp&issuer=GitHub&digits=6&period=30',
    'fixed-id'
  );
  assert.equal(account.id, 'fixed-id');
  assert.equal(account.issuer, 'GitHub');
  assert.equal(account.name, 'user@example.com');
  assert.equal(account.secret, 'JBSWY3DPEHPK3PXP');
  assert.equal(account.digits, 6);
  assert.equal(account.period, 30);
});

test('builds TOTP accounts and current code payloads from manual input', () => {
  const account = accountFromInput({
    issuer: 'Example',
    name: 'alice',
    secretOrURL: 'jbsw y3dp-ehpk3pxp',
    digits: 6,
    period: 30
  });
  const payload = accountWithCode(account, 59);
  assert.equal(payload.displayName, 'Example - alice');
  assert.match(payload.code, /^\d{6}$/);
  assert.equal(payload.remaining, 1);
});

test('formats JSON with stable indentation', () => {
  assert.equal(formatJson('{"a":1,"b":true}').value, '{\n  "a": 1,\n  "b": true\n}');
});

test('parses stringified JSON into structured JSON', () => {
  const input = JSON.stringify(JSON.stringify({
    total: 1,
    code: 0,
    data: [{
      amazon_order_id: '114-1157537-2673058',
      is_buyer_requested_cancel: 'false',
      item_price_amount: '1869.05',
      shipping_address: JSON.stringify({
        AddressLine1: '16200 PYRAMID WAY',
        City: 'RENO',
        CountryCode: 'US'
      })
    }]
  }));
  const result = parseStringifiedJson(input);
  assert.equal(result.ok, true);
  const parsed = JSON.parse(result.value);
  assert.equal(parsed.total, 1);
  assert.equal(parsed.data[0].amazon_order_id, '114-1157537-2673058');
  assert.equal(parsed.data[0].is_buyer_requested_cancel, 'false');
  assert.equal(parsed.data[0].item_price_amount, '1869.05');
  assert.deepEqual(parsed.data[0].shipping_address, {
    AddressLine1: '16200 PYRAMID WAY',
    City: 'RENO',
    CountryCode: 'US'
  });
});

test('parses nested JSON string containers without coercing primitive strings', () => {
  const input = JSON.stringify({
    payload: JSON.stringify([{ enabled: 'false', amount: '100.00' }]),
    plain: 'not json'
  });
  const result = parseStringifiedJson(input);
  const parsed = JSON.parse(result.value);
  assert.deepEqual(parsed.payload, [{ enabled: 'false', amount: '100.00' }]);
  assert.equal(parsed.plain, 'not json');
});

test('formats JSON while compacting selected key values', () => {
  const input = '{"name":"ElectronToolKit","data":{"items":[{"id":1},{"id":2}]},"enabled":true}';
  assert.equal(
    formatJsonWithCompactKeys(input, ['data']).value,
    '{\n  "name": "ElectronToolKit",\n  "data": {"items":[{"id":1},{"id":2}]},\n  "enabled": true\n}'
  );
});

test('stringifies edited JSON values while preserving compact key formatting', () => {
  const value = { name: 'ElectronToolKit', data: { items: [{ id: 1 }, { id: 2, label: 'new' }] }, enabled: true };
  assert.equal(
    stringifyJsonWithCompactKeysValue(value, ['data'], 2),
    '{\n  "name": "ElectronToolKit",\n  "data": {"items":[{"id":1},{"id":2,"label":"new"}]},\n  "enabled": true\n}'
  );
});

test('minifies JSON', () => {
  assert.equal(minifyJson('{\n  "a": 1\n}').value, '{"a":1}');
});

test('sorts JSON keys recursively while keeping array order', () => {
  const input = '{"z":1,"a":{"b":2,"a":1},"list":[{"c":3,"a":1},{"b":2,"a":1}]}';
  assert.equal(
    sortJsonKeys(input).value,
    '{\n  "a": {\n    "a": 1,\n    "b": 2\n  },\n  "list": [\n    {\n      "a": 1,\n      "c": 3\n    },\n    {\n      "a": 1,\n      "b": 2\n    }\n  ],\n  "z": 1\n}'
  );
  assert.equal(sortJsonKeys('{bad}').ok, false);
});

test('reports invalid JSON', () => {
  assert.equal(validateJson('{bad').ok, false);
});

test('rejects JSON input above UI-safe limit', () => {
  const oversized = `${' '.repeat(JSON_INPUT_CHAR_LIMIT)} {}`;
  const result = validateJson(oversized);
  assert.equal(result.ok, false);
  assert.match(result.error, /JSON 内容过大/);
});

test('extracts JSON values by JSON Path', () => {
  const input = JSON.stringify({
    data: {
      items: [
        { id: 1, label: 'json' },
        { id: 2, label: 'hash' }
      ],
      'dash-key': { enabled: true }
    }
  });

  assert.equal(queryJsonPath(input, '$.data.items[0].label').value, '"json"');
  assert.equal(queryJsonPath(input, '$.data.items[-1].id').value, '2');
  assert.equal(queryJsonPath(input, '$.data.items[*].id').value, '[\n  1,\n  2\n]');
  assert.equal(queryJsonPath(input, '$.data["dash-key"].enabled').value, 'true');
  assert.equal(queryJsonPath(input, '$.missing').ok, false);
  assert.match(queryJsonPath(input, 'data.items').error, /必须以 \$ 开头/);
});

test('compares JSON structures by path', () => {
  const left = JSON.stringify({
    id: 1,
    name: 'Alice',
    meta: { active: true, role: 'admin' },
    tags: ['a', 'b'],
    removed: 'old'
  });
  const right = JSON.stringify({
    id: 1,
    name: 'Alice Zhang',
    meta: { active: false, level: 2 },
    tags: ['a', 'c', 'd'],
    added: 'new'
  });
  const result = compareJsonInputs(left, right);
  assert.equal(result.ok, true);
  assert.equal(result.data.summary.added, 3);
  assert.equal(result.data.summary.removed, 2);
  assert.equal(result.data.summary.changed, 3);
  assert.deepEqual(
    result.data.changes.map((change) => `${change.type}:${change.path}`),
    [
      'added:$.added',
      'changed:$.meta.active',
      'added:$.meta.level',
      'removed:$.meta.role',
      'changed:$.name',
      'removed:$.removed',
      'changed:$.tags[1]',
      'added:$.tags[2]'
    ]
  );
  assert.match(result.value, /~ \$\.name/);
  assert.equal(compareJsonInputs('{bad}', '{}').ok, false);
});

test('reports identical JSON comparison', () => {
  const result = compareJsonInputs('{"a":[1,true,null]}', '{"a":[1,true,null]}');
  assert.equal(result.ok, true);
  assert.equal(result.data.changes.length, 0);
  assert.equal(result.value, '两个 JSON 结构和值完全一致');
});

test('generates TypeScript types from JSON samples', () => {
  const input = JSON.stringify({
    id: 1,
    name: 'Alice',
    active: true,
    nickname: null,
    'dash-key': 'quoted',
    profile: { email: 'alice@example.com' },
    roles: [
      { id: 1, name: 'admin' },
      { id: 2, name: 'editor', scope: 'team' }
    ]
  });
  const result = jsonToTypeScript(input, 'UserResponse');
  assert.equal(result.ok, true);
  assert.match(result.value, /export interface UserResponseProfile/);
  assert.match(result.value, /export interface UserResponseRolesItem/);
  assert.match(result.value, /export interface UserResponse/);
  assert.match(result.value, /id: number;/);
  assert.match(result.value, /nickname: null;/);
  assert.match(result.value, /"dash-key": string;/);
  assert.match(result.value, /profile: UserResponseProfile;/);
  assert.match(result.value, /roles: UserResponseRolesItem\[\];/);
  assert.match(result.value, /scope\?: string;/);
  assert.match(jsonToTypeScript('{bad}', 'Broken').error, /Unexpected token|Expected property name/);
});

test('generates JSON Schema from JSON samples', () => {
  const input = JSON.stringify({
    id: 1,
    name: 'Alice',
    active: true,
    nickname: null,
    profile: { email: 'alice@example.com' },
    roles: [
      { id: 1, name: 'admin' },
      { id: 2, name: 'editor', scope: 'team' }
    ],
    flags: [true, null]
  });
  const result = jsonToJsonSchema(input, 'UserSchema');
  assert.equal(result.ok, true);
  const schema = JSON.parse(result.value);
  assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#');
  assert.equal(schema.title, 'UserSchema');
  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.required, ['id', 'name', 'active', 'nickname', 'profile', 'roles', 'flags']);
  assert.equal(schema.properties.id.type, 'integer');
  assert.equal(schema.properties.profile.properties.email.type, 'string');
  assert.deepEqual(schema.properties.roles.items.required, ['id', 'name']);
  assert.equal(schema.properties.roles.items.properties.scope.type, 'string');
  assert.deepEqual(schema.properties.flags.items.anyOf.map((item) => item.type), ['boolean', 'null']);
  assert.match(jsonToJsonSchema('{bad}', 'Broken').error, /Unexpected token|Expected property name/);
});

test('collects JSON stats with an early node limit', () => {
  const value = {
    name: 'ElectronToolKit',
    enabled: true,
    data: {
      items: [
        { id: 1, label: 'json' },
        { id: 2, label: 'hash' }
      ]
    }
  };

  const stats = collectJsonStats(value);
  assert.equal(stats.totalNodes, 11);
  assert.equal(stats.objectCount, 4);
  assert.equal(stats.arrayCount, 1);
  assert.equal(stats.primitiveCount, 6);
  assert.equal(stats.maxDepth, 4);
  assert.equal(stats.truncated, false);

  const limited = collectJsonStats(value, 4);
  assert.equal(limited.totalNodes, 5);
  assert.equal(limited.truncated, true);
});

test('inspects JSON text with streaming parser stats and preview', () => {
  const result = inspectJsonText('{"users":[{"id":1,"name":"Alice"},{"id":2,"active":false}],"meta":null}', { previewLimit: 16 });

  assert.equal(result.ok, true);
  assert.equal(result.objectCount, 3);
  assert.equal(result.arrayCount, 1);
  assert.equal(result.numberCount, 2);
  assert.equal(result.booleanCount, 1);
  assert.equal(result.nullCount, 1);
  assert.deepEqual(result.topLevelKeys, ['users', 'meta']);
  assert.equal(result.previewHead, '{"users":[{"id":');
  assert.equal(result.previewTail, 'e}],"meta":null}');
});

test('streaming JSON inspector rejects trailing commas', () => {
  assert.throws(() => inspectJsonText('{"a":1,}'), /对象闭合前缺少 value|key 出现位置不正确/);
  assert.throws(() => inspectJsonText('[1,]'), /数组闭合前缺少元素/);
});

test('inspects JSONL text and files with line stats', async () => {
  const source = '{"id":1,"name":"Alice"}\n{"id":2,"active":true}\n\n[1,2]\n';
  const result = inspectJsonLinesText(source, { previewLimit: 20 });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'jsonl');
  assert.equal(result.lineCount, 4);
  assert.equal(result.validLineCount, 3);
  assert.equal(result.emptyLineCount, 1);
  assert.equal(result.objectCount, 2);
  assert.equal(result.arrayCount, 1);
  assert.equal(result.numberCount, 4);
  assert.deepEqual(result.topLevelKeys, ['id', 'active', 'name']);
  assert.equal(result.topLevelKeyCounts.id, 2);
  assert.throws(() => inspectJsonLinesText('{"ok":true}\n{bad}'), /第 2 行不是合法 JSON/);

  const directory = await mkdtemp(path.join(os.tmpdir(), 'toolkit-jsonl-'));
  try {
    const inputPath = path.join(directory, 'input.jsonl');
    await writeFile(inputPath, source, 'utf8');
    const fileResult = await inspectJsonLinesFile(inputPath, { previewLimit: 10 });
    assert.equal(fileResult.fileName, 'input.jsonl');
    assert.equal(fileResult.validLineCount, 3);
    assert.equal(fileResult.previewHead, '{"id":1,"n');

    const csvPath = path.join(directory, 'fields.csv');
    const nestedPath = path.join(directory, 'nested.jsonl');
    const nestedSource = '{"id":1,"meta":{"role":"admin"},"items":[{"sku":"A1"}]}\n{"id":2,"meta":{"role":"user"},"items":[]}\n';
    await writeFile(nestedPath, nestedSource, 'utf8');
    const nestedInspectResult = inspectJsonLinesText(nestedSource, { previewLimit: 120 });
    assert.deepEqual(nestedInspectResult.topLevelKeys, ['id', 'items', 'meta']);
    assert.ok(nestedInspectResult.fieldPaths.includes('id'));
    assert.ok(nestedInspectResult.fieldPaths.includes('meta.role'));
    assert.ok(nestedInspectResult.fieldPaths.includes('items.0.sku'));
    assert.equal(nestedInspectResult.fieldPathCounts.id, 2);
    assert.equal(nestedInspectResult.fieldPathCounts['meta.role'], 2);
    assert.equal(nestedInspectResult.fieldPathCounts['items.0.sku'], 1);
    const csvResult = await exportJsonLinesFieldsCsvFile(inputPath, csvPath, ['id', 'name', 'active']);
    assert.equal(csvResult.ok, true);
    assert.equal(csvResult.exportedRows, 3);
    assert.deepEqual(csvResult.fields, ['id', 'name', 'active']);
    assert.equal(await readFile(csvPath, 'utf8'), 'id,name,active\n1,Alice,\n2,,true\n,,\n');

    const nestedCsvPath = path.join(directory, 'nested-fields.csv');
    await exportJsonLinesFieldsCsvFile(nestedPath, nestedCsvPath, ['id', 'meta.role', 'items.0.sku']);
    assert.equal(await readFile(nestedCsvPath, 'utf8'), 'id,meta.role,items.0.sku\n1,admin,A1\n2,user,\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('builds JSONL CSV preview from head text', () => {
  const source = '{"id":1,"name":"Alice","meta":{"role":"admin"}}\n{"id":2,"name":"Bob, B","meta":null}\n';
  const preview = buildJsonLinesCsvPreview(source, ['id', 'name', 'meta.role']);
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.headers, ['id', 'name', 'meta.role']);
  assert.deepEqual(preview.rows[0], ['1', 'Alice', 'admin']);
  assert.equal(preview.csvText, 'id,name,meta.role\n1,Alice,admin\n2,"Bob, B",');
  assert.equal(buildJsonLinesCsvPreview(source, '').ok, false);
});

test('minifies JSON text and files with streaming validation', async () => {
  const source = '{\n  "name": "ElectronToolKit",\n  "items": [1, 2, { "text": "a b" }]\n}';
  assert.equal(minifyJsonText(source), '{"name":"ElectronToolKit","items":[1,2,{"text":"a b"}]}');
  assert.throws(() => minifyJsonText('{"a":1,}'), /对象闭合前缺少 value|key 出现位置不正确/);

  const directory = await mkdtemp(path.join(os.tmpdir(), 'toolkit-json-'));
  try {
    const inputPath = path.join(directory, 'input.json');
    const outputPath = path.join(directory, 'output.json');
    await writeFile(inputPath, source, 'utf8');
    const result = await minifyJsonFile(inputPath, outputPath);
    assert.equal(result.ok, true);
    assert.equal(await readFile(outputPath, 'utf8'), '{"name":"ElectronToolKit","items":[1,2,{"text":"a b"}]}');
    assert.equal(result.outputBytes, Buffer.byteLength('{"name":"ElectronToolKit","items":[1,2,{"text":"a b"}]}', 'utf8'));
    assert.ok(result.savedBytes > 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('formats JSON text and files with streaming validation', async () => {
  const compact = '{"name":"ElectronToolKit","items":[1,2,{"text":"a b"}],"empty":[]}';
  const pretty = [
    '{',
    '  "name": "ElectronToolKit",',
    '  "items": [',
    '    1,',
    '    2,',
    '    {',
    '      "text": "a b"',
    '    }',
    '  ],',
    '  "empty": []',
    '}'
  ].join('\n');
  assert.equal(formatJsonText(compact), pretty);
  assert.throws(() => formatJsonText('[1,]'), /数组闭合前缺少元素/);

  const directory = await mkdtemp(path.join(os.tmpdir(), 'toolkit-json-format-'));
  try {
    const inputPath = path.join(directory, 'input.json');
    const outputPath = path.join(directory, 'output.json');
    await writeFile(inputPath, compact, 'utf8');
    const result = await formatJsonFile(inputPath, outputPath);
    assert.equal(result.ok, true);
    assert.equal(await readFile(outputPath, 'utf8'), pretty);
    assert.equal(result.deltaBytes, Buffer.byteLength(compact, 'utf8') - Buffer.byteLength(pretty, 'utf8'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('extracts top-level JSON keys from text and files', async () => {
  const source = '{"meta":{"count":2},"data":[{"id":1},{"id":2}],"name":"ElectronToolKit","ok":true,"a\\"b":{"x":1}}';
  assert.equal(extractTopLevelKeyJsonText(source, 'meta'), '{"count":2}');
  assert.equal(extractTopLevelKeyJsonText(source, 'data'), '[{"id":1},{"id":2}]');
  assert.equal(extractTopLevelKeyJsonText(source, 'name'), '"ElectronToolKit"');
  assert.equal(extractTopLevelKeyJsonText(source, 'ok'), 'true');
  assert.equal(extractTopLevelKeyJsonText(source, 'a"b'), '{"x":1}');
  assert.throws(() => extractTopLevelKeyJsonText(source, 'missing'), /未找到顶层 key/);
  assert.throws(() => extractTopLevelKeyJsonText('[{"id":1}]', 'id'), /根对象/);

  const directory = await mkdtemp(path.join(os.tmpdir(), 'toolkit-json-extract-'));
  try {
    const inputPath = path.join(directory, 'input.json');
    const outputPath = path.join(directory, 'data.json');
    await writeFile(inputPath, source, 'utf8');
    const result = await extractTopLevelKeyJsonFile(inputPath, outputPath, 'data');
    assert.equal(result.ok, true);
    assert.equal(result.key, 'data');
    assert.equal(await readFile(outputPath, 'utf8'), '[{"id":1},{"id":2}]');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('converts JSON with CSV and TSV text', () => {
  const json = JSON.stringify([
    { id: 1, name: 'Alice', active: true, note: 'a,b' },
    { id: 2, name: 'Bob', active: false, extra: { role: 'dev' } }
  ]);

  const csv = jsonToDelimited(json, ',');
  assert.equal(csv.ok, true);
  assert.equal(csv.value, 'id,name,active,note,extra\n1,Alice,true,\"a,b\",\n2,Bob,false,,\"{\"\"role\"\":\"\"dev\"\"}\"');

  const parsedCsv = delimitedToJson('id,name,active,note\n1,Alice,true,\"a,b\"\n2,Bob,false,', ',');
  assert.equal(parsedCsv.ok, true);
  assert.deepEqual(JSON.parse(parsedCsv.value), [
    { id: 1, name: 'Alice', active: true, note: 'a,b' },
    { id: 2, name: 'Bob', active: false, note: '' }
  ]);

  const tsv = jsonToDelimited('[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]', '\t');
  assert.equal(tsv.value, 'id\tname\n1\tAlice\n2\tBob');
  assert.deepEqual(JSON.parse(delimitedToJson(tsv.value, '\t').value), [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' }
  ]);
});

test('encodes and decodes unicode base64', () => {
  const encoded = encodeBase64('工具箱');
  assert.equal(decodeBase64(encoded).value, '工具箱');

  const detailed = encodeBase64Detailed('工具箱', { dataUri: true, mimeType: 'text/plain;charset=utf-8' });
  assert.equal(detailed.ok, true);
  assert.equal(detailed.data.chars, 3);
  assert.equal(detailed.data.bytes, 9);
  assert.match(detailed.value, /^data:text\/plain;charset=utf-8;base64,/);
  assert.equal(decodeBase64Detailed(detailed.value).value, '工具箱');

  const urlSafe = encodeBase64Detailed('??>>', { urlSafe: true });
  assert.equal(urlSafe.ok, true);
  assert.equal(/[+/=]/.test(urlSafe.value), false);
  const decodedUrlSafe = decodeBase64Detailed(urlSafe.value);
  assert.equal(decodedUrlSafe.ok, true);
  assert.equal(decodedUrlSafe.value, '??>>');
  assert.equal(decodedUrlSafe.data.urlSafe, true);
});

test('calculates file hashes with streaming reader', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'toolkit-file-hash-'));
  try {
    const filePath = path.join(directory, 'sample.txt');
    const payload = 'ElectronToolKit 文件哈希';
    await writeFile(filePath, payload, 'utf8');
    const result = await calculateFileHashes(filePath, ['md5', 'sha256']);
    assert.equal(result.ok, true);
    assert.equal(result.fileName, 'sample.txt');
    assert.equal(result.fileSize, Buffer.byteLength(payload, 'utf8'));
    assert.equal(result.hashes.md5, createHash('md5').update(payload).digest('hex'));
    assert.equal(result.hashes.sha256, createHash('sha256').update(payload).digest('hex'));
    assert.deepEqual(normalizeHashAlgorithms(['MD5', 'md5', 'sha1', 'bad']), ['md5', 'sha1']);
    assert.throws(() => normalizeHashAlgorithms(['bad']), /至少一种/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('compares expected file hashes from pasted text', () => {
  const hashes = {
    md5: '7e32b7d6e77b97642eeaad442239c9ad',
    sha256: 'd17fa3d2e446fdc3f3437aec15053b178dc018d9b41da6b8ac6a865192f099fb'
  };

  assert.deepEqual(compareExpectedFileHash(hashes, '').status, 'empty');
  assert.equal(compareExpectedFileHash(hashes, 'SHA256: d17fa3d2e446fdc3f3437aec15053b178dc018d9b41da6b8ac6a865192f099fb').status, 'match');
  assert.equal(compareExpectedFileHash(hashes, '00000000000000000000000000000000').status, 'mismatch');
  assert.equal(compareExpectedFileHash({ md5: hashes.md5 }, hashes.sha256).status, 'missing-algorithm');
  assert.equal(compareExpectedFileHash(hashes, 'not-a-hash').status, 'empty');
});

test('searches tools with ranked results and keyboard cursor wrapping', () => {
  const searchTools = [
    {
      id: 'json-format',
      name: 'JSON 格式化',
      category: '开发',
      keywords: ['json', 'format'],
      description: '格式化 JSON'
    },
    {
      id: 'jwt',
      name: 'JWT 解密分析',
      category: '解析',
      keywords: ['token', 'payload'],
      description: '解析 JWT'
    },
    {
      id: 'url-parser',
      name: 'URL 参数解析',
      category: '解析',
      keywords: ['query', 'params'],
      description: '拆解 URL'
    },
    {
      id: 'regex',
      name: '正则测试器',
      category: '文本',
      keywords: ['regex'],
      description: '轻量正则匹配测试'
    },
    {
      id: 'qr',
      name: '二维码工具',
      category: '生成',
      keywords: ['qr'],
      description: '生成二维码'
    },
    {
      id: 'json-path',
      name: 'JSON Path 提取',
      category: '开发',
      keywords: ['jsonpath', 'extract'],
      description: '按 JSON Path 提取字段'
    },
    {
      id: 'json-typescript',
      name: 'JSON 转 TS 类型',
      category: '开发',
      keywords: ['typescript', 'interface', 'type', 'leixing'],
      description: '从 JSON 样例推断 TypeScript 类型'
    },
    {
      id: 'json-schema',
      name: 'JSON 转 Schema',
      category: '开发',
      keywords: ['schema', 'jsonschema', 'qiyue'],
      description: '从 JSON 样例推断接口契约'
    },
    {
      id: 'json-file',
      name: '大 JSON 文件检查',
      category: '开发',
      keywords: ['large', 'file', 'stream', 'dawenjian', 'dwjjc'],
      description: '流式检查大 JSON 文件'
    },
    {
      id: 'curl-code',
      name: 'cURL 转代码',
      category: '转换',
      keywords: ['curl', 'fetch', 'axios', 'http', 'request'],
      description: '把 cURL 命令转换成 fetch 或 axios'
    },
    {
      id: 'file-hash',
      name: '文件哈希校验',
      category: '编码',
      keywords: ['file', 'hash', 'checksum', 'wenjianhash', 'wjhx'],
      description: '流式计算文件哈希'
    }
  ];
  const index = createToolSearchIndex(searchTools);
  assert.deepEqual(searchToolsByQuery(index, 'json').map((tool) => tool.id), ['json-format', 'json-path', 'json-typescript', 'json-schema', 'json-file']);
  assert.deepEqual(searchToolsByQuery(index, 'json file').map((tool) => tool.id), ['json-file']);
  assert.deepEqual(searchToolsByQuery(index, '解析').map((tool) => tool.id), ['url-parser', 'jwt']);
  assert.deepEqual(searchToolsByQuery(index, 'geshihua').map((tool) => tool.id), ['json-format']);
  assert.deepEqual(searchToolsByQuery(index, 'zhengze').map((tool) => tool.id), ['regex']);
  assert.deepEqual(searchToolsByQuery(index, 'zzcsq').map((tool) => tool.id), ['regex']);
  assert.deepEqual(searchToolsByQuery(index, 'erweima').map((tool) => tool.id), ['qr']);
  assert.deepEqual(searchToolsByQuery(index, 'ewm').map((tool) => tool.id), ['qr']);
  assert.deepEqual(searchToolsByQuery(index, 'tiqu').map((tool) => tool.id), ['json-path']);
  assert.deepEqual(searchToolsByQuery(index, 'jsonpath').map((tool) => tool.id), ['json-path']);
  assert.deepEqual(searchToolsByQuery(index, 'typescript').map((tool) => tool.id), ['json-typescript']);
  assert.deepEqual(searchToolsByQuery(index, 'interface').map((tool) => tool.id), ['json-typescript']);
  assert.deepEqual(searchToolsByQuery(index, 'leixing').map((tool) => tool.id), ['json-typescript']);
  assert.deepEqual(searchToolsByQuery(index, 'jsonschema').map((tool) => tool.id), ['json-schema']);
  assert.deepEqual(searchToolsByQuery(index, 'qiyue').map((tool) => tool.id), ['json-schema']);
  assert.deepEqual(searchToolsByQuery(index, 'dawenjian').map((tool) => tool.id), ['json-file']);
  assert.deepEqual(searchToolsByQuery(index, 'dwjjc').map((tool) => tool.id), ['json-file']);
  assert.deepEqual(searchToolsByQuery(index, 'curl').map((tool) => tool.id), ['curl-code']);
  assert.deepEqual(searchToolsByQuery(index, 'fetch').map((tool) => tool.id), ['curl-code']);
  assert.deepEqual(searchToolsByQuery(index, 'axios').map((tool) => tool.id), ['curl-code']);
  assert.deepEqual(searchToolsByQuery(index, 'wenjianhash').map((tool) => tool.id), ['file-hash']);
  assert.deepEqual(searchToolsByQuery(index, 'file hash').map((tool) => tool.id), ['file-hash']);
  assert.deepEqual(searchToolsByQuery(index, 'wjhx').map((tool) => tool.id), ['file-hash']);
  assert.equal(nextSearchCursorIndex(0, 'down', 3), 1);
  assert.equal(nextSearchCursorIndex(2, 'down', 3), 0);
  assert.equal(nextSearchCursorIndex(0, 'up', 3), 2);
  assert.equal(nextSearchCursorIndex(0, 'down', 0), -1);
});

test('encodes and decodes URL components', () => {
  const encoded = encodeUrl('q=工具箱&sort=时间');
  assert.equal(decodeUrl(encoded).value, 'q=工具箱&sort=时间');

  const component = encodeUrlDetailed('q=工具箱&sort=时间', { mode: 'component' });
  assert.equal(component.ok, true);
  assert.match(component.value, /%26sort%3D/);
  assert.ok(component.data.percentEscapes > 0);
  assert.equal(decodeUrlDetailed(component.value, { mode: 'component' }).value, 'q=工具箱&sort=时间');

  const uri = encodeUrlDetailed('https://example.com/search?q=工具箱&sort=时间', { mode: 'uri' });
  assert.equal(uri.ok, true);
  assert.match(uri.value, /^https:\/\/example\.com\/search\?q=/);
  assert.match(uri.value, /%E5%B7%A5/);

  const form = encodeUrlDetailed('hello world 工具', { mode: 'form' });
  assert.equal(form.value, 'hello+world+%E5%B7%A5%E5%85%B7');
  assert.equal(decodeUrlDetailed(form.value, { mode: 'form' }).value, 'hello world 工具');
  assert.equal(decodeUrlDetailed('%E0%A4%A', { mode: 'component' }).ok, false);
});

test('converts second timestamp to milliseconds and ISO date', () => {
  const result = inspectTimestamp('1717999200');
  assert.equal(result.ok, true);
  assert.match(result.value, /毫秒时间戳: 1717999200000/);
  assert.match(result.value, /ISO 时间: 2024-06-10T/);
  assert.equal(result.data.seconds, 1717999200);
  assert.equal(result.data.milliseconds, 1717999200000);
  assert.equal(result.data.inputUnit, 'seconds');

  const millisecond = inspectTimestamp('1717999200123');
  assert.equal(millisecond.ok, true);
  assert.equal(millisecond.data.seconds, 1717999200);
  assert.equal(millisecond.data.milliseconds, 1717999200123);
  assert.equal(millisecond.data.inputUnit, 'milliseconds');

  const dateTime = inspectDateTime('2024-06-10T02:00:00.123Z');
  assert.equal(dateTime.ok, true);
  assert.equal(dateTime.data.milliseconds, 1717984800123);
  assert.equal(dateTime.data.inputUnit, 'datetime');

  const current = inspectDateTime('', new Date('2026-06-14T00:00:00.000Z'));
  assert.equal(current.data.iso, '2026-06-14T00:00:00.000Z');
  assert.equal(current.data.inputUnit, 'current');
});

test('parses JWT header and payload without verifying signature', () => {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjo0MTAyNDE2MDAwfQ.signature';
  const result = parseJwt(token, new Date('2026-01-01T00:00:00.000Z'));
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(result.value).payload.sub, '1');
  assert.equal(JSON.parse(result.value).analysis.expired, false);

  const structured = parseJwtData(token, new Date('2026-01-01T00:00:00.000Z'));
  assert.equal(structured.ok, true);
  assert.equal(structured.data.header.alg, 'HS256');
  assert.equal(structured.data.segments.signature, 'signature');
  assert.equal(structured.data.analysis.expiresAt, '2099-12-31T16:00:00.000Z');
});

test('converts insert SQL rows to JSON documents', () => {
  const result = insertSqlToJson("INSERT INTO users (id,name) VALUES (1,'Alice'),(2,'Bob');");
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.value), [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' }
  ]);

  const parsed = parseInsertSql("INSERT INTO users (id,name,active) VALUES (1,'Alice',true),(2,'Bob',false);");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.table, 'users');
  assert.deepEqual(parsed.rows[0], { id: 1, name: 'Alice', active: true });

  const bulk = buildElasticBulkFromRows(parsed.table, parsed.rows, 'members');
  assert.equal(bulk.ok, true);
  assert.match(bulk.value, /"_index":"members"/);
  assert.match(bulk.value, /"name":"Bob"/);
});

test('parses and rebuilds URL parts', () => {
  const parsed = parseUrl('https://example.com/search?q=toolkit&page=1#top');
  assert.equal(parsed.ok, true);
  parsed.data.params[1].value = '2';
  assert.equal(buildUrlFromParts(parsed.data), 'https://example.com/search?q=toolkit&page=2#top');

  const encoded = parseUrl('https://example.com/search?q=%E5%B7%A5%E5%85%B7&q=json&space=a+b');
  assert.equal(encoded.ok, true);
  assert.deepEqual(encoded.data.params, [
    { key: 'q', value: '工具' },
    { key: 'q', value: 'json' },
    { key: 'space', value: 'a b' }
  ]);
  encoded.data.params[0].value = '工具箱';
  assert.equal(buildUrlFromParts(encoded.data), 'https://example.com/search?q=%E5%B7%A5%E5%85%B7%E7%AE%B1&q=json&space=a+b');
});

test('parses Cookie request headers and rebuilds Cookie header', () => {
  const result = parseCookieHeader('Cookie: sid=abc; theme=dark; encoded=hello%20world');
  assert.equal(result.ok, true);
  assert.equal(result.data.summary.total, 3);
  assert.equal(result.data.rows[2].decodedValue, 'hello world');
  assert.equal(result.data.rebuiltHeader, 'sid=abc; theme=dark; encoded=hello%20world');
  assert.equal(buildCookieHeader(result.data.rows, { prefix: true }), 'Cookie: sid=abc; theme=dark; encoded=hello%20world');
});

test('parses Set-Cookie response headers with attributes', () => {
  const result = parseSetCookieHeaders(
    [
      'Set-Cookie: sid=abc; Path=/; Domain=example.com; HttpOnly; Secure; SameSite=Lax; Expires=Wed, 21 Oct 2030 07:28:00 GMT',
      'theme=dark; Max-Age=0; SameSite=None; Secure'
    ].join('\n'),
    new Date('2026-01-01T00:00:00.000Z')
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.summary.total, 2);
  assert.equal(result.data.summary.secure, 2);
  assert.equal(result.data.summary.httpOnly, 1);
  assert.equal(result.data.summary.expired, 1);
  assert.equal(result.data.rows[0].domain, 'example.com');
  assert.equal(result.data.rows[0].path, '/');
  assert.equal(result.data.rows[0].sameSite, 'Lax');
  assert.equal(result.data.rows[0].expiresAt, '2030-10-21T07:28:00.000Z');
  assert.equal(result.data.rows[1].expired, true);
  assert.equal(result.data.rebuiltHeader, 'sid=abc; theme=dark');
});

test('parses HTTP headers and groups useful categories', () => {
  const result = parseHttpHeaders(
    [
      'GET /api/users HTTP/1.1',
      'Host: api.example.com',
      'Authorization: Bearer secret-token',
      'Accept: application/json',
      'Cookie: sid=abc; theme=dark',
      'X-Trace-Id: line-one',
      '  folded',
      'Cache-Control: no-cache'
    ].join('\n')
  );
  assert.equal(result.ok, true);
  assert.equal(result.data.startLine, 'GET /api/users HTTP/1.1');
  assert.equal(result.data.summary.total, 6);
  assert.equal(result.data.summary.auth, 1);
  assert.equal(result.data.summary.cookie, 1);
  assert.equal(result.data.summary.cache, 1);
  assert.equal(result.data.summary.sensitive, 2);
  assert.equal(result.data.rows.find((row) => row.name === 'X-Trace-Id').value, 'line-one folded');
  assert.match(result.value, /Bearer/);
  assert.match(result.value, /••••/);
  assert.deepEqual(buildHeadersObject(result.data.rows).Accept, 'application/json');
  assert.equal(JSON.parse(buildHeadersFetchObject(result.data.rows)).Host, 'api.example.com');
});

test('keeps duplicate HTTP headers as arrays', () => {
  const result = parseHttpHeaders(
    [
      'HTTP/1.1 200 OK',
      'Content-Type: application/json',
      'Set-Cookie: sid=abc; Path=/; HttpOnly',
      'Set-Cookie: theme=dark; Path=/',
      'Access-Control-Allow-Origin: https://example.com',
      'Strict-Transport-Security: max-age=31536000'
    ].join('\n')
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.duplicateNames, ['set-cookie']);
  assert.equal(result.data.summary.cors, 1);
  assert.equal(result.data.summary.security, 1);
  assert.deepEqual(result.data.object['Set-Cookie'], ['sid=abc; Path=/; HttpOnly', 'theme=dark; Path=/']);
});

test('builds and describes cron expressions', () => {
  assert.equal(
    buildCronExpressionFromParts({
      minute: '*/5',
      hour: '*',
      dayOfMonth: '*',
      month: '*',
      dayOfWeek: '*'
    }),
    '*/5 * * * *'
  );
  assert.deepEqual(parseCronExpressionFields('0 9 * * 1').data, {
    minute: '0',
    hour: '9',
    dayOfMonth: '*',
    month: '*',
    dayOfWeek: '1'
  });
  assert.equal(parseCronExpressionFields('* * *').ok, false);
  assert.equal(describeCronExpression('*/10 * * * *').value, '每 10 分钟执行');
  assert.equal(describeCronExpression('0 9 * * 1').value, '每周一 09:00 执行');
  assert.equal(describeCronExpression('30 8 1 * *').value, '每月 1 日 08:30 执行');
});

test('converts case and generates mock values', () => {
  assert.equal(convertCase('hello world', 'camel'), 'helloWorld');
  assert.match(generateMock('idcard', { count: 1 }), /^\d{17}[\dX]$/);
  assert.equal(generateMock('string', { count: 3, length: 4 }).split('\n').length, 3);
  assert.equal(generateMock('string', { count: 999, length: 200 }).split('\n').length, 200);
  assert.equal(generateMock('string', { count: 1, length: 200 }).length, 128);
});

test('formats UUID values with common variants', () => {
  const raw = '550e8400e29b41d4a716446655440000';
  assert.equal(formatUuidValue(raw).value, '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(formatUuidValue(raw, { uppercase: true, hyphenated: false, prefix: 'urn:uuid:' }).value, 'urn:uuid:550E8400E29B41D4A716446655440000');
  assert.equal(formatUuidValue('bad').ok, false);
  const list = formatUuidList([raw, '{550e8400-e29b-41d4-a716-446655440001}'], { uppercase: true });
  assert.equal(list.ok, true);
  assert.equal(list.data.count, 2);
  assert.match(list.value, /550E8400-E29B-41D4-A716-446655440001/);
});

test('splits RSA PEM key pairs for dedicated display', () => {
  const pem = [
    '-----BEGIN PUBLIC KEY-----',
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A',
    '-----END PUBLIC KEY-----',
    '',
    '-----BEGIN RSA PRIVATE KEY-----',
    'MIIEpAIBAAKCAQEA',
    '-----END RSA PRIVATE KEY-----'
  ].join('\n');
  const parsed = parseRsaKeyPairPem(pem);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.privateType, 'pkcs1');
  assert.equal(parsed.data.publicLineCount, 3);
  assert.equal(parsed.data.privateLineCount, 3);
  assert.match(parsed.data.privateKey, /BEGIN RSA PRIVATE KEY/);
  assert.equal(parseRsaKeyPairPem('bad').ok, false);
});

test('describes HMAC hex digests for dedicated display', () => {
  const described = describeHmacDigest('48656c6c6f');
  assert.equal(described.ok, true);
  assert.equal(described.data.byteLength, 5);
  assert.equal(described.data.bitLength, 40);
  assert.equal(described.data.base64, 'SGVsbG8=');
  assert.equal(describeHmacDigest('abc').ok, false);
  assert.equal(describeHmacDigest('not-hex').ok, false);
});

test('describes generic hex digests for hash displays', () => {
  const described = describeHexDigest('d41d8cd98f00b204e9800998ecf8427e');
  assert.equal(described.ok, true);
  assert.equal(described.data.byteLength, 16);
  assert.equal(described.data.bitLength, 128);
  assert.equal(described.data.base64, '1B2M2Y8AsgTpgAmY7PhCfg==');
});

test('converts color formats and counts text information', () => {
  assert.equal(colorFormats({ r: 255, g: 87, b: 51, a: 0.5 }).hexa, '#FF573380');
  const parsedColor = parseColor('rgba(255, 87, 51, 0.5)');
  assert.equal(parsedColor.ok, true);
  assert.equal(parsedColor.data.rgba, 'rgba(255, 87, 51, 0.5)');
  const parsedHexAlpha = parseColor('#FF573380');
  assert.equal(parsedHexAlpha.ok, true);
  assert.equal(parsedHexAlpha.data.rgba, 'rgba(255, 87, 51, 0.502)');
  const stats = countTextInfo('Hello 123\n你好');
  assert.equal(stats.data.lines, 2);
  assert.equal(stats.data.chinese, 2);
  assert.equal(stats.data.letters, 5);
  assert.equal(stats.data.digits, 3);
});

test('extracts useful patterns from mixed text', () => {
  const input = [
    'api: https://example.com/a?q=1, contact user@example.com',
    'phone 13800138000 ip 192.168.1.10 bad 999.1.1.1',
    'uuid 550e8400-e29b-41d4-a716-446655440000',
    'id 11010519491231002X duplicate 13800138000'
  ].join('\n');
  const result = extractTextPatterns(input, ['url', 'email', 'phone', 'ipv4', 'uuid', 'idcard']);
  assert.equal(result.ok, true);
  const groups = Object.fromEntries(result.data.groups.map((group) => [group.type, group.matches.map((match) => match.value)]));
  assert.deepEqual(groups.url, ['https://example.com/a?q=1']);
  assert.deepEqual(groups.email, ['user@example.com']);
  assert.deepEqual(groups.phone, ['13800138000']);
  assert.deepEqual(groups.ipv4, ['192.168.1.10']);
  assert.deepEqual(groups.uuid, ['550e8400-e29b-41d4-a716-446655440000']);
  assert.deepEqual(groups.idcard, ['11010519491231002X']);
  assert.equal(result.data.total, 6);
  assert.match(result.value, /13800138000\tL2:C7/);
});

test('converts cURL commands to fetch and axios code', () => {
  const curl =
    'curl \'https://api.example.com/users\' -X POST -H \'Content-Type: application/json\' -H \'Authorization: Bearer token\' --data \'{"name":"Alice","active":true}\'';
  const fetchResult = convertCurlToCode(curl, 'fetch');
  assert.equal(fetchResult.ok, true);
  assert.match(fetchResult.value, /fetch\("https:\/\/api\.example\.com\/users"/);
  assert.match(fetchResult.value, /"method": "POST"/);
  assert.match(fetchResult.value, /"Content-Type": "application\/json"/);
  assert.match(fetchResult.value, /"Authorization": "Bearer token"/);
  assert.match(fetchResult.value, /JSON\.stringify/);
  assert.match(fetchResult.value, /"active": true/);

  const axiosResult = convertCurlToCode(curl, 'axios');
  assert.equal(axiosResult.ok, true);
  assert.match(axiosResult.value, /axios\(/);
  assert.match(axiosResult.value, /"method": "post"/);
  assert.match(axiosResult.value, /"url": "https:\/\/api\.example\.com\/users"/);
  assert.match(axiosResult.value, /"data":/);
  assert.match(axiosResult.value, /"name": "Alice"/);

  const invalid = convertCurlToCode('wget https://example.com', 'fetch');
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /curl 开头/);
});

test('compares text lines with additions and removals', () => {
  const result = diffLines('alpha\nbeta\ngamma', 'alpha\nbeta changed\ngamma\ndelta');
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.summary, { added: 2, removed: 1, equal: 2, leftLines: 3, rightLines: 4 });
  assert.equal(result.data.rows.map((row) => row.type).join(','), 'equal,add,remove,equal,add');

  const ignored = diffLines('alpha  beta', 'alpha beta', { ignoreWhitespace: true });
  assert.equal(ignored.ok, true);
  assert.equal(ignored.data.summary.equal, 1);
});

test('converts PNG images to local binary formats', async () => {
  const png = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 255, g: 87, b: 51, alpha: 1 }
    }
  })
    .png()
    .toBuffer();
  const ico = await convertImageBuffer(png, 'ico');
  assert.equal(ico.mimeType, 'image/x-icon');
  assert.equal(ico.buffer.readUInt16LE(2), 1);

  const svg = await convertImageBuffer(png, 'svg');
  assert.match(svg.buffer.toString('utf8'), /^<svg/);

  const pdf = await convertImageBuffer(png, 'pdf');
  assert.match(pdf.buffer.subarray(0, 8).toString('ascii'), /^%PDF-1/);

  const docx = await convertImageBuffer(png, 'docx');
  assert.equal(docx.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(docx.buffer.subarray(0, 2).toString('ascii'), 'PK');
});

test('converts Markdown to DOCX with images, math and Mermaid diagrams', async () => {
  const png = await sharp({
    create: {
      width: 4,
      height: 3,
      channels: 4,
      background: { r: 22, g: 119, b: 255, alpha: 1 }
    }
  })
    .png()
    .toBuffer();
  const dataUri = `data:image/png;base64,${png.toString('base64')}`;
  let mermaidRendered = false;

  const result = await markdownToDocxBuffer(
    [
      '# Markdown 文档',
      '',
      '包含图片 ![蓝色图片](' + dataUri + ') 和公式 $\\frac{1}{2}$。',
      '',
      '```mermaid',
      'graph TD',
      '  A --> B',
      '```'
    ].join('\n'),
    {
      renderMermaid: async () => {
        mermaidRendered = true;
        return { buffer: png };
      }
    }
  );

  assert.equal(result.buffer.subarray(0, 2).toString('ascii'), 'PK');
  assert.deepEqual(result.warnings, []);
  assert.equal(mermaidRendered, true);

  const zip = await JSZip.loadAsync(result.buffer);
  const documentXml = await zip.file('word/document.xml').async('string');
  const mediaFiles = Object.keys(zip.files).filter((name) => name.startsWith('word/media/'));
  assert.match(documentXml, /Markdown 文档/);
  assert.match(documentXml, /<m:f>/);
  assert.ok(mediaFiles.length >= 2);
});

test('parses Markdown syntax inside blockquotes', async () => {
  const result = await markdownToDocxBuffer(
    [
      '> **xxx**  ',
      '> $\\frac{1}{2}$',
      '>',
      '> - aaa',
      '> - `bbb`'
    ].join('\n')
  );

  const zip = await JSZip.loadAsync(result.buffer);
  const documentXml = await zip.file('word/document.xml').async('string');
  assert.match(documentXml, /<w:pStyle w:val="Quote"\/>/);
  assert.match(documentXml, /<w:b\/>/);
  assert.match(documentXml, /<m:f>/);
  assert.match(documentXml, /aaa/);
  assert.match(documentXml, /bbb/);
});

test('sanitizes Markdown DOCX file names', () => {
  assert.equal(sanitizeDocxFileName(' report?.md '), 'report-.md.docx');
  assert.equal(sanitizeDocxFileName('demo.docx'), 'demo.docx');
  assert.equal(sanitizeDocxFileName('...'), 'markdown-document.docx');
});

test('builds Codex TOML without duplicate active provider keys', () => {
  const input = [
    'model = "old-model"',
    'model_provider = "old"',
    '',
    '[model_providers.toolkit]',
    'base_url = "https://old.example.com"',
    '',
    '[profiles.default]',
    'approval_policy = "never"'
  ].join('\n');
  const output = buildCodexToml(input, {
    name: 'Relay',
    baseUrl: 'https://relay.example.com/v1',
    apiKey: 'sk-test',
    model: 'gpt-5.1-codex'
  });
  assert.equal((output.match(/^model\s*=/gm) || []).length, 1);
  assert.equal((output.match(/^model_provider\s*=/gm) || []).length, 1);
  assert.match(output, /\[profiles\.default\]/);
  assert.match(output, /\[model_providers\.toolkit\]/);
  assert.match(output, /experimental_bearer_token = "sk-test"/);
});

test('manages CC Switch providers and writes app configs safely', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'toolkit-cc-switch-'));
  const manager = createCcSwitchManager({
    storePath: path.join(root, 'userData', 'cc-switch-providers.json'),
    homeDir: path.join(root, 'home')
  });
  try {
    const saved = await manager.saveProvider({
      app: 'claude',
      name: 'Relay',
      slug: 'relay',
      baseUrl: 'https://relay.example.com/v1/',
      apiKey: 'sk-test',
      model: 'claude-sonnet-4-6'
    });
    assert.equal(saved.providers.length, 1);
    const providerId = saved.providers[0].id;
    assert.equal(saved.providers[0].app, 'claude');
    assert.equal(typeof saved.apps.find((app) => app.id === 'claude').configured, 'boolean');

    const claude = await manager.applyProvider({ providerId, app: 'claude' });
    const claudeSettings = JSON.parse(await readFile(path.join(root, 'home', '.claude', 'settings.json'), 'utf8'));
    assert.equal(claude.applied.providerName, 'Relay');
    assert.equal(claude.apps.find((app) => app.id === 'claude').configured, true);
    assert.equal(claudeSettings.env.ANTHROPIC_BASE_URL, 'https://relay.example.com/v1');
    assert.equal(claudeSettings.env.ANTHROPIC_AUTH_TOKEN, 'sk-test');

    await assert.rejects(() => manager.applyProvider({ providerId, app: 'codex' }), /属于 Claude Code/);

    const geminiProvider = (await manager.saveProvider({
      app: 'gemini',
      name: 'Relay Gemini',
      slug: 'relay-gemini',
      baseUrl: 'https://relay.example.com/v1/',
      apiKey: 'sk-test',
      model: 'gemini-2.5-pro'
    })).providers.find((provider) => provider.app === 'gemini');
    await manager.applyProvider({ providerId: geminiProvider.id, app: 'gemini' });
    const geminiEnv = parseEnv(await readFile(path.join(root, 'home', '.gemini', '.env'), 'utf8'));
    assert.equal(geminiEnv.GOOGLE_GEMINI_BASE_URL, 'https://relay.example.com/v1');
    assert.equal(geminiEnv.GEMINI_API_KEY, 'sk-test');

    const codexProvider = (await manager.saveProvider({
      app: 'codex',
      name: 'Relay Codex',
      slug: 'relay-codex',
      baseUrl: 'https://relay.example.com/v1/',
      apiKey: 'sk-test',
      model: 'gpt-5.1-codex'
    })).providers.find((provider) => provider.app === 'codex');
    await manager.applyProvider({ providerId: codexProvider.id, app: 'codex' });
    const codexToml = await readFile(path.join(root, 'home', '.codex', 'config.toml'), 'utf8');
    assert.match(codexToml, /model_provider = "toolkit"/);
    assert.match(codexToml, /base_url = "https:\/\/relay\.example\.com\/v1"/);

    const actualConfig = await manager.readAppConfig('claude');
    assert.equal(actualConfig.exists, true);
    assert.match(actualConfig.content, /ANTHROPIC_BASE_URL/);
    const savedConfig = await manager.writeAppConfigRaw({
      app: 'claude',
      content: JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://raw.example.com' } }, null, 2)
    });
    assert.match(savedConfig.content, /raw\.example\.com/);
    assert.match(savedConfig.backupPath, /\.toolkit-backup-/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('normalizes legacy CC Switch providers with app inference and old field names', () => {
  assert.equal(normalizeProvider({
    id: 'ccswitch-codex-official',
    name: 'OpenAI Official',
    websiteURL: 'https://chatgpt.com/codex'
  }).app, 'codex');
  assert.equal(normalizeProvider({
    id: 'ccswitch-gemini-official',
    name: 'Google Official',
    websiteURL: 'https://ai.google.dev/'
  }).app, 'gemini');
  const codexRelay = normalizeProvider({
    id: 'ccswitch-df4e5a08',
    name: 'coderelay',
    websiteURL: 'https://coderelay.cn/',
    defaultModel: 'gpt-5.5'
  });
  assert.equal(codexRelay.app, 'codex');
  assert.equal(codexRelay.websiteUrl, 'https://coderelay.cn/');
  assert.equal(codexRelay.model, 'gpt-5.5');
  assert.equal(normalizeProvider({
    id: 'ccswitch-default',
    name: '谐修ai',
    baseURL: 'https://coderelay.cn/',
    defaultModel: 'opus[1m]'
  }).app, 'claude');
});

test('deduplicates legacy CC Switch provider cache on read', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'toolkit-cc-switch-dedupe-'));
  const storePath = path.join(root, 'userData', 'cc-switch-providers.json');
  const manager = createCcSwitchManager({ storePath, homeDir: path.join(root, 'home') });
  try {
    await mkdir(path.dirname(storePath), { recursive: true });
    await writeFile(storePath, JSON.stringify({
      providers: [
        {
          id: 'openrouter-old',
          name: 'OpenRouter',
          slug: 'openrouter',
          app: 'claude',
          baseUrl: 'https://openrouter.ai/api',
          apiKey: 'sk-same',
          websiteUrl: 'https://openrouter.ai'
        },
        {
          id: 'openrouter-new',
          name: 'OpenRouter',
          slug: 'openrouter',
          app: 'claude',
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'sk-same',
          websiteUrl: 'https://openrouter.ai'
        },
        {
          id: 'flatkey-partial',
          name: 'flatkey shulex',
          slug: 'flatkey-shulex',
          websiteURL: 'https://router.flatkey.ai',
          apiKey: 'sk-flat'
        },
        {
          id: 'flatkey-full',
          name: 'Flatkey-shulex',
          slug: 'flatkey-shulex',
          baseURL: 'https://router.flatkey.ai',
          websiteURL: 'https://router.flatkey.ai',
          apiKey: 'sk-flat'
        }
      ],
      currentByApp: { claude: 'openrouter-new', codex: 'flatkey-partial' }
    }), 'utf8');

    const result = await manager.list();
    assert.equal(result.providers.filter((provider) => provider.name.toLowerCase() === 'openrouter').length, 1);
    assert.equal(result.providers.filter((provider) => provider.slug === 'flatkey-shulex').length, 1);
    assert.equal(result.providers.find((provider) => provider.slug === 'flatkey-shulex').app, 'codex');
    assert.equal(result.providers.find((provider) => provider.slug === 'flatkey-shulex').baseUrl, 'https://router.flatkey.ai');
    assert.equal(result.currentByApp.claude, 'openrouter-new');
    assert.equal(result.currentByApp.codex, 'flatkey-full');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('imports existing cc-switch sqlite providers and builds copy snippets', { skip: !existsSync('/usr/bin/sqlite3') }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'toolkit-cc-switch-import-'));
  const homeDir = path.join(root, 'home');
  const dbPath = path.join(homeDir, '.cc-switch', 'cc-switch.db');
  const manager = createCcSwitchManager({
    storePath: path.join(root, 'userData', 'cc-switch-providers.json'),
    homeDir
  });
  try {
    await mkdir(path.dirname(dbPath), { recursive: true });
    await execFileAsync('sqlite3', [
      dbPath,
      `create table providers (
        id text primary key,
        app_type text,
        name text,
        settings_config text,
        website_url text,
        notes text,
        created_at text,
        updated_at text
      );`
    ]);
    const settings = JSON.stringify({
      api_key: 'sk-imported',
      base_url: 'https://import.example.com/v1',
      default_model: 'claude-imported',
      models: [{ id: 'claude-imported' }]
    });
    const sqlSettings = `'${settings.replaceAll("'", "''")}'`;
    await execFileAsync('sqlite3', [
      dbPath,
      `insert into providers values ('relay-id', 'claude', 'Imported Relay', ${sqlSettings}, 'https://relay.example.com', 'from cc-switch', '2026-01-01', '2026-01-02');`
    ]);

    const imported = await manager.importExistingCcSwitch();
    assert.equal(imported.importResult.imported, 1);
    assert.equal(imported.importResult.skipped, 0);
    const provider = imported.providers.find((item) => item.name === 'Imported Relay');
    assert.ok(provider);
    assert.equal(provider.app, 'claude');
    assert.equal(provider.baseUrl, 'https://import.example.com/v1');
    assert.equal(provider.apiKey, 'sk-imported');

    const repeated = await manager.importExistingCcSwitch();
    assert.equal(repeated.importResult.imported, 0);
    assert.equal(repeated.importResult.skipped, 1);

    const snippets = buildProviderConfigSnippets(provider);
    assert.match(snippets.find((snippet) => snippet.app === 'claude').content, /ANTHROPIC_AUTH_TOKEN/);
    assert.match(snippets.find((snippet) => snippet.app === 'codex').content, /model_provider = "toolkit"/);
    assert.match(snippets.find((snippet) => snippet.app === 'codex-auth').content, /OPENAI_API_KEY/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('converts tool.lu style local text and network helpers', () => {
  assert.equal(convertHtmlEntity('<a>&</a>', 'encode').value, '&lt;a&gt;&amp;&lt;/a&gt;');
  assert.equal(convertHtmlEntity('&lt;a&gt;', 'decode').value, '<a>');
  assert.equal(convertBaseNumber('FF', { fromBase: '16', toBase: '10' }).value, '255');
  const baseDetails = convertBaseNumberDetails('FF', { fromBase: '16' });
  assert.equal(baseDetails.ok, true);
  assert.equal(baseDetails.data.decimal, '255');
  assert.equal(baseDetails.data.bitLength, 8);
  assert.equal(baseDetails.data.byteLength, 1);
  assert.equal(baseDetails.data.rows.find((row) => row.base === 2).value, '11111111');
  assert.equal(baseDetails.data.rows.find((row) => row.base === 16).prefixedValue, '0xFF');
  assert.equal(convertHexString('E5 B7 A5 E5 85 B7', 'decode').value, '工具');
  assert.equal(convertMorse('SOS', 'encode').value, '... --- ...');
  assert.equal(convertMorse('... --- ...', 'decode').value, 'SOS');
  assert.match(calculateCidr('192.168.1.10/24').value, /网络地址: 192\.168\.1\.0/);
  const cidr = calculateCidrDetails('192.168.1.10/24');
  assert.equal(cidr.ok, true);
  assert.equal(cidr.data.network, '192.168.1.0');
  assert.equal(cidr.data.broadcast, '192.168.1.255');
  assert.equal(cidr.data.usableHosts, 254);
  assert.equal(cidr.data.wildcardMask, '0.0.0.255');
  assert.equal(calculateDate('2026-06-11\n2026-06-21', 'diff').value, '2026-06-11 到 2026-06-21 相差 10 天');
  const dateDiff = calculateDateDetails({ mode: 'diff', baseDate: '2026-06-11', targetDate: '2026-06-21' });
  assert.equal(dateDiff.ok, true);
  assert.equal(dateDiff.data.absoluteDays, 10);
  assert.equal(dateDiff.data.reverse, false);
  const dateOffset = calculateDateDetails({ mode: 'offset', baseDate: '2026-06-11', days: '7', direction: 'subtract' });
  assert.equal(dateOffset.ok, true);
  assert.equal(dateOffset.data.resultDate, '2026-06-04');
  assert.equal(dateOffset.data.signedDays, -7);
  assert.equal(convertUnit('1000', { fromUnit: 'm', toUnit: 'km' }).value, '1000 米 = 1 千米');
  assert.equal(convertUnit('32', { fromUnit: 'f', toUnit: 'c' }).value, '32 华氏度 = 0 摄氏度');
  assert.equal(lookupHttpStatus('404').value, '404 Not Found');
  assert.equal(numberToChineseUpper('1234.56').value, '壹仟贰佰叁拾肆元伍角陆分');

  const thunder = convertDownloadLink('https://example.com/file.zip', 'thunder-encode').value;
  assert.equal(convertDownloadLink(thunder, 'thunder-decode').value, 'https://example.com/file.zip');
});

test('calculates personal income tax and loan payments', () => {
  const tax = calculatePersonalTax({ monthlyIncome: '20000', months: '12' });
  assert.equal(tax.ok, true);
  assert.equal(tax.data.monthlySocial, 3500);
  assert.equal(tax.data.taxable, 138000);
  assert.equal(tax.data.rate, 0.1);
  assert.equal(tax.data.cumulativeTax, 11280);

  const cappedTax = calculatePersonalTax({
    monthlyIncome: '50000',
    months: '1',
    socialMaxBase: '30000',
    housingMaxBase: '20000'
  });
  assert.equal(cappedTax.ok, true);
  assert.equal(cappedTax.data.socialBase, 30000);
  assert.equal(cappedTax.data.housingBase, 20000);
  assert.equal(cappedTax.data.monthlySocial, 4550);

  const loan = calculateLoan({ principalWan: '100', years: '30', annualRate: '3.5', method: 'equal-payment' });
  assert.equal(loan.ok, true);
  assert.equal(loan.data.months, 360);
  assert.equal(Math.round(loan.data.firstPayment), 4490);

  const equalPrincipal = calculateLoan({ principalWan: '100', years: '30', annualRate: '3.5', method: 'equal-principal' });
  assert.equal(equalPrincipal.ok, true);
  assert.equal(equalPrincipal.data.firstPayment > equalPrincipal.data.lastPayment, true);
});
