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

const FENCE_OPEN_RE = /^(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE_RE = /^(`{3,}|~{3,})[ \t]*$/;

interface FenceOpen {
  indent: number;
  fenceChar: string;
  fenceLength: number;
}

// Подбирает сентинел, которого гарантированно нет в тексте (символы private use area).
function pickSentinel(content: string): string {
  let sentinel = '\uE000';
  while (content.includes(sentinel)) {
    sentinel += '\uE001';
  }
  return sentinel;
}

// Разбирает строку как открывающий фенс (``` или ~~~). По CommonMark голый \r —
// тоже перевод строки, а split('\n') оставляет такие \r внутри строки и '.' в regex
// их не матчит, поэтому матчим только часть строки до первого \r.
function matchFenceOpen(line: string): FenceOpen | null {
  const carriageReturn = line.indexOf('\r');
  const head = carriageReturn === -1 ? line : line.slice(0, carriageReturn);
  // Отступ считаем только по пробелам: ведущий таб по CommonMark — indented code.
  const indent = head.match(/^ */)?.[0].length ?? 0;
  const match = head.slice(indent).match(FENCE_OPEN_RE);
  if (match === null) return null;
  // Backtick-фенс с backtick в info-строке — не фенс, а inline-код (CommonMark).
  if (match[1].startsWith('`') && match[2].includes('`')) return null;
  return { indent, fenceChar: match[1][0], fenceLength: match[1].length };
}

// Закрывающий фенс: отступ 0-3, тот же символ, длина не меньше открывающего,
// дальше только пробелы. Голый \r — перевод строки: матчим часть после него.
function matchFenceClose(line: string, fenceChar: string, fenceLength: number): boolean {
  const tail = line.slice(line.lastIndexOf('\r') + 1);
  const match = tail.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
  return match !== null && match[1].startsWith(fenceChar) && match[1].length >= fenceLength;
}

// Строгое закрытие для фенса с отступом >= 4 внутри контейнера: ровно тот же
// отступ и тот же маркер.
function matchIndentedFenceClose(line: string, open: FenceOpen): boolean {
  const tail = line.slice(line.lastIndexOf('\r') + 1);
  if (!tail.startsWith(' '.repeat(open.indent))) return false;
  const match = tail.slice(open.indent).match(FENCE_CLOSE_RE);
  return match !== null && match[1].startsWith(open.fenceChar) && match[1].length >= open.fenceLength;
}

// Ищет закрывающий фенс; по CommonMark незакрытый фенс тянется до конца документа.
function findFenceEnd(lines: string[], openIndex: number, open: FenceOpen): number {
  let end = openIndex + 1;
  while (end < lines.length && !matchFenceClose(lines[end], open.fenceChar, open.fenceLength)) {
    end += 1;
  }
  return end < lines.length ? end : lines.length - 1;
}

// Строгий поиск закрытия для фенса с отступом >= 4: закрытие тем же отступом и
// маркером обязательно, все непустые строки тела должны иметь тот же отступ.
// Возвращает null, если блок фенсом не подтвердился.
function findIndentedFenceEnd(lines: string[], openIndex: number, open: FenceOpen): number | null {
  const padding = ' '.repeat(open.indent);
  let end = openIndex + 1;
  while (end < lines.length) {
    if (matchIndentedFenceClose(lines[end], open)) return end;
    const line = lines[end];
    if (line.trim() !== '' && !line.startsWith(padding)) return null;
    end += 1;
  }
  return null;
}

interface FencedExtraction {
  text: string;
  blocks: string[];
  sentinel: string;
}

// Вырезает fenced code blocks (``` и ~~~) в однострочные плейсхолдеры,
// чтобы последующие regex-замены не задевали содержимое кода.
//
// Отступ >= 4: снаружи контейнеров по CommonMark это indented code, а внутри
// списка/цитаты контейнер съедает отступ и micromark видит fenced code
// (mdast-util-to-markdown штатно генерирует такой код во вложенных списках).
// Полноценный трекинг контейнеров слишком сложен, поэтому применяем строгую
// эвристику: фенсом считаем такой блок только с подтверждённым закрытием тем же
// отступом/маркером. Известные ограничения:
// - indented code blocks (4 пробела) вне списков НЕ защищаются
//   (предсуществующее поведение, вне скоупа тикета);
// - незакрытый фенс с отступом >= 4 не защищается: штатный генератор всегда
//   пишет закрытие, а риск ложной защиты прозы (indented-блок, начинающийся
//   со строки ```) перевешивает риск порчи кода в битом документе;
// - закрывающий фенс с меньшим отступом, чем у открытия с отступом >= 4,
//   не распознаётся (CommonMark допускает выход закрытия из контейнера, но
//   сериализатор так не пишет — только ручная правка source): такой блок
//   не защищается;
// - голый \r между закрывающим фенсом и следующей прозой ('```\rтекст'):
//   закрытие не распознаётся и блок тянется до конца — проза после него
//   недообрабатывается (ложная защита, не порча кода).
function extractFencedBlocks(content: string): FencedExtraction {
  const sentinel = pickSentinel(content);
  const lines = content.split('\n');
  const blocks: string[] = [];
  const out: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const open = matchFenceOpen(lines[index]);
    if (open === null) {
      out.push(lines[index]);
      index += 1;
      continue;
    }

    const blockEnd = open.indent <= 3
      ? findFenceEnd(lines, index, open)
      : findIndentedFenceEnd(lines, index, open);
    if (blockEnd === null) {
      // Эвристика не подтвердила фенс — строка остаётся обычным текстом.
      out.push(lines[index]);
      index += 1;
      continue;
    }

    blocks.push(lines.slice(index, blockEnd + 1).join('\n'));
    out.push(`${sentinel}${blocks.length - 1}${sentinel}`);
    index = blockEnd + 1;
  }

  return { text: out.join('\n'), blocks, sentinel };
}

// Возвращает вырезанные fenced-блоки на место плейсхолдеров.
function restoreFencedBlocks(content: string, blocks: string[], sentinel: string): string {
  let restored = content;
  for (let index = 0; index < blocks.length; index++) {
    // Функция-заместитель: $-последовательности в коде не должны трактоваться как шаблоны.
    restored = restored.replace(`${sentinel}${index}${sentinel}`, () => blocks[index]);
  }
  return restored;
}

export function normalizeMarkdownForSource(content: string): string {
  const eol = detectEol(content);
  let normalized = withUnixEol(content);

  const fenced = extractFencedBlocks(normalized);
  normalized = fenced.text;

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

  normalized = restoreFencedBlocks(normalized, fenced.blocks, fenced.sentinel);

  return withOriginalEol(normalized, eol);
}

export function denormalizeMarkdownForEditor(content: string): string {
  const eol = detectEol(content);
  let denormalized = withUnixEol(content);

  const fenced = extractFencedBlocks(denormalized);
  denormalized = fenced.text;

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

  denormalized = restoreFencedBlocks(denormalized, fenced.blocks, fenced.sentinel);

  return withOriginalEol(denormalized, eol);
}
