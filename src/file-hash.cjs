const { createReadStream } = require('node:fs');
const { stat } = require('node:fs/promises');
const crypto = require('node:crypto');
const path = require('node:path');

const FILE_HASH_ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha512'];

async function calculateFileHashes(filePath, algorithms = FILE_HASH_ALGORITHMS) {
  const resolvedPath = path.resolve(String(filePath || ''));
  const selectedAlgorithms = normalizeHashAlgorithms(algorithms);
  const fileStat = await stat(resolvedPath);
  const hashers = Object.fromEntries(selectedAlgorithms.map((algorithm) => [algorithm, crypto.createHash(algorithm)]));

  await new Promise((resolve, reject) => {
    const stream = createReadStream(resolvedPath, { highWaterMark: 1024 * 1024 });
    stream.on('data', (chunk) => {
      selectedAlgorithms.forEach((algorithm) => hashers[algorithm].update(chunk));
    });
    stream.on('error', reject);
    stream.on('end', resolve);
  });

  return {
    ok: true,
    fileName: path.basename(resolvedPath),
    filePath: resolvedPath,
    fileSize: fileStat.size,
    hashes: Object.fromEntries(selectedAlgorithms.map((algorithm) => [algorithm, hashers[algorithm].digest('hex')]))
  };
}

function normalizeHashAlgorithms(algorithms) {
  const selected = [...new Set((Array.isArray(algorithms) ? algorithms : FILE_HASH_ALGORITHMS).map((item) => String(item).toLowerCase()))].filter(
    (algorithm) => FILE_HASH_ALGORITHMS.includes(algorithm)
  );
  if (selected.length === 0) throw new Error('请选择至少一种哈希算法');
  return selected;
}

module.exports = {
  FILE_HASH_ALGORITHMS,
  calculateFileHashes,
  normalizeHashAlgorithms
};
