const { createReadStream, createWriteStream } = require('node:fs');
const { once } = require('node:events');
const { rename, stat, unlink } = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_PREVIEW_LIMIT = 8_000;
const JSONL_FIELD_PATH_LIMIT = 500;
const JSONL_FIELD_PATH_OUTPUT_LIMIT = 40;
const JSONL_FIELD_PATH_DEPTH_LIMIT = 5;
const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

async function inspectJsonFile(filePath, options = {}) {
  const resolvedPath = path.resolve(String(filePath || ''));
  const fileStat = await stat(resolvedPath);
  const inspector = new JsonStreamInspector({
    previewLimit: options.previewLimit ?? DEFAULT_PREVIEW_LIMIT,
    fileName: path.basename(resolvedPath),
    filePath: resolvedPath,
    fileSize: fileStat.size
  });

  await new Promise((resolve, reject) => {
    const stream = createReadStream(resolvedPath, { encoding: 'utf8', highWaterMark: 1024 * 1024 });
    stream.on('data', (chunk) => {
      try {
        inspector.feed(chunk);
      } catch (error) {
        stream.destroy(error);
      }
    });
    stream.on('error', reject);
    stream.on('end', resolve);
  });

  return inspector.finish();
}

async function inspectJsonLinesFile(filePath, options = {}) {
  const resolvedPath = path.resolve(String(filePath || ''));
  const fileStat = await stat(resolvedPath);
  const inspector = new JsonLinesInspector({
    previewLimit: options.previewLimit ?? DEFAULT_PREVIEW_LIMIT,
    fileName: path.basename(resolvedPath),
    filePath: resolvedPath,
    fileSize: fileStat.size
  });

  for await (const chunk of createReadStream(resolvedPath, { encoding: 'utf8', highWaterMark: 1024 * 1024 })) {
    inspector.feed(chunk);
  }

  return inspector.finish();
}

