function branchSelectorHint(selector) {
  if (!selector || typeof selector !== 'object') return '';
  if (selector.type === 'fixed') return String(selector.value || '').trim();
  if (selector.type === 'regex') return String(selector.value || '').trim();
  if (selector.type === 'rule') return `${String(selector.prefix || '').trim()}${String(selector.separator ?? '-') || '-'}...`;
  return '';
}

function branchSelectorRegex(selector) {
  if (!selector || typeof selector !== 'object') return null;
  if (selector.type === 'regex') return String(selector.value || '').trim() || null;
  if (selector.type !== 'rule') return null;
  const prefix = escapeRegExp(String(selector.prefix || '').trim());
  const separator = escapeRegExp(String(selector.separator ?? '-') || '-');
  const head = `${prefix}${separator}`;
  switch (selector.format) {
    case 'yyyymmddDashed':
      return `^${head}\\d{4}-\\d{2}-\\d{2}$`;
    case 'yyyymmddDotted':
      return `^${head}\\d{4}\\.\\d{2}\\.\\d{2}$`;
    case 'yyyymmddWithTail':
      return `^${head}\\d{8}-.+$`;
    case 'yyyymmdd':
    default:
      return `^${head}\\d{8}$`;
  }
}

function branchSelectorSearchPrefix(selector) {
  if (!selector || typeof selector !== 'object') return '';
  if (selector.type === 'rule') return `${String(selector.prefix || '').trim()}${String(selector.separator ?? '-') || '-'}`;
  if (selector.type === 'regex') return leadingLiteralPrefixFromAnchoredRegex(String(selector.value || ''));
  return '';
}

function matchesBranchSelector(ref, selector, fallbackRef = '') {
  const branch = String(ref || fallbackRef || '');
  if (!branch) return false;
  if (!selector || selector.type === 'fixed') {
    return branch === String(selector?.value || fallbackRef || '').trim();
  }
  const pattern = branchSelectorRegex(selector);
  if (!pattern) return false;
  return new RegExp(pattern).test(branch);
}

async function resolveBranch(selector, listBranches) {
  if (!selector || selector.type === 'fixed') return String(selector?.value || '').trim() || null;
  const search = branchSelectorSearchPrefix(selector);
  const branches = await listBranches(search || undefined);
  const pattern = branchSelectorRegex(selector);
  if (!pattern) return null;
  const regex = new RegExp(pattern);
  const matched = branches.map((item) => String(item.name || item)).filter((name) => regex.test(name));
  return matched.sort().reverse()[0] || null;
}

function leadingLiteralPrefixFromAnchoredRegex(pattern) {
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  branchSelectorHint,
  branchSelectorRegex,
  branchSelectorSearchPrefix,
  matchesBranchSelector,
  resolveBranch
};
