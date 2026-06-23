const crypto = require('node:crypto');

const BASE32_ALPHABET = new Map(
  Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567').map((character, index) => [character, index])
);

function normalizeBase32Secret(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[\s-=]/g, '');
}

function decodeBase32(value) {
  const secret = normalizeBase32Secret(value);
  if (!secret) throw new Error('Secret 不能为空');

  let buffer = 0;
  let bitsLeft = 0;
  const bytes = [];
  for (const character of secret) {
    const alphabetValue = BASE32_ALPHABET.get(character);
    if (alphabetValue === undefined) throw new Error(`Secret 包含无效字符：${character}`);
    buffer = (buffer << 5) | alphabetValue;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bytes.push((buffer >> (bitsLeft - 8)) & 0xff);
      bitsLeft -= 8;
    }
  }

  return Buffer.from(bytes);
}

function normalizeDigits(value) {
  const digits = Math.round(Number(value));
  if (!Number.isFinite(digits)) return 6;
  return Math.min(Math.max(digits, 6), 8);
}

function normalizePeriod(value) {
  const period = Math.round(Number(value));
  if (!Number.isFinite(period)) return 30;
  return Math.max(period, 1);
}

function generateTOTP({ secret, digits = 6, period = 30, timestampSeconds = Date.now() / 1000 }) {
  const secretData = decodeBase32(secret);
  const validDigits = normalizeDigits(digits);
  const validPeriod = normalizePeriod(period);
  const counter = BigInt(Math.floor(Number(timestampSeconds) / validPeriod));
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  const hmac = crypto.createHmac('sha1', secretData).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const divisor = 10 ** validDigits;
  return String(truncated % divisor).padStart(validDigits, '0');
}

function remainingSeconds(period = 30, timestampSeconds = Date.now() / 1000) {
  const validPeriod = normalizePeriod(period);
  const elapsed = Math.floor(Number(timestampSeconds)) % validPeriod;
  return validPeriod - elapsed;
}

function parseOTPAuthURL(value, existingID) {
  let parsed;
  try {
    parsed = new URL(String(value ?? '').trim());
  } catch {
    throw new Error('只支持 otpauth://totp/... 格式');
  }

  if (parsed.protocol.toLowerCase() !== 'otpauth:' || parsed.hostname.toLowerCase() !== 'totp') {
    throw new Error('只支持 otpauth://totp/... 格式');
  }

  const secret = parsed.searchParams.get('secret');
  if (!secret || !secret.trim()) throw new Error('请填写 Secret 或 otpauth:// 链接');
  decodeBase32(secret);

  const encodedLabel = parsed.pathname.replace(/^\/+/, '');
  let rawLabel = encodedLabel;
  try {
    rawLabel = decodeURIComponent(encodedLabel);
  } catch {
    rawLabel = encodedLabel;
  }
  const separatorIndex = rawLabel.indexOf(':');
  const issuerFromLabel = separatorIndex >= 0 ? rawLabel.slice(0, separatorIndex) : rawLabel;
  const nameFromLabel = separatorIndex >= 0 ? rawLabel.slice(separatorIndex + 1) : issuerFromLabel;
  const issuer = parsed.searchParams.get('issuer') || issuerFromLabel;
  const digits = normalizeDigits(parsed.searchParams.get('digits') || 6);
  const period = normalizePeriod(parsed.searchParams.get('period') || 30);

  return normalizeTOTPAccount({
    id: existingID,
    issuer,
    name: nameFromLabel,
    secret,
    digits,
    period
  });
}

function accountFromInput({ id, issuer = '', name = '', secretOrURL = '', digits = 6, period = 30 } = {}) {
  const input = String(secretOrURL ?? '').trim();
  if (!input) throw new Error('请填写 Secret 或 otpauth:// 链接');
  if (input.toLowerCase().startsWith('otpauth://')) return parseOTPAuthURL(input, id);

  decodeBase32(input);
  return normalizeTOTPAccount({ id, issuer, name, secret: input, digits, period });
}

function normalizeTOTPAccount(account = {}) {
  const secret = normalizeBase32Secret(account.secret);
  if (!secret) throw new Error('Secret 不能为空');
  decodeBase32(secret);

  return {
    id: String(account.id || crypto.randomUUID()),
    issuer: String(account.issuer || '').trim().slice(0, 120),
    name: String(account.name || '').trim().slice(0, 120),
    secret,
    digits: normalizeDigits(account.digits),
    period: normalizePeriod(account.period),
    createdAt: Number(account.createdAt) || Date.now(),
    updatedAt: Number(account.updatedAt) || Date.now()
  };
}

function displayName(account) {
  const issuer = String(account?.issuer || '').trim();
  const name = String(account?.name || '').trim();
  if (!issuer) return name || 'Untitled';
  if (!name || name === issuer) return issuer;
  return `${issuer} - ${name}`;
}

function accountWithCode(account, timestampSeconds = Date.now() / 1000) {
  const normalized = normalizeTOTPAccount(account);
  return {
    ...normalized,
    displayName: displayName(normalized),
    code: generateTOTP({
      secret: normalized.secret,
      digits: normalized.digits,
      period: normalized.period,
      timestampSeconds
    }),
    remaining: remainingSeconds(normalized.period, timestampSeconds)
  };
}

module.exports = {
  accountFromInput,
  accountWithCode,
  decodeBase32,
  displayName,
  generateTOTP,
  normalizeBase32Secret,
  normalizeDigits,
  normalizePeriod,
  normalizeTOTPAccount,
  parseOTPAuthURL,
  remainingSeconds
};
