function cloneURL(project, protocolKind = 'https', token = '') {
  if (protocolKind === 'ssh') return String(project.sshUrlToRepo || '');
  const raw = String(project.httpUrlToRepo || '');
  if (!token) return raw;
  const url = new URL(raw);
  url.username = 'oauth2';
  url.password = token;
  return url.toString();
}

function stripCredentials(value) {
  try {
    const url = new URL(String(value || ''));
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return String(value || '').replace(/https:\/\/[^/\s]+:[^@\s]+@/g, 'https://');
  }
}

function sanitizeGitMessage(value, token = '') {
  let text = String(value || '').replace(/https:\/\/[^/\s]+:[^@\s]+@/g, 'https://***@');
  if (token) text = text.split(token).join('***');
  return text;
}

module.exports = { cloneURL, sanitizeGitMessage, stripCredentials };