async function exportJsonLinesFieldsCsvFile(inputPath, outputPath, fields) {
  const resolvedInputPath = path.resolve(String(inputPath || ''));
  const resolvedOutputPath = path.resolve(String(outputPath || ''));
  if (resolvedInputPath === resolvedOutputPath) throw new Error('输出文件不能覆盖原文件');
  const selectedFields = normalizeJsonLineFields(fields);
  const inputStat = await stat(resolvedInputPath);
  const temporaryOutputPath = `${resolvedOutputPath}.tmp-${process.pid}-${Date.now()}`;
  const output = createWriteStream(temporaryOutputPath, { encoding: 'utf8' });
  let remainder = '';
  let lineCount = 0;
  let emptyLineCount = 0;
  let exportedRows = 0;
  let outputBytes = 0;

  const writeChunk = async (value) => {
    outputBytes += Buffer.byteLength(value, 'utf8');
    if (value && !output.write(value)) await once(output, 'drain');
  };

  const writeRecord = async (line) => {
    lineCount += 1;
    const trimmed = String(line ?? '').trim();
    if (!trimmed) {
      emptyLineCount += 1;
      return;
    }
    let value;
    try {
      value = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`第 ${lineCount} 行不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
    }
    const row = selectedFields.map((field) => csvEscape(formatCsvFieldValue(readJsonPathValue(value, field)))).join(',');
    exportedRows += 1;
    await writeChunk(`${row}\n`);
  };

  try {
    await writeChunk(`${selectedFields.map(csvEscape).join(',')}\n`);
    for await (const chunk of createReadStream(resolvedInputPath, { encoding: 'utf8', highWaterMark: 1024 * 1024 })) {
      const normalized = (remainder + chunk).replace(/\r\n/g, '\n');
      const lines = normalized.split('\n');
      remainder = lines.pop() ?? '';
      for (const line of lines) await writeRecord(line);
    }
    if (remainder.length > 0) await writeRecord(remainder);
    output.end();
    await once(output, 'finish');
    await rename(temporaryOutputPath, resolvedOutputPath);
    return {
      ok: true,
      inputPath: resolvedInputPath,
      outputPath: resolvedOutputPath,
      inputBytes: inputStat.size,
      outputBytes,
      deltaBytes: inputStat.size - outputBytes,
      savedBytes: Math.max(0, inputStat.size - outputBytes),
      lineCount,
      emptyLineCount,
      exportedRows,
      fields: selectedFields
    };
  } catch (error) {
    output.destroy();
    await unlink(temporaryOutputPath).catch(() => {});
    throw error;
  }
}

async function minifyJsonFile(inputPath, outputPath) {
  return transformJsonFile(inputPath, outputPath, () => new JsonStreamMinifier());
}

async function formatJsonFile(inputPath, outputPath, options = {}) {
  return transformJsonFile(inputPath, outputPath, () => new JsonStreamPrettyFormatter(options.indent ?? 2));
}

async function extractTopLevelKeyJsonFile(inputPath, outputPath, key) {
  return transformJsonFile(inputPath, outputPath, () => new JsonTopLevelKeyExtractor(key), {
    getExtraResult: (transformer) => ({ key: transformer.targetKey })
  });
}

async function transformJsonFile(inputPath, outputPath, createTransformer, options = {}) {
  const resolvedInputPath = path.resolve(String(inputPath || ''));
  const resolvedOutputPath = path.resolve(String(outputPath || ''));
  if (resolvedInputPath === resolvedOutputPath) throw new Error('输出文件不能覆盖原文件');

  const inputStat = await stat(resolvedInputPath);
  const temporaryOutputPath = `${resolvedOutputPath}.tmp-${process.pid}-${Date.now()}`;
  const inspector = new JsonStreamInspector({
    previewLimit: 0,
    fileName: path.basename(resolvedInputPath),
    filePath: resolvedInputPath,
    fileSize: inputStat.size
  });
  const transformer = createTransformer();
  const output = createWriteStream(temporaryOutputPath, { encoding: 'utf8' });
  let outputBytes = 0;

  try {
    for await (const chunk of createReadStream(resolvedInputPath, { encoding: 'utf8', highWaterMark: 1024 * 1024 })) {
      inspector.feed(chunk);
      const transformedChunk = transformer.feed(chunk);
      outputBytes += Buffer.byteLength(transformedChunk, 'utf8');
      if (transformedChunk && !output.write(transformedChunk)) await once(output, 'drain');
    }
    inspector.finish();
    const tail = transformer.finish();
    outputBytes += Buffer.byteLength(tail, 'utf8');
    if (tail && !output.write(tail)) await once(output, 'drain');
    output.end();
    await once(output, 'finish');
    await rename(temporaryOutputPath, resolvedOutputPath);
    return {
      ok: true,
      inputPath: resolvedInputPath,
      outputPath: resolvedOutputPath,
      inputBytes: inputStat.size,
      outputBytes,
      deltaBytes: inputStat.size - outputBytes,
      savedBytes: Math.max(0, inputStat.size - outputBytes),
      ...(options.getExtraResult ? options.getExtraResult(transformer) : {})
    };
  } catch (error) {
    output.destroy();
    await unlink(temporaryOutputPath).catch(() => {});
    throw error;
  }
}

function inspectJsonText(text, options = {}) {
  const value = String(text ?? '');
  const inspector = new JsonStreamInspector({
    previewLimit: options.previewLimit ?? DEFAULT_PREVIEW_LIMIT,
    fileName: options.fileName || 'inline.json',
    filePath: options.filePath || '',
    fileSize: Buffer.byteLength(value, 'utf8')
  });
  inspector.feed(value);
  return inspector.finish();
}

function inspectJsonLinesText(text, options = {}) {
  const value = String(text ?? '');
  const inspector = new JsonLinesInspector({
    previewLimit: options.previewLimit ?? DEFAULT_PREVIEW_LIMIT,
    fileName: options.fileName || 'inline.jsonl',
    filePath: options.filePath || '',
    fileSize: Buffer.byteLength(value, 'utf8')
  });
  inspector.feed(value);
  return inspector.finish();
}

function minifyJsonText(text) {
  return transformJsonText(text, () => new JsonStreamMinifier());
}

function formatJsonText(text, options = {}) {
  return transformJsonText(text, () => new JsonStreamPrettyFormatter(options.indent ?? 2));
}

function extractTopLevelKeyJsonText(text, key) {
  return transformJsonText(text, () => new JsonTopLevelKeyExtractor(key));
}

function transformJsonText(text, createTransformer) {
  const value = String(text ?? '');
  const inspector = new JsonStreamInspector({
    previewLimit: 0,
    fileName: 'inline.json',
    filePath: '',
    fileSize: Buffer.byteLength(value, 'utf8')
  });
  const transformer = createTransformer();
  inspector.feed(value);
  const output = transformer.feed(value) + transformer.finish();
  inspector.finish();
  return output;
}

class JsonStreamInspector {
  constructor({ previewLimit, fileName, filePath, fileSize }) {
    this.previewLimit = previewLimit;
    this.fileName = fileName;
    this.filePath = filePath;
    this.fileSize = fileSize;
    this.offset = 0;
    this.line = 1;
    this.column = 0;
    this.stack = [];
    this.rootSeen = false;
    this.mode = 'normal';
    this.stringValue = '';
    this.stringCaptureLimit = 240;
    this.stringUnicodeRemaining = 0;
    this.stringEscape = false;
    this.stringTokenKind = 'value';
    this.token = '';
    this.headPreview = '';
    this.tailPreview = '';
    this.stats = {
      totalNodes: 0,
      objectCount: 0,
      arrayCount: 0,
      primitiveCount: 0,
      stringCount: 0,
      numberCount: 0,
      booleanCount: 0,
      nullCount: 0,
      keyCount: 0,
      maxDepth: 0,
      topLevelKeys: []
    };
  }

  feed(chunk) {
    const text = String(chunk ?? '');
    this.capturePreview(text);
    for (let index = 0; index < text.length; index += 1) {
      this.consumeChar(text[index]);
    }
  }

  finish() {
    if (this.mode === 'string') throw this.error('字符串未闭合');
    if (this.mode === 'number') this.finishNumber();
    if (this.mode === 'literal') this.finishLiteral();
    if (!this.rootSeen) throw this.error('没有找到 JSON 内容');
    if (this.stack.length > 0) {
      const current = this.stack.at(-1);
      throw this.error(`${current.type === 'object' ? '对象' : '数组'} 未闭合`);
    }

    return {
      ok: true,
      fileName: this.fileName,
      filePath: this.filePath,
      fileSize: this.fileSize,
      chars: this.offset,
      ...this.stats,
      previewHead: this.headPreview,
      previewTail: this.tailPreview
    };
  }

  consumeChar(char) {
    this.offset += 1;
    if (char === '\n') {
      this.line += 1;
      this.column = 0;
    } else {
      this.column += 1;
    }

    if (this.mode === 'string') {
      this.consumeStringChar(char);
      return;
    }
    if (this.mode === 'number') {
      if (isNumberChar(char)) {
        this.token += char;
        return;
      }
      this.finishNumber();
      this.consumeNormalChar(char);
      return;
    }
    if (this.mode === 'literal') {
      if (/[a-z]/i.test(char)) {
        this.token += char;
        return;
      }
      this.finishLiteral();
      this.consumeNormalChar(char);
      return;
    }

    this.consumeNormalChar(char);
  }

  consumeNormalChar(char) {
    if (/\s/.test(char)) return;
    if (char === '{') {
      this.startValue('object');
      this.stack.push({ type: 'object', state: 'keyOrEnd' });
      this.stats.objectCount += 1;
      this.stats.maxDepth = Math.max(this.stats.maxDepth, this.stack.length);
      return;
    }
    if (char === '[') {
      this.startValue('array');
      this.stack.push({ type: 'array', state: 'valueOrEnd' });
      this.stats.arrayCount += 1;
      this.stats.maxDepth = Math.max(this.stats.maxDepth, this.stack.length);
      return;
    }
    if (char === '}') {
      this.closeObject();
      return;
    }
    if (char === ']') {
      this.closeArray();
      return;
    }
    if (char === ',') {
      this.consumeComma();
      return;
    }
    if (char === ':') {
      this.consumeColon();
      return;
    }
    if (char === '"') {
      this.openString();
      return;
    }
    if (char === '-' || /\d/.test(char)) {
      this.token = char;
      this.mode = 'number';
      return;
    }
    if (/[a-z]/i.test(char)) {
      this.token = char;
      this.mode = 'literal';
      return;
    }
    throw this.error(`无法识别的字符：${char}`);
  }

  openString() {
    const context = this.currentContext();
    this.stringTokenKind = context?.type === 'object' && (context.state === 'keyOrEnd' || context.state === 'key') ? 'key' : 'value';
    if (this.stringTokenKind === 'value') this.startValue('string');
    this.mode = 'string';
    this.stringValue = '';
    this.stringEscape = false;
    this.stringUnicodeRemaining = 0;
  }

  consumeStringChar(char) {
    if (this.stringUnicodeRemaining > 0) {
      if (!/[0-9a-fA-F]/.test(char)) throw this.error('Unicode 转义不是合法十六进制');
      this.stringUnicodeRemaining -= 1;
      this.appendStringValue(char);
      return;
    }
    if (this.stringEscape) {
      if (char === 'u') {
        this.stringUnicodeRemaining = 4;
        this.appendStringValue('\\u');
      } else if ('"\\/bfnrt'.includes(char)) {
        this.appendStringValue(`\\${char}`);
      } else {
        throw this.error(`非法字符串转义：\\${char}`);
      }
      this.stringEscape = false;
      return;
    }
    if (char === '\\') {
      this.stringEscape = true;
      return;
    }
    if (char === '"') {
      this.closeString();
      return;
    }
    if (char < ' ') throw this.error('字符串中包含未转义控制字符');
    this.appendStringValue(char);
  }

  appendStringValue(text) {
    if (this.stringValue.length < this.stringCaptureLimit) this.stringValue += text;
  }

  closeString() {
    if (this.stringTokenKind === 'key') {
      const context = this.currentContext();
      if (!context || context.type !== 'object' || (context.state !== 'keyOrEnd' && context.state !== 'key')) {
        throw this.error('key 出现位置不正确');
      }
      context.state = 'colon';
      this.stats.keyCount += 1;
      if (this.stack.length === 1 && this.stats.topLevelKeys.length < 20) {
        this.stats.topLevelKeys.push(this.stringValue);
      }
    } else {
      this.stats.stringCount += 1;
      this.stats.primitiveCount += 1;
      this.completeValue();
    }
    this.mode = 'normal';
    this.stringValue = '';
  }

  finishNumber() {
    if (!NUMBER_PATTERN.test(this.token)) throw this.error(`数字格式不合法：${this.token}`);
    this.startValue('number');
    this.stats.numberCount += 1;
    this.stats.primitiveCount += 1;
    this.completeValue();
    this.token = '';
    this.mode = 'normal';
  }

  finishLiteral() {
    if (this.token === 'true' || this.token === 'false') {
      this.startValue('boolean');
      this.stats.booleanCount += 1;
      this.stats.primitiveCount += 1;
      this.completeValue();
    } else if (this.token === 'null') {
      this.startValue('null');
      this.stats.nullCount += 1;
      this.stats.primitiveCount += 1;
      this.completeValue();
    } else {
      throw this.error(`非法字面量：${this.token}`);
    }
    this.token = '';
    this.mode = 'normal';
  }

  startValue(kind) {
    const context = this.currentContext();
    if (!context) {
      if (this.rootSeen) throw this.error('根 JSON 后存在多余内容');
      this.rootSeen = true;
    } else if (context.type === 'array') {
      if (context.state !== 'valueOrEnd' && context.state !== 'value') throw this.error('数组元素前缺少逗号');
      context.state = 'commaOrEnd';
    } else if (context.type === 'object') {
      if (context.state !== 'value') throw this.error('对象 value 前缺少冒号');
      context.state = 'commaOrEnd';
    }
    this.stats.totalNodes += 1;
    if (kind !== 'object' && kind !== 'array') {
      this.stats.maxDepth = Math.max(this.stats.maxDepth, this.stack.length + 1);
    }
  }

  completeValue() {
    if (!this.currentContext()) return;
  }

  closeObject() {
    const context = this.currentContext();
    if (!context || context.type !== 'object') throw this.error('对象闭合符位置不正确');
    if (context.state !== 'keyOrEnd' && context.state !== 'commaOrEnd') throw this.error('对象闭合前缺少 value');
    this.stack.pop();
  }

  closeArray() {
    const context = this.currentContext();
    if (!context || context.type !== 'array') throw this.error('数组闭合符位置不正确');
    if (context.state !== 'valueOrEnd' && context.state !== 'commaOrEnd') throw this.error('数组闭合前缺少元素');
    this.stack.pop();
  }

  consumeComma() {
    const context = this.currentContext();
    if (!context || context.state !== 'commaOrEnd') throw this.error('逗号位置不正确');
    context.state = context.type === 'object' ? 'key' : 'value';
  }

  consumeColon() {
    const context = this.currentContext();
    if (!context || context.type !== 'object' || context.state !== 'colon') throw this.error('冒号位置不正确');
    context.state = 'value';
  }

  currentContext() {
    return this.stack.at(-1);
  }

  capturePreview(text) {
    if (this.headPreview.length < this.previewLimit) {
      this.headPreview = (this.headPreview + text).slice(0, this.previewLimit);
    }
    this.tailPreview = (this.tailPreview + text).slice(-this.previewLimit);
  }

  error(message) {
    const error = new Error(`${message}（第 ${this.line} 行，第 ${this.column} 列）`);
    error.line = this.line;
    error.column = this.column;
    error.offset = this.offset;
    return error;
  }
}

class JsonLinesInspector {
  constructor({ previewLimit, fileName, filePath, fileSize }) {
    this.previewLimit = previewLimit;
    this.fileName = fileName;
    this.filePath = filePath;
    this.fileSize = fileSize;
    this.remainder = '';
    this.chars = 0;
    this.headPreview = '';
    this.tailPreview = '';
    this.keyCounts = new Map();
    this.pathCounts = new Map();
    this.stats = {
      mode: 'jsonl',
      lineCount: 0,
      validLineCount: 0,
      emptyLineCount: 0,
      totalNodes: 0,
      objectCount: 0,
      arrayCount: 0,
      primitiveCount: 0,
      stringCount: 0,
      numberCount: 0,
      booleanCount: 0,
      nullCount: 0,
      keyCount: 0,
      maxDepth: 0,
      topLevelKeys: []
    };
  }

  feed(chunk) {
    const text = String(chunk ?? '');
    this.capturePreview(text);
    this.chars += text.length;
    const normalized = (this.remainder + text).replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    this.remainder = lines.pop() ?? '';
    lines.forEach((line) => this.consumeLine(line));
  }

  finish() {
    if (this.remainder.length > 0) this.consumeLine(this.remainder);
    if (this.stats.validLineCount === 0) throw this.error('没有找到有效 JSONL 记录', this.stats.lineCount || 1);
    this.stats.topLevelKeys = [...this.keyCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 20)
      .map(([key]) => key);
    const sortedFieldPaths = [...this.pathCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, JSONL_FIELD_PATH_OUTPUT_LIMIT);
    return {
      ok: true,
      fileName: this.fileName,
      filePath: this.filePath,
      fileSize: this.fileSize,
      chars: this.chars,
      ...this.stats,
      topLevelKeyCounts: Object.fromEntries([...this.keyCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20)),
      fieldPaths: sortedFieldPaths.map(([fieldPath]) => fieldPath),
      fieldPathCounts: Object.fromEntries(sortedFieldPaths),
      previewHead: this.headPreview,
      previewTail: this.tailPreview
    };
  }

  consumeLine(line) {
    this.stats.lineCount += 1;
    const trimmed = String(line ?? '').trim();
    if (!trimmed) {
      this.stats.emptyLineCount += 1;
      return;
    }
    let value;
    try {
      value = JSON.parse(trimmed);
    } catch (error) {
      throw this.error(`第 ${this.stats.lineCount} 行不是合法 JSON：${error instanceof Error ? error.message : String(error)}`, this.stats.lineCount);
    }
    this.stats.validLineCount += 1;
    this.collectValueStats(value, 1, true, []);
  }

  collectValueStats(value, depth, isRoot = false, pathParts = []) {
    this.stats.totalNodes += 1;
    this.stats.maxDepth = Math.max(this.stats.maxDepth, depth);
    if (Array.isArray(value)) {
      this.stats.arrayCount += 1;
      value.forEach((item, index) => {
        const nextPathParts = pathParts.length > 0 && index === 0 ? [...pathParts, '0'] : [];
        this.collectValueStats(item, depth + 1, false, nextPathParts);
      });
      return;
    }
    if (value && typeof value === 'object') {
      this.stats.objectCount += 1;
      Object.entries(value).forEach(([key, child]) => {
        this.stats.keyCount += 1;
        if (isRoot) this.keyCounts.set(key, (this.keyCounts.get(key) ?? 0) + 1);
        const nextPathParts = shouldTrackJsonLinePathSegment(key, pathParts)
          ? [...pathParts, key]
          : [];
        this.collectValueStats(child, depth + 1, false, nextPathParts);
      });
      return;
    }
    this.stats.primitiveCount += 1;
    this.recordFieldPath(pathParts);
    if (typeof value === 'string') this.stats.stringCount += 1;
    else if (typeof value === 'number') this.stats.numberCount += 1;
    else if (typeof value === 'boolean') this.stats.booleanCount += 1;
    else if (value === null) this.stats.nullCount += 1;
  }

  recordFieldPath(pathParts) {
    if (!Array.isArray(pathParts) || pathParts.length === 0 || pathParts.length > JSONL_FIELD_PATH_DEPTH_LIMIT) return;
    const fieldPath = pathParts.join('.');
    if (!fieldPath || (!this.pathCounts.has(fieldPath) && this.pathCounts.size >= JSONL_FIELD_PATH_LIMIT)) return;
    this.pathCounts.set(fieldPath, (this.pathCounts.get(fieldPath) ?? 0) + 1);
  }

  capturePreview(text) {
    if (this.headPreview.length < this.previewLimit) {
      this.headPreview = (this.headPreview + text).slice(0, this.previewLimit);
    }
    this.tailPreview = (this.tailPreview + text).slice(-this.previewLimit);
  }

  error(message, line) {
    const error = new Error(`${message}（第 ${line} 行）`);
    error.line = line;
    return error;
  }
}

function isNumberChar(char) {
  return /[0-9eE+\-.]/.test(char);
}

function normalizeJsonLineFields(fields) {
  const selected = [...new Set((Array.isArray(fields) ? fields : String(fields ?? '').split(/[,\n]/)).map((field) => String(field || '').trim()).filter(Boolean))];
  if (selected.length === 0) throw new Error('请选择至少一个导出字段');
  return selected.slice(0, 100);
}

function shouldTrackJsonLinePathSegment(segment, currentPathParts) {
  if (!Array.isArray(currentPathParts) || currentPathParts.length >= JSONL_FIELD_PATH_DEPTH_LIMIT) return false;
  const value = String(segment ?? '').trim();
  return value.length > 0 && !/[.,\n\r]/.test(value);
}

function formatCsvFieldValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function readJsonPathValue(value, pathExpression) {
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

function csvEscape(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

class JsonStreamMinifier {
  constructor() {
    this.inString = false;
    this.escaped = false;
  }

  feed(chunk) {
    const text = String(chunk ?? '');
    let output = '';
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (this.inString) {
        output += char;
        if (this.escaped) {
          this.escaped = false;
        } else if (char === '\\') {
          this.escaped = true;
        } else if (char === '"') {
          this.inString = false;
        }
        continue;
      }

      if (char === '"') {
        this.inString = true;
        output += char;
        continue;
      }
      if (!/\s/.test(char)) output += char;
    }
    return output;
  }

  finish() {
    if (this.inString) throw new Error('字符串未闭合');
    return '';
  }
}

class JsonStreamPrettyFormatter {
  constructor(indent = 2) {
    this.indentSize = Math.max(0, Math.min(8, Number(indent) || 2));
    this.depth = 0;
    this.inString = false;
    this.escaped = false;
    this.pendingIndent = '';
  }

  feed(chunk) {
    const text = String(chunk ?? '');
    let output = '';
    const write = (value) => {
      if (this.pendingIndent) {
        output += this.pendingIndent;
        this.pendingIndent = '';
      }
      output += value;
    };

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (this.inString) {
        output += char;
        if (this.escaped) {
          this.escaped = false;
        } else if (char === '\\') {
          this.escaped = true;
        } else if (char === '"') {
          this.inString = false;
        }
        continue;
      }

      if (/\s/.test(char)) continue;
      if (char === '"') {
        this.inString = true;
        write(char);
        continue;
      }
      if (char === '{' || char === '[') {
        write(char);
        this.depth += 1;
        this.pendingIndent = this.newlineIndent();
        continue;
      }
      if (char === '}' || char === ']') {
        this.depth = Math.max(0, this.depth - 1);
        if (this.pendingIndent) {
          this.pendingIndent = '';
          output += char;
        } else {
          output += this.newlineIndent() + char;
        }
        continue;
      }
      if (char === ',') {
        write(char);
        this.pendingIndent = this.newlineIndent();
        continue;
      }
      if (char === ':') {
        write(': ');
        continue;
      }
      write(char);
    }

    return output;
  }

  finish() {
    if (this.inString) throw new Error('字符串未闭合');
    return '';
  }

  newlineIndent() {
    return `\n${' '.repeat(this.depth * this.indentSize)}`;
  }
}

class JsonTopLevelKeyExtractor {
  constructor(targetKey) {
    this.targetKey = String(targetKey ?? '').trim();
    if (!this.targetKey) throw new Error('请输入要提取的顶层 key');
    this.depth = 0;
    this.rootStarted = false;
    this.rootIsObject = false;
    this.topState = 'root';
    this.inString = false;
    this.escaped = false;
    this.stringContext = '';
    this.keyRaw = '';
    this.currentKey = '';
    this.waitingTargetValue = false;
    this.targetActive = false;
    this.targetMode = '';
    this.found = false;
    this.completed = false;
  }

  feed(chunk) {
    const text = String(chunk ?? '');
    let output = '';

    const writeTarget = (char) => {
      output += char;
    };

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const startsTarget =
        !this.completed &&
        !this.targetActive &&
        this.waitingTargetValue &&
        this.topState === 'value' &&
        !this.inString &&
        !/\s/.test(char);

      if (startsTarget) {
        this.startTargetValue(char);
        writeTarget(char);
      } else if (this.targetActive) {
        if (this.targetMode === 'primitive' && !this.inString && this.depth === 1 && (char === ',' || char === '}')) {
          this.completeTargetValue();
        } else {
          writeTarget(char);
        }
      }

      this.consumeStructuralChar(char);

      if (this.targetActive) {
        if (this.targetMode === 'container' && this.depth === 1) {
          this.completeTargetValue();
        } else if (this.targetMode === 'string' && !this.inString) {
          this.completeTargetValue();
        }
      }
    }

    return output;
  }

  finish() {
    if (this.targetActive && this.targetMode === 'primitive') this.completeTargetValue();
    if (!this.rootStarted) throw new Error('没有找到 JSON 内容');
    if (!this.rootIsObject) throw new Error('顶层 key 提取仅支持根对象 JSON');
    if (!this.found) throw new Error(`未找到顶层 key：${this.targetKey}`);
    if (!this.completed) throw new Error(`顶层 key 尚未完整读取：${this.targetKey}`);
    return '';
  }

  startTargetValue(char) {
    this.found = true;
    this.targetActive = true;
    this.waitingTargetValue = false;
    if (char === '{' || char === '[') {
      this.targetMode = 'container';
    } else if (char === '"') {
      this.targetMode = 'string';
    } else {
      this.targetMode = 'primitive';
    }
  }

  completeTargetValue() {
    this.targetActive = false;
    this.completed = true;
    this.topState = 'commaOrEnd';
  }

  consumeStructuralChar(char) {
    if (this.inString) {
      this.consumeStringChar(char);
      return;
    }
    if (/\s/.test(char)) return;

    if (!this.rootStarted) {
      this.rootStarted = true;
      if (char !== '{') {
        this.rootIsObject = false;
        return;
      }
      this.rootIsObject = true;
      this.depth = 1;
      this.topState = 'keyOrEnd';
      return;
    }

    if (char === '"') {
      this.openString();
      return;
    }
    if (char === '{' || char === '[') {
      this.depth += 1;
      return;
    }
    if (char === '}' || char === ']') {
      if (this.depth === 1 && char === '}' && this.topState === 'value') this.topState = 'commaOrEnd';
      this.depth = Math.max(0, this.depth - 1);
      return;
    }
    if (this.depth === 1 && char === ':' && this.topState === 'colon') {
      this.topState = 'value';
      this.waitingTargetValue = this.currentKey === this.targetKey;
      return;
    }
    if (this.depth === 1 && char === ',') {
      this.topState = 'keyOrEnd';
      this.currentKey = '';
      this.waitingTargetValue = false;
    }
  }

  openString() {
    this.inString = true;
    this.escaped = false;
    if (this.depth === 1 && (this.topState === 'keyOrEnd' || this.topState === 'key')) {
      this.stringContext = 'topKey';
      this.keyRaw = '';
    } else {
      this.stringContext = 'value';
    }
  }

  consumeStringChar(char) {
    if (this.stringContext === 'topKey' && char !== '"' && !this.escaped) this.keyRaw += char;
    if (this.stringContext === 'topKey' && this.escaped) this.keyRaw += char;

    if (this.escaped) {
      this.escaped = false;
      return;
    }
    if (char === '\\') {
      this.escaped = true;
      return;
    }
    if (char !== '"') return;

    this.inString = false;
    if (this.stringContext === 'topKey') {
      this.currentKey = decodeJsonStringContent(this.keyRaw);
      this.topState = 'colon';
    } else if (this.depth === 1 && this.topState === 'value') {
      this.topState = 'commaOrEnd';
    }
    this.stringContext = '';
  }
}

function decodeJsonStringContent(content) {
  try {
    return JSON.parse(`"${content}"`);
  } catch {
    return content;
  }
}

module.exports = {
  exportJsonLinesFieldsCsvFile,
  extractTopLevelKeyJsonFile,
  extractTopLevelKeyJsonText,
  formatJsonFile,
  formatJsonText,
  inspectJsonFile,
  inspectJsonLinesFile,
  inspectJsonLinesText,
  inspectJsonText,
  minifyJsonFile,
  minifyJsonText
};
