function nextURLFromLinkHeader(header) {
  const value = String(header || '');
  for (const part of value.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/i);
    if (match) return match[1];
  }
  return '';
}

module.exports = { nextURLFromLinkHeader };
