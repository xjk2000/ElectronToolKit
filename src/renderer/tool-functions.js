export const JSON_INPUT_CHAR_LIMIT = 10_000_000;

export function formatJson(input, indent = 2) {
  const sizeGuard = guardJsonInputSize(input);
  if (!sizeGuard.ok) return sizeGuard;

  try {
    return { ok: true, value: JSON.stringify(JSON.parse(input), null, indent) };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function parseStringifiedJson(input, { indent = 2, parseNested = true, maxDepth = 20 } = {}) {
  const sizeGuard = guardJsonInputSize(input);
  if (!sizeGuard.ok) return sizeGuard;

  try {
    const parsed = unwrapStringifiedJson(input, Math.max(1, Number(maxDepth) || 20));
    const value = parseNested ? parseNestedJsonStrings(parsed, 0, Math.max(1, Number(maxDepth) || 20)) : parsed;
    return { ok: true, value: JSON.stringify(value, null, indent) };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function formatJsonWithCompactKeys(input, compactKeys = [], indent = 2) {
  const sizeGuard = guardJsonInputSize(input);
  if (!sizeGuard.ok) return sizeGuard;

  try {
    const parsed = JSON.parse(input);
    return { ok: true, value: stringifyJsonWithCompactKeysValue(parsed, compactKeys, indent) };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function stringifyJsonWithCompactKeysValue(value, compactKeys = [], indent = 2) {
  const compactKeySet =
    compactKeys instanceof Set
      ? compactKeys
      : new Set(compactKeys.map((key) => String(key).trim()).filter(Boolean));
  return stringifyWithCompactKeys(value, compactKeySet, indent, 0);
}

export function minifyJson(input) {
  const sizeGuard = guardJsonInputSize(input);
  if (!sizeGuard.ok) return sizeGuard;

  try {
    return { ok: true, value: JSON.stringify(JSON.parse(input)) };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function sortJsonKeys(input, indent = 2) {
  const sizeGuard = guardJsonInputSize(input);
  if (!sizeGuard.ok) return sizeGuard;

  try {
    return { ok: true, value: JSON.stringify(sortJsonValueKeys(JSON.parse(input)), null, indent) };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function validateJson(input) {
  const sizeGuard = guardJsonInputSize(input);
  if (!sizeGuard.ok) return sizeGuard;

  try {
    JSON.parse(input);
    return { ok: true, value: 'JSON 有效' };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function compareJsonInputs(leftInput, rightInput, { maxChanges = 5000 } = {}) {
  const leftGuard = guardJsonInputSize(leftInput);
  if (!leftGuard.ok) return leftGuard;
  const rightGuard = guardJsonInputSize(rightInput);
  if (!rightGuard.ok) return rightGuard;

  try {
    const left = JSON.parse(leftInput);
    const right = JSON.parse(rightInput);
    const changes = [];
    const summary = { added: 0, removed: 0, changed: 0, unchanged: 0, truncated: false };
    walkJsonDiff(left, right, [], changes, summary, Math.max(1, Number(maxChanges) || 5000));
    return {
      ok: true,
      data: { changes, summary },
      value: formatJsonDiffText(changes, summary)
    };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function queryJsonPath(input, path) {
  const sizeGuard = guardJsonInputSize(input);
  if (!sizeGuard.ok) return sizeGuard;

  try {
    const parsed = JSON.parse(input);
    const tokens = parseJsonPath(path);
    let matches = [parsed];
    tokens.forEach((token) => {
      matches = expandJsonPathToken(matches, token);
    });

    if (matches.length === 0) {
      return { ok: false, error: 'JSON Path 没有匹配到任何值' };
    }

    const value = matches.length === 1 ? matches[0] : matches;
    return { ok: true, value: JSON.stringify(value, null, 2) };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function collectJsonStats(value, nodeLimit = Number.POSITIVE_INFINITY) {
  const limit = Number.isFinite(Number(nodeLimit)) ? Math.max(1, Number(nodeLimit)) : Number.POSITIVE_INFINITY;
  const stats = {
    totalNodes: 0,
    objectCount: 0,
    arrayCount: 0,
    primitiveCount: 0,
    maxDepth: 0,
    truncated: false
  };
  const seen = new WeakSet();

  visitJsonStats(value, 0, stats, limit, seen);
  return stats;
}

export function buildJsonLinesCsvPreview(previewText, fields, rowLimit = 5) {
  const headers = normalizeJsonLinePreviewFields(fields);
  if (headers.length === 0) return { ok: false, error: '请输入要预览的字段' };
  const rows = [];
  const lines = String(previewText ?? '').replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    if (rows.length >= rowLimit) break;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const value = JSON.parse(trimmed);
      rows.push(headers.map((field) => formatJsonLinePreviewValue(readJsonPathPreviewValue(value, field))));
    } catch {
      break;
    }
  }
  if (rows.length === 0) return { ok: false, error: '文件开头没有可预览的 JSONL 记录' };
  return {
    ok: true,
    headers,
    rows,
    csvText: [headers.map(csvPreviewEscape).join(','), ...rows.map((row) => row.map(csvPreviewEscape).join(','))].join('\n')
  };
}

export function compareExpectedFileHash(hashes, expectedInput) {
  const expected = extractExpectedHash(expectedInput);
  if (!expected) return { status: 'empty', message: '粘贴官方哈希后自动比对' };
  if (!isSupportedHashLength(expected.length)) {
    return { status: 'invalid', expected, message: '未识别到 MD5/SHA1/SHA256/SHA512 长度的哈希值' };
  }

  const entries = Object.entries(hashes ?? {});
  const matched = entries.find(([, value]) => normalizeHashText(value) === expected);
  if (matched) {
    return {
      status: 'match',
      algorithm: matched[0],
      expected,
      actual: matched[1],
      message: `${matched[0].toUpperCase()} 校验一致`
    };
  }

  const sameLength = entries.find(([, value]) => normalizeHashText(value).length === expected.length);
  if (!sameLength) {
    return { status: 'missing-algorithm', expected, message: '当前未计算该长度对应的哈希算法' };
  }

  return {
    status: 'mismatch',
    algorithm: sameLength[0],
    expected,
    actual: sameLength[1],
    message: `${sameLength[0].toUpperCase()} 不一致`
  };
}

export function jsonToDelimited(input, delimiter = ',') {
  const sizeGuard = guardJsonInputSize(input);
  if (!sizeGuard.ok) return sizeGuard;

  try {
    const parsed = JSON.parse(input);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    if (rows.length === 0) return { ok: true, value: '' };
    if (!rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
      return { ok: false, error: 'JSON 必须是对象数组，或单个对象' };
    }

    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const lines = [
      headers.map((header) => stringifyDelimitedCell(header, delimiter)).join(delimiter),
      ...rows.map((row) =>
        headers
          .map((header) => stringifyDelimitedCell(formatDelimitedValue(row[header]), delimiter))
          .join(delimiter)
      )
    ];
    return { ok: true, value: lines.join('\n') };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function jsonToTypeScript(input, rootName = 'RootObject') {
  const sizeGuard = guardJsonInputSize(input);
  if (!sizeGuard.ok) return sizeGuard;

  try {
    const parsed = JSON.parse(input);
    const context = { definitions: [], usedNames: new Set() };
    const rootTypeName = normalizeTypeName(rootName, 'RootObject');
    const rootType = inferTypeScriptType(parsed, rootTypeName, context);
    if (context.definitions.length > 0 && rootType === rootTypeName) {
      return { ok: true, value: context.definitions.join('\n\n') };
    }
    return { ok: true, value: [...context.definitions, `export type ${rootTypeName} = ${rootType};`].filter(Boolean).join('\n\n') };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function jsonToJsonSchema(input, title = 'RootSchema') {
  const sizeGuard = guardJsonInputSize(input);
  if (!sizeGuard.ok) return sizeGuard;

  try {
    const parsed = JSON.parse(input);
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: normalizeSchemaTitle(title),
      ...inferJsonSchema(parsed)
    };
    return { ok: true, value: JSON.stringify(schema, null, 2) };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

function extractExpectedHash(value) {
  const matches = String(value ?? '').toLowerCase().match(/[a-f0-9]{32,128}/g) ?? [];
  return matches
    .filter((item) => isSupportedHashLength(item.length))
    .sort((a, b) => b.length - a.length)[0] ?? '';
}

function unwrapStringifiedJson(input, maxDepth) {
  let value = JSON.parse(String(input ?? '').trim());
  let depth = 0;
  while (typeof value === 'string' && depth < maxDepth) {
    const text = value.trim();
    if (!looksLikeAnyJson(text)) break;
    value = JSON.parse(text);
    depth += 1;
  }
  return value;
}

function parseNestedJsonStrings(value, depth, maxDepth) {
  if (depth >= maxDepth) return value;
  if (Array.isArray(value)) return value.map((item) => parseNestedJsonStrings(item, depth + 1, maxDepth));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, parseNestedJsonStrings(item, depth + 1, maxDepth)])
    );
  }
  if (typeof value !== 'string') return value;

  const text = value.trim();
  if (!looksLikeJsonContainer(text)) return value;
  try {
    return parseNestedJsonStrings(JSON.parse(text), depth + 1, maxDepth);
  } catch {
    return value;
  }
}

function looksLikeAnyJson(text) {
  return looksLikeJsonContainer(text)
    || /^"(?:[^"\\]|\\.)*"$/.test(text)
    || /^(true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?)$/i.test(text);
}

function looksLikeJsonContainer(text) {
  return (text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'));
}

function isSupportedHashLength(length) {
  return [32, 40, 64, 128].includes(Number(length));
}

function normalizeHashText(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-f0-9]/g, '');
}

function walkJsonDiff(left, right, pathParts, changes, summary, maxChanges) {
  if (summary.truncated) return;
  if (isJsonEqual(left, right)) {
    summary.unchanged += 1;
    return;
  }

  const leftType = jsonValueKind(left);
  const rightType = jsonValueKind(right);
  if (leftType !== rightType || left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    pushJsonDiffChange(changes, summary, maxChanges, {
      type: 'changed',
      path: formatJsonDiffPath(pathParts),
      left,
      right,
      leftType,
      rightType
    });
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index += 1) {
      if (index >= left.length) {
        pushJsonDiffChange(changes, summary, maxChanges, { type: 'added', path: formatJsonDiffPath([...pathParts, index]), right: right[index], rightType: jsonValueKind(right[index]) });
      } else if (index >= right.length) {
        pushJsonDiffChange(changes, summary, maxChanges, { type: 'removed', path: formatJsonDiffPath([...pathParts, index]), left: left[index], leftType: jsonValueKind(left[index]) });
      } else {
        walkJsonDiff(left[index], right[index], [...pathParts, index], changes, summary, maxChanges);
      }
      if (summary.truncated) return;
    }
    return;
  }

  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    if (!Object.hasOwn(left, key)) {
      pushJsonDiffChange(changes, summary, maxChanges, { type: 'added', path: formatJsonDiffPath([...pathParts, key]), right: right[key], rightType: jsonValueKind(right[key]) });
    } else if (!Object.hasOwn(right, key)) {
      pushJsonDiffChange(changes, summary, maxChanges, { type: 'removed', path: formatJsonDiffPath([...pathParts, key]), left: left[key], leftType: jsonValueKind(left[key]) });
    } else {
      walkJsonDiff(left[key], right[key], [...pathParts, key], changes, summary, maxChanges);
    }
    if (summary.truncated) return;
  }
}

function pushJsonDiffChange(changes, summary, maxChanges, change) {
  if (changes.length >= maxChanges) {
    summary.truncated = true;
    return;
  }
  changes.push(change);
  summary[change.type] += 1;
}

function isJsonEqual(left, right) {
  if (left === right) return true;
  if (Number.isNaN(left) && Number.isNaN(right)) return true;
  return false;
}

function jsonValueKind(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function formatJsonDiffPath(pathParts) {
  if (!pathParts.length) return '$';
  return pathParts.reduce((path, part) => {
    if (typeof part === 'number') return `${path}[${part}]`;
    return /^[A-Za-z_$][\w$]*$/.test(part) ? `${path}.${part}` : `${path}[${JSON.stringify(part)}]`;
  }, '$');
}

function formatJsonDiffText(changes, summary) {
  if (changes.length === 0) return '两个 JSON 结构和值完全一致';
  const lines = [
    `新增: ${summary.added}`,
    `删除: ${summary.removed}`,
    `变更: ${summary.changed}`,
    summary.truncated ? '结果过多，已截断' : '',
    ''
  ].filter(Boolean);
  changes.forEach((change) => {
    const marker = change.type === 'added' ? '+' : change.type === 'removed' ? '-' : '~';
    lines.push(`${marker} ${change.path}`);
    if (change.type !== 'added') lines.push(`  left: ${formatJsonDiffValue(change.left)}`);
    if (change.type !== 'removed') lines.push(`  right: ${formatJsonDiffValue(change.right)}`);
  });
  return lines.join('\n');
}

function formatJsonDiffValue(value) {
  const text = JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function inferTypeScriptType(value, nameHint, context) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return inferTypeScriptArrayType(value, nameHint, context);
  if (typeof value === 'object') return createTypeScriptInterface([value], nameHint, context);
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return Number.isInteger(value) ? 'number' : 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'unknown';
}

function inferTypeScriptArrayType(values, nameHint, context) {
  if (values.length === 0) return 'unknown[]';
  const objectItems = values.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  if (objectItems.length === values.length) {
    return `${createTypeScriptInterface(objectItems, `${nameHint}Item`, context)}[]`;
  }
  const itemTypes = values.map((item) => inferTypeScriptType(item, `${nameHint}Item`, context));
  return `${formatTypeScriptUnion(itemTypes)}[]`;
}

function createTypeScriptInterface(records, nameHint, context) {
  const typeName = reserveTypeName(normalizeTypeName(nameHint, 'GeneratedType'), context);
  const keys = [];
  records.forEach((record) => {
    Object.keys(record).forEach((key) => {
      if (!keys.includes(key)) keys.push(key);
    });
  });

  const lines = keys.map((key) => {
    const presentValues = records.filter((record) => Object.prototype.hasOwnProperty.call(record, key)).map((record) => record[key]);
    const optional = presentValues.length < records.length ? '?' : '';
    const propertyType = formatTypeScriptUnion(presentValues.map((value) => inferTypeScriptType(value, `${typeName}${normalizeTypeName(key, 'Field')}`, context)));
    return `  ${formatTypeScriptPropertyName(key)}${optional}: ${propertyType};`;
  });

  context.definitions.push(`export interface ${typeName} {\n${lines.join('\n')}\n}`);
  return typeName;
}

function formatTypeScriptUnion(types) {
  const uniqueTypes = [...new Set(types.filter(Boolean))];
  if (uniqueTypes.length === 0) return 'unknown';
  return uniqueTypes.length === 1 ? uniqueTypes[0] : uniqueTypes.join(' | ');
}

function reserveTypeName(name, context) {
  let nextName = name;
  let index = 2;
  while (context.usedNames.has(nextName)) {
    nextName = `${name}${index}`;
    index += 1;
  }
  context.usedNames.add(nextName);
  return nextName;
}

function normalizeTypeName(value, fallback) {
  const words = String(value ?? '')
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  const name = words.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join('');
  const safeName = name || fallback;
  return /^[0-9]/.test(safeName) ? `T${safeName}` : safeName;
}

function formatTypeScriptPropertyName(key) {
  const value = String(key);
  return /^[A-Za-z_$][\w$]*$/.test(value) ? value : JSON.stringify(value);
}

function inferJsonSchema(value) {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return inferJsonArraySchema(value);
  if (typeof value === 'object') return inferJsonObjectSchema([value]);
  if (typeof value === 'string') return { type: 'string' };
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  return {};
}

function inferJsonArraySchema(values) {
  if (values.length === 0) return { type: 'array', items: {} };
  const objectItems = values.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  return {
    type: 'array',
    items: objectItems.length === values.length
      ? inferJsonObjectSchema(objectItems)
      : mergeJsonSchemas(values.map(inferJsonSchema))
  };
}

function inferJsonObjectSchema(records) {
  const keys = [];
  records.forEach((record) => {
    Object.keys(record).forEach((key) => {
      if (!keys.includes(key)) keys.push(key);
    });
  });

  const properties = {};
  const required = [];
  keys.forEach((key) => {
    const presentValues = records.filter((record) => Object.prototype.hasOwnProperty.call(record, key)).map((record) => record[key]);
    properties[key] = mergeJsonSchemas(presentValues.map(inferJsonSchema));
    if (presentValues.length === records.length) required.push(key);
  });

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: true
  };
}

function mergeJsonSchemas(schemas) {
  const flattened = schemas.flatMap((schema) => schema?.anyOf ?? [schema]).filter(Boolean);
  if (flattened.length === 0) return {};
  const unique = dedupeJsonSchemas(flattened);
  if (unique.length === 1) return unique[0];
  const types = [...new Set(unique.map((schema) => schema.type).filter(Boolean))];
  if (types.length === 1) {
    if (types[0] === 'object') return mergeObjectSchemas(unique);
    if (types[0] === 'array') return { type: 'array', items: mergeJsonSchemas(unique.map((schema) => schema.items ?? {})) };
  }
  return { anyOf: unique };
}

function mergeObjectSchemas(schemas) {
  const keys = [];
  schemas.forEach((schema) => {
    Object.keys(schema.properties ?? {}).forEach((key) => {
      if (!keys.includes(key)) keys.push(key);
    });
  });
  const properties = {};
  keys.forEach((key) => {
    properties[key] = mergeJsonSchemas(schemas.map((schema) => schema.properties?.[key]).filter(Boolean));
  });
  const required = schemas.length > 0
    ? schemas.map((schema) => schema.required ?? []).reduce((shared, current) => shared.filter((key) => current.includes(key)))
    : [];
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: true
  };
}

function dedupeJsonSchemas(schemas) {
  const seen = new Set();
  return schemas.filter((schema) => {
    const signature = JSON.stringify(schema);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function normalizeSchemaTitle(value) {
  return String(value ?? '').trim() || 'RootSchema';
}

export function delimitedToJson(input, delimiter = ',') {
  try {
    const rows = parseDelimitedRows(String(input ?? ''), delimiter).filter((row) => row.some((cell) => cell.trim() !== ''));
    if (rows.length === 0) return { ok: false, error: '请输入 CSV/TSV 内容' };

    const headers = rows[0].map((header, index) => {
      const value = header.trim();
      return value || `field_${index + 1}`;
    });
    const data = rows.slice(1).map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, parseDelimitedValue(row[index] ?? '')]))
    );
    return { ok: true, value: JSON.stringify(data, null, 2) };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function encodeBase64(input) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(String(input), 'utf8').toString('base64');
  }

  const bytes = new TextEncoder().encode(String(input));
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function encodeBase64Detailed(input, { urlSafe = false, dataUri = false, mimeType = 'text/plain;charset=utf-8' } = {}) {
  const text = String(input ?? '');
  const bytes = textToUtf8Bytes(text);
  const base64 = applyBase64UrlSafe(bytesToBase64(bytes), urlSafe);
  const normalizedMime = String(mimeType || 'text/plain;charset=utf-8').trim();
  const output = dataUri ? `data:${normalizedMime};base64,${base64}` : base64;
  return {
    ok: true,
    value: output,
    data: {
      output,
      base64,
      bytes: bytes.length,
      chars: text.length,
      urlSafe: Boolean(urlSafe),
      dataUri: Boolean(dataUri),
      mimeType: normalizedMime
    }
  };
}

export function decodeBase64(input) {
  const value = String(input).trim();
  try {
    if (typeof Buffer !== 'undefined') {
      return { ok: true, value: Buffer.from(value, 'base64').toString('utf8') };
    }

    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return { ok: true, value: new TextDecoder().decode(bytes) };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function decodeBase64Detailed(input) {
  try {
    const parsed = parseBase64Input(input);
    const bytes = base64ToBytes(parsed.base64);
    const text = utf8BytesToText(bytes);
    return {
      ok: true,
      value: text,
      data: {
        text,
        bytes: bytes.length,
        chars: text.length,
        base64: parsed.base64,
        isDataUri: parsed.isDataUri,
        mimeType: parsed.mimeType,
        urlSafe: parsed.urlSafe
      }
    };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function encodeUrl(input) {
  return encodeURIComponent(String(input));
}

export function encodeUrlDetailed(input, { mode = 'component' } = {}) {
  const text = String(input ?? '');
  const normalizedMode = normalizeUrlCodecMode(mode);
  const encoded =
    normalizedMode === 'uri'
      ? encodeURI(text)
      : normalizedMode === 'form'
        ? encodeURIComponent(text).replace(/%20/g, '+')
        : encodeURIComponent(text);
  return {
    ok: true,
    value: encoded,
    data: buildUrlCodecData(text, encoded, normalizedMode, 'encode')
  };
}

export function decodeUrl(input) {
  try {
    return { ok: true, value: decodeURIComponent(String(input)) };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function decodeUrlDetailed(input, { mode = 'component' } = {}) {
  const text = String(input ?? '');
  const normalizedMode = normalizeUrlCodecMode(mode);
  try {
    const source = normalizedMode === 'form' ? text.replace(/\+/g, '%20') : text;
    const decoded = normalizedMode === 'uri' ? decodeURI(source) : decodeURIComponent(source);
    return {
      ok: true,
      value: decoded,
      data: buildUrlCodecData(text, decoded, normalizedMode, 'decode')
    };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

export function inspectTimestamp(input, now = new Date()) {
  const raw = String(input ?? '').trim();
  const timestamp = raw ? Number(raw) : now.getTime();
  if (!Number.isFinite(timestamp)) {
    return { ok: false, error: '请输入有效的 Unix 时间戳' };
  }

  const milliseconds = Math.abs(timestamp) < 100000000000 ? timestamp * 1000 : timestamp;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: '时间戳无法转换为有效日期' };
  }

  return formatTimestampResult(date, Math.abs(timestamp) < 100000000000 ? 'seconds' : 'milliseconds');
}

export function inspectDateTime(input, now = new Date()) {
  const raw = String(input ?? '').trim();
  if (!raw) return formatTimestampResult(now, 'current');
  if (/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return inspectTimestamp(raw, now);

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: '请输入有效的时间戳、ISO 时间或可识别日期时间' };
  }
  return formatTimestampResult(date, 'datetime');
}

function textToUtf8Bytes(text) {
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(text, 'utf8'));
  return new TextEncoder().encode(text);
}

function utf8BytesToText(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('utf8');
  return new TextDecoder().decode(bytes);
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(input) {
  const normalized = normalizeBase64Text(input);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new Error('Base64 内容格式不合法');
  }
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(normalized, 'base64'));
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function parseBase64Input(input) {
  const raw = String(input ?? '').trim();
  const match = raw.match(/^data:([^;,]+(?:;[^,]+)*);base64,(.*)$/is);
  const isDataUri = Boolean(match);
  const mimeType = match?.[1] ?? '';
  const body = isDataUri ? match[2] : raw;
  const compact = body.replace(/\s+/g, '');
  if (!compact) throw new Error('Base64 内容不能为空');
  const urlSafe = /[-_]/.test(compact);
  return {
    base64: normalizeBase64Text(compact),
    isDataUri,
    mimeType,
    urlSafe
  };
}

function normalizeBase64Text(input) {
  const text = String(input ?? '').replace(/\s+/g, '').replaceAll('-', '+').replaceAll('_', '/');
  const padding = (4 - (text.length % 4)) % 4;
  return `${text}${'='.repeat(padding)}`;
}

function applyBase64UrlSafe(base64, urlSafe) {
  if (!urlSafe) return base64;
  return base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function normalizeUrlCodecMode(mode) {
  return ['component', 'uri', 'form'].includes(mode) ? mode : 'component';
}

function buildUrlCodecData(input, output, mode, action) {
  return {
    input,
    output,
    mode,
    action,
    inputLength: input.length,
    outputLength: output.length,
    percentEscapes: countPercentEscapes(output),
    nonAscii: countNonAscii(action === 'decode' ? output : input),
    changed: input !== output
  };
}

function countPercentEscapes(value) {
  return (String(value).match(/%[0-9A-Fa-f]{2}/g) ?? []).length;
}

function countNonAscii(value) {
  return Array.from(String(value)).filter((char) => char.charCodeAt(0) > 127).length;
}

function formatTimestampResult(date, inputUnit) {
  const millisecondsValue = date.getTime();
  const secondsValue = Math.floor(millisecondsValue / 1000);
  const localText = date.toLocaleString();
  const isoText = date.toISOString();
  return {
    ok: true,
    data: {
      milliseconds: millisecondsValue,
      seconds: secondsValue,
      iso: isoText,
      local: localText,
      utc: date.toUTCString(),
      inputUnit,
      timezoneOffsetMinutes: date.getTimezoneOffset()
    },
    value: [
      `毫秒时间戳: ${millisecondsValue}`,
      `秒级时间戳: ${secondsValue}`,
      `本地时间: ${localText}`,
      `ISO 时间: ${isoText}`
    ].join('\n')
  };
}

function normalizeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function guardJsonInputSize(input) {
  const length = String(input ?? '').length;
  if (length <= JSON_INPUT_CHAR_LIMIT) return { ok: true };

  return {
    ok: false,
    error: `JSON 内容过大：当前约 ${formatCharCount(length)}，桌面 UI 安全上限为 ${formatCharCount(JSON_INPUT_CHAR_LIMIT)}。请使用文件流式处理模式。`
  };
}

function formatCharCount(length) {
  if (length >= 100_000_000) return `${(length / 100_000_000).toFixed(1)} 亿字符`;
  if (length >= 10_000) return `${(length / 10_000).toFixed(1)} 万字符`;
  return `${length} 字符`;
}

function parseJsonPath(path) {
  const value = String(path ?? '').trim();
  if (!value) throw new Error('请输入 JSON Path，例如 $.data.items[0]');
  if (value[0] !== '$') throw new Error('JSON Path 必须以 $ 开头');

  const tokens = [];
  let index = 1;
  while (index < value.length) {
    const char = value[index];
    if (char === '.') {
      const nextIndex = readDotPath(value, index + 1);
      const key = value.slice(index + 1, nextIndex);
      if (!key) throw new Error('点号后需要属性名');
      tokens.push({ type: 'key', key });
      index = nextIndex;
      continue;
    }

    if (char === '[') {
      const endIndex = findBracketEnd(value, index);
      const raw = value.slice(index + 1, endIndex).trim();
      tokens.push(parseBracketToken(raw));
      index = endIndex + 1;
      continue;
    }

    throw new Error(`无法解析 JSON Path：${value.slice(index)}`);
  }

  return tokens;
}

function readDotPath(value, index) {
  let nextIndex = index;
  while (nextIndex < value.length && value[nextIndex] !== '.' && value[nextIndex] !== '[') {
    nextIndex += 1;
  }
  return nextIndex;
}

function findBracketEnd(value, startIndex) {
  let quote = '';
  for (let index = startIndex + 1; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];
    if (quote) {
      if (char === quote && previous !== '\\') quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ']') return index;
  }
  throw new Error('JSON Path 缺少 ]');
}

function parseBracketToken(raw) {
  if (!raw) throw new Error('[] 内需要索引、属性名或 *');
  if (raw === '*') return { type: 'wildcard' };
  if (/^-?\d+$/.test(raw)) return { type: 'index', index: Number(raw) };
  const quote = raw[0];
  if ((quote === '"' || quote === "'") && raw.at(-1) === quote) {
    return { type: 'key', key: unescapeJsonPathString(raw.slice(1, -1), quote) };
  }
  throw new Error(`无法解析 [] 片段：${raw}`);
}

function unescapeJsonPathString(value, quote) {
  return value.replaceAll(`\\${quote}`, quote).replaceAll('\\\\', '\\');
}

function expandJsonPathToken(values, token) {
  const matches = [];
  values.forEach((value) => {
    if (token.type === 'key' && value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, token.key)) {
      matches.push(value[token.key]);
      return;
    }

    if (token.type === 'index' && Array.isArray(value)) {
      const index = token.index < 0 ? value.length + token.index : token.index;
      if (index >= 0 && index < value.length) matches.push(value[index]);
      return;
    }

    if (token.type === 'wildcard') {
      if (Array.isArray(value)) {
        matches.push(...value);
      } else if (value && typeof value === 'object') {
        matches.push(...Object.values(value));
      }
    }
  });
  return matches;
}

function stringifyDelimitedCell(value, delimiter) {
  const text = String(value ?? '');
  const needsQuote = text.includes(delimiter) || text.includes('"') || text.includes('\n') || text.includes('\r');
  if (!needsQuote) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function formatDelimitedValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function sortJsonValueKeys(value) {
  if (Array.isArray(value)) return value.map(sortJsonValueKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, sortJsonValueKeys(value[key])])
  );
}

function parseDelimitedRows(input, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
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
      continue;
    }

    if (char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (quoted) throw new Error('CSV/TSV 引号未闭合');
  row.push(cell);
  rows.push(row);
  return rows;
}

function parseDelimitedValue(value) {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null') return null;
  return value;
}

function normalizeJsonLinePreviewFields(fields) {
  return [...new Set((Array.isArray(fields) ? fields : String(fields ?? '').split(/[,\n]/)).map((field) => String(field || '').trim()).filter(Boolean))].slice(
    0,
    12
  );
}

function formatJsonLinePreviewValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function readJsonPathPreviewValue(value, pathExpression) {
  const segments = String(pathExpression ?? '')
    .split('.')
    .map((item) => item.trim())
    .filter(Boolean);
  if (segments.length === 0) return undefined;
  let current = value;
  for (const segment of segments) {
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
    } else if (typeof current === 'object') {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function csvPreviewEscape(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function visitJsonStats(value, depth, stats, limit, seen) {
  if (stats.truncated) return;
  stats.totalNodes += 1;
  stats.maxDepth = Math.max(stats.maxDepth, depth);
  if (stats.totalNodes > limit) {
    stats.truncated = true;
    return;
  }

  if (Array.isArray(value)) {
    stats.arrayCount += 1;
    if (seen.has(value)) return;
    seen.add(value);
    for (const item of value) {
      visitJsonStats(item, depth + 1, stats, limit, seen);
      if (stats.truncated) return;
    }
    return;
  }

  if (value && typeof value === 'object') {
    stats.objectCount += 1;
    if (seen.has(value)) return;
    seen.add(value);
    for (const item of Object.values(value)) {
      visitJsonStats(item, depth + 1, stats, limit, seen);
      if (stats.truncated) return;
    }
    return;
  }

  stats.primitiveCount += 1;
}

function stringifyWithCompactKeys(value, compactKeys, indentSize, depth, parentKey = '') {
  if (parentKey && compactKeys.has(parentKey)) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';

    const currentIndent = ' '.repeat(depth * indentSize);
    const nextIndent = ' '.repeat((depth + 1) * indentSize);
    const items = value.map((item) => `${nextIndent}${stringifyWithCompactKeys(item, compactKeys, indentSize, depth + 1)}`);
    return `[\n${items.join(',\n')}\n${currentIndent}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';

    const currentIndent = ' '.repeat(depth * indentSize);
    const nextIndent = ' '.repeat((depth + 1) * indentSize);
    const items = entries.map(([key, item]) => {
      const printed = stringifyWithCompactKeys(item, compactKeys, indentSize, depth + 1, key);
      return `${nextIndent}${JSON.stringify(key)}: ${printed}`;
    });
    return `{\n${items.join(',\n')}\n${currentIndent}}`;
  }

  return JSON.stringify(value);
}
