function detectEol(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function withUnixEol(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

function withOriginalEol(content: string, eol: string): string {
  return eol === '\r\n' ? content.replace(/\n/g, '\r\n') : content;
}

function countHtmlBreaks(content: string): number {
  return content.match(/<br\s*\/?>/gi)?.length ?? 0;
}

export function normalizeMarkdownForSource(content: string): string {
  const eol = detectEol(content);
  let normalized = withUnixEol(content);

  normalized = normalized.replace(
    /^((?:[ \t]*<br\s*\/?>[ \t]*\n\n)+)(?=\S)/gi,
    (_match, breaks: string) => '\n'.repeat(countHtmlBreaks(breaks)),
  );

  normalized = normalized.replace(
    /\n\n((?:[ \t]*<br\s*\/?>[ \t]*\n\n)+)(?=[ \t]*#{1,6}[ \t])/gi,
    (_match, breaks: string) => '\n'.repeat(countHtmlBreaks(breaks) + 1),
  );

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

  denormalized = denormalized.replace(
    /^(\n+)(?=\S)/g,
    (newLines: string) => '<br />\n\n'.repeat(newLines.length),
  );

  denormalized = denormalized.replace(
    /\n{2,}(?=[ \t]*#{1,6}[ \t])/g,
    (newLines: string) => '\n\n' + '<br />\n\n'.repeat(newLines.length - 1),
  );

  while (true) {
    const next = denormalized.replace(/\n\n\n/g, '\n\n<br />\n\n');
    if (next === denormalized) break;
    denormalized = next;
  }

  return withOriginalEol(denormalized, eol);
}
