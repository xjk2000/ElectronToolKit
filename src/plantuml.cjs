const zlib = require('node:zlib');

const DEFAULT_PLANTUML_SERVER = 'https://www.plantuml.com/plantuml';
const PLANTUML_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';

function normalizePlantUmlSource(source) {
  const input = String(source ?? '').replace(/\r\n?/g, '\n').trim();
  if (!input) throw new Error('请输入 PUML 内容');
  if (/^\s*@start[a-z]*\b/i.test(input)) return input;
  return `@startuml\n${input}\n@enduml`;
}

function encodePlantUml(source) {
  const normalized = normalizePlantUmlSource(source);
  const compressed = zlib.deflateRawSync(Buffer.from(normalized, 'utf8'), { level: 9 });
  let encoded = '';
  for (let index = 0; index < compressed.length; index += 3) {
    const byte1 = compressed[index];
    const byte2 = index + 1 < compressed.length ? compressed[index + 1] : 0;
    const byte3 = index + 2 < compressed.length ? compressed[index + 2] : 0;
    encoded += append3Bytes(byte1, byte2, byte3);
  }
  return encoded;
}

function append3Bytes(byte1, byte2, byte3) {
  const c1 = byte1 >> 2;
  const c2 = ((byte1 & 0x3) << 4) | (byte2 >> 4);
  const c3 = ((byte2 & 0xf) << 2) | (byte3 >> 6);
  const c4 = byte3 & 0x3f;
  return (
    PLANTUML_ALPHABET[c1 & 0x3f]
    + PLANTUML_ALPHABET[c2 & 0x3f]
    + PLANTUML_ALPHABET[c3 & 0x3f]
    + PLANTUML_ALPHABET[c4 & 0x3f]
  );
}

function decodePlantUml(encoded) {
  const input = String(encoded ?? '').trim();
  const bytes = [];
  for (let index = 0; index < input.length; index += 4) {
    const c1 = decodeChar(input[index]);
    const c2 = decodeChar(input[index + 1]);
    const c3 = decodeChar(input[index + 2]);
    const c4 = decodeChar(input[index + 3]);
    bytes.push((c1 << 2) | (c2 >> 4));
    if (index + 2 < input.length) bytes.push(((c2 & 0xf) << 4) | (c3 >> 2));
    if (index + 3 < input.length) bytes.push(((c3 & 0x3) << 6) | c4);
  }
  return zlib.inflateRawSync(Buffer.from(bytes)).toString('utf8');
}

function decodeChar(char) {
  const index = PLANTUML_ALPHABET.indexOf(char);
  if (index === -1) throw new Error(`Invalid PlantUML encoded character: ${char}`);
  return index;
}

function normalizePlantUmlServerUrl(serverUrl = DEFAULT_PLANTUML_SERVER) {
  const url = String(serverUrl || DEFAULT_PLANTUML_SERVER).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) throw new Error('PlantUML Server 地址必须以 http:// 或 https:// 开头');
  return url;
}

function buildPlantUmlUrl({ source, serverUrl = DEFAULT_PLANTUML_SERVER, format = 'svg' }) {
  const normalizedFormat = String(format || 'svg').toLowerCase();
  if (!['svg', 'png'].includes(normalizedFormat)) throw new Error(`不支持的 PlantUML 输出格式：${format}`);
  return `${normalizePlantUmlServerUrl(serverUrl)}/${normalizedFormat}/${encodePlantUml(source)}`;
}

module.exports = {
  DEFAULT_PLANTUML_SERVER,
  normalizePlantUmlSource,
  encodePlantUml,
  decodePlantUml,
  normalizePlantUmlServerUrl,
  buildPlantUmlUrl
};
