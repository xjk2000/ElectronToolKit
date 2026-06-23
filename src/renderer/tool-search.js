export function createToolSearchIndex(tools) {
  return tools.map((tool) => {
    const sourceText = [tool.name, tool.category, tool.description, ...(tool.keywords ?? [])].join(' ');
    const aliases = createPinyinAliases(sourceText);
    return {
      tool,
      name: normalizeSearchText(tool.name),
      category: normalizeSearchText(tool.category),
      keywords: normalizeSearchText((tool.keywords ?? []).join(' ')),
      description: normalizeSearchText(tool.description),
      aliases: normalizeSearchText(aliases.join(' ')),
      haystack: normalizeSearchText([sourceText, ...aliases].join(' '))
    };
  });
}

export function searchToolsByQuery(index, query) {
  const search = createSearchQuery(query);
  const entries = search.normalized
    ? index
        .filter((entry) => matchesToolSearch(entry, search))
        .sort((a, b) => scoreToolMatch(b, search) - scoreToolMatch(a, search))
    : index;
  return entries.map((entry) => entry.tool);
}

export function nextSearchCursorIndex(currentIndex, direction, itemCount) {
  if (itemCount <= 0) return -1;
  const safeIndex = currentIndex < 0 ? 0 : currentIndex;
  if (direction === 'up') return (safeIndex - 1 + itemCount) % itemCount;
  return (safeIndex + 1) % itemCount;
}

function matchesToolSearch(entry, search) {
  return entry.haystack.includes(search.normalized) || search.tokens.every((token) => entry.haystack.includes(token));
}

function scoreToolMatch(entry, search) {
  const query = search.normalized;
  if (entry.name === query) return 100;
  if (entry.name.startsWith(query)) return 80;
  if (entry.name.includes(query)) return 60;
  if (entry.aliases.startsWith(query)) return 56;
  if (entry.aliases.includes(query)) return 46;
  if (entry.keywords.includes(query)) return 42;
  if (entry.category.includes(query)) return 30;
  if (entry.description.includes(query)) return 18;
  if (search.tokens.length > 1) {
    return search.tokens.reduce((total, token) => total + scoreToolMatch(entry, { normalized: token, tokens: [token] }), 0);
  }
  return 1;
}

function createSearchQuery(query) {
  const tokens = String(query ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(normalizeSearchText)
    .filter(Boolean);
  return {
    normalized: normalizeSearchText(query),
    tokens: tokens.length > 0 ? [...new Set(tokens)] : []
  };
}

function normalizeSearchText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

function createPinyinAliases(value) {
  const tokens = String(value ?? '').match(/[\u4e00-\u9fff]+/g) ?? [];
  const aliases = [];
  tokens.forEach((token) => {
    const syllables = [...token].map((char) => PINYIN_BY_CHAR[char]).filter(Boolean);
    if (syllables.length === 0) return;
    aliases.push(syllables.join(''));
    aliases.push(syllables.map((syllable) => syllable[0]).join(''));
  });
  return aliases;
}

const PINYIN_BY_CHAR = {
  白: 'bai',
  板: 'ban',
  本: 'ben',
  编: 'bian',
  表: 'biao',
  便: 'bian',
  参: 'can',
  差: 'cha',
  查: 'cha',
  常: 'chang',
  成: 'cheng',
  测: 'ce',
  称: 'cheng',
  串: 'chuan',
  除: 'chu',
  处: 'chu',
  戳: 'chuo',
  贷: 'dai',
  大: 'da',
  单: 'dan',
  的: 'de',
  递: 'di',
  电: 'dian',
  调: 'diao',
  对: 'dui',
  多: 'duo',
  额: 'e',
  二: 'er',
  法: 'fa',
  分: 'fen',
  析: 'xi',
  符: 'fu',
  负: 'fu',
  复: 'fu',
  格: 'ge',
  个: 'ge',
  工: 'gong',
  国: 'guo',
  哈: 'ha',
  号: 'hao',
  和: 'he',
  化: 'hua',
  换: 'huan',
  回: 'hui',
  互: 'hu',
  机: 'ji',
  件: 'jian',
  计: 'ji',
  加: 'jia',
  检: 'jian',
  减: 'jian',
  解: 'jie',
  借: 'jie',
  金: 'jin',
  进: 'jin',
  据: 'ju',
  具: 'ju',
  开: 'kai',
  口: 'kou',
  款: 'kuan',
  览: 'lan',
  量: 'liang',
  链: 'lian',
  流: 'liu',
  码: 'ma',
  密: 'mi',
  摩: 'mo',
  名: 'ming',
  拟: 'ni',
  逆: 'ni',
  片: 'pian',
  拼: 'pin',
  期: 'qi',
  器: 'qi',
  清: 'qing',
  求: 'qiu',
  取: 'qu',
  人: 'ren',
  日: 'ri',
  入: 'ru',
  色: 'se',
  生: 'sheng',
  实: 'shi',
  式: 'shi',
  时: 'shi',
  识: 'shi',
  试: 'shi',
  收: 'shou',
  数: 'shu',
  税: 'shui',
  随: 'sui',
  态: 'tai',
  提: 'ti',
  体: 'ti',
  题: 'ti',
  图: 'tu',
  统: 'tong',
  文: 'wen',
  网: 'wang',
  维: 'wei',
  位: 'wei',
  息: 'xi',
  洗: 'xi',
  线: 'xian',
  项: 'xiang',
  像: 'xiang',
  写: 'xie',
  希: 'xi',
  选: 'xuan',
  验: 'yan',
  颜: 'yan',
  压: 'ya',
  钥: 'yao',
  页: 'ye',
  义: 'yi',
  译: 'yi',
  用: 'yong',
  由: 'you',
  预: 'yu',
  源: 'yuan',
  则: 'ze',
  摘: 'zhai',
  账: 'zhang',
  正: 'zheng',
  证: 'zheng',
  支: 'zhi',
  转: 'zhuan',
  字: 'zi',
  子: 'zi',
  资: 'zi',
  总: 'zong'
};
