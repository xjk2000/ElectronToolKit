export function parseJwtData(token, now = new Date()) {
  const parts = String(token).trim().split('.');
  if (parts.length < 2) {
    return { ok: false, error: 'JWT 至少需要 Header.Payload 两段内容' };
  }

  try {
    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    const exp = typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : null;
    const expired = exp ? exp.getTime() <= now.getTime() : null;
    const analysis = {
      algorithm: header.alg ?? null,
      type: header.typ ?? null,
      issuedAt: typeof payload.iat === 'number' ? new Date(payload.iat * 1000).toISOString() : null,
      notBefore: typeof payload.nbf === 'number' ? new Date(payload.nbf * 1000).toISOString() : null,
      expiresAt: exp ? exp.toISOString() : null,
      expired
    };
    return {
      ok: true,
      data: {
        header,
        payload,
        analysis,
        segments: {
          header: parts[0] ?? '',
          payload: parts[1] ?? '',
          signature: parts[2] ?? ''
        }
      },
      value: JSON.stringify({ header, payload, analysis }, null, 2)
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function parseJwt(token, now = new Date()) {
  const result = parseJwtData(token, now);
  return result.ok ? { ok: true, value: result.value } : result;
}

export function parseInsertSql(sql) {
  const normalized = String(sql).trim().replace(/;$/, '');
  const match = normalized.match(/^insert\s+into\s+([`"\w.-]+)\s*\(([^)]+)\)\s*values\s*(.+)$/is);
  if (!match) {
    return { ok: false, error: '暂仅支持 INSERT INTO table (a,b) VALUES (...), (...) 这种结构' };
  }

  const table = stripQuote(match[1]);
  const columns = splitCsv(match[2]).map((item) => stripQuote(item.trim()));
  const rows = parseValueGroups(match[3]).map((group) => {
    const values = splitCsv(group).map(parseSqlValue);
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? null]));
  });

  return { ok: true, table, rows };
}

export function insertSqlToJson(sql) {
  const parsed = parseInsertSql(sql);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.rows, null, 2) };
}

export function buildElasticBulkFromRows(table, rows, indexName = table) {
  const index = String(indexName || table || '').trim();
  if (!index) return { ok: false, error: 'ES 索引名不能为空' };
  const lines = rows.flatMap((row) => [JSON.stringify({ index: { _index: index } }), JSON.stringify(row)]);
  return { ok: true, value: `${lines.join('\n')}\n` };
}

export function insertSqlToElasticBulk(sql) {
  const parsed = parseInsertSql(sql);
  if (!parsed.ok) return parsed;
  return buildElasticBulkFromRows(parsed.table, parsed.rows);
}

export function convertCurlToCode(input, target = 'fetch') {
  try {
    const parsed = parseCurlCommand(input);
    const mode = target === 'axios' ? 'axios' : 'fetch';
    return { ok: true, value: mode === 'axios' ? buildAxiosCode(parsed) : buildFetchCode(parsed) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function parseHttpHeaders(input) {
  const normalized = String(input ?? '').replace(/\u0000/g, '').trim();
  if (!normalized) return { ok: false, error: '请输入 HTTP 请求头或响应头文本' };

  const rawLines = normalized.split(/\r?\n/);
  let startLine = '';
  const rows = [];
  let current = null;

  rawLines.forEach((rawLine) => {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim()) return;
    if (/^\s/.test(line) && current) {
      current.value = `${current.value} ${line.trim()}`;
      current.raw = `${current.raw}\n${line}`;
      return;
    }
    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) {
      if (!startLine) startLine = line.trim();
      return;
    }
    current = {
      index: rows.length + 1,
      name: line.slice(0, colonIndex).trim(),
      value: line.slice(colonIndex + 1).trim(),
      raw: line
    };
    current.normalizedName = current.name.toLowerCase();
    current.category = headerCategory(current.normalizedName);
    current.sensitive = isSensitiveHeader(current.normalizedName);
    rows.push(current);
  });

  if (rows.length === 0) return { ok: false, error: '没有解析到有效 Header，格式应为 Key: Value' };

  const duplicateNames = headerDuplicateNames(rows);
  const object = buildHeadersObject(rows);
  const fetchObject = buildHeadersFetchObject(rows);
  const summary = {
    total: rows.length,
    duplicate: duplicateNames.length,
    cookie: rows.filter((row) => row.category === 'cookie').length,
    auth: rows.filter((row) => row.category === 'auth').length,
    cache: rows.filter((row) => row.category === 'cache').length,
    cors: rows.filter((row) => row.category === 'cors').length,
    security: rows.filter((row) => row.category === 'security').length,
    sensitive: rows.filter((row) => row.sensitive).length
  };

  const value = [
    startLine ? `Start-Line: ${startLine}` : 'HTTP Headers',
    `Header 数量: ${summary.total}`,
    `重复名称: ${summary.duplicate}`,
    `敏感字段: ${summary.sensitive}`,
    '',
    'fetch headers:',
    fetchObject,
    '',
    ...rows.map((row) => `${row.name}: ${row.sensitive ? maskHeaderValue(row.value) : row.value} [${row.category}]`)
  ].join('\n');

  return {
    ok: true,
    data: { startLine, rows, summary, duplicateNames, object, fetchObject },
    value
  };
}

export function buildHeadersObject(rows, { lowerCase = false } = {}) {
  const output = {};
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row?.name) return;
    const key = lowerCase ? row.name.toLowerCase() : row.name;
    if (Object.prototype.hasOwnProperty.call(output, key)) {
      output[key] = Array.isArray(output[key]) ? [...output[key], row.value ?? ''] : [output[key], row.value ?? ''];
    } else {
      output[key] = row.value ?? '';
    }
  });
  return output;
}

export function buildHeadersFetchObject(rows) {
  return JSON.stringify(buildHeadersObject(rows), null, 2);
}

export function parseUrl(input) {
  try {
    const url = new URL(String(input).trim());
    return {
      ok: true,
      value: url.toString(),
      data: {
        protocol: url.protocol.replace(':', ''),
        host: url.host,
        path: url.pathname,
        hash: url.hash.replace(/^#/, ''),
        params: Array.from(url.searchParams.entries()).map(([key, value]) => ({ key, value }))
      }
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function buildUrlFromParts({ protocol, host, path, hash, params }) {
  const baseProtocol = protocol ? `${protocol.replace(/:$/, '')}:` : 'https:';
  const normalizedPath = path?.startsWith('/') ? path : `/${path || ''}`;
  const url = new URL(`${baseProtocol}//${host || 'example.com'}${normalizedPath}`);
  params.forEach(({ key, value }) => {
    if (key) url.searchParams.append(key, value ?? '');
  });
  if (hash) url.hash = hash;
  return url.toString();
}

export function parseCookieHeader(input) {
  const normalized = normalizeCookieInput(input).replace(/^cookie\s*:\s*/i, '').trim();
  if (!normalized) return { ok: false, error: '请输入 Cookie Header，例如 sid=abc; theme=dark' };

  const rows = splitCookieParts(normalized)
    .map((part) => parseCookiePair(part))
    .filter(Boolean)
    .map((row, index) => ({ ...row, index: index + 1, source: 'Cookie' }));

  if (rows.length === 0) return { ok: false, error: '没有解析到有效的 Cookie 键值对' };
  return buildCookieParseResult('cookie', rows);
}

export function parseSetCookieHeaders(input, now = new Date()) {
  const lines = normalizeCookieInput(input)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^set-cookie\s*:\s*/i, ''));

  if (lines.length === 0) return { ok: false, error: '请输入 Set-Cookie 响应头，每行一个 Set-Cookie' };

  const rows = lines
    .map((line, index) => parseSetCookieLine(line, index + 1, now))
    .filter(Boolean);

  if (rows.length === 0) return { ok: false, error: '没有解析到有效的 Set-Cookie 内容' };
  return buildCookieParseResult('set-cookie', rows);
}

export function buildCookieHeader(rows, { prefix = false } = {}) {
  const text = (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.name)
    .map((row) => `${row.name}=${row.value ?? ''}`)
    .join('; ');
  return prefix && text ? `Cookie: ${text}` : text;
}

export function buildCronExpressionFromParts(parts) {
  return [
    normalizeCronField(parts.minute, '*'),
    normalizeCronField(parts.hour, '*'),
    normalizeCronField(parts.dayOfMonth, '*'),
    normalizeCronField(parts.month, '*'),
    normalizeCronField(parts.dayOfWeek, '*')
  ].join(' ');
}

export function parseCronExpressionFields(expression) {
  const fields = String(expression ?? '').trim().split(/\s+/).filter(Boolean);
  if (fields.length !== 5) {
    return { ok: false, error: '当前工具使用 5 段 Cron：分 时 日 月 周，例如 */5 * * * *' };
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  return {
    ok: true,
    data: { minute, hour, dayOfMonth, month, dayOfWeek },
    value: fields.join(' ')
  };
}

export function describeCronExpression(expression) {
  const parsed = parseCronExpressionFields(expression);
  if (!parsed.ok) return parsed;
  const { minute, hour, dayOfMonth, month, dayOfWeek } = parsed.data;
  if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return { ok: true, value: '每分钟执行' };
  }
  const minuteInterval = minute.match(/^\*\/(\d+)$/);
  if (minuteInterval && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return { ok: true, value: `每 ${minuteInterval[1]} 分钟执行` };
  }
  if (isSingleCronNumber(minute, 0, 59) && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return { ok: true, value: `每小时第 ${minute.padStart(2, '0')} 分执行` };
  }
  if (isSingleCronNumber(hour, 0, 23) && isSingleCronNumber(minute, 0, 59) && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return { ok: true, value: `每天 ${padCronTime(hour)}:${padCronTime(minute)} 执行` };
  }
  if (isSingleCronNumber(hour, 0, 23) && isSingleCronNumber(minute, 0, 59) && dayOfMonth === '*' && month === '*' && isSingleCronNumber(dayOfWeek, 0, 7)) {
    return { ok: true, value: `每周${cronWeekdayLabel(dayOfWeek)} ${padCronTime(hour)}:${padCronTime(minute)} 执行` };
  }
  if (isSingleCronNumber(hour, 0, 23) && isSingleCronNumber(minute, 0, 59) && isSingleCronNumber(dayOfMonth, 1, 31) && month === '*' && dayOfWeek === '*') {
    return { ok: true, value: `每月 ${dayOfMonth} 日 ${padCronTime(hour)}:${padCronTime(minute)} 执行` };
  }
  return { ok: true, value: `自定义规则：${parsed.value}` };
}

export function testRegex(input) {
  try {
    const { regex, text } = parseRegexInput(input);
    const matches = Array.from(text.matchAll(regex));
    return {
      ok: true,
      value: [
        `匹配数量: ${matches.length}`,
        '',
        ...matches.map((match, index) => `#${index + 1} [${match.index}] ${match[0]}`),
        '',
        '高亮预览:',
        text.replace(regex, (match) => `【${match}】`)
      ].join('\n')
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function regexTemplate(type) {
  const templates = {
    email: '/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/g\n\nuser@example.com test@toolkit.dev',
    phone: '/1[3-9]\\d{9}/g\n\n13800138000 19912345678',
    ip: '/\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b/g\n\n127.0.0.1 192.168.1.100'
  };
  return { ok: true, value: templates[type] ?? templates.email };
}

export function convertCase(input, action) {
  const text = String(input);
  if (action === 'lower') return text.toLowerCase();
  if (action === 'upper') return text.toUpperCase();
  if (action === 'camel') return toWords(text).map((word, index) => (index === 0 ? word : capitalize(word))).join('');
  if (action === 'snake') return toWords(text).join('_');
  if (action === 'kebab') return toWords(text).join('-');
  if (action === 'constant') return toWords(text).join('_').toUpperCase();
  if (action === 'trim') return text.split('\n').map((line) => line.trim()).filter(Boolean).join('\n');
  if (action === 'dedupe') return Array.from(new Set(text.split(/\r?\n/))).join('\n');
  if (action === 'sort') return text.split(/\r?\n/).sort((a, b) => a.localeCompare(b, 'zh-CN')).join('\n');
  return text;
}

export function generateMock(action, { count = 5, length = 8 } = {}) {
  const rowCount = clampInteger(Number(count), 1, 200);
  const stringLength = clampInteger(Number(length), 1, 128);
  const rows = Array.from({ length: rowCount }, () => {
    if (action === 'uuid') return crypto.randomUUID();
    if (action === 'phone') return randomPhone();
    if (action === 'idcard') return randomChineseIdCard();
    if (action === 'name') return randomChineseName();
    if (action === 'email') return `${randomString(8).toLowerCase()}@example.com`;
    return randomString(stringLength);
  });
  return rows.join('\n');
}

export function formatUuidValue(value, { uppercase = false, hyphenated = true, prefix = '' } = {}) {
  const cleaned = String(value ?? '').trim().replace(/[{}]/g, '');
  const normalized = cleaned.replaceAll('-', '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(normalized)) {
    return { ok: false, error: 'UUID 格式不合法' };
  }
  const hyphenatedValue = `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
  const raw = hyphenated ? hyphenatedValue : normalized;
  const formatted = uppercase ? raw.toUpperCase() : raw;
  return { ok: true, value: `${prefix || ''}${formatted}` };
}

export function formatUuidList(values, options = {}) {
  const rows = (Array.isArray(values) ? values : [])
    .map((value) => formatUuidValue(value, options))
    .filter((result) => result.ok)
    .map((result) => result.value);
  return {
    ok: rows.length > 0,
    value: rows.join('\n'),
    data: { rows, count: rows.length },
    error: rows.length > 0 ? '' : '没有可格式化的 UUID'
  };
}

export function parseRsaKeyPairPem(value) {
  const pem = String(value ?? '').trim();
  const publicMatch = pem.match(/-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/);
  const privateMatch = pem.match(/-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+?-----END (RSA )?PRIVATE KEY-----/);
  if (!publicMatch || !privateMatch) {
    return { ok: false, error: '没有识别到完整的 RSA 公钥和私钥 PEM' };
  }
  const publicKey = publicMatch[0].trim();
  const privateKey = privateMatch[0].trim();
  const privateType = privateKey.includes('BEGIN RSA PRIVATE KEY') ? 'pkcs1' : 'pkcs8';
  return {
    ok: true,
    value: `${publicKey}\n\n${privateKey}`,
    data: {
      publicKey,
      privateKey,
      privateType,
      publicLineCount: publicKey.split(/\r?\n/).length,
      privateLineCount: privateKey.split(/\r?\n/).length
    }
  };
}

export function describeHexDigest(hexValue) {
  const hex = String(hexValue ?? '').trim().replace(/\s+/g, '').toLowerCase();
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) {
    return { ok: false, error: '摘要必须是偶数长度的 Hex 字符串' };
  }
  const bytes = [];
  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  const binary = String.fromCharCode(...bytes);
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : globalThis.Buffer?.from(bytes).toString('base64') ?? '';
  return {
    ok: true,
    value: hex,
    data: {
      hex,
      base64,
      byteLength: bytes.length,
      bitLength: bytes.length * 8
    }
  };
}

export function describeHmacDigest(hexValue) {
  return describeHexDigest(hexValue);
}

export function parseColor(input) {
  const value = String(input).trim();
  let rgba;
  if (/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) {
    rgba = hexToRgba(value);
  } else {
    const match = value.match(/^rgba?\(([^)]+)\)$/i);
    if (!match) return { ok: false, error: '请输入 Hex、RGB 或 RGBA，例如 #FF5733 或 rgba(255,87,51,0.8)' };
    const parts = match[1].split(',').map((item) => item.trim());
    rgba = {
      r: clampColor(parts[0]),
      g: clampColor(parts[1]),
      b: clampColor(parts[2]),
      a: parts[3] === undefined ? 1 : Math.max(0, Math.min(1, Number(parts[3])))
    };
  }
  return { ok: true, data: colorFormats(rgba), value: JSON.stringify(colorFormats(rgba), null, 2) };
}

export function colorFormats({ r, g, b, a = 1 }) {
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  const alphaHex = toHex(Math.round(a * 255)).toUpperCase();
  return {
    hex,
    hexa: `${hex}${alphaHex}`,
    rgb: `rgb(${r}, ${g}, ${b})`,
    rgba: `rgba(${r}, ${g}, ${b}, ${trimNumber(a)})`,
    cssVar: `--color: ${hex};`,
    r,
    g,
    b,
    a
  };
}

export function countTextInfo(input) {
  const text = String(input ?? '');
  const lines = text ? text.split(/\r\n|\r|\n/).length : 0;
  const chinese = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const digits = (text.match(/\d/g) ?? []).length;
  const spaces = (text.match(/[ \t]/g) ?? []).length;
  const words = (text.match(/[A-Za-z0-9_]+/g) ?? []).length;
  return {
    ok: true,
    data: { total: text.length, lines, chinese, letters, digits, spaces, words },
    value: JSON.stringify({ total: text.length, lines, chinese, letters, digits, spaces, words }, null, 2)
  };
}

export function extractTextPatterns(input, types = ['url', 'email', 'phone', 'ipv4', 'uuid', 'idcard']) {
  const text = String(input ?? '');
  const selectedTypes = Array.from(new Set((Array.isArray(types) ? types : String(types).split(',')).map((type) => String(type).trim()).filter(Boolean)));
  const groups = selectedTypes
    .map((type) => extractPatternGroup(text, type))
    .filter(Boolean);
  const total = groups.reduce((sum, group) => sum + group.matches.length, 0);
  return {
    ok: true,
    data: { groups, total },
    value: groups
      .flatMap((group) => [
        `# ${group.label} (${group.matches.length})`,
        ...group.matches.map((match) => `${match.value}\tL${match.line}:C${match.column}`)
      ])
      .join('\n')
  };
}

export function diffLines(leftInput, rightInput, { ignoreWhitespace = false, maxCells = 300_000 } = {}) {
  const leftLines = splitDiffLines(leftInput);
  const rightLines = splitDiffLines(rightInput);
  const cellCount = leftLines.length * rightLines.length;
  if (cellCount > maxCells) {
    return {
      ok: false,
      error: `文本过大：${leftLines.length} × ${rightLines.length} 行会产生 ${cellCount.toLocaleString()} 个比较单元，请缩小范围后再对比。`
    };
  }

  const normalize = (line) => (ignoreWhitespace ? line.trim().replace(/\s+/g, ' ') : line);
  const leftKeys = leftLines.map(normalize);
  const rightKeys = rightLines.map(normalize);
  const table = Array.from({ length: leftLines.length + 1 }, () => Array(rightLines.length + 1).fill(0));

  for (let leftIndex = leftLines.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightLines.length - 1; rightIndex >= 0; rightIndex -= 1) {
      table[leftIndex][rightIndex] =
        leftKeys[leftIndex] === rightKeys[rightIndex]
          ? table[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(table[leftIndex + 1][rightIndex], table[leftIndex][rightIndex + 1]);
    }
  }

  const rows = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftLines.length || rightIndex < rightLines.length) {
    if (leftIndex < leftLines.length && rightIndex < rightLines.length && leftKeys[leftIndex] === rightKeys[rightIndex]) {
      rows.push({ type: 'equal', leftLine: leftIndex + 1, rightLine: rightIndex + 1, text: leftLines[leftIndex] });
      leftIndex += 1;
      rightIndex += 1;
    } else if (rightIndex < rightLines.length && (leftIndex === leftLines.length || table[leftIndex][rightIndex + 1] >= table[leftIndex + 1][rightIndex])) {
      rows.push({ type: 'add', leftLine: '', rightLine: rightIndex + 1, text: rightLines[rightIndex] });
      rightIndex += 1;
    } else {
      rows.push({ type: 'remove', leftLine: leftIndex + 1, rightLine: '', text: leftLines[leftIndex] });
      leftIndex += 1;
    }
  }

  const added = rows.filter((row) => row.type === 'add').length;
  const removed = rows.filter((row) => row.type === 'remove').length;
  const equal = rows.filter((row) => row.type === 'equal').length;
  return {
    ok: true,
    data: { rows, summary: { added, removed, equal, leftLines: leftLines.length, rightLines: rightLines.length } },
    value: rows.map((row) => `${row.type === 'add' ? '+' : row.type === 'remove' ? '-' : ' '} ${row.text}`).join('\n')
  };
}

export function convertHtmlEntity(input, action) {
  const text = String(input ?? '');
  if (action === 'decode') {
    return {
      ok: true,
      value: text
        .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => HTML_ENTITIES[name] ?? _)
    };
  }
  return {
    ok: true,
    value: text.replace(/[&<>"'\u00a0]/g, (char) => HTML_ENTITY_REVERSE[char] ?? char)
  };
}

function splitDiffLines(input) {
  const text = String(input ?? '');
  return text ? text.split(/\r\n|\r|\n/) : [];
}

export function convertBaseNumber(input, { fromBase = '10', toBase = '16' } = {}) {
  try {
    const value = parseBaseInt(String(input).trim(), Number(fromBase));
    return { ok: true, value: value.toString(Number(toBase)).toUpperCase() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function convertBaseNumberDetails(input, { fromBase = '10', bases = ['2', '8', '10', '16', '32', '36'] } = {}) {
  try {
    const source = String(input).trim();
    const parsedBase = Number(fromBase);
    const value = parseBaseInt(source, parsedBase);
    const uniqueBases = [...new Set(bases.map((base) => Number(base)).filter((base) => Number.isInteger(base) && base >= 2 && base <= 36))];
    const rows = uniqueBases.map((base) => {
      const converted = value.toString(base).toUpperCase();
      return {
        base,
        label: `${base} 进制`,
        prefix: getBasePrefix(base),
        value: converted,
        prefixedValue: `${getBasePrefix(base)}${converted}`,
        digits: converted.length
      };
    });
    const binary = value.toString(2);
    return {
      ok: true,
      value: rows.find((row) => row.base === 10)?.value ?? value.toString(10),
      data: {
        source,
        fromBase: parsedBase,
        decimal: value.toString(10),
        bitLength: value === 0n ? 0 : binary.length,
        byteLength: value === 0n ? 0 : Math.ceil(binary.length / 8),
        rows
      }
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function convertHexString(input, action) {
  try {
    if (action === 'decode') {
      const clean = String(input).replace(/(?:0x|\\x|\s|,)/gi, '');
      if (clean.length % 2 !== 0 || /[^\da-f]/i.test(clean)) throw new Error('请输入偶数长度的 Hex 字符串');
      const bytes = Uint8Array.from(clean.match(/.{2}/g).map((hex) => parseInt(hex, 16)));
      return { ok: true, value: new TextDecoder().decode(bytes) };
    }
    const bytes = new TextEncoder().encode(String(input));
    return { ok: true, value: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ').toUpperCase() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function convertDownloadLink(input, action) {
  const text = String(input).trim();
  if (action === 'thunder-encode') {
    return { ok: true, value: `thunder://${encodeBase64Text(`AA${text}ZZ`)}` };
  }
  if (action === 'thunder-decode') {
    const payload = text.replace(/^thunder:\/\//i, '');
    const decoded = decodeBase64Text(payload);
    return { ok: true, value: decoded.replace(/^AA/, '').replace(/ZZ$/, '') };
  }
  if (action === 'flashget-encode') {
    return { ok: true, value: `Flashget://${encodeBase64Text(`[FLASHGET]${text}[FLASHGET]`)}` };
  }
  if (action === 'flashget-decode') {
    const payload = text.replace(/^flashget:\/\//i, '');
    return { ok: true, value: decodeBase64Text(payload).replace(/^\[FLASHGET\]/, '').replace(/\[FLASHGET\]$/, '') };
  }
  return { ok: true, value: text };
}

export function convertMorse(input, action) {
  const text = String(input ?? '');
  if (action === 'decode') {
    const reverse = Object.fromEntries(Object.entries(MORSE_CODE).map(([key, value]) => [value, key]));
    return {
      ok: true,
      value: text
        .trim()
        .split(/\s*\/\s*|\s{3,}/)
        .map((word) => word.split(/\s+/).map((code) => reverse[code] ?? '').join(''))
        .join(' ')
    };
  }
  return {
    ok: true,
    value: text
      .toUpperCase()
      .split(/\s+/)
      .map((word) => word.split('').map((char) => MORSE_CODE[char] ?? '').filter(Boolean).join(' '))
      .join(' / ')
  };
}

export function calculateCidr(input) {
  const result = calculateCidrDetails(input);
  if (!result.ok) return result;
  const data = result.data;
  return {
    ok: true,
    value: [
      `IP: ${data.ip}`,
      `前缀: /${data.prefix}`,
      `子网掩码: ${data.mask}`,
      `网络地址: ${data.network}`,
      `广播地址: ${data.broadcast}`,
      `可用范围: ${data.firstHost} - ${data.lastHost}`,
      `地址总数: ${data.total}`,
      `可用主机数: ${data.usableHosts}`
    ].join('\n'),
    data
  };
}

export function calculateCidrDetails(input) {
  try {
    const match = String(input).trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/);
    if (!match) throw new Error('请输入 IPv4 CIDR，例如 192.168.1.10/24');
    const ip = ipv4ToInt(match[1]);
    const prefix = Number(match[2]);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = ip & mask;
    const broadcast = network | (~mask >>> 0);
    const first = prefix >= 31 ? network : network + 1;
    const last = prefix >= 31 ? broadcast : broadcast - 1;
    const total = 2 ** (32 - prefix);
    const usableHosts = prefix >= 31 ? total : Math.max(0, total - 2);
    return {
      ok: true,
      value: `${intToIpv4(network)}/${prefix}`,
      data: {
        cidr: `${intToIpv4(ip)}/${prefix}`,
        ip: intToIpv4(ip),
        prefix,
        mask: intToIpv4(mask),
        network: intToIpv4(network),
        broadcast: intToIpv4(broadcast),
        firstHost: intToIpv4(first),
        lastHost: intToIpv4(last),
        hostRange: `${intToIpv4(first)} - ${intToIpv4(last)}`,
        total,
        usableHosts,
        wildcardMask: intToIpv4(~mask >>> 0),
        networkCidr: `${intToIpv4(network)}/${prefix}`
      }
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function calculateDate(input, action, { days = '7' } = {}) {
  try {
    const lines = String(input).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const baseDate = lines[0] || new Date().toISOString().slice(0, 10);
    if (action === 'diff') {
      const targetDate = lines[1] || new Date().toISOString().slice(0, 10);
      const details = calculateDateDetails({ mode: 'diff', baseDate, targetDate });
      if (!details.ok) return details;
      return {
        ok: true,
        value: `${details.data.baseDate} 到 ${details.data.targetDate} 相差 ${details.data.absoluteDays} 天${details.data.reverse ? '（反向）' : ''}`
      };
    }
    const details = calculateDateDetails({ mode: 'offset', baseDate, days, direction: action === 'subtract' ? 'subtract' : 'add' });
    if (!details.ok) return details;
    return { ok: true, value: `${details.data.baseDate} ${details.data.signedDays >= 0 ? '+' : ''}${details.data.signedDays} 天 = ${details.data.resultDate}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function calculateDateDetails({ mode = 'offset', baseDate = '', targetDate = '', days = '7', direction = 'add' } = {}) {
  try {
    const today = formatDateOnly(new Date());
    const start = parseDateOnly(baseDate || today);
    if (mode === 'diff') {
      const end = parseDateOnly(targetDate || today);
      const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000);
      return {
        ok: true,
        value: `${Math.abs(diffDays)} 天`,
        data: {
          mode: 'diff',
          baseDate: formatDateOnly(start),
          targetDate: formatDateOnly(end),
          baseWeekday: formatWeekday(start),
          targetWeekday: formatWeekday(end),
          diffDays,
          absoluteDays: Math.abs(diffDays),
          reverse: diffDays < 0,
          weeks: Math.floor(Math.abs(diffDays) / 7),
          restDays: Math.abs(diffDays) % 7
        }
      };
    }

    const rawDays = Math.trunc(Number(days) || 0);
    const signedDays = rawDays * (direction === 'subtract' ? -1 : 1);
    const result = new Date(start.getTime() + signedDays * 86400000);
    return {
      ok: true,
      value: formatDateOnly(result),
      data: {
        mode: 'offset',
        baseDate: formatDateOnly(start),
        resultDate: formatDateOnly(result),
        baseWeekday: formatWeekday(start),
        resultWeekday: formatWeekday(result),
        days: Math.abs(rawDays),
        signedDays,
        direction: signedDays < 0 ? 'subtract' : 'add',
        weeks: Math.floor(Math.abs(rawDays) / 7),
        restDays: Math.abs(rawDays) % 7
      }
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function convertUnit(input, { fromUnit = 'm', toUnit = 'km' } = {}) {
  try {
    const value = Number(String(input).trim());
    if (Number.isNaN(value)) throw new Error('请输入数字');
    const from = UNIT_DEFS[fromUnit];
    const to = UNIT_DEFS[toUnit];
    if (!from || !to || from.type !== to.type) throw new Error('请选择同一类型的单位');
    let result;
    if (from.type === 'temperature') {
      result = to.fromBase(from.toBase(value));
    } else {
      result = (value * from.factor) / to.factor;
    }
    return { ok: true, value: `${trimFloat(value)} ${from.label} = ${trimFloat(result)} ${to.label}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function lookupHttpStatus(input) {
  const code = String(input).trim();
  const text = HTTP_STATUS[code];
  if (!text) return { ok: false, error: '未找到该 HTTP 状态码' };
  return { ok: true, value: `${code} ${text}` };
}

export function numberToChineseUpper(input) {
  try {
    const amount = Number(String(input).replace(/,/g, '').trim());
    if (!Number.isFinite(amount) || amount < 0 || amount >= 1000000000000) throw new Error('请输入 0 到 999999999999.99 之间的数字');
    return { ok: true, value: toChineseMoney(amount) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function calculatePersonalTax({
  policyName = '地方政策参数',
  monthlyIncome = '20000',
  months = '12',
  socialInsurance = '0',
  socialMinBase = '0',
  socialMaxBase = '0',
  housingMinBase = '0',
  housingMaxBase = '0',
  socialBase = '',
  housingBase = '',
  pensionRate = '8',
  medicalRate = '2',
  unemploymentRate = '0.5',
  housingFundRate = '7',
  specialDeduction = '0',
  otherDeduction = '0',
  paidTax = '0'
} = {}) {
  const monthCount = clampInteger(months, 1, 12);
  const monthlySalary = positiveNumber(monthlyIncome);
  const income = monthlySalary * monthCount;
  const basicDeduction = 5000 * monthCount;
  const resolvedSocialBase = resolveContributionBase(socialBase, monthlySalary, socialMinBase, socialMaxBase);
  const resolvedHousingBase = resolveContributionBase(housingBase, monthlySalary, housingMinBase, housingMaxBase);
  const pension = resolvedSocialBase * percentToRate(pensionRate);
  const medical = resolvedSocialBase * percentToRate(medicalRate);
  const unemployment = resolvedSocialBase * percentToRate(unemploymentRate);
  const housingFund = resolvedHousingBase * percentToRate(housingFundRate);
  const manualSocial = positiveNumber(socialInsurance);
  const monthlyPolicyDeduction = pension + medical + unemployment + housingFund;
  const monthlySocial = monthlyPolicyDeduction + manualSocial;
  const social = monthlySocial * monthCount;
  const special = positiveNumber(specialDeduction) * monthCount;
  const other = positiveNumber(otherDeduction) * monthCount;
  const paid = positiveNumber(paidTax);
  const taxable = Math.max(0, income - basicDeduction - social - special - other);
  const bracket = findTaxBracket(taxable);
  const cumulativeTax = Math.max(0, taxable * bracket.rate - bracket.quick);
  const currentTax = Math.max(0, cumulativeTax - paid);
  const netIncome = income - cumulativeTax - social;

  return {
    ok: true,
    data: {
      months: monthCount,
      income,
      basicDeduction,
      social,
      special,
      other,
      policyName: String(policyName || '地方政策参数').trim(),
      monthlySalary,
      socialBase: resolvedSocialBase,
      housingBase: resolvedHousingBase,
      monthlyPolicyDeduction,
      manualSocial,
      monthlySocial,
      contributionItems: {
        pension,
        medical,
        unemployment,
        housingFund
      },
      taxable,
      rate: bracket.rate,
      quick: bracket.quick,
      cumulativeTax,
      paid,
      currentTax,
      netIncome
    },
    value: [
      `累计收入: ${formatMoney(income)}`,
      `累计减除费用: ${formatMoney(basicDeduction)}`,
      `累计专项扣除: ${formatMoney(social)}`,
      `月社保公积金扣除: ${formatMoney(monthlyPolicyDeduction)}`,
      `累计专项附加/其他扣除: ${formatMoney(special + other)}`,
      `累计应纳税所得额: ${formatMoney(taxable)}`,
      `适用税率: ${trimFloat(bracket.rate * 100)}%`,
      `速算扣除数: ${formatMoney(bracket.quick)}`,
      `累计应预扣预缴税额: ${formatMoney(cumulativeTax)}`,
      `本期应补扣税额: ${formatMoney(currentTax)}`
    ].join('\n')
  };
}

export function calculateLoan({ principalWan = '100', years = '30', annualRate = '3.5', method = 'equal-payment' } = {}) {
  const principal = positiveNumber(principalWan) * 10000;
  const monthCount = clampInteger(Number(years) * 12, 1, 600);
  const monthlyRate = positiveNumber(annualRate) / 100 / 12;
  if (principal <= 0) return { ok: false, error: '贷款金额必须大于 0' };

  if (method === 'equal-principal') {
    const monthlyPrincipal = principal / monthCount;
    const schedule = Array.from({ length: monthCount }, (_, index) => {
      const remaining = principal - monthlyPrincipal * index;
      const interest = remaining * monthlyRate;
      return {
        month: index + 1,
        payment: monthlyPrincipal + interest,
        principal: monthlyPrincipal,
        interest,
        remaining: Math.max(0, remaining - monthlyPrincipal)
      };
    });
    const totalPayment = schedule.reduce((total, item) => total + item.payment, 0);
    return loanResult('等额本金', principal, monthCount, monthlyRate, totalPayment, schedule);
  }

  const monthlyPayment =
    monthlyRate === 0
      ? principal / monthCount
      : (principal * monthlyRate * (1 + monthlyRate) ** monthCount) / ((1 + monthlyRate) ** monthCount - 1);
  let remaining = principal;
  const schedule = Array.from({ length: monthCount }, (_, index) => {
    const interest = remaining * monthlyRate;
    const principalPart = monthlyPayment - interest;
    remaining = Math.max(0, remaining - principalPart);
    return {
      month: index + 1,
      payment: monthlyPayment,
      principal: principalPart,
      interest,
      remaining
    };
  });
  return loanResult('等额本息', principal, monthCount, monthlyRate, monthlyPayment * monthCount, schedule);
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function splitCsv(input) {
  const items = [];
  let current = '';
  let quote = '';
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      current += char;
      if (char === quote && input[index - 1] !== '\\') quote = '';
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ',') {
      items.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current) items.push(current.trim());
  return items;
}

function parseValueGroups(input) {
  const groups = [];
  let depth = 0;
  let current = '';
  let quote = '';
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      current += char;
      if (char === quote && input[index - 1] !== '\\') quote = '';
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') {
      if (depth > 0) current += char;
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        groups.push(current);
        current = '';
      } else {
        current += char;
      }
      continue;
    }
    if (depth > 0) current += char;
  }
  return groups;
}

function parseSqlValue(value) {
  const trimmed = value.trim();
  if (/^null$/i.test(trimmed)) return null;
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^'(.*)'$/s, '$1').replace(/^"(.*)"$/s, '$1').replace(/\\'/g, "'");
}

const TEXT_EXTRACT_PATTERN_CONFIG = {
  url: {
    label: 'URL',
    regex: /\bhttps?:\/\/[^\s<>"'`，。；、)）\]}]+/gi
  },
  email: {
    label: '邮箱',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
  },
  phone: {
    label: '手机号',
    regex: /(?:^|[^\d])(1[3-9]\d{9})(?!\d)/g,
    groupIndex: 1
  },
  ipv4: {
    label: 'IPv4',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    validate: (value) => value.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255)
  },
  uuid: {
    label: 'UUID',
    regex: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
  },
  idcard: {
    label: '身份证',
    regex: /\b\d{17}[\dXx]\b/g,
    validate: isValidChineseIdCard
  }
};

function extractPatternGroup(text, type) {
  const config = TEXT_EXTRACT_PATTERN_CONFIG[type];
  if (!config) return null;
  const matches = [];
  const seen = new Set();
  for (const match of text.matchAll(config.regex)) {
    const rawValue = match[config.groupIndex ?? 0] ?? match[0];
    const value = String(rawValue).replace(/[),.;:，。；：]+$/g, '');
    if (!value || seen.has(value)) continue;
    if (config.validate && !config.validate(value)) continue;
    seen.add(value);
    const index = Math.max(0, (match.index ?? 0) + String(match[0]).indexOf(rawValue));
    const position = textPositionAt(text, index);
    matches.push({ value, index, ...position });
    if (matches.length >= 1000) break;
  }
  return { type, label: config.label, matches };
}

function textPositionAt(text, index) {
  let line = 1;
  let lineStart = 0;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text[cursor] === '\n') {
      line += 1;
      lineStart = cursor + 1;
    }
  }
  return { line, column: index - lineStart + 1 };
}

function isValidChineseIdCard(value) {
  const normalized = String(value).toUpperCase();
  if (!/^\d{17}[\dX]$/.test(normalized)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const sum = weights.reduce((total, weight, index) => total + Number(normalized[index]) * weight, 0);
  return codes[sum % 11] === normalized[17];
}

function parseCurlCommand(input) {
  const tokens = tokenizeShellLike(input);
  if (tokens.length === 0 || tokens[0] !== 'curl') throw new Error('请输入以 curl 开头的命令');
  const headers = {};
  const bodyParts = [];
  let method = '';
  let url = '';

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '-X' || token === '--request') {
      method = String(tokens[++index] ?? '').toUpperCase();
      continue;
    }
    if (token.startsWith('-X') && token.length > 2) {
      method = token.slice(2).toUpperCase();
      continue;
    }
    if (token === '-H' || token === '--header') {
      addCurlHeader(headers, tokens[++index] ?? '');
      continue;
    }
    if (token.startsWith('-H') && token.length > 2) {
      addCurlHeader(headers, token.slice(2));
      continue;
    }
    if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--form'].includes(token)) {
      bodyParts.push(tokens[++index] ?? '');
      continue;
    }
    if (token.startsWith('--data=') || token.startsWith('--data-raw=') || token.startsWith('--data-binary=') || token.startsWith('--data-ascii=')) {
      bodyParts.push(token.slice(token.indexOf('=') + 1));
      continue;
    }
    if (token === '--url') {
      url = tokens[++index] ?? '';
      continue;
    }
    if (!token.startsWith('-') && !url) url = token;
  }

  if (!url) throw new Error('没有解析到 URL');
  const body = bodyParts.join('&');
  return { url, method: method || (body ? 'POST' : 'GET'), headers, body };
}

function tokenizeShellLike(input) {
  const tokens = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (const char of String(input ?? '').trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (escaped) current += '\\';
  if (quote) throw new Error('cURL 命令存在未闭合引号');
  if (current) tokens.push(current);
  return tokens;
}

function addCurlHeader(headers, rawHeader) {
  const header = String(rawHeader ?? '');
  const separatorIndex = header.indexOf(':');
  if (separatorIndex <= 0) return;
  const key = header.slice(0, separatorIndex).trim();
  const value = header.slice(separatorIndex + 1).trim();
  if (key) headers[key] = value;
}

function buildFetchCode({ url, method, headers, body }) {
  const options = {
    method,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(body ? { body: formatJavaScriptRequestBody(body) } : {})
  };
  return [
    `const response = await fetch(${JSON.stringify(url)}, ${formatJavaScriptLiteral(options, 0)});`,
    '',
    'const data = await response.json();',
    'console.log(data);'
  ].join('\n');
}

function buildAxiosCode({ url, method, headers, body }) {
  const options = {
    method: method.toLowerCase(),
    url,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(body ? { data: formatJavaScriptRequestData(body) } : {})
  };
  return [`const response = await axios(${formatJavaScriptLiteral(options, 0)});`, '', 'console.log(response.data);'].join('\n');
}

function formatJavaScriptRequestBody(body) {
  const parsed = parseJsonBody(body);
  return parsed.ok ? `JSON.stringify(${formatJavaScriptLiteral(parsed.value, 4)})` : JSON.stringify(body);
}

function formatJavaScriptRequestData(body) {
  const parsed = parseJsonBody(body);
  return parsed.ok ? parsed.value : body;
}

function parseJsonBody(body) {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
}

function formatJavaScriptLiteral(value, depth = 0) {
  if (typeof value === 'string' && value.startsWith('JSON.stringify(')) return value;
  const indent = '  '.repeat(depth);
  const childIndent = '  '.repeat(depth + 1);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return `{\n${entries.map(([key, item]) => `${childIndent}${JSON.stringify(key)}: ${formatJavaScriptLiteral(item, depth + 1)}`).join(',\n')}\n${indent}}`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((item) => `${childIndent}${formatJavaScriptLiteral(item, depth + 1)}`).join(',\n')}\n${indent}]`;
  }
  return JSON.stringify(value);
}

function stripQuote(value) {
  return value.replace(/^[`"]|[`"]$/g, '');
}

function normalizeCronField(value, fallback) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function isSingleCronNumber(value, min, max) {
  if (!/^\d+$/.test(String(value))) return false;
  const number = Number(value);
  return number >= min && number <= max;
}

function padCronTime(value) {
  return String(value).padStart(2, '0');
}

function cronWeekdayLabel(value) {
  const normalized = Number(value) === 7 ? 0 : Number(value);
  return ['日', '一', '二', '三', '四', '五', '六'][normalized] ?? value;
}

function parseRegexInput(input) {
  const [firstLine, ...rest] = String(input).split(/\r?\n/);
  const match = firstLine.match(/^\/(.+)\/([dgimsuvy]*)$/);
  if (!match) throw new Error('第一行请输入 /pattern/flags，后面空一行放测试文本');
  const flags = match[2].includes('g') ? match[2] : `${match[2]}g`;
  return { regex: new RegExp(match[1], flags), text: rest.join('\n').replace(/^\n/, '') };
}

function toWords(input) {
  return String(input)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9\u4e00-\u9fa5]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function capitalize(word) {
  return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
}

function randomPhone() {
  return `1${randomFrom(['3', '5', '7', '8', '9'])}${randomDigits(9)}`;
}

function randomChineseName() {
  const surnames = '赵钱孙李周吴郑王冯陈刘杨黄张林';
  const names = '一二三四五六七八九子涵梓轩宇辰浩然欣怡';
  return `${randomFrom(surnames)}${randomFrom(names)}${Math.random() > 0.45 ? randomFrom(names) : ''}`;
}

function randomChineseIdCard() {
  const body = `110101${randomInt(1970, 2004)}${String(randomInt(1, 12)).padStart(2, '0')}${String(randomInt(1, 28)).padStart(2, '0')}${randomDigits(3)}`;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = '10X98765432';
  const sum = body.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
  return `${body}${codes[sum % 11]}`;
}

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => randomFrom(chars)).join('');
}

function randomDigits(length) {
  return Array.from({ length }, () => String(randomInt(0, 9))).join('');
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFrom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function hexToRgba(hex) {
  const raw = hex.slice(1);
  const expanded =
    raw.length === 3
      ? raw.split('').map((char) => `${char}${char}`).join('')
      : raw;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
    a: expanded.length === 8 ? Number((parseInt(expanded.slice(6, 8), 16) / 255).toFixed(3)) : 1
  };
}

function clampColor(value) {
  return Math.max(0, Math.min(255, Number(value) || 0));
}

function toHex(value) {
  return Math.round(value).toString(16).padStart(2, '0');
}

function trimNumber(value) {
  return Number(value.toFixed(3)).toString();
}

function parseBaseInt(value, base) {
  if (!Number.isInteger(base) || base < 2 || base > 36) throw new Error('进制范围必须在 2 到 36 之间');
  const normalized = value.replace(/^0[xob]/i, '').toLowerCase();
  if (!normalized) throw new Error('请输入数字');
  let result = 0n;
  for (const char of normalized) {
    const digit = BigInt(parseInt(char, 36));
    if (digit < 0n || digit >= BigInt(base) || Number.isNaN(Number(digit))) throw new Error(`数字 ${char} 超出 ${base} 进制范围`);
    result = result * BigInt(base) + digit;
  }
  return result;
}

function getBasePrefix(base) {
  if (base === 2) return '0b';
  if (base === 8) return '0o';
  if (base === 16) return '0x';
  return '';
}

function encodeBase64Text(value) {
  const bytes = new TextEncoder().encode(value);
  return btoa(String.fromCharCode(...bytes));
}

function decodeBase64Text(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) throw new Error('IPv4 地址不合法');
  return parts.reduce((total, part) => ((total << 8) | part) >>> 0, 0);
}

function intToIpv4(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

function headerCategory(name) {
  if (name === 'cookie' || name === 'set-cookie') return 'cookie';
  if (name === 'authorization' || name === 'proxy-authorization' || name === 'www-authenticate' || name === 'proxy-authenticate') return 'auth';
  if (name.startsWith('access-control-') || name === 'origin' || name === 'vary') return 'cors';
  if (name === 'cache-control' || name === 'pragma' || name === 'etag' || name === 'if-none-match' || name === 'last-modified' || name === 'expires') return 'cache';
  if (
    name === 'strict-transport-security' ||
    name === 'content-security-policy' ||
    name === 'x-frame-options' ||
    name === 'x-content-type-options' ||
    name === 'referrer-policy' ||
    name === 'permissions-policy' ||
    name === 'cross-origin-opener-policy' ||
    name === 'cross-origin-embedder-policy'
  ) {
    return 'security';
  }
  if (
    name === 'content-type' ||
    name === 'content-length' ||
    name === 'content-encoding' ||
    name === 'accept' ||
    name === 'accept-encoding' ||
    name === 'accept-language'
  ) {
    return 'content';
  }
  return 'custom';
}

function isSensitiveHeader(name) {
  return (
    name === 'authorization' ||
    name === 'proxy-authorization' ||
    name === 'cookie' ||
    name === 'set-cookie' ||
    name === 'x-api-key' ||
    name === 'x-auth-token'
  );
}

function headerDuplicateNames(rows) {
  const counts = new Map();
  rows.forEach((row) => counts.set(row.normalizedName, (counts.get(row.normalizedName) ?? 0) + 1));
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
}

function maskHeaderValue(value) {
  const text = String(value ?? '');
  if (text.length <= 8) return text ? '••••' : '';
  return `${text.slice(0, 4)}••••${text.slice(-4)}`;
}

function normalizeCookieInput(input) {
  return String(input ?? '').replace(/\u0000/g, '').trim();
}

function splitCookieParts(input) {
  const parts = [];
  let current = '';
  let quoted = false;
  for (const char of String(input)) {
    if (char === '"') quoted = !quoted;
    if (char === ';' && !quoted) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseCookiePair(part) {
  const index = part.indexOf('=');
  if (index <= 0) return null;
  const name = part.slice(0, index).trim();
  if (!name) return null;
  const value = unquoteCookieValue(part.slice(index + 1).trim());
  return {
    name,
    value,
    decodedValue: safeDecodeUriComponent(value),
    attributes: {},
    flags: [],
    maxAge: null,
    session: true,
    raw: part
  };
}

function parseSetCookieLine(line, index, now) {
  const parts = splitCookieParts(line);
  const pair = parseCookiePair(parts.shift() ?? '');
  if (!pair) return null;

  const attributes = {};
  const flags = [];
  parts.forEach((part) => {
    const equalIndex = part.indexOf('=');
    if (equalIndex === -1) {
      const flag = canonicalCookieAttribute(part);
      flags.push(flag);
      attributes[flag] = true;
      return;
    }
    const key = canonicalCookieAttribute(part.slice(0, equalIndex));
    const value = unquoteCookieValue(part.slice(equalIndex + 1).trim());
    attributes[key] = value;
  });

  const expiresAt = parseCookieExpires(attributes.Expires);
  const maxAge = attributes['Max-Age'] === undefined ? null : Number(attributes['Max-Age']);
  const expired =
    Number.isFinite(maxAge) && maxAge <= 0 ? true : expiresAt ? expiresAt.getTime() <= now.getTime() : false;

  return {
    ...pair,
    index,
    source: 'Set-Cookie',
    attributes,
    flags,
    domain: attributes.Domain ?? '',
    path: attributes.Path ?? '',
    expiresAt: expiresAt ? expiresAt.toISOString() : '',
    maxAge: Number.isFinite(maxAge) ? maxAge : null,
    sameSite: attributes.SameSite ?? '',
    secure: Boolean(attributes.Secure),
    httpOnly: Boolean(attributes.HttpOnly),
    partitioned: Boolean(attributes.Partitioned),
    expired,
    session: !expiresAt && !Number.isFinite(maxAge),
    raw: line
  };
}

function buildCookieParseResult(type, rows) {
  const rebuiltHeader = buildCookieHeader(rows);
  const summary = {
    total: rows.length,
    secure: rows.filter((row) => row.secure).length,
    httpOnly: rows.filter((row) => row.httpOnly).length,
    expired: rows.filter((row) => row.expired).length,
    session: rows.filter((row) => row.session || (!row.expiresAt && !Number.isFinite(row.maxAge))).length
  };
  const value = [
    type === 'set-cookie' ? 'Set-Cookie 解析结果' : 'Cookie Header 解析结果',
    `Cookie 数量: ${summary.total}`,
    `Secure: ${summary.secure}`,
    `HttpOnly: ${summary.httpOnly}`,
    `已过期: ${summary.expired}`,
    '',
    `Cookie: ${rebuiltHeader}`,
    '',
    ...rows.map((row) => {
      const details = [];
      if (row.domain) details.push(`Domain=${row.domain}`);
      if (row.path) details.push(`Path=${row.path}`);
      if (row.sameSite) details.push(`SameSite=${row.sameSite}`);
      if (row.expiresAt) details.push(`Expires=${row.expiresAt}`);
      if (row.secure) details.push('Secure');
      if (row.httpOnly) details.push('HttpOnly');
      return `${row.name}=${row.value}${details.length ? ` (${details.join('; ')})` : ''}`;
    })
  ].join('\n');

  return {
    ok: true,
    data: { type, rows, summary, rebuiltHeader },
    value
  };
}

function canonicalCookieAttribute(input) {
  const raw = String(input ?? '').trim();
  const normalized = raw.toLowerCase();
  const known = {
    domain: 'Domain',
    path: 'Path',
    expires: 'Expires',
    'max-age': 'Max-Age',
    samesite: 'SameSite',
    secure: 'Secure',
    httponly: 'HttpOnly',
    partitioned: 'Partitioned',
    priority: 'Priority'
  };
  return known[normalized] ?? raw;
}

function unquoteCookieValue(value) {
  const text = String(value ?? '');
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1);
  return text;
}

function safeDecodeUriComponent(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, '%20'));
  } catch {
    return String(value);
  }
}

function parseCookieExpires(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateOnly(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error('日期格式不合法，请输入 YYYY-MM-DD');
  return date;
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatWeekday(date) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
}

function trimFloat(value) {
  return Number(value.toFixed(10)).toString();
}

function toChineseMoney(amount) {
  const digitChars = '零壹贰叁肆伍陆柒捌玖';
  const intUnits = ['', '拾', '佰', '仟'];
  const sectionUnits = ['', '万', '亿'];
  const fixed = Math.round(amount * 100);
  const integer = Math.floor(fixed / 100);
  const jiao = Math.floor((fixed % 100) / 10);
  const fen = fixed % 10;

  if (integer === 0 && jiao === 0 && fen === 0) return '零元整';

  let integerText = '';
  if (integer === 0) {
    integerText = '零';
  } else {
    const sections = [];
    let remaining = integer;
    while (remaining > 0) {
      sections.push(remaining % 10000);
      remaining = Math.floor(remaining / 10000);
    }
    integerText = sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => section > 0)
      .reverse()
      .map(({ section, index }, order, array) => {
        const prefixZero = order > 0 && array[order - 1].section % 10 === 0 && section < 1000 ? '零' : '';
        return `${prefixZero}${sectionToChinese(section, digitChars, intUnits)}${sectionUnits[index]}`;
      })
      .join('')
      .replace(/零+/g, '零')
      .replace(/零$/g, '');
  }

  const decimalText = `${jiao ? `${digitChars[jiao]}角` : ''}${fen ? `${digitChars[fen]}分` : ''}`;
  return `${integerText}元${decimalText || '整'}`;
}

function sectionToChinese(section, digitChars, intUnits) {
  let text = '';
  let zero = false;
  for (let unitIndex = 0; unitIndex < 4; unitIndex += 1) {
    const digit = section % 10;
    if (digit === 0) {
      if (text) zero = true;
    } else {
      text = `${digitChars[digit]}${intUnits[unitIndex]}${zero ? '零' : ''}${text}`;
      zero = false;
    }
    section = Math.floor(section / 10);
  }
  return text;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function percentToRate(value) {
  return positiveNumber(value) / 100;
}

function resolveContributionBase(inputBase, monthlySalary, minBase, maxBase) {
  const input = Number(inputBase);
  let base = Number.isFinite(input) && input > 0 ? input : monthlySalary;
  const min = positiveNumber(minBase);
  const max = positiveNumber(maxBase);
  if (min > 0) base = Math.max(base, min);
  if (max > 0) base = Math.min(base, max);
  return base;
}

function clampInteger(value, min, max) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function findTaxBracket(taxable) {
  return TAX_BRACKETS.find((bracket) => taxable <= bracket.max) ?? TAX_BRACKETS.at(-1);
}

function formatMoney(value) {
  return `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function loanResult(method, principal, months, monthlyRate, totalPayment, schedule) {
  const totalInterest = totalPayment - principal;
  return {
    ok: true,
    data: {
      method,
      principal,
      months,
      annualRate: monthlyRate * 12,
      monthlyRate,
      totalPayment,
      totalInterest,
      firstPayment: schedule[0]?.payment ?? 0,
      lastPayment: schedule.at(-1)?.payment ?? 0,
      schedule: schedule.slice(0, 12)
    },
    value: [
      `还款方式: ${method}`,
      `贷款本金: ${formatMoney(principal)}`,
      `贷款期数: ${months} 期`,
      `年利率: ${trimFloat(monthlyRate * 12 * 100)}%`,
      `首月还款: ${formatMoney(schedule[0]?.payment ?? 0)}`,
      `末月还款: ${formatMoney(schedule.at(-1)?.payment ?? 0)}`,
      `还款总额: ${formatMoney(totalPayment)}`,
      `利息总额: ${formatMoney(totalInterest)}`
    ].join('\n')
  };
}

const HTML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0'
};

const HTML_ENTITY_REVERSE = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '\u00a0': '&nbsp;'
};

const MORSE_CODE = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  0: '-----',
  1: '.----',
  2: '..---',
  3: '...--',
  4: '....-',
  5: '.....',
  6: '-....',
  7: '--...',
  8: '---..',
  9: '----.',
  '.': '.-.-.-',
  ',': '--..--',
  '?': '..--..',
  '/': '-..-.',
  '-': '-....-',
  '(': '-.--.',
  ')': '-.--.-'
};

const UNIT_DEFS = {
  mm: { type: 'length', label: '毫米', factor: 0.001 },
  cm: { type: 'length', label: '厘米', factor: 0.01 },
  m: { type: 'length', label: '米', factor: 1 },
  km: { type: 'length', label: '千米', factor: 1000 },
  inch: { type: 'length', label: '英寸', factor: 0.0254 },
  ft: { type: 'length', label: '英尺', factor: 0.3048 },
  g: { type: 'weight', label: '克', factor: 1 },
  kg: { type: 'weight', label: '千克', factor: 1000 },
  lb: { type: 'weight', label: '磅', factor: 453.59237 },
  oz: { type: 'weight', label: '盎司', factor: 28.349523125 },
  ml: { type: 'volume', label: '毫升', factor: 1 },
  l: { type: 'volume', label: '升', factor: 1000 },
  gal: { type: 'volume', label: '加仑', factor: 3785.411784 },
  c: { type: 'temperature', label: '摄氏度', toBase: (value) => value, fromBase: (value) => value },
  f: { type: 'temperature', label: '华氏度', toBase: (value) => (value - 32) * 5 / 9, fromBase: (value) => value * 9 / 5 + 32 },
  k: { type: 'temperature', label: '开尔文', toBase: (value) => value - 273.15, fromBase: (value) => value + 273.15 }
};

const HTTP_STATUS = {
  100: 'Continue',
  101: 'Switching Protocols',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
};

const TAX_BRACKETS = [
  { max: 36000, rate: 0.03, quick: 0 },
  { max: 144000, rate: 0.1, quick: 2520 },
  { max: 300000, rate: 0.2, quick: 16920 },
  { max: 420000, rate: 0.25, quick: 31920 },
  { max: 660000, rate: 0.3, quick: 52920 },
  { max: 960000, rate: 0.35, quick: 85920 },
  { max: Infinity, rate: 0.45, quick: 181920 }
];
