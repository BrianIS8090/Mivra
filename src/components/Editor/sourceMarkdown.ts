function detectEol(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function withUnixEol(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

function withOriginalEol(content: string, eol: string): string {
  return eol === '\r\n' ? content.replace(/\n/g, '\r\n') : content;
}

export function normalizeMarkdownForSource(content: string): string {
  const eol = detectEol(content);
  let normalized = withUnixEol(content);

  while (true) {
    const next = normalized.replace(/\n\n[ \t]*<br\s*\/?>[ \t]*\n\n/gi, '\n\n\n');
    if (next === normalized) break;
    normalized = next;
  }

  return withOriginalEol(normalized, eol);
}

export function denormalizeMarkdownForEditor(content: string): string {
  const eol = detectEol(content);
  let denormalized = withUnixEol(content);

  while (true) {
    const next = denormalized.replace(/\n\n\n/g, '\n\n<br />\n\n');
    if (next === denormalized) break;
    denormalized = next;
  }

  return withOriginalEol(denormalized, eol);
}
